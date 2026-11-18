/**
 * Lang4 Phase 1 — personal handwriting profile model and engine contracts.
 * Profiles here are SYNTHETIC TEST DATA (helpers/syntheticProfile.js), not
 * learned handwriting. No image analysis exists yet (PIPELINE_STAGES).
 */
import { clearAllMockStorages } from '@react-native-async-storage/async-storage';
import { getHandwritingStyles } from '../src/data/handwritingStyles';
import { GLYPH_FORMS, GLYPH_SETS, GLYPHS_LANG3 } from '../src/handwriting/glyphs';
import { bandOf, CONFIDENCE_DIMENSIONS, DEFAULT_BANDS, summariseCoverage, unmeasuredConfidence, validateConfidence } from '../src/handwriting/learn/confidence';
import { knownTextFor, PIPELINE_STAGES, validateQualityResult, validateSampleMetadata, validateSegment, validateUnitObservation } from '../src/handwriting/learn/contracts';
import { buildProfileVersion, coverageSummary, nextVersion } from '../src/handwriting/learn/profileBuilder';
import {
  createProfileVersion,
  listProfiles,
  listVersions,
  readProfileVersion,
  referencedVersions,
  renameProfile,
  requestProfileDeletion,
  resolveProfileRef,
  versionKey,
} from '../src/handwriting/learn/profileRepository';
import {
  deserializeProfile,
  formatProfileRef,
  generateProfileId,
  isPersonalRef,
  migrateProfile,
  parseProfileRef,
  PERSONAL_KIND,
  PROFILE_SCHEMA_VERSION,
  serializeProfile,
  validateProfile,
} from '../src/handwriting/learn/profileSchema';
import { rendererGlyphs, resolveText, unsupportedRanges } from '../src/handwriting/learn/rendererAdapter';
import { SAMPLE_SLOTS } from '../src/handwriting/learn/samplePrompts';
import { drawingOrder, lookupKey, POSITION, ROLE, snapRangeToUnits, splitUnits, unitAt, UNIT_KIND } from '../src/handwriting/learn/textUnits';
import { createDocument, normalizeDocument } from '../src/models/document';
import { getDocument, getStorageBackend, saveDocument, setStorageBackend } from '../src/storage/documentStorage';
import { syntheticForm, syntheticProfile } from './helpers/syntheticProfile';

const texts = units => units.map(u => u.text);
const clone = v => JSON.parse(JSON.stringify(v));

beforeEach(() => {
  clearAllMockStorages();
  setStorageBackend(null);
});

// --- Unicode units ---------------------------------------------------------------

