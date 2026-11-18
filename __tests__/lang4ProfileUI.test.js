/**
 * Lang4 Phase 7 — personal handwriting in the app UI: create (five-sample
 * wizard → build → review → save), list (My Handwritings), select (New
 * Document, editor sheet), render, reopen, and the loading / missing /
 * unsupported-character / invalid states.
 *
 * Photos are SYNTHETIC pages (geometric pseudo-glyphs, no fonts, nobody's
 * handwriting) served by a stand-in for the native image module. Passing
 * shows the app flow works end to end — not that real handwriting is
 * learned well.
 */
import React from 'react';
import { clearAllMockStorages } from '@react-native-async-storage/async-storage';
import App from '../App';
import HandwritingStyleSelector from '../src/components/HandwritingStyleSelector';
import { setImageInput } from '../src/handwriting/learn/imageInput';
import { clearPersonalCache, loadPersonal } from '../src/handwriting/learn/personalStore';
import { createProfileVersion, listProfiles, readProfileVersion, versionKey } from '../src/handwriting/learn/profileRepository';
import { buildProfileVersion } from '../src/handwriting/learn/profileBuilder';
import { formatProfileRef } from '../src/handwriting/learn/profileSchema';
import { DEVANAGARI_ALPHABET, HINDI_SUGGESTED, LATIN_ALPHABET, LATIN_DIGITS_TEXT, MIXED_SUGGESTED, SAMPLE_SLOTS } from '../src/handwriting/learn/samplePrompts';
import { createDocument } from '../src/models/document';
import CreateHandwritingScreen from '../src/screens/CreateHandwritingScreen';
import EditorScreen from '../src/screens/EditorScreen';
import NewDocumentScreen from '../src/screens/NewDocumentScreen';
import ProfilesScreen from '../src/screens/ProfilesScreen';
import { getDocument, getStorageBackend, saveDocument, setStorageBackend } from '../src/storage/documentStorage';
import { act, byTestId, changeText, press, queryByTestId, render } from './helpers/render';
import { ALL_DEFAULT, PARAMS, SOURCES, syntheticForm } from './helpers/syntheticProfile';
import { toBase64 } from './helpers/syntheticRaster';
import { syntheticTextPage } from './helpers/syntheticText';
import { chooseType } from './helpers/wizard';

jest.setTimeout(240000);

beforeEach(() => {
  clearAllMockStorages();
  setStorageBackend(null);
  clearPersonalCache();
});
afterEach(() => setImageInput(null));

const outer = (r, id) => r.root.findAll(n => n.props.testID === id && typeof n.type !== 'string' && !(n.parent && n.parent.props.testID === id));
const textOf = node => {
  const out = [];
  const walk = n => {
    if (typeof n === 'string') out.push(n);
    else if (n && n.children) n.children.forEach(walk);
  };
  walk(node);
  return out.join('');
};
const flush = async (n = 3) => {
  for (let i = 0; i < n; i++) {
    await act(async () => {
      await new Promise(res => setTimeout(res, 0));
    });
  }
};
async function waitFor(check, limit = 4000) {
  for (let i = 0; i < limit; i++) {
    if (check()) return;
    await flush(1);
  }
  throw new Error('condition not reached');
}

// --- A small saved profile (synthetic, labelled) -----------------------------------------------

