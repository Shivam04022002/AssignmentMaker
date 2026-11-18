/**
 * Create My Handwriting — the ten-screen flow (Phase 24):
 *
 *   intro → type → samples → analyzing → review → name → creating → done
 *
 * One handwriting type (English, Hindi, English + Hindi, or any of them +
 * Maths) controls the rest. Then exactly five photos of the same person's
 * handwriting, each of the page the type sets for it (copied by hand — that
 * text is what its letters are aligned to). Each photo is decoded on the
 * device and checked as soon as it is chosen (analyzeSample.js: quality,
 * writing lines, alignment to the page text, letter extraction); the
 * analysis screen shows the genuine progress of those checks, then builds
 * the profile (profileGeneration) and shows the review: what each photo
 * gave, the characters learned per script, the missing and uncertain ones.
 * There the user can correct a photo's text (what they actually wrote) and
 * have it checked again. Only a result that passes every requirement can be
 * named and saved; saving stores version 1 of a new profile
 * (profileRepository; versions are never changed afterwards).
 *
 * No text is ever read from a photo: this version has no recogniser
 * (textRecognition.js), and says so. Photos come from the image-input
 * interface (imageInput.js); on builds without the on-device image module
 * the wizard explains that choosing photos is unavailable.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenHeader from '../components/ScreenHeader';
import { AnalyzingView, Button, CoveragePlan, CreatingView, DoneView, Guidelines, IntroView, NameView, NoRecognitionNote, PhotoGrid, Problems, ReviewView, SampleCard, TypeChooser } from '../components/CreateHandwritingViews';
import { analyzeSample } from '../handwriting/learn/analyzeSample';
import { clearTemporaryImages, decodeSampleImage, isAnalysisAvailable, isImageInputAvailable, pickSampleImage, releaseImages } from '../handwriting/learn/imageInput';
import { measure, record } from '../dev/perf';
import { generatePersonalProfile } from '../handwriting/learn/profileGeneration';
import { createProfileVersion } from '../handwriting/learn/profileRepository';
import { generateProfileId } from '../handwriting/learn/profileSchema';
import { summariseBuild } from '../handwriting/learn/reviewSummary';
import { SAMPLE_SLOTS } from '../handwriting/learn/samplePrompts';
import { MIN_PHOTOS } from '../handwriting/learn/handwritingTypes';
import { isTextRecognitionAvailable } from '../handwriting/learn/textRecognition';
import {
  createSampleSet,
  discardAll,
  heldUris,
  knownTextOf,
  markAnalysis,
  moveSample,
  pageOf,
  plannedCoverage,
  removeSample,
  selectImage,
  setSlotError,
  setTextOverride,
  setType,
  slotStatus,
  summariseAnalysis,
  textOverrideProblem,
  toSampleMetadata,
  typeOf,
  validateSampleSet,
} from '../handwriting/learn/sampleSet';
import { formatDay } from '../utils/format';
import { colors, spacing, typography } from '../theme/theme';

const TITLES = {
  intro: 'Create My Handwriting',
  type: 'Choose a Handwriting Type',
  samples: 'Add Reference Photos',
  analyzing: 'Analyzing Your Photos',
  review: 'Review Result',
  name: 'Name Your Handwriting',
  creating: 'Creating Handwriting',
  done: 'Handwriting Created',
};
const DEFAULT_NAME = 'My Handwriting';

/**
 * generatePersonalProfile, never throwing into the UI: an unexpected error
 * becomes a 'failed' result the review explains, instead of a crash.
 */
export function safeGenerate(input) {
  try {
    return generatePersonalProfile(input);
  } catch (error) {
    return {
      status: 'failed',
      profile: null,
      report: { status: 'failed', requirements: [], scripts: {}, units: [], rejected: [], samples: [], params: {}, warnings: [] },
      errors: [error && error.message ? error.message : String(error)],
    };
  }
}

// --- Analysis progress (from the samples' recorded analysis states; nothing is estimated) ----------

