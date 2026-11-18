/**
 * Lang4 Phase 4 — transcription-guided character / cluster segmentation.
 *
 * Pages are SYNTHETIC (helpers/syntheticText.js): geometric pseudo-glyphs
 * drawn for a known text, so alignment can be checked against ground
 * truth. This is not OCR: the text is given, and the tests check that
 * regions are found where the pixels support them — and flagged where not.
 */
import React from 'react';
import { analyzeSample } from '../src/handwriting/learn/analyzeSample';
import { ALIGNMENT_THRESHOLDS, blurReach, blurredGap, edgeConfidence, hairlineGap, stateFor, unitConfidence, upstreamFactor } from '../src/handwriting/learn/alignmentConfidence';
import { alignTranscription, measureShape } from '../src/handwriting/learn/alignSample';
import { ALIGNMENT_STATES, validateAlignmentObservation } from '../src/handwriting/learn/contracts';
import { headlineBand, segmentDevanagariWord, stemAttributionCost, STRUCTURE_COST } from '../src/handwriting/learn/devanagariAlignment';
import { prepareExpectedText, WIDTH_PRIORS } from '../src/handwriting/learn/expectedText';
import { setImageInput } from '../src/handwriting/learn/imageInput';
import { LATIN_ALPHABET } from '../src/handwriting/learn/samplePrompts';
import { createSampleSet, markAnalysis, selectImage, slotStatus, summariseAnalysis } from '../src/handwriting/learn/sampleSet';
import { boundaryCandidates, chooseBoundaries, segmentUnits } from '../src/handwriting/learn/unitBoundaries';
import { alignWords, expectedShape, shapeCost } from '../src/handwriting/learn/wordAlignment';
import CreateHandwritingScreen from '../src/screens/CreateHandwritingScreen';
import { act, byTestId, press, render } from './helpers/render';
import { toBase64 } from './helpers/syntheticRaster';
import { syntheticTextPage } from './helpers/syntheticText';
import { chooseType } from './helpers/wizard';

const XH = 20;
const pageFor = (text, o = {}) => {
  const lines = text.split('\n').length;
  return syntheticTextPage(text, { width: 1000, height: 80 + lines * 80 + 40, top: 80, lineGap: 80, marginX: 60, xHeight: XH, stroke: 2.6, ...o });
};
const cache = new Map();
async function aligned(text, o = {}, extra = {}) {
  const key = JSON.stringify([text, o, extra]);
  if (!cache.has(key)) {
    const p = pageFor(text, o);
    const r = await analyzeSample(p.raster, { slot: 1, knownText: extra.knownText ?? text, sampleId: 'sample-7', revision: 7, yieldFn: async () => {}, ...extra });
    cache.set(key, { ...p, r });
  }
  return cache.get(key);
}
/** Aligned units whose box sits inside the truth range (± 0.2 x-height) with its centre inside. */
function correctness(r, truth) {
  let good = 0;
  let bad = 0;
  for (const u of r.alignment.observations.units.filter(x => x.state === 'aligned')) {
    const t = truth.units.find(x => x.start === u.source.start);
    const c = u.bbox[0] + u.bbox[2] / 2;
    const ok = t && t.drawn && c >= t.x0 && c <= t.x1 && u.bbox[0] >= t.x0 - 0.2 * XH && u.bbox[0] + u.bbox[2] <= t.x1 + 0.2 * XH;
    if (ok) good++;
    else bad++;
  }
  return { good, bad };
}
const units = r => r.alignment.observations.units;
const byText = (r, t) => units(r).filter(u => u.text === t);

const LATIN = 'The quick brown fox jumps\nover the lazy dog.';
const DEVA = 'नमस्ते दुनिया कितने लोग\nक्षमा विद्या ज्ञान प्रकाश';

// --- Expected text ----------------------------------------------------------------------

describe('expected text', () => {
  it('splits known text into lines, words and units, keeping exact ranges', () => {
    const text = '  Hello,  नमस्ते\n\nकि  wörld!';
    const e = prepareExpectedText(text);
    expect(e.lines.map(l => l.words.map(w => e.words[w].text))).toEqual([['Hello,', 'नमस्ते'], ['कि', 'wörld!']]);
    e.units.forEach(u => expect(text.slice(u.start, u.end)).toBe(u.text));
    e.words.forEach(w => expect(text.slice(w.start, w.end)).toBe(w.text));
    expect(e.words.map(w => w.script)).toEqual(['Latn', 'Deva', 'Deva', 'Latn']);
    expect(e.words[1].units.map(u => u.text)).toEqual(['न', 'म', 'स्ते']);
  });

  it('gives priors from the unit, not from code points', () => {
    const e = prepareExpectedText('m i W . कि क्ष के कु कः');
    const p = t => e.units.find(u => u.text === t).priors;
    expect(p('m').width).toBe(WIDTH_PRIORS.latinWide);
    expect(p('i').width).toBe(WIDTH_PRIORS.latinNarrow);
    expect(p('i').detached).toBe(true);
    expect(p('.').width).toBe(WIDTH_PRIORS.punctuation);
    expect(p('कि').marks).toMatchObject({ pre: true });
    expect(p('कि').width).toBeCloseTo(WIDTH_PRIORS.devaConsonant + WIDTH_PRIORS.devaSideMatra, 9);
    expect(p('क्ष')).toMatchObject({ conjunct: true });
    expect(p('क्ष').width).toBeCloseTo(WIDTH_PRIORS.devaConsonant + WIDTH_PRIORS.devaConjunctExtra, 9);
    expect(p('के').marks.above).toBe(true);
    expect(p('कु').marks.below).toBe(true);
    expect(p('कः').marks.post).toBe(true);
  });

  it('treats precomposed and decomposed nukta, ZWJ conjuncts and danda as single units', () => {
    const a = prepareExpectedText('क़लम');
    const b = prepareExpectedText('क़लम');
    expect(a.units.map(u => u.key)).toEqual(b.units.map(u => u.key));
    expect(prepareExpectedText('क्‍ष').units).toHaveLength(1);
    expect(prepareExpectedText('है।').units.map(u => [u.text, u.kind])).toEqual([['है', 'cluster'], ['।', 'punctuation']]);
  });
});

