/**
 * Confidence and coverage contracts for learned handwriting profiles.
 *
 * Representation and validation only. Scores are computed by the analysis
 * phases from measured evidence; nothing here invents a value. A dimension
 * that was not measured is `null` — never a placeholder number.
 */

/** What each confidence dimension describes (scores are 0–1). */
export const CONFIDENCE_DIMENSIONS = [
  'imageQuality', // sharpness, exposure, contrast, skew of the source image(s)
  'regionDetection', // writing area and line finding
  'segmentation', // separation of words / units
  'identification', // alignment of a unit to known prompt or transcription text
  'geometryExtraction', // skeleton / contour quality of the extracted shape
  'reconstruction', // fit of the renderer geometry to the extracted shape
  'variantDiversity', // how many usable observations support the variants
  'composition', // script-specific composition (matras, conjuncts) reliability
  'overall', // combined rendering confidence (documented combination rule)
];

/**
 * UI bands — engineering thresholds, not calibrated probabilities.
 * Configurable; a score below `low` (or no usable evidence) is unsupported.
 */
export const DEFAULT_BANDS = { high: 0.8, medium: 0.55, low: 0.3 };

export function bandOf(score, bands = DEFAULT_BANDS) {
  if (score === null || score === undefined || !Number.isFinite(score)) return 'unsupported';
  if (score >= bands.high) return 'high';
  if (score >= bands.medium) return 'medium';
  if (score >= bands.low) return 'low';
  return 'unsupported';
}

/**
 * Coverage of one unit in a profile:
 *   observed      seen in the samples, identified with good alignment
 *   uncertain     aligned to known text, but the alignment or shape is weak
 *   composite     built only from observed components (e.g. consonant +
 *                 observed matra); lists them in `composition`
 *   approximated  a disclosed approximation of observed evidence
 *   missing       not in the samples; no supported construction
 *   unsupported   outside what the engine can learn or draw
 */
export const COVERAGE_STATES = ['observed', 'uncertain', 'composite', 'approximated', 'missing', 'unsupported'];
/** States that carry drawable forms. */
export const DRAWABLE_STATES = ['observed', 'uncertain', 'composite', 'approximated'];

/**
 * A measured score: { score (0–1), basis (how it was measured), inputs? }.
 * Returns a list of problems ([] when valid). `null` means "not measured".
 */
export function validateScore(value, path = 'score') {
  if (value === null) return [];
  const errors = [];
  if (!value || typeof value !== 'object') return [`${path}: must be null or { score, basis }`];
  if (!Number.isFinite(value.score) || value.score < 0 || value.score > 1) {
    errors.push(`${path}.score: must be a number from 0 to 1`);
  }
  if (typeof value.basis !== 'string' || !value.basis.trim()) {
    errors.push(`${path}.basis: must say how the score was measured`);
  }
  if (value.inputs !== undefined && (typeof value.inputs !== 'object' || value.inputs === null)) {
    errors.push(`${path}.inputs: must be an object`);
  }
  return errors;
}

/** A confidence record: { [dimension]: score | null } (unknown dimensions rejected). */
export function validateConfidence(record, path = 'confidence') {
  if (!record || typeof record !== 'object') return [`${path}: must be an object`];
  const errors = [];
  for (const [k, v] of Object.entries(record)) {
    if (!CONFIDENCE_DIMENSIONS.includes(k)) errors.push(`${path}.${k}: unknown confidence dimension`);
    else errors.push(...validateScore(v, `${path}.${k}`));
  }
  return errors;
}

/** An empty record: every dimension "not measured". */
export function unmeasuredConfidence() {
  return Object.fromEntries(CONFIDENCE_DIMENSIONS.map(d => [d, null]));
}

/** Coverage counts by script and state (for summaries). */
export function summariseCoverage(units) {
  const out = {};
  for (const u of Object.values(units || {})) {
    const script = u.script || 'Zzzz';
    out[script] = out[script] || Object.fromEntries(COVERAGE_STATES.map(s => [s, 0]));
    if (COVERAGE_STATES.includes(u.coverage)) out[script][u.coverage]++;
  }
  return out;
}
