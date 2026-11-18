/**
 * Lang4 Phase 22 — six handwriting types; 3–5 photos build one profile.
 *
 * The user chooses one type (English, Hindi, English + Hindi, or any of
 * them + Maths), then photographs 3–5 pages of the same handwriting; all of
 * them build ONE profile of that type. Maths types must also write digits
 * and maths symbols (a requirement of their own).
 *
 * Photos are SYNTHETIC pages (geometric pseudo-glyphs, no fonts, nobody's
 * writing) through a fake picker: this checks the flow and the
 * safeguards, not real-handwriting accuracy.
 */
import React from 'react';
import { clearAllMockStorages } from '@react-native-async-storage/async-storage';
import { analyzeSample } from '../src/handwriting/learn/analyzeSample';
import { checkedScripts, HANDWRITING_TYPES, handwritingType, MAX_PHOTOS, MIN_PHOTOS } from '../src/handwriting/learn/handwritingTypes';
import { setImageInput } from '../src/handwriting/learn/imageInput';
import { layoutPersonalText } from '../src/handwriting/learn/personalRenderer';
import { clearPersonalCache } from '../src/handwriting/learn/personalStore';
import { generatePersonalProfile, REQUIRED_SETS } from '../src/handwriting/learn/profileGeneration';
import { listProfiles, readProfileVersion } from '../src/handwriting/learn/profileRepository';
import { parseProfileRef } from '../src/handwriting/learn/profileSchema';
import { ENGLISH_EVERYDAY, ENGLISH_WORDS, LATIN_ALPHABET, LATIN_DIGITS_TEXT, MATHS_ENGLISH, MATHS_HINDI, practicePage, SAMPLE_SLOTS } from '../src/handwriting/learn/samplePrompts';
import { createSampleSet, pageOf, plannedCoverage, selectImage, setType, toSampleMetadata, validateSampleSet } from '../src/handwriting/learn/sampleSet';
import { splitUnits } from '../src/handwriting/learn/textUnits';
import { PERSONAL_HANDWRITING_ONBOARDING, VALIDATION_TOOLS } from '../src/dev/flags';
import CreateHandwritingScreen from '../src/screens/CreateHandwritingScreen';
import ProfileDetailsScreen from '../src/screens/ProfileDetailsScreen';
import { createProfileVersion } from '../src/handwriting/learn/profileRepository';
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

// --- The six types ----------------------------------------------------------------------------

describe('the six handwriting types', () => {
  it('are exactly these, with their scripts and maths', () => {
    expect(HANDWRITING_TYPES.map(t => [t.title, t.scripts, t.maths])).toEqual([
      ['English', ['Latn'], false],
      ['Hindi', ['Deva'], false],
      ['English + Hindi', ['Latn', 'Deva'], false],
      ['English + Maths', ['Latn'], true],
      ['Hindi + Maths', ['Deva'], true],
      ['Hindi + English + Maths', ['Latn', 'Deva'], true],
    ]);
    expect([MIN_PHOTOS, MAX_PHOTOS]).toEqual([5, 5]);
    expect(checkedScripts(handwritingType('hindi-english-maths'))).toEqual(['Latn', 'Deva', 'Math']);
  });

  it.each(HANDWRITING_TYPES.map(t => t.id))('%s: three photos of its planned pages can teach every required character', typeId => {
    const plan = plannedCoverage(withPhotos(typeId, [1, 2, 3]));
    expect(plan.sets.length).toBeGreaterThan(0);
    plan.sets.forEach(x => expect([x.id, x.missing]).toEqual([x.id, []]));
    expect(plan).toMatchObject({ complete: true, suggestion: null });
    // Maths types are checked for maths; the others are not.
    expect(plan.sets.some(x => x.id === 'mathsCore')).toBe(handwritingType(typeId).maths);
  });

  it('maths pages cover digits, operators, signs and number words', () => {
    const keys = text => new Set(splitUnits(text).map(u => u.key));
    for (const page of [MATHS_ENGLISH, MATHS_HINDI]) REQUIRED_SETS.mathsCore.forEach(k => expect([k, keys(page).has(k)]).toEqual([k, true]));
    expect(['one', 'ten'].every(w => MATHS_ENGLISH.includes(w))).toBe(true);
    REQUIRED_SETS.devaDigits.forEach(k => expect(keys(MATHS_HINDI).has(k)).toBe(true));
    REQUIRED_SETS.devaNumberWords.forEach(k => expect(keys(MATHS_HINDI).has(k)).toBe(true));
    expect(MATHS_ENGLISH + MATHS_HINDI).not.toMatch(/π/); // outside the learnable scripts
  });

  it('each photo shows its type’s page; the metadata records each page', () => {
    const set = withPhotos('english', [1, 2, 3, 4, 5]);
    const meta = toSampleMetadata(set);
    expect(meta.map(m => [m.slot, m.category])).toEqual(SAMPLE_SLOTS.map(s => [s.slot, pageOf(set, s.slot).category]));
    expect(meta.slice(0, 3).map(m => m.category)).toEqual(['latin-alphabet', 'natural-text', 'latin-digits-text']);
    expect(meta.map(m => m.transcription.mode)).toEqual(['prescribed', 'prescribed', 'prescribed', 'prescribed', 'prescribed']);
    expect(pageOf(set, 5).id).toBe('latin-alphabet'); // a second copy of the alphabet: more variants
  });

  it('exactly five photos: fewer cannot be built', () => {
    expect(validateSampleSet(withPhotos('english', [1, 2])).problems.map(p => p.code)).toEqual(['too-few-photos']);
    expect(validateSampleSet(withPhotos('english', [1, 3, 5]))).toMatchObject({ ready: false, selected: 3 });
    expect(validateSampleSet(withPhotos('english', [1, 2, 3, 4, 5]))).toMatchObject({ ready: true, selected: 5 });
  });

  it('changing the type keeps the photos; every photo takes the new type’s page', () => {
    let set = withPhotos('english-hindi', [1, 2, 3]);
    set = setType(set, 'english-maths').set;
    expect(SAMPLE_SLOTS.map(s => pageOf(set, s.slot).id)).toEqual(['latin-alphabet', 'maths-english', 'latin-digits-text', 'english-words', 'english-everyday']);
    expect(validateSampleSet(set).selected).toBe(3);
  });
});

