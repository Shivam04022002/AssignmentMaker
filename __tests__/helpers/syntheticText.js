/* eslint-env node */
/**
 * SYNTHETIC IMAGE FIXTURES WITH A KNOWN TRANSCRIPTION — not handwriting.
 *
 * Renders a known text as geometric pseudo-glyphs (stems, bowls, arches,
 * dots, headlines — no fonts, nobody's writing), so that the ink really
 * corresponds to the expected units and alignment can be measured against
 * ground truth. Each rendering unit (expectedText.js) gets a pseudo-glyph
 * of roughly its prior width (with jitter):
 *   Latin       x-height bowls / stems / arches; ascender and descender
 *               letters taller or deeper; i and j with dots; punctuation
 *               as small marks; capitals and digits at cap height
 *   Devanagari  one continuous headline per word; per cluster: base
 *               stems with a bowl, pre-base matra (stem + loop above the
 *               headline, at the cluster's left), post-base matra stem,
 *               marks above (matra arc, anusvara/chandrabindu dot) and
 *               below (u-matras, halant, nukta); conjuncts as touching
 *               consonant shapes with no gap
 * Options model real problems: touching letters, missing words (not drawn),
 * extra ink (an unexpected word), uneven spacing, plus every Phase 3
 * degradation (contrast, blur, noise, skew, lighting). Phase 8 adds what
 * real pages showed: `notebook` — pale rules with the writing standing on
 * them (rule at each baseline) and a darker margin line, as on a ruled
 * notebook page — and `clutter` — dark objects around the page (a desk
 * edge along the bottom, an object in a corner, the paper's own edge) that
 * touch the photo's border.
 *
 * Phase 9 adds `underline` (words underlined with a pen stroke); Phase 11
 * `letterforms: 'print'` — a with stem and tail, t with short crossbar arms,
 * e with its bar — the shapes whose small parts real pages lost; Phase 12
 * `marksApart` — anusvara / chandrabindu dots clear of a matra above, a
 * visarga as two dots after the cluster (no stem), as usually written.
 *
 * Returns { raster, truth: { units: [{ start, end, text, line, word, x0,
 * x1, centreLines }], words: [{ index, line, x0, x1, drawn, headline? }],
 * lines: [{ baseline }], extra: [{ line, x0, x1 }], underlines: [{ word,
 * x0, x1, y }] } } in image pixels
 * (before skew). centreLines / headline: the pen centre-line segments
 * [x0, y0, x1, y1] drawn for the unit / the word's headline, in image pixels
 * after skew (ground truth for glyph extraction); stroke width `stroke`.
 */
import { prepareExpectedText } from '../../src/handwriting/learn/expectedText';
import { canvas, compose, rng } from './syntheticRaster';

