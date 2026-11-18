/**
 * Handwriting of selected text: ink colour, pen or marker, handwriting size
 * and word spacing, attached to text ranges ("spans").
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
import { MARKER_TEXT, renderLines } from '../src/handwriting/glyphRender';
import { createDocument, normalizeDocument } from '../src/models/document';
import EditorScreen from '../src/screens/EditorScreen';
import {
  getDocument,
  saveDocument,
  setStorageBackend,
} from '../src/storage/documentStorage';
import {
  applySpanFormat,
  emptyFormatting,
  normalizeFormatting,
  normalizeSpans,
  reformat,
  selectionFormat,
  spanAt,
} from '../src/utils/formatting';
import { movePage } from '../src/utils/pageOps';
import { PAGE_BREAK, paginateDocument, splitSheets } from '../src/utils/pagination';
import { layoutHandwriting } from '../src/utils/textLayout';
import {
  act,
  byTestId,
  handwritingPaths,
  press,
  render,
  restoreRealTimers,
} from './helpers/render';

const BLUE = '#123A8C';
const BLACK = '#151515';
const LINE = 'The night slips quietly away.';
const PARA = `${LINE}\nAnd wakes the gold and blue of day.\nA little bird begins to sing.`;
const range = (text, needle, from = 0) => {
  const start = text.indexOf(needle, from);
  return { start, end: start + needle.length };
};
const apply = (text, needle, patch, f = emptyFormatting()) =>
  applySpanFormat(f, text, range(text, needle), patch);

beforeEach(() => {
  clearAllMockStorages();
  setStorageBackend(null);
  setNativeExporter(null);
});

// --- Model -------------------------------------------------------------------------

describe('selection model', () => {
  it('formats exactly the selected characters', () => {
    const f = apply(LINE, 'slips quietly', { color: BLACK });
    const r = range(LINE, 'slips quietly');
    expect(f.spans).toEqual([{ ...r, color: BLACK }]);
    expect(spanAt(f, r.start - 1).color).toBeNull();
    expect(spanAt(f, r.start).color).toBe(BLACK);
    expect(spanAt(f, r.end - 1).color).toBe(BLACK);
    expect(spanAt(f, r.end).color).toBeNull();
  });

  it('supports a character, word, sentence, line, paragraph and multi-line selection', () => {
    const cases = [
      { start: 4, end: 5 }, // one character
      range(PARA, 'night'), // word
      range(PARA, LINE), // sentence / line
      { start: 0, end: PARA.indexOf('\n', LINE.length + 1) }, // two lines
      { start: 0, end: PARA.length }, // whole paragraph block
    ];
    for (const sel of cases) {
      const f = applySpanFormat(emptyFormatting(), PARA, sel, { size: 1.2 });
      expect(f.spans).toEqual([{ ...sel, size: 1.2 }]);
    }
  });

  it('formats part of a word only', () => {
    const at = PARA.indexOf('quietly');
    const f = applySpanFormat(emptyFormatting(), PARA, { start: at, end: at + 3 }, { color: BLACK });
    expect(spanAt(f, at + 2).color).toBe(BLACK);
    expect(spanAt(f, at + 3).color).toBeNull();
  });

  it('formats the word at the cursor when nothing is selected', () => {
    const at = LINE.indexOf('quietly') + 2;
    const f = applySpanFormat(emptyFormatting(), LINE, { start: at, end: at }, { mode: 'marker' });
    expect(f.spans).toEqual([{ ...range(LINE, 'quietly'), mode: 'marker' }]);
  });

  it('combines properties and changes one without touching the others', () => {
    let f = apply(PARA, 'gold and blue', { color: BLACK });
    f = apply(PARA, 'gold and blue', { size: 1.2 }, f);
    f = apply(PARA, 'gold and blue', { spacing: 2 }, f);
    f = apply(PARA, 'gold and blue', { mode: 'pen' }, f);
    expect(f.spans).toEqual([{ ...range(PARA, 'gold and blue'), color: BLACK, size: 1.2, spacing: 2 }]);
    f = apply(PARA, 'gold and blue', { color: '#7CC8FF' }, f);
    expect(f.spans[0]).toMatchObject({ color: '#7CC8FF', size: 1.2, spacing: 2 });
  });

  it('splits a span when part of it changes, and merges equal neighbours', () => {
    let f = apply(LINE, 'slips quietly', { color: BLACK });
    f = apply(LINE, 'quietly', { size: 1.3 }, f);
    expect(f.spans).toEqual([
      { ...range(LINE, 'slips '), color: BLACK },
      { ...range(LINE, 'quietly'), color: BLACK, size: 1.3 },
    ]);
    // Back to the same properties: one span again.
    f = apply(LINE, 'quietly', { size: 1 }, f);
    expect(f.spans).toEqual([{ ...range(LINE, 'slips quietly'), color: BLACK }]);
    // Adjacent identical ranges merge.
    expect(normalizeSpans([{ start: 0, end: 10, color: BLUE }, { start: 10, end: 20, color: BLUE }])).toEqual([
      { start: 0, end: 20, color: BLUE },
    ]);
  });

  it('resets only the selection to the defaults', () => {
    let f = apply(LINE, 'night slips quietly', { color: BLACK, size: 1.2, mode: 'marker', spacing: 3 });
    f = apply(LINE, 'slips', 'reset', f);
    expect(spanAt(f, LINE.indexOf('slips'))).toEqual({ color: null, mode: 'pen', size: 1, spacing: 0 });
    expect(spanAt(f, LINE.indexOf('night'))).toMatchObject({ color: BLACK, size: 1.2 });
    expect(spanAt(f, LINE.indexOf('quietly'))).toMatchObject({ color: BLACK, mode: 'marker' });
  });

  it('keeps values in the supported ranges and drops default-only spans', () => {
    expect(normalizeSpans([{ start: 0, end: 4, size: 9, spacing: -20, color: 'red', mode: 'brush' }])).toEqual([
      { start: 0, end: 4, size: 1.4, spacing: -5 },
    ]);
    expect(normalizeSpans([{ start: 0, end: 4, size: 1, spacing: 0, mode: 'pen' }])).toEqual([]);
    expect(normalizeSpans([{ start: 0, end: 4, color: '#151515' }])[0].color).toBe('#151515');
  });

  it('reports what a selection has, or that it is mixed', () => {
    let f = apply(LINE, 'night', { color: BLACK, size: 1.2 });
    expect(selectionFormat(f, LINE, range(LINE, 'night'))).toEqual({
      color: BLACK,
      mode: 'pen',
      size: 1.2,
      spacing: 0,
    });
    const mixed = selectionFormat(f, LINE, range(LINE, 'The night'));
    expect(mixed.color).toBeUndefined();
    expect(mixed.size).toBeUndefined();
    expect(mixed.mode).toBe('pen');
  });
});

// --- Editing ---------------------------------------------------------------------------

describe('formatting follows the text through edits', () => {
  const black = () => apply(LINE, 'slips quietly', { color: BLACK });

  it('moves when text is inserted before it', () => {
    const next = `Tonight, ${LINE}`;
    const f = reformat(black(), LINE, next);
    expect(next.slice(f.spans[0].start, f.spans[0].end)).toBe('slips quietly');
  });

  it('grows when text is typed inside it', () => {
    const next = LINE.replace('slips quietly', 'slips very quietly');
    const f = reformat(black(), LINE, next);
    expect(next.slice(f.spans[0].start, f.spans[0].end)).toBe('slips very quietly');
  });

  it('shrinks when part of it is deleted, and disappears with its text', () => {
    const part = LINE.replace('slips ', '');
    expect(part.slice(...Object.values(reformat(black(), LINE, part).spans[0]).slice(0, 2))).toBe('quietly');
    const gone = LINE.replace('slips quietly ', '');
    expect(reformat(black(), LINE, gone).spans).toEqual([]);
  });

  it('is dropped when the formatted text is replaced or pasted over', () => {
    const replaced = LINE.replace('slips quietly', 'drifts');
    expect(reformat(black(), LINE, replaced).spans).toEqual([]);
    const pasted = LINE.replace('slips quietly', 'A whole pasted paragraph of new words');
    expect(reformat(black(), LINE, pasted).spans).toEqual([]);
  });
});

// --- Rendering --------------------------------------------------------------------------

const style = getHandwritingStyle('reference_student');
function draw(text, formatting, quality) {
  const layout = layoutHandwriting(text, style, {
    fontSize: 12.4,
    contentWidth: 292,
    lineHeight: 20,
    seed: 'fmt',
    formatting,
  });
  const strokes = [];
  const drawn = renderLines(layout.lines, {
    profile: style,
    layout,
    rowHeight: 20,
    baselineInRow: baselineInRow(20, style, layout.fontSize),
    ink: { floor: 0.86, strength: 1 },
    quality,
    debug: strokes,
  });
  return { layout, drawn, strokes };
}
const wordItem = (layout, text) =>
  layout.lines.flatMap(l => l.words).find(w => w.shape.text === text);
const extent = (list, key) => {
  const v = list.flatMap(s => s[key]);
  return Math.max(...v) - Math.min(...v);
};

describe('rendering', () => {
  it('writes selected text in its own ink, with the same strokes', () => {
    const plain = draw(LINE, emptyFormatting());
    const black = draw(LINE, apply(LINE, 'slips quietly', { color: BLACK }));
    const of = (d, w) => d.strokes.filter(s => s.word === w);
    of(black, 'slips').forEach(s => expect(s.color).toBe(BLACK));
    of(black, 'night').forEach(s => expect(s.color).toBeUndefined());
    // Same handwriting: identical geometry and pressure, only the ink differs.
    expect(of(black, 'slips').map(s => [s.xs, s.ys, s.pressure])).toEqual(
      of(plain, 'slips').map(s => [s.xs, s.ys, s.pressure]),
    );
    expect(black.drawn.buckets.some(b => b.color === BLACK)).toBe(true);
  });

  it('colours only the selected part of a word', () => {
    const at = LINE.indexOf('quietly');
    const f = applySpanFormat(emptyFormatting(), LINE, { start: at, end: at + 3 }, { color: BLACK });
    const strokes = draw(LINE, f).strokes.filter(s => s.word === 'quietly');
    const coloured = new Set(strokes.filter(s => s.color === BLACK).map(s => s.char));
    expect(coloured).toEqual(new Set(['q', 'u', 'i']));
    expect(strokes.filter(s => ['e', 't', 'l', 'y'].includes(s.char)).every(s => !s.color)).toBe(true);
  });

  it('writes marker text with the same letters, wider and translucent', () => {
    const pen = draw(LINE, emptyFormatting()).strokes.filter(s => s.word === 'quietly');
    const marker = draw(LINE, apply(LINE, 'quietly', { mode: 'marker' }));
    const ms = marker.strokes.filter(s => s.word === 'quietly');
    ms.forEach(s => expect(s.mode).toBe('marker'));
    expect(ms.map(s => [s.xs, s.ys])).toEqual(pen.map(s => [s.xs, s.ys]));
    expect(ms[0].base).toBeCloseTo(pen[0].base * MARKER_TEXT.width, 5);
    const bucket = marker.drawn.buckets.find(b => b.mode === 'marker');
    expect(bucket.alpha).toBe(MARKER_TEXT.alpha);
    // Marker ink sits under the pen ink.
    expect(marker.drawn.buckets[0].mode).toBe('marker');
  });

  it.each([0.8, 1, 1.2, 1.4])('scales the handwriting to %s without changing its shape', size => {
    const base = draw(LINE, emptyFormatting());
    const f = size === 1 ? emptyFormatting() : apply(LINE, 'quietly', { size });
    const sized = draw(LINE, f);
    const a = base.strokes.filter(s => s.word === 'quietly' && !s.dot);
    const b = sized.strokes.filter(s => s.word === 'quietly' && !s.dot);
    expect(extent(b, 'ys') / extent(a, 'ys')).toBeCloseTo(size, 1);
    expect(extent(b, 'xs') / extent(a, 'xs')).toBeCloseTo(size, 1);
    expect(b[0].base / a[0].base).toBeCloseTo(size, 5);
    // Same pressure curves: same writer, just bigger or smaller.
    expect(b.map(s => s.pressure.length)).toEqual(a.map(s => s.pressure.length));
  });

  it('lays out mixed sizes in one line without overlaps', () => {
    let f = apply(LINE, 'night ', { size: 1.1 });
    f = apply(LINE, 'slips', { size: 1.2 }, f);
    f = apply(LINE, 'quietly', { size: 0.9 }, f);
    const { layout } = draw(LINE, f);
    expect(layout.lines).toHaveLength(1);
    const words = layout.lines[0].words;
    for (let i = 1; i < words.length; i++) {
      expect(words[i].x).toBeGreaterThan(words[i - 1].x + words[i - 1].shape.width);
    }
    const plain = draw(LINE, emptyFormatting()).layout.lines[0].words;
    expect(wordItem(layout, 'slips').shape.width).toBeCloseTo(plain[2].shape.width * 1.2, 0);
  });

  it('changes only the space between words', () => {
    const gaps = f => {
      const words = draw(LINE, f).layout.lines[0].words;
      return words.slice(1).map((w, i) => w.x - (words[i].x + words[i].shape.width));
    };
    const normal = gaps(emptyFormatting());
    const wide = gaps(apply(LINE, LINE, { spacing: 3 }));
    const tight = gaps(apply(LINE, LINE, { spacing: -2 }));
    wide.forEach((g, i) => expect(g).toBeGreaterThan(normal[i] + 1));
    tight.forEach((g, i) => expect(g).toBeLessThan(normal[i] - 1));
    // Letters keep their own spacing: word widths are unchanged.
    const widths = f => draw(LINE, f).layout.lines[0].words.map(w => w.shape.width);
    expect(widths(apply(LINE, LINE, { spacing: 3 }))).toEqual(widths(emptyFormatting()));
  });

  it('keeps different word spacing in different ranges', () => {
    let f = apply(LINE, 'The night', { spacing: 2 });
    f = apply(LINE, 'slips quietly', { spacing: -1 }, f);
    const words = draw(LINE, f).layout.lines[0].words;
    const plain = draw(LINE, emptyFormatting()).layout.lines[0].words;
    const gap = (ws, i) => ws[i + 1].x - (ws[i].x + ws[i].shape.width);
    expect(gap(words, 0)).toBeGreaterThan(gap(plain, 0)); // The | night
    expect(gap(words, 2)).toBeLessThan(gap(plain, 2)); // slips | quietly
  });

  it('applies all four properties together', () => {
    const f = apply(PARA, 'gold and blue', { color: BLACK, size: 1.2, spacing: 2, mode: 'marker' });
    const strokes = draw(PARA, f).strokes.filter(s => s.word === 'gold');
    strokes.forEach(s => expect(s).toMatchObject({ color: BLACK, mode: 'marker', size: 1.2 }));
  });

  it('keeps natural corrections with their formatted word', () => {
    const text = 'Working capital management refers to the strategic process of managing the short-term assets and liabilities of a company carefully every single day. '.repeat(5);
    let found = null;
    for (let s = 0; s < 80 && !found; s++) {
      const l = layoutHandwriting(text, style, { fontSize: 12.4, contentWidth: 292, lineHeight: 20, seed: `c${s}`, corrections: true });
      const c = l.corrections.find(x => x.kind === 'strike' || x.kind === 'crossed');
      if (c) found = { seed: `c${s}`, c };
    }
    expect(found).toBeTruthy();
    const f = applySpanFormat(emptyFormatting(), text, found.c, { color: BLACK, size: 1.3 });
    const l = layoutHandwriting(text, style, {
      fontSize: 12.4, contentWidth: 292, lineHeight: 20, seed: found.seed, corrections: true, formatting: f,
    });
    expect(l.corrections.map(c => c.id)).toContain(found.c.id);
    const strokes = [];
    renderLines(l.lines, { profile: style, layout: l, rowHeight: 20, baselineInRow: 19, ink: { floor: 0.86, strength: 1 }, debug: strokes });
    const strike = strokes.filter(s => s.at === found.c.start && s.pass === 'strike');
    expect(strike.length).toBeGreaterThan(0);
    strike.forEach(s => expect(s.color).toBe(BLACK));
  });

  it('draws formatting in thumbnails too (simplified)', () => {
    const f = apply(LINE, 'slips', { color: BLACK, mode: 'marker', size: 1.2 });
    const thumb = draw(LINE, f, 'preview').drawn;
    const marker = thumb.buckets.find(b => b.mode === 'marker');
    const pen = thumb.buckets.find(b => !b.mode);
    expect(marker.color).toBe(BLACK);
    expect(marker.width).toBeGreaterThan(pen.width * 2);
  });

  it('renders documents without formatting exactly as before', () => {
    const a = draw(PARA, undefined).drawn;
    const b = draw(PARA, emptyFormatting()).drawn;
    const c = draw(PARA, normalizeFormatting({ headings: [] }, PARA.length)).drawn;
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    a.buckets.forEach(bk => {
      expect(bk.color).toBeUndefined();
      expect(bk.mode).toBeUndefined();
    });
  });
});

// --- Pages, persistence, export ---------------------------------------------------

const metrics = getPageMetrics({ pageType: 'lined' });
const rowHeight = rowHeightFor(getPageType('lined'), metrics, style);
const LONG = 'Working capital management refers to the strategic process of managing a company. '.repeat(30).trim();
const paginate = doc =>
  paginateDocument({
    content: doc.content,
    formatting: doc.formatting,
    pageIds: doc.pageIds,
    style,
    metrics,
    rowHeight,
    seed: doc.id,
  });
const blackWords = paged =>
  paged.pages.flatMap(p => p.lines.flatMap(l => l.words.filter(w => w.shape.chars?.some(c => c.color === BLACK)).map(w => w.start)));

describe('pages', () => {
  it('splits a formatted range across a page break', () => {
    const doc = { ...createDocument(), content: LONG };
    const first = paginate(doc);
    const boundary = first.pages[1].start;
    doc.formatting = applySpanFormat(emptyFormatting(), LONG, { start: boundary - 60, end: boundary + 60 }, { color: BLACK });
    const paged = paginate(doc);
    const on = p => p.lines.flatMap(l => l.words).filter(w => w.shape.chars?.some(c => c.color === BLACK));
    expect(on(paged.pages[0]).length).toBeGreaterThan(0);
    expect(on(paged.pages[1]).length).toBeGreaterThan(0);
  });

  it('follows its text when it moves to another page', () => {
    const at = LONG.indexOf('strategic');
    const doc = { ...createDocument(), content: LONG };
    doc.formatting = applySpanFormat(emptyFormatting(), LONG, { start: at, end: at + 9 }, { color: BLACK });
    const extra = 'An introduction long enough to push the text down. '.repeat(14);
    const content = extra + LONG;
    const moved = { ...doc, content, formatting: reformat(doc.formatting, LONG, content) };
    expect(blackWords(paginate(moved))).toEqual([at + extra.length]);
  });

  it('follows its page when pages are reordered', () => {
    const content = `First page words here${PAGE_BREAK}Second page with the formatted words`;
    const doc = { ...createDocument(), content, pageIds: ['p1', 'p2'] };
    doc.formatting = applySpanFormat(emptyFormatting(), content, range(content, 'formatted words'), { color: BLACK });
    const result = movePage(doc, paginate(doc).pages, 1, -1);
    const sheets = splitSheets(result.doc.content);
    const span = result.doc.formatting.spans[0];
    expect(result.doc.content.slice(span.start, span.end)).toBe('formatted words');
    expect(sheets[0].text).toContain('formatted words');
  });
});

describe('persistence', () => {
  it('saves and reopens every property exactly', async () => {
    let f = apply(PARA, 'gold and blue', { color: BLACK, size: 1.2, spacing: 2 });
    f = apply(PARA, 'little bird', { mode: 'marker' }, f);
    const doc = { ...createDocument(), content: PARA, formatting: f };
    const saved = await saveDocument(doc);
    const reopened = await getDocument(saved.id);
    expect(reopened.formatting.spans).toEqual(f.spans);
  });

  it('opens old documents without spans unchanged', () => {
    const old = normalizeDocument({ content: PARA, formatting: { headings: [], underlines: [], labels: [] } });
    expect(old.formatting.spans).toEqual([]);
    expect(normalizeDocument({ content: PARA }).formatting.spans).toEqual([]);
  });
});

describe('export and thumbnails', () => {
  const doc = () => {
    const f = apply(PARA, 'gold and blue', { color: BLACK, size: 1.2, mode: 'marker', spacing: 2 });
    return { ...createDocument(), title: 'F', content: PARA, formatting: f };
  };
  const blackPaths = r => handwritingPaths(r).filter(n => n.props.fill === BLACK || n.props.stroke === BLACK);

  it.each(['pdf', 'png', 'jpg'])('exports formatted text to %s with the editor renderer', async format => {
    const d = doc();
    const paged = { ...paginate(d), metrics, rowHeight };
    const seen = [];
    let mounted = null;
    setNativeExporter({
      getExportDirectory: jest.fn(async () => '/cache'),
      beginPdf: jest.fn(async () => 'job'),
      addPdfPage: jest.fn(async () => seen.push(blackPaths(mounted).length)),
      finishPdf: jest.fn(async () => '/cache/x.pdf'),
      cancelPdf: jest.fn(),
      captureView: jest.fn(async (tag, p) => {
        seen.push(blackPaths(mounted).length);
        return p;
      }),
      share: jest.fn(async () => true),
    });
    let done = null;
    mounted = await render(
      <ExportRenderer
        plan={buildExportPlan({ title: 'F', format, pageCount: 1 })}
        document={d}
        paged={paged}
        onProgress={() => {}}
        onFinish={o => (done = o)}
        onError={() => {}}
      />,
    );
    for (let i = 0; i < 200 && !done; i++) {
      await act(async () => {
        await new Promise(res => setTimeout(res, 10));
      });
    }
    expect(done).toBeTruthy();
    expect(seen[0]).toBeGreaterThan(0);
  }, 30000);

  it('thumbnails show the formatting', async () => {
    const d = doc();
    const paged = paginate(d);
    const r = await render(
      <PaperPage document={d} page={paged.pages[0]} layout={paged.layout} metrics={metrics} rowHeight={rowHeight} width={110} quality="preview" />,
    );
    const black = blackPaths(r);
    expect(black.length).toBeGreaterThan(0);
    black.forEach(n => expect(n.props.fill).toBe('none'));
  });
});

// --- Editor ------------------------------------------------------------------------------

describe('editor', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => restoreRealTimers(jest));

  async function open(content = LINE) {
    const d = { ...createDocument(), content };
    const r = await render(<EditorScreen initialDocument={d} onClose={jest.fn()} />);
    await press(r, 'toolbar-edit');
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    return r;
  }
  const select = async (r, sel) => {
    await act(async () => {
      byTestId(r, 'text-input', 'onSelectionChange').props.onSelectionChange({ nativeEvent: { selection: sel } });
    });
  };
  const spansOf = r =>
    r.root.findAll(n => n.props.testID === 'paper-canvas' && n.props.document)[0].props.document.formatting.spans;
  const has = (r, id) => r.root.findAll(n => n.props.testID === id).length > 0;

  it('shows the selection toolbar only while text is selected', async () => {
    const r = await open();
    expect(has(r, 'selection-format-bar')).toBe(false);
    await select(r, range(LINE, 'quietly'));
    expect(has(r, 'selection-format-bar')).toBe(true);
    await select(r, { start: 3, end: 3 });
    expect(has(r, 'selection-format-bar')).toBe(false);
  });

  it('applies colour, size, spacing and marker; each step undoes and redoes', async () => {
    const r = await open();
    const sel = range(LINE, 'slips quietly');
    await select(r, sel);
    await press(r, 'selection-color-151515');
    await press(r, 'selection-size-up');
    await press(r, 'selection-spacing-up');
    await press(r, 'selection-mode-marker');
    expect(spansOf(r)).toEqual([{ ...sel, color: BLACK, size: 1.1, spacing: 1, mode: 'marker' }]);
    expect(byTestId(r, 'selection-size-value').props.children).toBe('110%');

    await press(r, 'toolbar-undo');
    expect(spansOf(r)).toEqual([{ ...sel, color: BLACK, size: 1.1, spacing: 1 }]);
    await press(r, 'toolbar-undo');
    expect(spansOf(r)).toEqual([{ ...sel, color: BLACK, size: 1.1 }]);
    await press(r, 'toolbar-undo');
    await press(r, 'toolbar-undo');
    expect(spansOf(r)).toEqual([]);
    await press(r, 'toolbar-redo');
    await press(r, 'toolbar-redo');
    expect(spansOf(r)).toEqual([{ ...sel, color: BLACK, size: 1.1 }]);
  });

  it('resets the selection, and the document colour means "follow the pen"', async () => {
    const r = await open();
    await select(r, range(LINE, 'night'));
    await press(r, 'selection-color-151515');
    await press(r, 'selection-color-123a8c'); // the document's own blue
    expect(spansOf(r)).toEqual([]);
    await press(r, 'selection-size-up');
    await press(r, 'selection-reset');
    expect(spansOf(r)).toEqual([]);
  });
});

// --- Performance ---------------------------------------------------------------------------

describe('performance', () => {
  const text = n => 'The night slips quietly away and wakes the gold and blue of day. '.repeat(Math.ceil(n / 66)).slice(0, n);
  it.each([
    [500, 1],
    [1000, 10],
    [2500, 50],
    [5000, 100],
  ])('%i characters with %i formatting ranges stay fast and grouped', (n, count) => {
    const t = text(n);
    let f = emptyFormatting();
    for (let i = 0; i < count; i++) {
      const start = Math.floor((i * n) / count);
      f = applySpanFormat(f, t, { start, end: Math.min(n, start + 12) }, {
        color: i % 2 ? BLACK : '#7CC8FF',
        size: [0.9, 1.1, 1.2][i % 3],
        mode: i % 5 === 0 ? 'marker' : 'pen',
      });
    }
    const started = Date.now();
    const { drawn } = draw(t, f);
    // Coarse guard: Jest runs untransformed-for-speed code and suites in
    // parallel; plain Node takes well under a second for 5,000 characters.
    expect(Date.now() - started).toBeLessThan(20000);
    // A handful of paths per ink — never one per letter.
    expect(drawn.buckets.length).toBeLessThan(40);
  });
});
