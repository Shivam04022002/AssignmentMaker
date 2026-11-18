/* eslint-env node */
/**
 * Lang4 Phase 14 — the real-handwriting validation protocol (test tooling,
 * not app code).
 *
 *   manifest   what was photographed: per sample its slot, scripts, the
 *              exact transcription (the expected text), capture conditions
 *              (lighting, paper, skew, perspective, writing size) and
 *              provenance (who wrote it, consent, date). validateManifest()
 *              lists every problem; nothing runs on an invalid manifest.
 *   truth      optional hand-annotated word boxes (original image pixels):
 *              the only basis for "right" / "wrong" — everything else is a
 *              count or visual inspection, and is reported as such.
 *   summary    summarizeAnalysis(): quality, page, alignment and extraction
 *              counts, usable-glyph yield, refusal codes, and the same per
 *              script feature (Latin letters, digits, punctuation;
 *              Devanagari bases, vowels, matras by position, nukta,
 *              conjuncts, anusvara / visarga, danda; units on mixed-script
 *              lines), plus the word-level truth score when truth exists.
 *   privacy    assertPrivate(): a report holds numbers, codes and the
 *              transcribed text only — no pixels, no data URIs, no
 *              absolute paths. Real photos stay in the local, git-ignored
 *              real-samples/ folder; reports go where REAL_REPORT_DIR says.
 */
import { applyHomography } from '../../src/handwriting/learn/homography';
import { headlineAnchors } from '../../src/handwriting/learn/profileGeneration';
import { ROLE, splitUnits, UNIT_KIND } from '../../src/handwriting/learn/textUnits';

export const MANIFEST_VERSION = 1;
export const SCRIPTS = ['Latn', 'Deva'];
export const CAPTURE = {
  lighting: ['even', 'uneven', 'dim', 'shadow', 'flash'],
  paper: ['plain', 'ruled', 'grid', 'notebook'],
  writingSize: ['normal', 'small', 'large'],
};
/** The five samples the protocol asks for (the wizard's slots). */
export const PROTOCOL_SLOTS = [1, 2, 3, 4, 5];
export const TRUTH_TOLERANCE = { x: 4, line: 0.5 }; // px; share of the line pitch

const isRelative = p => typeof p === 'string' && p.length > 0 && !/^([a-zA-Z]:|[\\/])/.test(p) && !p.split(/[\\/]/).includes('..');

/** Every problem with a manifest (empty when valid). */
export function validateManifest(m) {
  const errors = [];
  if (!m || typeof m !== 'object') return ['manifest: not an object'];
  if (m.version !== MANIFEST_VERSION) errors.push(`version: must be ${MANIFEST_VERSION}`);
  if (!Array.isArray(m.samples) || !m.samples.length) return [...errors, 'samples: must be a non-empty list'];
  const ids = new Set();
  m.samples.forEach((s, i) => {
    const at = `samples[${i}]`;
    if (!s || typeof s !== 'object') return errors.push(`${at}: not an object`);
    if (typeof s.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,40}$/.test(s.id)) errors.push(`${at}.id: lower-case letters, digits and dashes`);
    else if (ids.has(s.id)) errors.push(`${at}.id: duplicate “${s.id}”`);
    ids.add(s.id);
    if (!isRelative(s.file) || !/\.png$/i.test(s.file)) errors.push(`${at}.file: a relative path to a .png inside the samples folder`);
    if (![1, 2, 3, 4, 5, 6].includes(s.slot)) errors.push(`${at}.slot: 1–6`);
    if (!Array.isArray(s.scripts) || !s.scripts.length || s.scripts.some(x => !SCRIPTS.includes(x))) errors.push(`${at}.scripts: from ${SCRIPTS.join(', ')}`);
    if (typeof s.transcription !== 'string' || !s.transcription.trim()) errors.push(`${at}.transcription: the exact text written (the expected text)`);
    else if (Array.isArray(s.scripts)) {
      const found = new Set(splitUnits(s.transcription).map(u => u.script).filter(x => SCRIPTS.includes(x)));
      [...found].filter(x => !s.scripts.includes(x)).forEach(x => errors.push(`${at}.scripts: the transcription contains ${x} but scripts does not list it`));
    }
    const c = s.capture;
    if (!c || typeof c !== 'object') errors.push(`${at}.capture: lighting, paper, writingSize, skewDeg, perspective`);
    else {
      Object.entries(CAPTURE).forEach(([k, allowed]) => !allowed.includes(c[k]) && errors.push(`${at}.capture.${k}: one of ${allowed.join(', ')}`));
      if (typeof c.skewDeg !== 'number' || Math.abs(c.skewDeg) > 45) errors.push(`${at}.capture.skewDeg: estimated tilt in degrees`);
      if (typeof c.perspective !== 'boolean') errors.push(`${at}.capture.perspective: true when photographed at an angle`);
    }
    const p = s.provenance;
    if (!p || typeof p !== 'object' || typeof p.source !== 'string' || !p.source.trim()) errors.push(`${at}.provenance.source: who wrote it and how it was captured`);
    else if (p.consent !== true) errors.push(`${at}.provenance.consent: the writer agreed to this local test (true)`);
    if (s.truth !== undefined && !isRelative(s.truth)) errors.push(`${at}.truth: a relative path to a word-box file`);
  });
  return errors;
}

