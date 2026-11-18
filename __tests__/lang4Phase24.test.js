/**
 * Lang4 Phase 24 — the ten-screen handwriting-profile flow.
 *
 * Intro → type → five reference photos (a grid) → analysis with genuine
 * progress → review (coverage per script, missing and uncertain characters,
 * per-photo checks, text corrections) → name → creating → success → My
 * Handwritings. No text is read from a photo: the recogniser seam
 * (textRecognition.js) reports 'unavailable', every photo keeps its page,
 * and the wizard says so.
 *
 * Photos are SYNTHETIC pages through a fake picker: this checks the flow
 * and the safeguards, not real-handwriting accuracy.
 */
import React from 'react';
import { clearAllMockStorages } from '@react-native-async-storage/async-storage';
import { HANDWRITING_TYPES, MAX_PHOTOS, MIN_PHOTOS } from '../src/handwriting/learn/handwritingTypes';
import { setImageInput } from '../src/handwriting/learn/imageInput';
import { clearPersonalCache } from '../src/handwriting/learn/personalStore';
import { REQUIRED_SETS } from '../src/handwriting/learn/profileGeneration';
import { createProfileVersion, listProfiles, readProfileVersion } from '../src/handwriting/learn/profileRepository';
import { parseProfileRef } from '../src/handwriting/learn/profileSchema';
import { summariseBuild } from '../src/handwriting/learn/reviewSummary';
import { ENGLISH_EVERYDAY, ENGLISH_WORDS, LATIN_ALPHABET, LATIN_DIGITS_TEXT, SAMPLE_SLOTS } from '../src/handwriting/learn/samplePrompts';
import { createSampleSet, knownTextOf, moveSample, pageOf, selectImage, setTextOverride, slotStatus, textOverrideProblem, toSampleMetadata } from '../src/handwriting/learn/sampleSet';
import { isTextRecognitionAvailable, recognizeText, setTextRecognizer, textRecognitionEngine } from '../src/handwriting/learn/textRecognition';
import { PERSONAL_HANDWRITING_ONBOARDING, VALIDATION_TOOLS } from '../src/dev/flags';
import CreateHandwritingScreen, { analysisProgress } from '../src/screens/CreateHandwritingScreen';
import ProfilesScreen, { metaLine } from '../src/screens/ProfilesScreen';
import { setStorageBackend } from '../src/storage/documentStorage';
import { formatDay } from '../src/utils/format';
import { act, byTestId, changeText, press, queryByTestId, render } from './helpers/render';
import { toBase64 } from './helpers/syntheticRaster';
import { syntheticTextPage } from './helpers/syntheticText';
import { chooseType } from './helpers/wizard';

jest.setTimeout(900000);

beforeEach(() => {
  clearAllMockStorages();
  setStorageBackend(null);
  clearPersonalCache();
});
afterEach(() => {
  setImageInput(null);
  setTextRecognizer(null);
});

const flatText = c => (Array.isArray(c) ? c.map(flatText).join('') : typeof c === 'string' || typeof c === 'number' ? String(c) : '');
const textOf = node => node.findAll(n => n.type === 'Text').map(n => flatText(n.props.children)).join(' ');
const text = (r, id) => textOf(byTestId(r, id));
const disabled = (r, id) => byTestId(r, id, 'accessibilityState').props.accessibilityState.disabled;
const flush = (n = 1) =>
  act(async () => {
    for (let i = 0; i < n; i++) await new Promise(res => setTimeout(res, 0));
  });
async function waitFor(check, limit = 4000) {
  for (let i = 0; i < limit; i++) {
    if (check()) return;
    await flush(1);
  }
  throw new Error('condition not reached');
}

