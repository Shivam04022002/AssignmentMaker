/**
 * Lang4 Phase 2 — five-image onboarding and validation.
 *
 * The image input used here is a TEST DOUBLE (fakeInput below): the app's
 * real image module does not exist yet, and without it the wizard reports
 * that choosing photos is unavailable. No image is analysed anywhere.
 */
import React from 'react';
import { Alert, NativeModules } from 'react-native';
import { getHandwritingStyles } from '../src/data/handwritingStyles';
import { GLYPH_FORMS, GLYPH_SETS } from '../src/handwriting/glyphs';
import { validateSampleMetadata } from '../src/handwriting/learn/contracts';
import { isImageInputAvailable, pickSampleImage, releaseImages, setImageInput } from '../src/handwriting/learn/imageInput';
import { HINDI_SUGGESTED, MIXED_SUGGESTED, SAMPLE_SLOTS } from '../src/handwriting/learn/samplePrompts';
import {
  analysisInputs,
  createSampleSet,
  discardAll,
  heldUris,
  markAnalysis,
  moveSample,
  pageOf,
  QUALITY_NOT_ANALYSED,
  removeSample,
  selectImage,
  setSlotError,
  slotStatus,
  toSampleMetadata,
  validateImageFile,
  validateSampleSet,
} from '../src/handwriting/learn/sampleSet';
import { splitUnits, UNIT_KIND } from '../src/handwriting/learn/textUnits';
import { createDocument } from '../src/models/document';
import CreateHandwritingScreen from '../src/screens/CreateHandwritingScreen';
import HomeScreen from '../src/screens/HomeScreen';
import { act, byTestId, press, queryByTestId, render } from './helpers/render';
import { chooseType } from './helpers/wizard';

const photo = (n, extra = {}) => ({ uri: `file:///cache/samples/p${n}.jpg`, mime: 'image/jpeg', width: 3000, height: 4000, bytes: 2400000 + n, ...extra });

/** A fully selected, valid set (five distinct photos). */
function fullSet() {
  let set = createSampleSet();
  for (const s of SAMPLE_SLOTS) set = selectImage(set, s.slot, photo(s.slot)).set;
  return set;
}

/** TEST DOUBLE for the future native image module. */
function fakeInput(results) {
  const queue = [...results];
  const input = {
    released: [],
    picks: 0,
    pickImage: jest.fn(async () => {
      input.picks++;
      const next = queue.shift();
      if (next instanceof Error) throw next;
      if (typeof next === 'function') return next();
      return next === undefined ? null : next;
    }),
    releaseImage: jest.fn(async uri => {
      input.released.push(uri);
    }),
  };
  return input;
}

/** All text rendered inside a node (read from the host Text elements). */
const flatText = c => (Array.isArray(c) ? c.map(flatText).join('') : typeof c === 'string' || typeof c === 'number' ? String(c) : '');
const textOf = node => node.findAll(n => n.type === 'Text').map(n => flatText(n.props.children)).join(' ');
const text = (r, id) => textOf(byTestId(r, id));
const flush = () => act(async () => {});

afterEach(() => setImageInput(null));

// --- Sample slots and prompts --------------------------------------------------------

describe('five sample slots', () => {
  it('initialises five empty slots from samplePrompts.js', () => {
    const set = createSampleSet();
    expect(set.slots.map(s => [s.slot, s.sampleId])).toEqual([[1, null], [2, null], [3, null], [4, null], [5, null]]);
    expect(SAMPLE_SLOTS.map(s => s.category)).toEqual(['latin-alphabet', 'devanagari-alphabet', 'latin-digits-text', 'devanagari-text', 'natural-text']);
    expect(SAMPLE_SLOTS.map(s => s.transcription)).toEqual(['prescribed', 'prescribed', 'prescribed', 'optional', 'optional']);
    SAMPLE_SLOTS.forEach(s => expect(s.instructions.length).toBeGreaterThan(0));
    expect(SAMPLE_SLOTS.filter(s => s.scriptsSelectable).map(s => s.slot)).toEqual([5]);
  });

  it('prescribes text with repeated letters, Hindi vowels, consonants and matras, digits and punctuation', () => {
    const [latin, deva, digits, hindi, natural] = SAMPLE_SLOTS;
    expect(latin.prompt).toMatch(/ABCDEFGHIJKLMNOPQRSTUVWXYZ/);
    expect(latin.prompt).toMatch(/aaa eee ooo/); // repeated examples for variation
    const units = splitUnits(deva.prompt).filter(u => u.kind === UNIT_KIND.CLUSTER).map(u => u.text);
    for (const t of ['अ', 'औ', 'क', 'ह', 'कि', 'कु', 'के', 'क्ष']) expect(units).toContain(t);
    expect(digits.prompt).toMatch(/0123456789/);
    expect(digits.prompt).toMatch(/[.,;:?!]/);
    expect([hindi.prompt, natural.prompt]).toEqual([null, null]);
    expect(hindi.request).toMatch(/क्ष/);
    expect(natural.request).toMatch(/English and Hindi/);
  });
});

