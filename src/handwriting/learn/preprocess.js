/* eslint-disable no-bitwise -- pixel indexing, truncation and base64 decoding are bit operations by nature */
/**
 * Preprocessing of a handwriting sample raster (raster.js). Every step
 * returns a new representation; the input raster is never modified:
 *
 *   raster (original, oriented)
 *     → normalised   flat-field: gray / local paper level (uneven light removed)
 *     → inkMask      Sauvola adaptive threshold of the normalised image
 *     → cleanMask    specks of ≤ SPECK_AREA px removed (dots of i, full
 *                    stops and matras are larger and survive)
 *     → deskewed     cleanMask rotated by the estimated skew (if any)
 *     → textMask     paper rules removed where nothing crosses them
 *
 * Paper rules are removed conservatively (detectRules): only long, thin,
 * straight bands — and, on a ruled page, regularly spaced ones. A band that
 * could be handwriting (a long headline, an underline) is kept and
 * reported as uncertain. Where ink crosses a rule, the rule pixels stay.
 */
import { backgroundGrid, sauvola } from './raster';

export const SPECK_AREA = 2;

/** Flat-field normalisation: 255 · gray / paper level, clamped. */
export function normalise(r, bg = backgroundGrid(r)) {
  const { width: w, height: h, data } = r;
  const out = new Uint8Array(w * h);
  const level = new Float32Array(w);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    bg.row(y, level);
    for (let x = 0; x < w; x++) {
      const v = (255 * data[row + x]) / level[x];
      out[row + x] = v >= 255 ? 255 : v;
    }
  }
  return { width: w, height: h, data: out };
}

/** Ink mask (1 = ink) of a normalised raster. */
export function inkMask(normalised, options) {
  return sauvola(normalised, options);
}

// --- Connected components ----------------------------------------------------

/**
 * 8-connected components of a mask. Returns { labels: Int32Array (0 =
 * background, 1…count), count, minX, minY, maxX, maxY, area } (stats are
 * typed arrays indexed by label).
 */
export function components(mask, w, h) {
  const labels = new Int32Array(w * h);
  let parent = new Int32Array(1024);
  let next = 1;
  const find = a => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (!mask[row + x]) continue;
      const up = row - w;
      let l = x > 0 ? labels[row + x - 1] : 0;
      if (y > 0) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const c = labels[up + xx];
          if (!c) continue;
          if (!l) l = c;
          else if (c !== l) union(l, c);
        }
      }
      if (!l) {
        if (next >= parent.length) {
          const grown = new Int32Array(parent.length * 2);
          grown.set(parent);
          parent = grown;
        }
        parent[next] = next;
        l = next++;
      }
      labels[row + x] = l;
    }
  }
  // Compact labels.
  const map = new Int32Array(next);
  let count = 0;
  for (let i = 1; i < next; i++) {
    const r = find(i);
    if (r === i) map[i] = ++count;
  }
  for (let i = 1; i < next; i++) map[i] = map[find(i)];
  const minX = new Int32Array(count + 1).fill(w);
  const minY = new Int32Array(count + 1).fill(h);
  const maxX = new Int32Array(count + 1).fill(-1);
  const maxY = new Int32Array(count + 1).fill(-1);
  const area = new Int32Array(count + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const l0 = labels[row + x];
      if (!l0) continue;
      const l = map[l0];
      labels[row + x] = l;
      area[l]++;
      if (x < minX[l]) minX[l] = x;
      if (x > maxX[l]) maxX[l] = x;
      if (y < minY[l]) minY[l] = y;
      if (y > maxY[l]) maxY[l] = y;
    }
  }
  return { labels, count, minX, minY, maxX, maxY, area };
}

/** Removes components of at most `maxArea` pixels. Returns { mask, removed }. */
export function despeckle(mask, w, h, maxArea = SPECK_AREA) {
  const cc = components(mask, w, h);
  const out = new Uint8Array(w * h);
  let removed = 0;
  for (let i = 0; i < out.length; i++) {
    const l = cc.labels[i];
    if (!l) continue;
    if (cc.area[l] > maxArea) out[i] = 1;
    else removed++;
  }
  let specks = 0;
  for (let l = 1; l <= cc.count; l++) if (cc.area[l] <= maxArea) specks++;
  return { mask: out, removedPixels: removed, specks, components: cc.count };
}

