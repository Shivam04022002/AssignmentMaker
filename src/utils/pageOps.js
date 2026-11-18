/**
 * Page operations on { content, formatting, pageIds } (pure functions).
 *
 * Pages shown to the user are *rendered* pages (see pagination.js): a sheet
 * that overflows continues on further pages. Deleting or moving a
 * continuation page first isolates it — page breaks are inserted exactly at
 * its layout boundaries so it becomes its own sheet — and then acts on that
 * sheet. Formatting ranges move with their text; nothing is lost silently.
 */
import { RANGE_KEYS, mapFormatting, normalizeFormatting } from './formatting';
import {
  PAGE_BREAK,
  generatePageId,
  normalizePageIds,
  splitSheets,
} from './pagination';

function countBreaks(text) {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === PAGE_BREAK) {
      n++;
    }
  }
  return n;
}

/** Inserts page breaks at absolute positions (original coordinates). */
function insertBreaks(doc, positions, makeId = generatePageId) {
  const unique = [...new Set(positions)].sort((a, b) => b - a);
  let { content, formatting } = doc;
  let pageIds = normalizePageIds(doc.pageIds, splitSheets(content).length);
  for (const pos of unique) {
    const sheetIndex = countBreaks(content.slice(0, pos));
    content = content.slice(0, pos) + PAGE_BREAK + content.slice(pos);
    formatting = mapFormatting(formatting, {
      at: pos,
      removed: '',
      inserted: PAGE_BREAK,
    });
    pageIds = [
      ...pageIds.slice(0, sheetIndex + 1),
      makeId(),
      ...pageIds.slice(sheetIndex + 1),
    ];
  }
  const shift = pos => pos + unique.filter(p => p <= pos).length;
  return { doc: { ...doc, content, formatting, pageIds }, shift };
}

/**
 * How rendered page keys (`sheetId#chunk`, which own freehand ink) change
 * when page breaks are inserted: every old page is found again by its first
 * text position in the new document.
 */
function keyMapAfterBreaks(pages, shift, content, pageIds) {
  const sheets = splitSheets(content);
  const map = {};
  for (const page of pages) {
    const pos = shift(page.start);
    let index = 0;
    sheets.forEach((sheet, i) => {
      if (sheet.start <= pos) {
        index = i;
      }
    });
    const chunk = pages.filter(
      q =>
        q.sheetId === page.sheetId &&
        shift(q.start) >= sheets[index].start &&
        shift(q.start) < pos,
    ).length;
    const key = `${pageIds[index]}#${chunk}`;
    if (key !== page.key) {
      map[page.key] = key;
    }
  }
  return map;
}

/** Positions at which a rendered page must be split off its sheet. */
function boundariesOf(page) {
  const positions = [];
  if (page.chunk > 0) {
    positions.push(page.start);
  }
  if (page.chunk < page.chunks - 1) {
    positions.push(page.end);
  }
  return positions;
}

function sheetIndexStartingAt(content, pos) {
  return splitSheets(content).findIndex(s => s.start === pos);
}

/** Makes rendered page `index` its own sheet. Returns { doc, sheetIndex }. */
export function isolatePage(doc, pages, index) {
  const page = pages[index];
  const { doc: next, shift } = insertBreaks(doc, boundariesOf(page));
  return {
    doc: next,
    sheetIndex: sheetIndexStartingAt(next.content, shift(page.start)),
    keyMap: keyMapAfterBreaks(pages, shift, next.content, next.pageIds),
  };
}

/** Adds an empty page after sheet `afterSheetIndex`. */
export function addPage(doc, afterSheetIndex, makeId = generatePageId) {
  const sheets = splitSheets(doc.content);
  const after = Math.min(Math.max(afterSheetIndex, 0), sheets.length - 1);
  const pos = sheets[after].end;
  const pageIds = normalizePageIds(doc.pageIds, sheets.length);
  return {
    doc: {
      ...doc,
      content: doc.content.slice(0, pos) + PAGE_BREAK + doc.content.slice(pos),
      formatting: mapFormatting(doc.formatting, {
        at: pos,
        removed: '',
        inserted: PAGE_BREAK,
      }),
      pageIds: [
        ...pageIds.slice(0, after + 1),
        makeId(),
        ...pageIds.slice(after + 1),
      ],
    },
    sheetIndex: after + 1,
  };
}

