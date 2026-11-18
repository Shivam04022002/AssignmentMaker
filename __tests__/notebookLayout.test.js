/**
 * Notebook layout: Lang3 writes ON the ruled lines, one text line per rule,
 * on notebook-pitch ruling with a realistic printable width — measured from
 * the Lang3 reference. Lang1 and Lang2 keep their layout and glyphs.
 */
import React from 'react';
import { clearAllMockStorages } from '@react-native-async-storage/async-storage';
import { getHandwritingStyle } from '../src/data/handwritingStyles';
import { PAGE, getPageMetrics, getPageType, getPaperAppearance, rowHeightFor } from '../src/data/paper';
import { baselineInRow } from '../src/components/HandwritingText';
import PaperPage from '../src/components/PaperPage';
import ExportRenderer from '../src/export/ExportRenderer';
import { PDF_PAGE, buildExportPlan } from '../src/export/exportPlan';
import { setNativeExporter } from '../src/export/nativeExporter';
import { renderLines } from '../src/handwriting/glyphRender';
import { GLYPHS, GLYPHS_LANG2 } from '../src/handwriting/glyphs';
import { LANG3_PROFILE_ID, XH_EM } from '../src/handwriting/handwritingProfiles';
import { createDocument } from '../src/models/document';
import EditorScreen from '../src/screens/EditorScreen';
import { setStorageBackend } from '../src/storage/documentStorage';
import { applySpanFormat, boundariesIn, emptyFormatting, setWordGap } from '../src/utils/formatting';
import { PAGE_BREAK, paginateDocument, splitSheets } from '../src/utils/pagination';
import { layoutHandwriting } from '../src/utils/textLayout';
import { hashString } from '../src/utils/variation';
import { act, render, restoreRealTimers } from './helpers/render';

const L1 = getHandwritingStyle('reference_student');
const L2 = getHandwritingStyle('reference_student_lang2');
const L3 = getHandwritingStyle(LANG3_PROFILE_ID);
const type = getPageType('lined');
const M = getPageMetrics({ pageType: 'lined', style: L3 });
const ROW = rowHeightFor(type, M, L3);
const PARA1 = '    The international market refers to the exchange of goods, services, and resources across national borders. Unlike domestic marketing, which occurs within the confines of a single country, international marketing involves navigating diverse legal systems, cultural nuances, economic climates, and consumer behaviors.';
const PARA2 = '    In a globalized world, the international market is not just an option for growth—it is often a necessity for survival. It allows companies to tap into a much larger customer base (the global population) rather than being limited by the saturation or economic downturns of a single home market. It encompasses various modes of entry, including exporting, licensing, franchising, joint ventures, and foreign direct investment (FDI).';
const REF_LINES = [
  'The international market refers to the exchange of goods,',
  'services, and resources across national borders. Unlike',
  'domestic marketing, which occurs within the confines of a',
  'single country, international marketing involves navigating',
  'diverse legal systems, cultural nuances, economic climates,',
  'and consumer behaviors.',
  'In a globalized world, the international market is not',
  'just an option for growth—it is often a necessity for',
  'survival. It allows companies to tap into a much larger',
  'customer base (the global population) rather than being',
  'limited by the saturation or economic downturns of a',
  'single home market. It encompasses various modes of',
  'entry, including exporting, licensing, franchising, joint',
  'ventures, and foreign direct investment (FDI).',
];

/** Centre of rule k (1-based) as drawn: padding.top + k × pitch + ½ width. */
const RULE_HALF = getPaperAppearance().ruleWidth / 2;
const ruleY = k => M.padding.top + k * M.lineSpacing + RULE_HALF;

function draw(text, formatting, options = {}) {
  const l = layoutHandwriting(text, L3, {
    fontSize: M.fontSize,
    contentWidth: M.contentWidth,
    lineHeight: ROW,
    seed: options.seed || 'layout',
    formatting,
    corrections: options.corrections,
  });
  const strokes = [];
  renderLines(l.lines, { profile: L3, layout: l, rowHeight: ROW, baselineInRow: baselineInRow(ROW, L3, l.fontSize), ink: { floor: 0.86, strength: 1 }, debug: strokes });
  return { layout: l, strokes };
}
/** Lowest point (y down) of each listed letter's main stroke (not t's bar). */
const bottoms = (strokes, chars) =>
  strokes.filter(s => chars.includes(s.char) && !s.dot && s.stroke === 0).map(s => Math.max(...s.ys));

