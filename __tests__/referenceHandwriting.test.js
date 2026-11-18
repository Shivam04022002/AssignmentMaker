/**
 * Phase 7: reference handwriting only.
 *
 * One handwriting profile (reference_student) drawn with custom stroke
 * glyphs — no fonts. Covers the profile, glyph lookup and fallback, subtle
 * deterministic variation, punctuation and numbers, headings, underlines,
 * assignment formatting, multi-page, old documents, export, freehand and
 * performance.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { clearAllMockStorages } from '@react-native-async-storage/async-storage';
import {
  DEFAULT_HANDWRITING_STYLE,
  LEGACY_STYLE_IDS,
  PREVIEW_SAMPLE,
  getHandwritingStyle,
  getHandwritingStyles,
  isHandwritingStyle,
  resetStyleOverrides,
  resolveStyleId,
  setStyleOverrides,
} from '../src/data/handwritingStyles';
import {
  getPageMetrics,
  getPageType,
  rowHeightFor,
} from '../src/data/paper';
import { getPenColor } from '../src/data/pens';
import HandwritingText, {
  baselineInRow,
} from '../src/components/HandwritingText';
import PaperPage from '../src/components/PaperPage';
import ExportRenderer from '../src/export/ExportRenderer';
import { buildExportPlan } from '../src/export/exportPlan';
import { setNativeExporter } from '../src/export/nativeExporter';
import {
  glyphVariant,
  pathPoints,
  renderLines,
} from '../src/handwriting/glyphRender';
import {
  FALLBACK_GLYPH,
  GLYPHS,
  LETTER_GAP,
  glyphAdvance,
  glyphFor,
  hasGlyph,
} from '../src/handwriting/glyphs';
import {
  REFERENCE_PROFILE,
  XH_EM,
} from '../src/handwriting/handwritingProfiles';
import { addPoint, finishStroke, strokeStyle } from '../src/ink/strokes';
import { createDocument, normalizeDocument } from '../src/models/document';
import EditorScreen from '../src/screens/EditorScreen';
import {
  getDocument,
  getStorageBackend,
  saveDocument,
  setStorageBackend,
} from '../src/storage/documentStorage';
import { emptyFormatting } from '../src/utils/formatting';
import { paginateDocument } from '../src/utils/pagination';
import { layoutHandwriting } from '../src/utils/textLayout';
import {
  act,
  handwritingPaths,
  inkColors,
  render,
  renderedHandwriting,
  restoreRealTimers,
} from './helpers/render';

const ROOT = path.join(__dirname, '..');
const profile = () => getHandwritingStyle(DEFAULT_HANDWRITING_STYLE);

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = LOWER.toUpperCase();
const DIGITS = '0123456789';
const PUNCTUATION = '.,?!:;\'"-–—()[]{}/\\%+=*&#@$_<>|';
const NOTATION = ['•', '→', '·', '°'];

/** Lays out and renders text on the default lined page. */
function draw(text, options = {}) {
  const style = options.style || profile();
  const pageType = options.pageType || 'lined';
  const metrics = getPageMetrics({ pageType });
  const rowHeight = rowHeightFor(getPageType(pageType), metrics, style);
  const layout = layoutHandwriting(text, style, {
    fontSize: metrics.fontSize,
    contentWidth: metrics.contentWidth,
    seed: options.seed || 'doc-ref',
    pageId: options.pageId,
    formatting: options.formatting,
    lineHeight: rowHeight,
  });
  const drawn = renderLines(layout.lines, {
    profile: style,
    layout,
    rowHeight,
    baselineInRow: baselineInRow(rowHeight, style, layout.fontSize),
    ink: { floor: 0.82, strength: 1 },
    debug: options.debug,
  });
  return { layout, drawn, metrics, rowHeight, strokes: options.debug };
}

/** Subpaths of a path string, each moved so it starts at the origin. */
function normalizedSubpaths(d) {
  return pathPoints(d).map(points => {
    const [x0, y0] = points[0];
    return points
      .map(([x, y]) => `${Math.round((x - x0) * 10)},${Math.round((y - y0) * 10)}`)
      .join(' ');
  });
}

