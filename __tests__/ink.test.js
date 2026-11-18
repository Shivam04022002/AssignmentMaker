/**
 * Phase 6: freehand pen, marker, eraser, smoothing, pressure, coordinates,
 * pages, history, persistence, export and performance.
 */
import React from 'react';
import { clearAllMockStorages } from '@react-native-async-storage/async-storage';
import { getHandwritingStyle } from '../src/data/handwritingStyles';
import { getPageMetrics, getPageType, rowHeightFor } from '../src/data/paper';
import { buildExportPlan } from '../src/export/exportPlan';
import ExportRenderer from '../src/export/ExportRenderer';
import { setNativeExporter } from '../src/export/nativeExporter';
import {
  DEFAULT_TOOLS,
  ERASER_SIZES,
  MARKER_COLORS,
  MARKER_OPACITY,
  MIN_OPACITY,
  PEN_COLORS,
  addPoint,
  centerlinePath,
  eraseStrokes,
  finishStroke,
  groupStrokes,
  hasRealPressure,
  inkChunks,
  inkSignature,
  normalizeInk,
  outlinePath,
  pageToScreen,
  pressureWidth,
  remapInk,
  screenToPage,
  simplifyIndices,
  smoothPoints,
  strokeStyle,
} from '../src/ink/strokes';
import PaperPage from '../src/components/PaperPage';
import { createDocument, normalizeDocument } from '../src/models/document';
import EditorScreen from '../src/screens/EditorScreen';
import {
  getDocument,
  getStorageBackend,
  saveDocument,
  setStorageBackend,
} from '../src/storage/documentStorage';
import { deletePage, movePage } from '../src/utils/pageOps';
import {
  PAGE_BREAK,
  normalizePageIds,
  paginateDocument,
  splitSheets,
} from '../src/utils/pagination';
import {
  act,
  byTestId,
  changeText,
  press,
  render,
  restoreRealTimers,
} from './helpers/render';

/** A responder event as React Native's touch system delivers it. */
let clock = 1;
function touchEvent(x, y, touches = 1) {
  // PanResponder ignores moves that are not newer than the last one, and
  // fake timers freeze Date.now(): give every event its own timestamp.
  clock += 16;
  const now = clock;
  const record = {
    touchActive: true,
    startPageX: x,
    startPageY: y,
    startTimeStamp: now,
    currentPageX: x,
    currentPageY: y,
    currentTimeStamp: now,
    previousPageX: x,
    previousPageY: y,
    previousTimeStamp: now,
  };
  return {
    nativeEvent: {
      locationX: x,
      locationY: y,
      pageX: x,
      pageY: y,
      touches: Array.from({ length: touches }, () => ({})),
      changedTouches: [],
      identifier: 0,
      timestamp: now,
    },
    touchHistory: {
      numberActiveTouches: touches,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: now,
      touchBank: [record],
    },
  };
}

const BLUE = '#123A8C';
const BLACK = '#151515';

/** A finished stroke through the given [x, y] points. */
function stroke(points, tool = 'pen', settings = {}, id) {
  const buffer = { points: [], pressure: null };
  points.forEach(([x, y]) => addPoint(buffer, x, y));
  return finishStroke(buffer, strokeStyle(tool, settings), id);
}
const line = (x0, y0, x1, y1, steps = 20) =>
  Array.from({ length: steps + 1 }, (_, i) => [
    x0 + ((x1 - x0) * i) / steps,
    y0 + ((y1 - y0) * i) / steps,
  ]);

beforeEach(() => {
  clearAllMockStorages();
  setStorageBackend(null);
  setNativeExporter(null);
});

describe('pen', () => {
  it('creates a stroke with colour, thickness, opacity and points', () => {
    const s = stroke(
      line(10, 10, 100, 40),
      'pen',
      { color: BLACK, width: 4, opacity: 0.7 },
      'a',
    );
    expect(s).toMatchObject({
      id: 'a',
      tool: 'pen',
      color: BLACK,
      width: 4,
      opacity: 0.7,
    });
    expect(s.points.length % 2).toBe(0);
    expect(s.points.slice(0, 2)).toEqual([10, 10]);
    expect(s.points.slice(-2)).toEqual([100, 40]);
  });

  it('defaults to a blue 2 px fully opaque pen', () => {
    expect(DEFAULT_TOOLS.pen).toEqual({ color: BLUE, width: 2, opacity: 1 });
    expect(PEN_COLORS.map(c => c.color)).toEqual([BLUE, BLACK]);
  });

  it('never makes invisible or extreme strokes', () => {
    expect(strokeStyle('pen', { opacity: 0.05 }).opacity).toBe(MIN_OPACITY);
    expect(strokeStyle('pen', { width: 99 }).width).toBeLessThanOrEqual(12);
  });

  it('turns a tap into a dot', () => {
    const s = stroke([[50, 50]]);
    expect(s.points.length).toBe(4);
    expect(centerlinePath(s.points)).toMatch(/^M50 50/);
  });
});

