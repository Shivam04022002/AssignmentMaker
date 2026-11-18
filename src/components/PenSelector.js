import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PENS } from '../data/pens';
import { colors, spacing, typography } from '../theme/theme';
import SelectableCard from './SelectableCard';

export default function PenSelector({ value, onChange }) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {PENS.map(pen => (
        <SelectableCard
          key={pen.id}
          selected={value === pen.id}
          onPress={() => onChange(pen.id)}
          accessibilityLabel={`${pen.label} pen`}
          testID={`pen-${pen.id}`}
          style={styles.card}
        >
          <View style={[styles.ink, { backgroundColor: pen.color }]} />
          <Text style={styles.label}>{pen.label}</Text>
        </SelectableCard>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  card: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  ink: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.surface,
    outlineWidth: 1,
    outlineColor: colors.borderStrong,
  },
  label: {
    ...typography.title,
    fontSize: 15,
  },
});
