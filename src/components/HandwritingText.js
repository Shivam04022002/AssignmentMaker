/**
 * Renders plain text as handwriting — the reference handwriting, drawn as
 * pen strokes (not a font).
 *
 * Pipeline: text (+ formatting) → layoutHandwriting() (lines, words,
 * deterministic variation) → renderLines() (reference glyph strokes,
 * variants, ink buckets) → one Svg of a few paths.
 *
 * Lines are a strict grid of `lineHeight` rows, so writing sits on the
 * paper's ruling. Headings are a little larger and firmer; underlines are
 * hand-drawn outlines that thin at the ends. Same renderer for the editor,
 * thumbnails ('preview' quality), page numbers and export.
 *
 * Props:
 *   text           string, may contain \n
 *   style          handwriting id (any old id resolves to the reference)
 *   color          ink colour
 *   pen            pen id, for its ink behaviour
 *   fontSize       base size (the profile's scale is applied on top)
 *   lineHeight     row height; defaults to 1.4 × fontSize
 *   maxWidth       available width for line breaking
 *   seed           variation seed (document id)
 *   pageId         page id (part of the variation seed)
 *   formatting     { headings, underlines, labels } ranges
 *   corrections    true: natural corrections (the odd letter overwritten
 *                  or struck), as on a real student's page
 *   quality        'full' | 'preview' (thumbnails: no ink core, min width)
 *   showGuides     debug: draw each row's target baseline and x-height
 *   containerStyle layout style for the outer View
 */
import React, { memo, useMemo, useRef, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import {
  getHandwritingStyle,
  getStylesVersion,
  isPersonalStyleId,
  subscribeToStyles,
} from '../data/handwritingStyles';
import { getPen } from '../data/pens';
import { measure } from '../dev/perf';
import { inkTone, renderLines } from '../handwriting/glyphRender';
import { XH_EM } from '../handwriting/handwritingProfiles';
import { PersonalLines, PersonalText } from './PersonalHandwriting';
import { shrinkStyle } from './svgScale';
import { layoutHandwriting } from '../utils/textLayout';

/** Room around the text box for ascenders, descenders and overhangs. */
const PAD = 24;

/**
 * Where the baseline sits inside a row. Rows end on a ruled line; profiles
 * with their own notebook layout write exactly ON the rule (the reference
 * writer's baseline), the others a hair above it (unchanged).
 */
export function baselineInRow(rowHeight, profile, size) {
  const onRule = profile.page && profile.page.baselineOnRule;
  return (
    rowHeight -
    (onRule ? -(profile.page.ruleCentre || 0) : Math.max(1, rowHeight * 0.05)) +
    (profile.baselineAdjust || 0) * size
  );
}

function Guides({ rowHeight, xHeight, rows }) {
  const baselineY = rowHeight - Math.max(1, rowHeight * 0.05);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: rows }, (_, i) => (
        <React.Fragment key={i}>
          <View
            style={[
              styles.guide,
              styles.guideBaseline,
              { top: i * rowHeight + baselineY },
            ]}
          />
          <View
            style={[
              styles.guide,
              styles.guideXHeight,
              { top: i * rowHeight + baselineY - xHeight },
            ]}
          />
        </React.Fragment>
      ))}
    </View>
  );
}

/** Re-renders when the profile is tuned in the developer tuner. */
function useStylesVersion() {
  return useSyncExternalStore(
    subscribeToStyles,
    getStylesVersion,
    getStylesVersion,
  );
}

/**
 * Draws already laid-out lines (from layoutHandwriting or a paginated page).
 *
 * Props: lines, layout ({ fontSize, headingFontSize, unit }), style (id),
 * color, pen, rowHeight, text (accessibility), quality, showGuides,
 * containerStyle, width (text box width).
 */
