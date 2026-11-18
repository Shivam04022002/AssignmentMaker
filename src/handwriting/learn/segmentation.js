/**
 * Initial segmentation of a preprocessed sample (preprocess.js → textMask):
 * the writing region, text lines and word groups. This is not character
 * recognition and does not split letters or Devanagari clusters.
 *
 * Method
 *   components   8-connected ink components; specks and page-edge
 *                artefacts (large components touching the border) are set
 *                aside, not counted as writing
 *   lines        horizontal projection of the writing components, smoothed;
 *                bands above a fraction of the peak; bands closer than a
 *                fraction of the typical band height are merged (dots,
 *                matras above a headline, descenders); a band much taller
 *                than the others is split at its deepest valley
 *   line shape   body = rows carrying ≥ half the band's typical (median) ink row; baseline
 *                = bottom of the body, x-height = body height; a single row
 *                much denser than the rest of the body's upper part is
 *                reported as a possible Devanagari headline (shirorekha)
 *   words        components of a line merged along x (overlapping extents
 *                stay together — a headline joins its letters, a matra its
 *                base); gaps wider than the word-gap threshold separate
 *                words (two-cluster split of the gap lengths when the gaps
 *                are clearly bimodal, otherwise 0.6 × x-height)
 *
 * Every observation follows contracts.validateSegment and carries a score
 * with the basis it was computed from, plus `reasons` when it is uncertain.
 */
import { median } from './raster';
import { components } from './preprocess';

const round1 = v => Math.round(v * 10) / 10;
const clamp01 = v => Math.max(0, Math.min(1, v));

/** Writing components vs specks and page-edge artefacts. */
function classifyComponents(cc, w, h) {
  const out = [];
  for (let l = 1; l <= cc.count; l++) {
    const bw = cc.maxX[l] - cc.minX[l] + 1;
    const bh = cc.maxY[l] - cc.minY[l] + 1;
    const touches = cc.minX[l] === 0 || cc.minY[l] === 0 || cc.maxX[l] === w - 1 || cc.maxY[l] === h - 1;
    let kind = 'writing';
    if (cc.area[l] <= 2) kind = 'speck';
    else if (touches && (bw > 0.25 * w || bh > 0.25 * h)) kind = 'edge';
    else if (bw > 0.6 * w && bh > 0.3 * h) kind = 'edge'; // a frame or shadow, not writing
    out.push({ label: l, kind, x0: cc.minX[l], y0: cc.minY[l], x1: cc.maxX[l], y1: cc.maxY[l], area: cc.area[l] });
  }
  return out;
}

function smooth(profile, radius) {
  if (radius < 1) return Float64Array.from(profile);
  const out = new Float64Array(profile.length);
  let s = 0;
  const n = profile.length;
  for (let i = 0; i < Math.min(n, radius + 1); i++) s += profile[i];
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - radius);
    const hi = Math.min(n - 1, i + radius);
    out[i] = s / (hi - lo + 1);
    if (i + radius + 1 < n) s += profile[i + radius + 1];
    if (i - radius >= 0) s -= profile[i - radius];
  }
  return out;
}

/** Bands of a profile above `level`. */
function bandsOf(profile, level) {
  const bands = [];
  for (let i = 0; i < profile.length; ) {
    if (profile[i] <= level) {
      i++;
      continue;
    }
    let j = i;
    while (j < profile.length && profile[j] > level) j++;
    bands.push({ from: i, to: j - 1 });
    i = j;
  }
  return bands;
}

/** Splits gap lengths into word gaps vs letter gaps. */
function wordGapThreshold(gaps, xHeight) {
  const fallback = { threshold: Math.max(2, 0.6 * xHeight), bimodal: false };
  if (gaps.length < 3) return fallback;
  const s = gaps.slice().sort((a, b) => a - b);
  let best = null;
  for (let i = 1; i < s.length; i++) {
    const lo = s.slice(0, i);
    const hi = s.slice(i);
    const ml = lo.reduce((a, b) => a + b, 0) / lo.length;
    const mh = hi.reduce((a, b) => a + b, 0) / hi.length;
    const within = lo.reduce((a, v) => a + (v - ml) ** 2, 0) + hi.reduce((a, v) => a + (v - mh) ** 2, 0);
    if (!best || within < best.within) best = { within, ml, mh, cut: (s[i - 1] + s[i]) / 2 };
  }
  // Bimodal: word gaps clearly wider than letter gaps.
  if (best && best.mh >= 2 * Math.max(1, best.ml) && best.mh - best.ml >= 0.3 * xHeight) {
    // Capped: letter gaps rarely exceed ~0.9 x-height, so one unusually
    // wide gap (a word left out, a long pause) cannot make every ordinary
    // word gap look like a letter gap.
    return { threshold: Math.max(0.35 * xHeight, Math.min(best.cut, 0.9 * xHeight)), bimodal: true };
  }
  return fallback;
}

