/**
 * Transcription-guided segmentation of one analysed sample: which region of
 * the image corresponds to which part of the known text. Not OCR — the
 * text is known (prescribed prompt or the user's transcription); this
 * checks whether the image has plausible regions for it, and says so when
 * it does not.
 *
 *   expectedText.js         the known text → lines, words, units (+ priors)
 *   wordAlignment.js        expected words ↔ detected word regions
 *   unitBoundaries.js       Latin: cuts at gaps / valleys in the pixels
 *   devanagariAlignment.js  Devanagari: cuts below the headline, marks
 *   alignmentConfidence.js  boundary vs alignment confidence, upstream
 *
 * Output (contracts.validateAlignmentObservation): one observation per
 * expected unit and per expected word, plus extra-ink regions — each with
 * the sample id and image revision, its range in the original text, its
 * box in the analysis raster (`frame`: the deskewed frame segmentation
 * worked in), both confidences, the method, evidence, reasons and state.
 * No pixels are stored.
 */
import { ALIGNMENT_THRESHOLDS, blurReach, blurredGap, hairlineGap, stateFor, unitConfidence, upstreamFactor } from './alignmentConfidence';
import { validateAlignmentObservation } from './contracts';
import { segmentDevanagariWord } from './devanagariAlignment';
import { prepareExpectedText } from './expectedText';
import { UNIT_KIND } from './textUnits';
import { columnProfile, inkRows, segmentUnits, strokeWidthIn } from './unitBoundaries';
import { alignWords, widthCost, WORD_GAP_PRIOR } from './wordAlignment';

const r3 = v => Math.round(v * 1000) / 1000;
const UNSUPPORTED_KINDS = new Set([UNIT_KIND.OTHER, UNIT_KIND.ORPHAN_MARK]);
/** Units whose ink spans at least MIN_INK_HEIGHT of the x-height (not punctuation). */
const SHAPED_KINDS = new Set([UNIT_KIND.LETTER, UNIT_KIND.DIGIT, UNIT_KIND.CLUSTER]);
export const MIN_INK_HEIGHT = 0.4;
/** A full stop or comma sits low on the line: its ink starts below this share of the x-height above the baseline. */
const LOW_MARKS = new Set(['.', ',']);
export const LOW_MARK_TOP = 0.5;
/**
 * Latin lowercase zones (Phase 10): letters that stay inside the x-height
 * band, letters that always rise above it, and letters that always drop
 * below the baseline. Letters that vary between hands (f, t, i, j, z's
 * tail) are not checked.
 */
export const LATIN_ZONES = { short: 'acemnorsuvwx', ascender: 'bdhkl', descender: 'gpqy' };

const union = boxes => {
  const x0 = Math.min(...boxes.map(b => b[0]));
  const y0 = Math.min(...boxes.map(b => b[1]));
  const x1 = Math.max(...boxes.map(b => b[0] + b[2]));
  const y1 = Math.max(...boxes.map(b => b[1] + b[3]));
  return [x0, y0, x1 - x0, y1 - y0];
};

/**
 * @param a { mask (text mask, deskewed frame), width, height, segmentation
 *            ({ lines, words }), quality, knownText, sampleId, revision,
 *            frame }
 * Returns { status: 'aligned' | 'no-text' | 'no-writing', observations:
 *   { units, words, extra }, summary, diagnostics }
 */
/**
 * Ascender and descender strokes of a word region, counted from pixels:
 * groups of ink columns reaching more than 0.3 x-height above the x-height
 * band (or below the baseline). Only for lines without a headline — on a
 * Devanagari line the marks above and below are not ascenders — and only
 * when the writing is large enough and the line band clearly taller than
 * its x-height (≥ 1.6×: distinct ascender / descender zones); otherwise
 * null (no evidence).
 */