describe('smoothing', () => {
  it('drops jitter points closer than the minimum distance', () => {
    const b = { points: [], pressure: null };
    [
      [0, 0],
      [0.1, 0.1],
      [0.2, 0],
      [5, 5],
    ].forEach(([x, y]) => addPoint(b, x, y));
    expect(b.points).toEqual([0, 0, 5, 5]);
  });

  it('smooths a wobbly line but keeps its ends and corners', () => {
    const wobble = [0, 0, 10, 1, 20, -1, 30, 1, 40, 0];
    const smooth = smoothPoints(wobble);
    expect(smooth.slice(0, 2)).toEqual([0, 0]);
    expect(smooth.slice(-2)).toEqual([40, 0]);
    expect(Math.abs(smooth[3])).toBeLessThan(1);
    const corner = [0, 0, 10, 0, 20, 0, 20, 10, 20, 20];
    expect(smoothPoints(corner)[4]).toBe(20); // the 90° corner stays put
    expect(smoothPoints(corner)[5]).toBe(0);
  });

  it('simplifies straight runs but not curves', () => {
    const straight = line(0, 0, 100, 0, 50).flat();
    expect(simplifyIndices(straight, 0.15)).toEqual([0, 50]);
    const curve = Array.from({ length: 40 }, (_, i) => [
      i * 2,
      Math.sin(i / 5) * 20,
    ]).flat();
    expect(simplifyIndices(curve, 0.15).length).toBeGreaterThan(10);
  });

  it('keeps long and fast strokes complete', () => {
    const fast = stroke(line(0, 0, 300, 200, 6)); // few, far-apart samples
    expect(fast.points.slice(-2)).toEqual([300, 200]);
    const long = stroke(
      Array.from({ length: 2000 }, (_, i) => [
        i * 0.15,
        50 + Math.sin(i / 30) * 30,
      ]),
    );
    expect(long.points.length).toBeGreaterThan(20);
    expect(long.points.length).toBeLessThan(2000);
  });
});

describe('pressure', () => {
  it('uses pressure only when the device really reports it', () => {
    expect(hasRealPressure(null)).toBe(false);
    expect(hasRealPressure([0.5, 0.5, 0.5])).toBe(false); // finger: constant
    expect(hasRealPressure([0.2, 0.5, 0.9])).toBe(true);
    const b = { points: [], pressure: [] };
    line(0, 0, 50, 0, 10).forEach(([x, y], i) =>
      addPoint(b, x, y, 0.2 + i * 0.07),
    );
    const s = finishStroke(b, strokeStyle('pen', {}));
    expect(s.pressure).toBeDefined();
    const flat = { points: [], pressure: [] };
    line(0, 0, 50, 0, 10).forEach(([x, y]) => addPoint(flat, x, y, 0.5));
    expect(finishStroke(flat, strokeStyle('pen', {})).pressure).toBeUndefined();
  });

  it('varies width within a controlled range', () => {
    expect(pressureWidth(4, 0)).toBe(3);
    expect(pressureWidth(4, 0.5)).toBe(4);
    expect(pressureWidth(4, 1)).toBe(5);
    expect(outlinePath([0, 0, 10, 0], [0.2, 0.9], 4)).toMatch(/Z$/);
  });
});