// --- Word alignment ----------------------------------------------------------------------

describe('word alignment', () => {
  const exp = prepareExpectedText('one two three four');
  const boxes = (widths, line = 0, xh = 10) => {
    let x = 0;
    return widths.map(w => {
      const b = { line, xHeight: xh, bbox: [x, 0, w * xh, xh] };
      x += w * xh + 12;
      return b;
    });
  };
  const ew = exp.words.map(w => w.width);

  it('matches words in order when the sizes agree', () => {
    const r = alignWords(exp, boxes(ew));
    expect(r.words.map(w => w.op)).toEqual(['match', 'match', 'match', 'match']);
    expect(r.extra).toEqual([]);
    r.words.forEach(w => expect(w.confidence.score).toBeGreaterThan(0.9));
  });

  it('is independent of the writer’s overall size', () => {
    const r = alignWords(exp, boxes(ew.map(v => v * 1.8)));
    expect(r.words.map(w => w.op)).toEqual(['match', 'match', 'match', 'match']);
    expect(r.scale).toBeGreaterThan(1.6);
  });

  it('reports a missing word, extra ink, touching words and a split word', () => {
    expect(alignWords(exp, boxes([ew[0], ew[1], ew[3]])).words.map(w => w.op)).toEqual(['match', 'match', 'missing', 'match']);
    const extra = alignWords(exp, boxes([ew[0], ew[1], 3.2, ew[2], ew[3]]));
    expect(extra.extra).toEqual([2]);
    expect(alignWords(exp, boxes([ew[0] + ew[1] + 1, ew[2], ew[3]])).words.map(w => w.op)).toEqual(['merge', 'merge', 'match', 'match']);
    expect(alignWords(exp, boxes([ew[0], ew[1], ew[2] * 0.45, ew[2] * 0.45, ew[3]])).words.map(w => w.op)).toEqual(['match', 'match', 'split', 'match']);
  });

  it('flags words found on a different line than the text expects', () => {
    const e = prepareExpectedText('aaa bbb\nccc ddd');
    const d = [...boxes([e.words[0].width], 0), ...boxes([e.words[1].width, e.words[2].width, e.words[3].width], 1)];
    const r = alignWords(e, d);
    expect(r.lineStructure.used).toBe(true);
    expect(r.words.find(w => w.expected === 1).lineMismatch).toBe(true);
  });

  it('marks everything missing when nothing was detected', () => {
    expect(alignWords(exp, []).words.map(w => w.op)).toEqual(['missing', 'missing', 'missing', 'missing']);
  });

  it('uses ascender and descender strokes to choose between words of similar width', () => {
    // "moon" or "hold" was not written; the one region between "sun" and
    // "run" is as wide as either — its strokes decide which word it is.
    const e = prepareExpectedText('sun moon hold run');
    const W = e.words.map(w => w.width);
    expect(expectedShape([e.words[1]])).toEqual({ asc: 0, desc: 0 });
    expect(expectedShape([e.words[2]])).toEqual({ asc: 3, desc: 0 });
    const flat = { asc: 0, desc: 0 };
    const det = shape => [[W[0], flat], [(W[1] + W[2]) / 2, shape], [W[3], flat]].map(([v, s], i) => ({ line: 0, xHeight: 10, bbox: [i * 60, 0, v * 10, 10], shape: s }));
    expect(alignWords(e, det({ asc: 3, desc: 0 })).words.map(w => w.op)).toEqual(['match', 'missing', 'match', 'match']);
    expect(alignWords(e, det(flat)).words.map(w => w.op)).toEqual(['match', 'match', 'missing', 'match']);
    expect(shapeCost({ asc: 3, desc: 0 }, null)).toBe(0);
    expect(shapeCost(null, { asc: 3, desc: 0 })).toBe(0);
    expect(shapeCost({ asc: 2, desc: 0 }, { asc: 3, desc: 0 })).toBe(0);
    expect(shapeCost({ asc: 0, desc: 0 }, { asc: 9, desc: 9 })).toBe(1.4);
  });

  it('does not use shape evidence for Devanagari text', () => {
    const e = prepareExpectedText('नमस्ते कि');
    const width = (e.words[0].width + e.words[1].width) / 2;
    const det = shape => [{ line: 0, xHeight: 10, bbox: [0, 0, width * 10, 10], shape }];
    expect(alignWords(e, det({ asc: 0, desc: 0 })).total).toBe(alignWords(e, det({ asc: 9, desc: 9 })).total);
  });
});

