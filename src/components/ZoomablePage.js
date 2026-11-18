/**
 * Zoom and pan for the editor's page (no gesture library).
 *
 * - Zoom levels 0.75× … 3× (buttons step through ZOOM_LEVELS; pinch is
 *   continuous within the same range). Zoom changes only how big the page
 *   is *shown*: the page re-renders at the new width, so handwriting and
 *   ink stay sharp, and touches are converted back to page coordinates by
 *   the drawing surface — strokes land on the same spot of the document at
 *   any zoom, and export (which draws pages at their own size) ignores it.
 * - Two fingers: pinch to zoom around the point between the fingers, move
 *   to pan. While the fingers are down the page is previewed with a cheap
 *   native transform; on release the zoom is committed and the scroll
 *   position set so the same spot stays under the fingers.
 * - One finger keeps its usual meaning: scroll (Text tool) or draw.
 * - A zoomed page scrolls horizontally here and vertically in the editor's
 *   ScrollView (passed in as `vertical`).
 */
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, PanResponder, ScrollView, StyleSheet, View } from 'react-native';

export const ZOOM_LEVELS = [0.75, 1, 1.5, 2, 3];
export const MIN_ZOOM = ZOOM_LEVELS[0];
export const MAX_ZOOM = ZOOM_LEVELS[ZOOM_LEVELS.length - 1];

export const clampZoom = z => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/** The next button level above (dir 1) or below (dir -1) a zoom. */
export function stepZoom(zoom, dir) {
  if (dir > 0) {
    return ZOOM_LEVELS.find(l => l > zoom + 0.001) ?? MAX_ZOOM;
  }
  return [...ZOOM_LEVELS].reverse().find(l => l < zoom - 0.001) ?? MIN_ZOOM;
}

/** Left inset that centres a page narrower than the viewport. */
export function centringInset(viewportWidth, pageWidth, gutter) {
  return Math.max(gutter, (viewportWidth - pageWidth) / 2);
}

/**
 * Scroll offsets after zooming from z0 to z1 so that the page point under
 * `focal` (viewport coordinates) ends up under focal + pan.
 *
 * scroll: {x, y} before; insets: {x0, x1} page left inset before/after;
 * top: page top inside the vertical content.
 */
export function scrollAfterZoom({ z0, z1, focal, pan = { x: 0, y: 0 }, scroll, insets, top = 0 }) {
  const s = z1 / z0;
  const pageX = scroll.x + focal.x - insets.x0;
  const pageY = scroll.y + focal.y - top;
  return {
    x: Math.max(0, pageX * s + insets.x1 - focal.x - pan.x),
    y: Math.max(0, pageY * s + top - focal.y - pan.y),
  };
}

const touchesOf = e => e.nativeEvent.touches || [];
const spread = ([a, b]) => Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
const middle = ([a, b]) => ({ x: (a.pageX + b.pageX) / 2, y: (a.pageY + b.pageY) / 2 });