describe('marker', () => {
  it('is wide, semi-transparent and available in four colours', () => {
    const m = stroke(line(0, 0, 80, 0), 'marker', {
      color: MARKER_COLORS[2].color,
    });
    expect(m.tool).toBe('marker');
    expect(m.width).toBeGreaterThanOrEqual(12);
    expect(m.width).toBeLessThanOrEqual(20);
    expect(m.opacity).toBe(MARKER_OPACITY);
    expect(MARKER_OPACITY).toBeGreaterThanOrEqual(0.3);
    expect(MARKER_OPACITY).toBeLessThanOrEqual(0.45);
    expect(MARKER_COLORS.map(c => c.id)).toEqual([
      'yellow',
      'blue',
      'pink',
      'green',
    ]);
  });

  it('keeps overlapping highlights as separate layers so overlaps deepen', () => {
    const a = stroke(line(0, 0, 80, 0), 'marker', {}, 'm1');
    const b = stroke(line(40, 0, 120, 0), 'marker', {}, 'm2');
    const groups = groupStrokes([a, b]);
    expect(groups).toHaveLength(2);
    // Combined alpha where they overlap: stronger, never opaque.
    const overlap = 1 - (1 - MARKER_OPACITY) ** 2;
    expect(overlap).toBeGreaterThan(MARKER_OPACITY);
    expect(overlap).toBeLessThan(0.7);
  });

  it('is drawn beneath the typed handwriting, pen ink above it', async () => {
    const doc = {
      ...createDocument(),
      content: 'Important text',
      ink: {
        'page-1#0': [
          stroke(line(40, 60, 200, 60), 'marker', {}, 'm'),
          stroke(line(40, 90, 200, 90), 'pen', {}, 'p'),
        ],
      },
    };
    const style = getHandwritingStyle(doc.handwritingStyle);
    const metrics = getPageMetrics({ pageType: doc.pageType });
    const rowHeight = rowHeightFor(getPageType(doc.pageType), metrics, style);
    const paged = paginateDocument({
      ...doc,
      style,
      metrics,
      rowHeight,
      seed: doc.id,
    });
    const r = await render(
      <PaperPage
        document={doc}
        page={paged.pages[0]}
        layout={paged.layout}
        metrics={metrics}
        rowHeight={rowHeight}
        width={360}
        ink={doc.ink['page-1#0']}
      />,
    );
    const order = r.root
      .findAll(
        n =>
          typeof n.type === 'string' &&
          ['ink-marker', 'handwriting-text', 'ink-pen'].includes(
            n.props.testID,
          ),
      )
      .map(n => n.props.testID)
      .filter((id, i, all) => all.indexOf(id) === i);
    expect(order).toEqual(['ink-marker', 'handwriting-text', 'ink-pen']);
  });
});

describe('eraser', () => {
  const pen = stroke(line(0, 50, 200, 50, 40), 'pen', {}, 'p');

  it('cuts strokes where the eraser passed, keeping both sides', () => {
    const result = eraseStrokes([pen], [100, 40, 100, 60], 5);
    expect(result).toHaveLength(2);
    expect(result.map(s => s.id)).toEqual(['p.0', 'p.1']);
    expect(
      Math.max(...result[0].points.filter((_, i) => i % 2 === 0)),
    ).toBeLessThan(96);
    expect(
      Math.min(...result[1].points.filter((_, i) => i % 2 === 0)),
    ).toBeGreaterThan(104);
  });

  it('removes strokes completely covered and leaves others untouched', () => {
    const dot = stroke([[300, 300]], 'pen', {}, 'dot');
    const far = stroke(line(0, 200, 50, 200), 'pen', {}, 'far');
    const result = eraseStrokes([dot, far], [300, 300], 6);
    expect(result).toEqual([far]);
    const untouched = [far];
    expect(eraseStrokes(untouched, [300, 300], 6)).toBe(untouched);
  });

  it('catches a stroke crossing between two sparse points', () => {
    const sparse = {
      id: 's',
      tool: 'pen',
      color: BLUE,
      width: 2,
      opacity: 1,
      points: [0, 0, 200, 0],
    };
    expect(eraseStrokes([sparse], [100, 0], 4)).not.toEqual([sparse]);
  });

  it('erases marker ink too, but typed handwriting is not ink at all', () => {
    const marker = stroke(line(0, 0, 100, 0), 'marker', {}, 'm');
    expect(eraseStrokes([marker], [50, 0], 5)).not.toEqual([marker]);
    // The eraser only ever receives freehand strokes; typed text lives in
    // `content`, which erasing never touches (see editor test below).
  });

  it('offers small, medium and large sizes', () => {
    expect(ERASER_SIZES.map(s => s.id)).toEqual(['small', 'medium', 'large']);
    expect(ERASER_SIZES[0].radius).toBeLessThan(ERASER_SIZES[2].radius);
  });
});