/** All coordinates in every bucket path. */
const pathNumbers = drawn =>
  drawn.buckets.flatMap(b => pathPoints(b.d).flat(2));

const allPaths = drawn =>
  drawn.buckets.map(b => b.d).join('') +
  drawn.underlines.map(u => u.d).join('');

beforeEach(() => {
  clearAllMockStorages();
  setStorageBackend(null);
  setNativeExporter(null);
  resetStyleOverrides();
});

afterEach(() => restoreRealTimers(jest));

// --- Profile -------------------------------------------------------------------

describe('reference profile', () => {
  it('is the default handwriting (Lang1), alongside Lang2 and Lang3', () => {
    expect(getHandwritingStyles().map(s => s.id)).toEqual([
      'reference_student',
      'reference_student_lang2',
      'reference_student_lang3',
    ]);
    expect(DEFAULT_HANDWRITING_STYLE).toBe('reference_student');
    expect(profile().name).toBe('Reference Handwriting');
    expect(profile().glyphs).toBe(true);
  });

  it('carries the measured reference proportions', () => {
    const p = REFERENCE_PROFILE;
    // Reference 3 (print): x-height ≈ 0.33 of pitch, ascenders ≈ 1.75 x-heights,
    // stroke ≈ 0.17 x-height, upright, generous word gaps.
    expect(p.xHeightPerPitch).toBeGreaterThan(0.27);
    expect(p.xHeightPerPitch).toBeLessThan(0.36);
    expect(p.ascender).toBeCloseTo(1.75, 1);
    expect(p.strokeWidth).toBeGreaterThan(0.12);
    expect(p.strokeWidth).toBeLessThan(0.25);
    expect(Math.abs(p.slant)).toBeLessThanOrEqual(3);
    expect(p.wordGap).toBeGreaterThanOrEqual(1.6);
    expect(p.wordGap).toBeLessThanOrEqual(2.9);
    expect(p.glyphVariants).toBeGreaterThanOrEqual(2);
    expect(p.glyphVariants).toBeLessThanOrEqual(5);
  });

  it('has no font: nothing in the profile names a font family', () => {
    const p = profile();
    expect(p.fontFamily).toBeUndefined();
    expect(JSON.stringify(p)).not.toMatch(/\.ttf|fontFamily/i);
  });

  it('writes with the blue ballpoint #123A8C by default', () => {
    expect(getPenColor('blue')).toBe('#123A8C');
    expect(createDocument().pen).toBe('blue');
  });

  it('can be tuned in memory and reset (developer tuner)', () => {
    const before = profile().letterGap;
    setStyleOverrides('reference_student', { letterGap: before + 0.1 });
    expect(profile().letterGap).toBeCloseTo(before + 0.1);
    // Measurement follows the tuned gap, so line breaks match the drawing.
    expect(glyphAdvance('a', profile())).toBeCloseTo(
      glyphFor('a').w * profile().glyphWidth + before + 0.1,
    );
    resetStyleOverrides();
    expect(profile().letterGap).toBe(before);
  });
});

// --- Removed fonts -----------------------------------------------------------

