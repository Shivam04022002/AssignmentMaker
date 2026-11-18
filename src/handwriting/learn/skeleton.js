/**
 * Centre-lines of a glyph's ink, assembled into plausible strokes.
 *
 * The final ink is all there is: pen order, direction, lifts and pressure
 * are not in a photo. What this recovers is the *shape* of the writing as
 * centre-lines — the renderer's own representation — and a plausible,
 * deterministic grouping of them into strokes. It never claims to be the
 * writer's actual pen movement.
 *
 *   0. scale      a pen under FINE_BELOW px wide is thinned at twice the
 *                 resolution (each pixel → 2 × 2) and the centre-lines are
 *                 mapped back: at ~2–3 px Zhang–Suen erases a short stub
 *                 about as long as it is thick — a t's crossbar arm, the
 *                 tail of an a's stem — that the doubled crop keeps (Phase 11)
 *      pinholes   paper enclosed by ink with an area under (PINHOLE ×
 *                 stroke width)² is a binarisation pinhole in a thick
 *                 stroke, not a counter: filled (thinning would wrap a
 *                 false loop round it)
 *   1. thin       Zhang–Suen thinning of the binary crop, then a clean-up
 *                 pass: a pixel with ≥ 3 skeleton neighbours that are all
 *                 connected to each other without it (one 8-connected
 *                 group) is redundant — a staircase two pixels thick —
 *                 and removed; connectivity cannot change
 *   2. graph      end points (one skeleton neighbour) and junctions
 *                 (≥ 3 branches by the crossing number) are nodes;
 *                 adjacent junction pixels form one node; the pixel paths
 *                 between nodes are edges; node-free rings are loops
 *   3. prune      spurs — edges from a junction to an end point whose ink
 *                 never leaves the junction's own ink: skeleton length +
 *                 the ink depth left at its tip (thinning retreats from a
 *                 stroke end by about that) ≤ the junction's depth + SPUR_PX —
 *                 and knots — loops back to the same junction shorter than
 *                 twice that — are thinning artefacts at corners and
 *                 stroke ends; removed repeatedly. A fixed length would also
 *                 cut short real strokes (a t's crossbar arm)
 *   4. strokes    at each junction the two branches that continue each
 *                 other best (most nearly opposite directions, within
 *                 CONTINUE_DEG of straight) are joined into one stroke —
 *                 a T's bar runs through, its stem is separate; chains of
 *                 joined edges become strokes; a stroke runs from its
 *                 upper end down (or, nearly horizontal, left to right);
 *                 a closed loop starts at its top and runs anticlockwise
 *                 (a convention, as in the hand-made sets)
 *   5. dots       a component no bigger than DOT × stroke width is a dot; so
 *                 is any component thinning leaves without a centre-line
 *                 (Zhang–Suen erases a solid 2 × 2 block entirely)
 *
 * Coordinates are pixel centres of the crop (x right, y down).
 */

import { distanceTo } from './strokeFit';

export const SKELETON = { SPUR_PX: 1, CONTINUE_DEG: 50, DOT: 2.2, DIRECTION_REACH: 1.6, PINHOLE: 0.8, FINE_BELOW: 4 };

const N8 = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

/** Zhang–Suen thinning. `mask` w × h (1 = ink); returns a new mask. */
export function thin(mask, w, h) {
  const m = new Uint8Array(w * h);
  for (let i = 0; i < m.length; i++) m[i] = mask[i] ? 1 : 0;
  const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? m[y * w + x] : 0);
  let changed = true;
  const del = [];
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      del.length = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!m[y * w + x]) continue;
          const p = N8.map(([dx, dy]) => at(x + dx, y + dy)); // P2 … P9
          const b = p.reduce((s, v) => s + v, 0);
          if (b < 2 || b > 6) continue;
          let a = 0;
          for (let k = 0; k < 8; k++) if (!p[k] && p[(k + 1) % 8]) a++;
          if (a !== 1) continue;
          if (pass === 0 ? p[0] * p[2] * p[4] || p[2] * p[4] * p[6] : p[0] * p[2] * p[6] || p[0] * p[4] * p[6]) continue;
          del.push(y * w + x);
        }
      }
      if (del.length) changed = true;
      for (const i of del) m[i] = 0;
    }
  }
  // Clean-up: redundant staircase pixels, one at a time in scan order.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!m[y * w + x]) continue;
      const set = N8.filter(([dx, dy]) => at(x + dx, y + dy));
      if (set.length < 3) continue;
      // One group? Neighbours touch when their offsets differ by ≤ 1 on both axes.
      const seen = new Set([0]);
      const stack = [0];
      while (stack.length) {
        const k = stack.pop();
        set.forEach((q, j) => {
          if (!seen.has(j) && Math.abs(q[0] - set[k][0]) <= 1 && Math.abs(q[1] - set[k][1]) <= 1) {
            seen.add(j);
            stack.push(j);
          }
        });
      }
      if (seen.size === set.length) m[y * w + x] = 0;
    }
  }
  return m;
}

