/**
 * Page outline in a phone photo (Phase 9).
 *
 * A sheet photographed on a desk is a large, bright, four-sided region
 * whose edges are sharp steps against what surrounds it (wood, a book, keys,
 * clothes). Brightness alone cannot find it — a light desk can be as bright
 * as a shaded corner of the page — so the search follows the steps:
 *
 *   1. a small copy of the photo with the writing closed away (gray
 *      closing), and its step map (3 × 3 brightness range);
 *   2. the regions between the steps; the brightest large one is the page
 *      candidate (holes — anything on the page — filled in);
 *   3. a quadrilateral fitted to it (convex hull reduced to four corners);
 *      each side away from the photo's border is then refined to the
 *      half-way point of the step across it (a line fit with one outlier
 *      pass) — the side is accepted only if the step is clear along most
 *      of its length;
 *   4. checks: the region fills the quadrilateral and does not spill out
 *      of it, and the corner angles are plausible for a photographed sheet.
 *
 * Outcome (`status`):
 *   'page'       all four sides found and reliable → the page is rectified
 *                (perspective removed) before analysis
 *   'partial'    a reliable outline that runs off the photo on some side:
 *                left as it is (no four corners to rectify with)
 *   'full-frame' no page edge inside the photo (a scan, or a photo filled
 *                by the page), or one too small to matter: left as it is
 *   'unclear'    a sharp-edged page with substantial background around it
 *                whose outline could not be fitted reliably → the sample is
 *                rejected ('page-unclear'), never guessed
 */
import { applyHomography, homographyFrom, warpGray } from './homography';
import { makeRaster } from './raster';

export const PAGE = {
  WORK_EDGE: 320, // long edge of the working copy (px)
  CLOSE_RADIUS: 2, // working px: gray closing that erases the writing
  STEP_MAP: 8, // gray levels of 3 × 3 range that separate regions
  SEAL: 2, // working px the steps are widened by before regions are found
  MIN_AREA: 0.2, // a page covers at least this share of the photo
  FULL_FRAME: 0.9, // a region this large: the page fills the photo
  UNCLEAR_BELOW: 0.75, // an unfittable page is rejected only with this much background or more
  FILL_MIN: 0.92, // region area / quadrilateral area
  SPILL_MAX: 0.15, // share of the region outside the quadrilateral (a light desk can leak in where an edge is faint; the sides themselves are checked step by step)
  ANGLE_MIN: 50, // degrees, every corner
  ANGLE_MAX: 130,
  EDGE_STEP: 14, // gray levels: inside − outside across a page side
  EDGE_REACH: 4, // working px either side of a side where the step is read
  EDGE_SUPPORT: 0.7, // share of a side's samples showing the step
  EDGE_SAMPLES: 48,
  BORDER_PX: 2, // working px: a side this close to the photo's edge is the photo's edge
  FOCAL_MIN: 0.4, // plausible phone focal lengths, in units of the photo's long edge
  FOCAL_MAX: 4,
  FOCAL_ASSUMED: 0.75, // a phone's main camera (≈ 26 mm equivalent) on a 4:3 photo's long edge
  INSET: 0.006, // share of the page trimmed off each side when rectifying (the sheet's own edge)
};

const r3 = v => Math.round(v * 1000) / 1000;

/** Box-average downscale by an integer factor. */
function shrink(raster, f) {
  const { width: w, height: h, data } = raster;
  const W = Math.max(1, Math.floor(w / f));
  const H = Math.max(1, Math.floor(h / f));
  const out = new Float32Array(W * H);
  for (let Y = 0; Y < H; Y++) {
    for (let X = 0; X < W; X++) {
      let s = 0;
      for (let y = Y * f; y < (Y + 1) * f; y++) {
        const row = y * w;
        for (let x = X * f; x < (X + 1) * f; x++) s += data[row + x];
      }
      out[Y * W + X] = s / (f * f);
    }
  }
  return { W, H, data: out };
}

/** Separable max (grow = true) or min filter of radius r. */
function extremum(data, W, H, r, grow) {
  const pick = grow ? Math.max : Math.min;
  const tmp = new Float32Array(W * H);
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = data[y * W + x];
      for (let k = Math.max(0, x - r); k <= Math.min(W - 1, x + r); k++) v = pick(v, data[y * W + k]);
      tmp[y * W + x] = v;
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = tmp[y * W + x];
      for (let k = Math.max(0, y - r); k <= Math.min(H - 1, y + r); k++) v = pick(v, tmp[k * W + x]);
      out[y * W + x] = v;
    }
  }
  return out;
}

