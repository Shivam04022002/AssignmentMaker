/**
 * Word-level alignment of a known text to detected word regions.
 *
 * Expected words (expectedText.js) and detected words (segmentation.js, in
 * reading order: line by line, left to right) are aligned by dynamic
 * programming with five operations:
 *
 *   match    expected word ↔ one region; cost = |log(measured / expected)|
 *            of the width in x-heights, after scaling the expected widths to
 *            the writer's overall size, + shape cost: SHAPE per ascender /
 *            descender stroke more or fewer than expected beyond one (the
 *            region's strokes are counted from pixels by alignSample.js;
 *            Latin-only text — Devanagari marks are not ascenders)
 *   missing  an expected word with no region            (MISS)
 *   extra    a region no expected word accounts for     (EXTRA)
 *   merge    two expected words ↔ one region (touching words)   (+ MERGE)
 *   split    one expected word ↔ two neighbouring regions on the
 *            same line (a wide gap inside the word)              (+ SPLIT)
 *
 * When the expected and detected line counts agree, a word aligned to a
 * different line than expected pays LINE. The scale is re-estimated from
 * the matched words and the alignment run twice.
 *
 * Word alignment confidence = exp(−1.5 · cost) × (0.6 for merge / split),
 * reported with its inputs; it says how well the *sizes and order* agree,
 * not that the letters are right.
 */

import { UNIT_KIND } from './textUnits';

export const WORD_COSTS = { MISS: 1.2, EXTRA: 1.4, MERGE: 1.0, SPLIT: 0.8, LINE: 0.6, SHAPE: 0.35, SHAPE_MAX: 1.4 };

/** Expected ascender / descender strokes of a word (or words): tall and deep units. */
export function expectedShape(words) {
  let asc = 0;
  let desc = 0;
  for (const w of words) {
    for (const u of w.units) {
      if (u.priors.tall) asc++;
      if (u.priors.deep) desc++;
    }
  }
  return { asc, desc };
}

/**
 * Shape cost: each ascender or descender stroke more or fewer than the
 * text expects, beyond one (a capital's crossbar, a loose t-bar), costs
 * SHAPE (capped). Cheap evidence that tells "fox" from "jumps" when their
 * widths are alike. Absent measurements cost nothing.
 */
export function shapeCost(exp, measured) {
  if (!exp || !measured) return 0;
  const d = Math.abs(exp.asc - measured.asc) + Math.abs(exp.desc - measured.desc);
  return Math.min(WORD_COSTS.SHAPE_MAX, WORD_COSTS.SHAPE * Math.max(0, d - 1));
}
export const WORD_GAP_PRIOR = 1.0; // x-heights between two touching words

export const widthCost = (measured, expected) => Math.abs(Math.log(Math.max(1e-3, measured) / Math.max(1e-3, expected)));

/**
 * A region flatter than FLAT_REGION x-heights cannot hold a word with a
 * letter, digit or cluster in it: every one of those is at least about an
 * x-height tall. Such a region is a piece of a rule or an underline (found
 * on a real ruled page, Phase 14: a 3 px rule fragment matched to the
 * heading word “Market” by width alone). Only words made of punctuation
 * (— : . …) may match it.
 */
export const FLAT_REGION = 0.4;
const PUNCTUATION_ONLY = new Set([UNIT_KIND.PUNCTUATION, UNIT_KIND.SYMBOL, UNIT_KIND.SPACE]);
const needsHeight = words => words.some(w => (w.units || []).some(u => !PUNCTUATION_ONLY.has(u.kind)));
export const isFlatRegion = d => !!d && !!d.bbox && d.bbox[3] < FLAT_REGION * Math.max(1, d.xHeight);

/**
 * A region that never reaches its line's writing band (the x-height zone
 * above the baseline, ± BAND_SLACK x-height) cannot hold a word with a
 * letter, digit or cluster either: every one of those has ink on the
 * baseline's band. Found on a real ruled page (Phase 15): the curled end
 * of a double margin rule, 2 x-heights above the line's baseline but
 * inside its band of rows, was matched to “Q1.” while the real “Q1.” was
 * left over as extra ink. `d.band` = [top, bottom] rows of that zone
 * (absent → no evidence, never excluded).
 */
export const BAND_SLACK = 0.25;
export const isOffBand = d => {
  if (!d || !d.bbox || !d.band) return false;
  const slack = BAND_SLACK * Math.max(1, d.xHeight);
  return d.bbox[1] + d.bbox[3] - 1 < d.band[0] - slack || d.bbox[1] > d.band[1] + slack;
};
/** A region that cannot hold a letter, digit or cluster: flat, or off its line's writing band. */
export const cannotHoldLetters = d => isFlatRegion(d) || isOffBand(d);

/**
 * @param expected  prepareExpectedText() result
 * @param detected  [{ index, line, bbox, xHeight }] in reading order
 * Returns { words: [{ expected, op, detected: [j], cost, confidence,
 * lineMismatch }], extra: [j], scale, lineStructure }
 */