// --- Profiles from synthetic pages ----------------------------------------------------------------

async function sample(slot, text, category) {
  const lines = text.split('\n').length;
  const page = syntheticTextPage(text, { width: 1400, xHeight: 26, stroke: 3, top: 104, lineGap: 104, marginX: 50, height: 104 * (lines + 1) + 40, jitter: 0.04, marksApart: true });
  const r = await analyzeSample(page.raster, { slot, knownText: text, sampleId: `s${slot}`, revision: 1, yieldFn: async () => {}, extract: true });
  return { metadata: { slot, category, mime: 'image/png', width: 1400, height: page.raster.height, bytes: 1400 * page.raster.height, transcription: { mode: 'prescribed', text }, retained: false }, extraction: r.extraction };
}

describe('English + Maths profiles (synthetic pages)', () => {
  let withMaths;
  let withoutMaths;
  beforeAll(async () => {
    withMaths = [await sample(1, LATIN_ALPHABET, 'latin-alphabet'), await sample(2, MATHS_ENGLISH, 'maths'), await sample(3, LATIN_DIGITS_TEXT, 'latin-digits-text')];
    withoutMaths = [withMaths[0], withMaths[2], await sample(4, 'the quick brown fox jumps over the lazy dog', 'natural-text')];
  });
  const build = samples => generatePersonalProfile({ id: 'p-maths0-ab', name: 'Maths hand', now: 1000, synthetic: true, samples, scripts: ['Latn'], maths: true, handwritingType: 'english-maths' });

  it('three photos with the maths page build one profile that writes maths', () => {
    const g = build(withMaths);
    expect(g.status).toBe('created');
    expect(g.report.requirements.find(q => q.id === 'maths-symbols')).toMatchObject({ pass: true, script: 'Math' });
    expect(g.report.support.Math.text).toMatch(/^Maths: all 21 required digits and symbols learned/);
    expect(g.profile.handwritingType).toBe('english-maths');
    expect(g.profile.scripts).toEqual(['Latn']);
    expect(g.profile.sources.map(s => s.slot)).toEqual([1, 2, 3]);
    // Writing maths: learned symbols drawn; anything not learned is a dashed box, never invented.
    const lay = layoutPersonalText('12 + 7 = 19 √16 ∞', g.profile, { xHeight: 20 });
    const items = lay.lines.flatMap(l => l.words).flatMap(w => w.items);
    expect(items.filter(i => '12+7=9'.includes(i.text)).every(i => i.kind === 'glyph')).toBe(true);
    expect(lay.unsupported.map(u => u.text)).toContain('∞'); // never taught: marked, not drawn
  });

  it('without the maths page, the maths requirement blocks the profile and lists the missing symbols', () => {
    const g = build(withoutMaths);
    expect(g.status).toBe('insufficient');
    expect(g.profile).toBeNull();
    const req = g.report.requirements.find(q => q.id === 'maths-symbols');
    expect(req.pass).toBe(false);
    expect(req.reason).toMatch(/digits and maths symbols observed .* Missing: .*− .*× .*÷/);
    expect(g.report.support.Math.level).toBe('insufficient');
  });

  it('its details show the type and what it can write in maths', async () => {
    const g = build(withMaths);
    await createProfileVersion(g.profile);
    const r = await render(<ProfileDetailsScreen profileId="p-maths0-ab" onBack={jest.fn()} />);
    for (let i = 0; i < 50 && !queryByTestId(r, 'support-Math'); i++) await flush(1);
    expect(textOf(outer(r, 'details-type')[0])).toMatch(/English \+ Maths/);
    expect(textOf(outer(r, 'support-Math')[0])).toMatch(/^Maths: all \d+ required digits and symbols learned/);
  });

  it('the same photos as an English handwriting need no maths', () => {
    const g = generatePersonalProfile({ id: 'p-maths0-ab', name: 'English hand', now: 1000, synthetic: true, samples: withoutMaths, scripts: ['Latn'], handwritingType: 'english' });
    expect(g.status).toBe('created');
    expect(g.report.requirements.some(q => q.id === 'maths-symbols')).toBe(false);
    expect(g.report.support.Math).toBeUndefined();
  });
});