// --- Boundaries --------------------------------------------------------------------------

describe('unit boundaries from pixels', () => {
  it('finds gaps and thin-joint valleys, not every dip', () => {
    const p = Int32Array.from([0, 6, 6, 6, 0, 0, 0, 6, 6, 2, 6, 6, 0]);
    const c = boundaryCandidates(p, 100, 10, 2);
    expect(c.map(x => [x.kind, x.x])).toEqual([['gap', 105], ['valley', 109]]);
    expect(c[0].strength).toBeCloseTo(1, 9);
  });

  it('prefers a gap to a valley inside a letter', () => {
    const cands = [{ x: 30, kind: 'gap', from: 29, to: 31, strength: 0.3 }, { x: 36, kind: 'valley', strength: 0.95 }];
    const { chosen } = chooseBoundaries([33], cands, 20);
    expect(chosen[0].x).toBe(30);
  });

  it('never divides a region into equal widths: without evidence the units share it', () => {
    const solid = new Int32Array(60).fill(8);
    const r = segmentUnits({ profile: solid, x0: 0, units: prepareExpectedText('abc').units, xHeight: 20, strokeWidth: 3 });
    expect(r.units.map(u => u.group)).toEqual([[0, 1, 2], [0, 1, 2], [0, 1, 2]]);
    r.units.forEach(u => expect(u.range).toEqual([0, 59]));
  });

  it('separates repeated letters at their gaps', () => {
    const profile = Int32Array.from([...Array(4)].flatMap(() => [5, 5, 5, 5, 5, 5, 0, 0, 0]));
    const r = segmentUnits({ profile, x0: 0, units: prepareExpectedText('aaaa').units, xHeight: 10, strokeWidth: 2 });
    expect(r.units.map(u => u.range)).toEqual([[0, 5], [9, 14], [18, 23], [27, 32]]);
  });
});

// --- Latin ------------------------------------------------------------------------------------

