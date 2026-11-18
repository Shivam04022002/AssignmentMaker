/**
 * Lang4 Phase 15 — alignment reliability and cursive feasibility.
 *
 * Two kinds of regression test:
 *   real geometry   the line and region boxes MEASURED on the real reference
 *                   pages where a false match happened (numbers only, no
 *                   pixels), replayed through the step that went wrong — the
 *                   failure reproduces without the fix and is gone with it
 *   synthetic pages geometric pseudo-glyph pages (no fonts, nobody's
 *                   writing) with margin rules, rule fragments, touching
 *                   lines, strong skew, a line cut off at the photo's edge
 *                   and joined letters, run through the whole pipeline and
 *                   scored against their own truth: no false match
 * Neither is evidence of accuracy on real handwriting, and nothing here is
 * about Devanagari (no real Hindi sample exists).
 */
import { analyzeSample } from '../src/handwriting/learn/analyzeSample';
import { alignTranscription, LOST_WORD_MARGIN, MIN_SCALE_WORDS, TALL_REGION, unanchoredWords, UNEXPLAINED_PIECE, wordsAfterUnexplainedInk, writingBand } from '../src/handwriting/learn/alignSample';
import { prepareExpectedText } from '../src/handwriting/learn/expectedText';
import { makeRaster } from '../src/handwriting/learn/raster';
import { alignWords, BAND_SLACK, cannotHoldLetters, isOffBand } from '../src/handwriting/learn/wordAlignment';
import { PERSONAL_HANDWRITING_ONBOARDING, VALIDATION_TOOLS } from '../src/dev/flags';
import { REAL_CONDITIONS } from './helpers/realConditions';
import { analysisToOriginal, summarizeAnalysis, truthWords } from './helpers/realProtocol';
import { canvas } from './helpers/syntheticRaster';
import { syntheticTextPage } from './helpers/syntheticText';

jest.setTimeout(300000);

const regions = (boxes, line, band = true) => boxes.map((b, i) => ({ index: i, line: line.line, bbox: b, xHeight: line.xHeight, shape: null, band: band ? writingBand(line) : null }));
const ops = (wa, exp) => wa.words.map(w => [exp.words[w.expected].text, w.op, w.detected]);

// --- Real geometry: handwriting_02, first line (margin double rule curling at its end) --------

