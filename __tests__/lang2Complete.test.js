/**
 * Lang2 complete character set: every character Lang2 writes is its own —
 * a Lang2 page never switches to Lang1 strokes mid-word.
 */
import React from 'react';
import { clearAllMockStorages } from '@react-native-async-storage/async-storage';
import { getHandwritingStyle } from '../src/data/handwritingStyles';
import { getPageMetrics, getPageType, rowHeightFor } from '../src/data/paper';
import { baselineInRow } from '../src/components/HandwritingText';
import PaperPage from '../src/components/PaperPage';
import ExportRenderer from '../src/export/ExportRenderer';
import { buildExportPlan } from '../src/export/exportPlan';
import { setNativeExporter } from '../src/export/nativeExporter';
import { renderLines } from '../src/handwriting/glyphRender';
import {
  FALLBACK_GLYPH,
  GLYPHS,
  GLYPHS_LANG2,
  glyphFor,
  hasGlyph,
} from '../src/handwriting/glyphs';
import { LANG2_PROFILE_ID } from '../src/handwriting/handwritingProfiles';
import { glyphContext, letterStrokes } from '../src/handwriting/strokeModel';
import { createDocument } from '../src/models/document';
import {
  getDocument,
  saveDocument,
  setStorageBackend,
} from '../src/storage/documentStorage';
import {
  applySpanFormat,
  boundariesIn,
  emptyFormatting,
  setWordGap,
} from '../src/utils/formatting';
import { movePage } from '../src/utils/pageOps';
import { PAGE_BREAK, paginateDocument } from '../src/utils/pagination';
import { layoutHandwriting } from '../src/utils/textLayout';
import { act, render } from './helpers/render';

const L1 = getHandwritingStyle('reference_student');
const L2 = getHandwritingStyle(LANG2_PROFILE_ID);
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const PUNCT = '.,:;?!\'"()[]{}-_/\\+=*%&#@$';
const NOTATION = '•→←°₹';
const ACADEMIC = [
  'Q1. What is Working Capital Management in India?',
  'Ans:',
  "Working Capital Management (WCM) in India refers to the strategic process of managing a company's short-term assets and liabilities to ensure it has sufficient liquidity to operate efficiently.",
  '',
  '1. Key Concepts and Definitions',
  '2026',
  '1,000',
  '₹50,000',
  '25%',
].join('\n');
const L1_STROKES = new Set(Object.values(GLYPHS).map(g => g.strokes));
const ys = g => g.strokes.flatMap(p => p.filter((_, i) => i % 2));

function draw(text, profile = L2, options = {}) {
  const layout = layoutHandwriting(text, profile, {
    fontSize: 12.4,
    contentWidth: 292,
    lineHeight: 20,
    seed: options.seed || 'complete',
    formatting: options.formatting,
    corrections: options.corrections,
  });
  const strokes = [];
  const drawn = renderLines(layout.lines, {
    profile,
    layout,
    rowHeight: 20,
    baselineInRow: baselineInRow(20, profile, layout.fontSize),
    ink: { floor: 0.86, strength: 1 },
    quality: options.quality,
    debug: strokes,
  });
  return { layout, drawn, strokes };
}

beforeEach(() => {
  clearAllMockStorages();
  setStorageBackend(null);
  setNativeExporter(null);
});