describe('font removal', () => {
  it('bundles no handwriting font files or font licences', () => {
    const fontsDir = path.join(ROOT, 'assets/fonts');
    const fonts = fs.existsSync(fontsDir)
      ? fs.readdirSync(fontsDir).filter(f => /\.(ttf|otf)$/i.test(f))
      : [];
    expect(fonts).toEqual([]);
    expect(fs.existsSync(path.join(ROOT, 'assets/licenses'))).toBe(false);
  });

  it('registers no font assets with the native projects', () => {
    const config = require('../react-native.config.js');
    expect(config.assets || []).toEqual([]);
    const plist = path.join(ROOT, 'ios/HandWrite/Info.plist');
    if (fs.existsSync(plist)) {
      expect(fs.readFileSync(plist, 'utf8')).not.toMatch(/\.ttf/);
    }
    const androidFonts = path.join(ROOT, 'android/app/src/main/assets/fonts');
    const left = fs.existsSync(androidFonts)
      ? fs.readdirSync(androidFonts).filter(f => /\.(ttf|otf)$/i.test(f))
      : [];
    expect(left).toEqual([]);
  });

  it('removed the font catalogue, metrics and picker modules', () => {
    for (const file of [
      'src/data/fontMetrics.js',
      'src/data/styleCatalog.js',
      'src/data/handwritingPersonality.js',
      'src/data/realismPresets.js',
      'src/components/HandwritingStyleCard.js',
      'src/storage/preferencesStorage.js',
    ]) {
      expect(fs.existsSync(path.join(ROOT, file))).toBe(false);
    }
  });

  it('renders handwriting as SVG strokes, not Text', async () => {
    const r = await render(
      <HandwritingText text="Dear Sir, thank you." maxWidth={300} seed="x" />,
    );
    const container = r.root.findAll(
      n => n.props.testID === 'handwriting-text' && typeof n.type === 'string',
    )[0];
    expect(
      container.findAll(n => n.type === 'Text' || n.type === 'RCTText'),
    ).toHaveLength(0);
    expect(handwritingPaths(r).length).toBeGreaterThan(0);
  });
});

// --- Glyphs ------------------------------------------------------------------

describe('glyph lookup', () => {
  it('has a glyph for every letter, digit and common punctuation mark', () => {
    for (const ch of [...LOWER, ...UPPER, ...DIGITS, ...PUNCTUATION, ...NOTATION]) {
      expect([ch, hasGlyph(ch)]).toEqual([ch, true]);
    }
  });

  it('defines every glyph as finite cubic strokes inside the writing band', () => {
    for (const [ch, glyph] of Object.entries(GLYPHS)) {
      expect(glyph.w).toBeGreaterThan(0);
      expect(glyph.strokes.length).toBeGreaterThan(0);
      for (const pts of glyph.strokes) {
        // M x y, then C with 3 points per segment.
        expect([ch, (pts.length - 2) % 6]).toEqual([ch, 0]);
        pts.forEach((v, i) => {
          expect(Number.isFinite(v)).toBe(true);
          if (i % 2) {
            // y: descender (−0.72) … ascender (1.72), with a little slack.
            expect([ch, v >= -0.95 && v <= 1.95]).toEqual([ch, true]);
          } else {
            expect([ch, v >= -0.25 && v <= glyph.w + 0.25]).toEqual([ch, true]);
          }
        });
      }
    }
  });

  it('gives letters reference proportions: ascenders, x-height, descenders', () => {
    const top = ch => Math.max(...glyphFor(ch).strokes.flat().filter((_, i) => i % 2));
    const bottom = ch =>
      Math.min(...glyphFor(ch).strokes.flat().filter((_, i) => i % 2));
    for (const ch of 'aceomnrsuvwxz') {
      expect([ch, top(ch) < 1.2]).toEqual([ch, true]);
    }
    for (const ch of 'bdhkl') {
      expect([ch, top(ch) > 1.5]).toEqual([ch, true]);
    }
    for (const ch of 'gjpqy') {
      expect([ch, bottom(ch) < -0.45]).toEqual([ch, true]);
    }
    for (const ch of 'ABHT') {
      expect([ch, top(ch) > 1.4 && top(ch) < 1.7]).toEqual([ch, true]);
    }
  });

  it('writes accented letters with their base letter', () => {
    expect(glyphFor('é')).toBe(glyphFor('e'));
    expect(glyphFor('Ü')).toBe(glyphFor('U'));
    expect(glyphFor('ñ')).toBe(glyphFor('n'));
  });

  it('falls back to a neutral mark for characters it cannot write', () => {
    expect(glyphFor('漢')).toBe(FALLBACK_GLYPH);
    expect(glyphFor('☃')).toBe(FALLBACK_GLYPH);
    expect(hasGlyph('漢')).toBe(false);
    const { layout, drawn } = draw('Hello 漢字 ☃ world');
    expect(layout.lines.length).toBe(1);
    expect(pathNumbers(drawn).every(Number.isFinite)).toBe(true);
  });

  it('measures exactly what it draws (advance = body + letter gap)', () => {
    const p = profile();
    expect(glyphAdvance('m', p)).toBeCloseTo(glyphFor('m').w * p.glyphWidth + p.letterGap);
    expect(glyphAdvance('m')).toBeCloseTo(glyphFor('m').w + LETTER_GAP);
    expect(glyphAdvance('m', p)).toBeGreaterThan(glyphAdvance('i', p));
  });
});