describe('rendering units (Latin graphemes, Devanagari clusters)', () => {
  it('keeps the original text exactly, with contiguous ranges', () => {
    for (const t of ['Hello, world!', 'नमस्ते दुनिया', 'Mixed हिंदी text 2026।', 'café क्‍ष ि', '', ' \t\n']) {
      const u = splitUnits(t);
      expect(texts(u).join('')).toBe(t);
      u.forEach((x, i) => {
        expect(t.slice(x.start, x.end)).toBe(x.text);
        if (i) expect(x.start).toBe(u[i - 1].end);
      });
    }
  });

  it('does not use code points as the unit: accents stay with their letter', () => {
    const u = splitUnits('café!');
    expect(texts(u)).toEqual(['c', 'a', 'f', 'é', '!']);
    expect(u[3]).toMatchObject({ script: 'Latn', kind: UNIT_KIND.LETTER, key: 'é' });
    expect(u[3].components.map(c => c.role)).toEqual([ROLE.BASE, ROLE.MARK]);
    expect(lookupKey('é')).toBe(lookupKey('é'));
  });

  it('splits Hindi into orthographic clusters', () => {
    expect(texts(splitUnits('नमस्ते'))).toEqual(['न', 'म', 'स्ते']);
    expect(texts(splitUnits('हिंदी'))).toEqual(['हिं', 'दी']);
    expect(texts(splitUnits('क्षत्रिय'))).toEqual(['क्ष', 'त्रि', 'य']);
    expect(texts(splitUnits('ज्ञान'))).toEqual(['ज्ञा', 'न']);
    expect(texts(splitUnits('अंक'))).toEqual(['अं', 'क']);
    splitUnits('नमस्ते').forEach(u => expect([u.script, u.kind]).toEqual(['Deva', UNIT_KIND.CLUSTER]));
  });

  it('describes matras by position, and draws the pre-base ि first', () => {
    const cases = { 'कि': POSITION.PRE, 'का': POSITION.POST, 'की': POSITION.POST, 'कु': POSITION.BELOW, 'कृ': POSITION.BELOW, 'के': POSITION.ABOVE, 'कौ': POSITION.POST };
    for (const [t, pos] of Object.entries(cases)) {
      const [u] = splitUnits(t);
      expect([t, u.components[1].role, u.components[1].position]).toEqual([t, ROLE.MATRA, pos]);
    }
    const [ki] = splitUnits('कि');
    expect(drawingOrder(ki).map(c => c.char)).toEqual(['ि', 'क']);
    expect(ki.text).toBe('कि'); // the stored text keeps its typed order
  });

  it('handles conjuncts, halant, nukta, anusvara/chandrabindu/visarga and joiners', () => {
    const [ksha] = splitUnits('क्ष');
    expect(ksha).toMatchObject({ conjunct: true, consonants: 2, halant: false });
    expect(ksha.components.map(c => c.role)).toEqual([ROLE.BASE, ROLE.VIRAMA, ROLE.BASE]);
    expect(splitUnits('क्')[0]).toMatchObject({ halant: true, conjunct: false });
    expect(texts(splitUnits('क्‍ष'))).toEqual(['क्‍ष']); // ZWJ inside the conjunct
    const [z1] = splitUnits('ज़'); // precomposed U+095B
    const [z2] = splitUnits('ज़'); // decomposed
    expect(z1.key).toBe(z2.key);
    expect(z2.components.map(c => c.role)).toEqual([ROLE.BASE, ROLE.NUKTA]);
    for (const t of ['कं', 'कँ', 'कः']) {
      const [u] = splitUnits(t);
      expect([t, u.components[1].role]).toEqual([t, ROLE.MODIFIER]);
    }
  });

  it('distinguishes independent vowels, digits, danda and orphan signs', () => {
    expect(splitUnits('इ')[0]).toMatchObject({ kind: UNIT_KIND.CLUSTER, consonants: 0 });
    expect(splitUnits('२०२६').map(u => u.kind)).toEqual(Array(4).fill(UNIT_KIND.DIGIT));
    expect(splitUnits('।')[0]).toMatchObject({ kind: UNIT_KIND.PUNCTUATION, script: 'Deva' });
    expect(splitUnits(' ि')[1]).toMatchObject({ kind: UNIT_KIND.ORPHAN_MARK, script: 'Deva' });
    expect(splitUnits('́a')[0].kind).toBe(UNIT_KIND.ORPHAN_MARK);
    expect(splitUnits('漢')[0]).toMatchObject({ kind: UNIT_KIND.OTHER, script: 'Zzzz' });
    expect(splitUnits('₹')[0].kind).toBe(UNIT_KIND.SYMBOL);
  });

  it('maps offsets to units and snaps ranges to whole clusters', () => {
    const t = 'आज हिंदी';
    const u = splitUnits(t);
    const hiStart = t.indexOf('हिं');
    expect(unitAt(u, hiStart + 1).text).toBe('हिं'); // inside the cluster
    expect(snapRangeToUnits(u, hiStart + 1, hiStart + 2)).toEqual({ start: hiStart, end: hiStart + 'हिं'.length });
    expect(unitAt(u, t.length)).toBeNull();
  });

  it('keeps surrogate pairs and emoji sequences whole', () => {
    expect(texts(splitUnits('a👍🏽b'))).toEqual(['a', '👍🏽', 'b']);
  });

  it('splits every prescribed prompt into learnable units only', () => {
    for (const s of SAMPLE_SLOTS.filter(x => x.prompt)) {
      const bad = splitUnits(s.prompt).filter(u => [UNIT_KIND.OTHER, UNIT_KIND.ORPHAN_MARK].includes(u.kind));
      expect([s.category, bad.map(u => u.text)]).toEqual([s.category, []]);
    }
    const deva = splitUnits(SAMPLE_SLOTS[1].prompt).filter(u => u.kind === UNIT_KIND.CLUSTER);
    expect(deva.filter(u => u.conjunct).map(u => u.text)).toEqual(['क्ष', 'त्र', 'ज्ञ', 'श्र', 'द्ध', 'प्र', 'क्र', 'स्त']);
    expect(deva.some(u => u.halant)).toBe(true);
  });

  it('does not depend on Intl.Segmenter', () => {
    const saved = Intl.Segmenter;
    delete Intl.Segmenter;
    try {
      expect(texts(splitUnits('नमस्ते'))).toEqual(['न', 'म', 'स्ते']);
    } finally {
      Intl.Segmenter = saved;
    }
  });
});