export function measureShape(mask, w, bbox, line) {
  if (!line || line.baseline === undefined || line.headline !== undefined || !(line.xHeight >= 6)) return null;
  if (line.bbox && line.bbox[3] < 1.6 * line.xHeight) return null;
  const xh = line.xHeight;
  const margin = Math.round(0.3 * xh);
  const [x0, y0, bw, bh] = bbox;
  const y1 = y0 + bh - 1;
  const ascEnd = line.baseline - xh - margin;
  const descStart = line.baseline + margin + 1;
  const mergeGap = Math.max(1, Math.round(0.15 * xh));
  const count = (ya, yb) => {
    if (yb < ya) return 0;
    let groups = 0;
    let last = -Infinity;
    for (let x = x0; x < x0 + bw; x++) {
      let ink = false;
      for (let y = ya; y <= yb && !ink; y++) ink = mask[y * w + x] !== 0;
      if (ink) {
        if (x - last > mergeGap) groups++;
        last = x;
      }
    }
    return groups;
  };
  return { asc: count(Math.max(0, y0), Math.min(y1, ascEnd)), desc: count(Math.max(0, descStart), y1) };
}

/**
 * The part of a word region to cut into units. A separate small, flat piece
 * at the region's start or end (a leftover of a rule or margin line, a speck
 * — less than MIN_INK_HEIGHT of the x-height tall and narrower than 0.6 of
 * it) cannot be the letter, digit or cluster the text puts there, and would
 * shift every cut after it: it is left out (as extra ink). Punctuation at
 * the ends is never trimmed. Returns { bbox, trimmed: ['start' | 'end'] }.
 */
export function trimEndSpecks(mask, w, bbox, xHeight, units) {
  const [x0, y0, bw, bh] = bbox;
  const runs = [];
  let open = null;
  for (let x = x0; x < x0 + bw; x++) {
    let top = -1;
    let bottom = -1;
    for (let y = y0; y < y0 + bh; y++) {
      if (mask[y * w + x]) {
        if (top < 0) top = y;
        bottom = y;
      }
    }
    if (top >= 0) {
      if (!open) open = { from: x, to: x, top, bottom };
      else {
        open.to = x;
        open.top = Math.min(open.top, top);
        open.bottom = Math.max(open.bottom, bottom);
      }
    } else if (open) {
      runs.push(open);
      open = null;
    }
  }
  if (open) runs.push(open);
  const speck = r => r.bottom - r.top + 1 < MIN_INK_HEIGHT * xHeight && r.to - r.from + 1 < 0.6 * xHeight;
  const trimmed = [];
  let a = 0;
  let b = runs.length - 1;
  if (b > a && SHAPED_KINDS.has(units[0].kind) && speck(runs[a])) {
    a++;
    trimmed.push('start');
  }
  if (b > a && SHAPED_KINDS.has(units[units.length - 1].kind) && speck(runs[b])) {
    b--;
    trimmed.push('end');
  }
  if (!trimmed.length) return { bbox, trimmed };
  return { bbox: [runs[a].from, y0, runs[b].to - runs[a].from + 1, bh], trimmed };
}

/**
 * Words whose match is not anchored. Width-based word matching can slide
 * by one word when a region is missing or two words merge (a real page: a
 * rule fragment joined "What" and "is", and "is" was matched to the ink of
 * "the"); each shifted match still looks plausible alone. A run of
 * consecutive clean one-to-one matches on a line (op match, score ≥ 0.5,
 * consecutive regions of one detected line) is pinned in place when it
 * starts the line (its first word ↔ the line's first region) or ends it
 * (last ↔ last). A run with a gap, merge, split, extra region or doubtful
 * word on both sides could be shifted: its words are returned.
 */
