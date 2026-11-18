/**
 * Phase 11: natural handwriting rhythm for Lang2 — Word Space and
 * individual gaps −5…+5, a correlated natural gap rhythm, per-occurrence
 * construction, connection and pressure variation — with Lang1 locked.
 */
import React from 'react';
import { clearAllMockStorages } from '@react-native-async-storage/async-storage';
import { getHandwritingStyle } from '../src/data/handwritingStyles';
import { getPageMetrics, getPageType, rowHeightFor } from '../src/data/paper';
import { baselineInRow } from '../src/components/HandwritingText';
import ExportRenderer from '../src/export/ExportRenderer';
import { buildExportPlan } from '../src/export/exportPlan';
import { setNativeExporter } from '../src/export/nativeExporter';
import { renderLines } from '../src/handwriting/glyphRender';
import { GLYPHS } from '../src/handwriting/glyphs';
import { LANG2_PROFILE_ID } from '../src/handwriting/handwritingProfiles';
import { letterStrokes } from '../src/handwriting/strokeModel';
import { createDocument } from '../src/models/document';
import { getDocument, saveDocument, setStorageBackend } from '../src/storage/documentStorage';
import {
  WORD_SPACING_STEPS,
  applySpanFormat,
  boundariesIn,
  emptyFormatting,
  setWordGap,
} from '../src/utils/formatting';
import { PAGE_BREAK, paginateDocument } from '../src/utils/pagination';
import { layoutHandwriting } from '../src/utils/textLayout';
import { hashString } from '../src/utils/variation';
import { act, render } from './helpers/render';

const L1 = getHandwritingStyle('reference_student');
const L2 = getHandwritingStyle(LANG2_PROFILE_ID);
const LINE = 'The flowers lift their heads to see';
const PROSE =
  'The night slips quietly away, and wakes the gold and blue of day. A little bird begins to sing, and shakes the dewdrop from its wing. The flowers lift their heads to see the light dance softly through the tree.';

const lay = (text, profile = L2, formatting, width = 2000, seed = 'nr') =>
  layoutHandwriting(text, profile, { fontSize: 12.4, contentWidth: width, lineHeight: 20, seed, formatting });
const gapsOf = (text, profile, formatting, width) => {
  const words = lay(text, profile, formatting, width).lines[0].words;
  return words.slice(1).map((w, i) => w.x - (words[i].x + words[i].shape.width));
};
function draw(text, profile = L2, formatting, seed = 'nr') {
  const l = lay(text, profile, formatting, 292, seed);
  const strokes = [];
  const drawn = renderLines(l.lines, {
    profile,
    layout: l,
    rowHeight: 20,
    baselineInRow: baselineInRow(20, profile, l.fontSize),
    ink: { floor: 0.86, strength: 1 },
    debug: strokes,
  });
  return { layout: l, drawn, strokes };
}
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const sd = a => Math.sqrt(mean(a.map(v => (v - mean(a)) ** 2)));
const lag1 = a => {
  const m = mean(a);
  let num = 0;
  let den = 0;
  a.forEach((v, i) => {
    den += (v - m) ** 2;
    if (i) num += (v - m) * (a[i - 1] - m);
  });
  return num / den;
};
const all = (text, spacing) => applySpanFormat(emptyFormatting(), text, { start: 0, end: text.length }, { spacing });
const gapPair = (text, l, r, v) =>
  setWordGap(emptyFormatting(), text, boundariesIn(text, { start: text.indexOf(`${l} ${r}`), end: text.indexOf(`${l} ${r}`) + l.length + r.length + 1 }).find(b => b.left === l), v);

beforeEach(() => {
  clearAllMockStorages();
  setStorageBackend(null);
  setNativeExporter(null);
});

// --- Lang1 lock ---------------------------------------------------------------------