describe('coordinates', () => {
  it('converts screen points to page coordinates and back', () => {
    const t = { scale: 0.9, offsetX: 12, offsetY: 30 };
    expect(screenToPage({ x: 102, y: 120 }, t)).toEqual({ x: 100, y: 100 });
    expect(pageToScreen({ x: 100, y: 100 }, t)).toEqual({ x: 102, y: 120 });
  });

  it('stores the same page position whatever size the page is shown at', () => {
    const phone = screenToPage({ x: 90, y: 180 }, { scale: 0.9 });
    const tablet = screenToPage({ x: 200, y: 400 }, { scale: 2 });
    expect(phone).toEqual({ x: 100, y: 200 });
    expect(tablet).toEqual({ x: 100, y: 200 });
  });
});

describe('rendering performance', () => {
  const many = n =>
    Array.from({ length: n }, (_, i) =>
      stroke(
        line(
          10 + (i % 30) * 10,
          10 + (Math.floor(i / 30) % 50) * 10,
          18 + (i % 30) * 10,
          14 + (Math.floor(i / 30) % 50) * 10,
          6,
        ),
        'pen',
        {},
        `s${i}`,
      ),
    );

  it.each([100, 500, 1000, 5000])(
    'groups %i pen strokes into a handful of paths',
    n => {
      const strokes = many(n);
      const started = Date.now();
      const groups = groupStrokes(strokes);
      expect(groups.length).toBeLessThanOrEqual(Math.ceil(n / 150));
      expect(Date.now() - started).toBeLessThan(3000);
    },
  );

  it('simplifies strokes for thumbnails', () => {
    const wiggle = stroke(
      Array.from({ length: 300 }, (_, i) => [i, 50 + Math.sin(i / 3) * 2]),
    );
    const full = groupStrokes([wiggle])[0].d.length;
    const thumb = groupStrokes([wiggle], { thumbnail: true })[0].d.length;
    expect(thumb).toBeLessThan(full);
  });
});

describe('pages', () => {
  function pages(doc) {
    const style = getHandwritingStyle('neat');
    const metrics = getPageMetrics({ pageType: 'lined' });
    const rowHeight = rowHeightFor(getPageType('lined'), metrics, style);
    return paginateDocument({
      ...doc,
      style,
      metrics,
      rowHeight,
      seed: 'd',
      inkChunks: inkChunks(doc.ink),
    }).pages;
  }

  it('keeps strokes with their own page when pages are reordered', () => {
    const doc = {
      content: `A${PAGE_BREAK}B`,
      pageIds: ['a', 'b'],
      formatting: {
        headings: [],
        underlines: [],
        labels: [],
        autoLabels: true,
      },
      ink: {
        'a#0': [stroke(line(0, 0, 10, 10), 'pen', {}, 'onA')],
        'b#0': [stroke(line(0, 0, 10, 10), 'pen', {}, 'onB')],
      },
    };
    const moved = movePage(doc, pages(doc), 0, 1);
    const ink = remapInk(doc.ink, moved.keyMap);
    const after = pages({ ...moved.doc, ink });
    expect(after.map(p => p.text)).toEqual(['B', 'A']);
    expect(ink[after[0].key].map(s => s.id)).toEqual(['onB']);
    expect(ink[after[1].key].map(s => s.id)).toEqual(['onA']);
  });

  it('moves ink of a continuation page to its new page id when split off', () => {
    const long = 'word '.repeat(600).trim();
    const doc = {
      content: long,
      pageIds: ['a'],
      formatting: {
        headings: [],
        underlines: [],
        labels: [],
        autoLabels: true,
      },
      ink: { 'a#1': [stroke(line(0, 0, 10, 10), 'pen', {}, 'onPage2')] },
    };
    const before = pages(doc);
    expect(before.length).toBeGreaterThan(2);
    const moved = movePage(doc, before, 1, 1);
    const ink = remapInk(doc.ink, moved.keyMap);
    const after = pages({ ...moved.doc, ink });
    expect(after[moved.index].text).toBe(before[1].text);
    expect(ink[after[moved.index].key].map(s => s.id)).toEqual(['onPage2']);
  });

  it("drops a deleted page's ink", () => {
    const doc = {
      content: `A${PAGE_BREAK}B`,
      pageIds: ['a', 'b'],
      formatting: {
        headings: [],
        underlines: [],
        labels: [],
        autoLabels: true,
      },
      ink: {
        'a#0': [stroke(line(0, 0, 10, 10))],
        'b#0': [stroke(line(0, 0, 10, 10))],
      },
    };
    const next = deletePage(doc, pages(doc), 1);
    expect(
      Object.keys(remapInk(doc.ink, next.inkKeyMap, next.removedPageKeys)),
    ).toEqual(['a#0']);
  });

  it('keeps a drawn-on page even when its text moves away', () => {
    const doc = {
      content: 'short',
      pageIds: ['a'],
      formatting: null,
      ink: { 'a#2': [stroke(line(0, 0, 10, 10))] },
    };
    const result = pages(doc);
    expect(result.map(p => p.key)).toEqual(['a#0', 'a#1', 'a#2']);
    expect(normalizePageIds(['a'], splitSheets(doc.content).length)).toEqual([
      'a',
    ]);
  });
});

