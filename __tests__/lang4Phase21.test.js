/**
 * Lang4 Phase 21 (as of Phase 23) — the photos of one type build one handwriting.
 *
 * Every photo shows its type's page (copied by hand); all photos chosen
 * build ONE profile. The wizard re-checks a photo when its text changes
 * (the type changed), refuses duplicates and poor photos, and refuses to
 * build without enough evidence, saying what is missing.
 *
 * Photos are SYNTHETIC pages through a fake picker: this checks the flow
 * and the safeguards, not real-handwriting accuracy.
 */
import React from 'react';
import { clearAllMockStorages } from '@react-native-async-storage/async-storage';
import { knownTextFor } from '../src/handwriting/learn/contracts';
import { setImageInput } from '../src/handwriting/learn/imageInput';
import { clearPersonalCache } from '../src/handwriting/learn/personalStore';
import { listProfiles, listVersions, readProfileVersion } from '../src/handwriting/learn/profileRepository';
import { parseProfileRef } from '../src/handwriting/learn/profileSchema';
import { makeRaster } from '../src/handwriting/learn/raster';
import { DEVANAGARI_ALPHABET, ENGLISH_EVERYDAY, ENGLISH_WORDS, HINDI_SUGGESTED, LATIN_ALPHABET, LATIN_DIGITS_TEXT, MATHS_ENGLISH, MIXED_SUGGESTED, SAMPLE_SLOTS } from '../src/handwriting/learn/samplePrompts';
import { createSampleSet, moveSample, pageOf, plannedCoverage, selectImage, toSampleMetadata, validateSampleSet } from '../src/handwriting/learn/sampleSet';
import CreateHandwritingScreen from '../src/screens/CreateHandwritingScreen';
import { setStorageBackend } from '../src/storage/documentStorage';
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
afterEach(() => setImageInput(null));

const file = (n, extra = {}) => ({ uri: `file:///cache/handwrite-samples/p${n}.jpg`, mime: 'image/jpeg', width: 3000, height: 4000, bytes: 2400000 + n, ...extra });
const withPhotos = (typeId, slots) => slots.reduce((set, n) => selectImage(set, n, file(n)).set, createSampleSet(typeId));

// --- The model ------------------------------------------------------------------------------------

describe('one handwriting from the photos of one type: the sample set', () => {
  it('photo N shows the type’s page N; the page moves with the photo', () => {
    let set = withPhotos('english-hindi', [1, 2, 3, 4, 5]);
    expect(SAMPLE_SLOTS.map(s => pageOf(set, s.slot).id)).toEqual(['latin-alphabet', 'devanagari-alphabet', 'latin-digits-text', 'hindi-everyday', 'mixed-everyday']);
    set = moveSample(set, 1, 4).set;
    expect(pageOf(set, 4).id).toBe('latin-alphabet');
    expect(pageOf(set, 1).id).toBe('hindi-everyday');
  });

  it('each photo is aligned to the exact text of its page', () => {
    const meta = toSampleMetadata(withPhotos('english-hindi', [1, 2, 3, 4, 5]));
    expect(meta.map(m => knownTextFor(m))).toEqual([LATIN_ALPHABET, DEVANAGARI_ALPHABET, LATIN_DIGITS_TEXT, HINDI_SUGGESTED, MIXED_SUGGESTED]);
    expect(meta.map(m => m.transcription.mode)).toEqual(['prescribed', 'prescribed', 'prescribed', 'prescribed', 'prescribed']);
    expect(meta.map(m => m.slot)).toEqual([1, 2, 3, 4, 5]); // samples of one handwriting
  });

  it('plans coverage across the photos and suggests the type’s page that adds most', () => {
    // The planned photos 1–3 cover every required character of the type.
    expect(plannedCoverage(withPhotos('english-hindi', [1, 2, 3]))).toMatchObject({ scripts: ['Latn', 'Deva'], complete: true, suggestion: null });
    // English from words, numbers and everyday text only: capitals are missing → the English alphabet.
    const plan = plannedCoverage(withPhotos('english', [2, 3, 4]));
    expect(plan.scripts).toEqual(['Latn']);
    expect(plan.complete).toBe(false);
    expect(plan.sets.find(x => x.id === 'latinLower')).toMatchObject({ covered: 26, total: 26 });
    expect(plan.sets.find(x => x.id === 'latinUpper').covered).toBeLessThan(26);
    expect(plan.suggestion.id).toBe('latin-alphabet');
    // Hindi from words, numbers and everyday text only: the Hindi alphabet adds the most.
    expect(plannedCoverage(withPhotos('hindi', [2, 3, 4])).suggestion.id).toBe('devanagari-alphabet');
  });

  it('the same picture chosen for two photos is refused, even as two separate copies', () => {
    let set = withPhotos('english-hindi', [1, 2, 3, 4, 5]);
    set = selectImage(set, 3, file(9, { uri: 'file:///cache/handwrite-samples/copy-a.jpg', bytes: 2400001 })).set; // same as photo 1 but another copy
    const check = validateSampleSet(set);
    expect(check.ready).toBe(false);
    expect(check.problems.filter(p => p.code === 'duplicate-image').map(p => p.message)).toEqual(['The same photo is chosen for photos 1 and 3.']);
  });
});

