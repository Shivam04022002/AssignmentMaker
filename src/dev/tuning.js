/**
 * Developer-only handwriting tuning.
 *
 * The Handwriting Tuner edits these parameters live (in memory, via style
 * overrides) so a style can be dialled in while looking at a real device.
 * Nothing here reaches normal users or saved documents. When a style looks
 * right, "Share config" produces the values to paste into
 * src/handwriting/handwritingProfiles.js.
 */
import {
  getPaperAppearance,
  resetPaperAppearance,
  setPaperAppearance,
} from '../data/paper';
import {
  getHandwritingStyle,
  getStyleOverrides,
  resetStyleOverrides,
  setStyleOverrides,
} from '../data/handwritingStyles';

/** Each parameter: where it lives in a style, and how far one tap moves it. */
export const TUNING_PARAMETERS = [
  {
    id: 'baselineAdjust',
    label: 'Baseline adjust (em)',
    path: ['baselineAdjust'],
    step: 0.01,
    min: -0.5,
    max: 0.5,
  },
  {
    id: 'fontSize',
    label: 'x-height (× line pitch)',
    path: ['xHeightPerPitch'],
    step: 0.01,
    min: 0.2,
    max: 0.45,
  },
  {
    id: 'lineHeight',
    label: 'Line height (blank paper)',
    path: ['lineHeight'],
    step: 0.05,
    min: 0.7,
    max: 1.6,
  },
  {
    id: 'letterSpacing',
    label: 'Letter gap (× x-height)',
    path: ['letterGap'],
    step: 0.02,
    min: 0,
    max: 0.6,
  },
  {
    id: 'wordSpacing',
    label: 'Word gap (× x-height)',
    path: ['wordGap'],
    step: 0.1,
    min: 0.8,
    max: 3.5,
  },
  {
    id: 'glyphWidth',
    label: 'Letter width (×)',
    path: ['glyphWidth'],
    step: 0.02,
    min: 0.8,
    max: 1.3,
  },
  {
    id: 'variantAmount',
    label: 'Letter variant amount',
    path: ['variantAmount'],
    step: 0.005,
    min: 0,
    max: 0.08,
  },
  {
    id: 'slant',
    label: 'Slant (deg)',
    path: ['slant'],
    step: 0.5,
    min: -15,
    max: 10,
  },
  {
    id: 'rotation',
    label: 'Word rotation (±deg)',
    path: ['variation', 'rotation'],
    step: 0.1,
    min: 0,
    max: 3.5,
  },
  {
    id: 'verticalVariation',
    label: 'Word vertical (±em)',
    path: ['variation', 'vertical'],
    step: 0.005,
    min: 0,
    max: 0.08,
  },
  {
    id: 'drift',
    label: 'Baseline drift (em)',
    path: ['variation', 'drift'],
    step: 0.005,
    min: 0,
    max: 0.1,
  },
  {
    id: 'scaleVariation',
    label: 'Word scale (±)',
    path: ['variation', 'scale'],
    step: 0.005,
    min: 0,
    max: 0.06,
  },
  {
    id: 'spacingVariation',
    label: 'Word gap (±em)',
    path: ['variation', 'spacing'],
    step: 0.01,
    min: 0,
    max: 0.15,
  },
  {
    id: 'opacityVariation',
    label: 'Ink fade (word)',
    path: ['variation', 'opacity'],
    step: 0.01,
    min: 0,
    max: 0.12,
  },
  {
    id: 'charRotation',
    label: 'Letter rotation (±deg)',
    path: ['charVariation', 'rotation'],
    step: 0.25,
    min: 0,
    max: 3.5,
  },
  {
    id: 'charVertical',
    label: 'Letter vertical (±em)',
    path: ['charVariation', 'vertical'],
    step: 0.005,
    min: 0,
    max: 0.08,
  },
  {
    id: 'charScale',
    label: 'Letter scale (±)',
    path: ['charVariation', 'scale'],
    step: 0.005,
    min: 0,
    max: 0.06,
  },
  {
    id: 'charOpacity',
    label: 'Ink fade (letter)',
    path: ['charVariation', 'opacity'],
    step: 0.01,
    min: 0,
    max: 0.12,
  },
  {
    id: 'charWidth',
    label: 'Letter width (±)',
    path: ['charVariation', 'width'],
    step: 0.005,
    min: 0,
    max: 0.05,
  },
  {
    id: 'charSlant',
    label: 'Letter lean (±deg)',
    path: ['charVariation', 'slant'],
    step: 0.25,
    min: 0,
    max: 3,
  },
  {
    id: 'pressure',
    label: 'Pressure variation (per stroke)',
    path: ['pressure', 'stroke'],
    step: 0.02,
    min: 0,
    max: 0.4,
  },
  {
    id: 'strokeWeight',
    label: 'Pen width (× x-height)',
    path: ['strokeWidth'],
    step: 0.01,
    min: 0.08,
    max: 0.35,
  },
  {
    id: 'inkStrength',
    label: 'Ink strength variation (×)',
    path: ['inkStrength'],
    step: 0.1,
    min: 0,
    max: 2,
  },
  {
    id: 'charHeight',
    label: 'Letter height (±)',
    path: ['charVariation', 'height'],
    step: 0.005,
    min: 0,
    max: 0.05,
  },
  {
    id: 'letterRhythm',
    label: 'Letter spacing rhythm (±em)',
    path: ['charVariation', 'spacing'],
    step: 0.005,
    min: 0,
    max: 0.08,
  },
  {
    id: 'taper',
    label: 'Stroke taper (0–1.5)',
    path: ['pressure', 'taper'],
    step: 0.1,
    min: 0,
    max: 1.5,
  },
  {
    id: 'inkDensity',
    label: 'Ink density from pressure',
    path: ['pressure', 'inkFromPressure'],
    step: 0.05,
    min: 0,
    max: 1,
  },
  {
    id: 'edge',
    label: 'Stroke edge irregularity',
    path: ['pressure', 'edge'],
    step: 0.005,
    min: 0,
    max: 0.1,
  },
  {
    id: 'endpoint',
    label: 'Endpoint variation (x-height)',
    path: ['stroke', 'endpoint'],
    step: 0.005,
    min: 0,
    max: 0.1,
  },
  {
    id: 'tremor',
    label: 'Hand tremor (x-height)',
    path: ['stroke', 'tremor'],
    step: 0.002,
    min: 0,
    max: 0.03,
  },
  {
    id: 'warp',
    label: 'Letter reshaping (x-height)',
    path: ['stroke', 'warp'],
    step: 0.005,
    min: 0,
    max: 0.08,
  },
  {
    id: 'correctionRate',
    label: 'Corrections (per eligible word)',
    path: ['corrections', 'rate'],
    step: 0.002,
    min: 0,
    max: 0.05,
  },
  {
    id: 'correctionDarkness',
    label: 'Correction ink darkness',
    path: ['corrections', 'darkness'],
    step: 0.02,
    min: 0,
    max: 0.5,
  },
  {
    id: 'strikeStrength',
    label: 'Strike pressure',
    path: ['corrections', 'strike'],
    step: 0.05,
    min: 0.8,
    max: 1.6,
  },
  // Paper (global, not per style).
  {
    id: 'paperLineOpacity',
    label: 'Paper line opacity',
    target: 'paper',
    key: 'ruleOpacity',
    step: 0.05,
    min: 0,
    max: 1,
  },
  {
    id: 'paperGrainOpacity',
    label: 'Paper grain opacity',
    target: 'paper',
    key: 'grainOpacity',
    step: 0.05,
    min: 0,
    max: 1,
  },
  {
    id: 'marginPosition',
    label: 'Margin position (units)',
    target: 'paper',
    key: 'marginX',
    step: 1,
    min: 16,
    max: 48,
  },
];

