/**
 * Glyph geometry extraction (Lang4 Phase 5): renderer-format forms
 * { w, weight, strokes } from the units Phase 4 aligned reliably.
 *
 * Only an observation that is 'aligned' — both boundaries real gaps, a good
 * position fit, no blur or structure doubt, a usable image (Phase 4.1) — and
 * whose neighbours in its word are aligned too is traced: next to an
 * ambiguous neighbour the boundary is confirmed from one side only, and the
 * ink between them (a b's bowl, a g's stem) may belong to either letter, so
 * the glyph may be incomplete. Everything else is rejected with a code and its reasons; nothing
 * is guessed, completed or borrowed from another unit. One Devanagari
 * cluster is one glyph: its matras, marks and conjunct parts stay together
 * because Phase 4 kept them in one region, and extraction never cuts inside
 * a region.
 *
 *   crop        the unit's region of the text mask (deskewed analysis
 *               frame) — exactly its own columns and ink rows, nothing of a
 *               neighbour (its cuts are gaps with no ink)
 *   trace       skeleton.js: centre-lines assembled into plausible strokes
 *   fit         strokeFit.js: cubic chains, then fidelity against the ink,
 *               measured with the page's stroke width (a unit's own
 *               estimate is inflated by the very blobs fidelity must catch):
 *               a counter closed by ink thins to a stub that leaves ink
 *               unexplained, and a trace that does not reproduce the ink is
 *               rejected — never kept as a stub
 *   normalise   x-height units: x from the glyph's left (+ PAD), y up from
 *               the baseline; 1 = the line's x-height between stroke
 *               centres (ink x-height − stroke width), as in the hand-made
 *               sets (strokes are centre-lines drawn with a pen width).
 *               A line written only in capitals, digits or ascender letters
 *               has no x-height of its own (its measured "x-height" is the
 *               cap height): its glyphs use the median x-height of the
 *               sample's lines that have x-height letters, or are rejected
 *               ('scale-unknown') when there is none
 *
 * The result is geometry of the *final ink*: plausible centre-line strokes,
 * not the writer's pen movement, order or pressure, which a photo does not
 * contain. Each result keeps its source (sample, revision, slot, text
 * range), the coordinate transforms back to the analysis and source images,
 * its confidence (Phase 4 scores × trace fidelity) and method. No pixels.
 *
 * Extraction does not build profiles or register anything: Phase 6 decides
 * which extracted forms become a profile's units.
 */
import { ALIGNMENT_THRESHOLDS } from './alignmentConfidence';
import { validateScore } from './confidence';
import { applyHomography } from './homography';
import { validateGlyphForm } from './profileSchema';
import { fitStroke, sampleChain, traceFidelity } from './strokeFit';
import { components8, traceStrokes } from './skeleton';
import { strokeWidthIn } from './unitBoundaries';
import { dot } from '../strokeBuilder';

export const EXTRACTION = {
  MIN_XHEIGHT_PX: 10, // smaller writing has too few pixels per stroke to trace
  FIDELITY_MIN: 0.85, // below: the traced lines do not reproduce the ink
  PAD: 0.06, // x-heights of side bearing on each side (as FORM_WIDTH.pad)
  CROP_MARGIN: 2, // px of paper around the crop (thinning needs a border)
};

export const EXTRACTION_STATUS = ['extracted', 'rejected'];
export const REJECTION_CODES = [
  'image-unusable',
  'not-aligned', // ambiguous / missing / low-quality / unsupported in Phase 4
  'below-threshold',
  'overlaps-neighbour',
  'neighbour-uncertain', // a neighbour in the word is not aligned: the shared boundary is unconfirmed
  'marks-inconsistent', // Devanagari marks missing, unexplained or straddling
  'structure-conflict',
  'no-sample-slot',
  'too-small',
  'scale-unknown', // a line without x-height letters, and no other line to measure it on
  'no-ink',
  'trace-unfaithful',
  'outside-band',
  'counter-unresolved', // a letter's counter (e's eye, a's bowl) is too small to tell from a pinhole (Phase 11)
  'metrics-inconsistent', // an x-height letter's ink does not span the line's x-height band (Phase 11)
  'marks-merged', // a Devanagari dot mark (anusvara, chandrabindu's dot, visarga, nukta) is not a separate dot in the ink (Phase 12)
];

