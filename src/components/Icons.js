/**
 * Minimal line icons drawn with Views, so the app needs no icon font or SVG
 * dependency. Each icon fits a 24×24 box and takes a `color`.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

const STROKE = 2;

function Box({ children }) {
  return <View style={styles.box}>{children}</View>;
}

export function BackIcon({ color }) {
  return (
    <Box>
      <View
        style={[
          styles.chevron,
          { borderColor: color, transform: [{ rotate: '45deg' }] },
        ]}
      />
    </Box>
  );
}

export function MoreIcon({ color }) {
  return (
    <Box>
      {[0, 1, 2].map(i => (
        <View key={i} style={[styles.dot, { backgroundColor: color }]} />
      ))}
    </Box>
  );
}

export function PlusIcon({ color, size = 16 }) {
  return (
    <Box>
      <View style={[styles.bar, { width: size, backgroundColor: color }]} />
      <View
        style={[
          styles.bar,
          styles.barVertical,
          { width: size, backgroundColor: color },
        ]}
      />
    </Box>
  );
}

/** Pencil: body, ferrule band and tip, tilted 45°. */
export function PencilIcon({ color }) {
  return (
    <Box>
      <View style={styles.pencil}>
        <View style={[styles.pencilEnd, { backgroundColor: color }]} />
        <View style={[styles.pencilBody, { borderColor: color }]} />
        <View style={[styles.pencilTip, { borderTopColor: color }]} />
      </View>
    </Box>
  );
}

/** Highlighter: a chisel-tipped barrel; the tip shows the marker colour. */
export function MarkerIcon({ color, tip }) {
  return (
    <Box>
      <View style={styles.marker}>
        <View style={[styles.markerTip, { backgroundColor: tip || color }]} />
        <View style={[styles.markerBody, { borderColor: color }]} />
      </View>
    </Box>
  );
}

/** Eraser: a tilted block with a band. */
export function EraserIcon({ color }) {
  return (
    <Box>
      <View style={[styles.eraser, { borderColor: color }]}>
        <View style={[styles.eraserBand, { backgroundColor: color }]} />
      </View>
    </Box>
  );
}

/** Two stacked sheets: the page overview. */
export function PagesIcon({ color }) {
  return (
    <Box>
      <View style={[styles.sheetBack, { borderColor: color }]} />
      <View style={[styles.sheetFront, { borderColor: color }]} />
    </Box>
  );
}

/** Curved arrow; `mirrored` turns undo into redo. */
function CurvedArrow({ color, mirrored }) {
  return (
    <Box>
      <View style={mirrored ? styles.mirrored : null}>
        <View style={styles.arrowWrap}>
          <View
            style={[
              styles.arc,
              { borderTopColor: color, borderRightColor: color },
            ]}
          />
          <View
            style={[
              styles.arrowHead,
              { borderLeftColor: color, borderBottomColor: color },
            ]}
          />
        </View>
      </View>
    </Box>
  );
}

export function UndoIcon({ color }) {
  return <CurvedArrow color={color} />;
}

export function RedoIcon({ color }) {
  return <CurvedArrow color={color} mirrored />;
}

const styles = StyleSheet.create({
  box: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevron: {
    width: 11,
    height: 11,
    marginLeft: 5,
    borderLeftWidth: STROKE + 0.5,
    borderBottomWidth: STROKE + 0.5,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginVertical: 1.5,
  },
  bar: {
    position: 'absolute',
    height: STROKE,
    borderRadius: 1,
  },
  barVertical: {
    transform: [{ rotate: '90deg' }],
  },
  pencil: {
    width: 6,
    height: 20,
    alignItems: 'center',
    transform: [{ rotate: '45deg' }],
  },
  pencilEnd: {
    width: 6,
    height: 3,
    borderTopLeftRadius: 1.5,
    borderTopRightRadius: 1.5,
  },
  pencilBody: {
    width: 6,
    height: 12,
    marginTop: 1,
    borderWidth: 1.5,
  },
  pencilTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 3,
    borderRightWidth: 3,
    borderTopWidth: 4,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  marker: {
    alignItems: 'center',
    transform: [{ rotate: '45deg' }],
  },
  markerTip: {
    width: 7,
    height: 4,
    borderTopLeftRadius: 1,
    borderTopRightRadius: 3,
  },
  markerBody: {
    width: 8,
    height: 13,
    borderWidth: 1.5,
    borderRadius: 2,
  },
  eraser: {
    width: 16,
    height: 9,
    borderWidth: 1.5,
    borderRadius: 2.5,
    transform: [{ rotate: '-35deg' }],
    flexDirection: 'row',
  },
  eraserBand: {
    width: 4,
    height: '100%',
    opacity: 0.8,
  },
  sheetBack: {
    position: 'absolute',
    top: 3,
    left: 7,
    width: 11,
    height: 14,
    borderWidth: 1.5,
    borderRadius: 2,
    opacity: 0.6,
  },
  sheetFront: {
    position: 'absolute',
    top: 7,
    left: 4,
    width: 11,
    height: 14,
    borderWidth: 1.5,
    borderRadius: 2,
    backgroundColor: '#22252A',
  },
  mirrored: {
    transform: [{ scaleX: -1 }],
  },
  arrowWrap: {
    width: 18,
    height: 14,
  },
  // Upper-right quarter-and-a-half of a ring, rotated so it sweeps over the
  // top from left to right and down.
  arc: {
    position: 'absolute',
    top: 2,
    left: 3,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: STROKE,
    borderLeftColor: 'transparent',
    borderBottomColor: 'transparent',
    transform: [{ rotate: '-20deg' }],
  },
  // Arrowhead at the left end of the arc, pointing down-left.
  arrowHead: {
    position: 'absolute',
    top: 6,
    left: 1,
    width: 6,
    height: 6,
    borderLeftWidth: STROKE,
    borderBottomWidth: STROKE,
  },
});
