/**
 * Lang4 Phase 14 — real handwriting validation: the protocol's tooling and
 * the one fix the real pages supported.
 *
 * The REAL-image runs are opt-in (realProtocol.optin.test.js; images stay
 * local). Here, the protocol tooling is checked on SYNTHETIC pages whose
 * truth is known — the measurement must be right before it measures real
 * pages — and the alignment fix found on a real ruled page (a rule fragment
 * taken for the word “Market”) is pinned with constructed regions.
 */
import fs from 'fs';
import path from 'path';
import { analyzeSample } from '../src/handwriting/learn/analyzeSample';
import { prepareExpectedText } from '../src/handwriting/learn/expectedText';
import { splitUnits } from '../src/handwriting/learn/textUnits';
import { alignWords, FLAT_REGION, isFlatRegion } from '../src/handwriting/learn/wordAlignment';
import { PERSONAL_HANDWRITING_ONBOARDING, VALIDATION_TOOLS } from '../src/dev/flags';
import { REAL_CONDITIONS } from './helpers/realConditions';
import { analysisToOriginal, assertPrivate, missingSlots, summarizeAnalysis, truthWords, unitFeatures, validateManifest } from './helpers/realProtocol';
import { syntheticTextPage } from './helpers/syntheticText';

jest.setTimeout(300000);

const TRUTH_DIR = path.join(__dirname, 'realTruth');
const readJson = f => JSON.parse(fs.readFileSync(path.join(TRUTH_DIR, f), 'utf8'));

// --- Manifest --------------------------------------------------------------------------------

const sample = (o = {}) => ({
  id: 'hindi-para',
  file: 'hindi.png',
  slot: 4,
  scripts: ['Deva'],
  transcription: 'माता जी ने दादी को चाय दी।',
  capture: { lighting: 'even', paper: 'ruled', writingSize: 'normal', skewDeg: 1, perspective: true },
  provenance: { source: 'my own handwriting, phone photo', consent: true },
  ...o,
});

describe('the sample manifest', () => {
  it('the reference manifest is valid and its truth follows its transcriptions word for word', () => {
    const m = readJson('reference.manifest.json');
    expect(validateManifest(m)).toEqual([]);
    expect(missingSlots(m)).toEqual([1, 2, 3, 4]);
    const truth = readJson('reference-pages.words.json');
    for (const s of m.samples.filter(x => x.truth)) {
      const page = s.truth.split('#')[1];
      const words = truthWords(truth.pages[page], s.transcription);
      expect(words.length).toBe(s.transcription.split(/\s+/).filter(Boolean).length);
      truth.pages[page].lines.forEach(l => l.words.forEach((w, k) => {
        expect(w[2]).toBeGreaterThan(w[1]);
        if (k) expect(w[1]).toBeGreaterThanOrEqual(l.words[k - 1][2]);
      }));
    }
  });

  it('lists every problem: paths, format, slot, scripts, capture, consent', () => {
    expect(validateManifest({ version: 1, samples: [sample()] })).toEqual([]);
    const bad = validateManifest({
      version: 1,
      samples: [
        sample({ file: 'C:/Users/me/hindi.png' }),
        sample({ id: 'b', file: '../x.png' }),
        sample({ id: 'c', file: 'x.jpg' }),
        sample({ id: 'd', slot: 9 }),
        sample({ id: 'e', scripts: ['Latn'] }),
        sample({ id: 'f', capture: { lighting: 'sunny', paper: 'ruled', writingSize: 'normal', skewDeg: 0, perspective: false } }),
        sample({ id: 'g', provenance: { source: 'friend', consent: false } }),
        sample({ id: 'g' }),
        sample({ id: 'h', transcription: '' }),
      ],
    });
    for (const want of [/samples\[0\]\.file/, /samples\[1\]\.file/, /samples\[2\]\.file/, /samples\[3\]\.slot/, /samples\[4\]\.scripts: the transcription contains Deva/, /samples\[5\]\.capture\.lighting/, /samples\[6\]\.provenance\.consent/, /samples\[7\]\.id: duplicate/, /samples\[8\]\.transcription/]) {
      expect(bad.some(e => want.test(e))).toBe(true);
    }
    expect(validateManifest({ version: 2, samples: [] })).toEqual(expect.arrayContaining(['version: must be 1']));
  });
});

