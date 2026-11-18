/**
 * Stroke model: letters as pen strokes, reshaped per occurrence, connected
 * by context, written with pressure. These tests measure geometry — sample
 * spacing, tails, tapers, pressure shapes, correlations — not just that
 * objects exist.
 */
import { getHandwritingStyle } from '../src/data/handwritingStyles';
import { getPageMetrics, getPageType, rowHeightFor } from '../src/data/paper';
import { baselineInRow } from '../src/components/HandwritingText';
import { pathPoints, renderLines } from '../src/handwriting/glyphRender';
import { glyphFor } from '../src/handwriting/glyphs';
import {
  SAMPLE_STEP,
  contextualVariant,
  glyphContext,
  letterStrokes,
  pressureCurve,
  sampleChain,
  strokeLength,
} from '../src/handwriting/strokeModel';
import { emptyFormatting } from '../src/utils/formatting';
import { createMeasurer, layoutHandwriting } from '../src/utils/textLayout';
import { correlated, createRandom } from '../src/utils/variation';

const profile = () => getHandwritingStyle('reference_student');
const POEM = [
  'The night slips quietly away,',
  'And wakes the gold and blue of day.',
  'A little bird begins to sing,',
  'And shakes the dewdrop from its wing.',
  'The flowers lift their heads to see',
  'The light dance softly through the tree,',
  'And all the world is bright and new,',
  'With morning waiting there for you.',
].join('\n');

function draw(text, { seed = 'doc', pageId, quality, formatting } = {}) {
  const style = profile();
  const metrics = getPageMetrics({ pageType: 'lined' });
  const rowHeight = rowHeightFor(getPageType('lined'), metrics, style);
  const layout = layoutHandwriting(text, style, {
    fontSize: metrics.fontSize,
    contentWidth: metrics.contentWidth,
    seed,
    pageId,
    formatting,
    lineHeight: rowHeight,
  });
  const strokes = [];
  const drawn = renderLines(layout.lines, {
    profile: style,
    layout,
    rowHeight,
    baselineInRow: baselineInRow(rowHeight, style, layout.fontSize),
    ink: { floor: 0.86, strength: 1 },
    quality,
    debug: strokes,
  });
  return { layout, drawn, strokes };
}

const ctx = (extra = {}) => ({
  profile: profile(),
  prev: null,
  next: null,
  seed: 12345,
  nextAdvance: 1,
  ...extra,
});

const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const sd = a => {
  const m = mean(a);
  return Math.sqrt(mean(a.map(v => (v - m) ** 2)));
};
/** Lag-1 autocorrelation pooled over several sequences. */
function lag1(sequences) {
  const all = sequences.flat();
  const m = mean(all);
  let num = 0;
  let den = 0;
  for (const seq of sequences) {
    for (let i = 0; i < seq.length; i++) {
      den += (seq[i] - m) ** 2;
      if (i) num += (seq[i] - m) * (seq[i - 1] - m);
    }
  }
  return num / den;
}

// --- Representation ------------------------------------------------------------

describe('letters as pen strokes', () => {
  it('samples each stroke densely and evenly along the pen path', () => {
    const { xs, ys } = sampleChain(glyphFor('o').strokes[0]);
    expect(xs.length).toBeGreaterThan(15);
    for (let i = 1; i < xs.length; i++) {
      const step = Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
      expect(step).toBeLessThan(SAMPLE_STEP * 1.6);
    }
  });

  it('writes a, d, g, q as one stroke: bowl, then up and down the stem', () => {
    for (const ch of 'adgq') {
      const strokes = letterStrokes(ch, ctx());
      expect([ch, strokes.length]).toEqual([ch, 1]);
      const { xs, ys } = strokes[0];
      // The bowl reaches the far left first…
      const left = xs.indexOf(Math.min(...xs));
      expect(xs[left]).toBeLessThan(0.12);
      // …then the pen climbs the right stem to its top…
      const top = ys.indexOf(Math.max(...ys.slice(left)));
      expect(xs[top]).toBeGreaterThan(0.6);
      expect(top).toBeGreaterThan(left);
      // …and comes back down it (a retrace), below the x-height.
      expect(Math.min(...ys.slice(top))).toBeLessThan(ys[top] - 0.8);
    }
  });

  it('writes n, m, h, r down the stem and back up into the arch', () => {
    for (const ch of 'nmhr') {
      const strokes = letterStrokes(ch, ctx());
      expect([ch, strokes.length]).toEqual([ch, 1]);
      const { ys } = strokes[0];
      const low = ys.findIndex(y => y < 0.1);
      expect(low).toBeGreaterThan(0);
      // After reaching the baseline the pen climbs again.
      expect(Math.max(...ys.slice(low))).toBeGreaterThan(0.8);
    }
  });

  it('dots i and j as separate short strokes, drawn as round blobs', () => {
    expect(letterStrokes('i', ctx())).toHaveLength(2);
    const { strokes } = draw('ii.');
    const dots = strokes.filter(s => s.dot);
    expect(dots).toHaveLength(3); // two i dots and the full stop
    dots.forEach(d => expect(d.radius).toBeGreaterThan(0));
  });
});