// --- Variation ---------------------------------------------------------------

describe('variation', () => {
  it('keeps each letter variant close to its base shape', () => {
    const amount = profile().variantAmount;
    for (const ch of 'aegkmsAQ5?') {
      const base = glyphFor(ch).strokes;
      for (let v = 1; v < profile().glyphVariants; v++) {
        const variant = glyphVariant(ch, v, amount);
        expect(variant).not.toEqual(base);
        variant.forEach((pts, si) =>
          pts.forEach((value, i) => {
            const delta = Math.abs(value - base[si][i]);
            // Smooth offset (≤ amount) + up to ±2.5 % width.
            expect(delta).toBeLessThan(amount * 1.05 + 0.025 * glyphFor(ch).w + 1e-9);
          }),
        );
      }
    }
  });

  it('draws repeated letters with a few different variants, not copies', () => {
    const { drawn } = draw('oooooooooooooooooooo');
    const shapes = new Set(drawn.buckets.flatMap(b => normalizedSubpaths(b.d)));
    expect(shapes.size).toBeGreaterThanOrEqual(4);
  });

  it('draws the same word differently each time it appears', () => {
    const { layout } = draw('letter letter letter letter');
    const words = layout.lines[0].words;
    const sig = w =>
      JSON.stringify([w.shape.rotate, w.shape.translateY, w.shape.scale, w.drift]);
    expect(new Set(words.map(sig)).size).toBe(words.length);
  });

  it('keeps variation subtle: word and letter jitter stay small', () => {
    const { layout } = draw(
      'The international market refers to the exchange of goods, services and resources across national borders.',
    );
    for (const line of layout.lines) {
      for (const w of line.words) {
        expect(Math.abs(w.shape.rotate)).toBeLessThanOrEqual(1.2);
        expect(Math.abs(w.shape.scale - 1)).toBeLessThanOrEqual(0.04);
        for (const c of w.shape.chars || []) {
          expect(Math.abs(c.rotate || 0)).toBeLessThanOrEqual(3);
          expect(Math.abs((c.scale || 1) - 1)).toBeLessThanOrEqual(0.05);
        }
      }
    }
  });

  it('is deterministic: same document and page draw identical strokes', () => {
    const text = 'Q1. Same text, same page.\nAns: 42 (a) → yes';
    expect(allPaths(draw(text).drawn)).toBe(allPaths(draw(text).drawn));
    expect(allPaths(draw(text, { pageId: 'p2' }).drawn)).not.toBe(
      allPaths(draw(text).drawn),
    );
  });

  it('never calls Math.random while laying out or drawing', () => {
    const spy = jest.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random used in rendering');
    });
    try {
      draw('Random? Never. 1. (a) • → 100%', { seed: 'no-random' });
    } finally {
      spy.mockRestore();
    }
  });
});

// --- Punctuation, numbers, formatting ---------------------------------------

describe('punctuation and numbers', () => {
  it('writes digits, symbols and punctuation as strokes', () => {
    const { layout, drawn } = draw('0123456789 , . ? ! : ; ( ) % + = / — →');
    expect(layout.lines.length).toBeGreaterThan(0);
    expect(drawn.buckets.length).toBeGreaterThan(0);
    expect(pathNumbers(drawn).every(Number.isFinite)).toBe(true);
  });

  it('keeps full stops and commas on the baseline, apostrophes up high', () => {
    const top = ch => Math.max(...glyphFor(ch).strokes.flat().filter((_, i) => i % 2));
    expect(top('.')).toBeLessThan(0.2);
    expect(top(',')).toBeLessThan(0.3);
    expect(top("'")).toBeGreaterThan(1.2);
    expect(top('-')).toBeLessThan(0.8);
  });
});