// --- Skew -------------------------------------------------------------------------

/**
 * Skew of the writing (degrees; positive = lines rise to the right in the
 * image, i.e. y decreases with x) by projection-profile sharpness: ink
 * pixels are projected onto the vertical axis of the page rotated by each
 * candidate angle; text lines (and rules) give the sharpest profile — the
 * largest sum of squared bin counts — at the right angle.
 * Returns { angle, confidence, method } (confidence: how much the best
 * angle stands out from the median, 0–1; not a calibrated probability).
 */
export function estimateSkew(mask, w, h, { range = 8, step = 0.5, maxPoints = 30000 } = {}) {
  const xs = [];
  const ys = [];
  let total = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) total++;
  if (total < 50) return { angle: 0, confidence: 0, method: 'projection-profile', points: total };
  const every = Math.max(1, Math.floor(total / maxPoints));
  let k = 0;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (mask[row + x] && k++ % every === 0) {
        xs.push(x - w / 2);
        ys.push(y - h / 2);
      }
    }
  }
  const size = Math.ceil(Math.hypot(w, h)) + 2;
  const bins = new Float64Array(size);
  const score = deg => {
    const a = (deg * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    bins.fill(0);
    const half = size / 2 + 0.5;
    for (let i = 0; i < xs.length; i++) {
      const yy = ys[i] * c + xs[i] * s + half;
      if (yy >= 0 && yy < size) bins[yy | 0]++;
    }
    let q = 0;
    for (let i = 0; i < size; i++) q += bins[i] * bins[i];
    return q;
  };
  const scores = [];
  let best = 0;
  let bestScore = -1;
  for (let d = -range; d <= range + 1e-9; d += step) {
    const q = score(d);
    scores.push(q);
    if (q > bestScore) {
      bestScore = q;
      best = d;
    }
  }
  for (let d = best - step; d <= best + step + 1e-9; d += step / 5) {
    const q = score(d);
    if (q > bestScore) {
      bestScore = q;
      best = d;
    }
  }
  const sorted = scores.slice().sort((a, b) => a - b);
  const med = sorted[sorted.length >> 1];
  return {
    angle: Math.round(best * 100) / 100,
    confidence: bestScore > 0 ? Math.max(0, Math.min(1, (bestScore - med) / bestScore)) : 0,
    method: 'projection-profile',
    points: xs.length,
  };
}

/** Rotates a mask by `deg` about its centre (nearest neighbour, same size). */
export function rotateMask(mask, w, h, deg) {
  if (Math.abs(deg) < 1e-6) return mask.slice();
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const out = new Uint8Array(w * h);
  const cx = w / 2;
  const cy = h / 2;
  for (let y = 0; y < h; y++) {
    // Inverse map: output (x, y) samples the source at
    // (dx·c + dy·s + cx, −dx·s + dy·c + cy), stepped along the row.
    const dy = y - cy;
    let sx = -cx * c + dy * s + cx + 0.5;
    let sy = cx * s + dy * c + cy + 0.5;
    const row = y * w;
    for (let x = 0; x < w; x++, sx += c, sy -= s) {
      if (sx >= 0 && sx < w && sy >= 0 && sy < h && mask[(sy | 0) * w + (sx | 0)]) out[row + x] = 1;
    }
  }
  return out;
}

// --- Paper rules ------------------------------------------------------------------

/**
 * Finds long, thin, straight ink bands: horizontal rules (and vertical
 * margin lines). A band is a run of rows whose ink covers at least
 * `minCover` of the width. Classified:
 *   rule       thin, continuous (no break longer than 1.5 % of the page —
 *              handwriting breaks at word gaps), running across ≥ 60 % of
 *              the page, and either covering ≥ ruleCover of it or lying on
 *              the grid of a regularly ruled page
 *   uncertain  long but not clearly a rule (could be a headline or an
 *              underline): kept as ink
 * Returns { horizontal: [band], vertical: [band], spacing, periodic }
 * where band = { from, to, thickness, cover, kind, reasons }.
 */
