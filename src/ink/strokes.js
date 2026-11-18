/**
 * Freehand ink: pen and marker strokes drawn with a finger or stylus.
 *
 * Strokes are data, never pixels. They are stored per rendered page in
 * *page coordinates* — the same fixed logical space (PAGE.width units wide)
 * the handwriting is laid out in — so they stay put when the page is shown
 * at another size, zoomed, thumbnailed or exported.
 *
 *   stroke = {
 *     id, tool: 'pen' | 'marker', color, width, opacity,
 *     points: [x0, y0, x1, y1, …]     flat, rounded to 0.1 units
 *     pressure?: [p0, p1, …]           0–1, only when the device reports it
 *   }
 *   document.ink = { [pageKey]: [stroke, …] }   pageKey = rendered page key
 *
 * Everything here is pure and deterministic.
 */

// --- Tools -----------------------------------------------------------------

export const PEN_COLORS = [
  { id: 'blue', label: 'Blue', color: '#123A8C' },
  { id: 'black', label: 'Black', color: '#151515' },
];

export const MARKER_COLORS = [
  { id: 'yellow', label: 'Yellow', color: '#FFE14D' },
  { id: 'blue', label: 'Blue', color: '#7CC8FF' },
  { id: 'pink', label: 'Pink', color: '#FF8FC7' },
  { id: 'green', label: 'Green', color: '#8EE88A' },
];

/** Pen widths in page units (≈ px at phone scale). */
export const PEN_WIDTHS = [1, 2, 3, 4, 6, 8];
export const MARKER_WIDTHS = [12, 16, 20];
export const PEN_OPACITIES = [0.5, 0.7, 0.85, 1];
/** Eraser radius in page units. */
export const ERASER_SIZES = [
  { id: 'small', label: 'Small', radius: 5 },
  { id: 'medium', label: 'Medium', radius: 11 },
  { id: 'large', label: 'Large', radius: 22 },
];

export const MIN_OPACITY = 0.5;
export const MARKER_OPACITY = 0.42; // tuned on rendered pages (30–45 %)

