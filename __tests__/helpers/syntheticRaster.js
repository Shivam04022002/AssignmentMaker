/* eslint-env node */
/* eslint-disable no-bitwise -- seeded xorshift random generator */
/**
 * SYNTHETIC IMAGE FIXTURES — not handwriting, not anyone's writing.
 *
 * Draws handwriting-like pages from plain geometry (straight strokes,
 * circles and arcs) into 8-bit grayscale rasters, with known ground truth
 * (where the text lines and paper rules are), so the on-device analysis
 * can be tested without real samples. Deterministic (seeded).
 *
 * Options: paper/ink levels, Latin-like or Devanagari-like words (a
 * headline with stems below it and detached marks above/below), stroke
 * width, ruled paper, skew, uneven lighting, noise, blur, dots.
 */
import { boxBlur, makeRaster } from '../../src/handwriting/learn/raster';

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** Coverage canvas: draw thick segments with a 1 px soft edge. */
export function canvas(w, h) {
  const cov = new Float32Array(w * h);
  const seg = (x0, y0, x1, y1, width) => {
    const r = width / 2;
    const minX = Math.max(0, Math.floor(Math.min(x0, x1) - r - 1));
    const maxX = Math.min(w - 1, Math.ceil(Math.max(x0, x1) + r + 1));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1) - r - 1));
    const maxY = Math.min(h - 1, Math.ceil(Math.max(y0, y1) + r + 1));
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy || 1;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len2));
        const d = Math.hypot(x - (x0 + t * dx), y - (y0 + t * dy));
        const c = Math.max(0, Math.min(1, r + 0.5 - d));
        const i = y * w + x;
        if (c > cov[i]) cov[i] = c;
      }
    }
  };
  return { cov, seg };
}

/**
 * A synthetic page. Returns { raster, truth: { lines: [{ baseline, top, x0,
 * x1, words }], rules: [y], xHeight } } in final (skewed) pixel space for
 * baselines only approximately (truth is given before skew).
 */