const file = (n, extra = {}) => ({ uri: `file:///cache/handwrite-samples/p${n}.jpg`, mime: 'image/jpeg', width: 3000, height: 4000, bytes: 2400000 + n, ...extra });
let seq = 0;
function photo(textOnPage) {
  seq++;
  const lines = textOnPage.split('\n').length;
  const { raster } = syntheticTextPage(textOnPage, { width: 1400, xHeight: 26, stroke: 3, top: 104, lineGap: 104, marginX: 50, height: 104 * (lines + 1) + 40, jitter: 0.04, marksApart: true });
  return { raster, picked: { uri: `file:///cache/handwrite-samples/t${seq}.png`, mime: 'image/png', width: 3000, height: 4000, bytes: 3000000 + seq, orientation: 1 } };
}
function fakeNativeInput(pages) {
  const queue = [...pages];
  const input = {
    released: [],
    pickImage: jest.fn(async () => (queue.length ? queue.shift().picked : null)),
    decodeForAnalysis: jest.fn(async uri => {
      const p = pages.find(x => x.picked.uri === uri);
      return { width: p.raster.width, height: p.raster.height, encoding: 'gray8-base64', data: toBase64(p.raster.data), sourceWidth: p.raster.width * 2, sourceHeight: p.raster.height * 2, orientation: 1, orientationApplied: true, decodeMillis: 5 };
    }),
    releaseImage: jest.fn(async uri => {
      input.released.push(uri);
    }),
    clearTemporaryImages: jest.fn(async () => 0),
  };
  return input;
}
/** A picker that cannot decode pixels (no analysis on this build). */
const pickerOnly = () => ({ pickImage: jest.fn(async () => null), releaseImage: jest.fn(), clearTemporaryImages: jest.fn(async () => 0) });
const checked = (r, slot) => queryByTestId(r, `sample-quality-${slot}`) && /checked|failed/.test(text(r, `sample-quality-${slot}`));
const ENGLISH_PAGES = [LATIN_ALPHABET, ENGLISH_WORDS, LATIN_DIGITS_TEXT, ENGLISH_EVERYDAY, LATIN_ALPHABET];
async function pickAll(r, slots = [1, 2, 3, 4, 5]) {
  for (const n of slots) await press(r, `sample-pick-${n}`);
  await waitFor(() => slots.every(n => checked(r, n)));
}
async function toReview(r) {
  await press(r, 'analyze-photos-button');
  await waitFor(() => queryByTestId(r, 'review-step'));
}

// --- Screens 2–4: intro, type, photos ---------------------------------------------------------------

describe('introduction, type and reference photos', () => {
  it('starts with the introduction; the type list shows each type with its glyph and description', async () => {
    setImageInput(pickerOnly());
    const r = await render(<CreateHandwritingScreen onBack={jest.fn()} />);
    expect(queryByTestId(r, 'intro-step')).toBe(true);
    expect(text(r, 'intro-step')).toMatch(/Create Your Handwriting Profile/);
    expect(text(r, 'intro-step')).toMatch(/Add 5 reference photos/);
    await press(r, 'intro-start');
    expect(queryByTestId(r, 'type-step')).toBe(true);
    expect(disabled(r, 'type-continue')).toBe(true);
    for (const t of HANDWRITING_TYPES) {
      const card = text(r, `type-${t.id}`);
      expect(card).toContain(t.glyph);
      expect(card).toContain(t.title);
      expect(card).toContain(t.subtitle);
    }
    await press(r, 'type-english');
    expect(disabled(r, 'type-continue')).toBe(false);
    await press(r, 'type-continue');
    expect(queryByTestId(r, 'photo-grid')).toBe(true);
    expect(text(r, 'chosen-type')).toBe('Handwriting type: English');
  });

  it('exactly five photos, in a grid: add, replace, remove (releasing the copy); Analyze Photos waits for all five', async () => {
    const input = fakeNativeInput([photo(LATIN_ALPHABET), photo(ENGLISH_WORDS), photo(LATIN_DIGITS_TEXT), photo(ENGLISH_EVERYDAY), photo(LATIN_ALPHABET), photo(ENGLISH_WORDS)]);
    setImageInput(input);
    const r = await render(<CreateHandwritingScreen onBack={jest.fn()} />);
    await chooseType(r, 'english');
    expect([MIN_PHOTOS, MAX_PHOTOS]).toEqual([5, 5]);
    expect(SAMPLE_SLOTS.map(s => queryByTestId(r, `sample-pick-${s.slot}`))).toEqual([true, true, true, true, true]);
    expect(queryByTestId(r, 'photo-guidelines')).toBe(true);
    expect(text(r, 'no-ocr-note')).toMatch(/cannot read handwriting from a photo/);
    expect(text(r, 'sample-progress')).toBe('0 of 5 photos added');
    expect(disabled(r, 'analyze-photos-button')).toBe(true);
    await pickAll(r, [1, 2, 3, 4]);
    expect(text(r, 'sample-progress')).toBe('4 of 5 photos added');
    expect(disabled(r, 'analyze-photos-button')).toBe(true);
    expect(text(r, 'photo-problems')).toMatch(/Add all 5 photos \(4 added so far\)/);
    await pickAll(r, [5]);
    expect(text(r, 'sample-progress')).toBe('5 of 5 photos added');
    expect(disabled(r, 'analyze-photos-button')).toBe(false);
    // Remove from the tile: the copy is released and the position is empty again.
    await press(r, 'sample-tile-remove-5');
    expect(text(r, 'sample-progress')).toBe('4 of 5 photos added');
    expect(input.released).toHaveLength(1);
    expect(disabled(r, 'analyze-photos-button')).toBe(true);
    // Replace a photo by tapping its tile: the old copy is released too.
    await pickAll(r, [2]);
    expect(input.released).toHaveLength(2);
    expect(text(r, 'sample-title-2')).toBe('Photo 2 · English words and sentences');
  });

  it('without pixel decoding: photos can be chosen, nothing is analysed, and analysis is not offered', async () => {
    setImageInput({ ...pickerOnly(), pickImage: jest.fn(async () => file(1)) });
    const r = await render(<CreateHandwritingScreen onBack={jest.fn()} />);
    await chooseType(r, 'english');
    await press(r, 'sample-pick-1');
    expect(text(r, 'sample-quality-1')).toBe('Image quality: not checked yet');
    expect(text(r, 'analysis-unavailable-note')).toMatch(/Handwriting analysis is not available/);
    expect(disabled(r, 'analyze-photos-button')).toBe(true);
  });
});

