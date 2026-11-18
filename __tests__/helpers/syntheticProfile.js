/**
 * SYNTHETIC TEST DATA — not learned handwriting.
 *
 * Builds personal-profile versions from plain geometric strokes (lines and
 * arcs) so the schema, repository and adapter can be tested before any
 * image analysis exists. Every profile is marked `synthetic: true` and every
 * form uses the 'synthetic-fixture' method, which the schema only accepts
 * in a synthetic profile.
 */
import { buildProfileVersion } from '../../src/handwriting/learn/profileBuilder';
import { PARAM_BOUNDS } from '../../src/handwriting/learn/profileSchema';

const line = (x0, y0, x1, y1) => [x0, y0, x0 + (x1 - x0) / 3, y0 + (y1 - y0) / 3, x0 + ((x1 - x0) * 2) / 3, y0 + ((y1 - y0) * 2) / 3, x1, y1];

/** One synthetic form: a few straight strokes, labelled as such. */
export const syntheticForm = (w = 0.6, strokes = [line(0.1, 0, 0.1, 1)], weight = 1) => ({
  w,
  weight,
  strokes,
  method: 'synthetic-fixture',
  confidence: null, // not measured: synthetic data has no evidence
  observations: [],
});

export const PARAMS = {
  xHeightPerPitch: 0.32,
  ascender: 1.7,
  capHeight: 1.5,
  descender: 0.6,
  strokeWidth: 0.15,
  letterGap: 0.2,
  glyphWidth: 1,
  wordGap: 2,
  slant: 0,
};
export const ALL_DEFAULT = Object.fromEntries(Object.keys(PARAM_BOUNDS).map(k => [k, 'engine-default']));

export const SOURCES = [
  { slot: 1, category: 'latin-alphabet', mime: 'image/jpeg', width: 3000, height: 4000, bytes: 2100000, transcription: { mode: 'prescribed' }, retained: false },
  { slot: 2, category: 'devanagari-alphabet', mime: 'image/jpeg', width: 3000, height: 4000, bytes: 2000000, transcription: { mode: 'prescribed' }, retained: false },
  { slot: 4, category: 'devanagari-text', mime: 'image/png', width: 1200, height: 1600, bytes: 900000, transcription: { mode: 'user', text: 'नमस्ते दुनिया' }, retained: false },
  { slot: 5, category: 'natural-text', mime: 'image/heic', width: 3024, height: 4032, bytes: 1800000, transcription: { mode: 'none' }, retained: false },
];

/** Units: Latin letters, Devanagari clusters, a composite, a missing unit. */
export function syntheticUnits() {
  return {
    l: { coverage: 'observed', forms: [syntheticForm(0.3), syntheticForm(0.32, [line(0.12, 0, 0.1, 1.7)])] },
    o: { coverage: 'uncertain', forms: [syntheticForm(0.7, [line(0.1, 0.5, 0.6, 0.5)])] },
    'क': { coverage: 'observed', forms: [syntheticForm(0.9, [line(0, 1, 0.9, 1), line(0.45, 1, 0.45, 0)])] },
    'ि': undefined, // (not a unit on its own — see orphan tests)
    'कि': { coverage: 'composite', composition: ['क'], forms: [syntheticForm(1.1, [line(0, 1, 1.1, 1), line(0.1, 1, 0.1, 0)])] },
    'म': { coverage: 'missing', forms: [] },
    '7': { coverage: 'approximated', forms: [syntheticForm(0.6, [line(0, 1.5, 0.6, 1.5), line(0.6, 1.5, 0.2, 0)])] },
  };
}

/** A valid synthetic profile version (pass overrides to vary it). */
export function syntheticProfile(overrides = {}) {
  const units = syntheticUnits();
  delete units['ि'];
  const result = buildProfileVersion({
    id: 'p-test01-abc123',
    version: 1,
    name: 'Synthetic test profile',
    now: 1760000000000,
    synthetic: true,
    scripts: ['Latn', 'Deva'],
    sources: SOURCES,
    metrics: { slantDeg: { value: 0, unit: 'deg', samples: 0, method: 'synthetic' } },
    params: PARAMS,
    paramSources: ALL_DEFAULT,
    units,
    ...overrides,
  });
  if (!result.ok) throw new Error(`synthetic profile invalid: ${result.errors.join('; ')}`);
  return result.profile;
}