describe('Lang1 protection', () => {
  it('Lang1 glyph data, spacing and rendered output are unchanged (hashes taken before Phase 11)', () => {
    const text = 'The night slips quietly away,\nAnd wakes the gold and blue of day. Working Capital 2026, 25% (a) → done!';
    const l = layoutHandwriting(text, L1, { fontSize: 12.4, contentWidth: 292, lineHeight: 20, seed: 'lang1-lock' });
    const d = renderLines(l.lines, { profile: L1, layout: l, rowHeight: 20, baselineInRow: 19, ink: { floor: 0.86, strength: 1 } });
    expect(hashString(JSON.stringify(GLYPHS))).toBe(3649923111);
    expect(hashString(JSON.stringify(l.lines.map(x => x.words.map(w => [w.x, w.shape.width, w.gap]))))).toBe(4194404481);
    const out = JSON.stringify(d);
    expect(out.length).toBe(47216);
    expect(hashString(out)).toBe(2797748489);
  });

  it('gives Lang1 no rhythm, construction or pressure-arc settings', () => {
    expect(L1.rhythm).toBeUndefined();
    expect(L1.contextSeed).toBeUndefined();
    expect(L1.stroke.construction).toBeUndefined();
    expect(L1.pressure.wordArc).toBeUndefined();
  });
});

// --- Word Space −5…+5 -----------------------------------------------------------------

describe('Word Space −5…+5', () => {
  it('offers every step from −5 to +5', () => {
    expect(WORD_SPACING_STEPS).toEqual([-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]);
    for (const v of WORD_SPACING_STEPS) {
      const f = all(LINE, v);
      expect(f.spans.length ? f.spans[0].spacing : 0).toBe(v);
    }
  });

  it.each([L1, L2])('makes every step visibly different, tight at −5 but never touching', profile => {
    const avg = WORD_SPACING_STEPS.map(v => mean(gapsOf(LINE, profile, all(LINE, v))));
    for (let i = 1; i < avg.length; i++) {
      expect(avg[i]).toBeGreaterThan(avg[i - 1] + 0.3);
    }
    const unit = 12.4 * profile.fontScale * 0.46; // ≈ x-height px
    expect(avg[0]).toBeGreaterThan(0.25 * unit); // readable at −5
    expect(avg[0]).toBeLessThan(avg[5] * 0.45);
  });

  it('keeps −1, −2 and +1…+4 exactly as before (existing documents unchanged)', () => {
    // Before Phase 11 each step was 0.35 x-height; −1/−2 and up still are.
    const step = 0.35 * 12.4 * L1.fontScale * 0.46;
    const base = gapsOf(LINE, L1, all(LINE, 0));
    for (const v of [-2, -1, 1, 2, 3, 4]) {
      gapsOf(LINE, L1, all(LINE, v)).forEach((g, i) => expect(g).toBeCloseTo(Math.max(base[i] + v * step, 0.12 * 12.4), 3));
    }
  });
});

describe('individual gap −5…+5', () => {
  it.each([-5, -2, 0, 2, 5])('heads | to at %i changes only that gap', v => {
    const base = gapsOf(LINE, L2);
    const g = gapsOf(LINE, L2, gapPair(LINE, 'heads', 'to', v));
    const at = 4; // heads | to
    g.forEach((x, i) => (i === at ? null : expect(x).toBeCloseTo(base[i], 5)));
    if (v > 0) expect(g[at]).toBeGreaterThan(base[at]);
    if (v < 0) expect(g[at]).toBeLessThan(base[at]);
    if (v === 0) expect(g[at]).toBeCloseTo(base[at], 5);
  });

  it('keeps several gaps and resets one', () => {
    let f = gapPair(LINE, 'heads', 'to', -5);
    const b = boundariesIn(LINE, { start: 0, end: LINE.length });
    f = setWordGap(f, LINE, b[0], 5);
    expect(f.gaps.map(x => x.value)).toEqual([5, -5]);
    f = setWordGap(f, LINE, b[0], 0);
    expect(f.gaps.map(x => x.value)).toEqual([-5]);
  });
});

// --- Natural word spacing ------------------------------------------------------------

