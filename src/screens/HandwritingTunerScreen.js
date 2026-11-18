/**
 * Internal Handwriting Tuner (development builds only).
 *
 * Live-edits the reference handwriting profile and the paper against a real
 * page preview (question, answer label, heading, numbered list, underline)
 * with baseline / x-height guides. Changes are in-memory overrides; use
 * "Share config" to copy the values into
 * src/handwriting/handwritingProfiles.js.
 *
 * Compare mode shows a reference scan above the generated page. The image is
 * loaded at runtime from the Metro dev server (or any URL / file path typed
 * in) — reference images are never bundled into the app.
 */
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import {
  BackHandler,
  Image,
  NativeModules,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PaperCanvas from '../components/PaperCanvas';
import ScreenHeader from '../components/ScreenHeader';
import {
  DEFAULT_HANDWRITING_STYLE,
  getHandwritingStyle,
  getStylesVersion,
  subscribeToStyles,
} from '../data/handwritingStyles';
import {
  PAPER_TEMPLATES,
  getPaperVersion,
  subscribeToPaper,
} from '../data/paper';
import { PENS } from '../data/pens';
import {
  TUNING_PARAMETERS,
  TUNING_SAMPLE,
  exportStyleConfig,
  getTuningValue,
  hasTuning,
  resetTuning,
  stepTuningValue,
  tuningSampleFormatting,
} from '../dev/tuning';
import { colors, radii, spacing, typography } from '../theme/theme';

function Chip({ label, active, onPress, testID }) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Stepper({ styleId, parameter }) {
  const value = getTuningValue(styleId, parameter);
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepperLabel}>{parameter.label}</Text>
      <Pressable
        onPress={() => stepTuningValue(styleId, parameter, -1)}
        style={styles.stepButton}
        testID={`tune-${parameter.id}-down`}
        accessibilityLabel={`Decrease ${parameter.label}`}
      >
        <Text style={styles.stepButtonText}>−</Text>
      </Pressable>
      <Text style={styles.stepperValue} testID={`tune-${parameter.id}-value`}>
        {Number(value || 0).toFixed(3)}
      </Text>
      <Pressable
        onPress={() => stepTuningValue(styleId, parameter, 1)}
        style={styles.stepButton}
        testID={`tune-${parameter.id}-up`}
        accessibilityLabel={`Increase ${parameter.label}`}
      >
        <Text style={styles.stepButtonText}>+</Text>
      </Pressable>
    </View>
  );
}

/** The profile's measured proportions, as the engine resolved them. */
function Readout({ styleId }) {
  const s = getHandwritingStyle(styleId);
  return (
    <Text style={styles.readout} testID="tuner-readout">
      {`${s.name}${hasTuning(styleId) ? ' (tuned)' : ''} · x-height ${
        s.xHeightPerPitch
      } × pitch · ascender ${s.ascender} · descender ${
        s.descender
      } · pen ${s.strokeWidth} · letter gap ${s.letterGap} · word gap ${
        s.wordGap
      } (x-heights) · slant ${s.slant}° · ${s.glyphVariants} variants`}
    </Text>
  );
}

const REFERENCES = ['handwriting_01', 'handwriting_02', 'handwriting_03'];

/** Metro dev server origin, read from the URL the JS bundle came from. */
export function devServerOrigin() {
  const scriptURL =
    NativeModules.SourceCode?.getConstants?.().scriptURL ||
    NativeModules.SourceCode?.scriptURL ||
    '';
  const match = /^(https?:\/\/[^/]+)/.exec(scriptURL);
  if (match) {
    return match[1];
  }
  return Platform.OS === 'android'
    ? 'http://10.0.2.2:8081'
    : 'http://localhost:8081';
}

/** URL of a project reference image served by Metro (dev only). */
export function referenceUrl(name) {
  return `${devServerOrigin()}/assets/reference/${name}.png?platform=${
    Platform.OS
  }`;
}