/** 4-connected regions of `on`: { label (Int32, −1 off), regions: [{ id, area }] }. */
function regionsOf(on, W, H) {
  const label = new Int32Array(W * H).fill(-1);
  const stack = new Int32Array(W * H);
  const regions = [];
  for (let s = 0; s < W * H; s++) {
    if (!on[s] || label[s] >= 0) continue;
    const id = regions.length;
    let top = 0;
    let area = 0;
    stack[top++] = s;
    label[s] = id;
    while (top) {
      const i = stack[--top];
      area++;
      const x = i % W;
      if (x > 0 && on[i - 1] && label[i - 1] < 0) {
        label[i - 1] = id;
        stack[top++] = i - 1;
      }
      if (x < W - 1 && on[i + 1] && label[i + 1] < 0) {
        label[i + 1] = id;
        stack[top++] = i + 1;
      }
      if (i >= W && on[i - W] && label[i - W] < 0) {
        label[i - W] = id;
        stack[top++] = i - W;
      }
      if (i < W * (H - 1) && on[i + W] && label[i + W] < 0) {
        label[i + W] = id;
        stack[top++] = i + W;
      }
    }
    regions.push({ id, area });
  }
  return { label, regions };
}

/** Holes of a region (parts of its complement not reaching the frame) filled in. */
function fillHoles(mask, W, H) {
  const outside = new Uint8Array(W * H);
  const stack = [];
  const push = i => {
    if (!mask[i] && !outside[i]) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < W; x++) {
    push(x);
    push((H - 1) * W + x);
  }
  for (let y = 0; y < H; y++) {
    push(y * W);
    push(y * W + W - 1);
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % W;
    if (x > 0) push(i - 1);
    if (x < W - 1) push(i + 1);
    if (i >= W) push(i - W);
    if (i < W * (H - 1)) push(i + W);
  }
  const out = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) out[i] = outside[i] ? 0 : 1;
  return out;
}

/** Boundary pixel centres of a region (a 4-neighbour outside it, or on the frame). */
function boundaryOf(mask, W, H) {
  const pts = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!mask[i]) continue;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1 || !mask[i - 1] || !mask[i + 1] || !mask[i - W] || !mask[i + W]) pts.push([x + 0.5, y + 0.5]);
    }
  }
  return pts;
}

const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Convex hull (monotone chain). */
function hull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

const triArea = (a, b, c) => Math.abs(cross(a, b, c)) / 2;

/** A convex polygon reduced to four corners by dropping the least significant vertex. */
function toFour(poly) {
  const p = poly.slice();
  while (p.length > 4) {
    let k = 0;
    let least = Infinity;
    for (let i = 0; i < p.length; i++) {
      const a = triArea(p[(i - 1 + p.length) % p.length], p[i], p[(i + 1) % p.length]);
      if (a < least) {
        least = a;
        k = i;
      }
    }
    p.splice(k, 1);
  }
  return p;
}

function polyArea(p) {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}

/** Total-least-squares line through points: { nx, ny, c } with nx x + ny y = c. */
function fitLine(pts) {
  let mx = 0;
  let my = 0;
  for (const [x, y] of pts) {
    mx += x;
    my += y;
  }
  mx /= pts.length;
  my /= pts.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of pts) {
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
    sxy += (x - mx) * (y - my);
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy); // the line's direction
  const nx = -Math.sin(theta);
  const ny = Math.cos(theta);
  return { nx, ny, c: nx * mx + ny * my };
}

function lineThrough(a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  return { nx, ny, c: nx * a[0] + ny * a[1] };
}

function intersect(l1, l2) {
  const det = l1.nx * l2.ny - l1.ny * l2.nx;
  if (Math.abs(det) < 1e-9) return null;
  return [(l1.c * l2.ny - l1.ny * l2.c) / det, (l1.nx * l2.c - l1.c * l2.nx) / det];
}

