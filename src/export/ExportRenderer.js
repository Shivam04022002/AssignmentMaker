/**
 * Renders pages for export, one at a time, with the same PaperPage
 * component (and so the same handwriting renderer, fonts, seeds, paper,
 * margins, headings, underlines and labels) the editor shows.
 *
 * Each page is mounted at its exact logical size, given time to lay out and
 * paint, handed to the native exporter, and then replaced by the next page —
 * so only one page view and at most one bitmap exist at any time.
 */
import React, { useEffect, useRef, useState } from 'react';
import { PixelRatio, StyleSheet, View, findNodeHandle } from 'react-native';
import PaperPage from '../components/PaperPage';
import { renderScaleFor } from '../components/svgScale';
import { record } from '../dev/perf';
import {
  addPdfPage,
  beginPdf,
  cancelPdf,
  captureView,
  finishPdf,
  getExportDirectory,
} from './nativeExporter';

const nextFrame = () =>
  new Promise(resolve => {
    const raf = global.requestAnimationFrame || (cb => setTimeout(cb, 16));
    raf(() => resolve());
  });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Time for images (paper grain) and text to paint before capturing. */
const FIRST_PAGE_SETTLE_MS = 180;
const PAGE_SETTLE_MS = 40;
const LAYOUT_TIMEOUT_MS = 400;

/** PDF handwriting resolution: ≈190 dpi across an A4 page. */
const PDF_PIXEL_WIDTH = 1580;

/**
 * Render scale for the page's SVG layers, so their native bitmaps match the
 * exported pixels (the page view itself is laid out at its logical size and
 * scaled by the native exporter). Capped by the same memory budget.
 */
export function exportRenderScale(plan, metrics, density = PixelRatio.get()) {
  const target = plan.pdf ? PDF_PIXEL_WIDTH : plan.pixelWidth;
  const k = target / (metrics.width * density);
  return Math.max(1, renderScaleFor(k, metrics.width, metrics.minHeight, density));
}

/**
 * Why a document cannot be exported yet, or null. A document written in a
 * personal handwriting is exported only once that exact version is
 * resolved — never while loading (blank pages) and never when it is
 * missing or invalid (that would export a different handwriting or none).
 */
export function exportBlocker(paged) {
  const h = paged && paged.handwriting;
  if (!h || h.status === 'ok') {
    return null;
  }
  return h.status === 'loading'
    ? 'The personal handwriting of this document is still loading. Try exporting again in a moment.'
    : `Personal handwriting unavailable: ${h.message}`;
}

export default function ExportRenderer({
  plan,
  document,
  paged,
  onProgress,
  onFinish,
  onError,
}) {
  const [step, setStep] = useState(0);
  const pageRef = useRef(null);
  const laidOut = useRef(new Set());
  const waiter = useRef(null);
  const callbacks = useRef({ onProgress, onFinish, onError });
  callbacks.current = { onProgress, onFinish, onError };

  const pageIndex =
    plan.pageIndexes[Math.min(step, plan.pageIndexes.length - 1)];
  const page = paged.pages[pageIndex];

  const onStageLayout = () => {
    laidOut.current.add(step);
    if (waiter.current && waiter.current.step === step) {
      waiter.current.resolve();
      waiter.current = null;
    }
  };

  useEffect(() => {
    let cancelled = false;
    let pdfJob = null;

    // Resolves when the page has laid out — or, as a safety net, after a
    // bounded wait so one missed layout event can never hang an export.
    const showStep = i =>
      new Promise(resolve => {
        if (laidOut.current.has(i)) {
          resolve();
          return;
        }
        const timer = setTimeout(() => {
          if (waiter.current && waiter.current.step === i) {
            waiter.current = null;
          }
          resolve();
        }, LAYOUT_TIMEOUT_MS);
        waiter.current = {
          step: i,
          resolve: () => {
            clearTimeout(timer);
            resolve();
          },
        };
        setStep(i);
      });

    (async () => {
      try {
        const blocked = exportBlocker(paged);
        if (blocked) {
          throw new Error(blocked);
        }
        const directory = `${await getExportDirectory()}/${Date.now()}`;
        const outputs = [];
        if (plan.pdf) {
          pdfJob = await beginPdf(
            `${directory}/${plan.files[0].fileName}`,
            plan.pageSize.width,
            plan.pageSize.height,
          );
        }
        for (let i = 0; i < plan.pageIndexes.length; i++) {
          await showStep(i);
          await nextFrame();
          await nextFrame();
          await delay(i === 0 ? FIRST_PAGE_SETTLE_MS : PAGE_SETTLE_MS);
          if (cancelled) {
            return;
          }
          const tag = findNodeHandle(pageRef.current);
          const started = Date.now();
          if (plan.pdf) {
            await addPdfPage(pdfJob, tag);
          } else {
            const file = plan.files[i];
            outputs.push(
              await captureView(
                tag,
                `${directory}/${file.fileName}`,
                plan.format,
                plan.pixelWidth,
                plan.quality,
              ),
            );
          }
          record(`export ${plan.format} page`, Date.now() - started);
          callbacks.current.onProgress(i + 1, plan.pageIndexes.length);
        }
        if (plan.pdf) {
          const job = pdfJob;
          pdfJob = null;
          outputs.push(await finishPdf(job));
        }
        if (!cancelled) {
          callbacks.current.onFinish(outputs);
        }
      } catch (error) {
        if (pdfJob) {
          cancelPdf(pdfJob);
          pdfJob = null;
        }
        if (!cancelled) {
          callbacks.current.onError(error);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (pdfJob) {
        cancelPdf(pdfJob);
      }
    };
    // One export run per mounted renderer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.stage} pointerEvents="none" testID="export-stage">
      <View key={page.key} onLayout={onStageLayout} collapsable={false}>
        <PaperPage
          ref={pageRef}
          document={document}
          page={page}
          layout={paged.layout}
          metrics={paged.metrics}
          rowHeight={paged.rowHeight}
          width={paged.metrics.width}
          pageCount={paged.pages.length}
          ink={document.ink ? document.ink[page.key] : undefined}
          renderScale={exportRenderScale(plan, paged.metrics)}
          bare
          testID="export-page"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Rendered under the progress dialog at its true size.
  stage: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});
