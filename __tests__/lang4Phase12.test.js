/**
 * Lang4 Phase 12 — Devanagari and multilingual reliability.
 *
 * Every page here is SYNTHETIC: geometric pseudo-glyph clusters (headline,
 * stems, bowls, matras, dots — no fonts, nobody's writing), scored against
 * the fixture's own ground truth. `marksApart` places dot marks clear of
 * other strokes (as usually written); the default fixture fuses some of
 * them, which the pipeline must refuse, not store without the mark. No real
 * Hindi sample exists: nothing here is evidence of real Hindi accuracy.
 */
import { analyzeSample } from '../src/handwriting/learn/analyzeSample';
import { DOT_MARKS, expectedDots, formPointsInAnalysis, REJECTION_CODES } from '../src/handwriting/learn/glyphExtraction';
import { generatePersonalProfile } from '../src/handwriting/learn/profileGeneration';
import { layoutPersonalText, paginatePersonal, personalPaths } from '../src/handwriting/learn/personalRenderer';
import { profileLayoutMetrics } from '../src/handwriting/learn/personalMetrics';
import { buildProfileVersion } from '../src/handwriting/learn/profileBuilder';
import { DEVANAGARI_ALPHABET } from '../src/handwriting/learn/samplePrompts';
import { getHandwritingStyle } from '../src/data/handwritingStyles';
import { getPageMetrics, getPageType, rowHeightFor } from '../src/data/paper';
import { PERSONAL_HANDWRITING_ONBOARDING, VALIDATION_TOOLS } from '../src/dev/flags';
import { ALL_DEFAULT, PARAMS, SOURCES, syntheticForm } from './helpers/syntheticProfile';
import { syntheticTextPage } from './helpers/syntheticText';

jest.setTimeout(300000);

