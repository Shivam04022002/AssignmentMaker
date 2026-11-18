/**
 * Lang4 Phase 6.1 — rendering documents written with a personal handwriting.
 *
 * A personal reference (personal:<id>@<version>) must draw that exact
 * stored version, or show an explicit error — never Lang1 or any other
 * handwriting. Built-in documents must render exactly as before (the hash
 * locks in naturalRhythm / lang3 / lang3Lock tests guard their output).
 * Profiles here are SYNTHETIC (geometric strokes), labelled as such.
 */
import React, { useEffect } from 'react';
import { act } from 'react-test-renderer';
import { clearAllMockStorages } from '@react-native-async-storage/async-storage';
import HandwritingText from '../src/components/HandwritingText';
import { DEFAULT_HANDWRITING_STYLE, getHandwritingStyle, getHandwritingStyles, isPersonalStyleId } from '../src/data/handwritingStyles';
import { exportBlocker } from '../src/export/ExportRenderer';
import { FALLBACK_GLYPH, GLYPH_SETS, glyphFor, hasGlyph } from '../src/handwriting/glyphs';
import { buildProfileVersion } from '../src/handwriting/learn/profileBuilder';
import { createProfileVersion, versionKey } from '../src/handwriting/learn/profileRepository';
import { formatProfileRef } from '../src/handwriting/learn/profileSchema';
import { layoutPersonalText, MARKER_WIDTH, paginatePersonal, personalPaths, personalXHeight } from '../src/handwriting/learn/personalRenderer';
import { clearPersonalCache, getPersonalResolution, loadPersonal, PERSONAL_ERROR_MESSAGES } from '../src/handwriting/learn/personalStore';
import { UNSUPPORTED_REASONS } from '../src/handwriting/learn/rendererAdapter';
import useDocumentPages from '../src/hooks/useDocumentPages';
import { createDocument, normalizeDocument } from '../src/models/document';
import { getStorageBackend, setStorageBackend } from '../src/storage/documentStorage';
import { getPageMetrics, getPageType, rowHeightFor } from '../src/data/paper';
import { ALL_DEFAULT, PARAMS, SOURCES, syntheticForm } from './helpers/syntheticProfile';
import { render } from './helpers/render';

beforeEach(() => {
  clearAllMockStorages();
  setStorageBackend(null);
  clearPersonalCache();
});

const ID = 'p-test61-ab12';
const line = (x0, y0, x1, y1) => [x0, y0, x0 + (x1 - x0) / 3, y0 + (y1 - y0) / 3, x0 + ((x1 - x0) * 2) / 3, y0 + ((y1 - y0) * 2) / 3, x1, y1];
/** A cluster with a headline across its width (and its anchors). */
const cluster = (w, extra = []) => ({
  coverage: 'observed',
  forms: [syntheticForm(w, [line(0, 1, w, 1), line(w - 0.15, 1, w - 0.15, 0), ...extra])],
  anchors: { headlineLeft: [0, 1], headlineRight: [w, 1] },
});

function profile(o = {}) {
  const units = {
    h: { coverage: 'observed', forms: [syntheticForm(0.6, [line(0.1, 1.7, 0.1, 0), line(0.1, 0.8, 0.5, 0)])] },
    e: { coverage: 'observed', forms: [syntheticForm(0.55, [line(0.05, 0.5, 0.5, 0.5)]), syntheticForm(0.6, [line(0.05, 0.4, 0.55, 0.6)], 0.4)].map((f, i) => ({ ...f, weight: i ? 0.4 : 0.6 })) },
    l: { coverage: 'observed', forms: [syntheticForm(0.25, [line(0.1, 1.7, 0.1, 0)])] },
    o: { coverage: 'uncertain', forms: [syntheticForm(0.6, [line(0.1, 0.5, 0.5, 0.5)])] },
    'क': cluster(0.8),
    'म': cluster(0.75),
    'ल': cluster(0.7),
    'कि': cluster(1.0, [line(0.1, 1, 0.1, 0)]),
    'z': { coverage: 'missing', forms: [] },
    ...(o.units || {}),
  };
  const r = buildProfileVersion({
    id: ID,
    version: o.version || 1,
    name: 'Synthetic render test',
    now: 1760000000000 + (o.version || 1),
    synthetic: true,
    scripts: ['Latn', 'Deva'],
    sources: SOURCES,
    metrics: {},
    params: PARAMS,
    paramSources: ALL_DEFAULT,
    units,
  });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.profile;
}
const REF = formatProfileRef(ID, 1);
const save = async p => expect((await createProfileVersion(p)).status).toBe('ok');
const resolved = async ref => {
  let r;
  await act(async () => {
    r = await loadPersonal(ref);
  });
  return r;
};

// --- Resolution ------------------------------------------------------------------------------