/** A dot stroke at a component's centroid, with the radius its ink reaches. */
function dotOf(pixels, w) {
  const cs = pixels.map(i => pt(i, w));
  const x = cs.reduce((s, v) => s + v[0], 0) / cs.length;
  const y = cs.reduce((s, v) => s + v[1], 0) / cs.length;
  const radius = Math.max(...cs.map(p => Math.hypot(p[0] - x, p[1] - y))) + 0.5;
  return { points: [[x, y]], closed: false, dot: true, radius };
}

/** Connected components (8-connected) of a mask: [{ pixels: [i], x0, y0, x1, y1 }]. */
export function components8(mask, w, h) {
  const label = new Int32Array(w * h).fill(-1);
  const out = [];
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || label[start] >= 0) continue;
    const comp = { pixels: [], x0: w, y0: h, x1: -1, y1: -1 };
    const stack = [start];
    label[start] = out.length;
    while (stack.length) {
      const i = stack.pop();
      comp.pixels.push(i);
      const x = i % w;
      const y = (i - x) / w;
      if (x < comp.x0) comp.x0 = x;
      if (x > comp.x1) comp.x1 = x;
      if (y < comp.y0) comp.y0 = y;
      if (y > comp.y1) comp.y1 = y;
      for (const [dx, dy] of N8) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (mask[j] && label[j] < 0) {
          label[j] = out.length;
          stack.push(j);
        }
      }
    }
    comp.pixels.sort((p, q) => p - q);
    out.push(comp);
  }
  return out;
}

const pt = (i, w) => [(i % w) + 0.5, Math.floor(i / w) + 0.5];

/**
 * Graph of a skeleton: { nodes: [{ pixels, x, y, kind: 'end' | 'junction' }],
 * edges: [{ a, b, path: [[x, y]] }] (a, b node indexes; path from a to b),
 * loops: [[[x, y]]] }.
 */