describe('Lang2 complete character set', () => {
  it('Lang2 must not use Lang1 glyph fallback for supported characters', () => {
    for (const ch of UPPER + LOWER + DIGITS + PUNCT + NOTATION) {
      const g = glyphFor(ch, 'lang2');
      expect([ch, g]).toEqual([ch, GLYPHS_LANG2[ch]]);
      expect([ch, L1_STROKES.has(g.strokes)]).toEqual([ch, false]);
      expect([ch, hasGlyph(ch, 'lang2')]).toEqual([ch, true]);
    }
    // Every character Lang1 can write, Lang2 writes with its own strokes.
    for (const ch of Object.keys(GLYPHS)) {
      expect([ch, !!GLYPHS_LANG2[ch]]).toEqual([ch, true]);
    }
  });

  it('never borrows Lang1 strokes, even for accented or unknown characters', () => {
    expect(glyphFor('é', 'lang2')).toBe(GLYPHS_LANG2.e);
    expect(glyphFor('Ü', 'lang2')).toBe(GLYPHS_LANG2.U);
    expect(glyphFor('漢', 'lang2')).toBe(FALLBACK_GLYPH);
    // Rendered strokes of a mixed page all come from Lang2 glyphs.
    const { strokes } = draw(ACADEMIC);
    expect(strokes.length).toBeGreaterThan(100);
  });

  it('defines every glyph as finite cubic strokes within the writing band', () => {
    for (const [ch, g] of Object.entries(GLYPHS_LANG2)) {
      expect(g.w).toBeGreaterThan(0);
      for (const pts of g.strokes) {
        expect([ch, (pts.length - 2) % 6]).toEqual([ch, 0]);
        expect([ch, pts.every(Number.isFinite)]).toEqual([ch, true]);
      }
      const y = ys(g);
      expect([ch, Math.max(...y) <= 1.95 && Math.min(...y) >= -1.1]).toEqual([ch, true]);
    }
  });

  it('writes capitals at capital height and digits a little lower', () => {
    for (const ch of UPPER) {
      const top = Math.max(...ys(GLYPHS_LANG2[ch]));
      expect([ch, top > 1.38 && top < 1.66]).toEqual([ch, true]);
    }
    for (const ch of DIGITS) {
      const top = Math.max(...ys(GLYPHS_LANG2[ch]));
      expect([ch, top > 1.3 && top < 1.56]).toEqual([ch, true]);
    }
  });

  it('keeps the reference forms: wavy I and T bars, rounded W and M, looped K', () => {
    // I and T: the top bar rises and falls (a wave), not a straight line.
    for (const ch of 'IT') {
      const bar = GLYPHS_LANG2[ch].strokes[0];
      const barYs = bar.filter((_, i) => i % 2);
      expect([ch, Math.max(...barYs) - Math.min(...barYs) > 0.1]).toEqual([ch, true]);
    }
    // K: arm and leg are one stroke that returns toward the stem.
    expect(GLYPHS_LANG2.K.strokes).toHaveLength(2);
    const leg = GLYPHS_LANG2.K.strokes[1];
    expect(Math.min(...leg.filter((_, i) => i % 2 === 0))).toBeLessThan(0.2);
    // R and G are Lang2's own, not Lang1's.
    for (const ch of 'RGKDSMW') expect(GLYPHS_LANG2[ch].strokes).not.toEqual(GLYPHS[ch].strokes);
  });

  it('adds the rupee sign (Lang1 cannot write it)', () => {
    expect(GLYPHS_LANG2['₹'].strokes.length).toBe(3);
    expect(glyphFor('₹')).toBe(FALLBACK_GLYPH); // Lang1 unchanged
    const { strokes } = draw('₹50,000 ₹1,25,000');
    expect(strokes.filter(s => s.char === '₹').length).toBeGreaterThan(0);
  });

  it('does not join capitals to the next letter', () => {
    for (const ch of UPPER) {
      expect([ch, glyphContext(ch, 'lang2').exit]).toEqual([ch, null]);
    }
    const st = letterStrokes('I', { profile: L2, prev: null, next: 'n', seed: 1, nextAdvance: 0.9 });
    expect(st.some(s => s.tail)).toBe(false);
  });

  it('stops r short of a following n or m (rn stays distinguishable from m)', () => {
    for (let seed = 0; seed < 40; seed++) {
      for (const next of 'nm') {
        const st = letterStrokes('r', { profile: L2, prev: 'u', next, seed, nextAdvance: 0.6 }).find(s => s.tail);
        expect(st.joined).toBe(false);
        // The tail ends before the next letter's first stem (its top is at
        // x ≈ 0.1 of that letter), so the two never close into one arch.
        expect(st.xs[st.xs.length - 1]).toBeLessThan(0.6 + 0.08);
      }
    }
    // r still joins other letters (are, very, market).
    let joined = 0;
    for (let seed = 0; seed < 40; seed++) {
      if (letterStrokes('r', { profile: L2, prev: 'a', next: 'e', seed, nextAdvance: 0.6 }).some(s => s.joined)) joined++;
    }
    expect(joined).toBeGreaterThan(10);
  });

  it('varies repeated capitals and digits without changing their identity', () => {
    for (const text of ['AAAA', 'MMMM', 'RRRR', 'GGGG', 'KKKK', '1111', '2222', '0000']) {
      const { strokes } = draw(text);
      const firsts = strokes.filter(s => s.stroke === 0 && !s.dot);
      expect(firsts).toHaveLength(4);
      const shapes = firsts.map(s => s.xs.map((x, i) => `${(x - s.xs[0]).toFixed(1)},${(s.ys[i] - s.ys[0]).toFixed(1)}`).join(' '));
      expect([text, new Set(shapes).size]).toEqual([text, 4]);
      // Similar size: all four occurrences of one character.
      const sizes = firsts.map(s => Math.hypot(Math.max(...s.xs) - Math.min(...s.xs), Math.max(...s.ys) - Math.min(...s.ys)));
      expect([text, Math.max(...sizes) / Math.min(...sizes) < 1.35]).toEqual([text, true]);
    }
  });

  it('uses the same pen (pressure, width) for capitals, digits and punctuation', () => {
    const { strokes } = draw('Working 2026, India: 25% ₹50');
    const bases = new Set(strokes.filter(s => !s.dot).map(s => s.base));
    expect(bases.size).toBe(1);
    strokes.filter(s => !s.dot).forEach(s => expect(Math.max(...s.pressure)).toBeGreaterThan(Math.min(...s.pressure)));
  });

  it('is deterministic and leaves Lang1 exactly as it was', () => {
    expect(draw(ACADEMIC).drawn).toEqual(draw(ACADEMIC).drawn);
    expect(glyphFor('K')).toBe(GLYPHS.K);
    expect(L1.glyphSet).toBeUndefined();
    expect(draw(ACADEMIC, L1).strokes.every(s => !s.char || GLYPHS[s.char] || s.char === '₹')).toBe(true);
  });
});