// --- Schema ------------------------------------------------------------------------

describe('profile schema and validation', () => {
  it('builds a valid, serialisable synthetic profile (clearly labelled)', () => {
    const p = syntheticProfile();
    expect(p).toMatchObject({ kind: PERSONAL_KIND, schemaVersion: PROFILE_SCHEMA_VERSION, synthetic: true, version: 1 });
    expect(validateProfile(p)).toEqual({ ok: true, errors: [] });
    const back = deserializeProfile(serializeProfile(p));
    expect(back).toEqual({ status: 'ok', profile: p });
    // Units carry derived script/kind, the renderer's form format, and no pixels.
    expect(p.units['कि']).toMatchObject({ script: 'Deva', kind: 'cluster', coverage: 'composite', composition: ['क'] });
    expect(Object.keys(p.units.l.forms[0]).sort()).toEqual(['confidence', 'method', 'observations', 'strokes', 'w', 'weight']);
    expect(p.limitations.length).toBe(9); // every engine-default parameter is disclosed
  });

  const invalid = (mutate, message) => {
    const p = clone(syntheticProfile());
    mutate(p);
    const r = validateProfile(p);
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toMatch(message);
  };

  it.each([
    ['wrong kind', p => (p.kind = 'preset'), /kind/],
    ['bad id', p => (p.id = 'Lang1'), /id:/],
    ['version 0', p => (p.version = 0), /version/],
    ['empty name', p => (p.name = ' '), /name/],
    ['unknown script', p => (p.scripts = ['Latn', 'Arab']), /scripts/],
    ['key with two units', p => (p.units.ab = { ...p.units.l, text: 'ab' }), /exactly one rendering unit/],
    ['non-NFC key', p => (p.units['é'] = { ...p.units.l, text: 'é' }), /NFC/],
    ['space as a unit', p => (p.units[' '] = { ...p.units.l, text: ' ', script: 'Zyyy', kind: 'space' }), /cannot be learned/],
    ['wrong script', p => (p.units.l.script = 'Deva'), /script/],
    ['observed without forms', p => (p.units.l.forms = []), /needs a form/],
    ['missing with forms', p => (p.units['म'].forms = [p.units.l.forms[0]]), /has no forms/],
    ['composite of a non-observed unit', p => (p.units['कि'].composition = ['म']), /not an observed unit/],
    ['broken cubic chain', p => (p.units.l.forms[0].strokes = [[0, 0, 1]]), /cubic chain/],
    ['out-of-band geometry', p => (p.units.l.forms[0].strokes = [[0, 0, 0, 0, 0, 0, 0, 9]]), /outside the glyph band/],
    ['NaN geometry', p => (p.units.l.forms[0].strokes[0][1] = null), /finite/],
    ['synthetic geometry in a non-synthetic profile', p => delete p.synthetic, /synthetic geometry/],
    ['pixels in a source', p => (p.sources[0].base64 = 'AAAA'), /not stored in a profile/],
    ['file path in a source', p => (p.sources[0].uri = 'file:///x.jpg'), /not stored in a profile/],
    ['unknown confidence dimension', p => (p.confidence.vibes = null), /unknown confidence dimension/],
    ['score above 1', p => (p.confidence.overall = { score: 1.2, basis: 'x' }), /0 to 1/],
    ['score without basis', p => (p.confidence.overall = { score: 0.5 }), /basis/],
    ['param out of bounds', p => (p.params.slant = 80), /params.slant/],
    ['param source missing', p => delete p.paramSources.wordGap, /paramSources.wordGap/],
    ['unknown coverage state', p => (p.units.l.coverage = 'guessed'), /coverage/],
  ])('rejects %s', (_, mutate, message) => invalid(mutate, message));

  it('reports unsupported (newer) schemas, invalid JSON and missing migrations', () => {
    const p = syntheticProfile();
    expect(deserializeProfile(JSON.stringify({ ...p, schemaVersion: 99 }))).toMatchObject({ status: 'unsupported-schema', schemaVersion: 99 });
    expect(deserializeProfile('{not json')).toEqual({ status: 'invalid', errors: ['not valid JSON'] });
    expect(deserializeProfile(JSON.stringify({ ...p, schemaVersion: 0 }))).toMatchObject({ status: 'unsupported-schema' });
    // A registered migration brings an older record up to date, without touching the input.
    const old = { ...clone(p), schemaVersion: 0, title: p.name };
    delete old.name;
    const migrations = { 0: r => { const { title, ...rest } = r; return { ...rest, name: title }; } };
    const m = migrateProfile(old, migrations);
    expect(m.status).toBe('ok');
    expect(m.profile.name).toBe(p.name);
    expect(old.title).toBe(p.name);
    expect(deserializeProfile(JSON.stringify(old), migrations)).toEqual({ status: 'ok', profile: p });
  });

  it('formats and parses version-pinned references', () => {
    const id = generateProfileId(1760000000000);
    const ref = formatProfileRef(id, 3);
    expect(ref).toBe(`personal:${id}@3`);
    expect(parseProfileRef(ref)).toEqual({ id, version: 3 });
    for (const bad of ['personal:', 'personal:x@1', `personal:${id}`, `personal:${id}@0`, `personal:${id}@1.5`, 'reference_student', null]) {
      expect([bad, parseProfileRef(bad)]).toEqual([bad, null]);
    }
    expect(isPersonalRef('personal:anything')).toBe(true);
    expect(isPersonalRef('reference_student_lang3')).toBe(false);
    expect(() => formatProfileRef('bad', 1)).toThrow();
  });
});