export function unanchoredWords(wa, expected, detected) {
  const good = new Map();
  const missing = new Set();
  for (const e of wa.words) {
    if (e.op === 'match' && e.confidence && e.confidence.score >= 0.5 && !e.lineMismatch) good.set(e.expected, e.detected[0]);
    if (e.op === 'missing') missing.add(e.expected);
  }
  const E = expected.words;
  const scale = wa.scale || 1;
  // Does the region of word `w` fit the missing words next to it (nearest first) about as well?
  const couldBeMissing = (w, inward) => {
    const run = [];
    for (const x of inward) {
      if (!missing.has(x)) break;
      run.push(x);
    }
    if (!run.length) return false;
    const d = detected[good.get(w)];
    const measured = d.bbox[2] / Math.max(1, d.xHeight);
    const own = widthCost(measured, E[w].width * scale);
    let width = -WORD_GAP_PRIOR;
    return run.some(x => {
      width += E[x].width + WORD_GAP_PRIOR;
      return widthCost(measured, width * scale) <= own + LOST_WORD_MARGIN;
    });
  };
  const regionsOfLine = new Map();
  detected.forEach((d, j) => {
    if (!regionsOfLine.has(d.line)) regionsOfLine.set(d.line, []);
    regionsOfLine.get(d.line).push(j);
  });
  const out = new Set();
  for (const line of expected.lines) {
    const words = line.words;
    let i = 0;
    while (i < words.length) {
      if (!good.has(words[i])) {
        i++;
        continue;
      }
      let k = i;
      while (k + 1 < words.length && good.has(words[k + 1]) && good.get(words[k + 1]) === good.get(words[k]) + 1 && detected[good.get(words[k + 1])].line === detected[good.get(words[k])].line) k++;
      const firstRegion = good.get(words[i]);
      const lastRegion = good.get(words[k]);
      const regions = regionsOfLine.get(detected[firstRegion].line);
      // A line end alone does not pin a single word whose neighbour inside the line is
      // missing when the region fits that missing neighbour (or the missing words next
      // to it, merged) about as well as the word itself: a word was lost — cut off at the
      // photo's edge, merged into a rule — and the end cannot say which (Phase 15: on a
      // strongly skewed page, “advantages” took the region of “Write its”). A run of two
      // or more matches in order carries its own evidence of place.
      const lone = i === k;
      const atStart = i === 0 && regions[0] === firstRegion && !(lone && couldBeMissing(words[i], words.slice(k + 1)));
      const atEnd = k === words.length - 1 && regions[regions.length - 1] === lastRegion && !(lone && couldBeMissing(words[i], words.slice(0, i).reverse()));
      if (!atStart && !atEnd) for (let x = i; x <= k; x++) out.add(words[x]);
      i = k + 1;
    }
  }
  return out;
}

/**
 * Words matched to the region right after an extra (unexplained) region
 * that lies inside a line — between two matched regions of that line.
 * Found on a real joined hand (Phase 15): a period left as its own speck,
 * the next word's region cut from the start of the word after it, every
 * width still plausible. The boundary next to unexplained ink is doubtful.
 */
export function wordsAfterUnexplainedInk(wa, detected) {
  const wordOf = new Map();
  wa.words.forEach(e => e.detected.forEach(j => wordOf.set(j, e.expected)));
  const out = new Set();
  for (const j of wa.extra) {
    // Only a small piece (a period, a dot, a letter's end): a detached part of a
    // neighbouring word. A word-sized extra region is unexpected text, not a sign
    // that the boundaries beside it are wrong.
    if (detected[j].bbox[2] >= UNEXPLAINED_PIECE * detected[j].xHeight) continue;
    const line = detected[j].line;
    let before = false;
    for (let k = j - 1; k >= 0 && detected[k].line === line && !before; k--) before = wordOf.has(k);
    if (!before) continue;
    const next = j + 1;
    if (next < detected.length && detected[next].line === line && wordOf.has(next)) out.add(wordOf.get(next));
  }
  return out;
}

/** Fewer matched regions than this cannot measure the writer's size independently of the matches. */
export const MIN_SCALE_WORDS = 3;

/** An extra region narrower than this many x-heights is a detached piece, not a word. */
export const UNEXPLAINED_PIECE = 1;

/** Width cost (|log ratio|) within which a region "fits a missing word about as well". */
export const LOST_WORD_MARGIN = 0.15;

/** A word region taller than this many x-heights holds more than one line's worth of ink. */
export const TALL_REGION = 4;

/**
 * A line's writing band — the x-height zone above its baseline — as
 * [top, bottom] rows, for wordAlignment's off-band check. None (null) when
 * the baseline is unmeasured, the writing too small to place it, or the
 * band may hold two touching lines (its baseline is then one line's only).
 */
export function writingBand(line) {
  if (!line || line.baseline === undefined || !(line.xHeight >= 6)) return null;
  if ((line.reasons || []).some(r => /more than one line/.test(r))) return null;
  return [line.baseline - line.xHeight, line.baseline];
}