// --- Screen 5: genuine analysis progress ------------------------------------------------------------

describe('analysis progress', () => {
  const status = (slot, analysis) => ({ slot, sample: analysis ? { image: { uri: `u${slot}` }, analysis } : null, fileValid: !!analysis, analysisStatus: analysis ? analysis.status : null, qualityAnalysed: !!analysis && analysis.status === 'done', qualityUsable: analysis && analysis.status === 'done' ? analysis.quality.usable : null, qualityAcceptable: analysis && analysis.status === 'done' ? analysis.quality.usable && !analysis.quality.issues.length : null, decoded: !!analysis && analysis.status !== 'decoding' });
  const done = { status: 'done', quality: { usable: true, issues: [] } };

  it('follows the recorded stages of each photo; nothing is counted before it happened', () => {
    const empty = analysisProgress([status(1, null), status(2, null)], false);
    expect(empty).toMatchObject({ pending: false, allDone: false, percent: 0, rows: [] });
    expect(empty.stages.map(s => s.state)).toEqual(['active', 'todo', 'todo', 'todo']);

    const early = analysisProgress([status(1, { status: 'decoding' }), status(2, { status: 'analysing', stage: 'deskew' })], false);
    expect(early.pending).toBe(true);
    expect(early.stages.map(s => [s.id, s.state])).toEqual([['quality', 'active'], ['reading', 'todo'], ['extract', 'todo'], ['style', 'todo']]);
    expect(early.percent).toBeGreaterThan(0);
    expect(early.percent).toBeLessThan(50);
    expect(early.rows.map(r => r.text)).toEqual(['Reading the photo…', 'Analyzing…']);

    const matching = analysisProgress([status(1, { status: 'analysing', stage: 'quality' }), status(2, { status: 'analysing', stage: 'align' })], false);
    expect(matching.stages.map(s => s.state)).toEqual(['done', 'active', 'todo', 'todo']);
    expect(matching.stages[1].label).toBe('Matching handwriting to each page’s text'); // no recogniser: no "reading"

    const finished = analysisProgress([status(1, done), status(2, done)], false);
    expect(finished).toMatchObject({ pending: false, allDone: true, percent: 90 });
    expect(finished.stages.map(s => s.state)).toEqual(['done', 'done', 'done', 'active']);
    expect(finished.rows.map(r => [r.text, r.tone])).toEqual([['Checked', 'good'], ['Checked', 'good']]);

    const built = analysisProgress([status(1, done), status(2, done)], true);
    expect(built.percent).toBe(100);
    expect(built.stages.every(s => s.state === 'done')).toBe(true);
  });

  it('names a failed or unusable photo instead of hiding it', () => {
    const p = analysisProgress([status(1, { status: 'failed', stage: 'decode' }), status(2, { status: 'done', quality: { usable: false, issues: [{ code: 'too-little-writing' }] } })], false);
    expect(p.rows.map(r => [r.text, r.tone])).toEqual([['Check failed', 'bad'], ['Not usable', 'bad']]);
    expect(p.pending).toBe(false);
  });
});

