/**
 * Natural corrections: the occasional letter written over, short strike or
 * crossed-out attempt — rendering metadata anchored to words, drawn with the
 * same pen. These tests check frequency, determinism, anchoring through
 * edits and pagination, geometry, persistence, export and thumbnails.
 */
import React from 'react';
import { clearAllMockStorages } from '@react-native-async-storage/async-storage';
import { getHandwritingStyle } from '../src/data/handwritingStyles';
import { getPageMetrics, getPageType, rowHeightFor } from '../src/data/paper';
import HandwritingText, { baselineInRow } from '../src/components/HandwritingText';
import PaperPage from '../src/components/PaperPage';
import ExportRenderer from '../src/export/ExportRenderer';
import { buildExportPlan } from '../src/export/exportPlan';
import { setNativeExporter } from '../src/export/nativeExporter';
import {
  CORRECTION_SETTINGS,
  isEligible,
  misspell,
  planCorrection,
} from '../src/handwriting/corrections';
import { inkTone, renderLines } from '../src/handwriting/glyphRender';
import { createDocument, normalizeDocument } from '../src/models/document';
import EditorScreen from '../src/screens/EditorScreen';
import {
  getDocument,
  saveDocument,
  setStorageBackend,
} from '../src/storage/documentStorage';
import { emptyFormatting } from '../src/utils/formatting';
import { movePage } from '../src/utils/pageOps';
import { PAGE_BREAK, paginateDocument } from '../src/utils/pagination';
import { layoutHandwriting } from '../src/utils/textLayout';
import { createRandom } from '../src/utils/variation';
import {
  act,
  byTestId,
  handwritingPaths,
  render,
  renderedHandwriting,
  restoreRealTimers,
} from './helpers/render';

const style = () => getHandwritingStyle('reference_student');
const BLUE = '#123A8C';
const DARK = inkTone(BLUE, 'dark');

/** The development visual test document (~320 words). */
const TEXT = [
  'Q1. What is the international market? Write its advantages and its disadvantages.',
  'Ans: The international market refers to the exchange of goods, services and resources across national borders. Unlike domestic marketing, which occurs within the confines of a single country, international marketing involves navigating diverse legal systems, cultural nuances, economic climates and consumer behaviours.',
  '',
  'In a globalised world, the international market is not just an option for growth, it is often a necessity for survival. It allows companies to tap into a much larger customer base rather than being limited by the saturation or economic downturns of a single home market. It covers various modes of entry, including exporting, licensing, franchising, joint ventures and foreign direct investment.',
  '',
  '1. Advantages of the International Market',
  '1. Larger market: a company can sell its products to millions of new customers in other countries, which increases its sales and profits.',
  '2. Spreading risk: when demand falls at home, sales in other markets can balance the loss, so the business becomes more stable.',
  '3. Economies of scale: producing larger quantities lowers the cost of each unit, which makes the products cheaper and more competitive.',
  '4. New ideas: working with partners and customers abroad brings new technology, skills and ways of thinking into the company.',
  '',
  '2. Disadvantages of the International Market',
  '1. Higher costs: transport, insurance, packaging and legal fees can make trading abroad expensive, especially for small firms.',
  '2. Exchange rates: changes in the value of money can reduce profits suddenly, even when sales stay the same.',
  '3. Cultural differences: a product that sells well at home may fail in another country because of language, habits or beliefs.',
  '4. Political risk: new taxes, trade barriers or unstable governments can create serious problems for foreign businesses.',
  '',
  'In conclusion, the international market offers great opportunities for growth, but every company must study each market carefully, plan its strategy and manage the risks before it decides to enter.',
].join('\n');
/** Seed whose page shows one of each kind (found with the dev tooling). */
const SEED = 'visual-160';
const WORDS = TEXT.split(/\s+/);
const words = n => WORDS.slice(0, n).join(' ');

function layout(text, { seed = SEED, pageId = 'page-1', corrections = true, formatting } = {}) {
  return layoutHandwriting(text, style(), {
    fontSize: 12.4,
    contentWidth: 292,
    lineHeight: 20,
    seed,
    pageId,
    formatting,
    corrections,
  });
}