// --- File-level validation ------------------------------------------------------------

describe('file validation', () => {
  it('accepts ordinary phone photos (JPEG, PNG, HEIC, WebP; 12–200 MP)', () => {
    for (const img of [photo(1), photo(2, { mime: 'image/png' }), photo(3, { mime: 'image/heic', width: 4032, height: 3024 }), photo(4, { mime: 'image/webp' }), photo(5, { width: 12000, height: 16000, bytes: 30000000 })]) {
      expect([img.mime, validateImageFile(img).valid]).toEqual([img.mime, true]);
    }
    expect(validateImageFile(photo(1, { mime: 'image/jpg' })).mime).toBe('image/jpeg');
    expect(validateImageFile(photo(5, { width: 12000, height: 16000 })).problems.map(p => p.code)).toEqual(['large-image']);
  });

  it.each([
    ['no image', null, 'missing-reference'],
    ['empty uri', { ...photo(1), uri: '  ' }, 'missing-reference'],
    ['malformed reference', { uri: 42 }, 'missing-reference'],
    ['GIF', photo(1, { mime: 'image/gif' }), 'unsupported-format'],
    ['no dimensions', photo(1, { width: 0 }), 'unreadable-metadata'],
    ['fractional dimensions', photo(1, { height: 10.5 }), 'unreadable-metadata'],
    ['empty file', photo(1, { bytes: 0 }), 'unreadable-metadata'],
    ['huge file', photo(1, { bytes: 90 * 1024 * 1024 }), 'file-too-large'],
    ['tiny image', photo(1, { width: 480, height: 640 }), 'too-small'],
  ])('rejects %s', (_, img, code) => {
    const r = validateImageFile(img);
    expect(r.valid).toBe(false);
    expect(r.problems.map(p => p.code)).toContain(code);
    r.problems.forEach(p => expect(p.message && p.advice).toBeTruthy());
  });

  it('warns without blocking: small, strip-shaped, rotated, unknown orientation', () => {
    const codes = img => validateImageFile(img).problems.map(p => [p.code, p.severity]);
    expect(codes(photo(1, { width: 800, height: 1000 }))).toEqual([['low-resolution', 'warning']]);
    expect(codes(photo(1, { width: 1000, height: 5000 }))).toEqual([['unusual-shape', 'warning']]);
    expect(codes(photo(1, { orientation: 6 }))).toEqual([['rotated', 'info']]);
    expect(codes(photo(1, { orientation: 1 }))).toEqual([]);
    expect(codes(photo(1, { orientation: 12 }))).toEqual([['orientation-unknown', 'warning']]);
    expect(validateImageFile(photo(1, { orientation: 6 })).valid).toBe(true);
  });
});

// --- Sample set -------------------------------------------------------------------------

