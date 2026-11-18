/**
 * OPT-IN Phase 14 protocol run on REAL handwriting. Skipped unless
 * REAL_SAMPLES=1.
 *
 *   REAL_SAMPLES=1 npx jest __tests__/realProtocol.optin.test.js
 *
 * Two sample sets, each described by a manifest (helpers/realProtocol.js):
 *
 *   reference   the pages that ship with the project (reference/, Latin
 *               only), with hand-annotated word boxes for two of them
 *               (realTruth/). Gates below are regression checks on these
 *               few pages, not accuracy claims.
 *   local       your own photos: real-samples/manifest.json (or the folder
 *               REAL_SAMPLES_DIR names). The folder is git-ignored; nothing
 *               in it is copied, logged or uploaded. Its results are only
 *               written to the report — no accuracy gates, since nobody has
 *               checked those pages' truth unless you add it.
 *
 * With REAL_REPORT_DIR set, a JSON report (counts, codes, word lists — no
 * pixels, checked by assertPrivate) is written there.
 */
import fs from 'fs';
import path from 'path';
import { analyzeSample } from '../src/handwriting/learn/analyzeSample';
import { generatePersonalProfile, languageSupport } from '../src/handwriting/learn/profileGeneration';
import { decodePngGray } from './helpers/pngGray';
import { REAL_CONDITIONS } from './helpers/realConditions';
import { analysisToOriginal, assertPrivate, missingSlots, summarizeAnalysis, truthWords, validateManifest } from './helpers/realProtocol';

const ROOT = path.join(__dirname, '..');
const REFERENCE = { name: 'reference', dir: path.join(ROOT, 'reference'), manifest: path.join(__dirname, 'realTruth', 'reference.manifest.json'), truthDir: path.join(__dirname, 'realTruth') };
const LOCAL_DIR = process.env.REAL_SAMPLES_DIR || path.join(ROOT, 'real-samples');
const LOCAL = { name: 'local', dir: LOCAL_DIR, manifest: path.join(LOCAL_DIR, 'manifest.json'), truthDir: LOCAL_DIR };
const ENABLED = process.env.REAL_SAMPLES === '1';
const maybe = ENABLED ? describe : describe.skip;
jest.setTimeout(900000);

const CATEGORY = { 1: 'latin-alphabet', 2: 'devanagari-alphabet', 3: 'latin-digits-text', 4: 'devanagari-text', 5: 'natural-text', 6: 'extra' };
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const truthFor = (set, sample) => {
  if (!sample.truth) return null;
  const [file, page] = sample.truth.split('#');
  const all = readJson(path.join(set.truthDir, file));
  return page ? all.pages[page] : all;
};

