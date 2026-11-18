/**
 * Paper templates.
 *
 * Pages are laid out in a fixed *logical* coordinate space (PAGE.width units
 * wide) and then scaled to fit the screen. Text therefore wraps identically
 * on every device, which keeps documents stable across phones and makes a
 * later PDF/PNG export a pure rendering step.
 *
 * Templates follow real school stationery: thin light-blue rules, a pair of
 * faint red margin lines, a red header rule. Writing size follows the line
 * pitch (people write smaller on narrow-ruled paper), and text always starts
 * to the right of the margin.
 *
 * The document field is still `pageType`; the original ids `blank` and
 * `lined` keep their Phase 1 meaning (lined = ruled with a red margin).
 */
export const PAGE = {
  width: 360,
  // A-series paper proportions (1 : √2).
  aspectRatio: Math.SQRT2,
  padding: { top: 52, right: 22, bottom: 30, left: 46 },
  // Default line pitch; templates may override it. Real notebook ruling is
  // dense: the reference pages fit ~19 pitches across the writing width;
  // 20 units (~15 pitches) keeps that look while staying legible on a phone.
  lineSpacing: 20,
  // Handwriting size relative to the line spacing. Calibrated on reference
  // scans of ruled assignment pages: visible x-height ≈ 0.29 of the rule
  // pitch, about 50–60 characters per line.
  fontToLineRatio: 0.62,
};

/** Gap between the margin line(s) and the first letter. */
export const MARGIN_TEXT_GAP = 10;

const RED_MARGIN = {
  x: 32.6, // left edge of the first margin line
  width: 0.8, // line thickness
  double: 2.6, // distance to a second line (0 = single line)
  color: '#E06A6A',
  opacity: 0.55,
};

// Order matters for compatibility: blank and lined first.
export const PAGE_TYPES = [
  {
    id: 'blank',
    label: 'Blank',
    description: 'Warm off-white paper',
    ruled: false,
    margin: null,
    order: 0,
  },
  {
    id: 'lined',
    label: 'Ruled + Margin',
    description: 'Blue lines, red margin',
    ruled: true,
    margin: RED_MARGIN,
    headerRule: true,
    order: 2,
  },
  {
    id: 'ruled',
    label: 'Blue Ruled',
    description: 'Plain notebook lines',
    ruled: true,
    margin: null,
    order: 1,
  },
  {
    id: 'wide',
    label: 'Wide Ruled',
    description: 'Roomy line spacing',
    ruled: true,
    lineSpacing: 24,
    margin: RED_MARGIN,
    headerRule: true,
    order: 3,
  },
  {
    id: 'narrow',
    label: 'Narrow Ruled',
    description: 'Compact line spacing',
    ruled: true,
    lineSpacing: 17,
    margin: RED_MARGIN,
    headerRule: true,
    order: 4,
  },
].map(type => ({ ...type, marginLine: !!type.margin }));

/** Templates in display order. */
export const PAPER_TEMPLATES = [...PAGE_TYPES].sort(
  (a, b) => a.order - b.order,
);

export const DEFAULT_PAGE_TYPE = 'lined';

const byId = new Map(PAGE_TYPES.map(type => [type.id, type]));

export function isPageType(id) {
  return byId.has(id);
}

export function getPageType(id) {
  return byId.get(id) || byId.get(DEFAULT_PAGE_TYPE);
}

// --- Appearance (tunable in development) ------------------------------------

/**
 * How the paper sits under the ink: faint enough that writing always
 * dominates, visible enough to read as stationery.
 */
const BASE_APPEARANCE = {
  grainOpacity: 0.7,
  ruleColor: '#A3ADDA', // lavender-blue, like the reference ruling
  ruleOpacity: 0.75,
  ruleWidth: 0.8,
  headerRuleOffset: 16, // header rule distance above the first writing line
  marginOpacity: RED_MARGIN.opacity,
  marginWidth: RED_MARGIN.width,
  marginColor: RED_MARGIN.color,
  marginX: RED_MARGIN.x,
};

