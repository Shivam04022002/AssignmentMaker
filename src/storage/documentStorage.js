/**
 * Local document persistence.
 *
 * Layout in the key-value store:
 *   documents:index      JSON array of document ids
 *   document:<id>        JSON of one document
 *
 * Documents are stored individually so saving one never rewrites the others.
 * The backend is swappable (`setStorageBackend`) for tests, and so a later
 * phase can move to SQLite or add cloud backup behind the same API.
 */
import { createAsyncStorage } from '@react-native-async-storage/async-storage';
import { normalizeDocument } from '../models/document';

const INDEX_KEY = 'documents:index';
const docKey = id => `document:${id}`;

let backend = null;

/** The key-value backend shared by all local storage modules. */
export function getStorageBackend() {
  return getBackend();
}

function getBackend() {
  if (!backend) {
    backend = createAsyncStorage('handwrite');
  }
  return backend;
}

/** Replace the key-value backend (getItem/setItem/removeItem). */
export function setStorageBackend(next) {
  backend = next;
}

// Writes are serialised so concurrent saves cannot clobber the index.
let writeQueue = Promise.resolve();
function enqueueWrite(task) {
  const run = writeQueue.then(task, task);
  writeQueue = run.catch(() => {});
  return run;
}

function parse(json, fallback) {
  if (!json) {
    return fallback;
  }
  try {
    return JSON.parse(json);
  } catch (error) {
    console.warn('[HandWrite] Ignoring unreadable stored data', error);
    return fallback;
  }
}

async function readIndex() {
  const ids = parse(await getBackend().getItem(INDEX_KEY), []);
  return Array.isArray(ids) ? ids : [];
}

export async function getDocument(id) {
  const stored = parse(await getBackend().getItem(docKey(id)), null);
  return stored ? normalizeDocument(stored) : null;
}

/** All saved documents, most recently edited first. */
export async function listDocuments() {
  const ids = await readIndex();
  const docs = await Promise.all(ids.map(getDocument));
  return docs.filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Every saved document, and whether that list is complete: `complete` is
 * false when the index or any indexed document cannot be read (a corrupted
 * entry's handwriting reference is then unknown). Used before anything is
 * removed on the strength of "no document refers to it".
 */
export async function listDocumentsChecked() {
  const raw = await getBackend().getItem(INDEX_KEY);
  let ids = [];
  if (raw) {
    try {
      ids = JSON.parse(raw);
    } catch (error) {
      return { documents: [], complete: false };
    }
    if (!Array.isArray(ids)) {
      return { documents: [], complete: false };
    }
  }
  const docs = await Promise.all(ids.map(getDocument));
  return { documents: docs.filter(Boolean), complete: docs.every(Boolean) };
}

/** Saves (creates or updates) a document and returns the stored copy. */
export function saveDocument(document, { now = Date.now() } = {}) {
  return enqueueWrite(async () => {
    const saved = normalizeDocument({ ...document, updatedAt: now });
    const store = getBackend();
    await store.setItem(docKey(saved.id), JSON.stringify(saved));
    const ids = await readIndex();
    if (!ids.includes(saved.id)) {
      await store.setItem(INDEX_KEY, JSON.stringify([saved.id, ...ids]));
    }
    return saved;
  });
}

export function deleteDocument(id) {
  return enqueueWrite(async () => {
    const store = getBackend();
    const ids = await readIndex();
    await store.setItem(INDEX_KEY, JSON.stringify(ids.filter(x => x !== id)));
    await store.removeItem(docKey(id));
  });
}