/** Slots the protocol expects but the manifest lacks (a warning, not an error). */
export const missingSlots = m => PROTOCOL_SLOTS.filter(slot => !(m.samples || []).some(s => s.slot === slot));

// --- Script features -------------------------------------------------------------------------

const DANDA = new Set(['।', '॥']);
const isVowelLetter = cp => (cp >= 0x0904 && cp <= 0x0914) || cp === 0x0960 || cp === 0x0961;

/** The script features a unit exercises (a unit can have several). */
export function unitFeatures(u, mixedLine = false) {
  const out = [];
  if (u.script === 'Latn' && u.kind === UNIT_KIND.LETTER) out.push(/[A-Z]/.test(u.text) ? 'latin-capital' : 'latin-letter');
  if (u.kind === UNIT_KIND.DIGIT) out.push('digit');
  if (u.kind === UNIT_KIND.PUNCTUATION || u.kind === UNIT_KIND.SYMBOL) out.push(DANDA.has(u.text) ? 'danda' : 'punctuation');
  if (u.script === 'Deva' && u.kind === UNIT_KIND.CLUSTER) {
    const parts = (u.relation ? u.relation.components : u.components) || [];
    const roles = parts.map(c => c.role);
    out.push(isVowelLetter(u.text.codePointAt(0)) ? 'deva-vowel' : 'deva-consonant');
    parts.filter(c => c.role === ROLE.MATRA).forEach(c => out.push(`deva-matra-${c.position || 'post'}`));
    if (roles.includes(ROLE.NUKTA)) out.push('deva-nukta');
    if ((u.relation && u.relation.conjunct) || u.conjunct) out.push('deva-conjunct');
    if (roles.includes(ROLE.VIRAMA) && !((u.relation && u.relation.conjunct) || u.conjunct)) out.push('deva-halant');
    if (roles.includes(ROLE.MODIFIER)) out.push('deva-anusvara-visarga');
  }
  if (mixedLine) out.push('mixed-script-line');
  return out;
}

// --- Frames ----------------------------------------------------------------------------------

/**
 * Maps a point of the analysis frame (where alignment boxes live: the
 * rectified page when one was found, deskewed when skew was applied) back
 * to the analysed photo's pixels; `toOriginal` then maps photo pixels to
 * the annotated original (identity for an unaltered photo).
 */
export function analysisToOriginal(r, photo, toOriginal = (x, y) => [x, y]) {
  const w = r.page && r.page.size ? r.page.size.width : photo.width;
  const h = r.page && r.page.size ? r.page.size.height : photo.height;
  const a = r.skew && r.skew.applied ? (r.skew.angle * Math.PI) / 180 : 0;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return (x, y) => {
    const dx = x - w / 2;
    const dy = y - h / 2;
    let p = [dx * c + dy * s + w / 2, -dx * s + dy * c + h / 2];
    if (r.page && r.page.homography) p = applyHomography(r.page.homography, p[0], p[1]);
    return toOriginal(p[0], p[1]);
  };
}

// --- Ground truth ----------------------------------------------------------------------------

/** Truth words in transcription order: { text, x0, x1, y, line }; checks they match the text. */
export function truthWords(truth, transcription) {
  const words = truth.lines.flatMap((l, line) => l.words.map(([text, x0, x1]) => ({ text, x0, x1, y: l.y, line })));
  const expected = transcription.split(/\s+/).filter(Boolean);
  if (words.map(w => w.text).join(' ') !== expected.join(' ')) throw new Error('truth words do not follow the transcription');
  return words;
}

/**
 * Word-level truth score: an aligned word is right when the centre of its
 * box (mapped to the original) lies on its annotated word (± x tolerance)
 * and line (± half the line pitch). Units and accepted glyphs are scored
 * the same way against their word — "in the right word", not "the right
 * letter" (letter identity needs visual inspection).
 */