// --- Formatting, gaps, corrections ---------------------------------------------

describe('with formatting, word gaps and corrections', () => {
  it('formats capitals, digits and symbols with Lang2 strokes', () => {
    let f = emptyFormatting();
    for (const word of ['India', 'Working', '2026', '₹50,000', '25%', 'Q1.', 'Ans:']) {
      const at = ACADEMIC.indexOf(word);
      f = applySpanFormat(f, ACADEMIC, { start: at, end: at + word.length }, { color: '#151515', size: 1.2 });
    }
    const { strokes } = draw(ACADEMIC, L2, { formatting: f });
    for (const word of ['2026', '₹50,000', '25%', 'Q1.', 'Ans:']) {
      const mine = strokes.filter(s => s.word === word);
      expect([word, mine.length > 0]).toEqual([word, true]);
      mine.forEach(s => expect(s).toMatchObject({ color: '#151515', size: 1.2 }));
    }
    const marker = applySpanFormat(emptyFormatting(), ACADEMIC, { start: 0, end: 3 }, { mode: 'marker' });
    draw(ACADEMIC, L2, { formatting: marker }).strokes.filter(s => s.word === 'Q1.').forEach(s => expect(s.mode).toBe('marker'));
  });

  it('keeps each gap of "Working Capital Management in India" adjustable', () => {
    const line = 'Working Capital Management in India';
    const all = boundariesIn(line, { start: 0, end: line.length });
    expect(all.map(b => `${b.left}|${b.right}`)).toEqual([
      'Working|Capital',
      'Capital|Management',
      'Management|in',
      'in|India',
    ]);
    const gapOf = f => {
      const words = layoutHandwriting(line, L2, { fontSize: 12.4, contentWidth: 600, lineHeight: 20, seed: 'g', formatting: f }).lines[0].words;
      return words.slice(1).map((w, i) => w.x - (words[i].x + words[i].shape.width));
    };
    const base = gapOf(emptyFormatting());
    all.forEach((b, i) => {
      const g = gapOf(setWordGap(emptyFormatting(), line, b, 3));
      g.forEach((v, k) => (k === i ? expect(v).toBeGreaterThan(base[k] + 3) : expect(v).toBeCloseTo(base[k], 5)));
    });
  });

  it('writes corrections with Lang2 strokes', () => {
    const text = `${'Working Capital Management in India refers to managing the balance between current assets and liabilities every single month. '.repeat(8)}`;
    let found = null;
    for (let s = 0; s < 60 && !found; s++) {
      const r = draw(text, L2, { corrections: true, seed: `c2-${s}` });
      if (r.strokes.some(x => x.pass === 'fix' || x.pass === 'attempt')) found = r;
    }
    expect(found).toBeTruthy();
    const fix = found.strokes.filter(x => x.pass === 'fix' || x.pass === 'attempt');
    fix.forEach(s => expect(GLYPHS_LANG2[s.char] || s.char === '').toBeTruthy());
  });
});

// --- Pages, persistence, export, thumbnails --------------------------------------

const metrics = getPageMetrics({ pageType: 'lined' });
const rowHeight = rowHeightFor(getPageType('lined'), metrics, L2);
const paginate = doc =>
  paginateDocument({ content: doc.content, formatting: doc.formatting, pageIds: doc.pageIds, style: L2, metrics, rowHeight, seed: doc.id });

