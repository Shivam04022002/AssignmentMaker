/**
 * Device validation (internal tool; development or validation builds only).
 *
 * One tap creates a test document — the poem from the device screenshot,
 * letters/punctuation, 500–5,000 characters, 2/3/5 pages, 100/500/1,000
 * freehand strokes, natural corrections — saves it and opens it in the
 * editor. The timings table shows how long layout, rendering, ink and
 * export took *on this phone*; "Log timings" prints them as JSON (adb
 * logcat, tag ReactNativeJS) so they can be copied into a report.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenHeader from '../components/ScreenHeader';
import { perfSummary, resetPerf } from '../dev/perf';
import {
  VALIDATION_DOCS,
  buildValidationDocument,
} from '../dev/validationDocs';
import { saveDocument } from '../storage/documentStorage';
import { colors, radii, spacing, typography } from '../theme/theme';

export default function ValidationScreen({ onBack, onOpenDocument }) {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState(perfSummary());
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  const open = useCallback(
    async entry => {
      setBusy(entry.key);
      try {
        const saved = await saveDocument(buildValidationDocument(entry));
        onOpenDocument(saved.id);
      } finally {
        setBusy(null);
      }
    },
    [onOpenDocument],
  );

  const log = () => {
    const summary = perfSummary();
    console.log(`[HandWrite validation] ${JSON.stringify(summary)}`);
    setRows(summary);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader onBack={onBack}>
        <Text style={typography.title}>Device validation</Text>
      </ScreenHeader>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
      >
        <Text style={styles.note}>
          Internal tool. Each button saves a test document and opens it.
        </Text>
        <View style={styles.grid}>
          {VALIDATION_DOCS.map(entry => (
            <Pressable
              key={entry.key}
              onPress={() => open(entry)}
              disabled={!!busy}
              accessibilityRole="button"
              testID={`validation-${entry.key}`}
              style={({ pressed }) => [
                styles.button,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.buttonText}>
                {busy === entry.key
                  ? 'Creating…'
                  : entry.title.replace('Validation: ', '')}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.section}>Timings on this device (ms)</Text>
        <View style={styles.tableRow}>
          {['Stage', 'n', 'median', 'p95', 'max'].map(h => (
            <Text key={h} style={[styles.cell, styles.head, h === 'Stage' && styles.stage]}>
              {h}
            </Text>
          ))}
        </View>
        {rows.length ? (
          rows.map(row => (
            <View key={row.label} style={styles.tableRow} testID={`perf-${row.label}`}>
              <Text style={[styles.cell, styles.stage]}>
                {row.label}
                {row.size ? ` (${row.size})` : ''}
              </Text>
              <Text style={styles.cell}>{row.count}</Text>
              <Text style={styles.cell}>{row.median}</Text>
              <Text style={styles.cell}>{row.p95}</Text>
              <Text style={styles.cell}>{row.max}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.note}>
            Nothing measured yet — open a test document, type, draw, export.
          </Text>
        )}
        <View style={styles.grid}>
          <Pressable onPress={() => setRows(perfSummary())} style={styles.button} testID="perf-refresh">
            <Text style={styles.buttonText}>Refresh</Text>
          </Pressable>
          <Pressable onPress={log} style={styles.button} testID="perf-log">
            <Text style={styles.buttonText}>Log timings</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              resetPerf();
              setRows([]);
            }}
            style={styles.button}
            testID="perf-reset"
          >
            <Text style={styles.buttonText}>Reset</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  note: {
    ...typography.caption,
  },
  section: {
    ...typography.sectionLabel,
    marginTop: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  button: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  pressed: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 13,
    color: colors.text,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cell: {
    width: 52,
    fontSize: 12,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  stage: {
    flex: 1,
    textAlign: 'left',
  },
  head: {
    color: colors.textMuted,
    fontWeight: '600',
  },
});
