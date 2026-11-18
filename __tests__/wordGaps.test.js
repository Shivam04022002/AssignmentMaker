/**
 * Individual word gaps — the space between ONE exact pair of words — and
 * the Lang2 refinements (r vs n, repeated t and r, density).
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
import { GLYPHS, glyphFor } from '../src/handwriting/glyphs';
import { LANG2_PROFILE_ID } from '../src/handwriting/handwritingProfiles';
import { letterStrokes, sampleChain } from '../src/handwriting/strokeModel';
import { createDocument, normalizeDocument } from '../src/models/document';
import EditorScreen from '../src/screens/EditorScreen';
import {
  getDocument,
  saveDocument,
  setStorageBackend,
} from '../src/storage/documentStorage';
import {
  applySpanFormat,
  boundariesIn,
  emptyFormatting,
  gapAt,
  pruneGaps,
  reformat,
  setWordGap,
} from '../src/utils/formatting';
import { movePage } from '../src/utils/pageOps';
import { PAGE_BREAK, paginateDocument } from '../src/utils/pagination';
import { layoutHandwriting } from '../src/utils/textLayout';
import { act, byTestId, press, render, restoreRealTimers } from './helpers/render';

const LINE = 'The flowers lift their heads to see';
const L1 = getHandwritingStyle('reference_student');
const L2 = getHandwritingStyle(LANG2_PROFILE_ID);
const sel = (text, needle) => {
  const start = text.indexOf(needle);
  return { start, end: start + needle.length };
};
const boundary = (text, left, right) =>
  boundariesIn(text, sel(text, `${left} ${right}`)).find(b => b.left === left && b.right === right);
const withGap = (text, left, right, value, f = emptyFormatting()) =>
  setWordGap(f, text, boundary(text, left, right), value);

function lay(text, formatting, profile = L1) {
  return layoutHandwriting(text, profile, {
    fontSize: 12.4,
    contentWidth: 600,
    lineHeight: 20,
    seed: 'gap',
    formatting,
  });
}
/** The drawn gaps between consecutive words of the first line, by pair. */
function gaps(text, formatting, profile) {
  const words = lay(text, formatting, profile).lines[0].words;
  const out = {};
  for (let i = 0; i < words.length - 1; i++) {
    out[`${words[i].shape.text}|${words[i + 1].shape.text}`] =
      words[i + 1].x - (words[i].x + words[i].shape.width);
  }
  return out;
}

beforeEach(() => {
  clearAllMockStorages();
  setStorageBackend(null);
  setNativeExporter(null);
});

// --- Targeting ----------------------------------------------------------------------

describe('finding the word boundary', () => {
  it('lists the boundaries a selection spans', () => {
    expect(boundariesIn(LINE, sel(LINE, 'heads to')).map(b => `${b.left}|${b.right}`)).toEqual(['heads|to']);
    expect(boundariesIn(LINE, sel(LINE, 'their heads to')).map(b => `${b.left}|${b.right}`)).toEqual([
      'their|heads',
      'heads|to',
    ]);
  });

  it('is forgiving: the cursor in, or at either edge of, the space finds it', () => {
    const at = LINE.indexOf('heads') + 5; // right after "heads"
    for (const pos of [at, at + 1]) {
      expect(boundariesIn(LINE, { start: pos, end: pos }).map(b => `${b.left}|${b.right}`)).toEqual(['heads|to']);
    }
    // Inside a word: no boundary.
    expect(boundariesIn(LINE, { start: at - 2, end: at - 2 })).toEqual([]);
  });

  it('finds a boundary at the start or end of a selection', () => {
    // "heads t" — the selection just reaches into "to".
    const s = LINE.indexOf('heads');
    expect(boundariesIn(LINE, { start: s, end: s + 7 }).map(b => b.right)).toEqual(['to']);
    // "s to" — starts inside "heads".
    expect(boundariesIn(LINE, { start: s + 4, end: s + 8 }).map(b => b.left)).toEqual(['heads']);
  });

  it('never pairs words across a line or page break', () => {
    const text = `heads\nto${PAGE_BREAK}see`;
    expect(boundariesIn(text, { start: 0, end: text.length })).toEqual([]);
  });
});

// --- Values -------------------------------------------------------------------------------