describe('pages and output', () => {
  it('paginates and reorders Lang2 pages without changing their text', () => {
    const content = `${ACADEMIC}${PAGE_BREAK}Second page: ₹1,25,000 and 25%.`;
    const doc = { ...createDocument({ handwritingStyle: LANG2_PROFILE_ID }), content, pageIds: ['a', 'b'] };
    const before = paginate(doc).pages.map(p => p.text);
    const moved = movePage(doc, paginate(doc).pages, 1, -1);
    const after = paginate({ ...doc, ...moved.doc }).pages.map(p => p.text);
    expect([...after].sort()).toEqual([...before].sort());
  });

  it('saves and reopens a Lang2 document with capitals, digits and symbols', async () => {
    const doc = { ...createDocument({ handwritingStyle: LANG2_PROFILE_ID }), content: ACADEMIC };
    const saved = await saveDocument(doc);
    const back = await getDocument(saved.id);
    expect(back).toMatchObject({ handwritingStyle: LANG2_PROFILE_ID, content: ACADEMIC });
  });

  it.each(['pdf', 'png', 'jpg'])('exports the same Lang2 geometry to %s', async format => {
    const doc = { ...createDocument({ handwritingStyle: LANG2_PROFILE_ID }), content: ACADEMIC };
    const paged = { ...paginate(doc), metrics, rowHeight };
    const editorPaths = (() => {
      const l = paged.pages[0];
      return renderLines(l.lines, { profile: L2, layout: paged.layout, rowHeight, baselineInRow: baselineInRow(rowHeight, L2, paged.layout.fontSize), ink: { floor: 0.86, strength: 1 } });
    })();
    let mounted = null;
    const seen = [];
    const grab = () => {
      const svg = mounted.root.findAll(n => n.props.testID === 'handwriting-ink' && typeof n.type !== 'string')[0];
      // findAll sees each Path at several component levels: unique d's.
      seen.push([...new Set(svg.findAll(n => n.props.d && n.props.fill).map(n => n.props.d))]);
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
      <ExportRenderer plan={buildExportPlan({ title: 'L2', format, pageCount: 1 })} document={doc} paged={paged} onProgress={() => {}} onFinish={o => (done = o)} onError={() => {}} />,
    );
    for (let i = 0; i < 200 && !done; i++) {
      await act(async () => {
        await new Promise(res => setTimeout(res, 10));
      });
    }
    expect(done).toBeTruthy();
    // Identical geometry to the editor renderer (same Lang2 strokes); the
    // grouping into paths may differ, so compare the sorted subpaths.
    const sub = list => list.join('').split('M').filter(Boolean).sort();
    const a = sub(seen[0]);
    const b = sub([...editorPaths.buckets, ...editorPaths.underlines].map(x => x.d));
    expect(a).toEqual(b);
  }, 30000);

  it('draws Lang2 capitals, digits and symbols in thumbnails', async () => {
    const doc = { ...createDocument({ handwritingStyle: LANG2_PROFILE_ID }), content: ACADEMIC };
    const paged = paginate(doc);
    const r = await render(<PaperPage document={doc} page={paged.pages[0]} layout={paged.layout} metrics={metrics} rowHeight={rowHeight} width={110} quality="preview" />);
    const svg = r.root.findAll(n => n.props.testID === 'handwriting-ink' && typeof n.type !== 'string')[0];
    const sub = list => list.join('').split('M').filter(Boolean).sort();
    const thumb = sub([...new Set(svg.findAll(n => n.props.d).map(n => n.props.d))]);
    const expected = renderLines(paged.pages[0].lines, { profile: L2, layout: paged.layout, rowHeight, baselineInRow: baselineInRow(rowHeight, L2, paged.layout.fontSize), ink: { floor: 0.86, strength: 1 }, quality: 'preview' });
    expect(thumb).toEqual(sub([...expected.buckets, ...expected.underlines].map(b => b.d)));
  });
});

describe('performance', () => {
  const mixed = 'Q1. What is Working Capital Management in India? Ans: ₹50,000 (25%) — 2026, 1,000; ABC xyz! ';
  it.each([500, 1000, 2500, 5000])('%i characters of mixed Lang2 content stay a few grouped paths', n => {
    const text = mixed.repeat(80).slice(0, n);
    let f = applySpanFormat(emptyFormatting(), text, { start: 0, end: 120 }, { color: '#151515', size: 1.2 });
    const b = boundariesIn(text, { start: 0, end: 300 });
    b.slice(0, 10).forEach((x, i) => (f = setWordGap(f, text, x, (i % 4) - 1 || 2)));
    const { drawn } = draw(text, L2, { formatting: f });
    expect(drawn.buckets.length).toBeLessThan(20);
  });
});
