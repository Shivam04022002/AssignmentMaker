/**
 * Lang4 Phase 11 — glyph quality and extraction reliability.
 *
 * Every image here is SYNTHETIC: masks drawn pixel by pixel, or pages of
 * geometric pseudo-glyphs (hand-printed a / t / e with `letterforms:
 * 'print'`), scored against the fixtures' own ground truth. They pin the
 * three defects found on the real reference page (an a traced as an o, t
 * without its crossbar, a ruled-line piece traced under a and e) to their
 * causes, and the new refusal for counters the image cannot show. Results
 * on the real page are produced only by __tests__/realSamples.optin.test.js.
 */
import { analyzeSample } from '../src/handwriting/learn/analyzeSample';
import { COUNTER_LETTERS, COUNTER_SPACE, extractGlyphs, formPointsInAnalysis, glyphToSource, hullPaperShare, REJECTION_CODES, validateExtraction } from '../src/handwriting/learn/glyphExtraction';
import { FAINT_LINES, suppressFaintBands } from '../src/handwriting/learn/preprocess';
import { SKELETON, traceStrokes } from '../src/handwriting/learn/skeleton';
import { PERSONAL_HANDWRITING_ONBOARDING, VALIDATION_TOOLS } from '../src/dev/flags';
import { syntheticTextPage } from './helpers/syntheticText';

jest.setTimeout(240000);

/** A mask from rows of text ('#' ink). */
const maskOf = rows => {
  const h = rows.length;
  const w = rows[0].length;
  const m = new Uint8Array(w * h);
  rows.forEach((r, y) => [...r].forEach((c, x) => (m[y * w + x] = c === '#' ? 1 : 0)));
  return { m, w, h };
};
const near = (strokes, x, y, d = 1) => strokes.some(s => s.points.some(p => Math.hypot(p[0] - x, p[1] - y) <= d));

// The real page's t (handwriting_03, x-height ≈ 9 px, pen ≈ 2.6 px), redrawn
// as a synthetic mask: short crossbar arms either side of the stem.
const T = [
  '.............',
  '.....##......',
  '.....##......',
  '.....##......',
  '.....##......',
  '.....##......',
  '.....##......',
  '.....##......',
  '.....#####...',
  '..#########..',
  '..#######....',
  '....###......',
  '....###......',
  '....###......',
  '....###......',
  '....###......',
  '....####.....',
  '.....###.....',
  '.............',
];
// An a: a closed bowl with the stem down its right side and a short tail.
const A = [
  '................',
  '.......##.......',
  '.....######.....',
  '....##....##....',
  '...##.....##....',
  '...##.....##....',
  '..##......##....',
  '..##......##....',
  '..##.....###....',
  '..##....#####...',
  '...##..##.####..',
  '....####...###..',
  '.....#......##..',
  '................',
];

describe('skeleton: short stubs survive thinning at small sizes (root cause of "t without crossbar", "a as o")', () => {
  it('a t keeps both crossbar arms', () => {
    const { m, w, h } = maskOf(T);
    const t = traceStrokes(m, w, h, 2.6);
    expect(t.diagnostics.scale).toBe(2);
    expect(near(t.strokes, 2.5, 9.5, 1.2)).toBe(true); // left arm end
    expect(near(t.strokes, 10.5, 9.5, 1.2)).toBe(true); // right arm end
  });

  it('an a keeps its stem’s tail, so it is not an o', () => {
    const { m, w, h } = maskOf(A);
    const t = traceStrokes(m, w, h, 2.6);
    expect(near(t.strokes, 11.5, 10.5, 1)).toBe(true); // the stem runs on into the tail
  });

  it('thinning once (as before) loses them: the cause, not the rendering', () => {
    const was = SKELETON.FINE_BELOW;
    SKELETON.FINE_BELOW = 0;
    try {
      const t = maskOf(T);
      const a = maskOf(A);
      const tt = traceStrokes(t.m, t.w, t.h, 2.6);
      const ta = traceStrokes(a.m, a.w, a.h, 2.6);
      expect(near(tt.strokes, 2.5, 9.5, 1.2) || near(tt.strokes, 10.5, 9.5, 1.2)).toBe(false); // both arms lost
      expect(near(ta.strokes, 11.5, 10.5, 1)).toBe(false); // the stem stops at the bowl: an o
    } finally {
      SKELETON.FINE_BELOW = was;
    }
  });

  it('a pen 4 px or wider is thinned as it is (unchanged)', () => {
    const { m, w, h } = maskOf(T);
    expect(traceStrokes(m, w, h, 4).diagnostics.scale).toBe(1);
  });
});

