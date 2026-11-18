#!/usr/bin/env node
/**
 * Measures the reference handwriting scans (reference/*.png) so the
 * handwriting profile is based on numbers, not guesses. Dev tool only — the
 * images are never bundled into the app.
 *
 * Usage: node scripts/analyze-reference.js [file …]
 *
 * For each image: rule pitch, x-height, ascender, descender, stroke width,
 * slant, letter and word gaps, ink and paper colours — all also expressed
 * relative to the rule pitch, so they map onto the app's paper.
 * No dependencies: PNG decoding uses Node's zlib.
 */
/* eslint-disable no-bitwise */
/* eslint-env node */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function decodePng(file) {
  const buf = fs.readFileSync(file);
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
      if (data[8] !== 8 || data[12] !== 0) {
        throw new Error('Only 8-bit non-interlaced PNGs are supported');
      }
    } else if (type === 'IDAT') {
      idat.push(data);
    }
    pos += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0;
  if (!bpp) {
    throw new Error(`Unsupported colour type ${colorType}`);
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = v & 255;
    }
  }
  const px = (x, y) => {
    const i = y * stride + x * bpp;
    return bpp >= 3 ? [out[i], out[i + 1], out[i + 2]] : [out[i], out[i], out[i]];
  };
  return { width, height, px };
}

const median = a => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const lum = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;

/**
 * Natural variation of the writing: letter components on the deskewed page
 * give the height spread, baseline wobble (and how smooth it is from letter
 * to letter), per-word baseline shift and letter-gap rhythm; a distance
 * transform on the ink mask gives stroke width and ink density along strokes.
 */
