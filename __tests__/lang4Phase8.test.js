/**
 * Lang4 Phase 8 — profile management (rename, delete, details) and the
 * image-pipeline fixes found on real reference pages.
 *
 * Every image here is SYNTHETIC (geometric pseudo-glyphs; realistic photo
 * conditions modelled on what the real pages showed). Results on the real
 * reference images are produced only by the opt-in
 * __tests__/realSamples.optin.test.js (REAL_SAMPLES=1) and reported
 * separately — nothing here is evidence of real-handwriting accuracy.
 */
import React from 'react';
import { Alert } from 'react-native';
import { clearAllMockStorages } from '@react-native-async-storage/async-storage';
import { analyzeSample } from '../src/handwriting/learn/analyzeSample';
import { clearPersonalCache, loadPersonal } from '../src/handwriting/learn/personalStore';
import { dropBorderObjects, suppressFaintBands } from '../src/handwriting/learn/preprocess';
import { buildProfileVersion } from '../src/handwriting/learn/profileBuilder';
import { createProfileVersion, listProfiles, readProfileVersion, versionKey } from '../src/handwriting/learn/profileRepository';
import { formatProfileRef, validateProfile } from '../src/handwriting/learn/profileSchema';
import { unanchoredWords } from '../src/handwriting/learn/alignSample';
import { prepareExpectedText } from '../src/handwriting/learn/expectedText';
import { createDocument } from '../src/models/document';
import ProfileDetailsScreen, { deletionMessage } from '../src/screens/ProfileDetailsScreen';
import ProfilesScreen, { deletionNotice } from '../src/screens/ProfilesScreen';
import { getStorageBackend, saveDocument, setStorageBackend } from '../src/storage/documentStorage';
import { act, changeText, press, queryByTestId, render } from './helpers/render';
import { ALL_DEFAULT, PARAMS, SOURCES, syntheticForm } from './helpers/syntheticProfile';
import { downscale, keystone, sideways } from './helpers/photoConditions';
import { syntheticTextPage } from './helpers/syntheticText';

jest.setTimeout(120000);

beforeEach(() => {
  clearAllMockStorages();
  setStorageBackend(null);
  clearPersonalCache();
});
afterEach(() => jest.restoreAllMocks());

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
const flush = async (n = 4) => {
  for (let i = 0; i < n; i++) {
    await act(async () => {
      await new Promise(res => setTimeout(res, 0));
    });
  }
};

// --- A small saved profile (synthetic) -----------------------------------------------------

const ID = 'p-test08-ab12';
const line = (x0, y0, x1, y1) => [x0, y0, x0 + (x1 - x0) / 3, y0 + (y1 - y0) / 3, x0 + ((x1 - x0) * 2) / 3, y0 + ((y1 - y0) * 2) / 3, x1, y1];
function profile({ version = 1, name = 'Test hand', evidence } = {}) {
  const units = {
    h: { coverage: 'observed', forms: [syntheticForm(0.6, [line(0.1, 1.7, 0.1, 0), line(0.1, 0.8, 0.5, 0)])] },
    e: { coverage: 'observed', forms: [syntheticForm(0.55, [line(0.05, 0.5, 0.5, 0.5)])] },
    z: { coverage: 'missing', forms: [] },
    q: { coverage: 'missing', forms: [] },
    'क': { coverage: 'observed', forms: [syntheticForm(0.8, [line(0, 1, 0.8, 1), line(0.65, 1, 0.65, 0)])] },
    'कु': { coverage: 'missing', forms: [] },
  };
  const r = buildProfileVersion({
    id: ID,
    version,
    name,
    now: 1760000000000 + version,
    profileCreatedAt: 1760000000000,
    synthetic: true,
    scripts: ['Latn', 'Deva'],
    sources: SOURCES,
    metrics: {},
    params: PARAMS,
    paramSources: ALL_DEFAULT,
    units,
    confidence: { overall: { score: 0.61, basis: 'test' }, imageQuality: { score: 0.9, basis: 'test' } },
    ...(evidence ? { evidence } : null),
  });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.profile;
}
const EVIDENCE = {
  samples: [
    { slot: 1, considered: 85, extracted: 81, used: 80, rejected: { 'extraction:not-aligned': 4, 'low-confidence': 1 } },
    { slot: 2, considered: 75, extracted: 68, used: 68, rejected: { 'extraction:marks-inconsistent': 7 } },
  ],
  requirements: [{ id: 'latin-lowercase', description: 'lowercase a–z', required: 0.9, actual: 1, pass: true }],
};