export function detectRules(mask, w, h, { minCover = 0.35, ruleCover = 0.6, maxThickness, dark = null } = {}) {
  // Bands are found on `dark` (pixels darker than paper, see darkMask) when
  // given: a faint rule is darker than paper all along, even where the ink
  // threshold drops it. Otherwise on the ink mask itself.
  const src = dark || mask;
  const thick = maxThickness || Math.max(4, Math.round(0.006 * Math.max(w, h)));
  // Coverage of a row = share of positions with ink in that row or the row
  // either side: a faint, noisy or slightly rotated rule thresholds into
  // fragments spread over neighbouring rows.
  const scan = (len, across, at) => {
    const cover = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      let n = 0;
      for (let j = 0; j < across; j++) {
        if (at(i, j) || (i > 0 && at(i - 1, j)) || (i < len - 1 && at(i + 1, j))) n++;
      }
      cover[i] = n / across;
    }
    const bands = [];
    for (let i = 0; i < len; ) {
      if (cover[i] < minCover) {
        i++;
        continue;
      }
      let j = i;
      let peak = 0;
      while (j < len && cover[j] >= minCover) peak = Math.max(peak, cover[j++]);
      // Continuity: the longest break along the band (its rows ± 1 merged).
      // A printed rule runs across with only small breaks; a row of
      // headlines or underlines breaks at every word gap.
      let first = -1;
      let last = -1;
      let maxGap = 0;
      let prev = -1;
      for (let k = 0; k < across; k++) {
        let any = false;
        for (let r = Math.max(0, i - 1); r <= Math.min(len - 1, j) && !any; r++) any = !!at(r, k);
        if (!any) continue;
        if (first < 0) first = k;
        if (prev >= 0 && k - prev - 1 > maxGap) maxGap = k - prev - 1;
        prev = k;
        last = k;
      }
      bands.push({
        from: i,
        to: j - 1,
        thickness: j - i,
        cover: Math.round(peak * 1000) / 1000,
        span: first < 0 ? 0 : Math.round(((last - first + 1) / across) * 1000) / 1000,
        maxGap,
      });
      i = j;
    }
    return bands;
  };
  const maxBreakH = Math.max(12, Math.round(0.015 * w));
  const maxBreakV = Math.max(12, Math.round(0.015 * h));
  const horizontal = scan(h, w, (y, x) => src[y * w + x]);
  const vertical = scan(w, h, (x, y) => src[y * w + x]);
  // A ruled page: thin bands on a regular grid. The spacing is the median gap
  // between consecutive thin bands; a band is on the grid when its distance
  // from the first band is within 10 % of a whole number of spacings. Bands
  // off the grid (a long headline or underline between two rules) do not
  // break the pattern — they simply are not rules.
  // Only thin, continuous bands can be rules (or define the ruling grid).
  const thin = horizontal.filter(b => b.thickness <= thick && b.maxGap <= maxBreakH && b.span >= 0.6);
  const mid = b => (b.from + b.to) / 2;
  const gaps = thin.slice(1).map((b, i) => mid(b) - mid(thin[i])).sort((a, b) => a - b);
  const spacing = gaps.length ? gaps[gaps.length >> 1] : 0;
  const onGrid = b => {
    if (!spacing || !thin.length) return false;
    const k = (mid(b) - mid(thin[0])) / spacing;
    return Math.abs(k - Math.round(k)) * spacing <= Math.max(2, 0.1 * spacing);
  };
  const gridded = thin.filter(onGrid);
  const periodic = spacing > 3 * thick && gridded.length >= 3 && gridded.length >= 0.6 * thin.length;
  const mean = spacing;
  const classify = (b, isPeriodic, maxBreak) => {
    const reasons = [];
    if (b.thickness > thick) reasons.push('thicker than a printed rule');
    if (b.maxGap > maxBreak) reasons.push('broken into separate pieces (word gaps), like handwriting');
    if (b.span < 0.6) reasons.push('does not run across the page');
    if (b.cover < ruleCover && !isPeriodic) reasons.push('does not span the page');
    const kind = reasons.length ? 'uncertain' : 'rule';
    return { ...b, kind, reasons };
  };
  return {
    horizontal: horizontal.map(b => classify(b, periodic && b.thickness <= thick && onGrid(b), maxBreakH)),
    vertical: vertical.map(b => classify(b, false, maxBreakV)),
    spacing: periodic ? Math.round(mean * 10) / 10 : null,
    // Where the grid puts every rule on the page (centre rows), including
    // rules too faint to be detected as bands.
    gridRows: periodic
      ? (() => {
          const rows = [];
          const first = mid(gridded[0]);
          for (let c = first - Math.floor(first / spacing) * spacing; c < h; c += spacing) rows.push(Math.round(c));
          return rows;
        })()
      : [],
    periodic,
    maxThickness: thick,
  };
}

