/**
 * Lang4 Phase 5 — glyph geometry extraction from reliably aligned units.
 *
 * SYNTHETIC fixtures only (geometric pseudo-glyphs with known centre-lines;
 * no fonts, nobody's handwriting). Ground truth: the centre-line segments
 * the fixture drew for each unit.
 */
import { analyzeSample } from '../src/handwriting/learn/analyzeSample';
import { PIPELINE_STAGES } from '../src/handwriting/learn/contracts';
import {
  analysisToFrame,
  EXTRACTION,
  extractGlyphs,
  formPointsInAnalysis,
  frameToAnalysis,
  frameToGlyph,
  glyphToFrame,
  glyphToSource,
  REJECTION_CODES,
  validateExtraction,
} from '../src/handwriting/learn/glyphExtraction';
import { validateGlyphForm } from '../src/handwriting/learn/profileSchema';
import { rendererGlyphs } from '../src/handwriting/learn/rendererAdapter';
import { components8, pruneSpurs, skeletonGraph, thin, traceStrokes } from '../src/handwriting/learn/skeleton';
import { catmullRom, fitStroke, sampleChain, simplify, traceFidelity } from '../src/handwriting/learn/strokeFit';
import { GLYPH_SETS } from '../src/handwriting/glyphs';
import { getHandwritingStyles } from '../src/data/handwritingStyles';
import { syntheticTextPage } from './helpers/syntheticText';

const fs = require('fs');
const path = require('path');

const XH = 26;
const LATIN = 'The quick brown fox jumps over\nthe lazy dog. Pack my box!';
const HINDI = 'क्षमा विद्या ज्ञान प्रकाश\nकितने लोग सीता किताब';

const pageFor = (text, o = {}) => {
  const xh = o.xHeight || XH;
  const lines = text.split('\n').length;
  const lg = Math.round(xh * 4);
  return syntheticTextPage(text, { width: Math.round(xh * 40), height: lg * (lines + 1) + 40, top: lg, lineGap: lg, marginX: 50, xHeight: xh, stroke: 3, ...o });
};
const cache = new Map();
async function extracted(text, o = {}, extra = {}) {
  const key = JSON.stringify([text, o, extra]);
  if (!cache.has(key)) {
    const p = pageFor(text, o);
    const r = await analyzeSample(p.raster, { slot: 2, knownText: text, sampleId: 'sample-9', revision: 4, yieldFn: async () => {}, extract: true, source: { width: p.raster.width * 3, height: p.raster.height * 3 }, ...extra });
    cache.set(key, { ...p, r });
  }
  return cache.get(key);
}
const glyphs = r => r.extraction.units.filter(u => u.status === 'extracted');

// Ground truth: distance of traced points to the drawn centre-lines.
const segPts = ([x0, y0, x1, y1], step = 0.5) => {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
  return Array.from({ length: n + 1 }, (_, k) => [x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
};
const nearest = (p, list) => Math.sqrt(Math.min(...list.map(q => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2)));
/** The word headline's part over one unit's cell [a, b] (it is horizontal before skew). */
const clipX = ([x0, y0, x1, y1], a, b) => {
  const lo = Math.max(Math.min(x0, x1), a);
  const hi = Math.min(Math.max(x0, x1), b);
  if (hi <= lo) return null;
  const yAt = x => (x1 === x0 ? y0 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0));
  return [lo, yAt(lo), hi, yAt(hi)];
};
/**
 * Against the unit's WHOLE drawing — a missing bowl or stem counts as
 * missing — plus the word's headline over the cluster's own columns (the
 * headline over the gaps between clusters belongs to no cluster).
 */
function againstTruth(g, truth, xh) {
  const t = truth.units.find(u => u.start === g.source.start);
  const word = truth.words.find(w => w.index === t.word);
  const [bx, , bw] = g.observation.bbox;
  const own = p => {
    const q = analysisToFrame(p, g.transform);
    return q[0] >= bx - 0.5 && q[0] <= bx + bw + 0.5;
  };
  const head = word && word.headline ? clipX(word.headline, t.x0, t.x1) : null;
  const truthPts = [...t.centreLines.flatMap(s => segPts(s)), ...(head ? segPts(head).filter(own) : [])];
  const traced = formPointsInAnalysis(g, 0.05);
  const distance = traced.reduce((s, p) => s + nearest(p, truthPts), 0) / traced.length / xh;
  const completeness = truthPts.filter(p => nearest(p, traced) <= 0.15 * xh).length / truthPts.length;
  return { distance, completeness };
}

// Small masks for the tracing unit tests.
const grid = rows => {
  const h = rows.length;
  const w = rows[0].length;
  const m = new Uint8Array(w * h);
  rows.forEach((r, y) => [...r].forEach((c, x) => (m[y * w + x] = c === '#' ? 1 : 0)));
  return { m, w, h };
};
const blank = (w, h) => new Uint8Array(w * h);
const rect = (m, w, x0, y0, x1, y1) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m[y * w + x] = 1;
};
const ring = (w, h, cx, cy, r, t) => {
  const m = blank(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.abs(Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - r) <= t / 2) m[y * w + x] = 1;
  return m;
};