describe('one gap at a time', () => {
  it('widens or narrows only heads | to', () => {
    const base = gaps(LINE);
    const wide = gaps(LINE, withGap(LINE, 'heads', 'to', 3));
    const tight = gaps(LINE, withGap(LINE, 'heads', 'to', -2));
    expect(wide['heads|to']).toBeGreaterThan(base['heads|to'] + 5);
    expect(tight['heads|to']).toBeLessThan(base['heads|to'] - 2);
    for (const pair of Object.keys(base).filter(p => p !== 'heads|to')) {
      expect([pair, wide[pair]]).toEqual([pair, base[pair]]);
      expect([pair, tight[pair]]).toEqual([pair, base[pair]]);
    }
  });

  it('changes nothing but the gap: word shapes are identical', () => {
    const shapes = f => lay(LINE, f).lines[0].words.map(w => [w.shape.text, w.shape.width, w.shape.chars]);
    expect(shapes(withGap(LINE, 'heads', 'to', 4))).toEqual(shapes(emptyFormatting()));
  });

  it('keeps several independent gaps, positive and negative', () => {
    let f = withGap(LINE, 'heads', 'to', 3);
    f = withGap(LINE, 'The', 'flowers', -2, f);
    f = withGap(LINE, 'to', 'see', 1, f);
    const base = gaps(LINE);
    const g = gaps(LINE, f);
    expect(g['heads|to']).toBeGreaterThan(base['heads|to']);
    expect(g['The|flowers']).toBeLessThan(base['The|flowers']);
    expect(g['to|see']).toBeGreaterThan(base['to|see']);
    expect(g['lift|their']).toBe(base['lift|their']);
    expect(f.gaps.map(x => x.value)).toEqual([-2, 3, 1]);
  });

  it('resets to 0 and keeps values in −5…+5', () => {
    let f = withGap(LINE, 'heads', 'to', 3);
    expect(gapAt(f, boundary(LINE, 'heads', 'to'))).toBe(3);
    f = withGap(LINE, 'heads', 'to', 0, f);
    expect(f.gaps).toEqual([]);
    expect(withGap(LINE, 'heads', 'to', 99).gaps[0].value).toBe(5);
    expect(withGap(LINE, 'heads', 'to', -9).gaps[0].value).toBe(-5);
  });

  it('takes precedence over the general word spacing of a range', () => {
    let f = applySpanFormat(emptyFormatting(), LINE, { start: 0, end: LINE.length }, { spacing: 2 });
    const general = gaps(LINE, f);
    f = withGap(LINE, 'heads', 'to', -2, f);
    const g = gaps(LINE, f);
    expect(g['heads|to']).toBeLessThan(general['heads|to'] - 3);
    expect(g['their|heads']).toBe(general['their|heads']); // others keep +2
    expect(gaps(LINE, withGap(LINE, 'heads', 'to', -2))['heads|to']).toBeCloseTo(g['heads|to'], 5);
  });

  it('works with colour, marker and size on the two words', () => {
    let f = applySpanFormat(emptyFormatting(), LINE, sel(LINE, 'to'), { color: '#151515', size: 1.2 });
    f = applySpanFormat(f, LINE, sel(LINE, 'heads'), { mode: 'marker' });
    const styled = gaps(LINE, f);
    f = withGap(LINE, 'heads', 'to', 3, f);
    const g = gaps(LINE, f);
    expect(g['heads|to']).toBeGreaterThan(styled['heads|to'] + 5);
    const words = lay(LINE, f).lines[0].words;
    const to = words.find(w => w.shape.text === 'to');
    expect(to.shape.chars.every(c => c.color === '#151515' && c.size === 1.2)).toBe(true);
    expect(words.find(w => w.shape.text === 'heads').shape.chars.every(c => c.mode === 'marker')).toBe(true);
  });
});

// --- Editing -----------------------------------------------------------------------------------

describe('editing around a gap', () => {
  const f0 = () => withGap(LINE, 'heads', 'to', 3);
  const edit = next => reformat(f0(), LINE, next).gaps;

  it('moves with text inserted before it', () => {
    const next = `Look: ${LINE}`;
    const [g] = edit(next);
    expect(next.slice(g.start, g.end)).toBe('heads to');
  });

  it('is removed when either word is deleted or replaced', () => {
    expect(edit(LINE.replace('heads ', ''))).toEqual([]);
    expect(edit(LINE.replace(' to', ''))).toEqual([]);
    expect(edit(LINE.replace('heads', 'arms'))).toEqual([]);
    expect(edit(LINE.replace(' to ', ' toward '))).toEqual([]);
    expect(edit(LINE.replace('heads', 'head'))).toEqual([]); // edited inside the word
  });

  it('is removed when a word is inserted between the two', () => {
    expect(edit(LINE.replace('heads to', 'heads up to'))).toEqual([]);
  });

  it('is removed when pasted over, and never lands on unrelated words', () => {
    const pasted = LINE.replace('their heads to see', 'a long pasted sentence with heads and to in it');
    expect(edit(pasted)).toEqual([]);
    // A stale gap whose range now holds other words is dropped too.
    expect(pruneGaps([{ start: 0, end: 11, value: 2, left: 'heads', right: 'to' }], LINE)).toEqual([]);
  });

  it('survives extra typed spaces between the words', () => {
    const [g] = edit(LINE.replace('heads to', 'heads  to'));
    expect(g).toBeTruthy();
  });
});