/**
 * Pixels darker than the paper (normalised gray < level): faint printed
 * rules included, which the ink threshold may only partly keep.
 */
export function darkMask(normalised, level = 235) {
  const { data } = normalised;
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) if (data[i] < level) out[i] = 1;
  return out;
}

/**
 * Removes `rule` bands from a mask, except where ink continues just above
 * and below the band (a stroke crossing the rule). Uncertain bands are left
 * untouched. Returns { mask, removedPixels }.
 */
export function suppressRules(mask, w, h, rules) {
  const out = mask.slice();
  let removed = 0;
  const near = (x, y) => {
    for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx;
      if (xx >= 0 && xx < w && y >= 0 && y < h && mask[y * w + xx]) return true;
    }
    return false;
  };
  // A photographed rule has ragged edges (noise, slight rotation): rows just
  // outside the detected band carry fragments of it, so RULE_MARGIN rows on
  // each side are cleared too — except where a stroke crosses the rule.
  const RULE_MARGIN = 2;
  for (const b of rules.horizontal) {
    if (b.kind !== 'rule') continue;
    const from = Math.max(0, b.from - RULE_MARGIN);
    const to = Math.min(h - 1, b.to + RULE_MARGIN);
    const above = from - 2;
    const below = to + 2;
    for (let x = 0; x < w; x++) {
      if (near(x, above) && near(x, below)) continue; // a stroke crosses here
      for (let y = from; y <= to; y++) {
        if (out[y * w + x]) {
          out[y * w + x] = 0;
          removed++;
        }
      }
    }
  }
  for (const b of rules.vertical) {
    if (b.kind !== 'rule') continue;
    for (let y = 0; y < h; y++) {
      const left = b.from - 2;
      const right = b.to + 2;
      const crossing = left >= 0 && right < w && mask[y * w + left] && mask[y * w + right];
      if (crossing) continue;
      for (let x = b.from; x <= b.to; x++) {
        if (out[y * w + x]) {
          out[y * w + x] = 0;
          removed++;
        }
      }
    }
  }
  // On a ruled page, pieces of ink lying entirely inside a rule's strip are
  // rule fragments (faint or noisy rules threshold into dashes). Anything
  // that reaches outside the strip — a stroke touching the rule, a headline
  // with letters below it — is kept whole.
  let fragments = 0;
  if (rules.periodic && rules.gridRows && rules.gridRows.length) {
    const half = Math.ceil(rules.maxThickness / 2) + RULE_MARGIN;
    const strip = new Int32Array(h).fill(-1);
    rules.gridRows.forEach((c, i) => {
      for (let y = Math.max(0, c - half); y <= Math.min(h - 1, c + half); y++) strip[y] = i;
    });
    const cc = components(out, w, h);
    const drop = new Uint8Array(cc.count + 1);
    for (let l = 1; l <= cc.count; l++) {
      const s = strip[cc.minY[l]];
      if (s >= 0 && strip[cc.maxY[l]] === s) {
        drop[l] = 1;
        fragments++;
      }
    }
    if (fragments) {
      for (let i = 0; i < out.length; i++) {
        if (out[i] && drop[cc.labels[i]]) {
          out[i] = 0;
          removed++;
        }
      }
    }
  }
  return { mask: out, removedPixels: removed, fragments };
}

/**
 * Ink given back where suppressRules cleared a rule band (Phase 9). On a
 * notebook page the letters stand on the rule: a stroke's foot ends inside
 * the band, so the crossing test does not protect it. Pen ink is far darker
 * than a printed rule, so within each removed band a pixel comes back when
 * it is clearly darker than that rule (median gray of the band's ink-mask
 * pixels, minus max(RULE_INK.minStep, RULE_INK.share × (255 − rule))) and
 * is joined, through such pixels, to the writing kept outside the band.
 * The rule itself (at its own level) stays removed, so letters joined only
 * by the rule stay apart; where ink and rule are alike, nothing returns.
 * Returns { mask, restoredPixels }.
 */