// --- Tracing: skeleton, graph, strokes --------------------------------------------------

describe('centre-line tracing', () => {
  it('thins a thick bar to a one-pixel line that keeps its length', () => {
    const w = 30;
    const h = 12;
    const m = blank(w, h);
    rect(m, w, 3, 4, 26, 7);
    const sk = thin(m, w, h);
    const ys = new Set();
    let n = 0;
    for (let i = 0; i < sk.length; i++) {
      if (sk[i]) {
        n++;
        ys.add(Math.floor(i / w));
      }
    }
    expect(ys.size).toBe(1);
    expect(n).toBeGreaterThanOrEqual(18);
  });

  it('finds the junction of a T and joins its bar through it; the stem is its own stroke', () => {
    const w = 40;
    const h = 40;
    const m = blank(w, h);
    rect(m, w, 4, 6, 35, 8); // bar
    rect(m, w, 19, 6, 21, 34); // stem
    const t = traceStrokes(m, w, h, 3);
    expect(t.diagnostics.junctions).toBe(1);
    expect(t.strokes).toHaveLength(2);
    const horizontal = t.strokes.find(s => Math.abs(s.points[0][1] - s.points[s.points.length - 1][1]) < 3);
    expect(horizontal.points[0][0]).toBeLessThan(horizontal.points[horizontal.points.length - 1][0]); // left → right
    const stem = t.strokes.find(s => s !== horizontal);
    expect(stem.points[0][1]).toBeLessThan(stem.points[stem.points.length - 1][1]); // top → bottom
  });

  it('a plus sign is two crossing strokes, not four pieces', () => {
    const w = 40;
    const h = 40;
    const m = blank(w, h);
    rect(m, w, 4, 19, 35, 21);
    rect(m, w, 19, 4, 21, 35);
    const t = traceStrokes(m, w, h, 3);
    expect(t.strokes).toHaveLength(2);
    expect(t.diagnostics.joins).toBe(2);
  });

  it('a ring is one closed stroke starting at its top and running anticlockwise', () => {
    const w = 40;
    const h = 40;
    const t = traceStrokes(ring(w, h, 20, 20, 12, 3), w, h, 3);
    expect(t.strokes).toHaveLength(1);
    const s = t.strokes[0];
    expect(s.closed).toBe(true);
    expect(s.points[0]).toEqual(s.points[s.points.length - 1]);
    expect(s.points[0][1]).toBeLessThan(10); // top
    // Anticlockwise on the page (y down): the first steps go left.
    expect(s.points[4][0]).toBeLessThan(s.points[0][0]);
  });

  it('removes thinning spurs and two-pixel staircases, keeping real branches', () => {
    const { m, w, h } = grid([
      '..........................',
      '..######################..',
      '..######################..',
      '..#######.................',
      '..........................',
    ]);
    const sk = thin(m, w, h);
    const raw = skeletonGraph(sk, w, h);
    const pruned = pruneSpurs(raw, 1.3 * 2);
    expect(pruned.edges.length).toBeLessThanOrEqual(raw.edges.length);
    const t = traceStrokes(m, w, h, 2);
    expect(t.strokes).toHaveLength(1);
  });

  it('keeps a short real stroke (a t-bar arm) but prunes an overhang that stays inside the stem’s ink', () => {
    const w = 30;
    const h = 44;
    const m = blank(w, h);
    rect(m, w, 10, 4, 13, 40); // stem, 4 px
    rect(m, w, 9, 16, 20, 18); // bar: 1 px overhang left, 7 px right
    const t = traceStrokes(m, w, h, 3.5);
    const bar = t.strokes.find(s => Math.abs(s.points[0][1] - s.points[s.points.length - 1][1]) < 2 && s.points.length > 2);
    expect(bar).toBeDefined();
    expect(Math.max(...bar.points.map(p => p[0]))).toBeGreaterThan(17);
    expect(Math.min(...t.strokes.flatMap(s => s.points.map(p => p[0])))).toBeGreaterThan(10); // the 1 px overhang is gone
  });

  it('keeps dots — even a 2 × 2 block thinning would erase — and measures their size', () => {
    const w = 20;
    const h = 20;
    const m = blank(w, h);
    rect(m, w, 9, 9, 10, 10);
    const t = traceStrokes(m, w, h, 3);
    expect(t.strokes).toHaveLength(1);
    expect(t.strokes[0].dot).toBe(true);
    expect(t.strokes[0].radius).toBeGreaterThan(0.5);
  });

  it('fills a pinhole inside a thick stroke instead of tracing a false loop', () => {
    const w = 30;
    const h = 14;
    const m = blank(w, h);
    rect(m, w, 3, 3, 26, 9);
    m[6 * w + 14] = 0; // a one-pixel hole
    const t = traceStrokes(m, w, h, 6);
    expect(t.strokes.filter(s => s.closed)).toHaveLength(0);
    expect(t.diagnostics.pinholes).toBe(1);
  });

  it('labels connected components with their extents', () => {
    const { m, w, h } = grid(['#...#', '#....', '....#']);
    expect(components8(m, w, h).map(c => [c.x0, c.y0, c.x1, c.y1])).toEqual([
      [0, 0, 0, 1],
      [4, 0, 4, 0],
      [4, 2, 4, 2],
    ]);
  });
});

