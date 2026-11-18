/**
 * Lang4 Phase 6 — personal handwriting profile generation.
 *
 * Unit tests use hand-made extraction records (exact control of shapes and
 * scores); integration tests run the real pipeline on SYNTHETIC renderings
 * of the prescribed prompts (geometric pseudo-glyphs, not handwriting).
 * Passing here shows the builder behaves as specified on synthetic input —
 * not that it produces good profiles from real handwriting.
 */
import { clearAllMockStorages } from '@react-native-async-storage/async-storage';
import { analyzeSample } from '../src/handwriting/learn/analyzeSample';
import { PIPELINE_STAGES } from '../src/handwriting/learn/contracts';
import {
  ENGINE_DEFAULT_PARAMS,
  generatePersonalProfile,
  headlineAnchors,
  PROFILE_THRESHOLDS,
  REQUIRED_SETS,
  REQUIREMENTS,
  shapeDistance,
} from '../src/handwriting/learn/profileGeneration';
import { createProfileVersion, listProfiles, readProfileVersion, renameProfile, resolveProfileRef, versionKey } from '../src/handwriting/learn/profileRepository';
import { formatProfileRef, PARAM_BOUNDS, validateProfile } from '../src/handwriting/learn/profileSchema';
import { headlineJoins, rendererGlyphs, resolveText, UNSUPPORTED_REASONS } from '../src/handwriting/learn/rendererAdapter';
import { DEVANAGARI_ALPHABET, LATIN_ALPHABET, LATIN_DIGITS_TEXT } from '../src/handwriting/learn/samplePrompts';
import { splitUnits } from '../src/handwriting/learn/textUnits';
import { createDocument } from '../src/models/document';
import { getDocument, getStorageBackend, saveDocument, setStorageBackend } from '../src/storage/documentStorage';
import { getHandwritingStyles } from '../src/data/handwritingStyles';
import { GLYPH_SETS } from '../src/handwriting/glyphs';
import { s as stroke } from '../src/handwriting/strokeBuilder';
import { syntheticTextPage } from './helpers/syntheticText';

beforeEach(() => {
  clearAllMockStorages();
  setStorageBackend(null);
});

const ID = 'p-test06-ab12';
const meta = (slot, category = 'latin-alphabet') => ({ slot, category, mime: 'image/png', width: 1000, height: 600, bytes: 60000, transcription: { mode: 'prescribed' }, retained: false });

// --- Hand-made extraction records ----------------------------------------------------------

