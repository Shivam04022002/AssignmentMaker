/**
 * Confidence of transcription-guided segmentation — two separate scores,
 * both 0–1 engineering measures (not calibrated probabilities):
 *
 * boundary confidence — is this unit's region separated by real evidence?
 *   edge(cut)  gap: 0.6 + 0.4 · strength; valley: 0.2 + 0.4 · depth;
 *              a gap no wider than the blur's reach (below): 0.2 + 0.4 ·
 *              strength, like a valley — blur can close a real gap between
 *              letters and open one inside a letter, so such a gap does not
 *              show where one letter ends;
 *              a word's own edge: that word's separation score; a skipped
 *              boundary (units share one region): 0
 *   unit       min(left edge, right edge) × upstream factor
 *
 * alignment confidence — does the region agree with the text's order and size?
 *   unit       word alignment score × position fit of its cuts
 *              (exp(−mean deviation in unit widths)) × 0.6 if it shares
 *              its region × 0.8 if its word was merged with a neighbour or
 *              split across two regions
 *
 * upstream factor — the image and line it comes from (never erased):
 *   quality score (Phase 3), capped at 0.4 when the writing is too small
 *   (below the 0.45 boundary threshold: nothing on the page is aligned),
 *   otherwise at 0.6 when quality warned about blur,
 *   contrast, noise, size, shadows, lighting or exposure, and at 0.3 when
 *   the photo was not usable; × √(line score). Their reasons are copied
 *   onto every unit.
 *
 * hairline gap — a gap one pixel wide is within the binarisation's own
 *   error: the letters may touch. Weak evidence on its own, so the unit
 *   needs the stricter position fit (as in a blurred image).
 *
 * blur reach — 3 × (edge width − 2 px), from Phase 3's sharpness measure
 *   (median edge width at ink boundaries; ≈ 1.9 px on sharp writing, the
 *   estimator's floor): how wide a gap blur can close or open. 0 when sharp
 *   or not measured.
 *
 * State: 'aligned' only with boundary ≥ 0.45, alignment ≥ 0.5, a position
 * fit ≥ 0.6 (its cuts on average within ≈ 0.5 unit widths of where the
 * text's letter widths put them — a cut further off is more often a gap
 * inside a letter than the boundary; ≥ 0.85 in a blurred image, where blur
 * also erases thin strokes such as a crossbar and exposes a letter's own
 * counter as a "gap" of any width, and at a hairline gap — weak gap
 * evidence must also be where the text puts a boundary), both boundaries at gaps wider than the blur's reach
 * or at word edges (a valley — touching letters — or a gap blur could have
 * made keeps the unit 'ambiguous'), no conflict with the typed cluster
 * structure (Devanagari), its own region, and a usable image.
 *
 * Containing the character in the transcription never raises a score.
 */

export const ALIGNMENT_THRESHOLDS = {
  boundaryOk: 0.45, // below → the unit's boundaries are ambiguous
  alignmentOk: 0.5, // below → the alignment to the text is ambiguous
  fitOk: 0.6, // below → its cuts are far from where the text puts them
  fitOkBlurred: 0.85, // the same, in an image with measurable blur (blur reach > 0) or at a hairline gap
  warnedCap: 0.6,
  // Writing Phase 3 calls small (x-height under 10 px): letters cannot be
  // separated reliably — real pages at ≈ 9 px matched marks and commas as
  // letters. Below boundaryOk, so no unit on such a page counts as aligned.
  tooSmallCap: 0.4,
  unusableCap: 0.3,
};

const DEGRADING = new Set(['blurry', 'low-contrast', 'noisy', 'too-small', 'shadows', 'uneven-lighting', 'too-dark', 'overexposed']);
const r3 = v => Math.round(v * 1000) / 1000;

