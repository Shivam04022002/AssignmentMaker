/**
 * Lang3: an independent profile for reference/Lang3.png (upright print),
 * with its own stroke set and the full realism model. Lang1 and Lang2 locked.
 */
import React from 'react';
import { clearAllMockStorages } from '@react-native-async-storage/async-storage';
import {
  DEFAULT_HANDWRITING_STYLE,
  getHandwritingStyle,
  getHandwritingStyles,
} from '../src/data/handwritingStyles';
import { getPageMetrics, getPageType, rowHeightFor } from '../src/data/paper';
import HandwritingStyleSelector from '../src/components/HandwritingStyleSelector';
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
  GLYPHS_LANG3,
  glyphFor,
} from '../src/handwriting/glyphs';
import { LANG3_PROFILE_ID } from '../src/handwriting/handwritingProfiles';
import { glyphContext, letterStrokes, sampleChain } from '../src/handwriting/strokeModel';
import { addPoint, finishStroke, strokeStyle } from '../src/ink/strokes';
import { createDocument } from '../src/models/document';
import { getDocument, saveDocument, setStorageBackend } from '../src/storage/documentStorage';
import {
  WORD_SPACING_STEPS,
  applySpanFormat,
  boundariesIn,
  emptyFormatting,
  setWordGap,
} from '../src/utils/formatting';
import { movePage } from '../src/utils/pageOps';
import { PAGE_BREAK, paginateDocument } from '../src/utils/pagination';
import { layoutHandwriting } from '../src/utils/textLayout';
import { hashString } from '../src/utils/variation';
import { act, render } from './helpers/render';

const L3 = getHandwritingStyle(LANG3_PROFILE_ID);
const L2 = getHandwritingStyle('reference_student_lang2');
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const PUNCT = '.,:;?!\'"()[]-_/%';
const SYMBOLS = '•→←+=&#@₹°';
const REF =
  'Q1. What is the international market? Write its advantages and its disadvantages.\nAns\n1. Introduction to the International Market\n\nThe international market refers to the exchange of goods, services, and resources across national borders. Unlike domestic marketing, which occurs within the confines of a single country, international marketing involves navigating diverse legal systems, cultural nuances, economic climates, and consumer behaviors.';
const ys = g => g.strokes.flatMap(p => p.filter((_, i) => i % 2));
const metrics = getPageMetrics({ pageType: 'lined' });
const rowHeight = rowHeightFor(getPageType('lined'), metrics, L3);

function draw(text, formatting, seed = 'l3', options = {}) {
  const l = layoutHandwriting(text, L3, { fontSize: 12.4, contentWidth: 292, lineHeight: 20, seed, formatting, corrections: options.corrections });
  const strokes = [];
  const drawn = renderLines(l.lines, { profile: L3, layout: l, rowHeight: 20, baselineInRow: baselineInRow(20, L3, l.fontSize), ink: { floor: 0.86, strength: 1 }, debug: strokes });
  return { layout: l, drawn, strokes };
}
const shapeOf = list => list.map(s => s.xs.map((x, i) => `${(x - list[0].xs[0]).toFixed(1)},${(s.ys[i] - list[0].ys[0]).toFixed(1)}`).join(' ')).join('|');
const paginate = doc => paginateDocument({ content: doc.content, formatting: doc.formatting, pageIds: doc.pageIds, style: L3, metrics, rowHeight, seed: doc.id });

beforeEach(() => {
  clearAllMockStorages();
  setStorageBackend(null);
  setNativeExporter(null);
});

