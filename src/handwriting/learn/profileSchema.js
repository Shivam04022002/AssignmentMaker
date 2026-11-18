/**
 * Personal (learned) handwriting profiles — schema, references, validation,
 * serialisation and migration.
 *
 * A profile is stored as immutable versions. Each version is one JSON
 * record; a document pins the exact version it was written with through a
 * reference string:
 *
 *   personal:<profileId>@<version>        e.g. personal:p-lx3k9a-4f2c1b@2
 *
 * Geometry uses the renderer's own glyph format — the same as Lang3's
 * letterforms (glyphs.js → GLYPH_FORMS): a unit has forms
 * { w, weight, strokes }, strokes being cubic chains
 * [x0, y0, c1x, c1y, c2x, c2y, x1, y1, …] in x-height units (baseline 0,
 * x-height 1, y up). Each form also says how it was made (method), how
 * sure the engine is (confidence) and where it was seen (observations:
 * sample slot + region) — never the source pixels.
 *
 * Version record (schemaVersion 1):
 *   kind 'personal-learned', schemaVersion, engineVersion,
 *   id, version, name, createdAt, profileCreatedAt,
 *   scripts        subset of ['Latn', 'Deva']
 *   synthetic?     true only for test fixtures (labelled, never shown as learned)
 *   sources        [sample metadata] (contracts.js; no pixels)
 *   metrics        { name: { value, unit, samples, method } }
 *   params         renderer proportions (xHeightPerPitch, ascender, …)
 *   paramSources   { param: 'measured' | 'engine-default' }
 *   units          { key: { text, script, kind, coverage, forms, composition?,
 *                           anchors?, confidence } }
 *   confidence     profile-level record (confidence.js)
 *   diagnostics    { warnings: [], errors: [] }
 *   limitations    [string]
 *   evidence?      what the version was built from (Phase 8; no pixels):
 *                  { samples: [{ slot, considered, extracted, used,
 *                  rejected: { code: count } }], requirements: [{ id,
 *                  description, required, actual, pass }] }
 */
import { COVERAGE_STATES, DRAWABLE_STATES, validateConfidence, validateScore } from './confidence';
import { validateSampleMetadata } from './contracts';
import { lookupKey, splitUnits, UNIT_KIND } from './textUnits';

export const PERSONAL_KIND = 'personal-learned';
export const PERSONAL_PREFIX = 'personal:';
export const PROFILE_SCHEMA_VERSION = 1;
export const ENGINE_VERSION = '0.1.0';
export const PROFILE_SCRIPTS = ['Latn', 'Deva'];

/** How a form's geometry was made. */
export const FORM_METHODS = [
  'skeleton-trace', // centre-line traced from the ink skeleton
  'contour-approx', // approximated from the ink outline (lower fidelity)
  'composite', // assembled from observed components
  'synthetic-fixture', // test data only (profile.synthetic === true)
];

/** Renderer proportions a profile must provide, with sane bounds. */
export const PARAM_BOUNDS = {
  xHeightPerPitch: [0.15, 0.6],
  ascender: [1, 3],
  capHeight: [1, 3],
  descender: [0.2, 1.5],
  strokeWidth: [0.04, 0.4],
  letterGap: [0, 1],
  glyphWidth: [0.5, 2],
  wordGap: [0.5, 5],
  slant: [-30, 30],
};
export const PARAM_SOURCES = ['measured', 'engine-default'];

const ID_RE = /^p-[a-z0-9]{4,}(?:-[a-z0-9]{2,})*$/;

// --- Identity and references ------------------------------------------------

/** A new profile id (identity only; never used for rendering variation). */
export function generateProfileId(now = Date.now()) {
  const random = Math.random().toString(36).slice(2, 8).padEnd(6, '0');
  return `p-${now.toString(36)}-${random}`;
}

export const isProfileId = id => typeof id === 'string' && ID_RE.test(id);
export const isVersion = v => Number.isInteger(v) && v >= 1;

/** The reference a document stores: personal:<id>@<version>. */
export function formatProfileRef(id, version) {
  if (!isProfileId(id) || !isVersion(version)) {
    throw new Error(`Invalid profile reference parts: ${id}@${version}`);
  }
  return `${PERSONAL_PREFIX}${id}@${version}`;
}

/** Any string in the personal namespace (well-formed or not). */
export const isPersonalRef = ref => typeof ref === 'string' && ref.startsWith(PERSONAL_PREFIX);

