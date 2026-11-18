/**
 * Lang4 Phase 10 — personal handwriting rendering quality.
 *
 * Profiles and pages here are SYNTHETIC (geometric strokes / pseudo-glyphs,
 * nobody's handwriting). They check that the renderer draws learned forms
 * consistently without changing them, picks variants deterministically,
 * joins Devanagari headlines where the drawn forms' headlines are, keeps
 * document formatting, and that the two upstream defects found while doing
 * so stay fixed. Nothing here measures real-handwriting quality.
 */
import React from 'react';
import { analyzeSample } from '../src/handwriting/learn/analyzeSample';
import { LATIN_ZONES } from '../src/handwriting/learn/alignSample';
import { xHeightReference } from '../src/handwriting/learn/glyphExtraction';
import { placeChain, profileLayoutMetrics, SIZE } from '../src/handwriting/learn/personalMetrics';
import { EMPHASIS, hash01, layoutPersonalText, MARKER_TEXT, paginatePersonal, personalPaths, personalXHeight, pickForm } from '../src/handwriting/learn/personalRenderer';
import { buildProfileVersion } from '../src/handwriting/learn/profileBuilder';
import { LATIN_ALPHABET } from '../src/handwriting/learn/samplePrompts';
import { sampleChain } from '../src/handwriting/learn/strokeFit';
import { getHandwritingStyle } from '../src/data/handwritingStyles';
import { getPageMetrics, getPageType, rowHeightFor } from '../src/data/paper';
import { PERSONAL_HANDWRITING_ONBOARDING, VALIDATION_TOOLS } from '../src/dev/flags';
import { PersonalDocumentBanner } from '../src/components/PersonalHandwriting';
import { ALL_DEFAULT, PARAMS, SOURCES, syntheticForm } from './helpers/syntheticProfile';
import { syntheticTextPage } from './helpers/syntheticText';
import { render } from './helpers/render';

jest.setTimeout(180000);

const line = (x0, y0, x1, y1) => [x0, y0, x0 + (x1 - x0) / 3, y0 + (y1 - y0) / 3, x0 + ((x1 - x0) * 2) / 3, y0 + ((y1 - y0) * 2) / 3, x1, y1];
const seen = n => Array.from({ length: n }, (_, i) => ({ sample: 1, bbox: [i * 10, 0, 8, 8] }));
/** A synthetic x-height letter of height h (a box), seen n times. */
const box = (h, n = 1, w = 0.6) => ({ ...syntheticForm(w, [line(0.06, 0, 0.06, h), line(0.06, h, w - 0.06, h), line(w - 0.06, h, w - 0.06, 0), line(0.06, 0, w - 0.06, 0)]), observations: seen(n) });
/** A cluster: headline at height h across the width, a stem. */
const cluster = (w, h = 1, n = 1) => ({ ...syntheticForm(w, [line(0, h, w, h), line(w - 0.15, h, w - 0.15, 0)]), observations: seen(n) });