describe('Lang3 profile', () => {
  it('is its own profile; Lang1 stays the default', () => {
    expect(L3).toMatchObject({ id: 'reference_student_lang3', name: 'Reference Handwriting 3', glyphSet: 'lang3' });
    expect(DEFAULT_HANDWRITING_STYLE).toBe('reference_student');
    expect(createDocument().handwritingStyle).toBe('reference_student');
  });

  it('carries the measured reference proportions', () => {
    expect(L3.xHeightPerPitch).toBeGreaterThan(0.3);
    expect(L3.xHeightPerPitch).toBeLessThanOrEqual(0.33);
    expect(L3.ascender).toBeCloseTo(1.72, 2);
    expect(L3.wordGap).toBe(2.0);
    expect(L3.stroke.join).toBe(0); // print: not joined
    expect(Math.abs(L3.slant)).toBeLessThan(2);
  });

  it('shows three reference handwritings with live previews in the selector', async () => {
    expect(getHandwritingStyles().map(s => s.name)).toEqual(['Reference Handwriting', 'Reference Handwriting 2', 'Reference Handwriting 3']);
    const r = await render(<HandwritingStyleSelector value="reference_student" pen="blue" onChange={jest.fn()} />);
    expect(r.root.findAll(n => n.props.testID === 'handwriting-reference-lang3' && n.props.accessibilityState).length).toBeGreaterThan(0);
  });
});

describe('Lang3 glyphs', () => {
  it('has its own glyph for every supported character — no Lang1 or Lang2 fallback', () => {
    for (const ch of UPPER + LOWER + DIGITS + PUNCT + SYMBOLS) {
      const g = glyphFor(ch, 'lang3');
      expect([ch, g]).toEqual([ch, GLYPHS_LANG3[ch]]);
      expect([ch, g === GLYPHS[ch] || g === GLYPHS_LANG2[ch]]).toEqual([ch, false]);
      // Not even the same geometry under another name.
      expect([ch, JSON.stringify(g) === JSON.stringify(GLYPHS[ch])]).toEqual([ch, false]);
      expect([ch, JSON.stringify(g) === JSON.stringify(GLYPHS_LANG2[ch])]).toEqual([ch, false]);
    }
    for (const ch of Object.keys(GLYPHS_LANG2)) expect([ch, !!GLYPHS_LANG3[ch]]).toEqual([ch, true]);
    expect(glyphFor('漢', 'lang3')).toBe(FALLBACK_GLYPH);
  });

  it('defines finite cubic strokes within the writing band', () => {
    for (const [ch, g] of Object.entries(GLYPHS_LANG3)) {
      for (const p of g.strokes) {
        expect([ch, (p.length - 2) % 6 === 0 && p.every(Number.isFinite)]).toEqual([ch, true]);
      }
      const y = ys(g);
      expect([ch, Math.max(...y) <= 1.9 && Math.min(...y) >= -0.7]).toEqual([ch, true]);
    }
  });

  it('draws the reference forms: footless stems, u-shaped y, f on the line, short descenders', () => {
    for (const ch of 'ilnmhu') {
      const pts = GLYPHS_LANG3[ch].strokes[0];
      expect([ch, pts[pts.length - 1] < 0.1 && Math.abs(pts[pts.length - 2] - pts[pts.length - 4]) < 0.05]).toEqual([ch, true]);
    }
    expect(Math.min(...ys(GLYPHS_LANG3.f))).toBeGreaterThanOrEqual(0);
    for (const ch of 'gjpqy') {
      const d = Math.min(...ys(GLYPHS_LANG3[ch]));
      expect([ch, d < -0.5 && d > -0.7]).toEqual([ch, true]);
    }
    // y: two stems like a u (a turn at the bottom) before the descender.
    const { ys: yy } = sampleChain(GLYPHS_LANG3.y.strokes[0]);
    expect(yy.some((v, i) => i > 3 && v < 0.1 && v > -0.05)).toBe(true);
  });

  it('writes capitals at 1.5 and digits at 1.5, upright', () => {
    // Measured on the drawn curve (arc control points overshoot it).
    const drawnTop = g => Math.max(...g.strokes.flatMap(p => sampleChain(p).ys));
    for (const ch of UPPER) {
      const t = drawnTop(GLYPHS_LANG3[ch]);
      expect([ch, t > 1.4 && t < 1.6]).toEqual([ch, true]);
    }
    for (const ch of DIGITS) expect([ch, drawnTop(GLYPHS_LANG3[ch]) <= 1.53]).toEqual([ch, true]);
  });

  it('keeps letters unjoined (print), with only small exit flicks', () => {
    for (let seed = 0; seed < 20; seed++) {
      for (const [ch, next] of [['a', 'n'], ['t', 'h'], ['e', 'r'], ['n', 'g']]) {
        const st = letterStrokes(ch, { profile: L3, prev: null, next, seed, nextAdvance: 0.9 });
        expect(st.some(s => s.joined)).toBe(false);
      }
    }
    for (const ch of UPPER) expect(glyphContext(ch, 'lang3').exit).toBeNull();
  });
});