describe('sample set: identity, replacement, reordering', () => {
  it('selects, replaces (releasing the old copy and its results) and removes', () => {
    let { set, release } = selectImage(createSampleSet(), 4, photo(1));
    expect(release).toEqual([]);
    set = markAnalysis(set, slotStatus(set, 4).sample.id, { status: 'decoding' }).set;
    const first = slotStatus(set, 4).sample;
    expect(first.analysis.status).toBe('decoding');
    ({ set, release } = selectImage(set, 4, photo(2)));
    expect(release).toEqual([photo(1).uri]);
    const second = slotStatus(set, 4).sample;
    expect(second.id).not.toBe(first.id);
    expect(second.analysis.status).toBe('not-started'); // nothing stale carried over
    expect(set.samples[first.id]).toBeUndefined();
    ({ set, release } = removeSample(set, 4));
    expect(release).toEqual([photo(2).uri]);
    expect(slotStatus(set, 4).state).toBe('empty');
    expect(Object.keys(set.samples)).toEqual([]);
    expect(removeSample(set, 4).release).toEqual([]);
  });

  it('moves a sample with its page and checks', () => {
    let set = selectImage(createSampleSet(), 4, photo(4)).set;
    set = selectImage(set, 5, photo(5, { width: 700, height: 900 })).set;
    const before4 = slotStatus(set, 4).sample;
    const before5 = slotStatus(set, 5).sample;
    const moved = moveSample(set, 4, 5);
    expect(moved.release).toEqual([]);
    set = moved.set;
    expect(slotStatus(set, 5).sample).toBe(before4);
    expect(slotStatus(set, 4).sample).toBe(before5);
    expect(slotStatus(set, 4).state).toBe('warning'); // the small photo's warning moved with it
    // What a photo shows (its page) moves with it: English + Hindi pages 4 and 5 swap.
    expect(pageOf(set, 4).id).toBe('mixed-everyday');
    expect(pageOf(set, 5).id).toBe('hindi-everyday');
    expect(slotStatus(set, 4).transcription).toBe('prescribed'); // every photo copies its page
    expect(moveSample(set, 1, 1).set).toBe(set);
    expect(moveSample(set, 1, 9).set).toBe(set);
  });

  it("a photo's scripts are its page's scripts", () => {
    const set = fullSet();
    expect(SAMPLE_SLOTS.map(s => slotStatus(set, s.slot).sample.scripts)).toEqual([['Latn'], ['Deva'], ['Latn'], ['Deva'], ['Latn', 'Deva']]);
  });

  it('records and clears picking errors per slot', () => {
    let set = setSlotError(createSampleSet(), 2, { message: 'm', advice: 'a' }).set;
    expect(slotStatus(set, 2).state).toBe('picker-error');
    set = selectImage(set, 2, photo(2)).set;
    expect(slotStatus(set, 2).error).toBeNull();
  });

  it('discards everything and lists every copy to release', () => {
    const set = fullSet();
    expect(heldUris(set).sort()).toEqual(SAMPLE_SLOTS.map(s => photo(s.slot).uri).sort());
    const d = discardAll(set);
    expect(d.release.sort()).toEqual(heldUris(set).sort());
    expect(d.set).toEqual(createSampleSet());
  });
});

describe('sample-set validation', () => {
  it('requires five photos, with valid files and distinct photos', () => {
    const empty = validateSampleSet(createSampleSet());
    expect(empty.ready).toBe(false);
    expect(empty.problems.map(p => [p.code, p.message])).toEqual([['too-few-photos', 'Add all 5 photos (0 added so far).']]);
    // Phase 24: exactly five photos; three are not enough.
    let three = createSampleSet();
    for (const n of [1, 2, 3]) three = selectImage(three, n, photo(n)).set;
    expect(validateSampleSet(three)).toMatchObject({ ready: false, selected: 3 });
    expect(validateSampleSet(three).problems.map(p => p.code)).toEqual(['too-few-photos']);
    expect(validateSampleSet(fullSet())).toMatchObject({ ready: true, selected: 5, problems: [] });
    let set = fullSet();
    set = selectImage(set, 3, photo(3, { mime: 'image/gif' })).set;
    expect(validateSampleSet(set).problems.find(p => p.slot === 3).code).toBe('unsupported-format');
    set = selectImage(set, 3, photo(1)).set; // the same photo as sample 1
    expect(validateSampleSet(set).problems.map(p => p.code)).toContain('duplicate-image');
  });

  it('five photos of the type\'s pages need no transcription: no problems at all', () => {
    const check = validateSampleSet(fullSet());
    expect(check.ready).toBe(true);
    expect(check.problems).toEqual([]);
  });

  it('turns a ready set into Phase 1 sample metadata: no pixels, no paths', () => {
    const set = fullSet();
    const meta = toSampleMetadata(set);
    expect(meta.map(m => [m.slot, m.category, m.transcription.mode])).toEqual([
      [1, 'latin-alphabet', 'prescribed'],
      [2, 'devanagari-alphabet', 'prescribed'],
      [3, 'latin-digits-text', 'prescribed'],
      [4, 'devanagari-text', 'prescribed'],
      [5, 'natural-text', 'prescribed'],
    ]);
    expect(meta[3].transcription.text).toBe(HINDI_SUGGESTED); // the exact page text
    expect(meta[4].scripts).toEqual(['Latn', 'Deva']);
    meta.forEach(m => {
      expect(validateSampleMetadata(m)).toEqual([]);
      expect(JSON.stringify(m)).not.toMatch(/file:|uri|cache/);
      expect(m.retained).toBe(false);
    });
    expect(analysisInputs(set).map(x => x.uri)).toEqual(SAMPLE_SLOTS.map(s => photo(s.slot).uri));
    expect(() => toSampleMetadata(createSampleSet())).toThrow('not complete');
  });

  it('never reports image quality as analysed', () => {
    const set = fullSet();
    for (const s of SAMPLE_SLOTS) {
      const st = slotStatus(set, s.slot);
      expect(st.qualityAnalysed).toBe(false);
      expect(st.sample.quality).toBe(QUALITY_NOT_ANALYSED);
      expect(Object.keys(st.sample.quality).sort()).toEqual(['message', 'status']); // no scores
    }
  });
});