// --- Confidence and coverage -------------------------------------------------------

describe('confidence and coverage contracts', () => {
  it('represents unmeasured dimensions as null, never as invented numbers', () => {
    const c = unmeasuredConfidence();
    expect(Object.keys(c)).toEqual(CONFIDENCE_DIMENSIONS);
    expect(Object.values(c).every(v => v === null)).toBe(true);
    expect(validateConfidence(c)).toEqual([]);
    expect(syntheticProfile().confidence).toEqual(c);
  });

  it('maps scores to configurable bands', () => {
    expect([0.95, 0.8, 0.79, 0.55, 0.54, 0.3, 0.29, null].map(s => bandOf(s))).toEqual(['high', 'high', 'medium', 'medium', 'low', 'low', 'unsupported', 'unsupported']);
    expect(bandOf(0.7, { ...DEFAULT_BANDS, high: 0.7 })).toBe('high');
  });

  it('summarises coverage per script and state', () => {
    const s = coverageSummary(syntheticProfile());
    expect(s.Latn).toMatchObject({ observed: 1, uncertain: 1 });
    expect(s.Deva).toMatchObject({ observed: 1, composite: 1, missing: 1 });
    expect(s.Zyyy).toMatchObject({ approximated: 1 });
    expect(summariseCoverage({})).toEqual({});
  });
});

