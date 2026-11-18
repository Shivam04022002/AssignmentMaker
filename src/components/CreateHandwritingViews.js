/**
 * The views of Create My Handwriting (CreateHandwritingScreen.js holds the
 * state and the pipeline calls): intro, type choice, the photo grid and
 * per-photo cards, the analysis progress, the review, naming, creating and
 * the success screen. Presentational only — every number shown comes from
 * the sample set or the build report, never from here.
 */
import React from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { HANDWRITING_TYPES, MAX_PHOTOS, MIN_PHOTOS } from '../handwriting/learn/handwritingTypes';
import { SET_INFO } from '../handwriting/learn/profileGeneration';
import { SAMPLE_SLOTS } from '../handwriting/learn/samplePrompts';
import { colors, radii, shadows, spacing, typography } from '../theme/theme';

const GOOD = '#1F7A3E';
const GOOD_SOFT = '#E3F3E8';
const WARN = '#B7791F';
const WARN_SOFT = '#FBF1DC';
const BAD_SOFT = '#F9E6E4';

export const STATE_LABELS = {
  empty: 'Photo needed',
  'picker-error': 'Try again',
  invalid: 'Needs a different photo',
  warning: 'Photo chosen · check notes',
  selected: 'Photo chosen',
};

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function Button({ label, onPress, disabled, kind = 'secondary', testID }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      style={({ pressed }) => [styles.button, kind === 'primary' && styles.buttonPrimary, disabled && styles.buttonDisabled, pressed && !disabled && styles.pressed]}
    >
      <Text style={[styles.buttonText, kind === 'primary' && styles.buttonTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

export function Problems({ list, testID }) {
  if (!list.length) return null;
  return (
    <View style={styles.problems} testID={testID}>
      {list.map((p, i) => (
        <Text key={`${p.code}-${i}`} style={[styles.problem, p.severity === 'error' && styles.problemError]}>
          {p.message} {p.advice}
        </Text>
      ))}
    </View>
  );
}

/** ✓ / ! / ○ in a small circle. */
function Mark({ tone, testID }) {
  const bg = tone === 'good' ? GOOD : tone === 'warn' ? WARN : tone === 'bad' ? colors.danger : colors.surfaceMuted;
  const glyph = tone === 'good' ? '✓' : tone === 'warn' || tone === 'bad' ? '!' : '';
  return (
    <View style={[styles.mark, { backgroundColor: bg }, tone === 'todo' && styles.markTodo]} testID={testID}>
      <Text style={styles.markText}>{glyph}</Text>
    </View>
  );
}

function Row({ label, value, good, testID }) {
  return (
    <View style={styles.reviewRow} testID={testID}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={[styles.reviewValue, good === false && styles.problemError]}>{value}</Text>
    </View>
  );
}

// --- 2. Introduction -----------------------------------------------------------------------------

const INTRO_STEPS = ['Choose handwriting type', `Add ${MIN_PHOTOS} reference photos`, 'Analyze and learn your style', 'Review and save'];

export function IntroView({ onStart }) {
  return (
    <View style={styles.intro} testID="intro-step">
      <View style={styles.illustration} accessible={false}>
        <View style={styles.sheet}>
          {[0.9, 0.7, 0.8, 0.5].map((w, i) => (
            <View key={i} style={[styles.sheetLine, { width: `${w * 100}%` }]} />
          ))}
        </View>
        <Text style={styles.pen}>✎</Text>
      </View>
      <Text style={styles.introTitle}>Create Your Handwriting Profile</Text>
      <Text style={styles.introLead}>
        Photograph {MIN_PHOTOS} pages of your own handwriting. The app analyses them on this device and builds a digital handwriting style for you. Your photos never leave your phone.
      </Text>
      <View style={styles.introSteps}>
        {INTRO_STEPS.map((s, i) => (
          <View key={s} style={styles.introStep}>
            <View style={styles.stepDot}>
              <Text style={styles.stepDotText}>{i + 1}</Text>
            </View>
            <Text style={styles.introStepText}>{s}</Text>
          </View>
        ))}
      </View>
      <Button label="Get Started" kind="primary" onPress={onStart} testID="intro-start" />
    </View>
  );
}

// --- 3. Handwriting type -------------------------------------------------------------------------

/** What a type covers, in plain words (also its accessibility label). */
export function typeSummary(type) {
  return `${type.subtitle} ${MIN_PHOTOS === MAX_PHOTOS ? `${MIN_PHOTOS} photos` : `${MIN_PHOTOS}–${MAX_PHOTOS} photos`}.`;
}

export function TypeChooser({ value, onChoose }) {
  return (
    <View testID="type-step">
      <Text style={styles.question}>What will you write with this handwriting?</Text>
      <Text style={styles.instruction}>Select one type. You can create another handwriting for a different type later.</Text>
      {HANDWRITING_TYPES.map(t => {
        const on = value === t.id;
        return (
          <Pressable
            key={t.id}
            onPress={() => onChoose(t.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, checked: on }}
            accessibilityLabel={`${t.title}: ${typeSummary(t)}`}
            testID={`type-${t.id}`}
            style={[styles.typeCard, on && styles.typeCardOn]}
          >
            <View style={styles.glyphBox}>
              <Text style={styles.glyph}>{t.glyph}</Text>
            </View>
            <View style={styles.typeBody}>
              <Text style={styles.cardTitle}>{t.title}</Text>
              <Text style={styles.quality}>{t.subtitle}</Text>
            </View>
            <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
          </Pressable>
        );
      })}
    </View>
  );
}

// --- 4. Reference photos -------------------------------------------------------------------------

/** The five photo tiles: tap to add or replace, × to remove. */
export function PhotoGrid({ statuses, available, picking, onPick, onRemove }) {
  return (
    <View style={styles.grid} testID="photo-grid">
      {statuses.map(st => {
        const slot = st.slot;
        const busy = picking === slot;
        const checking = st.analysisStatus === 'decoding' || st.analysisStatus === 'analysing';
        const tone = !st.sample ? null : !st.fileValid || st.qualityUsable === false || (st.analysisFailed && !st.decoded) ? 'bad' : checking ? 'todo' : st.qualityAnalysed ? (st.qualityAcceptable ? 'good' : 'warn') : 'todo';
        return (
          <View key={slot} style={styles.tileWrap}>
            <Pressable
              onPress={() => onPick(slot)}
              disabled={!available || busy}
              accessibilityRole="button"
              accessibilityLabel={st.sample ? `Replace photo ${slot}` : `Add photo ${slot}`}
              accessibilityState={{ disabled: !available || busy }}
              testID={`sample-pick-${slot}`}
              style={[styles.tile, !st.sample && styles.tileEmpty, (!available || busy) && styles.buttonDisabled]}
            >
              {st.sample ? (
                <Image source={{ uri: st.sample.image.uri }} style={styles.tileImage} resizeMode="cover" testID={`sample-preview-${slot}`} />
              ) : (
                <>
                  <View style={styles.plus}>
                    <Text style={styles.plusText}>+</Text>
                  </View>
                  <Text style={styles.tileLabel}>{busy ? 'Choosing…' : `Add Photo ${slot}`}</Text>
                </>
              )}
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{slot}</Text>
              </View>
              {tone ? <Mark tone={tone} testID={`sample-mark-${slot}`} /> : null}
            </Pressable>
            {st.sample ? (
              <Pressable onPress={() => onRemove(slot)} accessibilityRole="button" accessibilityLabel={`Remove photo ${slot}`} hitSlop={6} style={styles.remove} testID={`sample-tile-remove-${slot}`}>
                <Text style={styles.removeText}>×</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export function Guidelines() {
  return (
    <View style={styles.card} testID="photo-guidelines">
      <Text style={styles.cardTitle}>Guidelines</Text>
      <Text style={styles.guideline}>✓ Use well-lit, clear and focused photos.</Text>
      <Text style={styles.guideline}>✓ Handwriting should be on plain or ruled paper.</Text>
      <Text style={styles.guideline}>✓ Avoid blurred or cropped text.</Text>
      <Text style={styles.guideline}>✓ All five photos: the same person's handwriting.</Text>
    </View>
  );
}

/** Why each photo still has a page to copy: this version cannot read text from a photo. */
export function NoRecognitionNote() {
  return (
    <View style={styles.note} testID="no-ocr-note">
      <Text style={styles.noteTitle}>Each photo shows one page of text</Text>
      <Text style={styles.noteText}>
        This version cannot read handwriting from a photo. Each photo must show the page listed below, copied in your own handwriting, so every letter can be matched to its text. If you wrote something slightly different, you can correct the text on the review screen.
      </Text>
    </View>
  );
}

/** What the chosen pages can teach, and the page that would add most (a plan, not a result). */
export function CoveragePlan({ plan }) {
  return (
    <View style={styles.card} testID="coverage-plan">
      <Text style={styles.cardTitle}>What your pages can teach</Text>
      {plan.sets.length ? (
        plan.sets.map(x => (
          <Text key={x.id} style={[styles.quality, x.missing.length && styles.problemError]} testID={`coverage-plan-${x.id}`}>
            {x.label}: {x.covered} of {x.total}
            {x.missing.length ? ` · not on any page yet: ${x.missing.slice(0, 12).join(' ')}${x.missing.length > 12 ? ' …' : ''}` : ''}
          </Text>
        ))
      ) : (
        <Text style={styles.quality} testID="coverage-plan-empty">
          Choose photos to see which characters they can teach.
        </Text>
      )}
      {plan.suggestion ? (
        <Text style={styles.instruction} testID="coverage-plan-suggestion">
          Add a photo of: {plan.suggestion.title} (adds {plan.suggestion.adds} {plan.suggestion.adds === 1 ? 'character' : 'characters'})
        </Text>
      ) : plan.complete ? (
        <Text style={styles.quality} testID="coverage-plan-complete">
          Every required character is on at least one page. Whether each one is learned depends on the photos.
        </Text>
      ) : null}
    </View>
  );
}

/** How much of the known text the photo check could locate (not recognise). */
export function textLine(al) {
  if (!al || al.status === 'no-text') return 'Text: none given (measurements only)';
  if (al.status === 'no-writing') return 'Text: no writing to match it to';
  const located = al.units.aligned + al.units.ambiguous;
  return `Text located: ${al.words.aligned} of ${al.expectedWords} words clearly · ${located} of ${al.expectedUnits} characters (${al.units.ambiguous} uncertain)`;
}

/** What has actually been checked for a photo — each step on its own line. */
export function Checks({ slot, status }) {
  const a = status.sample.analysis;
  const running = status.analysisStatus === 'decoding' || status.analysisStatus === 'analysing';
  const quality = running
    ? status.analysisStatus === 'decoding'
      ? 'Reading the photo…'
      : 'Checking image quality…'
    : status.analysisStatus === 'done'
    ? 'Image quality: checked'
    : status.analysisStatus === 'failed'
    ? 'Image quality: check failed'
    : 'Image quality: not checked yet';
  return (
    <>
      <Text style={styles.quality} testID={`sample-file-${slot}`}>
        File details: {status.fileValid ? 'valid' : 'problem'}
      </Text>
      {status.analysisStatus && status.analysisStatus !== 'not-started' && status.analysisStatus !== 'unavailable' ? (
        <Text style={styles.quality} testID={`sample-decoded-${slot}`}>
          Pixels decoded: {status.decoded ? 'yes' : running ? '…' : 'no'}
        </Text>
      ) : null}
      <Text style={styles.quality} testID={`sample-quality-${slot}`}>
        {quality}
      </Text>
      {status.analysisStatus === 'done' ? (
        <>
          <Text style={[styles.quality, status.qualityUsable === false && styles.problemError]} testID={`sample-acceptable-${slot}`}>
            {status.qualityAcceptable ? 'Quality acceptable' : status.qualityUsable ? 'Usable, with notes below' : 'Not usable: see below'}
          </Text>
          <Text style={styles.quality} testID={`sample-region-${slot}`}>
            Writing found: {a.segmentation.lines} {a.segmentation.lines === 1 ? 'line' : 'lines'}
            {a.segmentation.expectedLines ? ` (expected ${a.segmentation.expectedLines})` : ''}
            {status.regionUncertain ? ' · uncertain' : ''}
          </Text>
          <Text style={styles.quality} testID={`sample-text-${slot}`}>
            {textLine(a.alignment)}
          </Text>
          {a.extraction ? (
            <Text style={styles.quality} testID={`sample-letters-${slot}`}>
              Letters usable from this photo: {a.extraction.extracted} of {a.extraction.considered}
            </Text>
          ) : null}
        </>
      ) : null}
    </>
  );
}

/** One photo position: its page (to copy exactly), the photo's checks and its controls. */
export function SampleCard({ info, page, knownText, status, onRemove, onMove, onRecheck }) {
  const { sample } = status;
  const first = info.slot === SAMPLE_SLOTS[0].slot;
  const last = info.slot === SAMPLE_SLOTS[SAMPLE_SLOTS.length - 1].slot;
  const corrected = knownText !== page.text;
  return (
    <View style={styles.card} testID={`sample-slot-${info.slot}`}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle} testID={`sample-title-${info.slot}`}>
          Photo {info.slot} · {page.title}
        </Text>
        <Text style={[styles.chip, status.state === 'invalid' && styles.chipError]} testID={`sample-status-${info.slot}`}>
          {STATE_LABELS[status.state]}
        </Text>
      </View>
      <Text style={styles.instruction}>• Copy this page by hand, line for line, in your normal handwriting.</Text>
      <View style={styles.promptBox}>
        <Text style={styles.promptLabel}>Write exactly this:</Text>
        <Text style={styles.promptText} selectable testID={`sample-prompt-${info.slot}`}>
          {page.text}
        </Text>
      </View>
      {corrected ? (
        <View style={styles.promptBox} testID={`sample-corrected-${info.slot}`}>
          <Text style={styles.promptLabel}>Your correction (what this photo actually shows):</Text>
          <Text style={styles.promptText} selectable>
            {knownText}
          </Text>
        </View>
      ) : null}
      {sample ? (
        <View style={styles.selected}>
          <Image source={{ uri: sample.image.uri }} style={styles.thumb} resizeMode="cover" />
          <View style={styles.selectedBody}>
            <Text style={styles.meta} testID={`sample-meta-${info.slot}`}>
              {sample.image.width} × {sample.image.height} · {formatBytes(sample.image.bytes)}
              {sample.file.mime ? ` · ${sample.file.mime.replace('image/', '').toUpperCase()}` : ''}
            </Text>
            <Checks slot={info.slot} status={status} />
          </View>
        </View>
      ) : null}
      {sample ? <Problems list={sample.file.problems} testID={`sample-problems-${info.slot}`} /> : null}
      {sample && status.analysisStatus === 'done' ? <Problems list={sample.analysis.quality.issues} testID={`sample-quality-issues-${info.slot}`} /> : null}
      {sample && status.analysisFailed ? (
        <View style={styles.actions}>
          <Text style={[styles.problem, styles.problemError]} testID={`sample-analysis-error-${info.slot}`}>
            {sample.analysis.message} {sample.analysis.advice}
          </Text>
          <Button label="Check again" onPress={onRecheck} testID={`sample-recheck-${info.slot}`} />
        </View>
      ) : null}
      {status.error ? (
        <Text style={[styles.problem, styles.problemError]} testID={`sample-error-${info.slot}`}>
          {status.error.message} {status.error.advice}
        </Text>
      ) : null}
      {sample ? (
        <View style={styles.actions}>
          <Button label="Remove" onPress={onRemove} testID={`sample-remove-${info.slot}`} />
          {!first ? <Button label="Move up" onPress={() => onMove(-1)} testID={`sample-up-${info.slot}`} /> : null}
          {!last ? <Button label="Move down" onPress={() => onMove(1)} testID={`sample-down-${info.slot}`} /> : null}
        </View>
      ) : null}
    </View>
  );
}

// --- 5. Analysing / 8. Creating ------------------------------------------------------------------

export function ProgressRing({ percent, label }) {
  const size = 148;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, percent));
  return (
    <View style={styles.ring} testID="progress-ring" accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: p }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surfaceMuted} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.accent} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - p / 100)} rotation={-90} origin={`${size / 2}, ${size / 2}`} />
      </Svg>
      <View style={styles.ringCenter}>
        <Text style={styles.ringLabel}>{label}</Text>
        <Text style={styles.ringPercent} testID="progress-percent">
          {p}%
        </Text>
      </View>
    </View>
  );
}

/** A checklist of stages: done ✓, the current one spinning, the rest to come. */
export function StageList({ stages, testID }) {
  return (
    <View style={styles.stages} testID={testID}>
      {stages.map(s => (
        <View key={s.id} style={styles.stage} testID={`stage-${s.id}`} accessibilityLabel={`${s.label}: ${s.state}`}>
          {s.state === 'active' ? <ActivityIndicator size="small" color={colors.accent} style={styles.stageSpinner} /> : <Mark tone={s.state === 'done' ? 'good' : s.state === 'failed' ? 'bad' : 'todo'} />}
          <Text style={[styles.stageText, s.state === 'todo' && styles.stageTodo]}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function AnalyzingView({ percent, rows, stages, attention, problems, onBackToPhotos }) {
  return (
    <View style={styles.centered} testID="analyzing-step">
      {attention ? (
        <View style={[styles.banner, styles.bannerBad]} testID="analysis-attention">
          <Text style={styles.bannerTitle}>Some photos need attention</Text>
          <Text style={styles.bannerText}>The problems below must be fixed before your handwriting can be analysed. Your photos are kept.</Text>
        </View>
      ) : (
        <ProgressRing percent={percent} label="Analyzing…" />
      )}
      <View style={styles.card} testID="analysis-photos">
        {rows.map(row => (
          <View key={row.slot} style={styles.photoRow} testID={`analysis-photo-${row.slot}`}>
            {row.uri ? <Image source={{ uri: row.uri }} style={styles.rowThumb} resizeMode="cover" /> : null}
            <View style={styles.selectedBody}>
              <Text style={styles.cardTitle}>Photo {row.slot}</Text>
              <Text style={[styles.quality, row.tone === 'bad' && styles.problemError]}>{row.text}</Text>
            </View>
            {row.tone === 'todo' ? <ActivityIndicator size="small" color={colors.accent} /> : <Mark tone={row.tone} />}
          </View>
        ))}
      </View>
      {attention ? (
        <>
          <Problems list={problems} testID="analysis-problems" />
          <Button label="Back to photos" kind="primary" onPress={onBackToPhotos} testID="back-to-samples-button" />
        </>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Analyzing handwriting…</Text>
          <StageList stages={stages} testID="analysis-stages" />
        </View>
      )}
    </View>
  );
}

export function CreatingView({ stages }) {
  const done = stages.filter(s => s.state === 'done').length;
  return (
    <View style={styles.centered} testID="creating-step">
      <ProgressRing percent={Math.round((done / stages.length) * 100)} label="Creating…" />
      <Text style={styles.introTitle}>Creating your Handwriting…</Text>
      <Text style={styles.introLead}>Please wait while we build your handwriting profile.</Text>
      <View style={styles.card}>
        <StageList stages={stages} testID="creating-stages" />
      </View>
    </View>
  );
}

// --- 6. Review -----------------------------------------------------------------------------------

/** Plain-language names of rejection codes (Phase 5 extraction, Phase 6 builder). */
export const REJECTION_LABELS = {
  'extraction:not-aligned': 'not located clearly',
  'extraction:neighbour-uncertain': 'next to an unclear letter',
  'extraction:trace-unfaithful': 'shape could not be traced',
  'extraction:marks-inconsistent': 'marks unclear',
  'extraction:marks-merged': 'marks unclear (a dot ran into the strokes)',
  'extraction:counter-unresolved': 'loop too small to see',
  'extraction:metrics-inconsistent': 'size or position unclear',
  'extraction:outside-band': 'outside the writing lines',
  'extraction:no-ink': 'no ink found',
  'extraction:image-unusable': 'photo not usable',
  'extraction:too-small': 'writing too small',
  'extraction:scale-unknown': 'size could not be measured',
  'extraction:structure-conflict': 'cluster parts unclear',
  'extraction:overlaps-neighbour': 'overlaps a neighbour',
  'extraction:below-threshold': 'too uncertain',
  'low-confidence': 'too uncertain',
  'conflicting-geometry': 'disagrees with other copies',
  'invalid-geometry': 'shape not drawable',
  'variant-limit': 'too many different shapes',
};
const SET_LABELS = Object.fromEntries(Object.entries(SET_INFO).map(([k, v]) => [k, v.label]));
const percent = v => `${Math.round(v * 100)}%`;

/** What building found, in the engine's own terms: requirements, coverage per set, sample contributions. */
export function BuildDetails({ result }) {
  const { report } = result;
  const created = result.status === 'created';
  return (
    <View style={styles.card} testID="build-result">
      <Text style={styles.cardTitle} testID="build-status">
        {created ? 'Your handwriting is ready to save.' : result.status === 'insufficient' ? 'Not enough clear writing to make a usable handwriting yet.' : 'The samples could not be turned into a handwriting.'}
      </Text>
      {(report.requirements || []).map(r => (
        <Text key={r.id} style={[styles.problem, !r.pass && styles.problemError]} testID={`requirement-${r.id}`}>
          {r.pass ? '✓' : '✗'} {r.description}: {r.pass ? `${percent(r.actual)} (needs ${percent(r.required)})` : r.reason}
        </Text>
      ))}
      {Object.entries(report.support || {}).map(([script, sp]) => (
        <Text key={`support-${script}`} style={[styles.problem, sp.level !== 'all-required' && styles.problemError]} testID={`support-${script}`}>
          {sp.text}
        </Text>
      ))}
      {Object.entries(report.scripts || {}).flatMap(([script, sets]) =>
        Object.entries(sets).map(([set, c]) => (
          <Text key={`${script}-${set}`} style={styles.quality} testID={`coverage-${script}-${set}`}>
            {SET_INFO[set] && !SET_INFO[set].required ? 'Optional · ' : 'Required · '}
            {SET_LABELS[set] || set}: {c.observed} of {c.total} learned{c.uncertain ? ` · ${c.uncertain} uncertain` : ''}
            {c.missing ? ` · missing ${c.missingKeys.join(' ')}` : ''}
          </Text>
        )),
      )}
      {(report.samples || []).map(c => (
        <Text key={c.slot} style={styles.quality} testID={`contribution-${c.slot}`}>
          Sample {c.slot}: {c.used} of {c.considered} letters used
          {Object.keys(c.rejected).length
            ? ` · not used: ${Object.entries(c.rejected)
                .map(([code, n]) => `${n} ${REJECTION_LABELS[code] || code}`)
                .join(', ')}`
            : ''}
        </Text>
      ))}
    </View>
  );
}

function Bar({ value }) {
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width: `${Math.max(0, Math.min(100, value))}%` }, value < 100 && styles.barFillPartial]} />
    </View>
  );
}

/** One photo on the review: its thumbnail and verdict; tap for its checks and to correct its text. */
function ReviewPhoto({ photo, expanded, onToggle, editing, onEdit, onEditText, onApplyEdit, onCancelEdit }) {
  const { slot, status: st } = photo;
  return (
    <View style={styles.reviewPhoto}>
      <Pressable onPress={() => onToggle(slot)} accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={`Photo ${slot}: ${photo.verdict}`} style={styles.photoRow} testID={`review-photo-${slot}`}>
        <Image source={{ uri: photo.uri }} style={styles.rowThumb} resizeMode="cover" />
        <View style={styles.selectedBody}>
          <Text style={styles.cardTitle}>Photo {slot}</Text>
          <Text style={[styles.quality, photo.tone === 'bad' && styles.problemError]}>{photo.verdict}</Text>
        </View>
        <Mark tone={photo.tone} />
        <Text style={styles.chevron}>{expanded ? '⌃' : '›'}</Text>
      </Pressable>
      {expanded ? (
        <View style={styles.reviewDetails} testID={`review-slot-${slot}`}>
          <Row label="Page" value={photo.page.title} />
          <Row label="File details" value={st.fileValid ? 'Valid' : 'Problem'} good={st.fileValid} />
          <Row label="Image quality" value={st.qualityAnalysed ? `Checked · score ${st.sample.analysis.quality.score.score}` : st.analysisFailed ? 'Check failed' : 'Not checked yet'} good={st.analysisFailed ? false : undefined} />
          {st.qualityAnalysed ? (
            <>
              <Row label="Quality acceptable" value={st.qualityAcceptable ? 'Yes' : st.qualityUsable ? 'Usable, with warnings' : 'No'} good={st.qualityUsable === false ? false : undefined} />
              <Row label="Writing region" value={`${st.sample.analysis.segmentation.lines} lines${st.regionUncertain ? ' · uncertain' : ' · detected'}`} />
              <Row label="Text" value={textLine(st.sample.analysis.alignment)} />
              {photo.contribution ? <Row label="Letters used" value={`${photo.contribution.used} of ${photo.contribution.considered}`} /> : null}
            </>
          ) : null}
          <Problems list={st.qualityAnalysed ? st.sample.analysis.quality.issues : []} testID={`review-issues-${slot}`} />
          <Text style={styles.promptLabel}>Text matched on this photo{photo.corrected ? ' (your correction)' : ''}:</Text>
          <Text style={styles.promptText} selectable testID={`review-text-${slot}`}>
            {photo.knownText}
          </Text>
          {editing && editing.slot === slot ? (
            <View style={styles.transcription} testID={`review-edit-form-${slot}`}>
              <Text style={styles.instruction}>Type exactly what this photo shows, line for line. The photo is checked again against it.</Text>
              <TextInput value={editing.text} onChangeText={onEditText} multiline style={styles.input} accessibilityLabel={`Text of photo ${slot}`} testID={`review-text-input-${slot}`} />
              {editing.problem ? (
                <Text style={[styles.problem, styles.problemError]} testID={`review-edit-problem-${slot}`}>
                  {editing.problem}
                </Text>
              ) : null}
              <View style={styles.actions}>
                <Button label="Apply and check again" kind="primary" onPress={onApplyEdit} testID={`review-apply-${slot}`} />
                <Button label="Cancel" onPress={onCancelEdit} testID={`review-cancel-edit-${slot}`} />
              </View>
            </View>
          ) : (
            <View style={styles.actions}>
              <Button label={photo.corrected ? 'Edit correction' : 'I wrote something different'} onPress={() => onEdit(slot)} testID={`review-edit-${slot}`} />
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

export function ReviewView({ summary, result, photos, expanded, onToggle, editing, onEdit, onEditText, onApplyEdit, onCancelEdit, recognition }) {
  const { banner } = summary;
  return (
    <View testID="review-step">
      <View style={[styles.banner, banner.tone === 'good' ? styles.bannerGood : styles.bannerBad]} testID="review-banner">
        <Mark tone={banner.tone === 'good' ? 'good' : 'bad'} />
        <View style={styles.selectedBody}>
          <Text style={styles.bannerTitle} testID="review-banner-title">
            {banner.title}
          </Text>
          <Text style={styles.bannerText}>{banner.text}</Text>
        </View>
      </View>
      <Text style={styles.lead} testID="review-lead">
        {recognition
          ? 'The text of each photo was read by the on-device recogniser and confirmed against the ink before any letter was learned.'
          : 'Each photo was matched to the text of its page (this version does not read text from photos). No handwriting profile has been saved yet.'}
      </Text>

      <Text style={styles.sectionLabel}>Photos used ({photos.length})</Text>
      <View style={styles.card}>
        {photos.map(p => (
          <ReviewPhoto key={p.slot} photo={p} expanded={expanded === p.slot} onToggle={onToggle} editing={editing} onEdit={onEdit} onEditText={onEditText} onApplyEdit={onApplyEdit} onCancelEdit={onCancelEdit} />
        ))}
      </View>

      {summary.scripts.map(s => (
        <View key={s.script} style={styles.card} testID={`review-coverage-${s.script}`}>
          <Text style={styles.cardTitle}>Detected characters ({s.label})</Text>
          <Bar value={s.percent} />
          <Text style={styles.barCaption} testID={`review-coverage-total-${s.script}`}>
            {s.learned} of {s.total} ({s.percent}%)
          </Text>
          {s.rows.map(r => (
            <View key={r.id} style={styles.reviewRow} testID={`review-row-${s.script}-${r.id}`}>
              <View style={styles.rowLeft}>
                <Mark tone={r.total === 0 ? 'todo' : r.learned === r.total ? 'good' : r.required ? 'warn' : 'todo'} />
                <Text style={styles.reviewLabel}>
                  {r.label}
                  {r.required ? '' : ' (optional)'}
                </Text>
              </View>
              <Text style={styles.reviewValue}>
                {r.learned} / {r.total}
              </Text>
            </View>
          ))}
          {s.missing.length ? (
            <Text style={[styles.problem, styles.problemError]} testID={`review-missing-${s.script}`}>
              Missing: {s.missing.join(' ')}
            </Text>
          ) : null}
          {s.uncertain ? (
            <Text style={[styles.problem, styles.problemWarn]} testID={`review-uncertain-${s.script}`}>
              {s.uncertain} learned with low confidence
            </Text>
          ) : null}
          {s.optionalMissing.length ? (
            <Text style={styles.quality} testID={`review-optional-missing-${s.script}`}>
              Not learned (optional): {s.optionalMissing.join(' ')}
            </Text>
          ) : null}
        </View>
      ))}

      <Text style={styles.sectionLabel}>Details</Text>
      <BuildDetails result={result} />
    </View>
  );
}

// --- 7. Name / 9. Success ------------------------------------------------------------------------

export function DetailsCard({ rows, testID }) {
  return (
    <View style={styles.card} testID={testID}>
      <Text style={styles.cardTitle}>Details</Text>
      {rows.map(r => (
        <View key={r.label} style={styles.detailRow} testID={r.testID}>
          <Text style={styles.detailIcon}>{r.icon}</Text>
          <View>
            <Text style={styles.quality}>{r.label}</Text>
            <Text style={styles.detailValue}>{r.value}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function NameView({ name, onName, details, error }) {
  return (
    <View testID="name-step">
      <Text style={styles.sectionLabel}>Name your handwriting</Text>
      <TextInput value={name} onChangeText={onName} maxLength={60} style={styles.nameInput} accessibilityLabel="Handwriting name" placeholder="My Handwriting" testID="profile-name-input" />
      {error ? (
        <Text style={[styles.problem, styles.problemError]} testID="save-error">
          {error}
        </Text>
      ) : null}
      <DetailsCard rows={details} testID="name-details" />
    </View>
  );
}

export function DoneView({ name, details, onCreateAnother, onGoToDocuments }) {
  return (
    <View style={styles.centered} testID="done-step">
      <View style={styles.bigMark}>
        <Text style={styles.bigMarkText}>✓</Text>
      </View>
      <Text style={styles.introTitle}>Handwriting Created!</Text>
      <Text style={styles.introLead} testID="build-saved">
        “{name}” has been saved successfully. You can choose it as the handwriting of any document.
      </Text>
      <DetailsCard rows={details} testID="done-details" />
      <View style={styles.doneActions}>
        <Button label="Create Another Handwriting" kind="primary" onPress={onCreateAnother} testID="create-another-button" />
        <Button label="Go to Documents" onPress={onGoToDocuments} testID="go-to-documents-button" />
      </View>
    </View>
  );
}

export const styles = StyleSheet.create({
  lead: { ...typography.body, color: colors.textMuted, marginTop: spacing.md },
  question: { ...typography.body, fontWeight: '600', marginTop: spacing.md },
  sectionLabel: { ...typography.sectionLabel, marginTop: spacing.lg },
  card: { marginTop: spacing.md, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: spacing.sm, ...shadows.card },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  cardTitle: { ...typography.body, fontWeight: '600', flexShrink: 1 },
  chip: { ...typography.caption, color: colors.textMuted, backgroundColor: colors.surfaceMuted, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radii.pill, overflow: 'hidden' },
  chipError: { color: colors.danger },
  instruction: { ...typography.caption, color: colors.textMuted },
  guideline: { ...typography.caption, color: colors.text },
  promptBox: { backgroundColor: colors.paper, borderRadius: radii.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.paperEdge, padding: spacing.sm },
  promptLabel: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.xs },
  promptText: { ...typography.body, lineHeight: 24 },
  selected: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  thumb: { width: 72, height: 96, borderRadius: radii.sm, backgroundColor: colors.surfaceMuted },
  selectedBody: { flex: 1, gap: spacing.xs },
  meta: { ...typography.caption, color: colors.text },
  quality: { ...typography.caption, color: colors.textMuted },
  problems: { gap: spacing.xs, marginTop: spacing.sm },
  problem: { ...typography.caption, color: colors.textMuted },
  problemError: { color: colors.danger },
  problemWarn: { color: WARN },
  transcription: { gap: spacing.xs },
  input: { ...typography.body, minHeight: 96, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, borderRadius: radii.sm, padding: spacing.sm, textAlignVertical: 'top', color: colors.text },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  button: { minHeight: 44, paddingHorizontal: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  buttonPrimary: { backgroundColor: colors.charcoal, borderColor: colors.charcoal },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { fontSize: 15, fontWeight: '600', color: colors.text },
  buttonTextPrimary: { color: colors.onCharcoal },
  pressed: { opacity: 0.85 },
  mark: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  markTodo: { borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: 'transparent' },
  markText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', lineHeight: 16 },
  // Intro
  intro: { alignItems: 'stretch', gap: spacing.md, marginTop: spacing.lg },
  illustration: { alignSelf: 'center', width: 180, height: 150, alignItems: 'center', justifyContent: 'center' },
  sheet: { width: 128, height: 150, backgroundColor: colors.paper, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.paperEdge, padding: spacing.md, gap: spacing.md, ...shadows.paper },
  sheetLine: { height: 6, borderRadius: 3, backgroundColor: colors.paperRule },
  pen: { position: 'absolute', right: 8, bottom: 4, fontSize: 48, color: colors.accent },
  introTitle: { ...typography.display, fontSize: 26, textAlign: 'center', marginTop: spacing.md },
  introLead: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  introSteps: { gap: spacing.sm, marginVertical: spacing.md },
  introStep: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  stepDotText: { ...typography.caption, color: colors.accent, fontWeight: '700' },
  introStepText: { ...typography.body },
  // Type
  typeCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1.5, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md, marginTop: spacing.sm, backgroundColor: colors.surface },
  typeCardOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  glyphBox: { width: 56, height: 48, borderRadius: radii.sm, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  glyph: { fontSize: 15, fontWeight: '700', color: colors.text, textAlign: 'center' },
  typeBody: { flex: 1, gap: 2 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  // Photo grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md },
  tileWrap: { width: '30%', flexGrow: 1, maxWidth: 200 },
  tile: { aspectRatio: 0.78, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  tileEmpty: { borderStyle: 'dashed', borderColor: colors.accent, backgroundColor: colors.accentSoft, gap: spacing.xs },
  tileImage: { ...StyleSheet.absoluteFillObject },
  tileLabel: { ...typography.caption, color: colors.accent, fontWeight: '600', textAlign: 'center' },
  plus: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  plusText: { color: '#FFFFFF', fontSize: 20, lineHeight: 22, fontWeight: '600' },
  badge: { position: 'absolute', left: 6, top: 6, minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.charcoal, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: colors.onCharcoal, fontSize: 12, fontWeight: '700' },
  remove: { position: 'absolute', right: -6, top: -6, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', ...shadows.card },
  removeText: { fontSize: 16, lineHeight: 18, color: colors.text, fontWeight: '600' },
  note: { marginTop: spacing.md, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.accentSoft, gap: spacing.xs },
  noteTitle: { ...typography.body, fontWeight: '600', color: colors.accent },
  noteText: { ...typography.caption, color: colors.text },
  // Progress
  centered: { alignItems: 'stretch', gap: spacing.md, marginTop: spacing.lg },
  ring: { alignSelf: 'center', width: 148, height: 148, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  ringLabel: { ...typography.caption, color: colors.textMuted },
  ringPercent: { ...typography.title, fontSize: 24 },
  stages: { gap: spacing.sm },
  stage: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stageSpinner: { width: 22, height: 22 },
  stageText: { ...typography.body },
  stageTodo: { color: colors.textMuted },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  rowThumb: { width: 44, height: 56, borderRadius: radii.sm, backgroundColor: colors.surfaceMuted },
  chevron: { ...typography.title, color: colors.textFaint, marginLeft: spacing.xs },
  // Review
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md, padding: spacing.md, borderRadius: radii.md },
  bannerGood: { backgroundColor: GOOD_SOFT },
  bannerBad: { backgroundColor: BAD_SOFT },
  bannerWarn: { backgroundColor: WARN_SOFT },
  bannerTitle: { ...typography.body, fontWeight: '600' },
  bannerText: { ...typography.caption, color: colors.text },
  reviewPhoto: { gap: spacing.xs },
  reviewDetails: { gap: spacing.xs, paddingLeft: spacing.sm, paddingBottom: spacing.sm, borderLeftWidth: 2, borderLeftColor: colors.accentSoft },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  reviewLabel: { ...typography.caption, color: colors.textMuted, flexShrink: 1 },
  reviewValue: { ...typography.caption, color: colors.text, flexShrink: 1, textAlign: 'right' },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: GOOD },
  barFillPartial: { backgroundColor: WARN },
  barCaption: { ...typography.caption, color: colors.text, textAlign: 'right' },
  // Name / done
  nameInput: { ...typography.body, marginTop: spacing.sm, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.md, padding: spacing.md, color: colors.text, backgroundColor: colors.surface },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  detailIcon: { width: 28, fontSize: 18, textAlign: 'center', color: colors.textMuted },
  detailValue: { ...typography.body, fontWeight: '600' },
  bigMark: { alignSelf: 'center', width: 96, height: 96, borderRadius: 48, backgroundColor: GOOD_SOFT, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xl },
  bigMarkText: { fontSize: 48, color: GOOD, fontWeight: '700' },
  doneActions: { gap: spacing.sm, marginTop: spacing.md },
});
