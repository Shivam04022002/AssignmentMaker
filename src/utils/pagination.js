/**
 * Multi-page documents.
 *
 * Model: the document text stays a single string (the source of truth, with
 * undo history and formatting ranges over it). A form-feed character (\f)
 * separates *sheets* — pages the user created explicitly ("Add Page").
 * `pageIds[i]` is the stable id of sheet i; it seeds that sheet's
 * handwriting, so reordering or editing other sheets never re-jitters it.
 *
 * A sheet longer than one physical page flows onto continuation pages.
 * Page breaks come from the real layout: the lines produced by
 * layoutHandwriting() are dealt onto pages by how many ruled rows fit.
 *
 *   content ─► sheets ─► layoutHandwriting (per sheet) ─► lines ─► pages
 *
 * Old documents have no \f: they are simply one sheet.
 */
import { RANGE_KEYS } from './formatting';
import { layoutHandwriting } from './textLayout';

export const PAGE_BREAK = '\f';
export const FIRST_PAGE_ID = 'page-1';

/** Sheets of the document text, with absolute offsets. Always ≥ 1. */
export function splitSheets(content) {
  const text = String(content ?? '');
  const sheets = [];
  let start = 0;
  text.split(PAGE_BREAK).forEach((sheetText, index) => {
    sheets.push({
      index,
      start,
      end: start + sheetText.length,
      text: sheetText,
    });
    start += sheetText.length + PAGE_BREAK.length;
  });
  return sheets;
}

export function sheetCount(content) {
  return splitSheets(content).length;
}