const line = (x0, y0, x1, y1) => [x0, y0, x0 + (x1 - x0) / 3, y0 + (y1 - y0) / 3, x0 + ((x1 - x0) * 2) / 3, y0 + ((y1 - y0) * 2) / 3, x1, y1];
function smallProfile({ id = 'p-test07-ab12', version = 1, name = 'Test hand', w = 0.6 } = {}) {
  const units = {
    h: { coverage: 'observed', forms: [syntheticForm(w, [line(0.1, 1.7, 0.1, 0), line(0.1, 0.8, 0.5, 0)])] },
    e: { coverage: 'observed', forms: [syntheticForm(0.55, [line(0.05, 0.5, 0.5, 0.5)])] },
    l: { coverage: 'observed', forms: [syntheticForm(0.25, [line(0.1, 1.7, 0.1, 0)])] },
    o: { coverage: 'observed', forms: [syntheticForm(0.6, [line(0.1, 0.5, 0.5, 0.5)])] },
    'क': { coverage: 'observed', forms: [syntheticForm(0.8, [line(0, 1, 0.8, 1), line(0.65, 1, 0.65, 0)])], anchors: { headlineLeft: [0, 1], headlineRight: [0.8, 1] } },
  };
  const r = buildProfileVersion({ id, version, name, now: 1760000000000 + version, profileCreatedAt: 1760000000000, synthetic: true, scripts: ['Latn', 'Deva'], sources: SOURCES, metrics: {}, params: PARAMS, paramSources: ALL_DEFAULT, units });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.profile;
}

// --- My Handwritings ----------------------------------------------------------------------

describe('My Handwritings', () => {
  it('shows loading, then the empty state', async () => {
    const r = await render(<ProfilesScreen onBack={jest.fn()} onCreate={jest.fn()} />);
    // (the list is read asynchronously; the first frame says it is loading)
    await flush();
    expect(queryByTestId(r, 'profiles-empty')).toBe(true);
    await press(r, 'profiles-create-button');
  });

  it('lists each saved handwriting with its version, coverage and status — damaged ones say why', async () => {
    await createProfileVersion(smallProfile());
    await createProfileVersion(smallProfile({ version: 2, w: 0.7 }));
    const other = smallProfile({ id: 'p-test07-cd34', name: 'Damaged hand' });
    await createProfileVersion(other);
    const broken = JSON.parse(JSON.stringify(other));
    broken.units.h.forms[0].strokes = [[0, 0, 0.1, 9, 0.2, 9, 0.3, 9]];
    await getStorageBackend().setItem(versionKey(other.id, 1), JSON.stringify(broken));
    const r = await render(<ProfilesScreen onBack={jest.fn()} />);
    await waitFor(() => queryByTestId(r, 'profile-card-p-test07-ab12'));
    const card = textOf(outer(r, 'profile-card-p-test07-ab12')[0]);
    expect(card).toMatch(/Test hand/);
    expect(card).toMatch(/English \+ Hindi · v2 · 2 versions · \d+ [A-Z][a-z]{2} \d{4}/); // type (from its scripts: no type recorded), version, created on
    expect(card).toMatch(/English · 4 characters, Hindi · 1 clusters/);
    expect(textOf(outer(r, 'profile-status-p-test07-ab12')[0])).toBe('Ready to use');
    expect(textOf(outer(r, 'profile-status-p-test07-cd34')[0])).toMatch(/^Can’t be used: The stored personal handwriting is damaged/);
  });
});

// --- Selection ------------------------------------------------------------------------------