// --- Builder and versions ------------------------------------------------------------

describe('immutable versions', () => {
  it('creates the next version without touching the previous one', () => {
    const v1 = syntheticProfile();
    const before = JSON.stringify(v1);
    const r = nextVersion(v1, { name: 'Renamed in v2', units: { ...v1.units, म: { coverage: 'observed', forms: [syntheticForm(0.8)] } } }, 1760000500000);
    expect(r.ok).toBe(true);
    expect(r.profile).toMatchObject({ id: v1.id, version: 2, profileCreatedAt: v1.profileCreatedAt, createdAt: 1760000500000 });
    expect(r.profile.units['म'].coverage).toBe('observed');
    expect(JSON.stringify(v1)).toBe(before);
  });

  it('refuses to build an invalid profile', () => {
    const r = buildProfileVersion({ id: 'p-test01-abc123', version: 1, name: 'x', scripts: ['Latn'], params: {}, paramSources: {}, units: {} });
    expect(r.ok).toBe(false);
    expect(r.profile).toBeNull();
  });
});

// --- Repository ----------------------------------------------------------------------

describe('profile repository (existing key-value store)', () => {
  it('stores, reads and lists immutable versions', async () => {
    const v1 = syntheticProfile();
    expect(await createProfileVersion(v1)).toEqual({ status: 'ok', ref: `personal:${v1.id}@1` });
    expect(await readProfileVersion(v1.id, 1)).toEqual({ status: 'ok', profile: v1 });
    const v2 = nextVersion(v1, { metrics: { slantDeg: { value: 4, unit: 'deg', samples: 12, method: 'synthetic' } } }).profile;
    expect((await createProfileVersion(v2)).status).toBe('ok');
    expect(await listVersions(v1.id)).toEqual([1, 2]);
    expect((await readProfileVersion(v1.id, 1)).profile).toEqual(v1); // v1 unchanged
    const list = await listProfiles();
    expect(list.map(p => [p.id, p.latest, p.name])).toEqual([[v1.id, 2, v1.name]]);
  });

  it('rejects version collisions and gaps', async () => {
    const v1 = syntheticProfile();
    await createProfileVersion(v1);
    expect(await createProfileVersion(v1)).toEqual({ status: 'version-conflict', expected: 2, got: 1 });
    expect(await createProfileVersion({ ...syntheticProfile(), version: 3 })).toMatchObject({ status: 'version-conflict', expected: 2 });
    // A stray record under the next key (e.g. an interrupted write) is never overwritten.
    const other = syntheticProfile({ id: 'p-test02-zzz999' });
    await getStorageBackend().setItem(versionKey(other.id, 1), 'stray');
    expect(await createProfileVersion(other)).toMatchObject({ status: 'version-exists' });
    expect(await getStorageBackend().getItem(versionKey(other.id, 1))).toBe('stray');
    expect((await createProfileVersion({ ...v1, kind: 'x' })).status).toBe('invalid');
  });

  it('renames the display name only', async () => {
    const v1 = syntheticProfile();
    await createProfileVersion(v1);
    expect(await renameProfile(v1.id, '  My Handwriting  ')).toEqual({ status: 'ok' });
    expect((await listProfiles())[0].name).toBe('My Handwriting');
    expect((await readProfileVersion(v1.id, 1)).profile.name).toBe(v1.name);
    expect((await renameProfile(v1.id, '')).status).toBe('invalid');
    expect((await renameProfile('p-nope00-xx', 'A')).status).toBe('missing-profile');
  });

  it('reports missing, unreadable and mismatched records instead of substituting', async () => {
    const v1 = syntheticProfile();
    expect(await readProfileVersion(v1.id, 1)).toMatchObject({ status: 'missing-profile' });
    await createProfileVersion(v1);
    expect(await readProfileVersion(v1.id, 5)).toMatchObject({ status: 'missing-version' });
    const store = getStorageBackend();
    await store.setItem(versionKey(v1.id, 1), '{broken');
    expect(await readProfileVersion(v1.id, 1)).toMatchObject({ status: 'invalid' });
    await store.setItem(versionKey(v1.id, 1), JSON.stringify({ ...v1, schemaVersion: 7 }));
    expect(await readProfileVersion(v1.id, 1)).toMatchObject({ status: 'unsupported-schema' });
    await store.setItem(versionKey(v1.id, 1), JSON.stringify({ ...v1, version: 2 }));
    expect(await readProfileVersion(v1.id, 1)).toMatchObject({ status: 'invalid', errors: ['stored record does not match its key'] });
  });

  it('resolves document references without falling back to another profile', async () => {
    const v1 = syntheticProfile();
    await createProfileVersion(v1);
    expect(await resolveProfileRef('reference_student_lang3')).toEqual({ status: 'builtin', ref: 'reference_student_lang3' });
    expect(await resolveProfileRef('personal:garbage')).toEqual({ status: 'invalid-ref', ref: 'personal:garbage' });
    expect(await resolveProfileRef(`personal:${v1.id}@1`)).toMatchObject({ status: 'ok', profile: v1 });
    expect(await resolveProfileRef(`personal:${v1.id}@2`)).toMatchObject({ status: 'missing-version' });
    expect(await resolveProfileRef('personal:p-gone00-aa@1')).toMatchObject({ status: 'missing-profile' });
  });

  it('keeps versions still used by documents when a profile is deleted', async () => {
    const v1 = syntheticProfile();
    await createProfileVersion(v1);
    await createProfileVersion(nextVersion(v1, {}).profile);
    await saveDocument({ ...createDocument(), title: 'Uses v1', handwritingStyle: `personal:${v1.id}@1` });
    expect(referencedVersions([{ handwritingStyle: `personal:${v1.id}@1` }, { handwritingStyle: 'reference_student' }])).toEqual({ [v1.id]: new Set([1]) });
    expect(await requestProfileDeletion(v1.id)).toEqual({ status: 'ok', removed: [2], retained: [1] });
    expect(await listProfiles()).toEqual([]); // hidden from the gallery
    expect((await readProfileVersion(v1.id, 1)).status).toBe('ok'); // the document still opens
    expect((await readProfileVersion(v1.id, 2)).status).toBe('missing-version');
    expect((await createProfileVersion(nextVersion(v1, {}).profile)).status).toBe('profile-deleted');
  });

  it('removes a profile completely when no document uses it', async () => {
    const v1 = syntheticProfile();
    await createProfileVersion(v1);
    expect(await requestProfileDeletion(v1.id, { documents: [] })).toEqual({ status: 'ok', removed: [1], retained: [] });
    expect(await getStorageBackend().getItem(versionKey(v1.id, 1))).toBeNull();
    expect(await readProfileVersion(v1.id, 1)).toMatchObject({ status: 'missing-profile' });
    expect((await requestProfileDeletion(v1.id)).status).toBe('missing-profile');
  });
});