describe('margin lines (real geometry, handwriting_02)', () => {
  const line = { line: 1, bbox: [7, 42, 805, 53], baseline: 82, xHeight: 9, reasons: [] };
  // The curl of the double margin rule, a piece of the vertical margin rule, then the words.
  const boxes = [[7, 42, 33, 11], [61, 42, 6, 52], [83, 65, 39, 19], [143, 66, 39, 29], [198, 65, 20, 18], [234, 65, 17, 19], [267, 66, 100, 27], [385, 66, 29, 28], [428, 66, 77, 18], [523, 66, 104, 27], [647, 67, 23, 16], [690, 66, 122, 17]];
  const exp = prepareExpectedText('Q1. Why it is important for business enterprise to understand');

  it('the curl lies above the line’s writing band; the words reach into it', () => {
    expect(writingBand(line)).toEqual([73, 82]);
    const d = regions(boxes, line);
    expect(isOffBand(d[0])).toBe(true); // rows 42–52, the band starts at 73 (− slack)
    d.slice(1).forEach(r => expect(isOffBand(r)).toBe(false));
    expect(BAND_SLACK).toBe(0.25);
  });

  it('without the band the curl is taken for “Q1.” (the Phase 14 failure); with it, the curl is extra ink', () => {
    const before = alignWords(exp, regions(boxes, line, false));
    expect(ops(before, exp)[0]).toEqual(['Q1.', 'match', [0]]);
    const after = alignWords(exp, regions(boxes, line));
    after.words.forEach(w => expect(w.detected).not.toContain(0));
    expect(after.extra).toContain(0);
  });

  it('punctuation-only words may still sit off the band (a dash, quotation marks)', () => {
    const d = regions([[7, 42, 33, 11]], line)[0];
    expect(cannotHoldLetters(d)).toBe(true);
    const dash = prepareExpectedText('—');
    expect(alignWords(dash, regions([[7, 42, 33, 11]], line)).words[0].op).toBe('match');
  });

  it('a line that may hold two touching lines has no band (its baseline is one line’s only)', () => {
    expect(writingBand({ ...line, reasons: ['may contain more than one line (lines touch)'] })).toBeNull();
    expect(writingBand({ ...line, xHeight: 5 })).toBeNull();
    expect(writingBand({ line: 1, xHeight: 9 })).toBeNull();
  });

  it('a region taller than any line of writing (the vertical margin rule joined to a word) is never trusted', () => {
    // The page’s own geometry, replayed through alignment (empty mask: geometry only).
    const width = 900;
    const height = 140;
    const r = alignTranscription({
      mask: new Uint8Array(width * height),
      width,
      height,
      segmentation: { region: { bbox: [0, 0, width, height] }, lines: [{ ...line, confidence: { score: 0.95, basis: 'measured on the real page' } }], words: boxes.map(b => ({ line: 1, bbox: b, confidence: { score: 0.8, basis: 'measured on the real page' }, reasons: [] })) },
      quality: { usable: true, score: { score: 0.95, basis: 'measured on the real page' }, issues: [] },
      knownText: exp.words.map(w => w.text).join(' '),
      sampleId: 's',
      revision: 1,
    });
    const q1 = r.observations.words.find(w => w.text === 'Q1.');
    expect(q1.bbox[3] / 9).toBeGreaterThan(TALL_REGION);
    expect(q1.state).not.toBe('aligned');
    expect(q1.reasons.join(' ')).toMatch(/more than one line of writing/);
    r.observations.words.forEach(w => expect(w.bbox ? w.bbox[0] : 100).not.toBe(7));
  });
});

// --- Real geometry: handwriting_03 skewed −7°, the end of the first line cut off ---------------

describe('strong skew: a word lost at the photo’s edge (real geometry, handwriting_03)', () => {
  const exp = prepareExpectedText('Q1. What is the international market? Write its advantages');
  const xh = 14;
  const boxes = [[43, 0, 48, 74], [107, 10, 96, 26], [219, 12, 43, 25], [283, 13, 147, 26], [453, 12, 97, 28], [566, 15, 101, 21]];
  const d = boxes.map((b, i) => ({ index: i, line: 0, bbox: b, xHeight: xh }));
  const conf = { score: 0.7, basis: 'test', inputs: {} };
  // The matcher's result on that page: “Write” and “its” missing, “advantages” taking the last region —
  // which holds “Write its” (7.2 x-heights against 10 expected for “advantages”).
  const advantages = exp.words.findIndex(w => w.text === 'advantages');
  const scale = 9.964 / exp.words[advantages].width;
  const wa = {
    scale,
    extra: [],
    words: [
      { expected: 0, op: 'match', detected: [0], confidence: conf },
      { expected: 1, op: 'merge', detected: [1], confidence: { ...conf, score: 0.3 } },
      { expected: 2, op: 'merge', detected: [1], confidence: { ...conf, score: 0.3 } },
      { expected: 3, op: 'match', detected: [2], confidence: conf },
      { expected: 4, op: 'match', detected: [3], confidence: conf },
      { expected: 5, op: 'match', detected: [4], confidence: conf },
      { expected: 6, op: 'missing', detected: [] },
      { expected: 7, op: 'missing', detected: [] },
      { expected: 8, op: 'match', detected: [5], confidence: conf },
    ],
  };

  it('a lone word pinned by the line end is not trusted when its region fits the missing words beside it', () => {
    expect(unanchoredWords(wa, exp, d).has(advantages)).toBe(true);
    expect(LOST_WORD_MARGIN).toBe(0.15);
  });

  it('…but stays pinned when its region fits itself far better (a word that was simply not written)', () => {
    // Same line, the last region as wide as “advantages” itself: “Write its” cannot be it.
    const wide = d.map((r, i) => (i === 5 ? { ...r, bbox: [566, 15, Math.round(9.964 * xh), 21] } : r));
    expect(unanchoredWords(wa, exp, wide).has(advantages)).toBe(false);
  });

  it('a run of two or more matches in order keeps its line-end anchor', () => {
    const run = { ...wa, words: wa.words.map(w => (w.expected === 7 ? { expected: 7, op: 'match', detected: [4], confidence: conf } : w.expected === 5 ? { expected: 5, op: 'missing', detected: [] } : w)) };
    expect(unanchoredWords(run, exp, d).has(advantages)).toBe(false);
  });
});