let appearance = { ...BASE_APPEARANCE };
const listeners = new Set();
let version = 0;

export function getPaperAppearance() {
  return appearance;
}

/** Developer tuning only; never stored in documents. */
export function setPaperAppearance(patch) {
  appearance = { ...appearance, ...patch };
  version += 1;
  listeners.forEach(listener => listener());
}

export function resetPaperAppearance() {
  setPaperAppearance(BASE_APPEARANCE);
}

export function getPaperVersion() {
  return version;
}

export function subscribeToPaper(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** @deprecated use getPaperAppearance(); kept for existing imports. */
export const PAPER_APPEARANCE = BASE_APPEARANCE;

// --- Metrics ----------------------------------------------------------------

/**
 * Writing size for a rule pitch. People write only a little smaller on
 * narrow-ruled paper and a little larger on wide-ruled, so size follows the
 * square root of the pitch (the layout additionally caps glyphs against the
 * actual row height, so tight ruling can never make lines collide).
 */
export function writingSize(pitch) {
  const base = PAGE.lineSpacing * PAGE.fontToLineRatio;
  return Math.round(base * Math.sqrt(pitch / PAGE.lineSpacing) * 10) / 10;
}

/**
 * Resolves page metrics for a template (or the default).
 * `lineSpacing` overrides the template's pitch.
 */
export function getPageMetrics({ pageType, lineSpacing, style } = {}) {
  const type = pageType
    ? getPageType(pageType)
    : getPageType(DEFAULT_PAGE_TYPE);
  // A handwriting profile may bring its own notebook layout, measured from
  // its reference page (see handwritingProfiles.js → page). Profiles
  // without one keep the original layout exactly.
  const own = style && style.page ? style.page : null;
  const pitch =
    (lineSpacing ?? type.lineSpacing ?? PAGE.lineSpacing) *
    (own ? own.pitchScale : 1);
  const look = getPaperAppearance();
  // Text starts after the margin; pages without one use a plain inset.
  const marginEdge =
    look.marginX + (type.margin ? type.margin.double || 0 : 0) + look.marginWidth;
  const left = type.margin
    ? own
      ? marginEdge + own.textGap * pitch
      : Math.max(PAGE.padding.left, marginEdge + MARGIN_TEXT_GAP)
    : own
    ? own.plainInset
    : PAGE.padding.left - 12;
  const padding = own
    ? {
        top: own.headerY + own.firstRuleGap * pitch - pitch,
        right: own.rightMargin,
        bottom: own.bottomMargin,
        left,
      }
    : { ...PAGE.padding, left };
  return {
    width: PAGE.width,
    minHeight: Math.round(PAGE.width * PAGE.aspectRatio),
    padding,
    contentWidth: PAGE.width - padding.left - padding.right,
    lineSpacing: pitch,
    // Own layouts size the writing exactly to the measured pitch.
    fontSize: own
      ? Math.round(pitch * PAGE.fontToLineRatio * 1000) / 1000
      : writingSize(pitch),
    // Header rule position (above the first rule) and where the baseline
    // sits; undefined → the original paper appearance / a hair above.
    headerRuleY: own ? own.headerY : undefined,
    baselineOnRule: own ? own.baselineOnRule : undefined,
    margin: type.margin
      ? {
          ...type.margin,
          x: look.marginX,
          width: look.marginWidth,
          color: look.marginColor,
          opacity: look.marginOpacity,
        }
      : null,
    headerRule: !!type.headerRule,
  };
}

/**
 * Height of one line of writing. Ruled paper always follows its ruling;
 * on blank paper the handwriting style's own line spacing applies.
 */
export function rowHeightFor(pageType, metrics, style) {
  if (pageType.ruled || !style) {
    return metrics.lineSpacing;
  }
  return Math.round(metrics.lineSpacing * (style.lineHeight || 1));
}