// --- Screens 6–10: review, name, create, success, list ----------------------------------------------

describe('review, name, create, success', () => {
  it('English from five photos: analysis → review with coverage per set → name → creating → success → My Handwritings', async () => {
    setImageInput(fakeNativeInput(ENGLISH_PAGES.map(photo)));
    const onSaved = jest.fn();
    const onGoToDocuments = jest.fn();
    const r = await render(<CreateHandwritingScreen onBack={jest.fn()} onSaved={onSaved} onGoToDocuments={onGoToDocuments} />);
    await chooseType(r, 'english');
    for (const n of [1, 2, 3, 4, 5]) await press(r, `sample-pick-${n}`);
    // "Analyze Photos" may be pressed while checks still run: the analysis screen waits for them.
    await press(r, 'analyze-photos-button');
    expect(queryByTestId(r, 'analyzing-step') || queryByTestId(r, 'review-step')).toBe(true);
    await waitFor(() => queryByTestId(r, 'review-step'));

    // Review: the banner, photos used, coverage per set of the type's script, details.
    expect(text(r, 'review-banner-title')).toBe('Good coverage');
    expect(text(r, 'review-lead')).toMatch(/does not read text from photos/);
    expect(queryByTestId(r, 'review-coverage-Latn')).toBe(true);
    expect(queryByTestId(r, 'review-coverage-Deva')).toBe(false);
    expect(queryByTestId(r, 'review-coverage-Math')).toBe(false);
    expect(text(r, 'review-coverage-total-Latn')).toMatch(/^\d+ of 52 \(\d+%\)$/);
    expect(text(r, 'review-row-Latn-latinUpper')).toMatch(/Uppercase letters \d+ \/ 26/);
    expect(text(r, 'review-row-Latn-latinLower')).toMatch(/Lowercase letters \d+ \/ 26/);
    expect(text(r, 'review-row-Latn-latinExtra-digits')).toMatch(/Numbers \(optional\) \d+ \/ 10/);
    expect(text(r, 'review-row-Latn-latinExtra-punctuation')).toMatch(/Punctuation \(optional\) \d+ \/ \d+/);
    expect(text(r, 'build-status')).toBe('Your handwriting is ready to save.');
    // A photo's own checks and the text it was matched to.
    expect(queryByTestId(r, 'review-slot-3')).toBe(false);
    await press(r, 'review-photo-3');
    expect(text(r, 'review-slot-3')).toMatch(/Image quality Checked · score 0\.\d+/);
    expect(text(r, 'review-slot-3')).toMatch(/Writing region \d+ lines/);
    expect(text(r, 'review-text-3')).toBe(LATIN_DIGITS_TEXT);
    expect(disabled(r, 'review-continue')).toBe(false);

    // Name, with the details the profile is saved with.
    await press(r, 'review-continue');
    expect(queryByTestId(r, 'name-step')).toBe(true);
    expect(text(r, 'details-type')).toMatch(/Type English/);
    expect(text(r, 'details-photos')).toMatch(/Photos used 5/);
    expect(text(r, 'details-created')).toMatch(new RegExp(`Created on ${formatDay(Date.now()).replace(/ /g, ' ')}`));
    await changeText(r, 'profile-name-input', '   ');
    expect(disabled(r, 'save-handwriting-button')).toBe(true);
    await changeText(r, 'profile-name-input', 'My English Handwriting');
    expect(disabled(r, 'save-handwriting-button')).toBe(false);

    // Creating, then the success screen with its details.
    await press(r, 'save-handwriting-button');
    await waitFor(() => queryByTestId(r, 'done-step'));
    expect(onSaved).toHaveBeenCalledTimes(1);
    const ref = onSaved.mock.calls[0][0];
    expect(parseProfileRef(ref).version).toBe(1);
    expect(text(r, 'build-saved')).toMatch(/“My English Handwriting” has been saved successfully/);
    expect(text(r, 'details-type')).toMatch(/Type English/);
    expect(text(r, 'details-photos')).toMatch(/Photos used 5/);
    expect(text(r, 'details-version')).toMatch(/Version v1/);
    const profile = (await readProfileVersion(parseProfileRef(ref).id, 1)).profile;
    expect(profile).toMatchObject({ name: 'My English Handwriting', handwritingType: 'english', scripts: ['Latn'], version: 1 });
    expect(profile.sources.map(s => s.slot)).toEqual([1, 2, 3, 4, 5]);
    expect(JSON.stringify(profile)).not.toMatch(/file:\/\/|base64/);

    // My Handwritings lists it with its type, version and date; search narrows the list.
    const list = await render(<ProfilesScreen onBack={jest.fn()} />);
    await waitFor(() => queryByTestId(list, `profile-card-${profile.id}`));
    expect(text(list, `profile-meta-${profile.id}`)).toBe(`English · v1 · ${formatDay(profile.profileCreatedAt)}`);
    expect(text(list, `profile-status-${profile.id}`)).toBe('Ready to use');
    await changeText(list, 'profiles-search', 'hindi');
    expect(queryByTestId(list, 'profiles-no-match')).toBe(true);
    await changeText(list, 'profiles-search', 'ENGLISH');
    expect(queryByTestId(list, `profile-card-${profile.id}`)).toBe(true);

    // Go to Documents leaves; Create Another starts over at the type.
    await press(r, 'go-to-documents-button');
    expect(onGoToDocuments).toHaveBeenCalledTimes(1);
    await press(r, 'create-another-button');
    expect(queryByTestId(r, 'type-step')).toBe(true);
    expect(disabled(r, 'type-continue')).toBe(true);
  });

  it('a photo whose text differs from its page can be corrected on the review, and is checked again against the correction', async () => {
    // Photo 4 must show "Everyday English"; this one shows the English words page instead.
    setImageInput(fakeNativeInput([photo(LATIN_ALPHABET), photo(ENGLISH_WORDS), photo(LATIN_DIGITS_TEXT), photo(ENGLISH_WORDS), photo(LATIN_ALPHABET)]));
    const r = await render(<CreateHandwritingScreen onBack={jest.fn()} onSaved={jest.fn()} />);
    await chooseType(r, 'english');
    await pickAll(r);
    await toReview(r);
    const used = () => Number(/(\d+) of \d+ letters used/.exec(text(r, 'contribution-4'))[1]);
    const before = used();
    await press(r, 'review-photo-4');
    expect(text(r, 'review-text-4')).toBe(ENGLISH_EVERYDAY);
    await press(r, 'review-edit-4');
    // Hindi is not a script of an English handwriting: refused, nothing re-checked.
    await changeText(r, 'review-text-input-4', 'नमस्ते');
    await press(r, 'review-apply-4');
    expect(text(r, 'review-edit-problem-4')).toMatch(/does not write Hindi/);
    expect(queryByTestId(r, 'review-step')).toBe(true);
    // The text actually on the photo: checked again, then the review is rebuilt from it.
    await changeText(r, 'review-text-input-4', ENGLISH_WORDS);
    await press(r, 'review-apply-4');
    await waitFor(() => queryByTestId(r, 'review-step') && !queryByTestId(r, 'review-edit-form-4'));
    await press(r, 'review-photo-4');
    expect(text(r, 'review-text-4')).toBe(ENGLISH_WORDS);
    expect(text(r, 'review-slot-4')).toMatch(/\(your correction\)/);
    expect(used()).toBeGreaterThanOrEqual(before);
    // The correction is recorded as typed text, not as the page.
    await press(r, 'back-to-samples-button');
    expect(text(r, 'sample-corrected-4')).toContain(ENGLISH_WORDS);
    expect(text(r, 'sample-prompt-4')).toBe(ENGLISH_EVERYDAY); // the page itself is unchanged
  });

  it('a saved profile keeps exact version pinning: the success screen shows v1 and a second profile is a new id', async () => {
    setImageInput(fakeNativeInput(ENGLISH_PAGES.map(photo)));
    const onSaved = jest.fn();
    const r = await render(<CreateHandwritingScreen onBack={jest.fn()} onSaved={onSaved} />);
    await chooseType(r, 'english');
    await pickAll(r);
    await toReview(r);
    await press(r, 'review-continue');
    await press(r, 'save-handwriting-button');
    await waitFor(() => queryByTestId(r, 'done-step'));
    const first = parseProfileRef(onSaved.mock.calls[0][0]);
    expect(first.version).toBe(1);
    expect((await listProfiles()).map(p => p.id)).toEqual([first.id]);
  });
});