// --- The wizard ---------------------------------------------------------------------------------

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
function photo(textOnPage) {
  seq++;
  const lines = textOnPage.split('\n').length;
  const { raster } = syntheticTextPage(textOnPage, { width: 1400, xHeight: 26, stroke: 3, top: 104, lineGap: 104, marginX: 50, height: 104 * (lines + 1) + 40, jitter: 0.04, marksApart: true });
  return { raster, picked: { uri: `file:///cache/handwrite-samples/t${seq}.png`, mime: 'image/png', width: 3000, height: 4000, bytes: 3000000 + seq, orientation: 1 } };
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
/** Picks the photos, waits for their checks, then "Analyze Photos" through to the review. */
async function analysePhotos(r, slots, { pick = true } = {}) {
  if (pick) for (const n of slots) await press(r, `sample-pick-${n}`);
  await waitFor(() => slots.every(n => checked(r, n)));
  await act(async () => {
    await new Promise(res => setTimeout(res, 900));
  });
  await waitFor(() => slots.every(n => checked(r, n)));
  await press(r, 'analyze-photos-button');
  await waitFor(() => queryByTestId(r, 'review-step'));
}

describe('the wizard: one type, 3–5 photos, one handwriting', () => {
  it('starts with the type; Continue waits for a choice; the photos step offers only that type’s pages', async () => {
    const r = await render(<CreateHandwritingScreen onBack={jest.fn()} onSaved={jest.fn()} />);
    expect(queryByTestId(r, 'intro-step')).toBe(true); // Phase 24: an introduction first
    await press(r, 'intro-start');
    expect(queryByTestId(r, 'type-step')).toBe(true);
    HANDWRITING_TYPES.forEach(t => expect(queryByTestId(r, `type-${t.id}`)).toBe(true));
    expect(byTestId(r, 'type-continue', 'accessibilityState').props.accessibilityState.disabled).toBe(true);
    expect(textOf(outer(r, 'type-hindi-maths')[0])).toMatch(/Hindi letters, digits and maths symbols\./);
    await chooseType(r, 'hindi-maths');
    expect(text(r, 'chosen-type')).toBe('Handwriting type: Hindi + Maths');
    expect(text(r, 'sample-title-2')).toBe('Photo 2 · Maths in Hindi');
    expect(text(r, 'sample-prompt-2')).toBe(MATHS_HINDI);
    expect(r.root.findAll(n => typeof n.props.testID === 'string' && /^sample-page-/.test(n.props.testID))).toEqual([]); // no per-photo choice
    expect(text(r, 'coverage-plan-mathsCore')).toMatch(/Digits and maths symbols: 21 of 21/);
    await press(r, 'change-type');
    expect(queryByTestId(r, 'type-step')).toBe(true);
  });

  it('English + Maths from five photos: one profile of that type; another type can be made later', async () => {
    setImageInput(fakeNativeInput([photo(LATIN_ALPHABET), photo(MATHS_ENGLISH), photo(LATIN_DIGITS_TEXT), photo(ENGLISH_WORDS), photo(ENGLISH_EVERYDAY)]));
    const onSaved = jest.fn();
    let r = await render(<CreateHandwritingScreen onBack={jest.fn()} onSaved={onSaved} />);
    await chooseType(r, 'english-maths');
    await analysePhotos(r, [1, 2, 3, 4, 5]);
    expect(text(r, 'review-banner-title')).toBe('Good coverage');
    expect(text(r, 'build-status')).toBe('Your handwriting is ready to save.');
    expect(text(r, 'requirement-maths-symbols')).toMatch(/^✓ digits and maths symbols/);
    expect(text(r, 'support-Math')).toMatch(/^Maths: all 21 required digits and symbols learned/);
    expect(text(r, 'review-coverage-total-Math')).toMatch(/^21 of 21 \(100%\)$/);
    await press(r, 'review-continue');
    await changeText(r, 'profile-name-input', 'Maths hand');
    await press(r, 'save-handwriting-button');
    await waitFor(() => onSaved.mock.calls.length > 0);
    const { id } = parseProfileRef(onSaved.mock.calls[0][0]);
    const profile = (await readProfileVersion(id, 1)).profile;
    expect(profile).toMatchObject({ name: 'Maths hand', handwritingType: 'english-maths', scripts: ['Latn'] });
    expect(profile.sources.map(s => s.slot)).toEqual([1, 2, 3, 4, 5]);
    expect(profile.sources.slice(0, 3).map(s => [s.slot, s.category])).toEqual([[1, 'latin-alphabet'], [2, 'maths'], [3, 'latin-digits-text']]);
    // The success screen, then another handwriting of a different type from the same screen.
    expect(queryByTestId(r, 'done-step')).toBe(true);
    expect(text(r, 'details-type')).toMatch(/English \+ Maths/);
    expect(text(r, 'details-version')).toMatch(/v1/);
    await press(r, 'create-another-button');
    expect(queryByTestId(r, 'type-step')).toBe(true);

    // Later: an English handwriting, as its own profile.
    setImageInput(fakeNativeInput([photo(LATIN_ALPHABET), photo(ENGLISH_WORDS), photo(LATIN_DIGITS_TEXT), photo(ENGLISH_EVERYDAY), photo(LATIN_ALPHABET)]));
    const onSaved2 = jest.fn();
    r = await render(<CreateHandwritingScreen onBack={jest.fn()} onSaved={onSaved2} />);
    await chooseType(r, 'english');
    await analysePhotos(r, [1, 2, 3, 4, 5]);
    expect(text(r, 'build-status')).toBe('Your handwriting is ready to save.');
    expect(queryByTestId(r, 'requirement-maths-symbols')).toBe(false);
    expect(queryByTestId(r, 'review-coverage-Math')).toBe(false);
    await press(r, 'review-continue');
    await changeText(r, 'profile-name-input', 'English hand');
    await press(r, 'save-handwriting-button');
    await waitFor(() => onSaved2.mock.calls.length > 0);
    expect((await listProfiles()).map(p => p.name).sort()).toEqual(['English hand', 'Maths hand']);
  });

  it('English + Maths whose maths photo shows another page: creation is blocked and the missing symbols are named', async () => {
    // Photo 2 must show "Maths in English"; here it shows the English words page instead.
    setImageInput(fakeNativeInput([photo(LATIN_ALPHABET), photo(ENGLISH_WORDS), photo(LATIN_DIGITS_TEXT), photo(ENGLISH_WORDS), photo(ENGLISH_EVERYDAY)]));
    const r = await render(<CreateHandwritingScreen onBack={jest.fn()} onSaved={jest.fn()} />);
    await chooseType(r, 'english-maths');
    expect(text(r, 'coverage-plan-mathsCore')).toMatch(/Digits and maths symbols: 21 of 21/); // the plan: photo 2 would cover them
    await analysePhotos(r, [1, 2, 3, 4, 5]);
    expect(text(r, 'review-banner-title')).toBe('Not enough characters yet');
    expect(text(r, 'build-status')).toMatch(/Not enough clear writing/);
    expect(text(r, 'requirement-maths-symbols')).toMatch(/^✗ digits and maths symbols: .*Missing: .*− .*× .*÷/);
    expect(text(r, 'review-missing-Math')).toMatch(/Missing: .*−.*×.*÷/);
    expect(byTestId(r, 'review-continue', 'accessibilityState').props.accessibilityState.disabled).toBe(true);
    expect(queryByTestId(r, 'save-handwriting-button')).toBe(false);
    expect(await listProfiles()).toEqual([]);
  });
});

describe('release state', () => {
  it('onboarding stays tied to development / validation builds', () => {
    expect(PERSONAL_HANDWRITING_ONBOARDING).toBe(VALIDATION_TOOLS);
    expect(practicePage('maths-english').category).toBe('maths');
  });
});