function draw(text, options = {}) {
  const l = layout(text, options);
  const strokes = [];
  const drawn = renderLines(l.lines, {
    profile: style(),
    layout: l,
    rowHeight: 20,
    baselineInRow: baselineInRow(20, style(), l.fontSize),
    ink: { floor: 0.86, strength: 1 },
    quality: options.quality,
    debug: strokes,
  });
  return { layout: l, drawn, strokes };
}

const signature = cs => cs.map(c => `${c.id}:${c.kind}:${c.seed}`).sort();
const mean = a => a.reduce((t, v) => t + v, 0) / a.length;

beforeEach(() => {
  clearAllMockStorages();
  setStorageBackend(null);
  setNativeExporter(null);
});
afterEach(() => restoreRealTimers(jest));

// --- Frequency ------------------------------------------------------------------

describe('frequency', () => {
  const counts = (n, seeds = 200) =>
    Array.from({ length: seeds }, (_, s) =>
      layout(words(n), { seed: `doc-${s}` }).corrections.filter(c => c.kind !== 'dot').length,
    );

  it('leaves short documents clean', () => {
    expect(Math.max(...counts(20))).toBe(0);
    expect(Math.max(...counts(35))).toBe(0);
  });

  it('is rare: about one correction per reference page (~150 words)', () => {
    const at100 = counts(100);
    const at300 = counts(300);
    expect(mean(at100)).toBeGreaterThan(0.2);
    expect(mean(at100)).toBeLessThan(1.2);
    expect(mean(at300)).toBeGreaterThan(1);
    expect(mean(at300)).toBeLessThan(3);
    // Most 300-word pages have 0–4.
    const sorted = [...at300].sort((a, b) => a - b);
    expect(sorted[Math.floor(sorted.length * 0.9)]).toBeLessThanOrEqual(4);
  });

  it('uses every kind, letter fixes most often (as in the references)', () => {
    const kinds = {};
    for (let s = 0; s < 300; s++) {
      layout(TEXT, { seed: `doc-${s}` }).corrections.forEach(c => {
        kinds[c.kind] = (kinds[c.kind] || 0) + 1;
      });
    }
    expect(Object.keys(kinds).sort()).toEqual(
      ['crossed', 'dot', 'letter-fix', 'overwrite', 'strike'].sort(),
    );
    const max = Math.max(...Object.values(kinds));
    expect(kinds['letter-fix']).toBe(max);
  });

  it('is off unless asked for', () => {
    expect(layout(TEXT, { corrections: false }).corrections).toEqual([]);
    expect(layoutHandwriting(TEXT, style(), { seed: SEED }).corrections).toEqual([]);
  });
});

// --- Planning ---------------------------------------------------------------------

describe('planning', () => {
  it('only corrects ordinary prose words', () => {
    expect(isEligible('market')).toBe(true);
    expect(isEligible('goods,')).toBe(true);
    for (const t of ['a', 'to', 'the', 'Q1.', 'Ans:', '1.', '•', '2024', 'NASA', 'internationalisation']) {
      expect([t, isEligible(t)]).toEqual([t, false]);
    }
    expect(isEligible('market', { heading: true })).toBe(false);
    expect(isEligible('market', { label: true })).toBe(false);
    expect(isEligible('market', { underline: true })).toBe(false);
  });

  it('never corrects headings, Q1/Ans labels, list numbers or underlined words', () => {
    const headings = ['1. Advantages of the International Market', '2. Disadvantages of the International Market'];
    const formatting = {
      ...emptyFormatting(),
      headings: headings.map(h => ({ start: TEXT.indexOf(h), end: TEXT.indexOf(h) + h.length, underline: true })),
    };
    for (let s = 0; s < 150; s++) {
      for (const c of layout(TEXT, { seed: `doc-${s}`, formatting }).corrections) {
        const inHeading = formatting.headings.some(h => c.start >= h.start && c.end <= h.end);
        expect(inHeading).toBe(false);
        expect(['Q1.', 'Ans:', '1.', '2.', '3.', '4.']).not.toContain(c.word);
      }
    }
  });

  it('plans each kind with sensible details', () => {
    const always = { ...CORRECTION_SETTINGS, rate: 1, dotRate: 0 };
    const seen = {};
    for (let s = 0; s < 200; s++) {
      const c = planCorrection(`k${s}`, 'because#0', 'because', {}, always);
      seen[c.kind] = c;
      if (c.kind === 'letter-fix') {
        expect(c.index).toBeGreaterThan(0);
        expect(c.wrong).not.toBe('because'[c.index]);
      }
      if (c.kind === 'strike') {
        expect(c.count).toBeGreaterThanOrEqual(1);
        expect(c.count).toBeLessThanOrEqual(2);
      }
      if (c.kind === 'crossed') {
        // A misspelling or an abandoned start — never the word itself.
        expect(c.attempt).not.toBe('because');
        expect(c.attempt.length).toBeGreaterThanOrEqual(2);
      }
    }
    expect(Object.keys(seen).sort()).toEqual(['crossed', 'letter-fix', 'overwrite', 'strike']);
  });

  it('misspells by swapping two neighbouring letters', () => {
    const r = createRandom(4);
    for (const w of ['market', 'because', 'slips', 'international']) {
      const typo = misspell(w, r);
      expect(typo).not.toBe(w);
      expect([...typo].sort().join('')).toBe([...w].sort().join(''));
    }
  });
});