export function syntheticPage(o = {}) {
  const {
    width = 1200,
    height = 900,
    seed = 7,
    paper = 236,
    ink = 45,
    lines = 6,
    top = 140,
    lineGap = 110,
    marginX = 110,
    xHeight = 26,
    stroke = 3.2,
    script = 'latn', // 'latn' | 'deva' | 'mixed'
    wordsPerLine = 5,
    rules = false,
    ruleInk = 190,
    ruleWidth = 2,
    skew = 0, // degrees, positive = rising to the right
    gradient = 0, // 0–1: light falls off to the right
    noise = 0, // σ in gray levels
    blur = 0, // box radius
    dots = true,
    blank = false,
  } = o;
  const r = rng(seed);
  const text = canvas(width, height);
  const ruled = canvas(width, height);
  const cx = width / 2;
  const cy = height / 2;
  const a = (-skew * Math.PI) / 180;
  const rot = (x, y) => [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)];
  const line = (c, x0, y0, x1, y1, wd) => {
    const [ax, ay] = rot(x0, y0);
    const [bx, by] = rot(x1, y1);
    c.seg(ax, ay, bx, by, wd);
  };
  const arc = (c, ox, oy, rx, ry, a0, a1, wd) => {
    const steps = Math.max(8, Math.round((Math.abs(a1 - a0) * Math.max(rx, ry)) / 3));
    for (let i = 0; i < steps; i++) {
      const t0 = a0 + ((a1 - a0) * i) / steps;
      const t1 = a0 + ((a1 - a0) * (i + 1)) / steps;
      line(c, ox + rx * Math.cos(t0), oy + ry * Math.sin(t0), ox + rx * Math.cos(t1), oy + ry * Math.sin(t1), wd);
    }
  };
  const truth = { lines: [], rules: [], xHeight };
  if (rules) {
    for (let y = top - lineGap + 8; y < height; y += lineGap / 2) {
      line(ruled, -50, y, width + 50, y, ruleWidth);
      truth.rules.push(Math.round(y));
    }
  }
  if (!blank) {
    for (let li = 0; li < lines; li++) {
      const base = top + li * lineGap;
      let x = marginX + r() * 20;
      const words = [];
      const scriptOf = script === 'mixed' ? (li % 2 ? 'deva' : 'latn') : script;
      for (let wi = 0; wi < wordsPerLine && x < width - marginX - 120; wi++) {
        const letters = 3 + Math.floor(r() * 4);
        const x0 = x;
        const xh = xHeight;
        const lw = xh * 0.75;
        if (scriptOf === 'deva') {
          // Headline across the word; stems and bowls hang below it.
          const wordW = letters * lw * 1.05;
          line(text, x, base - xh, x + wordW, base - xh, stroke);
          for (let k = 0; k < letters; k++) {
            const lx = x + k * lw * 1.05 + lw * 0.2;
            line(text, lx + lw * 0.6, base - xh, lx + lw * 0.6, base, stroke); // stem
            arc(text, lx + lw * 0.3, base - xh * 0.45, lw * 0.28, xh * 0.3, Math.PI * 0.5, Math.PI * 1.9, stroke);
            if (k === 1) arc(text, lx + lw * 0.5, base - xh - 7, lw * 0.25, 5, Math.PI, 2 * Math.PI, stroke); // matra above, detached
            if (k === 2) arc(text, lx + lw * 0.5, base + 8, lw * 0.2, 4, 0, Math.PI, stroke); // mark below, detached
          }
          x += wordW;
        } else {
          for (let k = 0; k < letters; k++) {
            const kind = Math.floor(r() * 5);
            const lx = x + lw * 0.1;
            if (kind === 0) arc(text, lx + lw * 0.4, base - xh / 2, lw * 0.38, xh / 2, 0, 2 * Math.PI, stroke); // o
            else if (kind === 1) line(text, lx + lw * 0.3, base - xh * 1.7, lx + lw * 0.3, base, stroke); // l
            else if (kind === 2) {
              line(text, lx, base - xh, lx, base, stroke); // n
              arc(text, lx + lw * 0.35, base - xh * 0.6, lw * 0.35, xh * 0.4, Math.PI, 2 * Math.PI, stroke);
              line(text, lx + lw * 0.7, base - xh * 0.6, lx + lw * 0.7, base, stroke);
            } else if (kind === 3) {
              line(text, lx + lw * 0.1, base - xh, lx + lw * 0.1, base + xh * 0.6, stroke); // p
              arc(text, lx + lw * 0.4, base - xh / 2, lw * 0.3, xh / 2, -Math.PI / 2, Math.PI / 2, stroke);
            } else {
              line(text, lx + lw * 0.2, base - xh, lx + lw * 0.2, base, stroke); // i
              if (dots) arc(text, lx + lw * 0.2, base - xh * 1.45, 1.6, 1.6, 0, 2 * Math.PI, stroke);
            }
            x += lw;
          }
        }
        words.push({ x0, x1: x });
        x += xh * 1.4 + r() * xh * 0.4; // word gap
      }
      truth.lines.push({ baseline: base, top: base - xHeight, x0: words[0].x0, x1: words[words.length - 1].x1, words: words.length });
      // A full stop after the line.
      if (dots) arc(text, x - xHeight * 1.2, base - 2, 1.8, 1.8, 0, 2 * Math.PI, stroke);
    }
  }
  return { raster: compose({ width, height, text, ruled, seed, paper, ink, ruleInk, gradient, noise, blur }), truth };
}

/** Paper, rules and ink coverage → an 8-bit raster, with lighting, noise and blur. */
export function compose({ width, height, text, ruled, seed, paper, ink, ruleInk, gradient = 0, noise = 0, blur = 0, margin = null, marginInk = 110 }) {
  const data = new Uint8Array(width * height);
  const g = rng(seed * 31 + 1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const light = 1 - gradient * (x / width);
      let v = paper * light;
      v = v * (1 - ruled.cov[i]) + ruleInk * light * ruled.cov[i];
      if (margin) v = v * (1 - margin.cov[i]) + marginInk * light * margin.cov[i];
      v = v * (1 - text.cov[i]) + ink * text.cov[i];
      if (noise) {
        const u1 = Math.max(1e-9, g());
        const u2 = g();
        v += noise * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      }
      data[i] = Math.max(0, Math.min(255, Math.round(v)));
    }
  }
  let raster = makeRaster(width, height, data);
  if (blur) raster = boxBlur(raster, blur);
  return raster;
}

/** Base64 of a raster's bytes (as the native module would send them). */
export function toBase64(bytes) {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length).toString('base64');
}