// --- Script features ------------------------------------------------------------------------

describe('script features the protocol reports separately', () => {
  const features = text => splitUnits(text).filter(u => u.kind !== 'space').map(u => [u.text, unitFeatures(u)]);

  it('Devanagari: vowels, consonants, matras by position, nukta, conjuncts, halant, anusvara / visarga, danda', () => {
    const f = Object.fromEntries(features('अ कि की कु के ज़ क्ष क् कं दुःख।'));
    expect(f['अ']).toEqual(['deva-vowel']);
    expect(f['कि']).toEqual(['deva-consonant', 'deva-matra-pre']);
    expect(f['की']).toEqual(['deva-consonant', 'deva-matra-post']);
    expect(f['कु']).toEqual(['deva-consonant', 'deva-matra-below']);
    expect(f['के']).toEqual(['deva-consonant', 'deva-matra-above']);
    expect(f['ज़']).toEqual(['deva-consonant', 'deva-nukta']);
    expect(f['क्ष']).toEqual(['deva-consonant', 'deva-conjunct']);
    expect(f['क्']).toEqual(['deva-consonant', 'deva-halant']);
    expect(f['कं']).toEqual(['deva-consonant', 'deva-anusvara-visarga']);
    expect(f['।']).toEqual(['danda']);
  });

  it('Latin letters, capitals, digits and punctuation; mixed-script lines are marked', () => {
    expect(features('Ab 7,')).toEqual([['A', ['latin-capital']], ['b', ['latin-letter']], ['7', ['digit']], [',', ['punctuation']]]);
    const [u] = splitUnits('क');
    expect(unitFeatures(u, true)).toEqual(['deva-consonant', 'mixed-script-line']);
  });
});

// --- Truth scoring on synthetic pages (the tooling must measure right) ------------------------

const TEXT = ['The quick brown fox jumps', 'over the lazy dog and runs', 'भारत मेरा देश है।'].join('\n');
function syntheticWithTruth(o = {}) {
  const lg = 104;
  // A portrait sheet (the text at its top), so a photo of it on a desk shows a page-shaped outline.
  const page = syntheticTextPage(TEXT, { width: 1400, xHeight: 26, stroke: 3, top: lg, lineGap: lg, marginX: 60, height: 1800, marksApart: true, ...o });
  const tokens = TEXT.split('\n').map(l => l.split(' '));
  const truth = {
    lines: tokens.map((ws, li) => ({
      y: page.truth.lines[li].baseline - 13,
      words: ws.map((w, k) => {
        const tw = page.truth.words.filter(x => x.line === li)[k];
        return [w, tw.x0, tw.x1];
      }),
    })),
  };
  return { page, truth };
}

describe('the truth score measures what it claims (synthetic pages, known truth)', () => {
  it.each(['clean', 'skew 4°', 'perspective on a desk'])('%s: aligned words map back onto their true words', async name => {
    const { page, truth } = syntheticWithTruth();
    const { raster, toOriginal } = REAL_CONDITIONS[name](page.raster);
    const r = await analyzeSample(raster, { slot: 5, knownText: TEXT, sampleId: 's', revision: 1, yieldFn: async () => {}, extract: true });
    const s = summarizeAnalysis(r, { truth: { words: truthWords(truth, TEXT), toOriginal: analysisToOriginal(r, raster, toOriginal) } });
    expect(s.truth.aligned.wrong).toEqual([]);
    expect(s.truth.aligned.right).toBeGreaterThanOrEqual(10);
    expect(s.truth.units.wrong).toBe(0);
    expect(s.truth.glyphs.elsewhere).toEqual([]);
    if (name === 'perspective on a desk') expect(s.page.rectified).toBe(true);
    // Per feature, both scripts, and Devanagari headlines.
    expect(s.byFeature['latin-letter'].units).toBeGreaterThan(30);
    expect(s.byFeature['deva-consonant'].units).toBe(8); // भा र त मे रा दे श है
    expect(s.byFeature.danda.units).toBe(1);
    if (s.headlines) expect(s.headlines.traced).toBeLessThanOrEqual(s.headlines.clusters);
    expect(assertPrivate(s)).toBe(true);
  });

  it('a wrong mapping is caught: shifting every box by a word makes the score fail', async () => {
    const { page, truth } = syntheticWithTruth();
    const r = await analyzeSample(page.raster, { slot: 5, knownText: TEXT, sampleId: 's', revision: 1, yieldFn: async () => {}, extract: true });
    const s = summarizeAnalysis(r, { truth: { words: truthWords(truth, TEXT), toOriginal: (x, y) => [x + 200, y] } });
    expect(s.truth.aligned.wrong.length).toBeGreaterThan(s.truth.aligned.right);
  });
});

