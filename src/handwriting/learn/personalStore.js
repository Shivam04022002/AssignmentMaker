/**
 * Runtime resolution of personal handwriting references for rendering.
 *
 * A document's handwritingStyle may be personal:<id>@<version>. Rendering
 * is synchronous, storage is not, so each reference is resolved once (in
 * the background) and cached here; components subscribe and redraw when it
 * arrives. The result is always the EXACT stored version — never the
 * latest version, another profile, or a built-in hand:
 *
 *   { status: 'loading', ref }
 *   { status: 'ok', ref, profile, glyphs: { table, forms }, name }
 *   { status: 'invalid-ref' | 'missing-profile' | 'missing-version' |
 *             'invalid' | 'unsupported-schema' | 'no-glyphs' | 'error',
 *     ref, message }                       — shown as an explicit error
 *
 * 'invalid' covers a stored version whose record or geometry fails
 * profileSchema validation; 'no-glyphs' a valid version without a single
 * drawable unit. A version with some units missing is 'ok': each missing
 * unit is reported where it occurs (personalRenderer), never substituted.
 */
import { DRAWABLE_STATES } from './confidence';
import { resolveProfileRef } from './profileRepository';
import { isPersonalRef, parseProfileRef } from './profileSchema';
import { rendererGlyphs } from './rendererAdapter';

const cache = new Map();
const inflight = new Map();
const listeners = new Set();
let version = 0;

export const PERSONAL_ERROR_MESSAGES = {
  'invalid-ref': 'The document refers to a personal handwriting in a form this app does not recognise.',
  'missing-profile': 'This personal handwriting is not on this device (it may have been deleted).',
  'missing-version': 'The version of the personal handwriting this document was written with is not on this device.',
  invalid: 'The stored personal handwriting is damaged or does not pass its checks.',
  'unsupported-schema': 'This personal handwriting was saved by a newer version of the app.',
  'no-glyphs': 'This personal handwriting has no letters that can be drawn.',
  error: 'The personal handwriting could not be read.',
};

function notify() {
  version += 1;
  listeners.forEach(l => l());
}

export function subscribePersonal(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getPersonalVersion = () => version;

const failure = (ref, status, details) => ({ status, ref, message: PERSONAL_ERROR_MESSAGES[status] || PERSONAL_ERROR_MESSAGES.error, ...(details ? { details } : null) });

/** Turns a repository result into a render resolution. */
export function toResolution(ref, result) {
  if (!result || result.status !== 'ok') {
    const status = result && PERSONAL_ERROR_MESSAGES[result.status] ? result.status : 'error';
    return failure(ref, status, result && result.errors ? result.errors.slice(0, 5) : undefined);
  }
  const { profile } = result;
  const parsed = parseProfileRef(ref);
  if (!parsed || profile.id !== parsed.id || profile.version !== parsed.version) return failure(ref, 'invalid', ['stored version does not match the reference']);
  const drawable = Object.values(profile.units || {}).filter(u => DRAWABLE_STATES.includes(u.coverage) && u.forms.length);
  if (!drawable.length) return failure(ref, 'no-glyphs');
  return { status: 'ok', ref, profile, glyphs: rendererGlyphs(profile), name: `${profile.name} (v${profile.version})` };
}

/** Resolves a reference (cached; concurrent calls share one read). */
export function loadPersonal(ref) {
  if (cache.has(ref) && cache.get(ref).status !== 'loading') return Promise.resolve(cache.get(ref));
  if (inflight.has(ref)) return inflight.get(ref);
  if (!isPersonalRef(ref) || !parseProfileRef(ref)) {
    const r = failure(ref, 'invalid-ref');
    cache.set(ref, r);
    notify();
    return Promise.resolve(r);
  }
  cache.set(ref, { status: 'loading', ref });
  const run = resolveProfileRef(ref)
    .then(result => toResolution(ref, result))
    .catch(() => failure(ref, 'error'))
    .then(r => {
      cache.set(ref, r);
      inflight.delete(ref);
      notify();
      return r;
    });
  inflight.set(ref, run);
  return run;
}

/**
 * The current resolution of a reference, synchronously: the cached result,
 * or 'loading' (and the read is started). Never another handwriting.
 */
export function getPersonalResolution(ref) {
  if (cache.has(ref)) return cache.get(ref);
  if (!isPersonalRef(ref) || !parseProfileRef(ref)) {
    const r = failure(ref, 'invalid-ref');
    cache.set(ref, r);
    return r;
  }
  loadPersonal(ref);
  return cache.get(ref) || { status: 'loading', ref };
}

/** Forgets cached resolutions (after a profile is deleted; tests). */
export function clearPersonalCache() {
  cache.clear();
  inflight.clear();
  notify();
}