// --- Determinism and anchoring ---------------------------------------------

describe('anchoring to text', () => {
  it('is identical every time the document is laid out', () => {
    expect(layout(TEXT).corrections).toEqual(layout(TEXT).corrections);
    expect(draw(TEXT).drawn).toEqual(draw(TEXT).drawn);
  });

  it('anchors each correction to its word as a text range', () => {
    const cs = layout(TEXT).corrections;
    expect(cs.length).toBeGreaterThan(0);
    for (const c of cs) {
      expect(TEXT.slice(c.start, c.end)).toBe(c.word);
      // Anchor: the word between its neighbours.
      expect(c.id.split(' ')[1]).toBe(c.word);
    }
  });

  it('keeps every correction when text is added elsewhere', () => {
    const before = layout(TEXT).corrections;
    const insert = 'Note: this answer was written in class. ';
    const edited = insert + TEXT;
    const after = layout(edited).corrections;
    // Same words, same corrections — only their ranges moved.
    expect(signature(after.filter(c => before.some(b => b.id === c.id)))).toEqual(signature(before));
    for (const c of before) {
      const moved = after.find(a => a.id === c.id);
      expect(moved.start).toBe(c.start + insert.length);
    }
  });

  it('removes a correction when its word is deleted or changed', () => {
    const before = layout(TEXT).corrections;
    const target = before.find(c => c.kind !== 'dot');
    const deleted = TEXT.slice(0, target.start) + TEXT.slice(target.end + 1);
    const changed = `${TEXT.slice(0, target.start)}zzzz${TEXT.slice(target.end)}`;
    const gone = list => list.find(c => c.word === target.word && Math.abs(c.start - target.start) < 2);
    expect(gone(layout(deleted).corrections)).toBeUndefined();
    expect(gone(layout(changed).corrections)).toBeUndefined();
    // The rest stay (all but the target's direct neighbours).
    const others = before.filter(c => Math.abs(c.start - target.start) > 40);
    expect(signature(layout(deleted).corrections).filter(s => others.some(o => s.startsWith(`${o.id}:`)))).toEqual(
      signature(others),
    );
  });

  it('never changes the typed text', () => {
    const l = layout(TEXT);
    const typed = l.paragraphs.flatMap(p => p.words.map(w => w.text)).join(' ');
    expect(typed).toBe(TEXT.split(/\s+/).filter(Boolean).join(' '));
  });

  it('differs between documents, but not when a page is split or renamed', () => {
    expect(signature(layout(TEXT, { seed: 'other' }).corrections)).not.toEqual(signature(layout(TEXT).corrections));
    // Same document, text now on another page: same corrections.
    expect(signature(layout(TEXT, { pageId: 'page-2' }).corrections)).toEqual(
      signature(layout(TEXT).corrections),
    );
  });
});

// --- Geometry ---------------------------------------------------------------------