/** The stages analyzeSample reports, in order; 'quality' ends the image checks, 'align' the text matching. */
const STAGE_ORDER = ['page', 'normalise', 'threshold', 'deskew', 'rules', 'segment', 'quality', 'align', 'extract'];
const stageIndex = a => (a && a.status === 'analysing' && a.stage ? STAGE_ORDER.indexOf(a.stage) : -1);
/** Whether a photo's analysis has passed the named stage (or finished). */
const reached = (a, name) => !!a && (a.status === 'done' || a.status === 'failed' || stageIndex(a) >= STAGE_ORDER.indexOf(name));
/** 0–1: how far one photo's analysis has come. */
function photoProgress(a) {
  if (!a) return 0;
  if (a.status === 'done' || a.status === 'failed') return 1;
  if (a.status === 'decoding') return 0.1;
  if (a.status === 'analysing') return 0.2 + ((stageIndex(a) + 1) / STAGE_ORDER.length) * 0.8;
  return 0;
}
const running = st => st.analysisStatus === 'decoding' || st.analysisStatus === 'analysing';

/** The analysis screen's rows, stages and percentage for the photos chosen. */
export function analysisProgress(statuses, built) {
  const chosen = statuses.filter(st => st.sample);
  const analyses = chosen.map(st => st.sample.analysis);
  const pending = chosen.some(st => st.fileValid && running(st));
  const allDone = chosen.length > 0 && chosen.every(st => st.qualityAnalysed);
  const state = cond => (cond ? 'done' : 'todo');
  const stages = [
    { id: 'quality', label: 'Checking image quality', state: state(chosen.length > 0 && analyses.every(a => reached(a, 'quality'))) },
    { id: 'reading', label: isTextRecognitionAvailable() ? 'Reading handwriting' : 'Matching handwriting to each page’s text', state: state(chosen.length > 0 && analyses.every(a => reached(a, 'align'))) },
    { id: 'extract', label: 'Extracting characters', state: state(allDone) },
    { id: 'style', label: 'Analyzing writing style', state: state(built) },
  ];
  const active = stages.find(s => s.state === 'todo');
  if (active && !built) active.state = 'active';
  const rows = chosen.map(st => {
    const a = st.sample.analysis;
    const text = st.analysisStatus === 'decoding' ? 'Reading the photo…' : st.analysisStatus === 'analysing' ? 'Analyzing…' : st.analysisStatus === 'done' ? (st.qualityUsable === false ? 'Not usable' : st.qualityAcceptable ? 'Checked' : 'Checked, with notes') : st.analysisStatus === 'failed' ? 'Check failed' : st.analysisStatus === 'unavailable' ? 'Cannot be analysed in this version' : 'Waiting…';
    const tone = running(st) ? 'todo' : st.analysisStatus === 'done' ? (st.qualityUsable === false ? 'bad' : st.qualityAcceptable ? 'good' : 'warn') : st.analysisStatus === 'failed' ? 'bad' : 'todo';
    return { slot: st.slot, uri: st.sample.image.uri, text, tone, progress: photoProgress(a) };
  });
  const mean = rows.length ? rows.reduce((n, r) => n + r.progress, 0) / rows.length : 0;
  return { pending, allDone, rows, stages, percent: Math.round(mean * 90 + (built ? 10 : 0)) };
}

const CREATING_STAGES = [
  { id: 'process', label: 'Processing characters' },
  { id: 'learn', label: 'Learning writing style' },
  { id: 'save', label: 'Saving your handwriting' },
  { id: 'finalize', label: 'Finalizing profile' },
];