// --- Documents -----------------------------------------------------------------------

describe('document references', () => {
  it('pins a personal profile version and keeps it through save and reopen', async () => {
    const ref = 'personal:p-test01-abc123@2';
    const saved = await saveDocument({ ...createDocument(), handwritingStyle: ref });
    expect(saved.handwritingStyle).toBe(ref);
    expect((await getDocument(saved.id)).handwritingStyle).toBe(ref);
  });

  it('never silently switches an unresolved personal reference to Lang1', () => {
    expect(normalizeDocument({ handwritingStyle: 'personal:p-missing-00@9' }).handwritingStyle).toBe('personal:p-missing-00@9');
    expect(normalizeDocument({ handwritingStyle: 'personal:malformed' }).handwritingStyle).toBe('personal:malformed');
  });

  it('leaves built-in handwriting defaults and fallbacks unchanged', () => {
    expect(createDocument().handwritingStyle).toBe('reference_student');
    expect(normalizeDocument({ handwritingStyle: 'reference_student_lang3' }).handwritingStyle).toBe('reference_student_lang3');
    expect(normalizeDocument({ handwritingStyle: 'cursive' }).handwritingStyle).toBe('cursive');
    expect(normalizeDocument({ handwritingStyle: 'no-such-style' }).handwritingStyle).toBe('reference_student');
  });
});