function ComparePanel({ width }) {
  const [source, setSource] = useState(referenceUrl(REFERENCES[0]));
  const [failed, setFailed] = useState(false);
  return (
    <View style={styles.compare} testID="tuner-compare">
      <Text style={styles.compareLabel}>Reference</Text>
      <View style={styles.row}>
        {REFERENCES.map(name => (
          <Chip
            key={name}
            label={name.replace('handwriting_', 'Ref ')}
            active={source === referenceUrl(name)}
            onPress={() => {
              setFailed(false);
              setSource(referenceUrl(name));
            }}
          />
        ))}
      </View>
      <TextInput
        value={source}
        onChangeText={value => {
          setFailed(false);
          setSource(value);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Image URL or file:// path"
        accessibilityLabel="Reference image location"
        style={styles.compareInput}
      />
      {failed ? (
        <Text style={styles.note}>
          Could not load the reference. Is Metro running from the project
          folder? You can also type any image URL or file path.
        </Text>
      ) : (
        <Image
          source={{ uri: source }}
          resizeMode="contain"
          onError={() => setFailed(true)}
          style={[styles.referenceImage, { width, height: width * 0.9 }]}
        />
      )}
      <Text style={styles.compareLabel}>Generated</Text>
    </View>
  );
}

export default function HandwritingTunerScreen({ onBack, onOpenValidation }) {
  useSyncExternalStore(subscribeToStyles, getStylesVersion, getStylesVersion);
  useSyncExternalStore(subscribeToPaper, getPaperVersion, getPaperVersion);
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const styleId = DEFAULT_HANDWRITING_STYLE;
  const [pen, setPen] = useState('blue');
  const [pageType, setPageType] = useState('lined');
  const [guides, setGuides] = useState(true);
  const [text, setText] = useState(TUNING_SAMPLE);
  const [compare, setCompare] = useState(false);
  const formatting = React.useMemo(() => tuningSampleFormatting(text), [text]);
  const pageWidth = Math.min(window.width - spacing.lg * 2, 720);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  const share = () => {
    const config = exportStyleConfig(styleId);
    console.log(`[HandWrite tuner] ${styleId}\n${config}`);
    Share.share({ message: config }).catch(() => {});
  };

  const document = {
    id: 'tuner-preview',
    pageType,
    pen,
    handwritingStyle: styleId,
    content: text,
    formatting,
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader onBack={onBack}>
        <Text style={typography.title}>Handwriting Tuner</Text>
      </ScreenHeader>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
      >
        <Text style={styles.note}>
          Developer tool. Changes are temporary and never saved to documents.
        </Text>
        <View style={styles.row}>
          {PENS.map(p => (
            <Chip
              key={p.id}
              label={p.label}
              active={p.id === pen}
              onPress={() => setPen(p.id)}
            />
          ))}
          {PAPER_TEMPLATES.map(t => (
            <Chip
              key={t.id}
              label={t.label}
              active={t.id === pageType}
              onPress={() => setPageType(t.id)}
              testID={`tuner-paper-${t.id}`}
            />
          ))}
          <Chip
            label="Guides"
            active={guides}
            onPress={() => setGuides(g => !g)}
          />
          <Chip
            label="Compare"
            active={compare}
            onPress={() => setCompare(c => !c)}
            testID="tuner-compare-toggle"
          />
          <Chip
            label="Repeat test"
            active={false}
            onPress={() =>
              setText(t =>
                t === TUNING_SAMPLE
                  ? 'letter letter letter letter letter letter\nminimum minimum minimum\nThe quick brown fox jumps over the lazy dog.'
                  : TUNING_SAMPLE,
              )
            }
          />
        </View>

        <Readout styleId={styleId} />
        {compare ? <ComparePanel width={pageWidth} /> : null}
        <View style={styles.preview}>
          <PaperCanvas
            document={document}
            width={pageWidth}
            showPlaceholder={false}
            showGuides={guides}
          />
        </View>

        {TUNING_PARAMETERS.map(parameter => (
          <Stepper key={parameter.id} styleId={styleId} parameter={parameter} />
        ))}

        <View style={styles.row}>
          <Chip
            label="Reset"
            active={false}
            onPress={() => resetTuning(styleId)}
            testID="tuner-reset"
          />
          <Chip label="Share config" active={false} onPress={share} />
          {onOpenValidation ? (
            <Chip
              label="Device validation"
              active={false}
              onPress={onOpenValidation}
              testID="tuner-validation"
            />
          ) : null}
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
  compare: {
    gap: spacing.sm,
  },
  compareLabel: {
    ...typography.sectionLabel,
  },
  compareInput: {
    ...typography.caption,
    height: 36,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  referenceImage: {
    alignSelf: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  readout: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
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
  preview: {
    alignItems: 'center',
    marginVertical: spacing.sm,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stepperLabel: {
    ...typography.caption,
    color: colors.text,
    flex: 1,
  },
  stepperValue: {
    width: 64,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    color: colors.text,
  },
  stepButton: {
    width: 36,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonText: {
    fontSize: 18,
    color: colors.text,
  },
});