/** Corners ordered top-left, top-right, bottom-right, bottom-left (clockwise on screen). */
function orderCorners(q) {
  const cx = q.reduce((s, p) => s + p[0], 0) / 4;
  const cy = q.reduce((s, p) => s + p[1], 0) / 4;
  const round = q.slice().sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  let k = 0;
  for (let i = 1; i < 4; i++) if (round[i][0] + round[i][1] < round[k][0] + round[k][1]) k = i;
  return [0, 1, 2, 3].map(i => round[(k + i) % 4]);
}

/** Bilinear sample of a float image, clamped to it. */
function sample(data, W, H, x, y) {
  const fx = Math.min(W - 1, Math.max(0, x - 0.5));
  const fy = Math.min(H - 1, Math.max(0, y - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(W - 1, x0 + 1);
  const y1 = Math.min(H - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  return (data[y0 * W + x0] * (1 - tx) + data[y0 * W + x1] * tx) * (1 - ty) + (data[y1 * W + x0] * (1 - tx) + data[y1 * W + x1] * tx) * ty;
}

function pointInQuad(q, x, y) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const c = cross(q[i], q[(i + 1) % 4], [x, y]);
    if (c === 0) continue;
    const s = c > 0 ? 1 : -1;
    if (!sign) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

const nearBorder = (p, W, H) => p[0] <= PAGE.BORDER_PX || p[1] <= PAGE.BORDER_PX || p[0] >= W - PAGE.BORDER_PX || p[1] >= H - PAGE.BORDER_PX;

function sameBorder(a, b, W, H) {
  const d = PAGE.BORDER_PX;
  return (a[0] <= d && b[0] <= d) || (a[1] <= d && b[1] <= d) || (a[0] >= W - d && b[0] >= W - d) || (a[1] >= H - d && b[1] >= H - d);
}

/**
 * One side refined to the step across it: samples along the rough side,
 * each looking along the outward normal for the half-way crossing between
 * the page level (inside) and the background level (outside).
 * Returns { line, support, border } — border: the side is the photo's edge.
 */
function refineSide(a, b, centre, img, W, H) {
  const T = PAGE;
  if (sameBorder(a, b, W, H) && nearBorder([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], W, H)) return { line: lineThrough(a, b), support: null, border: true };
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const ux = (b[0] - a[0]) / len;
  const uy = (b[1] - a[1]) / len;
  let nx = -uy;
  let ny = ux;
  if (nx * (centre[0] - a[0]) + ny * (centre[1] - a[1]) > 0) { // outward
    nx = -nx;
    ny = -ny;
  }
  const R = T.EDGE_REACH;
  const hits = [];
  let n = 0;
  for (let k = 0; k < T.EDGE_SAMPLES; k++) {
    const t = 0.08 + (0.84 * (k + 0.5)) / T.EDGE_SAMPLES;
    const x = a[0] + (b[0] - a[0]) * t;
    const y = a[1] + (b[1] - a[1]) * t;
    // Profile along the normal, from 2R inside to 2R outside.
    const prof = [];
    for (let d = -2 * R; d <= 2 * R; d += 0.5) prof.push([d, sample(img, W, H, x + nx * d, y + ny * d), x + nx * d, y + ny * d]);
    if (prof.some(([, , px, py]) => px < 0 || py < 0 || px > W || py > H)) continue; // runs off the photo
    n++;
    // The first clear drop going outward (across ±1.5 px), at its steepest:
    // the sheet's edge, not a darker object further out (a book beyond the
    // desk can be a bigger step).
    const S = 3; // samples = 1.5 px
    const drop = i => prof[i - S][1] - prof[i + S][1];
    let i = S;
    while (i < prof.length - S && drop(i) < T.EDGE_STEP) i++;
    if (i >= prof.length - S) continue;
    while (i + 1 < prof.length - S && drop(i + 1) > drop(i)) i++;
    const mid = (prof[i - S][1] + prof[i + S][1]) / 2;
    for (let j = i - S + 1; j <= i + S; j++) {
      if (prof[j - 1][1] >= mid && prof[j][1] < mid) {
        const f = (prof[j - 1][1] - mid) / (prof[j - 1][1] - prof[j][1] || 1);
        const d = prof[j - 1][0] + 0.5 * f;
        hits.push([x + nx * d, y + ny * d]);
        break;
      }
    }
  }
  const support = n ? hits.length / n : 0;
  if (hits.length < 8) return { line: lineThrough(a, b), support: r3(support), border: false };
  let line = fitLine(hits);
  const kept = hits.filter(p => Math.abs(line.nx * p[0] + line.ny * p[1] - line.c) <= 1.5);
  if (kept.length >= 8) line = fitLine(kept);
  return { line, support: r3(support), border: false };
}

/** The quadrilateral of one candidate region and its checks. */
function fitQuad(region, img, W, H) {
  const T = PAGE;
  const pts = boundaryOf(region, W, H);
  if (pts.length < 8) return null;
  const rough = toFour(hull(pts));
  if (rough.length < 4) return null;
  // Two passes: the hull's four corners can sit off a true corner; the
  // second pass reads the steps along the first pass's sides.
  let corners = orderCorners(rough);
  let sides = null;
  for (let pass = 0; pass < 2; pass++) {
    const c0 = corners;
    const centre = [c0.reduce((t, p) => t + p[0], 0) / 4, c0.reduce((t, p) => t + p[1], 0) / 4];
    sides = [0, 1, 2, 3].map(k => refineSide(c0[k], c0[(k + 1) % 4], centre, img, W, H));
    const next = [];
    for (let k = 0; k < 4; k++) {
      const p = intersect(sides[(k + 3) % 4].line, sides[k].line);
      if (!p) return null;
      next.push(p);
    }
    corners = next;
  }
  const reasons = [];
  const area = polyArea(corners);
  let inside = 0;
  let regionArea = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!region[y * W + x]) continue;
      regionArea++;
      if (pointInQuad(corners, x + 0.5, y + 0.5)) inside++;
    }
  }
  const fill = area > 0 ? Math.min(1, inside / area) : 0;
  const spill = regionArea ? 1 - inside / regionArea : 1;
  const angles = corners.map((p, i) => {
    const a = corners[(i + 3) % 4];
    const b = corners[(i + 1) % 4];
    const v1 = [a[0] - p[0], a[1] - p[1]];
    const v2 = [b[0] - p[0], b[1] - p[1]];
    const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2) || 1);
    return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
  });
  if (fill < T.FILL_MIN) reasons.push(`the page region does not fill a four-sided outline (${r3(fill)} < ${T.FILL_MIN})`);
  if (spill > T.SPILL_MAX) reasons.push(`the page region spills outside the outline (${r3(spill)} > ${T.SPILL_MAX})`);
  if (angles.some(a => a < T.ANGLE_MIN || a > T.ANGLE_MAX)) reasons.push(`a corner angle is implausible for a photographed sheet (${angles.map(a => Math.round(a)).join('/')}°)`);
  sides.forEach((sd, s) => {
    if (!sd.border && sd.support < T.EDGE_SUPPORT) reasons.push(`page edge ${s + 1} is not a clear step against the background (${sd.support} < ${T.EDGE_SUPPORT})`);
  });
  if (sides.every(sd => sd.border)) reasons.push('no page edge inside the photo');
  return { corners, fill: r3(fill), spill: r3(spill), angles: angles.map(a => Math.round(a)), sides: sides.map(sd => ({ border: sd.border, support: sd.support })), ok: !reasons.length, reasons };
}

