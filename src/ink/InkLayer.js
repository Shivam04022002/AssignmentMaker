/**
 * Draws freehand strokes (pen or marker) for one page, in page coordinates.
 * The Svg covers the page at its logical size, so it scales, thumbnails and
 * exports with the page exactly like the handwriting does.
 *
 * Strokes are grouped (strokes.js → groupStrokes): pen strokes with the
 * same style share a path, so thousands of strokes stay a handful of
 * native elements; marker strokes stay separate so overlaps deepen.
 */
import React, { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { shrinkStyle } from '../components/svgScale';
import { measure } from '../dev/perf';
import { groupStrokes } from './strokes';

function InkLayer({
  strokes,
  width,
  height,
  thumbnail = false,
  renderScale = 1,
  testID,
}) {
  const groups = useMemo(
    () =>
      strokes && strokes.length
        ? measure('group ink', () => groupStrokes(strokes, { thumbnail }), strokes.length)
        : [],
    [strokes, thumbnail],
  );
  if (!groups.length) {
    return null;
  }
  return (
    <Svg
      // Laid out renderScale× larger and shrunk back, so the native bitmap
      // matches the pixels shown (see components/svgScale.js).
      width={width * renderScale}
      height={height * renderScale}
      viewBox={`0 0 ${width} ${height}`}
      style={[styles.layer, shrinkStyle(renderScale)]}
      pointerEvents="none"
      testID={testID}
    >
      {groups.map(g =>
        g.filled ? (
          <Path key={g.key} d={g.d} fill={g.color} fillOpacity={g.opacity} />
        ) : (
          <Path
            key={g.key}
            d={g.d}
            fill="none"
            stroke={g.color}
            strokeOpacity={g.opacity}
            strokeWidth={g.width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ),
      )}
    </Svg>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});

export default memo(InkLayer);