function measureVariation(img, isInk, t, peaks, pitch, xh, split) {
  const { width: W, height: H } = img;
  const mask = new Uint8Array(W * H);
  const dark = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = img.px(x, y);
      if (isInk(c)) {
        mask[y * W + x] = 1;
        dark[y * W + x] = 255 - lum(c);
      }
    }
  }
  // Connected components (8-neighbour), with deskewed vertical bounds.
  const label = new Int32Array(W * H).fill(-1);
  const comps = [];
  const stack = [];
  for (let i = 0; i < W * H; i++) {
    if (!mask[i] || label[i] >= 0) continue;
    const comp = { x0: W, x1: 0, y0: Infinity, y1: -Infinity, n: 0 };
    label[i] = comps.length;
    stack.push(i);
    while (stack.length) {
      const j = stack.pop();
      const x = j % W;
      const y = (j - x) / W;
      comp.n++;
      const yy = y - (x - W / 2) * t + 100;
      comp.x0 = Math.min(comp.x0, x);
      comp.x1 = Math.max(comp.x1, x);
      comp.y0 = Math.min(comp.y0, yy);
      comp.y1 = Math.max(comp.y1, yy);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const k = ny * W + nx;
          if (mask[k] && label[k] < 0) {
            label[k] = comps.length;
            stack.push(k);
          }
        }
      }
    }
    comps.push(comp);
  }
  const avg = a => {
    const f = a.filter(Number.isFinite);
    return f.reduce((s, v) => s + v, 0) / f.length;
  };
  const std = a => {
    const m = avg(a);
    return Math.sqrt(avg(a.map(v => (v - m) * (v - m))));
  };
  const lag1 = a => {
    if (a.length < 3) return NaN;
    const m = avg(a);
    let num = 0;
    let den = 0;
    for (let i = 0; i < a.length; i++) {
      den += (a[i] - m) ** 2;
      if (i) num += (a[i] - m) * (a[i - 1] - m);
    }
    return den ? num / den : NaN;
  };
  const heights = [];
  const baseResid = [];
  const baseLag = [];
  const wordShift = [];
  const gapCV = [];
  const gapLag = [];
  peaks.forEach(peak => {
    // x-height letters on this line: height near the x-height, centred in
    // the x-height band.
    const letters = comps
      .filter(c => {
        const h = c.y1 - c.y0 + 1;
        const cy = (c.y0 + c.y1) / 2;
        return (
          c.n > xh &&
          h > xh * 0.7 &&
          h < xh * 1.35 &&
          cy > peak - pitch * 0.5 &&
          cy < peak + pitch * 0.3
        );
      })
      .sort((a, b) => a.x0 - b.x0);
    if (letters.length < 8) return;
    letters.forEach(c => heights.push((c.y1 - c.y0 + 1) / xh));
    // Baseline: residual of letter bottoms from the line's straight fit.
    const xs = letters.map(c => (c.x0 + c.x1) / 2);
    const ys = letters.map(c => c.y1);
    const mx = avg(xs);
    const my = avg(ys);
    let sxy = 0;
    let sxx = 0;
    xs.forEach((x, i) => {
      sxy += (x - mx) * (ys[i] - my);
      sxx += (x - mx) ** 2;
    });
    const slope = sxx ? sxy / sxx : 0;
    const resid = ys.map((y, i) => (y - (my + slope * (xs[i] - mx))) / xh);
    baseResid.push(...resid);
    baseLag.push(lag1(resid));
    let word = [0];
    const words = [];
    const gaps = [];
    for (let i = 1; i < letters.length; i++) {
      const gap = letters[i].x0 - letters[i - 1].x1;
      if (gap > split) {
        words.push(word);
        word = [i];
      } else {
        word.push(i);
        if (gap > 0) gaps.push(gap / xh);
      }
    }
    words.push(word);
    const wordMeans = words
      .filter(w => w.length >= 2)
      .map(w => avg(w.map(i => resid[i])));
    if (wordMeans.length > 2) wordShift.push(std(wordMeans));
    if (gaps.length > 4) {
      gapCV.push(std(gaps) / avg(gaps));
      gapLag.push(lag1(gaps));
    }
  });
  // Stroke width along strokes: chamfer distance transform; ridge pixels
  // (local maxima) give the half width there.
  const dist = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) dist[i] = mask[i] ? 1e6 : 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!dist[i]) continue;
      let d = dist[i];
      if (x > 0) d = Math.min(d, dist[i - 1] + 1);
      if (y > 0) d = Math.min(d, dist[i - W] + 1);
      if (x > 0 && y > 0) d = Math.min(d, dist[i - W - 1] + Math.SQRT2);
      if (x < W - 1 && y > 0) d = Math.min(d, dist[i - W + 1] + Math.SQRT2);
      dist[i] = d;
    }
  }
  for (let y = H - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (!dist[i]) continue;
      let d = dist[i];
      if (x < W - 1) d = Math.min(d, dist[i + 1] + 1);
      if (y < H - 1) d = Math.min(d, dist[i + W] + 1);
      if (x < W - 1 && y < H - 1) d = Math.min(d, dist[i + W + 1] + Math.SQRT2);
      if (x > 0 && y < H - 1) d = Math.min(d, dist[i + W - 1] + Math.SQRT2);
      dist[i] = d;
    }
  }
  const ridgeW = [];
  const ridgeDark = [];
  const perComp = new Map();
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const d = dist[i];
      if (!d || d > xh * 0.4) continue;
      if ([i - 1, i + 1, i - W, i + W].some(k => dist[k] > d)) continue;
      const w = 2 * d - 1;
      ridgeW.push(w);
      ridgeDark.push(dark[i]);
      if (!perComp.has(label[i])) perComp.set(label[i], []);
      perComp.get(label[i]).push(w);
    }
  }
  const mW = median(ridgeW);
  const within = [];
  perComp.forEach(ws => {
    if (ws.length >= 12) within.push(std(ws) / avg(ws));
  });
  const q = (a, p) => {
    const s = [...a].sort((x, y) => x - y);
    return s[Math.floor((s.length - 1) * p)];
  };
  const r3 = v => Math.round(v * 1000) / 1000;
  return {
    lettersMeasured: heights.length,
    letterHeightSD: r3(std(heights)),
    baselineResidualSD: r3(std(baseResid)),
    baselineLag1: r3(avg(baseLag)),
    wordBaselineShiftSD: r3(avg(wordShift)),
    letterGapCV: r3(avg(gapCV)),
    letterGapLag1: r3(avg(gapLag)),
    strokeWidthPerXHeight: r3(mW / xh),
    strokeWidthQ10Q90: [r3(q(ridgeW, 0.1) / mW), r3(q(ridgeW, 0.9) / mW)],
    strokeWidthWithinStrokeCV: r3(avg(within)),
    inkDensityCV: r3(std(ridgeDark) / avg(ridgeDark)),
  };
}


/**
 * Page geometry: the writing region (ink bounding box, ignoring the outer
 * 3 % of the photo), the red margin line, and how thick the ruled lines are.
 */
