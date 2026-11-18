/**
 * Handwriting of selected text: ink colour, pen or marker, handwriting size
 * and word spacing — shown above the text box while text is selected.
 *
 * These change how the *typed* text is handwritten (formatting spans over
 * the text). They are not the freehand Pen/Marker/Eraser tools, which draw
 * on the page.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MARKER_COLORS, PEN_COLORS } from '../ink/strokes';
import { HANDWRITING_SIZES, WORD_SPACING_STEPS } from '../utils/formatting';
import { colors, radii, spacing } from '../theme/theme';

const step = (list, value, dir) => {
  const i = list.indexOf(value);
  const from = i < 0 ? list.indexOf(dir > 0 ? list[0] : list[list.length - 1]) : i;
  return list[Math.max(0, Math.min(list.length - 1, from + dir))];
};

function Chip({ label, active, onPress, testID, accessibilityLabel, children, disabled }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      testID={testID}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {children || (
        <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
      )}
    </Pressable>
  );
}

function Swatch({ color, active, onPress, label, testID }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={`${label} ink`}
      accessibilityState={{ selected: !!active }}
      testID={testID}
      style={[styles.swatch, active && styles.swatchActive]}
    >
      <View style={[styles.swatchDot, { backgroundColor: color }]} />
    </Pressable>
  );
}

/**
 * Props: format ({ color, mode, size, spacing } of the selection; undefined
 * where mixed), documentColor (the document's pen colour), onApply(patch),
 * onReset().
 */
export default function SelectionFormatBar({ format, documentColor, onApply, onReset }) {
  const [more, setMore] = useState(false);
  const color = format.color === null ? documentColor : format.color;
  const size = format.size;
  const spacingValue = format.spacing;
  // The document's own colour is stored as "no colour" (it follows the pen).
  const pick = c => onApply({ color: c.toUpperCase() === documentColor.toUpperCase() ? null : c });
  const palette = more ? [...PEN_COLORS, ...MARKER_COLORS] : PEN_COLORS;

  return (
    <View style={styles.bar} testID="selection-format-bar">
      <View style={styles.row}>
        {palette.map(c => (
          <Swatch
            key={`${c.id}-${c.color}`}
            color={c.color}
            label={c.label}
            active={color && color.toUpperCase() === c.color.toUpperCase()}
            onPress={() => pick(c.color)}
            testID={`selection-color-${c.color.slice(1).toLowerCase()}`}
          />
        ))}
        <Chip
          label={more ? 'Less' : 'More'}
          onPress={() => setMore(m => !m)}
          accessibilityLabel={more ? 'Fewer colours' : 'More colours'}
          testID="selection-color-more"
        />
        <View style={styles.divider} />
        <Chip
          label="Pen"
          active={format.mode === 'pen'}
          onPress={() => onApply({ mode: 'pen' })}
          accessibilityLabel="Write the selection with a pen"
          testID="selection-mode-pen"
        />
        <Chip
          label="Marker"
          active={format.mode === 'marker'}
          onPress={() => onApply({ mode: 'marker' })}
          accessibilityLabel="Write the selection with a marker"
          testID="selection-mode-marker"
        />
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Size</Text>
        <Chip
          label="−"
          onPress={() => onApply({ size: step(HANDWRITING_SIZES, size ?? 1, -1) })}
          disabled={size === HANDWRITING_SIZES[0]}
          accessibilityLabel="Smaller handwriting"
          testID="selection-size-down"
        />
        <Text style={styles.value} testID="selection-size-value">
          {size === undefined ? '—' : `${Math.round(size * 100)}%`}
        </Text>
        <Chip
          label="+"
          onPress={() => onApply({ size: step(HANDWRITING_SIZES, size ?? 1, 1) })}
          disabled={size === HANDWRITING_SIZES[HANDWRITING_SIZES.length - 1]}
          accessibilityLabel="Larger handwriting"
          testID="selection-size-up"
        />
        <View style={styles.divider} />
        <Text style={styles.label}>Word space</Text>
        <Chip
          label="−"
          onPress={() => onApply({ spacing: step(WORD_SPACING_STEPS, spacingValue ?? 0, -1) })}
          disabled={spacingValue === WORD_SPACING_STEPS[0]}
          accessibilityLabel="Less space between words"
          testID="selection-spacing-down"
        />
        <Text style={styles.value} testID="selection-spacing-value">
          {spacingValue === undefined ? '—' : spacingValue > 0 ? `+${spacingValue}` : `${spacingValue}`}
        </Text>
        <Chip
          label="+"
          onPress={() => onApply({ spacing: step(WORD_SPACING_STEPS, spacingValue ?? 0, 1) })}
          disabled={spacingValue === WORD_SPACING_STEPS[WORD_SPACING_STEPS.length - 1]}
          accessibilityLabel="More space between words"
          testID="selection-spacing-up"
        />
        <View style={styles.divider} />
        <Chip
          label="Reset"
          onPress={onReset}
          accessibilityLabel="Reset the selection's handwriting"
          testID="selection-reset"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    gap: 6,
    paddingBottom: spacing.xs || 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  label: {
    fontSize: 12,
    color: colors.textMuted,
    marginRight: 2,
  },
  value: {
    minWidth: 36,
    textAlign: 'center',
    fontSize: 12,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 20,
    backgroundColor: colors.border,
    marginHorizontal: 4,
  },
  chip: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: colors.charcoal,
    borderColor: colors.charcoal,
  },
  chipText: {
    fontSize: 13,
    color: colors.text,
  },
  chipTextActive: {
    color: colors.onCharcoal,
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchActive: {
    borderColor: colors.charcoal,
  },
  swatchDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  disabled: {
    opacity: 0.35,
  },
  pressed: {
    opacity: 0.6,
  },
});