describe('Latin alignment on synthetic pages', () => {
  it('aligns a clearly written text letter by letter', async () => {
    const { r, truth, raster } = await aligned(LATIN);
    const a = r.alignment;
    expect(a.status).toBe('aligned');
    expect(a.summary.words).toMatchObject({ aligned: 9, missing: 0 });
    const { good, bad } = correctness(r, truth);
    expect(bad).toBe(0);
    expect(good / truth.units.length).toBeGreaterThan(0.95);
    [...a.observations.units, ...a.observations.words].forEach(o => expect(validateAlignmentObservation(o, raster, LATIN.length)).toEqual([]));
  });

  it('keeps the original text and the image identity on every observation', async () => {
    const { r } = await aligned(LATIN);
    for (const o of [...units(r), ...r.alignment.observations.words]) {
      expect(LATIN.slice(o.source.start, o.source.end)).toBe(o.text);
      expect([o.sampleId, o.revision]).toEqual(['sample-7', 7]);
    }
    expect(JSON.stringify(r.alignment, (k, v) => (ArrayBuffer.isView(v) ? '<<PIXELS>>' : v))).not.toMatch(/PIXELS/);
  });

  it('places dots and punctuation with their letters', async () => {
    const { r, truth } = await aligned('quiz jam, mill! i.');
    for (const t of ['i', 'j', ',', '!', '.']) expect([t, byText(r, t).every(u => u.state === 'aligned')]).toEqual([t, true]);
    expect(correctness(r, truth).bad).toBe(0);
  });

  it('handles repeated and variable-width letters', async () => {
    const { r, truth } = await aligned('aaaa mmmm iiii wiwi');
    expect(r.alignment.summary.units.aligned).toBe(16);
    expect(correctness(r, truth).bad).toBe(0);
  });

  it('counts ascender and descender strokes from pixels, never on a headline line', async () => {
    const { r } = await aligned('lazy dog');
    const mask = r.representations ? r.representations.textMask : null;
    expect(mask).toBeNull();
    const line = { baseline: 50, xHeight: 10 };
    const w = 40;
    const m = new Uint8Array(w * 80);
    for (let y = 30; y <= 50; y++) m[y * w + 5] = 1; // an ascender stroke
    for (let y = 40; y <= 50; y++) m[y * w + 15] = 1; // x-height only
    for (let y = 40; y <= 62; y++) m[y * w + 25] = 1; // a descender stroke
    expect(measureShape(m, w, [0, 25, 40, 40], line)).toEqual({ asc: 1, desc: 1 });
    expect(measureShape(m, w, [0, 25, 40, 40], { ...line, headline: 41 })).toBeNull();
    expect(measureShape(m, w, [0, 25, 40, 40], { baseline: 50, xHeight: 4 })).toBeNull();
    expect(measureShape(m, w, [0, 25, 40, 40], { ...line, bbox: [0, 38, 40, 14] })).toBeNull();
  });

  it('finds a missing word and extra ink at a larger writing size', async () => {
    const { r } = await aligned(LATIN, { drop: [3], extra: [{ afterWord: 6, letters: 3 }], xHeight: 26, stroke: 3, lineGap: 100, height: 330 });
    expect(r.alignment.observations.words.find(w => w.text === 'fox').state).toBe('missing');
    expect(r.alignment.summary.extraInk).toBe(1);
    expect(r.alignment.observations.words.filter(w => w.state === 'aligned').length).toBeGreaterThanOrEqual(7);
  });

  it('reports a word that was not written as missing', async () => {
    const { r } = await aligned(LATIN, { drop: [3] });
    const fox = r.alignment.observations.words.find(w => w.text === 'fox');
    expect(fox.state).toBe('missing');
    expect(fox.bbox).toBeNull();
    expect(byText(r, 'x').every(u => u.state === 'missing')).toBe(true);
    expect(r.alignment.summary.words.aligned).toBe(8);
  });

  it('reports writing the transcription does not account for', async () => {
    const { r, truth } = await aligned(LATIN, { extra: [{ afterWord: 1, letters: 4 }] });
    const extra = r.alignment.observations.extra;
    expect(extra).toHaveLength(1);
    expect(extra[0]).toMatchObject({ state: 'extra-ink', source: null });
    expect(Math.abs(extra[0].bbox[0] - truth.extra[0].x0)).toBeLessThan(XH);
    expect(r.alignment.summary.words.aligned).toBe(9);
  });

  it('flags touching letters as ambiguous instead of guessing confidently', async () => {
    const { r, truth } = await aligned(LATIN, { touching: true });
    const amb = units(r).filter(u => u.state === 'ambiguous');
    expect(amb.length).toBeGreaterThan(units(r).length / 2);
    // (Phase 10: a cut that leaves part of its letter outside — a g without its descender — says so.)
    amb.forEach(u => expect(u.reasons.join(' ')).toMatch(/touches a neighbour|share one region|below the thresholds|far from where the text|which “.” does not/));
    const { good, bad } = correctness(r, truth);
    expect(bad).toBeLessThanOrEqual(Math.max(1, 0.1 * (good + bad)));
  });

  it('keeps touching words together and says so', async () => {
    const { r } = await aligned('one two three four five six', { spacing: { 1: 0.2 } });
    const merged = r.alignment.observations.words.filter(w => w.reasons.some(t => /touching words/.test(t)));
    expect(merged.map(w => w.text)).toEqual(['two', 'three']);
    merged.forEach(w => expect(w.state).toBe('ambiguous'));
  });

  it('copes with uneven word spacing', async () => {
    const { r, truth } = await aligned('one two three four five', { spacing: { 0: 2.4, 2: 0.8 } });
    expect(r.alignment.summary.words.aligned).toBe(5);
    expect(correctness(r, truth).bad).toBe(0);
  });

  it('works on a skewed, ruled page (boxes in the straightened frame)', async () => {
    const { r } = await aligned(LATIN, { skew: 3, rules: true });
    expect(r.skew.applied).toBe(true);
    expect(r.alignment.summary.words.aligned).toBe(9);
    units(r).forEach(u => expect(u.frame).toBe('deskewed'));
  });

  it('gives an incorrect transcription lower alignment, not false certainty', async () => {
    const right = await aligned('The quick brown fox jumps');
    const wrong = await aligned('The quick brown fox jumps', {}, { knownText: 'Thee quack browned foxes jump over' });
    expect(wrong.r.alignment.summary.words.aligned).toBeLessThan(right.r.alignment.summary.words.aligned);
    const words = wrong.r.alignment.observations.words;
    expect(words.some(w => w.state !== 'aligned')).toBe(true);
    words.filter(w => w.state === 'ambiguous').forEach(w => expect(w.reasons.length).toBeGreaterThan(0));
  });
});

// --- Devanagari -------------------------------------------------------------------------------

