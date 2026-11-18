/* eslint-disable no-bitwise -- pixel indexing, truncation and base64 decoding are bit operations by nature */
/**
 * Analysis rasters: 8-bit grayscale images, row-major, stride = width
 * (one byte per pixel, no padding), orientation already corrected by the
 * native decoder (imageInput.decodeSampleImage).
 *
 * Size budget: the native side scales the long edge to ANALYSIS_LONG_EDGE
 * (2000 px). A 4:3 photo becomes 2000 × 1500 = 3.0 MP:
 *   raster                       3.0 MB  (Uint8Array)
 *   base64 string over the bridge 4.0 MB  (+ native copies while sending)
 *   largest analysis temporaries  2 × Float32 (24 MB) during thresholding,
 *                                 Int32 labels (12 MB) during segmentation
 * so a sample peaks at roughly 45 MB of JS memory and is released after
 * analysis (the raster is not kept in the wizard's state).
 */

export const ANALYSIS_LONG_EDGE = 2000;
export const MAX_ANALYSIS_EDGE = 4096;
export const MIN_ANALYSIS_EDGE = 64;

/** { width, height, data: Uint8Array(width * height) } */
export function makeRaster(width, height, data) {
  return { width, height, data: data || new Uint8Array(width * height) };
}

/** Problems with a raster ([] when valid). */
export function validateRaster(r) {
  if (!r || typeof r !== 'object') return ['raster: missing'];
  const errors = [];
  const { width, height, data } = r;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < MIN_ANALYSIS_EDGE || height < MIN_ANALYSIS_EDGE) {
    errors.push(`raster: width and height must be integers ≥ ${MIN_ANALYSIS_EDGE}`);
  } else if (Math.max(width, height) > MAX_ANALYSIS_EDGE) {
    errors.push(`raster: long edge must be ≤ ${MAX_ANALYSIS_EDGE}`);
  }
  if (!(data instanceof Uint8Array)) errors.push('raster: data must be a Uint8Array');
  else if (Number.isInteger(width) && Number.isInteger(height) && data.length !== width * height) {
    errors.push(`raster: data has ${data.length} bytes, expected ${width * height}`);
  }
  return errors;
}

// --- Base64 (no dependency; Hermes may not provide atob) -------------------

const B64 = new Int16Array(128).fill(-1);
'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.split('').forEach((c, i) => (B64[c.charCodeAt(0)] = i));

/** Base64 → Uint8Array, or null if the text is not valid base64. */
export function decodeBase64(text) {
  if (typeof text !== 'string') return null;
  let len = text.length;
  while (len > 0 && text.charCodeAt(len - 1) === 61) len--; // '='
  if ((text.length % 4 !== 0 && text.length !== len) || len % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((len * 3) / 4));
  let o = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < len; i++) {
    const c = text.charCodeAt(i);
    const v = c < 128 ? B64[c] : -1;
    if (v < 0) return null;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return o === out.length ? out : out.subarray(0, o);
}

/**
 * A raster from the native decoder's result
 * { width, height, encoding: 'gray8-base64', data }.
 * Returns { raster } or { errors }.
 */
export function rasterFromNative(result) {
  if (!result || result.encoding !== 'gray8-base64') return { errors: ['unknown pixel encoding'] };
  const data = decodeBase64(result.data);
  if (!data) return { errors: ['pixel data is not valid base64'] };
  const raster = makeRaster(result.width, result.height, data);
  const errors = validateRaster(raster);
  return errors.length ? { errors } : { raster };
}

// --- Statistics ---------------------------------------------------------------

export function histogram(data, mask, maskValue) {
  const h = new Uint32Array(256);
  if (mask) {
    for (let i = 0; i < data.length; i++) if (mask[i] === maskValue) h[data[i]]++;
  } else {
    for (let i = 0; i < data.length; i++) h[data[i]]++;
  }
  return h;
}