export default function CreateHandwritingScreen({ onBack, onSaved, onGoToDocuments }) {
  const insets = useSafeAreaInsets();
  const [set, setSet] = useState(createSampleSet);
  const [step, setStep] = useState('intro');
  const [typePicked, setTypePicked] = useState(false);
  const [available, setAvailable] = useState(isImageInputAvailable);
  const [picking, setPicking] = useState(null);
  const setRef = useRef(set);
  const mounted = useRef(true);
  const tokens = useRef({});
  // Extracted letter shapes per sample (geometry only), with the revision
  // and text they belong to: a replaced photo's or corrected text's old
  // result is never used.
  const extractions = useRef({});
  const [build, setBuild] = useState(null);
  const [name, setName] = useState(DEFAULT_NAME);
  const [saving, setSaving] = useState(null);
  const [done, setDone] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [editing, setEditing] = useState(null);

  /** Applies a sample-set action and releases any temporary copies it frees. */
  const act = useCallback(fn => {
    const result = fn(setRef.current);
    setRef.current = result.set;
    setSet(result.set);
    if (result.release.length) releaseImages(result.release);
  }, []);

  // Copies left by an earlier, interrupted session are removed on entry (none
  // are in use yet); leaving the screen by any route releases this session's.
  useEffect(() => {
    clearTemporaryImages();
    return () => {
      mounted.current = false;
      releaseImages(heldUris(setRef.current));
    };
  }, []);

  /**
   * Decodes one sample and checks it. Results are tied to the sample id and
   * run number: if the photo is replaced or removed, its text corrected, or
   * the wizard closed meanwhile, the check stops at its next stage and its
   * result is dropped.
   */
  const runs = useRef({});
  const analyse = useCallback(
    async sampleId => {
      const run = (runs.current[sampleId] || 0) + 1;
      runs.current[sampleId] = run;
      const alive = () => mounted.current && !!setRef.current.samples[sampleId] && runs.current[sampleId] === run;
      const sample = setRef.current.samples[sampleId];
      if (!sample || !isAnalysisAvailable()) {
        if (sample) act(s => markAnalysis(s, sampleId, { status: 'unavailable' }));
        return;
      }
      act(s => markAnalysis(s, sampleId, { status: 'decoding' }));
      const decoded = await decodeSampleImage(sample.image.uri);
      if (!alive()) return;
      if (decoded.status !== 'decoded') {
        act(s =>
          markAnalysis(
            s,
            sampleId,
            decoded.status === 'unavailable' ? { status: 'unavailable' } : { status: 'failed', stage: 'decode', code: decoded.code, message: decoded.message, advice: decoded.advice },
          ),
        );
        return;
      }
      // Device timings for the validation screen (no-op unless the validation tools are on).
      if (decoded.info && Number.isFinite(decoded.info.decodeMillis)) record('decode photo (native)', decoded.info.decodeMillis, decoded.raster.width * decoded.raster.height);
      act(s => markAnalysis(s, sampleId, { status: 'analysing' }));
      const analysisStarted = Date.now();
      // The photo's current position, page and text (it may have been moved or corrected since it was picked).
      const entry = setRef.current.slots.find(x => x.sampleId === sampleId);
      if (!entry) return;
      const slot = entry.slot;
      const page = pageOf(setRef.current, slot);
      const current = setRef.current.samples[sampleId];
      const knownText = knownTextOf(setRef.current, slot);
      const revision = current ? current.revision : 0;
      const result = await analyzeSample(decoded.raster, {
        slot,
        knownText,
        scripts: page.scripts,
        sampleId,
        revision,
        shouldCancel: () => !alive(),
        onStage: stage => {
          if (alive()) act(s => markAnalysis(s, sampleId, { status: 'analysing', stage }));
        },
        extract: true,
        source: decoded.info ? { width: decoded.info.sourceWidth, height: decoded.info.sourceHeight } : null,
      });
      if (!alive() || result.status === 'cancelled') return;
      record('analyse sample', Date.now() - analysisStarted, decoded.raster.width * decoded.raster.height);
      if (result.status === 'failed') {
        act(s =>
          markAnalysis(s, sampleId, {
            status: 'failed',
            stage: 'analyse',
            code: 'analysis-failed',
            message: 'This photo could not be checked.',
            advice: 'Try “Check again”, or choose another photo.',
          }),
        );
        return;
      }
      extractions.current[sampleId] = { revision, knownText, extraction: result.extraction || null, quality: result.quality.score, rules: { spacing: result.rules.spacing } };
      act(s => markAnalysis(s, sampleId, summariseAnalysis(result, decoded.info)));
    },
    [act],
  );

  const pick = useCallback(
    async slot => {
      const token = (tokens.current[slot] || 0) + 1;
      tokens.current[slot] = token;
      setPicking(slot);
      act(s => setSlotError(s, slot, null));
      const result = await pickSampleImage();
      if (!mounted.current || tokens.current[slot] !== token) {
        // The wizard was left (or this pick superseded) meanwhile.
        if (result.status === 'picked') releaseImages([result.image.uri]);
        return;
      }
      setPicking(null);
      if (result.status === 'picked') {
        act(s => selectImage(s, slot, result.image));
        const entry = setRef.current.slots.find(x => x.slot === slot);
        const added = entry && setRef.current.samples[entry.sampleId];
        if (added && added.file.valid) analyse(added.id, slot);
      } else if (result.status === 'unavailable') setAvailable(false);
      else if (result.status === 'error') act(s => setSlotError(s, slot, { message: result.message, advice: result.advice }));
    },
    [act, analyse],
  );

  // A photo's text changed (its type and so its page, or a correction): check it again against the new text.
  const retext = useRef({});
  const reanalyse = useCallback(
    (slot, delay) => {
      const entry = setRef.current.slots.find(x => x.slot === slot);
      const sample = entry && entry.sampleId ? setRef.current.samples[entry.sampleId] : null;
      // Only where this build can analyse photos (otherwise there is nothing to redo).
      if (!sample || !sample.file.valid || !isAnalysisAvailable()) return;
      clearTimeout(retext.current[sample.id]);
      act(s => markAnalysis(s, sample.id, { status: 'analysing' }));
      retext.current[sample.id] = setTimeout(() => analyse(sample.id), delay);
    },
    [act, analyse],
  );
  useEffect(() => () => Object.values(retext.current).forEach(clearTimeout), []);
  const chooseType = useCallback(
    typeId => {
      const before = setRef.current.slots.map(e => e.page);
      act(s => setType(s, typeId));
      setRef.current.slots.forEach((e, i) => {
        if (e.sampleId && e.page !== before[i]) reanalyse(e.slot, 0);
      });
      setTypePicked(true);
    },
    [act, reanalyse],
  );

  // --- Building (the review) and saving ---------------------------------------------------------

  /** The samples with their current extraction (null when not analysed for this photo and text). */
  const samplesForBuild = useCallback(
    () =>
      toSampleMetadata(setRef.current).map(metadata => {
        const st = slotStatus(setRef.current, metadata.slot);
        const e = st.sample ? extractions.current[st.sample.id] : null;
        const knownText = knownTextOf(setRef.current, metadata.slot);
        const current = e && e.revision === st.sample.revision && e.knownText === knownText ? e : null;
        return { metadata, extraction: current ? current.extraction : null, quality: current ? current.quality : null, rules: current ? current.rules : null };
      }),
    [],
  );
  const buildProfile = useCallback(() => {
    const id = generateProfileId();
    const now = Date.now();
    const samples = samplesForBuild();
    const type = typeOf(setRef.current);
    const spec = { scripts: type.scripts, maths: type.maths, handwritingType: type.id };
    const result = measure('build profile', () => safeGenerate({ id, name: DEFAULT_NAME, now, samples, ...spec }), samples.length);
    setBuild({ id, now, samples, spec, type, result, summary: summariseBuild(result, type) });
    setSaving(null);
    setExpanded(null);
    setEditing(null);
    setStep('review');
  }, [samplesForBuild]);

  const statuses = SAMPLE_SLOTS.map(info => slotStatus(set, info.slot));
  const plan = plannedCoverage(set);
  const check = validateSampleSet(set);
  const chosen = statuses.filter(st => st.sample);
  /** A photo the pipeline can use: valid, checked, and not found unusable. */
  const ready = st => !!(st.sample && st.fileValid) && !running(st) && !(st.analysisFailed && !st.decoded) && st.qualityUsable !== false;
  const progress = analysisProgress(statuses, !!build);
  // Everything checked: five usable photos, no check running, none failed or unusable.
  const buildable = check.ready && chosen.length >= MIN_PHOTOS && chosen.every(st => st.qualityAnalysed && ready(st));
  // "Analyze Photos": five valid, distinct photos (checks may still be running — the next screen waits for them).
  const canAnalyse = available && isAnalysisAvailable() && check.selected >= MIN_PHOTOS && !check.problems.some(p => p.severity === 'error' && p.code !== 'analysis-pending');

  // The analysis screen: wait for every photo's check, then build once; stop on anything that needs attention.
  const buildTimer = useRef(null);
  useEffect(() => {
    if (step !== 'analyzing' || build || progress.pending || !buildable || buildTimer.current) return;
    buildTimer.current = setTimeout(() => {
      buildTimer.current = null;
      if (mounted.current) buildProfile();
    }, 0);
  }, [step, build, progress.pending, buildable, buildProfile]);
  useEffect(
    () => () => {
      clearTimeout(buildTimer.current);
      buildTimer.current = null;
    },
    [step],
  );
  const attention = step === 'analyzing' && !progress.pending && !buildable;

  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  const save = async () => {
    const clean = name.trim();
    if (!build || build.result.status !== 'created' || !clean) return;
    const fail = message => {
      if (!mounted.current) return;
      setSaving({ status: 'error', message });
      setStep('name');
    };
    setSaving({ status: 'saving', stage: 'process' });
    setStep('creating');
    await tick();
    // The same evidence, id and time with the chosen name: the version saved is what was shown.
    let final = safeGenerate({ id: build.id, name: clean, now: build.now, samples: build.samples, ...build.spec });
    if (!mounted.current) return;
    setSaving({ status: 'saving', stage: 'learn' });
    await tick();
    if (final.status !== 'created') {
      fail('Your handwriting could not be built from these photos. Please check them again.');
      return;
    }
    setSaving({ status: 'saving', stage: 'save' });
    await tick();
    const saveStarted = Date.now();
    let id = build.id;
    let stored;
    try {
      stored = await createProfileVersion(final.profile);
      if (stored.status === 'version-exists') {
        // An earlier attempt was interrupted after writing a different record under this id
        // (e.g. the name changed before retrying). That record is never overwritten: this
        // handwriting is saved under a new id instead, and the unlisted record is left alone.
        id = generateProfileId();
        final = safeGenerate({ id, name: clean, now: build.now, samples: build.samples, ...build.spec });
        stored = final.status === 'created' ? await createProfileVersion(final.profile) : { status: 'invalid' };
      }
    } catch (error) {
      stored = { status: 'storage-error' }; // e.g. the device storage is full: the save can be retried
    }
    if (!mounted.current) return;
    if (stored.status !== 'ok') {
      fail(stored.status === 'unreadable-index' ? 'Your saved handwritings could not be read, so nothing was changed. Your photos are still here.' : 'Your handwriting could not be saved. Please try again.');
      return;
    }
    record('save profile version', Date.now() - saveStarted);
    setSaving({ status: 'saving', stage: 'finalize' });
    await tick();
    if (!mounted.current) return;
    setBuild(b => (b ? { ...b, id } : b));
    setDone({ name: clean, type: build.type, photos: build.samples.length, createdAt: build.now, version: final.profile.version, ref: stored.ref });
    setSaving({ status: 'saved', ref: stored.ref });
    act(discardAll);
    setStep('done');
    if (onSaved) onSaved(stored.ref);
  };
  const createAnother = () => {
    extractions.current = {};
    setBuild(null);
    setSaving(null);
    setDone(null);
    setName(DEFAULT_NAME);
    setTypePicked(false);
    setStep('type');
  };
  const goToDocuments = () => (onGoToDocuments ? onGoToDocuments() : onBack());

  // --- Corrections on the review ----------------------------------------------------------------

  const applyEdit = () => {
    if (!editing) return;
    const problem = textOverrideProblem(setRef.current, editing.text);
    if (problem) {
      setEditing(e => (e ? { ...e, problem } : e));
      return;
    }
    const slot = editing.slot;
    act(s => setTextOverride(s, slot, editing.text));
    setEditing(null);
    setBuild(null);
    reanalyse(slot, 0);
    setStep('analyzing');
  };

  // --- Leaving --------------------------------------------------------------------------------

  const leave = useCallback(() => {
    if (step === 'creating') return true; // nothing to go back to while saving
    if (step === 'done') {
      goToDocuments();
      return true;
    }
    const back = { name: 'review', review: 'samples', analyzing: 'samples', type: 'intro' };
    if (back[step]) {
      setStep(back[step]);
      return true;
    }
    if (step === 'samples' && !heldUris(setRef.current).length) {
      setStep('type');
      return true;
    }
    if (!heldUris(setRef.current).length) {
      onBack();
      return true;
    }
    Alert.alert('Discard these photos?', 'The photos you chose will be removed from this screen. Your original photos are not deleted.', [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          act(discardAll);
          onBack();
        },
      },
    ]);
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act, onBack, onGoToDocuments, step]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', leave);
    return () => sub.remove();
  }, [leave]);

  // --- Views ----------------------------------------------------------------------------------

  const typeTitle = build ? build.type.title : typeOf(set).title;
  const detailRows = info => [
    { icon: '▤', label: 'Type', value: info.type.title, testID: 'details-type' },
    { icon: '▣', label: 'Photos used', value: String(info.photos), testID: 'details-photos' },
    { icon: '▦', label: 'Created on', value: formatDay(info.createdAt), testID: 'details-created' },
    ...(info.version ? [{ icon: '◍', label: 'Version', value: `v${info.version}`, testID: 'details-version' }] : []),
  ];
  const reviewPhotos = build
    ? chosen.map(st => {
        const c = (build.result.report.samples || []).find(x => x.slot === st.slot) || null;
        const issues = st.qualityAnalysed ? st.sample.analysis.quality.issues.length : 0;
        const tone = st.qualityUsable === false ? 'bad' : c && c.used > 0 && !issues ? 'good' : 'warn';
        const verdict = st.qualityUsable === false ? 'Not usable' : c ? `${c.used} of ${c.considered} letters used${issues ? ' · check notes' : ''}` : 'No letters could be used';
        const knownText = knownTextOf(set, st.slot);
        return { slot: st.slot, uri: st.sample.image.uri, status: st, page: pageOf(set, st.slot), knownText, corrected: knownText !== pageOf(set, st.slot).text, contribution: c, tone, verdict };
      })
    : [];

  let body;
  if (step === 'intro') body = <IntroView onStart={() => setStep('type')} />;
  else if (step === 'type') {
    body = (
      <>
        <TypeChooser value={typePicked ? set.type : null} onChoose={chooseType} />
        <View style={styles.inlineFooter}>
          <Button label="Continue" kind="primary" disabled={!typePicked} onPress={() => setStep('samples')} testID="type-continue" />
        </View>
      </>
    );
  } else if (step === 'samples') {
    body = (
      <>
        <View style={styles.infoBanner}>
          <Text style={styles.infoTitle}>Add {MIN_PHOTOS} reference photos</Text>
          <Text style={styles.infoText}>Take {MIN_PHOTOS} clear photos of your own handwriting (same person) on different pages. Your photos stay on this device.</Text>
        </View>
        <View style={styles.typeRow}>
          <Text style={styles.cardTitle} testID="chosen-type">
            Handwriting type: {typeOf(set).title}
          </Text>
          <Button label="Change type" onPress={() => setStep('type')} testID="change-type" />
        </View>
        <PhotoGrid statuses={statuses} available={available} picking={picking} onPick={pick} onRemove={slot => act(s => removeSample(s, slot))} />
        <Text style={styles.progress} testID="sample-progress">
          {check.selected} of {MIN_PHOTOS} photos added
        </Text>
        {!available ? (
          <View style={styles.infoBanner} testID="image-input-unavailable">
            <Text style={styles.infoTitle}>Choosing photos isn’t available in this version yet</Text>
            <Text style={styles.infoText}>You can read what each photo needs and prepare your pages. Photo selection arrives with the on-device image module.</Text>
          </View>
        ) : null}
        <Guidelines />
        <NoRecognitionNote />
        <CoveragePlan plan={plan} />
        <Text style={styles.sectionLabel}>What each photo must show</Text>
        {SAMPLE_SLOTS.map((info, i) => (
          <SampleCard
            key={info.slot}
            info={info}
            page={pageOf(set, info.slot)}
            knownText={knownTextOf(set, info.slot)}
            status={statuses[i]}
            onRemove={() => act(s => removeSample(s, info.slot))}
            onMove={d => act(s => moveSample(s, info.slot, info.slot + d))}
            onRecheck={() => statuses[i].sample && analyse(statuses[i].sample.id)}
          />
        ))}
        <Problems list={check.problems} testID="photo-problems" />
      </>
    );
  } else if (step === 'analyzing') {
    const problems = attention ? [...check.problems.filter(p => p.code !== 'analysis-pending'), ...chosen.filter(st => st.analysisStatus === 'unavailable').map(st => ({ code: 'unavailable', severity: 'error', message: `Photo ${st.slot} cannot be analysed in this version.`, advice: '' }))] : [];
    body = <AnalyzingView percent={progress.percent} rows={progress.rows} stages={progress.stages} attention={attention} problems={problems} onBackToPhotos={() => setStep('samples')} />;
  } else if (step === 'review' && build) {
    body = (
      <ReviewView
        summary={build.summary}
        result={build.result}
        photos={reviewPhotos}
        expanded={expanded}
        onToggle={slot => setExpanded(x => (x === slot ? null : slot))}
        editing={editing}
        onEdit={slot => setEditing({ slot, text: knownTextOf(setRef.current, slot), problem: null })}
        onEditText={text => setEditing(e => (e ? { ...e, text, problem: null } : e))}
        onApplyEdit={applyEdit}
        onCancelEdit={() => setEditing(null)}
        recognition={isTextRecognitionAvailable()}
      />
    );
  } else if (step === 'name' && build) {
    body = <NameView name={name} onName={setName} details={detailRows({ type: build.type, photos: build.samples.length, createdAt: build.now })} error={saving && saving.status === 'error' ? saving.message : null} />;
  } else if (step === 'creating') {
    const at = CREATING_STAGES.findIndex(s => s.id === (saving && saving.stage));
    body = <CreatingView stages={CREATING_STAGES.map((s, i) => ({ ...s, state: i < at ? 'done' : i === at ? 'active' : 'todo' }))} />;
  } else if (step === 'done' && done) {
    body = <DoneView name={done.name} details={detailRows(done)} onCreateAnother={createAnother} onGoToDocuments={goToDocuments} />;
  } else {
    // A step without its data (e.g. review after the build was cleared): back to the photos.
    body = <Text style={styles.lead}>Loading…</Text>;
    if (step !== 'samples') setTimeout(() => mounted.current && setStep('samples'), 0);
  }

  const footer =
    step === 'samples' ? (
      <>
        {!available || !isAnalysisAvailable() ? (
          <Text style={styles.footerNote} testID="analysis-unavailable-note">
            {!available ? 'Choosing photos is not available in this version yet.' : 'Handwriting analysis is not available in this version yet.'}
          </Text>
        ) : null}
        <Button label="Analyze Photos" kind="primary" onPress={() => setStep('analyzing')} disabled={!canAnalyse} testID="analyze-photos-button" />
      </>
    ) : step === 'review' && build ? (
      <>
        <Button label="Continue" kind="primary" onPress={() => setStep('name')} disabled={build.result.status !== 'created'} testID="review-continue" />
        <Button label="Back to photos" onPress={() => setStep('samples')} testID="back-to-samples-button" />
      </>
    ) : step === 'name' && build ? (
      <Button label="Save Handwriting" kind="primary" onPress={save} disabled={!name.trim() || build.result.status !== 'created'} testID="save-handwriting-button" />
    ) : null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]} testID="create-handwriting-screen">
      <ScreenHeader onBack={leave}>
        <Text style={styles.title}>{step === 'done' ? '' : TITLES[step]}</Text>
      </ScreenHeader>
      <ScrollView style={styles.list} contentContainerStyle={[styles.content, !footer && { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled" testID={`${step}-scroll`}>
        {body}
      </ScrollView>
      {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>{footer}</View> : null}
      {/* Keeps the type's title around for the header of later steps. */}
      {step === 'creating' ? <Text style={styles.hidden}>{typeTitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  title: { ...typography.title },
  list: { flex: 1 },
  content: { paddingHorizontal: spacing.lg + 4, paddingBottom: spacing.xl, width: '100%', maxWidth: 640, alignSelf: 'center' },
  lead: { ...typography.body, color: colors.textMuted, marginTop: spacing.md },
  sectionLabel: { ...typography.sectionLabel, marginTop: spacing.lg },
  progress: { ...typography.caption, color: colors.textMuted, marginTop: spacing.sm },
  cardTitle: { ...typography.body, fontWeight: '600', flexShrink: 1 },
  typeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.md },
  infoBanner: { marginTop: spacing.md, padding: spacing.md, borderRadius: 12, backgroundColor: colors.accentSoft, gap: spacing.xs },
  infoTitle: { ...typography.body, fontWeight: '600', color: colors.accent },
  infoText: { ...typography.caption, color: colors.text },
  inlineFooter: { marginTop: spacing.lg, gap: spacing.sm },
  footer: { paddingHorizontal: spacing.lg + 4, paddingTop: spacing.md, gap: spacing.sm, backgroundColor: colors.background, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  footerNote: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  hidden: { height: 0, opacity: 0 },
});
