/**
 * Local persistence of personal handwriting profiles, in the app's existing
 * key-value store (documentStorage.getStorageBackend):
 *
 *   profiles:index           { [id]: { id, name, profileCreatedAt, updatedAt,
 *                              versions: [1, 2, …], deletionRequested } }
 *   profile:<id>@<version>   one immutable version record (profileSchema.js)
 *
 * Rules:
 *   - A version is written once and never rewritten. Updating a profile
 *     means creating version n + 1; documents keep the version they pin.
 *   - Renaming changes the display name in the index only; the geometry
 *     versions keep the name they were created with.
 *   - Deleting a profile removes only versions that no document
 *     references. Referenced versions stay readable (the profile is hidden
 *     from the gallery) until the last document stops using them; then
 *     purgeOrphanedVersions removes them (Phase 17).
 *   - Nothing is removed unless every saved document could be read: a
 *     document that cannot be read might refer to the version.
 *   - Nothing here resets or migrates stored data in place.
 */
import { getStorageBackend, listDocumentsChecked } from '../../storage/documentStorage';
import {
  deserializeProfile,
  formatProfileRef,
  isPersonalRef,
  isProfileId,
  isVersion,
  parseProfileRef,
  serializeProfile,
  validateProfile,
} from './profileSchema';

const INDEX_KEY = 'profiles:index';
export const versionKey = (id, version) => `profile:${id}@${version}`;

let writeQueue = Promise.resolve();
function enqueueWrite(task) {
  const run = writeQueue.then(task, task);
  writeQueue = run.catch(() => {});
  return run;
}

async function readIndex() {
  const raw = await getStorageBackend().getItem(INDEX_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    console.warn('[HandWrite] Unreadable profile index; profiles stay on disk untouched');
    return {};
  }
}

/** The index, or null when it exists but cannot be read (then nothing may be rewritten). */
async function readIndexStrict() {
  const raw = await getStorageBackend().getItem(INDEX_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    return null;
  }
}

const writeIndex = index => getStorageBackend().setItem(INDEX_KEY, JSON.stringify(index));

/**
 * Stores a new immutable version. The first version of a profile must be
 * 1; later versions must be exactly latest + 1.
 * Returns { status: 'ok', ref } or { status: 'invalid' | 'version-conflict'
 * | 'version-exists' | 'profile-deleted' | 'unreadable-index', … }.
 */
export function createProfileVersion(profile, { now = Date.now() } = {}) {
  return enqueueWrite(async () => {
    const { ok, errors } = validateProfile(profile);
    if (!ok) return { status: 'invalid', errors };
    const store = getStorageBackend();
    // An index that exists but cannot be read is never rewritten: writing it
    // back would drop every other handwriting from the gallery.
    const index = await readIndexStrict();
    if (!index) return { status: 'unreadable-index', id: profile.id };
    const entry = index[profile.id];
    if (entry && entry.deletionRequested) return { status: 'profile-deleted', id: profile.id };
    const expected = entry ? Math.max(0, ...entry.versions) + 1 : 1;
    if (profile.version !== expected) return { status: 'version-conflict', expected, got: profile.version };
    const key = versionKey(profile.id, profile.version);
    const record = serializeProfile(profile);
    const stray = await store.getItem(key);
    // An unlisted record is never overwritten. If it is exactly this version
    // (the same save, retried after the index write failed), the save is
    // completed by listing it; anything else is refused.
    if (stray !== null && stray !== undefined && stray !== record) return { status: 'version-exists', ref: formatProfileRef(profile.id, profile.version) };
    // The version record first, then the index: an interruption leaves an
    // unlisted record, never a listed version that does not exist.
    if (stray !== record) await store.setItem(key, record);
    index[profile.id] = {
      id: profile.id,
      name: entry ? entry.name : profile.name,
      profileCreatedAt: entry ? entry.profileCreatedAt : profile.profileCreatedAt,
      updatedAt: now,
      versions: [...(entry ? entry.versions : []), profile.version],
      deletionRequested: false,
    };
    await writeIndex(index);
    return { status: 'ok', ref: formatProfileRef(profile.id, profile.version) };
  });
}

/**
 * Reads one version: { status: 'ok', profile } or
 * { status: 'missing-profile' | 'missing-version' | 'invalid' |
 *   'unsupported-schema', … }.
 */
export async function readProfileVersion(id, version) {
  if (!isProfileId(id) || !isVersion(version)) return { status: 'invalid', errors: ['not a profile id / version'] };
  const raw = await getStorageBackend().getItem(versionKey(id, version));
  if (!raw) {
    const index = await readIndex();
    return index[id] ? { status: 'missing-version', id, version } : { status: 'missing-profile', id, version };
  }
  const result = deserializeProfile(raw);
  if (result.status !== 'ok') return result;
  if (result.profile.id !== id || result.profile.version !== version) {
    return { status: 'invalid', errors: ['stored record does not match its key'] };
  }
  return result;
}

/**
 * Resolves a document's handwriting reference. Built-in ids are not
 * handled here (status 'builtin'); a personal reference that is malformed,
 * missing or unreadable is reported — never replaced by another profile.
 */