const HINDI = ['किताब पढ़ना सीखो', 'क्षमा विद्या ज्ञान प्रकाश', 'हिंदी में कुछ शब्द लिखें', 'राष्ट्र सूरज कृपा दुःख क़लम'].join('\n');
const segPts = ([x0, y0, x1, y1], step) => {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
  return Array.from({ length: n + 1 }, (_, k) => [x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
};
const nearest = (p, list) => Math.sqrt(Math.min(...list.map(q => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2)));

/**
 * Analyses a synthetic Hindi page and scores every extracted cluster: the
 * whole cluster traced (completeness ≥ 0.9 against its true centre-lines and
 * its share of the word's headline), no foreign ink (≤ 0.1 of the trace
 * away from the truth), every dot mark stored as a dot, on its own columns.
 */
async function scored(o, text = HINDI) {
  const xh = o.xHeight || 26;
  const pen = o.stroke || 3;
  const lg = Math.round(xh * 4.2);
  const lines = text.split('\n').length;
  const page = syntheticTextPage(text, { width: Math.max(1000, xh * 52), top: lg, lineGap: lg, marginX: 50, height: lg * (lines + 1) + 30, xHeight: xh, stroke: pen, ...o });
  const r = await analyzeSample(page.raster, { slot: 2, knownText: text, yieldFn: async () => {}, extract: true });
  const bad = [];
  const extracted = r.extraction.units.filter(u => u.status === 'extracted' && u.script === 'Deva');
  for (const g of extracted) {
    const t = page.truth.units.find(u => u.start === g.source.start);
    const word = page.truth.words.find(wd => wd.index === t.word);
    const own = t.centreLines.flatMap(sg => [sg[0], sg[2]]);
    const head = word && word.headline ? segPts(word.headline, 0.4).filter(p => p[0] >= Math.min(...own) && p[0] <= Math.max(...own)) : [];
    const truth = [...t.centreLines.flatMap(sg => segPts(sg, 0.4)), ...head];
    const traced = formPointsInAnalysis(g, 0.02);
    const complete = truth.filter(p => nearest(p, traced) <= Math.max(0.15 * xh, pen)).length / truth.length;
    const extra = traced.filter(p => nearest(p, truth) > Math.max(0.2 * xh, 1.5 * pen)).length / traced.length;
    const dots = g.form.strokes.filter(c => {
      const xs = c.filter((_, i) => i % 2 === 0);
      const ys = c.filter((_, i) => i % 2 === 1);
      return Math.max(...xs) - Math.min(...xs) < 0.25 && Math.max(...ys) - Math.min(...ys) < 0.25;
    }).length;
    const cx = traced.reduce((s, p) => s + p[0], 0) / traced.length;
    if (complete < 0.9 || extra > 0.1 || dots < expectedDots(g.text) || cx < Math.min(...own) - 3 || cx > Math.max(...own) + 3) {
      bad.push(`${g.text} c${complete.toFixed(2)} x${extra.toFixed(2)} dots ${dots}/${expectedDots(g.text)}`);
    }
  }
  const deva = r.alignment.observations.units.filter(u => u.script === 'Deva');
  const alignedWrong = deva.filter(u => u.state === 'aligned').filter(u => {
    const t = page.truth.units.find(x => x.start === u.source.start);
    const c = u.bbox[0] + u.bbox[2] / 2;
    return c < t.x0 - 3 || c > t.x1 + 3;
  });
  return { r, page, extracted, bad, alignedWrong, deva };
}

describe('Devanagari extraction: the whole cluster, or a refusal with its reason (synthetic, against truth)', () => {
  it('a realistic Hindi page: pre, post, above and below matras, nukta, virama, visarga, conjuncts — every kept cluster complete', async () => {
    const s = await scored({ marksApart: true });
    expect(s.alignedWrong).toEqual([]);
    expect(s.bad).toEqual([]);
    expect(s.extracted.length).toBeGreaterThanOrEqual(0.9 * s.deva.length);
    // The dot marks are stored as dots.
    for (const k of ['क़', 'ढ़', 'दुः', 'हिं', 'में']) expect([k, s.extracted.some(g => g.text === k)]).toEqual([k, true]);
  });

  it('ruled notebook, skew, blur and noise, touching clusters: nothing incomplete or foreign is kept', async () => {
    for (const o of [{ notebook: true, noise: 5, blur: 1 }, { skew: 3 }, { blur: 1, noise: 6 }, { devaTight: true }]) {
      const s = await scored({ marksApart: true, ...o });
      expect([o, s.alignedWrong.length, s.bad]).toEqual([o, 0, []]);
      expect(s.extracted.length).toBeGreaterThanOrEqual(0.85 * s.deva.length);
    }
  });

  it('a dot mark run into the strokes is refused, never stored without it', async () => {
    const s = await scored({}); // the default fixture fuses anusvara with the matra above
    expect(s.bad).toEqual([]);
    const merged = s.r.extraction.units.filter(u => u.code === 'marks-merged');
    expect(merged.map(u => u.text).sort()).toEqual(expect.arrayContaining(['में']));
    merged.forEach(u => {
      expect(expectedDots(u.text)).toBeGreaterThan(0);
      expect(u.reasons.join(' ')).toMatch(/separate dot/);
      expect(u.form).toBeUndefined();
    });
  });

  it('small writing: a visarga taken by the next cluster’s cut is caught on both sides', async () => {
    const s = await scored({ marksApart: true, xHeight: 14, stroke: 2.6 });
    expect(s.bad).toEqual([]); // before Phase 12: दुः kept without its visarga, ख kept with it
    const units = s.r.extraction.units;
    const duh = units.find(u => u.text === 'दुः');
    const kha = units[units.indexOf(duh) + 1];
    expect([duh.status, duh.code]).toEqual(['rejected', 'marks-merged']);
    expect([kha.text, kha.status, kha.code]).toEqual(['ख', 'rejected', 'neighbour-uncertain']);
    expect(kha.reasons.join(' ')).toMatch(/दुः/);
  });

  it('mixed English and Hindi on one page, ruled and small: both scripts kept correctly', async () => {
    const text = ['Hindi हिंदी and English', 'Ram राम went to स्कूल today', 'Price ₹ 20 और Q1. प्रश्न'].join('\n');
    const s = await scored({ marksApart: true, notebook: true, noise: 4, blur: 1, xHeight: 16, stroke: 2.6 }, text);
    expect(s.bad).toEqual([]);
    expect(s.extracted.length).toBeGreaterThanOrEqual(8);
    expect(s.r.extraction.units.filter(u => u.status === 'extracted' && u.script === 'Latn').length).toBeGreaterThan(10);
  });

  it('a row of nukta letters (the baseline measured at the dots) keeps every letter with its dot', async () => {
    const s = await scored({ marksApart: true }, DEVANAGARI_ALPHABET);
    expect(s.alignedWrong).toEqual([]);
    expect(s.bad).toEqual([]);
    for (const k of ['क़', 'ख़', 'ग़', 'ज़', 'ड़', 'ढ़', 'फ़']) expect([k, s.extracted.some(g => g.text === k)]).toEqual([k, true]);
    expect(s.extracted.length).toBe(s.deva.length);
  });

  it('the rejection codes and dot marks are declared', () => {
    expect(REJECTION_CODES).toEqual(expect.arrayContaining(['marks-merged', 'marks-inconsistent', 'neighbour-uncertain']));
    expect(Object.keys(DOT_MARKS).sort()).toEqual(['ँ', 'ं', 'ः', '़'].sort());
    expect(expectedDots('दुः')).toBe(2);
    expect(expectedDots('हिं')).toBe(1);
    expect(expectedDots('क़')).toBe(1);
    expect(expectedDots('क')).toBe(0);
  });
});

describe('a Hindi profile from synthetic samples (pipeline end to end)', () => {
  it('meets the Devanagari requirements with the new refusals in place', async () => {
    const samples = [];
    for (const [slot, category, text] of [[2, 'devanagari-alphabet', DEVANAGARI_ALPHABET], [4, 'devanagari-text', HINDI]]) {
      const lines = text.split('\n').length;
      const page = syntheticTextPage(text, { width: 1400, xHeight: 26, stroke: 3, top: 104, lineGap: 104, marginX: 50, height: 104 * (lines + 1) + 40, marksApart: true });
      const r = await analyzeSample(page.raster, { slot, knownText: text, sampleId: `s${slot}`, revision: 1, yieldFn: async () => {}, extract: true });
      samples.push({ metadata: { slot, category, mime: 'image/png', width: 1400, height: page.raster.height, bytes: 1400 * page.raster.height, transcription: { mode: 'prescribed' }, retained: false }, extraction: r.extraction });
    }
    const g = generatePersonalProfile({ id: 'p-test12-ab', name: 'Synthetic Hindi', now: 1000, synthetic: true, scripts: ['Deva'], samples });
    expect(g.status).toBe('created');
    g.report.requirements.forEach(q => expect([q.id, q.pass]).toEqual([q.id, true]));
    // Clusters are stored whole: no unit is assembled from parts.
    Object.entries(g.profile.units).forEach(([k, u]) => {
      if (u.coverage === 'composite') throw new Error(`${k} assembled from parts`);
    });
  });
});

// --- Rendering --------------------------------------------------------------------------------

const line = (x0, y0, x1, y1) => [x0, y0, x0 + (x1 - x0) / 3, y0 + (y1 - y0) / 3, x0 + ((x1 - x0) * 2) / 3, y0 + ((y1 - y0) * 2) / 3, x1, y1];
const cluster = (w, extra = []) => ({ coverage: 'observed', forms: [syntheticForm(w, [line(0, 1, w, 1), line(w - 0.15, 1, w - 0.15, 0), ...extra])] });
function hindiProfile() {
  const units = {
    'क': cluster(0.8),
    'म': cluster(0.75),
    'ल': cluster(0.7),
    'र': cluster(0.6),
    'त': cluster(0.7),
    'भा': cluster(1.1, [line(0.95, 1, 0.95, 0)]),
    'कि': cluster(1.0, [line(0.1, 1, 0.1, 0)]),
    'हिं': cluster(1.0, [line(0.1, 1, 0.1, 0), line(0.5, 1.4, 0.52, 1.42)]),
    'क्ष': cluster(1.2),
    a: { coverage: 'observed', forms: [syntheticForm(0.55, [line(0.05, 0.5, 0.5, 0.5)])] },
    n: { coverage: 'observed', forms: [syntheticForm(0.55, [line(0.05, 0, 0.05, 1)])] },
    d: { coverage: 'observed', forms: [syntheticForm(0.6, [line(0.5, 1.7, 0.5, 0)])] },
    'ख': { coverage: 'missing', forms: [] },
  };
  const r = buildProfileVersion({ id: 'p-test12-cd', version: 1, name: 'Synthetic Hindi render', now: 1760000000000, synthetic: true, scripts: ['Latn', 'Deva'], sources: SOURCES, metrics: {}, params: PARAMS, paramSources: ALL_DEFAULT, units });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.profile;
}

describe('Devanagari rendering: headlines join across valid neighbours and break at anything else', () => {
  const p = hindiProfile();
  const words = text => layoutPersonalText(text, p, { xHeight: 20, seed: 'r' }).lines.flatMap(l => l.words);

  it('joins every pair of neighbouring learned clusters, at the drawn headlines', () => {
    const m = profileLayoutMetrics(p);
    const [w] = words('भारत');
    expect(w.items.map(i => i.kind)).toEqual(['glyph', 'glyph', 'glyph']);
    expect(w.joins).toHaveLength(2);
    w.joins.forEach((j, k) => {
      const a = w.items[k];
      const b = w.items[k + 1];
      expect(j[0]).toBeCloseTo(a.x + m.forms.get(a.key)[a.form].anchors.headlineRight[0], 6);
      expect(j[6]).toBeCloseTo(b.x + m.forms.get(b.key)[b.form].anchors.headlineLeft[0], 6);
    });
    expect(words('क्षमत')[0].joins).toHaveLength(2); // a conjunct joins like any cluster
  });

  it('breaks at a missing cluster, an unsupported character, an orphan mark, a danda and Latin letters', () => {
    expect(words('कखल')[0].joins).toHaveLength(0); // ख is missing: no headline drawn across its box
    expect(words('कमΩलर')[0].joins).toHaveLength(2); // क–म and ल–र, not across Ω
    expect(words('कम।')[0].joins).toHaveLength(1); // the danda is no cluster
    expect(words('कमaल')[0].joins).toHaveLength(1);
    const orphan = words('ि')[0];
    expect(orphan.items.map(i => i.reason)).toEqual(['orphan-mark']);
  });

  it('never assembles a missing cluster from learned parts', () => {
    // क and ष (in क्ष) are learned, कु / कू / ग are not: markers, not क + ु.
    expect(words('कु कू ग')[0].items.map(i => i.kind)).toEqual(['missing']);
    expect(words('कु कू ग').flatMap(w => w.items).every(i => i.kind === 'missing')).toBe(true);
  });
});

describe('mixed English / Hindi documents: lines, pages, formatting, export geometry', () => {
  const p = hindiProfile();
  const ref = 'personal:p-test12-cd@1';
  const type = getPageType('ruled');
  const style = getHandwritingStyle(ref);
  const metrics = getPageMetrics({ pageType: type.id, style });
  const rowHeight = rowHeightFor(type, metrics, style);
  const page = (content, extra = {}) => paginatePersonal({ content, resolution: { status: 'ok', profile: p }, metrics, rowHeight, seed: 'doc12', ...extra });

  it('wraps and paginates mixed text, every character kept in order, punctuation marked when not learned', () => {
    const words = Array.from({ length: 240 }, (_, i) => ['भारत', 'and', 'कमल', 'क्षमता,', 'man', 'हिंदी।'][i % 6]).join(' ');
    const out = page(words);
    expect(out.pages.length).toBeGreaterThan(1);
    expect(out.pages.map(pg => pg.text).join('')).toBe(words);
    const all = out.pages.flatMap(pg => pg.lines).flatMap(l => l.words);
    expect(all).toHaveLength(240);
    all.forEach((w, i) => i && expect(w.start).toBeGreaterThan(all[i - 1].start));
    // Not in this profile: the comma, the danda, ता, दी and Latin m — marked, never borrowed.
    expect([...new Set(out.unsupported.map(u => u.text))].sort()).toEqual([',', '।', 'ता', 'दी', 'm'].sort());
  });

  it('formatting applies to Hindi as to English: heading, underline, colour, size (joins break between sizes)', () => {
    const content = 'भारत कमल\nकमल and भारत\nकमल man';
    const formatting = {
      headings: [{ start: 0, end: 8, underline: true }],
      underlines: [{ start: 9, end: 12 }],
      labels: [],
      spans: [
        { start: 17, end: 21, color: '#C62828' },
        { start: 22, end: 24, size: 1.2 },
      ],
      gaps: [],
      autoLabels: true,
    };
    const out = page(content, { formatting });
    const lines = out.pages[0].lines;
    expect(lines[0].heading).toBe(true);
    expect(lines[0].words[0].joins.length).toBe(2); // the heading's headlines join at its own size
    expect(lines[0].underlines).toHaveLength(1);
    expect(lines[1].underlines).toHaveLength(1);
    const g = personalPaths(lines, p, { xHeight: out.layout.personal.xHeight, rowHeight, baselineInRow: rowHeight - 1 });
    expect(g.styled.some(st => st.color === '#C62828')).toBe(true);
    const sized = lines[2].words[0];
    expect(sized.unjoined.some(u => /different sizes/.test(u.reason))).toBe(true); // क at 1.2× beside म at 1×
    expect(g.underlines).toHaveLength(2); // the heading's and the underlined word's
    expect(page(content, { formatting })).toEqual(out); // deterministic
  });

  it('the same document and profile version always draw the same Hindi variants', () => {
    const twoForms = { ...hindiProfile() };
    expect(layoutPersonalText('भारत कमल भारत', twoForms, { xHeight: 20, seed: 'x' })).toEqual(layoutPersonalText('भारत कमल भारत', twoForms, { xHeight: 20, seed: 'x' }));
  });
});

describe('release state', () => {
  it('onboarding stays tied to development / validation builds', () => {
    expect(PERSONAL_HANDWRITING_ONBOARDING).toBe(VALIDATION_TOOLS);
  });
});