// --- Curve fitting -------------------------------------------------------------------------

describe('cubic fitting and fidelity', () => {
  it('writes cubic chains in the renderer format', () => {
    const pts = [
      [0, 0],
      [5, 4],
      [10, 0],
      [15, 4],
    ];
    const chain = catmullRom(pts);
    expect((chain.length - 2) % 6).toBe(0);
    expect(chain.slice(0, 2)).toEqual([0, 0]);
    expect(chain.slice(-2)).toEqual([15, 4]);
    expect(simplify([[0, 0], [1, 0.01], [2, 0]], 0.5)).toHaveLength(2);
  });

  it('fits within its tolerance and samples continuously', () => {
    const points = Array.from({ length: 60 }, (_, k) => [10 + 8 * Math.cos(k / 10), 10 + 8 * Math.sin(k / 10)]);
    const fit = fitStroke({ points, closed: false, dot: false }, 3);
    expect(fit.error).toBeLessThanOrEqual(0.35 * 3 + 1e-9);
    const s = sampleChain(fit.chain);
    for (let i = 1; i < s.length; i++) expect(Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1])).toBeLessThan(1.5);
  });

  it('fidelity is 1 for a faithful trace and drops when a stroke is missing', () => {
    const w = 40;
    const h = 40;
    const m = blank(w, h);
    rect(m, w, 4, 19, 35, 21);
    rect(m, w, 19, 4, 21, 35);
    const bar = catmullRom([[5.5, 20.5], [34.5, 20.5]]);
    const stem = catmullRom([[20.5, 5.5], [20.5, 34.5]]);
    expect(traceFidelity(m, w, h, [bar, stem], 3).score).toBe(1);
    expect(traceFidelity(m, w, h, [bar], 3).inkCovered).toBeLessThan(0.7);
    expect(traceFidelity(m, w, h, [bar, stem, catmullRom([[2, 2], [38, 2]])], 3).curveOnInk).toBeLessThan(0.8);
  });
});

