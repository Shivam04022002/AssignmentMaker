/**
 * Lang4 Phase 13 — handwriting coverage and profile readiness.
 *
 * Prompts are audited as text (what they can teach). Profiles here are
 * SYNTHETIC: either straight-line forms for every unit a complete set of
 * samples could teach, or geometric pseudo-glyph pages run through the
 * pipeline, scored against their own ground truth. No real Hindi sample
 * exists: nothing here is evidence of real handwriting accuracy.
 */
import React from 'react';
import { clearAllMockStorages } from '@react-native-async-storage/async-storage';
import { analyzeSample } from '../src/handwriting/learn/analyzeSample';
import { dotMarkNames } from '../src/handwriting/learn/glyphExtraction';
import { setImageInput } from '../src/handwriting/learn/imageInput';
import { layoutPersonalText, paginatePersonal, personalPaths } from '../src/handwriting/learn/personalRenderer';
import { clearPersonalCache } from '../src/handwriting/learn/personalStore';
import { languageSupport, REQUIRED_SETS, REQUIREMENTS, SET_INFO } from '../src/handwriting/learn/profileGeneration';
import { buildProfileVersion } from '../src/handwriting/learn/profileBuilder';
import { createProfileVersion } from '../src/handwriting/learn/profileRepository';
import { resolveText } from '../src/handwriting/learn/rendererAdapter';
import { DEVANAGARI_ALPHABET, HINDI_SUGGESTED, LATIN_ALPHABET, LATIN_DIGITS_TEXT, MIXED_SUGGESTED, SAMPLE_SLOTS } from '../src/handwriting/learn/samplePrompts';
import { splitUnits, UNIT_KIND } from '../src/handwriting/learn/textUnits';
import { exportBlocker } from '../src/export/ExportRenderer';
import { getHandwritingStyle } from '../src/data/handwritingStyles';
import { getPageMetrics, getPageType, rowHeightFor } from '../src/data/paper';
import { PERSONAL_HANDWRITING_ONBOARDING, VALIDATION_TOOLS } from '../src/dev/flags';
import CreateHandwritingScreen from '../src/screens/CreateHandwritingScreen';
import ProfileDetailsScreen from '../src/screens/ProfileDetailsScreen';
import { setStorageBackend } from '../src/storage/documentStorage';
import { act, byTestId, press, queryByTestId, render } from './helpers/render';
import { ALL_DEFAULT, PARAMS, SOURCES, syntheticForm } from './helpers/syntheticProfile';
import { toBase64 } from './helpers/syntheticRaster';
import { syntheticTextPage } from './helpers/syntheticText';
import { chooseType } from './helpers/wizard';

jest.setTimeout(300000);

beforeEach(() => {
  clearAllMockStorages();
  setStorageBackend(null);
  clearPersonalCache();
});
afterEach(() => setImageInput(null));

const keysIn = (text, keep = () => true) => new Set(splitUnits(text).filter(u => u.kind !== UNIT_KIND.SPACE && keep(u)).map(u => u.key));
const ALL_PROMPTS = [LATIN_ALPHABET, DEVANAGARI_ALPHABET, LATIN_DIGITS_TEXT, HINDI_SUGGESTED, MIXED_SUGGESTED].join('\n');
const PRESCRIBED = [LATIN_ALPHABET, DEVANAGARI_ALPHABET, LATIN_DIGITS_TEXT].join('\n');

// Held-out documents: written for this test, not taken from any prompt.
const HINDI_DOC = [
  'आज हमारे विद्यालय में खेल दिवस था। सभी बच्चे सुबह जल्दी आ गए।',
  'मेरी बहन ने दौड़ में पहला स्थान पाया और सबने ताली बजाई।',
  'शाम को हम सब घर लौटे और माँ ने गरम खाना बनाया।',
].join('\n');
const ENGLISH_DOC = [
  'Q1. Explain the water cycle in your own words. (5 marks)',
  'Water evaporates from rivers, lakes and seas; it rises, cools and forms clouds.',
  'When the drops grow heavy, they fall as rain — about 70% of it returns to the sea!',
].join('\n');
const MIXED_DOC = ['Q2. भारत की राजधानी क्या है? (2 marks)', 'Ans: नई दिल्ली। It is a large city.', 'मेरे दोस्त ने कहा: "Let us meet at 5 pm."'].join('\n');

