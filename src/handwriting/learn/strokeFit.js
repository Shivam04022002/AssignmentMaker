/**
 * Centre-line point paths → cubic chains in the renderer's format, and a
 * check of how faithfully the chains reproduce the ink they came from.
 *
 * Fit (pixels of the crop):
 *   smooth     [1 2 1] / 4 along the path (ends kept): removes the 1 px
 *              staircase of a digital line
 *   simplify   Ramer–Douglas–Peucker with tolerance ε
 *   cubic      Catmull–Rom through the kept points, written as Bézier
 *              segments (c1 = p1 + (p2 − p0) / 6, c2 = p2 − (p3 − p1) / 6)
 *   refine     if any path point lies further than FIT.maxError × stroke
 *              width (≈ 1 px for a 3 px pen) from the curve, ε is halved
 *              (up to 4 times)
 *
 * Fidelity (both 0–1; the trace is only as good as the worse):
 *   inkCovered   share of ink pixels within (stroke width / 2 + 1 px) of
 *                the fitted curves (of a dot: within its own radius + 1 px)
 *                — nothing the writer drew is missing
 *   curveOnInk   share of points sampled along the curves within 1.5 px of
 *                ink — nothing is drawn where there was no ink
 */

export const FIT = { epsilon: 0.9, maxError: 0.35, refinements: 4, sampleStep: 0.5 };

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function smoothPath(points, closed = false) {
  if (closed && points.length > 3) {
    // A closed path repeats its first point at the end: smooth the ring of
    // distinct points, then close it exactly.
    const ring = smoothRing(points.slice(0, -1));
    return [...ring, ring[0].slice()];
  }
  const n = points.length;
  if (n < 3) return points.map(p => p.slice());
  return points.map((p, i) => {
    if (i === 0 || i === n - 1) return p.slice();
    const a = points[i - 1];
    const b = points[i + 1];
    return [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4];
  });
}

function smoothRing(points) {
  const n = points.length;
  return points.map((p, i) => {
    const a = points[(i - 1 + n) % n];
    const b = points[(i + 1) % n];
    return [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4];
  });
}

function segDist(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  if (!l2) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Ramer–Douglas–Peucker; returns the kept points (ends always kept). */
export function simplify(points, eps) {
  if (points.length <= 2) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let best = -1;
    let far = 0;
    for (let k = i + 1; k < j; k++) {
      const d = segDist(points[k], points[i], points[j]);
      if (d > far) {
        far = d;
        best = k;
      }
    }
    if (best >= 0 && far > eps) {
      keep[best] = 1;
      stack.push([i, best], [best, j]);
    }
  }
  // A closed path whose ends coincide needs a point on the far side.
  const out = points.filter((_, k) => keep[k]);
  if (out.length === 2 && dist(out[0], out[1]) < 1e-9) {
    let far = 0;
    let best = 1;
    points.forEach((p, k) => {
      const d = dist(p, points[0]);
      if (d > far) {
        far = d;
        best = k;
      }
    });
    return [points[0], points[best], points[points.length - 1]];
  }
  return out;
}