// --- Pages, persistence, export ---------------------------------------------------------

const metrics = getPageMetrics({ pageType: 'lined' });
const rowHeight = rowHeightFor(getPageType('lined'), metrics, L1);
const paginate = doc =>
  paginateDocument({ content: doc.content, formatting: doc.formatting, pageIds: doc.pageIds, style: L1, metrics, rowHeight, seed: doc.id });
const gapOnPages = (paged, left, right) => {
  for (const p of paged.pages) {
    for (const l of p.lines) {
      const i = l.words.findIndex((w, k) => w.shape.text === left && l.words[k + 1] && l.words[k + 1].shape.text === right);
      if (i >= 0) return l.words[i + 1].x - (l.words[i].x + l.words[i].shape.width);
    }
  }
  return null;
};

describe('pages', () => {
  const PROSE = 'Working capital management refers to the strategic process of managing a company. ';
  const text = `${PROSE.repeat(12)}${LINE}. ${PROSE.repeat(4)}`;

  it('follows its words through reflow onto another page', () => {
    const doc = { ...createDocument(), content: text, formatting: withGap(text, 'heads', 'to', 4) };
    const before = gapOnPages(paginate(doc), 'heads', 'to');
    const longer = PROSE.repeat(10) + text;
    const moved = { ...doc, content: longer, formatting: reformat(doc.formatting, text, longer) };
    const paged = paginate(moved);
    expect(paged.pages.length).toBeGreaterThan(1);
    expect(gapOnPages(paged, 'heads', 'to')).toBeCloseTo(before, 0);
  });

  it('follows its page when pages are reordered', () => {
    const content = `First page.${PAGE_BREAK}${LINE}`;
    const doc = { ...createDocument(), content, pageIds: ['a', 'b'], formatting: withGap(content, 'heads', 'to', 4) };
    const result = movePage(doc, paginate(doc).pages, 1, -1);
    const [g] = result.doc.formatting.gaps;
    expect(result.doc.content.slice(g.start, g.end)).toBe('heads to');
    expect(pruneGaps(result.doc.formatting.gaps, result.doc.content)).toHaveLength(1);
  });

  it('saves and reopens exactly; old documents have no gaps', async () => {
    const doc = { ...createDocument(), content: LINE, formatting: withGap(LINE, 'heads', 'to', 3) };
    const saved = await saveDocument(doc);
    expect((await getDocument(saved.id)).formatting.gaps).toEqual(doc.formatting.gaps);
    expect(normalizeDocument({ content: LINE }).formatting.gaps).toEqual([]);
    // Without gaps, layout is exactly as before.
    expect(lay(LINE, normalizeDocument({ content: LINE }).formatting).lines).toEqual(lay(LINE, undefined).lines);
  });

  it.each(['pdf', 'png', 'jpg'])('exports the gap to %s with the editor layout', async format => {
    const doc = { ...createDocument(), content: LINE, formatting: withGap(LINE, 'heads', 'to', 4) };
    const paged = { ...paginate(doc), metrics, rowHeight };
    let mounted = null;
    const seen = [];
    const capture = () => {
      const page = mounted.root.findAll(n => n.props.testID === 'export-page' && n.props.page)[0];
      seen.push(gapOnPages({ pages: [page.props.page] }, 'heads', 'to'));
    };
    setNativeExporter({
      getExportDirectory: jest.fn(async () => '/c'),
      beginPdf: jest.fn(async () => 'j'),
      addPdfPage: jest.fn(async () => capture()),
      finishPdf: jest.fn(async () => '/c/x.pdf'),
      cancelPdf: jest.fn(),
      captureView: jest.fn(async (tag, p) => {
        capture();
        return p;
      }),
      share: jest.fn(async () => true),
    });
    let done = null;
    mounted = await render(
      <ExportRenderer plan={buildExportPlan({ title: 'G', format, pageCount: 1 })} document={doc} paged={paged} onProgress={() => {}} onFinish={o => (done = o)} onError={() => {}} />,
    );
    for (let i = 0; i < 200 && !done; i++) {
      await act(async () => {
        await new Promise(res => setTimeout(res, 10));
      });
    }
    expect(done).toBeTruthy();
    expect(seen[0]).toBeCloseTo(gapOnPages(paginate(doc), 'heads', 'to'), 3);
    expect(seen[0]).toBeGreaterThan(gapOnPages(paginate({ ...doc, formatting: emptyFormatting() }), 'heads', 'to'));
  }, 30000);

  it('thumbnails keep the gap', async () => {
    const doc = { ...createDocument(), content: LINE, formatting: withGap(LINE, 'heads', 'to', 4) };
    const paged = paginate(doc);
    const r = await render(<PaperPage document={doc} page={paged.pages[0]} layout={paged.layout} metrics={metrics} rowHeight={rowHeight} width={100} quality="preview" />);
    const page = r.root.findAll(n => n.props.page && n.props.quality === 'preview')[0];
    expect(gapOnPages({ pages: [page.props.page] }, 'heads', 'to')).toBeGreaterThan(
      gapOnPages(paginate({ ...doc, formatting: emptyFormatting() }), 'heads', 'to') + 5,
    );
  });
});