export const TUNING_SAMPLE =
  'Leave Application\n\nQ1. Write a letter to your principal.\nAns: Dear Sir,\nI am writing this application to request leave for two days.\n1. letter letter letter letter\n2. minimum, quick (a) 2024 → 75%\n\nThank you.\nYours faithfully,';

/** The sample's first paragraph is a heading, underlined. */
export function tuningSampleFormatting(text) {
  const end = text.indexOf('\n');
  const heading = end > 0 ? { start: 0, end, underline: true } : null;
  return {
    headings: heading ? [heading] : [],
    underlines: [],
    labels: [],
    autoLabels: true,
  };
}

const round = value => Math.round(value * 10000) / 10000;

export function getTuningValue(styleId, parameter) {
  if (parameter.target === 'paper') {
    return getPaperAppearance()[parameter.key];
  }
  return parameter.path.reduce(
    (obj, key) => (obj ? obj[key] : undefined),
    getHandwritingStyle(styleId),
  );
}

/** Sets one parameter (clamped to its range) as an in-memory override. */
export function setTuningValue(styleId, parameter, value) {
  const clamped = round(
    Math.min(parameter.max, Math.max(parameter.min, Number(value) || 0)),
  );
  if (parameter.target === 'paper') {
    setPaperAppearance({ [parameter.key]: clamped });
    return clamped;
  }
  const [first, second] = parameter.path;
  setStyleOverrides(
    styleId,
    second ? { [first]: { [second]: clamped } } : { [first]: clamped },
  );
  return clamped;
}

export function stepTuningValue(styleId, parameter, direction) {
  const current = getTuningValue(styleId, parameter) || 0;
  return setTuningValue(
    styleId,
    parameter,
    current + direction * parameter.step,
  );
}

export function resetTuning(styleId) {
  resetStyleOverrides(styleId);
  resetPaperAppearance();
}

export function hasTuning(styleId) {
  return !!getStyleOverrides(styleId);
}

/** The tunable part of the profile, for pasting into handwritingProfiles.js. */
export function exportStyleConfig(styleId) {
  const style = getHandwritingStyle(styleId);
  const pick = {
    id: style.id,
    xHeightPerPitch: style.xHeightPerPitch,
    strokeWidth: style.strokeWidth,
    letterGap: style.letterGap,
    glyphWidth: style.glyphWidth,
    wordGap: style.wordGap,
    slant: style.slant,
    baselineAdjust: style.baselineAdjust,
    lineHeight: style.lineHeight,
    inkStrength: style.inkStrength,
    variantAmount: style.variantAmount,
    variation: style.variation,
    charVariation: style.charVariation,
    ink: style.ink,
    stroke: style.stroke,
    pressure: style.pressure,
    corrections: style.corrections,
  };
  return JSON.stringify(pick, null, 2);
}