// --- Extraction on synthetic pages ---------------------------------------------------------

describe('extraction from aligned units', () => {
  it('extracts every reliably aligned Latin letter, in bounds, within the renderer format', async () => {
    const { r } = await extracted(LATIN);
    const ex = r.extraction;
    expect(ex.status).toBe('extracted');
    expect(ex.summary.considered).toBe(r.alignment.observations.units.length);
    const aligned = r.alignment.observations.units.filter(u => u.state === 'aligned').length;
    expect(ex.summary.extracted).toBeGreaterThanOrEqual(aligned - 2);
    for (const g of glyphs(r)) {
      expect(validateGlyphForm(g.form, { synthetic: false }, g.text)).toEqual([]);
      expect(g.form.w).toBeGreaterThan(0);
      expect(g.form.weight).toBe(1);
      expect(g.form.method).toBe('skeleton-trace');
      for (const s of g.form.strokes) {
        for (let i = 0; i < s.length; i += 2) {
          expect(s[i]).toBeGreaterThanOrEqual(-0.05);
          expect(s[i]).toBeLessThanOrEqual(g.form.w + 0.05);
          expect(s[i + 1]).toBeGreaterThan(-1);
          expect(s[i + 1]).toBeLessThan(2.2);
        }
      }
    }
  });

  it('places letters on the baseline and x-height (stems end at 0, x-height tops near 1, ascenders higher)', async () => {
    const { r } = await extracted(LATIN);
    const extent = g => {
      const ys = g.form.strokes.flatMap(s => s.filter((_, i) => i % 2 === 1));
      return [Math.min(...ys), Math.max(...ys)];
    };
    const by = t => glyphs(r).filter(g => g.text === t);
    for (const g of [...by('n'), ...by('m'), ...by('u')]) {
      const [lo, hi] = extent(g);
      expect(Math.abs(lo)).toBeLessThan(0.12);
      expect(Math.abs(hi - 1)).toBeLessThan(0.15);
    }
    for (const g of [...by('h'), ...by('k'), ...by('l')]) expect(extent(g)[1]).toBeGreaterThan(1.45);
    for (const g of [...by('p'), ...by('q'), ...by('y'), ...by('g')]) expect(extent(g)[0]).toBeLessThan(-0.4);
  });

  it('reproduces the drawn centre-lines (synthetic ground truth)', async () => {
    for (const text of [LATIN, HINDI]) {
      const { r, truth } = await extracted(text);
      const scores = glyphs(r).map(g => againstTruth(g, truth, XH));
      const mean = scores.reduce((s, v) => s + v.distance, 0) / scores.length;
      expect(mean).toBeLessThan(0.035);
      scores.forEach(s => {
        expect(s.distance).toBeLessThan(0.08);
        expect(s.completeness).toBeGreaterThan(0.9);
      });
    }
  });

  it('keeps strokes continuous: no jumps along a stroke, closed bowls end where they start', async () => {
    const { r } = await extracted(LATIN);
    for (const g of glyphs(r)) {
      for (const s of g.form.strokes) {
        const pts = sampleChain(s, 0.01);
        for (let i = 1; i < pts.length; i++) expect(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])).toBeLessThan(0.2);
      }
    }
    const o = glyphs(r).filter(g => g.text === 'o');
    expect(o.length).toBeGreaterThan(0);
    o.forEach(g => {
      expect(g.form.strokes).toHaveLength(1);
      const s = g.form.strokes[0];
      expect(Math.hypot(s[0] - s[s.length - 2], s[1] - s[s.length - 1])).toBeLessThan(1e-9);
    });
  });

  it('is deterministic and stable under small changes to the photo', async () => {
    const a = await extracted(LATIN);
    const again = await analyzeSample(pageFor(LATIN).raster, { slot: 2, knownText: LATIN, sampleId: 'sample-9', revision: 4, yieldFn: async () => {}, extract: true, source: { width: a.raster.width * 3, height: a.raster.height * 3 } });
    expect(again.extraction).toEqual(a.r.extraction);
    // Different paper noise and a 1 px shift: the same letters, nearly the
    // same lines. The geometry must agree for every letter; the grouping of
    // lines into strokes may differ where a junction's continuation angle
    // is borderline (reported), but rarely.
    const b = await extracted(LATIN, { noise: 4, marginX: 51 }); // same seed: the same drawn letters
    let compared = 0;
    let sameGrouping = 0;
    for (const g of glyphs(a.r)) {
      const h = glyphs(b.r).find(x => x.source.start === g.source.start);
      if (!h) continue;
      compared++;
      if (h.form.strokes.length === g.form.strokes.length) sameGrouping++;
      const pa = g.form.strokes.flatMap(s => sampleChain(s, 0.05));
      const pb = h.form.strokes.flatMap(s => sampleChain(s, 0.05));
      const both = [pa.reduce((s, p) => s + nearest(p, pb), 0) / pa.length, pb.reduce((s, p) => s + nearest(p, pa), 0) / pb.length];
      both.forEach(d => expect([g.text, d < 0.06]).toEqual([g.text, true]));
    }
    expect(compared).toBeGreaterThan(30);
    expect(sameGrouping / compared).toBeGreaterThanOrEqual(0.9);
  });
});