function measurePage(img, isInk, isRule, pitch) {
  const { width: W, height: H } = img;
  const isRed = c => c[0] > 150 && c[0] - c[2] > 35 && c[0] - c[1] > 35;
  const redCols = new Float64Array(W);
  let x0 = W;
  let x1 = 0;
  let y0 = H;
  let y1 = 0;
  const ruleRuns = [];
  for (let x = 0; x < W; x += 1) {
    let run = 0;
    for (let y = 0; y < H; y++) {
      const c = img.px(x, y);
      if (isRed(c)) redCols[x] += 1;
      const inside = x > W * 0.03 && x < W * 0.97 && y > H * 0.03 && y < H * 0.97;
      if (inside && isInk(c)) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
      // Rule thickness: vertical runs of rule-coloured pixels (every 13th column).
      if (x % 13 === 0) {
        if (isRule(c)) run++;
        else if (run) {
          if (run < pitch * 0.4) ruleRuns.push(run);
          run = 0;
        }
      }
    }
  }
  // Red margin: the strongest red column(s) in the left third.
  let margin = -1;
  let best = 0;
  for (let x = 0; x < W / 3; x++) {
    if (redCols[x] > best) {
      best = redCols[x];
      margin = x;
    }
  }
  const r2 = v => Math.round(v * 100) / 100;
  return {
    writingRegionPx: { left: x0, top: y0, right: x1, bottom: y1 },
    writingWidthPerPitch: r2((x1 - x0) / pitch),
    leftMarginPerPitch: r2(x0 / pitch),
    redMarginXPx: best > H * 0.3 ? margin : null,
    ruleThicknessPx: median(ruleRuns),
  };
}