const SHAPES = {
  stem: () => [stroke().M(0.1, 1).L(0.1, 0).pts],
  stemTall: () => [stroke().M(0.1, 1.65).L(0.1, 0).pts],
  bowl: () => [stroke().arc(0.4, 0.5, 0.34, 0.5, 90, 450).pts],
  arch: () => [stroke().M(0.1, 0).L(0.1, 1).Q(0.4, 1.1, 0.6, 0.8).L(0.6, 0).pts],
  // A slightly different bowl (a variant, not a conflict).
  bowlWide: () => [stroke().arc(0.5, 0.5, 0.48, 0.45, 90, 450).pts],
  bar: () => [stroke().M(0, 0.5).L(0.8, 0.5).pts],
  // Something else entirely (a conflict for a bowl).
  zigzag: () => [stroke().M(0, 1.6).L(0.8, 1.6).L(0, -0.5).L(0.8, -0.5).pts],
};
const form = strokes => {
  const xs = strokes.flatMap(s => s.filter((_, i) => i % 2 === 0));
  return { w: Math.round((Math.max(...xs) + 0.06) * 1000) / 1000, weight: 1, strokes, method: 'skeleton-trace', confidence: null, observations: [] };
};
let startCounter = 0;
function record(key, shape, o = {}) {
  const [u] = splitUnits(key);
  const slot = o.slot || 1;
  const conf = o.conf === undefined ? 0.7 : o.conf;
  const confidence = { score: conf, basis: 'test', inputs: { boundary: 0.75, alignment: 0.9, fidelity: o.fidelity || 0.98, inkCovered: 0.98, curveOnInk: 1, upstream: 0.97 } };
  const bbox = [o.x === undefined ? 10 * startCounter : o.x, 40, 12, 22];
  const start = o.start === undefined ? startCounter++ : o.start;
  const f = { ...form(typeof shape === 'function' ? shape() : shape), confidence, observations: [{ sample: slot, bbox }] };
  return {
    level: 'glyph',
    sampleId: `s${slot}`,
    revision: o.revision || 1,
    slot,
    source: { start, end: start + key.length },
    word: o.word === undefined ? start : o.word,
    text: key,
    key: u.key,
    script: u.script,
    kind: u.kind,
    observation: { state: 'aligned', frame: 'original', line: o.line || 0, bbox, boundary: 0.75, alignment: 0.9 },
    method: 'skeleton-trace',
    status: 'extracted',
    reasons: [],
    form: f,
    confidence,
    transform: { frame: 'original', deskew: null, analysis: { width: 1000, height: 600 }, source: null, glyph: { originX: 0, baselineY: 60, unitPx: 20, xHeightSource: 'line' } },
    diagnostics: { strokes: f.strokes.length, strokeWidth: 0.14, unitPx: 20 },
  };
}
const rejectedRecord = (key, code, slot = 1) => ({ ...record(key, SHAPES.stem, { slot }), status: 'rejected', code, reasons: [`test ${code}`], form: undefined });
const extraction = units => ({ status: 'extracted', units, summary: {} });
/** Every Latin letter, once, as a simple shape. */
const allLatin = (o = {}) => [...REQUIRED_SETS.latinLower, ...REQUIRED_SETS.latinUpper].map((k, i) => record(k, i % 2 ? SHAPES.stem : SHAPES.arch, { ...o, start: (o.offset || 0) + i, word: (o.offset || 0) + i }));
const latinProfile = (units, o = {}) => generatePersonalProfile({ id: ID, name: 'Test hand', now: 1700000000000, scripts: ['Latn'], samples: [{ metadata: meta(1), extraction: extraction(units) }], ...o });

// --- Grouping, determinism -------------------------------------------------------------------

describe('grouping and determinism', () => {
  it('creates a valid profile grouping glyphs by exact unit key', () => {
    const g = latinProfile(allLatin());
    expect(g.status).toBe('created');
    expect(validateProfile(g.profile)).toEqual({ ok: true, errors: [] });
    expect(g.profile.scripts).toEqual(['Latn']);
    for (const k of [...REQUIRED_SETS.latinLower, ...REQUIRED_SETS.latinUpper]) {
      expect(g.profile.units[k].coverage).toBe('observed');
      expect(g.profile.units[k].forms[0].method).toBe('skeleton-trace');
    }
    // Forms keep provenance: sample and region of every observation.
    expect(g.profile.units.a.forms[0].observations).toEqual([{ sample: 1, bbox: expect.any(Array) }]);
  });

  it('is deterministic: the same evidence in any order gives the same profile', () => {
    const units = [...allLatin({ slot: 1 }), ...['a', 'a', 'o'].map((k, i) => record(k, SHAPES.bowl, { slot: 3, start: 100 + i }))];
    const a = generatePersonalProfile({ id: ID, name: 'x', now: 5, scripts: ['Latn'], samples: [{ metadata: meta(1), extraction: extraction(units.filter(u => u.slot === 1)) }, { metadata: meta(3, 'latin-digits-text'), extraction: extraction(units.filter(u => u.slot === 3)) }] });
    const shuffled = units.slice().reverse();
    const b = generatePersonalProfile({ id: ID, name: 'x', now: 5, scripts: ['Latn'], samples: [{ metadata: meta(3, 'latin-digits-text'), extraction: extraction(shuffled.filter(u => u.slot === 3)) }, { metadata: meta(1), extraction: extraction(shuffled.filter(u => u.slot === 1)) }] });
    expect(b.profile).toEqual(a.profile);
    expect(b.report).toEqual(a.report);
    expect(JSON.stringify(latinProfile(allLatin()).profile)).toBe(JSON.stringify(latinProfile(allLatin()).profile));
  });
});

// --- Variants and conflicts ------------------------------------------------------------------