describe('coordinate mapping', () => {
  it('maps glyph ↔ frame ↔ analysis ↔ source exactly', async () => {
    const { r } = await extracted(LATIN, { skew: 3 });
    expect(r.skew.applied).toBe(true);
    const g = glyphs(r)[0];
    const t = g.transform;
    expect(t.deskew.angle).toBe(r.skew.angle);
    for (const p of [[0, 0], [0.5, 1], [1.2, -0.4]]) {
      const f = glyphToFrame(p, t);
      expect(frameToGlyph(f, t)[0]).toBeCloseTo(p[0], 9);
      expect(frameToGlyph(f, t)[1]).toBeCloseTo(p[1], 9);
      const back = analysisToFrame(frameToAnalysis(f, t), t);
      expect(back[0]).toBeCloseTo(f[0], 9);
      expect(back[1]).toBeCloseTo(f[1], 9);
      const src = glyphToSource(p, t);
      const an = frameToAnalysis(f, t);
      expect(src[0]).toBeCloseTo(an[0] * 3, 6);
    }
    expect(t.source).toEqual({ width: r.extraction && t.analysis.width * 3, height: t.analysis.height * 3, scale: 3 });
  });

  it('puts the traced lines back on the ink of the original, un-straightened photo', async () => {
    const p = pageFor(LATIN, { skew: 3 });
    const r = await analyzeSample(p.raster, { slot: 2, knownText: LATIN, yieldFn: async () => {}, extract: true, keepRepresentations: true });
    const ink = r.representations.cleanInk; // the original orientation
    const w = p.raster.width;
    let on = 0;
    let all = 0;
    for (const g of glyphs(r)) {
      for (const [x, y] of formPointsInAnalysis(g, 0.05)) {
        all++;
        let hit = false;
        for (let dy = -1; dy <= 1 && !hit; dy++) for (let dx = -1; dx <= 1 && !hit; dx++) hit = !!ink[(Math.floor(y) + dy) * w + Math.floor(x) + dx];
        if (hit) on++;
      }
    }
    expect(all).toBeGreaterThan(1000);
    expect(on / all).toBeGreaterThan(0.97);
  });

  it('matches ground truth on a skewed page through the deskew transform', async () => {
    const { r, truth } = await extracted(HINDI, { skew: 2 });
    const scores = glyphs(r).map(g => againstTruth(g, truth, XH));
    expect(scores.length).toBeGreaterThan(15);
    scores.forEach(s => expect(s.completeness).toBeGreaterThan(0.9));
  });
});