/** Catmull–Rom through `pts` as a cubic chain [x0, y0, (c1, c2, p)…]. */
export function catmullRom(pts, closed = false) {
  const n = pts.length;
  if (n === 1) return [pts[0][0], pts[0][1]];
  const out = [pts[0][0], pts[0][1]];
  const at = k => {
    if (closed) {
      // pts[n − 1] repeats pts[0]: wrap over the distinct points.
      const m = n - 1;
      return pts[((k % m) + m) % m];
    }
    return pts[Math.max(0, Math.min(n - 1, k))];
  };
  for (let i = 0; i < n - 1; i++) {
    const p0 = at(i - 1);
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = at(i + 2);
    out.push(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  return out;
}

/** Points along a cubic chain, about `step` apart. */
export function sampleChain(chain, step = FIT.sampleStep) {
  const pts = [[chain[0], chain[1]]];
  for (let i = 2; i + 5 < chain.length; i += 6) {
    const x0 = chain[i - 2];
    const y0 = chain[i - 1];
    const [c1x, c1y, c2x, c2y, x1, y1] = chain.slice(i, i + 6);
    const approx = Math.hypot(c1x - x0, c1y - y0) + Math.hypot(c2x - c1x, c2y - c1y) + Math.hypot(x1 - c2x, y1 - c2y);
    const n = Math.max(1, Math.ceil(approx / step));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const u = 1 - t;
      pts.push([
        u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x1,
        u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y1,
      ]);
    }
  }
  return pts;
}

/** Largest distance from any path point to the sampled curve. */
function fitError(path, samples) {
  let worst = 0;
  for (const p of path) {
    let best = Infinity;
    for (const s of samples) {
      const d = (p[0] - s[0]) ** 2 + (p[1] - s[1]) ** 2;
      if (d < best) best = d;
    }
    if (best > worst) worst = best;
  }
  return Math.sqrt(worst);
}

/**
 * Fits one stroke's point path. Returns { chain, error, points } (pixels).
 * A dot (one point) becomes a tiny segment like strokeBuilder's dot().
 */
export function fitStroke(stroke, strokeWidth) {
  if (stroke.dot || stroke.points.length === 1) {
    const [x, y] = stroke.points[0];
    return { chain: [x - 0.3, y + 0.2, x - 0.1, y + 0.067, x + 0.1, y - 0.067, x + 0.3, y - 0.2], error: 0, points: 2, dot: true };
  }
  const path = smoothPath(stroke.points, stroke.closed);
  let eps = FIT.epsilon;
  let best = null;
  for (let r = 0; r <= FIT.refinements; r++) {
    const kept = simplify(path, eps);
    const chain = catmullRom(kept, stroke.closed);
    const error = fitError(path, sampleChain(chain));
    best = { chain, error, points: kept.length, dot: false };
    if (error <= FIT.maxError * Math.max(1, strokeWidth)) break;
    eps /= 2;
  }
  return best;
}

/** Chamfer (3-4) distance to the nearest set pixel, in pixels. */
export function distanceTo(mask, w, h) {
  const INF = 1e9;
  const d = new Float64Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : INF;
  const relax = (i, j, c) => {
    if (d[j] + c < d[i]) d[i] = d[j] + c;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x > 0) relax(i, i - 1, 3);
      if (y > 0) {
        relax(i, i - w, 3);
        if (x > 0) relax(i, i - w - 1, 4);
        if (x < w - 1) relax(i, i - w + 1, 4);
      }
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (x < w - 1) relax(i, i + 1, 3);
      if (y < h - 1) {
        relax(i, i + w, 3);
        if (x < w - 1) relax(i, i + w + 1, 4);
        if (x > 0) relax(i, i + w - 1, 4);
      }
    }
  }
  for (let i = 0; i < d.length; i++) d[i] = d[i] >= INF ? INF : d[i] / 3;
  return d;
}

/**
 * Fidelity of fitted chains (pixels of the crop) to the crop's ink.
 * `dots`: [{ x, y, radius }] — a dot's ink reaches its own radius.
 */
export function traceFidelity(mask, w, h, chains, strokeWidth, dots = []) {
  const curve = new Uint8Array(w * h);
  const samples = [];
  for (const c of chains) {
    for (const p of sampleChain(c)) {
      samples.push(p);
      const x = Math.floor(p[0]);
      const y = Math.floor(p[1]);
      if (x >= 0 && y >= 0 && x < w && y < h) curve[y * w + x] = 1;
    }
  }
  let ink = 0;
  let covered = 0;
  const toCurve = distanceTo(curve, w, h);
  const reach = Math.max(1, strokeWidth) / 2 + 1;
  for (let i = 0; i < w * h; i++) {
    if (!mask[i]) continue;
    ink++;
    const x = i % w;
    const y = (i - x) / w;
    if (toCurve[i] <= reach || dots.some(d => Math.hypot(x + 0.5 - d.x, y + 0.5 - d.y) <= d.radius + 1)) covered++;
  }
  const toInk = distanceTo(mask, w, h);
  let on = 0;
  for (const p of samples) {
    const x = Math.min(w - 1, Math.max(0, Math.floor(p[0])));
    const y = Math.min(h - 1, Math.max(0, Math.floor(p[1])));
    if (toInk[y * w + x] <= 1.5) on++;
  }
  const inkCovered = ink ? covered / ink : 0;
  const curveOnInk = samples.length ? on / samples.length : 0;
  return { inkCovered: Math.round(inkCovered * 1000) / 1000, curveOnInk: Math.round(curveOnInk * 1000) / 1000, score: Math.round(Math.min(inkCovered, curveOnInk) * 1000) / 1000 };
}
