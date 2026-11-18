/**
 * Lang4 Phase 20 — the wizard's save when profile storage fails.
 *
 * Synthetic photos through a fake picker; storage is the app's (mock)
 * key-value store wrapped so that writing the version record or the profile
 * index can be made to fail, as a full or failing disk would. Checked: the
 * wizard leaves "Saving…", explains, lets the user retry; nothing partial
 * is listed; existing handwritings and documents are untouched; the retry
 * succeeds. Not a device test: real storage errors are untested.
 */
import React from 'react';
import { clearAllMockStorages } from '@react-native-async-storage/async-storage';
import { setImageInput } from '../src/handwriting/learn/imageInput';
import { buildProfileVersion } from '../src/handwriting/learn/profileBuilder';
import { clearPersonalCache } from '../src/handwriting/learn/personalStore';
import { createProfileVersion, listProfiles, readProfileVersion, versionKey } from '../src/handwriting/learn/profileRepository';
import { formatProfileRef, parseProfileRef } from '../src/handwriting/learn/profileSchema';
import { DEVANAGARI_ALPHABET, HINDI_SUGGESTED, LATIN_ALPHABET, LATIN_DIGITS_TEXT, MIXED_SUGGESTED, SAMPLE_SLOTS } from '../src/handwriting/learn/samplePrompts';
import { createDocument } from '../src/models/document';
import CreateHandwritingScreen from '../src/screens/CreateHandwritingScreen';
import { getDocument, getStorageBackend, saveDocument, setStorageBackend } from '../src/storage/documentStorage';
import { act, byTestId, changeText, press, queryByTestId, render } from './helpers/render';
import { ALL_DEFAULT, PARAMS, SOURCES, syntheticForm } from './helpers/syntheticProfile';
import { toBase64 } from './helpers/syntheticRaster';
import { syntheticTextPage } from './helpers/syntheticText';
import { chooseType } from './helpers/wizard';

jest.setTimeout(600000);

const outer = (r, id) => r.root.findAll(n => n.props.testID === id && typeof n.type !== 'string' && !(n.parent && n.parent.props.testID === id));
const textOf = node => {
  const out = [];
  const walk = n => (typeof n === 'string' ? out.push(n) : n && n.children && n.children.forEach(walk));
  walk(node);
  return out.join('');
};
const flush = async (n = 3) => {
  for (let i = 0; i < n; i++) {
    await act(async () => {
      await new Promise(res => setTimeout(res, 0));
    });
  }
};
async function waitFor(check, limit = 4000) {
  for (let i = 0; i < limit; i++) {
    if (check()) return;
    await flush(1);
  }
  throw new Error('condition not reached');
}

// --- Synthetic photos through a fake picker (as lang4Integration) --------------------------------