describe('natural word spacing (Lang2)', () => {
  const gaps = () => gapsOf(PROSE, L2);

  it('is deterministic', () => {
    expect(gaps()).toEqual(gaps());
  });

  it('varies, but stays within about one Word Space step of the average', () => {
    const g = gaps();
    const step = 0.35 * 12.4 * L2.fontScale * 0.46;
    expect(sd(g)).toBeGreaterThan(step * 0.2);
    // Spread mostly from the rhythm (≤ 0.32 x-height) and sentence air.
    const plain = g.filter((_, i) => !/[.,]$/.test(PROSE.split(' ')[i]));
    expect(Math.max(...plain) - Math.min(...plain)).toBeLessThan(step * 3);
  });

  it('is correlated from gap to gap — a rhythm, not a zig-zag', () => {
    const words = PROSE.split(' ');
    const g = gaps().filter((_, i) => !/[.,]$/.test(words[i]));
    expect(lag1(g)).toBeGreaterThan(0.2);
  });

  it('does not repeat in a short cycle', () => {
    const g = gapsOf(`${PROSE} ${PROSE}`, L2).map(v => v.toFixed(2));
    for (let period = 2; period <= 8; period++) {
      let same = 0;
      for (let i = period; i < g.length; i++) if (g[i] === g[i - period]) same++;
      expect(same / (g.length - period)).toBeLessThan(0.5);
    }
  });

  it('gives way to explicit Word Space and individual gaps', () => {
    // An explicit +2 range: the gaps follow the setting, without the rhythm.
    const g = gapsOf(LINE, L2, all(LINE, 2));
    const base = gapsOf(LINE, L2);
    expect(mean(g)).toBeGreaterThan(mean(base));
  });

  it('keeps pagination stable: same document, same page breaks', () => {
    const long = Array.from({ length: 10 }, (_, i) => `Page ${i + 1}. ${PROSE} ${PROSE}`).join(PAGE_BREAK);
    const metrics = getPageMetrics({ pageType: 'lined' });
    const rowHeight = rowHeightFor(getPageType('lined'), metrics, L2);
    const run = () =>
      paginateDocument({ content: long, style: L2, metrics, rowHeight, seed: 'doc-stable' }).pages.map(p => [p.start, p.end]);
    const first = run();
    expect(first.length).toBeGreaterThanOrEqual(10);
    expect(run()).toEqual(first);
  });
});

// --- Repeated words and letters ---------------------------------------------------

const shapeOf = strokes =>
  strokes.map(s => s.xs.map((x, i) => `${(x - strokes[0].xs[0]).toFixed(1)},${(s.ys[i] - strokes[0].ys[0]).toFixed(1)}`).join(' ')).join('|');

describe('repeated words', () => {
  it.each(['the', 'and', 'working', 'market', 'India', 'reference', 'important'])('"%s" is drawn differently every time', word => {
    const text = `${word} ${word} ${word} ${word}`;
    const { strokes, layout } = draw(text);
    const starts = layout.lines.flatMap(l => l.words.map(w => w.start));
    const shapes = starts.map(at => shapeOf(strokes.filter(s => s.at === at)));
    expect(new Set(shapes).size).toBe(4);
    // Same identity: same letters and similar width.
    const widths = layout.lines.flatMap(l => l.words.map(w => w.shape.width));
    expect(Math.max(...widths) / Math.min(...widths)).toBeLessThan(1.15);
    expect(draw(text).strokes).toEqual(strokes);
  });

  it('builds each occurrence differently: ascender reach and bowl, not just transforms', () => {
    const tops = [];
    for (let seed = 0; seed < 12; seed++) {
      const st = letterStrokes('l', { profile: L2, prev: null, next: null, seed, nextAdvance: 1 });
      tops.push(Math.max(...st[0].ys));
    }
    expect(sd(tops)).toBeGreaterThan(0.02);
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(0.4);
  });

  it('draws the same word differently next to different words', () => {
    const a = draw('red market stall');
    const b = draw('busy market day');
    const word = r => r.strokes.filter(s => s.word === 'market');
    expect(shapeOf(word(a))).not.toEqual(shapeOf(word(b)));
  });
});