export function alignTranscription(a) {
  const { mask, width: w, height: h, segmentation, quality, knownText, sampleId = 'unknown', revision = 0, frame = 'deskewed' } = a;
  if (typeof knownText !== 'string' || !knownText.trim()) {
    return { status: 'no-text', observations: { units: [], words: [], extra: [] }, summary: null, diagnostics: { reason: 'no known text: this sample contributes measurements only' } };
  }
  const expected = prepareExpectedText(knownText);
  const lines = new Map(segmentation.lines.map(l => [l.line, l]));
  const detected = segmentation.words
    .map((wd, i) => {
      const line = lines.get(wd.line) || {};
      return { ...wd, index: i, xHeight: line.xHeight || 10, shape: measureShape(mask, w, wd.bbox, line), band: writingBand(line) };
    })
    .sort((p, q) => p.line - q.line || p.bbox[0] - q.bbox[0]);
  const usable = !(quality && quality.usable === false);
  const base = { sampleId, revision, frame };
  const unitObs = [];
  const wordObs = [];
  const extraObs = [];
  const unitObservation = (u, fields) => ({
    level: 'unit',
    ...base,
    source: { start: u.start, end: u.end },
    text: u.text,
    key: u.key,
    script: u.script,
    kind: u.kind,
    word: u.word,
    expectedLine: expected.words[u.word].line,
    relation: u.components.length ? { components: u.components.map(c => ({ role: c.role, ...(c.position ? { position: c.position } : null), start: c.start, end: c.end })), conjunct: !!u.conjunct, halant: !!u.halant } : undefined,
    ...fields,
  });

  if (!detected.length) {
    for (const u of expected.units) {
      unitObs.push(unitObservation(u, { line: null, bbox: null, boundaryConfidence: null, alignmentConfidence: null, method: 'word-alignment', evidence: [], reasons: ['no writing was found in the image'], state: usable ? 'missing' : 'low-quality', overlapsNeighbor: false }));
    }
    return finish({ status: 'no-writing', expected, unitObs, wordObs, extraObs, w, h, knownText, wa: null });
  }

  const wa = alignWords(expected, detected);
  const unanchored = unanchoredWords(wa, expected, detected);
  const afterUnexplained = wordsAfterUnexplainedInk(wa, detected);
  // The writer's size is estimated from the matched words themselves: with fewer than
  // MIN_SCALE_WORDS of them, a match fits a scale made to fit it and proves nothing
  // (Phase 15: three touching lines merged into one region, matched to “and” alone).
  const matchedRegions = new Set(wa.words.flatMap(e => e.detected)).size;
  const scaleUnsupported = expected.words.length >= MIN_SCALE_WORDS && matchedRegions < MIN_SCALE_WORDS;
  const regionStroke = strokeWidthIn(mask, w, h, segmentation.region ? segmentation.region.bbox : [0, 0, w, h]);
  const reach = blurReach(quality);
  const done = new Set();
  for (const entry of wa.words) {
    if (done.has(entry.expected)) continue;
    const word = expected.words[entry.expected];
    const group = entry.op === 'merge' ? [entry.expected, entry.partner].sort((p, q) => p - q) : [entry.expected];
    group.forEach(g => done.add(g));
    const words = group.map(g => expected.words[g]);
    const units = words.flatMap(x => x.units);
    if (entry.op === 'missing') {
      wordObs.push({ level: 'word', ...base, source: { start: word.start, end: word.end }, text: word.text, key: word.text, script: word.script, word: word.index, expectedLine: word.line, line: null, bbox: null, boundaryConfidence: null, alignmentConfidence: null, method: 'word-alignment', evidence: [], reasons: ['no ink region matched this word (not written, merged into another region, or not detected)'], state: usable ? 'missing' : 'low-quality', overlapsNeighbor: false });
      for (const u of units) {
        unitObs.push(unitObservation(u, { line: null, bbox: null, boundaryConfidence: null, alignmentConfidence: null, method: 'word-alignment', evidence: [], reasons: ['its word has no matching region'], state: usable ? 'missing' : 'low-quality', overlapsNeighbor: false }));
      }
      continue;
    }
    const det = entry.detected.map(j => detected[j]);
    const bbox = union(det.map(d => d.bbox));
    const line = lines.get(det[0].line);
    const xHeight = det[0].xHeight;
    const upstream = upstreamFactor(quality, line);
    const wordScore = entry.confidence.score;
    const wordReasons = [];
    if (entry.op === 'merge') wordReasons.push(`touching words: “${words.map(x => x.text).join(' ')}” share one ink region`);
    if (entry.op === 'split') wordReasons.push('written as two separate pieces of ink (a wide gap inside the word)');
    if (entry.lineMismatch) wordReasons.push('found on a different line than the text expects');
    det.forEach(d => (d.reasons || []).forEach(t => wordReasons.push(`word region: ${t}`)));
    const regionEdge = Math.min(...det.map(d => (d.confidence ? d.confidence.score : 0.5)));
    if (entry.op === 'match' && wordScore < 0.5) {
      wordReasons.push(`the region’s width does not agree well with the expected word (alignment cost ${r3(entry.cost)}); it may hold different text`);
    }
    let shifted = unanchored.has(entry.expected) || afterUnexplained.has(entry.expected) || scaleUnsupported;
    if (scaleUnsupported) wordReasons.push(`only ${matchedRegions} region${matchedRegions === 1 ? '' : 's'} matched the ${expected.words.length} words of the text: too few to measure the writing's size, so no match can be checked`);
    if (afterUnexplained.has(entry.expected)) wordReasons.push('it follows ink inside the line that no word accounts for: the boundary before it may be misplaced (a joined word cut in the wrong place)');
    if (shifted) wordReasons.push('its place is not anchored: a word next to it on the line is missing, merged or uncertain, so the match may be shifted by a word');
    // Taller than any one line of writing: the region also holds a vertical rule or another
    // line's ink (Phase 15: a margin rule joined to “Q1.” on a strongly skewed page).
    if (bbox[3] > TALL_REGION * xHeight) {
      wordReasons.push(`the region is ${r3(bbox[3] / xHeight)} x-heights tall, more than one line of writing: it also holds other ink (a margin rule, a neighbouring line)`);
      shifted = true;
    }
    for (const x of words) {
      wordObs.push({
        level: 'word',
        ...base,
        source: { start: x.start, end: x.end },
        text: x.text,
        key: x.text,
        script: x.script,
        word: x.index,
        expectedLine: x.line,
        line: det[0].line,
        bbox,
        boundaryConfidence: { score: r3(regionEdge * upstream.factor), basis: 'word separation from segmentation × image and line factor', inputs: { separation: regionEdge, upstream: upstream.factor } },
        alignmentConfidence: entry.confidence,
        method: 'word-alignment',
        evidence: [`width ${r3(bbox[2] / xHeight)} x-heights vs ${r3(x.width * wa.scale)} expected`],
        reasons: [...wordReasons, ...upstream.reasons],
        state: !usable ? 'low-quality' : entry.op === 'match' && wordScore >= 0.5 && !entry.lineMismatch && !shifted ? 'aligned' : 'ambiguous',
        overlapsNeighbor: entry.op === 'merge',
      });
    }

    // Units inside the region.
    const script = words.every(x => x.script === 'Deva') ? 'Deva' : words.some(x => x.script === 'Deva') ? 'mixed' : 'Latn';
    const trim = trimEndSpecks(mask, w, bbox, xHeight, units);
    if (trim.trimmed.length) wordReasons.push(`a small mark at the word’s ${trim.trimmed.join(' and ')} was left out: too small and flat for the first or last letter`);
    const [x0, y0, bw, bh] = trim.bbox;
    let cut;
    let method;
    let headline = null;
    if (script === 'Deva') {
      const r = segmentDevanagariWord({ mask, w, bbox: trim.bbox, units, line, xHeight, strokeWidth: regionStroke });
      cut = r.units;
      headline = r.headline;
      method = 'devanagari-body-profile';
    } else {
      const profile = columnProfile(mask, w, x0, x0 + bw - 1, y0, y0 + bh - 1);
      cut = segmentUnits({ profile, x0, units, xHeight, strokeWidth: regionStroke }).units;
      method = 'latin-column-profile';
    }
    units.forEach((u, k) => {
      const c = cut[k];
      const shared = c.group.length > 1;
      const atLeftEdge = c.group[0] === 0;
      const atRightEdge = c.group[c.group.length - 1] === units.length - 1;
      const conf = unitConfidence({ left: c.left, right: c.right, atLeftEdge, atRightEdge, regionEdge, shared, fit: c.fit, wordScore, op: entry.op, upstream, blurReach: reach });
      const rows = inkRows(mask, w, c.range[0], c.range[1], y0, y0 + bh - 1);
      const evidence = [...(c.evidence || [])];
      const reasons = [...(c.reasons || [])];
      const describe = b => `${b.kind}${b.kind === 'gap' ? ` ${b.width} px` : ''} (strength ${r3(b.strength)})`;
      if (c.left) evidence.push(`left boundary: ${describe(c.left)}`);
      if (c.right) evidence.push(`right boundary: ${describe(c.right)}`);
      const hairline = !shared && (hairlineGap(c.left) || hairlineGap(c.right));
      const blurred = !shared && (blurredGap(c.left, reach) || blurredGap(c.right, reach));
      if (blurred) reasons.push(`a boundary gap is no wider than the blur in this image can close or open (≈ ${reach} px); it may not be where one letter ends`);
      const conflict = !!((c.left && c.left.conflict) || (c.right && c.right.conflict));
      const strict = reach > 0 || hairline;
      const fitMin = strict ? ALIGNMENT_THRESHOLDS.fitOkBlurred : ALIGNMENT_THRESHOLDS.fitOk;
      const why = reach > 0 ? ' in a blurred image' : hairline ? ' at a one-pixel gap, where the letters may touch' : '';
      if (!shared && c.fit < fitMin) reasons.push(`its cuts are far from where the text’s letter widths place them (position fit ${r3(c.fit)}, needs ${fitMin}${why})`);
      if (shared) {
        const t = c.group.map(g => units[g].text).join('');
        reasons.push(`no visible boundary inside “${t}”: these ${c.group.length} units share one region`);
      }
      if ((c.left && c.left.kind === 'valley') || (c.right && c.right.kind === 'valley')) reasons.push('touches a neighbour (boundary at a thin joining stroke)');
      if (script === 'mixed') reasons.push('word mixes scripts; segmented with the Latin method');
      if (!rows) reasons.push('no ink inside the candidate range');
      reasons.push(...wordReasons, ...upstream.reasons);
      const unsupported = UNSUPPORTED_KINDS.has(u.kind);
      if (unsupported) reasons.push(u.kind === UNIT_KIND.ORPHAN_MARK ? 'a vowel sign or mark without a base cannot be segmented' : 'script not supported by personal handwriting');
      const valley = !!((c.left && c.left.kind === 'valley') || (c.right && c.right.kind === 'valley'));
      let state = stateFor({ boundary: conf.boundary.score, alignment: conf.alignment.score, shared, usable, unsupported, valley, blurred, fit: shared ? undefined : c.fit, conflict: conflict || shifted, blurry: reach > 0, hairline });
      if (!rows && state === 'aligned') state = 'ambiguous';
      // A letter, digit or cluster spans much of the x-height; a flat sliver
      // (a leftover rule dash, a speck) in its place is not it.
      const flat = rows && SHAPED_KINDS.has(u.kind) && rows[1] - rows[0] + 1 < MIN_INK_HEIGHT * xHeight;
      if (flat && state === 'aligned') {
        state = 'ambiguous';
        reasons.push(`its ink is only ${rows[1] - rows[0] + 1} px tall, too flat for a ${u.kind === UNIT_KIND.CLUSTER ? 'cluster' : 'letter'} (x-height ${xHeight} px): probably not this character`);
      }
      // A full stop or comma in place of ink that reaches up into the x-height
      // is part of a letter (the mark itself was too faint or was lost).
      const high = LOW_MARKS.has(u.text) && rows && line && line.baseline !== undefined && line.headline === undefined && xHeight >= 6 && rows[0] < line.baseline - LOW_MARK_TOP * xHeight;
      if (high && state === 'aligned') {
        state = 'ambiguous';
        reasons.push(`its ink reaches ${line.baseline - rows[0]} px above the baseline, too high for “${u.text}” (x-height ${xHeight} px): probably part of the letter before or after it`);
      }
      // A lowercase Latin letter whose ink is in the wrong zones (an x-height
      // letter reaching into the ascender zone, an ascender letter without
      // one) holds part of a neighbour, or misses part of itself.
      const zones = u.kind === UNIT_KIND.LETTER && u.script === 'Latn' && rows ? measureShape(mask, w, [c.range[0], y0, c.range[1] - c.range[0] + 1, bh], line) : null;
      if (zones && state === 'aligned') {
        const t = u.text;
        const wrong =
          LATIN_ZONES.short.includes(t) && zones.asc > 0
            ? 'reaches into the ascender zone'
            : LATIN_ZONES.short.includes(t) && zones.desc > 0
              ? 'reaches below the baseline'
              : LATIN_ZONES.ascender.includes(t) && zones.asc === 0
                ? 'has no ascender'
                : LATIN_ZONES.descender.includes(t) && zones.desc === 0
                  ? 'has no descender'
                  : null;
        if (wrong) {
          state = 'ambiguous';
          reasons.push(`its ink ${wrong}, which “${t}” does not: probably part of a neighbouring letter, or part of “${t}” is outside the cut`);
        }
      }
      if (state === 'ambiguous' && !reasons.length) reasons.push(`confidence below the thresholds (boundary ${conf.boundary.score}, alignment ${conf.alignment.score})`);
      unitObs.push(
        unitObservation(u, {
          line: det[0].line,
          bbox: rows ? [c.range[0], rows[0], c.range[1] - c.range[0] + 1, rows[1] - rows[0] + 1] : null,
          boundaryConfidence: conf.boundary,
          alignmentConfidence: conf.alignment,
          method,
          evidence,
          reasons,
          state,
          overlapsNeighbor: !!((c.left && c.left.kind === 'valley') || (c.right && c.right.kind === 'valley') || shared),
          ...(shared ? { sharedWith: c.group.map(g => ({ start: units[g].start, end: units[g].end })) } : null),
          ...(c.marks ? { marks: c.marks } : null),
          ...(headline ? { headline: [headline.top, headline.bottom] } : null),
        }),
      );
    });
  }
  for (const j of wa.extra) {
    const d = detected[j];
    extraObs.push({ level: 'word', ...base, source: null, text: '', key: '', script: null, word: null, expectedLine: null, line: d.line, bbox: d.bbox, boundaryConfidence: d.confidence || null, alignmentConfidence: null, method: 'word-alignment', evidence: [], reasons: ['writing the transcription does not account for'], state: 'extra-ink', overlapsNeighbor: false });
  }
  return finish({ status: 'aligned', expected, unitObs, wordObs, extraObs, w, h, knownText, wa });
}