export function skeletonGraph(sk, w, h) {
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && sk[y * w + x] === 1;
  const nbrs = i => {
    const x = i % w;
    const y = (i - x) / w;
    const out = [];
    for (const [dx, dy] of N8) if (on(x + dx, y + dy)) out.push((y + dy) * w + x + dx);
    return out;
  };
  const crossing = i => {
    const x = i % w;
    const y = (i - x) / w;
    const p = N8.map(([dx, dy]) => (on(x + dx, y + dy) ? 1 : 0));
    let c = 0;
    for (let k = 0; k < 8; k++) if (!p[k] && p[(k + 1) % 8]) c++;
    return c;
  };
  const nodeOf = new Int32Array(w * h).fill(-1);
  const nodes = [];
  // Junction pixels, grouped; then end points. A junction pixel has ≥ 3
  // branches (crossing number) or ≥ 3 skeleton neighbours: thinning leaves
  // little triangles of pixels where lines meet, and every pixel of such a
  // knot belongs to the junction — otherwise a walk circles the knot and
  // swallows the first pixel of a real branch.
  const isJunction = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (sk[i] && (crossing(i) >= 3 || nbrs(i).length >= 3)) isJunction[i] = 1;
  for (let i = 0; i < w * h; i++) {
    if (!isJunction[i] || nodeOf[i] >= 0) continue;
    const pixels = [];
    const stack = [i];
    nodeOf[i] = nodes.length;
    while (stack.length) {
      const p = stack.pop();
      pixels.push(p);
      for (const q of nbrs(p)) {
        if (isJunction[q] && nodeOf[q] < 0) {
          nodeOf[q] = nodes.length;
          stack.push(q);
        }
      }
    }
    pixels.sort((p, q) => p - q);
    const c = pixels.map(p => pt(p, w));
    nodes.push({ pixels, x: c.reduce((s, v) => s + v[0], 0) / c.length, y: c.reduce((s, v) => s + v[1], 0) / c.length, kind: 'junction' });
  }
  for (let i = 0; i < w * h; i++) {
    if (!sk[i] || nodeOf[i] >= 0) continue;
    const n = nbrs(i).length;
    if (n <= 1) {
      nodeOf[i] = nodes.length;
      const [x, y] = pt(i, w);
      nodes.push({ pixels: [i], x, y, kind: n === 0 ? 'isolated' : 'end' });
    }
  }
  const visited = new Uint8Array(w * h);
  const edges = [];
  const is4 = (p, q) => Math.abs((p % w) - (q % w)) + Math.abs(Math.floor(p / w) - Math.floor(q / w)) === 1;
  for (let ni = 0; ni < nodes.length; ni++) {
    for (const start of nodes[ni].pixels) {
      for (const first of nbrs(start)) {
        if (nodeOf[first] === ni) continue;
        if (nodeOf[first] >= 0) {
          // Two nodes touching directly: a one-step edge (once).
          if (nodeOf[first] > ni) edges.push({ a: ni, b: nodeOf[first], path: [pt(start, w), pt(first, w)] });
          continue;
        }
        if (visited[first]) continue;
        const path = [pt(start, w), pt(first, w)];
        visited[first] = 1;
        let prev = start;
        let cur = first;
        let end = -1;
        for (;;) {
          const next = nbrs(cur).filter(q => q !== prev);
          const node = next.find(q => nodeOf[q] >= 0 && !(nodeOf[q] === ni && path.length <= 2));
          if (node !== undefined) {
            path.push(pt(node, w));
            end = nodeOf[node];
            break;
          }
          const free = next.filter(q => !visited[q] && nodeOf[q] < 0);
          if (!free.length) break;
          // Prefer the 4-neighbour: a diagonal shortcut skips a pixel of the line.
          const step = free.find(q => is4(cur, q)) ?? free[0];
          visited[step] = 1;
          path.push(pt(step, w));
          prev = cur;
          cur = step;
        }
        if (end >= 0) edges.push({ a: ni, b: end, path });
      }
    }
  }
  // Rings with no node at all (o, 0, a closed bowl drawn as one line).
  const loops = [];
  for (let i = 0; i < w * h; i++) {
    if (!sk[i] || visited[i] || nodeOf[i] >= 0) continue;
    const ring = [];
    let prev = -1;
    let cur = i;
    for (;;) {
      visited[cur] = 1;
      ring.push(pt(cur, w));
      const next = nbrs(cur).filter(q => q !== prev && !visited[q]);
      if (!next.length) break;
      prev = cur;
      cur = next.find(q => is4(prev, q)) ?? next[0];
    }
    if (ring.length >= 3) loops.push(ring);
  }
  return { nodes, edges, loops };
}

const len = path => {
  let s = 0;
  for (let i = 1; i < path.length; i++) s += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  return s;
};

/**
 * Removes spurs (junction → end edges whose reach — length + tipReach(end
 * node) — is within the junction's limit) until none remain. `limit`: px,
 * or a function of the junction's node index; `tipReach` (default 0).
 */
export function pruneSpurs(graph, limit, tipReach = () => 0) {
  const limitAt = typeof limit === 'function' ? limit : () => limit;
  let { nodes, edges } = graph;
  for (let round = 0; round < 4; round++) {
    const degree = new Array(nodes.length).fill(0);
    edges.forEach(e => {
      degree[e.a]++;
      degree[e.b]++;
    });
    const spur = e => {
      const ka = nodes[e.a].kind;
      const kb = nodes[e.b].kind;
      const junction = ka === 'end' && degree[e.b] >= 3 ? e.b : kb === 'end' && degree[e.a] >= 3 ? e.a : -1;
      const tip = junction === e.b ? e.a : e.b;
      // A tiny loop back to the same junction is a thinning knot, not a counter.
      const knot = e.a === e.b && len(e.path) < 2 * limitAt(e.a);
      return (junction >= 0 && len(e.path) + tipReach(tip) <= limitAt(junction)) || knot;
    };
    const kept = edges.filter(e => !spur(e));
    if (kept.length === edges.length) break;
    edges = kept;
  }
  return { ...graph, nodes, edges };
}

/** Unit direction of an edge leaving node `n` (measured `reach` px along it). */
function leaving(edge, n, nodes, reach) {
  const path = edge.a === n ? edge.path : edge.path.slice().reverse();
  const o = [nodes[n].x, nodes[n].y];
  let p = path[path.length - 1];
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    acc += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    if (acc >= reach) {
      p = path[i];
      break;
    }
  }
  const dx = p[0] - o[0];
  const dy = p[1] - o[1];
  const d = Math.hypot(dx, dy) || 1;
  return [dx / d, dy / d];
}