describe('resolving a personal reference', () => {
  it('resolves to the exact stored version and its glyphs', async () => {
    const v1 = profile();
    await save(v1);
    const r = await resolved(REF);
    expect(r.status).toBe('ok');
    expect(r.profile).toEqual(v1);
    expect(r.glyphs.table.h).toEqual({ w: 0.6, strokes: v1.units.h.forms[0].strokes });
    expect(r.name).toBe('Synthetic render test (v1)');
  });

  it('keeps the version a document pins even when a newer one exists', async () => {
    const v1 = profile();
    await save(v1);
    const v2 = profile({ version: 2, units: { h: { coverage: 'observed', forms: [syntheticForm(0.9, [line(0.2, 1.7, 0.2, 0)])] } } });
    await save(v2);
    const r1 = await resolved(REF);
    const r2 = await resolved(formatProfileRef(ID, 2));
    expect(r1.profile.version).toBe(1);
    expect(r1.glyphs.table.h.w).toBe(0.6);
    expect(r2.glyphs.table.h.w).toBe(0.9);
  });

  it('reports a missing profile, a missing version and a malformed reference explicitly', async () => {
    expect((await resolved('personal:p-gone00-aa@1')).status).toBe('missing-profile');
    await save(profile());
    const mv = await resolved(formatProfileRef(ID, 3));
    expect(mv).toMatchObject({ status: 'missing-version', message: PERSONAL_ERROR_MESSAGES['missing-version'] });
    expect(getPersonalResolution('personal:garbage')).toMatchObject({ status: 'invalid-ref' });
  });

  it('refuses a stored version with invalid geometry, a newer schema, or nothing drawable', async () => {
    const good = profile();
    await save(good);
    const store = getStorageBackend();
    const broken = JSON.parse(JSON.stringify(good));
    broken.units.h.forms[0].strokes = [[0, 0, 0.1, 9, 0.2, 9, 0.3, 9]]; // outside the glyph band
    await store.setItem(versionKey(ID, 1), JSON.stringify(broken));
    clearPersonalCache();
    const r = await resolved(REF);
    expect(r.status).toBe('invalid');
    expect(r.details.join(' ')).toMatch(/outside the glyph band/);
    await store.setItem(versionKey(ID, 1), JSON.stringify({ ...good, schemaVersion: 99 }));
    clearPersonalCache();
    expect((await resolved(REF)).status).toBe('unsupported-schema');
    const empty = profile({ units: { h: { coverage: 'missing', forms: [] }, e: { coverage: 'missing', forms: [] }, l: { coverage: 'missing', forms: [] }, o: { coverage: 'missing', forms: [] }, 'क': { coverage: 'missing', forms: [] }, 'म': { coverage: 'missing', forms: [] }, 'ल': { coverage: 'missing', forms: [] }, 'कि': { coverage: 'missing', forms: [] } } });
    await store.setItem(versionKey(ID, 1), JSON.stringify(empty));
    clearPersonalCache();
    expect((await resolved(REF)).status).toBe('no-glyphs');
  });

  it('is "loading" until the stored version has been read — never another handwriting meanwhile', async () => {
    await save(profile());
    expect(getPersonalResolution(REF)).toEqual({ status: 'loading', ref: REF });
    expect((await resolved(REF)).status).toBe('ok');
    expect(getPersonalResolution(REF).status).toBe('ok');
  });
});

// --- No fallback at the style and glyph level ------------------------------------------------

describe('no silent fallback', () => {
  it('a personal reference never resolves to the reference (Lang1) profile', () => {
    const style = getHandwritingStyle(REF);
    expect(isPersonalStyleId(REF)).toBe(true);
    expect(style.id).toBe(REF);
    expect(style.personal).toBe(true);
    expect(style).not.toBe(getHandwritingStyle(DEFAULT_HANDWRITING_STYLE));
    expect(style.glyphSet).toBe(REF);
    // Even if handed to the built-in glyph tables, a personal set has no Lang1 letters.
    expect(glyphFor('a', REF)).toBe(FALLBACK_GLYPH);
    expect(hasGlyph('a', REF)).toBe(false);
  });

  it('built-in, legacy and unknown non-personal ids behave exactly as before', () => {
    const builtins = getHandwritingStyles();
    expect(builtins.map(s => s.id)).toEqual(['reference_student', 'reference_student_lang2', 'reference_student_lang3']);
    builtins.forEach(s => expect(getHandwritingStyle(s.id)).toBe(s));
    expect(getHandwritingStyle('cursive')).toBe(builtins[0]); // a pre-Phase 7 document
    expect(getHandwritingStyle('something-else')).toBe(builtins[0]);
    expect(glyphFor('a', 'lang1')).toBe(GLYPH_SETS.lang1.a);
    expect(glyphFor('a', 'lang3')).toBe(GLYPH_SETS.lang3.a);
    expect(glyphFor('a', 'no-such-set')).toBe(GLYPH_SETS.lang1.a); // unchanged legacy behaviour
  });

  it('old documents keep their handwriting; personal references are kept as stored', () => {
    expect(normalizeDocument({ handwritingStyle: 'cursive' }).handwritingStyle).toBe('cursive');
    expect(createDocument().handwritingStyle).toBe('reference_student');
    expect(normalizeDocument({ handwritingStyle: REF }).handwritingStyle).toBe(REF);
  });
});

