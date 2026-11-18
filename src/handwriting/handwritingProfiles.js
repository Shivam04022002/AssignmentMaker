/**
 * Handwriting profiles — the handwriting identity the app writes in.
 *
 * There is one profile: `reference_student`, the print hand of the reference
 * scans. Its glyphs are in glyphs.js; its proportions were measured from the
 * scans with `node scripts/analyze-reference.js` (deskewed, per written
 * line, medians over 13–17 lines per image):
 *
 *                       ref 1 (cursive)  ref 2 (cursive)  ref 3 (print)
 *   x-height / pitch         0.24             0.17*            0.33
 *   ascender / x-height      1.75             2.14*            1.75
 *   stroke / x-height        0.25             0.43*            0.17
 *   letter gap / x-height    0.25             1.14*            0.17
 *   word gap / x-height      2.38             2.86             2.00
 *   slant (deg)              ~2               11               0
 *   ink                      #3c3c45          #434382          #2d2c5a
 *   (* lower-resolution scan; less reliable)
 *
 * The profile follows reference 3, whose print hand the glyph set
 * reproduces, cross-checked against the other two where they agree (all
 * write with generous word gaps and a fine ballpoint stroke).
 */

/** x-height as a fraction of the glyph size ("em") used by the layout. */
export const XH_EM = 0.46;

/** Page font size relative to line pitch (matches PAGE.fontToLineRatio). */
const FONT_TO_LINE = 0.62;

export const REFERENCE_PROFILE_ID = 'reference_student';
/** Lang2: the joined school hand of reference/Lang2.png. */
export const LANG2_PROFILE_ID = 'reference_student_lang2';
/** Lang3: the hand of reference/Lang3.png and its alphabet sheet (reference1.png). */
export const LANG3_PROFILE_ID = 'reference_student_lang3';

export const REFERENCE_PROFILE = {
  id: REFERENCE_PROFILE_ID,
  name: 'Reference Handwriting',
  description: 'The print hand of the reference pages',

  // ── proportions (x-height units unless noted) ─────────────────────────
  /** Visible x-height as a fraction of the rule pitch (ref 3: 0.33). */
  xHeightPerPitch: 0.31,
  ascender: 1.72, // ref 3: 1.75
  capHeight: 1.55,
  descender: 0.72,
  /**
   * Pen stroke width at full pressure (ref 3: 0.17 measured on blurred
   * pixels; side by side at matched size the line is ≈0.14–0.15).
   */
  strokeWidth: 0.16,
  /**
   * Gap between letters — part of each glyph's advance. The scan analysis
   * reads 0.17 for ref 3, but blur closes gaps; side-by-side at 2.6× the
   * reference letters stand clearly apart (~0.25).
   */
  letterGap: 0.25,
  /** Letter body width (× the glyph set): ref 3's bowls are near-round. */
  glyphWidth: 1.1,
  /** Gap between words (ref 3: 2.0; refs 1–2: 2.4–2.9). */
  wordGap: 1.75,
  /** Lean, degrees (negative = forward). Ref 3 is upright (0–3°). */
  slant: -1.5,
  baselineAdjust: 0,

  // ── natural variation (same hand, written many times) ──────────────────
  /** Subtle variants per letter; each occurrence picks one. */
  glyphVariants: 4,
  /** Size of a variant's shape change, x-height units. */
  variantAmount: 0.045,
  // Measured on ref 3 (analyze-reference.js → variation, x-height units):
  // per-word baseline shift SD 0.054; per-letter baseline SD 0.079 with
  // neighbour correlation 0.37; letter height SD 0.091 (both include
  // letter-shape differences, so the writer's own share is smaller).
  variation: {
    rotation: 0.6, // word tilt, ± degrees
    vertical: 0.026, // word rise/fall, ± em of base size (≈0.055 x-height)
    drift: 0.026, // slow baseline wander along a line
    scale: 0.014, // word size, ±
    spacing: 0.06, // word gap, ± em
    letterSpacing: 0.004,
    opacity: 0.05, // ink fade, word
    slant: 0.9, // ± degrees, per word
    width: 0.015, // horizontal stretch, ±
  },
  /**
   * Per-letter variation, as correlated sequences along the word
   * (neighbouring letters move together: correlation `correlation`).
   */
  charVariation: {
    correlation: 0.4,
    rotation: 0.6,
    vertical: 0.022, // ≈0.048 x-height
    scale: 0.012,
    width: 0.04,
    height: 0.048,
    slant: 0.8,
    shift: 0.008,
    spacing: 0.03,
    opacity: 0.05,
  },
  /** Ballpoint ink density: a slight fade along each word. */
  ink: { weight: 0, weightVariation: 0, trend: 0.02, strokeVariation: 0.1 },

  // ── strokes (strokeModel.js), x-height units ──────────────────────────
  stroke: {
    warp: 0.03, // smooth reshaping of each occurrence
    tremor: 0.009, // a hand's tiny, smooth unsteadiness along the line
    tension: 0.09, // curves bow ± this much more/less
    endpoint: 0.04, // entry/exit overshoot or shortfall
    endAngle: 5, // ± degrees over the last part of a stroke
    tail: [0.16, 0.34], // exit tail reaches this share toward the next letter
    join: 0.05, // chance the tail runs into the next letter
    leadIn: 0.4, // chance of a small lead-in after a baseline exit
  },
  /**
   * Pen pressure along each stroke → ribbon width and ink density.
   * Ref 3: stroke width varies within a stroke (CV ≈0.29 at 12 px x-height,
   * inflated by pixel steps); 10th–90th percentile widths ≈ 1 : 1.8.
   */
  pressure: {
    landing: [0.3, 0.55], // pressure where the pen lands
    landingLength: [0.05, 0.14], // build-up, x-heights of travel
    release: [0.25, 0.5], // pressure as the pen lifts
    releaseLength: [0.08, 0.2],
    wave: [0.03, 0.09], // slow swell along the stroke
    turn: 0.1, // extra at turns
    down: 0.07, // extra on downstrokes
    word: 0.06, // per-word firmness, ±
    stroke: 0.07, // per-stroke firmness, ±
    width: [0.4, 0.62], // width = base × (a + b × pressure)
    edge: 0.035, // edge irregularity
    inkFromPressure: 0.35, // lighter strokes lay less ink
    taper: 1, // depth of the light landing/release (0 = none, 1 = measured)
    core: { threshold: 1.06, width: 0.45, alpha: 0.28 },
  },

  // ── natural corrections (handwriting/corrections.js) ────────────────────
  corrections: {
    rate: 1 / 90, // per eligible prose word (≈1 per reference page)
    dotRate: 1 / 420, // stray dots
    minWords: 40, // shorter pages stay clean
    mix: { 'letter-fix': 0.4, strike: 0.2, overwrite: 0.22, crossed: 0.18 },
    darkness: 0.22, // corrected ink is the pen colour this much deeper
    strike: 1.2, // pressure of a strike through letters
  },

  // ── formatting ────────────────────────────────────────────────────────
  heading: { scale: 1.1, strokeWeight: 1.22 },
  label: { strokeWeight: 1.1 },
};

