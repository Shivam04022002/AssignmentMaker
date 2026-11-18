/**
 * Devanagari cluster boundaries inside one word region.
 *
 * A Hindi word is one connected piece of ink along its headline
 * (shirorekha), so it is never cut at the headline. Instead:
 *
 *   headline   the dense row band near the top of the word (the line's
 *              detected headline when available)
 *   body       rows between the headline band (+ half a stroke) and the
 *              baseline: clusters
 *              separate here, so the column profile of the body supplies
 *              the gap / valley candidates (unitBoundaries.js) and the
 *              expected clusters (typed order, prior widths — a pre-base
 *              ि widens its own cluster on the left, a post-base ा its
 *              right) choose among them; the gaps beside a lone matra-like
 *              stem may be inside a cluster, so they are optional
 *   structure  a cut beside a lone stem decides which cluster gets it; the
 *              typed text says which may: a post-base matra (ा ी ो ौ) of the
 *              cluster on the left, a pre-base ि of the cluster on the right.
 *              Handing the stem to a cluster the text does not give one
 *              costs STRUCTURE_COST; if the cut is still taken, both units
 *              carry the conflict and are reported ambiguous
 *   marks      ink blobs above the headline and below the baseline — not
 *              the sliver a stroke's round end pokes past them — are
 *              assigned to the cluster under / above their centre; each
 *              assignment is checked against what the cluster's text
 *              expects (matra or anusvara above; u-matras, halant, nukta
 *              below) — a mismatch, or a mark straddling a boundary, is
 *              reported, never silently moved
 *
 * Rules kept: one unit per orthographic cluster (never per code point); a
 * pre-base matra belongs to the cluster it is typed in, even though its
 * ink is to the left; conjunct parts are not separated; a word whose body
 * shows no boundaries keeps one shared region (headline / outline only).
 */
import { columnProfile, segmentUnits } from './unitBoundaries';

export const STRUCTURE_COST = 1.5;
const marksOf = u => (u && u.priors && u.priors.marks) || {};

/**
 * Structure cost of resting the boundary between units[k] and units[k + 1]
 * on candidate c. `stemRight`: a lone stem lies just right of the gap (the
 * cut gives it to the right cluster); `stemLeft`: just left (gives it to
 * the left cluster).
 */
export function stemAttributionCost(units, k, c) {
  const L = marksOf(units[k]);
  const R = marksOf(units[k + 1]);
  const lt = units[k] ? units[k].text : '';
  const rt = units[k + 1] ? units[k + 1].text : '';
  if (c.stemRight && L.post && !R.pre) {
    return { cost: STRUCTURE_COST, reason: `the cut gives the stem on its right to “${rt}”, but the text gives “${lt}” a matra after it and “${rt}” none before it` };
  }
  if (c.stemLeft && R.pre && !L.post) {
    return { cost: STRUCTURE_COST, reason: `the cut gives the stem on its left to “${lt}”, but the text gives “${rt}” a matra before it and “${lt}” none after it` };
  }
  return { cost: 0, reason: null };
}

/** Rows of the headline band: the densest row near the top and its neighbours. */
export function headlineBand(mask, w, [x0, y0, bw, bh], hint) {
  const profile = new Int32Array(bh);
  for (let y = 0; y < bh; y++) {
    const row = (y0 + y) * w;
    for (let x = x0; x < x0 + bw; x++) profile[y] += mask[row + x];
  }
  let peak = -1;
  let best = 0;
  const from = hint !== undefined ? Math.max(0, hint - y0 - 3) : 0;
  const to = hint !== undefined ? Math.min(bh - 1, hint - y0 + 3) : Math.floor(bh * 0.6);
  for (let y = from; y <= to; y++) {
    if (profile[y] > best) {
      best = profile[y];
      peak = y;
    }
  }
  if (peak < 0 || best < 0.45 * bw) return null; // no continuous headline
  let top = peak;
  let bottom = peak;
  while (top > 0 && profile[top - 1] >= 0.5 * best) top--;
  while (bottom < bh - 1 && profile[bottom + 1] >= 0.5 * best) bottom++;
  return { top: y0 + top, bottom: y0 + bottom, coverage: best / bw };
}

/** Ink blobs (column runs) in rows y0..y1 of [x0, x1]. */
function blobs(mask, w, x0, x1, y0, y1) {
  if (y1 < y0) return [];
  const p = columnProfile(mask, w, x0, x1, y0, y1);
  const out = [];
  for (let i = 0; i < p.length; ) {
    if (!p[i]) {
      i++;
      continue;
    }
    let j = i;
    let ink = 0;
    while (j < p.length && p[j]) ink += p[j++];
    let top = -1;
    let bottom = -1;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0 + i; x < x0 + j; x++) {
        if (mask[y * w + x]) {
          if (top < 0) top = y;
          bottom = y;
          break;
        }
      }
    }
    out.push({ x0: x0 + i, x1: x0 + j - 1, cx: x0 + (i + j - 1) / 2, ink, y0: top, y1: bottom });
    i = j;
  }
  return out;
}

