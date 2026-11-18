import { useMemo, useRef, useSyncExternalStore } from 'react';
import {
  getHandwritingStyle,
  getStylesVersion,
  isPersonalStyleId,
  subscribeToStyles,
} from '../data/handwritingStyles';
import {
  getPageMetrics,
  getPageType,
  getPaperVersion,
  rowHeightFor,
  subscribeToPaper,
} from '../data/paper';
import { measure } from '../dev/perf';
import { inkChunks } from '../ink/strokes';
import { paginateDocument } from '../utils/pagination';
import { getPersonalResolution, getPersonalVersion, subscribePersonal } from '../handwriting/learn/personalStore';
import { paginatePersonal } from '../handwriting/learn/personalRenderer';

/**
 * Paginated pages of a document (same layout the paper, thumbnails and
 * export draw). Word-shape caches are kept per sheet between edits, so a
 * keystroke only re-measures what changed.
 *
 * A personal handwriting reference is paginated by the personal renderer
 * from that exact stored version (result.handwriting says whether it could
 * be used); it never falls back to a built-in handwriting.
 */
export default function useDocumentPages(document) {
  const stylesVersion = useSyncExternalStore(
    subscribeToStyles,
    getStylesVersion,
    getStylesVersion,
  );
  const personalVersion = useSyncExternalStore(
    subscribePersonal,
    getPersonalVersion,
    getPersonalVersion,
  );
  const paperVersion = useSyncExternalStore(
    subscribeToPaper,
    getPaperVersion,
    getPaperVersion,
  );
  const cachesRef = useRef(null);

  const content = document ? document.content : '';
  const formatting = document ? document.formatting : null;
  const pageIds = document ? document.pageIds : null;
  const pageType = document ? document.pageType : null;
  const styleId = document ? document.handwritingStyle : null;
  const seed = document ? document.id : '';
  const corrections = document ? document.naturalCorrections === true : false;
  const hasDocument = !!document;
  const ink = document ? document.ink : null;
  // Pages that carry ink stay alive even if their text moves away.
  const keepChunks = useMemo(() => inkChunks(ink), [ink]);

  return useMemo(() => {
    if (!hasDocument) {
      return null;
    }
    const style = getHandwritingStyle(styleId);
    const type = getPageType(pageType);
    const metrics = getPageMetrics({ pageType: type.id, style });
    const rowHeight = rowHeightFor(type, metrics, style);
    if (isPersonalStyleId(styleId)) {
      const result = measure(
        'paginate',
        () =>
          paginatePersonal({
            content,
            pageIds,
            resolution: getPersonalResolution(styleId),
            metrics,
            rowHeight,
            seed,
            inkChunks: keepChunks,
            formatting,
            corrections,
          }),
        content.length,
      );
      return { ...result, metrics, rowHeight, style };
    }
    const result = measure(
      'paginate',
      () =>
        paginateDocument({
      content,
      formatting,
      pageIds,
      style,
      metrics,
      rowHeight,
      seed,
      inkChunks: keepChunks,
      corrections,
      caches: cachesRef.current,
        }),
      content.length,
    );
    cachesRef.current = result.caches;
    return { ...result, metrics, rowHeight, style };
    // Versions re-paginate after developer tuning of styles or paper.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    content,
    formatting,
    pageIds,
    pageType,
    styleId,
    seed,
    corrections,
    keepChunks,
    stylesVersion,
    paperVersion,
    personalVersion,
    hasDocument,
  ]);
}
