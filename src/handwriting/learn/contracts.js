/**
 * Data contracts between the stages of the personal-handwriting engine.
 *
 * PIPELINE_STAGES records which stage produces which contract and whether
 * it exists yet; a stage is marked implemented only once a phase has built
 * and tested it.
 *
 * Privacy: sample metadata never carries pixels or file locations once it
 * is part of a profile (see validateSampleMetadata).
 */
import { CONFIDENCE_DIMENSIONS, validateScore } from './confidence';
import { REQUIRED_SAMPLE_COUNT, SAMPLE_CATEGORIES, SAMPLE_SLOTS } from './samplePrompts';

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const num = Number.isFinite;
const isBox = b => Array.isArray(b) && b.length === 4 && b.every(num) && b[2] >= 0 && b[3] >= 0;

export const SAMPLE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'];
/** Fields that would leak pixels or file locations into a profile. */
export const FORBIDDEN_SAMPLE_FIELDS = ['pixels', 'data', 'base64', 'bytesData', 'uri', 'path', 'file'];
export const TRANSCRIPTION_MODES = ['prescribed', 'user', 'none'];
/** Scripts a sample may contain (same as profileSchema PROFILE_SCRIPTS). */
export const SAMPLE_SCRIPTS = ['Latn', 'Deva'];

// --- Reference sample metadata ----------------------------------------------

/**
 * One reference image as recorded in a profile:
 *   { slot (1–5; 6 = extra), category, mime, width, height, bytes,
 *     transcription: { mode, text? }, retained (original kept on device?),
 *     scripts? (which scripts the page contains; slot 5 lets the user say) }
 */
export function validateSampleMetadata(s, path = 'sample') {
  if (!isObj(s)) return [`${path}: must be an object`];
  const errors = [];
  if (!Number.isInteger(s.slot) || s.slot < 1 || s.slot > REQUIRED_SAMPLE_COUNT + 1) errors.push(`${path}.slot: 1–${REQUIRED_SAMPLE_COUNT + 1}`);
  if (!SAMPLE_CATEGORIES.includes(s.category)) errors.push(`${path}.category: unknown`);
  if (!SAMPLE_MIME_TYPES.includes(s.mime)) errors.push(`${path}.mime: unsupported image type`);
  for (const k of ['width', 'height', 'bytes']) if (!Number.isInteger(s[k]) || s[k] <= 0) errors.push(`${path}.${k}: positive integer`);
  errors.push(...validateTranscription(s.transcription, `${path}.transcription`));
  if (typeof s.retained !== 'boolean') errors.push(`${path}.retained: boolean`);
  if (s.scripts !== undefined) {
    const ok = Array.isArray(s.scripts) && s.scripts.length && new Set(s.scripts).size === s.scripts.length && s.scripts.every(x => SAMPLE_SCRIPTS.includes(x));
    if (!ok) errors.push(`${path}.scripts: one or both of ${SAMPLE_SCRIPTS.join(', ')}`);
  }
  for (const k of FORBIDDEN_SAMPLE_FIELDS) if (k in s) errors.push(`${path}.${k}: pixels and file paths are not stored in a profile`);
  return errors;
}

/**
 * Known text for a sample:
 *   prescribed  the slot's prompt (slots 1–3, 6) — text optional (the prompt)
 *   user        what the user typed for a free sample (slots 4–5)
 *   none        no transcription: the sample gives measurements only
 */
export function validateTranscription(t, path = 'transcription') {
  if (!isObj(t) || !TRANSCRIPTION_MODES.includes(t.mode)) return [`${path}: { mode: prescribed | user | none }`];
  if (t.mode === 'user' && (typeof t.text !== 'string' || !t.text.trim())) return [`${path}.text: the typed transcription`];
  if (t.mode === 'none' && t.text !== undefined) return [`${path}.text: none means no text`];
  return [];
}