/**
 * The round end of a stroke pokes a sliver past the line it stands on (a
 * stem's foot below the baseline, its top above the headline — more so on a
 * straightened page, where the measured line can sit a few rows inside the
 * stems). A sliver touches that line and is no taller than a stroke + 1 px;
 * a real mark is a blob of its own (nukta, u-matra, anusvara) or reaches
 * further (halant).
 */
const notSliver = (list, touchRow, strokeWidth) => list.filter(b => !(b.y0 <= touchRow && b.y1 >= touchRow && b.y1 - b.y0 + 1 <= Math.ceil(strokeWidth) + 1));

/**
 * Small ink pieces of a word region that are not connected to its headline
 * and lie in the lower part of the body — a nukta dot or u-matra measured
 * as inside the body when the line's baseline sits at the marks. Each is
 * { x0, x1, cx, y0, y1 } (region columns / rows). At most DETACHED_MARK
 * x-heights in either direction.
 */
const DETACHED_MARK = 0.45;
function detachedBelowMarks(mask, w, x0, x1, y0, yEnd, band, bodyTop, bodyBottom, xHeight) {
  if (!band) return [];
  const rw = x1 - x0 + 1;
  const rh = yEnd - y0 + 1;
  const label = new Int32Array(rw * rh).fill(-1);
  const out = [];
  const limit = DETACHED_MARK * xHeight;
  const middle = bodyTop + 0.5 * (bodyBottom - bodyTop);
  for (let s = 0; s < rw * rh; s++) {
    if (label[s] >= 0 || !mask[(y0 + Math.floor(s / rw)) * w + x0 + (s % rw)]) continue;
    const stack = [s];
    label[s] = s;
    let bx0 = Infinity;
    let bx1 = -Infinity;
    let by0 = Infinity;
    let by1 = -Infinity;
    let touchesHead = false;
    while (stack.length) {
      const i = stack.pop();
      const x = i % rw;
      const y = (i - x) / rw;
      bx0 = Math.min(bx0, x);
      bx1 = Math.max(bx1, x);
      by0 = Math.min(by0, y);
      by1 = Math.max(by1, y);
      if (y0 + y >= band.top && y0 + y <= band.bottom) touchesHead = true;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= rw || yy >= rh) continue;
          const j = yy * rw + xx;
          if (label[j] < 0 && mask[(y0 + yy) * w + x0 + xx]) {
            label[j] = s;
            stack.push(j);
          }
        }
      }
    }
    if (touchesHead || bx1 - bx0 + 1 > limit || by1 - by0 + 1 > limit || y0 + by0 <= middle) continue;
    out.push({ x0: x0 + bx0, x1: x0 + bx1, cx: x0 + (bx0 + bx1) / 2, y0: y0 + by0, y1: y0 + by1 });
  }
  return out;
}

/**
 * Cuts a Devanagari word region into its clusters.
 * @returns { headline, units: [{ range, left, right, group, fit, marks:
 *   { above: { expected, found }, below: { expected, found } }, evidence,
 *   reasons }], candidates, structure }
 */