describe('prompt audit: what the five samples can teach', () => {
  const taught = keysIn(ALL_PROMPTS);

  it('covers Latin letters, digits and common punctuation', () => {
    for (const ch of 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,;:?!()-"\'/%&+=₹') expect([ch, taught.has(ch)]).toEqual([ch, true]);
  });

  it('covers Devanagari vowels, consonants, matras, nukta letters, conjuncts and the danda', () => {
    const want = [
      ...'अ आ इ ई उ ऊ ऋ ए ऐ ओ औ'.split(' '),
      ...'क ख ग घ च छ ज झ ट ठ ड ढ ण त थ द ध न प फ ब भ म य र ल व श ष स ह'.split(' '),
      ...'का कि की कु कू कृ के कै को कौ कं कँ कः क्'.split(' '),
      ...'क़ ख़ ग़ ज़ ड़ ढ़ फ़'.split(' '),
      ...'क्ष त्र ज्ञ श्र द्ध प्र'.split(' '),
      '।',
    ];
    want.forEach(k => expect([k, taught.has(k)]).toEqual([k, true]));
  });

  it('the suggested texts add the everyday clusters the alphabet sample cannot teach (ता ना दी मा …)', () => {
    const prescribed = keysIn(PRESCRIBED);
    const suggested = keysIn(HINDI_SUGGESTED);
    for (const k of ['ता', 'ना', 'दी', 'मा', 'ने', 'है', 'हैं', 'में', 'से', 'जी', 'ती', 'ला', 'रा', '।']) {
      expect([k, prescribed.has(k), suggested.has(k)]).toEqual([k, false, true]);
    }
    // Ordinary sentences, not a list of clusters: the wizard asks for 5–8 lines.
    const lines = HINDI_SUGGESTED.split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(5);
    expect(lines.length).toBeLessThanOrEqual(8);
    lines.forEach(l => expect(l).toMatch(/[।?]$/));
    expect(MIXED_SUGGESTED.split('\n').length).toBeGreaterThanOrEqual(8);
  });

  it('punctuation is written inside words, where word spacing can tell the marks apart', () => {
    const [, ...rows] = LATIN_DIGITS_TEXT.split('\n');
    const marks = rows.slice(0, -1).join(' ');
    for (const u of splitUnits(marks).filter(x => x.kind === UNIT_KIND.PUNCTUATION || x.kind === UNIT_KIND.SYMBOL)) {
      const around = marks.slice(Math.max(0, u.start - 1), u.end + 1).replace(u.text, '');
      expect([u.text, /\S/.test(around)]).toEqual([u.text, true]);
    }
  });

  it('slots 4 and 5 offer a suggestion; slots 1–3 stay prescribed', () => {
    expect(SAMPLE_SLOTS.map(s => [s.slot, s.transcription, !!s.suggestion])).toEqual([
      [1, 'prescribed', false],
      [2, 'prescribed', false],
      [3, 'prescribed', false],
      [4, 'optional', true],
      [5, 'optional', true],
    ]);
  });
});

describe('required and optional coverage', () => {
  it('a set is required exactly when a requirement gates the profile on it', () => {
    const gated = new Set([...REQUIREMENTS.Latn, ...REQUIREMENTS.Deva, ...REQUIREMENTS.Math].map(r => r.set));
    Object.entries(SET_INFO).forEach(([set, info]) => expect([set, info.required]).toEqual([set, gated.has(set)]));
    expect(Object.keys(SET_INFO).sort()).toEqual(Object.keys(REQUIRED_SETS).sort());
    expect(REQUIRED_SETS.latinExtra.join('')).toBe('0123456789.,;:?!()-"\'/%&+=₹');
    expect(REQUIRED_SETS.devaEveryday).toEqual(expect.arrayContaining(['ता', 'ना', 'दी', 'मा', '।']));
  });

  const learnedUnits = keys => Object.fromEntries(keys.map(k => [k, { coverage: 'observed', forms: [syntheticForm()] }]));
  const all = [...new Set(Object.values(REQUIRED_SETS).flat())];

  it('all-required only when every required character is learned — and never claims the whole language', () => {
    const s = languageSupport(learnedUnits(all), ['Latn', 'Deva']);
    expect(s.Latn.level).toBe('all-required');
    expect(s.Deva.level).toBe('all-required');
    expect(s.Deva.optional.missing).toEqual([]);
    // Optional counts leave out what is already required (का is in both).
    expect(s.Deva.required.total + s.Deva.optional.total).toBe(new Set([...REQUIRED_SETS.devaConsonants, ...REQUIRED_SETS.devaPrompt, ...REQUIRED_SETS.devaEveryday]).size);
    for (const t of [s.Latn.text, s.Deva.text]) {
      expect(t).not.toMatch(/complete|fully|every (Hindi|English)|whole language|full support/i);
      expect(t).toMatch(/dashed boxes/);
    }
    expect(s.Deva.text).toMatch(/^Hindi: all \d+ required clusters learned; optional \d+ of \d+\. Other clusters are written only once learned/);
  });

  it('partial when required characters are missing, naming each one', () => {
    const units = learnedUnits(all.filter(k => !['ख', 'ज्ञ', 'Q'].includes(k)));
    units['ख'] = { coverage: 'missing', forms: [] };
    const s = languageSupport(units, ['Latn', 'Deva']);
    expect(s.Deva.level).toBe('partial');
    expect(s.Deva.required.missing.sort()).toEqual(['ख', 'ज्ञ'].sort());
    expect(s.Deva.text).toMatch(/^Hindi: usable, but 2 required clusters are missing \(.*ख.*\)/);
    expect(s.Latn.text).toMatch(/1 required characters are missing \(Q\)/);
    expect(s.Deva.text).not.toMatch(/all \d+ required/);
  });

  it('insufficient when a requirement fails, and optional gaps are listed by character', () => {
    const units = learnedUnits(all.filter(k => !['ता', ';', '₹'].includes(k)));
    const s = languageSupport(units, ['Latn', 'Deva'], [{ script: 'Deva', pass: false }, { script: 'Latn', pass: true }]);
    expect(s.Deva.level).toBe('insufficient');
    expect(s.Deva.text).toMatch(/^Hindi: not enough learned to write it/);
    expect(s.Latn.level).toBe('all-required');
    expect(s.Latn.text).toMatch(/optional 25 of 27 \(missing ; ₹\)/);
    expect(s.Deva.optional.missing).toEqual(['ता']);
  });
});

// --- A complete synthetic profile: every unit the five samples (with the suggestions) can teach -------

const line = (x0, y0, x1, y1) => [x0, y0, x0 + (x1 - x0) / 3, y0 + (y1 - y0) / 3, x0 + ((x1 - x0) * 2) / 3, y0 + ((y1 - y0) * 2) / 3, x1, y1];
function completeProfile({ id = 'p-test13-ab', drop = [] } = {}) {
  const units = {};
  for (const k of keysIn(ALL_PROMPTS)) {
    if (drop.includes(k)) continue;
    const deva = /[ऀ-ॿ]/.test(k) && k !== '।';
    units[k] = deva
      ? { coverage: 'observed', forms: [syntheticForm(0.9, [line(0, 1, 0.9, 1), line(0.75, 1, 0.75, 0)]), syntheticForm(0.85, [line(0, 1, 0.85, 1), line(0.7, 1, 0.72, 0)])] }
      : { coverage: 'observed', forms: [syntheticForm(0.55, [line(0.1, 0, 0.1, 1), line(0.1, 0.5, 0.45, 0.5)]), syntheticForm(0.5, [line(0.1, 0, 0.12, 1)])] };
  }
  const r = buildProfileVersion({ id, version: 1, name: 'Synthetic complete', now: 1760000000000, synthetic: true, scripts: ['Latn', 'Deva'], sources: SOURCES, metrics: {}, params: PARAMS, paramSources: ALL_DEFAULT, units });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.profile;
}

describe('complete synthetic profiles against realistic documents', () => {
  const p = completeProfile();
  const ref = 'personal:p-test13-ab@1';
  const type = getPageType('ruled');
  const style = getHandwritingStyle(ref);
  const metrics = getPageMetrics({ pageType: type.id, style });
  const rowHeight = rowHeightFor(type, metrics, style);
  const page = (content, extra = {}) => paginatePersonal({ content, resolution: { status: 'ok', profile: p }, metrics, rowHeight, seed: 'doc13', ...extra });
  const expectedMissing = text => resolveText(p, text).filter(u => u.status === 'unsupported').map(u => u.text);

  it.each([
    ['Hindi', HINDI_DOC],
    ['English', ENGLISH_DOC],
    ['mixed English / Hindi', MIXED_DOC],
  ])('%s: wraps, paginates and draws every learned unit; lists exactly what it cannot write', (_, doc) => {
    const content = Array.from({ length: 12 }, () => doc).join('\n');
    const out = page(content);
    expect(out.pages.length).toBeGreaterThan(1);
    // Pages cover the text in order: each its own range, nothing but whitespace between them.
    expect(out.pages[0].start).toBe(0);
    expect(out.pages[out.pages.length - 1].end).toBe(content.length);
    out.pages.forEach((pg, i) => {
      expect(pg.text).toBe(content.slice(pg.start, pg.end));
      if (i) expect(content.slice(out.pages[i - 1].end, pg.start)).toMatch(/^\s*$/);
    });
    expect(out.unsupported.map(u => u.text)).toEqual(expectedMissing(content));
    out.unsupported.forEach(u => {
      expect(content.slice(u.start, u.end)).toBe(u.text);
      expect(['missing', 'not-learned', 'orphan-mark', 'unsupported-script']).toContain(u.reason);
    });
    const items = out.pages.flatMap(pg => pg.lines).flatMap(l => l.words).flatMap(w => w.items);
    items.filter(i => i.kind === 'glyph').forEach(i => expect(p.units[i.key].forms.length).toBeGreaterThan(0));
    expect(items.filter(i => i.kind === 'missing').length).toBe(out.unsupported.length);
    // Export draws every page from the profile: strokes for glyphs, a marker per missing unit.
    expect(exportBlocker(out)).toBeNull();
    out.pages.forEach(pg => {
      const g = personalPaths(pg.lines, p, { xHeight: out.layout.personal.xHeight, rowHeight, baselineInRow: rowHeight - 1 });
      const missing = pg.lines.flatMap(l => l.words).flatMap(w => w.items).filter(i => i.kind === 'missing').length;
      expect(g.markers).toHaveLength(missing);
      expect(g.paths.length).toBeGreaterThan(0);
    });
    expect(page(content)).toEqual(out); // deterministic
  });

  it('the held-out English document is written in full; Hindi shows the gaps a real profile would have', () => {
    expect(expectedMissing(ENGLISH_DOC)).toEqual([]);
    const hindi = expectedMissing(HINDI_DOC);
    expect(hindi.length).toBeGreaterThan(0); // no prompt set teaches every cluster
    hindi.forEach(k => expect(keysIn(ALL_PROMPTS).has(k)).toBe(false));
    // What the suggested text adds is drawn: ता in ताली, ने, में, माँ.
    const units = resolveText(p, HINDI_DOC).filter(u => u.status === 'glyph').map(u => u.text);
    expect(units).toEqual(expect.arrayContaining(['ता', 'ने', 'में', 'माँ', '।']));
  });

  it('formatting applies to a mixed document: heading, underline, colour and size', () => {
    const content = 'जल चक्र\nWater cycle notes\nबादल बनते हैं।';
    const formatting = {
      headings: [{ start: 0, end: 7, underline: true }],
      underlines: [{ start: 8, end: 13 }],
      labels: [],
      spans: [
        { start: 14, end: 19, color: '#C62828' },
        { start: 26, end: 30, size: 1.2 },
      ],
      gaps: [],
      autoLabels: true,
    };
    const out = page(content, { formatting });
    const lines = out.pages[0].lines;
    expect(lines[0].heading).toBe(true);
    expect(lines[0].underlines).toHaveLength(1);
    expect(lines[1].underlines).toHaveLength(1);
    const g = personalPaths(lines, p, { xHeight: out.layout.personal.xHeight, rowHeight, baselineInRow: rowHeight - 1 });
    expect(g.styled.some(st => st.color === '#C62828')).toBe(true);
    expect(page(content, { formatting })).toEqual(out);
  });

  it('a long document chooses variants deterministically, the same for the same profile version', () => {
    const a = layoutPersonalText(HINDI_DOC + '\n' + ENGLISH_DOC, p, { xHeight: 20, contentWidth: 600, seed: 's13' });
    const b = layoutPersonalText(HINDI_DOC + '\n' + ENGLISH_DOC, completeProfile(), { xHeight: 20, contentWidth: 600, seed: 's13' });
    expect(a).toEqual(b);
    const forms = a.lines.flatMap(l => l.words).flatMap(w => w.items).filter(i => i.kind === 'glyph').map(i => i.form);
    expect(new Set(forms).size).toBe(2); // both learned variants appear
  });

  it('the details screen states what the profile can write, required and optional apart', async () => {
    const partial = completeProfile({ id: 'p-test13-cd', drop: ['ख', 'ता', 'Q'] });
    await createProfileVersion(partial);
    const r = await render(<ProfileDetailsScreen profileId="p-test13-cd" onBack={jest.fn()} />);
    for (let i = 0; i < 50 && !queryByTestId(r, 'support-Deva'); i++) {
      await act(async () => {
        await new Promise(res => setTimeout(res, 0));
      });
    }
    const text = id => {
      const out = [];
      const walk = n => (typeof n === 'string' ? out.push(n) : n && n.children && n.children.forEach(walk));
      walk(byTestId(r, id));
      return out.join('');
    };
    expect(text('support-Deva')).toMatch(/^Hindi: usable, but 1 required clusters are missing \(ख\); optional \d+ of \d+ \(missing ता\)/);
    expect(text('support-Latn')).toMatch(/^English: usable, but 1 required characters are missing \(Q\)/);
  });
});

// --- The pipeline on the suggested texts (synthetic pages) -----------------------------------

async function analysed(text, o = {}) {
  const lines = text.split('\n').length;
  const pg = syntheticTextPage(text, { width: 1400, xHeight: 26, stroke: 3, top: 104, lineGap: 104, marginX: 50, height: 104 * (lines + 1) + 40, ...o });
  return analyzeSample(pg.raster, { slot: 4, knownText: text, sampleId: 's4', revision: 1, yieldFn: async () => {}, extract: true });
}

describe('the suggested Hindi text through the pipeline (synthetic, marks written apart)', () => {
  it('learns the high-value clusters and the danda; every refusal gives a specific reason', async () => {
    const r = await analysed(HINDI_SUGGESTED, { marksApart: true });
    const got = new Set(r.extraction.units.filter(u => u.status === 'extracted').map(u => u.text));
    ['ता', 'ना', 'दी', 'मा', 'ने', '।'].forEach(k => expect([k, got.has(k)]).toEqual([k, true]));
    r.extraction.units
      .filter(u => u.status === 'rejected')
      .forEach(u => {
        expect(u.reasons.length).toBeGreaterThan(0);
        expect(u.reasons.join(' ').length).toBeGreaterThan(20);
        expect(u.form).toBeUndefined();
      });
  });

  it('a dot run into the strokes is refused naming the mark (anusvara, nukta …), never stored without it', async () => {
    const r = await analysed(HINDI_SUGGESTED);
    const merged = r.extraction.units.filter(u => u.code === 'marks-merged');
    expect(merged.length).toBeGreaterThan(0);
    merged.forEach(u => expect(u.reasons[0]).toMatch(new RegExp(`^the ${dotMarkNames(u.text)} of “${u.text}” should be`)));
    r.extraction.units.filter(u => u.code === 'neighbour-uncertain' && /missing its/.test(u.reasons[0])).forEach(u => expect(u.reasons[0]).toMatch(/missing its (anusvara|nukta|visarga|chandrabindu)/));
    expect(dotMarkNames('हैं')).toBe('anusvara');
    expect(dotMarkNames('ज़ं')).toBe('nukta and anusvara');
  });
});

// --- The wizard ------------------------------------------------------------------------------

describe('the wizard: the suggested texts are pages to copy (Phase 23)', () => {
  it('English + Hindi: photo 4 copies Everyday Hindi, photo 5 the mixed text — as fixed pages, not suggestions', async () => {
    const { raster } = syntheticTextPage('कमल', { width: 600, xHeight: 26, stroke: 3, top: 104, lineGap: 104, marginX: 50, height: 260 });
    const picked = { uri: 'file:///cache/handwrite-samples/s4.png', mime: 'image/png', width: 3000, height: 4000, bytes: 2000004, orientation: 1 };
    setImageInput({
      pickImage: jest.fn(async () => picked),
      decodeForAnalysis: jest.fn(async () => ({ width: raster.width, height: raster.height, encoding: 'gray8-base64', data: toBase64(raster.data), sourceWidth: raster.width * 2, sourceHeight: raster.height * 2, orientation: 1, orientationApplied: true, decodeMillis: 5 })),
      releaseImage: jest.fn(async () => {}),
      clearTemporaryImages: jest.fn(async () => 0),
    });
    const r = await render(<CreateHandwritingScreen onBack={jest.fn()} onSaved={jest.fn()} />);
    await chooseType(r);
    const prompt = n => {
      const out = [];
      const walk = x => (typeof x === 'string' ? out.push(x) : x && x.children && x.children.forEach(walk));
      walk(r.root.findAll(x => x.props.testID === `sample-prompt-${n}` && typeof x.type !== 'string')[0]);
      return out.join('');
    };
    expect(prompt(4)).toBe(HINDI_SUGGESTED);
    expect(prompt(5)).toBe(MIXED_SUGGESTED);
    await press(r, 'sample-pick-4');
    expect(queryByTestId(r, 'sample-use-suggestion-4')).toBe(false);
    expect(queryByTestId(r, 'sample-transcription-4')).toBe(false);
  });
});

describe('release state', () => {
  it('onboarding stays tied to development / validation builds', () => {
    expect(PERSONAL_HANDWRITING_ONBOARDING).toBe(VALIDATION_TOOLS);
  });
});