/** The known text a sample is aligned to, or null (metrics only). */
export function knownTextFor(sample) {
  const t = sample && sample.transcription;
  if (!t || t.mode === 'none') return null;
  if (t.mode === 'user') return t.text;
  const slot = SAMPLE_SLOTS.find(s => s.slot === sample.slot);
  return typeof t.text === 'string' ? t.text : slot ? slot.prompt : null;
}

// --- Stage results ------------------------------------------------------------

/** Image-quality result codes the wizard can explain. */
export const QUALITY_ISSUES = ['blurry', 'too-dark', 'overexposed', 'low-contrast', 'rotated', 'cropped', 'too-little-writing', 'too-small', 'unreadable', 'uneven-lighting', 'noisy', 'shadows', 'page-unclear', 'sideways', 'upside-down'];

/**
 * { slot, checks: { name: { value, threshold, pass } }, issues: [{ code,
 *   message, advice }], usable, score: score | null }
 */
export function validateQualityResult(q, path = 'quality') {
  if (!isObj(q)) return [`${path}: must be an object`];
  const errors = [];
  if (!Number.isInteger(q.slot)) errors.push(`${path}.slot: integer`);
  if (!isObj(q.checks)) errors.push(`${path}.checks: object`);
  else {
    for (const [k, c] of Object.entries(q.checks)) {
      if (!isObj(c) || !num(c.value) || !num(c.threshold) || typeof c.pass !== 'boolean') errors.push(`${path}.checks.${k}: { value, threshold, pass }`);
    }
  }
  if (!Array.isArray(q.issues)) errors.push(`${path}.issues: array`);
  else {
    q.issues.forEach((x, i) => {
      if (!isObj(x) || !QUALITY_ISSUES.includes(x.code) || typeof x.message !== 'string' || typeof x.advice !== 'string') {
        errors.push(`${path}.issues[${i}]: { code, message, advice }`);
      }
    });
  }
  if (typeof q.usable !== 'boolean') errors.push(`${path}.usable: boolean`);
  if (q.score !== undefined) errors.push(...validateScore(q.score, `${path}.score`));
  return errors;
}

export const SEGMENT_KINDS = ['region', 'line', 'word', 'unit', 'uncertain'];

/**
 * A segmentation observation (in analysis-image pixels):
 *   { slot, kind, bbox: [x, y, w, h], line?, baseline?, xHeight?,
 *     headline? (Devanagari shirorekha y), confidence: score | null }
 * `uncertain` keeps a region that could not be split reliably.
 */
export function validateSegment(s, path = 'segment') {
  if (!isObj(s)) return [`${path}: must be an object`];
  const errors = [];
  if (!Number.isInteger(s.slot)) errors.push(`${path}.slot: integer`);
  if (!SEGMENT_KINDS.includes(s.kind)) errors.push(`${path}.kind: unknown`);
  if (!isBox(s.bbox)) errors.push(`${path}.bbox: [x, y, w, h]`);
  for (const k of ['line', 'baseline', 'xHeight', 'headline']) if (s[k] !== undefined && !num(s[k])) errors.push(`${path}.${k}: number`);
  errors.push(...validateScore(s.confidence ?? null, `${path}.confidence`));
  return errors;
}

/**
 * A unit observation: one written occurrence matched to known text.
 *   { slot, bbox, key (unit key), source: { start, end } (range in the
 *     known text), alignmentCost, status: 'aligned' | 'uncertain' |
 *     'unmatched', strokes? (renderer cubic chains, unit-normalised) }
 */