function finish({ status, expected, unitObs, wordObs, extraObs, w, h, knownText, wa }) {
  unitObs.sort((p, q) => p.source.start - q.source.start);
  wordObs.sort((p, q) => p.source.start - q.source.start);
  const all = [...unitObs, ...wordObs, ...extraObs];
  const invalid = all.map(o => validateAlignmentObservation(o, { width: w, height: h }, knownText.length)).filter(e => e.length);
  if (invalid.length) throw new Error(`invalid alignment observation: ${invalid[0].join('; ')}`);
  const count = (list, s) => list.filter(o => o.state === s).length;
  return {
    status,
    observations: { units: unitObs, words: wordObs, extra: extraObs },
    summary: {
      expectedWords: expected.words.length,
      expectedUnits: expected.units.length,
      words: { aligned: count(wordObs, 'aligned'), ambiguous: count(wordObs, 'ambiguous'), missing: count(wordObs, 'missing'), lowQuality: count(wordObs, 'low-quality') },
      units: { aligned: count(unitObs, 'aligned'), ambiguous: count(unitObs, 'ambiguous'), missing: count(unitObs, 'missing'), lowQuality: count(unitObs, 'low-quality'), unsupported: count(unitObs, 'unsupported') },
      extraInk: extraObs.length,
    },
    diagnostics: wa ? { scale: r3(wa.scale), lineStructure: wa.lineStructure, operations: wa.words.reduce((m, x) => ({ ...m, [x.op]: (m[x.op] || 0) + 1 }), {}) } : {},
  };
}