// --- Determinism and context ------------------------------------------------

describe('stroke variation', () => {
  it('reproduces exactly for the same occurrence', () => {
    expect(letterStrokes('e', ctx())).toEqual(letterStrokes('e', ctx()));
    expect(draw(POEM).strokes).toEqual(draw(POEM).strokes);
  });

  it('reshapes each occurrence a little — same letter, never a copy', () => {
    const a = letterStrokes('e', ctx({ seed: 1 }))[0];
    const b = letterStrokes('e', ctx({ seed: 2 }))[0];
    expect(a).not.toEqual(b);
    // Still the same letter: resample both and compare point by point.
    const at = (st, t) => {
      const i = Math.round(t * (st.xs.length - 1));
      return [st.xs[i], st.ys[i]];
    };
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const [ax, ay] = at(a, t);
      const [bx, by] = at(b, t);
      expect(Math.hypot(ax - bx, ay - by)).toBeLessThan(0.3);
    }
  });

  it('chooses variants by context: neighbours change the choice', () => {
    const count = profile().glyphVariants;
    let changed = 0;
    for (let seed = 0; seed < 40; seed++) {
      const inAnd = contextualVariant('a', null, 'n', seed, count);
      const inDay = contextualVariant('a', 'd', 'y', seed, count);
      if (inAnd !== inDay) changed++;
    }
    expect(changed).toBeGreaterThan(15);
    // Every variant is used across occurrences.
    const used = new Set(
      Array.from({ length: 60 }, (_, s) => contextualVariant('e', 'h', 'r', s, count)),
    );
    expect(used.size).toBe(count);
  });

  it('draws the same letter differently in different words', () => {
    const { strokes } = draw('and day');
    const aStrokes = strokes.filter(s => s.char === 'a');
    expect(aStrokes).toHaveLength(2);
    const shape = s => {
      const x0 = s.xs[0];
      const y0 = s.ys[0];
      return s.xs.map((x, i) => [x - x0, s.ys[i] - y0]);
    };
    expect(shape(aStrokes[0])).not.toEqual(shape(aStrokes[1]));
  });
});

describe('connections between letters', () => {
  it('draws the exit tail toward the next letter, low and short', () => {
    const lone = letterStrokes('a', ctx())[0];
    const joined = letterStrokes('a', ctx({ next: 'n', nextAdvance: 1.05 }))[0];
    expect(lone.tail).toBeUndefined();
    expect(joined.tail).toBeGreaterThan(0);
    const end = [joined.xs[joined.xs.length - 1], joined.ys[joined.ys.length - 1]];
    const exit = glyphContext('a').exit;
    const target = 1.05 + glyphContext('n').entry.x;
    // Moves right, toward the next letter, but (unless it joins) stops short.
    expect(end[0]).toBeGreaterThan(exit.x);
    expect(end[0]).toBeLessThanOrEqual(target + 0.05);
    if (!joined.joined) {
      expect(end[1]).toBeLessThan(0.5);
    }
  });

  it('only connects letters inside a word', () => {
    expect(letterStrokes('a', ctx({ next: ' ' }))[0].tail).toBeUndefined();
    expect(letterStrokes('a', ctx({ next: ',' }))[0].tail).toBeUndefined();
    expect(letterStrokes('a', ctx({ next: 'B' }))[0].tail).toBeUndefined();
  });

  it('shapes tails by the pair: th, tr, an, ar, er differ', () => {
    const ends = ['h', 'r', 'n', 'i', 'u'].map(next => {
      const st = letterStrokes('t', ctx({ next, nextAdvance: 0.8 }))[0];
      return `${st.xs[st.xs.length - 1].toFixed(3)},${st.ys[st.ys.length - 1].toFixed(3)}`;
    });
    expect(new Set(ends).size).toBeGreaterThan(2);
  });

  it('adds an occasional lead-in after a letter that ends on the baseline', () => {
    let leads = 0;
    for (let seed = 0; seed < 50; seed++) {
      const st = letterStrokes('n', ctx({ prev: 'a', seed }))[0];
      if (st.lead) {
        leads++;
        // Comes in from below-left of the entry.
        expect(st.ys[0]).toBeLessThan(st.ys[st.lead]);
        expect(st.xs[0]).toBeLessThan(st.xs[st.lead]);
      }
    }
    expect(leads).toBeGreaterThan(5);
    expect(leads).toBeLessThan(45);
    expect(letterStrokes('n', ctx({ prev: null }))[0].lead).toBeUndefined();
  });
});