/**
 * Completes a profile into the parameters the layout engine reads
 * (sizes in em of the glyph size, spacing in units of the base font size).
 */
export function completeProfile(profile) {
  const fontScale = profile.xHeightPerPitch / FONT_TO_LINE / XH_EM;
  return {
    ...profile,
    fontScale: Math.round(fontScale * 1000) / 1000,
    fontSize: 1,
    // Spacing in units of the page's base font size.
    wordSpacing: Math.round(((profile.wordGap * profile.xHeightPerPitch) / FONT_TO_LINE) * 1000) / 1000,
    letterSpacing: 0,
    lineHeight: profile.lineHeight ?? 1,
    connected: false,
    alternates: [],
    inkStrength: profile.inkStrength ?? 1,
    inkWeight: 1,
    personality: {},
    realism: null,
    glyphs: true,
    metrics: {
      ascent: profile.ascender * XH_EM * 1.12,
      descent: profile.descender * XH_EM * 1.12,
      baseline: 0,
      xHeight: XH_EM,
      capHeight: profile.capHeight * XH_EM,
      inkAscent: profile.ascender * XH_EM,
      inkDescent: profile.descender * XH_EM,
    },
  };
}

/**
 * Lang2 — the joined school hand of the Lang2 reference (reference/Lang2.png,
 * the same page as handwriting_01.png). Measured with analyze-reference.js
 * (x-height / pitch 0.24, ascender 1.75, descender 1.13 x-heights, word gap
 * 2.38, near-upright) and traced from enlarged crops (glyphsLang2.js).
 *
 * Same engine as Lang1; what differs is the hand: smaller x-height, long
 * ascenders and descenders, letters with entry and exit strokes that join
 * (semi-cursive), a fine ballpoint with heavier downstrokes and lighter
 * upstrokes, and wider word gaps.
 */
export const LANG2_PROFILE = {
  ...REFERENCE_PROFILE,
  id: LANG2_PROFILE_ID,
  name: 'Reference Handwriting 2',
  description: 'The joined school hand of the second reference page',
  glyphSet: 'lang2',

  // Density: measured x-height (0.24) and slightly narrower letters give
  // ≈8 words per full line on the reference text, as on the reference page.
  xHeightPerPitch: 0.25, // measured 0.24
  ascender: 1.75,
  capHeight: 1.52,
  descender: 1.0, // measured 1.13 (the J-hooks reach deepest)
  strokeWidth: 0.12, // a fine pen; contrast comes from pressure
  letterGap: 0.14, // entries and exits bridge most of the gap
  glyphWidth: 1.12, // the reference letters are wide and round
  wordGap: 2.3, // measured 2.38
  slant: -1.5,

  variation: {
    ...REFERENCE_PROFILE.variation,
    rotation: 0.8,
    vertical: 0.03,
    drift: 0.03,
  },
  charVariation: {
    ...REFERENCE_PROFILE.charVariation,
    width: 0.048,
    height: 0.048,
  },
  stroke: {
    ...REFERENCE_PROFILE.stroke,
    tail: [0.45, 0.85], // exits reach well toward the next letter
    join: 0.62, // most neighbouring letters touch; some do not
    joinRound: true, // join round letters at their upper left
    highStopBefore: 'nmhkb', // r/o/v/w stop short of arched letters (rn ≠ m)
    // Each occurrence is built a little differently (x-height units).
    construction: { ascender: 0.06, descender: 0.08, bowl: 0.05 },
    exitLift: 0.06, // connections leave a little higher or lower
    endpoint: 0.055, // entry/exit overshoot or shortfall
    leadIn: 0, // entries are part of the letters
  },
  // Natural gap rhythm (≈±1 word-space step at most) and word seeds that
  // include the neighbouring words.
  rhythm: { gap: 0.32 },
  contextSeed: true,
  pressure: {
    ...REFERENCE_PROFILE.pressure,
    wordArc: 0.12, // each word its own pressure arc
    landing: [0.25, 0.5],
    release: [0.2, 0.45],
    width: [0.32, 0.74], // more contrast: thin upstrokes, firmer downs
    down: 0.14, // downstrokes heavier
    turn: 0.12,
  },
};

