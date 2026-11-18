/**
 * Phase 10: issues found reviewing how the app renders on real devices.
 *
 * - Path data must parse with react-native-svg's *native* parsers (Android
 *   PathParser.java, iOS RNSVGPathParser.mm), not just in a browser.
 * - Android/iOS draw each <Svg> into a bitmap of its layout size; pages are
 *   scaled with a view transform, so Svgs are laid out at the shown (or
 *   exported) size and shrunk back — otherwise ink and handwriting blur.
 * - Zoom/pan: levels, pinch, two-finger pan, strokes landing on the same
 *   document spot at any zoom, export unaffected.
 */
import React from 'react';
import { PixelRatio } from 'react-native';
import { clearAllMockStorages } from '@react-native-async-storage/async-storage';
import Svg from 'react-native-svg';
import { getHandwritingStyle } from '../src/data/handwritingStyles';
import { getPageMetrics, getPageType, rowHeightFor } from '../src/data/paper';
import { baselineInRow } from '../src/components/HandwritingText';
import PaperPage from '../src/components/PaperPage';
import { MAX_SVG_PIXELS, renderScaleFor } from '../src/components/svgScale';
import {
  ZOOM_LEVELS,
  scrollAfterZoom,
  stepZoom,
} from '../src/components/ZoomablePage';
import { exportRenderScale } from '../src/export/ExportRenderer';
import { buildExportPlan, RASTER_WIDTH } from '../src/export/exportPlan';
import { setNativeExporter } from '../src/export/nativeExporter';
import { renderLines } from '../src/handwriting/glyphRender';
import { addPoint, finishStroke, groupStrokes, strokeStyle } from '../src/ink/strokes';
import { createDocument } from '../src/models/document';
import EditorScreen from '../src/screens/EditorScreen';
import { setStorageBackend } from '../src/storage/documentStorage';
import { paginateDocument } from '../src/utils/pagination';
import { layoutHandwriting } from '../src/utils/textLayout';
import { act, byTestId, press, render, restoreRealTimers } from './helpers/render';

const POEM = [
  'The night slips quietly away,',
  'And wakes the gold and blue of day.',
  'A little bird begins to sing,',
  'And shakes the dewdrop from its wing.',
  'The flowers lift their heads to see',
  'The light dance softly through the tree,',
  'And all the world is bright and new,',
  'With morning waiting there for you.',
].join('\n');

beforeEach(() => {
  clearAllMockStorages();
  setStorageBackend(null);
  setNativeExporter(null);
});

// --- Native path grammar --------------------------------------------------------

/**
 * A port of react-native-svg's native path parser grammar (Android
 * PathParser.java ≡ iOS RNSVGPathParser.mm): command letters, numbers as
 * [sign] digits [. digits] | [sign] . digits, implicit command repetition,
 * a path must start with M/m and no number may follow Z. Throws where the
 * native parser would.
 */
function nativeParse(d) {
  const ARGS = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
  let i = 0;
  const n = d.length;
  const space = () => {
    while (i < n && /[\s,]/.test(d[i])) i++;
  };
  const number = () => {
    space();
    const start = i;
    if (d[i] === '-' || d[i] === '+') i++;
    let digits = 0;
    while (i < n && d[i] >= '0' && d[i] <= '9') {
      i++;
      digits++;
    }
    if (d[i] === '.') {
      i++;
      while (i < n && d[i] >= '0' && d[i] <= '9') {
        i++;
        digits++;
      }
    }
    if (!digits) throw new Error(`bad number at ${start}: ${d.slice(start, start + 12)}`);
    return Number(d.slice(start, i));
  };
  let prev = null;
  let segments = 0;
  while (true) {
    space();
    if (i >= n) break;
    let cmd = d[i];
    if (/[A-Za-z]/.test(cmd)) {
      if (!(cmd.toLowerCase() in ARGS)) throw new Error(`bad command ${cmd}`);
      if (!prev && cmd !== 'M' && cmd !== 'm') throw new Error('must start with M');
      i++;
    } else {
      if (!prev) throw new Error('must start with M');
      if (prev === 'z' || prev === 'Z') throw new Error('number after Z');
      cmd = prev === 'M' ? 'L' : prev === 'm' ? 'l' : prev;
    }
    for (let k = 0; k < ARGS[cmd.toLowerCase()]; k++) {
      if (!Number.isFinite(number())) throw new Error('not finite');
    }
    prev = cmd;
    segments++;
  }
  return segments;
}