describe('repeated letters', () => {
  it.each(['aaaaaa', 'eeeeee', 'oooooo', 'rrrrrr', 'tttttt', 'nnnnnn', 'mmmmmm'])('%s: six different, recognisable letters', text => {
    const { strokes } = draw(text);
    const firsts = strokes.filter(s => s.stroke === 0 && !s.dot);
    expect(firsts).toHaveLength(6);
    const shapes = firsts.map(s => shapeOf([s]));
    expect(new Set(shapes).size).toBe(6);
    const sizes = firsts.map(s => Math.hypot(Math.max(...s.xs) - Math.min(...s.xs), Math.max(...s.ys) - Math.min(...s.ys)));
    expect(Math.max(...sizes) / Math.min(...sizes)).toBeLessThan(1.4);
  });
});

// --- Connections, pressure, baseline ------------------------------------------------

describe('connections, pressure and baseline', () => {
  it('varies connections: joined, short and slightly separated, deterministically', () => {
    const kinds = new Set();
    const ends = new Set();
    for (let seed = 0; seed < 30; seed++) {
      const st = letterStrokes('a', { profile: L2, prev: 'm', next: 'n', seed, nextAdvance: 0.9 }).find(s => s.tail);
      kinds.add(st.joined ? 'joined' : 'short');
      ends.add(st.ys[st.ys.length - 1].toFixed(2));
    }
    expect(kinds).toEqual(new Set(['joined', 'short']));
    expect(ends.size).toBeGreaterThan(5);
    const again = letterStrokes('a', { profile: L2, prev: 'm', next: 'n', seed: 3, nextAdvance: 0.9 });
    expect(letterStrokes('a', { profile: L2, prev: 'm', next: 'n', seed: 3, nextAdvance: 0.9 })).toEqual(again);
  });

  it('gives each word its own pressure arc, within ballpoint limits and one pen width', () => {
    const { strokes, layout } = draw('working working working working');
    const starts = layout.lines[0].words.map(w => w.start);
    const profiles = starts.map(at => strokes.filter(s => s.at === at && !s.dot).map(s => mean(s.pressure).toFixed(3)).join(','));
    expect(new Set(profiles).size).toBe(4);
    strokes.filter(s => !s.dot).forEach(s => {
      expect(Math.max(...s.pressure)).toBeLessThan(1.6);
      // The floor is 0.2; joining hairlines are lightened a little below it.
      expect(Math.min(...s.pressure)).toBeGreaterThanOrEqual(0.1);
    });
    expect(new Set(strokes.filter(s => !s.dot).map(s => s.base)).size).toBe(1);
  });

  it('moves the baseline smoothly and boundedly from word to word', () => {
    const words = draw(`${PROSE} ${PROSE}`).layout.lines.flatMap(l => l.words);
    const ys = words.map(w => w.shape.translateY + w.drift);
    expect(sd(ys)).toBeGreaterThan(0);
    ys.forEach(y => expect(Math.abs(y)).toBeLessThan(0.15 * 12.4));
    const lineDrift = draw(`${PROSE}`).layout.lines[0].words.map(w => w.drift);
    expect(lag1(lineDrift)).toBeGreaterThan(0.3);
  });
});

// --- Formatting, persistence, export -----------------------------------------------