// --- Editor ---------------------------------------------------------------------------------------

describe('editor', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => restoreRealTimers(jest));

  async function open() {
    const d = { ...createDocument(), content: LINE };
    const r = await render(<EditorScreen initialDocument={d} onClose={jest.fn()} />);
    await press(r, 'toolbar-edit');
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    return r;
  }
  const select = async (r, s) => {
    await act(async () => {
      byTestId(r, 'text-input', 'onSelectionChange').props.onSelectionChange({ nativeEvent: { selection: s } });
    });
  };
  const gapsOf = r =>
    r.root.findAll(n => n.props.testID === 'paper-canvas' && n.props.document)[0].props.document.formatting.gaps;
  const value = r => byTestId(r, 'word-gap-value').props.children;
  const pair = r => byTestId(r, 'word-gap-pair', 'accessibilityLabel').props.accessibilityLabel;

  it('adjusts one gap from the cursor; each step undoes and redoes', async () => {
    const r = await open();
    const at = LINE.indexOf('heads') + 5;
    await select(r, { start: at, end: at });
    expect(pair(r)).toBe('Gap between heads and to');
    await press(r, 'word-gap-up');
    await press(r, 'word-gap-up');
    await press(r, 'word-gap-up');
    expect(value(r)).toBe('+3');
    expect(gapsOf(r)).toEqual([expect.objectContaining({ left: 'heads', right: 'to', value: 3 })]);
    await press(r, 'toolbar-undo');
    expect(value(r)).toBe('+2');
    await press(r, 'toolbar-undo');
    expect(value(r)).toBe('+1');
    await press(r, 'toolbar-undo');
    expect(value(r)).toBe('0');
    expect(gapsOf(r)).toEqual([]);
    await press(r, 'toolbar-redo');
    await press(r, 'toolbar-redo');
    expect(value(r)).toBe('+2');
  });

  it('chooses one boundary among several in a selection', async () => {
    const r = await open();
    await select(r, sel(LINE, 'their heads to'));
    expect(pair(r)).toBe('Gap between their and heads');
    await press(r, 'word-gap-next');
    expect(pair(r)).toBe('Gap between heads and to');
    await press(r, 'word-gap-down');
    expect(gapsOf(r)).toEqual([expect.objectContaining({ left: 'heads', right: 'to', value: -1 })]);
    await press(r, 'word-gap-reset');
    expect(gapsOf(r)).toEqual([]);
  });

  it('hides when no boundary is near', async () => {
    const r = await open();
    await select(r, { start: 6, end: 6 }); // inside "flowers"
    expect(r.root.findAll(n => n.props.testID === 'word-gap-control')).toHaveLength(0);
  });
});

// --- Lang2 refinements --------------------------------------------------------------------