function drawPoem({ quality, corrections } = {}) {
  const style = getHandwritingStyle('reference_student');
  const metrics = getPageMetrics({ pageType: 'lined' });
  const rowHeight = rowHeightFor(getPageType('lined'), metrics, style);
  const text = corrections ? `${POEM}\n${POEM}\n${POEM}` : POEM;
  const layout = layoutHandwriting(text, style, {
    fontSize: metrics.fontSize,
    contentWidth: metrics.contentWidth,
    lineHeight: rowHeight,
    seed: 'doc-device',
    corrections,
    formatting: { headings: [{ start: 0, end: 29, underline: true }], underlines: [], labels: [], autoLabels: true },
  });
  return renderLines(layout.lines, {
    profile: style,
    layout,
    rowHeight,
    baselineInRow: baselineInRow(rowHeight, style, layout.fontSize),
    ink: { floor: 0.86, strength: 1 },
    quality,
  });
}

describe('native path parsing', () => {
  it('the parser port rejects what the native parsers reject', () => {
    expect(() => nativeParse('L1 2')).toThrow();
    expect(() => nativeParse('M1 2z3 4')).toThrow();
    expect(() => nativeParse('M1 2q.')).toThrow();
    expect(nativeParse('M1 2q1.2-.3 .5.6 1 1 2 2z')).toBe(4);
  });

  it('parses every handwriting, correction, underline and thumbnail path', () => {
    for (const drawn of [
      drawPoem(),
      drawPoem({ quality: 'preview' }),
      drawPoem({ corrections: true }),
      drawPoem({ corrections: true, quality: 'preview' }),
    ]) {
      for (const b of drawn.buckets) {
        expect(nativeParse(b.d)).toBeGreaterThan(0);
      }
      for (const u of drawn.underlines) {
        expect(nativeParse(u.d)).toBeGreaterThan(0);
      }
    }
  });

  it('parses freehand ink paths', () => {
    const buffer = { points: [], pressure: null };
    for (let k = 0; k < 40; k++) addPoint(buffer, 10 + k * 3.3, 20 + Math.sin(k / 3) * 9);
    const strokes = [
      finishStroke(buffer, strokeStyle('pen', { width: 2 }), 'a'),
      finishStroke(buffer, strokeStyle('marker', {}), 'b'),
    ];
    groupStrokes(strokes).forEach(g => expect(nativeParse(g.d)).toBeGreaterThan(0));
  });
});

// --- Sharp bitmaps ------------------------------------------------------------------