// --- Renderer adapter ----------------------------------------------------------------

describe('renderer adapter (conversion only; not registered yet)', () => {
  it('produces the renderer glyph format from drawable units only', () => {
    const { table, forms } = rendererGlyphs(syntheticProfile());
    expect(Object.keys(table).sort()).toEqual(['7', 'l', 'o', 'क', 'कि'].sort());
    // Same shape as the built-in glyph tables and Lang3 forms.
    expect(Object.keys(table.l).sort()).toEqual(Object.keys(GLYPHS_LANG3.l).sort());
    expect(Object.keys(forms.l[1]).sort()).toEqual(Object.keys(GLYPH_FORMS.lang3.a[1]).sort());
    expect(table['म']).toBeUndefined();
  });

  it('resolves text to units and reports unsupported ranges against the original text', () => {
    const p = syntheticProfile();
    const text = 'lo कि म 漢 ि x';
    const r = resolveText(p, text);
    expect(r.map(u => [u.text, u.status, u.reason || u.coverage || ''])).toEqual([
      ['l', 'glyph', 'observed'],
      ['o', 'glyph', 'uncertain'],
      [' ', 'space', ''],
      ['कि', 'glyph', 'composite'],
      [' ', 'space', ''],
      ['म', 'unsupported', 'not-learned'],
      [' ', 'space', ''],
      ['漢', 'unsupported', 'unsupported-script'],
      [' ', 'space', ''],
      ['ि', 'unsupported', 'orphan-mark'],
      [' ', 'space', ''],
      ['x', 'unsupported', 'missing'],
    ]);
    const ranges = unsupportedRanges(r);
    ranges.forEach(g => expect(text.slice(g.start, g.end)).toBe(g.text));
    expect(unsupportedRanges(resolveText(p, 'xyz')).map(g => [g.text, g.reasons])).toEqual([['xyz', ['missing']]]);
  });
});

// --- Contracts ------------------------------------------------------------------------