export function syntheticTextPage(text, o = {}) {
  const {
    width = 1400,
    height = 900,
    seed = 11,
    paper = 236,
    ink = 45,
    top = 120,
    lineGap = 120,
    marginX = 80,
    xHeight = 24,
    stroke = 3,
    letterGap = 0.16, // x-heights between Latin letters
    wordGap = 1.3, // x-heights between words
    jitter = 0.12,
    touching = false, // join Latin letters within a word at the baseline
    devaTight = false, // no gap between Devanagari clusters below the headline
    drop = [], // word indexes not drawn (missing words)
    extra = [], // [{ afterWord, letters }]: unexpected ink after a word
    spacing = null, // per-word gap multipliers (uneven spacing)
    rules = false,
    skew = 0,
    gradient = 0,
    noise = 0,
    blur = 0,
    ruleInk = 190,
    notebook = false, // pale rules on the baselines + a margin line
    notebookRuleInk = 158, // normalises to ≈ 170 — as the real notebook pages measured
    notebookRule = 2, // rule thickness (px)
    ruleWave = 2, // px: a printed rule is not perfectly straight in a photo
    clutter = false, // dark objects around the page touching the border
    underline = [], // word indexes underlined (a pen stroke below the word)
    letterforms = 'plain', // 'print': a, t, e drawn as printed by hand (Phase 11)
    marksApart = false, // Devanagari dot marks clear of other strokes, visarga without a stem (Phase 12)
  } = o;
  const r = rng(seed);
  const exp = prepareExpectedText(text);
  const ink0 = canvas(width, height);
  const ruled = canvas(width, height);
  const cx = width / 2;
  const cy = height / 2;
  const a = (-skew * Math.PI) / 180;
  const rot = (x, y) => [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)];
  let centreLines = null; // the current unit's ground-truth centre-lines
  const seg = (c, x0, y0, x1, y1, wd = stroke) => {
    const [p, q] = rot(x0, y0);
    const [s, t] = rot(x1, y1);
    c.seg(p, q, s, t, wd);
    if (c === ink0 && centreLines) centreLines.push([p, q, s, t]);
  };
  const arc = (c, ox, oy, rx, ry, a0, a1, wd = stroke) => {
    const steps = Math.max(8, Math.round((Math.abs(a1 - a0) * Math.max(rx, ry)) / 3));
    for (let i = 0; i < steps; i++) {
      const t0 = a0 + ((a1 - a0) * i) / steps;
      const t1 = a0 + ((a1 - a0) * (i + 1)) / steps;
      seg(c, ox + rx * Math.cos(t0), oy + ry * Math.sin(t0), ox + rx * Math.cos(t1), oy + ry * Math.sin(t1), wd);
    }
  };
  const dotAt = (x, y, rad = Math.max(1.6, stroke * 0.6)) => arc(ink0, x, y, rad, rad, 0, 2 * Math.PI);
  const xh = xHeight;
  const truth = { units: [], words: [], lines: [], extra: [], underlines: [] };
  if (rules) for (let y = top - lineGap + 10; y < height; y += lineGap / 2) seg(ruled, -50, y, width + 50, y, 2);
  const marginCanvas = notebook ? canvas(width, height) : null;
  if (notebook) {
    // A rule under every line of writing (the letters stand on it), more above and below.
    for (let y = top + stroke / 2 + 1 - lineGap; y < height; y += lineGap) {
      if (!ruleWave) seg(ruled, -50, y, width + 50, y, notebookRule);
      else for (let x = -50; x < width + 50; x += 20) seg(ruled, x, y + ruleWave * Math.sin(x / 97), x + 20, y + ruleWave * Math.sin((x + 20) / 97), notebookRule);
    }
    seg(marginCanvas, marginX - 18, -20, marginX - 18, height + 20, 2);
  }
  if (clutter) {
    // A desk edge along the bottom, an object in the top-right corner, the paper's right edge.
    for (let y = height - 28; y < height + 5; y += 3) seg(ink0, -10, y, width + 10, y, 4);
    for (let r0 = 4; r0 < 40; r0 += 3) arc(ink0, width - 5, 5, r0, r0, Math.PI / 2, Math.PI, 3);
    seg(ink0, width - 14, 30, width - 9, height - 40, 2);
  }

  /** Latin pseudo-glyph in [x, x + w] on baseline b. */
  const latin = (ch, x, w, b) => {
    const m = x + w / 2;
    if ('.'.includes(ch)) return dotAt(m, b - 2);
    if (','.includes(ch)) {
      dotAt(m, b - 2);
      return seg(ink0, m + 1, b, m - 1, b + 0.35 * xh);
    }
    if (':;'.includes(ch)) {
      dotAt(m, b - 0.7 * xh);
      dotAt(m, b - 2);
      if (ch === ';') seg(ink0, m + 1, b, m - 1, b + 0.35 * xh);
      return null;
    }
    if ('!?'.includes(ch)) {
      seg(ink0, m, b - 1.5 * xh, m, b - 0.45 * xh);
      return dotAt(m, b - 2);
    }
    if ('\'"'.includes(ch)) return seg(ink0, m, b - 1.6 * xh, m, b - 1.2 * xh);
    if ('-'.includes(ch)) return seg(ink0, x + 1, b - 0.5 * xh, x + w - 1, b - 0.5 * xh);
    if ('()/'.includes(ch)) return seg(ink0, ch === '(' ? x + w - 2 : x + 2, b - 1.6 * xh, ch === '(' ? x + 2 : x + w - 2, b + 0.4 * xh);
    if (letterforms === 'print' && 'ate'.includes(ch)) {
      // Hand-printed a / t / e (still geometry, nobody's writing): an a's
      // bowl with its stem and a short tail; a t's stem with short crossbar
      // arms either side; an e's bar and its bowl open at the lower right.
      if (ch === 'a') {
        const sx = x + w - 1 - 0.2 * xh; // the stem, leaving room for the tail inside the letter
        arc(ink0, x + 1 + (sx - x - 1) / 2, b - xh / 2, (sx - x - 1) / 2, xh / 2, 0, 2 * Math.PI);
        seg(ink0, sx, b - xh, sx, b);
        return seg(ink0, sx, b, x + w - 1, b - 0.12 * xh);
      }
      if (ch === 't') {
        const tm = x + w / 2;
        const arm = Math.min(0.26 * xh, w / 2 - 1);
        seg(ink0, tm, b - 1.35 * xh, tm, b);
        return seg(ink0, tm - arm, b - xh, tm + arm, b - xh);
      }
      const em = x + w / 2;
      seg(ink0, x + 1.5, b - xh / 2, x + w - 1.5, b - xh / 2);
      return arc(ink0, em, b - xh / 2, w / 2 - 1.5, xh / 2, 0.3 * Math.PI, 2 * Math.PI);
    }
    const cap = (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9');
    const top0 = cap ? b - 1.45 * xh : 'bdfhklt'.includes(ch) ? b - 1.65 * xh : b - xh;
    const bottom = 'gjpqy'.includes(ch) ? b + 0.6 * xh : b;
    const l = x + 1;
    const rr = x + w - 1;
    if ('ijlI1'.includes(ch)) {
      seg(ink0, m, ch === 'i' || ch === 'j' ? b - xh : top0, m, bottom);
      if (ch === 'i' || ch === 'j') dotAt(m, b - 1.45 * xh);
      return null;
    }
    if ('mw'.includes(ch.toLowerCase())) {
      seg(ink0, l, top0, l, b);
      arc(ink0, l + (m - l) / 2, b - (b - top0) * 0.6, (m - l) / 2, (b - top0) * 0.4, Math.PI, 2 * Math.PI);
      arc(ink0, m + (rr - m) / 2, b - (b - top0) * 0.6, (rr - m) / 2, (b - top0) * 0.4, Math.PI, 2 * Math.PI);
      seg(ink0, m, b - (b - top0) * 0.6, m, b);
      return seg(ink0, rr, b - (b - top0) * 0.6, rr, b);
    }
    if ('aceos'.includes(ch)) return arc(ink0, m, b - xh / 2, w / 2 - 1, xh / 2, 0, 2 * Math.PI);
    if (cap) {
      seg(ink0, l, top0, l, b);
      seg(ink0, rr, top0, rr, b);
      return seg(ink0, l, (top0 + b) / 2, rr, (top0 + b) / 2);
    }
    // Stem + bowl (b d g h k p q t …) or stem + arch (n r u v x z …).
    seg(ink0, l + 1, top0, l + 1, bottom);
    if ('bdgpq'.includes(ch)) return arc(ink0, m + 1, b - xh / 2, w / 2 - 2, xh / 2, -Math.PI / 2, Math.PI / 2);
    if ('ft'.includes(ch)) return seg(ink0, x, b - xh, rr, b - xh);
    return arc(ink0, m, b - xh * 0.6, w / 2 - 1, xh * 0.4, Math.PI, 2 * Math.PI);
  };

  /** Devanagari pseudo-glyph for one cluster unit in [x, x + w] (headline at h). */
  const deva = (u, x, w, b, h) => {
    const marks = (u.priors && u.priors.marks) || {};
    let l = x;
    let rr = x + w;
    if (marks.pre) {
      const s = x + 0.18 * xh;
      seg(ink0, s, h, s, b); // the pre-base stem, at the cluster's left
      arc(ink0, s + 0.35 * xh, h - 0.12 * xh, 0.35 * xh, 0.3 * xh, Math.PI, 2 * Math.PI); // its loop above the headline
      l = x + 0.42 * xh;
    }
    const visargaOnly = marksApart && marks.post && u.components.every(c => !(c.position === 'post' && c.role !== 'modifier'));
    if (marks.post) {
      if (!visargaOnly) seg(ink0, rr - 0.18 * xh, h, rr - 0.18 * xh, b); // ा ी ो ौ stem (a visarga has none)
      rr -= 0.42 * xh;
    }
    const n = Math.max(1, u.consonants || 1);
    const cw = (rr - l) / n;
    for (let k = 0; k < n; k++) {
      const s0 = l + k * cw;
      const half = k < n - 1; // half forms touch the next consonant
      seg(ink0, s0 + cw * 0.72, h, s0 + cw * 0.72, half ? b - 0.3 * xh : b);
      arc(ink0, s0 + cw * 0.36, b - xh * 0.42, cw * 0.32, xh * 0.3, Math.PI * 0.5, Math.PI * 1.9);
      if (half) seg(ink0, s0 + cw * 0.72, b - 0.35 * xh, s0 + cw * 1.05, b - 0.35 * xh); // joins the next part
    }
    const mid = (l + rr) / 2;
    for (const c of u.components) {
      if (c.role === 'base') continue;
      if (c.position === 'above' && c.role === 'matra') arc(ink0, mid, h - 0.25 * xh, 0.28 * xh, 0.2 * xh, Math.PI * 1.1, Math.PI * 1.9);
      else if (c.position === 'above') {
        // With marksApart the dot sits clear of a matra arc or an i-loop above the headline.
        const busy = u.components.some(o2 => o2.position === 'pre' || (o2.position === 'above' && o2.role === 'matra'));
        // (above the arc or loop, inside the cluster's own columns)
        dotAt(mid, marksApart && busy ? h - 0.8 * xh : h - 0.35 * xh);
      }
      else if (c.role === 'nukta') dotAt(mid - 0.1 * xh, b + 0.25 * xh);
      else if (c.role === 'virama') seg(ink0, mid, b + 0.08 * xh, mid - 0.25 * xh, b + 0.4 * xh);
      else if (c.position === 'below') arc(ink0, mid, b + 0.28 * xh, 0.2 * xh, 0.18 * xh, 0, Math.PI);
      else if (c.role === 'modifier' && c.position === 'post') {
        const vx = marksApart ? rr + 0.22 * xh : rr + 0.05 * xh; // in the space kept after the cluster
        dotAt(vx, b - 0.65 * xh);
        dotAt(vx, b - 0.25 * xh);
      }
    }
  };

  exp.lines.forEach((line, li) => {
    const b = top + li * lineGap;
    truth.lines.push({ baseline: b, top: b - xh });
    let x = marginX;
    line.words.forEach(wi => {
      const word = exp.words[wi];
      const drawn = !drop.includes(wi);
      const x0 = x;
      const isDeva = word.script === 'Deva';
      const widths = word.units.map(u => u.priors.width * xh * (1 + (r() * 2 - 1) * jitter));
      let headline = null;
      if (drawn && isDeva) {
        const total = widths.reduce((s, v) => s + v, 0);
        centreLines = [];
        seg(ink0, x0 - 0.05 * xh, b - xh, x0 + total, b - xh); // one headline across the word
        headline = centreLines[0];
        centreLines = null;
      }
      word.units.forEach((u, k) => {
        const w = widths[k];
        const gap = isDeva ? (devaTight ? 0 : 0.12 * xh) : letterGap * xh;
        const lines = [];
        if (drawn) {
          centreLines = lines;
          if (u.script === 'Deva' && u.kind === 'cluster') deva(u, x + gap / 2, w - gap, b, b - xh);
          else if (u.script === 'Deva') seg(ink0, x + w / 2, b - xh, x + w / 2, b); // danda / sign
          else latin(u.text[0], x + gap / 2, w - gap, b);
          if (touching && !isDeva && k < word.units.length - 1 && u.kind === 'letter' && word.units[k + 1].kind === 'letter') {
            seg(ink0, x + w - gap / 2 - 1, b - 1, x + w + gap / 2 + 1, b - 1); // a joining stroke
          }
          centreLines = null;
        }
        truth.units.push({ start: u.start, end: u.end, text: u.text, line: li, word: wi, x0: x, x1: x + w, drawn, centreLines: lines });
        x += w;
      });
      truth.words.push({ index: wi, line: li, x0, x1: x, drawn, ...(headline ? { headline } : null) });
      if (drawn && underline.includes(wi)) {
        const y = b + 0.45 * xh;
        seg(ink0, x0, y, x, y);
        truth.underlines.push({ word: wi, x0, x1: x, y });
      }
      const extraHere = extra.find(e => e.afterWord === wi);
      const gapMul = spacing && spacing[wi] !== undefined ? spacing[wi] : 1;
      x += wordGap * xh * gapMul;
      if (extraHere) {
        const ex0 = x;
        for (let k = 0; k < extraHere.letters; k++) {
          latin('n', x + 1, 0.7 * xh, b);
          x += 0.72 * xh;
        }
        truth.extra.push({ line: li, x0: ex0, x1: x });
        x += wordGap * xh;
      }
    });
  });
  return {
    raster: compose({ width, height, text: ink0, ruled, seed, paper, ink, ruleInk: notebook ? notebookRuleInk : ruleInk, gradient, noise, blur, ...(notebook ? { margin: marginCanvas } : null) }),
    truth,
    expected: exp,
  };
}