describe('geometry', () => {
  const { layout: l, strokes } = draw(TEXT);
  const byKind = kind => l.corrections.find(c => c.kind === kind);
  const unit = strokes.find(s => s.unit).unit;

  it('crosses out an attempt with pen strokes, then writes the word after it', () => {
    const c = byKind('crossed');
    const strike = strokes.filter(s => s.at === c.start && s.pass === 'strike');
    const attempt = strokes.filter(s => s.at === c.start && s.pass === 'attempt');
    const word = strokes.filter(s => s.at === c.start && s.pass === 'main');
    expect(strike.length).toBeGreaterThanOrEqual(1);
    expect(attempt.length).toBeGreaterThan(0);
    const xs = list => list.flatMap(s => s.xs);
    // The strike covers the attempt, overshooting a little …
    expect(Math.min(...xs(strike))).toBeLessThan(Math.min(...xs(attempt)) + unit * 0.05);
    expect(Math.max(...xs(strike))).toBeGreaterThan(Math.max(...xs(attempt)) - unit * 0.05);
    // … and the word is written after it.
    expect(Math.min(...xs(word))).toBeGreaterThan(Math.max(...xs(attempt)));
    for (const s of strike) {
      // A pen stroke: darker ink, varying pressure, never a ruler line.
      expect(s.tone).toBe('dark');
      expect(Math.max(...s.pressure) - Math.min(...s.pressure)).toBeGreaterThan(0.1);
      const n = s.xs.length;
      const dx = s.xs[n - 1] - s.xs[0];
      const dy = s.ys[n - 1] - s.ys[0];
      const len = Math.hypot(dx, dy);
      const off = s.xs.map((x, i) => Math.abs((x - s.xs[0]) * dy - (s.ys[i] - s.ys[0]) * dx) / len);
      expect(Math.max(...off)).toBeGreaterThan(0.05);
      // Through the letters, not above or below them.
      const midY = mean(s.ys);
      const baseY = mean(word.map(w => Math.max(...w.ys)));
      expect(midY).toBeLessThan(baseY);
      expect(midY).toBeGreaterThan(baseY - unit * 1.3);
    }
  });

  it('strikes one or two letters with a short heavy stroke', () => {
    const c = byKind('strike');
    const strike = strokes.filter(s => s.at === c.start && s.pass === 'strike');
    const word = strokes.filter(s => s.at === c.start && s.pass === 'main');
    const wordWidth = Math.max(...word.flatMap(s => s.xs)) - Math.min(...word.flatMap(s => s.xs));
    for (const s of strike) {
      const span = Math.max(...s.xs) - Math.min(...s.xs);
      expect(span).toBeLessThan(wordWidth * 0.6);
      expect(s.tone).toBe('dark');
      expect(Math.max(...s.halfWidth) * 2).toBeGreaterThan(s.base * 0.8);
    }
  });

  it('overwrites a word with a second, slightly offset, darker pass', () => {
    const c = byKind('overwrite');
    const first = strokes.filter(s => s.at === c.start && s.pass === 'main');
    const second = strokes.filter(s => s.at === c.start && s.pass === 'fix');
    // Part of the word (2–4 letters) is gone over again.
    expect(second.length).toBeGreaterThan(0);
    expect(second.length).toBeLessThan(first.length + 1);
    const letters = new Set(second.map(s => s.char));
    expect(letters.size).toBeGreaterThanOrEqual(1);
    expect(letters.size).toBeLessThanOrEqual(4);
    [...letters].forEach(ch => expect(c.word).toContain(ch));
    second.forEach(s => expect(s.tone).toBe('dark'));
    first.forEach(s => expect(s.tone).toBeUndefined());
    // Not the same path again: offset, and reshaped.
    const pairs = second.map(s => [first.find(f => f.char === s.char && f.stroke === s.stroke), s]);
    const shift = pairs.map(([f, s]) => Math.hypot(s.xs[0] - f.xs[0], s.ys[0] - f.ys[0]));
    expect(mean(shift)).toBeGreaterThan(unit * 0.02);
    expect(Math.max(...shift)).toBeLessThan(unit * 0.35);
    const shape = s => s.xs.map((x, i) => [x - s.xs[0], s.ys[i] - s.ys[0]]);
    expect(shape(pairs[0][1])).not.toEqual(shape(pairs[0][0]));
  });

  it('corrects one letter: a light slip under the right letter, darker', () => {
    const c = byKind('letter-fix');
    const main = strokes.filter(s => s.at === c.start && s.pass === 'main');
    const fix = strokes.filter(s => s.at === c.start && s.pass === 'fix');
    // The slip is written in the main pass; the right letter only once more.
    expect(main.some(s => s.char === c.wrong)).toBe(true);
    expect(new Set(fix.map(s => s.char))).toEqual(new Set([c.word[c.index]]));
    fix.forEach(s => expect(s.tone).toBe('dark'));
  });

  it('keeps corrections close to their word and the page calm', () => {
    const { drawn } = draw(TEXT);
    const dark = drawn.buckets.filter(b => b.tone === 'dark');
    const normal = drawn.buckets.filter(b => !b.tone && b.key !== 'core');
    expect(dark.length).toBeGreaterThan(0);
    const size = list => list.reduce((t, b) => t + b.d.length, 0);
    // Corrected ink is a small part of the page.
    expect(size(dark)).toBeLessThan(size(normal) * 0.08);
  });

  it('draws corrected ink in a slightly deeper shade of the pen', () => {
    expect(inkTone(BLUE, 'dark')).not.toBe(BLUE);
    expect(inkTone(BLUE)).toBe(BLUE);
    const lum = hex => {
      const v = parseInt(hex.slice(1), 16);
      return ((v >> 16) & 255) + ((v >> 8) & 255) + (v & 255); // eslint-disable-line no-bitwise
    };
    expect(lum(DARK)).toBeLessThan(lum(BLUE));
    expect(lum(DARK)).toBeGreaterThan(lum(BLUE) * 0.6);
  });
});