// --- The parts behind the screens -------------------------------------------------------------------

describe('text corrections in the sample set', () => {
  const withPhotos = slots => slots.reduce((set, n) => selectImage(set, n, file(n)).set, createSampleSet('english'));

  it('a correction belongs to the photo: it moves with it, is dropped with it, and is recorded as typed text', () => {
    let set = withPhotos([1, 2, 3, 4, 5]);
    expect(knownTextOf(set, 4)).toBe(pageOf(set, 4).text);
    set = setTextOverride(set, 4, `${ENGLISH_WORDS}\n`).set;
    expect(knownTextOf(set, 4)).toBe(ENGLISH_WORDS);
    expect(slotStatus(set, 4).transcription).toBe('provided');
    expect(toSampleMetadata(set).find(m => m.slot === 4).transcription).toEqual({ mode: 'user', text: ENGLISH_WORDS });
    expect(toSampleMetadata(set).find(m => m.slot === 3).transcription).toEqual({ mode: 'prescribed', text: LATIN_DIGITS_TEXT });
    set = moveSample(set, 4, 5).set;
    expect(knownTextOf(set, 5)).toBe(ENGLISH_WORDS); // with the photo
    expect(knownTextOf(set, 4)).toBe(pageOf(set, 4).text);
    set = selectImage(set, 5, file(9)).set; // a new photo: no correction
    expect(slotStatus(set, 5).transcription).toBe('prescribed');
    // The page's own text, or nothing, removes a correction.
    set = setTextOverride(setTextOverride(set, 1, 'abc').set, 1, pageOf(set, 1).text).set;
    expect(slotStatus(set, 1).transcription).toBe('prescribed');
    expect(setTextOverride(set, 1, '   ').set.samples).toEqual(set.samples);
  });

  it('refuses an empty correction or one in a script the type does not write', () => {
    const set = withPhotos([1, 2, 3, 4, 5]);
    expect(textOverrideProblem(set, '')).toMatch(/Type the text/);
    expect(textOverrideProblem(set, 'hello नमस्ते')).toMatch(/does not write Hindi: “न”/); // the first cluster of the foreign script
    expect(textOverrideProblem(set, 'Hello, 2 + 2 = 4!')).toBeNull();
    expect(setTextOverride(set, 2, 'नमस्ते').set).toBe(set);
  });
});