/** True when rendered page `index` has any writing on it. */
export function pageHasContent(pages, index) {
  const page = pages[index];
  return !!page && page.text.trim().length > 0;
}

/**
 * Deletes rendered page `index` (its text goes with it). The last remaining
 * page is emptied instead, so a document never has zero pages.
 */
export function deletePage(doc, pages, index) {
  const { doc: isolated, sheetIndex, keyMap } = isolatePage(doc, pages, index);
  const sheets = splitSheets(isolated.content);
  const ids = normalizePageIds(isolated.pageIds, sheets.length);
  let at;
  let end;
  if (sheets.length === 1) {
    at = 0;
    end = isolated.content.length;
  } else if (sheetIndex < sheets.length - 1) {
    at = sheets[sheetIndex].start;
    end = sheets[sheetIndex + 1].start; // includes the following break
  } else {
    at = sheets[sheetIndex - 1].end; // includes the preceding break
    end = sheets[sheetIndex].end;
  }
  const removed = isolated.content.slice(at, end);
  return {
    ...isolated,
    content: isolated.content.slice(0, at) + isolated.content.slice(end),
    formatting: mapFormatting(isolated.formatting, {
      at,
      removed,
      inserted: '',
    }),
    pageIds: sheets.length === 1 ? ids : ids.filter((_, i) => i !== sheetIndex),
    // For freehand ink: keys renamed by the split, and the deleted page.
    inkKeyMap: keyMap,
    removedPageKeys: [pages[index].key],
  };
}

/** Splits formatting ranges at sheet boundaries: [{ range, sheet }]. */
function rangesBySheet(list, sheets) {
  const out = [];
  for (const r of list || []) {
    sheets.forEach((sheet, index) => {
      const start = Math.max(r.start, sheet.start);
      const end = Math.min(r.end, sheet.end);
      if (end > start) {
        out.push({ range: { ...r, start, end }, index });
      }
    });
  }
  return out;
}

/** Reassembles sheets in a new order, moving formatting with its text. */
function reorderSheets(doc, order) {
  const sheets = splitSheets(doc.content);
  const ids = normalizePageIds(doc.pageIds, sheets.length);
  const content = order.map(i => sheets[i].text).join(PAGE_BREAK);
  const newStart = new Map();
  let offset = 0;
  order.forEach(i => {
    newStart.set(i, offset);
    offset += sheets[i].text.length + PAGE_BREAK.length;
  });
  const move = list =>
    rangesBySheet(list, sheets)
      .map(({ range, index }) => {
        const delta = newStart.get(index) - sheets[index].start;
        return { ...range, start: range.start + delta, end: range.end + delta };
      })
      .sort((a, b) => a.start - b.start);
  const f = doc.formatting || {};
  const moved = { ...f };
  RANGE_KEYS.forEach(key => {
    moved[key] = move(f[key]);
  });
  return {
    ...doc,
    content,
    pageIds: order.map(i => ids[i]),
    formatting: normalizeFormatting(moved, content.length),
  };
}

/**
 * Moves rendered page `index` one place left (-1) or right (+1).
 * Returns { doc, index } (the page's new rendered index), or null.
 */
export function movePage(doc, pages, index, direction) {
  const target = index + direction;
  if (target < 0 || target >= pages.length) {
    return null;
  }
  const a = pages[index];
  const b = pages[target];
  const { doc: isolated, shift } = insertBreaks(doc, [
    ...boundariesOf(a),
    ...boundariesOf(b),
  ]);
  const keyMap = keyMapAfterBreaks(
    pages,
    shift,
    isolated.content,
    isolated.pageIds,
  );
  const sa = sheetIndexStartingAt(isolated.content, shift(a.start));
  const sb = sheetIndexStartingAt(isolated.content, shift(b.start));
  const count = splitSheets(isolated.content).length;
  const order = Array.from({ length: count }, (_, i) => i);
  order[sa] = sb;
  order[sb] = sa;
  // Sheet ids travel with their sheets, so the keys only change by the split.
  return { doc: reorderSheets(isolated, order), index: target, keyMap };
}

/** Text of each sheet with its rebased formatting — the "pages" view. */
export function documentSheets(doc) {
  const sheets = splitSheets(doc.content);
  const ids = normalizePageIds(doc.pageIds, sheets.length);
  return sheets.map((sheet, i) => ({
    id: ids[i],
    content: sheet.text,
    start: sheet.start,
    end: sheet.end,
  }));
}