async function runSet(set, { conditions }) {
  const manifest = readJson(set.manifest);
  const errors = validateManifest(manifest);
  const report = { set: set.name, manifestErrors: errors, missingSlots: missingSlots(manifest), samples: {}, conditions: {}, profile: null };
  if (errors.length) return report;
  const extractions = [];
  for (const s of manifest.samples) {
    const file = path.join(set.dir, s.file);
    if (!fs.existsSync(file)) {
      report.samples[s.id] = { skipped: 'image not found' };
      continue;
    }
    const original = decodePngGray(file);
    const truth = truthFor(set, s);
    const words = truth ? truthWords(truth, s.transcription) : null;
    const names = truth && conditions ? Object.keys(REAL_CONDITIONS) : ['clean'];
    for (const name of names) {
      const { raster, toOriginal } = REAL_CONDITIONS[name](original);
      const r = await analyzeSample(raster, { slot: s.slot, knownText: s.transcription, sampleId: s.id, revision: 1, yieldFn: async () => {}, extract: true });
      const summary = summarizeAnalysis(r, { truth: words ? { words, toOriginal: analysisToOriginal(r, raster, toOriginal) } : null });
      if (name === 'clean') {
        report.samples[s.id] = { slot: s.slot, scripts: s.scripts, capture: s.capture, ...summary };
        extractions.push({ metadata: { slot: s.slot, category: CATEGORY[s.slot], mime: 'image/png', width: raster.width, height: raster.height, bytes: raster.width * raster.height, transcription: { mode: 'user', text: s.transcription }, scripts: s.scripts, retained: false }, extraction: r.extraction, rejected: r.extraction ? r.extraction.units.filter(u => u.status === 'rejected') : [] });
      } else {
        report.conditions[s.id] = report.conditions[s.id] || {};
        report.conditions[s.id][name] = summary;
      }
    }
  }
  if (extractions.length) {
    const scripts = [...new Set(manifest.samples.flatMap(s => s.scripts))];
    const g = generatePersonalProfile({ id: `p-${set.name.slice(0, 6).padEnd(6, 'x')}-ab`, name: `${set.name} samples`, now: 1000, scripts, samples: extractions.map(({ metadata, extraction }) => ({ metadata, extraction })) });
    const units = g.profile ? g.profile.units : Object.fromEntries((g.report.units || []).map(u => [u.key, { coverage: u.coverage, forms: u.coverage === 'observed' || u.coverage === 'uncertain' ? [{}] : [] }]));
    report.profile = { status: g.status, requirements: (g.report.requirements || []).map(q => ({ id: q.id, pass: q.pass, actual: q.actual, reason: q.reason || null })), support: languageSupport(units, scripts, g.report.requirements || []) };
    report.rejectionsWithoutReason = extractions.flatMap(x => x.rejected).filter(u => !u.code || !u.reasons || !u.reasons.length).length;
  }
  assertPrivate(report);
  // Your own samples' report holds their transcribed words: it is written only inside a
  // real-samples folder (git-ignored), never into a folder that may be committed.
  const reportDir = process.env.REAL_REPORT_DIR;
  const privateOk = set.name !== 'local' || (reportDir && /(^|[\\/])real-samples([\\/]|$)/.test(path.resolve(reportDir)));
  if (reportDir && privateOk) {
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(path.join(reportDir, `${set.name}-report.json`), JSON.stringify(report, null, 2));
  } else if (reportDir) {
    report.reportNotWritten = 'REAL_REPORT_DIR must be inside a real-samples folder for your own samples';
  }
  return report;
}

maybe('Phase 14 protocol on the reference pages (real, Latin only)', () => {
  let report;
  beforeAll(async () => {
    report = await runSet(REFERENCE, { conditions: true });
  });

  it('the manifest is valid; the protocol notes the slots it lacks', () => {
    expect(report.manifestErrors).toEqual([]);
    expect(report.missingSlots).toEqual([1, 2, 3, 4]); // prose pages only: no prompt pages, no Hindi
  });

  it('aligned words land on their annotated words (handwriting_03, handwriting_02)', () => {
    const h03 = report.samples['handwriting-03'].truth;
    const h02 = report.samples['handwriting-02'].truth;
    expect(h03.aligned.wrong).toEqual([]);
    expect(h03.aligned.right).toBeGreaterThanOrEqual(60);
    // Phase 15: “Q1.” no longer taken by the curled end of the margin rule (off the writing band).
    expect(h02.aligned.wrong).toEqual([]);
    expect(h02.aligned.right).toBeGreaterThanOrEqual(66);
  });

  it('under the simulated conditions, false matches stay rare (one known: a cursive split under perspective)', () => {
    const wrong = [];
    for (const id of ['handwriting-03', 'handwriting-02']) {
      Object.entries(report.conditions[id]).forEach(([name, s]) => s.truth && s.truth.aligned.wrong.forEach(t => wrong.push(`${id} ${name} ${t}`)));
    }
    expect(wrong.length).toBeLessThanOrEqual(1);
    expect(wrong.every(w => /perspective/.test(w))).toBe(true);
  });

  it('under every condition, every accepted glyph comes from its own word', () => {
    for (const id of ['handwriting-03', 'handwriting-02']) {
      const all = [report.samples[id], ...Object.values(report.conditions[id])];
      all.forEach(s => expect(s.truth ? s.truth.glyphs.elsewhere : []).toEqual([]));
    }
    expect(report.samples['handwriting-03'].extraction.extracted).toBeGreaterThanOrEqual(120);
  });

  it('pages it cannot use are refused with their reason, not half-used', () => {
    const h01 = report.samples['handwriting-01'];
    expect(h01.quality.usable).toBe(false);
    expect(h01.quality.issues).toContain('too-small');
    expect(h01.extraction.extracted).toBe(0);
    for (const id of ['handwriting-03', 'handwriting-02']) {
      const small = report.conditions[id]['writing ×0.6'];
      expect(small.quality.usable).toBe(false);
      expect(small.extraction.extracted).toBe(0);
    }
    expect(report.rejectionsWithoutReason).toBe(0);
  });

  it('the profile from these pages is refused, naming what is missing — never claimed complete', () => {
    expect(report.profile.status).toBe('insufficient');
    expect(report.profile.support.Latn.level).toBe('insufficient');
    expect(report.profile.support.Latn.required.missing).toEqual(expect.arrayContaining(['f', 'j', 'q', 'A']));
  });

  it('the report carries no pixels or paths', () => {
    expect(assertPrivate(report)).toBe(true);
    expect(JSON.stringify(report)).not.toMatch(/reference[\\/]|data:/);
  });
});