export function validateUnitObservation(o, path = 'observation') {
  if (!isObj(o)) return [`${path}: must be an object`];
  const errors = [];
  if (!Number.isInteger(o.slot)) errors.push(`${path}.slot: integer`);
  if (!isBox(o.bbox)) errors.push(`${path}.bbox: [x, y, w, h]`);
  if (!['aligned', 'uncertain', 'unmatched'].includes(o.status)) errors.push(`${path}.status: aligned | uncertain | unmatched`);
  if (o.status !== 'unmatched') {
    if (typeof o.key !== 'string' || !o.key) errors.push(`${path}.key: the unit it shows`);
    if (!isObj(o.source) || !Number.isInteger(o.source.start) || !Number.isInteger(o.source.end) || o.source.end <= o.source.start) {
      errors.push(`${path}.source: { start, end } in the known text`);
    }
  }
  if (o.alignmentCost !== undefined && (!num(o.alignmentCost) || o.alignmentCost < 0)) errors.push(`${path}.alignmentCost: ≥ 0`);
  return errors;
}

/**
 * Transcription-guided alignment outcomes (Phase 4):
 *   aligned      the evidence supports this region for this text
 *   ambiguous    several boundaries or alignments remain plausible
 *   missing      no usable region for the expected text
 *   extra-ink    writing the transcription does not account for
 *   low-quality  the image does not give enough usable evidence
 *   unsupported  the segmentation this unit needs is not supported
 */
export const ALIGNMENT_STATES = ['aligned', 'ambiguous', 'missing', 'extra-ink', 'low-quality', 'unsupported'];
export const ALIGNMENT_LEVELS = ['line', 'word', 'unit'];

/**
 * An alignment observation (alignSample.js):
 *   { level, sampleId, revision, source: { start, end } | null (range in
 *     the known text; null for extra ink), text, key, script, word, line,
 *     bbox: [x, y, w, h] | null (analysis-raster pixels, in `frame`),
 *     frame: 'deskewed' | 'original', boundaryConfidence, alignmentConfidence
 *     (score | null), method, evidence: [string], reasons: [string],
 *     state, overlapsNeighbor, relation? }
 * `dims` ({ width, height }) bounds the box. `textLength` bounds `source`.
 */
export function validateAlignmentObservation(o, dims, textLength = Infinity) {
  if (!isObj(o)) return ['observation: must be an object'];
  const errors = [];
  if (!ALIGNMENT_LEVELS.includes(o.level)) errors.push('level: line | word | unit');
  if (typeof o.sampleId !== 'string' || !o.sampleId) errors.push('sampleId: the image this came from');
  if (!Number.isInteger(o.revision) || o.revision < 0) errors.push('revision: integer ≥ 0');
  if (!ALIGNMENT_STATES.includes(o.state)) errors.push('state: unknown');
  if (o.source !== null) {
    const ok = isObj(o.source) && Number.isInteger(o.source.start) && Number.isInteger(o.source.end) && o.source.start >= 0 && o.source.end > o.source.start && o.source.end <= textLength;
    if (!ok) errors.push('source: { start, end } inside the known text');
  } else if (o.state !== 'extra-ink') errors.push('source: only extra ink has no text');
  if (o.bbox !== null) {
    if (!isBox(o.bbox)) errors.push('bbox: [x, y, w, h]');
    else if (dims) {
      const [x, y, w, h] = o.bbox;
      if (x < 0 || y < 0 || w < 1 || h < 1 || x + w > dims.width || y + h > dims.height) errors.push('bbox: outside the analysed image');
    }
  } else if (o.state === 'aligned' || o.state === 'extra-ink') errors.push('bbox: an aligned or extra-ink observation has a region');
  if (!['deskewed', 'original'].includes(o.frame)) errors.push('frame: deskewed | original');
  errors.push(...validateScore(o.boundaryConfidence ?? null, 'boundaryConfidence'));
  errors.push(...validateScore(o.alignmentConfidence ?? null, 'alignmentConfidence'));
  if (typeof o.method !== 'string' || !o.method) errors.push('method: how the region was found');
  if (!Array.isArray(o.evidence) || !o.evidence.every(s => typeof s === 'string')) errors.push('evidence: [string]');
  if (!Array.isArray(o.reasons) || !o.reasons.every(s => typeof s === 'string')) errors.push('reasons: [string]');
  if (typeof o.overlapsNeighbor !== 'boolean') errors.push('overlapsNeighbor: boolean');
  if (o.state === 'ambiguous' && !o.reasons.length) errors.push('reasons: an ambiguous observation says why');
  return errors;
}