describe('repeated observations', () => {
  it('merges matching shapes and keeps distinct ones as weighted variants', () => {
    expect(shapeDistance(form(SHAPES.bowl()), form(SHAPES.bowl()))).toBe(0);
    const d = shapeDistance(form(SHAPES.bowl()), form(SHAPES.bowlWide()));
    expect(d).toBeGreaterThan(PROFILE_THRESHOLDS.VARIANT_SAME);
    expect(d).toBeLessThan(PROFILE_THRESHOLDS.CONFLICT);
    const units = [...allLatin(), record('o', SHAPES.bowl, { start: 200 }), record('o', SHAPES.bowl, { start: 201 }), record('o', SHAPES.bowlWide, { start: 202 })];
    const o = latinProfile(units).profile.units.o;
    // allLatin's "o" (an arch) is a third shape: three variants, by support.
    expect(o.forms.map(f => f.weight)).toEqual([0.5, 0.25, 0.25]);
    expect(o.forms[0].observations).toHaveLength(2);
    expect(o.forms[0].confidence.inputs.observations).toBe(2);
    expect(o.confidence.variantDiversity.inputs).toEqual({ observations: 4, variants: 3 });
  });

  it('rejects a lone shape that conflicts with a majority, naming the reason', () => {
    const base = allLatin().filter(u => u.key !== 'q');
    const units = [...base, ...[0, 1, 2].map(i => record('q', SHAPES.bowl, { start: 300 + i })), record('q', SHAPES.zigzag, { start: 303 })];
    const g = latinProfile(units);
    expect(g.profile.units.q.forms).toHaveLength(1);
    expect(g.profile.units.q.coverage).toBe('observed');
    const rej = g.report.rejected.filter(r => r.code === 'conflicting-geometry');
    expect(rej).toHaveLength(1);
    expect(rej[0].source.start).toBe(303);
    expect(rej[0].reasons[0]).toMatch(/probably not this character/);
  });

  it('keeps two disagreeing observations but marks the unit only uncertain', () => {
    const units = [...allLatin().filter(u => u.key !== 'q'), record('q', SHAPES.bowl, { start: 300 }), record('q', SHAPES.zigzag, { start: 301 })];
    const g = latinProfile(units);
    expect(g.profile.units.q.coverage).toBe('uncertain');
    expect(g.profile.units.q.forms).toHaveLength(2);
    expect(g.report.units.find(u => u.key === 'q').notes.join(' ')).toMatch(/disagree/);
  });

  it('keeps at most MAX_VARIANTS shapes and reports the rest', () => {
    const shapes = [SHAPES.stem, SHAPES.bowl, SHAPES.arch, SHAPES.zigzag, SHAPES.bar];
    const units = [...allLatin().filter(u => u.key !== 'x'), ...shapes.map((sh, i) => record('x', sh, { start: 400 + i }))];
    const g = latinProfile(units);
    expect(g.profile.units.x.forms).toHaveLength(PROFILE_THRESHOLDS.MAX_VARIANTS);
    expect(g.report.rejected.filter(r => r.code === 'variant-limit')).toHaveLength(1);
  });
});

// --- Reliability screening ------------------------------------------------------------------

