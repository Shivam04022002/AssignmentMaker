/**
 * Handwriting section: the reference handwritings the app writes in —
 * Reference Handwriting (Lang1, the default) and Reference Handwriting 2
 * (Lang2, the joined school hand) — each a card with a live preview drawn
 * by the real renderer. No fonts, no catalogue.
 *
 * Below them, the personal handwritings saved on this device (Phase 7):
 * selecting one stores its exact reference, personal:<id>@<latest
 * version>. A document already pinned to another version keeps showing
 * that exact version (selected), with its real status — moving to a newer
 * version is the user's choice. A handwriting that cannot be used is shown
 * with the reason and cannot be selected; nothing falls back to Lang1.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  DEFAULT_HANDWRITING_STYLE,
  PREVIEW_SAMPLE,
  getHandwritingStyle,
  getHandwritingStyles,
  isPersonalStyleId,
} from '../data/handwritingStyles';
import { coverageOf, coverageText, loadProfileSummaries } from '../handwriting/learn/profileLibrary';
import { parseProfileRef } from '../handwriting/learn/profileSchema';
import { usePersonalResolution } from './PersonalHandwriting';
import { getPenColor } from '../data/pens';
import { colors, radii, spacing, typography } from '../theme/theme';
import HandwritingText from './HandwritingText';

const PREVIEW_ROW = 20;

/** Test id per handwriting (Lang1 keeps its original id). */
export const cardTestId = id =>
  id === DEFAULT_HANDWRITING_STYLE
    ? 'handwriting-reference'
    : `handwriting-${id.replace('reference_student_', 'reference-')}`;

function Card({ profile, pen, selected, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[styles.card, selected && styles.cardSelected]}
      accessible
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={`${profile.name}${selected ? ', selected' : ''}`}
      testID={cardTestId(profile.id)}
    >
      <View style={styles.header}>
        <Text style={styles.name}>{profile.name}</Text>
        {selected ? <Text style={styles.selected}>✓ Selected</Text> : null}
      </View>
      <Text style={styles.description}>{profile.description}</Text>
      <View style={[styles.preview, { height: PREVIEW_ROW * 4 + 4 }]}>
        {[1, 2, 3, 4].map(i => (
          <View key={i} style={[styles.rule, { top: i * PREVIEW_ROW - 1 }]} />
        ))}
        <HandwritingText
          text={PREVIEW_SAMPLE}
          style={profile.id}
          color={getPenColor(pen)}
          pen={pen}
          fontSize={PREVIEW_ROW * 0.62}
          lineHeight={PREVIEW_ROW}
          maxWidth={280}
          seed="handwriting-preview"
          containerStyle={styles.previewText}
        />
      </View>
    </Pressable>
  );
}

/** Preview text in the scripts a personal handwriting covers. */
export function personalPreviewText(scripts) {
  const lines = [];
  if (scripts.includes('Latn')) lines.push('Dear Sir,', 'This is my handwriting.');
  if (scripts.includes('Deva')) lines.push('नमस्ते, यह मेरी लिखावट है।');
  return lines.join('\n') || PREVIEW_SAMPLE;
}

/** A personal handwriting card: name, version, coverage, status, preview. */
function PersonalCard({ summary, pen, selected, onPress, testID }) {
  const usable = summary.status === 'ok';
  return (
    <Pressable
      onPress={usable ? onPress : undefined}
      disabled={!usable || !onPress}
      style={[styles.card, selected && styles.cardSelected]}
      accessible
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected, disabled: !usable }}
      accessibilityLabel={`${summary.name}, version ${summary.latest}${usable ? '' : ', cannot be used'}${selected ? ', selected' : ''}`}
      testID={testID}
    >
      <View style={styles.header}>
        <Text style={styles.name}>{summary.name}</Text>
        {selected ? <Text style={styles.selected}>✓ Selected</Text> : null}
      </View>
      <Text style={styles.description}>
        {summary.loading
          ? 'Loading…'
          : usable
          ? `Your handwriting · version ${summary.latest} · ${coverageText(summary)}`
          : `Can’t be used: ${summary.message}`}
      </Text>
      {usable ? (
        <View style={[styles.preview, { height: PREVIEW_ROW * 4 + 4 }]}>
          {[1, 2, 3, 4].map(i => (
            <View key={i} style={[styles.rule, { top: i * PREVIEW_ROW - 1 }]} />
          ))}
          <HandwritingText
            text={personalPreviewText(summary.scripts)}
            style={summary.ref}
            color={getPenColor(pen)}
            pen={pen}
            fontSize={PREVIEW_ROW * 0.62}
            lineHeight={PREVIEW_ROW}
            maxWidth={280}
            seed="handwriting-preview"
            containerStyle={styles.previewText}
          />
        </View>
      ) : null}
    </Pressable>
  );
}

/** The exact version a document is pinned to, when it is not a listed latest version. */
function PinnedCard({ value, pen }) {
  const resolution = usePersonalResolution(value);
  const parsed = parseProfileRef(value);
  const summary =
    resolution.status === 'ok'
      ? { name: resolution.profile.name, latest: resolution.profile.version, ref: value, status: 'ok', scripts: resolution.profile.scripts, coverage: coverageOf(resolution.profile) }
      : { name: 'Personal handwriting', latest: parsed ? parsed.version : '?', ref: value, status: resolution.status, message: resolution.message, loading: resolution.status === 'loading', scripts: [], coverage: {} };
  return <PersonalCard summary={summary} pen={pen} selected testID="handwriting-personal-current" />;
}

/** Props: value (handwriting id), pen, onChange(id) (omit: display only). */
export default function HandwritingStyleSelector({ pen, value, onChange }) {
  const current = getHandwritingStyle(value || DEFAULT_HANDWRITING_STYLE).id;
  const [personal, setPersonal] = useState([]);
  useEffect(() => {
    let alive = true;
    loadProfileSummaries()
      .then(list => alive && setPersonal(list))
      .catch(() => alive && setPersonal([]));
    return () => {
      alive = false;
    };
  }, []);
  const pinned = isPersonalStyleId(value) && !personal.some(p => p.ref === value);
  return (
    <View style={styles.list} accessibilityRole="radiogroup">
      {getHandwritingStyles().map(profile => (
        <Card
          key={profile.id}
          profile={profile}
          pen={pen}
          selected={profile.id === current}
          onPress={onChange ? () => onChange(profile.id) : undefined}
        />
      ))}
      {personal.length || pinned ? (
        <Text style={styles.groupLabel} testID="personal-handwriting-group">
          Your handwriting
        </Text>
      ) : null}
      {pinned ? <PinnedCard value={value} pen={pen} /> : null}
      {personal.map(summary => (
        <PersonalCard
          key={summary.id}
          summary={summary}
          pen={pen}
          selected={summary.ref === value}
          onPress={onChange ? () => onChange(summary.ref) : undefined}
          testID={`handwriting-personal-${summary.id}`}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  card: {
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardSelected: {
    borderColor: colors.accent,
    backgroundColor: '#F7F9FD',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: {
    ...typography.title,
    fontSize: 15,
  },
  selected: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  description: {
    ...typography.caption,
    fontSize: 12,
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  preview: {
    overflow: 'hidden',
    backgroundColor: colors.paper,
    borderRadius: 4,
    paddingLeft: spacing.sm,
  },
  rule: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.paperRule,
  },
  previewText: {
    marginLeft: spacing.sm,
  },
  groupLabel: {
    ...typography.sectionLabel,
    marginTop: spacing.md,
  },
});