// --- Pressure ------------------------------------------------------------------

describe('pressure along strokes', () => {
  const line = n => ({
    xs: Array.from({ length: n }, (_, i) => i * 0.8),
    ys: Array.from({ length: n }, () => 10),
  });

  it('lands lightly, presses in the middle and releases at the end', () => {
    const { xs, ys } = line(40);
    const p = pressureCurve(xs, ys, 6, createRandom(3), profile().pressure);
    const middle = Math.max(...p.slice(10, 30));
    expect(p[0]).toBeLessThan(middle * 0.8);
    expect(p[p.length - 1]).toBeLessThan(middle * 0.85);
    p.forEach(v => {
      expect(v).toBeGreaterThanOrEqual(0.2);
      expect(v).toBeLessThan(1.4);
    });
  });

  it('gives every stroke its own pressure curve', () => {
    const { xs, ys } = line(40);
    const curves = [1, 2, 3, 4, 5].map(seed =>
      pressureCurve(xs, ys, 6, createRandom(seed), profile().pressure)
        .map(v => v.toFixed(3))
        .join(),
    );
    expect(new Set(curves).size).toBe(5);
  });

  it('presses a little harder on downstrokes than upstrokes', () => {
    const n = 30;
    const down = { xs: Array(n).fill(5), ys: Array.from({ length: n }, (_, i) => i * 0.8) };
    const up = { xs: Array(n).fill(5), ys: Array.from({ length: n }, (_, i) => -i * 0.8) };
    const cfg = profile().pressure;
    const pd = pressureCurve(down.xs, down.ys, 6, createRandom(9), cfg);
    const pu = pressureCurve(up.xs, up.ys, 6, createRandom(9), cfg);
    expect(mean(pd)).toBeGreaterThan(mean(pu));
  });

  it('tapers stroke ends and varies width along strokes, without blobs', () => {
    const { strokes } = draw(POEM);
    const ribbons = strokes.filter(s => !s.dot && s.halfWidth.length >= 8);
    let tapered = 0;
    const ratios = [];
    for (const s of ribbons) {
      const hw = s.halfWidth;
      const sorted = [...hw].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      if (hw[0] < median && hw[hw.length - 1] < median) tapered++;
      ratios.push(sorted[sorted.length - 1] / sorted[0]);
    }
    expect(tapered / ribbons.length).toBeGreaterThan(0.7);
    // Visible variation (ballpoint), but never marker-like swelling.
    expect(mean(ratios)).toBeGreaterThan(1.25);
    expect(Math.max(...ratios)).toBeLessThan(3);
    // Thin: the full-pressure width stays a fine ballpoint line.
    ribbons.forEach(s => {
      expect(Math.max(...s.halfWidth) * 2).toBeLessThan(s.unit * 0.25);
    });
  });

  it('lays denser ink where the pen pressed hardest', () => {
    const { drawn } = draw(POEM);
    const core = drawn.buckets.find(b => b.key === 'core');
    expect(core).toBeTruthy();
    expect(core.alpha).toBeLessThan(0.4);
    const ink = drawn.buckets.filter(b => b.key !== 'core');
    ink.forEach(b => expect(b.alpha).toBeGreaterThanOrEqual(0.86));
    // The core covers only part of the writing.
    const size = b => b.d.length;
    expect(size(core)).toBeLessThan(ink.reduce((t, b) => t + size(b), 0) * 0.5);
  });

  it('varies stroke start points between occurrences of a letter', () => {
    const { strokes } = draw('lllllllllll');
    const starts = strokes.map(s => s.ys[0] - s.ys[s.ys.length - 1]);
    expect(sd(starts)).toBeGreaterThan(0.05);
  });
});

// --- Baseline, size, spacing, words -----------------------------------------