describe('the review summary', () => {
  const type = HANDWRITING_TYPES.find(t => t.id === 'english');
  const report = {
    scripts: {
      Latn: {
        latinUpper: { total: 26, observed: 24, uncertain: 1, missing: 1, missingKeys: ['Q'] },
        latinLower: { total: 26, observed: 26, uncertain: 0, missing: 0, missingKeys: [] },
        latinExtra: { total: REQUIRED_SETS.latinExtra.length, observed: REQUIRED_SETS.latinExtra.length - 3, uncertain: 0, missing: 3, missingKeys: ['7', '?', ';'] },
      },
    },
  };

  it('counts only what was learned, required sets apart from optional ones, digits apart from punctuation', () => {
    const s = summariseBuild({ status: 'created', report }, type);
    expect(s.status).toBe('created');
    expect(s.banner).toMatchObject({ tone: 'good', title: 'Good coverage' });
    expect(s.scripts).toHaveLength(1);
    const latn = s.scripts[0];
    expect(latn).toMatchObject({ script: 'Latn', label: 'English', total: 52, learned: 51, percent: 98, missing: ['Q'], uncertain: 1 });
    expect(latn.rows.map(r => [r.id, r.label, r.learned, r.total, r.required])).toEqual([
      ['latinLower', 'Lowercase letters', 26, 26, true],
      ['latinUpper', 'Uppercase letters', 25, 26, true],
      ['latinExtra-digits', 'Numbers', 9, 10, false],
      ['latinExtra-punctuation', 'Punctuation', REQUIRED_SETS.latinExtra.length - 12, REQUIRED_SETS.latinExtra.length - 10, false],
    ]);
    expect([...latn.optionalMissing].sort()).toEqual(['7', ';', '?']);
    expect(s.warnings).toEqual(['English: 1 character was learned with low confidence.', 'English: missing Q']);
  });

  it('an insufficient or failed build is a red banner, never good coverage', () => {
    expect(summariseBuild({ status: 'insufficient', report }, type).banner).toMatchObject({ tone: 'bad', title: 'Not enough characters yet' });
    expect(summariseBuild({ status: 'failed', report: {}, errors: ['boom'] }, type).banner).toMatchObject({ tone: 'bad', text: 'boom' });
    expect(summariseBuild({ status: 'failed', report: {} }, type).scripts[0]).toMatchObject({ total: 0, learned: 0, percent: 0, rows: [] });
  });
});