describe('persistence and compatibility', () => {
  it('saves and reopens strokes exactly', async () => {
    const pen = stroke(
      line(12.3, 45.6, 200, 300),
      'pen',
      { color: BLACK, width: 3, opacity: 0.85 },
      'p',
    );
    const marker = stroke(
      line(30, 80, 250, 80),
      'marker',
      { color: MARKER_COLORS[3].color, width: 20 },
      'm',
    );
    const saved = await saveDocument({
      ...createDocument(),
      content: 'Hi',
      ink: { 'page-1#0': [marker, pen] },
    });
    const doc = await getDocument(saved.id);
    expect(doc.ink['page-1#0']).toEqual([marker, pen]);
    expect(inkSignature(doc.ink)).toBe(inkSignature(saved.ink));
  });

  it('opens documents that have no strokes', async () => {
    const legacy = {
      id: 'old',
      title: 'Old',
      content: 'Text',
      pageType: 'lined',
      pen: 'blue',
      handwritingStyle: 'neat',
      createdAt: 1,
      updatedAt: 1,
    };
    await getStorageBackend().setItem('document:old', JSON.stringify(legacy));
    expect((await getDocument('old')).ink).toEqual({});
  });

  it('accepts strokes in the explicit pages shape and drops broken ones', () => {
    const doc = normalizeDocument({
      pages: [
        {
          id: 'x',
          content: 'Hello',
          strokes: [
            {
              id: 's',
              tool: 'pen',
              color: BLUE,
              width: 2,
              opacity: 1,
              points: [0, 0, 5, 5],
            },
            { points: [1] },
          ],
        },
      ],
    });
    expect(doc.ink).toEqual({
      'x#0': [
        {
          id: 's',
          tool: 'pen',
          color: BLUE,
          width: 2,
          opacity: 1,
          points: [0, 0, 5, 5],
        },
      ],
    });
    expect(normalizeInk({ k: 'nope', j: [] })).toEqual({});
  });
});

