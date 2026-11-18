/**
 * Visual preview harness (development only — not part of `npm test`).
 *
 * Renders the real layout + glyph renderer (the same renderLines() SVG paths
 * that HandwritingLines draws, the same paper geometry, underlines and
 * freehand ink) to HTML so pages can be inspected in a desktop browser and
 * screenshotted — useful for tuning when no device or emulator is available.
 *
 * Usage (writes <name>.html files into VISUAL_OUT):
 *   VISUAL_OUT=/tmp/hw VISUAL_COMPARE=1 VISUAL_SHEETS='[]' \
 *     npx jest --testRegex 'scripts/visual-preview\.js$'
 *   VISUAL_SHEETS='[{"name":"x","pages":[{"pageType":"lined","pen":"blue"}]}]'
 *   VISUAL_SHEETS='[{"name":"p","paginate":{"pageType":"lined","pen":"blue"}}]'
 * Then e.g.:
 *   chrome --headless=new --allow-file-access-from-files \
 *     --screenshot=x.png file:///tmp/hw/x.html
 *
 * VISUAL_COMPARE=1 writes compare.html: each reference scan
 * (reference/handwriting_0N.png, shown by file URL for side-by-side review
 * only — never copied into the app) next to a generated page.
 */
/* eslint-env jest */
import fs from 'fs';
import path from 'path';
import {
  DEFAULT_HANDWRITING_STYLE,
  getHandwritingStyle,
  resetStyleOverrides,
  setStyleOverrides,
} from '../src/data/handwritingStyles';
import {
  getPageMetrics,
  getPageType,
  getPaperAppearance,
  rowHeightFor,
} from '../src/data/paper';
import { getPen } from '../src/data/pens';
import { baselineInRow } from '../src/components/HandwritingText';
import { inkTone, renderLines } from '../src/handwriting/glyphRender';
import { glyphForms } from '../src/handwriting/glyphs';
import * as strokeModel from '../src/handwriting/strokeModel';
import { layoutHandwriting } from '../src/utils/textLayout';
import { paginateDocument } from '../src/utils/pagination';
import {
  addPoint,
  finishStroke,
  groupStrokes,
  strokeStyle,
} from '../src/ink/strokes';

const OUT = process.env.VISUAL_OUT;
const ROOT = path.join(__dirname, '..');

const SAMPLE = [
  'Q1. What is working capital management in India? Explain with suitable examples.',
  'Ans:',
  "    Working Capital Management (WCM) in India refers to the strategic process of managing a company's short-term assets and liabilities to ensure it has sufficient liquidity to operate efficiently.",
  'The core objective is to maintain a satisfactory level of working capital to avoid the risk of technical insolvency or bankruptcy.',
  '',
  '1. Key Concepts and Definitions',
  '    In India, working capital is typically viewed through two conceptual lenses:',
  '• Gross Working Capital (GWC): The total investment in all current assets, such as cash, inventory, and receivables.',
].join('\n');

const SHORT = [
  'Q1. What is the international market? Write its advantages.',
  'Ans:',
  '    The international market refers to the exchange of goods, services and resources across national borders (FDI).',
  '1. Key Concepts',
].join(String.fromCharCode(10));

/** A long answer (the sample three times) for paginated previews. */
const LONG_SAMPLE = [SAMPLE, SAMPLE, SAMPLE].join(String.fromCharCode(10, 10));

/** Finger-like strokes (a little wobble) through [x, y] points. */
function demoStroke(points, tool, settings, id) {
  const buffer = { points: [], pressure: null };
  points.forEach(([x, y], i) =>
    addPoint(buffer, x + Math.sin(i * 1.7) * 0.6, y + Math.cos(i * 1.3) * 0.6),
  );
  return finishStroke(buffer, strokeStyle(tool, settings), id);
}
const seg = (x0, y0, x1, y1, n = 24) =>
  Array.from({ length: n + 1 }, (_, i) => [
    x0 + ((x1 - x0) * i) / n,
    y0 + ((y1 - y0) * i) / n,
  ]);