describe('choosing a personal handwriting for a document', () => {
  it('New Document lists saved handwritings and stores the exact latest version', async () => {
    await createProfileVersion(smallProfile());
    await createProfileVersion(smallProfile({ version: 2 }));
    const onCreate = jest.fn();
    const r = await render(<NewDocumentScreen onBack={jest.fn()} onCreate={onCreate} />);
    await waitFor(() => queryByTestId(r, 'handwriting-personal-p-test07-ab12'));
    expect(textOf(outer(r, 'personal-handwriting-group')[0])).toBe('Your handwriting');
    // The built-in default is still selected until the user chooses.
    expect(byTestId(r, 'handwriting-reference', 'accessibilityState').props.accessibilityState.selected).toBe(true);
    await press(r, 'handwriting-personal-p-test07-ab12');
    expect(byTestId(r, 'handwriting-reference', 'accessibilityState').props.accessibilityState.selected).toBe(false);
    await press(r, 'create-document-button');
    expect(onCreate.mock.calls[0][0].handwritingStyle).toBe('personal:p-test07-ab12@2');
  });

  it('a document pinned to an older version keeps it, shown as its own selected card', async () => {
    await createProfileVersion(smallProfile());
    await createProfileVersion(smallProfile({ version: 2 }));
    const onChange = jest.fn();
    const v1 = formatProfileRef('p-test07-ab12', 1);
    const r = await render(<HandwritingStyleSelector value={v1} pen="blue" onChange={onChange} />);
    await waitFor(() => queryByTestId(r, 'handwriting-personal-p-test07-ab12'));
    await act(async () => {
      await loadPersonal(v1);
    });
    const pinned = byTestId(r, 'handwriting-personal-current', 'accessibilityState');
    expect(pinned.props.accessibilityState.selected).toBe(true);
    expect(pinned.props.accessibilityLabel).toMatch(/Test hand, version 1/);
    expect(byTestId(r, 'handwriting-personal-p-test07-ab12', 'accessibilityState').props.accessibilityState.selected).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a missing pinned handwriting is shown as unavailable, and Lang1 is not shown as chosen', async () => {
    const ref = 'personal:p-gone00-aa@3';
    const r = await render(<HandwritingStyleSelector value={ref} pen="blue" onChange={jest.fn()} />);
    await act(async () => {
      await loadPersonal(ref);
    });
    await flush();
    const pinned = byTestId(r, 'handwriting-personal-current', 'accessibilityState');
    expect(pinned.props.accessibilityState).toMatchObject({ selected: true, disabled: true });
    expect(textOf(pinned)).toMatch(/Can’t be used: This personal handwriting is not on this device/);
    expect(byTestId(r, 'handwriting-reference', 'accessibilityState').props.accessibilityState.selected).toBe(false);
  });
});

// --- Rendering in the editor --------------------------------------------------------------------

describe('documents in a personal handwriting', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });
  const open = doc => render(<EditorScreen initialDocument={doc} onClose={jest.fn()} />);

  it('renders with the saved profile and lists the characters it cannot write', async () => {
    const p = smallProfile();
    await createProfileVersion(p);
    const ref = formatProfileRef(p.id, 1);
    const r = await open({ ...createDocument({ handwritingStyle: ref }), content: 'hello world क' });
    await act(async () => {
      await loadPersonal(ref);
    });
    expect(outer(r, 'personal-handwriting-ink').length).toBeGreaterThan(0);
    expect(outer(r, 'handwriting-ink').filter(n => n.props.accessibilityLabel === undefined)).toHaveLength(0); // no built-in ink
    const banner = textOf(outer(r, 'personal-unsupported-banner')[0]);
    expect(banner).toMatch(/3 characters aren’t in your handwriting yet and appear as dashed boxes: w r d/);
    expect(outer(r, 'personal-missing-glyph')).toHaveLength(3); // w r d of “world” (o and l are learned)
  });

  it('a missing profile shows an explicit notice; the text is kept, never drawn in Lang1', async () => {
    const ref = 'personal:p-gone00-aa@1';
    const doc = { ...createDocument({ handwritingStyle: ref }), content: 'hello' };
    const r = await open(doc);
    await act(async () => {
      await loadPersonal(ref);
    });
    expect(textOf(outer(r, 'personal-handwriting-banner-error')[0])).toMatch(/not on this device.*Your text is kept; it is not shown in another handwriting/);
    expect(outer(r, 'personal-handwriting-error').length).toBeGreaterThan(0);
    expect(outer(r, 'personal-handwriting-ink')).toHaveLength(0);
  });

  it('an invalid stored version is reported as damaged', async () => {
    const p = smallProfile();
    await createProfileVersion(p);
    const broken = JSON.parse(JSON.stringify(p));
    broken.units.h.forms[0].strokes = [[0, 0, 0.1, 9, 0.2, 9, 0.3, 9]];
    await getStorageBackend().setItem(versionKey(p.id, 1), JSON.stringify(broken));
    const ref = formatProfileRef(p.id, 1);
    const r = await open({ ...createDocument({ handwritingStyle: ref }), content: 'hello' });
    await act(async () => {
      await loadPersonal(ref);
    });
    expect(textOf(outer(r, 'personal-handwriting-banner-error')[0])).toMatch(/damaged/);
  });

  it('a saved document reopens with the same exact version', async () => {
    const p = smallProfile();
    await createProfileVersion(p);
    const ref = formatProfileRef(p.id, 1);
    const saved = await saveDocument({ ...createDocument({ handwritingStyle: ref }), content: 'hello' });
    await createProfileVersion(smallProfile({ version: 2, w: 0.9 }));
    expect((await getDocument(saved.id)).handwritingStyle).toBe(ref);
    const r = await render(<EditorScreen documentId={saved.id} onClose={jest.fn()} />);
    await act(async () => {
      await loadPersonal(ref);
    });
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    expect(outer(r, 'personal-handwriting-ink').length).toBeGreaterThan(0);
    expect((await readProfileVersion(p.id, 1)).profile).toEqual(p); // version 1 untouched
  });

  it('built-in documents look exactly as before: no personal banner, built-in ink', async () => {
    const r = await open({ ...createDocument(), content: 'hello' });
    expect(queryByTestId(r, 'personal-handwriting-banner-loading')).toBe(false);
    expect(queryByTestId(r, 'personal-handwriting-banner-error')).toBe(false);
    expect(queryByTestId(r, 'personal-unsupported-banner')).toBe(false);
    expect(outer(r, 'handwriting-ink').length).toBeGreaterThan(0);
  });
});