// --- Image input -----------------------------------------------------------------------

describe('image input interface', () => {
  it('is unavailable without the native module — no fake picker', async () => {
    expect(NativeModules.HandWriteSamples).toBeUndefined();
    expect(isImageInputAvailable()).toBe(false);
    expect(await pickSampleImage()).toEqual({ status: 'unavailable' });
    expect(await releaseImages(['file:///x'])).toBe(0);
  });

  it('normalises picks, cancellations and errors (never rejects)', async () => {
    const input = fakeInput([{ ...photo(1), mime: 'IMAGE/JPEG', orientation: 6 }, null, Object.assign(new Error('no'), { code: 'permission-denied' }), new Error('boom')]);
    setImageInput(input);
    expect(isImageInputAvailable()).toBe(true);
    expect(await pickSampleImage()).toEqual({ status: 'picked', image: { ...photo(1), orientation: 6 } });
    expect(await pickSampleImage()).toEqual({ status: 'cancelled' });
    expect(await pickSampleImage()).toMatchObject({ status: 'error', code: 'permission-denied', advice: expect.stringMatching(/settings/) });
    expect(await pickSampleImage()).toMatchObject({ status: 'error', code: 'unknown' });
  });

  it('releases temporary copies best-effort', async () => {
    const input = fakeInput([]);
    input.releaseImage = jest.fn(async uri => {
      if (uri.endsWith('gone')) throw new Error('already cleared');
    });
    setImageInput(input);
    expect(await releaseImages(['file:///a', 'file:///gone', null, ''])).toBe(1);
    expect(input.releaseImage).toHaveBeenCalledTimes(2);
  });
});

// --- Wizard UI --------------------------------------------------------------------------

async function renderWizard() {
  const onBack = jest.fn();
  const r = await render(<CreateHandwritingScreen onBack={onBack} />);
  await chooseType(r);
  return { r, onBack };
}