// --- Details --------------------------------------------------------------------------------

describe('profile details', () => {
  it('shows each version: coverage with missing characters, confidence, samples, documents using it', async () => {
    await createProfileVersion(profile({ evidence: EVIDENCE }));
    await createProfileVersion(profile({ version: 2 }));
    await saveDocument({ ...createDocument({ handwritingStyle: formatProfileRef(ID, 1) }), content: 'he' });
    const r = await render(<ProfileDetailsScreen profileId={ID} onBack={jest.fn()} />);
    await flush();
    // The latest version is shown first; v1 is used by one document.
    expect(textOf(outer(r, 'version-1')[0])).toBe('Version 1 · 1 doc');
    expect(textOf(outer(r, 'version-2')[0])).toBe('Version 2');
    expect(textOf(outer(r, 'details-samples-unrecorded')[0])).toMatch(/Not recorded for this version/);
    await press(r, 'version-1');
    expect(textOf(outer(r, 'coverage-Latn')[0])).toMatch(/2 learned · 2 missing/);
    expect(textOf(outer(r, 'missing-Latn')[0])).toMatch(/Missing: z q — shown as dashed boxes, never replaced by another handwriting/);
    expect(textOf(outer(r, 'missing-Deva')[0])).toMatch(/Missing: कु/);
    expect(textOf(outer(r, 'confidence-overall')[0])).toMatch(/0\.61/);
    expect(textOf(outer(r, 'details-used')[0])).toMatch(/1 saved document$/);
    expect(textOf(outer(r, 'details-sample-1')[0])).toBe('Sample 1: 80 of 85 letters used · not used: 4 not located clearly, 1 too uncertain');
    expect(textOf(outer(r, 'details-sample-2')[0])).toMatch(/7 marks unclear/);
  });

  it('says so when a version cannot be used, and when the profile is gone', async () => {
    const p = profile();
    await createProfileVersion(p);
    const broken = JSON.parse(JSON.stringify(p));
    broken.units.h.forms[0].strokes = [[0, 0, 0.1, 9, 0.2, 9, 0.3, 9]];
    await getStorageBackend().setItem(versionKey(ID, 1), JSON.stringify(broken));
    const r = await render(<ProfileDetailsScreen profileId={ID} onBack={jest.fn()} />);
    await flush();
    expect(textOf(outer(r, 'version-unusable')[0])).toMatch(/Version 1 can’t be used: The stored personal handwriting is damaged/);
    const gone = await render(<ProfileDetailsScreen profileId="p-gone00-aa" onBack={jest.fn()} />);
    await flush();
    expect(queryByTestId(gone, 'profile-details-missing')).toBe(true);
  });
});

// --- Rename ----------------------------------------------------------------------------------

describe('rename', () => {
  it('changes only the name shown in the app; stored versions stay byte-for-byte the same', async () => {
    await createProfileVersion(profile());
    const before = await getStorageBackend().getItem(versionKey(ID, 1));
    const r = await render(<ProfileDetailsScreen profileId={ID} onBack={jest.fn()} />);
    await flush();
    await changeText(r, 'rename-input', 'My neat hand');
    await press(r, 'rename-button');
    await flush();
    expect(textOf(outer(r, 'rename-message')[0])).toMatch(/Name changed\. The saved versions are unchanged\./);
    expect((await listProfiles())[0].name).toBe('My neat hand');
    expect(await getStorageBackend().getItem(versionKey(ID, 1))).toBe(before);
    expect((await readProfileVersion(ID, 1)).profile.name).toBe('Test hand');
    await changeText(r, 'rename-input', '   ');
    await press(r, 'rename-button');
    await flush();
    expect(textOf(outer(r, 'rename-message')[0])).toMatch(/1–60 characters/);
    expect((await listProfiles())[0].name).toBe('My neat hand');
  });
});