export const RULE_INK = { minStep: 30, share: 0.3, margin: 2 };

export function restoreInkOnRules(before, after, gray, w, h, rules) {
  const out = after.slice();
  let restored = 0;
  const bands = rules.horizontal.filter(b => b.kind === 'rule');
  if (!bands.length) return { mask: out, restoredPixels: 0 };
  const inBand = new Uint8Array(h);
  const level = new Float32Array(h);
  for (const b of bands) {
    const from = Math.max(0, b.from - RULE_INK.margin);
    const to = Math.min(h - 1, b.to + RULE_INK.margin);
    const vals = [];
    for (let y = from; y <= to; y++) for (let x = 0; x < w; x += 2) if (before[y * w + x]) vals.push(gray[y * w + x]);
    if (vals.length < 20) continue;
    vals.sort((a, c) => a - c);
    const rule = vals[Math.floor(vals.length / 2)];
    const cut = rule - Math.max(RULE_INK.minStep, RULE_INK.share * (255 - rule));
    for (let y = from; y <= to; y++) {
      inBand[y] = 1;
      level[y] = cut;
    }
  }
  const candidate = i => {
    const y = (i / w) | 0;
    return inBand[y] && before[i] && !out[i] && gray[i] < level[y];
  };
  // Grow from the kept writing into dark removed pixels.
  const stack = [];
  for (let y = 0; y < h; y++) {
    if (!inBand[y]) continue;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!candidate(i)) continue;
      let touches = false;
      for (let dy = -1; dy <= 1 && !touches; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h && after[yy * w + xx]) {
            touches = true;
            break;
          }
        }
      }
      if (touches) {
        out[i] = 1;
        restored++;
        stack.push(i);
      }
    }
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % w;
    const y = (i - x) / w;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (candidate(j)) {
          out[j] = 1;
          restored++;
          stack.push(j);
        }
      }
    }
  }
  return { mask: out, restoredPixels: restored };
}

/** Rotates a gray image by `deg` about its centre (nearest neighbour; outside → white). */
export function rotateGray(gray, w, h, deg) {
  if (Math.abs(deg) < 1e-6) return gray.slice();
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const out = new Uint8Array(w * h).fill(255);
  const cx = w / 2;
  const cy = h / 2;
  for (let y = 0; y < h; y++) {
    const dy = y - cy;
    let sx = -cx * c + dy * s + cx + 0.5;
    let sy = cx * s + dy * c + cy + 0.5;
    const row = y * w;
    for (let x = 0; x < w; x++, sx += c, sy -= s) {
      if (sx >= 0 && sx < w && sy >= 0 && sy < h) out[row + x] = gray[Math.floor(sy) * w + Math.floor(sx)];
    }
  }
  return out;
}

/**
 * Faint printed lines left in the text mask — the light-blue rules of a
 * notebook page, which the rule test keeps when the writing sits on them
 * (the band then looks thick and broken): their pixels are clearly lighter
 * than the writing (real pages: rule ≈ 170–180 vs ink core ≈ 40 on the
 * normalised scale).
 *
 *   ink core     the darkest fifth of the page's ink
 *   line rows    rows of the gray image where at least lineSpan of the width
 *                is "line-coloured" — darker than paper (≤ 255 − paperMargin)
 *                but at least minContrast lighter than the ink core (a
 *                printed rule runs across the page, under the letters too;
 *                the mask holds it only in fragments); neighbouring such
 *                rows form one line, taken with one row on each side (two
 *                took in more letter bottoms and did worse on a real page)
 *   clearing     in a line's rows, a column whose darkest ink is lighter
 *                than the midpoint between the ink core and the line's
 *                typical level holds only the printed line and is cleared —
 *                if its neighbours are line-only too (a letter's soft edge,
 *                next to dark ink, stays); a column with dark ink (a stroke
 *                crossing the line) is kept whole
 *   under        in a kept column, the line's own pixels (lighter than the
 *                threshold, on a horizontal run, not next to darker ink) are
 *                cleared too — they are the line under a letter that stands
 *                on it, not the letter (Phase 11)
 *   leftovers    then a separate piece lying within a line's rows with no
 *                pixel darker than that line's threshold is cleared too (a
 *                remnant beside a letter would otherwise join its word and
 *                shift its letters); a letter's soft edge is joined to its
 *                dark ink and stays
 *
 * Lines as dark as the writing (underlines, a Devanagari headline, black
 * printed rules) are not light ink and are never touched.
 * Returns { mask, removedPixels, underLetters, bands: [{ from, to, inkCore, lineLevel, cleared }] }.
 */