// --- Pages, persistence, export, thumbnails ---------------------------------

function paginate(doc, pageType = 'lined') {
  const metrics = getPageMetrics({ pageType });
  const rowHeight = rowHeightFor(getPageType(pageType), metrics, style());
  return {
    ...paginateDocument({
      content: doc.content,
      formatting: doc.formatting,
      pageIds: doc.pageIds,
      style: style(),
      metrics,
      rowHeight,
      seed: doc.id,
      corrections: doc.naturalCorrections,
    }),
    metrics,
    rowHeight,
  };
}
const docOf = (extra = {}) => ({
  ...createDocument(),
  id: SEED,
  content: TEXT,
  ...extra,
});

describe('pages', () => {
  it('keeps each correction on the page that shows its word', () => {
    const doc = docOf();
    const paged = paginate(doc);
    expect(paged.pages.length).toBeGreaterThan(1);
    const all = paged.pages.flatMap(p => p.corrections);
    expect(signature(all)).toEqual(signature(layout(TEXT, { pageId: 'page-1' }).corrections));
    for (const p of paged.pages) {
      for (const c of p.corrections) {
        expect(c.start).toBeGreaterThanOrEqual(p.start);
        expect(c.start).toBeLessThan(p.end);
      }
    }
  });

  it('does not change when pages reflow (another paper ruling)', () => {
    const doc = docOf();
    const lined = paginate(doc, 'lined').pages.flatMap(p => p.corrections);
    const narrow = paginate(doc, 'narrow').pages.flatMap(p => p.corrections);
    expect(signature(narrow)).toEqual(signature(lined));
  });

  it('follows its page when pages are reordered', () => {
    const half = Math.floor(WORDS.length / 2);
    const content = `${WORDS.slice(0, half).join(' ')}${PAGE_BREAK}${WORDS.slice(half).join(' ')}`;
    const doc = docOf({ content, pageIds: ['sheet-a', 'sheet-b'] });
    const before = paginate(doc).pages.flatMap(p => p.corrections);
    const moved = movePage(doc, paginate(doc).pages, 0, 1);
    const after = paginate({ ...doc, ...moved.doc }).pages.flatMap(p => p.corrections);
    // Moving the first page splits its sheet (it continues on a second
    // page); every correction still follows its word.
    expect(signature(after)).toEqual(signature(before));
    expect(after.length).toBeGreaterThan(0);
    // And each is listed on the page that now shows it.
    const paged = paginate({ ...doc, ...moved.doc });
    paged.pages.forEach(p =>
      p.corrections.forEach(c => {
        expect(c.start).toBeGreaterThanOrEqual(p.start);
        expect(c.start).toBeLessThan(p.end);
        expect(moved.doc.content.slice(c.start, c.end)).toBe(c.word);
      }),
    );
  });
});