describe('Devanagari alignment on synthetic pages', () => {
  it('aligns clusters, never splitting a word at its headline', async () => {
    const { r, truth } = await aligned(DEVA);
    const a = r.alignment;
    expect(a.summary.words.aligned).toBe(8);
    expect(r.segmentation.words).toHaveLength(8); // one region per word
    const { good, bad } = correctness(r, truth);
    expect(bad).toBe(0);
    expect(good).toBe(truth.units.length);
    units(r).forEach(u => expect(u.method).toBe('devanagari-body-profile'));
  });

  it('keeps a pre-base matra with the cluster it is typed in', async () => {
    const { r, truth } = await aligned('कितने किताब');
    for (const u of byText(r, 'कि')) {
      const t = truth.units.find(x => x.start === u.source.start);
      expect(u.bbox[0]).toBeLessThan(t.x0 + 0.45 * XH); // the stem on the left is inside its box
      expect(u.evidence.join(' ')).toMatch(/pre-base matra assigned to the cluster it is typed in/);
    }
  });

  it('finds marks above and below where the text expects them', async () => {
    const { r } = await aligned('के कु कू कं कँ क् क़');
    const m = t => byText(r, t)[0].marks;
    expect(m('के').above.found).toBeGreaterThan(0);
    expect(m('कं').above.found).toBeGreaterThan(0);
    expect(m('कँ').above.found).toBeGreaterThan(0);
    expect(m('कु').below.found).toBeGreaterThan(0);
    expect(m('कू').below.found).toBeGreaterThan(0);
    expect(m('क्').below.found).toBeGreaterThan(0);
    expect(m('क़').below.found).toBeGreaterThan(0);
  });

  it('treats conjuncts as one cluster and says their parts are not separated', async () => {
    const { r } = await aligned('क्षमा प्रकाश विद्या');
    for (const t of ['क्ष', 'प्र', 'द्या']) {
      const u = byText(r, t)[0];
      expect(u.relation.conjunct).toBe(true);
      expect(u.reasons.join(' ')).toMatch(/conjunct: its consonant parts are not separated/);
    }
  });

  it('handles independent vowels, visarga and danda', async () => {
    const { r, truth } = await aligned('अब आम दुःख है।');
    expect(byText(r, '।')).toHaveLength(1);
    expect(byText(r, 'दुः')[0].relation.components.map(c => c.role)).toEqual(['base', 'matra', 'modifier']);
    expect(correctness(r, truth).bad).toBe(0);
  });

  it('aligns the same text written with precomposed or decomposed nukta and with ZWJ', async () => {
    const a = await aligned('क़लम');
    const b = await aligned('क़लम');
    expect(units(a.r).map(u => [u.key, u.state])).toEqual(units(b.r).map(u => [u.key, u.state]));
    expect(units(b.r)[0].text).toBe('क़'); // the user's own spelling is kept
    const z = await aligned('क्‍षमा');
    expect(units(z.r).map(u => u.text)).toEqual(['क्‍ष', 'मा']);
  });

  it('marks clusters ambiguous when only the headline or outline is visible', () => {
    const w = 120;
    const h = 40;
    const mask = new Uint8Array(w * h);
    for (let y = 10; y < 30; y++) for (let x = 10; x < 100; x++) mask[y * w + x] = 1; // one solid block under a headline row
    const units3 = prepareExpectedText('नमस').units;
    const r = segmentDevanagariWord({ mask, w, bbox: [10, 10, 90, 20], units: units3, line: { baseline: 29, headline: 10 }, xHeight: 18, strokeWidth: 3 });
    expect(r.units.map(u => u.group.length)).toEqual([3, 3, 3]);
    expect(r.units[0].reasons.join(' ')).toMatch(/only the word’s headline and outline were found/);
  });

  it('detects the headline band of a word', async () => {
    const { r } = await aligned('नमस्ते');
    const line = r.segmentation.lines[0];
    expect(line.headline).toBeDefined();
    const u = units(r)[0];
    expect(u.headline[0]).toBeLessThanOrEqual(line.headline);
    expect(headlineBand(new Uint8Array(100), 10, [0, 0, 10, 10])).toBeNull();
  });

  it('aligns mixed English and Hindi on one line', async () => {
    const { r, truth } = await aligned('Hello नमस्ते world हिंदी 2026');
    expect(r.alignment.summary.words.aligned).toBe(5);
    expect(correctness(r, truth).bad).toBe(0);
    expect(byText(r, 'हिं')[0].method).toBe('devanagari-body-profile');
    expect(byText(r, 'H')[0].method).toBe('latin-column-profile');
  });
});

// --- Confidence and uncertainty ----------------------------------------------------------

describe('confidence and propagated uncertainty', () => {
  it('keeps boundary and alignment confidence separate and documented', async () => {
    const { r } = await aligned(LATIN);
    const u = units(r)[1];
    expect(u.boundaryConfidence.basis).toMatch(/boundaries/);
    expect(u.alignmentConfidence.basis).toMatch(/word alignment/);
    expect(u.boundaryConfidence.inputs).toHaveProperty('upstream');
  });

  it('caps confidence for a degraded image and carries its warnings', () => {
    const q = { score: { score: 0.95 }, usable: true, issues: [{ code: 'blurry', message: 'The writing looks blurry.' }] };
    const up = upstreamFactor(q, { confidence: { score: 1 }, reasons: ['touches a neighbouring line'] });
    expect(up.factor).toBeLessThanOrEqual(ALIGNMENT_THRESHOLDS.warnedCap);
    expect(up.reasons).toEqual(['image: The writing looks blurry.', 'line: touches a neighbouring line']);
    expect(upstreamFactor({ ...q, usable: false }, null).factor).toBeLessThanOrEqual(ALIGNMENT_THRESHOLDS.unusableCap);
  });

  it('does not give a confident box just because the text contains the letter', () => {
    const c = unitConfidence({ left: null, right: null, atLeftEdge: false, atRightEdge: false, regionEdge: 1, shared: true, fit: 1, wordScore: 1, op: 'match', upstream: { factor: 1 } });
    expect(c.boundary.score).toBe(0);
    expect(stateFor({ boundary: 0.9, alignment: 0.9, shared: false, usable: true, valley: true })).toBe('ambiguous');
    expect(stateFor({ boundary: 0.9, alignment: 0.9, shared: false, usable: false })).toBe('low-quality');
  });

  it('marks everything low-quality on an unusable photo, even when lines are found', async () => {
    const { r } = await aligned(LATIN, { ink: 200 });
    expect(r.quality.usable).toBe(false);
    expect(units(r).every(u => u.state === 'low-quality' || u.state === 'missing')).toBe(true);
    expect(units(r).some(u => u.state === 'aligned')).toBe(false);
  });

  it('lowers boundary confidence on a blurry page and keeps the reasons', async () => {
    const sharp = await aligned(LATIN);
    const blurry = await aligned(LATIN, { blur: 4 });
    const mean = rr => units(rr).reduce((s, u) => s + (u.boundaryConfidence ? u.boundaryConfidence.score : 0), 0) / units(rr).length;
    expect(mean(blurry.r)).toBeLessThan(mean(sharp.r));
    if (blurry.r.quality.issues.length) expect(units(blurry.r)[0].reasons.some(t => t.startsWith('image:'))).toBe(true);
  });

  it('propagates line uncertainty when lines touch', async () => {
    const { r } = await aligned('gyp jqy pgy\nbdh klt fbk', { lineGap: 26 });
    expect(units(r).some(u => u.reasons.some(t => t.startsWith('line:')) || u.state !== 'aligned')).toBe(true);
  });
});

