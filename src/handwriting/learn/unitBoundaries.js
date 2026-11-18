/**
 * Candidate boundaries between the units of one word region, from pixels.
 *
 * Candidates (columns of the text mask within the region):
 *   gap     a run of columns with no ink — two separate pieces of ink
 *           strength = min(1, gap width / (0.25 · x-height))
 *   valley  a local minimum of the column profile inside connected ink
 *           that is no thicker than a joining stroke (≤ 1.6 × stroke
 *           width) and at most half the ink around it — touching letters
 *           strength = depth = 1 − ink / local maximum
 *
 * The expected units (their order and prior widths, expectedText.js) pick
 * among the candidates by dynamic programming: expected boundary k (at the
 * prior position, scaled to the region) may take candidate c — cost
 * ((x − expected) / mean unit width)² + weakness (a gap: ≤ 0.1, whatever
 * its width — two separate pieces of ink; a valley: 0.5–0.8) — or be
 * SKIPPED (cost SKIP: no visible boundary, so the units on both sides
 * share one region); a candidate may stay unused (a gap costs 0.4–1.0, a
 * valley hardly — letters such as k, m, u and w have valleys of their own). Boxes therefore
 * only ever end at real gaps or valleys, never at an equal-width division.
 *
 * A script may add a structure cost for resting boundary k on a candidate
 * (`boundaryCost(k, candidate)`; Devanagari: a matra stem handed to the
 * cluster the text does not give it). A chosen cut that pays one is
 * returned with `conflict` (its reason) so the unit is reported ambiguous.
 */

export const BOUNDARY_COSTS = { SKIP: 1.1, UNUSED_GAP: 0.4, UNUSED_GAP_PER_STRENGTH: 0.6, UNUSED_VALLEY: 0.05, GAP_WEAKNESS: 0.1, VALLEY_WEAKNESS: 0.5, MAX_DEV: 4 };

/** Cost of resting a boundary on a candidate, before its position: a gap (two
 * separate pieces of ink) is strong evidence whatever its width; a valley
 * inside connected ink is weak — letters such as k, m, u and w have their own. */
const weakness = (c, costs) => (c.kind === 'gap' ? costs.GAP_WEAKNESS * (1 - c.strength) : costs.VALLEY_WEAKNESS + 0.3 * (1 - c.strength));

/** Ink per column in [x0, x1] × [y0, y1] of a mask. */
export function columnProfile(mask, w, x0, x1, y0, y1) {
  const out = new Int32Array(x1 - x0 + 1);
  for (let y = y0; y <= y1; y++) {
    const row = y * w;
    for (let x = x0; x <= x1; x++) out[x - x0] += mask[row + x];
  }
  return out;
}

/** Stroke width estimate in a region: 2 · area / boundary length. */
export function strokeWidthIn(mask, w, h, [x0, y0, bw, bh]) {
  let area = 0;
  let edge = 0;
  for (let y = Math.max(1, y0); y < Math.min(h - 1, y0 + bh); y++) {
    for (let x = Math.max(1, x0); x < Math.min(w - 1, x0 + bw); x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      area++;
      if (!mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w]) edge++;
    }
  }
  return edge ? Math.max(1, (2 * area) / edge) : 2;
}

/** Gap and valley candidates of a column profile starting at x0. */
export function boundaryCandidates(profile, x0, xHeight, strokeWidth) {
  const n = profile.length;
  const out = [];
  let i = 0;
  while (i < n && profile[i] === 0) i++; // leading paper is not a boundary
  let last = n - 1;
  while (last >= 0 && profile[last] === 0) last--;
  for (; i <= last; i++) {
    if (profile[i] === 0) {
      let j = i;
      while (j <= last && profile[j] === 0) j++;
      const width = j - i;
      out.push({ x: x0 + Math.round((i + j - 1) / 2), from: x0 + i, to: x0 + j - 1, kind: 'gap', width, strength: Math.min(1, width / Math.max(1, 0.25 * xHeight)) });
      i = j - 1;
      continue;
    }
    const v = profile[i];
    if (i === 0 || i === n - 1 || v > profile[i - 1] || v > profile[i + 1] || v > 1.6 * strokeWidth) continue;
    const reach = Math.max(2, Math.round(0.4 * xHeight));
    let around = 0;
    for (let k = Math.max(0, i - reach); k <= Math.min(n - 1, i + reach); k++) around = Math.max(around, profile[k]);
    const depth = around ? 1 - v / around : 0;
    if (depth < 0.5) continue;
    const prev = out[out.length - 1];
    if (prev && prev.kind === 'valley' && x0 + i - prev.x < 0.15 * xHeight) {
      if (depth > prev.strength) out[out.length - 1] = { x: x0 + i, kind: 'valley', ink: v, strength: depth };
      continue;
    }
    out.push({ x: x0 + i, kind: 'valley', ink: v, strength: depth });
  }
  return out;
}

/**
 * Assigns expected boundaries (absolute x positions, ascending) to
 * candidates (ascending x). Returns an array, one entry per expected
 * boundary: the chosen candidate (with `dev`, the distance in mean unit
 * widths) or null (skipped), and the total cost.
 */