function analyze(file) {
  const img = decodePng(file);
  const { width: W, height: H } = img;
  const isInk = c => lum(c) < 135 && c[2] >= c[0] - 10;
  const isRule = c => {
    const l = lum(c);
    return l > 140 && l < 230 && c[2] - c[0] > 10;
  };
  const inkX = [];
  const inkY = [];
  const ruleX = [];
  const ruleY = [];
  const inkColors = [];
  const paper = [];
  const ruleColors = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = img.px(x, y);
      if (isInk(c)) {
        inkX.push(x);
        inkY.push(y);
        if (lum(c) < 100) inkColors.push(c);
      } else if (isRule(c)) {
        if ((x + y) % 3 === 0) {
          ruleX.push(x);
          ruleY.push(y);
        }
        if (x % 7 === 0) ruleColors.push(c);
      } else if (x % 11 === 0 && y % 11 === 0 && lum(c) > 200) {
        paper.push(c);
      }
    }
  }
  const profile = (xs, ys, t) => {
    const rows = new Float64Array(H + 200);
    for (let i = 0; i < xs.length; i++) {
      const yy = Math.round(ys[i] - (xs[i] - W / 2) * t) + 100;
      if (yy >= 0 && yy < rows.length) rows[yy] += 1;
    }
    return rows;
  };
  // 1. Deskew: the tilt that makes the ink rows sharpest.
  let skew = { t: 0, score: -1 };
  for (let deg = -4; deg <= 4; deg += 0.25) {
    const t = Math.tan((deg * Math.PI) / 180);
    const rows = profile(inkX, inkY, t);
    let score = 0;
    for (const v of rows) score += v * v;
    if (score > skew.score) skew = { t, deg, score };
  }
  const t = skew.t;
  const inkRows = profile(inkX, inkY, t);
  const ruleRows = profile(ruleX, ruleY, t);
  // 2. Line pitch: the strongest repeat in the ruling (or the writing).
  const period = rows => {
    const mean = rows.reduce((a, b) => a + b, 0) / rows.length;
    let best = { lag: 0, r: -Infinity };
    for (let lag = 18; lag < H / 3; lag++) {
      let r = 0;
      for (let i = 0; i + lag < rows.length; i++) r += (rows[i] - mean) * (rows[i + lag] - mean);
      if (r > best.r) best = { lag, r };
    }
    return best.lag;
  };
  const pitch = ruleX.length > W * 4 ? period(ruleRows) : period(inkRows);

  // 3. Written lines: peaks of the ink profile, at least ~0.7 pitch apart.
  const peaks = [];
  const maxRow = Math.max(...inkRows);
  for (let y = 1; y < inkRows.length - 1; y++) {
    if (inkRows[y] < maxRow * 0.25) continue;
    let isPeak = true;
    for (let k = -Math.round(pitch * 0.35); k <= Math.round(pitch * 0.35); k++) {
      if (inkRows[y + k] > inkRows[y]) isPeak = false;
    }
    if (isPeak && (!peaks.length || y - peaks[peaks.length - 1] > pitch * 0.7)) peaks.push(y);
  }

  const xHeights = [];
  const ascenders = [];
  const descenders = [];
  const strokeRuns = [];
  const slants = [];
  const gaps = [];
  const inkByLine = peaks.map(() => []);
  for (let i = 0; i < inkX.length; i++) {
    const yy = inkY[i] - (inkX[i] - W / 2) * t + 100;
    for (let k = 0; k < peaks.length; k++) {
      if (yy >= peaks[k] - pitch * 0.62 && yy < peaks[k] + pitch * 0.5) {
        inkByLine[k].push([inkX[i], yy]);
        break;
      }
    }
  }
  peaks.forEach((peak, k) => {
    const pts = inkByLine[k];
    if (pts.length < W * 0.6) return;
    const top = Math.floor(peak - pitch * 0.62);
    const rows = new Float64Array(Math.ceil(pitch * 1.15) + 2);
    for (const [, yy] of pts) rows[Math.floor(yy) - top] += 1;
    const max = Math.max(...rows);
    const core = [];
    rows.forEach((n, r) => n >= max * 0.42 && core.push(r));
    const any = [];
    rows.forEach((n, r) => n >= max * 0.04 && any.push(r));
    const coreTop = core[0];
    const base = core[core.length - 1];
    xHeights.push(base - coreTop + 1);
    ascenders.push(base - any[0] + 1);
    descenders.push(any[any.length - 1] - base);

    // Stroke width: horizontal ink runs across the x-height band.
    const grid = new Map();
    for (const [x, yy] of pts) {
      const r = Math.floor(yy) - top;
      if (r >= coreTop && r <= base) {
        if (!grid.has(r)) grid.set(r, []);
        grid.get(r).push(x);
      }
    }
    for (const xs of grid.values()) {
      xs.sort((a, b) => a - b);
      let run = 1;
      for (let i = 1; i < xs.length; i++) {
        if (xs[i] === xs[i - 1] + 1) run++;
        else {
          if (run < pitch * 0.3) strokeRuns.push(run);
          run = 1;
        }
      }
    }
    // Slant: the shear that makes vertical strokes sharpest.
    let best = { deg: 0, score: -1 };
    for (let deg = -20; deg <= 20; deg += 1) {
      const sh = Math.tan((deg * Math.PI) / 180);
      const cols = new Float64Array(W + 400);
      for (const [x, yy] of pts) {
        const xs = Math.round(x - (top + base - yy) * sh) + 200;
        if (xs >= 0 && xs < cols.length) cols[xs] += 1;
      }
      let score = 0;
      for (const v of cols) score += v * v;
      if (score > best.score) best = { deg, score };
    }
    slants.push(best.deg);
    // Gaps in the (slant-corrected) column occupancy of the x-height band.
    const sh = Math.tan((best.deg * Math.PI) / 180);
    const occ = new Uint8Array(W + 400);
    for (const [x, yy] of pts) {
      const r = Math.floor(yy) - top;
      if (r >= any[0] && r <= base) occ[Math.round(x - (top + base - yy) * sh) + 200] = 1;
    }
    const first = occ.indexOf(1);
    const last = occ.lastIndexOf(1);
    let run = 0;
    for (let x = first; x <= last; x++) {
      if (!occ[x]) run++;
      else if (run) {
        gaps.push(run);
        run = 0;
      }
    }
  });

  const sorted = [...gaps].sort((a, b) => a - b);
  let split = median(sorted);
  for (let k = 0; k < 30; k++) {
    const next = (median(sorted.filter(g => g <= split)) + median(sorted.filter(g => g > split))) / 2;
    if (!Number.isFinite(next) || Math.abs(next - split) < 0.25) break;
    split = next;
  }
  const letterGaps = sorted.filter(g => g <= split);
  const wordGaps = sorted.filter(g => g > split && g < pitch * 2.5);
  const mc = arr => [0, 1, 2].map(i => median(arr.map(c => c[i])));
  const hex = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  const xh = median(xHeights);
  const r2 = v => Math.round(v * 100) / 100;
  return {
    file: path.basename(file),
    size: W + 'x' + H,
    skewDeg: skew.deg,
    rulePitchPx: pitch,
    linesMeasured: xHeights.length,
    xHeightPx: xh,
    ratios: {
      xHeightPerPitch: r2(xh / pitch),
      ascenderPerXHeight: r2(median(ascenders) / xh),
      descenderPerXHeight: r2(median(descenders) / xh),
      strokeWidthPerXHeight: r2(median(strokeRuns) / xh),
      letterGapPerXHeight: r2(median(letterGaps) / xh),
      wordGapPerXHeight: r2(median(wordGaps) / xh),
    },
    slantDeg: median(slants),
    page: measurePage(img, isInk, isRule, pitch),
    variation: measureVariation(img, isInk, t, peaks, pitch, xh, split),
    colors: { ink: hex(mc(inkColors)), paper: hex(mc(paper)), rule: hex(mc(ruleColors)) },
  };
}

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs
      .readdirSync(path.join(__dirname, '../reference'))
      .filter(f => f.endsWith('.png'))
      .map(f => path.join(__dirname, '../reference', f));
for (const f of files) {
  console.log(JSON.stringify(analyze(f), null, 2));
}
