/**
 * Pre-build audit regressions: storage failures and unreadable data never
 * crash a flow or rewrite what cannot be read, and the native modules
 * report failures instead of ending the app.
 *
 * Storage failures are simulated with a backend that throws; native
 * behaviour is checked statically (the Kotlin source), not run — native
 * code is unverified on a device.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { Alert } from 'react-native';
import { clearAllMockStorages } from '@react-native-async-storage/async-storage';
import { buildProfileVersion } from '../src/handwriting/learn/profileBuilder';
import { clearPersonalCache } from '../src/handwriting/learn/personalStore';
import { createProfileVersion, versionKey } from '../src/handwriting/learn/profileRepository';
import { createDocument } from '../src/models/document';
import { safeGenerate } from '../src/screens/CreateHandwritingScreen';
import EditorScreen from '../src/screens/EditorScreen';
import HomeScreen from '../src/screens/HomeScreen';
import ProfileDetailsScreen from '../src/screens/ProfileDetailsScreen';
import { deletionNotice } from '../src/screens/ProfilesScreen';
import { getDocument, getStorageBackend, saveDocument, setStorageBackend } from '../src/storage/documentStorage';
import { act, press, render } from './helpers/render';
import { ALL_DEFAULT, PARAMS, SOURCES, syntheticForm } from './helpers/syntheticProfile';

jest.setTimeout(120000);

const ID = 'p-audit0-ab';
function profile(version = 1, id = ID) {
  const units = { h: { coverage: 'observed', forms: [syntheticForm(0.6)] } };
  const r = buildProfileVersion({ id, version, name: 'Audit hand', now: 1760000000000 + version, profileCreatedAt: 1760000000000, synthetic: true, scripts: ['Latn'], sources: SOURCES, metrics: {}, params: PARAMS, paramSources: ALL_DEFAULT, units });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.profile;
}
const flush = async (n = 5) => {
  for (let i = 0; i < n; i++) {
    await act(async () => {
      await new Promise(res => setTimeout(res, 0));
    });
  }
};
const textOf = node => {
  const out = [];
  const walk = n => (typeof n === 'string' ? out.push(n) : n && n.children && n.children.forEach(walk));
  walk(node);
  return out.join('');
};
/** The real (mock) store, with writes to matching keys failing on demand. */
function failingBackend(failKey) {
  const real = getStorageBackend();
  return {
    getItem: k => real.getItem(k),
    setItem: (k, v) => (failKey(k) ? Promise.reject(new Error('disk full')) : real.setItem(k, v)),
    removeItem: k => (failKey(k) ? Promise.reject(new Error('disk full')) : real.removeItem(k)),
  };
}

beforeEach(() => {
  clearAllMockStorages();
  setStorageBackend(null);
  clearPersonalCache();
});
afterEach(() => jest.restoreAllMocks());

describe('profile storage', () => {
  it('an unreadable profile index is never rewritten by saving a new handwriting', async () => {
    await getStorageBackend().setItem('profiles:index', '{ broken');
    expect(await createProfileVersion(profile())).toEqual({ status: 'unreadable-index', id: ID });
    expect(await getStorageBackend().getItem('profiles:index')).toBe('{ broken');
    expect(await getStorageBackend().getItem(versionKey(ID, 1))).toBeNull();
  });

  it('a readable index still works as before', async () => {
    expect((await createProfileVersion(profile())).status).toBe('ok');
    expect((await createProfileVersion(profile(2))).status).toBe('ok');
  });

  it('a deletion that could not read every document says so', () => {
    expect(deletionNotice({ status: 'ok', removed: [], retained: [1, 2], incomplete: true })).toMatch(/a saved document could not be read/);
    expect(deletionNotice({ status: 'ok', removed: [2], retained: [1] })).toMatch(/kept because saved documents use it/);
  });
});

describe('the wizard never crashes on an unexpected error', () => {
  it('profile generation that throws becomes a failed result', () => {
    const samples = [{ get metadata() { throw new Error('boom'); } }];
    const r = safeGenerate({ id: ID, name: 'x', now: 1, samples });
    expect(r.status).toBe('failed');
    expect(r.profile).toBeNull();
    expect(r.errors).toEqual(['boom']);
    expect(r.report.requirements).toEqual([]);
  });
});