function profile(units, o = {}) {
  const r = buildProfileVersion({
    id: 'p-test10-ab12',
    version: o.version || 1,
    name: 'Synthetic Phase 10',
    now: 1760000000000,
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
const withWeights = (forms, weights) => forms.map((f, i) => ({ ...f, weight: weights[i] }));
const deepCopy = v => JSON.parse(JSON.stringify(v));

// A profile like one saved before Phase 10: each letter's majority form at
// the x-height, plus a variant learned 0.68× too small (a mis-measured line).
const legacyUnits = () => ({
  a: { coverage: 'observed', forms: withWeights([box(1, 6), box(0.68, 1, 0.42)], [0.86, 0.14]) },
  o: { coverage: 'observed', forms: withWeights([box(1, 5), box(0.68, 1, 0.42)], [0.83, 0.17]) },
  n: { coverage: 'observed', forms: [box(1, 4)] },
  b: { coverage: 'observed', forms: withWeights([{ ...syntheticForm(0.6, [line(0.1, 1.7, 0.1, 0), line(0.1, 1, 0.5, 0)]), observations: seen(3) }, { ...syntheticForm(0.42, [line(0.1, 1.15, 0.1, 0), line(0.1, 0.68, 0.35, 0)]), observations: seen(1) }], [0.75, 0.25]) },
  x: { coverage: 'observed', forms: [{ ...box(1, 2), strokes: box(1).strokes.map(c => c.map((v, i) => (i % 2 ? v + 0.08 : v))) }] }, // stands 0.08 above the baseline
  'क': { coverage: 'observed', forms: withWeights([cluster(0.8, 1, 4), cluster(0.6, 0.7, 1)], [0.8, 0.2]) },
  'म': { coverage: 'observed', forms: [cluster(0.75, 1, 3)] },
  'ल': { coverage: 'observed', forms: [cluster(0.7, 1, 3)] },
});

// --- Render-time consistency ---------------------------------------------------------------

describe('consistent size, baseline and spacing (render-time; stored geometry unchanged)', () => {
  it('draws a mis-scaled variant at its siblings’ size, and never changes the profile', () => {
    const p = profile(legacyUnits());
    const before = deepCopy(p);
    const m = profileLayoutMetrics(p);
    expect(m.references.short).toBe(1); // the observation-weighted majority
    expect(m.forms.get('a')[0].scale).toBe(1);
    expect(m.forms.get('a')[1].scale).toBeCloseTo(1 / 0.68, 2);
    expect(m.forms.get('b')[1].scale).toBeCloseTo(1.7 / 1.15, 2);
    // Drawn tops of every variant of a / o now meet at the x-height.
    for (const k of ['a', 'o']) {
      p.units[k].forms.forEach((f, i) => {
        const t = m.forms.get(k)[i];
        const ys = f.strokes.flatMap(c => sampleChain(placeChain(c, t), 0.05)).map(q => q[1]);
        expect(Math.max(...ys)).toBeCloseTo(1, 2);
      });
    }
    // Rendering does not touch the stored version.
    personalPaths(layoutPersonalText('a o b x कमल', p, { xHeight: 20 }).lines, p, { xHeight: 20, rowHeight: 60, baselineInRow: 50 });
    expect(p).toEqual(before);
  });

  it('keeps the side padding, so letter gaps stay even; a form at its class size is laid out exactly as learned', () => {
    const p = profile(legacyUnits());
    const m = profileLayoutMetrics(p);
    expect(m.forms.get('n')[0].advance).toBe(0.6); // learned width, unchanged
    const t = m.forms.get('a')[1];
    expect(t.advance).toBeCloseTo(0.12 + (0.42 - 0.12) * t.scale, 3);
    // The glyph's padding (left of its ink) is the same at any scale.
    expect(placeChain([0.06, 0, 0.06, 0, 0.06, 0, 0.06, 0], t)[0]).toBeCloseTo(0.06, 6);
  });

  it('removes a small systematic baseline offset, leaves larger ones (the writer’s), and keeps one pen width', () => {
    const p = profile(legacyUnits());
    const m = profileLayoutMetrics(p);
    const tx = m.forms.get('x')[0];
    expect(tx.shift).toBeCloseTo(-0.08 * tx.scale, 3); // the offset at the drawn size
    const raised = profile({ ...legacyUnits(), x: { coverage: 'observed', forms: [{ ...box(1, 2), strokes: box(1).strokes.map(c => c.map((v, i) => (i % 2 ? v + 0.3 : v))) }] } });
    expect(profileLayoutMetrics(raised).forms.get('x')[0].shift).toBe(0);
    const lay = layoutPersonalText('a a a', p, { xHeight: 20, seed: 's' });
    const g = personalPaths(lay.lines, p, { xHeight: 20, rowHeight: 60, baselineInRow: 50 });
    expect(g.styled).toEqual([]); // a scaled glyph is not drawn with a thicker pen
    expect(g.penWidth).toBe(PARAMS.strokeWidth * 20);
  });

  it('does not trust a scale far outside its class: draws the form as stored and says why', () => {
    const p = profile({ ...legacyUnits(), e: { coverage: 'observed', forms: [box(1, 5), box(0.4, 1)] }, s: { coverage: 'observed', forms: [box(1, 3)] } });
    const t = profileLayoutMetrics(p).forms.get('e')[1];
    expect(1 / 0.4).toBeGreaterThan(SIZE.max);
    expect(t.scale).toBe(1);
    expect(t.notes.join(' ')).toMatch(/outside/);
  });
});

// --- Variants ------------------------------------------------------------------------------

describe('deterministic variant selection', () => {
  const units = () => ({
    l: { coverage: 'observed', forms: withWeights([box(1.7, 3, 0.3), box(1.7, 2, 0.32)], [0.6, 0.4]) },
    e: { coverage: 'observed', forms: withWeights([box(1, 3), box(1, 3, 0.62)], [0.5, 0.5]) },
    h: { coverage: 'observed', forms: [box(1.7, 2)] },
    o: { coverage: 'observed', forms: [box(1, 2)] },
    'म': { coverage: 'observed', forms: withWeights([cluster(0.75, 1, 2), cluster(0.8, 1, 2)], [0.5, 0.5]) },
  });
  const formsOf = (lay, word) => lay.lines.flatMap(l => l.words).filter(w => w.items.map(i => i.text).join('') === word).map(w => w.items.map(i => i.form));

  it('the same document and profile version always draw the same variants', () => {
    const p = profile(units());
    const a = layoutPersonalText('hello hello eel', p, { xHeight: 20, seed: 'doc-1' });
    const b = layoutPersonalText('hello hello eel', p, { xHeight: 20, seed: 'doc-1' });
    expect(a).toEqual(b);
  });

  it('typing elsewhere does not reshuffle a word’s letters', () => {
    const p = profile(units());
    const a = layoutPersonalText('hello eel', p, { xHeight: 20, seed: 'doc-1' });
    const b = layoutPersonalText('oh oh oh hello eel', p, { xHeight: 20, seed: 'doc-1' });
    expect(formsOf(b, 'hello')).toEqual(formsOf(a, 'hello'));
    expect(formsOf(b, 'eel')).toEqual(formsOf(a, 'eel'));
  });

  it('a doubled unit is not drawn twice with the same variant when there is another', () => {
    const p = profile(units());
    const lay = layoutPersonalText('hello eel ell lle मम', p, { xHeight: 20, seed: 'doc-2' });
    for (const w of lay.lines[0].words) {
      for (let i = 1; i < w.items.length; i++) {
        if (w.items[i].key === w.items[i - 1].key) expect([w.items[i].text, w.items[i].form === w.items[i - 1].form]).toEqual([w.items[i].text, false]);
      }
    }
  });

  it('follows the learned weights over many words, and is keyed to the profile version', () => {
    const forms = withWeights([box(1), box(1)], [0.7, 0.3]);
    let first = 0;
    for (let i = 0; i < 2000; i++) if (pickForm(forms, `p@1|doc|word|${i}|0`) === 0) first++;
    expect(first / 2000).toBeGreaterThan(0.66);
    expect(first / 2000).toBeLessThan(0.74);
    expect(hash01('a|b|0')).not.toBe(hash01('a|b|1'));
    // Keys differing only in their last character land far apart.
    const near = Array.from({ length: 16 }, (_, i) => hash01(`doc|e|${i}|0`));
    expect(Math.max(...near) - Math.min(...near)).toBeGreaterThan(0.5);
  });
});

// --- Devanagari --------------------------------------------------------------------------

describe('Devanagari: headlines join where the drawn forms’ headlines are', () => {
  it('a variant with a lower headline is drawn at the class height, and the join meets it', () => {
    const p = profile(legacyUnits());
    const m = profileLayoutMetrics(p);
    expect(m.forms.get('क')[1].scale).toBeCloseTo(1 / 0.7, 2);
    expect(m.forms.get('क')[1].anchors.headlineLeft[1]).toBeCloseTo(1, 2);
    for (let seed = 0; seed < 20; seed++) {
      const word = layoutPersonalText('कमल', p, { xHeight: 20, seed: `s${seed}` }).lines[0].words[0];
      expect(word.joins).toHaveLength(2);
      for (const j of word.joins) {
        expect(j[1]).toBeCloseTo(1, 2);
        expect(j[7]).toBeCloseTo(1, 2);
      }
    }
  });

  it('a missing cluster breaks the run and shows a marker; clusters are never assembled from parts', () => {
    const p = profile(legacyUnits());
    const word = layoutPersonalText('कखल', p, { xHeight: 20 }).lines[0].words[0];
    expect(word.items.map(i => i.kind)).toEqual(['glyph', 'missing', 'glyph']);
    expect(word.joins).toHaveLength(0);
    const kiss = layoutPersonalText('कि', p, { xHeight: 20 }).lines[0].words[0];
    expect(kiss.items.map(i => i.kind)).toEqual(['missing']); // कि is not learned: no क + ि
  });
});

// --- Documents -----------------------------------------------------------------------------

describe('documents: lines, pages, mixed scripts, missing units, formatting', () => {
  const ref = 'personal:p-test10-ab12@1';
  const type = getPageType('ruled');
  const style = getHandwritingStyle(ref);
  const metrics = getPageMetrics({ pageType: type.id, style });
  const rowHeight = rowHeightFor(type, metrics, style);
  const p = profile({
    ...legacyUnits(),
    ...Object.fromEntries('cdefghijklmpqrstuvwyzQA1.:'.split('').map(c => [c, { coverage: 'observed', forms: [box(/[a-z]/.test(c) ? 1 : 1.5, 2)] }])),
  });
  const ok = { status: 'ok', profile: p };
  const page = (content, extra = {}) => paginatePersonal({ content, resolution: ok, metrics, rowHeight, seed: 'doc', ...extra });

  it('fills lines and pages in order, keeps every character, breaks sheets at form feeds', () => {
    const words = Array.from({ length: 260 }, (_, i) => ['band', 'cloak', 'gone', 'mixed', 'कमल'][i % 5]).join(' ');
    const out = page(`${words}\fsecond sheet`);
    expect(out.pages.length).toBeGreaterThan(2);
    const sheet0 = out.pages.filter(pg => pg.sheetIndex === 0);
    // Pages of a sheet tile its text exactly, and lines run on without gaps.
    expect(sheet0.map(pg => pg.text).join('')).toBe(words);
    const all = sheet0.flatMap(pg => pg.lines).flatMap(l => l.words);
    expect(all.length).toBe(260);
    all.forEach((w, i) => i && expect(w.start).toBeGreaterThan(all[i - 1].start));
    expect(out.pages[out.pages.length - 1].sheetIndex).toBe(1);
  });

  it('mixed English and Hindi: each script from the profile; what it lacks is marked and listed', () => {
    const content = 'band कमल and खग ₹ cloak';
    const out = page(content);
    expect(out.unsupported.map(u => [u.text, content.slice(u.start, u.end)])).toEqual([
      ['ख', 'ख'],
      ['ग', 'ग'],
      ['₹', '₹'],
    ]);
    const g = personalPaths(out.pages[0].lines, p, { xHeight: out.layout.personal.xHeight, rowHeight, baselineInRow: rowHeight - 1 });
    expect(g.markers.map(mk => mk.text)).toEqual(['ख', 'ग', '₹']);
  });

  it('draws headings, labels (with the hanging indent), underlines, colour, marker, size and spacing', () => {
    const content = 'Mixed band\nQ1. band and cloak band and cloak band and cloak band and cloak\nplain band cloak gone mixed band';
    const at = (s, from = 0) => content.indexOf(s, from);
    const formatting = {
      headings: [{ start: 0, end: 10, underline: true }],
      underlines: [{ start: at('plain'), end: at('plain') + 5 }],
      labels: [],
      spans: [
        { start: at('band', 40), end: at('band', 40) + 4, color: '#C62828' },
        { start: at('cloak', 60), end: at('cloak', 60) + 5, mode: 'marker', color: '#F9A825' },
        { start: at('gone'), end: at('gone') + 4, size: 1.2 },
        { start: at('mixed', 5), end: at('mixed', 5) + 6, spacing: 3 },
      ],
      gaps: [],
      autoLabels: true,
    };
    const out = page(content, { formatting });
    const lines = out.pages[0].lines;
    const xh = out.layout.personal.xHeight;
    // Heading: larger (as far as the row allows), heavier pen, underlined.
    expect(lines[0].heading).toBe(true);
    expect(lines[0].words[0].xHeight).toBeGreaterThan(xh);
    expect(lines[0].words[0].emphasis).toBe(EMPHASIS.heading);
    expect(lines[0].underlines).toHaveLength(1);
    // Label "Q1." — heavier pen; continuation lines hang after it.
    const q = lines.find(l => l.label === 'question' || l.label);
    expect(q.words[0].emphasis).toBe(EMPHASIS.label);
    const cont = lines[lines.indexOf(q) + 1];
    expect(cont.words[0].x).toBeGreaterThan(0);
    // Underlined word, colour, marker, size, spacing.
    const plainLine = lines.find(l => l.words.some(w => content.slice(w.start, w.end) === 'plain'));
    expect(plainLine.underlines).toHaveLength(1);
    const g = personalPaths(lines, p, { xHeight: xh, rowHeight, baselineInRow: rowHeight - 1 });
    expect(g.styled.some(s => s.color === '#C62828' && s.mode === 'pen')).toBe(true);
    const marker = g.styled.filter(s => s.mode === 'marker');
    expect(marker.length).toBeGreaterThan(0);
    expect(marker[0].alpha).toBe(MARKER_TEXT.alpha);
    expect(g.styled.indexOf(marker[0])).toBe(0); // marker under the pen ink
    expect(g.underlines.length).toBe(2);
    const gone = plainLine.words.find(w => content.slice(w.start, w.end) === 'gone');
    expect(gone.items[0].style.size).toBe(1.2);
    const words = plainLine.words.map(w => content.slice(w.start, w.end));
    const iMixed = words.indexOf('mixed');
    const gapBefore = (wds, i) => wds[i].x - (wds[i - 1].x + wds[i - 1].width);
    // Spacing applies to the space after the selected word (as the built-in engine).
    expect(gapBefore(plainLine.words, iMixed + 1)).toBeCloseTo(PARAMS.wordGap * xh + 3 * 0.35 * xh, 1);
    expect(gapBefore(plainLine.words, iMixed)).toBeCloseTo(PARAMS.wordGap * xh, 1);
    // Deterministic, including the hand-drawn underlines (no randomness).
    expect(page(content, { formatting })).toEqual(out);
  });

  it('says which formatting a personal handwriting does not draw, instead of dropping it silently', async () => {
    const out = page('band and cloak', { corrections: true });
    expect(out.notes.join(' ')).toMatch(/natural corrections/);
    const big = page('band gone', { formatting: { headings: [], underlines: [], labels: [], gaps: [], spans: [{ start: 5, end: 9, size: 1.4 }], autoLabels: true } });
    const cap = personalXHeight(p, Infinity, rowHeight);
    const gone = big.pages[0].lines[0].words[1];
    const drawn = gone.items[0].style.size * gone.xHeight;
    expect(drawn).toBeLessThanOrEqual(cap + 1e-9); // never taller than the ruled row allows
    if (gone.items[0].style.size < 1.4) expect(big.notes.join(' ')).toMatch(/as large as the ruled line allows/);
    const r = await render(<PersonalDocumentBanner paged={{ ...out, handwriting: { status: 'ok' } }} />);
    const banner = r.root.findAll(n => n.props.testID === 'personal-formatting-banner');
    expect(banner.length).toBeGreaterThan(0);
  });

  it('a built-in document is not paginated by the personal renderer', () => {
    expect(getHandwritingStyle('reference_student').personal).toBeFalsy();
  });
});

// --- Upstream defects found and fixed in Phase 10 -------------------------------------------

describe('fixed upstream: x-height on mixed lines, letters in the wrong zones', () => {
  it('a line half of capitals takes its x-height from its aligned x-height letters', () => {
    const lines = [{ line: 0, xHeight: 41, baseline: 100 }, { line: 1, xHeight: 28, baseline: 200 }];
    const u = (text, ln, h, state = 'aligned') => ({ text, line: ln, state, bbox: [0, 0, 10, h], kind: 'letter', script: 'Latn' });
    const ref = xHeightReference([u('a', 0, 28), u('o', 0, 29), u('n', 0, 28), u('A', 0, 41), u('e', 1, 28)], lines);
    expect(ref(0)).toEqual({ xHeight: 28, source: 'letters' });
    expect(ref(1)).toEqual({ xHeight: 28, source: 'line' }); // agrees: the line's own value
    // Too few letters, or letters that agree with the line: unchanged.
    expect(xHeightReference([u('a', 0, 28), u('A', 0, 41)], lines)(0)).toEqual({ xHeight: 41, source: 'line' });
    // Only downwards: letters taller than the line's value change nothing.
    expect(xHeightReference([u('a', 1, 40), u('o', 1, 41), u('n', 1, 40)], lines)(1)).toEqual({ xHeight: 28, source: 'line' });
  });

  it('pages written “Aa Bb Cc …” give glyphs at the same size as the alphabet page', async () => {
    const text = 'Aa Bb Cc Dd Ee Ff Gg Hh Ii\nJj Kk Ll Mm Nn Oo Pp Qq Rr';
    const pg = syntheticTextPage(text, { width: 1400, xHeight: 26, stroke: 3, top: 104, lineGap: 104, marginX: 50, height: 104 * 3 + 40 });
    const r = await analyzeSample(pg.raster, { slot: 6, knownText: text, yieldFn: async () => {}, extract: true });
    const top = rec => Math.max(...rec.form.strokes.flatMap(c => sampleChain(c, 0.05)).map(q => q[1]));
    const got = r.extraction.units.filter(x => x.status === 'extracted');
    const short = got.filter(x => 'acemnor'.includes(x.text));
    const caps = got.filter(x => /^[A-Z]$/.test(x.text) && !'J'.includes(x.text));
    expect(short.length).toBeGreaterThanOrEqual(5);
    expect(caps.length).toBeGreaterThanOrEqual(5);
    short.forEach(x => expect([x.text, Math.abs(top(x) - 1) < 0.12]).toEqual([x.text, true]));
    caps.forEach(x => expect([x.text, top(x) > 1.3]).toEqual([x.text, true]));
  });

  it('the alphabet sample: no x-height letter takes its neighbour’s ascender (c|d), every match right', async () => {
    const pg = syntheticTextPage(LATIN_ALPHABET, { width: 1400, xHeight: 26, stroke: 3, top: 104, lineGap: 104, marginX: 50, height: 104 * 4 + 40 });
    const r = await analyzeSample(pg.raster, { slot: 1, knownText: LATIN_ALPHABET, yieldFn: async () => {} });
    let aligned = 0;
    for (const u of r.alignment.observations.units.filter(x => x.state === 'aligned')) {
      aligned++;
      const t = pg.truth.units.find(x => x.start === u.source.start);
      const c = u.bbox[0] + u.bbox[2] / 2;
      expect([u.text, c >= t.x0 && c <= t.x1 && u.bbox[0] >= t.x0 - 4 && u.bbox[0] + u.bbox[2] <= t.x1 + 4]).toEqual([u.text, true]);
    }
    expect(aligned).toBeGreaterThanOrEqual(60);
    expect(LATIN_ZONES.short).toContain('c');
  });
});

describe('release state', () => {
  it('onboarding stays tied to development / validation builds', () => {
    expect(PERSONAL_HANDWRITING_ONBOARDING).toBe(VALIDATION_TOOLS);
  });
});