describe('editor', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => restoreRealTimers(jest));

  async function open(content = 'Typed words', extra = {}) {
    const doc = { ...createDocument(), content, ...extra };
    const r = await render(
      <EditorScreen initialDocument={doc} onClose={jest.fn()} />,
    );
    return { r, doc };
  }

  /** Simulates a finger stroke on the drawing surface (view coordinates). */
  async function drag(r, pointsOnScreen) {
    const surface = r.root.findAll(
      n => n.props.testID === 'drawing-surface' && n.props.onResponderGrant,
    )[0];
    const ev = ([x, y], touches = 1) => touchEvent(x, y, touches);
    await act(async () => {
      surface.props.onResponderGrant(ev(pointsOnScreen[0]));
    });
    for (const p of pointsOnScreen.slice(1)) {
      await act(async () => {
        surface.props.onResponderMove(ev(p));
      });
    }
    await act(async () => {
      surface.props.onResponderRelease(
        ev(pointsOnScreen[pointsOnScreen.length - 1]),
      );
    });
  }
  const paperScale = r => {
    const page = r.root.findAll(
      n => n.props.testID === 'paper-canvas' && n.props.metrics,
    )[0];
    return page.props.width / page.props.metrics.width;
  };
  const inkOn = r => {
    const page = r.root.findAll(
      n => n.props.testID === 'paper-canvas' && n.props.metrics,
    )[0];
    return page.props.ink || [];
  };

  it('draws with the pen in page coordinates, keeping typed text', async () => {
    const { r, doc } = await open();
    await press(r, 'toolbar-tool-pen');
    expect(
      byTestId(r, 'toolbar-tool-pen', 'accessibilityState').props
        .accessibilityState.selected,
    ).toBe(true);
    await press(r, 'ink-pen-black');
    await press(r, 'pen-width-4');
    await press(r, 'pen-opacity-70');
    const s = paperScale(r);
    await drag(r, line(50 * s, 100 * s, 150 * s, 120 * s, 10));
    const strokes = inkOn(r);
    expect(strokes).toHaveLength(1);
    expect(strokes[0]).toMatchObject({
      tool: 'pen',
      color: BLACK,
      width: 4,
      opacity: 0.7,
    });
    expect(strokes[0].points[0]).toBeCloseTo(50, 0);
    expect(strokes[0].points[1]).toBeCloseTo(100, 0);
    await press(r, 'save-button');
    const stored = await getDocument(doc.id);
    expect(stored.content).toBe('Typed words');
    expect(stored.ink['page-1#0']).toHaveLength(1);
  });

  it('changing pen colour does not recolour existing strokes or typed text', async () => {
    const { r, doc } = await open();
    await press(r, 'toolbar-tool-pen');
    const s = paperScale(r);
    await drag(r, line(20 * s, 20 * s, 80 * s, 20 * s, 6));
    await press(r, 'ink-pen-black');
    await drag(r, line(20 * s, 60 * s, 80 * s, 60 * s, 6));
    expect(inkOn(r).map(x => x.color)).toEqual([BLUE, BLACK]);
    await press(r, 'save-button');
    expect((await getDocument(doc.id)).pen).toBe('blue');
  });

  it('highlights with the marker and erases only freehand ink', async () => {
    const { r, doc } = await open();
    const s = paperScale(r);
    await press(r, 'toolbar-tool-marker');
    await press(r, 'marker-pink');
    await drag(r, line(40 * s, 70 * s, 220 * s, 70 * s, 12));
    expect(inkOn(r)[0]).toMatchObject({
      tool: 'marker',
      color: MARKER_COLORS[2].color,
      opacity: MARKER_OPACITY,
    });
    await press(r, 'toolbar-tool-eraser');
    await press(r, 'eraser-large');
    await drag(r, [
      [130 * s, 50 * s],
      [130 * s, 90 * s],
    ]);
    expect(inkOn(r)).toHaveLength(2); // cut in two
    // Wipe across the typed text: it stays.
    await drag(r, line(40 * s, 50 * s, 300 * s, 50 * s, 30));
    await press(r, 'save-button');
    expect((await getDocument(doc.id)).content).toBe('Typed words');
  });

  it('undoes and redoes text, pen, marker and eraser steps in order', async () => {
    const { r } = await open('');
    await press(r, 'toolbar-edit');
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    await changeText(r, 'text-input', 'Typed');
    const s = paperScale(r);
    await press(r, 'toolbar-tool-pen');
    await drag(r, line(20 * s, 200 * s, 120 * s, 200 * s, 8));
    await press(r, 'toolbar-tool-marker');
    await drag(r, line(20 * s, 250 * s, 120 * s, 250 * s, 8));
    await press(r, 'toolbar-tool-eraser');
    await drag(r, [
      [70 * s, 190 * s],
      [70 * s, 210 * s],
    ]);
    // The pen stroke was cut in two, in place (drawing order is kept).
    expect(inkOn(r).map(x => x.tool)).toEqual(['pen', 'pen', 'marker']);

    await press(r, 'toolbar-undo'); // eraser
    expect(inkOn(r).map(x => x.tool)).toEqual(['pen', 'marker']);
    await press(r, 'toolbar-undo'); // marker
    expect(inkOn(r).map(x => x.tool)).toEqual(['pen']);
    await press(r, 'toolbar-undo'); // pen
    expect(inkOn(r)).toEqual([]);
    await press(r, 'toolbar-edit');
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    expect(byTestId(r, 'text-input', 'value').props.value).toBe('Typed');
    await press(r, 'toolbar-undo'); // text
    expect(byTestId(r, 'text-input', 'value').props.value).toBe('');
    await press(r, 'toolbar-redo');
    await press(r, 'toolbar-redo');
    expect(inkOn(r).map(x => x.tool)).toEqual(['pen']);
  });

  it('a second finger cancels drawing (no accidental strokes)', async () => {
    const { r } = await open();
    await press(r, 'toolbar-tool-pen');
    const surface = r.root.findAll(
      n => n.props.testID === 'drawing-surface' && n.props.onResponderGrant,
    )[0];
    const ev = (x, touches) => touchEvent(x, 50, touches);
    await act(async () => surface.props.onResponderGrant(ev(10, 1)));
    await act(async () => surface.props.onResponderMove(ev(40, 2)));
    await act(async () => surface.props.onResponderRelease(ev(40, 0)));
    expect(inkOn(r)).toEqual([]);
  });

  it('keeps strokes on the page they were drawn on', async () => {
    const { r } = await open(`Page one${PAGE_BREAK}Page two`, {
      pageIds: ['p1', 'p2'],
    });
    await press(r, 'toolbar-tool-pen');
    const s = paperScale(r);
    await drag(r, line(20 * s, 20 * s, 60 * s, 20 * s, 5));
    await press(r, 'page-next');
    expect(inkOn(r)).toEqual([]);
    await drag(r, line(20 * s, 300 * s, 60 * s, 300 * s, 5));
    expect(inkOn(r)).toHaveLength(1);
    await press(r, 'page-prev');
    expect(inkOn(r)).toHaveLength(1);
    expect(inkOn(r)[0].points[1]).toBeCloseTo(20, 0);
  });

  it('shows strokes in page thumbnails (simplified)', async () => {
    const { r } = await open('Text', {
      ink: { 'page-1#0': [stroke(line(10, 10, 100, 100), 'pen', {}, 'x')] },
    });
    await press(r, 'toolbar-pages');
    const thumb = r.root.findAll(
      n => n.props.testID === 'thumb-page-0' && n.props.page,
    )[0];
    expect(thumb.props.ink.map(st => st.id)).toEqual(['x']);
    expect(thumb.props.quality).toBe('preview');
  });
});

