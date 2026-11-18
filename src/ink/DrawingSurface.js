/**
 * Touch surface over a page while a drawing tool (pen, marker, eraser) is
 * selected. Uses React Native's PanResponder (no gesture library).
 *
 * - Only mounted for drawing tools: with the Text tool the page behaves as
 *   before (tap to edit, scroll).
 * - Claims the gesture and refuses to hand it to the ScrollView, so a
 *   stroke is never mistaken for a scroll. A second finger cancels drawing.
 * - Converts touch positions to page coordinates (screenToPage), so strokes
 *   are independent of the size the page is shown at.
 * - Reads stylus pressure (`force`) when the platform reports it; strokes
 *   only become pressure-sensitive if it actually varies.
 */
import React, { memo, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import {
  addPoint,
  centerlinePath,
  finishStroke,
  screenToPage,
  strokeStyle,
} from './strokes';

function DrawingSurface({
  tool,
  settings,
  eraserRadius,
  scale,
  pageWidth,
  pageHeight,
  onStroke,
  onEraseStart,
  onEraseMove,
  onEraseEnd,
}) {
  const [live, setLive] = useState(null); // { d, style } | { eraser: {x, y} }
  const buffer = useRef(null);
  const props = useRef({});
  props.current = {
    tool,
    settings,
    eraserRadius,
    scale,
    onStroke,
    onEraseStart,
    onEraseMove,
    onEraseEnd,
  };

  const responder = useMemo(() => {
    const toPage = event =>
      screenToPage(
        { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY },
        { scale: props.current.scale },
      );
    const force = event => {
      const f = event.nativeEvent.force;
      return typeof f === 'number' && f > 0 ? Math.min(1, f) : undefined;
    };
    const multiTouch = event => (event.nativeEvent.touches || []).length > 1;

    const begin = event => {
      const p = toPage(event);
      const pressure = force(event);
      buffer.current = {
        points: [],
        pressure: pressure !== undefined ? [] : null,
        tool: props.current.tool,
      };
      addPoint(buffer.current, p.x, p.y, pressure);
      if (buffer.current.tool === 'eraser') {
        props.current.onEraseStart();
        props.current.onEraseMove(buffer.current.points);
        setLive({ eraser: p });
      } else {
        setLive({ points: buffer.current.points.slice() });
      }
    };

    const move = event => {
      const b = buffer.current;
      if (!b) {
        return;
      }
      if (multiTouch(event)) {
        // A second finger: not a stroke. Drop it.
        buffer.current = null;
        setLive(null);
        if (b.tool === 'eraser') {
          props.current.onEraseEnd(null);
        }
        return;
      }
      const p = toPage(event);
      const before = b.points.length;
      addPoint(b, p.x, p.y, force(event));
      if (b.points.length === before) {
        return;
      }
      if (b.tool === 'eraser') {
        props.current.onEraseMove(b.points);
        setLive({ eraser: p });
      } else {
        setLive({ points: b.points.slice() });
      }
    };

    const cancel = () => {
      const b = buffer.current;
      buffer.current = null;
      setLive(null);
      if (b && b.tool === 'eraser') {
        props.current.onEraseEnd(null);
      }
    };

    const end = () => {
      const b = buffer.current;
      buffer.current = null;
      setLive(null);
      if (!b) {
        return;
      }
      if (b.tool === 'eraser') {
        props.current.onEraseEnd(b.points);
        return;
      }
      props.current.onStroke(
        finishStroke(b, strokeStyle(b.tool, props.current.settings)),
      );
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Never let the ScrollView take over a stroke in progress — except
      // for a second finger, which means zoom/pan (ZoomablePage).
      onPanResponderTerminationRequest: e => multiTouch(e),
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: begin,
      onPanResponderMove: move,
      onPanResponderRelease: end,
      // Taken away mid-stroke (zoom/pan): drop it rather than leave a mark.
      onPanResponderTerminate: cancel,
    });
  }, []);

  const style = strokeStyle(tool, settings);
  return (
    <View
      style={[
        styles.surface,
        { width: pageWidth * scale, height: pageHeight * scale },
      ]}
      testID="drawing-surface"
      accessibilityLabel={`${tool} tool: draw on the page`}
      {...responder.panHandlers}
    >
      {live && live.points ? (
        <Svg
          width={pageWidth * scale}
          height={pageHeight * scale}
          viewBox={`0 0 ${pageWidth} ${pageHeight}`}
          pointerEvents="none"
        >
          <Path
            d={centerlinePath(live.points)}
            fill="none"
            stroke={style.color}
            strokeOpacity={style.opacity}
            strokeWidth={style.width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      ) : null}
      {live && live.eraser ? (
        <View
          pointerEvents="none"
          testID="eraser-preview"
          style={[
            styles.eraser,
            {
              left: (live.eraser.x - eraserRadius) * scale,
              top: (live.eraser.y - eraserRadius) * scale,
              width: eraserRadius * 2 * scale,
              height: eraserRadius * 2 * scale,
              borderRadius: eraserRadius * scale,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  eraser: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: 'rgba(34,37,42,0.55)',
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
});

export default memo(DrawingSurface);