/** { id, version } for a well-formed reference, otherwise null. */
export function parseProfileRef(ref) {
  if (!isPersonalRef(ref)) return null;
  const m = /^personal:(.+)@(\d+)$/.exec(ref);
  if (!m) return null;
  const version = Number(m[2]);
  return isProfileId(m[1]) && isVersion(version) ? { id: m[1], version } : null;
}

// --- Validation -------------------------------------------------------------

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const num = Number.isFinite;

function validateStroke(pts, w, path) {
  if (!Array.isArray(pts) || pts.length < 2 || (pts.length - 2) % 6 !== 0) {
    return [`${path}: must be a cubic chain [x0, y0, (c1x, c1y, c2x, c2y, x, y)…]`];
  }
  for (let i = 0; i < pts.length; i++) {
    const v = pts[i];
    if (!num(v)) return [`${path}[${i}]: not a finite number`];
    const out = i % 2 === 0 ? v < -1 || v > w + 1.5 : v < -1.5 || v > 2.5;
    if (out) return [`${path}[${i}]: outside the glyph band`];
  }
  return [];
}

function validateForm(form, profile, path) {
  if (!isObj(form)) return [`${path}: must be an object`];
  const errors = [];
  if (!num(form.w) || form.w <= 0 || form.w > 4) errors.push(`${path}.w: body width must be in (0, 4]`);
  if (!num(form.weight) || form.weight < 0) errors.push(`${path}.weight: must be ≥ 0`);
  if (!Array.isArray(form.strokes) || !form.strokes.length) errors.push(`${path}.strokes: at least one stroke`);
  else form.strokes.forEach((s, i) => errors.push(...validateStroke(s, num(form.w) ? form.w : 1, `${path}.strokes[${i}]`)));
  if (!FORM_METHODS.includes(form.method)) errors.push(`${path}.method: unknown method`);
  if (form.method === 'synthetic-fixture' && profile.synthetic !== true) {
    errors.push(`${path}.method: synthetic geometry is only allowed in a profile marked synthetic`);
  }
  if (form.confidence !== undefined) errors.push(...validateScore(form.confidence, `${path}.confidence`));
  if (!Array.isArray(form.observations)) errors.push(`${path}.observations: must be an array`);
  else {
    form.observations.forEach((o, i) => {
      const ok = isObj(o) && Number.isInteger(o.sample) && o.sample >= 1 && Array.isArray(o.bbox) && o.bbox.length === 4 && o.bbox.every(num);
      if (!ok) errors.push(`${path}.observations[${i}]: { sample, bbox: [x, y, w, h] }`);
    });
  }
  return errors;
}

/**
 * One form's geometry and provenance, as validateProfile checks it inside a
 * unit (glyph extraction validates its forms with the same rules).
 */
export function validateGlyphForm(form, profile, path = 'form') {
  return validateForm(form, profile || {}, path);
}

function validateUnit(key, unit, profile) {
  const path = `units[${JSON.stringify(key)}]`;
  if (!isObj(unit)) return [`${path}: must be an object`];
  const errors = [];
  const parts = splitUnits(key);
  if (key !== lookupKey(key)) errors.push(`${path}: key must be NFC-normalised`);
  if (parts.length !== 1) errors.push(`${path}: key must be exactly one rendering unit (got ${parts.length})`);
  else {
    const u = parts[0];
    if ([UNIT_KIND.SPACE, UNIT_KIND.OTHER, UNIT_KIND.ORPHAN_MARK].includes(u.kind)) errors.push(`${path}: ${u.kind} units cannot be learned`);
    if (unit.script !== u.script) errors.push(`${path}.script: is ${u.script}, not ${unit.script}`);
    if (unit.kind !== u.kind) errors.push(`${path}.kind: is ${u.kind}, not ${unit.kind}`);
  }
  if (unit.text !== key) errors.push(`${path}.text: must equal its key`);
  if (!COVERAGE_STATES.includes(unit.coverage)) errors.push(`${path}.coverage: unknown state`);
  const forms = Array.isArray(unit.forms) ? unit.forms : null;
  if (!forms) errors.push(`${path}.forms: must be an array`);
  else {
    forms.forEach((f, i) => errors.push(...validateForm(f, profile, `${path}.forms[${i}]`)));
    const drawable = DRAWABLE_STATES.includes(unit.coverage);
    if (drawable && !forms.some(f => isObj(f) && f.weight > 0)) errors.push(`${path}: a ${unit.coverage} unit needs a form with weight > 0`);
    if (!drawable && forms.length) errors.push(`${path}: a ${unit.coverage} unit has no forms`);
  }
  if (unit.coverage === 'composite') {
    const parts2 = unit.composition;
    if (!Array.isArray(parts2) || !parts2.length) errors.push(`${path}.composition: lists the observed units it is built from`);
    else {
      parts2.forEach(p => {
        const src = profile.units && profile.units[p];
        if (p === key) errors.push(`${path}.composition: cannot use itself`);
        else if (!src || !['observed', 'uncertain'].includes(src.coverage)) errors.push(`${path}.composition: ${p} is not an observed unit`);
      });
    }
  }
  if (unit.anchors !== undefined) {
    if (!isObj(unit.anchors)) errors.push(`${path}.anchors: must be an object`);
    else {
      for (const [name, pt] of Object.entries(unit.anchors)) {
        if (!Array.isArray(pt) || pt.length !== 2 || !pt.every(num)) errors.push(`${path}.anchors.${name}: [x, y]`);
      }
    }
  }
  if (unit.confidence !== undefined) errors.push(...validateConfidence(unit.confidence, `${path}.confidence`));
  return errors;
}