// --- Delete -------------------------------------------------------------------------------------

describe('delete', () => {
  const confirmWith = choice => jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
    const b = buttons.find(x => x.text === choice);
    if (b && b.onPress) b.onPress();
  });

  it('asks first; cancelling changes nothing', async () => {
    await createProfileVersion(profile());
    const alert = confirmWith('Cancel');
    const onDeleted = jest.fn();
    const r = await render(<ProfileDetailsScreen profileId={ID} onBack={jest.fn()} onDeleted={onDeleted} />);
    await flush();
    await press(r, 'delete-profile-button');
    expect(alert.mock.calls[0][0]).toBe('Delete “Test hand”?');
    expect(alert.mock.calls[0][1]).toBe('All its versions will be removed from this device. This cannot be undone.');
    expect(onDeleted).not.toHaveBeenCalled();
    expect((await listProfiles()).map(p => p.id)).toEqual([ID]);
  });

  it('never removes a version a saved document uses: it is kept, the document still opens in it', async () => {
    await createProfileVersion(profile());
    await createProfileVersion(profile({ version: 2 }));
    const doc = await saveDocument({ ...createDocument({ handwritingStyle: formatProfileRef(ID, 1) }), content: 'he' });
    const alert = confirmWith('Delete');
    const onDeleted = jest.fn();
    const r = await render(<ProfileDetailsScreen profileId={ID} onBack={jest.fn()} onDeleted={onDeleted} />);
    await flush();
    await press(r, 'delete-profile-button');
    await flush();
    expect(alert.mock.calls[0][1]).toBe('Version 2 will be removed from this device. Version 1 is used by 1 saved document; it will be kept so it still opens in this handwriting, but hidden from My Handwritings. This cannot be undone.');
    expect(onDeleted).toHaveBeenCalledWith({ status: 'ok', removed: [2], retained: [1] });
    expect(await listProfiles()).toEqual([]); // hidden
    expect((await readProfileVersion(ID, 2)).status).toBe('missing-version');
    const resolved = await loadPersonal(doc.handwritingStyle);
    expect(resolved.status).toBe('ok'); // the document's exact version still renders
    expect(resolved.profile.version).toBe(1);
    expect(deletionNotice(onDeleted.mock.calls[0][0])).toBe('Handwriting removed from this list. Version 1 is kept because saved documents use it.');
  });

  it('removes everything when no document uses it, and says so on the list', async () => {
    await createProfileVersion(profile());
    confirmWith('Delete');
    const onDeleted = jest.fn();
    const r = await render(<ProfileDetailsScreen profileId={ID} onBack={jest.fn()} onDeleted={onDeleted} />);
    await flush();
    await press(r, 'delete-profile-button');
    await flush();
    expect(onDeleted).toHaveBeenCalledWith({ status: 'ok', removed: [1], retained: [] });
    expect(await getStorageBackend().getItem(versionKey(ID, 1))).toBeNull();
    const list = await render(<ProfilesScreen onBack={jest.fn()} notice={deletionNotice(onDeleted.mock.calls[0][0])} />);
    await flush();
    expect(textOf(outer(list, 'profiles-notice')[0])).toBe('Handwriting deleted.');
    expect(queryByTestId(list, 'profiles-empty')).toBe(true);
  });

  it('explains every combination of used and unused versions', () => {
    expect(deletionMessage('x', [1, 2, 3], { 1: 2, 2: 0, 3: 0 })).toBe('Versions 2, 3 will be removed from this device. Version 1 is used by 2 saved documents; it will be kept so they still open in this handwriting, but hidden from My Handwritings. This cannot be undone.');
    expect(deletionMessage('x', [1], { 1: 1 })).toMatch(/^Version 1 is used by 1 saved document; it will be kept/);
  });
});

// --- Evidence stored with a version ---------------------------------------------------------------