beforeEach(() => {
  clearAllMockStorages();
  setStorageBackend(null);
  setNativeExporter(null);
});

describe('baseline on the rule', () => {
  it('places the baseline exactly on the ruled line (its centre)', () => {
    expect(baselineInRow(ROW, L3, M.fontSize)).toBeCloseTo(ROW + RULE_HALF, 6);
    expect(ROW).toBe(M.lineSpacing);
  });

  it.each([1, 2, 3])('line %i sits on rule %i', n => {
    const text = 'one\ntwo\nthree';
    const { strokes } = draw(text);
    const word = ['one', 'two', 'three'][n - 1];
    const lows = bottoms(strokes.filter(s => s.word === word), 'onetwhr');
    // Text coordinates start at padding.top: rule n is at n × pitch.
    const rule = ruleY(n) - M.padding.top;
    lows.forEach(y => {
      expect(Math.abs(y - rule)).toBeLessThan(0.45 + 0.45); // ±0.45 hand + stroke edge
    });
    expect(Math.abs(lows.reduce((a, b) => a + b, 0) / lows.length - rule)).toBeLessThan(0.45);
  });

  it('keeps every word within ≈3 % of the pitch of its rule', () => {
    for (let s = 0; s < 6; s++) {
      const { layout } = draw(`${PARA1}\n${PARA2}`, undefined, { seed: `b${s}` });
      for (const line of layout.lines) {
        for (const w of line.words) {
          expect(Math.abs(w.shape.translateY + w.drift)).toBeLessThan(0.03 * M.lineSpacing);
        }
      }
    }
  });

  it('sits x-height letters on the rule and hangs descenders below it', () => {
    const { strokes } = draw('acemnorsuvwx gjpqy');
    const rule = ruleY(1) - M.padding.top;
    bottoms(strokes, 'acemnorsuvwx').forEach(y => expect(Math.abs(y - rule)).toBeLessThan(0.9));
    const xh = M.fontSize * L3.fontScale * XH_EM;
    bottoms(strokes, 'gjpqy').forEach(y => {
      expect(y - rule).toBeGreaterThan(0.4 * xh); // below the line
      expect(y - rule).toBeLessThan(M.lineSpacing * 0.5); // not into the next text
    });
  });
});

describe('proportions', () => {
  const xh = () => M.fontSize * L3.fontScale * XH_EM;

  it('uses the measured x-height: 0.33 of the pitch', () => {
    expect(xh() / M.lineSpacing).toBeCloseTo(0.33, 2);
  });

  it('keeps ascenders and capitals below the previous rule', () => {
    const { strokes } = draw('bdhklt ABC', { ...emptyFormatting() });
    const rule = ruleY(1) - M.padding.top;
    strokes.filter(s => !s.dot).forEach(s => expect(rule - Math.min(...s.ys)).toBeLessThan(M.lineSpacing * 0.85));
  });

  it('keeps 120 % text and headings on the same rule', () => {
    const text = 'Introduction market\nbody';
    const f = applySpanFormat({ ...emptyFormatting(), headings: [{ start: 0, end: 12, underline: true }] }, text, { start: 13, end: 19 }, { size: 1.2 });
    const { strokes } = draw(text, f);
    const rule = ruleY(1) - M.padding.top;
    bottoms(strokes.filter(s => s.word === 'market'), 'markt').forEach(y => expect(Math.abs(y - rule)).toBeLessThan(1));
    bottoms(strokes.filter(s => s.word === 'Introduction'), 'ntroucin').forEach(y => expect(Math.abs(y - rule)).toBeLessThan(1));
  });
});