describe('correlated variation along the line', () => {
  const words = () =>
    draw(POEM.repeat(3)).layout.paragraphs.flatMap(p => p.words).filter(w => w.chars && w.chars.length >= 5);

  it('drifts the baseline smoothly from letter to letter', () => {
    const ws = words();
    const unit = draw('x').layout.unit;
    const seqs = ws.map(w => w.chars.map(c => c.translateY));
    const all = seqs.flat();
    expect(sd(all)).toBeGreaterThan(0.005 * unit);
    all.forEach(v => expect(Math.abs(v)).toBeLessThanOrEqual(0.05 * unit));
    // Neighbouring letters move together (measured on ref 3: ≈0.37).
    expect(lag1(seqs)).toBeGreaterThan(0.15);
  });

  it('varies letter height a little, in runs', () => {
    const seqs = words().map(w => w.chars.map(c => c.scaleY));
    expect(sd(seqs.flat())).toBeGreaterThan(0.008);
    expect(sd(seqs.flat())).toBeLessThan(0.05);
    expect(lag1(seqs)).toBeGreaterThan(0.15);
  });

  it('gives spacing a rhythm without changing the word width', () => {
    const style = profile();
    const layout = draw('international marketing').layout;
    const word = layout.paragraphs[0].words[0];
    const gaps = word.chars.map(c => c.gap);
    expect(sd(gaps)).toBeGreaterThan(0);
    // Measured width = glyph advances + base spacing (rhythm sums to zero).
    const measure = createMeasurer(style, layout.fontSize);
    const advances = word.chars.reduce((t, c) => t + measure(c.char), 0);
    const expected = (advances + word.letterSpacing * word.chars.length) * word.scaleX;
    expect(word.width).toBeCloseTo(expected, 0);
  });

  it('treats each word as one gesture: its own tilt, lean and firmness', () => {
    const ws = draw(POEM).layout.paragraphs.flatMap(p => p.words);
    for (const key of ['rotate', 'slant', 'scale', 'translateY']) {
      // Rounded to 0.001, so a few words share a value.
      expect([key, new Set(ws.map(w => w[key])).size > ws.length * 0.35]).toEqual([key, true]);
    }
    ws.forEach(w => {
      expect(Math.abs(w.rotate)).toBeLessThanOrEqual(1.2);
      expect(Math.abs(w.slant - profile().slant)).toBeLessThanOrEqual(1);
    });
  });

  it('keeps correlated sequences bounded and reproducible', () => {
    const a = correlated(createRandom(5), 2000, 0.04, 0.4);
    const b = correlated(createRandom(5), 2000, 0.04, 0.4);
    expect(a).toEqual(b);
    a.forEach(v => expect(Math.abs(v)).toBeLessThanOrEqual(0.04));
    expect(lag1([a])).toBeGreaterThan(0.3);
    expect(lag1([a])).toBeLessThan(0.5);
    expect(correlated(createRandom(5), 5, 0)).toEqual([0, 0, 0, 0, 0]);
  });
});

// --- Output -----------------------------------------------------------------------

describe('path output', () => {
  it('writes compact, finite path data that stays on the page', () => {
    const { drawn } = draw(POEM);
    const metrics = getPageMetrics({ pageType: 'lined' });
    const off = [];
    for (const b of drawn.buckets) {
      for (const sub of pathPoints(b.d)) {
        for (const [x, y] of sub) {
          const ok =
            Number.isFinite(x) &&
            Number.isFinite(y) &&
            x > -30 &&
            x < metrics.contentWidth + 30 &&
            y > -30;
          if (!ok) off.push([x, y]);
        }
      }
    }
    expect(off).toEqual([]);
    const bytes = drawn.buckets.reduce((t, b) => t + b.d.length, 0);
    expect(bytes / POEM.length).toBeLessThan(700);
  });

  it('draws thumbnails as light centre-lines', () => {
    const full = draw(POEM).drawn;
    const thumb = draw(POEM, { quality: 'preview' }).drawn;
    const bytes = d => d.buckets.reduce((t, b) => t + b.d.length, 0);
    expect(bytes(thumb)).toBeLessThan(bytes(full) * 0.4);
    thumb.buckets.forEach(b => expect(b.width).toBeGreaterThan(0));
    expect(thumb.buckets.find(b => b.key === 'core')).toBeUndefined();
  });

  it('keeps headings and underlines in the same pen', () => {
    const text = 'Introduction\nbody';
    const { drawn, strokes } = draw(text, {
      formatting: { ...emptyFormatting(), headings: [{ start: 0, end: 12, underline: true }] },
    });
    expect(drawn.underlines).toHaveLength(1);
    const head = strokes.filter(s => s.word === 'Introduction' && !s.dot);
    const body = strokes.filter(s => s.word === 'body' && !s.dot);
    expect(mean(head.map(s => s.base))).toBeGreaterThan(mean(body.map(s => s.base)));
    // Headings get pressure curves like everything else.
    head.forEach(s => expect(sd(s.pressure)).toBeGreaterThan(0));
  });

  it('writes digits and punctuation with pressure too', () => {
    const { strokes } = draw('2024, 87% (a) → #3!');
    const ribbons = strokes.filter(s => !s.dot);
    expect(new Set(ribbons.map(s => s.char))).toEqual(
      new Set(['2', '0', '4', ',', '8', '7', '%', '(', 'a', ')', '→', '#', '3', '!']),
    );
    ribbons.forEach(s => expect(s.pressure.every(Number.isFinite)).toBe(true));
    expect(strokeLength({ xs: [0, 3], ys: [0, 4] })).toBe(5);
  });
});