describe('native bitmap resolution', () => {
  const metrics = getPageMetrics({ pageType: 'lined' });

  it('renders at the shown size, capped by a memory budget', () => {
    expect(renderScaleFor(1.1, 360, 509, 2.75)).toBe(1.1);
    expect(renderScaleFor(0.3, 360, 509, 2.75)).toBe(0.3);
    const capped = renderScaleFor(3.3, 360, 509, 2.75);
    expect(capped).toBeLessThan(3.3);
    expect(360 * 509 * (capped * 2.75) ** 2).toBeLessThanOrEqual(MAX_SVG_PIXELS * 1.05);
  });

  async function pageAt(width) {
    const doc = { ...createDocument(), content: POEM };
    const style = getHandwritingStyle(doc.handwritingStyle);
    const rowHeight = rowHeightFor(getPageType('lined'), metrics, style);
    const paged = paginateDocument({ content: doc.content, style, metrics, rowHeight, seed: doc.id });
    return render(
      <PaperPage
        document={doc}
        page={paged.pages[0]}
        layout={paged.layout}
        metrics={metrics}
        rowHeight={rowHeight}
        width={width}
      />,
    );
  }
  const svgs = r => r.root.findAll(n => n.type === Svg);
  const flatten = style => Object.assign({}, ...[].concat(style).flat(Infinity).filter(Boolean));

  it('lays the handwriting Svg out at the shown size and shrinks it back', async () => {
    const k = renderScaleFor(2, metrics.width, metrics.minHeight);
    const r = await pageAt(metrics.width * 2);
    const ink = svgs(r).find(n => n.props.testID === 'handwriting-ink');
    expect(ink.props.width).toBeCloseTo((metrics.contentWidth + 48) * k, 3);
    // Same drawing: the viewBox is the logical box.
    expect(ink.props.viewBox).toBe(`-24 -24 ${metrics.contentWidth + 48} ${ink.props.height / k}`);
    const st = flatten(ink.props.style);
    expect(st.transform).toEqual([{ scale: 1 / k }]);
    expect(st.transformOrigin).toBe('top left');
  });

  it('draws thumbnails into smaller bitmaps', async () => {
    const r = await pageAt(metrics.width * 0.3);
    const ink = svgs(r).find(n => n.props.testID === 'handwriting-ink');
    expect(ink.props.width).toBeLessThan(metrics.contentWidth + 48);
  });

  it('exports at the export resolution, not the screen one', () => {
    const d = PixelRatio.get();
    const png = exportRenderScale(buildExportPlan({ title: 'T', format: 'png', pageCount: 1 }), metrics, d);
    expect(png).toBeCloseTo(Math.max(1, Math.round((RASTER_WIDTH / (metrics.width * d)) * 20) / 20), 5);
    const pdf = exportRenderScale(buildExportPlan({ title: 'T', format: 'pdf', pageCount: 1 }), metrics, 1);
    expect(pdf).toBeGreaterThan(1);
    // On a dense screen it never goes below 1 (the page's own size).
    expect(exportRenderScale(buildExportPlan({ title: 'T', format: 'png', pageCount: 1 }), metrics, 4)).toBe(1);
  });
});

// --- Zoom -------------------------------------------------------------------------------

describe('zoom maths', () => {
  it('steps through 0.75×, 1×, 1.5×, 2×, 3×', () => {
    expect(ZOOM_LEVELS).toEqual([0.75, 1, 1.5, 2, 3]);
    expect(stepZoom(1, 1)).toBe(1.5);
    expect(stepZoom(1.5, 1)).toBe(2);
    expect(stepZoom(3, 1)).toBe(3);
    expect(stepZoom(1, -1)).toBe(0.75);
    expect(stepZoom(0.75, -1)).toBe(0.75);
    expect(stepZoom(1.7, -1)).toBe(1.5); // after a pinch
  });

  it('keeps the point under the fingers in place', () => {
    const focal = { x: 150, y: 300 };
    const before = { scroll: { x: 40, y: 120 }, inset: 16, z: 1.5 };
    const z1 = 2.4;
    const insetAfter = 16;
    const s = scrollAfterZoom({
      z0: before.z,
      z1,
      focal,
      scroll: before.scroll,
      insets: { x0: before.inset, x1: insetAfter },
      top: 8,
    });
    // Page coordinate (unzoomed) under the focal point, before and after.
    const docX0 = (before.scroll.x + focal.x - before.inset) / before.z;
    const docX1 = (s.x + focal.x - insetAfter) / z1;
    const docY0 = (before.scroll.y + focal.y - 8) / before.z;
    const docY1 = (s.y + focal.y - 8) / z1;
    expect(docX1).toBeCloseTo(docX0, 6);
    expect(docY1).toBeCloseTo(docY0, 6);
  });
});

