/**
 * Lang4 Phase 23 — the chosen handwriting type controls the whole wizard.
 *
 * Bug fixed: after choosing English, the photo cards still offered a
 * per-photo page choice and "your own writing" with Hindi suggested texts.
 * Now every photo shows its type's page (copied exactly), no photo has a
 * page, script or transcription choice, and a type is never shown text of
 * a script it does not write.
 */
import React from 'react';
import { clearAllMockStorages } from '@react-native-async-storage/async-storage';
import { HANDWRITING_TYPES } from '../src/handwriting/learn/handwritingTypes';
import { setImageInput } from '../src/handwriting/learn/imageInput';
import { PRACTICE_PAGES, practicePage, SAMPLE_SLOTS } from '../src/handwriting/learn/samplePrompts';
import { createSampleSet, plannedCoverage, selectImage } from '../src/handwriting/learn/sampleSet';
import { splitUnits } from '../src/handwriting/learn/textUnits';
import { PERSONAL_HANDWRITING_ONBOARDING, VALIDATION_TOOLS } from '../src/dev/flags';
import CreateHandwritingScreen from '../src/screens/CreateHandwritingScreen';
import { setStorageBackend } from '../src/storage/documentStorage';
import { act, press, render } from './helpers/render';
import { chooseType } from './helpers/wizard';

beforeEach(() => {
  clearAllMockStorages();
  setStorageBackend(null);
});
afterEach(() => setImageInput(null));

const DEVANAGARI = /[ऀ-ॿ]/;
const LATIN_LETTER = /[A-Za-z]/;
/** The scripts a text's letters and clusters are in (digits and signs are common to all). */
const scriptsIn = t => [...new Set(splitUnits(t).map(u => u.script))].filter(x => x === 'Latn' || x === 'Deva').sort();

// --- The pages each type uses ---------------------------------------------------------------------

describe('every type uses only pages of its own scripts', () => {
  it.each(HANDWRITING_TYPES.map(t => [t.id, t]))('%s', (_, type) => {
    expect(type.pages).toHaveLength(SAMPLE_SLOTS.length);
    for (const id of type.pages) {
      const page = practicePage(id);
      expect(page).not.toBeNull();
      page.scripts.forEach(sc => expect([id, type.scripts.includes(sc)]).toEqual([id, true]));
      scriptsIn(page.text).forEach(sc => expect([id, type.scripts.includes(sc)]).toEqual([id, true]));
      if (!type.scripts.includes('Deva')) expect([id, DEVANAGARI.test(page.text)]).toEqual([id, false]);
      if (!type.scripts.includes('Latn')) expect([id, LATIN_LETTER.test(page.text)]).toEqual([id, false]);
    }
    // Maths types include a maths page; the others do not.
    expect(type.pages.some(id => practicePage(id).category === 'maths')).toBe(type.maths);
  });

  it('English pages: alphabet, words and sentences, numbers and punctuation — and nothing in Hindi', () => {
    const english = HANDWRITING_TYPES.find(t => t.id === 'english');
    expect([...new Set(english.pages)].map(id => practicePage(id).title)).toEqual(['English alphabet', 'English words and sentences', 'Numbers, punctuation and a sentence', 'Everyday English']);
  });

  it.each(HANDWRITING_TYPES.map(t => [t.id, t]))('%s: whatever 3 photos are chosen, the suggested page is one of the type’s own', (_, type) => {
    const slots = SAMPLE_SLOTS.map(s => s.slot);
    for (let a = 0; a < 5; a++) {
      for (let b = a + 1; b < 5; b++) {
        for (let c = b + 1; c < 5; c++) {
          let set = createSampleSet(type.id);
          for (const n of [slots[a], slots[b], slots[c]]) set = selectImage(set, n, { uri: `file:///x/${n}.jpg`, mime: 'image/jpeg', width: 3000, height: 4000, bytes: 1000 + n }).set;
          const { suggestion } = plannedCoverage(set);
          if (suggestion) expect([suggestion.id, type.pages.includes(suggestion.id)]).toEqual([suggestion.id, true]);
        }
      }
    }
  });

  it('pages offered to no type stay out of the wizard', () => {
    const used = new Set(HANDWRITING_TYPES.flatMap(t => t.pages));
    expect(PRACTICE_PAGES.filter(p => !used.has(p.id)).map(p => p.id)).toEqual([]);
  });
});