export function chooseBoundaries(expectedX, candidates, unitWidth, costs = BOUNDARY_COSTS, boundaryCost = null) {
  const K = expectedX.length;
  const C = candidates.length;
  const INF = 1e9;
  const dp = Array.from({ length: K + 1 }, () => new Float64Array(C + 1).fill(INF));
  const back = Array.from({ length: K + 1 }, () => new Array(C + 1).fill(null));
  dp[0][0] = 0;
  // A candidate marked `internalLikely` (e.g. the gap beside a Devanagari
  // matra stem) may well lie inside a unit: leaving it unused is cheap.
  const unused = c => (c.internalLikely ? costs.UNUSED_VALLEY * 2 : c.kind === 'gap' ? costs.UNUSED_GAP + costs.UNUSED_GAP_PER_STRENGTH * c.strength : costs.UNUSED_VALLEY);
  for (let k = 0; k <= K; k++) {
    for (let c = 0; c <= C; c++) {
      const cur = dp[k][c];
      if (cur >= INF) continue;
      const relax = (kk, cc, add, op) => {
        if (cur + add < dp[kk][cc]) {
          dp[kk][cc] = cur + add;
          back[kk][cc] = { k, c, op };
        }
      };
      if (k < K) relax(k + 1, c, costs.SKIP, 'skip');
      if (c < C) relax(k, c + 1, unused(candidates[c]), 'unused');
      if (k < K && c < C) {
        const dev = (candidates[c].x - expectedX[k]) / Math.max(1, unitWidth);
        const structure = boundaryCost ? boundaryCost(k, candidates[c]).cost : 0;
        relax(k + 1, c + 1, Math.min(costs.MAX_DEV, dev * dev) + weakness(candidates[c], costs) + structure, 'take');
      }
    }
  }
  const chosen = new Array(K).fill(null);
  let k = K;
  let c = C;
  while (k > 0 || c > 0) {
    const b = back[k][c];
    if (b.op === 'take') {
      const s = boundaryCost ? boundaryCost(b.k, candidates[b.c]) : null;
      chosen[b.k] = { ...candidates[b.c], dev: Math.abs(candidates[b.c].x - expectedX[b.k]) / Math.max(1, unitWidth), ...(s && s.cost > 0 ? { conflict: s.reason } : null) };
    }
    k = b.k;
    c = b.c;
  }
  return { chosen, cost: dp[K][C] };
}

/** Confidence of one chosen boundary (null = no visible boundary → 0). */
export function cutConfidence(cut) {
  if (!cut) return 0;
  return cut.kind === 'gap' ? 0.6 + 0.4 * cut.strength : 0.2 + 0.4 * cut.strength;
}

/** Tight vertical extent of ink in columns [xa, xb] between rows y0..y1 (or null). */
export function inkRows(mask, w, xa, xb, y0, y1) {
  let top = -1;
  let bottom = -1;
  for (let y = y0; y <= y1; y++) {
    const row = y * w;
    for (let x = xa; x <= xb; x++) {
      if (mask[row + x]) {
        if (top < 0) top = y;
        bottom = y;
        break;
      }
    }
  }
  return top < 0 ? null : [top, bottom];
}

/**
 * Cuts one region into its expected units. `units` carry priors.width.
 * Returns per unit { range: [xa, xb], left, right (cut objects; null at a
 * region edge or a skipped boundary), group (units sharing one region),
 * fit } plus the candidates (for diagnostics).
 */
export function segmentUnits({ profile, x0, units, xHeight, strokeWidth, adjust, boundaryCost }) {
  const n = units.length;
  const width = profile.length;
  const found = boundaryCandidates(profile, x0, xHeight, strokeWidth);
  const candidates = adjust ? adjust(found, profile) : found;
  if (n <= 1) {
    return { units: [{ range: [x0, x0 + width - 1], left: null, right: null, group: [0], fit: 1 }], candidates, edges: true };
  }
  // Ink extent (ignore leading / trailing paper inside the box).
  let a = 0;
  while (a < width - 1 && profile[a] === 0) a++;
  let z = width - 1;
  while (z > a && profile[z] === 0) z--;
  const total = units.reduce((s, u) => s + u.priors.width, 0);
  const span = z - a + 1;
  const expectedX = [];
  let acc = 0;
  for (let k = 0; k < n - 1; k++) {
    acc += units[k].priors.width;
    expectedX.push(x0 + a + (span * acc) / total);
  }
  const unitWidth = span / n;
  const { chosen } = chooseBoundaries(expectedX, candidates, unitWidth, BOUNDARY_COSTS, boundaryCost);
  // Region edges and chosen cuts → ranges; skipped boundaries → groups.
  const out = [];
  let groupStart = 0;
  let left = null;
  let xa = x0 + a;
  for (let k = 0; k < n; k++) {
    const cut = k < n - 1 ? chosen[k] : null;
    if (k < n - 1 && !cut) continue; // the next unit shares this region
    const xb = cut ? (cut.kind === 'gap' ? cut.from - 1 : cut.x) : x0 + z;
    const group = [];
    for (let g = groupStart; g <= k; g++) group.push(g);
    for (const g of group) {
      out[g] = { range: [xa, Math.max(xa, xb)], left, right: cut, group, fit: Math.exp(-((left ? left.dev : 0) + (cut ? cut.dev : 0)) / 2) };
    }
    groupStart = k + 1;
    left = cut;
    xa = cut ? (cut.kind === 'gap' ? cut.to + 1 : cut.x) : xb;
  }
  return { units: out, candidates };
}