const ellipse = (cx, cy, rx, ry, n = 48) =>
  Array.from({ length: n + 4 }, (_, i) => {
    const t = (i / n) * Math.PI * 2 - 0.4;
    return [cx + Math.cos(t) * rx, cy + Math.sin(t) * ry];
  });
function demoInk(m) {
  const row = m.lineSpacing;
  const top = m.padding.top;
  const left = m.padding.left;
  return [
    // Yellow highlight over the 4th line of writing.
    demoStroke(
      seg(left - 2, top + row * 3.62, left + 220, top + row * 3.66, 40),
      'marker',
      { color: '#FFE14D', width: 16 },
      'hl',
    ),
    // Pink highlight over part of the 6th line.
    demoStroke(
      seg(left + 30, top + row * 5.6, left + 160, top + row * 5.64, 30),
      'marker',
      { color: '#FF8FC7', width: 14 },
      'hl2',
    ),
    // Circle around a word on the first line.
    demoStroke(
      ellipse(left + 150, top + row * 0.62, 46, 13),
      'pen',
      { color: '#123A8C', width: 1.6 },
      'circle',
    ),
    // A tick in the margin.
    demoStroke(
      [
        ...seg(14, top + row * 2.5, 20, top + row * 2.85, 6),
        ...seg(20, top + row * 2.85, 30, top + row * 2.05, 8),
      ],
      'pen',
      { color: '#C0392B', width: 2 },
      'tick',
    ),
    // An arrow pointing at a line.
    demoStroke(
      seg(m.width - 18, top + row * 7.2, m.width - 60, top + row * 6.4, 16),
      'pen',
      { color: '#151515', width: 1.8 },
      'arrow',
    ),
    demoStroke(
      [
        ...seg(m.width - 52, top + row * 6.4, m.width - 60, top + row * 6.4, 3),
        ...seg(
          m.width - 60,
          top + row * 6.4,
          m.width - 55,
          top + row * 6.75,
          3,
        ),
      ],
      'pen',
      { color: '#151515', width: 1.8 },
      'head',
    ),
    // Signature-like scribble at the bottom.
    demoStroke(
      Array.from({ length: 90 }, (_, i) => [
        left + 140 + i * 1.6,
        top + row * 12.6 + Math.sin(i / 4) * 7 - i * 0.05,
      ]),
      'pen',
      { color: '#123A8C', width: 2 },
      'sig',
    ),
  ];
}