// --- Real geometry: handwriting_02 under low contrast, a joined word cut in the wrong place -----

describe('cursive word boundaries (real geometry, handwriting_02)', () => {
  const line = { line: 14, bbox: [151, 612, 658, 29], baseline: 628, xHeight: 9, reasons: [] };
  // The period of “early.” left as a 2×3 px speck; “By” then took the start of “recognizing”.
  const boxes = [[151, 613, 95, 28], [265, 614, 63, 16], [351, 614, 50, 26], [410, 626, 2, 3], [433, 612, 24, 28], [477, 612, 117, 27], [614, 614, 50, 15], [684, 612, 125, 25]];
  const exp = prepareExpectedText('favorable trends early. By recognizing these opportunities');

  it('the word after a small unexplained piece inside a line is doubted', () => {
    const d = regions(boxes, line);
    const wa = alignWords(exp, d);
    expect(wa.extra).toEqual([3]);
    expect([...wordsAfterUnexplainedInk(wa, d)].map(i => exp.words[i].text)).toEqual(['By']);
  });

  it('a word-sized extra region (unexpected text) does not doubt its neighbour', () => {
    const d = regions(boxes.map((b, i) => (i === 3 ? [404, 614, 3 * UNEXPLAINED_PIECE * 9, 16] : b)), line);
    const wa = { words: [0, 1, 2, 4, 5, 6, 7].map((j, k) => ({ expected: k, op: 'match', detected: [j] })), extra: [3] };
    expect(wordsAfterUnexplainedInk(wa, d).size).toBe(0);
  });
});

// --- Synthetic pages through the whole pipeline, scored against truth ------------------------

const TEXT = ['Q1. What is the market? Write its advantages', 'and its disadvantages for the firm.', 'Ans the market is large and open'].join('\n');
const LG = 104;
function page(o = {}) {
  const lineGap = o.lineGap || LG;
  return syntheticTextPage(TEXT, { width: 1400, xHeight: 26, stroke: 3, top: lineGap, lineGap, marginX: 140, height: 1800, ...o });
}
const inked = (raster, draw) => {
  const c = canvas(raster.width, raster.height);
  draw(c.seg);
  const d = Uint8Array.from(raster.data);
  for (let i = 0; i < d.length; i++) if (c.cov[i] > 0) d[i] = Math.round(d[i] - c.cov[i] * (d[i] - 60));
  return makeRaster(raster.width, raster.height, d);
};
function truthOf(p) {
  return {
    lines: TEXT.split('\n').map((l, li) => ({
      y: p.truth.lines[li].baseline - 13,
      words: l.split(' ').map((w, k) => {
        const t = p.truth.words.filter(x => x.line === li)[k];
        return [w, t.x0, t.x1];
      }),
    })),
  };
}
async function scored(p, raster = p.raster, toOriginal = (x, y) => [x, y]) {
  const r = await analyzeSample(raster, { slot: 5, knownText: TEXT, sampleId: 's', revision: 1, yieldFn: async () => {}, extract: true });
  const drawn = new Set(p.truth.words.filter(w => w.drawn !== false).map(w => w.index));
  const s = summarizeAnalysis(r, { truth: { words: truthWords(truthOf(p), TEXT), toOriginal: analysisToOriginal(r, raster, toOriginal) } });
  // A word that was not drawn can never be “aligned”.
  const ghost = r.alignment.observations.words.filter(w => w.state === 'aligned' && !drawn.has(w.word)).map(w => w.text);
  return { r, s, ghost };
}

