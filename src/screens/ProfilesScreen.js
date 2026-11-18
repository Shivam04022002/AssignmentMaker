/**
 * My Handwritings — the personal handwriting profiles saved on this device.
 *
 * Each profile shows its type (or, for profiles saved before types existed,
 * its languages), its latest version (versions are never changed, a new one
 * is added), when it was created, which languages it covers and how many
 * characters it learned, and whether it can be used. A damaged or unreadable
 * profile is listed with the reason, never hidden and never shown as usable.
 * New profiles are made with the five-photo wizard (Create My Handwriting).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenHeader from '../components/ScreenHeader';
import { handwritingType } from '../handwriting/learn/handwritingTypes';
import { coverageText, loadProfileSummaries, SCRIPT_NAMES } from '../handwriting/learn/profileLibrary';
import { formatDay } from '../utils/format';
import { colors, radii, shadows, spacing, typography } from '../theme/theme';

/** The type a summary was made for, or one described by its scripts (older profiles). */
export function typeLabel(summary) {
  const type = summary.handwritingType ? handwritingType(summary.handwritingType) : null;
  if (type) return { title: type.title, glyph: type.glyph };
  const scripts = (summary.scripts || []).map(s => SCRIPT_NAMES[s] || s);
  return { title: scripts.join(' + ') || 'Handwriting', glyph: (summary.scripts || []).map(s => (s === 'Deva' ? 'अ' : 'Aa')).join(' ') || 'Aa' };
}

/** "English · v1 · 28 Oct 2026" */
export function metaLine(summary) {
  const parts = [typeLabel(summary).title, `v${summary.latest}`];
  if (summary.versions && summary.versions.length > 1) parts.push(`${summary.versions.length} versions`);
  if (Number.isFinite(summary.createdAt)) parts.push(formatDay(summary.createdAt));
  return parts.join(' · ');
}

export function ProfileCard({ summary, selected, onPress, testID, role = 'radio' }) {
  const usable = summary.status === 'ok';
  const type = typeLabel(summary);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? role : undefined}
      accessibilityState={onPress && role === 'radio' ? { selected: !!selected, checked: !!selected, disabled: !usable } : undefined}
      accessibilityLabel={`${summary.name}, ${type.title}, version ${summary.latest}${usable ? '' : ', cannot be used'}${selected ? ', selected' : ''}`}
      style={[styles.card, selected && styles.cardSelected]}
      testID={testID || `profile-card-${summary.id}`}
    >
      <View style={styles.glyphBox}>
        <Text style={styles.glyph}>{type.glyph}</Text>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>{summary.name}</Text>
          {selected ? <Text style={styles.selected}>✓ Selected</Text> : null}
        </View>
        <Text style={styles.meta} testID={`profile-meta-${summary.id}`}>
          {metaLine(summary)}
        </Text>
        {usable ? <Text style={styles.meta}>{coverageText(summary)}</Text> : null}
        <Text style={[styles.status, usable ? styles.statusOk : styles.statusBad]} testID={`profile-status-${summary.id}`}>
          {usable ? 'Ready to use' : `Can’t be used: ${summary.message}`}
        </Text>
      </View>
    </Pressable>
  );
}

/** What a deletion did, in words (shown on return to the list). */
export function deletionNotice(result) {
  if (!result || result.status !== 'ok') return null;
  if (!result.retained.length) return 'Handwriting deleted.';
  if (result.incomplete) return 'Handwriting removed from this list. Its versions are kept for now because a saved document could not be read; they are removed once it can be.';
  return `Handwriting removed from this list. Version${result.retained.length > 1 ? 's' : ''} ${result.retained.join(', ')} ${result.retained.length > 1 ? 'are' : 'is'} kept because saved documents use ${result.retained.length > 1 ? 'them' : 'it'}.`;
}

export default function ProfilesScreen({ onBack, onCreate, onOpen, notice }) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState({ status: 'loading', list: [] });
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    loadProfileSummaries()
      .then(list => alive && setState({ status: 'ready', list }))
      .catch(() => alive && setState({ status: 'error', list: [] }));
    return () => {
      alive = false;
    };
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return state.list;
    return state.list.filter(s => s.name.toLowerCase().includes(q) || typeLabel(s).title.toLowerCase().includes(q));
  }, [query, state.list]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]} testID="profiles-screen">
      <ScreenHeader onBack={onBack}>
        <Text style={styles.title}>My Handwritings</Text>
      </ScreenHeader>
      <ScrollView style={styles.list} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {state.status === 'ready' && state.list.length > 0 ? (
          <TextInput value={query} onChangeText={setQuery} placeholder="Search handwriting…" placeholderTextColor={colors.textFaint} style={styles.search} accessibilityLabel="Search handwriting" testID="profiles-search" />
        ) : null}
        {state.status === 'loading' ? (
          <View style={styles.center} testID="profiles-loading">
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.meta}>Loading your handwritings…</Text>
          </View>
        ) : state.status === 'error' ? (
          <Text style={styles.error} testID="profiles-error">
            Your saved handwritings could not be read.
          </Text>
        ) : state.list.length === 0 ? (
          <Text style={styles.lead} testID="profiles-empty">
            You have no personal handwriting yet. Create one from five photos of your writing; it stays on this device.
          </Text>
        ) : shown.length === 0 ? (
          <Text style={styles.lead} testID="profiles-no-match">
            No handwriting matches “{query.trim()}”.
          </Text>
        ) : (
          shown.map(s => <ProfileCard key={s.id} summary={s} role="button" onPress={onOpen ? () => onOpen(s.id) : undefined} />)
        )}
        {notice ? (
          <Text style={styles.meta} testID="profiles-notice">
            {notice}
          </Text>
        ) : null}
      </ScrollView>
      {onCreate ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Pressable onPress={onCreate} accessibilityRole="button" style={({ pressed }) => [styles.button, pressed && styles.pressed]} testID="profiles-create-button">
            <Text style={styles.buttonText}>Create My Handwriting</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  title: { ...typography.title },
  list: { flex: 1 },
  content: { paddingHorizontal: spacing.lg + 4, paddingBottom: spacing.xl, width: '100%', maxWidth: 640, alignSelf: 'center', gap: spacing.md, paddingTop: spacing.md },
  search: { ...typography.body, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, backgroundColor: colors.surface, color: colors.text },
  center: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl },
  lead: { ...typography.body, color: colors.textMuted, marginTop: spacing.md },
  error: { ...typography.body, color: colors.danger, marginTop: spacing.md },
  card: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, ...shadows.card },
  cardSelected: { borderColor: colors.accent },
  glyphBox: { width: 56, height: 48, borderRadius: radii.sm, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  glyph: { fontSize: 15, fontWeight: '700', color: colors.accent, textAlign: 'center' },
  cardBody: { flex: 1, gap: spacing.xs },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  cardTitle: { ...typography.body, fontWeight: '600', flexShrink: 1 },
  selected: { ...typography.caption, color: colors.accent, fontWeight: '600' },
  meta: { ...typography.caption, color: colors.textMuted },
  status: { ...typography.caption, fontWeight: '600' },
  statusOk: { color: colors.accent },
  statusBad: { color: colors.danger },
  footer: { paddingHorizontal: spacing.lg + 4, paddingTop: spacing.md, backgroundColor: colors.background, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  button: { height: 54, borderRadius: radii.lg, backgroundColor: colors.charcoal, alignItems: 'center', justifyContent: 'center', ...shadows.card },
  pressed: { opacity: 0.88 },
  buttonText: { color: colors.onCharcoal, fontSize: 16, fontWeight: '600' },
});