describe('confidence', () => {
  it('is the weaker Phase 4 score × trace fidelity, never higher than what it comes from', async () => {
    const { r } = await extracted(LATIN);
    for (const g of glyphs(r)) {
      const c = g.confidence;
      const expected = Math.round(Math.min(c.inputs.boundary, c.inputs.alignment) * c.inputs.fidelity * 1000) / 1000;
      expect(c.score).toBeCloseTo(expected, 3);
      expect(c.score).toBeLessThanOrEqual(g.observation.boundary);
      expect(c.score).toBeLessThanOrEqual(g.observation.alignment);
      expect(c.inputs.fidelity).toBeGreaterThanOrEqual(EXTRACTION.FIDELITY_MIN);
      expect(g.form.confidence).toEqual(c);
      expect(c.basis).toMatch(/fidelity/);
    }
  });

  it('carries image doubts forward: a noisier photo gives lower confidence', async () => {
    const clean = await extracted(LATIN);
    const noisy = await extracted(LATIN, { noise: 10 });
    expect(noisy.r.quality.score.score).toBeLessThan(clean.r.quality.score.score);
    expect(glyphs(noisy.r).length).toBeGreaterThan(30);
    const mean = r => glyphs(r).reduce((s, g) => s + g.confidence.score, 0) / glyphs(r).length;
    expect(mean(noisy.r)).toBeLessThan(mean(clean.r));
    glyphs(noisy.r).forEach(g => expect(g.confidence.inputs.upstream).toBeLessThan(1));
    // A photo Phase 3 flags as grainy: its doubt reaches every unit, and nothing is traced.
    const grainy = await extracted(LATIN, { noise: 14 });
    expect(grainy.r.quality.issues.map(i => i.code)).toContain('noisy');
    expect(grainy.r.extraction.summary.extracted).toBe(0);
    grainy.r.extraction.units.filter(u => u.code === 'not-aligned').forEach(u => expect(u.reasons.join(' ')).toMatch(/image: /));
  });
});