function photo(slot, text) {
  const lines = text.split('\n').length;
  const { raster } = syntheticTextPage(text, { width: 1400, xHeight: 26, stroke: 3, top: 104, lineGap: 104, marginX: 50, height: 104 * (lines + 1) + 40, jitter: 0.04 });
  return { raster, picked: { uri: `file:///cache/handwrite-samples/s${slot}.png`, mime: 'image/png', width: 3000, height: 4000, bytes: 2000000 + slot, orientation: 1 } };
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
// Phase 23: every photo shows its type's page. English + Hindi: photo 4 Everyday Hindi, photo 5 English and Hindi together.
const FREE_HINDI = HINDI_SUGGESTED;
const FREE_ENGLISH = MIXED_SUGGESTED;
const TEXTS = { 1: LATIN_ALPHABET, 2: DEVANAGARI_ALPHABET, 3: LATIN_DIGITS_TEXT, 4: FREE_HINDI, 5: FREE_ENGLISH };

async function wizardAtResult(onSaved) {
  setImageInput(fakeNativeInput(SAMPLE_SLOTS.map(s => photo(s.slot, TEXTS[s.slot]))));
  const r = await render(<CreateHandwritingScreen onBack={jest.fn()} onSaved={onSaved} />);
  await chooseType(r);
  for (const s of SAMPLE_SLOTS) {
    await press(r, `sample-pick-${s.slot}`);
  }
  await waitFor(() => SAMPLE_SLOTS.every(s => queryByTestId(r, `sample-quality-${s.slot}`) && /checked/.test(textOf(outer(r, `sample-quality-${s.slot}`)[0]))));
  await press(r, 'analyze-photos-button');
  await waitFor(() => queryByTestId(r, 'review-step'));
  expect(textOf(outer(r, 'build-status')[0])).toBe('Your handwriting is ready to save.');
  await press(r, 'review-continue');
  return r;
}

// --- Storage that fails on demand ---------------------------------------------------------------

/** The app's store; `fail` = 'version' | 'index' | null makes that write reject. Records every key written. */
function flakyStore() {
  const real = getStorageBackend();
  const state = { fail: null, written: [] };
  const failing = k => (state.fail === 'version' && /^profile:/.test(k)) || (state.fail === 'index' && k === 'profiles:index');
  setStorageBackend({
    getItem: k => real.getItem(k),
    setItem: (k, v) => {
      if (failing(k)) return Promise.reject(new Error('disk full'));
      state.written.push(k);
      return real.setItem(k, v);
    },
    removeItem: k => real.removeItem(k),
  });
  return { state, real };
}

/** A handwriting and a document already on the device, which a failed save must not touch. */
async function existingData() {
  const units = { h: { coverage: 'observed', forms: [syntheticForm(0.6)] } };
  const built = buildProfileVersion({ id: 'p-older0-aa', version: 1, name: 'Older hand', now: 1760000000000, profileCreatedAt: 1760000000000, synthetic: true, scripts: ['Latn'], sources: SOURCES, metrics: {}, params: PARAMS, paramSources: ALL_DEFAULT, units });
  await createProfileVersion(built.profile);
  const doc = await saveDocument({ ...createDocument({ handwritingStyle: formatProfileRef('p-older0-aa', 1) }), content: 'hh' });
  const store = getStorageBackend();
  return {
    doc,
    snapshot: async () => ({ index: await store.getItem('profiles:index'), older: await store.getItem(versionKey('p-older0-aa', 1)), doc: await store.getItem(`document:${doc.id}`) }),
  };
}

// While the handwriting is being created there is no Save button at all (the creating screen); a
// failure returns to the name step with the button enabled and the error shown.
const saveState = r => ({
  disabled: queryByTestId(r, 'save-handwriting-button') ? byTestId(r, 'save-handwriting-button', 'accessibilityState').props.accessibilityState.disabled : true,
  label: queryByTestId(r, 'save-handwriting-button') ? textOf(outer(r, 'save-handwriting-button')[0]) : 'Creating…',
  error: queryByTestId(r, 'save-error') ? textOf(outer(r, 'save-error')[0]) : null,
});

beforeEach(() => {
  clearAllMockStorages();
  setStorageBackend(null);
  clearPersonalCache();
});
afterEach(() => setImageInput(null));

describe('saving a new handwriting when storage fails', () => {
  it('fails cleanly, keeps everything else intact, and the retry succeeds', async () => {
    const existing = await existingData();
    const before = await existing.snapshot();
    const { state, real } = flakyStore();
    const onSaved = jest.fn();
    const r = await wizardAtResult(onSaved);
    await changeText(r, 'profile-name-input', 'My hand');

    // 1. The version record cannot be written.
    state.fail = 'version';
    await press(r, 'save-handwriting-button');
    await waitFor(() => saveState(r).error !== null);
    expect(saveState(r)).toEqual({ disabled: false, label: 'Save Handwriting', error: 'Your handwriting could not be saved. Please try again.' });
    expect(onSaved).not.toHaveBeenCalled();
    expect(state.written.filter(k => /^profile/.test(k))).toEqual([]); // nothing written at all
    expect(await existing.snapshot()).toEqual(before);
    expect((await listProfiles()).map(p => p.id)).toEqual(['p-older0-aa']);

    // 2. The record is written but the index cannot be: nothing is listed, nothing else changes.
    state.fail = 'index';
    await press(r, 'save-handwriting-button');
    await waitFor(() => saveState(r).error !== null && !saveState(r).disabled);
    expect(saveState(r).error).toBe('Your handwriting could not be saved. Please try again.');
    expect(onSaved).not.toHaveBeenCalled();
    const stray = state.written.filter(k => /^profile:/.test(k));
    expect(stray).toHaveLength(1); // the unlisted record of this attempt
    expect(await existing.snapshot()).toEqual(before);
    expect((await listProfiles()).map(p => p.id)).toEqual(['p-older0-aa']);

    // 3. Storage works again: the same save completes (the unlisted record is listed, not rewritten).
    state.fail = null;
    await press(r, 'save-handwriting-button');
    await waitFor(() => onSaved.mock.calls.length > 0);
    const ref = onSaved.mock.calls[0][0];
    const { id, version } = parseProfileRef(ref);
    expect(version).toBe(1);
    expect(stray).toEqual([versionKey(id, 1)]);
    expect(state.written.filter(k => k === versionKey(id, 1))).toHaveLength(1); // written once, never overwritten
    expect((await readProfileVersion(id, 1)).profile.name).toBe('My hand');
    expect((await listProfiles()).map(p => p.id).sort()).toEqual(['p-older0-aa', id].sort());
    // The existing handwriting and document are exactly as they were.
    expect(await real.getItem(versionKey('p-older0-aa', 1))).toBe(before.older);
    expect((await getDocument(existing.doc.id)).handwritingStyle).toBe(formatProfileRef('p-older0-aa', 1));
    expect(await real.getItem(`document:${existing.doc.id}`)).toBe(before.doc);
  });

  it('a retry with a changed name never overwrites the earlier unlisted record', async () => {
    const { state, real } = flakyStore();
    const onSaved = jest.fn();
    const r = await wizardAtResult(onSaved);
    await changeText(r, 'profile-name-input', 'First name');
    state.fail = 'index';
    await press(r, 'save-handwriting-button');
    await waitFor(() => saveState(r).error !== null && !saveState(r).disabled);
    const [strayKey] = state.written.filter(k => /^profile:/.test(k));
    const strayRecord = await real.getItem(strayKey);

    state.fail = null;
    await changeText(r, 'profile-name-input', 'Second name');
    await press(r, 'save-handwriting-button');
    await waitFor(() => onSaved.mock.calls.length > 0);
    const { id } = parseProfileRef(onSaved.mock.calls[0][0]);
    expect(versionKey(id, 1)).not.toBe(strayKey); // saved under a new id
    expect((await readProfileVersion(id, 1)).profile.name).toBe('Second name');
    expect(await real.getItem(strayKey)).toBe(strayRecord); // the unlisted record is untouched
    expect((await listProfiles()).map(p => p.name)).toEqual(['Second name']); // and never listed
  });
});
