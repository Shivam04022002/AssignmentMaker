import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { PAPER_TEMPLATES } from '../data/paper';
import { colors, spacing, typography } from '../theme/theme';
import SelectableCard from './SelectableCard';

const THUMB_HEIGHT = 74;

/** A small drawing of the template: ruling pitch, margin and header rule. */
function PaperThumb({ type }) {
  const pitch = Math.round(((type.lineSpacing || 28) / 28) * 9);
  const rules = [];
  if (type.ruled) {
    for (let y = 16; y < THUMB_HEIGHT - 2; y += pitch) {
      rules.push(<View key={y} style={[styles.thumbRule, { top: y }]} />);
    }
  }
  return (
    <View style={styles.thumb}>
      {rules}
      {type.margin && type.headerRule ? (
        <>
          <View style={[styles.thumbHeader, styles.headerA]} />
          <View style={[styles.thumbHeader, styles.headerB]} />
        </>
      ) : null}
      {type.margin ? (
        <>
          <View style={[styles.thumbMargin, styles.marginA]} />
          <View style={[styles.thumbMargin, styles.marginB]} />
        </>
      ) : null}
    </View>
  );
}

export default function PageTypeSelector({ value, onChange }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="radiogroup"
    >
      {PAPER_TEMPLATES.map(type => (
        <SelectableCard
          key={type.id}
          selected={value === type.id}
          onPress={() => onChange(type.id)}
          accessibilityLabel={`${type.label} paper`}
          testID={`page-type-${type.id}`}
          style={styles.card}
        >
          <PaperThumb type={type} />
          <Text style={styles.label} numberOfLines={1}>
            {type.label}
          </Text>
          <Text style={styles.description} numberOfLines={2}>
            {type.description}
          </Text>
        </SelectableCard>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.md,
    paddingVertical: 4,
    paddingRight: spacing.md,
  },
  card: {
    width: 112,
    padding: spacing.md,
    alignItems: 'center',
  },
  thumb: {
    width: 58,
    height: THUMB_HEIGHT,
    borderRadius: 3,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.paperEdge,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  thumbRule: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.paperRule,
  },
  thumbHeader: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.paperMargin,
  },
  thumbMargin: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: colors.paperMargin,
  },
  headerA: { top: 8 },
  headerB: { top: 10 },
  marginA: { left: 9 },
  marginB: { left: 11 },
  label: {
    ...typography.title,
    fontSize: 13,
    textAlign: 'center',
  },
  description: {
    ...typography.caption,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 2,
  },
});
