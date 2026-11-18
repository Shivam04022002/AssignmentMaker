/**
 * Assembles profile versions from analysis results.
 *
 * This is assembly and validation only: it does not analyse anything. The
 * analysis stages (PIPELINE_STAGES in contracts.js) provide metrics,
 * params, units and confidence; the builder derives what can be derived
 * from those (each unit's script and kind from its key, the coverage
 * summary, a limitation note for every engine-default parameter) and
 * refuses anything that does not validate.
 *
 * Versions are immutable: nextVersion() returns a new record and never
 * touches the one it starts from.
 */
import { summariseCoverage, unmeasuredConfidence } from './confidence';
import {
  ENGINE_VERSION,
  PARAM_BOUNDS,
  PERSONAL_KIND,
  PROFILE_SCHEMA_VERSION,
  validateProfile,
} from './profileSchema';
import { lookupKey, splitUnits } from './textUnits';

const clone = v => JSON.parse(JSON.stringify(v));

/** Units keyed by lookup key, with text/script/kind derived from the key. */
function normaliseUnits(units) {
  const out = {};
  for (const [rawKey, unit] of Object.entries(units || {})) {
    const key = lookupKey(rawKey);
    const [u] = splitUnits(key);
    out[key] = {
      ...clone(unit),
      text: key,
      script: u ? u.script : unit.script,
      kind: u ? u.kind : unit.kind,
    };
  }
  return out;
}

/** Plain-language notes for parameters that were not measured. */
export function defaultParamNotes(paramSources) {
  return Object.keys(PARAM_BOUNDS)
    .filter(k => paramSources && paramSources[k] === 'engine-default')
    .map(k => `${k} was not measured from the samples; an engine default is used.`);
}

/**
 * Builds a version record. Returns { ok, profile, errors }.
 *
 * @param parts { id, version, name, now, profileCreatedAt?, scripts,
 *                sources, metrics, params, paramSources, units,
 *                confidence?, diagnostics?, limitations?, synthetic? }
 */
export function buildProfileVersion(parts) {
  const now = Number.isFinite(parts.now) ? parts.now : Date.now();
  const limitations = [...(parts.limitations || [])];
  for (const note of defaultParamNotes(parts.paramSources)) {
    if (!limitations.includes(note)) limitations.push(note);
  }
  const profile = {
    kind: PERSONAL_KIND,
    schemaVersion: PROFILE_SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    id: parts.id,
    version: parts.version,
    name: typeof parts.name === 'string' ? parts.name.trim() : parts.name,
    createdAt: now,
    profileCreatedAt: Number.isFinite(parts.profileCreatedAt) ? parts.profileCreatedAt : now,
    ...(parts.synthetic ? { synthetic: true } : null),
    // Phase 22: the handwriting type it was made for (e.g. 'english-maths'); absent on older versions.
    ...(parts.handwritingType ? { handwritingType: parts.handwritingType } : null),
    scripts: [...(parts.scripts || [])],
    sources: clone(parts.sources || []),
    metrics: clone(parts.metrics || {}),
    params: clone(parts.params || {}),
    paramSources: clone(parts.paramSources || {}),
    units: normaliseUnits(parts.units),
    confidence: clone(parts.confidence || unmeasuredConfidence()),
    diagnostics: {
      warnings: [...((parts.diagnostics && parts.diagnostics.warnings) || [])],
      errors: [...((parts.diagnostics && parts.diagnostics.errors) || [])],
    },
    limitations,
    ...(parts.evidence ? { evidence: clone(parts.evidence) } : null),
  };
  const { ok, errors } = validateProfile(profile);
  return { ok, profile: ok ? profile : null, errors };
}

/**
 * The next immutable version of a profile: the same id and creation time,
 * version + 1, with `changes` applied. `previous` is not modified.
 */
export function nextVersion(previous, changes = {}, now = Date.now()) {
  const base = clone(previous);
  return buildProfileVersion({
    ...base,
    ...clone(changes),
    id: previous.id,
    version: previous.version + 1,
    profileCreatedAt: previous.profileCreatedAt,
    now,
  });
}

/** Coverage counts by script and state for a profile (summary views). */
export function coverageSummary(profile) {
  return summariseCoverage(profile.units);
}