/** The value at fraction p (0–1) of a 256-bin histogram (null if empty). */
export function percentile(hist, p) {
  let total = 0;
  for (let i = 0; i < 256; i++) total += hist[i];
  if (!total) return null;
  const target = p * (total - 1);
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc > target) return i;
  }
  return 255;
}

/** Otsu's threshold of a 256-bin histogram. */
export function otsu(hist) {
  let total = 0;
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    total += hist[i];
    sum += i * hist[i];
  }
  let wB = 0;
  let sumB = 0;
  let best = 0;
  let at = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      at = t;
    }
  }
  return at;
}

export function median(values) {
  if (!values.length) return null;
  const s = Float64Array.from(values).sort();
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// --- Background (paper level) ---------------------------------------------------

/**
 * Paper brightness across the page, robust to ink: the image is cut into
 * blocks and each block's 90th-percentile gray value is taken (ink covers
 * far less than 10 % of a block of handwriting), then the grid is smoothed.
 * Returns { grid: Float32Array, gw, gh, block, at(x, y) } — `at` samples
 * the grid bilinearly.
 */
export function backgroundGrid(r, block) {
  const { width: w, height: h, data } = r;
  const b = block || Math.max(8, Math.round(Math.max(w, h) / 100));
  const gw = Math.ceil(w / b);
  const gh = Math.ceil(h / b);
  const raw = new Float32Array(gw * gh);
  const hist = new Uint32Array(256);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      hist.fill(0);
      const x1 = Math.min(w, (gx + 1) * b);
      const y1 = Math.min(h, (gy + 1) * b);
      for (let y = gy * b; y < y1; y++) {
        const row = y * w;
        for (let x = gx * b; x < x1; x++) hist[data[row + x]]++;
      }
      raw[gy * gw + gx] = Math.max(1, percentile(hist, 0.9));
    }
  }
  // 3 × 3 smoothing (edges clamped).
  const grid = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let s = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const yy = gy + dy;
          const xx = gx + dx;
          if (yy >= 0 && yy < gh && xx >= 0 && xx < gw) {
            s += raw[yy * gw + xx];
            n++;
          }
        }
      }
      grid[gy * gw + gx] = s / n;
    }
  }
  // Paper level of a whole row (bilinear), written into `out` (Float32Array(w)).
  const xi0 = new Int32Array(w);
  const xi1 = new Int32Array(w);
  const xt = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    const fx = Math.min(gw - 1, Math.max(0, (x + 0.5) / b - 0.5));
    xi0[x] = Math.floor(fx);
    xi1[x] = Math.min(gw - 1, xi0[x] + 1);
    xt[x] = fx - xi0[x];
  }
  const rowGrid = new Float32Array(gw);
  const row = (y, out) => {
    const fy = Math.min(gh - 1, Math.max(0, (y + 0.5) / b - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(gh - 1, y0 + 1);
    const ty = fy - y0;
    for (let gx = 0; gx < gw; gx++) rowGrid[gx] = grid[y0 * gw + gx] * (1 - ty) + grid[y1 * gw + gx] * ty;
    for (let x = 0; x < w; x++) out[x] = rowGrid[xi0[x]] * (1 - xt[x]) + rowGrid[xi1[x]] * xt[x];
    return out;
  };
  const at = (x, y) => {
    const fx = Math.min(gw - 1, Math.max(0, (x + 0.5) / b - 0.5));
    const fy = Math.min(gh - 1, Math.max(0, (y + 0.5) / b - 0.5));
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(gw - 1, x0 + 1);
    const y1 = Math.min(gh - 1, y0 + 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const top = grid[y0 * gw + x0] * (1 - tx) + grid[y0 * gw + x1] * tx;
    const bottom = grid[y1 * gw + x0] * (1 - tx) + grid[y1 * gw + x1] * tx;
    return top * (1 - ty) + bottom * ty;
  };
  return { grid, gw, gh, block: b, at, row };
}

// --- Filters ----------------------------------------------------------------------

/** Horizontal running sums of v and v² over a window of 2r+1 (edge-clamped windows). */
function rowSums(data, w, h, r) {
  const sum = new Float32Array(w * h);
  const sq = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let s = 0;
    let q = 0;
    for (let x = 0; x <= Math.min(r, w - 1); x++) {
      const v = data[row + x];
      s += v;
      q += v * v;
    }
    for (let x = 0; x < w; x++) {
      sum[row + x] = s;
      sq[row + x] = q;
      const add = x + r + 1;
      const drop = x - r;
      if (add < w) {
        const v = data[row + add];
        s += v;
        q += v * v;
      }
      if (drop >= 0) {
        const v = data[row + drop];
        s -= v;
        q -= v * v;
      }
    }
  }
  return { sum, sq };
}

/**
 * Sauvola adaptive threshold: ink where v < m · (1 + k · (s / R − 1)), with
 * m, s the mean and standard deviation in a (2r+1)² window. `maxInk` caps
 * the threshold so flat paper never turns into ink. Returns a Uint8Array
 * mask (1 = ink). Memory: two Float32 planes (horizontal sums).
 */
export function sauvola(r, { radius, k = 0.2, R = 128, maxInk = 235 } = {}) {
  const { width: w, height: h, data } = r;
  const rad = radius || Math.max(7, Math.min(40, Math.round(Math.max(w, h) / 60)));
  const { sum, sq } = rowSums(data, w, h, rad);
  const mask = new Uint8Array(w * h);
  const colS = new Float64Array(w);
  const colQ = new Float64Array(w);
  const nx = new Int32Array(w);
  for (let x = 0; x < w; x++) nx[x] = Math.min(w - 1, x + rad) - Math.max(0, x - rad) + 1;
  // Prime the vertical windows.
  for (let y = 0; y <= Math.min(rad, h - 1); y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      colS[x] += sum[row + x];
      colQ[x] += sq[row + x];
    }
  }
  for (let y = 0; y < h; y++) {
    const ny = Math.min(h - 1, y + rad) - Math.max(0, y - rad) + 1;
    const row = y * w;
    for (let x = 0; x < w; x++) {
      // v < m · (1 + k · (s / R − 1)), compared without a square root:
      // a = v − m(1 − k) < (m k / R) · s  ⇔  a < 0, or a² < (m k / R)² · s².
      const v = data[row + x];
      if (v >= maxInk) continue;
      const n = nx[x] * ny;
      const m = colS[x] / n;
      const a = v - m * (1 - k);
      if (a < 0) {
        mask[row + x] = 1;
        continue;
      }
      const variance = colQ[x] / n - m * m;
      const f = (m * k) / R;
      if (variance > 0 && a * a < f * f * variance) mask[row + x] = 1;
    }
    const add = y + rad + 1;
    const drop = y - rad;
    if (add < h) {
      const ar = add * w;
      for (let x = 0; x < w; x++) {
        colS[x] += sum[ar + x];
        colQ[x] += sq[ar + x];
      }
    }
    if (drop >= 0) {
      const dr = drop * w;
      for (let x = 0; x < w; x++) {
        colS[x] -= sum[dr + x];
        colQ[x] -= sq[dr + x];
      }
    }
  }
  return mask;
}

/** Box blur of a raster (radius r), for fixtures and smoothing. */
export function boxBlur(r, radius) {
  const { width: w, height: h, data } = r;
  if (radius < 1) return makeRaster(w, h, data.slice());
  const { sum } = rowSums(data, w, h, radius);
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    const nx = Math.min(w - 1, x + radius) - Math.max(0, x - radius) + 1;
    let s = 0;
    for (let y = 0; y <= Math.min(radius, h - 1); y++) s += sum[y * w + x];
    for (let y = 0; y < h; y++) {
      const ny = Math.min(h - 1, y + radius) - Math.max(0, y - radius) + 1;
      out[y * w + x] = Math.round(s / (nx * ny));
      if (y + radius + 1 < h) s += sum[(y + radius + 1) * w + x];
      if (y - radius >= 0) s -= sum[(y - radius) * w + x];
    }
  }
  return makeRaster(w, h, out);
}