/** The optional build evidence of a version (counts and codes only). */
function validateEvidence(e) {
  if (!isObj(e) || !Array.isArray(e.samples) || !Array.isArray(e.requirements)) return ['evidence: { samples: [], requirements: [] }'];
  const errors = [];
  e.samples.forEach((s, i) => {
    const counts = ['slot', 'considered', 'extracted', 'used'].every(k => Number.isInteger(s && s[k]) && s[k] >= 0);
    const rejected = isObj(s && s.rejected) && Object.values(s.rejected).every(v => Number.isInteger(v) && v >= 0);
    if (!counts || !rejected) errors.push(`evidence.samples[${i}]: { slot, considered, extracted, used, rejected: { code: count } }`);
  });
  e.requirements.forEach((r, i) => {
    if (!isObj(r) || typeof r.id !== 'string' || typeof r.pass !== 'boolean' || !num(r.actual) || !num(r.required)) errors.push(`evidence.requirements[${i}]: { id, description, required, actual, pass }`);
  });
  return errors;
}

/**
 * Validates a profile version record. Returns { ok, errors }.
 * Checks identity, schema, scripts, params, sources (no pixels), units
 * (one rendering unit per key, coverage consistent with forms, geometry in
 * the renderer's format and band), confidence and limitations.
 */