export function alignWords(expected, detected) {
  const E = expected.words;
  const D = detected;
  const lineStructure = {
    expected: expected.lines.length,
    detected: new Set(D.map(d => d.line)).size,
  };
  lineStructure.used = lineStructure.expected === lineStructure.detected && lineStructure.expected > 1;
  const detLines = [...new Set(D.map(d => d.line))].sort((p, q) => p - q);
  const lineRank = new Map(detLines.map((l, i) => [l, i]));
  const measured = D.map(d => d.bbox[2] / Math.max(1, d.xHeight));
  // Shape evidence only for Latin-only text: Devanagari marks above / below
  // are not ascenders, and on a mixed line the x-height is not the Latin one.
  const useShape = !expected.scripts.includes('Deva');
  // The writer's scale: from the total widths, and — robust to a missing or
  // extra word — from the median widths; the cheaper alignment wins, then
  // the scale is refined from its matched words.
  const sumE = E.reduce((a, w) => a + w.width, 0);
  const sumD = measured.reduce((a, v) => a + v, 0);
  const med = list => {
    const s = list.slice().sort((p, q) => p - q);
    return s.length ? s[Math.floor(s.length / 2)] : 0;
  };
  const starts = [sumE > 0 && sumD > 0 ? sumD / sumE : 1];
  const medE = med(E.map(w => w.width));
  if (medE > 0 && D.length) starts.push(med(measured) / medE);
  let best = null;
  for (const start of starts) {
    let scale = start;
    let result = null;
    for (let pass = 0; pass < 2; pass++) {
      result = run(E, D, measured, scale, lineStructure.used, lineRank, useShape);
      const ratios = result.words.filter(w => w.op === 'match').map(w => measured[w.detected[0]] / E[w.expected].width);
      if (ratios.length >= 3) scale = med(ratios);
      else break;
    }
    if (!best || result.total < best.result.total) best = { result, scale };
  }
  return { ...best.result, scale: best.scale, lineStructure };
}

function run(E, D, measured, scale, useLines, lineRank, useShape) {
  const n = E.length;
  const m = D.length;
  const INF = 1e9;
  const cost = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(INF));
  const back = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(null));
  cost[0][0] = 0;
  const linePenalty = (i, j) => (useLines && lineRank.get(D[j].line) !== E[i].line ? WORD_COSTS.LINE : 0);
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      const c = cost[i][j];
      if (c >= INF) continue;
      const relax = (ii, jj, add, op) => {
        if (c + add < cost[ii][jj]) {
          cost[ii][jj] = c + add;
          back[ii][jj] = { i, j, op };
        }
      };
      if (i < n) relax(i + 1, j, WORD_COSTS.MISS, 'missing');
      if (j < m) relax(i, j + 1, WORD_COSTS.EXTRA, 'extra');
      // A flat region (a rule fragment) holds no letters: never the words that have them.
      const flatFor = (words, regions) => regions.some(cannotHoldLetters) && needsHeight(words);
      if (i < n && j < m && !flatFor([E[i]], [D[j]])) relax(i + 1, j + 1, widthCost(measured[j], E[i].width * scale) + shapeCost((useShape ? expectedShape([E[i]]) : null), D[j].shape) + linePenalty(i, j), 'match');
      if (i + 1 < n && j < m && !flatFor([E[i], E[i + 1]], [D[j]])) {
        relax(i + 2, j + 1, widthCost(measured[j], (E[i].width + E[i + 1].width + WORD_GAP_PRIOR) * scale) + shapeCost((useShape ? expectedShape([E[i], E[i + 1]]) : null), D[j].shape) + WORD_COSTS.MERGE + linePenalty(i, j), 'merge');
      }
      if (i < n && j + 1 < m && D[j].line === D[j + 1].line && !flatFor([E[i]], [D[j], D[j + 1]])) {
        const span = (D[j + 1].bbox[0] + D[j + 1].bbox[2] - D[j].bbox[0]) / Math.max(1, D[j].xHeight);
        const both = D[j].shape && D[j + 1].shape ? { asc: D[j].shape.asc + D[j + 1].shape.asc, desc: D[j].shape.desc + D[j + 1].shape.desc } : null;
        relax(i + 1, j + 2, widthCost(span, E[i].width * scale) + shapeCost((useShape ? expectedShape([E[i]]) : null), both) + WORD_COSTS.SPLIT + linePenalty(i, j), 'split');
      }
    }
  }
  const words = [];
  const extra = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const b = back[i][j];
    const step = cost[i][j] - cost[b.i][b.j];
    if (b.op === 'missing') words.push({ expected: b.i, op: 'missing', detected: [], cost: step });
    else if (b.op === 'extra') extra.push(b.j);
    else if (b.op === 'match') words.push({ expected: b.i, op: 'match', detected: [b.j], cost: step });
    else if (b.op === 'merge') {
      words.push({ expected: b.i, op: 'merge', detected: [b.j], cost: step, partner: b.i + 1 });
      words.push({ expected: b.i + 1, op: 'merge', detected: [b.j], cost: step, partner: b.i });
    } else if (b.op === 'split') words.push({ expected: b.i, op: 'split', detected: [b.j, b.j + 1], cost: step });
    i = b.i;
    j = b.j;
  }
  words.sort((p, q) => p.expected - q.expected);
  extra.sort((p, q) => p - q);
  for (const w of words) {
    const structural = w.op === 'merge' || w.op === 'split' ? 0.6 : 1;
    w.lineMismatch = w.detected.length > 0 && useLines && lineRank.get(D[w.detected[0]].line) !== E[w.expected].line;
    w.confidence =
      w.op === 'missing'
        ? null
        : {
            score: Math.round(Math.exp(-1.5 * w.cost) * structural * 1000) / 1000,
            basis: 'agreement of the measured word width and ascender / descender strokes with the expected word (scaled to the writer), its order, and line structure',
            inputs: { cost: Math.round(w.cost * 1000) / 1000, op: w.op },
          };
  }
  return { words, extra, total: cost[n][m] };
}