describe('assignment formatting', () => {
  it('detects Q1., Ans:, 1., (a) and • labels and hangs their lines', () => {
    const text = [
      'Q1. What is the international market? Write its advantages and its disadvantages in detail.',
      'Ans: The international market refers to the exchange of goods across borders.',
      '1. Introduction to the market and its many different kinds of trade',
      '(a) First point that is long enough to wrap onto a second line here',
      '• Bullet point that is long enough to wrap onto a second line as well',
    ].join('\n');
    const { layout } = draw(text);
    expect(layout.paragraphs.map(p => p.label)).toEqual([
      'question',
      'answer',
      'number',
      'number',
      'bullet',
    ]);
    for (const p of layout.paragraphs) {
      expect(p.lines.length).toBeGreaterThan(1);
      expect(p.hang).toBeGreaterThan(0);
      expect(p.lines[1].words[0].x).toBeCloseTo(p.hang, 0);
    }
  });

  it('draws labels a little firmer than body text, with the same glyphs', () => {
    const { strokes } = draw('Q1. word', { debug: [] });
    const base = word => strokes.find(s => s.word === word).base;
    expect(base('Q1.')).toBeGreaterThan(base('word'));
  });
});

describe('headings and underlines', () => {
  const text = 'Introduction to the Market\nBody text below the heading.';
  const heading = {
    ...emptyFormatting(),
    headings: [{ start: 0, end: 26, underline: true }],
  };

  it('writes headings slightly larger and firmer with the same glyphs', () => {
    const plain = draw(text);
    const head = draw(text, { formatting: heading });
    expect(head.layout.headingFontSize).toBeGreaterThan(head.layout.fontSize);
    expect(head.layout.headingFontSize / head.layout.fontSize).toBeLessThan(1.3);
    // Same glyph strokes, drawn with a firmer (wider) pen.
    const base = d => d.strokes.find(s => s.word === 'Introduction').base;
    expect(base(draw(text, { formatting: heading, debug: [] }))).toBeGreaterThan(
      base(draw(text, { debug: [] })),
    );
    expect(plain.drawn.buckets.length).toBeGreaterThan(0);
  });

  it('draws underlines as hand-drawn filled outlines under the words', () => {
    const { drawn, layout, rowHeight } = draw(text, { formatting: heading });
    expect(drawn.underlines).toHaveLength(1);
    const d = drawn.underlines[0].d;
    expect(d).toMatch(/^M.*Z$/);
    const nums = d.replace(/[MLZ]/g, ' ').trim().split(/\s+/).map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    const words = layout.lines[0].words;
    const last = words[words.length - 1];
    // Spans the heading text (a hair early, a little overshoot)…
    expect(Math.min(...xs)).toBeLessThan(words[0].x + 6);
    expect(Math.max(...xs)).toBeGreaterThan(last.x + last.shape.width - 6);
    // …just below the baseline of the first row, not a ruler line.
    expect(Math.min(...ys)).toBeGreaterThan(rowHeight * 0.8);
    expect(Math.max(...ys)).toBeLessThan(rowHeight * 1.4);
    expect(new Set(ys.map(y => Math.round(y * 10))).size).toBeGreaterThan(2);
  });

  it('draws plain underline ranges too', () => {
    const { drawn } = draw('Underline me please', {
      formatting: { ...emptyFormatting(), underlines: [{ start: 0, end: 9 }] },
    });
    expect(drawn.underlines).toHaveLength(1);
  });
});

// --- Pages, compatibility, export, freehand ---------------------------------

function paginate(doc) {
  const style = getHandwritingStyle(doc.handwritingStyle);
  const metrics = getPageMetrics({ pageType: doc.pageType });
  const rowHeight = rowHeightFor(getPageType(doc.pageType), metrics, style);
  return {
    ...paginateDocument({
      content: doc.content,
      formatting: doc.formatting,
      pageIds: doc.pageIds,
      style,
      metrics,
      rowHeight,
      seed: doc.id,
    }),
    metrics,
    rowHeight,
  };
}