describe('the text-recognition seam', () => {
  it('has no engine: unavailable, and nothing is guessed', async () => {
    expect(isTextRecognitionAvailable()).toBe(false);
    expect(textRecognitionEngine()).toBeNull();
    expect(await recognizeText({ width: 1, height: 1, data: new Uint8Array(1) }, { scripts: ['Latn'] })).toEqual({ status: 'unavailable' });
  });

  it('a registered recogniser returns candidate lines with clamped confidence; errors are reported, not hidden', async () => {
    setTextRecognizer({ name: 'fake', recognize: async () => ({ lines: [{ text: 'apple', confidence: 1.7 }, { text: '  ', confidence: 0.9 }, { text: 'kite' }] }) });
    expect(isTextRecognitionAvailable()).toBe(true);
    expect(await recognizeText({})).toEqual({ status: 'recognized', engine: 'fake', lines: [{ text: 'apple', confidence: 1 }, { text: 'kite', confidence: 0 }] });
    setTextRecognizer({ recognize: async () => { throw new Error('model missing'); } });
    expect(await recognizeText({})).toEqual({ status: 'failed', message: 'model missing' });
    setTextRecognizer({ recognize: async () => null });
    expect((await recognizeText({})).status).toBe('failed');
    setTextRecognizer(null);
    expect(isTextRecognitionAvailable()).toBe(false);
  });
});

describe('My Handwritings metadata', () => {
  it('names the type (or the scripts of an older profile), the version and the day', async () => {
    expect(metaLine({ handwritingType: 'hindi-maths', latest: 3, versions: [1, 2, 3], createdAt: Date.UTC(2026, 9, 28, 12) })).toBe(`Hindi + Maths · v3 · 3 versions · ${formatDay(Date.UTC(2026, 9, 28, 12))}`);
    expect(metaLine({ handwritingType: null, scripts: ['Latn', 'Deva'], latest: 1, versions: [1], createdAt: null })).toBe('English + Hindi · v1');
    expect(createProfileVersion).toBeDefined();
  });
});

describe('release state', () => {
  it('onboarding stays tied to development / validation builds', () => {
    expect(PERSONAL_HANDWRITING_ONBOARDING).toBe(VALIDATION_TOOLS);
  });
});