/** Handwriting metrics the analyser measures (each { value, unit, samples, method }). */
export const METRIC_NAMES = [
  'xHeightPx',
  'ascenderRatio',
  'capHeightRatio',
  'descenderRatio',
  'slantDeg',
  'strokeWidthRatio',
  'letterGapRatio',
  'wordGapRatio',
  'baselineDrift',
  'sizeVariation',
  'headlineThicknessRatio', // Devanagari
];

/** Profile-level confidence dimensions (re-exported for stage authors). */
export { CONFIDENCE_DIMENSIONS };

// --- Pipeline -------------------------------------------------------------------

/**
 * The engine's stages, the contract each consumes and produces, and the
 * phase that implements it. `implemented: false` means the stage does not
 * exist yet — callers must not present its output as learned handwriting.
 */
export const PIPELINE_STAGES = [
  { name: 'ReferenceImageIntake', output: 'sample metadata', phase: 2, implemented: true, module: 'imageInput.js, sampleSet.js' },
  { name: 'PageDetector', output: 'page outline; rectified page raster', phase: 9, implemented: true, module: 'pageDetection.js, homography.js' }, // rejects an outline it cannot fit; never guesses
  { name: 'ImageQualityAnalyzer', output: 'quality result', phase: 3, implemented: true, module: 'imageQuality.js' },
  { name: 'ImagePreprocessor', output: 'normalised raster, ink and text masks', phase: 3, implemented: true, module: 'preprocess.js' },
  { name: 'WritingRegionDetector', output: 'segments (region, line)', phase: 3, implemented: true, module: 'segmentation.js' },
  { name: 'LineAndCharacterSegmenter', output: 'segments (word, uncertain); unit regions', phase: 4, implemented: true, module: 'segmentation.js, unitBoundaries.js, devanagariAlignment.js' },
  { name: 'ScriptAndCharacterAnalyzer', output: 'alignment observations (known text ↔ regions)', phase: 4, implemented: true, module: 'expectedText.js, wordAlignment.js, alignSample.js' },
  { name: 'OrientationChecker', output: 'orientation verdict (sideways / upside down → quality error)', phase: 9, implemented: true, module: 'orientation.js' }, // never turns the photo
  { name: 'GlyphGeometryExtractor', output: 'unit observations with geometry', phase: 5, implemented: true, module: 'glyphExtraction.js' },
  { name: 'StrokeGeometryReconstructor', output: 'renderer forms', phase: 5, implemented: true, module: 'skeleton.js, strokeFit.js' },
  { name: 'GlyphVariantBuilder', output: 'unit forms', phase: 6, implemented: true, module: 'profileGeneration.js' },
  { name: 'HandwritingMetricsAnalyzer', output: 'metrics', phase: 6, implemented: true, module: 'profileGeneration.js' },
  { name: 'ProfileConfidenceAnalyzer', output: 'confidence records', phase: 6, implemented: true, module: 'profileGeneration.js' },
  { name: 'MissingCharacterResolver', output: 'coverage', phase: 6, implemented: true, module: 'profileGeneration.js' }, // reports missing units; synthesises nothing
  { name: 'PersonalProfileBuilder', output: 'profile version', phase: 1, implemented: true }, // assembly + validation only
  { name: 'ProfileRepository', output: 'stored versions', phase: 1, implemented: true },
  { name: 'ExistingRendererAdapter', output: 'renderer glyph table / unit resolution', phase: 1, implemented: true }, // conversion and headline joins only; not registered with the app renderer yet
  { name: 'PersonalProfilePreview', output: 'preview', phase: 7, implemented: false },
  { name: 'VisualReportGenerator', output: 'report', phase: 9, implemented: false },
];