describe('unreliable and invalid geometry', () => {
  it('rejects low-confidence glyphs and keeps weak-but-usable ones as uncertain', () => {
    const units = allLatin().map(u => (u.key === 'b' ? record('b', SHAPES.stemTall, { conf: 0.3, start: u.source.start }) : u.key === 'c' ? record('c', SHAPES.bowl, { conf: 0.42, start: u.source.start }) : u));
    const g = latinProfile(units);
    expect(g.report.rejected.find(r => r.key === 'b').code).toBe('low-confidence');
    expect(g.profile.units.b.coverage).toBe('missing');
    expect(g.profile.units.c.coverage).toBe('uncertain');
  });

  it('rejects geometry outside the renderer format instead of storing it', () => {
    const bad = record('d', [[0, 0, 0.1, 3.5, 0.2, 3.6, 0.3, 3.7]]);
    const units = [...allLatin().filter(u => u.key !== 'd'), bad];
    const g = latinProfile(units);
    const rej = g.report.rejected.find(r => r.key === 'd');
    expect(rej.code).toBe('invalid-geometry');
    expect(rej.reasons.join(' ')).toMatch(/outside the glyph band/);
    expect(g.profile.units.d.coverage).toBe('missing');
  });

  it('passes Phase 5 rejections through to the report, per sample', () => {
    const units = [...allLatin(), rejectedRecord('e', 'not-aligned'), rejectedRecord('e', 'trace-unfaithful')];
    const g = latinProfile(units);
    expect(g.report.rejected.map(r => r.code).sort()).toEqual(['extraction:not-aligned', 'extraction:trace-unfaithful']);
    expect(g.report.samples[0]).toMatchObject({ slot: 1, considered: 54, extracted: 52, used: 52, rejected: { 'extraction:not-aligned': 1, 'extraction:trace-unfaithful': 1 } });
  });

  it('refuses invalid input (bad sample metadata or id) without building anything', () => {
    expect(generatePersonalProfile({ id: 'nope', name: 'x', samples: [{ metadata: meta(1), extraction: extraction(allLatin()) }] }).status).toBe('invalid');
    const g = generatePersonalProfile({ id: ID, name: 'x', samples: [{ metadata: { ...meta(1), mime: 'text/plain' }, extraction: extraction(allLatin()) }] });
    expect(g.status).toBe('invalid');
    expect(g.profile).toBeNull();
    expect(g.errors.join(' ')).toMatch(/mime/);
  });
});

// --- Coverage and requirements --------------------------------------------------------------

describe('coverage and minimum requirements', () => {
  it('lists missing characters as missing — never drawn, never borrowed', () => {
    const g = latinProfile(allLatin());
    const missingDigits = g.report.scripts.Latn.latinExtra;
    expect(missingDigits.observed).toBe(0);
    expect(missingDigits.missingKeys).toContain('7');
    expect(g.profile.units['7']).toMatchObject({ coverage: 'missing', forms: [] });
    const resolved = resolveText(g.profile, 'ab7');
    expect(resolved.map(u => u.status)).toEqual(['glyph', 'glyph', 'unsupported']);
    expect(resolved[2].reason).toBe(UNSUPPORTED_REASONS.NOT_LEARNED);
    expect(rendererGlyphs(g.profile).table['7']).toBeUndefined();
  });

  it('builds no usable profile when coverage is too low, and says exactly why', () => {
    const units = allLatin().filter(u => !'BCDEFGHIJ'.includes(u.key));
    const g = latinProfile(units);
    expect(g.status).toBe('insufficient');
    expect(g.profile).toBeNull();
    const failed = g.report.requirements.filter(r => !r.pass);
    expect(failed.map(r => r.id)).toEqual(['latin-uppercase']);
    expect(failed[0].reason).toMatch(/17 of 26 capitals A–Z observed/);
    expect(failed[0].reason).toMatch(/Missing: B C D E F G H I J/);
    expect(g.report.scripts.Latn.latinUpper.missing).toBe(9);
  });

  it('fails when the glyphs are too weak on average, even if every letter is there', () => {
    const g = latinProfile(allLatin({ conf: 0.44 }));
    expect(g.status).toBe('insufficient');
    expect(g.report.requirements.find(r => r.id === 'latin-uppercase').pass).toBe(false); // nothing is 'observed' below OBSERVED_MIN
  });

  it('fails with no supported glyphs at all', () => {
    const g = generatePersonalProfile({ id: ID, name: 'x', samples: [{ metadata: meta(1), extraction: extraction([rejectedRecord('a', 'not-aligned')]) }] });
    expect(g.status).toBe('insufficient');
    expect(g.report.requirements[0]).toMatchObject({ id: 'any-script', pass: false });
  });

  it('documents its thresholds in the report', () => {
    const g = latinProfile(allLatin());
    expect(g.report.thresholds).toMatchObject({ GLYPH_MIN: 0.4, OBSERVED_MIN: 0.45, VARIANT_SAME: 0.06, CONFLICT: 0.3, MAX_VARIANTS: 4, meanConfidenceMin: REQUIREMENTS.meanConfidenceMin });
  });
});

// --- Parameters ---------------------------------------------------------------------------