// --- Layout -------------------------------------------------------------------------------

describe('personal layout', () => {
  const p = profile();
  const lay = (text, o = {}) => layoutPersonalText(text, p, { xHeight: 20, contentWidth: Infinity, seed: 'doc', ...o });

  it('draws learned letters at their learned widths and marks the rest, with ranges and reasons', () => {
    const { lines, unsupported } = lay('hello zap');
    const items = lines[0].words.flatMap(w => w.items);
    expect(items.map(i => [i.text, i.kind])).toEqual([['h', 'glyph'], ['e', 'glyph'], ['l', 'glyph'], ['l', 'glyph'], ['o', 'glyph'], ['z', 'missing'], ['a', 'missing'], ['p', 'missing']]);
    expect(items[0].w).toBe(0.6);
    expect(items[5].w).toBe(MARKER_WIDTH);
    expect(unsupported).toEqual([
      { start: 6, end: 7, text: 'z', reason: UNSUPPORTED_REASONS.NOT_LEARNED },
      { start: 7, end: 8, text: 'a', reason: UNSUPPORTED_REASONS.MISSING },
      { start: 8, end: 9, text: 'p', reason: UNSUPPORTED_REASONS.MISSING },
    ]);
  });

  it('keeps Devanagari clusters whole and never assembles a missing cluster from parts', () => {
    const items = lay('कि कु').lines[0].words.flatMap(w => w.items);
    expect(items.map(i => [i.text, i.kind])).toEqual([['कि', 'glyph'], ['कु', 'missing']]); // क is learned, कु is not
    const orphan = lay('ि Ω').lines[0].words.flatMap(w => w.items);
    expect(orphan.map(i => i.reason)).toEqual([UNSUPPORTED_REASONS.ORPHAN_MARK, UNSUPPORTED_REASONS.SCRIPT]);
  });

  it('joins the headlines of neighbouring clusters; a missing cluster breaks the run', () => {
    const word = lay('कमल').lines[0].words[0];
    expect(word.joins).toHaveLength(2);
    expect(word.joins[0].slice(0, 2)).toEqual([0.8, 1]); // from क's headline end …
    expect(word.joins[0].slice(-2)).toEqual([0.8 + PARAMS.letterGap, 1]); // … to म's start
    const broken = lay('कखल').lines[0].words[0];
    expect(broken.items[1].kind).toBe('missing');
    expect(broken.joins).toHaveLength(0);
  });

  it('wraps words, keeps paragraphs, and is deterministic', () => {
    const narrow = lay('hello hello hello', { contentWidth: 150 });
    expect(narrow.lines.length).toBeGreaterThan(1);
    expect(narrow.lines.flatMap(l => l.words).map(w => w.start)).toEqual([0, 6, 12]);
    expect(lay('he\n\nlo').lines.map(l => l.words.length)).toEqual([1, 0, 1]);
    expect(lay('eeee eeee')).toEqual(lay('eeee eeee'));
    // Variants chosen by position and weight, from both forms of "e".
    const forms = new Set(lay('e e e e e e e e e e e e e e e e').lines[0].words.map(w => w.items[0].form));
    expect(forms).toEqual(new Set([0, 1]));
  });

  it('produces SVG geometry: one path per stroke and per join, a marker per missing unit', () => {
    const { lines } = lay('कमल zh');
    const g = personalPaths(lines, p, { xHeight: 20, rowHeight: 40, baselineInRow: 38 });
    expect(g.paths).toHaveLength(3 * 2 + 2 + 2); // three clusters × 2 strokes, 2 joins, h's 2 strokes
    expect(g.markers).toHaveLength(1);
    expect(g.paths[0]).toMatch(/^M[-\d. ]+C/);
    expect(g.penWidth).toBe(PARAMS.strokeWidth * 20);
  });
});

// --- Pagination and export ------------------------------------------------------------------