describe('zoom in the editor', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => restoreRealTimers(jest));

  let clock = 0;
  /** A responder event with the given touches ([x, y] in page coordinates). */
  function touches(points) {
    clock += 16;
    const list = points.map(([x, y], identifier) => ({
      pageX: x,
      pageY: y,
      locationX: x,
      locationY: y,
      identifier,
      timestamp: clock,
    }));
    return {
      nativeEvent: { ...list[0], touches: list, changedTouches: list },
      touchHistory: {
        numberActiveTouches: list.length,
        indexOfSingleActiveTouch: 0,
        mostRecentTimeStamp: clock,
        touchBank: list.map(t => ({
          touchActive: true,
          startPageX: t.pageX,
          startPageY: t.pageY,
          startTimeStamp: clock,
          currentPageX: t.pageX,
          currentPageY: t.pageY,
          currentTimeStamp: clock,
          previousPageX: t.pageX,
          previousPageY: t.pageY,
          previousTimeStamp: clock,
        })),
      },
    };
  }

  async function open() {
    const doc = { ...createDocument(), content: POEM };
    const r = await render(<EditorScreen initialDocument={doc} onClose={jest.fn()} />);
    return r;
  }
  const page = r => r.root.findAll(n => n.props.testID === 'paper-canvas' && n.props.metrics)[0];
  const label = r => byTestId(r, 'zoom-reset', 'accessibilityLabel').props.accessibilityLabel;
  const inkOn = r => page(r).props.ink || [];

  it('zooms with the buttons and resets', async () => {
    const r = await open();
    const base = page(r).props.width;
    await press(r, 'zoom-in');
    expect(page(r).props.width).toBeCloseTo(base * 1.5, 5);
    expect(label(r)).toMatch(/^Zoom 150 percent/);
    await press(r, 'zoom-in');
    await press(r, 'zoom-in');
    expect(page(r).props.width).toBeCloseTo(base * 3, 5);
    await press(r, 'zoom-reset');
    expect(page(r).props.width).toBeCloseTo(base, 5);
    await press(r, 'zoom-out');
    expect(page(r).props.width).toBeCloseTo(base * 0.75, 5);
  });

  /** Draws through page points, converted to screen at the current zoom. */
  async function drawAt(r, pagePoints) {
    const surface = r.root.findAll(n => n.props.testID === 'drawing-surface' && n.props.onResponderGrant)[0];
    const scale = page(r).props.width / page(r).props.metrics.width;
    const screen = pagePoints.map(([x, y]) => [x * scale, y * scale]);
    await act(async () => surface.props.onResponderGrant(touches([screen[0]])));
    for (const p of screen.slice(1)) {
      await act(async () => surface.props.onResponderMove(touches([p])));
    }
    await act(async () => surface.props.onResponderRelease(touches([screen[screen.length - 1]])));
  }

  it('puts a stroke on the same document spot at 1×, 2× and 3×', async () => {
    const r = await open();
    await press(r, 'toolbar-tool-pen');
    const path = Array.from({ length: 12 }, (_, i) => [60 + i * 6, 120 + (i % 3)]);
    await drawAt(r, path);
    await press(r, 'zoom-in');
    await press(r, 'zoom-in'); // 2×
    await drawAt(r, path);
    await press(r, 'zoom-in'); // 3×
    await drawAt(r, path);
    await press(r, 'zoom-reset');
    const strokes = inkOn(r);
    expect(strokes).toHaveLength(3);
    const first = strokes[0].points;
    for (const s of strokes.slice(1)) {
      expect(s.points.length).toBeGreaterThan(4);
      // Same start and end on the page (within capture smoothing).
      expect(Math.abs(s.points[0] - first[0])).toBeLessThan(0.6);
      expect(Math.abs(s.points[1] - first[1])).toBeLessThan(0.6);
      expect(Math.abs(s.points[s.points.length - 2] - first[first.length - 2])).toBeLessThan(1);
    }
  });

  it('pinches to zoom with two fingers', async () => {
    const r = await open();
    const zoomable = r.root.findAll(n => n.props.testID === 'zoomable-page' && n.props.onResponderGrant)[0];
    const base = page(r).props.width;
    await act(async () => zoomable.props.onResponderGrant(touches([[100, 300], [200, 300]])));
    await act(async () => zoomable.props.onResponderMove(touches([[50, 300], [250, 300]])));
    await act(async () => zoomable.props.onResponderRelease(touches([[50, 300], [250, 300]])));
    expect(page(r).props.width).toBeCloseTo(base * 2, 3);
    // Never beyond the range, however far the fingers spread.
    await act(async () => zoomable.props.onResponderGrant(touches([[100, 300], [110, 300]])));
    await act(async () => zoomable.props.onResponderMove(touches([[0, 300], [400, 300]])));
    await act(async () => zoomable.props.onResponderRelease(touches([[0, 300], [400, 300]])));
    expect(page(r).props.width).toBeCloseTo(base * 3, 3);
  });

  it('claims two-finger gestures only', async () => {
    const r = await open();
    const zoomable = r.root.findAll(n => n.props.testID === 'zoomable-page' && n.props.onMoveShouldSetResponderCapture)[0];
    expect(zoomable.props.onMoveShouldSetResponderCapture(touches([[10, 10]]))).toBe(false);
    expect(zoomable.props.onMoveShouldSetResponderCapture(touches([[10, 10], [60, 10]]))).toBe(true);
  });

  it('a second finger cancels a stroke in progress (no stray mark)', async () => {
    const r = await open();
    await press(r, 'toolbar-tool-pen');
    const surface = r.root.findAll(n => n.props.testID === 'drawing-surface' && n.props.onResponderGrant)[0];
    await act(async () => surface.props.onResponderGrant(touches([[40, 100]])));
    await act(async () => surface.props.onResponderMove(touches([[60, 104]])));
    // Zoom takes over: the surface lets go and drops the stroke.
    expect(surface.props.onResponderTerminationRequest(touches([[60, 104], [160, 104]]))).toBe(true);
    expect(surface.props.onResponderTerminationRequest(touches([[60, 104]]))).toBe(false);
    await act(async () => surface.props.onResponderTerminate(touches([[60, 104], [160, 104]])));
    expect(inkOn(r)).toEqual([]);
  });
});