describe('documents', () => {
  it('is on for new documents and off for documents saved before it existed', () => {
    expect(createDocument().naturalCorrections).toBe(true);
    expect(normalizeDocument({ content: 'Old' }).naturalCorrections).toBe(false);
    expect(createDocument({ naturalCorrections: false }).naturalCorrections).toBe(false);
  });

  it('saves the setting and reproduces the same corrections after reopening', async () => {
    const doc = docOf();
    const saved = await saveDocument(doc);
    const reopened = await getDocument(saved.id);
    expect(reopened.naturalCorrections).toBe(true);
    expect(reopened.content).toBe(TEXT);
    const a = paginate(doc).pages.flatMap(p => p.corrections);
    const b = paginate(reopened).pages.flatMap(p => p.corrections);
    expect(b).toEqual(a);
  });
});

describe('rendering surfaces', () => {
  const darkPaths = r => handwritingPaths(r).filter(n => n.props.fill === DARK || n.props.stroke === DARK);

  it('editor: shows corrections, and the switch turns them off without touching the text or undo', async () => {
    const doc = docOf();
    const r = await render(<EditorScreen initialDocument={doc} onClose={jest.fn()} />);
    expect(darkPaths(r).length).toBeGreaterThan(0);
    const undo = () => byTestId(r, 'toolbar-undo', 'accessibilityState').props.accessibilityState.disabled;
    const undoBefore = undo();
    await act(async () => {
      byTestId(r, 'menu-button', 'onPress').props.onPress();
    });
    await act(async () => {
      byTestId(r, 'natural-corrections-switch', 'onValueChange').props.onValueChange(false);
    });
    expect(darkPaths(r)).toHaveLength(0);
    expect(renderedHandwriting(r)).toContain('The international market refers');
    // Automatic corrections are not edits: nothing new to undo.
    expect(undo()).toBe(undoBefore);
  });

  it('export draws the same corrections as the editor', async () => {
    const doc = docOf();
    const paged = paginate(doc);
    const captured = [];
    let mounted = null;
    setNativeExporter({
      getExportDirectory: jest.fn(async () => '/cache/exports'),
      beginPdf: jest.fn(async () => 'job'),
      addPdfPage: jest.fn(async () => {
        captured.push(darkPaths(mounted).length);
      }),
      finishPdf: jest.fn(async () => '/cache/exports/x.pdf'),
      cancelPdf: jest.fn(),
      captureView: jest.fn(async (tag, p) => p),
      share: jest.fn(async () => true),
    });
    let finished = null;
    mounted = await render(
      <ExportRenderer
        plan={buildExportPlan({ title: 'T', format: 'pdf', pageCount: paged.pages.length })}
        document={doc}
        paged={paged}
        onProgress={() => {}}
        onFinish={o => (finished = o)}
        onError={() => {}}
      />,
    );
    for (let i = 0; i < 200 && !finished; i++) {
      await act(async () => {
        await new Promise(res => setTimeout(res, 10));
      });
    }
    expect(finished).toBeTruthy();
    // Pages with corrections export them; the rest stay clean.
    paged.pages.forEach((p, i) => {
      const real = p.corrections.length > 0;
      expect([i, captured[i] > 0]).toEqual([i, real]);
    });
  }, 30000);

  it('thumbnails show corrections with simplified (centre-line) strokes', async () => {
    const doc = docOf();
    const paged = paginate(doc);
    const page = paged.pages.find(p => p.corrections.length);
    const r = await render(
      <PaperPage
        document={doc}
        page={page}
        layout={paged.layout}
        metrics={paged.metrics}
        rowHeight={paged.rowHeight}
        width={120}
        quality="preview"
      />,
    );
    const dark = darkPaths(r);
    expect(dark.length).toBeGreaterThan(0);
    dark.forEach(n => expect(n.props.fill).toBe('none'));
  });

  it('HandwritingText takes the setting too', async () => {
    const on = await render(<HandwritingText text={TEXT} maxWidth={292} seed={SEED} corrections />);
    const off = await render(<HandwritingText text={TEXT} maxWidth={292} seed={SEED} />);
    expect(darkPaths(on).length).toBeGreaterThan(0);
    expect(darkPaths(off)).toHaveLength(0);
  });
});