describe('Lang2 refinements', () => {
  const downstrokes = ch => {
    const { ys } = sampleChain(glyphFor(ch, 'lang2').strokes[0]);
    let count = 0;
    let high = false;
    for (const v of ys) {
      if (v > 0.75) high = true;
      if (high && v < 0.2) {
        count++;
        high = false;
      }
    }
    return count;
  };

  it('r has one downstroke and leaves from its arm at the top — n has two', () => {
    expect(downstrokes('r')).toBe(1);
    expect(downstrokes('n')).toBe(2);
    const r = glyphFor('r', 'lang2').strokes[0];
    expect(r[r.length - 1]).toBeGreaterThan(0.7); // ends high
    const n = glyphFor('n', 'lang2').strokes[0];
    expect(n[n.length - 1]).toBeLessThan(0.3); // ends low
  });

  it('joins r into the next letter at x-height, as in are/very/market', () => {
    let joinedHigh = 0;
    for (let seed = 0; seed < 30; seed++) {
      const st = letterStrokes('r', { profile: L2, prev: 'a', next: 'e', seed, nextAdvance: 0.7 })[0];
      if (st.joined) {
        joinedHigh++;
        expect(st.ys[st.ys.length - 1]).toBeGreaterThan(0.5);
      }
    }
    expect(joinedHigh).toBeGreaterThan(5);
  });

  it('gives each t its own short crossbar', () => {
    const t = glyphFor('t', 'lang2');
    const bar = t.strokes[1];
    const barXs = [bar[0], bar[bar.length - 2]];
    // The bar stays within the letter, so neighbouring bars never meet.
    expect(Math.min(...barXs)).toBeGreaterThan(0);
    expect(Math.max(...barXs)).toBeLessThan(t.w);
    const layout = lay('tttt', undefined, L2);
    const chars = layout.lines[0].words[0].shape.chars;
    expect(chars).toHaveLength(4);
  });

  it('fits about 7–8 words on a full line, like the reference', () => {
    const TEXT =
      "Working Capital Management (WCM) in India refers to the strategic process of managing a company's short-term assets and liabilities to ensure it has sufficient liquidity to operate efficiently. In the Indian business landscape, this is a delicate balancing act between profitability and solvency, heavily influenced by local banking regulations and the unique credit cycles of the Indian market.";
    const l = layoutHandwriting(TEXT, L2, { fontSize: 12.4, contentWidth: 292, lineHeight: 20, seed: 'd' });
    const full = l.lines.slice(0, -1).map(x => x.words.length);
    const avg = full.reduce((a, b) => a + b, 0) / full.length;
    expect(avg).toBeGreaterThanOrEqual(7);
    expect(avg).toBeLessThanOrEqual(8.8);
    // Proportions kept: ascenders and descenders unchanged.
    expect(L2.ascender).toBe(1.75);
    expect(L2.xHeightPerPitch).toBeGreaterThanOrEqual(0.24);
  });

  it('is deterministic, and Lang1 is unchanged', () => {
    const draw = p => {
      const l = lay('error carry correct current letter little', undefined, p);
      return renderLines(l.lines, { profile: p, layout: l, rowHeight: 20, baselineInRow: baselineInRow(20, p, l.fontSize), ink: { floor: 0.86, strength: 1 } });
    };
    expect(draw(L2)).toEqual(draw(L2));
    expect(glyphFor('r')).toBe(GLYPHS.r);
    expect(L1).toMatchObject({ xHeightPerPitch: 0.31, letterGap: 0.25, glyphWidth: 1.1, wordGap: 1.75 });
  });
});

// --- Performance ---------------------------------------------------------------------------------

describe('performance', () => {
  const prose = n => 'The flowers lift their heads to see the light dance softly through the tree. '.repeat(80).slice(0, n);
  it.each([
    [500, 0],
    [1000, 1],
    [2500, 10],
    [5000, 50],
    [5000, 100],
  ])('%i characters with %i gap overrides stay grouped', (n, count) => {
    const text = prose(n);
    let f = applySpanFormat(emptyFormatting(), text, { start: 0, end: Math.min(200, n) }, { color: '#151515' });
    const all = boundariesIn(text, { start: 0, end: text.length });
    for (let i = 0; i < count && i < all.length; i++) {
      f = setWordGap(f, text, all[Math.floor((i * all.length) / count)], (i % 6) - 2 || 1);
    }
    const l = layoutHandwriting(text, L2, { fontSize: 12.4, contentWidth: 292, lineHeight: 20, seed: 'p', formatting: f });
    const drawn = renderLines(l.lines, { profile: L2, layout: l, rowHeight: 20, baselineInRow: 19, ink: { floor: 0.86, strength: 1 } });
    expect(drawn.buckets.length).toBeLessThan(20);
    expect(f.gaps.length).toBe(Math.min(count, all.length));
  });
});