describe('regression pages (synthetic, whole pipeline): no false match', () => {
  it('a double margin rule curling at its end beside the first line', async () => {
    const p = page();
    const b = p.truth.lines[0].baseline;
    const raster = inked(p.raster, seg => {
      for (const off of [0, 6]) {
        seg(400, b - 66 + off, 40, b - 66 + off, 2.5);
        seg(40, b - 66 + off, 22, b - 52 + off, 2.5);
      }
      seg(118, 20, 118, 1780, 2.5);
      seg(124, 20, 124, 1780, 2.5);
    });
    const { s } = await scored(p, raster);
    expect(s.truth.aligned.wrong).toEqual([]);
    expect(s.truth.aligned.right).toBeGreaterThanOrEqual(10);
    expect(s.truth.glyphs.elsewhere).toEqual([]);
  });

  it('a rule fragment where a word was not written', async () => {
    const p = page({ drop: [7] });
    const w6 = p.truth.words.find(x => x.index === 6);
    const raster = inked(p.raster, seg => seg(w6.x1 + 40, p.truth.lines[0].baseline + 2, w6.x1 + 300, p.truth.lines[0].baseline + 2, 2.5));
    const { s, ghost } = await scored(p, raster);
    expect(ghost).toEqual([]);
    expect(s.truth.aligned.wrong).toEqual([]);
  });

  it('touching lines merged into one region: nothing is matched on a scale made to fit it', async () => {
    const p = page({ lineGap: 50 });
    const { r, s } = await scored(p);
    expect(s.truth.aligned.wrong).toEqual([]);
    const lone = r.alignment.observations.words.filter(w => w.bbox);
    if (new Set(lone.map(w => JSON.stringify(w.bbox))).size < MIN_SCALE_WORDS) {
      lone.forEach(w => {
        expect(w.state).not.toBe('aligned');
        expect(w.reasons.join(' ')).toMatch(/too few to measure the writing's size/);
      });
    }
    expect(r.extraction.summary.extracted).toBe(0);
  });

  it('touching lines that still separate: matches stay right', async () => {
    const p = page({ lineGap: 70 });
    const { s } = await scored(p);
    expect(s.truth.aligned.wrong).toEqual([]);
  });

  it.each(['skew 4°', 'skew −7°'])('%s: no false match', async name => {
    const p = page();
    const { raster, toOriginal } = REAL_CONDITIONS[name](p.raster);
    const { s } = await scored(p, raster, toOriginal);
    expect(s.truth.aligned.wrong).toEqual([]);
    expect(s.truth.aligned.right).toBeGreaterThanOrEqual(8);
    expect(s.truth.glyphs.elsewhere).toEqual([]);
  });

  it('a line whose last words are missing (cut off at the photo’s edge): no word takes their place', async () => {
    const p = page({ drop: [6, 7] });
    const { s, ghost } = await scored(p);
    expect(ghost).toEqual([]);
    expect(s.truth.aligned.wrong).toEqual([]);
  });

  it('joined letters: words still found, every joined letter refused with its reason — never forced', async () => {
    const p = page({ touching: true });
    const { r, s } = await scored(p);
    expect(s.truth.aligned.wrong).toEqual([]);
    expect(s.truth.aligned.right).toBeGreaterThanOrEqual(10);
    const letters = r.alignment.observations.units.filter(u => u.kind === 'letter');
    const joined = letters.filter(u => u.reasons.some(t => /touches a neighbour/.test(t)));
    expect(joined.length).toBeGreaterThan(0.8 * letters.length);
    const kept = new Set(r.extraction.units.filter(u => u.status === 'extracted').map(u => u.source.start));
    joined.forEach(u => expect(kept.has(u.source.start)).toBe(false));
    expect(s.truth.glyphs.elsewhere).toEqual([]);
  });
});

describe('release state', () => {
  it('onboarding stays tied to development / validation builds', () => {
    expect(PERSONAL_HANDWRITING_ONBOARDING).toBe(VALIDATION_TOOLS);
  });
});
