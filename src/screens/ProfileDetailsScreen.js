/**
 * One personal handwriting: what each saved version learned, and the
 * controls to rename or delete it.
 *
 * Details per version (versions are never changed; pick one to read it):
 * coverage per language with the missing characters, the confidence
 * measured for it, which proportions were measured and which are engine
 * defaults, the five samples it was built from with what each contributed
 * or had rejected (recorded from Phase 8 on), and how many documents use it.
 *
 * Rename changes only the name shown in the app — the stored versions keep
 * the name they were made with. Delete asks first and says exactly what will
 * happen: versions no document uses are removed; a version a saved document
 * uses is kept (hidden from My Handwritings) so that document still opens
 * in it — never silently removed (profileRepository.requestProfileDeletion).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenHeader from '../components/ScreenHeader';
import { clearPersonalCache, toResolution } from '../handwriting/learn/personalStore';
import { languageSupport } from '../handwriting/learn/profileGeneration';
import { checkedScripts, handwritingType } from '../handwriting/learn/handwritingTypes';
import { coverageOf, SCRIPT_NAMES } from '../handwriting/learn/profileLibrary';
import { listProfiles, listVersions, readProfileVersion, referencedVersions, renameProfile, requestProfileDeletion } from '../handwriting/learn/profileRepository';
import { formatProfileRef } from '../handwriting/learn/profileSchema';
import { listDocuments } from '../storage/documentStorage';
import { colors, radii, shadows, spacing, typography } from '../theme/theme';

const CONFIDENCE_LABELS = {
  overall: 'Overall',
  imageQuality: 'Photo quality',
  segmentation: 'Letter separation',
  identification: 'Matching the text',
  geometryExtraction: 'Shape tracing',
  variantDiversity: 'Repeated samples',
};
const REJECTION_LABELS = {
  'extraction:not-aligned': 'not located clearly',
  'extraction:neighbour-uncertain': 'next to an unclear letter',
  'extraction:trace-unfaithful': 'shape could not be traced',
  'extraction:marks-inconsistent': 'marks unclear',
  'extraction:marks-merged': 'marks unclear (a dot ran into the strokes)',
  'extraction:counter-unresolved': 'loop too small to see',
  'extraction:metrics-inconsistent': 'size or position unclear',
  'extraction:outside-band': 'outside the writing lines',
  'extraction:no-ink': 'no ink found',
  'extraction:structure-conflict': 'cluster parts unclear',
  'extraction:overlaps-neighbour': 'overlaps a neighbour',
  'extraction:below-threshold': 'too uncertain',
  'extraction:image-unusable': 'photo not usable',
  'extraction:too-small': 'writing too small',
  'extraction:scale-unknown': 'size could not be measured',
  'low-confidence': 'too uncertain',
  'conflicting-geometry': 'disagrees with other copies',
  'invalid-geometry': 'shape not drawable',
  'variant-limit': 'too many different shapes',
};

function Section({ title, children, testID }) {
  return (
    <View style={styles.card} testID={testID}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}
const Row = ({ label, value, testID, bad }) => (
  <View style={styles.row} testID={testID}>
    <Text style={styles.label}>{label}</Text>
    <Text style={[styles.value, bad && styles.bad]}>{value}</Text>
  </View>
);

/** The text of the delete confirmation for a profile and the documents using it. */
export function deletionMessage(name, versions, used) {
  const usedVersions = versions.filter(v => used[v]);
  const free = versions.filter(v => !used[v]);
  const parts = [];
  if (free.length) parts.push(`${free.length === versions.length ? 'All its versions' : `Version${free.length > 1 ? 's' : ''} ${free.join(', ')}`} will be removed from this device.`);
  for (const v of usedVersions) parts.push(`Version ${v} is used by ${used[v]} saved document${used[v] > 1 ? 's' : ''}; it will be kept so ${used[v] > 1 ? 'they' : 'it'} still open${used[v] > 1 ? '' : 's'} in this handwriting, but hidden from My Handwritings.`);
  return `${parts.join(' ')} This cannot be undone.`;
}