const PARA =
  'Working capital management refers to the strategic process of managing short-term assets. ';

describe('multi-page', () => {
  it('paginates long reference-handwriting documents without losing text', () => {
    const doc = { ...createDocument(), content: PARA.repeat(30).trim() };
    const paged = paginate(doc);
    expect(paged.pages.length).toBeGreaterThan(1);
    expect(paged.pages.map(p => p.text).join('')).toBe(doc.content);
    for (const page of paged.pages) {
      expect(page.lines.length).toBeLessThanOrEqual(
        Math.floor(
          (paged.metrics.minHeight -
            paged.metrics.padding.top -
            paged.metrics.padding.bottom) /
            paged.rowHeight,
        ),
      );
    }
  });

  it('fits roughly reference density: 5–10 words per full line', () => {
    const { layout } = draw(PARA.repeat(6));
    const full = layout.lines.slice(0, -1).map(l => l.words.length);
    const avg = full.reduce((a, b) => a + b, 0) / full.length;
    expect(avg).toBeGreaterThanOrEqual(5);
    expect(avg).toBeLessThanOrEqual(10);
  });
});

describe('old documents', () => {
  it.each(LEGACY_STYLE_IDS)('opens a document saved with "%s"', async id => {
    const legacy = {
      id: `old-${id}`,
      title: 'Old',
      pageType: 'lined',
      pen: 'blue',
      handwritingStyle: id,
      content: 'Written long ago.',
      createdAt: 1000,
      updatedAt: 2000,
    };
    const store = getStorageBackend();
    await store.setItem(`document:${legacy.id}`, JSON.stringify(legacy));
    await store.setItem('documents:index', JSON.stringify([legacy.id]));

    expect(isHandwritingStyle(id)).toBe(true);
    expect(resolveStyleId(id)).toBe('reference_student');
    // The stored id is kept, never rewritten.
    expect((await getDocument(legacy.id)).handwritingStyle).toBe(id);
    const r = await render(
      <EditorScreen documentId={legacy.id} onClose={jest.fn()} />,
    );
    await act(async () => {});
    expect(renderedHandwriting(r)).toBe('Written long ago.');
    expect(handwritingPaths(r).length).toBeGreaterThan(0);
    expect(inkColors(r)).toEqual(new Set(['#123A8C']));
  });

  it('draws an old document exactly like a new one', () => {
    const text = 'Same handwriting for everyone.';
    const old = draw(text, { style: getHandwritingStyle('cursive') });
    const now = draw(text, { style: getHandwritingStyle('reference_student') });
    expect(allPaths(old.drawn)).toBe(allPaths(now.drawn));
  });

  it('round-trips old ids through save and normalize', async () => {
    const saved = await saveDocument(
      createDocument({ handwritingStyle: 'school-notebook' }),
    );
    expect((await getDocument(saved.id)).handwritingStyle).toBe(
      'school-notebook',
    );
    expect(normalizeDocument({ handwritingStyle: 'nope' }).handwritingStyle).toBe(
      'reference_student',
    );
  });
});

describe('export', () => {
  it('exports pages drawn with the reference handwriting', async () => {
    const calls = [];
    let mounted = null;
    setNativeExporter({
      getExportDirectory: jest.fn(async () => '/cache/exports'),
      beginPdf: jest.fn(async () => 'job'),
      addPdfPage: jest.fn(async () => {
        calls.push(handwritingPaths(mounted).length);
      }),
      finishPdf: jest.fn(async () => '/cache/exports/x/HandWrite_Ref.pdf'),
      cancelPdf: jest.fn(),
      captureView: jest.fn(async (tag, p) => p),
      share: jest.fn(async () => true),
    });
    const doc = {
      ...createDocument(),
      title: 'Ref',
      content: `Q1. Export test\nAns: ${PARA.repeat(20)}`,
    };
    const paged = paginate(doc);
    let finished = null;
    let failed = null;
    mounted = await render(
      <ExportRenderer
        plan={buildExportPlan({
          title: 'Ref',
          format: 'pdf',
          pageCount: paged.pages.length,
        })}
        document={doc}
        paged={paged}
        onProgress={() => {}}
        onFinish={o => (finished = o)}
        onError={e => (failed = e)}
      />,
    );
    for (let i = 0; i < 200 && !finished && !failed; i++) {
      await act(async () => {
        await new Promise(res => setTimeout(res, 10));
      });
    }
    expect(failed).toBeNull();
    expect(finished).toEqual(['/cache/exports/x/HandWrite_Ref.pdf']);
    expect(calls).toHaveLength(paged.pages.length);
    calls.forEach(count => expect(count).toBeGreaterThan(0));
  }, 30000);
});