describe('rejection of unreliable units', () => {
  it('rejects ambiguous units (touching letters) with their Phase 4 reasons, never tracing them', async () => {
    const { r } = await extracted(LATIN, { touching: true });
    const ambiguous = r.alignment.observations.units.filter(u => u.state !== 'aligned');
    expect(ambiguous.length).toBeGreaterThan(20);
    for (const u of ambiguous) {
      const rec = r.extraction.units.find(x => x.source.start === u.source.start);
      expect(rec.status).toBe('rejected');
      expect(rec.code).toBe('not-aligned');
      expect(rec.reasons[0]).toBe(`Phase 4 state: ${u.state}`);
      expect(rec.form).toBeUndefined();
    }
  });

  it('never extracts part of a letter: next to an ambiguous neighbour the glyph is rejected', async () => {
    // Touching letters: a cut can be a real gap inside a letter (b's stem |
    // bowl) with the rest of the letter in the ambiguous neighbour.
    const { r, truth } = await extracted(LATIN, { touching: true });
    const units = r.alignment.observations.units;
    for (const rec of r.extraction.units.filter(u => u.code === 'neighbour-uncertain')) {
      const i = units.findIndex(u => u.source.start === rec.source.start);
      expect(units[i].state).toBe('aligned');
      const neighbours = [units[i - 1], units[i + 1]].filter(n => n && n.word === units[i].word && n.state !== 'aligned');
      expect(neighbours.length).toBeGreaterThan(0);
      expect(rec.reasons.join(' ')).toMatch(new RegExp(`“${neighbours[0].text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}”`));
    }
    expect(r.extraction.summary.rejected['neighbour-uncertain']).toBeGreaterThan(0);
    // Whatever is extracted is the whole letter.
    glyphs(r).forEach(g => expect([g.text, againstTruth(g, truth, XH).completeness > 0.9]).toEqual([g.text, true]));
  });

  it('rejects everything on an unusable photo and most of a blurred one', async () => {
    const faint = await extracted(LATIN, { ink: 200 });
    expect(faint.r.quality.usable).toBe(false);
    expect(faint.r.extraction.summary.extracted).toBe(0);
    expect(faint.r.extraction.units.every(u => u.code === 'image-unusable')).toBe(true);
    const blurred = await extracted(LATIN, { blur: 3 });
    expect(blurred.r.extraction.summary.extracted).toBeLessThan(0.15 * blurred.r.extraction.summary.considered);
  });

  it('rejects structure conflicts, mark doubts, overlaps, small writing and a missing slot', async () => {
    const p = pageFor(LATIN);
    const r = await analyzeSample(p.raster, { slot: 2, knownText: LATIN, yieldFn: async () => {}, keepRepresentations: true });
    const base = { mask: r.representations.textMask, width: p.raster.width, height: p.raster.height, segmentation: r.segmentation, quality: r.quality, skew: { angle: 0, applied: false }, slot: 2 };
    const doctor = (i, change) => {
      const units = r.alignment.observations.units.map((u, k) => (k === i ? change(JSON.parse(JSON.stringify(u))) : u));
      return extractGlyphs({ ...base, alignment: { ...r.alignment, observations: { ...r.alignment.observations, units } } }).units[i];
    };
    const i = r.alignment.observations.units.findIndex(u => u.state === 'aligned');
    expect(doctor(i, u => ({ ...u, reasons: ['boundary contradicts the typed cluster structure: test'] })).code).toBe('structure-conflict');
    expect(doctor(i, u => ({ ...u, reasons: ['a mark straddles the cluster boundary'] })).code).toBe('marks-inconsistent');
    expect(doctor(i, u => ({ ...u, overlapsNeighbor: true })).code).toBe('overlaps-neighbour');
    expect(doctor(i, u => ({ ...u, boundaryConfidence: { ...u.boundaryConfidence, score: 0.2 } })).code).toBe('below-threshold');
    const small = extractGlyphs({ ...base, segmentation: { ...r.segmentation, lines: r.segmentation.lines.map(l => ({ ...l, xHeight: 8 })) }, alignment: r.alignment });
    expect(small.units.filter(u => u.status === 'extracted')).toHaveLength(0);
    expect(new Set(small.units.filter(u => r.alignment.observations.units.find(o => o.source.start === u.source.start).state === 'aligned').map(u => u.code))).toEqual(new Set(['too-small']));
    expect(extractGlyphs({ ...base, slot: 0, alignment: r.alignment }).units[i].code).toBe('no-sample-slot');
    expect(extractGlyphs({ ...base, alignment: null }).status).toBe('no-alignment');
  });

  it('every rejection has a known code and a reason; no rejected unit has geometry', async () => {
    for (const [text, o] of [[LATIN, { touching: true }], [LATIN, { blur: 3 }], [HINDI, {}], [LATIN, { ink: 200 }]]) {
      const { r } = await extracted(text, o);
      for (const u of r.extraction.units.filter(x => x.status === 'rejected')) {
        expect(REJECTION_CODES).toContain(u.code);
        expect(u.reasons.length).toBeGreaterThan(0);
        expect('form' in u).toBe(false);
      }
    }
  });
});