export default function ProfileDetailsScreen({ profileId, onBack, onDeleted }) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState({ status: 'loading' });
  const [shown, setShown] = useState(null);
  const [name, setName] = useState('');
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    const entry = (await listProfiles()).find(p => p.id === profileId);
    if (!entry) {
      setState({ status: 'missing' });
      return;
    }
    const versions = await listVersions(profileId);
    const records = {};
    for (const v of versions) records[v] = toResolution(formatProfileRef(profileId, v), await readProfileVersion(profileId, v));
    const docs = await listDocuments();
    const usedSet = referencedVersions(docs)[profileId] || new Set();
    const used = {};
    for (const v of versions) used[v] = docs.filter(d => d.handwritingStyle === formatProfileRef(profileId, v)).length;
    setState({ status: 'ready', entry, versions, records, used, anyUsed: usedSet.size > 0 });
    setName(entry.name);
    setShown(s => (s && versions.includes(s) ? s : versions[versions.length - 1]));
  }, [profileId]);

  useEffect(() => {
    load().catch(() => setState({ status: 'error' }));
  }, [load]);

  const record = state.status === 'ready' && shown ? state.records[shown] : null;
  const profile = record && record.status === 'ok' ? record.profile : null;
  const missingByScript = useMemo(() => {
    if (!profile) return {};
    const out = {};
    for (const u of Object.values(profile.units)) {
      if (u.coverage !== 'missing') continue;
      (out[u.script] = out[u.script] || []).push(u.text);
    }
    return out;
  }, [profile]);

  const rename = async () => {
    let result;
    try {
      result = await renameProfile(profileId, name);
    } catch (error) {
      setMessage('The name could not be changed. Please try again.');
      return;
    }
    setMessage(result.status === 'ok' ? 'Name changed. The saved versions are unchanged.' : 'The name must be 1–60 characters.');
    if (result.status === 'ok') load();
  };

  const confirmDelete = () => {
    Alert.alert(`Delete “${state.entry.name}”?`, deletionMessage(state.entry.name, state.versions, state.used), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          // The repository reads every saved document itself (and keeps all versions if one cannot be read).
          let result;
          try {
            result = await requestProfileDeletion(profileId);
          } catch (error) {
            Alert.alert('Could not delete', 'Your handwriting is unchanged. Please try again.');
            return;
          }
          if (result.status !== 'ok') {
            Alert.alert('Could not delete', 'Your saved handwritings could not be read, so nothing was changed.');
            return;
          }
          clearPersonalCache();
          if (onDeleted) onDeleted(result);
        },
      },
    ]);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]} testID="profile-details-screen">
      <ScreenHeader onBack={onBack}>
        <Text style={styles.title} numberOfLines={1}>
          {state.status === 'ready' ? state.entry.name : 'Handwriting'}
        </Text>
      </ScreenHeader>
      <ScrollView style={styles.list} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {state.status === 'loading' ? (
          <View style={styles.center} testID="profile-details-loading">
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : state.status !== 'ready' ? (
          <Text style={styles.bad} testID="profile-details-missing">
            This handwriting is no longer on this device.
          </Text>
        ) : (
          <>
            <View style={styles.versions} accessibilityRole="tablist">
              {state.versions.map(v => (
                <Pressable
                  key={v}
                  onPress={() => setShown(v)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: v === shown }}
                  style={[styles.chip, v === shown && styles.chipOn]}
                  testID={`version-${v}`}
                >
                  <Text style={[styles.chipText, v === shown && styles.chipTextOn]}>
                    Version {v}
                    {state.used[v] ? ` · ${state.used[v]} doc${state.used[v] > 1 ? 's' : ''}` : ''}
                  </Text>
                </Pressable>
              ))}
            </View>
            {!profile ? (
              <Text style={styles.bad} testID="version-unusable">
                Version {shown} can’t be used: {record.message}
              </Text>
            ) : (
              <>
                <Section title={`Version ${shown}`} testID="details-version">
                  <Row label="Made" value={new Date(profile.createdAt).toISOString().slice(0, 10)} />
                  <Row label="Saved as" value={profile.name} />
                  {handwritingType(profile.handwritingType) ? <Row label="Type" value={handwritingType(profile.handwritingType).title} testID="details-type" /> : null}
                  <Row label="Languages" value={profile.scripts.map(s => SCRIPT_NAMES[s] || s).join(', ')} />
                  <Row label="Used by" value={`${state.used[shown]} saved document${state.used[shown] === 1 ? '' : 's'}`} testID="details-used" />
                  {profile.synthetic ? <Text style={styles.note}>Test profile made from generated pages, not handwriting.</Text> : null}
                </Section>
                <Section title="Coverage" testID="details-coverage">
                  {Object.entries(languageSupport(profile.units, handwritingType(profile.handwritingType) ? checkedScripts(handwritingType(profile.handwritingType)) : profile.scripts)).map(([script, sp]) => (
                    <Text key={`support-${script}`} style={styles.note} testID={`support-${script}`}>
                      {sp.text}
                    </Text>
                  ))}
                  {Object.entries(coverageOf(profile)).map(([script, c]) => (
                    <View key={script}>
                      <Row label={SCRIPT_NAMES[script] || script} value={`${c.learned} learned · ${c.missing} missing`} testID={`coverage-${script}`} />
                      {missingByScript[script] ? (
                        <Text style={styles.note} testID={`missing-${script}`}>
                          Missing: {missingByScript[script].join(' ')} — shown as dashed boxes, never replaced by another handwriting.
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </Section>
                <Section title="Confidence" testID="details-confidence">
                  {Object.entries(CONFIDENCE_LABELS).map(([k, label]) =>
                    profile.confidence[k] ? <Row key={k} label={label} value={profile.confidence[k].score.toFixed(2)} testID={`confidence-${k}`} /> : null,
                  )}
                  <Text style={styles.note}>Engineering scores from 0 to 1, not calibrated on real handwriting.</Text>
                </Section>
                <Section title="Proportions" testID="details-params">
                  {Object.entries(profile.params).map(([k, v]) => (
                    <Row key={k} label={k} value={`${v} · ${profile.paramSources[k] === 'measured' ? 'measured' : 'default'}`} />
                  ))}
                </Section>
                <Section title="Samples it was built from" testID="details-samples">
                  {profile.evidence ? (
                    profile.evidence.samples.map(s => (
                      <Text key={s.slot} style={styles.note} testID={`details-sample-${s.slot}`}>
                        Sample {s.slot}: {s.used} of {s.considered} letters used
                        {Object.keys(s.rejected).length
                          ? ` · not used: ${Object.entries(s.rejected)
                              .map(([code, n]) => `${n} ${REJECTION_LABELS[code] || code}`)
                              .join(', ')}`
                          : ''}
                      </Text>
                    ))
                  ) : (
                    <Text style={styles.note} testID="details-samples-unrecorded">
                      Not recorded for this version (made before this information was kept).
                    </Text>
                  )}
                </Section>
              </>
            )}
            <Section title="Name" testID="details-rename">
              <TextInput value={name} onChangeText={setName} maxLength={60} style={styles.input} accessibilityLabel="Handwriting name" testID="rename-input" />
              <Pressable onPress={rename} accessibilityRole="button" style={styles.button} testID="rename-button">
                <Text style={styles.buttonText}>Rename</Text>
              </Pressable>
              {message ? (
                <Text style={styles.note} testID="rename-message">
                  {message}
                </Text>
              ) : null}
            </Section>
            <Pressable onPress={confirmDelete} accessibilityRole="button" style={styles.delete} testID="delete-profile-button">
              <Text style={styles.deleteText}>Delete Handwriting</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  title: { ...typography.title, flexShrink: 1 },
  list: { flex: 1 },
  content: { paddingHorizontal: spacing.lg + 4, paddingBottom: spacing.xl, paddingTop: spacing.md, width: '100%', maxWidth: 640, alignSelf: 'center', gap: spacing.md },
  center: { alignItems: 'center', marginTop: spacing.xl },
  versions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.borderStrong },
  chipOn: { backgroundColor: colors.charcoal, borderColor: colors.charcoal },
  chipText: { ...typography.caption, color: colors.text },
  chipTextOn: { color: colors.onCharcoal },
  card: { padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: spacing.xs, ...shadows.card },
  cardTitle: { ...typography.body, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  label: { ...typography.caption, color: colors.textMuted },
  value: { ...typography.caption, color: colors.text, flexShrink: 1, textAlign: 'right' },
  bad: { color: colors.danger },
  note: { ...typography.caption, color: colors.textMuted },
  input: { ...typography.body, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, borderRadius: radii.sm, padding: spacing.sm, color: colors.text },
  button: { minHeight: 40, borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 15, fontWeight: '600', color: colors.text },
  delete: { minHeight: 48, borderRadius: radii.md, borderWidth: 1, borderColor: colors.danger, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md },
  deleteText: { fontSize: 15, fontWeight: '600', color: colors.danger },
});