export function scoreAgainstTruth(r, words, toOriginal) {
  const ys = [...new Set(words.map(w => w.y))].sort((p, q) => p - q);
  const pitch = ys.length > 1 ? Math.min(...ys.slice(1).map((y, i) => y - ys[i])) : 40;
  const on = (bbox, t) => {
    const [x, y] = toOriginal(bbox[0] + bbox[2] / 2, bbox[1] + bbox[3] / 2);
    return x >= t.x0 - TRUTH_TOLERANCE.x && x <= t.x1 + TRUTH_TOLERANCE.x && Math.abs(y - t.y) <= pitch * TRUTH_TOLERANCE.line;
  };
  const obs = r.alignment.observations;
  const out = { truthWords: words.length, aligned: { right: 0, wrong: [] }, ambiguous: { onTheirWord: 0, elsewhere: 0 }, missing: 0, units: { right: 0, wrong: 0 }, glyphs: { inTheirWord: 0, elsewhere: [] } };
  obs.words.forEach(w => {
    if (!w.bbox) {
      out.missing++;
      return;
    }
    const ok = on(w.bbox, words[w.word]);
    if (w.state === 'aligned') ok ? out.aligned.right++ : out.aligned.wrong.push(w.text);
    else if (w.state === 'ambiguous') ok ? out.ambiguous.onTheirWord++ : out.ambiguous.elsewhere++;
  });
  obs.units.filter(u => u.state === 'aligned' && u.bbox).forEach(u => (on(u.bbox, words[u.word]) ? out.units.right++ : out.units.wrong++));
  (r.extraction ? r.extraction.units : [])
    .filter(g => g.status === 'extracted')
    .forEach(g => {
      const u = obs.units.find(x => x.source.start === g.source.start);
      on(u.bbox, words[u.word]) ? out.glyphs.inTheirWord++ : out.glyphs.elsewhere.push(g.text);
    });
  const aligned = out.aligned.right + out.aligned.wrong.length;
  out.alignedPrecision = aligned ? +(out.aligned.right / aligned).toFixed(3) : null;
  out.alignedRecall = +(out.aligned.right / words.length).toFixed(3);
  return out;
}

// --- Summary ---------------------------------------------------------------------------------

const count = (list, key) => {
  const acc = {};
  list.forEach(x => (acc[key(x)] = (acc[key(x)] || 0) + 1));
  return acc;
};

/** Counts for one analysed sample (no pixels). `truth`: { words, toOriginal } or null. */
export function summarizeAnalysis(r, { truth = null } = {}) {
  const ex = r.extraction ? r.extraction.units : [];
  const obs = r.alignment && r.alignment.observations ? r.alignment.observations : { units: [], words: [] };
  const lineScripts = new Map();
  obs.units.forEach(u => {
    const k = u.expectedLine;
    if (!lineScripts.has(k)) lineScripts.set(k, new Set());
    if (SCRIPTS.includes(u.script)) lineScripts.get(k).add(u.script);
  });
  const byFeature = {};
  obs.units.forEach(u => {
    const g = ex.find(x => x.source && x.source.start === u.source.start);
    unitFeatures(u, (lineScripts.get(u.expectedLine) || new Set()).size > 1).forEach(f => {
      const b = (byFeature[f] = byFeature[f] || { units: 0, aligned: 0, extracted: 0, rejected: {} });
      b.units++;
      if (u.state === 'aligned') b.aligned++;
      if (g && g.status === 'extracted') b.extracted++;
      else if (g && g.status === 'rejected') b.rejected[g.code] = (b.rejected[g.code] || 0) + 1;
    });
  });
  Object.values(byFeature).forEach(b => (b.yield = b.units ? +(b.extracted / b.units).toFixed(3) : 0));
  const extracted = ex.filter(g => g.status === 'extracted').length;
  // Devanagari headlines: accepted clusters whose traced form has a headline run a renderer can join.
  const devaKept = ex.filter(g => g.status === 'extracted' && g.script === 'Deva' && g.kind === UNIT_KIND.CLUSTER);
  const headlines = devaKept.length ? { clusters: devaKept.length, traced: devaKept.filter(g => headlineAnchors(g.form)).length } : null;
  return {
    quality: { score: r.quality.score.score, usable: r.quality.usable, issues: r.quality.issues.map(i => i.code) },
    page: { status: r.page.status, rectified: !!r.page.homography },
    orientation: r.orientation ? r.orientation.status : null,
    skew: { angle: r.skew.angle, applied: !!r.skew.applied },
    lines: r.segmentation ? r.segmentation.lines.length : 0,
    alignment: r.alignment && r.alignment.summary ? { words: r.alignment.summary.words, units: r.alignment.summary.units } : null,
    extraction: { considered: ex.length, extracted, yield: ex.length ? +(extracted / ex.length).toFixed(3) : 0, rejected: count(ex.filter(g => g.status === 'rejected'), g => g.code) },
    byFeature,
    headlines,
    truth: truth ? scoreAgainstTruth(r, truth.words, truth.toOriginal) : null,
  };
}

// --- Privacy ---------------------------------------------------------------------------------

/** Throws when a report could carry handwriting pixels or a private path. */
export function assertPrivate(report) {
  const walk = (v, at) => {
    if (v === null || v === undefined) return;
    if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer) throw new Error(`${at}: binary data in a report`);
    if (typeof v === 'string') {
      if (/^data:/i.test(v) || /[A-Za-z0-9+/]{200,}={0,2}/.test(v)) throw new Error(`${at}: encoded data in a report`);
      if (/^([a-zA-Z]:[\\/]|\/(home|Users|tmp|var)\/)/.test(v)) throw new Error(`${at}: an absolute path in a report`);
      return;
    }
    if (Array.isArray(v)) {
      if (v.length > 4096) throw new Error(`${at}: a list long enough to hold an image`);
      return v.forEach((x, i) => walk(x, `${at}[${i}]`));
    }
    if (typeof v === 'object') Object.entries(v).forEach(([k, x]) => walk(x, `${at}.${k}`));
  };
  walk(report, 'report');
  return true;
}