export function segmentDevanagariWord({ mask, w, bbox, units, line, xHeight, strokeWidth }) {
  const [x0, y0, bw, bh] = bbox;
  const x1 = x0 + bw - 1;
  const yEnd = y0 + bh - 1;
  const band = headlineBand(mask, w, bbox, line && line.headline);
  const baseline = line && line.baseline !== undefined ? Math.min(yEnd, Math.max(y0, line.baseline)) : yEnd;
  // Half a stroke below the band: on a straightened page the headline's
  // lower edge leaves a sliver of ink that would bridge the gaps beside a
  // matra stem in the first body rows.
  const bodyTop = band ? Math.min(yEnd, band.bottom + 1 + Math.ceil(strokeWidth / 2)) : y0;
  const bodyBottom = Math.max(bodyTop, baseline);
  const profile = columnProfile(mask, w, x0, x1, bodyTop, bodyBottom);
  // A narrow run of body ink between two gaps — one stroke wide — is the
  // shape of a matra stem (ा ी ो ौ after its consonant, ि before it).
  // The gaps beside it may be inside a cluster, so leaving them unused is
  // cheap; the cluster priors (a matra widens its own cluster) decide.
  // The word's own ink edges bound a run too: a lone stem can be the
  // word's first ink (ि) or its last (ा ी ो ौ).
  const adjust = (cands, prof) => {
    const gaps = cands.filter(c => c.kind === 'gap');
    const marked = new Set();
    const narrow = runWidth => runWidth > 0 && runWidth <= Math.max(2.5 * strokeWidth, 0.35 * xHeight);
    let first = 0;
    while (first < prof.length - 1 && prof[first] === 0) first++;
    let last = prof.length - 1;
    while (last > first && prof[last] === 0) last--;
    for (let i = 0; i + 1 < gaps.length; i++) {
      if (narrow(gaps[i + 1].from - gaps[i].to - 1)) {
        marked.add(gaps[i]);
        marked.add(gaps[i + 1]);
        stemRight.add(gaps[i]);
        stemLeft.add(gaps[i + 1]);
      }
    }
    if (gaps.length && narrow(gaps[0].from - (x0 + first))) {
      marked.add(gaps[0]);
      stemLeft.add(gaps[0]);
    }
    if (gaps.length && narrow(x0 + last - gaps[gaps.length - 1].to)) {
      marked.add(gaps[gaps.length - 1]);
      stemRight.add(gaps[gaps.length - 1]);
    }
    return cands.map(c => (marked.has(c) ? { ...c, internalLikely: true, stemLeft: stemLeft.has(c), stemRight: stemRight.has(c) } : c));
  };
  const stemLeft = new Set();
  const stemRight = new Set();
  const cut = segmentUnits({ profile, x0, units, xHeight, strokeWidth, adjust, boundaryCost: (k, c) => stemAttributionCost(units, k, c) });
  const above = band ? notSliver(blobs(mask, w, x0, x1, y0, band.top - 1), band.top - 1, strokeWidth) : [];
  const below = notSliver(blobs(mask, w, x0, x1, bodyBottom + 1, yEnd), bodyBottom + 1, strokeWidth);
  const detachedLow = detachedBelowMarks(mask, w, x0, x1, y0, yEnd, band, bodyTop, bodyBottom, xHeight);
  const structureReasons = [];
  if (!band) structureReasons.push('no continuous headline found in this word');
  const anyBoundary = cut.units.some(u => u.left || u.right);
  if (units.length > 1 && !anyBoundary) structureReasons.push('only the word’s headline and outline were found; cluster boundaries are not visible');

  const out = cut.units.map((u, k) => {
    const unit = units[k];
    const marks = (unit.priors && unit.priors.marks) || { pre: false, above: false, below: false, post: false };
    const evidence = [];
    const reasons = [...structureReasons];
    const owns = b => b.cx >= u.range[0] && b.cx <= u.range[1];
    const straddles = b => b.x0 < u.range[0] - 1 || b.x1 > u.range[1] + 1;
    const foundAbove = above.filter(owns);
    let foundBelow = below.filter(owns);
    // A line where most clusters carry a mark below (a row of nukta letters)
    // measures its baseline at the marks: a small piece apart from the body,
    // low in the cluster, then stands for the expected mark (Phase 12). It
    // only confirms an expected mark; it never makes ink "unexplained".
    if (marks.below && !foundBelow.length) {
      const low = detachedLow.filter(owns);
      if (low.length) {
        foundBelow = low;
        evidence.push('mark below found as a separate piece low in the cluster (the line’s baseline sits at the marks)');
      }
    }
    if (marks.above && foundAbove.length) evidence.push('mark above the headline where the text expects one');
    if (marks.above && !foundAbove.length && !marks.pre) reasons.push('expected a mark above the headline; none found over this cluster');
    if (!marks.above && !marks.pre && foundAbove.length) reasons.push('ink above the headline here that the text does not explain (may belong to a neighbour)');
    if (marks.below && foundBelow.length) evidence.push('mark below the baseline where the text expects one');
    if (marks.below && !foundBelow.length) reasons.push('expected a mark below; none found under this cluster');
    if (!marks.below && foundBelow.length) reasons.push('ink below the baseline here that the text does not explain');
    if ([...foundAbove, ...foundBelow].some(straddles)) reasons.push('a mark straddles the cluster boundary');
    if (marks.pre) {
      // The ि stem is written first, at the cluster's left; its loop rises
      // above the headline over the left part of the cluster.
      const leftPart = u.range[0] + 0.45 * (u.range[1] - u.range[0]);
      if (foundAbove.some(b => b.cx <= leftPart)) evidence.push('pre-base matra loop found over the cluster’s left side');
      else reasons.push('pre-base matra not distinguishable; kept with its cluster by typed order');
      evidence.push('pre-base matra assigned to the cluster it is typed in, not to the ink on its left');
    }
    if (unit.conjunct) reasons.push('conjunct: its consonant parts are not separated');
    for (const c of [u.left, u.right]) if (c && c.conflict) reasons.push(`boundary contradicts the typed cluster structure: ${c.conflict}`);
    if (marks.post && u.right && u.right.stemLeft && !u.right.conflict) evidence.push('post-base matra stem kept with the cluster it is typed in');
    if (marks.pre && u.left && u.left.stemRight && !u.left.conflict) evidence.push('pre-base matra stem kept with the cluster it is typed in');
    return {
      ...u,
      marks: { above: { expected: !!marks.above || !!marks.pre, found: foundAbove.length }, below: { expected: !!marks.below, found: foundBelow.length } },
      evidence,
      reasons,
    };
  });
  return {
    headline: band,
    units: out,
    candidates: cut.candidates,
    structure: { bodyTop, bodyBottom, marksAbove: above.length, marksBelow: below.length },
  };
}