describe('page geometry', () => {
  it('uses notebook-pitch ruling, one text line per rule', () => {
    expect(M.lineSpacing).toBeCloseTo(20 * 0.725, 5);
    expect(M.fontSize).toBeCloseTo(M.lineSpacing * PAGE.fontToLineRatio, 2);
    const { layout } = draw(`${PARA1}\n${PARA2}`);
    expect(layout.lines.length).toBeGreaterThan(10);
  });

  it('starts the first writing line one pitch below the header rule', () => {
    expect(M.headerRuleY).toBe(36);
    expect(ruleY(1) - RULE_HALF).toBeCloseTo(M.headerRuleY + M.lineSpacing, 5);
  });

  it('starts text just right of the red margin', () => {
    const look = getPaperAppearance();
    const edge = look.marginX + type.margin.double + look.marginWidth;
    expect(M.padding.left).toBeGreaterThan(edge);
    expect(M.padding.left - edge).toBeLessThan(0.5 * M.lineSpacing);
  });

  it('wraps at the printable right margin, never past it', () => {
    expect(M.padding.right).toBe(14);
    expect(M.contentWidth).toBeCloseTo(PAGE.width - M.padding.left - 14, 5);
    const { layout } = draw(`${PARA1}\n${PARA2}`);
    for (const line of layout.lines) {
      const last = line.words[line.words.length - 1];
      if (last) expect(line.offsetX + last.x + last.shape.width).toBeLessThanOrEqual(M.contentWidth + 0.4 * M.fontSize);
    }
  });

  it('writes about as many words per line as the reference (most lines identical)', () => {
    const lines = t => layoutHandwriting(t, L3, { fontSize: M.fontSize, contentWidth: M.contentWidth, lineHeight: ROW, seed: 'cal' }).lines.map(l => l.words.map(w => w.shape.text).join(' '));
    const got = [...lines(PARA1), ...lines(PARA2)];
    const same = got.filter(l => REF_LINES.includes(l)).length;
    expect(same).toBeGreaterThanOrEqual(8);
    const counts = got.slice(0, -1).map(l => l.split(' ').length);
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    expect(avg).toBeGreaterThanOrEqual(7.5);
    expect(avg).toBeLessThanOrEqual(11);
  });

  it('fits an A4 page: real notebook pitch and line count', () => {
    expect(M.minHeight / M.width).toBeCloseTo(Math.SQRT2, 2);
    expect(PDF_PAGE.height / PDF_PAGE.width).toBeCloseTo(Math.SQRT2, 3);
    const mm = 210 / M.width;
    expect(M.lineSpacing * mm).toBeGreaterThan(7.5); // A4 notebook ruling 7–9 mm
    expect(M.lineSpacing * mm).toBeLessThan(9);
    const rows = Math.floor((M.minHeight - M.padding.top - M.padding.bottom) / M.lineSpacing);
    expect(rows).toBeGreaterThanOrEqual(29);
    expect(M.padding.right * mm).toBeGreaterThan(5); // printable margin
  });
});