describe('Create My Handwriting wizard', () => {
  it('shows five slots with their prompts, and says when photos cannot be chosen', async () => {
    const { r } = await renderWizard();
    for (const s of SAMPLE_SLOTS) {
      expect(queryByTestId(r, `sample-slot-${s.slot}`)).toBe(true);
      expect(text(r, `sample-status-${s.slot}`)).toBe('Photo needed');
      expect(byTestId(r, `sample-pick-${s.slot}`, 'accessibilityState').props.accessibilityState.disabled).toBe(true);
    }
    expect(text(r, 'sample-prompt-1')).toBe(SAMPLE_SLOTS[0].prompt);
    expect(text(r, 'sample-prompt-2')).toBe(SAMPLE_SLOTS[1].prompt);
    expect(queryByTestId(r, 'image-input-unavailable')).toBe(true);
    expect(text(r, 'sample-progress')).toBe('0 of 5 photos added');
  });

  it('chooses, previews, replaces, removes and reorders photos, releasing copies', async () => {
    const input = fakeInput([photo(1), photo(2), photo(3)]);
    setImageInput(input);
    const { r } = await renderWizard();
    expect(queryByTestId(r, 'image-input-unavailable')).toBe(false);
    await press(r, 'sample-pick-4');
    expect(byTestId(r, 'sample-preview-4').props.source).toEqual({ uri: photo(1).uri });
    expect(text(r, 'sample-meta-4')).toBe('3000 × 4000 · 2.3 MB · JPEG');
    expect(text(r, 'sample-quality-4')).toBe('Image quality: not checked yet');
    expect(text(r, 'sample-status-4')).toBe('Photo chosen');
    expect(text(r, 'sample-title-4')).toBe('Photo 4 · Everyday Hindi');
    await press(r, 'sample-pick-5');
    await press(r, 'sample-up-5'); // swap 4 and 5
    expect(byTestId(r, 'sample-preview-4').props.source.uri).toBe(photo(2).uri);
    expect(text(r, 'sample-title-5')).toBe('Photo 5 · Everyday Hindi'); // the page followed its photo
    expect(text(r, 'sample-title-4')).toBe('Photo 4 · English and Hindi together');
    await press(r, 'sample-pick-5'); // replace
    expect(input.released).toEqual([photo(1).uri]);
    await press(r, 'sample-remove-4');
    expect(input.released).toEqual([photo(1).uri, photo(2).uri]);
    expect(text(r, 'sample-status-4')).toBe('Photo needed');
    expect(text(r, 'sample-progress')).toBe('1 of 5 photos added');
  });

  it('shows problems and offers a retry after a failed pick; a cancel changes nothing', async () => {
    setImageInput(fakeInput([Object.assign(new Error('x'), { code: 'unreadable' }), null, photo(3, { mime: 'image/gif' })]));
    const { r } = await renderWizard();
    await press(r, 'sample-pick-3');
    expect(text(r, 'sample-status-3')).toBe('Try again');
    expect(text(r, 'sample-error-3')).toMatch(/could not be opened/);
    await press(r, 'sample-pick-3'); // cancelled
    expect(text(r, 'sample-status-3')).toBe('Photo needed');
    expect(queryByTestId(r, 'sample-error-3')).toBe(false);
    await press(r, 'sample-pick-3'); // a GIF
    expect(text(r, 'sample-status-3')).toBe('Needs a different photo');
    expect(textOf(byTestId(r, 'sample-problems-3'))).toMatch(/not supported/);
  });

  it('switches to the unavailable state if the module reports it', async () => {
    const input = fakeInput([]);
    setImageInput(input);
    const { r } = await renderWizard();
    setImageInput({ releaseImage: jest.fn() }); // pickImage no longer present
    await press(r, 'sample-pick-1');
    expect(queryByTestId(r, 'image-input-unavailable')).toBe(true);
  });

  it('offers no per-photo page, script or transcription choice', async () => {
    setImageInput(fakeInput([photo(5)]));
    const { r } = await renderWizard();
    await press(r, 'sample-pick-5');
    const ids = r.root.findAll(n => typeof n.props.testID === 'string').map(n => n.props.testID);
    expect(ids.filter(id => /^sample-(page|script|transcription|use-suggestion|suggestion)-/.test(id))).toEqual([]);
    expect(text(r, 'sample-prompt-5')).toBe(MIXED_SUGGESTED);
  });

  it('without analysis: five photos chosen, nothing analysed, no profile created, no analysis offered', async () => {
    setImageInput(fakeInput([photo(1), photo(2), photo(3), photo(4), photo(5)]));
    const { r } = await renderWizard();
    for (const s of SAMPLE_SLOTS) await press(r, `sample-pick-${s.slot}`);
    expect(text(r, 'sample-progress')).toBe('5 of 5 photos added');
    for (const s of SAMPLE_SLOTS) expect(text(r, `sample-quality-${s.slot}`)).toBe('Image quality: not checked yet');
    const all = r.root.findAll(n => typeof n.type !== 'string' && typeof n.props.children === 'string').map(n => n.props.children).join(' | ');
    expect(all).not.toMatch(/profile (is|was) (created|ready)|analy[sz]ed successfully/i);
    expect(text(r, 'analysis-unavailable-note')).toMatch(/Handwriting analysis is not available/);
    expect(byTestId(r, 'analyze-photos-button', 'accessibilityState').props.accessibilityState.disabled).toBe(true);
    expect(queryByTestId(r, 'review-step')).toBe(false);
  });

  it('says how many photos are still needed; Analyze Photos waits for all five', async () => {
    const { r } = await renderWizard();
    expect(byTestId(r, 'analyze-photos-button', 'accessibilityState').props.accessibilityState.disabled).toBe(true);
    expect(textOf(byTestId(r, 'photo-problems'))).toMatch(/Add all 5 photos \(0 added so far\)/);
  });

  it('asks before discarding chosen photos and releases them on leaving', async () => {
    const input = fakeInput([photo(1), photo(2)]);
    setImageInput(input);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { r, onBack } = await renderWizard();
    await press(r, 'sample-pick-1');
    await press(r, 'sample-pick-2');
    await press(r, 'back-button');
    expect(onBack).not.toHaveBeenCalled();
    const [, message, buttons] = alert.mock.calls[0];
    expect(message).toMatch(/originals are not deleted|original photos are not deleted/);
    await act(async () => buttons.find(b => b.text === 'Discard').onPress());
    expect(onBack).toHaveBeenCalled();
    expect(input.released.sort()).toEqual([photo(1).uri, photo(2).uri].sort());
    alert.mockRestore();
  });

  it('leaves without asking when nothing was chosen', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { r, onBack } = await renderWizard();
    await press(r, 'back-button'); // photos → the type step
    expect(onBack).not.toHaveBeenCalled();
    await press(r, 'back-button'); // the type step → the introduction
    expect(onBack).not.toHaveBeenCalled();
    await press(r, 'back-button'); // the introduction → out
    expect(alert).not.toHaveBeenCalled();
    expect(onBack).toHaveBeenCalled();
    alert.mockRestore();
  });

  it('releases copies held when the screen unmounts', async () => {
    const input = fakeInput([photo(1)]);
    setImageInput(input);
    const { r } = await renderWizard();
    await press(r, 'sample-pick-1');
    await act(async () => r.unmount());
    await flush();
    expect(input.released).toEqual([photo(1).uri]);
  });

  it('releases a photo that arrives after the wizard was closed (interrupted pick)', async () => {
    let resolve;
    const input = fakeInput([() => new Promise(res => (resolve = res))]);
    setImageInput(input);
    const { r } = await renderWizard();
    await act(async () => {
      byTestId(r, 'sample-pick-1', 'onPress').props.onPress();
    });
    // While the picker is open the button is busy.
    expect(byTestId(r, 'sample-pick-1', 'accessibilityState').props.accessibilityState.disabled).toBe(true);
    await act(async () => r.unmount());
    await act(async () => resolve(photo(9)));
    await flush();
    expect(input.released).toEqual([photo(9).uri]);
  });
});