/**
 * Segments a text mask. `slot` labels the observations; `knownText` (the
 * prompt or transcription) only provides the expected number of lines for
 * a diagnostic — never a claim about which region holds which character.
 * Returns { region, lines, words, uncertain, components, diagnostics }.
 */
export function segment(mask, w, h, { slot = 0, knownText = null, script = null } = {}) {
  const cc = components(mask, w, h);
  const comps = classifyComponents(cc, w, h);
  const writing = comps.filter(c => c.kind === 'writing');
  const isWriting = new Uint8Array(cc.count + 1);
  writing.forEach(c => (isWriting[c.label] = 1));
  const inkArea = writing.reduce((a, c) => a + c.area, 0);

  const diagnostics = {
    components: cc.count,
    writingComponents: writing.length,
    specks: comps.filter(c => c.kind === 'speck').length,
    edgeArtefacts: comps.filter(c => c.kind === 'edge').length,
    expectedLines: knownText ? knownText.split('\n').filter(l => l.trim()).length : null,
  };
  if (!writing.length || inkArea < 50) {
    return { region: null, lines: [], words: [], uncertain: [], components: comps, diagnostics: { ...diagnostics, foundLines: 0 } };
  }

  // Row profile of writing ink.
  const profile = new Float64Array(h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let n = 0;
    for (let x = 0; x < w; x++) if (isWriting[cc.labels[row + x]]) n++;
    profile[y] = n;
  }
  const heights = writing.filter(c => c.area > 8).map(c => c.y1 - c.y0 + 1);
  const typical = median(heights) || 8;
  // Typical height of the larger half of the components (by area): letters
  // or whole Devanagari words, not the many small matras, marks and dots.
  const medianArea = median(writing.map(c => c.area)) || 0;
  const typicalLarge = median(writing.filter(c => c.area >= medianArea).map(c => c.y1 - c.y0 + 1)) || typical;
  const sm = smooth(profile, Math.max(1, Math.round(typical / 4)));
  let peak = 0;
  for (let i = 0; i < h; i++) peak = Math.max(peak, sm[i]);
  let bands = bandsOf(sm, 0.06 * peak);

  // Merge a band carrying little ink into its nearest neighbour when it sits
  // close to it: dots, matras above a headline, marks below, descenders.
  const inkOf = b => {
    let s = 0;
    for (let y = b.from; y <= b.to; y++) s += profile[y];
    return s;
  };
  for (let guard = 0; guard < 10000 && bands.length > 1; guard++) {
    const ink = bands.map(inkOf);
    let pick = -1;
    for (let i = 0; i < bands.length; i++) {
      if (bands[i].weak) continue;
      const neighbours = [i - 1, i + 1].filter(j => j >= 0 && j < bands.length);
      const strong = Math.max(...neighbours.map(j => ink[j]));
      if (ink[i] < 0.25 * strong && (pick < 0 || ink[i] < ink[pick])) pick = i;
    }
    if (pick < 0) break;
    const b = bands[pick];
    const candidates = [pick - 1, pick + 1]
      .filter(j => j >= 0 && j < bands.length)
      .map(j => {
        const n = bands[j];
        const gap = j < pick ? b.from - n.to - 1 : n.from - b.to - 1;
        return { j, gap, fits: gap <= 0.6 * (n.to - n.from + 1) };
      })
      .filter(c => c.fits)
      .sort((p, q) => p.gap - q.gap);
    if (!candidates.length) {
      // Too far from any line: keep it as its own (weak) band.
      bands[pick] = { ...b, weak: true };
      continue;
    }
    const j = candidates[0].j;
    const n = bands[j];
    bands[Math.min(pick, j)] = { from: Math.min(b.from, n.from), to: Math.max(b.to, n.to), ...(n.weak ? { weak: true } : null) };
    bands.splice(Math.max(pick, j), 1);
  }
  const bandHeight = () => median(bands.map(b => b.to - b.from + 1)) || typical;
  // Split bands much taller than the rest at their deepest valley.
  const split = [];
  const bh0 = bandHeight();
  for (const b of bands) {
    const height = b.to - b.from + 1;
    if (bands.length > 1 && height > 2.4 * bh0) {
      let at = -1;
      let low = Infinity;
      let top = 0;
      for (let y = b.from; y <= b.to; y++) top = Math.max(top, sm[y]);
      for (let y = b.from + Math.round(0.25 * height); y <= b.to - Math.round(0.25 * height); y++) {
        if (sm[y] < low) {
          low = sm[y];
          at = y;
        }
      }
      if (at > 0 && low < 0.25 * top) {
        split.push({ from: b.from, to: at, split: true }, { from: at + 1, to: b.to, split: true });
        continue;
      }
    }
    split.push(b);
  }
  bands = split;

  // Assign components to bands by vertical centre.
  const lines = bands.map((b, i) => ({ index: i, band: b, comps: [] }));
  const uncertain = [];
  for (const c of writing) {
    const cy = (c.y0 + c.y1) / 2;
    let li = lines.findIndex(l => cy >= l.band.from && cy <= l.band.to);
    if (li < 0) {
      // Between bands: the nearest one.
      let best = Infinity;
      lines.forEach((l, i) => {
        const d = cy < l.band.from ? l.band.from - cy : cy - l.band.to;
        if (d < best) {
          best = d;
          li = i;
        }
      });
    }
    const line = lines[li];
    const spans = lines.filter(l => c.y0 <= l.band.to - 0.25 * (l.band.to - l.band.from) && c.y1 >= l.band.from + 0.25 * (l.band.to - l.band.from)).length;
    if (spans > 1) {
      uncertain.push({
        slot,
        kind: 'uncertain',
        bbox: [c.x0, c.y0, c.x1 - c.x0 + 1, c.y1 - c.y0 + 1],
        confidence: null,
        reasons: ['ink spans more than one line (touching lines or a large mark)'],
      });
    }
    line.comps.push(c);
  }

  const lineObs = [];
  const wordObs = [];
  const xHeights = [];
  for (const line of lines.filter(l => l.comps.length)) {
    const { from, to } = line.band;
    let x0 = w;
    let x1 = -1;
    let y0 = h;
    let y1 = -1;
    for (const c of line.comps) {
      x0 = Math.min(x0, c.x0);
      x1 = Math.max(x1, c.x1);
      y0 = Math.min(y0, c.y0);
      y1 = Math.max(y1, c.y1);
    }
    // Body rows: at least half the band's typical (median) ink row. Relative
    // to the median, not the peak, so a dense headline row does not shrink
    // the body to itself.
    const inked = [];
    for (let y = from; y <= to; y++) if (profile[y] > 0) inked.push(profile[y]);
    // 75th percentile: the x-height zone carries most of the ink rows;
    // ascender and descender rows are sparser.
    const sortedInk = inked.slice().sort((p, q) => p - q);
    const typicalInk = sortedInk.length ? sortedInk[Math.floor(0.75 * (sortedInk.length - 1))] : 1;
    let top = -1;
    let bottom = -1;
    for (let y = from; y <= to; y++) {
      if (profile[y] >= 0.5 * typicalInk) {
        if (top < 0) top = y;
        bottom = y;
      }
    }
    const xHeight = Math.max(1, bottom - top + 1);
    xHeights.push(xHeight);
    // Possible Devanagari headline: one row in the upper part of the body far
    // denser than the body's typical row.
    let headline = null;
    const bodyRows = [];
    for (let y = top; y <= bottom; y++) bodyRows.push(profile[y]);
    const typicalRow = median(bodyRows) || 1;
    let hy = -1;
    let hv = 0;
    for (let y = top; y <= top + Math.round(0.45 * xHeight); y++) {
      if (profile[y] > hv) {
        hv = profile[y];
        hy = y;
      }
    }
    if (hy >= 0 && hv >= 2.2 * typicalRow && hv >= 0.15 * (x1 - x0 + 1)) {
      // A headline is one long continuous stroke across a word, not the
      // aligned tops of separate letters: require a run ≥ 1.5 × x-height
      // (gaps of up to 2 px tolerated) in the dense row or the rows beside it.
      let longest = 0;
      for (let yy = Math.max(0, hy - 1); yy <= Math.min(h - 1, hy + 1); yy++) {
        let run = 0;
        let gap = 0;
        for (let x = x0; x <= x1; x++) {
          if (isWriting[cc.labels[yy * w + x]]) {
            run += gap + 1;
            gap = 0;
          } else if (run && ++gap > 2) {
            run = 0;
            gap = 0;
          }
          if (run > longest) longest = run;
        }
      }
      if (longest >= 1.5 * xHeight) headline = { y: hy, strength: round1(hv / typicalRow), run: longest };
    }

    // Separation from neighbouring lines: ink in the band's margins vs its peak.
    const edgeInk = Math.max(sm[Math.max(0, from - 1)], sm[Math.min(h - 1, to + 1)]);
    const separation = clamp01(1 - edgeInk / Math.max(1, sm.reduce((a, v, i) => (i >= from && i <= to ? Math.max(a, v) : a), 0)));
    const reasons = [];
    if (line.band.split) reasons.push('separated from a neighbouring line at a shallow valley');
    if (separation < 0.7) reasons.push('touches a neighbouring line');
    if (xHeight < 6) reasons.push('writing very small in the photo');
    // One line of writing spans about 2.5–3 x-heights (ascenders to
    // descenders); a much taller band probably holds lines that touch.
    // Compared with the typical letter-component height, which does not
    // depend on how the bands were cut (a merged band inflates its own
    // x-height).
    const tall = y1 - y0 + 1 > 4 * typicalLarge;
    if (tall) reasons.push('may contain more than one line (lines touch)');
    const score = clamp01(separation * (xHeight >= 6 ? 1 : xHeight / 6) * (line.band.split ? 0.7 : 1) * (tall ? 0.5 : 1));
    const obs = {
      slot,
      kind: 'line',
      line: line.index,
      bbox: [x0, y0, x1 - x0 + 1, y1 - y0 + 1],
      baseline: bottom,
      xHeight,
      ...(headline ? { headline: headline.y } : null),
      confidence: { score: Math.round(score * 1000) / 1000, basis: 'line separation (ink at the band edges vs its peak) × writing size', inputs: { separation: round1(separation), xHeight } },
      reasons,
      ...(headline ? { headlineStrength: headline.strength } : null),
    };
    lineObs.push(obs);

    // Words: merge overlapping x-extents, then split at wide gaps.
    const spans = line.comps
      .map(c => [c.x0, c.x1, c.y0, c.y1])
      .sort((a, b) => a[0] - b[0]);
    const groups = [];
    for (const s of spans) {
      const g = groups[groups.length - 1];
      if (g && s[0] <= g[1] + 1) {
        g[1] = Math.max(g[1], s[1]);
        g[2] = Math.min(g[2], s[2]);
        g[3] = Math.max(g[3], s[3]);
      } else groups.push(s.slice());
    }
    const gaps = groups.slice(1).map((g, i) => g[0] - groups[i][1] - 1);
    const { threshold, bimodal } = wordGapThreshold(gaps, xHeight);
    let current = groups.length ? groups[0].slice() : null;
    const words = [];
    for (let i = 1; i < groups.length; i++) {
      if (gaps[i - 1] > threshold) {
        words.push(current);
        current = groups[i].slice();
      } else {
        current[1] = groups[i][1];
        current[2] = Math.min(current[2], groups[i][2]);
        current[3] = Math.max(current[3], groups[i][3]);
      }
    }
    if (current) words.push(current);
    for (const [wx0, wx1, wy0, wy1] of words) {
      wordObs.push({
        slot,
        kind: 'word',
        line: line.index,
        bbox: [wx0, wy0, wx1 - wx0 + 1, wy1 - wy0 + 1],
        confidence: {
          score: bimodal ? 0.8 : 0.5,
          basis: bimodal ? 'word gaps clearly wider than letter gaps' : 'gaps not clearly bimodal; split at 0.6 × x-height',
          inputs: { gapThreshold: round1(threshold) },
        },
        reasons: bimodal ? [] : ['word spacing not clearly different from letter spacing'],
      });
    }
  }

  let rx0 = w;
  let ry0 = h;
  let rx1 = -1;
  let ry1 = -1;
  for (const c of writing) {
    rx0 = Math.min(rx0, c.x0);
    ry0 = Math.min(ry0, c.y0);
    rx1 = Math.max(rx1, c.x1);
    ry1 = Math.max(ry1, c.y1);
  }
  const lineScores = lineObs.map(l => l.confidence.score);
  const meanLine = lineScores.length ? lineScores.reduce((a, b) => a + b, 0) / lineScores.length : 0;
  const edgeShare = comps.filter(c => c.kind === 'edge').reduce((a, c) => a + c.area, 0) / Math.max(1, inkArea);
  const regionScore = clamp01(meanLine * (1 - Math.min(0.5, edgeShare)));
  const regionReasons = [];
  if (edgeShare > 0.2) regionReasons.push('dark areas at the page edge (shadow or background)');
  if (meanLine < 0.6) regionReasons.push('lines are not clearly separated');
  const region = {
    slot,
    kind: 'region',
    bbox: [rx0, ry0, rx1 - rx0 + 1, ry1 - ry0 + 1],
    xHeight: median(xHeights),
    confidence: {
      score: Math.round(regionScore * 1000) / 1000,
      basis: 'mean line separation, reduced by ink at the page edges',
      inputs: { lines: lineObs.length, meanLine: round1(meanLine), edgeShare: round1(edgeShare) },
    },
    reasons: regionReasons,
  };
  const headlines = lineObs.filter(l => l.headline !== undefined).length;
  return {
    region,
    lines: lineObs,
    words: wordObs,
    uncertain,
    components: comps,
    diagnostics: {
      ...diagnostics,
      foundLines: lineObs.length,
      lineCountMatches: diagnostics.expectedLines === null ? null : diagnostics.expectedLines === lineObs.length,
      possibleHeadlines: headlines,
      scriptHint: script,
      medianXHeight: median(xHeights),
    },
  };
}