// --- Inputs, contract, control -------------------------------------------------------------------

describe('inputs, contract and control', () => {
  it('returns no-text without a transcription and no-writing on a blank page', async () => {
    const p = pageFor('abc');
    const r = await analyzeSample(p.raster, { slot: 4, knownText: null, yieldFn: async () => {} });
    expect(r.alignment).toBeNull();
    const seg = { lines: [], words: [], region: null };
    expect(alignTranscription({ mask: new Uint8Array(100), width: 10, height: 10, segmentation: seg, quality: null, knownText: '   ' }).status).toBe('no-text');
    const blank = alignTranscription({ mask: new Uint8Array(100), width: 10, height: 10, segmentation: seg, quality: { usable: false, score: { score: 0 }, issues: [] }, knownText: 'abc def', sampleId: 's', revision: 1 });
    expect(blank.status).toBe('no-writing');
    expect(blank.observations.units.every(u => u.state === 'low-quality' && u.bbox === null)).toBe(true);
  });

  it('validates observations: states, boxes inside the image, ranges inside the text', () => {
    const ok = { level: 'unit', sampleId: 's', revision: 1, source: { start: 0, end: 1 }, text: 'a', key: 'a', script: 'Latn', bbox: [1, 1, 5, 5], frame: 'deskewed', boundaryConfidence: null, alignmentConfidence: null, method: 'm', evidence: [], reasons: [], state: 'aligned', overlapsNeighbor: false };
    expect(validateAlignmentObservation(ok, { width: 10, height: 10 }, 3)).toEqual([]);
    expect(validateAlignmentObservation({ ...ok, bbox: [8, 8, 5, 5] }, { width: 10, height: 10 }).join()).toMatch(/outside/);
    expect(validateAlignmentObservation({ ...ok, source: { start: 0, end: 9 } }, null, 3).join()).toMatch(/source/);
    expect(validateAlignmentObservation({ ...ok, bbox: null }, null).join()).toMatch(/has a region/);
    expect(validateAlignmentObservation({ ...ok, state: 'ambiguous' }, null).join()).toMatch(/says why/);
    expect(validateAlignmentObservation({ ...ok, state: 'guessed' }, null).join()).toMatch(/state/);
    expect(ALIGNMENT_STATES).toEqual(['aligned', 'ambiguous', 'missing', 'extra-ink', 'low-quality', 'unsupported']);
  });

  it('marks units it cannot segment as unsupported', async () => {
    const { r } = await aligned('abc 漢字', {}, {});
    expect(units(r).filter(u => u.script === 'Zzzz').every(u => u.state === 'unsupported' || u.state === 'missing')).toBe(true);
  });

  it('can be cancelled before the alignment stage', async () => {
    const p = pageFor('abc');
    let calls = 0;
    const r = await analyzeSample(p.raster, { slot: 1, knownText: 'abc', yieldFn: async () => {}, shouldCancel: () => ++calls >= 6 });
    expect(r).toEqual({ status: 'cancelled' });
    expect(calls).toBe(6);
  });

  it('keeps only an alignment summary in the wizard state, tied to the image revision', async () => {
    const { r } = await aligned(LATIN);
    const s = summariseAnalysis(r, null);
    expect(s.alignment).toMatchObject({ status: 'aligned', expectedWords: 9 });
    expect(s.alignment.observations).toBeUndefined();
    let set = selectImage(createSampleSet(), 1, { uri: 'file:///a.jpg', mime: 'image/jpeg', width: 3000, height: 4000, bytes: 100000 }).set;
    const first = slotStatus(set, 1).sample;
    expect(first.revision).toBe(1);
    set = selectImage(set, 1, { uri: 'file:///b.jpg', mime: 'image/jpeg', width: 3000, height: 4000, bytes: 100001 }).set;
    expect(slotStatus(set, 1).sample.revision).toBe(2);
    expect(markAnalysis(set, first.id, s).set).toBe(set); // a result for the old revision is dropped
  });
});