// --- Create → build → save, in the wizard (synthetic photos) -----------------------------------

function fakeNativeInput(pages) {
  const queue = [...pages];
  return {
    pickImage: jest.fn(async () => {
      const next = queue.shift();
      return next ? next.picked : null;
    }),
    decodeForAnalysis: jest.fn(async uri => {
      const p = pages.find(x => x.picked.uri === uri);
      return { width: p.raster.width, height: p.raster.height, encoding: 'gray8-base64', data: toBase64(p.raster.data), sourceWidth: p.raster.width * 2, sourceHeight: p.raster.height * 2, orientation: 1, orientationApplied: true, decodeMillis: 5 };
    }),
    releaseImage: jest.fn(async () => {}),
    clearTemporaryImages: jest.fn(async () => 0),
  };
}
function photo(slot, text, o = {}) {
  const lines = text.split('\n').length;
  const { raster } = syntheticTextPage(text, { width: 1400, xHeight: 26, stroke: 3, top: 104, lineGap: 104, marginX: 50, height: 104 * (lines + 1) + 40, ...o });
  // The photo as the picker reports it (a normal camera photo); decoding serves the synthetic page.
  return { raster, picked: { uri: `file:///cache/handwrite-samples/s${slot}-${o.jitter || 'd'}.png`, mime: 'image/png', width: 3000, height: 4000, bytes: 2000000 + slot, orientation: 1 } };
}
// Phase 23: every photo shows its type's page. English + Hindi: photo 4 Everyday Hindi, photo 5 English and Hindi together.
const FREE_HINDI = HINDI_SUGGESTED;
const FREE_ENGLISH = MIXED_SUGGESTED;
function photos(o) {
  return [photo(1, LATIN_ALPHABET, o), photo(2, DEVANAGARI_ALPHABET, o), photo(3, LATIN_DIGITS_TEXT, o), photo(4, FREE_HINDI, o), photo(5, FREE_ENGLISH, o)];
}
async function fillWizard(r) {
  for (const s of SAMPLE_SLOTS) {
    await press(r, `sample-pick-${s.slot}`);
  }
  await waitFor(() => SAMPLE_SLOTS.every(s => queryByTestId(r, `sample-quality-${s.slot}`) && /checked/.test(textOf(outer(r, `sample-quality-${s.slot}`)[0]))));
  await press(r, 'analyze-photos-button');
  await waitFor(() => queryByTestId(r, 'review-step'));
}