describe('proportions', () => {
  const tall = shape => [...allLatin().filter(u => !'bdhkl'.includes(u.key)), ...['b', 'd', 'h', 'k', 'l'].map((k, i) => record(k, shape, { start: 500 + i }))];
  it('measures what the glyphs show and marks the rest as engine defaults', () => {
    const units = tall(SHAPES.stemTall);
    const g = latinProfile(units);
    expect(g.profile.paramSources.ascender).toBe('measured');
    expect(g.profile.params.ascender).toBeCloseTo(1.65, 2);
    expect(g.profile.metrics.ascender).toMatchObject({ samples: 5, unit: 'x-height' });
    expect(g.profile.paramSources.xHeightPerPitch).toBe('engine-default'); // no ruled sample
    expect(g.profile.params.xHeightPerPitch).toBe(ENGINE_DEFAULT_PARAMS.xHeightPerPitch);
    expect(g.profile.limitations.join(' ')).toMatch(/xHeightPerPitch was not measured/);
    for (const [k, [lo, hi]] of Object.entries(PARAM_BOUNDS)) {
      expect(g.profile.params[k]).toBeGreaterThanOrEqual(lo);
      expect(g.profile.params[k]).toBeLessThanOrEqual(hi);
    }
  });

  it('does not use a measurement outside the renderer bounds; it warns instead', () => {
    const units = tall(() => [stroke().M(0.1, 0.8).L(0.1, 0).pts]); // "ascenders" lower than the x-height
    const g = latinProfile(units);
    expect(g.profile.paramSources.ascender).toBe('engine-default');
    expect(g.profile.params.ascender).toBe(ENGINE_DEFAULT_PARAMS.ascender);
    expect(g.report.warnings.join(' ')).toMatch(/ascender measured 0\.8 is outside \[1, 3\]; the engine default 1\.72 is used/);
  });
});

// --- Devanagari --------------------------------------------------------------------------

describe('Devanagari clusters, matras, conjuncts and headlines', () => {
  const headlined = (width = 0.9) => [stroke().M(0, 1).L(width, 1).pts, stroke().M(width - 0.15, 1).L(width - 0.15, 0).pts, stroke().arc(0.35, 0.45, 0.25, 0.3, 90, 400).pts];

  it('finds the headline segment of a cluster and joins neighbouring clusters', () => {
    const a = headlineAnchors(form(headlined()));
    expect(a.headlineLeft[0]).toBeCloseTo(0, 1);
    expect(a.headlineRight[0]).toBeCloseTo(0.9, 1);
    expect(a.headlineLeft[1]).toBeCloseTo(1, 1);
    expect(headlineAnchors(form(SHAPES.bowl()))).toBeNull();
    const unit = { anchors: a };
    const { joins, unjoined } = headlineJoins([{ key: 'क', x: 0, unit }, { key: 'म', x: 1.1, unit }, { key: 'ल', x: 2.2, unit: {} }]);
    expect(joins).toHaveLength(1);
    expect(joins[0].slice(0, 2)).toEqual([0.9, a.headlineRight[1]]);
    expect(joins[0].slice(-2)[0]).toBeCloseTo(1.1, 3);
    expect(unjoined).toEqual([{ left: 'म', right: 'ल', reason: 'ल has no traced headline' }]);
  });

  it('keeps clusters whole: a matra or conjunct cluster is its own unit, never assembled from parts', () => {
    const keys = ['क', 'कि', 'की', 'क्ष', 'त्र'];
    const units = keys.map((k, i) => record(k, headlined(0.6 + 0.1 * i), { start: i, word: i }));
    const g = generatePersonalProfile({ id: ID, name: 'x', now: 1, scripts: ['Deva'], samples: [{ metadata: meta(2, 'devanagari-alphabet'), extraction: extraction(units) }] });
    expect(g.status).toBe('insufficient'); // far too few clusters
    expect(g.profile).toBeNull();
    // The report still shows each cluster as a whole unit with its anchors.
    expect(g.report.units.map(u => u.key).sort()).toEqual(keys.slice().sort());
    expect(g.report.scripts.Deva.devaPrompt.missingKeys).toContain('कु'); // क and ु were seen, कु was not: still missing
  });
});

// --- Pipeline integration (synthetic prompt pages) -----------------------------------------