// --- The wizard -------------------------------------------------------------------------------------

const strings = r => r.root.findAll(n => typeof n.type === 'string' && Array.isArray(n.children)).flatMap(n => n.children.filter(c => typeof c === 'string'));
const textOf = node => {
  const out = [];
  const walk = n => (typeof n === 'string' ? out.push(n) : n && n.children && n.children.forEach(walk));
  walk(node);
  return out.join('');
};
const byId = (r, id) => r.root.findAll(n => n.props.testID === id && typeof n.type !== 'string')[0];

describe('the wizard shows only the chosen type’s prompts', () => {
  it.each(HANDWRITING_TYPES.map(t => [t.id, t]))('%s', async (_, type) => {
    setImageInput({ pickImage: jest.fn(async () => null), releaseImage: jest.fn(), clearTemporaryImages: jest.fn(async () => 0) });
    const r = await render(<CreateHandwritingScreen onBack={jest.fn()} onSaved={jest.fn()} />);
    await chooseType(r, type.id);
    await act(async () => {});
    // Every photo: the type's page, to copy exactly.
    SAMPLE_SLOTS.forEach((s, i) => {
      const page = practicePage(type.pages[i]);
      expect(textOf(byId(r, `sample-title-${s.slot}`))).toBe(`Photo ${s.slot} · ${page.title}`);
      expect(textOf(byId(r, `sample-prompt-${s.slot}`))).toBe(page.text);
    });
    // No per-photo page, script or transcription choice; no suggested texts.
    const ids = r.root.findAll(n => typeof n.props.testID === 'string').map(n => n.props.testID);
    expect(ids.filter(id => /^sample-(page|script|transcription|use-suggestion|suggestion|scripts-detected)-/.test(id))).toEqual([]);
    const shown = strings(r).join('\n');
    expect(shown).not.toMatch(/My own writing|Suggested text|I copied the suggested text|English, Hindi or both/);
    // Never text of a script the type does not write.
    if (!type.scripts.includes('Deva')) expect(shown).not.toMatch(DEVANAGARI);
    if (!type.scripts.includes('Latn')) {
      SAMPLE_SLOTS.forEach(s => expect(textOf(byId(r, `sample-prompt-${s.slot}`))).not.toMatch(LATIN_LETTER));
    }
    // The coverage panel names only this type's requirements.
    const plan = textOf(byId(r, 'coverage-plan'));
    expect(/English/.test(plan)).toBe(type.scripts.includes('Latn'));
    expect(/Hindi/.test(plan)).toBe(type.scripts.includes('Deva'));
    expect(/maths/.test(plan)).toBe(type.maths);
  });

  it('changing the type re-labels every photo with the new type’s pages', async () => {
    setImageInput({ pickImage: jest.fn(async () => null), releaseImage: jest.fn(), clearTemporaryImages: jest.fn(async () => 0) });
    const r = await render(<CreateHandwritingScreen onBack={jest.fn()} onSaved={jest.fn()} />);
    await chooseType(r, 'hindi');
    expect(textOf(byId(r, 'sample-title-2'))).toBe('Photo 2 · Hindi words and sentences');
    await press(r, 'change-type');
    await press(r, 'type-english');
    await press(r, 'type-continue');
    expect(textOf(byId(r, 'sample-title-2'))).toBe('Photo 2 · English words and sentences');
    expect(strings(r).join('\n')).not.toMatch(DEVANAGARI);
  });
});

describe('release state', () => {
  it('onboarding stays tied to development / validation builds', () => {
    expect(PERSONAL_HANDWRITING_ONBOARDING).toBe(VALIDATION_TOOLS);
  });
});