describe('creating a handwriting in the wizard', () => {
  it('builds, shows coverage and rejections, saves only a passing profile, and lists it', async () => {
    setImageInput(fakeNativeInput(photos({ jitter: 0.04 })));
    const onSaved = jest.fn();
    const r = await render(<CreateHandwritingScreen onBack={jest.fn()} onSaved={onSaved} />);
    await chooseType(r);
    await fillWizard(r);
    expect(textOf(outer(r, 'build-status')[0])).toBe('Your handwriting is ready to save.');
    for (const id of ['latin-lowercase', 'latin-uppercase', 'devanagari-consonants', 'devanagari-prompt']) expect(textOf(outer(r, `requirement-${id}`)[0])).toMatch(/^✓/);
    expect(textOf(outer(r, 'coverage-Deva-devaPrompt')[0])).toMatch(/Hindi alphabet sample: \d+ of 75 learned · missing/);
    expect(textOf(outer(r, 'contribution-2')[0])).toMatch(/Sample 2: \d+ of 75 letters used · not used: .*marks unclear/);
    await press(r, 'review-continue');
    await changeText(r, 'profile-name-input', 'Anu’s handwriting');
    await press(r, 'save-handwriting-button');
    await waitFor(() => onSaved.mock.calls.length > 0);
    const ref = onSaved.mock.calls[0][0];
    expect(ref).toMatch(/^personal:p-[a-z0-9-]+@1$/);
    const stored = (await listProfiles())[0];
    expect(stored).toMatchObject({ name: 'Anu’s handwriting', versions: [1] });
    const profile = (await readProfileVersion(stored.id, 1)).profile;
    expect(profile.name).toBe('Anu’s handwriting');
    expect(profile.sources.map(s => s.slot)).toEqual([1, 2, 3, 4, 5]);
    expect(JSON.stringify(profile)).not.toMatch(/file:\/\/|base64/); // no photos or paths kept
    // It appears in My Handwritings, ready to use.
    const list = await render(<ProfilesScreen onBack={jest.fn()} />);
    await waitFor(() => queryByTestId(list, `profile-card-${stored.id}`));
    expect(textOf(outer(list, `profile-status-${stored.id}`)[0])).toBe('Ready to use');
  });

  it('explains why an unsteady set is not enough and does not let it be saved', async () => {
    setImageInput(fakeNativeInput(photos({})));
    const r = await render(<CreateHandwritingScreen onBack={jest.fn()} onSaved={jest.fn()} />);
    await chooseType(r);
    await fillWizard(r);
    expect(textOf(outer(r, 'build-status')[0])).toMatch(/Not enough clear writing/);
    expect(textOf(outer(r, 'requirement-latin-uppercase')[0])).toMatch(/^✗ capitals A–Z: \d+ of 26 capitals A–Z observed/);
    expect(textOf(outer(r, 'review-banner-title')[0])).toBe('Not enough characters yet');
    expect(byTestId(r, 'review-continue', 'accessibilityState').props.accessibilityState.disabled).toBe(true);
    expect(queryByTestId(r, 'profile-name-input')).toBe(false);
    expect(queryByTestId(r, 'save-handwriting-button')).toBe(false);
    expect(await listProfiles()).toEqual([]);
    await press(r, 'back-to-samples-button');
    expect(queryByTestId(r, 'photo-grid')).toBe(true);
  });
});

// --- The whole app ------------------------------------------------------------------------------

describe('in the app', () => {
  it('Home → My Handwritings lists the saved handwriting and opens the wizard', async () => {
    await createProfileVersion(smallProfile());
    const r = await render(<App />);
    // Tests run as a development build, where Lang4 is enabled (dev/flags.js).
    expect(queryByTestId(r, 'my-handwritings-button')).toBe(true);
    await press(r, 'my-handwritings-button');
    await waitFor(() => queryByTestId(r, 'profile-card-p-test07-ab12'));
    await press(r, 'profiles-create-button');
    expect(queryByTestId(r, 'create-handwriting-screen')).toBe(true);
  });
});