function inkSvg(strokes, width, height) {
  const paths = groupStrokes(strokes)
    .map(g =>
      g.filled
        ? `<path d="${g.d}" fill="${g.color}" fill-opacity="${g.opacity}"/>`
        : `<path d="${g.d}" fill="none" stroke="${g.color}" stroke-opacity="${g.opacity}" stroke-width="${g.width}" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join('');
  return paths
    ? `<svg class="abs" style="top:0;left:0" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${paths}</svg>`
    : '';
}

/** Formatting with the given lines as underlined headings. */
function headingsFor(text, lines) {
  return {
    headings: lines
      .map(line => {
        const start = text.indexOf(line);
        return start < 0 ? null : { start, end: start + line.length, underline: true };
      })
      .filter(Boolean),
    underlines: [],
    labels: [],
    autoLabels: true,
  };
}

function formattingFor(text) {
  const h = text.indexOf('1. Key Concepts');
  if (h < 0)
    return { headings: [], underlines: [], labels: [], autoLabels: true };
  return {
    headings: [{ start: h, end: text.indexOf('\n', h), underline: true }],
    underlines: [],
    labels: [],
    autoLabels: true,
  };
}

/** Renders with temporary profile overrides (e.g. "before" comparisons). */
function withOverrides(p, fn) {
  if (p.formsInOrder) {
    // Letter-form sheets: letter i of a word uses form i (cycling), so a
    // word like "aaaa" shows each of a's forms in turn.
    const spy = jest
      .spyOn(strokeModel, 'wordForms')
      .mockImplementation((chars, seedBase, set) =>
        chars.map((c, index) => {
          const forms = glyphForms(c, set);
          return forms ? index % forms.length : 0;
        }),
      );
    try {
      return withOverrides({ ...p, formsInOrder: false }, fn);
    } finally {
      spy.mockRestore();
    }
  }
  if (!p.overrides) {
    return fn();
  }
  setStyleOverrides(p.styleId || DEFAULT_HANDWRITING_STYLE, p.overrides);
  try {
    return fn();
  } finally {
    resetStyleOverrides();
  }
}

function renderPage({
  styleId,
  pageType,
  pen,
  text = SAMPLE,
  title,
  compact,
  page, // { lines, layout } from paginateDocument: draw one fixed-size page
  annotate, // true: demo freehand annotations
  corrections, // true: natural corrections (as the app draws them)
  formatting, // optional formatting (headings, spans …) instead of the default
  seed = 'doc-visual',
  contentWidth, // optional: a wider writing area (e.g. to match a reference's line breaks)
}) {
  const style = getHandwritingStyle(styleId);
  const type = getPageType(pageType);
  const base = getPageMetrics({ pageType, style });
  const m = contentWidth
    ? {
        ...base,
        contentWidth,
        width: contentWidth + base.padding.left + base.padding.right,
      }
    : base;
  const look = getPaperAppearance();
  const row = rowHeightFor(type, m, style);
  const color = getPen(pen).color;
  const ink = getPen(pen).ink;
  const layout = page
    ? { ...page.layout, lines: page.lines, lineCount: page.lines.length }
    : layoutHandwriting(text, style, {
        fontSize: m.fontSize,
        contentWidth: m.contentWidth,
        seed,
        formatting: formatting || formattingFor(text),
        lineHeight: row,
        corrections,
      });
  const height = page
    ? m.minHeight
    : Math.max(
        compact ? 0 : m.minHeight,
        m.padding.top +
          (layout.lineCount + 1) * m.lineSpacing +
          m.padding.bottom,
      );
  let html = `<div class="page" style="width:${m.width}px;height:${height}px">`;
  html += `<div class="grain" style="opacity:${look.grainOpacity}"></div>`;
  if (type.ruled) {
    for (
      let y = m.padding.top + m.lineSpacing;
      y <= height - m.padding.bottom;
      y += m.lineSpacing
    ) {
      html += `<div class="abs" style="left:0;right:0;top:${y}px;height:${look.ruleWidth}px;background:${look.ruleColor};opacity:${look.ruleOpacity}"></div>`;
    }
  }
  if (m.margin) {
    const red = `background:${m.margin.color};opacity:${m.margin.opacity}`;
    if (m.headerRule) {
      const hy = m.headerRuleY ?? m.padding.top - look.headerRuleOffset;
      html += `<div class="abs" style="left:0;right:0;top:${hy}px;height:${m.margin.width}px;${red}"></div>`;
      html += `<div class="abs" style="left:0;right:0;top:${
        hy + m.margin.double
      }px;height:${m.margin.width}px;${red}"></div>`;
    }
    html += `<div class="abs" style="top:0;bottom:0;left:${m.margin.x}px;width:${m.margin.width}px;${red}"></div>`;
    html += `<div class="abs" style="top:0;bottom:0;left:${
      m.margin.x + m.margin.double
    }px;width:${m.margin.width}px;${red}"></div>`;
  }
  const strokes = annotate ? demoInk(m) : [];
  html += inkSvg(
    strokes.filter(st => st.tool === 'marker'),
    m.width,
    height,
  );
  // Handwriting: the same glyph renderer as HandwritingLines (SVG paths).
  const drawn = renderLines(layout.lines, {
    profile: style,
    layout,
    rowHeight: row,
    baselineInRow: baselineInRow(row, style, layout.fontSize),
    ink,
  });
  const P = 24;
  const boxH = layout.lines.length * row;
  const paths =
    drawn.buckets
      .map(
        bk =>
          `<path d="${bk.d}" fill="${inkTone(color, bk.tone)}" fill-opacity="${bk.alpha}"/>`,
      )
      .join('') +
    drawn.underlines
      .map(u => `<path d="${u.d}" fill="${color}" fill-opacity="${u.alpha}"/>`)
      .join('');
  html += `<svg class="abs" style="top:${m.padding.top - P}px;left:${
    m.padding.left - P
  }px" width="${m.contentWidth + P * 2}" height="${boxH + P * 2}" viewBox="${-P} ${-P} ${
    m.contentWidth + P * 2
  } ${boxH + P * 2}">${paths}</svg>`;
  html += inkSvg(
    strokes.filter(st => st.tool !== 'marker'),
    m.width,
    height,
  );
  html += '</div>';
  return `<figure><figcaption>${
    title || `${style.name} · ${type.label} · ${pen}`
  }</figcaption>${html}</figure>`;
}