/**
 * Finds the page in a photo. Returns { status, corners (photo px, TL TR BR
 * BL) | null, size ({ width, height } of the rectified page) | null,
 * metrics, reasons }. keepWork (diagnostics) adds `metrics.workImage`: the working copy
 * and the page region, for drawing.
 */
export function detectPage(raster, { keepWork = false } = {}) {
  const T = PAGE;
  const { width: w, height: h } = raster;
  const f = Math.max(1, Math.ceil(Math.max(w, h) / T.WORK_EDGE));
  const small = shrink(raster, f);
  const { W, H } = small;
  const N = W * H;
  // Closing (max then min) removes dark strokes narrower than the radius.
  const img = extremum(extremum(small.data, W, H, T.CLOSE_RADIUS, true), W, H, T.CLOSE_RADIUS, false);
  const metrics = { work: { width: W, height: H, factor: f } };
  const result = (status, extra) => ({ status, corners: null, size: null, metrics, reasons: [], ...extra });

  // Regions between the steps.
  const hi = extremum(img, W, H, 1, true);
  const lo = extremum(img, W, H, 1, false);
  // Steps widened by SEAL px, so a short gap in a faint page edge (a desk's
  // grain as bright as a shaded sheet) does not join the two sides.
  const step = new Float32Array(N);
  for (let i = 0; i < N; i++) step[i] = hi[i] - lo[i] >= T.STEP_MAP ? 1 : 0;
  const sealed = extremum(step, W, H, T.SEAL, true);
  const flat = new Uint8Array(N);
  for (let i = 0; i < N; i++) flat[i] = sealed[i] ? 0 : 1;
  const { label, regions } = regionsOf(flat, W, H);
  const large = regions.filter(r => r.area >= T.MIN_AREA * N * 0.5);
  if (!large.length) return result('full-frame', { reasons: ['no large even region (the photo may be all writing or texture)'] });
  // Brightness of each large region (median of its closed gray values).
  for (const r of large) {
    const vals = [];
    for (let i = 0; i < N; i += 3) if (label[i] === r.id) vals.push(img[i]);
    vals.sort((a, b) => a - b);
    r.level = vals[Math.floor(vals.length / 2)];
  }
  large.sort((a, b) => b.level - a.level);
  const brightest = large[0];
  // The candidate: the brightest large region grown back over the step band
  // around it (pixels at least half-way to its level), holes filled.
  const region = new Uint8Array(N);
  for (let i = 0; i < N; i++) region[i] = label[i] === brightest.id ? 1 : 0;
  const dark = Math.min(...large.map(r => r.level), brightest.level - T.EDGE_STEP);
  const grown = growInto(region, img, W, H, (brightest.level + dark) / 2, T.SEAL + 2);
  const filled = fillHoles(grown, W, H);
  let share = 0;
  for (let i = 0; i < N; i++) share += filled[i];
  share /= N;
  metrics.region = { share: r3(share), level: Math.round(brightest.level), regions: large.length };
  if (share >= T.FULL_FRAME) return result('full-frame', { reasons: ['the page fills the photo'] });
  if (share < T.MIN_AREA) return result('full-frame', { reasons: ['no page-sized bright region'] });
  const quad = fitQuad(filled, img, W, H);
  if (keepWork) metrics.workImage = { W, H, img, region: filled, quad };
  if (!quad) return result(share < T.UNCLEAR_BELOW ? 'unclear' : 'full-frame', { reasons: ['no outline could be fitted to the page region'] });
  metrics.page = { fill: quad.fill, spill: quad.spill, angles: quad.angles, sides: quad.sides };
  const corners = quad.corners.map(p => [r3(p[0] * f), r3(p[1] * f)]);
  const borderSides = quad.sides.filter(s => s.border).length;
  if (quad.ok && !borderSides) {
    const len = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]);
    // Width: the longer of top and bottom (the less foreshortened); height
    // from the sheet's proportions; never larger than the photo.
    const aspect = pageAspect(corners, w, h);
    let width = Math.max(len(corners[0], corners[1]), len(corners[3], corners[2]));
    let height = width / aspect.ratio;
    const k = Math.min(1, Math.max(w, h) / Math.max(width, height));
    width = Math.round(width * k);
    height = Math.round(height * k);
    metrics.aspect = aspect;
    return result('page', { corners, size: { width, height } });
  }
  if (quad.ok) return result('partial', { corners, reasons: ['the page runs off the photo, so there are no four corners to correct the perspective with'] });
  if (share < T.UNCLEAR_BELOW) return result('unclear', { reasons: quad.reasons });
  return result('full-frame', { reasons: ['the page fills most of the photo; its outline was not reliable and is not used', ...quad.reasons] });
}