let idCounter = 0;
/** A new page id. Only used when pages are created, never while rendering. */
export function generatePageId() {
  idCounter = (idCounter + 1) % 1e6;
  return `page-${Date.now().toString(36)}-${idCounter.toString(
    36,
  )}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * One id per sheet: keeps known ids, fills missing ones deterministically
 * (page-1 for the first sheet of an old document), drops extras.
 */
export function normalizePageIds(pageIds, count) {
  const ids = [];
  const seen = new Set();
  const source = Array.isArray(pageIds) ? pageIds : [];
  for (let i = 0; i < count; i++) {
    let id = typeof source[i] === 'string' && source[i] ? source[i] : null;
    if (!id || seen.has(id)) {
      id =
        i === 0 && !seen.has(FIRST_PAGE_ID) ? FIRST_PAGE_ID : `page-${i + 1}`;
      let n = i + 1;
      while (seen.has(id)) {
        n += 1;
        id = `page-${n}`;
      }
    }
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/** Formatting ranges inside a sheet, rebased to the sheet's own text. */
export function sheetFormatting(formatting, sheet) {
  if (!formatting) {
    return formatting;
  }
  const clip = list =>
    (list || [])
      .filter(
        r =>
          r.start < Math.max(sheet.end, sheet.start + 1) && r.end > sheet.start,
      )
      .map(r => ({
        ...r,
        start: Math.max(0, r.start - sheet.start),
        end: Math.min(sheet.end, r.end) - sheet.start,
      }))
      .filter(r => r.end > r.start || sheet.end === sheet.start);
  const out = { ...formatting };
  RANGE_KEYS.forEach(key => {
    out[key] = clip(formatting[key]);
  });
  return out;
}

/** How many ruled rows fit in the writing area of one page. */
export function rowsPerPage(metrics, rowHeight) {
  const usable =
    metrics.minHeight - metrics.padding.top - metrics.padding.bottom;
  return Math.max(1, Math.floor(usable / rowHeight));
}

/**
 * Deals a sheet's layout lines onto pages.
 *   - never splits a line (lines are the unit)
 *   - a heading is not left alone at the bottom of a page
 *   - continuation pages do not start with blank lines
 * Returns arrays of lines (≥ 1 page, possibly with no lines).
 */
export function breakLines(lines, capacity) {
  const pages = [];
  let i = 0;
  while (i < lines.length) {
    if (pages.length > 0) {
      while (i < lines.length && lines[i].words.length === 0) {
        i++;
      }
      if (i >= lines.length) {
        break;
      }
    }
    let take = Math.min(capacity, lines.length - i);
    const last = lines[i + take - 1];
    if (take > 1 && i + take < lines.length && last.heading) {
      take -= 1; // keep the heading with what follows it
    }
    pages.push(lines.slice(i, i + take));
    i += take;
  }
  return pages.length ? pages : [[]];
}

/**
 * Lays out and paginates a document.
 *
 * @param {object} options
 *   content, formatting, pageIds   document data
 *   style                          resolved handwriting style
 *   metrics                        page metrics (getPageMetrics)
 *   rowHeight                      line height on this paper
 *   seed                           document id
 *   caches                         Map pageId → previous layout cache
 *   inkChunks                      Map pageId → pages with ink (kept)
 * @returns {{ pages, layout: {fontSize, headingFontSize, unit}, caches }}
 *   pages[i] = { key, number, sheetIndex, sheetId, chunk, chunks, lines,
 *                start, end, text }   (start/end: absolute text offsets)
 */
export function paginateDocument({
  content,
  formatting,
  pageIds,
  style,
  metrics,
  rowHeight,
  seed,
  caches,
  inkChunks,
  corrections = false,
}) {
  const sheets = splitSheets(content);
  const ids = normalizePageIds(pageIds, sheets.length);
  const capacity = rowsPerPage(metrics, rowHeight);
  const nextCaches = new Map();
  const pages = [];
  let layoutInfo = null;

  sheets.forEach(sheet => {
    const sheetId = ids[sheet.index];
    const layout = layoutHandwriting(sheet.text, style, {
      fontSize: metrics.fontSize,
      contentWidth: metrics.contentWidth,
      lineHeight: rowHeight,
      seed,
      pageId: sheetId,
      formatting: sheetFormatting(formatting, sheet),
      corrections,
      cache: caches ? caches.get(sheetId) : undefined,
    });
    nextCaches.set(sheetId, layout.cache);
    layoutInfo = layoutInfo || {
      fontSize: layout.fontSize,
      headingFontSize: layout.headingFontSize,
      unit: layout.unit,
    };

    const chunks = breakLines(layout.lines, capacity);
    // A page someone drew on stays, even if its text has since moved away.
    const keep = inkChunks ? inkChunks.get(sheetId) || 0 : 0;
    while (chunks.length < keep) {
      chunks.push([]);
    }
    chunks.forEach((lines, chunk) => {
      const startInSheet =
        chunk === 0 ? 0 : lines.length ? lines[0].start : sheet.text.length;
      const next = chunks[chunk + 1];
      const endInSheet =
        next && next.length ? next[0].start : sheet.text.length;
      pages.push({
        key: `${sheetId}#${chunk}`,
        number: pages.length + 1,
        sheetIndex: sheet.index,
        sheetId,
        chunk,
        chunks: chunks.length,
        lines,
        start: sheet.start + startInSheet,
        end: sheet.start + endInSheet,
        text: sheet.text.slice(startInSheet, endInSheet),
        // Natural corrections on this page, anchored to their words
        // (absolute text ranges; they move with the text, never by x/y).
        corrections: layout.corrections
          .filter(c => c.start >= startInSheet && c.start < endInSheet)
          .map(c => ({
            ...c,
            start: sheet.start + c.start,
            end: sheet.start + c.end,
          })),
      });
    });
  });

  return {
    pages,
    layout: layoutInfo,
    caches: nextCaches,
    sheets,
    pageIds: ids,
  };
}

/** Index of the page showing absolute text offset `pos`. */
export function pageIndexAt(pages, pos) {
  for (let i = pages.length - 1; i >= 0; i--) {
    if (pos >= pages[i].start) {
      return i;
    }
  }
  return 0;
}