// --- Validation tools ---------------------------------------------------------------

describe('device validation tools', () => {
  const { VALIDATION_DOCS, buildValidationDocument, POEM: POEM_DOC } = require('../src/dev/validationDocs');
  const { measure, perfSummary, resetPerf, setPerfEnabled } = require('../src/dev/perf');
  const { normalizeDocument } = require('../src/models/document');
  const { splitSheets } = require('../src/utils/pagination');
  const ValidationScreen = require('../src/screens/ValidationScreen').default;
  const { getDocument } = require('../src/storage/documentStorage');

  it('builds valid documents for every check', () => {
    expect(POEM_DOC).toBe(POEM);
    const byKey = Object.fromEntries(VALIDATION_DOCS.map(e => [e.key, normalizeDocument(buildValidationDocument(e))]));
    expect(byKey.poem.content).toBe(POEM);
    expect(byKey.poem).toMatchObject({ pageType: 'lined', pen: 'blue', handwritingStyle: 'reference_student' });
    for (const n of [500, 1000, 2500, 5000]) {
      expect(Math.abs(byKey[`chars-${n}`].content.length - n)).toBeLessThan(3);
    }
    for (const n of [2, 3, 5]) {
      expect(splitSheets(byKey[`pages-${n}`].content)).toHaveLength(n);
      expect(Object.keys(byKey[`pages-${n}`].ink).length).toBe(2);
    }
    for (const n of [100, 500, 1000]) {
      // Freehand strokes survive normalisation (what saving does).
      expect(byKey[`strokes-${n}`].ink['page-1#0']).toHaveLength(n);
    }
    expect(byKey.corrections.naturalCorrections).toBe(true);
  });

  it('creates and opens a test document', async () => {
    const onOpen = jest.fn();
    const r = await render(<ValidationScreen onBack={jest.fn()} onOpenDocument={onOpen} />);
    await press(r, 'validation-strokes-100');
    expect(onOpen).toHaveBeenCalledTimes(1);
    const saved = await getDocument(onOpen.mock.calls[0][0]);
    expect(saved.content).toBe(POEM);
    expect(saved.ink['page-1#0']).toHaveLength(100);
  });

  it('records timings only when enabled', () => {
    resetPerf();
    setPerfEnabled(false);
    expect(measure('x', () => 7)).toBe(7);
    expect(perfSummary()).toEqual([]);
    setPerfEnabled(true);
    measure('x', () => 1, 10);
    measure('x', () => 2, 20);
    const [row] = perfSummary();
    expect(row).toMatchObject({ label: 'x', count: 2, size: 20 });
    expect(row.max).toBeGreaterThanOrEqual(row.median);
    resetPerf();
  });
});