export function validateProfile(profile) {
  const errors = [];
  if (!isObj(profile)) return { ok: false, errors: ['profile: must be an object'] };
  if (profile.kind !== PERSONAL_KIND) errors.push(`kind: must be "${PERSONAL_KIND}"`);
  if (profile.schemaVersion !== PROFILE_SCHEMA_VERSION) errors.push(`schemaVersion: must be ${PROFILE_SCHEMA_VERSION}`);
  if (typeof profile.engineVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(profile.engineVersion)) errors.push('engineVersion: semver string');
  if (!isProfileId(profile.id)) errors.push('id: must look like p-<base36>-<base36>');
  if (!isVersion(profile.version)) errors.push('version: integer ≥ 1');
  if (typeof profile.name !== 'string' || !profile.name.trim() || profile.name.length > 60) errors.push('name: 1–60 characters');
  for (const k of ['createdAt', 'profileCreatedAt']) if (!num(profile[k])) errors.push(`${k}: timestamp`);
  if (profile.synthetic !== undefined && typeof profile.synthetic !== 'boolean') errors.push('synthetic: boolean');
  if (profile.handwritingType !== undefined && !(typeof profile.handwritingType === 'string' && /^[a-z]+(-[a-z]+){0,3}$/.test(profile.handwritingType))) errors.push('handwritingType: a handwriting type id');
  const scripts = profile.scripts;
  if (!Array.isArray(scripts) || !scripts.length || new Set(scripts).size !== scripts.length || !scripts.every(s => PROFILE_SCRIPTS.includes(s))) {
    errors.push(`scripts: non-empty subset of ${PROFILE_SCRIPTS.join(', ')}`);
  }
  if (!Array.isArray(profile.sources)) errors.push('sources: must be an array');
  else profile.sources.forEach((s, i) => errors.push(...validateSampleMetadata(s, `sources[${i}]`)));
  if (!isObj(profile.metrics)) errors.push('metrics: must be an object');
  else {
    for (const [k, m] of Object.entries(profile.metrics)) {
      if (!isObj(m) || !num(m.value) || !Number.isInteger(m.samples) || m.samples < 0 || typeof m.method !== 'string') {
        errors.push(`metrics.${k}: { value, unit?, samples, method }`);
      }
    }
  }
  if (!isObj(profile.params)) errors.push('params: must be an object');
  else {
    for (const [k, [lo, hi]] of Object.entries(PARAM_BOUNDS)) {
      const v = profile.params[k];
      if (!num(v) || v < lo || v > hi) errors.push(`params.${k}: must be in [${lo}, ${hi}]`);
    }
  }
  if (!isObj(profile.paramSources)) errors.push('paramSources: must be an object');
  else {
    for (const k of Object.keys(PARAM_BOUNDS)) {
      if (!PARAM_SOURCES.includes(profile.paramSources[k])) errors.push(`paramSources.${k}: measured | engine-default`);
    }
  }
  if (!isObj(profile.units)) errors.push('units: must be an object');
  else {
    for (const [key, unit] of Object.entries(profile.units)) {
      errors.push(...validateUnit(key, unit, profile));
      if (isObj(unit) && Array.isArray(scripts) && unit.script && !['Zyyy'].includes(unit.script) && !scripts.includes(unit.script)) {
        errors.push(`units[${JSON.stringify(key)}].script: ${unit.script} is not in scripts`);
      }
    }
  }
  errors.push(...validateConfidence(profile.confidence));
  if (!isObj(profile.diagnostics) || !Array.isArray(profile.diagnostics.warnings) || !Array.isArray(profile.diagnostics.errors)) {
    errors.push('diagnostics: { warnings: [], errors: [] }');
  }
  if (!Array.isArray(profile.limitations) || !profile.limitations.every(s => typeof s === 'string')) errors.push('limitations: [string]');
  if (profile.evidence !== undefined) errors.push(...validateEvidence(profile.evidence));
  return { ok: errors.length === 0, errors };
}

// --- Serialisation and migration -------------------------------------------

/**
 * Migrations from older schema versions: MIGRATIONS[n] turns a version-n
 * record into a version-(n+1) record. Pure, non-destructive (the stored
 * record is only rewritten when a new version is saved). Empty for now:
 * schema 1 is the first.
 */
export const MIGRATIONS = {};

/** Brings a raw record to the current schema: { status, profile?, errors? }. */
export function migrateProfile(raw, migrations = MIGRATIONS) {
  if (!isObj(raw) || !Number.isInteger(raw.schemaVersion)) return { status: 'invalid', errors: ['schemaVersion: missing'] };
  if (raw.schemaVersion > PROFILE_SCHEMA_VERSION) {
    return { status: 'unsupported-schema', schemaVersion: raw.schemaVersion, errors: [`schema ${raw.schemaVersion} is newer than this app (${PROFILE_SCHEMA_VERSION})`] };
  }
  let record = raw;
  while (record.schemaVersion < PROFILE_SCHEMA_VERSION) {
    const step = migrations[record.schemaVersion];
    if (typeof step !== 'function') {
      return { status: 'unsupported-schema', schemaVersion: raw.schemaVersion, errors: [`no migration from schema ${record.schemaVersion}`] };
    }
    record = { ...step(record), schemaVersion: record.schemaVersion + 1 };
  }
  return { status: 'ok', profile: record };
}

/** Serialises a valid profile version (throws on an invalid one). */
export function serializeProfile(profile) {
  const { ok, errors } = validateProfile(profile);
  if (!ok) throw new Error(`Invalid profile: ${errors.slice(0, 5).join('; ')}`);
  return JSON.stringify(profile);
}

/**
 * Reads a stored version: { status: 'ok', profile } or
 * { status: 'invalid' | 'unsupported-schema', errors }.
 */
export function deserializeProfile(json, migrations = MIGRATIONS) {
  let raw;
  try {
    raw = typeof json === 'string' ? JSON.parse(json) : null;
  } catch (e) {
    return { status: 'invalid', errors: ['not valid JSON'] };
  }
  const migrated = migrateProfile(raw, migrations);
  if (migrated.status !== 'ok') return migrated;
  const { ok, errors } = validateProfile(migrated.profile);
  return ok ? { status: 'ok', profile: migrated.profile } : { status: 'invalid', errors };
}