// --- Wizard -----------------------------------------------------------------------------------

// --- Phase 4.1: reliability ------------------------------------------------------------
// Regressions for the errors found after Phase 4: wrong boxes reported as
// aligned on blurred pages and on tight Devanagari clusters. The rule kept
// throughout: an uncertain boundary is reported ambiguous, never forced.

describe('reliability: blur, touching letters, matras, contrast', () => {
  const LONG = 'The quick brown fox jumps over the lazy dog.\nPack my box with five dozen liquor jugs!\nHow vexingly quick daft zebras jump, 2026.';
  const HINDI = 'क्षमा विद्या ज्ञान प्रकाश\nकितने लोग सीता किताब';
  const page = (text, o = {}) => aligned(text, { width: 1400, height: 520, top: 90, lineGap: 110, xHeight: 24, stroke: 3, ...o });

  it('measures how wide a gap blur can close or open, from Phase 3’s edge width', () => {
    expect(blurReach({ metrics: { edgeWidth: 1.9 } })).toBe(0);
    expect(blurReach({ metrics: { edgeWidth: 3.24 } })).toBeCloseTo(3.72, 2);
    expect(blurReach({ metrics: { edgeWidth: null } })).toBe(0);
    expect(blurReach(null)).toBe(0);
    const narrow = { kind: 'gap', width: 2, strength: 0.33 };
    expect(blurredGap(narrow, 3.7)).toBe(true);
    expect(blurredGap({ ...narrow, width: 5 }, 3.7)).toBe(false);
    expect(blurredGap(narrow, 0)).toBe(false);
    expect(edgeConfidence(narrow, 0.9, 3.7)).toBeLessThan(edgeConfidence(narrow, 0.9, 0));
    // A one-pixel gap is within the binarisation's error: the letters may touch.
    expect(hairlineGap({ kind: 'gap', width: 1, strength: 0.2 })).toBe(true);
    expect(hairlineGap(narrow)).toBe(false);
  });

  it('never reports a wrong box as aligned on blurred pages; says the blur is why', async () => {
    for (const blur of [2, 3]) {
      const { r, truth } = await page(LONG, { blur });
      expect([blur, correctness(r, truth).bad]).toEqual([blur, 0]);
      const blurred = units(r).filter(u => u.reasons.some(t => /no wider than the blur/.test(t)));
      expect(blurred.length).toBeGreaterThan(0);
      blurred.forEach(u => expect(u.state).not.toBe('aligned'));
      units(r)
        .filter(u => u.boundaryConfidence)
        .forEach(u => expect(u.boundaryConfidence.inputs.blurReach).toBeGreaterThan(0));
      // Ambiguous units keep their word's region: nothing becomes missing.
      expect(r.alignment.summary.units.missing).toBe(0);
    }
  });

  it('never reports a wrong box as aligned when letters touch', async () => {
    const { r, truth } = await page(LONG, { touching: true });
    expect(correctness(r, truth).bad).toBe(0);
    // Small writing: the separations between touching letters shrink to a pixel.
    const small = await aligned(LONG, { width: 900, height: 260, top: 72, lineGap: 72, xHeight: 18, stroke: 2.25, touching: true });
    expect(correctness(small.r, small.truth).bad).toBe(0);
    expect(r.alignment.summary.units.ambiguous).toBeGreaterThan(r.alignment.summary.units.aligned);
  });

  it('a cut far from where the text’s letter widths put it keeps the unit ambiguous', () => {
    const base = { boundary: 0.9, alignment: 0.9, shared: false, usable: true, unsupported: false, valley: false };
    expect(stateFor({ ...base, fit: 0.95 })).toBe('aligned');
    expect(stateFor({ ...base, fit: ALIGNMENT_THRESHOLDS.fitOk - 0.01 })).toBe('ambiguous');
    expect(stateFor({ ...base, fit: 0.95, blurred: true })).toBe('ambiguous');
    expect(stateFor({ ...base, fit: 0.95, conflict: true })).toBe('ambiguous');
    // In a blurred image a gap alone proves less: the cut must sit closer to its expected place.
    expect(stateFor({ ...base, fit: 0.75 })).toBe('aligned');
    expect(stateFor({ ...base, fit: 0.75, blurry: true })).toBe('ambiguous');
    expect(stateFor({ ...base, fit: ALIGNMENT_THRESHOLDS.fitOkBlurred, blurry: true })).toBe('aligned');
    // The same at a one-pixel gap.
    expect(stateFor({ ...base, fit: 0.75, hairline: true })).toBe('ambiguous');
    expect(stateFor({ ...base, fit: 0.9, hairline: true })).toBe('aligned');
  });

  it('gives a matra stem to the cluster the text gives it', () => {
    const e = prepareExpectedText('का न कि');
    const [ka, na, ki] = e.units.filter(x => x.text.trim());
    // ा belongs to का: a cut that hands the stem on its right to न conflicts.
    expect(stemAttributionCost([ka, na], 0, { stemRight: true }).cost).toBe(STRUCTURE_COST);
    expect(stemAttributionCost([ka, na], 0, { stemLeft: true }).cost).toBe(0);
    // ि belongs to कि: a cut that hands the stem on its left to न conflicts.
    expect(stemAttributionCost([na, ki], 0, { stemLeft: true }).cost).toBe(STRUCTURE_COST);
    expect(stemAttributionCost([na, ki], 0, { stemRight: true }).cost).toBe(0);
    expect(stemAttributionCost([na, ki], 0, { stemLeft: true }).reason).toMatch(/matra before it/);
    // Both clusters may own a stem: no structural preference.
    expect(stemAttributionCost([ka, ki], 0, { stemLeft: true, stemRight: true }).cost).toBe(0);
  });

  it('a structure cost moves the cut to the other side of a stem; a paid conflict is reported', () => {
    const cands = [
      { x: 40, kind: 'gap', width: 7, strength: 1, from: 37, to: 43, stemRight: true },
      { x: 49, kind: 'gap', width: 2, strength: 0.3, from: 48, to: 49, stemLeft: true },
    ];
    expect(chooseBoundaries([41], cands, 30).chosen[0].x).toBe(40);
    const againstRight = (k, c) => (c.stemRight ? { cost: 1.5, reason: 'stem' } : { cost: 0, reason: null });
    expect(chooseBoundaries([41], cands, 30, undefined, againstRight).chosen[0].x).toBe(49);
    expect(chooseBoundaries([41], cands, 30, undefined, againstRight).chosen[0].conflict).toBeUndefined();
    expect(chooseBoundaries([41], [cands[0]], 30, undefined, againstRight).chosen[0].conflict).toBe('stem');
  });

  it('keeps post-base and pre-base matras with their clusters in tight Hindi writing', async () => {
    const { r, truth } = await page(HINDI, { devaTight: true });
    expect(correctness(r, truth).bad).toBe(0);
    const jnya = byText(r, 'ज्ञा')[0];
    const t = truth.units.find(x => x.start === jnya.source.start);
    expect(jnya.state).toBe('aligned');
    expect(jnya.bbox[0] + jnya.bbox[2]).toBeGreaterThanOrEqual(t.x1 - 0.2 * 24); // its ा stem is inside
    expect(jnya.evidence).toContain('post-base matra stem kept with the cluster it is typed in');
    for (const k of ['कि', 'सी', 'ता', 'ने']) expect([k, byText(r, k).every(u => u.state !== 'missing')]).toEqual([k, true]);
    expect(r.alignment.summary.units.aligned).toBeGreaterThanOrEqual(0.85 * r.alignment.summary.expectedUnits);
  });

  it('stays exact on low-contrast but readable writing', async () => {
    const { r, truth } = await page(LONG, { ink: 150 });
    expect(r.quality.usable).toBe(true);
    expect(correctness(r, truth).bad).toBe(0);
    expect(r.alignment.summary.units.aligned).toBeGreaterThanOrEqual(0.9 * r.alignment.summary.expectedUnits);
  });

  it('keeps clear images fully aligned (no loss from the stricter rules)', async () => {
    for (const text of [LONG, HINDI]) {
      const { r, truth } = await page(text);
      expect(correctness(r, truth).bad).toBe(0);
      expect(r.alignment.summary.units.aligned).toBeGreaterThanOrEqual(0.93 * r.alignment.summary.expectedUnits);
      units(r)
        .filter(u => u.boundaryConfidence)
        .forEach(u => expect(u.boundaryConfidence.inputs.blurReach).toBe(0));
    }
  });
});