describe('pages and export', () => {
  const type = getPageType('ruled');
  const metrics = getPageMetrics({ pageType: type.id, style: getHandwritingStyle(REF) });
  const rowHeight = rowHeightFor(type, metrics, getHandwritingStyle(REF));

  it('paginates like the built-in paginator, sheet by sheet', () => {
    const r = { status: 'ok', profile: profile() };
    const out = paginatePersonal({ content: 'hello\fकमल', resolution: r, metrics, rowHeight, seed: 'd' });
    expect(out.pages.map(pg => [pg.sheetIndex, pg.start, pg.end, pg.text])).toEqual([[0, 0, 5, 'hello'], [1, 6, 9, 'कमल']]);
    expect(out.layout.personal.xHeight).toBeCloseTo(personalXHeight(r.profile, metrics.fontSize, rowHeight), 9);
    expect(out.handwriting).toBe(r);
  });

  it('an unavailable profile still gives every sheet its page, with no handwriting on it', () => {
    const r = { status: 'missing-profile', ref: REF, message: 'gone' };
    const out = paginatePersonal({ content: 'hello\fworld', resolution: r, metrics, rowHeight });
    expect(out.pages.map(pg => [pg.text, pg.lines.length])).toEqual([['hello', 0], ['world', 0]]);
  });

  it('export refuses a personal document until its exact version is available', () => {
    expect(exportBlocker({ handwriting: { status: 'loading' } })).toMatch(/still loading/);
    expect(exportBlocker({ handwriting: { status: 'missing-version', message: PERSONAL_ERROR_MESSAGES['missing-version'] } })).toMatch(/Personal handwriting unavailable: The version/);
    expect(exportBlocker({ handwriting: { status: 'ok' } })).toBeNull();
    expect(exportBlocker({ pages: [] })).toBeNull(); // built-in documents: unchanged
  });

  it('useDocumentPages paginates a personal document with its own profile, and built-in ones as before', async () => {
    await save(profile());
    let latest = null;
    function Probe({ document }) {
      const paged = useDocumentPages(document);
      useEffect(() => {
        latest = paged;
      });
      return null;
    }
    const doc = { ...createDocument(), content: 'hello', handwritingStyle: REF };
    const r = await render(<Probe document={doc} />);
    await act(async () => {
      await loadPersonal(REF);
    });
    expect(latest.handwriting.status).toBe('ok');
    expect(latest.pages[0].lines[0].words[0].items.map(i => i.text)).toEqual(['h', 'e', 'l', 'l', 'o']);
    await act(async () => {
      r.update(<Probe document={{ ...doc, handwritingStyle: 'reference_student' }} />);
    });
    expect(latest.handwriting).toBeUndefined();
    expect(latest.style.id).toBe('reference_student');
    expect(latest.pages[0].lines[0].words.length).toBeGreaterThan(0);
  });
});

// --- Components -----------------------------------------------------------------------------

/** Outermost nodes with a testID (svg wrappers forward testID to inner layers). */
const findAll = (r, id) => r.root.findAll(n => n.props.testID === id && typeof n.type !== 'string' && !(n.parent && n.parent.props.testID === id));

describe('drawing', () => {
  it('draws a personal document with its own strokes — never with the built-in renderer', async () => {
    await save(profile());
    await resolved(REF);
    const r = await render(<HandwritingText text="hello zebra कमल" style={REF} fontSize={20} maxWidth={300} seed="d" />);
    expect(findAll(r, 'personal-handwriting-ink')).toHaveLength(1);
    expect(findAll(r, 'handwriting-ink')).toHaveLength(0); // built-in engine not used
    expect(findAll(r, 'personal-missing-glyph').length).toBe(4); // z b r a of “zebra” (its e is learned)
  });

  it('shows an explicit notice instead of writing when the profile is missing', async () => {
    const ref = 'personal:p-gone00-aa@1';
    await resolved(ref);
    const r = await render(<HandwritingText text="hello" style={ref} fontSize={20} />);
    const notice = findAll(r, 'personal-handwriting-error');
    expect(notice).toHaveLength(1);
    expect(notice[0].props.accessibilityLabel).toMatch(/not on this device/);
    expect(findAll(r, 'handwriting-ink')).toHaveLength(0);
    expect(findAll(r, 'personal-handwriting-ink')).toHaveLength(0);
  });

  it('draws nothing while loading, then the personal writing', async () => {
    await save(profile());
    const r = await render(<HandwritingText text="hello" style={REF} fontSize={20} />);
    expect(findAll(r, 'handwriting-ink')).toHaveLength(0);
    await act(async () => {
      await loadPersonal(REF);
    });
    expect(findAll(r, 'personal-handwriting-ink')).toHaveLength(1);
    expect(findAll(r, 'personal-handwriting-loading')).toHaveLength(0);
  });

  it('built-in handwriting renders through the original engine, untouched', async () => {
    for (const id of ['reference_student', 'reference_student_lang2', 'reference_student_lang3']) {
      const r = await render(<HandwritingText text="hello" style={id} fontSize={20} />);
      expect(findAll(r, 'handwriting-ink')).toHaveLength(1);
      expect(findAll(r, 'personal-handwriting-ink')).toHaveLength(0);
      expect(findAll(r, 'personal-handwriting-error')).toHaveLength(0);
    }
  });
});