function ZoomablePage(
  {
    zoom,
    onZoomChange,
    baseWidth,
    viewportWidth,
    gutter = 16,
    top = 0,
    vertical, // { ref, offset: {current} } — the editor's vertical ScrollView
    children, // width => page element
    testID = 'zoomable-page',
  },
  ref,
) {
  const hRef = useRef(null);
  const frameRef = useRef(null);
  const hOffset = useRef(0);
  const frame = useRef({ x: 0, y: 0 });
  const gesture = useRef(null);
  const pending = useRef(null);
  const live = useRef({
    scale: new Animated.Value(1),
    x: new Animated.Value(0),
    y: new Animated.Value(0),
  }).current;
  const [origin, setOrigin] = useState([0, 0, 0]);

  const width = baseWidth * zoom;
  const inset = centringInset(viewportWidth, width, gutter);
  const state = useRef({});
  state.current = { zoom, width, inset, onZoomChange, vertical };

  const measureFrame = () => {
    if (frameRef.current && frameRef.current.measureInWindow) {
      frameRef.current.measureInWindow((x, y) => {
        if (Number.isFinite(x) && Number.isFinite(y)) {
          frame.current = { x, y };
        }
      });
    }
  };

  /** Commits a zoom, keeping `focal` (viewport point) in place. */
  const commit = useCallback((z1, focal, pan) => {
    const { zoom: z0, inset: x0, onZoomChange: change, vertical: v } = state.current;
    const next = clampZoom(z1);
    const scroll = {
      x: hOffset.current,
      y: v && v.offset ? v.offset.current : 0,
    };
    const x1 = centringInset(viewportWidth, baseWidth * next, gutter);
    pending.current = scrollAfterZoom({
      z0,
      z1: next,
      focal,
      pan,
      scroll,
      insets: { x0, x1 },
      top,
    });
    if (Math.abs(next - z0) < 0.001) {
      applyPending();
    } else {
      change(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportWidth, baseWidth, gutter, top]);

  const applyPending = () => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    hRef.current?.scrollTo?.({ x: p.x, animated: false });
    const v = state.current.vertical;
    v?.ref?.current?.scrollTo?.({ y: p.y, animated: false });
    live.scale.setValue(1);
    live.x.setValue(0);
    live.y.setValue(0);
  };

  // After a zoom change the page has its new size: restore the focal point.
  useEffect(() => {
    applyPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  useImperativeHandle(ref, () => ({
    /** Zoom to a level around the centre of the view (buttons). */
    zoomTo(level) {
      commit(level, { x: viewportWidth / 2, y: 200 });
    },
    /** Back to 1× at the top-left of the page. */
    reset() {
      pending.current = { x: 0, y: 0 };
      if (Math.abs(state.current.zoom - 1) < 0.001) {
        applyPending();
      } else {
        state.current.onZoomChange(1);
      }
    },
  }));

  const responder = useMemo(
    () =>
      PanResponder.create({
        // Only two-finger gestures: one finger keeps scrolling / drawing.
        onStartShouldSetPanResponderCapture: e => touchesOf(e).length >= 2,
        onMoveShouldSetPanResponderCapture: e => touchesOf(e).length >= 2,
        onPanResponderGrant: e => {
          const t = touchesOf(e);
          if (t.length < 2) return;
          measureFrame();
          const m = middle(t);
          const focal = { x: m.x - frame.current.x, y: m.y - frame.current.y };
          gesture.current = { d0: spread(t) || 1, m0: m, focal, s: 1, pan: { x: 0, y: 0 } };
          // Preview zooms around the point between the fingers.
          setOrigin([
            hOffset.current + focal.x - state.current.inset,
            focal.y,
            0,
          ]);
        },
        onPanResponderMove: e => {
          const g = gesture.current;
          const t = touchesOf(e);
          if (!g || t.length < 2) return;
          const z0 = state.current.zoom;
          const s = clampZoom(z0 * (spread(t) / g.d0)) / z0;
          const m = middle(t);
          g.s = s;
          g.pan = { x: m.x - g.m0.x, y: m.y - g.m0.y };
          live.scale.setValue(s);
          live.x.setValue(g.pan.x);
          live.y.setValue(g.pan.y);
        },
        onPanResponderRelease: () => {
          const g = gesture.current;
          gesture.current = null;
          if (g) commit(state.current.zoom * g.s, g.focal, g.pan);
        },
        onPanResponderTerminate: () => {
          const g = gesture.current;
          gesture.current = null;
          if (g) commit(state.current.zoom * g.s, g.focal, g.pan);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commit],
  );

  return (
    <View
      ref={frameRef}
      onLayout={measureFrame}
      collapsable={false}
      style={{ width: viewportWidth }}
      testID={testID}
      {...responder.panHandlers}
    >
      <ScrollView
        ref={hRef}
        horizontal
        scrollEnabled={zoom * baseWidth + gutter * 2 > viewportWidth}
        showsHorizontalScrollIndicator={zoom > 1}
        onScroll={e => {
          hOffset.current = e.nativeEvent.contentOffset.x;
        }}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingLeft: inset, paddingRight: inset }}
        testID={`${testID}-scroll`}
      >
        <Animated.View
          style={[
            styles.page,
            {
              transformOrigin: origin,
              transform: [{ translateX: live.x }, { translateY: live.y }, { scale: live.scale }],
            },
          ]}
        >
          {children(width)}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    alignSelf: 'flex-start',
  },
});

export default forwardRef(ZoomablePage);