/**
 * Width / height of the photographed sheet from its four corners (TL TR BR
 * BL, photo px), for a pinhole camera whose optical centre is the photo's
 * centre (Zhang & He, "Whiteboard scanning and image enhancement", 2007):
 * the camera's focal length follows from the two vanishing directions, and
 * with it the true proportions. When that model does not fit (no real
 * focal length, or the corners are not a perspective view of a rectangle
 * from such a camera — a cropped photo, for one), the ratio of the mean
 * side lengths is used and `method` says so. When the sheet is tilted one
 * way only, the focal length cannot be measured and a typical phone
 * camera's is assumed ('assumed-focal').
 * Returns { ratio, method: 'camera' | 'assumed-focal' | 'sides', focal? }.
 */
export function pageAspect(corners, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const [tl, tr, br, bl] = corners.map(p => [p[0] - cx, p[1] - cy, 1]);
  const crossV = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const len = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]);
  const sides = (len(tl, tr) + len(bl, br)) / (len(tl, bl) + len(tr, br));
  // m1 (0,0) = TL, m2 (w,0) = TR, m3 (0,h) = BL, m4 (w,h) = BR.
  const m14 = crossV(tl, br);
  const k2 = dot(m14, bl) / dot(crossV(tr, br), bl);
  const k3 = dot(m14, tr) / dot(crossV(bl, br), tr);
  const n2 = [k2 * tr[0] - tl[0], k2 * tr[1] - tl[1], k2 - 1];
  const n3 = [k3 * bl[0] - tl[0], k3 * bl[1] - tl[1], k3 - 1];
  const scale = Math.max(w, h);
  const affine = Math.abs(n2[2]) * scale < 1e-3 * Math.hypot(n2[0], n2[1]) && Math.abs(n3[2]) * scale < 1e-3 * Math.hypot(n3[0], n3[1]);
  if (affine) return { ratio: r3(Math.sqrt((n2[0] ** 2 + n2[1] ** 2) / (n3[0] ** 2 + n3[1] ** 2))), method: 'sides' };
  const ratioWith = g2 => Math.sqrt((n2[0] ** 2 + n2[1] ** 2 + g2 * n2[2] ** 2) / (n3[0] ** 2 + n3[1] ** 2 + g2 * n3[2] ** 2));
  const f2 = -(n2[0] * n3[0] + n2[1] * n3[1]) / (n2[2] * n3[2]);
  const f = f2 > 0 ? Math.sqrt(f2) : 0;
  if (f >= PAGE.FOCAL_MIN * scale && f <= PAGE.FOCAL_MAX * scale) {
    const ratio = ratioWith(f2);
    if (Number.isFinite(ratio) && ratio > 0) return { ratio: r3(ratio), method: 'camera', focal: Math.round(f) };
  }
  // One pair of sides parallel in the photo (tilted one way only): the
  // focal length cannot be measured; a typical phone camera's is assumed.
  const g = PAGE.FOCAL_ASSUMED * scale;
  const ratio = ratioWith(g * g);
  if (Number.isFinite(ratio) && ratio > 0) return { ratio: r3(ratio), method: 'assumed-focal', focal: Math.round(g) };
  return { ratio: r3(sides), method: 'sides' };
}