// --- Entry point and isolation ----------------------------------------------------------

describe('entry point and isolation', () => {
  it('shows Create My Handwriting on Home only when the app passes it', async () => {
    const without = await render(<HomeScreen onNewDocument={jest.fn()} onOpenDocument={jest.fn()} />);
    expect(queryByTestId(without, 'create-handwriting-button')).toBe(false);
    const open = jest.fn();
    const withIt = await render(<HomeScreen onNewDocument={jest.fn()} onOpenDocument={jest.fn()} onCreateHandwriting={open} />);
    await press(withIt, 'create-handwriting-button');
    expect(open).toHaveBeenCalled();
    expect(queryByTestId(withIt, 'new-document-button')).toBe(true);
  });

  it('creates no profile and registers nothing; built-in defaults unchanged', async () => {
    setImageInput(fakeInput([photo(1)]));
    const { r } = await renderWizard();
    await press(r, 'sample-pick-1');
    expect(getHandwritingStyles().map(s => s.id)).toEqual(['reference_student', 'reference_student_lang2', 'reference_student_lang3']);
    expect(Object.keys(GLYPH_SETS)).toEqual(['lang1', 'lang2', 'lang3']);
    expect(Object.keys(GLYPH_FORMS)).toEqual(['lang3']);
    expect(createDocument().handwritingStyle).toBe('reference_student');
  });
});