describe('wizard: how much of the text was located', () => {
  afterEach(() => setImageInput(null));

  it('shows located words and characters for a sample, from the real alignment', async () => {
    const { raster } = pageFor(LATIN_ALPHABET);
    const picked = { uri: 'file:///cache/handwrite-samples/a.jpg', mime: 'image/jpeg', width: 4000, height: 3000, bytes: 3000000, orientation: 1 };
    setImageInput({
      pickImage: jest.fn(async () => picked),
      decodeForAnalysis: jest.fn(async () => ({ width: raster.width, height: raster.height, encoding: 'gray8-base64', data: toBase64(raster.data) })),
      releaseImage: jest.fn(async () => true),
      clearTemporaryImages: jest.fn(async () => 0),
    });
    const r = await render(<CreateHandwritingScreen onBack={jest.fn()} />);
    await chooseType(r);
    await press(r, 'sample-pick-1');
    for (let i = 0; i < 60; i++) {
      await act(async () => {
        await new Promise(res => setTimeout(res, 0));
      });
    }
    const textOf = node => node.findAll(n => n.type === 'Text').map(n => [].concat(n.props.children).join('')).join(' ');
    expect(textOf(byTestId(r, 'sample-text-1'))).toMatch(/^Text located: \d+ of 13 words clearly · \d+ of \d+ characters \(\d+ uncertain\)$/);
  });
});