test('render visual sheets', () => {
  if (!OUT) {
    return;
  }
  const grain = `file:///${path
    .join(ROOT, 'assets/images/paper-grain.png')
    .replace(/\\/g, '/')}`;
  const css = `
body{margin:0;background:#ddd;font-family:sans-serif}
.sheet{display:flex;flex-wrap:wrap;gap:12px;padding:12px}
figure{margin:0} figcaption{font-size:11px;color:#333;margin-bottom:4px}
.page{position:relative;background:#FCFBF8;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,.15)}
.grain{position:absolute;inset:0;background:url('${grain}') repeat}
.abs{position:absolute}
.ref{display:block;box-shadow:0 2px 6px rgba(0,0,0,.15)}`;
  const sheets = JSON.parse(process.env.VISUAL_SHEETS || '[]');
  // {"name","paginate":{"styleId","pageType","pen","text"}}: every page of a
  // paginated document, exactly as the editor/export break it.
  sheets.forEach(sheet => {
    if (!sheet.paginate) {
      return;
    }
    const { styleId, pageType, pen, corrections } = sheet.paginate;
    const seed = sheet.paginate.seed || 'doc-visual';
    const text = sheet.paginate.text || LONG_SAMPLE;
    const style = getHandwritingStyle(styleId);
    const metrics = getPageMetrics({ pageType, style: getHandwritingStyle(styleId) });
    const rowHeight = rowHeightFor(getPageType(pageType), metrics, style);
    const result = paginateDocument({
      content: text,
      formatting: sheet.paginate.headings
        ? headingsFor(text, sheet.paginate.headings)
        : formattingFor(text),
      pageIds: null,
      style,
      metrics,
      rowHeight,
      seed,
      corrections,
    });
    sheet.pages = result.pages.map(p => ({
      styleId,
      pageType,
      pen,
      title: `${style.name} · page ${p.number} of ${result.pages.length}`,
      page: { lines: p.lines, layout: result.layout },
    }));
  });
  if (process.env.VISUAL_COMPARE) {
    const refUrl = name =>
      `file:///${path.join(ROOT, 'reference', name).replace(/\\/g, '/')}`;
    sheets.push({
      name: 'compare',
      pages: [
        { reference: 'handwriting_03.png' },
        { pageType: 'lined', pen: 'blue', title: 'Generated · blue' },
        { reference: 'handwriting_01.png' },
        { pageType: 'lined', pen: 'black', title: 'Generated · black' },
        { reference: 'handwriting_02.png' },
        { pageType: 'lined', pen: 'blue', text: SHORT, compact: true },
      ].map(p =>
        p.reference ? { ...p, referenceUrl: refUrl(p.reference) } : p,
      ),
    });
  }
  for (const sheet of sheets) {
    const body = sheet.pages
      .map(p =>
        p.referenceUrl
          ? `<figure><figcaption>Reference · ${p.reference}</figcaption><img class="ref" width="${
              p.width || 420
            }" src="${p.referenceUrl}"></figure>`
          : withOverrides(p, () => renderPage({ styleId: DEFAULT_HANDWRITING_STYLE, ...p })),
      )
      .join('');
    fs.writeFileSync(
      path.join(OUT, `${sheet.name}.html`),
      `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="sheet">${body}</div></body></html>`,
    );
  }
});