describe('preprocessing: a faint ruled line under a letter is not part of it (root cause of the tails)', () => {
  const W = 40;
  const H = 30;
  const grid = () => ({ mask: new Uint8Array(W * H), gray: new Uint8Array(W * H).fill(255) });
  const put = (g, x0, x1, y0, y1, v) => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        g.mask[y * W + x] = 1;
        g.gray[y * W + x] = v;
      }
    }
  };
  it('clears the line under a bowl standing on it, keeps the bowl, a crossing line and a dark underline', () => {
    const g = grid();
    put(g, 0, W - 1, 20, 21, 172); // the pale rule across the page (two rows, as photographed)
    put(g, 8, 18, 12, 12, 40); // a bowl's top …
    put(g, 8, 9, 12, 19, 40); // … sides …
    put(g, 17, 18, 12, 19, 40);
    put(g, 8, 18, 19, 19, 40); // … and bottom, standing on the rule
    put(g, 30, 31, 0, H - 1, 100); // a margin line crossing the rule …
    put(g, 29, 29, 0, H - 1, 150); // … with pale soft edges (they run along the rule's rows)
    put(g, 32, 32, 0, H - 1, 150);
    put(g, 0, W - 1, 26, 26, 45); // a dark underline
    for (let k = 0; k < 4; k++) put(g, 1 + k * 2, 1 + k * 2, 2, 17, 40); // more writing (sets the ink level)
    const out = suppressFaintBands(g.mask, g.gray, W, H);
    expect(out.underLetters).toBeGreaterThan(0);
    // Under the bowl: the line's row away from the letter is gone; the row
    // touching the letter's ink is its soft edge and stays.
    for (let x = 8; x <= 18; x++) expect([x, out.mask[21 * W + x]]).toEqual([x, 0]);
    for (let x = 8; x <= 18; x++) expect(out.mask[19 * W + x]).toBe(1); // the bowl's bottom: kept
    for (const x of [29, 30, 31, 32]) for (const y of [20, 21]) expect([x, y, out.mask[y * W + x]]).toEqual([x, y, 1]); // a darker line crossing the rule, with its soft edges: whole
    expect(out.mask[26 * W + 20]).toBe(1); // the dark underline: untouched
  });

  it('without the Phase 11 step the line under the bowl stayed', () => {
    const g = grid();
    put(g, 0, W - 1, 20, 21, 172);
    put(g, 8, 18, 19, 19, 40);
    put(g, 8, 9, 12, 19, 40);
    for (let k = 0; k < 4; k++) put(g, 1 + k * 2, 1 + k * 2, 2, 17, 40);
    const was = FAINT_LINES.underRun;
    FAINT_LINES.underRun = 1e9;
    try {
      expect(suppressFaintBands(g.mask, g.gray, W, H).mask[21 * W + 12]).toBe(1);
    } finally {
      FAINT_LINES.underRun = was;
    }
  });
});

describe('a counter the image cannot show is refused, not guessed', () => {
  it('measures paper inside the outline: an open or closed bowl leaves room, a filled one does not', () => {
    const bowl = maskOf(A);
    expect(hullPaperShare(bowl.m, bowl.w, bowl.h)).toBeGreaterThan(COUNTER_SPACE);
    const filled = maskOf(['......', '.####.', '######', '######', '######', '.####.', '......']);
    expect(hullPaperShare(filled.m, filled.w, filled.h)).toBeLessThan(COUNTER_SPACE);
    expect(REJECTION_CODES).toContain('counter-unresolved');
    expect([...'aeo'].every(c => COUNTER_LETTERS.has(c))).toBe(true);
  });
});

// --- Pages against ground truth ------------------------------------------------------------