export const FAINT_LINES = { minContrast: 50, lineSpan: 0.3, paperMargin: 25, underRun: 3 };

export function suppressFaintBands(mask, gray, w, h, { minContrast = FAINT_LINES.minContrast } = {}) {
  const out = mask.slice();
  const hist = new Uint32Array(256);
  let n = 0;
  for (let i = 0; i < w * h; i++) {
    if (mask[i]) {
      hist[gray[i]]++;
      n++;
    }
  }
  if (n < 50) return { mask: out, removedPixels: 0, bands: [] };
  let acc = 0;
  let inkCore = 0;
  while (inkCore < 255 && acc + hist[inkCore] < 0.2 * n) acc += hist[inkCore++];
  const lightLevel = inkCore + minContrast;
  const paperEdge = 255 - FAINT_LINES.paperMargin;
  const isLine = new Uint8Array(h);
  for (let y = 0; y < h; y++) {
    let lineColoured = 0;
    for (let x = 0; x < w; x++) {
      const v = gray[y * w + x];
      if (v >= lightLevel && v <= paperEdge) lineColoured++;
    }
    if (lineColoured >= FAINT_LINES.lineSpan * w) isLine[y] = 1;
  }
  let removedPixels = 0;
  let underLetters = 0;
  const bands = [];
  for (let y0 = 0; y0 < h; y0++) {
    if (!isLine[y0]) continue;
    let y1 = y0;
    while (y1 + 1 < h && isLine[y1 + 1]) y1++;
    const from = Math.max(0, y0 - 1);
    const to = Math.min(h - 1, y1 + 1);
    const colMin = new Int16Array(w).fill(-1);
    const levels = [];
    for (let x = 0; x < w; x++) {
      let m = 256;
      for (let y = from; y <= to; y++) if (mask[y * w + x] && gray[y * w + x] < m) m = gray[y * w + x];
      if (m < 256) {
        colMin[x] = m;
        levels.push(m);
      }
    }
    levels.sort((p, q) => p - q);
    const lineLevel = levels.length ? levels[Math.floor(levels.length / 2)] : 0;
    const T = (inkCore + lineLevel) / 2;
    const lineOnly = x => x < 0 || x >= w || colMin[x] < 0 || colMin[x] > T;
    let cleared = 0;
    if (lineLevel - inkCore >= minContrast) {
      for (let x = 0; x < w; x++) {
        if (colMin[x] < 0 || !(lineOnly(x) && lineOnly(x - 1) && lineOnly(x + 1))) continue;
        for (let y = from; y <= to; y++) {
          if (out[y * w + x]) {
            out[y * w + x] = 0;
            removedPixels++;
          }
        }
        cleared++;
      }
      // Under a letter that stands on the line its column is kept, but the
      // line's own pixels there are not the letter (Phase 11: they were
      // traced as a tail under a and e): in the line's rows, a pixel lighter
      // than T, more than a pixel from any darker ink, on a horizontal run
      // of FAINT_LINES.underRun such pixels, is cleared too. The letter's
      // dark ink and its soft edge (next to that ink) stay.
      const light = i => out[i] && gray[i] > T;
      const nearDark = (x, y) => {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < w && yy < h && mask[yy * w + xx] && gray[yy * w + xx] <= T) return true;
          }
        }
        return false;
      };
      // A line that crosses the band (ink just above and just below it: a
      // margin line, a stem passing through) is not the band's line.
      const inkAt = (x, y) => y >= 0 && y < h && mask[y * w + x];
      // At the image's edge the band's own edge row stands in for what is beyond.
      const above = x => (from === 0 ? inkAt(x, 0) : inkAt(x, from - 1) || inkAt(x, from - 2));
      const below = x => (to === h - 1 ? inkAt(x, h - 1) : inkAt(x, to + 1) || inkAt(x, to + 2));
      const crosses = x => x >= 0 && x < w && above(x) && below(x);
      const crossing = x => crosses(x - 1) || crosses(x) || crosses(x + 1); // with its soft edges
      for (let y = from; y <= to; y++) {
        let x = 0;
        while (x < w) {
          if (!light(y * w + x)) {
            x++;
            continue;
          }
          let x1 = x;
          while (x1 + 1 < w && light(y * w + x1 + 1)) x1++;
          if (x1 - x + 1 >= FAINT_LINES.underRun) {
            for (let k = x; k <= x1; k++) {
              if (!nearDark(k, y) && !crossing(k)) {
                out[y * w + k] = 0;
                removedPixels++;
                underLetters++;
              }
            }
          }
          x = x1 + 1;
        }
      }
    }
    bands.push({ from, to, inkCore, lineLevel, cleared, threshold: T });
    y0 = y1;
  }
  const lines = bands.filter(b => b.cleared > 0);
  if (lines.length) {
    const c = components(out, w, h);
    const darkest = new Int16Array(c.count + 1).fill(256);
    for (let i = 0; i < w * h; i++) {
      const l = c.labels[i];
      if (l && gray[i] < darkest[l]) darkest[l] = gray[i];
    }
    const drop = new Uint8Array(c.count + 1);
    for (let k = 1; k <= c.count; k++) {
      const line = lines.find(b => c.minY[k] >= b.from && c.maxY[k] <= b.to);
      if (line && darkest[k] > line.threshold) drop[k] = 1;
    }
    for (let i = 0; i < w * h; i++) {
      if (drop[c.labels[i]]) {
        out[i] = 0;
        removedPixels++;
      }
    }
  }
  return { mask: out, removedPixels, underLetters, bands };
}