export async function resolveProfileRef(ref) {
  if (!isPersonalRef(ref)) return { status: 'builtin', ref };
  const parsed = parseProfileRef(ref);
  if (!parsed) return { status: 'invalid-ref', ref };
  return { ...(await readProfileVersion(parsed.id, parsed.version)), ref };
}

/** Profiles for the gallery (not deleted): [{ id, name, latest, versions, … }]. */
export async function listProfiles() {
  const index = await readIndex();
  return Object.values(index)
    .filter(e => !e.deletionRequested)
    .map(e => ({ ...e, latest: Math.max(...e.versions) }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Stored versions of a profile, oldest first ([] if unknown). */
export async function listVersions(id) {
  const entry = (await readIndex())[id];
  return entry ? [...entry.versions].sort((a, b) => a - b) : [];
}

/** Renames a profile (display name only; versions are immutable). */
export function renameProfile(id, name, { now = Date.now() } = {}) {
  return enqueueWrite(async () => {
    const clean = typeof name === 'string' ? name.trim() : '';
    if (!clean || clean.length > 60) return { status: 'invalid', errors: ['name: 1–60 characters'] };
    const index = await readIndex();
    if (!index[id] || index[id].deletionRequested) return { status: 'missing-profile', id };
    index[id] = { ...index[id], name: clean, updatedAt: now };
    await writeIndex(index);
    return { status: 'ok' };
  });
}

/** { profileId: Set(versions) } referenced by the given documents. */
export function referencedVersions(documents) {
  const out = {};
  for (const doc of documents || []) {
    const parsed = parseProfileRef(doc && doc.handwritingStyle);
    if (parsed) (out[parsed.id] = out[parsed.id] || new Set()).add(parsed.version);
  }
  return out;
}

/**
 * Deletes a profile as far as is safe: removes every version no document
 * references; referenced versions are kept (and the profile is hidden from
 * the gallery) so those documents still open.
 * Returns { status: 'ok', removed: [versions], retained: [versions] }.
 * Without `documents`, the saved documents are read; if any of them cannot
 * be read, every version is retained (`incomplete: true`) — the profile is
 * still hidden, and purgeOrphanedVersions removes the rest once all
 * documents read again.
 */
export function requestProfileDeletion(id, { documents } = {}) {
  return enqueueWrite(async () => {
    const index = await readIndexStrict();
    if (!index) return { status: 'unreadable-index', id };
    const entry = index[id];
    if (!entry) return { status: 'missing-profile', id };
    let docs = documents;
    let incomplete = false;
    if (!docs) {
      const checked = await listDocumentsChecked();
      docs = checked.documents;
      incomplete = !checked.complete;
    }
    const used = incomplete ? new Set(entry.versions) : referencedVersions(docs)[id] || new Set();
    const store = getStorageBackend();
    const removed = [];
    const retained = [];
    for (const v of entry.versions) {
      if (used.has(v)) retained.push(v);
      else removed.push(v);
    }
    // Index first (so nothing lists a removed version), then the records.
    if (retained.length) index[id] = { ...entry, versions: retained, deletionRequested: true };
    else delete index[id];
    await writeIndex(index);
    for (const v of removed) await store.removeItem(versionKey(id, v));
    return incomplete ? { status: 'ok', removed, retained, incomplete } : { status: 'ok', removed, retained };
  });
}

/**
 * Removes the versions of deleted profiles that no saved document refers
 * to any more (the document was deleted or now uses another handwriting).
 * Only profiles whose deletion was requested are touched; versions of live
 * profiles are never removed here. Does nothing — and reports why — when
 * the profile index or any saved document cannot be read.
 * Returns { status: 'ok', removed: { [id]: [versions] } } or
 * { status: 'skipped', reason }.
 */
export function purgeOrphanedVersions() {
  return enqueueWrite(async () => {
    const index = await readIndexStrict();
    if (!index) return { status: 'skipped', reason: 'the profile index cannot be read' };
    const deleted = Object.values(index).filter(e => e && e.deletionRequested);
    if (!deleted.length) return { status: 'ok', removed: {} };
    const checked = await listDocumentsChecked();
    if (!checked.complete) return { status: 'skipped', reason: 'a saved document cannot be read' };
    const refs = referencedVersions(checked.documents);
    const removed = {};
    for (const entry of deleted) {
      const used = refs[entry.id] || new Set();
      const gone = entry.versions.filter(v => !used.has(v));
      if (!gone.length) continue;
      removed[entry.id] = gone;
      const kept = entry.versions.filter(v => used.has(v));
      if (kept.length) index[entry.id] = { ...entry, versions: kept };
      else delete index[entry.id];
    }
    if (!Object.keys(removed).length) return { status: 'ok', removed };
    // Index first (so nothing lists a removed version), then the records.
    await writeIndex(index);
    const store = getStorageBackend();
    for (const [id, versions] of Object.entries(removed)) for (const v of versions) await store.removeItem(versionKey(id, v));
    return { status: 'ok', removed };
  });
}