describe('with formatting', () => {
  it('night: black, 120 %, marker, and night | slips at +4 — natural variation kept', () => {
    const text = 'The night slips quietly away.';
    let f = applySpanFormat(emptyFormatting(), text, { start: 4, end: 9 }, { color: '#151515', size: 1.2, mode: 'marker' });
    f = setWordGap(f, text, boundariesIn(text, { start: 6, end: 12 }).find(b => b.left === 'night'), 4);
    const plain = gapsOf(text, L2);
    const g = gapsOf(text, L2, f);
    expect(g[1]).toBeGreaterThan(plain[1] + 3);
    const { strokes } = draw(text, L2, f);
    strokes.filter(s => s.word === 'night').forEach(s => expect(s).toMatchObject({ color: '#151515', size: 1.2, mode: 'marker' }));
    // The other gaps keep their natural rhythm (unchanged by the edits).
    [0, 2, 3].forEach(i => expect(g[i]).toBeCloseTo(plain[i] + (i === 0 ? 0 : 0), 0));
  });

  it('saves and reopens with identical geometry', async () => {
    const doc = { ...createDocument({ handwritingStyle: LANG2_PROFILE_ID }), content: PROSE, formatting: all(PROSE, -3) };
    const saved = await saveDocument(doc);
    const back = await getDocument(saved.id);
    expect(back.formatting.spans[0].spacing).toBe(-3);
    const geo = d => JSON.stringify(draw(d.content, L2, d.formatting, d.id).drawn);
    expect(geo(back)).toBe(geo(doc));
  });

  it.each(['pdf', 'png', 'jpg'])('exports the same natural variation to %s', async format => {
    const doc = { ...createDocument({ handwritingStyle: LANG2_PROFILE_ID }), content: PROSE };
    const metrics = getPageMetrics({ pageType: 'lined' });
    const rowHeight = rowHeightFor(getPageType('lined'), metrics, L2);
    const paged = { ...paginateDocument({ content: doc.content, style: L2, metrics, rowHeight, seed: doc.id }), metrics, rowHeight };
    const editor = paged.pages[0].lines.flatMap(l => l.words.map(w => w.x));
    let mounted = null;
    const seen = [];
    const grab = () => {
      const p = mounted.root.findAll(n => n.props.testID === 'export-page' && n.props.page)[0];
      seen.push(p.props.page.lines.flatMap(l => l.words.map(w => w.x)));
    };
    setNativeExporter({
      getExportDirectory: jest.fn(async () => '/c'),
      beginPdf: jest.fn(async () => 'j'),
      addPdfPage: jest.fn(async () => grab()),
      finishPdf: jest.fn(async () => '/c/x.pdf'),
      cancelPdf: jest.fn(),
      captureView: jest.fn(async (t, p) => {
        grab();
        return p;
      }),
      share: jest.fn(async () => true),
    });
    let done = null;
    mounted = await render(
      <ExportRenderer plan={buildExportPlan({ title: 'N', format, pageCount: 1 })} document={doc} paged={paged} onProgress={() => {}} onFinish={o => (done = o)} onError={() => {}} />,
    );
    for (let i = 0; i < 200 && !done; i++) {
      await act(async () => {
        await new Promise(res => setTimeout(res, 10));
      });
    }
    expect(done).toBeTruthy();
    expect(seen[0]).toEqual(editor);
  }, 30000);
});

describe('performance', () => {
  it.each([
    [500, 0, 0],
    [1000, 10, 10],
    [2500, 50, 50],
    [5000, 100, 100],
  ])('%i characters, %i ranges, %i gaps: grouped paths', (n, ranges, gapCount) => {
    const text = `${PROSE} `.repeat(30).slice(0, n);
    let f = emptyFormatting();
    for (let i = 0; i < ranges; i++) {
      const start = Math.floor((i * n) / Math.max(1, ranges));
      f = applySpanFormat(f, text, { start, end: Math.min(n, start + 8) }, { color: i % 2 ? '#151515' : '#7CC8FF', spacing: (i % 11) - 5 });
    }
    const b = boundariesIn(text, { start: 0, end: text.length });
    for (let i = 0; i < gapCount && i < b.length; i++) f = setWordGap(f, text, b[Math.floor((i * b.length) / gapCount)], (i % 11) - 5 || 1);
    const { drawn } = draw(text, L2, f);
    expect(drawn.buckets.length).toBeLessThan(20);
  });
});