/**
 * Lang3 — the upright print hand of reference/Lang3.png (the same page as
 * handwriting_03.png, which Lang1 was first built from). Its own traced
 * stroke set (glyphsLang3.js) and the full realism model of later phases,
 * which Lang1 — locked as the baseline — does not get.
 *
 * Measured on the page (analyze-reference.js): line pitch 36 px; x-height
 * 0.33 of the pitch; ascenders 1.75, descenders ≈0.5–0.7 x-heights; stroke
 * 0.17 x-height (blurred pixels — ≈0.15 side by side); letter gap 0.17 and
 * word gap 2.0 x-heights; upright (0–3°). Variation: letter height SD 0.091,
 * baseline SD 0.079 with neighbour correlation 0.37, per-word baseline
 * shift 0.054 x-height; stroke width varies ≈29 % along strokes; ink
 * density ≈18 %. A neat hand: gentle rhythm, print — letters do not join.
 */
export const LANG3_PROFILE = {
  ...REFERENCE_PROFILE,
  id: LANG3_PROFILE_ID,
  name: 'Reference Handwriting 3',
  description: 'The third reference hand: upright print mixed with looped letters',
  glyphSet: 'lang3',

  /**
   * Notebook layout measured from the Lang3 reference page (units: page
   * units unless noted). The reference writes ≈20 rule pitches of text per
   * line and ≈10 words, on finer ruling than the app's default; the
   * baseline sits ON the rule; text starts just right of the red margin.
   * Used by getPageMetrics (paper.js) for documents in this handwriting.
   */
  page: {
    // × the template's pitch (default 20 → 14.5): reproduces 9 of the 14
    // reference paragraph lines exactly (the rest differ by one word) and
    // gives 31 writing lines on the A4 page, like a real notebook.
    pitchScale: 0.725,
    textGap: 0.3, // pitches between the red margin and the first letter
    headerY: 36, // red header rule, as on the other layouts
    firstRuleGap: 1, // first writing rule one pitch below the header
    rightMargin: 14, // printable right margin
    bottomMargin: 22,
    plainInset: 22, // pages without a red margin
    baselineOnRule: true,
    // The rule is drawn 0.8 units thick below its line: the baseline sits on
    // its centre, so letters rest ON the blue line rather than above it.
    ruleCentre: 0.4,
  },

  xHeightPerPitch: 0.33, // measured 0.33
  ascender: 1.72,
  capHeight: 1.5,
  descender: 0.62,
  strokeWidth: 0.15,
  letterGap: 0.2, // measured 0.17 (blur closes gaps)
  glyphWidth: 1.06,
  wordGap: 2.0, // measured 2.0
  slant: -0.5, // upright

  // Anchored to the rule: words rise and fall only a little, the line
  // barely tilts (total ≲3 % of the pitch, measured on the reference page).
  variation: {
    ...REFERENCE_PROFILE.variation,
    rotation: 0.5,
    vertical: 0.012,
    drift: 0.012,
    slope: 0.0005,
  },
  charVariation: {
    ...REFERENCE_PROFILE.charVariation,
    correlation: 0.37, // measured
    vertical: 0.01,
  },
  stroke: {
    ...REFERENCE_PROFILE.stroke,
    tail: [0.06, 0.16], // a print hand: only the tiniest exit flicks
    // Exit flicks stop well short of the next letter's ink (its entry
    // stroke, if it has one): neighbouring letters never touch.
    tailClearance: 0.22,
    join: 0, // letters are not joined
    leadIn: 0,
    construction: { ascender: 0.05, descender: 0.06, bowl: 0.04 },
    endpoint: 0.05,
  },
  rhythm: { gap: 0.22 }, // neat: a gentle gap rhythm
  contextSeed: true,
  pressure: {
    ...REFERENCE_PROFILE.pressure,
    down: 0.1,
    wordArc: 0.1,
  },
};

export const HANDWRITING_PROFILES = [REFERENCE_PROFILE, LANG2_PROFILE, LANG3_PROFILE];