describe('Lang3 variation', () => {
  it('is deterministic', () => {
    expect(draw(REF).drawn).toEqual(draw(REF).drawn);
  });

  it.each(['aaaaaa', 'eeeeee', 'rrrrrr', 'tttttt', 'oooooo', 'nnnnnn', 'mmmmmm', 'ssssss'])('%s: six different, recognisable letters', text => {
    const firsts = draw(text).strokes.filter(s => s.stroke === 0 && !s.dot);
    expect(firsts).toHaveLength(6);
    expect(new Set(firsts.map(s => shapeOf([s]))).size).toBe(6);
    const sizes = firsts.map(s => Math.hypot(Math.max(...s.xs) - Math.min(...s.xs), Math.max(...s.ys) - Math.min(...s.ys)));
    expect(Math.max(...sizes) / Math.min(...sizes)).toBeLessThan(1.4);
  });

  it.each(['the', 'and', 'market', 'international', 'India', 'reference'])('"%s" differs each time, same hand', word => {
    const { strokes, layout } = draw(`${word} ${word} ${word}`);
    const starts = layout.lines.flatMap(l => l.words.map(w => w.start));
    expect(new Set(starts.map(at => shapeOf(strokes.filter(s => s.at === at)))).size).toBe(3);
    const widths = layout.lines.flatMap(l => l.words.map(w => w.shape.width));
    expect(Math.max(...widths) / Math.min(...widths)).toBeLessThan(1.15);
  });

  it('builds the a of market, and, capital, management differently (context)', () => {
    const shapes = ['market', 'and', 'capital', 'management'].map(w => shapeOf(draw(`a ${w}`).strokes.filter(s => s.word === w && s.char === 'a').slice(0, 1)));
    expect(new Set(shapes).size).toBe(4);
  });

  it('uses one fine pen with pressure that varies along strokes and between words', () => {
    const { strokes } = draw('working working working');
    const pen = strokes.filter(s => !s.dot);
    expect(new Set(pen.map(s => s.base)).size).toBe(1);
    pen.forEach(s => expect(Math.max(...s.pressure)).toBeGreaterThan(Math.min(...s.pressure)));
    pen.forEach(s => expect(Math.max(...s.halfWidth) * 2).toBeLessThan(s.unit * 0.26));
  });

  it('moves the baseline smoothly and stays on the line', () => {
    const words = draw(REF).layout.lines.flatMap(l => l.words);
    words.forEach(w => expect(Math.abs(w.shape.translateY + w.drift)).toBeLessThan(0.15 * 12.4));
  });

  it('spaces words with a gentle natural rhythm', () => {
    const line = 'The international market refers to the exchange of goods services and resources across national borders';
    const words = layoutHandwriting(line, L3, { fontSize: 12.4, contentWidth: 3000, lineHeight: 20, seed: 'g' }).lines[0].words;
    const gaps = words.slice(1).map((w, i) => w.x - (words[i].x + words[i].shape.width));
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeGreaterThan(0.3);
    expect(Math.max(...gaps.map(g => Math.abs(g - mean)))).toBeLessThan(mean * 0.35);
  });
});