maybe('Phase 15 cursive feasibility (handwriting_02, joined hand, annotated letter boundaries)', () => {
  it('candidate cuts miss too many true boundaries to separate joined letters: every letter stays refused', async () => {
    const manifest = readJson(REFERENCE.manifest);
    const s = manifest.samples.find(x => x.id === 'handwriting-02');
    const truth = readJson(path.join(REFERENCE.truthDir, 'cursive-letter-boundaries.json'));
    const raster = decodePngGray(path.join(REFERENCE.dir, s.file));
    const r = await analyzeSample(raster, { slot: s.slot, knownText: s.transcription, sampleId: s.id, revision: 1, yieldFn: async () => {}, extract: true });
    const toOriginal = analysisToOriginal(r, raster);
    const xh = 9;
    let right = 0;
    let total = 0;
    let wholeWords = 0;
    for (const w of truth.words) {
      const word = r.alignment.observations.words.find(x => x.text === w.text && x.expectedLine === w.expectedLine);
      const units = r.alignment.observations.units.filter(u => u.word === word.word);
      expect(units.length).toBe(w.boundaries.length + 1);
      const cuts = units.slice(1).map(u => (u.bbox ? toOriginal(u.bbox[0], u.bbox[1] + u.bbox[3] / 2)[0] : null));
      const ok = cuts.filter((c, k) => c !== null && Math.abs(c - w.boundaries[k]) <= 0.35 * xh).length;
      right += ok;
      total += cuts.length;
      if (ok === cuts.length) wholeWords++;
    }
    const share = right / total;
    if (process.env.REAL_REPORT_DIR) {
      fs.mkdirSync(process.env.REAL_REPORT_DIR, { recursive: true });
      fs.writeFileSync(path.join(process.env.REAL_REPORT_DIR, 'cursive-feasibility.json'), JSON.stringify({ words: truth.words.length, cuts: total, cutsWithinTolerance: right, share: +share.toFixed(3), wordsWithEveryCutRight: wholeWords, tolerance: '0.35 x-height' }, null, 2));
    }
    // Measured Phase 15: 24 of 43 cuts (56 %) within 0.35 x-height, no word with every cut right.
    expect(share).toBeLessThan(0.9);
    expect(wholeWords).toBeLessThan(truth.words.length);
    // So the joined letters stay refused — never forced through.
    expect(r.extraction.summary.extracted).toBe(0);
    expect(r.alignment.observations.units.filter(u => u.state === 'aligned')).toEqual([]);
  });
});

maybe('Phase 14 protocol on local samples (real-samples/, never committed)', () => {
  it('runs when a local manifest exists; reports only counts', async () => {
    if (!fs.existsSync(LOCAL.manifest)) {
      // Nothing to run: no local samples (this includes any real Hindi samples).
      expect(fs.existsSync(LOCAL.manifest)).toBe(false);
      return;
    }
    const report = await runSet(LOCAL, { conditions: true });
    expect(report.manifestErrors).toEqual([]);
    expect(assertPrivate(report)).toBe(true);
  });
});
