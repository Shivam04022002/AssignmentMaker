/**
 * Export planning (pure): formats, file names, page selection, sizes.
 *
 *   Document → paginated pages → export plan → ExportRenderer (same
 *   PaperPage renderer as the editor) → native exporter → files → share
 */

/** A4 in PDF points (1/72 in). PAGE has A-series proportions (1 : √2). */
export const PDF_PAGE = { width: 595.28, height: 841.89 };

/**
 * Raster width for PNG/JPG: A4 at 150 dpi. Sharp for screens and printing,
 * ~8.7 MB of pixels per page, and only one page is ever held in memory.
 */
export const RASTER_WIDTH = 1240;
export const JPEG_QUALITY = 0.92;

export const EXPORT_FORMATS = {
  pdf: { id: 'pdf', label: 'PDF', extension: 'pdf', mime: 'application/pdf' },
  png: { id: 'png', label: 'PNG', extension: 'png', mime: 'image/png' },
  jpg: { id: 'jpg', label: 'JPG', extension: 'jpg', mime: 'image/jpeg' },
};

/** Safe file-name part from a document title ("International Market"). */
export function sanitizeTitle(title) {
  const clean = String(title || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents (é → e)
    // Anything that is not a letter, digit, space or hyphen becomes a space
    // (covers \ / : * ? " < > | and control characters).
    .replace(/[^\w\- ]/g, ' ')
    .trim()
    .replace(/[\s_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
    .replace(/_+$/, '');
  return clean || 'Document';
}

/**
 * HandWrite_<title>.pdf, or for one image per page
 * HandWrite_<title>_page-01.png (zero-padded so files sort in order).
 */
export function exportFileName(title, format, pageNumber, pageCount = 1) {
  const { extension } = EXPORT_FORMATS[format];
  const base = `HandWrite_${sanitizeTitle(title)}`;
  if (pageNumber === undefined) {
    return `${base}.${extension}`;
  }
  const digits = Math.max(2, String(pageCount).length);
  return `${base}_page-${String(pageNumber).padStart(
    digits,
    '0',
  )}.${extension}`;
}

/**
 * What to export.
 *   format   'pdf' | 'png' | 'jpg'
 *   scope    'all' | 'current'  (PDF always contains every page)
 * Returns { format, mime, pageIndexes, files, pdf, pageSize, pixelWidth }
 * where files[i] = { pageIndex, fileName } (one PDF, or one image per page).
 */
export function buildExportPlan({
  title,
  format,
  scope = 'all',
  pageCount,
  currentPage = 0,
}) {
  const spec = EXPORT_FORMATS[format];
  if (!spec) {
    throw new Error(`Unsupported export format: ${format}`);
  }
  const count = Math.max(1, pageCount);
  const all = Array.from({ length: count }, (_, i) => i);
  const isPdf = format === 'pdf';
  const pageIndexes =
    isPdf || scope === 'all'
      ? all
      : [Math.min(Math.max(currentPage, 0), count - 1)];
  const files = isPdf
    ? [{ pageIndex: null, fileName: exportFileName(title, 'pdf') }]
    : pageIndexes.map(i => ({
        pageIndex: i,
        fileName: exportFileName(title, format, i + 1, count),
      }));
  return {
    format,
    mime: spec.mime,
    pageIndexes,
    files,
    pdf: isPdf,
    pageSize: PDF_PAGE,
    pixelWidth: RASTER_WIDTH,
    pixelHeight: Math.round((RASTER_WIDTH * PDF_PAGE.height) / PDF_PAGE.width),
    quality: format === 'jpg' ? JPEG_QUALITY : 1,
  };
}