describe('document deletion when storage fails', () => {
  const accept = () =>
    jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
      const destructive = (buttons || []).find(b => b.style === 'destructive');
      if (destructive) destructive.onPress();
    });

  it('Home: an explained failure, the document kept', async () => {
    const doc = await saveDocument({ ...createDocument(), title: 'Keep me', content: 'hello' });
    setStorageBackend(failingBackend(k => k === 'documents:index'));
    const alert = accept();
    const r = await render(<HomeScreen onNewDocument={jest.fn()} onOpenDocument={jest.fn()} />);
    await flush();
    const card = r.root.findAll(n => n.props.testID === `document-card-${doc.id}` && n.props.onLongPress)[0];
    await act(async () => {
      card.props.onLongPress();
    });
    await flush();
    expect(alert).toHaveBeenCalledWith('Could not delete', 'The document is unchanged. Please try again.');
    expect(await getDocument(doc.id)).not.toBeNull();
  });

  it('Editor: an explained failure, the editor stays open', async () => {
    const doc = await saveDocument({ ...createDocument(), content: 'hello' });
    setStorageBackend(failingBackend(k => k === 'documents:index'));
    const alert = accept();
    const onClose = jest.fn();
    const r = await render(<EditorScreen documentId={doc.id} onClose={onClose} />);
    await flush();
    await press(r, 'menu-button');
    await press(r, 'delete-document-button');
    await flush();
    expect(alert).toHaveBeenCalledWith('Could not delete', 'The document is unchanged. Please try again.');
    expect(onClose).not.toHaveBeenCalled();
    expect(await getDocument(doc.id)).not.toBeNull();
  });
});

describe('handwriting details when storage fails', () => {
  it('rename failure is explained', async () => {
    await createProfileVersion(profile());
    setStorageBackend(failingBackend(k => k === 'profiles:index'));
    const r = await render(<ProfileDetailsScreen profileId={ID} onBack={jest.fn()} />);
    await flush();
    await act(async () => {
      r.root.findAll(n => n.props.testID === 'rename-input' && n.props.onChangeText).forEach(n => n.props.onChangeText('New name'));
    });
    await press(r, 'rename-button');
    await flush();
    expect(textOf(r.root.findAll(n => n.props.testID === 'rename-message' && typeof n.type !== 'string')[0])).toBe('The name could not be changed. Please try again.');
  });

  it('delete with an unreadable index is refused and explained; nothing is deleted', async () => {
    await createProfileVersion(profile());
    const onDeleted = jest.fn();
    const r = await render(<ProfileDetailsScreen profileId={ID} onBack={jest.fn()} onDeleted={onDeleted} />);
    await flush();
    await getStorageBackend().setItem('profiles:index', '{ broken');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
      const destructive = (buttons || []).find(b => b.style === 'destructive');
      if (destructive) destructive.onPress();
    });
    await press(r, 'delete-profile-button');
    await flush();
    expect(alert).toHaveBeenCalledWith('Could not delete', 'Your saved handwritings could not be read, so nothing was changed.');
    expect(await getStorageBackend().getItem(versionKey(ID, 1))).not.toBeNull();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});

describe('native modules (static source checks; not run on a device)', () => {
  const read = (m, f) => fs.readFileSync(path.join(__dirname, '..', 'modules', m, 'android', 'src', 'main', 'java', 'com', 'handwrite', m.split('-')[1], f), 'utf8');

  it('the photo copy catches any exception on its background thread', () => {
    const src = read('handwrite-samples', 'HandWriteSamplesModule.kt');
    const copy = src.slice(src.indexOf('private fun copyAndDescribe'), src.indexOf('/** EXIF orientation'));
    expect(copy).toMatch(/catch \(e: SecurityException\)/);
    expect(copy).toMatch(/catch \(e: IOException\)/);
    expect(copy).toMatch(/catch \(e: Exception\)/);
    expect(src).toMatch(/catch \(e: OutOfMemoryError\)/); // decodeForAnalysis
  });

  it('export reports out-of-memory for page drawing and file writing', () => {
    const src = read('handwrite-export', 'HandWriteExportModule.kt');
    expect((src.match(/catch \(e: OutOfMemoryError\)/g) || []).length).toBe(4);
  });
});