describe('Lang3 with the existing systems', () => {
  it('Word Space −5…+5 and individual gaps −5…+5 work', () => {
    const line = 'The flowers lift their heads to see';
    const avg = v => {
      const f = applySpanFormat(emptyFormatting(), line, { start: 0, end: line.length }, { spacing: v });
      const w = layoutHandwriting(line, L3, { fontSize: 12.4, contentWidth: 2000, lineHeight: 20, seed: 's', formatting: f }).lines[0].words;
      return w.slice(1).reduce((t, x, i) => t + x.x - (w[i].x + w[i].shape.width), 0) / (w.length - 1);
    };
    const v = WORD_SPACING_STEPS.map(avg);
    for (let i = 1; i < v.length; i++) expect(v[i]).toBeGreaterThan(v[i - 1]);
    const b = boundariesIn(line, { start: 0, end: line.length }).find(x => x.left === 'heads');
    for (const value of [-5, 5]) expect(setWordGap(emptyFormatting(), line, b, value).gaps[0].value).toBe(value);
  });

  it('formats words, digits and labels with Lang3 strokes', () => {
    const text = 'Q1. Ans: international market advantages disadvantages India 2026';
    let f = emptyFormatting();
    for (const w of ['international', 'market', 'advantages', 'disadvantages', 'India', '2026', 'Q1.', 'Ans:']) {
      const at = text.indexOf(w === 'advantages' ? ' advantages' : w) + (w === 'advantages' ? 1 : 0);
      f = applySpanFormat(f, text, { start: at, end: at + w.length }, { color: '#151515', size: 1.2, mode: 'marker' });
    }
    const { strokes } = draw(text, f);
    for (const w of ['international', '2026', 'Q1.', 'Ans:']) {
      const mine = strokes.filter(s => s.word === w);
      expect([w, mine.length > 0 && mine.every(s => s.color === '#151515' && s.size === 1.2 && s.mode === 'marker')]).toEqual([w, true]);
    }
  });

  it('draws corrections with Lang3 strokes', () => {
    const text = 'The international market refers to the exchange of goods, services and resources across national borders every single day. '.repeat(6);
    let found = null;
    for (let s = 0; s < 80 && !found; s++) {
      const r = draw(text, undefined, `c3-${s}`, { corrections: true });
      if (r.strokes.some(x => x.pass === 'fix' || x.pass === 'attempt')) found = r;
    }
    expect(found).toBeTruthy();
    found.strokes.filter(x => x.pass === 'fix' || x.pass === 'attempt').forEach(s => expect(!!GLYPHS_LANG3[s.char]).toBe(true));
  });

  it.each([1, 2, 3, 5, 10])('paginates %i pages deterministically', n => {
    const content = Array.from({ length: n }, (_, i) => `Page ${i + 1}. ${REF}`).join(PAGE_BREAK);
    const doc = { ...createDocument({ handwritingStyle: LANG3_PROFILE_ID }), content };
    const a = paginate(doc).pages.map(p => [p.start, p.end]);
    expect(a.length).toBeGreaterThanOrEqual(n);
    expect(paginate(doc).pages.map(p => [p.start, p.end])).toEqual(a);
  });

  it('saves and reopens profile, formatting, gaps, pages and freehand ink', async () => {
    const content = `${REF}${PAGE_BREAK}Second page.`;
    let f = applySpanFormat(emptyFormatting(), content, { start: 0, end: 3 }, { color: '#151515' });
    f = setWordGap(f, content, boundariesIn(content, { start: 4, end: 10 })[0], -4);
    const buffer = { points: [], pressure: null };
    for (let i = 0; i < 12; i++) addPoint(buffer, 40 + i * 4, 90);
    const doc = { ...createDocument({ handwritingStyle: LANG3_PROFILE_ID }), content, formatting: f, pageIds: ['a', 'b'], ink: { 'a#0': [finishStroke(buffer, strokeStyle('pen', {}), 's1')] } };
    const back = await getDocument((await saveDocument(doc)).id);
    expect(back).toMatchObject({ handwritingStyle: LANG3_PROFILE_ID, pageIds: ['a', 'b'] });
    expect(back.formatting.spans).toEqual(f.spans);
    expect(back.formatting.gaps).toEqual(f.gaps);
    expect(back.ink['a#0']).toHaveLength(1);
    const moved = movePage(back, paginate(back).pages, 1, -1);
    expect(moved.doc.content.split(PAGE_BREAK)[0]).toBe('Second page.');
  });

  it.each(['pdf', 'png', 'jpg'])('exports Lang3 with the editor renderer to %s', async format => {
    const doc = { ...createDocument({ handwritingStyle: LANG3_PROFILE_ID }), content: REF };
    const paged = { ...paginate(doc), metrics, rowHeight };
    const editor = paged.pages[0].lines.flatMap(l => l.words.map(w => [w.x, w.shape.text]));
    let mounted = null;
    const seen = [];
    const grab = () => {
      const p = mounted.root.findAll(n => n.props.testID === 'export-page' && n.props.page)[0];
      seen.push(p.props.page.lines.flatMap(l => l.words.map(w => [w.x, w.shape.text])));
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
    mounted = await render(<ExportRenderer plan={buildExportPlan({ title: 'L3', format, pageCount: 1 })} document={doc} paged={paged} onProgress={() => {}} onFinish={o => (done = o)} onError={() => {}} />);
    for (let i = 0; i < 200 && !done; i++) {
      await act(async () => {
        await new Promise(res => setTimeout(res, 10));
      });
    }
    expect(done).toBeTruthy();
    expect(seen[0]).toEqual(editor);
  }, 30000);

  it('draws thumbnails with Lang3', async () => {
    const doc = { ...createDocument({ handwritingStyle: LANG3_PROFILE_ID }), content: REF };
    const paged = paginate(doc);
    const r = await render(<PaperPage document={doc} page={paged.pages[0]} layout={paged.layout} metrics={metrics} rowHeight={rowHeight} width={110} quality="preview" />);
    const svg = r.root.findAll(n => n.props.testID === 'handwriting-ink' && typeof n.type !== 'string')[0];
    const got = [...new Set(svg.findAll(n => n.props.d).map(n => n.props.d))].join('').split('M').filter(Boolean).sort();
    const r2 = renderLines(paged.pages[0].lines, { profile: L3, layout: paged.layout, rowHeight, baselineInRow: baselineInRow(rowHeight, L3, paged.layout.fontSize), ink: { floor: 0.86, strength: 1 }, quality: 'preview' });
    const want = [...r2.buckets, ...r2.underlines].map(b => b.d).join('').split('M').filter(Boolean).sort();
    expect(got).toEqual(want);
  });
});

describe('Lang1 and Lang2 locked', () => {
  it('Lang2 output and glyph data are unchanged', () => {
    const text = 'The night slips quietly away,\nAnd wakes the gold and blue of day. Working Capital 2026, 25% (a) → ₹50!';
    const l = layoutHandwriting(text, L2, { fontSize: 12.4, contentWidth: 292, lineHeight: 20, seed: 'lang2-lock' });
    const out = JSON.stringify(renderLines(l.lines, { profile: L2, layout: l, rowHeight: 20, baselineInRow: 19, ink: { floor: 0.86, strength: 1 } }));
    expect(hashString(JSON.stringify(GLYPHS_LANG2))).toBe(1005853950);
    expect(out.length).toBe(52295);
    expect(hashString(out)).toBe(4030609738);
  });

  it('Lang1 glyph data is unchanged', () => {
    expect(hashString(JSON.stringify(GLYPHS))).toBe(3649923111);
  });
});

describe('performance', () => {
  it.each([
    [500, 0, 0],
    [1000, 10, 10],
    [2500, 50, 50],
    [5000, 100, 100],
  ])('%i characters, %i ranges, %i gaps: grouped paths', (n, ranges, gaps) => {
    const text = `${REF} `.repeat(10).slice(0, n);
    let f = emptyFormatting();
    for (let i = 0; i < ranges; i++) {
      const start = Math.floor((i * n) / Math.max(1, ranges));
      f = applySpanFormat(f, text, { start, end: Math.min(n, start + 8) }, { color: '#151515', spacing: (i % 11) - 5 });
    }
    const b = boundariesIn(text, { start: 0, end: text.length });
    for (let i = 0; i < gaps && i < b.length; i++) f = setWordGap(f, text, b[Math.floor((i * b.length) / gaps)], (i % 11) - 5 || 2);
    expect(draw(text, f).drawn.buckets.length).toBeLessThan(20);
  });
});
