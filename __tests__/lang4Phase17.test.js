/**
 * Lang4 Phase 17 — validation-readiness fixes.
 *
 *   1. versions of a deleted handwriting that no saved document uses any
 *      more are removed — only then, and never while any document or the
 *      profile index cannot be read
 *   2. built-in handwritings (Lang1–3) say when they cannot write Hindi;
 *      their drawing is unchanged
 *   3. Android: no INTERNET permission in release, kept for debug (Metro)
 *
 * Profiles here are synthetic fixtures (straight-line forms).
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { Alert } from 'react-native';
import { clearAllMockStorages } from '@react-native-async-storage/async-storage';
import { builtInHindiGaps } from '../src/components/BuiltInScriptNotice';
import { cardTestId } from '../src/components/HandwritingStyleSelector';
import { getHandwritingStyles, isPersonalStyleId } from '../src/data/handwritingStyles';
import { buildProfileVersion } from '../src/handwriting/learn/profileBuilder';
import { clearPersonalCache } from '../src/handwriting/learn/personalStore';
import { createProfileVersion, listProfiles, listVersions, purgeOrphanedVersions, requestProfileDeletion, versionKey } from '../src/handwriting/learn/profileRepository';
import { formatProfileRef } from '../src/handwriting/learn/profileSchema';
import { createDocument } from '../src/models/document';
import EditorScreen from '../src/screens/EditorScreen';
import HomeScreen from '../src/screens/HomeScreen';
import { deleteDocument, getStorageBackend, listDocumentsChecked, saveDocument, setStorageBackend } from '../src/storage/documentStorage';
import { act, press, queryByTestId, render, renderedHandwriting } from './helpers/render';
import { ALL_DEFAULT, PARAMS, SOURCES, syntheticForm } from './helpers/syntheticProfile';

jest.setTimeout(120000);

beforeEach(() => {
  clearAllMockStorages();
  setStorageBackend(null);
  clearPersonalCache();
});

const ID = 'p-test17-ab';
function profile(version = 1) {
  const line = (x0, y0, x1, y1) => [x0, y0, x0 + (x1 - x0) / 3, y0 + (y1 - y0) / 3, x0 + ((x1 - x0) * 2) / 3, y0 + ((y1 - y0) * 2) / 3, x1, y1];
  const units = {
    h: { coverage: 'observed', forms: [syntheticForm(0.6, [line(0.1, 1.7, 0.1, 0), line(0.1, 0.8, 0.5, 0)])] },
    i: { coverage: 'observed', forms: [syntheticForm(0.3, [line(0.1, 0, 0.1, 1)])] },
  };
  const r = buildProfileVersion({ id: ID, version, name: 'Test hand', now: 1760000000000 + version, profileCreatedAt: 1760000000000, synthetic: true, scripts: ['Latn'], sources: SOURCES, metrics: {}, params: PARAMS, paramSources: ALL_DEFAULT, units });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.profile;
}
const ref = v => formatProfileRef(ID, v);
const stored = async v => (await getStorageBackend().getItem(versionKey(ID, v))) !== null;
async function deletedProfileUsedBy(docs) {
  await createProfileVersion(profile(1));
  await createProfileVersion(profile(2));
  for (const d of docs) await saveDocument(d);
  return requestProfileDeletion(ID);
}
const flush = async (n = 5) => {
  for (let i = 0; i < n; i++) {
    await act(async () => {
      await new Promise(res => setTimeout(res, 0));
    });
  }
};

// --- 1. Orphaned versions ------------------------------------------------------------------------

describe('versions of a deleted handwriting', () => {
  it('stay while a saved document uses them; go once none does', async () => {
    const doc = { ...createDocument({ handwritingStyle: ref(1) }), content: 'hi' };
    expect(await deletedProfileUsedBy([doc])).toEqual({ status: 'ok', removed: [2], retained: [1] });
    expect(await purgeOrphanedVersions()).toEqual({ status: 'ok', removed: {} });
    expect(await stored(1)).toBe(true);
    await deleteDocument(doc.id);
    expect(await purgeOrphanedVersions()).toEqual({ status: 'ok', removed: { [ID]: [1] } });
    expect(await stored(1)).toBe(false);
    expect(await listVersions(ID)).toEqual([]);
    expect(await purgeOrphanedVersions()).toEqual({ status: 'ok', removed: {} }); // idempotent
  });

  it('a document switched to another handwriting releases its version; others keep theirs', async () => {
    const a = { ...createDocument({ handwritingStyle: ref(1) }), content: 'a' };
    const b = { ...createDocument({ handwritingStyle: ref(2) }), content: 'b' };
    expect(await deletedProfileUsedBy([a, b])).toEqual({ status: 'ok', removed: [], retained: [1, 2] });
    await saveDocument({ ...a, handwritingStyle: getHandwritingStyles()[0].id });
    expect(await purgeOrphanedVersions()).toEqual({ status: 'ok', removed: { [ID]: [1] } });
    expect(await stored(2)).toBe(true);
    expect(await listVersions(ID)).toEqual([2]);
  });

  it('versions of a handwriting that was not deleted are never removed, used or not', async () => {
    await createProfileVersion(profile(1));
    await createProfileVersion(profile(2));
    expect(await purgeOrphanedVersions()).toEqual({ status: 'ok', removed: {} });
    expect(await stored(1)).toBe(true);
    expect(await stored(2)).toBe(true);
    expect((await listProfiles()).map(p => p.id)).toEqual([ID]);
  });

  it('nothing is removed while a saved document cannot be read (it might use the version)', async () => {
    const doc = { ...createDocument({ handwritingStyle: ref(1) }), content: 'hi' };
    await createProfileVersion(profile(1));
    await createProfileVersion(profile(2));
    await saveDocument(doc);
    await getStorageBackend().setItem(`document:${doc.id}`, '{ not json');
    expect((await listDocumentsChecked()).complete).toBe(false);
    // Deleting hides the handwriting but keeps every version.
    expect(await requestProfileDeletion(ID)).toEqual({ status: 'ok', removed: [], retained: [1, 2], incomplete: true });
    expect(await listProfiles()).toEqual([]);
    expect(await purgeOrphanedVersions()).toEqual({ status: 'skipped', reason: 'a saved document cannot be read' });
    expect(await stored(1)).toBe(true);
    expect(await stored(2)).toBe(true);
  });

  it('nothing is rewritten or removed while the profile index cannot be read', async () => {
    await createProfileVersion(profile(1));
    await getStorageBackend().setItem('profiles:index', '{ broken');
    expect(await purgeOrphanedVersions()).toEqual({ status: 'skipped', reason: 'the profile index cannot be read' });
    expect(await requestProfileDeletion(ID)).toEqual({ status: 'unreadable-index', id: ID });
    expect(await getStorageBackend().getItem('profiles:index')).toBe('{ broken');
    expect(await stored(1)).toBe(true);
  });

  describe('in the app', () => {
    const accept = () =>
      jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
        const destructive = (buttons || []).find(b => b.style === 'destructive');
        if (destructive) destructive.onPress();
      });
    afterEach(() => jest.restoreAllMocks());

    it('deleting the last document that used it (editor) removes the version', async () => {
      const doc = { ...createDocument({ handwritingStyle: ref(1) }), content: 'hi' };
      await deletedProfileUsedBy([doc]);
      accept();
      const r = await render(<EditorScreen documentId={doc.id} onClose={jest.fn()} />);
      await flush();
      await press(r, 'menu-button');
      await press(r, 'delete-document-button');
      await flush(10);
      expect(await stored(1)).toBe(false);
    });

    it('deleting it from Home removes the version', async () => {
      const doc = { ...createDocument({ handwritingStyle: ref(1) }), content: 'hi', title: 'Old' };
      await deletedProfileUsedBy([doc]);
      accept();
      const r = await render(<HomeScreen onNewDocument={jest.fn()} onOpenDocument={jest.fn()} />);
      await flush();
      const card = r.root.findAll(n => n.props.testID === `document-card-${doc.id}` && n.props.onLongPress)[0];
      await act(async () => {
        card.props.onLongPress();
      });
      await flush(10);
      expect(await stored(1)).toBe(false);
    });

    it('saving the document in another handwriting removes the version it no longer uses', async () => {
      const doc = { ...createDocument({ handwritingStyle: ref(1) }), content: 'hi' };
      await deletedProfileUsedBy([doc]);
      const builtIn = getHandwritingStyles()[0].id;
      const r = await render(<EditorScreen documentId={doc.id} onClose={jest.fn()} />);
      await flush();
      await press(r, 'menu-button');
      const card = r.root.findAll(n => n.props.testID === cardTestId(builtIn) && n.props.onPress)[0];
      await act(async () => {
        card.props.onPress();
      });
      await press(r, 'save-button');
      await flush(10);
      expect(await stored(1)).toBe(false);
    });

    it('Home tidies versions left by deletions made before this fix', async () => {
      await deletedProfileUsedBy([]); // nothing uses them: removed at once
      await createProfileVersion({ ...profile(1), id: 'p-old000-aa' });
      const doc = { ...createDocument({ handwritingStyle: 'personal:p-old000-aa@1' }), content: 'x' };
      await saveDocument(doc);
      expect((await requestProfileDeletion('p-old000-aa')).retained).toEqual([1]);
      await deleteDocument(doc.id); // as before Phase 17: nothing tidied
      expect(await getStorageBackend().getItem(versionKey('p-old000-aa', 1))).not.toBeNull();
      await render(<HomeScreen onNewDocument={jest.fn()} onOpenDocument={jest.fn()} />);
      await flush(10);
      expect(await getStorageBackend().getItem(versionKey('p-old000-aa', 1))).toBeNull();
    });
  });
});

// --- 2. Hindi in the built-in handwritings --------------------------------------------------------

describe('built-in handwritings and Hindi', () => {
  const builtIns = getHandwritingStyles().filter(s => !isPersonalStyleId(s.id));

  it('every built-in style lacks Devanagari, and the gaps are counted per character', () => {
    builtIns.forEach(s => {
      expect(builtInHindiGaps('Hello नमस्ते दुनिया', s.id)).toEqual({ count: 12, distinct: ['न', 'म', 'स', '्', 'त', 'े', 'द', 'ु', 'ि', 'य', 'ा'] });
      expect(builtInHindiGaps('Hello world, 42!', s.id)).toEqual({ count: 0, distinct: [] });
    });
    expect(builtInHindiGaps('नमस्ते', 'personal:p-test17-ab@1')).toEqual({ count: 0, distinct: [] });
  });

  it.each(builtIns.map(s => s.id))('%s: the editor says Hindi is drawn as plain marks; the text and drawing are unchanged', async styleId => {
    const content = 'Hello नमस्ते';
    const r = await render(<EditorScreen initialDocument={{ ...createDocument({ handwritingStyle: styleId }), content }} onClose={jest.fn()} />);
    await flush();
    const banner = r.root.findAll(n => n.props.testID === 'builtin-hindi-banner' && typeof n.type !== 'string')[0];
    const words = [];
    const walk = n => (typeof n === 'string' ? words.push(n) : n && n.children && n.children.forEach(walk));
    walk(banner);
    expect(words.join('')).toMatch(/has no Hindi letters: 6 Hindi characters are drawn as plain marks \(न म स ् त े\)\. Your text is kept unchanged\./);
    expect(renderedHandwriting(r)).toBe(content);
  });

  it('no notice for English-only text in a built-in style', async () => {
    const r = await render(<EditorScreen initialDocument={{ ...createDocument(), content: 'Hello world' }} onClose={jest.fn()} />);
    await flush();
    expect(queryByTestId(r, 'builtin-hindi-banner')).toBe(false);
  });
});

// --- 3. Android permissions -----------------------------------------------------------------------

describe('Android network permission', () => {
  const read = p => fs.readFileSync(path.join(__dirname, '..', 'android', 'app', 'src', p, 'AndroidManifest.xml'), 'utf8');
  const declares = xml => /<uses-permission\s+android:name="android\.permission\.INTERNET"/.test(xml);

  it('the release (main) manifest declares no INTERNET permission; debug builds keep it for Metro', () => {
    expect(declares(read('main'))).toBe(false);
    expect(declares(read('debug'))).toBe(true);
  });

  it('the native modules ask for no network permission', () => {
    for (const m of ['handwrite-export', 'handwrite-samples']) {
      const xml = fs.readFileSync(path.join(__dirname, '..', 'modules', m, 'android', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
      expect(/<uses-permission/.test(xml)).toBe(false);
    }
  });
});