// --- The wizard (synthetic photos, fake picker) -------------------------------------------------------

const outer = (r, id) => r.root.findAll(n => n.props.testID === id && typeof n.type !== 'string' && !(n.parent && n.parent.props.testID === id));
const textOf = node => {
  const out = [];
  const walk = n => (typeof n === 'string' ? out.push(n) : n && n.children && n.children.forEach(walk));
  walk(node);
  return out.join('');
};
const text = (r, id) => textOf(outer(r, id)[0]);
const flush = async (n = 3) => {
  for (let i = 0; i < n; i++) {
    await act(async () => {
      await new Promise(res => setTimeout(res, 0));
    });
  }
};
async function waitFor(check, limit = 6000) {
  for (let i = 0; i < limit; i++) {
    if (check()) return;
    await flush(1);
  }
  throw new Error('condition not reached');
}
let seq = 0;
function photo(textOnPage, o = {}) {
  seq++;
  const lines = textOnPage.split('\n').length;
  const { raster } = o.blank
    ? { raster: makeRaster(1400, 900, new Uint8Array(1400 * 900).fill(236)) }
    : syntheticTextPage(textOnPage, { width: 1400, xHeight: 26, stroke: 3, top: 104, lineGap: 104, marginX: 50, height: 104 * (lines + 1) + 40, jitter: 0.04, marksApart: true });
  return { raster, picked: { uri: `file:///cache/handwrite-samples/s${seq}.png`, mime: 'image/png', width: 3000, height: 4000, bytes: 2000000 + seq, orientation: 1 } };
}
function fakeNativeInput(pages) {
  const queue = [...pages];
  return {
    pickImage: jest.fn(async () => (queue.length ? queue.shift().picked : null)),
    decodeForAnalysis: jest.fn(async uri => {
      const p = pages.find(x => x.picked.uri === uri);
      return { width: p.raster.width, height: p.raster.height, encoding: 'gray8-base64', data: toBase64(p.raster.data), sourceWidth: p.raster.width * 2, sourceHeight: p.raster.height * 2, orientation: 1, orientationApplied: true, decodeMillis: 5 };
    }),
    releaseImage: jest.fn(async () => {}),
    clearTemporaryImages: jest.fn(async () => 0),
  };
}
const checked = (r, slot) => queryByTestId(r, `sample-quality-${slot}`) && /checked|failed/.test(text(r, `sample-quality-${slot}`));
const analyseDisabled = r => byTestId(r, 'analyze-photos-button', 'accessibilityState').props.accessibilityState.disabled;
/** "Analyze Photos" through to the review (the analysis screen builds the profile once every check is in). */
async function toReview(r) {
  await press(r, 'analyze-photos-button');
  await waitFor(() => queryByTestId(r, 'review-step'));
}
async function settle(r, slots) {
  await waitFor(() => slots.every(n => checked(r, n)));
}