/** The image- and line-level evidence a unit inherits. */
export function upstreamFactor(quality, line) {
  const reasons = [];
  let factor = quality && quality.score && Number.isFinite(quality.score.score) ? quality.score.score : 0.5;
  if (!quality || !quality.score) reasons.push('image quality unknown');
  const issues = (quality && quality.issues) || [];
  if (issues.some(i => DEGRADING.has(i.code))) factor = Math.min(factor, ALIGNMENT_THRESHOLDS.warnedCap);
  if (issues.some(i => i.code === 'too-small')) factor = Math.min(factor, ALIGNMENT_THRESHOLDS.tooSmallCap);
  if (quality && quality.usable === false) factor = Math.min(factor, ALIGNMENT_THRESHOLDS.unusableCap);
  issues.forEach(i => reasons.push(`image: ${i.message}`));
  if (line && line.confidence) {
    factor *= Math.sqrt(Math.max(0, line.confidence.score));
    (line.reasons || []).forEach(t => reasons.push(`line: ${t}`));
  }
  return { factor: r3(Math.max(0, Math.min(1, factor))), reasons };
}

export const BLUR = { sharpEdge: 2.0, factor: 3 };

/** Widest gap (px) that blur in this image can close or open; 0 when sharp or unknown. */
export function blurReach(quality) {
  const e = quality && quality.metrics ? quality.metrics.edgeWidth : null;
  if (!Number.isFinite(e)) return 0;
  return r3(Math.max(0, BLUR.factor * (e - BLUR.sharpEdge)));
}

/** A gap blur could have made or hidden: no wider than the blur's reach. */
export const blurredGap = (cut, reach) => !!(cut && cut.kind === 'gap' && reach > 0 && cut.width <= reach);

export const MIN_GAP_PX = 2;
/** A gap narrower than MIN_GAP_PX: the binarisation cannot tell it from touching ink. */
export const hairlineGap = cut => !!(cut && cut.kind === 'gap' && cut.width < MIN_GAP_PX);

export function edgeConfidence(cut, regionEdge, reach = 0) {
  if (cut === undefined || cut === null) return regionEdge;
  return cut.kind === 'gap' && !blurredGap(cut, reach) ? 0.6 + 0.4 * cut.strength : 0.2 + 0.4 * cut.strength;
}

/**
 * Scores of one unit.
 * @param p { left, right (cuts or null), atLeftEdge, atRightEdge, regionEdge,
 *            shared, fit, wordScore, op, upstream, blurReach }
 */
export function unitConfidence(p) {
  const reach = p.blurReach || 0;
  const left = p.shared && !p.atLeftEdge ? 0 : p.atLeftEdge ? p.regionEdge : edgeConfidence(p.left, p.regionEdge, reach);
  const right = p.shared && !p.atRightEdge ? 0 : p.atRightEdge ? p.regionEdge : edgeConfidence(p.right, p.regionEdge, reach);
  const sharedBoundary = p.shared ? 0 : Math.min(left, right);
  const boundary = r3(sharedBoundary * p.upstream.factor);
  const structural = (p.shared ? 0.6 : 1) * (p.op === 'merge' || p.op === 'split' ? 0.8 : 1);
  const alignment = r3(Math.max(0, Math.min(1, p.wordScore * p.fit * structural)));
  return {
    boundary: {
      score: boundary,
      basis: 'weaker of the unit’s two boundaries (gap / valley strength, or the word’s own separation) × image and line factor',
      inputs: { left: r3(left), right: r3(right), upstream: p.upstream.factor, shared: !!p.shared, blurReach: reach },
    },
    alignment: {
      score: alignment,
      basis: 'word alignment (width, order, lines) × position fit of the cuts, reduced when the unit shares its region or its word was merged / split',
      inputs: { word: r3(p.wordScore), fit: r3(p.fit), op: p.op },
    },
  };
}

/** Observation state from the scores and conditions. */
export function stateFor({ boundary, alignment, shared, usable, unsupported, valley, blurred, fit, conflict, blurry, hairline }) {
  if (unsupported) return 'unsupported';
  if (usable === false) return 'low-quality';
  // A shared region, a boundary at a valley inside connected ink (letters
  // such as k, m, u, w have valleys of their own), a gap blur could have
  // made, a cut far from its expected place, or a cut that contradicts the
  // typed cluster structure is plausible, not shown.
  if (shared || valley || blurred || conflict) return 'ambiguous';
  if (Number.isFinite(fit) && fit < (blurry || hairline ? ALIGNMENT_THRESHOLDS.fitOkBlurred : ALIGNMENT_THRESHOLDS.fitOk)) return 'ambiguous';
  return boundary >= ALIGNMENT_THRESHOLDS.boundaryOk && alignment >= ALIGNMENT_THRESHOLDS.alignmentOk ? 'aligned' : 'ambiguous';
}