describe('privacy of reports', () => {
  it('rejects pixels, encoded images, long numeric lists and absolute paths', () => {
    expect(() => assertPrivate({ a: new Uint8Array(4) })).toThrow(/binary/);
    expect(() => assertPrivate({ a: 'data:image/png;base64,AAAA' })).toThrow(/encoded/);
    expect(() => assertPrivate({ a: 'A'.repeat(300) })).toThrow(/encoded/);
    expect(() => assertPrivate({ a: new Array(5000).fill(0) })).toThrow(/image/);
    expect(() => assertPrivate({ a: 'C:\\Users\\me\\photo.png' })).toThrow(/path/);
    expect(() => assertPrivate({ a: '/home/me/photo.png' })).toThrow(/path/);
    expect(assertPrivate({ words: ['Q1.'], counts: { aligned: 3 } })).toBe(true);
  });

  it('local real samples are git-ignored', () => {
    expect(fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf8')).toMatch(/^real-samples\/$/m);
  });
});

// --- The fix: a flat region (rule fragment) is never a word with letters -----------------------

describe('word alignment: flat regions', () => {
  const box = (x, w, h, xh = 20) => ({ line: 0, xHeight: xh, bbox: [x, 0, w, h] });

  it('a rule fragment as wide as a word is not taken for it (found on a real ruled page)', () => {
    const exp = prepareExpectedText('Market');
    const w = exp.words[0].width * 20;
    // The fragment (3 px tall) comes first and fits the width best; the word itself is a little wider.
    const r = alignWords(exp, [box(0, w, 3), box(w + 40, w * 1.15, 22)]);
    expect(r.words.map(x => [x.op, x.detected])).toEqual([['match', [1]]]);
    expect(r.extra).toEqual([0]);
    // Without the real word, it is missing rather than matched to the fragment.
    expect(alignWords(exp, [box(0, w, 3)]).words.map(x => x.op)).toEqual(['missing']);
  });

  it('words made of punctuation may still match a flat region (a dash is flat)', () => {
    const exp = prepareExpectedText('—');
    const r = alignWords(exp, [box(0, exp.words[0].width * 20, 3)]);
    expect(r.words.map(x => x.op)).toEqual(['match']);
  });

  it('a split or merge cannot take a flat piece into a word either', () => {
    const exp = prepareExpectedText('a b');
    const w = exp.words[0].width * 20;
    const r = alignWords(exp, [box(0, w, 20), box(w + 4, 30, 2), box(w + 60, w, 20)]);
    r.words.forEach(x => expect(x.detected).not.toContain(1));
    expect(isFlatRegion(box(0, 50, FLAT_REGION * 20 - 1))).toBe(true);
    expect(isFlatRegion(box(0, 50, FLAT_REGION * 20 + 1))).toBe(false);
  });
});

describe('release state', () => {
  it('onboarding stays tied to development / validation builds', () => {
    expect(PERSONAL_HANDWRITING_ONBOARDING).toBe(VALIDATION_TOOLS);
  });
});