describe('the wizard: the photos of one type, one handwriting', () => {
  it('English + Hindi from five photos: one profile, one version, all five photos as its sources', async () => {
    setImageInput(fakeNativeInput([photo(LATIN_ALPHABET), photo(DEVANAGARI_ALPHABET), photo(LATIN_DIGITS_TEXT), photo(HINDI_SUGGESTED), photo(MIXED_SUGGESTED)]));
    const onSaved = jest.fn();
    const r = await render(<CreateHandwritingScreen onBack={jest.fn()} onSaved={onSaved} />);
    await chooseType(r, 'english-hindi');
    expect(text(r, 'coverage-plan')).toMatch(/English lowercase: 26 of 26/);
    for (const s of SAMPLE_SLOTS) await press(r, `sample-pick-${s.slot}`);
    await settle(r, [1, 2, 3, 4, 5]);
    expect(text(r, 'sample-title-5')).toBe('Photo 5 · English and Hindi together');
    expect(text(r, 'sample-letters-3')).toMatch(/Letters usable from this photo: \d+ of \d+/);
    await toReview(r);
    expect(text(r, 'build-status')).toBe('Your handwriting is ready to save.');
    expect(text(r, 'review-banner-title')).toBe('Good coverage');
    await press(r, 'review-continue');
    await changeText(r, 'profile-name-input', 'Combined hand');
    await press(r, 'save-handwriting-button');
    await waitFor(() => onSaved.mock.calls.length > 0);
    const { id } = parseProfileRef(onSaved.mock.calls[0][0]);
    expect((await listProfiles()).map(p => p.name)).toEqual(['Combined hand']);
    expect(await listVersions(id)).toEqual([1]);
    const profile = (await readProfileVersion(id, 1)).profile;
    expect(profile.sources.map(s => [s.slot, s.category])).toEqual([
      [1, 'latin-alphabet'],
      [2, 'devanagari-alphabet'],
      [3, 'latin-digits-text'],
      [4, 'devanagari-text'],
      [5, 'natural-text'],
    ]);
    expect(profile.handwritingType).toBe('english-hindi');
    expect(JSON.stringify(profile)).not.toMatch(/file:\/\/|base64/);
  });

  it('a photo is re-checked when its text changes with the type; a poor photo blocks the build until replaced', async () => {
    const blank = photo('', { blank: true });
    const pages = [photo(LATIN_ALPHABET), photo(MATHS_ENGLISH), photo(LATIN_DIGITS_TEXT), blank, photo(ENGLISH_EVERYDAY)];
    const input = fakeNativeInput(pages);
    setImageInput(input);
    const r = await render(<CreateHandwritingScreen onBack={jest.fn()} onSaved={jest.fn()} />);
    await chooseType(r, 'english'); // photo 2 is expected to show English words…
    for (const n of [1, 2, 3, 4, 5]) await press(r, `sample-pick-${n}`);
    await settle(r, [1, 2, 3, 4, 5]);
    const before = text(r, 'sample-text-2');
    // …but it shows the maths page: as English + Maths, photo 2 is that page, and it is checked again.
    await press(r, 'change-type');
    await press(r, 'type-english-maths');
    await press(r, 'type-continue');
    expect(text(r, 'sample-title-2')).toBe('Photo 2 · Maths in English');
    await settle(r, [1, 2, 3, 4, 5]);
    // Decoded and checked a second time, against the new text (the per-stage progress updates
    // keep act() flushing, so the transient "Checking…" state is not observable here).
    expect(input.decodeForAnalysis.mock.calls.filter(c => c[0] === pages[1].picked.uri)).toHaveLength(2);
    expect(text(r, 'sample-text-2')).not.toBe(before);
    // The blank photo is not usable: no build.
    expect(text(r, 'sample-acceptable-4')).toMatch(/Not usable/);
    expect(analyseDisabled(r)).toBe(true);
    // Replace it with the page photo 4 shows: analysis becomes possible.
    setImageInput(fakeNativeInput([photo(ENGLISH_WORDS)]));
    await press(r, 'sample-pick-4');
    await settle(r, [4]);
    expect(text(r, 'sample-acceptable-4')).not.toMatch(/Not usable/);
    expect(analyseDisabled(r)).toBe(false);
  });

  it('the same picture twice is refused in the wizard', async () => {
    const same = photo(LATIN_ALPHABET);
    const again = { raster: same.raster, picked: { ...same.picked, uri: 'file:///cache/handwrite-samples/again.png' } };
    setImageInput(fakeNativeInput([same, again]));
    const r = await render(<CreateHandwritingScreen onBack={jest.fn()} onSaved={jest.fn()} />);
    await chooseType(r);
    await press(r, 'sample-pick-1');
    await press(r, 'sample-pick-2');
    expect(textOf(byTestId(r, 'photo-problems'))).toMatch(/The same photo is chosen for photos 1 and 2\./);
    expect(analyseDisabled(r)).toBe(true);
  });

  it('not enough evidence: an English handwriting whose alphabet photos show other pages builds nothing, and says what is missing', async () => {
    // Photos 1 and 5 must show the alphabet; here they show everyday sentences instead.
    setImageInput(fakeNativeInput([photo(ENGLISH_EVERYDAY), photo(ENGLISH_WORDS), photo(LATIN_DIGITS_TEXT), photo(ENGLISH_EVERYDAY), photo(ENGLISH_EVERYDAY)]));
    const r = await render(<CreateHandwritingScreen onBack={jest.fn()} onSaved={jest.fn()} />);
    await chooseType(r, 'english');
    for (const n of [1, 2, 3, 4, 5]) await press(r, `sample-pick-${n}`);
    await settle(r, [1, 2, 3, 4, 5]);
    await toReview(r);
    expect(text(r, 'review-banner-title')).toBe('Not enough characters yet');
    expect(text(r, 'build-status')).toMatch(/Not enough clear writing/);
    expect(text(r, 'requirement-latin-uppercase')).toMatch(/^✗ capitals A–Z/);
    expect(text(r, 'review-missing-Latn')).toMatch(/^Missing: /);
    expect(byTestId(r, 'review-continue', 'accessibilityState').props.accessibilityState.disabled).toBe(true);
    expect(queryByTestId(r, 'save-handwriting-button')).toBe(false);
    expect(await listProfiles()).toEqual([]);
  });
});