describe('Devanagari clusters', () => {
  it('extracts one glyph per cluster — matras, marks and conjunct parts together', async () => {
    const { r, truth } = await extracted(HINDI);
    const g = glyphs(r);
    expect(g.length).toBeGreaterThanOrEqual(0.9 * r.extraction.summary.considered);
    for (const x of g) {
      const t = truth.units.find(u => u.start === x.source.start);
      expect(x.text).toBe(t.text); // the whole typed cluster
      expect(x.script).toBe('Deva');
    }
    // The post-base ा stem of ज्ञा lies inside its glyph.
    const jnya = g.find(x => x.text === 'ज्ञा');
    const t = truth.units.find(u => u.start === jnya.source.start);
    const right = Math.max(...formPointsInAnalysis(jnya, 0.05).map(p => p[0]));
    expect(right).toBeGreaterThan(t.x1 - 0.35 * XH);
    // Conjuncts are traced as one glyph and say so.
    for (const c of g.filter(x => x.relation && x.relation.conjunct)) expect(c.reasons.join(' ')).toMatch(/conjunct traced as one glyph/);
    // The pre-base ि stays with its cluster: the glyph starts left of its consonant.
    const ki = g.find(x => x.text === 'कि');
    expect(ki.form.strokes.length).toBeGreaterThanOrEqual(2);
  });

  it('carries the cluster’s headline segment across its top', async () => {
    const { r } = await extracted(HINDI);
    for (const g of glyphs(r)) {
      // The headline is drawn at the line's x-height (y ≈ 1); its traced
      // points span most of the glyph's width there (alone, or continuing
      // into a stem as one stroke).
      const pts = g.form.strokes.flatMap(s => sampleChain(s, 0.02)).filter(p => Math.abs(p[1] - 1) < 0.12);
      const span = pts.length ? Math.max(...pts.map(p => p[0])) - Math.min(...pts.map(p => p[0])) : 0;
      expect([g.text, span > 0.6 * (g.form.w - 2 * EXTRACTION.PAD)]).toEqual([g.text, true]);
    }
  });
});

describe('contract, privacy and separation', () => {
  it('records sample, revision, slot, text range, observation, transform and method; no pixels', async () => {
    const { r } = await extracted(LATIN);
    for (const g of r.extraction.units) {
      expect(validateExtraction(g)).toEqual([]);
      expect([g.sampleId, g.revision, g.slot]).toEqual(['sample-9', 4, 2]);
      expect(LATIN.slice(g.source.start, g.source.end)).toBe(g.text);
      expect(g.method).toBe('skeleton-trace');
    }
    for (const g of glyphs(r)) expect(g.form.observations).toEqual([{ sample: 2, bbox: g.observation.bbox }]);
    expect(JSON.stringify(r.extraction, (k, v) => (ArrayBuffer.isView(v) ? '<<PIXELS>>' : v))).not.toMatch(/PIXELS/);
    expect(validateExtraction({ ...glyphs(r)[0], pixels: [1] })).toContain('pixels: extraction records carry no pixels or file locations');
    expect(validateExtraction({ ...r.extraction.units[0], status: 'rejected', code: 'nope', reasons: [] }).length).toBeGreaterThan(0);
  });

  it('produces forms the renderer adapter accepts unchanged', async () => {
    const { r } = await extracted(LATIN);
    const n = glyphs(r).find(g => g.text === 'n');
    const { table } = rendererGlyphs({ units: { n: { coverage: 'observed', forms: [n.form] } } });
    expect(table.n).toEqual({ w: n.form.w, strokes: n.form.strokes });
  });

  it('runs only on request, and stops when cancelled', async () => {
    const p = pageFor('one two');
    const plain = await analyzeSample(p.raster, { slot: 2, knownText: 'one two', yieldFn: async () => {} });
    expect('extraction' in plain).toBe(false);
    let calls = 0;
    const cancelled = await analyzeSample(p.raster, { slot: 2, knownText: 'one two', extract: true, yieldFn: async () => {}, shouldCancel: () => ++calls >= 7 });
    expect(cancelled.status).toBe('cancelled');
  });

  it('builds no profile and registers nothing (extraction is separate from Phase 6)', async () => {
    await extracted(LATIN);
    expect(getHandwritingStyles().map(s => s.id)).toEqual(['reference_student', 'reference_student_lang2', 'reference_student_lang3']);
    expect(Object.keys(GLYPH_SETS)).toEqual(['lang1', 'lang2', 'lang3']);
    const dir = path.join(__dirname, '../src/handwriting/learn');
    for (const f of ['glyphExtraction.js', 'skeleton.js', 'strokeFit.js']) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      expect(src).not.toMatch(/from '\.\.\/glyphs'|handwritingProfiles|profileBuilder|profileRepository|Math\.random/);
    }
    const stages = PIPELINE_STAGES.filter(s => s.implemented && s.phase === 5).map(s => s.name);
    expect(stages).toEqual(['GlyphGeometryExtractor', 'StrokeGeometryReconstructor']);
  });
});