describe('pages and output', () => {
  it.each([1, 2, 3, 5, 10])('%i pages: same pitch, stable breaks, no lost or duplicated text', n => {
    const content = Array.from({ length: n }, (_, i) => `Page ${i + 1}.\n${PARA1}\n${PARA2}`).join(PAGE_BREAK);
    const run = () => paginateDocument({ content, style: L3, metrics: M, rowHeight: ROW, seed: 'pg' });
    const r = run();
    expect(r.pages.map(p => [p.start, p.end])).toEqual(run().pages.map(p => [p.start, p.end]));
    const sheets = splitSheets(content);
    sheets.forEach((sheet, i) => {
      expect(r.pages.filter(p => p.sheetIndex === i).map(p => p.text).join('')).toBe(sheet.text);
    });
  });

  it('keeps word spacing, gaps and corrections on the rule', () => {
    const base = draw(PARA1).layout;
    let f = applySpanFormat(emptyFormatting(), PARA1, { start: 0, end: 60 }, { spacing: 4 });
    f = setWordGap(f, PARA1, boundariesIn(PARA1, { start: 60, end: 80 })[0], -5);
    const spaced = draw(PARA1, f).layout;
    const ys = l => l.lines.flatMap(x => x.words.map(w => w.shape.translateY));
    expect(ys(spaced).every(y => Math.abs(y) < 0.03 * M.lineSpacing)).toBe(true);
    // A correction never moves its word vertically.
    const text = `${PARA1} `.repeat(4);
    for (let s = 0; s < 30; s++) {
      const a = draw(text, undefined, { seed: `c${s}`, corrections: true }).layout;
      const b = draw(text, undefined, { seed: `c${s}` }).layout;
      if (!a.corrections.length) continue;
      // The corrected words keep their rise; drift (a slow wave along the
      // line) may move by a hair when a crossed-out attempt widens a word.
      const at = l => new Map(l.lines.flatMap(x => x.words.map(w => [w.start, w])));
      const wa = at(a);
      const wb = at(b);
      for (const c of a.corrections) {
        expect(wa.get(c.start).shape.translateY).toBe(wb.get(c.start).shape.translateY);
        // Its own rise is unchanged, and it stays anchored to the rule (a
        // crossed-out attempt earlier on the line can shift it along the
        // line's slow drift by a hair).
        const w = wa.get(c.start);
        expect(Math.abs(w.shape.translateY + w.drift)).toBeLessThan(0.03 * M.lineSpacing);
      }
      break;
    }
    expect(base.lines.length).toBeGreaterThan(0);
  });

  it('gives the editor, thumbnails and export the same Lang3 page model', async () => {
    const doc = { ...createDocument({ handwritingStyle: LANG3_PROFILE_ID }), content: `${PARA1}\n${PARA2}` };
    jest.useFakeTimers();
    const r = await render(<EditorScreen initialDocument={doc} onClose={jest.fn()} />);
    const page = r.root.findAll(n => n.props.testID === 'paper-canvas' && n.props.metrics)[0];
    expect(page.props.metrics).toEqual(M);
    const rules = r.root.findAll(n => n.props.testID === 'paper-rule' && typeof n.type === 'string').map(n => [].concat(n.props.style).flat().find(s => s && s.top !== undefined).top);
    expect(rules[0]).toBeCloseTo(ruleY(1) - RULE_HALF, 5);
    expect(rules[2] - rules[1]).toBeCloseTo(M.lineSpacing, 5);
    restoreRealTimers(jest);
  });

  it.each(['pdf', 'png', 'jpg'])('exports the same rules and text positions to %s', async format => {
    const doc = { ...createDocument({ handwritingStyle: LANG3_PROFILE_ID }), content: PARA1 };
    const paged = { ...paginateDocument({ content: doc.content, style: L3, metrics: M, rowHeight: ROW, seed: doc.id }), metrics: M, rowHeight: ROW };
    let mounted = null;
    const seen = [];
    const grab = () => {
      const p = mounted.root.findAll(n => n.props.testID === 'export-page' && n.props.metrics)[0];
      seen.push([p.props.metrics, p.props.page.lines.map(l => l.words.map(w => w.x))]);
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
    mounted = await render(<ExportRenderer plan={buildExportPlan({ title: 'L', format, pageCount: 1 })} document={doc} paged={paged} onProgress={() => {}} onFinish={o => (done = o)} onError={() => {}} />);
    for (let i = 0; i < 200 && !done; i++) {
      await act(async () => {
        await new Promise(res => setTimeout(res, 10));
      });
    }
    expect(done).toBeTruthy();
    expect(seen[0][0]).toEqual(M);
    expect(seen[0][1]).toEqual(paged.pages[0].lines.map(l => l.words.map(w => w.x)));
  }, 30000);

  it('draws thumbnails on the same rules', async () => {
    const doc = { ...createDocument({ handwritingStyle: LANG3_PROFILE_ID }), content: PARA1 };
    const paged = paginateDocument({ content: doc.content, style: L3, metrics: M, rowHeight: ROW, seed: doc.id });
    const r = await render(<PaperPage document={doc} page={paged.pages[0]} layout={paged.layout} metrics={M} rowHeight={ROW} width={110} quality="preview" />);
    const rules = r.root.findAll(n => n.props.testID === 'paper-rule' && typeof n.type === 'string');
    expect(rules.length).toBeGreaterThanOrEqual(29);
  });
});

describe('Lang1 and Lang2 untouched', () => {
  it('Changing line pitch/layout must not modify Lang1 or Lang2 glyph geometry', () => {
    expect(hashString(JSON.stringify(GLYPHS))).toBe(3649923111);
    expect(hashString(JSON.stringify(GLYPHS_LANG2))).toBe(1005853950);
  });

  it('keeps the Lang1 and Lang2 page layout exactly as before', () => {
    for (const style of [L1, L2]) {
      for (const pageType of ['lined', 'ruled', 'blank', 'wide', 'narrow']) {
        expect(getPageMetrics({ pageType, style })).toEqual(getPageMetrics({ pageType }));
      }
      expect(baselineInRow(20, style, 12)).toBe(19); // a hair above the rule
    }
    expect(getPageMetrics({ pageType: 'lined' })).toMatchObject({ lineSpacing: 20, padding: { top: 52, right: 22, bottom: 30, left: 46 } });
  });
});

describe('performance', () => {
  it.each([500, 1000, 2500, 5000])('%i characters stay grouped', n => {
    const t = `${PARA1} ${PARA2} `.repeat(10).slice(0, n);
    const l = layoutHandwriting(t, L3, { fontSize: M.fontSize, contentWidth: M.contentWidth, lineHeight: ROW, seed: 'p' });
    const d = renderLines(l.lines, { profile: L3, layout: l, rowHeight: ROW, baselineInRow: ROW, ink: { floor: 0.86, strength: 1 } });
    expect(d.buckets.length).toBeLessThan(12);
  });
});