/**
 * Objects around the page in a photo — the desk edge, the paper's own edge,
 * a book, keys, a cable, a sleeve — show up as ink blobs that swallow the
 * text lines. Such a component touches the photo's border and spans more
 * than half its width or BACKGROUND_SHARE of its height — or, anywhere, is
 * taller than that share (the paper's own edge): handwriting on the page does neither (a
 * notebook's margin line, which does, is not writing either; a long title
 * underline is wide, not tall, and stays). These are cleared from the text mask.
 * With `pageEdges` — the raster is a page cut out of a photo (Phase 9), so
 * its border is the sheet's own edge, which writing does not cross — an
 * edge-touching piece more than PAGE_EDGE_OBJECT times as tall as the
 * typical piece of writing is also an object (keys or a pen lying across
 * the sheet's edge). Returns { mask, removedPixels, objects }.
 */
export const BACKGROUND_SHARE = 0.25;
export const PAGE_EDGE_OBJECT = 4;

export function dropBorderObjects(mask, w, h, share = BACKGROUND_SHARE, { pageEdges = false } = {}) {
  const out = mask.slice();
  const c = components(mask, w, h);
  const drop = new Uint8Array(c.count + 1);
  let objects = 0;
  let edgeLimit = Infinity;
  if (pageEdges) {
    const heights = [];
    for (let k = 1; k <= c.count; k++) {
      const inner = c.minX[k] > 0 && c.minY[k] > 0 && c.maxX[k] < w - 1 && c.maxY[k] < h - 1;
      if (inner && c.maxY[k] - c.minY[k] >= 2) heights.push(c.maxY[k] - c.minY[k] + 1);
    }
    heights.sort((a, b) => a - b);
    if (heights.length >= 5) edgeLimit = PAGE_EDGE_OBJECT * heights[Math.floor(heights.length / 2)];
  }
  for (let k = 1; k <= c.count; k++) {
    const touches = c.minX[k] === 0 || c.minY[k] === 0 || c.maxX[k] === w - 1 || c.maxY[k] === h - 1;
    // Wide only beyond half the photo: a long joined-up word in a tightly
    // cropped photo may touch the border and span a quarter of it.
    const big = c.maxX[k] - c.minX[k] + 1 > 0.5 * w || c.maxY[k] - c.minY[k] + 1 > Math.min(share * h, edgeLimit);
    const tall = c.maxY[k] - c.minY[k] + 1 > share * h;
    if ((touches && big) || tall) {
      drop[k] = 1;
      objects++;
    }
  }
  let removedPixels = 0;
  if (objects) {
    for (let i = 0; i < w * h; i++) {
      if (drop[c.labels[i]]) {
        out[i] = 0;
        removedPixels++;
      }
    }
  }
  return { mask: out, removedPixels, objects };
}