export const DEFAULT_TOOLS = {
  pen: { color: PEN_COLORS[0].color, width: 2, opacity: 1 },
  marker: { color: MARKER_COLORS[0].color, width: 16 },
  eraser: { size: 'medium' },
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r1 = v => Math.round(v * 10) / 10;

/** Style for a new stroke from the current tool settings (clamped). */
export function strokeStyle(tool, settings = {}) {
  if (tool === 'marker') {
    return {
      tool: 'marker',
      color: settings.color || DEFAULT_TOOLS.marker.color,
      width: clamp(Number(settings.width) || DEFAULT_TOOLS.marker.width, 8, 28),
      opacity: MARKER_OPACITY,
    };
  }
  return {
    tool: 'pen',
    color: settings.color || DEFAULT_TOOLS.pen.color,
    width: clamp(Number(settings.width) || DEFAULT_TOOLS.pen.width, 0.5, 12),
    opacity: clamp(Number(settings.opacity) || 1, MIN_OPACITY, 1),
  };
}

// --- Coordinates -----------------------------------------------------------

/**
 * Screen (view) point → page point. `transform` describes how the page is
 * shown: page = (screen - offset) / scale. Covers page scaling and, later,
 * zoom/pan (fold the zoom into scale and the pan into offset).
 */
export function screenToPage(
  point,
  { scale = 1, offsetX = 0, offsetY = 0 } = {},
) {
  return { x: (point.x - offsetX) / scale, y: (point.y - offsetY) / scale };
}

export function pageToScreen(
  point,
  { scale = 1, offsetX = 0, offsetY = 0 } = {},
) {
  return { x: point.x * scale + offsetX, y: point.y * scale + offsetY };
}

// --- Capture and smoothing ----------------------------------------------------

/** Minimum distance between captured points (page units): drops jitter. */
export const MIN_POINT_DISTANCE = 0.6;

/**
 * Adds a raw input point to a capture buffer unless it is too close to the
 * previous one. Buffer = { points: [x, y, …], pressure: [p, …] | null }.
 */
export function addPoint(buffer, x, y, pressure) {
  const pts = buffer.points;
  const n = pts.length;
  if (n >= 2) {
    const dx = x - pts[n - 2];
    const dy = y - pts[n - 1];
    if (dx * dx + dy * dy < MIN_POINT_DISTANCE * MIN_POINT_DISTANCE) {
      return buffer;
    }
  }
  pts.push(r1(x), r1(y));
  if (buffer.pressure) {
    buffer.pressure.push(clamp(pressure ?? 0.5, 0, 1));
  }
  return buffer;
}

function angleAt(pts, i) {
  const ax = pts[i * 2] - pts[i * 2 - 2];
  const ay = pts[i * 2 + 1] - pts[i * 2 - 1];
  const bx = pts[i * 2 + 2] - pts[i * 2];
  const by = pts[i * 2 + 3] - pts[i * 2 + 1];
  const la = Math.hypot(ax, ay);
  const lb = Math.hypot(bx, by);
  if (!la || !lb) {
    return 0;
  }
  return Math.acos(clamp((ax * bx + ay * by) / (la * lb), -1, 1));
}

/**
 * Light smoothing: one weighted pass (¼ ½ ¼) that removes finger jitter but
 * keeps endpoints and sharp corners (turns > 55°) exactly where drawn.
 */
export function smoothPoints(points, passes = 1) {
  let pts = points.slice();
  const count = pts.length / 2;
  if (count < 3) {
    return pts;
  }
  const CORNER = (55 * Math.PI) / 180;
  for (let pass = 0; pass < passes; pass++) {
    const out = pts.slice();
    for (let i = 1; i < count - 1; i++) {
      if (angleAt(pts, i) > CORNER) {
        continue;
      }
      out[i * 2] = r1(
        0.25 * pts[i * 2 - 2] + 0.5 * pts[i * 2] + 0.25 * pts[i * 2 + 2],
      );
      out[i * 2 + 1] = r1(
        0.25 * pts[i * 2 - 1] + 0.5 * pts[i * 2 + 1] + 0.25 * pts[i * 2 + 3],
      );
    }
    pts = out;
  }
  return pts;
}

function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Ramer–Douglas–Peucker simplification on a flat point array. Returns the
 * kept indices (so pressure arrays can follow).
 */
export function simplifyIndices(points, epsilon) {
  const count = points.length / 2;
  if (count <= 2) {
    return Array.from({ length: count }, (_, i) => i);
  }
  const keep = new Uint8Array(count);
  keep[0] = 1;
  keep[count - 1] = 1;
  const stack = [[0, count - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let max = 0;
    let index = -1;
    for (let i = a + 1; i < b; i++) {
      const d = segmentDistance(
        points[i * 2],
        points[i * 2 + 1],
        points[a * 2],
        points[a * 2 + 1],
        points[b * 2],
        points[b * 2 + 1],
      );
      if (d > max) {
        max = d;
        index = i;
      }
    }
    if (index !== -1 && max > epsilon) {
      keep[index] = 1;
      stack.push([a, index], [index, b]);
    }
  }
  const out = [];
  for (let i = 0; i < count; i++) {
    if (keep[i]) {
      out.push(i);
    }
  }
  return out;
}

function pick(points, indices) {
  const out = [];
  for (const i of indices) {
    out.push(points[i * 2], points[i * 2 + 1]);
  }
  return out;
}

/** True when the device reported real, varying pressure for this stroke. */
export function hasRealPressure(pressure) {
  if (!pressure || pressure.length < 2) {
    return false;
  }
  let min = 1;
  let max = 0;
  for (const p of pressure) {
    min = Math.min(min, p);
    max = Math.max(max, p);
  }
  return max - min > 0.05;
}

let strokeCounter = 0;
/** A stroke id: unique, only generated when a stroke is created. */
export function newStrokeId() {
  strokeCounter = (strokeCounter + 1) % 1e6;
  return `s${Date.now().toString(36)}${strokeCounter.toString(36)}`;
}

/**
 * Finishes a captured stroke: smooth, simplify (keeping shape within 0.15
 * units), keep pressure only if it is real. A single tap becomes a dot.
 */
export function finishStroke(buffer, style, id = newStrokeId()) {
  let points = buffer.points.slice();
  if (points.length === 2) {
    points = [points[0], points[1], r1(points[0] + 0.1), points[1]]; // a dot
  }
  const smoothed =
    style.tool === 'marker' ? smoothPoints(points, 2) : smoothPoints(points, 1);
  const indices = simplifyIndices(
    smoothed,
    style.tool === 'marker' ? 0.4 : 0.15,
  );
  const stroke = { id, ...style, points: pick(smoothed, indices) };
  const pressure = buffer.pressure;
  if (style.tool === 'pen' && hasRealPressure(pressure)) {
    stroke.pressure = indices.map(
      i => Math.round(pressure[Math.min(i, pressure.length - 1)] * 100) / 100,
    );
  }
  return stroke;
}

// --- Geometry ---------------------------------------------------------------

export function strokeBounds(stroke) {
  const pts = stroke.points;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    minX = Math.min(minX, pts[i]);
    maxX = Math.max(maxX, pts[i]);
    minY = Math.min(minY, pts[i + 1]);
    maxY = Math.max(maxY, pts[i + 1]);
  }
  const pad = stroke.width / 2;
  return {
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad,
  };
}

const fmt = v => (Math.round(v * 10) / 10).toString();

/**
 * SVG path for a stroke's centre line: quadratic curves through the
 * midpoints of consecutive points (smooth, passes near every point).
 */
export function centerlinePath(points) {
  const n = points.length / 2;
  if (n === 0) {
    return '';
  }
  if (n === 1) {
    return `M${fmt(points[0])} ${fmt(points[1])}l0.01 0`;
  }
  if (n === 2) {
    return `M${fmt(points[0])} ${fmt(points[1])}L${fmt(points[2])} ${fmt(
      points[3],
    )}`;
  }
  let d = `M${fmt(points[0])} ${fmt(points[1])}`;
  for (let i = 1; i < n - 1; i++) {
    const x = points[i * 2];
    const y = points[i * 2 + 1];
    const mx = (x + points[i * 2 + 2]) / 2;
    const my = (y + points[i * 2 + 3]) / 2;
    d += `Q${fmt(x)} ${fmt(y)} ${fmt(mx)} ${fmt(my)}`;
  }
  d += `L${fmt(points[(n - 1) * 2])} ${fmt(points[(n - 1) * 2 + 1])}`;
  return d;
}

/** Width at a pressure: light 75 %, normal 100 %, heavy 125 % (controlled). */
export function pressureWidth(width, pressure) {
  return width * (0.75 + 0.5 * clamp(pressure, 0, 1));
}

/**
 * Filled outline for a pressure-sensitive stroke: offsets each point along
 * its normal by half the local width, then closes the shape with round-ish
 * ends. Used only when the device reported real pressure.
 */
export function outlinePath(points, pressure, width) {
  const n = points.length / 2;
  if (n < 2) {
    return centerlinePath(points);
  }
  const left = [];
  const right = [];
  for (let i = 0; i < n; i++) {
    const prev = Math.max(0, i - 1);
    const next = Math.min(n - 1, i + 1);
    let dx = points[next * 2] - points[prev * 2];
    let dy = points[next * 2 + 1] - points[prev * 2 + 1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const half = pressureWidth(width, pressure[i] ?? 0.5) / 2;
    left.push(points[i * 2] - dy * half, points[i * 2 + 1] + dx * half);
    right.push(points[i * 2] + dy * half, points[i * 2 + 1] - dx * half);
  }
  let d = `M${fmt(left[0])} ${fmt(left[1])}`;
  for (let i = 1; i < n; i++) {
    d += `L${fmt(left[i * 2])} ${fmt(left[i * 2 + 1])}`;
  }
  for (let i = n - 1; i >= 0; i--) {
    d += `L${fmt(right[i * 2])} ${fmt(right[i * 2 + 1])}`;
  }
  return `${d}Z`;
}

const pathCache = new WeakMap();
const thumbCache = new WeakMap();

/** Cached render data for a stroke: { d, filled }. */
export function strokeRenderData(stroke, { thumbnail = false } = {}) {
  const cache = thumbnail ? thumbCache : pathCache;
  let data = cache.get(stroke);
  if (!data) {
    let points = stroke.points;
    let pressure = stroke.pressure;
    if (thumbnail && points.length > 8) {
      // Thumbnails don't need every point: simplify hard.
      const idx = simplifyIndices(points, 1.5);
      points = pick(points, idx);
      pressure = pressure ? idx.map(i => pressure[i]) : null;
    }
    data =
      pressure && !thumbnail
        ? { d: outlinePath(points, pressure, stroke.width), filled: true }
        : { d: centerlinePath(points), filled: false };
    cache.set(stroke, data);
  }
  return data;
}

/**
 * Groups strokes into as few drawable paths as possible:
 *   - pen strokes with the same colour/width/opacity share one path (up to
 *     `chunk` strokes) — thousands of strokes become a handful of elements
 *   - marker strokes stay separate so overlapping highlights deepen like
 *     real highlighter ink
 * Order is preserved within each tool.
 */
export function groupStrokes(strokes, { thumbnail = false, chunk = 150 } = {}) {
  const groups = [];
  let current = null;
  for (const stroke of strokes) {
    const { d, filled } = strokeRenderData(stroke, { thumbnail });
    if (stroke.tool === 'marker') {
      groups.push({
        key: stroke.id,
        tool: 'marker',
        d,
        filled: false,
        color: stroke.color,
        width: stroke.width,
        opacity: stroke.opacity,
        count: 1,
      });
      current = null;
      continue;
    }
    const style = `${stroke.color}|${stroke.width}|${stroke.opacity}|${filled}`;
    if (!current || current.style !== style || current.count >= chunk) {
      current = {
        key: stroke.id,
        tool: 'pen',
        style,
        d: '',
        filled,
        color: stroke.color,
        width: stroke.width,
        opacity: stroke.opacity,
        count: 0,
      };
      groups.push(current);
    }
    current.d += d;
    current.count += 1;
  }
  return groups;
}

// --- Erasing ----------------------------------------------------------------

/** Inserts points so no segment is longer than `step` (for hit testing). */
export function densify(points, step) {
  const out = [points[0], points[1]];
  for (let i = 2; i < points.length; i += 2) {
    const ax = out[out.length - 2];
    const ay = out[out.length - 1];
    const bx = points[i];
    const by = points[i + 1];
    const len = Math.hypot(bx - ax, by - ay);
    const parts = Math.ceil(len / step);
    for (let k = 1; k < parts; k++) {
      out.push(
        r1(ax + ((bx - ax) * k) / parts),
        r1(ay + ((by - ay) * k) / parts),
      );
    }
    out.push(bx, by);
  }
  return out;
}

function hitByEraser(x, y, reach, eraser) {
  for (let i = 0; i < eraser.length; i += 2) {
    const ex = eraser[i];
    const ey = eraser[i + 1];
    const d =
      i + 2 < eraser.length
        ? segmentDistance(x, y, ex, ey, eraser[i + 2], eraser[i + 3])
        : Math.hypot(x - ex, y - ey);
    if (d <= reach) {
      return true;
    }
  }
  return false;
}

/**
 * Erases the parts of strokes the eraser passed over.
 *   eraserPoints  flat page-coordinate path of the eraser
 *   radius        eraser radius
 * Strokes are cut where they were touched; the remaining pieces keep their
 * style (ids derived from the original). Only freehand strokes exist here,
 * so typed handwriting can never be erased. Returns a new array, or the
 * same array if nothing was hit.
 */
export function eraseStrokes(strokes, eraserPoints, radius) {
  if (!eraserPoints.length || !strokes.length) {
    return strokes;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < eraserPoints.length; i += 2) {
    minX = Math.min(minX, eraserPoints[i]);
    maxX = Math.max(maxX, eraserPoints[i]);
    minY = Math.min(minY, eraserPoints[i + 1]);
    maxY = Math.max(maxY, eraserPoints[i + 1]);
  }
  let changed = false;
  const out = [];
  for (const stroke of strokes) {
    const b = strokeBounds(stroke);
    if (
      b.maxX < minX - radius ||
      b.minX > maxX + radius ||
      b.maxY < minY - radius ||
      b.minY > maxY + radius
    ) {
      out.push(stroke);
      continue;
    }
    const reach = radius + stroke.width / 2;
    const dense = densify(stroke.points, Math.max(0.5, radius / 2));
    const keep = [];
    let any = false;
    for (let i = 0; i < dense.length; i += 2) {
      const hit = hitByEraser(dense[i], dense[i + 1], reach, eraserPoints);
      keep.push(!hit);
      any = any || hit;
    }
    if (!any) {
      out.push(stroke);
      continue;
    }
    changed = true;
    // Split the surviving runs into separate strokes.
    let run = [];
    let piece = 0;
    const flush = () => {
      if (run.length >= 4) {
        const { pressure, ...rest } = stroke;
        out.push({ ...rest, id: `${stroke.id}.${piece}`, points: run });
        piece += 1;
      }
      run = [];
    };
    for (let i = 0; i < keep.length; i++) {
      if (keep[i]) {
        run.push(dense[i * 2], dense[i * 2 + 1]);
      } else {
        flush();
      }
    }
    flush();
  }
  return changed ? out : strokes;
}

// --- Storage ----------------------------------------------------------------

function cleanStroke(s) {
  if (!s || !Array.isArray(s.points) || s.points.length < 2) {
    return null;
  }
  const points = s.points.map(Number).filter(Number.isFinite);
  if (points.length < 2 || points.length % 2) {
    return null;
  }
  const style = strokeStyle(s.tool === 'marker' ? 'marker' : 'pen', s);
  const stroke = { id: String(s.id || newStrokeId()), ...style, points };
  if (style.tool === 'marker') {
    stroke.opacity = clamp(Number(s.opacity) || MARKER_OPACITY, 0.15, 0.6);
  }
  if (Array.isArray(s.pressure) && s.pressure.length === points.length / 2) {
    stroke.pressure = s.pressure.map(p => clamp(Number(p) || 0.5, 0, 1));
  }
  return stroke;
}

/** Validates stored ink: { pageKey: [stroke] } (old documents: none). */
export function normalizeInk(ink) {
  const out = {};
  if (!ink || typeof ink !== 'object') {
    return out;
  }
  for (const [key, strokes] of Object.entries(ink)) {
    if (!Array.isArray(strokes)) {
      continue;
    }
    const clean = strokes.map(cleanStroke).filter(Boolean);
    if (clean.length) {
      out[key] = clean;
    }
  }
  return out;
}

/** Ink with page keys renamed (page operations) and some keys removed. */
export function remapInk(ink, keyMap = {}, removed = []) {
  const out = {};
  for (const [key, strokes] of Object.entries(ink || {})) {
    if (removed.includes(key)) {
      continue;
    }
    const next = keyMap[key] || key;
    out[next] = out[next] ? [...out[next], ...strokes] : strokes;
  }
  return out;
}

const signatures = new WeakMap();
/**
 * Cheap identity of an ink state (page keys, stroke ids and sizes), used to
 * tell whether a document has unsaved ink changes without deep comparison.
 */
export function inkSignature(ink) {
  if (!ink) {
    return '';
  }
  let sig = signatures.get(ink);
  if (sig === undefined) {
    sig = Object.keys(ink)
      .sort()
      .map(
        key =>
          `${key}:${ink[key]
            .map(st => `${st.id}/${st.points.length}`)
            .join(',')}`,
      )
      .join(';');
    signatures.set(ink, sig);
  }
  return sig;
}

/** Highest chunk with ink per sheet id: keeps drawn-on pages alive. */
export function inkChunks(ink) {
  const map = new Map();
  for (const [key, strokes] of Object.entries(ink || {})) {
    if (!strokes.length) {
      continue;
    }
    const at = key.lastIndexOf('#');
    if (at < 0) {
      continue;
    }
    const sheetId = key.slice(0, at);
    const chunk = Number(key.slice(at + 1));
    if (Number.isFinite(chunk)) {
      map.set(sheetId, Math.max(map.get(sheetId) || 0, chunk + 1));
    }
  }
  return map;
}