describe('engine contracts', () => {
  it('validates sample metadata and keeps pixels and paths out', () => {
    const ok = { slot: 1, category: 'latin-alphabet', mime: 'image/jpeg', width: 4000, height: 3000, bytes: 3000000, transcription: { mode: 'prescribed' }, retained: false };
    expect(validateSampleMetadata(ok)).toEqual([]);
    expect(validateSampleMetadata({ ...ok, mime: 'image/gif' }).join()).toMatch(/mime/);
    expect(validateSampleMetadata({ ...ok, slot: 9 }).join()).toMatch(/slot/);
    expect(validateSampleMetadata({ ...ok, pixels: [] }).join()).toMatch(/not stored/);
    expect(validateSampleMetadata({ ...ok, transcription: { mode: 'user' } }).join()).toMatch(/typed transcription/);
  });

  it('knows which text each sample is aligned to (no OCR)', () => {
    expect(knownTextFor({ slot: 1, transcription: { mode: 'prescribed' } })).toBe(SAMPLE_SLOTS[0].prompt);
    expect(knownTextFor({ slot: 4, transcription: { mode: 'user', text: 'नमस्ते' } })).toBe('नमस्ते');
    expect(knownTextFor({ slot: 5, transcription: { mode: 'none' } })).toBeNull();
    expect(SAMPLE_SLOTS.map(s => s.transcription)).toEqual(['prescribed', 'prescribed', 'prescribed', 'optional', 'optional']);
  });

  it('validates stage results', () => {
    expect(validateQualityResult({ slot: 1, checks: { sharpness: { value: 12, threshold: 40, pass: false } }, issues: [{ code: 'blurry', message: 'The photo is blurry.', advice: 'Hold the phone steady.' }], usable: false, score: null })).toEqual([]);
    expect(validateQualityResult({ slot: 1, checks: {}, issues: [{ code: 'meh' }], usable: true }).join()).toMatch(/issues/);
    expect(validateSegment({ slot: 2, kind: 'uncertain', bbox: [0, 0, 10, 5], confidence: null })).toEqual([]);
    expect(validateSegment({ slot: 2, kind: 'line', bbox: [0, 0, -1, 5] }).join()).toMatch(/bbox/);
    expect(validateUnitObservation({ slot: 2, bbox: [1, 2, 3, 4], status: 'aligned', key: 'कि', source: { start: 0, end: 2 }, alignmentCost: 0.2 })).toEqual([]);
    expect(validateUnitObservation({ slot: 2, bbox: [1, 2, 3, 4], status: 'unmatched' })).toEqual([]);
    expect(validateUnitObservation({ slot: 2, bbox: [1, 2, 3, 4], status: 'aligned' }).join()).toMatch(/key/);
  });

  // Updated in Phase 4: stages built in Phases 2–4 are now real. The check
  // stays strict — exactly those are marked implemented (each naming its
  // module), and every later stage is still false.
  it('marks only the stages that exist as implemented', () => {
    const analysis = PIPELINE_STAGES.filter(s => s.phase >= 2);
    expect(analysis.length).toBeGreaterThan(10);
    const built = ['ReferenceImageIntake', 'PageDetector', 'ImageQualityAnalyzer', 'ImagePreprocessor', 'WritingRegionDetector', 'LineAndCharacterSegmenter', 'ScriptAndCharacterAnalyzer', 'OrientationChecker', 'GlyphGeometryExtractor', 'StrokeGeometryReconstructor', 'GlyphVariantBuilder', 'HandwritingMetricsAnalyzer', 'ProfileConfidenceAnalyzer', 'MissingCharacterResolver'];
    expect(analysis.filter(s => s.implemented).map(s => s.name)).toEqual(built);
    analysis.filter(s => s.implemented).forEach(s => expect(s.module).toBeTruthy());
    // Phases 5–6 build extraction and profile generation; preview and the
    // report generator (later phases) are not built.
    const notYet = analysis.filter(s => s.phase >= 5 && !built.includes(s.name));
    expect(notYet.map(s => s.name)).toEqual(['PersonalProfilePreview', 'VisualReportGenerator']);
    expect(notYet.every(s => s.implemented === false)).toBe(true);
    expect(PIPELINE_STAGES.find(s => s.name === 'GlyphGeometryExtractor').implemented).toBe(true);
  });
});

// --- Isolation -----------------------------------------------------------------------

describe('isolation from Lang1, Lang2 and Lang3', () => {
  it('registers no personal profile or glyph set in Phase 1', () => {
    expect(getHandwritingStyles().map(s => s.id)).toEqual(['reference_student', 'reference_student_lang2', 'reference_student_lang3']);
    expect(Object.keys(GLYPH_SETS)).toEqual(['lang1', 'lang2', 'lang3']);
    expect(Object.keys(GLYPH_FORMS)).toEqual(['lang3']);
  });
});