/** Orients an open stroke: from its upper end, or left end if nearly horizontal. */
function orient(points) {
  const a = points[0];
  const b = points[points.length - 1];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const flip = Math.abs(dy) < 0.5 * Math.abs(dx) ? dx < 0 : dy < 0;
  return flip ? points.slice().reverse() : points;
}

/** A closed ring starting at its top pixel and running anticlockwise (on the page). */
function orientLoop(ring) {
  let top = 0;
  ring.forEach((p, i) => {
    if (p[1] < ring[top][1] || (p[1] === ring[top][1] && p[0] < ring[top][0])) top = i;
  });
  let r = ring.slice(top).concat(ring.slice(0, top));
  // Shoelace area in image coordinates (y down): > 0 means clockwise on the page.
  let area = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i];
    const q = r[(i + 1) % r.length];
    area += p[0] * q[1] - q[0] * p[1];
  }
  if (area > 0) r = [r[0], ...r.slice(1).reverse()];
  return [...r, r[0]];
}

/**
 * Plausible strokes from a binary glyph crop.
 * @returns { strokes: [{ points: [[x, y]], closed, dot, radius? }], diagnostics:
 *   { skeletonPixels, junctions, ends, loops, spursRemoved, joins, scale } }
 *   Points are continuous crop coordinates (pixel x covers [x, x + 1)),
 *   whatever resolution the thinning ran at (diagnostics.scale).
 */
export function traceStrokes(mask, w, h, strokeWidth) {
  if (!(Math.max(1, strokeWidth) < SKELETON.FINE_BELOW)) {
    const direct = traceAtScale(mask, w, h, strokeWidth);
    return { strokes: direct.strokes, diagnostics: { ...direct.diagnostics, scale: 1 } };
  }
  const W = 2 * w;
  const up = new Uint8Array(W * 2 * h);
  for (let y = 0; y < 2 * h; y++) {
    const row = Math.floor(y / 2) * w;
    for (let x = 0; x < W; x++) up[y * W + x] = mask[row + Math.floor(x / 2)];
  }
  const fine = traceAtScale(up, W, 2 * h, 2 * strokeWidth);
  const strokes = fine.strokes.map(st => ({ ...st, points: st.points.map(([x, y]) => [x / 2, y / 2]), ...(st.radius !== undefined ? { radius: st.radius / 2 } : null) }));
  return { strokes, diagnostics: { ...fine.diagnostics, scale: 2 } };
}