/**
 * Devanagari marks written as separate dots: anusvara ं, the dot of
 * chandrabindu ँ, nukta ़ (one each) and visarga ः (two). When the traced
 * cluster has fewer separate dots than its text has, a mark has run into
 * the cluster's strokes (small writing, a heavy pen): the cluster would be
 * stored without it, or with it as part of a stroke. It is refused — never
 * completed from another glyph (Phase 12).
 */
export const DOT_MARKS = { '\u0901': 1, '\u0902': 1, '\u0903': 2, '\u093c': 1 };

const DOT_MARK_NAMES = { '\u0901': 'chandrabindu', '\u0902': 'anusvara', '\u0903': 'visarga', '\u093c': 'nukta' };
/** The dot marks of a unit's text, by name ("visarga", "anusvara and nukta"). */
export function dotMarkNames(text) {
  const names = [...new Set([...text].filter(ch => DOT_MARK_NAMES[ch]).map(ch => DOT_MARK_NAMES[ch]))];
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] || 'dot mark';
}

/** How many separate dots a unit's text has (Devanagari dot marks). */
export function expectedDots(text) {
  let n = 0;
  for (const ch of text) n += DOT_MARKS[ch] || 0;
  return n;
}

/**
 * Marks that may stand apart from a cluster's body: matras below (ु ू ृ ॄ),
 * virama, chandrabindu's arc, and the strokes above the headline of
 * े ै ो ौ (and ॅ ॆ).
 * A cluster whose ink has more pieces apart from its body than its dot
 * marks plus these holds a mark that is not its own (a neighbour's visarga,
 * a stray dot): it is refused as marks-inconsistent (Phase 12).
 */
const DETACHABLE = new Set(['\u0941', '\u0942', '\u0943', '\u0944', '\u094d', '\u0901', '\u0945', '\u0946', '\u0947', '\u0948', '\u094b', '\u094c']);
export function detachableMarks(text) {
  let n = 0;
  for (const ch of text) if (DETACHABLE.has(ch)) n++;
  return n;
}

/**
 * An x-height letter (a c e m n o r s u v w x z) stands on the baseline and
 * reaches the x-height. Placed by its line's baseline and x-height, its ink
 * must span about 0–1: a bottom above SPAN.maxBottom or a top outside
 * SPAN.top means the line's measurements do not hold here (a title line
 * whose band took in capitals, a letter written off the line) — its size
 * and position in a profile would be wrong, so it is refused (Phase 11).
 * Synthetic pages: bottom ≤ 0.09, top 0.90–1.08; the real reference page:
 * bottom ≤ 0.26 but for the one letter this refuses, top 0.74–1.27.
 */
export const SPAN = { maxBottom: 0.3, top: [0.6, 1.45] };

/**
 * Letters drawn round an enclosed counter. When the only paper such a
 * letter's ink encloses is a pinhole-sized hole (filled before tracing, as
 * a binarisation pinhole would be), or when it encloses none and its ink
 * leaves almost no paper inside its outline (COUNTER_SPACE: the bowl filled
 * in), the image cannot show whether the counter is there: an e whose eye
 * closed up would be traced as a c, an a whose bowl filled in as a stroke.
 * The glyph is rejected rather than traced either way (Phase 11).
 */
export const COUNTER_LETTERS = new Set('abdegopqABDOPQR0689'.split(''));
/**
 * Paper inside the convex hull of a counter letter's ink, as a share of the
 * hull: a bowl (open or closed) leaves about a third or more; one filled
 * in by a thick pen at a small size leaves well under COUNTER_SPACE
 * (synthetic x-height 10–14: 0.10–0.25; x-height 26: ≥ 0.33; the real
 * reference page: ≥ 0.34).
 */
