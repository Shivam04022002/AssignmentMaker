/**
 * The space between ONE pair of words ("heads | to").
 *
 * Shown in the text panel when the selection spans a word boundary, or the
 * cursor sits in (or next to) the space between two words — no need to hit
 * an invisible space. With several boundaries selected, ‹ › choose which
 * one; only that gap changes. Values are steps of ≈0.35 x-height.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { WORD_SPACING_STEPS } from '../utils/formatting';
import { colors, radii } from '../theme/theme';

const short = w => (w.length > 12 ? `${w.slice(0, 11)}…` : w);

function Button({ label, onPress, disabled, testID, accessibilityLabel }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      style={({ pressed }) => [styles.button, disabled && styles.disabled, pressed && styles.pressed]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

/**
 * Props: boundaries ([{ start, end, left, right }]), valueAt(boundary),
 * onSet(boundary, value).
 */
export default function WordGapControl({ boundaries, valueAt, onSet }) {
  const signature = boundaries.map(b => `${b.start}:${b.end}`).join(',');
  const [index, setIndex] = useState(0);
  // A new selection starts at its first boundary.
  useEffect(() => setIndex(0), [signature]);
  if (!boundaries.length) {
    return null;
  }
  const boundary = boundaries[Math.min(index, boundaries.length - 1)];
  const value = valueAt(boundary);
  const pos = WORD_SPACING_STEPS.indexOf(value);
  const step = dir => {
    const next = WORD_SPACING_STEPS[Math.max(0, Math.min(WORD_SPACING_STEPS.length - 1, pos + dir))];
    if (next !== value) onSet(boundary, next);
  };
  return (
    <View style={styles.row} testID="word-gap-control">
      <Text style={styles.label}>Gap</Text>
      {boundaries.length > 1 ? (
        <Button
          label="‹"
          onPress={() => setIndex(i => (i - 1 + boundaries.length) % boundaries.length)}
          accessibilityLabel="Previous word gap"
          testID="word-gap-prev"
        />
      ) : null}
      <Text
        style={styles.pair}
        numberOfLines={1}
        accessibilityLabel={`Gap between ${boundary.left} and ${boundary.right}`}
        testID="word-gap-pair"
      >
        {short(boundary.left)} | {short(boundary.right)}
      </Text>
      {boundaries.length > 1 ? (
        <Button
          label="›"
          onPress={() => setIndex(i => (i + 1) % boundaries.length)}
          accessibilityLabel="Next word gap"
          testID="word-gap-next"
        />
      ) : null}
      <Button
        label="−"
        onPress={() => step(-1)}
        disabled={pos === 0}
        accessibilityLabel="Less space between these two words"
        testID="word-gap-down"
      />
      <Text style={styles.value} testID="word-gap-value">
        {value > 0 ? `+${value}` : `${value}`}
      </Text>
      <Button
        label="+"
        onPress={() => step(1)}
        disabled={pos === WORD_SPACING_STEPS.length - 1}
        accessibilityLabel="More space between these two words"
        testID="word-gap-up"
      />
      <Button
        label="0"
        onPress={() => value !== 0 && onSet(boundary, 0)}
        disabled={value === 0}
        accessibilityLabel="Reset this word gap"
        testID="word-gap-reset"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingBottom: 4,
  },
  label: {
    fontSize: 12,
    color: colors.textMuted,
    marginRight: 2,
  },
  pair: {
    flexShrink: 1,
    fontSize: 12,
    color: colors.text,
    marginHorizontal: 2,
  },
  value: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 12,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  button: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 13,
    color: colors.text,
  },
  disabled: {
    opacity: 0.35,
  },
  pressed: {
    opacity: 0.6,
  },
});