describe('freehand', () => {
  it('draws freehand ink on the same page as the reference handwriting', async () => {
    const buffer = { points: [], pressure: null };
    for (let i = 0; i < 20; i++) {
      addPoint(buffer, 60 + i * 4, 120 + Math.sin(i) * 3);
    }
    const stroke = finishStroke(buffer, strokeStyle('pen', { color: '#C0392B' }), 's1');
    const doc = { ...createDocument(), content: 'Q1. Freehand\nAns: ticked' };
    const paged = paginate(doc);
    const r = await render(
      <PaperPage
        document={doc}
        page={paged.pages[0]}
        layout={paged.layout}
        metrics={paged.metrics}
        rowHeight={paged.rowHeight}
        width={360}
        ink={[stroke]}
      />,
    );
    expect(r.root.findAll(n => n.props.testID === 'ink-pen').length).toBeGreaterThan(0);
    expect(handwritingPaths(r).length).toBeGreaterThan(0);
    expect(renderedHandwriting(r)).toBe('Q1. Freehand\nAns: ticked');
  });
});

// --- Performance -------------------------------------------------------------

describe('performance', () => {
  const sample = n => {
    const base =
      'Q1. Working capital management refers to the process (a) of managing 1,234 assets → 75%. ';
    return base.repeat(Math.ceil(n / base.length)).slice(0, n);
  };

  it.each([500, 1000, 2500, 5000])(
    'lays out and draws %i characters as a handful of paths',
    n => {
      const started = Date.now();
      const { drawn, layout } = draw(sample(n));
      const elapsed = Date.now() - started;
      expect(layout.lines.length).toBeGreaterThan(0);
      // Ink buckets: a few stroke widths × ink strengths — not one per letter.
      expect(drawn.buckets.length).toBeLessThanOrEqual(18);
      // Coarse guard (suites run in parallel); plain Node is well under 1 s.
      expect(elapsed).toBeLessThan(n <= 1000 ? 6000 : 20000);
    },
  );

  it('renders 2,500 characters without a component per character', async () => {
    const r = await render(
      <HandwritingText text={sample(2500)} maxWidth={292} seed="perf" />,
    );
    const paths = handwritingPaths(r);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.length).toBeLessThanOrEqual(18);
    expect(r.root.findAll(n => n.type === 'Text').length).toBe(0);
  });

  it('reuses unchanged words when the text is edited', () => {
    const style = profile();
    const metrics = getPageMetrics({ pageType: 'lined' });
    const opts = {
      fontSize: metrics.fontSize,
      contentWidth: metrics.contentWidth,
      seed: 'edit',
    };
    const first = layoutHandwriting(sample(1000), style, opts);
    const second = layoutHandwriting(`${sample(1000)} more`, style, {
      ...opts,
      cache: first.cache,
    });
    expect(second.lines[0].words[0].shape).toBe(first.lines[0].words[0].shape);
  });
});

describe('preview', () => {
  it('previews the handwriting with capitals, digits and punctuation', () => {
    expect(PREVIEW_SAMPLE).toMatch(/[A-Z]/);
    expect(PREVIEW_SAMPLE).toMatch(/\d/);
    expect(PREVIEW_SAMPLE).toMatch(/[,.!]/);
    expect(XH_EM).toBeGreaterThan(0);
  });
});