function traceAtScale(mask, w, h, strokeWidth) {
  const sw = Math.max(1, strokeWidth);
  const strokes = [];
  const diagnostics = { skeletonPixels: 0, junctions: 0, ends: 0, loops: 0, spursRemoved: 0, joins: 0, dots: 0 };
  // Dots: small components on their own.
  const comps = components8(mask, w, h);
  const body = new Uint8Array(w * h);
  for (const c of comps) {
    const size = Math.max(c.x1 - c.x0 + 1, c.y1 - c.y0 + 1);
    if (size <= SKELETON.DOT * sw) {
      strokes.push(dotOf(c.pixels, w));
      diagnostics.dots++;
    } else {
      for (const i of c.pixels) body[i] = 1;
    }
  }
  // Pinholes: small paper regions not reaching the crop's border.
  const paper = new Uint8Array(w * h);
  for (let i = 0; i < paper.length; i++) paper[i] = body[i] ? 0 : 1;
  const maxHole = (SKELETON.PINHOLE * sw) ** 2;
  diagnostics.counters = 0; // enclosed paper large enough to be a letter's counter
  for (const c of components8(paper, w, h)) {
    const enclosed = c.x0 > 0 && c.y0 > 0 && c.x1 < w - 1 && c.y1 < h - 1;
    if (enclosed && c.pixels.length <= maxHole) {
      for (const i of c.pixels) body[i] = 1;
      diagnostics.pinholes = (diagnostics.pinholes || 0) + 1;
    } else if (enclosed) diagnostics.counters++;
  }
  const sk = thin(body, w, h);
  for (let i = 0; i < sk.length; i++) diagnostics.skeletonPixels += sk[i];
  for (const c of comps) {
    if (!body[c.pixels[0]] || c.pixels.some(i => sk[i])) continue;
    strokes.push(dotOf(c.pixels, w));
    diagnostics.dots++;
  }
  const raw = skeletonGraph(sk, w, h);
  // Each junction's depth: its distance to paper (chamfer, px).
  const paperAll = new Uint8Array(w * h);
  for (let i = 0; i < paperAll.length; i++) paperAll[i] = body[i] ? 0 : 1;
  const depth = distanceTo(paperAll, w, h);
  const deepest = n => Math.max(...raw.nodes[n].pixels.map(p => depth[p]));
  const graph = pruneSpurs(raw, n => deepest(n) + SKELETON.SPUR_PX, deepest);
  diagnostics.spursRemoved = raw.edges.length - graph.edges.length;
  const { nodes, edges } = graph;
  const incident = nodes.map(() => []);
  edges.forEach((e, k) => {
    incident[e.a].push(k);
    if (e.b !== e.a) incident[e.b].push(k);
  });
  diagnostics.junctions = incident.filter(l => l.length >= 3).length;
  diagnostics.ends = incident.filter(l => l.length === 1).length;
  // Pair the branches at each node by good continuation.
  const partner = new Map(); // `${edge}:${node}` → `${edge}:${node}`
  const cosLimit = -Math.cos((SKELETON.CONTINUE_DEG * Math.PI) / 180);
  incident.forEach((list, n) => {
    if (list.length < 2) return;
    const dirs = list.map(k => leaving(edges[k], n, nodes, SKELETON.DIRECTION_REACH * sw));
    const pairs = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (list[i] === list[j]) continue;
        const cos = dirs[i][0] * dirs[j][0] + dirs[i][1] * dirs[j][1];
        if (list.length === 2 || cos <= cosLimit) pairs.push({ i, j, cos });
      }
    }
    pairs.sort((p, q) => p.cos - q.cos || p.i - q.i || p.j - q.j);
    const used = new Set();
    for (const p of pairs) {
      if (used.has(p.i) || used.has(p.j)) continue;
      used.add(p.i);
      used.add(p.j);
      partner.set(`${list[p.i]}:${n}`, `${list[p.j]}:${n}`);
      partner.set(`${list[p.j]}:${n}`, `${list[p.i]}:${n}`);
      if (list.length >= 3) diagnostics.joins++;
    }
  });
  const usedEdge = new Uint8Array(edges.length);
  const walk = (k0, from) => {
    const points = [];
    let k = k0;
    let at = from;
    let closed = false;
    for (;;) {
      usedEdge[k] = 1;
      const e = edges[k];
      const forward = e.a === at;
      const path = forward ? e.path : e.path.slice().reverse();
      const to = forward ? e.b : e.a;
      const start = points.length ? 1 : 0;
      if (!points.length) points.push([nodes[at].x, nodes[at].y]);
      for (let i = Math.max(1, start); i < path.length - 1; i++) points.push(path[i]);
      points.push([nodes[to].x, nodes[to].y]);
      const next = partner.get(`${k}:${to}`);
      if (!next) break;
      const nk = Number(next.split(':')[0]);
      if (usedEdge[nk]) {
        closed = nk === k0;
        break;
      }
      k = nk;
      at = to;
    }
    return { points, closed };
  };
  // Open chains first: start at an end with no partner.
  edges.forEach((e, k) => {
    for (const n of [e.a, e.b]) {
      if (usedEdge[k] || partner.has(`${k}:${n}`)) continue;
      const s = walk(k, n);
      strokes.push({ points: s.closed ? orientLoop(s.points.slice(0, -1)) : orient(s.points), closed: s.closed, dot: false });
    }
  });
  // What is left are cycles through junctions.
  edges.forEach((e, k) => {
    if (usedEdge[k]) return;
    const s = walk(k, e.a);
    strokes.push({ points: orientLoop(s.points.slice(0, -1)), closed: true, dot: false });
  });
  for (const ring of raw.loops) {
    strokes.push({ points: orientLoop(ring), closed: true, dot: false });
    diagnostics.loops++;
  }
  // Isolated skeleton pixels left by thinning a compact blob: a dot.
  nodes.forEach((n, i) => {
    if (n.kind === 'isolated' && !incident[i].length) {
      strokes.push({ points: [[n.x, n.y]], closed: false, dot: true, radius: sw / 2 });
      diagnostics.dots++;
    }
  });
  // Reading order: by leftmost point, then top.
  const key = s => {
    let minX = Infinity;
    let minY = Infinity;
    for (const p of s.points) {
      if (p[0] < minX) minX = p[0];
      if (p[1] < minY) minY = p[1];
    }
    return [minX, minY];
  };
  strokes.sort((p, q) => {
    const a = key(p);
    const b = key(q);
    return a[0] - b[0] || a[1] - b[1];
  });
  return { strokes, diagnostics };
}