const promptCache = new Map();
async function promptSamples(o = {}) {
  const key = JSON.stringify(o);
  if (promptCache.has(key)) return promptCache.get(key);
  const pages = [
    [1, LATIN_ALPHABET, 'latin-alphabet'],
    [2, DEVANAGARI_ALPHABET, 'devanagari-alphabet'],
    [3, LATIN_DIGITS_TEXT, 'latin-digits-text'],
  ];
  const out = [];
  for (const [slot, text, category] of pages) {
    const lines = text.split('\n').length;
    const { raster } = syntheticTextPage(text, { width: 1400, xHeight: 26, stroke: 3, top: 104, lineGap: 104, marginX: 50, height: 104 * (lines + 1) + 40, ...o });
    const r = await analyzeSample(raster, { slot, knownText: text, sampleId: `sample-${slot}`, revision: 1, yieldFn: async () => {}, extract: true });
    out.push({ metadata: { ...meta(slot, category), width: raster.width, height: raster.height }, extraction: r.extraction, quality: r.quality.score, rules: { spacing: r.rules.spacing } });
  }
  promptCache.set(key, out);
  return out;
}
const STEADY = { jitter: 0.04 };

describe('from the synthetic prompt pages', () => {
  it('builds a valid, synthetic-labelled profile from a steady writer’s pages', async () => {
    const samples = await promptSamples(STEADY);
    const g = generatePersonalProfile({ id: ID, name: 'Synthetic writer', now: 1700000000000, synthetic: true, samples });
    expect(g.status).toBe('created');
    expect(validateProfile(g.profile).ok).toBe(true);
    expect(g.profile.synthetic).toBe(true);
    expect(g.profile.limitations[0]).toMatch(/SYNTHETIC/);
    expect(g.profile.scripts.sort()).toEqual(['Deva', 'Latn']);
    g.report.requirements.forEach(r => expect([r.id, r.pass]).toEqual([r.id, true]));
    // Sample contributions: every sample is accounted for.
    for (const s of g.report.samples) {
      expect(s.considered).toBe(s.extracted + Object.values(s.rejected).reduce((a, v) => a + v, 0));
      expect(s.used).toBeGreaterThan(0);
    }
    // Matra and conjunct clusters are whole units with headline anchors.
    for (const k of ['कि', 'की', 'को', 'क्ष', 'त्र', 'ज्ञ']) {
      const u = g.profile.units[k];
      expect([k, u && u.coverage]).toEqual([k, 'observed']);
      expect(u.anchors.headlineLeft[0]).toBeLessThan(u.anchors.headlineRight[0]);
    }
  });

  it('measures proportions close to what the fixture drew', async () => {
    const samples = await promptSamples(STEADY);
    const { profile } = generatePersonalProfile({ id: ID, name: 'Synthetic writer', now: 1, synthetic: true, samples });
    // The fixture: capitals 1.45, ascenders 1.65, descenders 0.6 (x-heights).
    expect(profile.paramSources.capHeight).toBe('measured');
    expect(Math.abs(profile.params.capHeight - 1.45)).toBeLessThan(0.08);
    expect(Math.abs(profile.params.ascender - 1.65)).toBeLessThan(0.08);
    expect(Math.abs(profile.params.descender - 0.6)).toBeLessThan(0.1);
    expect(Math.abs(profile.params.slant)).toBeLessThan(2);
    // A capitals-only line takes its x-height from the sample's other lines.
    const caps = samples[0].extraction.units.filter(u => u.status === 'extracted' && /^[A-Z]$/.test(u.text));
    expect(caps.length).toBeGreaterThan(20);
    caps.forEach(u => expect(u.transform.glyph.xHeightSource).toBe('sample'));
  });

  it('refuses an unsteady writer’s pages: too few capitals could be separated, with the reason', async () => {
    const samples = await promptSamples({});
    const g = generatePersonalProfile({ id: ID, name: 'Synthetic writer', now: 1, synthetic: true, samples });
    expect(g.status).toBe('insufficient');
    expect(g.profile).toBeNull();
    const failed = g.report.requirements.filter(r => !r.pass);
    expect(failed.map(r => r.id)).toEqual(['latin-uppercase']);
    expect(failed[0].reason).toMatch(/capitals A–Z observed/);
  });
});

// --- Persistence, immutability, document references ---------------------------------------