const segPts = ([x0, y0, x1, y1], step) => {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
  return Array.from({ length: n + 1 }, (_, k) => [x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
};
const nearest = (p, list) => Math.sqrt(Math.min(...list.map(q => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2)));
const TEXT = 'a tea at the gate\neat a date at ten';

/**
 * Analyses a hand-printed synthetic page and scores every extracted glyph
 * against its true centre-lines: completeness (truth within max(0.15 x-height,
 * pen) of the trace) and extra ink (trace farther than max(0.2 x-height,
 * 1.5 pen) from the truth — a ruled-line piece traced as a tail).
 */
async function scored(o, text = TEXT) {
  const xh = o.xHeight;
  const pen = o.stroke;
  const lg = Math.round(xh * 4.2);
  const lines = text.split('\n').length;
  const page = syntheticTextPage(text, { width: Math.max(900, xh * 48), top: lg, lineGap: lg, marginX: 40, height: lg * (lines + 1) + 30, letterforms: 'print', ...o });
  const r = await analyzeSample(page.raster, { slot: 1, knownText: text, yieldFn: async () => {}, extract: true, source: { width: page.raster.width * 3, height: page.raster.height * 3 } });
  const glyphs = r.extraction.units.filter(u => u.status === 'extracted').map(g => {
    const t = page.truth.units.find(u => u.start === g.source.start);
    const truth = t.centreLines.flatMap(s => segPts(s, 0.4));
    const traced = formPointsInAnalysis(g, 0.02);
    return {
      g,
      text: g.text,
      completeness: truth.filter(p => nearest(p, traced) <= Math.max(0.15 * xh, pen)).length / truth.length,
      extra: traced.filter(p => nearest(p, truth) > Math.max(0.2 * xh, 1.5 * pen)).length / traced.length,
    };
  });
  return { r, page, glyphs };
}
const defective = s => s.glyphs.filter(x => x.completeness < 0.9 || x.extra > 0.1).map(x => `${x.text} c${x.completeness.toFixed(2)} x${x.extra.toFixed(2)}`);

describe('regression pages (synthetic, against truth): no accepted glyph is missing parts or carrying a line', () => {
  it('ruled notebook, letters standing on the rules: no tail under a or e', async () => {
    const s = await scored({ xHeight: 16, stroke: 2.6, notebook: true, noise: 4, blur: 1 });
    expect(s.glyphs.length).toBeGreaterThanOrEqual(8);
    expect(defective(s)).toEqual([]);
  });

  it('small writing with a thick pen: crossbars and tails kept, filled bowls refused with a reason', async () => {
    const s = await scored({ xHeight: 10, stroke: 2.6 });
    expect(defective(s)).toEqual([]);
    const ts = s.glyphs.filter(x => x.text === 't');
    ts.forEach(x => expect(x.completeness).toBeGreaterThanOrEqual(0.9));
    const refused = s.r.extraction.units.filter(u => u.code === 'counter-unresolved');
    expect(refused.length).toBeGreaterThan(0);
    refused.forEach(u => {
      expect(COUNTER_LETTERS.has(u.text)).toBe(true);
      expect(u.reasons.join(' ')).toMatch(/counter/);
      expect(u.form).toBeUndefined(); // no shape is stored for a refused glyph
    });
  });

  it('mixed letter sizes and touching letters: nothing defective accepted', async () => {
    const mixed = await scored({ xHeight: 20, stroke: 2.8 }, 'At Ta Ea at tea\nTea Eat Ate a tee');
    expect(mixed.glyphs.length).toBeGreaterThanOrEqual(20);
    expect(defective(mixed)).toEqual([]);
    const touching = await scored({ xHeight: 12, stroke: 2.6, touching: true });
    expect(defective(touching)).toEqual([]);
  });

  it('keeps source coordinates, confidence and reasons on every record', async () => {
    const s = await scored({ xHeight: 20, stroke: 2.8, notebook: true, noise: 4, blur: 1 });
    s.r.extraction.units.forEach(u => expect([u.text, validateExtraction(u)]).toEqual([u.text, []]));
    // The notebook's margin line stays whole (and is dropped as a page
    // object): clearing the rules under letters must not cut it into
    // pieces that join the first line.
    expect(s.r.segmentation.lines.every(l => l.bbox[0] >= 30)).toBe(true);
    expect(s.r.alignment.observations.units.filter(u => u.reasons.some(t => /lines touch/.test(t)))).toEqual([]);
    for (const { g } of s.glyphs) {
      expect(g.confidence.inputs.fidelity).toBeGreaterThan(0);
      const [x, y] = glyphToSource([g.form.w / 2, 0.5], g.transform);
      const [bx, by, bw, bh] = g.observation.bbox;
      expect(x / 3).toBeGreaterThan(bx - 3);
      expect(x / 3).toBeLessThan(bx + bw + 3);
      expect(y / 3).toBeGreaterThan(by - 3);
      expect(y / 3).toBeLessThan(by + bh + 3);
    }
    for (const u of s.r.extraction.units.filter(x => x.status === 'rejected')) {
      expect(REJECTION_CODES).toContain(u.code);
      expect(u.reasons.length).toBeGreaterThan(0);
    }
  });
});

describe('a letter whose line measurements do not hold is refused, not placed wrongly', () => {
  it('x-height letters placed by a baseline 0.4 x-height too low are refused with the span they had', async () => {
    const text = 'a tea at the gate';
    const page = syntheticTextPage(text, { width: 900, top: 100, lineGap: 100, marginX: 40, height: 200, xHeight: 24, stroke: 3, letterforms: 'print' });
    const r = await analyzeSample(page.raster, { slot: 1, knownText: text, yieldFn: async () => {}, extract: true, keepRepresentations: true });
    const ok = r.extraction.units.filter(u => u.status === 'extracted' && 'ae'.includes(u.text));
    expect(ok.length).toBeGreaterThan(3);
    const shifted = extractGlyphs({
      mask: r.representations.textMask,
      width: page.raster.width,
      height: page.raster.height,
      alignment: r.alignment,
      segmentation: { ...r.segmentation, lines: r.segmentation.lines.map(l => ({ ...l, baseline: l.baseline + 0.4 * l.xHeight })) },
      quality: r.quality,
      skew: { angle: r.skew.angle, applied: r.skew.applied },
      slot: 1,
    });
    for (const u of ok) {
      const again = shifted.units.find(x => x.source.start === u.source.start);
      expect([u.text, again.status, again.code]).toEqual([u.text, 'rejected', 'metrics-inconsistent']);
      expect(again.reasons.join(' ')).toMatch(/spans/);
    }
  });
});

describe('release state', () => {
  it('onboarding stays tied to development / validation builds', () => {
    expect(PERSONAL_HANDWRITING_ONBOARDING).toBe(VALIDATION_TOOLS);
  });
});