describe('build evidence', () => {
  it('is stored with the version (counts and codes only) and validated', () => {
    const p = profile({ evidence: EVIDENCE });
    expect(p.evidence).toEqual(EVIDENCE);
    expect(validateProfile({ ...p, evidence: { samples: [{ slot: 1 }], requirements: [] } }).errors.join(' ')).toMatch(/evidence\.samples\[0\]/);
    expect(validateProfile({ ...p, evidence: 'x' }).ok).toBe(false);
    const older = { ...p }; // versions made before Phase 8 have none
    delete older.evidence;
    expect(validateProfile(older).ok).toBe(true);
  });
});

// --- Pipeline fixes (unit level) ------------------------------------------------------------------

describe('faint printed lines and background objects', () => {
  const W = 120;
  const H = 40;
  const grid = () => ({ mask: new Uint8Array(W * H), gray: new Uint8Array(W * H).fill(255) });
  const put = (g, x0, x1, y0, y1, v) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      g.mask[y * W + x] = 1;
      g.gray[y * W + x] = v;
    }
  };

  it('clears a pale rule between letters, keeps dark strokes crossing it and dark lines', () => {
    const g = grid();
    put(g, 0, W - 1, 30, 30, 172); // a pale rule across the page
    put(g, 20, 22, 10, 31, 40); // a stroke standing on the rule (dark)
    put(g, 60, 62, 10, 31, 40);
    put(g, 0, W - 1, 36, 36, 45); // a dark underline
    const { mask, bands } = suppressFaintBands(g.mask, g.gray, W, H);
    expect(bands.some(b => b.cleared > 0)).toBe(true);
    expect(mask[30 * W + 40]).toBe(0); // rule between the strokes: gone
    expect(mask[30 * W + 21]).toBe(1); // the stroke crossing it: kept
    expect(mask[30 * W + 19]).toBe(1); // the column beside the stroke: kept (soft edge)
    expect(mask[36 * W + 40]).toBe(1); // the dark underline: untouched
  });

  it('leaves writing alone when its ink is as light as the line (pencil)', () => {
    const g = grid();
    put(g, 0, W - 1, 30, 30, 172);
    put(g, 20, 22, 10, 31, 160);
    put(g, 60, 62, 10, 31, 165);
    expect(suppressFaintBands(g.mask, g.gray, W, H).removedPixels).toBe(0);
  });

  it('drops border-touching or very tall objects, keeps writing and a wide underline', () => {
    const w = 200;
    const h = 200;
    const m = new Uint8Array(w * h);
    const fill = (x0, x1, y0, y1) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m[y * w + x] = 1;
    };
    fill(0, 199, 185, 199); // desk edge along the bottom, touching the border
    fill(190, 192, 10, 120); // the paper's own edge: tall
    fill(20, 30, 20, 40); // a letter
    fill(20, 150, 50, 51); // a long underline (wide, not touching the border)
    fill(0, 6, 60, 75); // a letter cut by the left border (small)
    const { mask, objects } = dropBorderObjects(m, w, h);
    expect(objects).toBe(2);
    expect(mask[195 * w + 100]).toBe(0);
    expect(mask[60 * w + 191]).toBe(0);
    expect(mask[30 * w + 25]).toBe(1);
    expect(mask[50 * w + 100]).toBe(1);
    expect(mask[70 * w + 3]).toBe(1);
  });
});

describe('anchored word matches', () => {
  it('doubts a run of matches with a gap or merge on both sides; trusts runs pinned to a line end', () => {
    const exp = prepareExpectedText('a b c d e f');
    const det = [0, 1, 2, 3, 4].map(j => ({ line: 0, bbox: [j * 10, 0, 5, 5] }));
    const ok = (expected, j) => ({ expected, op: 'match', detected: [j], confidence: { score: 0.9 } });
    // b c d matched after a missing a, before an uncertain e: could be shifted.
    const wa = { words: [{ expected: 0, op: 'missing', detected: [] }, ok(1, 0), ok(2, 1), ok(3, 2), { ...ok(4, 3), confidence: { score: 0.3 } }, ok(5, 4)] };
    expect([...unanchoredWords(wa, exp, det)].sort()).toEqual([1, 2, 3]);
    // The same run starting the line (a ↔ the first region) is pinned.
    const wa2 = { words: [ok(0, 0), ok(1, 1), ok(2, 2), { ...ok(3, 3), confidence: { score: 0.3 } }, ok(4, 4), { expected: 5, op: 'missing', detected: [] }] };
    expect([...unanchoredWords(wa2, exp, det)]).toEqual([4]);
  });
});