export const COUNTER_SPACE = 0.28;

const cross2 = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Share of the crop's ink convex hull (pixel squares) that is paper. */
export function hullPaperShare(crop, cw, ch) {
  const pts = [];
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (crop[y * cw + x]) pts.push([x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]);
  if (pts.length < 12) return 0;
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const lower = [];
  for (const q of pts) {
    while (lower.length >= 2 && cross2(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const q = pts[i];
    while (upper.length >= 2 && cross2(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  let all = 0;
  let paper = 0;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const c = [x + 0.5, y + 0.5];
      if (!hull.every((a, i) => cross2(a, hull[(i + 1) % hull.length], c) >= 0)) continue;
      all++;
      if (!crop[y * cw + x]) paper++;
    }
  }
  return all ? paper / all : 0;
}

const r3 = v => Math.round(v * 1000) / 1000;
const MARK_DOUBT = /straddles|ink above the headline here that the text does not explain|ink below the baseline here that the text does not explain|expected a mark/;
const STRUCTURE_DOUBT = /contradicts the typed cluster structure/;

// --- Coordinate transforms -------------------------------------------------------------

/**
 * The transform record of one glyph:
 *   glyph     { originX, baselineY, unitPx } — glyph (gx, gy) ↔ frame pixel
 *             (originX + gx · unitPx, baselineY − gy · unitPx)
 *   frame     'deskewed' | 'original' (the frame alignment worked in)
 *   deskew    { angle (deg), cx, cy } when the analysis was straightened —
 *             the same rotation preprocess.rotateMask applied
 *   analysis  { width, height } of the analysis raster
 *   page      { homography, photo: { width, height } } when the analysis
 *             raster is the page cut out of the photo and straightened
 *             (Phase 9): homography maps analysis positions to the photo
 *             (the decoded raster); null otherwise
 *   source    { width, height, scale } of the upright source image the
 *             photo was decoded from (scale = source px per photo px),
 *             when known
 * Points are continuous coordinates (pixel x covers [x, x + 1)).
 */
export function glyphToFrame([gx, gy], t) {
  return [t.glyph.originX + gx * t.glyph.unitPx, t.glyph.baselineY - gy * t.glyph.unitPx];
}

export function frameToGlyph([x, y], t) {
  return [(x - t.glyph.originX) / t.glyph.unitPx, (t.glyph.baselineY - y) / t.glyph.unitPx];
}

/** Deskewed frame → analysis raster (the inverse of the straightening). */
export function frameToAnalysis([x, y], t) {
  if (!t.deskew) return [x, y];
  const a = (t.deskew.angle * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  // rotateMask: output pixel centre (X, Y) samples the source at
  // ((X − ½ − cx) c + (Y − ½ − cy) s + cx + ½, −(X − ½ − cx) s + (Y − ½ − cy) c + cy + ½).
  const dx = x - 0.5 - t.deskew.cx;
  const dy = y - 0.5 - t.deskew.cy;
  return [dx * c + dy * s + t.deskew.cx + 0.5, -dx * s + dy * c + t.deskew.cy + 0.5];
}

export function analysisToFrame([x, y], t) {
  if (!t.deskew) return [x, y];
  const a = (t.deskew.angle * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const dx = x - 0.5 - t.deskew.cx;
  const dy = y - 0.5 - t.deskew.cy;
  return [dx * c - dy * s + t.deskew.cx + 0.5, dx * s + dy * c + t.deskew.cy + 0.5];
}

/** Analysis raster → the decoded photo (through the page rectification, when there was one). */
export function analysisToPhoto([x, y], t) {
  return t.page ? applyHomography(t.page.homography, x, y) : [x, y];
}

export function analysisToSource(p, t) {
  if (!t.source) return null;
  const [x, y] = analysisToPhoto(p, t);
  return [x * t.source.scale, y * t.source.scale];
}

export const glyphToAnalysis = (p, t) => frameToAnalysis(glyphToFrame(p, t), t);
export const glyphToSource = (p, t) => analysisToSource(glyphToAnalysis(p, t), t);

// --- Extraction ---------------------------------------------------------------------------

function reject(base, code, reasons) {
  return { ...base, status: 'rejected', code, reasons: reasons.length ? reasons : [code] };
}

/** Whole cubic chains mapped point by point (controls are affine-mapped too). */
const mapChain = (chain, f) => {
  const out = [];
  for (let i = 0; i < chain.length; i += 2) out.push(...f([chain[i], chain[i + 1]]));
  return out;
};

/**
 * Extracts one aligned unit. `ctx`: { mask, width, height, lines (Map),
 * usable, slot, transformBase }.
 */
function extractUnit(u, ctx) {
  const base = {
    level: 'glyph',
    sampleId: u.sampleId,
    revision: u.revision,
    slot: ctx.slot,
    source: { start: u.source.start, end: u.source.end },
    word: u.word,
    text: u.text,
    key: u.key,
    script: u.script,
    kind: u.kind,
    ...(u.relation ? { relation: u.relation } : null),
    observation: {
      state: u.state,
      frame: u.frame,
      line: u.line,
      bbox: u.bbox,
      boundary: u.boundaryConfidence ? u.boundaryConfidence.score : null,
      alignment: u.alignmentConfidence ? u.alignmentConfidence.score : null,
    },
    method: 'skeleton-trace',
  };
  if (!ctx.usable) return reject(base, 'image-unusable', ['the image was not usable for analysis']);
  if (u.state !== 'aligned' || !u.bbox) return reject(base, 'not-aligned', [`Phase 4 state: ${u.state}`, ...u.reasons]);
  if (u.boundaryConfidence.score < ALIGNMENT_THRESHOLDS.boundaryOk || u.alignmentConfidence.score < ALIGNMENT_THRESHOLDS.alignmentOk) {
    return reject(base, 'below-threshold', [`boundary ${u.boundaryConfidence.score}, alignment ${u.alignmentConfidence.score}`]);
  }
  if (u.overlapsNeighbor) return reject(base, 'overlaps-neighbour', ['its region overlaps a neighbour']);
  const doubtful = [ctx.prev, ctx.next].filter(n => n && n.word === u.word && n.state !== 'aligned');
  if (doubtful.length) {
    return reject(base, 'neighbour-uncertain', doubtful.map(n => `its neighbour “${n.text}” is ${n.state}: the boundary between them is not confirmed from both sides, so this glyph may be missing ink or carry some of its neighbour's`));
  }
  const structure = u.reasons.filter(t => STRUCTURE_DOUBT.test(t));
  if (structure.length) return reject(base, 'structure-conflict', structure);
  const marks = u.reasons.filter(t => MARK_DOUBT.test(t));
  if (marks.length) return reject(base, 'marks-inconsistent', marks);
  if (!Number.isInteger(ctx.slot) || ctx.slot < 1) return reject(base, 'no-sample-slot', ['extraction needs the sample slot (1–6) the image belongs to']);
  const line = ctx.lines.get(u.line);
  const scale = ctx.xHeightOf(u.line);
  if (scale.source === 'unknown') {
    return reject(base, 'scale-unknown', ['this line has no x-height letters (only capitals, digits or tall letters) and no other line of the sample gives the x-height']);
  }
  if (!line || !(scale.xHeight >= EXTRACTION.MIN_XHEIGHT_PX)) {
    return reject(base, 'too-small', [`x-height ${line ? scale.xHeight : '?'} px; at least ${EXTRACTION.MIN_XHEIGHT_PX} px are needed to trace strokes`]);
  }

  // Crop: the unit's own columns and ink rows, with a paper margin.
  const M = EXTRACTION.CROP_MARGIN;
  const [bx, by, bw, bh] = u.bbox;
  const cw = bw + 2 * M;
  const ch = bh + 2 * M;
  const crop = new Uint8Array(cw * ch);
  let inkCount = 0;
  for (let y = 0; y < bh; y++) {
    const src = (by + y) * ctx.width + bx;
    for (let x = 0; x < bw; x++) {
      if (ctx.mask[src + x]) {
        crop[(y + M) * cw + x + M] = 1;
        inkCount++;
      }
    }
  }
  if (!inkCount) return reject(base, 'no-ink', ['no ink inside the region']);
  const sw = ctx.strokeWidth; // the page's (see fit, above)
  const traced = traceStrokes(crop, cw, ch, sw);
  if (!traced.strokes.length) return reject(base, 'no-ink', ['the ink left no centre-line to trace']);
  const space = COUNTER_LETTERS.has(u.text) && !traced.diagnostics.counters ? hullPaperShare(crop, cw, ch) : 1;
  if (COUNTER_LETTERS.has(u.text) && !traced.diagnostics.counters && (traced.diagnostics.pinholes || space < COUNTER_SPACE)) {
    const why = traced.diagnostics.pinholes ? 'the paper it encloses is pinhole-sized' : `only ${Math.round(space * 100)} % of its outline is paper: the counter is filled in`;
    return reject(base, 'counter-unresolved', [`${why} at this size and pen width: whether “${u.text}” has its counter cannot be told, so its shape is not traced`]);
  }
  const dotsWanted = u.script === 'Deva' ? expectedDots(u.text) : 0;
  const dotsFound = traced.strokes.filter(t => t.dot).length;
  if (dotsFound < dotsWanted) {
    return reject(base, 'marks-merged', [`the ${dotMarkNames(u.text)} of “${u.text}” should be ${dotsWanted} separate dot${dotsWanted > 1 ? 's' : ''} but the ink shows ${dotsFound}: it has run into the cluster's strokes (or into a neighbour's cut) and would be lost or traced as part of them`]);
  }
  if (u.script === 'Deva') {
    // Everything of a cluster hangs from its headline but its detachable
    // marks: pieces apart from the main body beyond those are not its own.
    const pieces = components8(crop, cw, ch).filter(c => c.pixels.length >= 2).length;
    const explained = dotsWanted + detachableMarks(u.text);
    if (pieces - 1 > explained) {
      return reject(base, 'marks-inconsistent', [`the ink holds ${pieces - 1} piece${pieces - 1 > 1 ? 's' : ''} apart from the cluster's body where “${u.text}” explains ${explained}: a neighbour's mark (a visarga, a dot) is in this cluster's region`]);
    }
  }
  const fitted = traced.strokes.map(s => fitStroke(s, sw));
  const dotDisks = traced.strokes.filter(t => t.dot).map(t => ({ x: t.points[0][0], y: t.points[0][1], radius: t.radius || sw / 2 }));
  const fidelity = traceFidelity(crop, cw, ch, fitted.map(f => f.chain), sw, dotDisks);

  // Normalise to x-height units.
  const unitPx = Math.max(1, scale.xHeight - sw);
  const baselineY = line.baseline + 1 - sw / 2;
  const ox = bx - M;
  const oy = by - M;
  let minX = Infinity;
  let maxX = -Infinity;
  for (const f of fitted) {
    for (let i = 0; i < f.chain.length; i += 2) {
      if (f.chain[i] < minX) minX = f.chain[i];
      if (f.chain[i] > maxX) maxX = f.chain[i];
    }
  }
  const originX = ox + minX - EXTRACTION.PAD * unitPx;
  const transform = { ...ctx.transformBase, frame: u.frame, glyph: { originX: r3(originX), baselineY: r3(baselineY), unitPx: r3(unitPx), xHeightSource: scale.source } };
  const toGlyph = ([x, y]) => frameToGlyph([ox + x, oy + y], transform).map(r3);
  const strokes = fitted.map((f, k) => {
    if (f.dot) {
      const [gx, gy] = toGlyph(traced.strokes[k].points[0]);
      return dot(gx, gy).pts.map(r3);
    }
    return mapChain(f.chain, toGlyph);
  });
  const w = r3((maxX - minX) / unitPx + 2 * EXTRACTION.PAD);
  const scoreIn = Math.min(u.boundaryConfidence.score, u.alignmentConfidence.score);
  const confidence = {
    score: r3(scoreIn * fidelity.score),
    basis: 'weaker of the Phase 4 boundary and alignment scores (which carry image quality) × trace fidelity (ink covered by the traced lines, lines lying on ink)',
    inputs: { boundary: u.boundaryConfidence.score, alignment: u.alignmentConfidence.score, fidelity: fidelity.score, inkCovered: fidelity.inkCovered, curveOnInk: fidelity.curveOnInk, upstream: u.boundaryConfidence.inputs.upstream },
  };
  const form = {
    w,
    weight: 1,
    strokes,
    method: 'skeleton-trace',
    confidence,
    observations: [{ sample: ctx.slot, bbox: u.bbox.slice() }],
  };
  const diagnostics = {
    strokes: strokes.length,
    dots: traced.diagnostics.dots,
    junctions: traced.diagnostics.junctions,
    loops: traced.strokes.filter(s => s.closed).length,
    joins: traced.diagnostics.joins,
    spursRemoved: traced.diagnostics.spursRemoved,
    fitErrorPx: r3(Math.max(0, ...fitted.map(f => f.error))),
    strokeWidth: r3(sw / unitPx),
    unitPx: r3(unitPx),
  };
  const result = { ...base, status: 'extracted', reasons: [], form, confidence, transform, diagnostics };
  if (fidelity.score < EXTRACTION.FIDELITY_MIN) {
    return reject({ ...base, confidence, diagnostics }, 'trace-unfaithful', [`the traced lines reproduce the ink poorly (ink covered ${fidelity.inkCovered}, lines on ink ${fidelity.curveOnInk}; at least ${EXTRACTION.FIDELITY_MIN} needed)`]);
  }
  const band = validateGlyphForm(form, { synthetic: false }, 'form');
  if (band.length) return reject({ ...base, confidence, diagnostics }, 'outside-band', band);
  if (X_HEIGHT_LETTERS.has(u.text)) {
    const ys = strokes.flatMap(c => sampleChain(c, 0.05)).map(q => q[1]);
    const bottom = Math.min(...ys);
    const top = Math.max(...ys);
    if (bottom > SPAN.maxBottom || top < SPAN.top[0] || top > SPAN.top[1]) {
      return reject({ ...base, confidence, diagnostics }, 'metrics-inconsistent', [`its ink spans ${r3(bottom)}–${r3(top)} x-heights on its line, where “${u.text}” spans about 0–1: the line's baseline or x-height does not hold for it, so its size and position would be wrong`]);
    }
  }
  if (u.script === 'Deva' && u.relation && u.relation.conjunct) result.reasons.push('conjunct traced as one glyph; its consonant parts are not separated');
  if (scale.source === 'sample') result.reasons.push(`x-height taken from the sample's other lines (${scale.xHeight} px): this line has no x-height letters`);
  return result;
}

/** Letters whose body is exactly the x-height (no ascender, descender or dot). */
const X_HEIGHT_LETTERS = new Set('acemnorsuvwxz'.split(''));

/**
 * Where each line's x-height comes from: its own measurement when the text
 * on it has x-height letters (or Devanagari clusters, measured headline to
 * baseline); otherwise the median of those lines; otherwise unknown.
 * On a line that mixes capitals and lowercase ("Aa Bb Cc"), the line band
 * can take in the capitals' height; when at least LETTER_XHEIGHT.min
 * aligned x-height letters on the line agree on an ink height more than
 * LETTER_XHEIGHT.disagree below the line's, theirs is used (source
 * 'letters'). Only downwards: capitals can widen a line's band, nothing
 * narrows it, so letters taller than the line's value change nothing.
 * Returns line → { xHeight, source: 'line' | 'letters' | 'sample' | 'unknown' }.
 */
export const LETTER_XHEIGHT = { min: 3, disagree: 0.15 };

export function xHeightReference(units, lines) {
  const own = new Set();
  const letters = new Map();
  for (const u of units) {
    if (u.line === null || u.line === undefined) continue;
    if (X_HEIGHT_LETTERS.has(u.text) || (u.script === 'Deva' && u.kind === 'cluster')) own.add(u.line);
    if (X_HEIGHT_LETTERS.has(u.text) && u.state === 'aligned' && u.bbox) {
      if (!letters.has(u.line)) letters.set(u.line, []);
      letters.get(u.line).push(u.bbox[3]);
    }
  }
  const lineValue = l => {
    const hs = (letters.get(l.line) || []).slice().sort((a, b) => a - b);
    if (hs.length >= LETTER_XHEIGHT.min) {
      const m = hs[Math.floor(hs.length / 2)];
      if (m < (1 - LETTER_XHEIGHT.disagree) * l.xHeight) return { xHeight: m, source: 'letters' };
    }
    return { xHeight: l.xHeight, source: 'line' };
  };
  const measured = lines.filter(l => own.has(l.line)).map(l => lineValue(l).xHeight).sort((a, b) => a - b);
  const ref = measured.length ? measured[Math.floor(measured.length / 2)] : null;
  const byLine = new Map(lines.map(l => [l.line, l]));
  return line => {
    const l = byLine.get(line);
    if (l && own.has(line)) return lineValue(l);
    if (ref !== null) return { xHeight: ref, source: 'sample' };
    return { xHeight: l ? l.xHeight : 0, source: 'unknown' };
  };
}

/**
 * Extracts glyph geometry from one analysed sample.
 * @param a { mask (text mask in the alignment frame), width, height,
 *            alignment (alignTranscription result), segmentation ({ lines }),
 *            quality, skew ({ angle, applied }), slot, source? ({ width,
 *            height } of the upright source image), page? (analyzeSample's
 *            page result: the rectification, when there was one) }
 * Returns { status: 'extracted' | 'no-alignment', units: [record], summary }
 */
export function extractGlyphs(a) {
  const { mask, width, height, alignment, segmentation, quality, skew, slot, source, page = null } = a;
  // 'no-writing' still lists every expected unit (missing / low-quality):
  // each gets its rejection. Only a sample without known text has none.
  if (!alignment || !alignment.observations || alignment.status === 'no-text') {
    return { status: 'no-alignment', units: [], summary: { considered: 0, extracted: 0, rejected: {} } };
  }
  const transformBase = {
    deskew: skew && skew.applied ? { angle: skew.angle, cx: width / 2, cy: height / 2 } : null,
    analysis: { width, height },
    page: page && page.homography ? { homography: page.homography, photo: page.photo } : null,
    source: source && source.width > 0 && source.height > 0 ? { width: source.width, height: source.height, scale: r3(source.width / (page && page.homography ? page.photo.width : width)) } : null,
  };
  const ctx = {
    mask,
    width,
    height,
    lines: new Map(segmentation.lines.map(l => [l.line, l])),
    xHeightOf: xHeightReference(alignment.observations.units, segmentation.lines),
    usable: !(quality && quality.usable === false),
    slot,
    transformBase,
    strokeWidth: strokeWidthIn(mask, width, height, segmentation.region ? segmentation.region.bbox : [0, 0, width, height]),
  };
  const list = alignment.observations.units;
  const units = list.map((u, i) => extractUnit(u, { ...ctx, prev: list[i - 1], next: list[i + 1] }));
  // A cluster whose dot mark is missing from its ink (marks-merged) may have
  // lost it to a neighbour's cut (a visarga taken by the next cluster): its
  // neighbours in the word are not trusted either (Phase 12).
  units.forEach((r, i) => {
    if (r.code !== 'marks-merged') return;
    for (const j of [i - 1, i + 1]) {
      const n = units[j];
      if (!n || n.status !== 'extracted' || n.word !== r.word || n.observation.line !== r.observation.line) continue;
      const rest = { ...n };
      for (const k of ['form', 'confidence', 'transform', 'diagnostics']) delete rest[k]; // a rejected unit carries no geometry
      units[j] = { ...rest, status: 'rejected', code: 'neighbour-uncertain', reasons: [`its neighbour “${r.text}” is missing its ${dotMarkNames(r.text)} from its ink: the mark may be in this cluster's region`] };
    }
  });
  units.forEach(r => {
    const errors = validateExtraction(r);
    if (errors.length) throw new Error(`invalid extraction record: ${errors.join('; ')}`);
  });
  const rejected = {};
  units.filter(r => r.status === 'rejected').forEach(r => (rejected[r.code] = (rejected[r.code] || 0) + 1));
  return {
    status: 'extracted',
    units,
    summary: { considered: units.length, extracted: units.filter(r => r.status === 'extracted').length, rejected },
  };
}

// --- Contract -------------------------------------------------------------------------------

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const num = Number.isFinite;
const FORBIDDEN = ['pixels', 'data', 'mask', 'crop', 'base64', 'uri', 'path'];

/** Validates one extraction record. Returns a list of errors. */
export function validateExtraction(r) {
  const errors = [];
  if (!isObj(r)) return ['record: must be an object'];
  if (r.level !== 'glyph') errors.push('level: "glyph"');
  if (typeof r.sampleId !== 'string' || !r.sampleId) errors.push('sampleId: string');
  if (!Number.isInteger(r.revision) || r.revision < 0) errors.push('revision: integer ≥ 0');
  if (!isObj(r.source) || !Number.isInteger(r.source.start) || !Number.isInteger(r.source.end) || r.source.end <= r.source.start) errors.push('source: { start, end } text range');
  if (typeof r.text !== 'string' || !r.text) errors.push('text: string');
  if (r.method !== 'skeleton-trace') errors.push('method: "skeleton-trace"');
  if (!EXTRACTION_STATUS.includes(r.status)) errors.push('status: extracted | rejected');
  if (!Array.isArray(r.reasons)) errors.push('reasons: array');
  for (const k of FORBIDDEN) if (k in r) errors.push(`${k}: extraction records carry no pixels or file locations`);
  if (r.status === 'rejected') {
    if (!REJECTION_CODES.includes(r.code)) errors.push('code: unknown rejection code');
    if (!r.reasons.length) errors.push('reasons: a rejection says why');
    if ('form' in r) errors.push('form: a rejected unit has no geometry');
  }
  if (r.status === 'extracted') {
    errors.push(...validateGlyphForm(r.form, { synthetic: false }, 'form'));
    errors.push(...validateScore(r.confidence, 'confidence'));
    const t = r.transform;
    if (!isObj(t) || !isObj(t.glyph) || !['originX', 'baselineY', 'unitPx'].every(k => num(t.glyph[k])) || !(t.glyph.unitPx > 0)) errors.push('transform.glyph: { originX, baselineY, unitPx > 0 }');
    if (t && t.deskew !== null && !(isObj(t.deskew) && ['angle', 'cx', 'cy'].every(k => num(t.deskew[k])))) errors.push('transform.deskew: null or { angle, cx, cy }');
    if (t && !['deskewed', 'original'].includes(t.frame)) errors.push('transform.frame: deskewed | original');
    if (t && t.page !== undefined && t.page !== null && !(isObj(t.page) && Array.isArray(t.page.homography) && t.page.homography.length === 9 && t.page.homography.every(num))) errors.push('transform.page: null or { homography (9 numbers), photo }');
  }
  return errors;
}

/** Points along an extracted form's strokes, in the analysis raster (diagnostics, tests). */
export function formPointsInAnalysis(record, step = 0.02) {
  return record.form.strokes.flatMap(s => sampleChain(s, step).map(p => glyphToAnalysis(p, record.transform)));
}