const BuiltinHandwritingLines = memo(function HandwritingLines({
  lines,
  layout,
  style: styleId,
  color = '#123A8C',
  pen,
  rowHeight,
  text = '',
  showGuides = false,
  quality = 'full',
  containerStyle,
  width,
  renderScale = 1,
}) {
  useStylesVersion();
  const profile = getHandwritingStyle(styleId);
  const ink = getPen(pen).ink;

  const drawn = useMemo(
    () =>
      measure(
        quality === 'preview' ? 'render thumbnail' : 'render handwriting',
        () =>
          renderLines(lines, {
            profile,
            layout,
            rowHeight,
            baselineInRow: baselineInRow(rowHeight, profile, layout.fontSize),
            ink,
            quality,
          }),
        text.length,
      ),
    [lines, profile, layout, rowHeight, ink, quality, text],
  );

  const height = lines.length * rowHeight;
  const boxWidth = width || 400;
  const darkness = profile.corrections ? profile.corrections.darkness : undefined;
  return (
    <View
      style={[{ height }, containerStyle]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={text}
      testID="handwriting-text"
    >
      {showGuides ? (
        <Guides
          rowHeight={rowHeight}
          rows={lines.length}
          xHeight={layout.fontSize * XH_EM}
        />
      ) : null}
      {drawn.buckets.length || drawn.underlines.length ? (
        <Svg
          // Laid out renderScale× larger and shrunk back, so the native
          // bitmap matches the pixels shown (see svgScale.js): sharp ink
          // on phones, when zoomed and in exports.
          width={(boxWidth + PAD * 2) * renderScale}
          height={(height + PAD * 2) * renderScale}
          viewBox={`${-PAD} ${-PAD} ${boxWidth + PAD * 2} ${height + PAD * 2}`}
          style={[styles.ink, shrinkStyle(renderScale)]}
          pointerEvents="none"
          testID="handwriting-ink"
        >
          {drawn.buckets.map(b =>
            b.width ? (
              // Thumbnails: centre-lines as plain strokes.
              <Path
                key={b.key}
                d={b.d}
                fill="none"
                stroke={inkTone(b.color || color, b.tone, darkness)}
                strokeOpacity={b.alpha}
                strokeWidth={Math.max(b.width, 0.9)}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : (
              // Ink ribbons: filled outlines whose width follows pen
              // pressure; 'core' is the denser ink where it pressed hardest.
              <Path
                key={b.key}
                id={b.key.endsWith('core') ? 'ink-core' : undefined}
                d={b.d}
                fill={inkTone(b.color || color, b.tone, darkness)}
                fillOpacity={b.alpha}
              />
            ),
          )}
          {drawn.underlines.map(u => (
            <Path
              key={u.key}
              id="ink-underline"
              d={u.d}
              fill={color}
              fillOpacity={u.alpha}
            />
          ))}
        </Svg>
      ) : null}
    </View>
  );
});

/**
 * Lines in the document's handwriting: built-in profiles through the
 * stroke engine below (unchanged); a personal handwriting reference through
 * the personal renderer, which draws only that exact stored version or an
 * explicit notice — never another handwriting.
 */
export const HandwritingLines = memo(function HandwritingLinesSwitch(props) {
  return isPersonalStyleId(props.style) ? (
    <PersonalLines {...props} />
  ) : (
    <BuiltinHandwritingLines {...props} />
  );
});

function HandwritingText({
  text = '',
  style: styleId,
  color = '#123A8C',
  pen,
  fontSize = 20,
  lineHeight,
  maxWidth,
  seed,
  pageId,
  formatting,
  corrections = false,
  showGuides = false,
  quality = 'full',
  containerStyle,
  renderScale = 1,
}) {
  useStylesVersion();
  const profile = getHandwritingStyle(styleId);
  const rowHeight = lineHeight || Math.round(fontSize * 1.4);
  const cacheRef = useRef(null);

  const layout = useMemo(() => {
    const result = layoutHandwriting(text, profile, {
      fontSize,
      contentWidth: maxWidth,
      seed,
      pageId,
      formatting,
      lineHeight: rowHeight,
      corrections,
      cache: cacheRef.current,
    });
    cacheRef.current = result.cache;
    return result;
  }, [
    text,
    profile,
    fontSize,
    maxWidth,
    seed,
    pageId,
    formatting,
    rowHeight,
    corrections,
  ]);

  return (
    <HandwritingLines
      lines={layout.lines}
      layout={layout}
      style={styleId}
      color={color}
      pen={pen}
      rowHeight={rowHeight}
      text={text}
      showGuides={showGuides}
      quality={quality}
      containerStyle={containerStyle}
      width={Number.isFinite(maxWidth) ? maxWidth : undefined}
      renderScale={renderScale}
    />
  );
}

const styles = StyleSheet.create({
  ink: {
    position: 'absolute',
    top: -PAD,
    left: -PAD,
  },
  guide: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  guideBaseline: {
    backgroundColor: '#E5484D',
  },
  guideXHeight: {
    backgroundColor: '#30A46C',
  },
});

/** Text in the document's handwriting (see HandwritingLines). */
function HandwritingTextSwitch(props) {
  return isPersonalStyleId(props.style) ? (
    <PersonalText {...props} />
  ) : (
    <HandwritingText {...props} />
  );
}

export default memo(HandwritingTextSwitch);