describe('saved versions and document references', () => {
  const build = (o = {}) => latinProfile(allLatin(), o).profile;

  it('saves an immutable version with its provenance and reads it back exactly', async () => {
    const v1 = build();
    expect(await createProfileVersion(v1)).toEqual({ status: 'ok', ref: formatProfileRef(ID, 1) });
    const read = await readProfileVersion(ID, 1);
    expect(read).toEqual({ status: 'ok', profile: v1 });
    expect(read.profile.sources).toEqual([meta(1)]);
    // A version is written once.
    expect((await createProfileVersion(v1)).status).toBe('version-conflict');
  });

  it('renaming changes only the display name, never the stored version', async () => {
    const v1 = build();
    await createProfileVersion(v1);
    const before = await getStorageBackend().getItem(versionKey(ID, 1));
    expect(await renameProfile(ID, 'My hand')).toEqual({ status: 'ok' });
    expect((await listProfiles())[0].name).toBe('My hand');
    expect(await getStorageBackend().getItem(versionKey(ID, 1))).toBe(before);
    expect((await readProfileVersion(ID, 1)).profile.name).toBe('Test hand');
  });

  it('regenerating creates version 2 and leaves version 1 untouched', async () => {
    const v1 = build();
    await createProfileVersion(v1);
    const before = await getStorageBackend().getItem(versionKey(ID, 1));
    const more = [...allLatin(), ...['a', 'a'].map((k, i) => record(k, SHAPES.bowl, { start: 600 + i }))];
    const v2 = generatePersonalProfile({ previous: v1, name: 'Test hand', now: 1800000000000, scripts: ['Latn'], samples: [{ metadata: meta(1), extraction: extraction(more) }] }).profile;
    expect([v2.id, v2.version, v2.profileCreatedAt]).toEqual([ID, 2, v1.profileCreatedAt]);
    expect((await createProfileVersion(v2)).status).toBe('ok');
    expect(await getStorageBackend().getItem(versionKey(ID, 1))).toBe(before);
    expect((await readProfileVersion(ID, 2)).profile.units.a.forms.length).toBeGreaterThan(v1.units.a.forms.length);
  });

  it('an insufficient result has nothing to save', async () => {
    const g = latinProfile(allLatin().filter(u => u.key !== 'a' && u.key !== 'b' && u.key !== 'c'));
    expect(g.status).toBe('insufficient');
    expect((await createProfileVersion(g.profile)).status).toBe('invalid');
    expect(await listProfiles()).toEqual([]);
  });

  it('documents pin the exact version they were written with', async () => {
    const v1 = build();
    await createProfileVersion(v1);
    const doc = await saveDocument({ ...createDocument(), title: 'Essay', handwritingStyle: formatProfileRef(ID, 1) });
    const v2 = generatePersonalProfile({ previous: v1, name: 'Test hand', now: 1800000000000, scripts: ['Latn'], samples: [{ metadata: meta(1), extraction: extraction(allLatin({ conf: 0.8 })) }] }).profile;
    await createProfileVersion(v2);
    const reopened = await getDocument(doc.id);
    expect(reopened.handwritingStyle).toBe(`personal:${ID}@1`);
    const resolved = await resolveProfileRef(reopened.handwritingStyle);
    expect(resolved.status).toBe('ok');
    expect(resolved.profile).toEqual(v1);
    expect(resolved.profile.units.a.forms[0].confidence.score).toBe(0.7); // not v2's 0.8
  });
});

// --- Isolation -----------------------------------------------------------------------------

describe('isolation', () => {
  it('registers nothing with the app and marks only the stages Phase 6 built', () => {
    latinProfile(allLatin());
    expect(getHandwritingStyles().map(s => s.id)).toEqual(['reference_student', 'reference_student_lang2', 'reference_student_lang3']);
    expect(Object.keys(GLYPH_SETS)).toEqual(['lang1', 'lang2', 'lang3']);
    expect(PIPELINE_STAGES.filter(s => s.phase === 6 && s.implemented).map(s => s.name)).toEqual(['GlyphVariantBuilder', 'HandwritingMetricsAnalyzer', 'ProfileConfidenceAnalyzer', 'MissingCharacterResolver']);
  });
});