/** Region grown by up to `steps` pixels into neighbours at least `level` bright. */
function growInto(region, img, W, H, level, steps) {
  let cur = region;
  for (let s = 0; s < steps; s++) {
    const next = cur.slice();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (cur[i] || img[i] < level) continue;
        if ((x > 0 && cur[i - 1]) || (x < W - 1 && cur[i + 1]) || (y > 0 && cur[i - W]) || (y < H - 1 && cur[i + W])) next[i] = 1;
      }
    }
    cur = next;
  }
  return cur;
}

/**
 * The page cut out of the photo and straightened: { raster, homography }
 * — homography maps rectified pixel positions (continuous coordinates) to
 * the photo's. A thin strip along each side is left out (the sheet's own
 * edge and the background just beyond it).
 */
export function rectifyPage(raster, page) {
  const { width, height } = page.size;
  const inset = Math.max(2, Math.round(PAGE.INSET * Math.max(width, height)));
  const dst = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ];
  const H = homographyFrom(dst, page.corners);
  if (!H) return null;
  // Output (x, y) ↔ page (x + inset, y + inset): H · translate(inset).
  const Ht = [H[0], H[1], (H[0] + H[1]) * inset + H[2], H[3], H[4], (H[3] + H[4]) * inset + H[5], H[6], H[7], (H[6] + H[7]) * inset + 1];
  const homography = Ht.map(v => v / Ht[8]);
  const warped = warpGray(raster, homography, width - 2 * inset, height - 2 * inset, 255);
  return { raster: makeRaster(warped.width, warped.height, warped.data), homography };
}

/** A rectified-page point back in the photo (continuous coordinates). */
export function pageToPhoto(p, homography) {
  return applyHomography(homography, p[0], p[1]);
}