// --- Realistic photo conditions (SYNTHETIC) vs ground truth -----------------------------------

const LATIN = 'The quick brown fox jumps over the lazy dog.\nPack my box with five dozen liquor jugs!';
const HINDI = 'क्षमा विद्या ज्ञान प्रकाश\nकितने लोग सीता किताब';
const page = (text, o = {}) => syntheticTextPage(text, { width: 1250, height: 104 * 3 + 40, top: 104, lineGap: 104, marginX: 80, xHeight: 26, stroke: 3, ...o });
async function scored(text, o = {}, post = null) {
  const p = page(text, o);
  const t = post ? post(p.raster) : { raster: p.raster, mapX: x => x };
  const r = await analyzeSample(t.raster, { slot: 1, knownText: text, yieldFn: async () => {}, extract: true });
  let good = 0;
  let wrong = 0;
  if (r.alignment && r.alignment.observations && t.mapX) {
    for (const u of r.alignment.observations.units.filter(x => x.state === 'aligned')) {
      const tr = p.truth.units.find(x => x.start === u.source.start);
      const y = u.bbox[1] + u.bbox[3] / 2;
      const x0 = t.mapX(tr.x0, y);
      const x1 = t.mapX(tr.x1, y);
      const c = u.bbox[0] + u.bbox[2] / 2;
      if (c >= x0 && c <= x1 && u.bbox[0] >= x0 - 5 && u.bbox[0] + u.bbox[2] <= x1 + 5) good++;
      else wrong++;
    }
  }
  return { r, good, wrong, expected: p.truth.units.length };
}

describe('realistic photo conditions (synthetic, against ground truth)', () => {
  it('a notebook page with pale rules under the writing: rules cleared, letters aligned, none wrong', async () => {
    const s = await scored(LATIN, { notebook: true, noise: 6, blur: 1 });
    expect(s.wrong).toBe(0);
    expect(s.good).toBeGreaterThanOrEqual(0.9 * s.expected);
    expect(s.r.rules.faintPixels).toBeGreaterThan(0);
    const hindi = await scored(HINDI, { notebook: true, noise: 6, blur: 1 });
    expect(hindi.wrong).toBe(0);
    expect(hindi.good).toBeGreaterThanOrEqual(0.85 * hindi.expected);
  });

  it('objects around the page are removed and do not count as uneven lighting', async () => {
    const s = await scored(LATIN, { clutter: true });
    expect(s.r.rules.backgroundObjects).toBeGreaterThan(0);
    expect(s.r.quality.issues.map(i => i.code)).not.toContain('uneven-lighting');
    expect(s.wrong).toBe(0);
    expect(s.good).toBeGreaterThanOrEqual(0.9 * s.expected);
  });

  it('perspective lowers coverage but never produces a wrong box', async () => {
    for (const k of [0.08, 0.15]) {
      const s = await scored(LATIN, {}, r => keystone(r, k));
      expect([k, s.wrong]).toEqual([k, 0]);
      expect(s.good).toBeGreaterThan(0.6 * s.expected);
    }
  });

  it('a photo too small to trace, or turned sideways, yields nothing — never a guessed glyph', async () => {
    const small = await scored(LATIN, {}, r => downscale(r, 0.4));
    expect(small.r.quality.usable).toBe(false);
    expect(small.r.extraction.summary.extracted).toBe(0);
    const turned = await scored(LATIN, {}, r => sideways(r));
    expect(turned.r.alignment.summary.units.aligned).toBe(0);
    expect(turned.r.extraction.summary.extracted).toBe(0);
  });
});
