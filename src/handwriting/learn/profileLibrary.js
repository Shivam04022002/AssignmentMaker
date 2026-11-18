/**
 * Saved personal handwritings, summarised for the app's screens (the
 * profile list, the handwriting selector). Read-only: versions stay as
 * stored; this only lists them and says whether each can be used.
 *
 * A summary is { id, name, latest, versions, ref (personal:<id>@<latest>),
 * status ('ok' | personalStore error status), message?, scripts,
 * coverage: { Latn?: { learned, missing }, Deva?: { … } } } — status and
 * coverage come from the stored latest version through the same checks the
 * renderer uses (personalStore.toResolution), so the list never shows a
 * handwriting as usable that a document could not draw.
 */
import { summariseCoverage } from './confidence';
import { toResolution } from './personalStore';
import { listProfiles, readProfileVersion } from './profileRepository';
import { formatProfileRef } from './profileSchema';

const SCRIPT_NAMES = { Latn: 'English', Deva: 'Hindi' };

/** Coverage counts of a profile: learned (drawable) and missing units per script. */
export function coverageOf(profile) {
  const counts = summariseCoverage(profile.units);
  const out = {};
  for (const script of ['Latn', 'Deva']) {
    const c = counts[script];
    if (!c) continue;
    out[script] = { learned: c.observed + c.uncertain + c.composite + c.approximated, missing: c.missing + c.unsupported };
  }
  return out;
}

/** “English · 52 characters, Hindi · 68 clusters” */
export function coverageText(summary) {
  const parts = Object.entries(summary.coverage || {}).map(([script, c]) => `${SCRIPT_NAMES[script] || script} · ${c.learned} ${script === 'Deva' ? 'clusters' : 'characters'}${c.missing ? ` (${c.missing} missing)` : ''}`);
  return parts.length ? parts.join(', ') : 'No characters';
}

/** Every saved (not deleted) profile, newest first, summarised from its latest version. */
export async function loadProfileSummaries() {
  const entries = await listProfiles();
  const out = [];
  for (const e of entries) {
    const ref = formatProfileRef(e.id, e.latest);
    const resolution = toResolution(ref, await readProfileVersion(e.id, e.latest));
    const base = { id: e.id, name: e.name, latest: e.latest, versions: [...e.versions].sort((a, b) => a - b), ref, status: resolution.status };
    if (resolution.status !== 'ok') {
      out.push({ ...base, message: resolution.message, scripts: [], coverage: {} });
      continue;
    }
    out.push({
      ...base,
      scripts: resolution.profile.scripts.slice(),
      coverage: coverageOf(resolution.profile),
      synthetic: !!resolution.profile.synthetic,
      // For the list: the type it was made for (Phase 22 on; older profiles have none) and when.
      handwritingType: typeof resolution.profile.handwritingType === 'string' ? resolution.profile.handwritingType : null,
      createdAt: Number.isFinite(resolution.profile.profileCreatedAt) ? resolution.profile.profileCreatedAt : null,
    });
  }
  return out;
}

export { SCRIPT_NAMES };
