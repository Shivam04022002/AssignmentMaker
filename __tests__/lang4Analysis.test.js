/**
 * Lang4 Phase 3 — on-device image analysis: raster transfer, preprocessing,
 * paper-rule handling, skew, initial segmentation, quality metrics and the
 * wizard integration.
 *
 * Images are SYNTHETIC (helpers/syntheticRaster.js: geometric strokes, no
 * real handwriting). The native module is replaced by a TEST DOUBLE; the
 * real Kotlin / Objective-C sources are checked statically at the end.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { analyzeSample } from '../src/handwriting/learn/analyzeSample';
import { validateQualityResult, validateSegment } from '../src/handwriting/learn/contracts';
import { assessQuality, dilate, noiseSigma, QUALITY_THRESHOLDS } from '../src/handwriting/learn/imageQuality';
import { clearTemporaryImages, decodeSampleImage, isAnalysisAvailable, setImageInput } from '../src/handwriting/learn/imageInput';
import { components, darkMask, despeckle, detectRules, estimateSkew, inkMask, normalise, rotateMask, suppressRules } from '../src/handwriting/learn/preprocess';
import { backgroundGrid, decodeBase64, histogram, makeRaster, otsu, percentile, rasterFromNative, sauvola, validateRaster } from '../src/handwriting/learn/raster';
import { SAMPLE_SLOTS } from '../src/handwriting/learn/samplePrompts';
import { createSampleSet, markAnalysis, moveSample, selectImage, slotStatus, summariseAnalysis, validateSampleSet } from '../src/handwriting/learn/sampleSet';
import { segment } from '../src/handwriting/learn/segmentation';
import CreateHandwritingScreen from '../src/screens/CreateHandwritingScreen';
import { act, byTestId, press, queryByTestId, render } from './helpers/render';
import { syntheticPage, toBase64 } from './helpers/syntheticRaster';
import { chooseType } from './helpers/wizard';

const SMALL = { width: 900, height: 700, xHeight: 20, lineGap: 85, top: 110, marginX: 70, stroke: 2.6, lines: 5, wordsPerLine: 5 };
const page = (o = {}) => syntheticPage({ ...SMALL, ...o });
const words = truth => truth.lines.reduce((a, l) => a + l.words, 0);
const run = (raster, o = {}) => analyzeSample(raster, { slot: 1, yieldFn: async () => {}, ...o });

// Pages used by several tests, analysed once.
const cache = {};
async function analysed(name, o) {
  if (!cache[name]) {
    const p = page(o);
    cache[name] = { ...p, result: await run(p.raster) };
  }
  return cache[name];
}

// --- Rasters and transfer ------------------------------------------------------------

describe('analysis rasters and pixel transfer', () => {
  it('validates dimensions, type and buffer length', () => {
    expect(validateRaster(makeRaster(100, 80))).toEqual([]);
    expect(validateRaster(null)).toEqual(['raster: missing']);
    expect(validateRaster({ width: 100, height: 80, data: new Uint8Array(10) }).join()).toMatch(/expected 8000/);
    expect(validateRaster({ width: 100, height: 80, data: new Array(8000).fill(0) }).join()).toMatch(/Uint8Array/);
    expect(validateRaster({ width: 0, height: 80, data: new Uint8Array(0) }).join()).toMatch(/integers/);
    expect(validateRaster({ width: 10.5, height: 80, data: new Uint8Array(840) }).join()).toMatch(/integers/);
    expect(validateRaster({ width: 5000, height: 100, data: new Uint8Array(500000) }).join()).toMatch(/≤ 4096/);
  });

  it('decodes base64 exactly (no dependency on atob)', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 255, 256, 1000]) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) % 256);
      expect(Array.from(decodeBase64(toBase64(bytes)))).toEqual(Array.from(bytes));
    }
    expect(decodeBase64('###')).toBeNull();
    expect(decodeBase64('A')).toBeNull();
    expect(decodeBase64(42)).toBeNull();
  });

  it('builds a raster from the native result and rejects malformed payloads', () => {
    const data = Uint8Array.from({ length: 64 * 70 }, (_, i) => i % 256);
    const ok = rasterFromNative({ width: 64, height: 70, encoding: 'gray8-base64', data: toBase64(data) });
    expect(ok.raster.width).toBe(64);
    expect(Array.from(ok.raster.data.slice(0, 5))).toEqual([0, 1, 2, 3, 4]);
    expect(rasterFromNative({ width: 64, height: 70, encoding: 'rgba', data: '' }).errors).toEqual(['unknown pixel encoding']);
    expect(rasterFromNative({ width: 64, height: 71, encoding: 'gray8-base64', data: toBase64(data) }).errors.join()).toMatch(/expected/);
    expect(rasterFromNative({ width: 64, height: 70, encoding: 'gray8-base64', data: '!!' }).errors).toEqual(['pixel data is not valid base64']);
    expect(rasterFromNative(null).errors).toBeTruthy();
  });

  it('computes histograms, percentiles and Otsu thresholds', () => {
    const data = new Uint8Array(1000).fill(220);
    data.fill(40, 0, 100);
    const h = histogram(data);
    expect(h[220]).toBe(900);
    expect(percentile(h, 0.05)).toBe(40);
    expect(percentile(h, 0.5)).toBe(220);
    expect(percentile(new Uint32Array(256), 0.5)).toBeNull();
    const t = otsu(h);
    expect(t).toBeGreaterThanOrEqual(40);
    expect(t).toBeLessThan(220);
  });
});

// --- Preprocessing -----------------------------------------------------------------------

describe('preprocessing', () => {
  it('leaves the original raster untouched and keeps separate representations', async () => {
    const { raster } = page({ rules: true, skew: 2 });
    const before = raster.data.slice();
    const r = await run(raster, { keepRepresentations: true });
    expect(Array.from(raster.data)).toEqual(Array.from(before));
    const rep = r.representations;
    for (const k of ['rawInk', 'cleanInk', 'deskewed', 'textMask', 'writingInk']) expect(rep[k]).toBeInstanceOf(Uint8Array);
    expect(rep.normalised.data).not.toBe(raster.data);
    expect(new Set([rep.rawInk, rep.cleanInk, rep.deskewed, rep.textMask]).size).toBe(4);
    expect(r.representations).toBeDefined();
    expect((await run(raster)).representations).toBeUndefined(); // the wizard keeps no pixels
  });

  it('flattens uneven lighting before thresholding', () => {
    const { raster } = page({ gradient: 0.5, blank: true });
    const bg = backgroundGrid(raster);
    const norm = normalise(raster, bg);
    const spread = d => d.reduce((a, v) => Math.max(a, v), 0) - d.reduce((a, v) => Math.min(a, v), 255);
    expect(spread(raster.data)).toBeGreaterThan(100);
    expect(spread(norm.data)).toBeLessThan(20);
    expect(inkMask(norm).reduce((a, v) => a + v, 0)).toBe(0); // blank paper: no ink
  });

  it('separates ink from paper (Sauvola) and keeps thin strokes', () => {
    const { raster } = page({ stroke: 1.2 });
    const mask = sauvola(normalise(raster));
    let ink = 0;
    let darkInk = 0;
    for (let i = 0; i < raster.data.length; i++) {
      if (raster.data[i] < 120) {
        ink++;
        if (mask[i]) darkInk++;
      }
    }
    expect(darkInk / ink).toBeGreaterThan(0.98);
  });

  it('removes 1–2 px specks but keeps dots and small marks', () => {
    const w = 60;
    const h = 40;
    const m = new Uint8Array(w * h);
    m[5 * w + 5] = 1; // speck
    m[10 * w + 10] = 1;
    m[10 * w + 11] = 1; // speck of 2
    for (const [x, y] of [[30, 20], [31, 20], [30, 21], [31, 21]]) m[y * w + x] = 1; // a 2 × 2 dot
    const d = despeckle(m, w, h);
    expect(d.specks).toBe(2);
    expect(d.mask.reduce((a, v) => a + v, 0)).toBe(4);
  });

  it('labels 8-connected components with their boxes and areas', () => {
    const w = 10;
    const m = new Uint8Array(w * 6);
    m[1 * w + 1] = 1;
    m[2 * w + 2] = 1; // diagonal: same component
    m[4 * w + 7] = 1;
    const cc = components(m, w, 6);
    expect(cc.count).toBe(2);
    expect([cc.minX[1], cc.minY[1], cc.maxX[1], cc.maxY[1], cc.area[1]]).toEqual([1, 1, 2, 2, 2]);
  });

  it.each([2.5, -4])('estimates a %s° skew and straightens it', async angle => {
    const { raster } = page({ skew: angle, rules: true });
    const r = await run(raster, { keepRepresentations: true });
    expect(Math.abs(r.skew.angle - angle)).toBeLessThan(0.4);
    expect(r.skew.applied).toBe(true);
    const after = estimateSkew(r.representations.deskewed, raster.width, raster.height);
    expect(Math.abs(after.angle)).toBeLessThan(0.4);
  });

  it('reports no skew for a straight page', async () => {
    const { result } = await analysed('clean', {});
    expect(Math.abs(result.skew.angle)).toBeLessThan(0.3);
    expect(result.skew.applied).toBe(false);
  });

  it('rotates masks about their centre without changing their size', () => {
    const m = new Uint8Array(100 * 100);
    m[50 * 100 + 80] = 1;
    const r = rotateMask(m, 100, 100, 90);
    expect(r.length).toBe(m.length);
    expect(r.reduce((a, v) => a + v, 0)).toBe(1);
    expect(rotateMask(m, 100, 100, 0)).toEqual(m);
  });
});

// --- Paper rules ----------------------------------------------------------------------------

describe('paper rules', () => {
  it('finds the rules of a ruled page and removes them, keeping the writing', async () => {
    const { truth, result } = await analysed('ruled', { rules: true });
    const onPage = truth.rules.filter(y => y > 3 && y < SMALL.height - 3).length;
    expect(result.rules.rules).toBe(onPage);
    expect(result.rules.periodic).toBe(true);
    expect(result.segmentation.lines.length).toBe(truth.lines.length); // rules are not text lines
    expect(result.segmentation.words.length).toBe(words(truth));
  });

  it('does not take Devanagari headlines for rules (unruled page)', async () => {
    const { result } = await analysed('deva', { script: 'deva' });
    expect(result.rules.rules).toBe(0);
    expect(result.segmentation.diagnostics.possibleHeadlines).toBe(SMALL.lines);
  });

  it('keeps headlines on a ruled Devanagari page while removing the rules', async () => {
    const { truth, result } = await analysed('devaRuled', { script: 'deva', rules: true });
    expect(result.rules.rules).toBeGreaterThan(5);
    expect(result.segmentation.diagnostics.possibleHeadlines).toBe(SMALL.lines);
    expect(result.segmentation.words.length).toBe(words(truth));
  });

  it.each([
    ['noisy', { rules: true, noise: 6 }],
    ['skewed, unevenly lit and noisy', { rules: true, skew: 2.5, gradient: 0.4, noise: 6 }],
    ['faint rules on a grainy photo', { rules: true, noise: 10, ruleInk: 205 }],
  ])('handles %s ruled paper', async (_, o) => {
    const { raster, truth } = page(o);
    const r = await run(raster);
    expect(r.segmentation.lines.length).toBe(truth.lines.length);
    expect(r.segmentation.words.length).toBe(words(truth));
  });

  it('keeps ink where a stroke crosses a rule', () => {
    const w = 200;
    const h = 200;
    const m = new Uint8Array(w * h);
    for (let x = 0; x < w; x++) m[30 * w + x] = 1; // the rule
    for (let y = 10; y < 50; y++) m[y * w + 100] = 1; // a stroke crossing it (not a margin line)
    const rules = detectRules(m, w, h);
    expect(rules.horizontal.map(b => b.kind)).toEqual(['rule']);
    const out = suppressRules(m, w, h, rules).mask;
    expect(out[30 * w + 100]).toBe(1); // crossing kept
    expect(out[30 * w + 20]).toBe(0); // rule removed
    for (let y = 10; y < 50; y++) expect(out[y * w + 100]).toBe(1);
  });

  it('treats a long stroke broken by word gaps as handwriting, not a rule', () => {
    const w = 400;
    const h = 40;
    const m = new Uint8Array(w * h);
    for (const [a, b] of [[10, 120], [160, 270], [310, 395]]) for (let x = a; x < b; x++) m[20 * w + x] = 1;
    const rules = detectRules(m, w, h);
    expect(rules.horizontal).toHaveLength(1);
    expect(rules.horizontal[0].kind).toBe('uncertain');
    expect(rules.horizontal[0].reasons.join()).toMatch(/word gaps/);
    expect(suppressRules(m, w, h, rules).removedPixels).toBe(0);
  });

  it('measures rules on the darker-than-paper map', () => {
    const n = { width: 3, height: 1, data: Uint8Array.from([255, 230, 100]) };
    expect(Array.from(darkMask(n))).toEqual([0, 1, 1]);
    expect(Array.from(darkMask(n, 200))).toEqual([0, 0, 1]);
  });
});

// --- Segmentation ----------------------------------------------------------------------------

describe('initial segmentation', () => {
  it('finds the writing region, lines, baselines and words of Latin writing', async () => {
    const { truth, result } = await analysed('clean', {});
    const seg = result.segmentation;
    expect(seg.lines.length).toBe(truth.lines.length);
    expect(seg.words.length).toBe(words(truth));
    seg.lines.forEach((l, i) => {
      expect(Math.abs(l.baseline - truth.lines[i].baseline)).toBeLessThan(0.35 * SMALL.xHeight);
      expect(l.headline).toBeUndefined(); // no false Devanagari headlines
    });
    expect(Math.abs(seg.diagnostics.medianXHeight - SMALL.xHeight) / SMALL.xHeight).toBeLessThan(0.35);
    expect(seg.region.confidence.score).toBeGreaterThan(0.8);
    const [x, y, w, h] = seg.region.bbox;
    expect(x).toBeLessThan(SMALL.marginX + 5);
    expect(y + h).toBeGreaterThan(truth.lines[truth.lines.length - 1].baseline);
    expect(w).toBeGreaterThan(SMALL.width / 2);
  });

  it('keeps Devanagari words whole: headline, matras above and marks below stay with their word', async () => {
    const { truth, result } = await analysed('deva', { script: 'deva' });
    const seg = result.segmentation;
    expect(seg.lines.length).toBe(truth.lines.length);
    expect(seg.words.length).toBe(words(truth)); // detached matras are not separate words
    seg.lines.forEach((l, i) => {
      expect(l.headline).toBeDefined();
      expect(Math.abs(l.headline - truth.lines[i].top)).toBeLessThanOrEqual(3);
    });
  });

  it('reports headlines only on the Devanagari lines of a mixed page', async () => {
    const { result } = await analysed('mixed', { script: 'mixed' });
    const heads = result.segmentation.lines.map(l => l.headline !== undefined);
    expect(heads).toEqual([false, true, false, true, false]);
  });

  it('keeps punctuation and dots with the writing', async () => {
    const { result } = await analysed('clean', {});
    expect(result.despeckle.specks).toBe(0);
    expect(result.segmentation.diagnostics.writingComponents).toBeGreaterThan(words((await analysed('clean', {})).truth));
  });

  it('records lines that touch as uncertain rather than inventing boundaries', () => {
    const { raster, truth } = page({ lineGap: 30, lines: 4, xHeight: 20 }); // descenders reach the next line
    const mask = sauvola(normalise(raster));
    const seg = segment(mask, raster.width, raster.height, { slot: 2 });
    const unsure = seg.uncertain.length + seg.lines.filter(l => l.reasons.length).length;
    expect(unsure).toBeGreaterThan(0);
    expect(seg.lines.length).toBeLessThanOrEqual(truth.lines.length);
  });

  it('produces observations that satisfy the Phase 1 contract', async () => {
    const { result } = await analysed('deva', { script: 'deva' });
    const seg = result.segmentation;
    for (const o of [seg.region, ...seg.lines, ...seg.words, ...seg.uncertain]) {
      expect(validateSegment(o)).toEqual([]);
      if (o.confidence) expect(o.confidence.basis.length).toBeGreaterThan(10);
    }
  });

  it('compares the line count with the known text, without claiming characters', async () => {
    const { raster } = page({ lines: 3 });
    const r = await run(raster, { knownText: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz\naaa eee ooo' });
    expect(r.segmentation.diagnostics).toMatchObject({ expectedLines: 3, foundLines: 3, lineCountMatches: true });
    expect(JSON.stringify(r.segmentation)).not.toMatch(/"char"|"key"/); // no character assignment
  });

  it('finds nothing on a blank page', async () => {
    const { result } = await analysed('blank', { blank: true });
    expect(result.segmentation.region).toBeNull();
    expect(result.segmentation.lines).toEqual([]);
  });
});

// --- Quality --------------------------------------------------------------------------------

describe('image quality from pixels', () => {
  it('passes a clear photo with no issues', async () => {
    const { result } = await analysed('clean', {});
    const q = result.quality;
    expect(q.usable).toBe(true);
    expect(q.issues).toEqual([]);
    expect(q.score.score).toBeGreaterThan(0.9);
    expect(q.metrics.contrast).toBeGreaterThan(0.7);
    expect(validateQualityResult(q)).toEqual([]);
    Object.keys(q.checks).forEach(k => expect(q.metrics.methods[k] || k).toBeTruthy());
  });

  it.each([
    ['low contrast', { ink: 185 }, 'low-contrast', true],
    ['a dark photo', { paper: 95, ink: 25 }, 'too-dark', true],
    ['uneven lighting', { gradient: 0.55 }, 'uneven-lighting', true],
    ['a grainy photo', { noise: 14 }, 'noisy', true],
    ['blur', { blur: 4 }, 'blurry', true],
    ['a blank page', { blank: true }, 'too-little-writing', false],
  ])('detects %s', async (_, o, code, usable) => {
    const { raster } = page(o);
    const q = (await run(raster)).quality;
    expect(q.issues.map(i => i.code)).toContain(code);
    expect(q.usable).toBe(usable);
    const i = q.issues.find(x => x.code === code);
    expect(i.message.length).toBeGreaterThan(10);
    expect(i.advice.length).toBeGreaterThan(10);
  });

  it('measures noise close to the true grain', async () => {
    const { raster } = page({ noise: 8, blank: true });
    const sigma = noiseSigma(raster, new Uint8Array(raster.data.length));
    expect(sigma).toBeGreaterThan(6);
    expect(sigma).toBeLessThan(10);
    expect(noiseSigma(page({ blank: true }).raster, new Uint8Array(SMALL.width * SMALL.height))).toBeLessThan(1);
  });

  it('measures wider edges on blurred writing, and does not guess on thin strokes', async () => {
    const sharp = (await analysed('clean', {})).result.quality.metrics.edgeWidth;
    const soft = (await run(page({ blur: 3 }).raster)).quality.metrics.edgeWidth;
    expect(soft).toBeGreaterThan(sharp + 0.5);
    const thin = (await run(page({ stroke: 1.1 }).raster)).quality;
    expect(thin.metrics.edgeWidth).toBeNull();
    expect(thin.checks.sharpness).toBeUndefined();
    expect(thin.metrics.sharpnessNote).toMatch(/not estimated/);
  });

  it('straightens a tilted photo and warns only when the tilt is large', async () => {
    const small = (await run(page({ skew: 2 }).raster)).quality;
    expect(small.issues.map(i => i.code)).not.toContain('rotated');
    const large = (await run(page({ skew: 6 }).raster)).quality;
    expect(large.issues.map(i => i.code)).toContain('rotated');
    expect(large.usable).toBe(true);
  });

  it('uses configurable thresholds', async () => {
    const { raster } = page({});
    const r = await run(raster, { keepRepresentations: true });
    const strict = assessQuality({
      slot: 1,
      raster,
      background: backgroundGrid(raster),
      rawInk: r.representations.rawInk,
      writingInk: r.representations.writingInk,
      skew: r.skew,
      segmentation: { ...r.segmentation, components: [] },
      thresholds: { ...QUALITY_THRESHOLDS, contrastGood: 0.95 },
    });
    expect(strict.checks.contrast.pass).toBe(false);
    expect(r.quality.checks.contrast.pass).toBe(true);
  });

  it('grows masks for the noise estimate (separable dilation)', () => {
    const m = new Uint8Array(25);
    m[12] = 1;
    expect(dilate(m, 5, 5, 1).reduce((a, v) => a + v, 0)).toBe(9);
  });
});

// --- Pipeline control -----------------------------------------------------------------------

describe('analysis pipeline', () => {
  it('fails cleanly on an empty or corrupt buffer', async () => {
    expect(await run({ width: 100, height: 100, data: new Uint8Array(5) })).toMatchObject({ status: 'failed', error: { code: 'invalid-raster' } });
    expect((await run(null)).status).toBe('failed');
  });

  it('stops at the next stage when cancelled', async () => {
    let calls = 0;
    const r = await run(page({}).raster, { shouldCancel: () => ++calls >= 2 });
    expect(r).toEqual({ status: 'cancelled' });
    expect(calls).toBe(2);
  });

  it('records stage timings', async () => {
    const { result } = await analysed('clean', {});
    expect(Object.keys(result.timings)).toEqual(['page', 'normalise', 'threshold', 'deskew', 'rules', 'segment', 'quality']);
  });
});

// --- Native boundary ---------------------------------------------------------------------------

function nativeDouble({ pages = [], decodeError = null, gate = null } = {}) {
  const queue = [...pages];
  const input = {
    released: [],
    cleared: 0,
    pickImage: jest.fn(async () => {
      const next = queue.shift();
      return next ? next.picked : null;
    }),
    decodeForAnalysis: jest.fn(async uri => {
      if (gate) await gate(uri);
      if (decodeError) throw Object.assign(new Error('x'), { code: decodeError });
      const p = pages.find(x => x.picked.uri === uri);
      return { width: p.raster.width, height: p.raster.height, encoding: 'gray8-base64', data: toBase64(p.raster.data), sourceWidth: 4000, sourceHeight: 3000, orientation: 1, orientationApplied: true, decodeMillis: 12 };
    }),
    releaseImage: jest.fn(async uri => input.released.push(uri)),
    clearTemporaryImages: jest.fn(async () => {
      input.cleared++;
      return 0;
    }),
  };
  return input;
}
const sample = (n, raster) => ({ raster, picked: { uri: `file:///cache/handwrite-samples/s${n}.jpg`, mime: 'image/jpeg', width: 4000, height: 3000, bytes: 3000000 + n, orientation: 1 } });

describe('image input: decoding', () => {
  afterEach(() => setImageInput(null));

  it('decodes through the native module and maps its errors', async () => {
    const p = sample(1, page({ lines: 2 }).raster);
    setImageInput(nativeDouble({ pages: [p] }));
    expect(isAnalysisAvailable()).toBe(true);
    const d = await decodeSampleImage(p.picked.uri);
    expect(d.status).toBe('decoded');
    expect(Array.from(d.raster.data.slice(0, 50))).toEqual(Array.from(p.raster.data.slice(0, 50)));
    expect(d.info).toMatchObject({ sourceWidth: 4000, decodeMillis: 12 });
    for (const code of ['unsupported-format', 'out-of-memory', 'unreadable', 'something-new']) {
      setImageInput(nativeDouble({ decodeError: code }));
      const e = await decodeSampleImage('file:///x');
      expect(e).toMatchObject({ status: 'error', code: code === 'something-new' ? 'unknown' : code });
      expect(e.advice.length).toBeGreaterThan(5);
    }
    setImageInput({ decodeForAnalysis: async () => ({ width: 10, height: 10, encoding: 'gray8-base64', data: 'AAAA' }) });
    expect(await decodeSampleImage('file:///x')).toMatchObject({ status: 'error', code: 'invalid-pixels' });
  });

  it('is unavailable without the module (no fake pixels)', async () => {
    expect(isAnalysisAvailable()).toBe(false);
    expect(await decodeSampleImage('file:///x')).toEqual({ status: 'unavailable' });
    expect(await clearTemporaryImages()).toBe(0);
  });
});

// --- Sample set with analysis ----------------------------------------------------------------

describe('sample set: analysis results follow the exact image', () => {
  const photo = n => ({ uri: `file:///c/p${n}.jpg`, mime: 'image/jpeg', width: 3000, height: 4000, bytes: 1000000 + n });

  it('ignores a result for a replaced image and keeps results with moved images', async () => {
    let set = selectImage(createSampleSet(), 1, photo(1)).set;
    const first = slotStatus(set, 1).sample.id;
    set = markAnalysis(set, first, { status: 'decoding' }).set;
    set = selectImage(set, 1, photo(2)).set; // replaced while decoding
    const after = markAnalysis(set, first, { status: 'failed', stage: 'decode', code: 'unreadable', message: 'm', advice: 'a' }).set;
    expect(after).toBe(set);
    expect(slotStatus(after, 1).analysisStatus).toBe('not-started');
    const { result } = await analysed('clean', {});
    const second = slotStatus(set, 1).sample.id;
    set = markAnalysis(set, second, summariseAnalysis(result, { decodeMillis: 5 })).set;
    set = moveSample(set, 1, 2).set;
    expect(slotStatus(set, 2).qualityAnalysed).toBe(true);
    expect(slotStatus(set, 1).sample).toBeNull();
  });

  it('keeps only summaries (no pixels) in the wizard state', async () => {
    const { result } = await analysed('clean', {});
    const s = summariseAnalysis(result, null);
    const typed = JSON.stringify(s, (k, v) => (ArrayBuffer.isView(v) ? '<<PIXELS>>' : v));
    expect(typed).not.toMatch(/PIXELS/);
    expect(s.segmentation).toMatchObject({ lines: 5, words: 25 });
  });

  it('blocks running checks, failed decodes and unusable photos; warns for the rest', async () => {
    let set = createSampleSet();
    for (const s of SAMPLE_SLOTS) set = selectImage(set, s.slot, photo(s.slot)).set;
    const id = n => slotStatus(set, n).sample.id;
    const clean = summariseAnalysis((await analysed('clean', {})).result);
    const blank = summariseAnalysis((await analysed('blank', { blank: true })).result);
    const uneven = summariseAnalysis((await run(page({ gradient: 0.55 }).raster)));
    set = markAnalysis(set, id(1), { status: 'analysing' }).set;
    set = markAnalysis(set, id(2), { status: 'failed', stage: 'decode', code: 'unsupported-format', message: 'm', advice: 'a' }).set;
    set = markAnalysis(set, id(3), blank).set;
    set = markAnalysis(set, id(4), uneven).set;
    set = markAnalysis(set, id(5), clean).set;
    const v = validateSampleSet(set);
    const by = n => v.problems.filter(p => p.slot === n).map(p => [p.code, p.severity]);
    expect(by(1)).toContainEqual(['analysis-pending', 'error']);
    expect(by(2)).toContainEqual(['unsupported-format', 'error']);
    expect(by(3)).toContainEqual(['too-little-writing', 'error']);
    expect(by(4)).toContainEqual(['uneven-lighting', 'warning']);
    expect(by(5).filter(([, s]) => s === 'error')).toEqual([]);
    expect(v.ready).toBe(false);
    expect(slotStatus(set, 4)).toMatchObject({ qualityAnalysed: true, qualityUsable: true, qualityAcceptable: false, decoded: true });
    expect(slotStatus(set, 3)).toMatchObject({ qualityUsable: false, regionUncertain: true });
    expect(slotStatus(set, 2)).toMatchObject({ analysisFailed: true, decoded: false });
  });
});

// --- Wizard ------------------------------------------------------------------------------------

const deepText = node => node.findAll(n => n.type === 'Text').map(n => [].concat(n.props.children).filter(c => typeof c === 'string' || typeof c === 'number').join('')).join(' ');
const text = (r, id) => deepText(byTestId(r, id));
const settle = async () => {
  for (let i = 0; i < 40; i++) {
    await act(async () => {
      await new Promise(res => setTimeout(res, 0));
    });
  }
};

describe('wizard: real pixel checks', () => {
  afterEach(() => setImageInput(null));

  it('decodes and checks a chosen photo, showing each status separately', async () => {
    const input = nativeDouble({ pages: [sample(1, page({ lines: 3 }).raster)] });
    setImageInput(input);
    const r = await render(<CreateHandwritingScreen onBack={jest.fn()} />);
    await chooseType(r);
    expect(input.clearTemporaryImages).toHaveBeenCalledTimes(1); // stale copies cleared on entry
    await press(r, 'sample-pick-1');
    await settle();
    expect(text(r, 'sample-file-1')).toBe('File details: valid');
    expect(text(r, 'sample-decoded-1')).toBe('Pixels decoded: yes');
    expect(text(r, 'sample-quality-1')).toBe('Image quality: checked');
    expect(text(r, 'sample-acceptable-1')).toBe('Quality acceptable');
    expect(text(r, 'sample-region-1')).toBe('Writing found: 3 lines (expected 3)');
    // One photo of five: analysis waits for all five, and nothing claims a handwriting was learned.
    expect(text(r, 'sample-progress')).toBe('1 of 5 photos added');
    expect(byTestId(r, 'analyze-photos-button', 'accessibilityState').props.accessibilityState.disabled).toBe(true);
    expect(queryByTestId(r, 'review-step')).toBe(false);
  });

  it('explains a poor photo and lets the user replace it and check again', async () => {
    const input = nativeDouble({ pages: [sample(1, page({ blank: true }).raster), sample(2, page({ lines: 3 }).raster)] });
    setImageInput(input);
    const r = await render(<CreateHandwritingScreen onBack={jest.fn()} />);
    await chooseType(r);
    await press(r, 'sample-pick-1');
    await settle();
    expect(text(r, 'sample-acceptable-1')).toBe('Not usable: see below');
    expect(text(r, 'sample-quality-issues-1')).toMatch(/No handwriting could be found/);
    await press(r, 'sample-pick-1'); // replace
    await settle();
    expect(input.released).toContain(sample(1).picked.uri);
    expect(text(r, 'sample-acceptable-1')).toBe('Quality acceptable');
    expect(queryByTestId(r, 'sample-quality-issues-1')).toBe(true);
  });

  it('reports a decoding failure and retries with “Check again”', async () => {
    const p = sample(1, page({ lines: 2 }).raster);
    const input = nativeDouble({ pages: [p], decodeError: 'out-of-memory' });
    setImageInput(input);
    const r = await render(<CreateHandwritingScreen onBack={jest.fn()} />);
    await chooseType(r);
    await press(r, 'sample-pick-1');
    await settle();
    expect(text(r, 'sample-quality-1')).toBe('Image quality: check failed');
    expect(text(r, 'sample-decoded-1')).toBe('Pixels decoded: no');
    expect(text(r, 'sample-analysis-error-1')).toMatch(/too large to check/);
    input.decodeForAnalysis.mockImplementation(async () => ({ width: p.raster.width, height: p.raster.height, encoding: 'gray8-base64', data: toBase64(p.raster.data) }));
    await press(r, 'sample-recheck-1');
    await settle();
    expect(text(r, 'sample-quality-1')).toBe('Image quality: checked');
  });

  it('drops a check whose photo was replaced while it was decoding', async () => {
    let open;
    const gate = new Promise(res => (open = res));
    const pages = [sample(1, page({ blank: true }).raster), sample(2, page({ lines: 2 }).raster)];
    const input = nativeDouble({ pages, gate: uri => (uri === pages[0].picked.uri ? gate : null) });
    setImageInput(input);
    const r = await render(<CreateHandwritingScreen onBack={jest.fn()} />);
    await chooseType(r);
    await press(r, 'sample-pick-1');
    expect(text(r, 'sample-quality-1')).toBe('Reading the photo…');
    await press(r, 'sample-pick-1'); // replace while the first is still decoding
    await settle();
    expect(text(r, 'sample-region-1')).toBe('Writing found: 2 lines (expected 3)');
    await act(async () => open());
    await settle();
    // The late result for the replaced photo did not overwrite the new one.
    expect(text(r, 'sample-region-1')).toBe('Writing found: 2 lines (expected 3)');
    expect(text(r, 'sample-acceptable-1')).not.toMatch(/Not usable/);
  });

  it('stops checking and releases copies when the wizard is left mid-check', async () => {
    let open;
    const gate = new Promise(res => (open = res));
    const p = sample(1, page({ lines: 2 }).raster);
    const input = nativeDouble({ pages: [p], gate: () => gate });
    setImageInput(input);
    const r = await render(<CreateHandwritingScreen onBack={jest.fn()} />);
    await chooseType(r);
    await press(r, 'sample-pick-1');
    await act(async () => r.unmount());
    await act(async () => open());
    await settle();
    expect(input.released).toEqual([p.picked.uri]);
  });

  it('keeps showing “not checked yet” where pixels cannot be decoded', async () => {
    const input = nativeDouble({ pages: [sample(1, page({ lines: 2 }).raster)] });
    delete input.decodeForAnalysis;
    setImageInput(input);
    const r = await render(<CreateHandwritingScreen onBack={jest.fn()} />);
    await chooseType(r);
    await press(r, 'sample-pick-1');
    await settle();
    expect(text(r, 'sample-quality-1')).toBe('Image quality: not checked yet');
    expect(queryByTestId(r, 'sample-decoded-1')).toBe(false);
  });
});

// --- Native sources (static checks; no device or native build here) ---------------------------

describe('native module sources', () => {
  const root = path.join(__dirname, '..', 'modules', 'handwrite-samples');
  const kt = fs.readFileSync(path.join(root, 'android/src/main/java/com/handwrite/samples/HandWriteSamplesModule.kt'), 'utf8');
  const objc = fs.readFileSync(path.join(root, 'ios/HandWriteSamples.m'), 'utf8');

  it('implements the contract imageInput.js expects, on both platforms', () => {
    for (const m of ['pickImage', 'decodeForAnalysis', 'releaseImage', 'clearTemporaryImages']) {
      expect([m, new RegExp(`@ReactMethod\\s+fun ${m}\\(`).test(kt)]).toEqual([m, true]);
      expect([m, objc.includes(`RCT_EXPORT_METHOD(${m}`)]).toEqual([m, true]);
    }
    expect(kt).toMatch(/const val NAME = "HandWriteSamples"/);
    expect(objc).toMatch(/RCT_EXPORT_MODULE\(HandWriteSamples\)/);
    for (const code of ['picker-busy', 'permission-denied', 'unreadable', 'unsupported-format', 'out-of-memory', 'temp-file']) {
      expect([code, kt.includes(`"${code}"`)]).toEqual([code, true]);
    }
    expect(kt).toMatch(/"gray8-base64"/);
    expect(objc).toMatch(/@"gray8-base64"/);
  });

  it('only deletes its own temporary copies and has no network or logging code', () => {
    expect(kt).toMatch(/canonicalPath\.startsWith\(root\)/);
    expect(objc).toMatch(/hasPrefix:root/);
    for (const src of [kt, objc]) {
      expect(src).not.toMatch(/https?:\/\/|HttpURLConnection|URLSession|OkHttp|NSURLConnection|\bLog\.|NSLog/);
    }
    const manifest = fs.readFileSync(path.join(root, 'android/src/main/AndroidManifest.xml'), 'utf8');
    expect(manifest).not.toMatch(/uses-permission/);
  });

  it('is linked like the export module (in-repo, not from the registry)', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    expect(pkg.dependencies['handwrite-samples']).toBe('file:modules/handwrite-samples');
    expect(fs.existsSync(path.join(root, 'handwrite-samples.podspec'))).toBe(true);
  });
});