describe('export', () => {
  it.each(['pdf', 'png', 'jpg'])(
    'includes freehand ink in %s export pages',
    async format => {
      const pen = stroke(line(10, 10, 100, 100), 'pen', {}, 'p');
      const marker = stroke(line(10, 50, 200, 50), 'marker', {}, 'm');
      const doc = {
        ...createDocument(),
        title: 'Ink',
        content: 'Words',
        ink: { 'page-1#0': [pen, marker] },
      };
      const style = getHandwritingStyle(doc.handwritingStyle);
      const metrics = getPageMetrics({ pageType: doc.pageType });
      const rowHeight = rowHeightFor(getPageType(doc.pageType), metrics, style);
      const paged = {
        ...paginateDocument({
          ...doc,
          style,
          metrics,
          rowHeight,
          seed: doc.id,
        }),
        metrics,
        rowHeight,
      };
      const seen = [];
      let renderer;
      setNativeExporter({
        getExportDirectory: async () => '/x',
        beginPdf: async () => 'job',
        addPdfPage: async () =>
          seen.push(
            renderer.root.findAll(
              n => n.props.testID === 'export-page' && n.props.page,
            )[0].props.ink,
          ),
        finishPdf: async () => '/x/a.pdf',
        cancelPdf: () => {},
        captureView: async (tag, path) => {
          seen.push(
            renderer.root.findAll(
              n => n.props.testID === 'export-page' && n.props.page,
            )[0].props.ink,
          );
          return path;
        },
        share: async () => true,
      });
      let done = false;
      renderer = await render(
        <ExportRenderer
          plan={buildExportPlan({
            title: 'Ink',
            format,
            scope: 'all',
            pageCount: 1,
          })}
          document={doc}
          paged={paged}
          onProgress={() => {}}
          onFinish={() => (done = true)}
          onError={e => {
            throw e;
          }}
        />,
      );
      for (let i = 0; i < 100 && !done; i++) {
        await act(async () => {
          await new Promise(res => setTimeout(res, 10));
        });
      }
      expect(done).toBe(true);
      expect(seen).toEqual([[pen, marker]]);
      // Rendered as vector paths inside the exported page view.
      expect(
        renderer.root.findAll(
          n => n.props.testID === 'ink-pen' && typeof n.type === 'string',
        ).length,
      ).toBeGreaterThan(0);
      expect(
        renderer.root.findAll(
          n => n.props.testID === 'ink-marker' && typeof n.type === 'string',
        ).length,
      ).toBeGreaterThan(0);
    },
    30000,
  );
});
