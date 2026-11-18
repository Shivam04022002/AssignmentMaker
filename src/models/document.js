/**
 * Document model. `content` (plain text) is the single source of truth;
 * handwriting is always regenerated from it and never stored.
 */
import {
  DEFAULT_HANDWRITING_STYLE,
  isHandwritingStyle,
} from '../data/handwritingStyles';
import { isPersonalRef } from '../handwriting/learn/profileSchema';
import { DEFAULT_PAGE_TYPE, isPageType } from '../data/paper';
import { DEFAULT_PEN, isPen } from '../data/pens';
import { inkSignature, normalizeInk } from '../ink/strokes';
import { formattingEquals, normalizeFormatting } from '../utils/formatting';
import { PAGE_BREAK, normalizePageIds, splitSheets } from '../utils/pagination';

export const DEFAULT_TITLE = 'My Document';
// 2: adds `formatting` (headings, underlines, labels).
// 3: multi-page — `content` may contain page breaks () and `pageIds` names
//    each page. Older documents are read as a single page; nothing is
//    rewritten until the user saves.
// 4: freehand `ink` — { [pageKey]: [stroke] } in page coordinates
//    (src/ink/strokes.js). Documents without ink simply have none.
// 5: `naturalCorrections` — draw the odd natural correction (rendering only;
//    off for documents saved before it existed, on for new ones).
export const DOCUMENT_VERSION = 5;

/**
 * Accepts the explicit pages shape
 *   { pages: [{ id, content, formatting }] }
 * and converts it to the stored form (content with page breaks + pageIds +
 * formatting over the whole text).
 */
function fromPages(pages) {
  const contents = [];
  const ids = [];
  const formatting = { headings: [], underlines: [], labels: [] };
  const ink = {};
  let offset = 0;
  pages.forEach((page, index) => {
    if (page && Array.isArray(page.strokes) && page.strokes.length) {
      ink[`${(page && page.id) || `page-${index + 1}`}#0`] = page.strokes;
    }
    const text =
      typeof (page && page.content) === 'string'
        ? page.content.split(PAGE_BREAK).join('')
        : '';
    const f = (page && page.formatting) || {};
    for (const key of ['headings', 'underlines', 'labels']) {
      for (const r of f[key] || []) {
        formatting[key].push({
          ...r,
          start: r.start + offset,
          end: r.end + offset,
        });
      }
    }
    contents.push(text);
    ids.push(page && page.id);
    offset += text.length + PAGE_BREAK.length;
  });
  return { content: contents.join(PAGE_BREAK), pageIds: ids, formatting, ink };
}

export function generateId() {
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `doc-${time}-${random}`;
}

/**
 * Fills in defaults and drops unknown option values, so documents saved by
 * older/newer builds (or with a style that was removed) still open.
 */
export function normalizeDocument(input = {}) {
  const now = Date.now();
  const createdAt = Number.isFinite(input.createdAt) ? input.createdAt : now;
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const explicitPages =
    typeof input.content !== 'string' &&
    Array.isArray(input.pages) &&
    input.pages.length
      ? fromPages(input.pages)
      : null;
  const content = explicitPages
    ? explicitPages.content
    : typeof input.content === 'string'
    ? input.content
    : '';
  const formatting = explicitPages
    ? explicitPages.formatting
    : input.formatting;
  const pageIds = explicitPages ? explicitPages.pageIds : input.pageIds;
  return {
    id: input.id || generateId(),
    title: title || DEFAULT_TITLE,
    pageType: isPageType(input.pageType) ? input.pageType : DEFAULT_PAGE_TYPE,
    pen: isPen(input.pen) ? input.pen : DEFAULT_PEN,
    // Ids from before Phase 7 (neat, cursive, …) are kept as stored — they
    // are drawn in the reference handwriting, and nothing the user saved is
    // rewritten. A personal handwriting reference (personal:<id>@<version>)
    // is kept as stored too, even when that profile cannot be found: it is
    // reported as unavailable, never quietly switched to another hand.
    // Anything else unknown falls back to the default.
    handwritingStyle:
      isHandwritingStyle(input.handwritingStyle) ||
      isPersonalRef(input.handwritingStyle)
        ? input.handwritingStyle
        : DEFAULT_HANDWRITING_STYLE,
    content,
    formatting: normalizeFormatting(formatting, content.length),
    pageIds: normalizePageIds(pageIds, splitSheets(content).length),
    // Handwritten page numbers on the paper (the editor always shows them).
    pageNumbers: input.pageNumbers === true,
    // Occasional natural corrections in the handwriting (never the text).
    naturalCorrections: input.naturalCorrections === true,
    ink: normalizeInk(explicitPages ? explicitPages.ink : input.ink),
    createdAt,
    updatedAt: Number.isFinite(input.updatedAt) ? input.updatedAt : createdAt,
    version: DOCUMENT_VERSION,
  };
}

/** Creates a new, unsaved document from the New Document options. */
export function createDocument(options = {}) {
  const now = Date.now();
  return normalizeDocument({
    // New documents get the occasional natural correction; it can be
    // switched off in the editor's settings.
    naturalCorrections: true,
    ...options,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  });
}

/** True when two documents differ in any user-editable field. */
export function hasDocumentChanges(a, b) {
  return (
    [
      'title',
      'pageType',
      'pen',
      'handwritingStyle',
      'content',
      'pageNumbers',
      'naturalCorrections',
    ].some(key => a[key] !== b[key]) ||
    !formattingEquals(a.formatting, b.formatting) ||
    inkSignature(a.ink) !== inkSignature(b.ink) ||
    (a.pageIds || []).join() !== (b.pageIds || []).join()
  );
}
