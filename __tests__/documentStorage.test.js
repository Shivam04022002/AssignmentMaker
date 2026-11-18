import { clearAllMockStorages } from '@react-native-async-storage/async-storage';
import { createDocument } from '../src/models/document';
import {
  deleteDocument,
  getDocument,
  listDocuments,
  saveDocument,
  setStorageBackend,
} from '../src/storage/documentStorage';

beforeEach(() => {
  clearAllMockStorages();
  setStorageBackend(null); // re-create from the (fresh) mock
});

describe('save / load', () => {
  it('saves a document and loads it back with all fields', async () => {
    const doc = createDocument({
      pageType: 'blank',
      pen: 'black',
      handwritingStyle: 'fast',
    });
    const saved = await saveDocument(
      { ...doc, title: 'Leave letter', content: 'Dear Sir,\n\nThank you.' },
      { now: doc.createdAt + 5000 },
    );

    const loaded = await getDocument(doc.id);
    expect(loaded).toEqual(saved);
    expect(loaded).toMatchObject({
      id: doc.id,
      title: 'Leave letter',
      pageType: 'blank',
      pen: 'black',
      handwritingStyle: 'fast',
      content: 'Dear Sir,\n\nThank you.',
      createdAt: doc.createdAt,
      updatedAt: doc.createdAt + 5000,
    });
  });

  it('lists saved documents, most recently edited first', async () => {
    const a = await saveDocument(createDocument({ title: 'A' }), { now: 1000 });
    const b = await saveDocument(createDocument({ title: 'B' }), { now: 2000 });
    expect((await listDocuments()).map(d => d.id)).toEqual([b.id, a.id]);

    await saveDocument({ ...a, content: 'edited' }, { now: 3000 });
    expect((await listDocuments()).map(d => d.id)).toEqual([a.id, b.id]);
  });

  it('returns an empty list when nothing is saved', async () => {
    expect(await listDocuments()).toEqual([]);
    expect(await getDocument('missing')).toBeNull();
  });

  it('handles concurrent saves without losing documents', async () => {
    const docs = Array.from({ length: 10 }, (_, i) =>
      createDocument({ title: `D${i}` }),
    );
    await Promise.all(docs.map(d => saveDocument(d)));
    expect(await listDocuments()).toHaveLength(10);
  });

  it('deletes documents', async () => {
    const doc = await saveDocument(createDocument());
    await deleteDocument(doc.id);
    expect(await getDocument(doc.id)).toBeNull();
    expect(await listDocuments()).toEqual([]);
  });

  it('survives corrupted entries', async () => {
    const store = new Map([['documents:index', '{not json']]);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    setStorageBackend({
      getItem: async k => store.get(k) ?? null,
      setItem: async (k, v) => store.set(k, v),
      removeItem: async k => store.delete(k),
    });
    expect(await listDocuments()).toEqual([]);
    warn.mockRestore();
  });
});

describe('editing saved content', () => {
  it('updates an existing document in place', async () => {
    const original = await saveDocument(
      { ...createDocument(), content: 'First draft' },
      { now: 1000 },
    );
    const reopened = await getDocument(original.id);
    await saveDocument(
      {
        ...reopened,
        content: `${reopened.content}\nSecond line`,
        pen: 'black',
      },
      { now: 2000 },
    );

    const docs = await listDocuments();
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      id: original.id,
      content: 'First draft\nSecond line',
      pen: 'black',
      createdAt: original.createdAt,
      updatedAt: 2000,
    });
  });
});
