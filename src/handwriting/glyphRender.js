/**
 * Turns laid-out lines (textLayout.js) into ballpoint ink.
 *
 *   letter occurrence (strokeModel.js: contextual variant, reshaped
 *     centre-lines, exit tail / lead-in from the neighbours)
 *     → letter frame: correlated width, height, lean, rise, shift
 *     → word frame: tilt, lean, stretch, size, rise + the line's drift
 *     → page coordinates
 *     → pressure along each stroke → a filled ribbon whose width follows
 *       the pressure (light landing, firmer middle, release), plus a
 *       slightly denser core where the pen pressed hardest
 *
 * Output is grouped into a few ink buckets (ink strength levels), so a page
 * is a handful of SVG paths — never a component per letter or stroke.
 * Everything is deterministic: seeds come from the document, page, word,
 * letter position and its neighbours — never Math.random().
 */
import { createRandom, hashString, mixSeed } from '../utils/variation';
import { GLYPH_FORMS, glyphAdvance, glyphFor, glyphForms } from './glyphs';
import { XH_EM } from './handwritingProfiles';
import {
  ATTEMPT_SALT,
  chooseForm,
  dist,
  letterStrokes,
  pressureCurve,
  wordForms,
} from './strokeModel';

export { glyphVariant } from './strokeModel';

const DEG = Math.PI / 180;

// --- 2D affine matrices [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f
function mul(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}
const translate = (x, y) => [1, 0, 0, 1, x, y];
const scale = (sx, sy) => [sx, 0, 0, sy, 0, 0];
const rotate = deg => {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return [c, s, -s, c, 0, 0];
};
/** Lean like RN's skewX (y grows downwards): x' = x + tan(θ)·y. */
const skew = deg => [1, 0, Math.tan(deg * DEG), 1, 0, 0];
/** Applies `m` around the point (x, y). */
const around = (m, x, y) => mul(translate(x, y), mul(m, translate(-x, -y)));

const f1 = v => String(Math.round(v * 10) / 10);

/**
 * Ink colour for a tone: 'dark' is the pen colour a little deeper, as where
 * ballpoint ink has gone over the same place twice (no blur, no blobs).
 */
export function inkTone(color, tone, darkness = 0.22) {
  if (tone !== 'dark') {
    return color;
  }
  const m = /^#?([0-9a-f]{6})$/i.exec(String(color));
  if (!m) {
    return color;
  }
  const v = parseInt(m[1], 16);
  const keep = 1 - Math.min(0.6, Math.max(0, darkness));
  const ch = shift => Math.round(((v >> shift) & 255) * keep); // eslint-disable-line no-bitwise
  return `#${[16, 8, 0].map(k => ch(k).toString(16).padStart(2, '0')).join('')}`;
}

// --- Compact path data -----------------------------------------------------------
//
// A page has thousands of ribbon outlines, so their path data is written
// compactly: relative quadratic segments in tenths of a pixel ("q1.2-.3 .5.6"),
// leading zeros dropped, no separator before a minus sign. Rounding is done
// on absolute positions, so relative steps never accumulate drift.

/** A tenth-of-a-pixel integer as the shortest SVG number ("-.3", "12.5"). */
function tenths(t) {
  if (!t) return '0';
  const a = t < 0 ? -t : t;
  const i = (a - (a % 10)) / 10;
  const f = a % 10;
  return (t < 0 ? '-' : '') + (i ? String(i) : '') + (f ? `.${f}` : '');
}

/** Appends numbers, separated only where a separator is needed. */
function pushNums(state, values) {
  for (const v of values) {
    const s = tenths(v);
    if (state.needSep && s[0] !== '-' && !(s[0] === '.' && state.lastHasDot)) {
      state.d += ' ';
    }
    state.d += s;
    state.needSep = true;
    state.lastHasDot = s.includes('.');
  }
}

/**
 * A closed curve through `pts` ([x0, y0, x1, y1, …], absolute px), smoothed
 * as a quadratic B-spline: the points are control points, the curve runs
 * through the mid-points between them.
 */
function closedSpline(pts) {
  const m = pts.length / 2;
  const T = new Array(pts.length);
  for (let i = 0; i < pts.length; i++) T[i] = Math.round(pts[i] * 10);
  const midT = i => {
    const a = (i % m) * 2;
    const b = ((i + 1) % m) * 2;
    return [Math.round((T[a] + T[b]) / 2), Math.round((T[a + 1] + T[b + 1]) / 2)];
  };
  let [cx, cy] = midT(m - 1);
  const state = { d: 'M', needSep: false, lastHasDot: false };
  pushNums(state, [cx, cy]);
  state.d += 'q';
  state.needSep = false;
  for (let i = 0; i < m; i++) {
    const [qx, qy] = midT(i);
    pushNums(state, [T[i * 2] - cx, T[i * 2 + 1] - cy, qx - cx, qy - cy]);
    cx = qx;
    cy = qy;
  }
  return `${state.d}z`;
}

/**
 * Absolute points of compact handwriting path data (M, q/Q, L, z): every
 * anchor and control point, per subpath. For tests and tools.
 */
export function pathPoints(d) {
  const subpaths = [];
  const re = /[MmQqLlZz]|-?(?:\d+\.?\d*|\.\d+)/g;
  let cmd = 'M';
  let cur = null;
  let x = 0;
  let y = 0;
  let nums = [];
  const flush = () => {
    const need = cmd === 'q' || cmd === 'Q' ? 4 : 2;
    while (nums.length >= need) {
      const v = nums.splice(0, need);
      if (cmd === 'M' || cmd === 'm') {
        x = cmd === 'm' ? x + v[0] : v[0];
        y = cmd === 'm' ? y + v[1] : v[1];
        cur = [[x, y]];
        subpaths.push(cur);
        cmd = cmd === 'm' ? 'l' : 'L';
      } else if (cmd === 'q') {
        cur.push([x + v[0], y + v[1]], [x + v[2], y + v[3]]);
        x += v[2];
        y += v[3];
      } else if (cmd === 'Q') {
        cur.push([v[0], v[1]], [v[2], v[3]]);
        x = v[2];
        y = v[3];
      } else if (cmd === 'l') {
        x += v[0];
        y += v[1];
        cur.push([x, y]);
      } else {
        x = v[0];
        y = v[1];
        cur.push([x, y]);
      }
    }
  };
  for (const token of d.match(re) || []) {
    if (/[A-Za-z]/.test(token)) {
      flush();
      if (token === 'z' || token === 'Z') {
        if (cur) [x, y] = cur[0];
      } else {
        cmd = token;
      }
    } else {
      nums.push(Number(token));
      flush();
    }
  }
  return subpaths;
}

// --- Ribbons -------------------------------------------------------------------

/** True where the path reverses sharply (turn of more than ~100°). */
function reversesAt(xs, ys, i) {
  const ax = xs[i] - xs[i - 1];
  const ay = ys[i] - ys[i - 1];
  const bx = xs[i + 1] - xs[i];
  const by = ys[i + 1] - ys[i];
  const la = dist(ax, ay);
  const lb = dist(bx, by);
  return la > 0 && lb > 0 && (ax * bx + ay * by) / (la * lb) < -0.18;
}

/**
 * Closed, smoothed outline of a stroke of half-widths `hw` (a ribbon with
 * rounded ends), appended to `out` as an SVG subpath. The outline uses every
 * other centre-line sample (the spline keeps it smooth).
 */
function ribbon(xs, ys, hw, from, to, out) {
  const idx = [];
  for (let i = from; i < to; i += 2) idx.push(i);
  idx.push(to);
  const n = idx.length;
  const left = [];
  const right = [];
  let tx0 = 0;
  let ty0 = 0;
  let tx1 = 0;
  let ty1 = 0;
  for (let k = 0; k < n; k++) {
    const i = idx[k];
    const j0 = Math.max(from, i - 1);
    const j1 = Math.min(to, i + 1);
    let tx = xs[j1] - xs[j0];
    let ty = ys[j1] - ys[j0];
    const len = dist(tx, ty) || 1;
    tx /= len;
    ty /= len;
    if (k === 0) {
      tx0 = tx;
      ty0 = ty;
    }
    tx1 = tx;
    ty1 = ty;
    const h = hw[i];
    left.push(xs[i] - ty * h, ys[i] + tx * h);
    right.push(xs[i] + ty * h, ys[i] - tx * h);
  }
  const pts = left;
  // End cap (round after smoothing).
  const he = hw[to];
  pts.push(xs[to] + tx1 * he * 0.95, ys[to] + ty1 * he * 0.95);
  for (let k = n - 1; k >= 0; k--) {
    pts.push(right[k * 2], right[k * 2 + 1]);
  }
  const hs = hw[from];
  pts.push(xs[from] - tx0 * hs * 0.95, ys[from] - ty0 * hs * 0.95);
  out.push(closedSpline(pts));
}

/** Centre-line of a stroke (every other sample) as compact path data. */
function centreLine(xs, ys) {
  const state = { d: 'M', needSep: false, lastHasDot: false };
  let cx = Math.round(xs[0] * 10);
  let cy = Math.round(ys[0] * 10);
  pushNums(state, [cx, cy]);
  state.d += 'l';
  state.needSep = false;
  const n = xs.length;
  for (let i = 2; i < n + 1; i += 2) {
    const j = Math.min(i, n - 1);
    const x = Math.round(xs[j] * 10);
    const y = Math.round(ys[j] * 10);
    pushNums(state, [x - cx, y - cy]);
    cx = x;
    cy = y;
    if (j === n - 1) break;
  }
  return state.d;
}

/** A dot (i, j, full stop…): a small, slightly irregular blob. */
function blob(x, y, radius, r, out) {
  const k = 6;
  const pts = [];
  const squash = 0.85 + r() * 0.25;
  const turn = r() * Math.PI;
  for (let i = 0; i < k; i++) {
    const a = turn + (i / k) * Math.PI * 2;
    const rr = radius * (1.05 + r() * 0.16);
    pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr * squash);
  }
  out.push(closedSpline(pts));
}

/**
 * Text written in marker mode (selected-text formatting): the same letter
 * strokes drawn as a marker tip lays them — several times wider than the
 * ballpoint, nearly even, translucent like the freehand marker — so the
 * handwriting stays the same, only the pen changes.
 */
export const MARKER_TEXT = { width: 2.0, alpha: 0.58 };

/** Ink strength levels between the pen's floor and full ink. */
function alphaLevels(floor) {
  const f = Math.min(1, Math.max(0, floor || 0));
  return [f, f + (1 - f) / 3, f + ((1 - f) * 2) / 3, 1].map(
    v => Math.round(v * 1000) / 1000,
  );
}
const nearest = (levels, v) =>
  levels.reduce((best, l) => (Math.abs(l - v) < Math.abs(best - v) ? l : best), levels[0]);

/**
 * A pen stroke across part of a word, in word-frame px (y down, baseline 0):
 * from (x0, y0) to (x1, y1) with a slight bow and the hand's tremor — the
 * same kind of centre-line the letters are made of.
 */
function quickStroke(x0, y0, x1, y1, U, r) {
  const n = Math.max(8, Math.ceil(dist(x1 - x0, y1 - y0) / (U * 0.14)));
  const bow = (r() * 2 - 1) * 0.07 * U;
  const ph = r() * Math.PI * 2;
  const len = dist(x1 - x0, y1 - y0) || 1;
  const nx = -(y1 - y0) / len;
  const ny = (x1 - x0) / len;
  const xs = [];
  const ys = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const off = bow * 4 * t * (1 - t) + 0.012 * U * Math.sin(ph + t * 9);
    xs.push(x0 + (x1 - x0) * t + nx * off);
    ys.push(y0 + (y1 - y0) * t + ny * off);
  }
  return { xs, ys };
}

/**
 * Strike strokes over [x0, x1] (word-frame px). Patterns follow the
 * reference: a short heavy horizontal strike (letters), one quick diagonal,
 * or two crossing strokes (a crossed-out attempt).
 */
function strikeStrokes(x0, x1, pattern, U, r) {
  const over = () => (0.06 + r() * 0.08) * U;
  if (pattern === 'letters') {
    // As in ref 3 "including": there and back, heavy, through the middle.
    const y = -(0.42 + r() * 0.14) * U;
    const tilt = (r() * 2 - 1) * 0.05 * U;
    const first = quickStroke(x0 - over(), y + tilt, x1 + over(), y - tilt, U, r);
    const back = quickStroke(
      x1 + over() * 0.5,
      y - tilt + 0.05 * U,
      x0 - over() * 0.3,
      y + tilt + 0.06 * U,
      U,
      r,
    );
    return r() < 0.7 ? [first, back] : [first];
  }
  if (pattern === 0) {
    return [quickStroke(x0 - over(), -0.18 * U, x1 + over(), -(0.78 + r() * 0.1) * U, U, r)];
  }
  if (pattern === 1) {
    return [
      quickStroke(x0 - over(), -0.28 * U, x1 + over(), -0.74 * U, U, r),
      quickStroke(x0 - over() * 0.6, -0.8 * U, x1 + over() * 0.8, -0.24 * U, U, r),
    ];
  }
  const y = -(0.45 + r() * 0.12) * U;
  const strokes = [quickStroke(x0 - over(), y + 0.03 * U, x1 + over(), y - 0.04 * U, U, r)];
  if (r() < 0.5) {
    strokes.push(quickStroke(x1 + over() * 0.4, y - 0.1 * U, x0 - over() * 0.2, y - 0.02 * U, U, r));
  }
  return strokes;
}

/**
 * Ink of one placed word: [{ level, d, tone?, line? }] (level = ink
 * strength, or 'core'). Natural corrections (shape.correction) are drawn
 * here with the same pen: a wrong letter under the right one, a second pass
 * over the word, short strikes, a crossed-out attempt before the word.
 */
function wordInk(item, ctx, baseY, lineX) {
  const { shape } = item;
  const { profile, inkFloor, inkStrength, emphasis, levels, thumbnail, debug } = ctx;
  const pcfg = profile.pressure;
  const size = ctx.size(item);
  const U = size * XH_EM; // x-height in px
  const strokeBase = profile.strokeWidth * U * emphasis(item);
  const minHalf = thumbnail ? 0.45 : 0.18;
  const fix = shape.correction || null;

  // Word frame: origin at the word's left end on the baseline.
  const wordW = shape.width;
  const sx = shape.scaleX || 1;
  let W = translate(lineX + item.x, baseY + shape.translateY + item.drift);
  W = mul(W, around(scale(shape.scale, shape.scale), wordW / 2, -U / 2));
  W = mul(W, around(rotate(shape.rotate), wordW / 2, -U / 2));
  W = mul(W, skew(shape.slant));
  W = mul(W, scale(sx, 1));

  const chars =
    shape.chars || Array.from(shape.text).map((char, i) => ({ key: String(i), char }));
  const wordSeed = shape.seed ?? hashString(`render|${shape.key}`);
  // How firmly this word is written (a word is one gesture).
  const wordPressure =
    1 + (createRandom(mixSeed(wordSeed, 0x9e55))() * 2 - 1) * pcfg.word;
  const alphaWord = shape.opacity ?? 1;
  // Pressure across the word: each word its own arc (light → firm → light,
  // or firm early, or firm late), not one profile stamped on every word.
  const arc = pcfg.wordArc || 0;
  const arcR = arc ? createRandom(mixSeed(wordSeed, 0xa2c)) : null;
  const arcPhase = arcR ? arcR() * Math.PI : 0;
  const arcAt = (i, n) =>
    arc ? 1 + arc * Math.sin(arcPhase + (n > 1 ? i / (n - 1) : 0.5) * Math.PI) - arc * 0.5 : 1;
  const out = [];
  const gx = profile.glyphWidth || 1;

  /** Pressure, width and ink for one placed centre-line (page px). */
  const inkStroke = (xs, ys, r, o) => {
    const n = xs.length;
    let length = 0;
    for (let i = 1; i < n; i++) {
      length += dist(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
    }
    const strokeLevel = o.level * (1 + (r() * 2 - 1) * pcfg.stroke);
    const baseAlpha = 1 - (2 - alphaWord - (o.alphaChar ?? 1)) * inkStrength;
    const marker = o.mode === 'marker';
    // Handwriting size scales the line with the letters; a marker is wider.
    const base = strokeBase * (o.size || 1) * (marker ? MARKER_TEXT.width : 1);
    const mark = { tone: o.tone, color: o.color, mode: marker ? 'marker' : undefined };
    const lineWidth = (o.size || 1) * (marker ? MARKER_TEXT.width : 1);
    // Dots: a small round blob, a touch wider than the line.
    if (length < U * 0.09) {
      const firm = o.firmDot ? 0.9 : 0.68;
      const radius = Math.max(minHalf, base * (marker ? 0.55 : firm) * strokeLevel);
      const level = nearest(levels, Math.max(inkFloor, baseAlpha));
      if (thumbnail) {
        // A tiny round-capped stroke reads as a dot at thumbnail size.
        out.push({
          ...mark,
          level,
          wf: lineWidth,
          d: centreLine([xs[0], xs[0] + 0.2], [ys[0], ys[0]]),
          line: true,
        });
        return;
      }
      const parts = [];
      blob(xs[0], ys[0], radius, r, parts);
      out.push({ ...mark, level, d: parts[0] });
      if (debug) {
        debug.push({
          ...o.info,
          dot: true,
          xs,
          ys,
          radius,
          tone: o.tone,
          color: o.color,
          mode: marker ? 'marker' : 'pen',
          size: o.size || 1,
        });
      }
      return;
    }
    // Thumbnails: the centre-line only, drawn as a plain stroke (pressure
    // is invisible at that size; the data is several times smaller).
    if (thumbnail) {
      const level = nearest(levels, Math.max(inkFloor, baseAlpha));
      out.push({ ...mark, level, wf: lineWidth, d: centreLine(xs, ys), line: true });
      return;
    }
    const p = pressureCurve(xs, ys, U, r, pcfg, strokeLevel);
    // Joining hairlines and lead-ins are written lightly.
    for (let k = 0; k < (o.tail || 0); k++) {
      p[n - 1 - k] *= o.joined ? 0.55 : 0.72;
    }
    for (let k = 0; k < (o.lead || 0); k++) {
      p[k] *= 0.6;
    }
    const edgePhase = r() * Math.PI * 2;
    const hw = p.map((v, i) => {
      const edge =
        1 +
        pcfg.edge *
          Math.sin(edgePhase + i * 1.7) *
          Math.sin(edgePhase * 0.5 + i * 0.6);
      // A marker tip barely responds to pressure.
      const w = marker
        ? base * (0.86 + 0.14 * Math.min(1.1, v)) * edge
        : base * (pcfg.width[0] + pcfg.width[1] * v) * edge;
      return Math.max(minHalf, w / 2);
    });
    const mean = p.reduce((s, v) => s + v, 0) / n;
    const alpha = baseAlpha - Math.max(0, 0.95 - mean) * pcfg.inkFromPressure;
    const level = nearest(levels, Math.max(inkFloor, Math.min(1, alpha)));
    // Split at sharp reversals (the stem retrace of a, d, n …) so each
    // piece is a clean ribbon.
    const parts = [];
    let start = 0;
    for (let i = 1; i < n - 1; i++) {
      if (reversesAt(xs, ys, i)) {
        ribbon(xs, ys, hw, start, i, parts);
        start = i;
      }
    }
    ribbon(xs, ys, hw, start, n - 1, parts);
    parts.forEach(d => out.push({ ...mark, level, d }));
    // Where the pen pressed hardest the ballpoint lays denser ink.
    let run = -1;
    for (let i = 0; i <= (marker ? -1 : n); i++) {
      const pressed = i < n && p[i] > pcfg.core.threshold;
      if (pressed && run < 0) run = i;
      if (!pressed && run >= 0) {
        if (i - run >= 3) {
          const core = [];
          const chw = hw.map(h => h * pcfg.core.width);
          ribbon(xs, ys, chw, run, i - 1, core);
          core.forEach(d => out.push({ level: 'core', color: o.color, d }));
        }
        run = -1;
      }
    }
    if (debug) {
      debug.push({
        ...o.info,
        base,
        unit: U,
        color: o.color,
        mode: marker ? 'marker' : 'pen',
        size: o.size || 1,
        xs,
        ys,
        pressure: p,
        halfWidth: hw,
        alpha: level,
        tone: o.tone,
        lead: o.lead || 0,
        tail: o.tail || 0,
        joined: !!o.joined,
      });
    }
  };

  // Letterforms (sets whose reference shows several forms of a letter):
  // the word's own, as measured by the layout.
  const set = profile.glyphSet;
  const formed = !!(set && GLYPH_FORMS[set]);
  const mainForms = formed
    ? shape.forms || wordForms(chars.map(c => c.char), wordSeed, set)
    : null;

  /** Places word-frame px points on the page. */
  const toPage = (st, M = W) => {
    const n = st.xs.length;
    const xs = new Array(n);
    const ys = new Array(n);
    for (let i = 0; i < n; i++) {
      xs[i] = M[0] * st.xs[i] + M[2] * st.ys[i] + M[4];
      ys[i] = M[1] * st.xs[i] + M[3] * st.ys[i] + M[5];
    }
    return [xs, ys];
  };

  /**
   * Writes a run of letters starting at word-frame x0. Options: salt (a
   * second pass gets new variation), tone, offset {dx, dy} (px), only (the
   * letter indexes to write), substitute {index, char} (a slip of the pen),
   * level (pressure), pass (debug label). Returns each letter's [x0, x1].
   */
  const writeLetters = (list, x0, opts = {}) => {
    const spans = [];
    let x = x0;
    const seedBase = opts.salt ? mixSeed(wordSeed, opts.salt) : wordSeed;
    const seedAt = i => mixSeed(seedBase, i);
    // Letterforms: the ones the layout measured the word with (a traced-over
    // letter keeps its form; only its variation is new).
    const forms = formed
      ? opts.forms || wordForms(list.map(c => c.char), seedBase, set)
      : null;
    const bodyOf = (char, form) => {
      const f = form ? glyphForms(char, set) : null;
      return (f && f[form] ? f[form] : glyphFor(char, set)).w;
    };
    list.forEach((c, index) => {
      const form = forms ? forms[index] : undefined;
      const gap = c.gap ?? shape.letterSpacing ?? 0;
      // Handwriting size of this letter (selected-text formatting).
      const sz = c.size || 1;
      const advance = glyphAdvance(c.char, profile, form) * U * sz + gap;
      spans.push([x, x + bodyOf(c.char, form) * gx * U * sz]);
      if (opts.only && !opts.only.includes(index)) {
        x += advance;
        return;
      }
      const slip = opts.substitute && opts.substitute.index === index;
      const char = slip ? opts.substitute.char : c.char;
      const prev = index > 0 ? list[index - 1].char : null;
      const next = index < list.length - 1 ? list[index + 1].char : null;
      const seed = seedAt(index);
      const drawnForm = formed
        ? slip
          ? chooseForm(char, prev, next, seed, set)
          : form
        : undefined;
      const strokes = letterStrokes(char, {
        profile,
        prev,
        next,
        seed,
        nextAdvance: advance / U / sz,
        form: drawnForm,
        nextForm: forms && next ? forms[index + 1] : undefined,
      });
      const cw = bodyOf(char, drawnForm) * gx * U * sz;
      const cs = (c.scale || 1) * sz;
      const off = opts.offset || { dx: 0, dy: 0 };
      // Letter frame: glyph units → px (y up → y down), then its own
      // (correlated) width, height, lean, rise and shift.
      let L = translate(x + (c.shift || 0) + off.dx, (c.translateY || 0) + off.dy);
      L = mul(L, around(rotate(c.rotate || 0), cw / 2, -U / 2));
      L = mul(L, skew(c.slant || 0));
      L = mul(L, scale((c.scaleX || 1) * cs * gx, (c.scaleY || 1) * cs));
      L = mul(L, scale(U, -U));
      const M = mul(W, L);
      const r = createRandom(mixSeed(seed, 0x1a7));
      strokes.forEach((st, si) => {
        const [xs, ys] = toPage(st, M);
        inkStroke(xs, ys, r, {
          // A slip is written lightly; the fix over it presses harder.
          level:
            wordPressure *
            arcAt(index, list.length) *
            (opts.level || 1) *
            (slip ? 0.85 : 1),
          alphaChar: c.opacity ?? 1,
          tone: opts.tone,
          color: c.color,
          mode: c.mode,
          size: sz,
          firmDot: '.,:;!?'.includes(char),
          lead: st.lead,
          tail: st.tail,
          joined: st.joined,
          info: {
            char,
            word: shape.text,
            at: item.start,
            stroke: si,
            pass: opts.pass || 'main',
            ...(formed ? { form: strokes.form } : null),
          },
        });
      });
      x += advance;
    });
    return spans;
  };

  /** Strike strokes (word-frame px), heavier and darker than the writing. */
  const strike = (x0, x1, pattern, seed, crossed = chars[0]) => {
    const r = createRandom(mixSeed(seed, 0x57));
    const sz = (crossed && crossed.size) || 1;
    strikeStrokes(x0, x1, pattern, U * sz, r).forEach((st, si) => {
      const [xs, ys] = toPage(st);
      inkStroke(xs, ys, r, {
        level:
          pattern === 'letters'
            ? (profile.corrections && profile.corrections.strike) || 1.2
            : 1.08,
        tone: 'dark',
        // The same pen as the letters it crosses.
        color: crossed && crossed.color,
        mode: crossed && crossed.mode,
        size: sz,
        info: { char: '', word: shape.text, at: item.start, stroke: si, pass: 'strike' },
      });
    });
  };

  // A crossed-out attempt comes first; the word follows it.
  let start = 0;
  if (fix && fix.kind === 'crossed') {
    const attempt = Array.from(fix.attempt).map((char, i) => ({
      key: `x${i}`,
      char,
      // The attempt was written with the same hand (and pen) moments earlier.
      ...(chars[i] ? { translateY: chars[i].translateY, scaleY: chars[i].scaleY } : null),
      ...(chars[0] ? { color: chars[0].color, mode: chars[0].mode, size: chars[0].size } : null),
    }));
    const spans = writeLetters(attempt, 0, { salt: ATTEMPT_SALT, pass: 'attempt' });
    strike(spans[0][0], spans[spans.length - 1][1], fix.pattern, fix.seed);
    start = (shape.prefix || 0) / sx;
  }
  const substitute =
    fix && fix.kind === 'letter-fix' ? { index: fix.index, char: fix.wrong } : null;
  const spans = writeLetters(chars, start, { substitute, forms: mainForms });
  if (fix) {
    const r = createRandom(mixSeed(fix.seed, 0x0f));
    const nudge = k => ({
      dx: (r() * 2 - 1) * k * U,
      dy: (r() * 2 - 1) * k * 0.7 * U,
    });
    if (fix.kind === 'letter-fix') {
      // The right letter written over the slip, pressed a little harder.
      writeLetters(chars, start, {
        only: [fix.index],
        forms: mainForms,
        salt: 0x1e77,
        tone: 'dark',
        offset: nudge(0.05),
        level: 1.1,
        pass: 'fix',
      });
    } else if (fix.kind === 'overwrite') {
      // Part of the word traced again: new variation, visibly a little off
      // (a double line shows in places), with a lighter, quicker hand.
      const off = nudge(0.09);
      if (Math.abs(off.dx) < 0.04 * U) off.dx = (off.dx < 0 ? -0.05 : 0.05) * U;
      const from = fix.from ?? 0;
      const count = fix.count ?? chars.length;
      writeLetters(chars, start, {
        only: chars.map((_, i) => i).filter(i => i >= from && i < from + count),
        forms: mainForms,
        salt: 0x0ae2,
        tone: 'dark',
        offset: off,
        level: 0.8,
        pass: 'fix',
      });
    } else if (fix.kind === 'strike') {
      const from = Math.min(fix.from, spans.length - 1);
      const to = Math.min(spans.length - 1, from + fix.count - 1);
      strike(spans[from][0], spans[to][1], 'letters', fix.seed, chars[from]);
    } else if (fix.kind === 'dot') {
      // A stray dot near the word, just under the line or between letters.
      const x = start + r() * Math.max(U, wordW / sx - start);
      const y = r() < 0.6 ? (0.18 + r() * 0.18) * U : -(0.05 + r() * 0.3) * U;
      const [xs, ys] = toPage({ xs: [x, x + 0.01], ys: [y, y] });
      inkStroke(xs, ys, r, {
        level: 1.1,
        tone: 'dark',
        color: chars[0] && chars[0].color,
        firmDot: true,
        info: { char: '', word: shape.text, at: item.start, stroke: 0, pass: 'dot' },
      });
    }
  }
  return out;
}

/** profile → word shape → placed ink (a tuned profile redraws). */
const wordCache = new WeakMap();

/**
 * Renders laid-out lines.
 *
 * @param lines   layout lines (from layoutHandwriting or a paginated page)
 * @param options { profile, layout: {fontSize, headingFontSize, unit},
 *                  rowHeight, baselineInRow, ink: {floor, strength},
 *                  quality ('full' | 'preview'), debug (an array that
 *                  receives every placed stroke with its pressure) }
 * @returns { buckets: [{ key, alpha, d, width? }], underlines: [{ key, d, alpha }] }
 *          Buckets are filled paths (ink ribbons), one per ink level, plus
 *          the denser 'core' ink drawn over them. In 'preview' quality they
 *          are centre-lines instead, to be stroked at `width`. Buckets
 *          with tone 'dark' hold corrected ink (written twice over), drawn
 *          in a slightly darker shade of the pen (see inkTone).
 */
export function renderLines(
  lines,
  { profile, layout, rowHeight, baselineInRow, ink, quality = 'full', debug },
) {
  const levels = alphaLevels(ink.floor);
  const buckets = new Map();
  const underlines = [];
  const thumbnail = quality === 'preview';
  const ctx = {
    profile,
    levels,
    thumbnail,
    debug,
    inkFloor: ink.floor,
    inkStrength: ink.strength * (profile.inkStrength ?? 1),
    size: item => (item.heading ? layout.headingFontSize : layout.fontSize),
    emphasis: item =>
      item.heading
        ? profile.heading.strokeWeight
        : item.label
        ? profile.label.strokeWeight
        : 1,
  };
  const U = layout.fontSize * XH_EM;
  let shapes = wordCache.get(profile);
  if (!shapes) {
    shapes = new WeakMap();
    wordCache.set(profile, shapes);
  }
  lines.forEach((line, row) => {
    const baseY = row * rowHeight + baselineInRow;
    for (const item of line.words) {
      const placed = { ...item, heading: line.heading };
      const key = `${row}|${line.offsetX}|${item.x}|${item.drift}|${
        line.heading ? 1 : 0
      }|${item.label || ''}|${baseY}|${layout.fontSize}|${quality}|${
        ink.floor
      }|${ink.strength}`;
      let cache = shapes.get(item.shape);
      if (!cache) {
        cache = new Map();
        shapes.set(item.shape, cache);
      }
      let marks = debug ? null : cache.get(key);
      if (!marks) {
        marks = wordInk(placed, ctx, baseY, line.offsetX);
        if (cache.size > 8) {
          cache.clear();
        }
        cache.set(key, marks);
      }
      for (const mark of marks) {
        const core = mark.level === 'core';
        // Default ink keeps its plain keys; formatted ink is keyed by colour
        // and pen as well.
        const inkKey =
          mark.color || mark.mode ? `${mark.color || ''}|${mark.mode || ''}|` : '';
        const bucketKey = core
          ? `${inkKey}core`
          : `${inkKey}${mark.tone === 'dark' ? 'd' : ''}${
              mark.line ? (mark.wf && mark.wf !== 1 ? `t${mark.wf}` : 't') : 'a'
            }${mark.level}`;
        let b = buckets.get(bucketKey);
        if (!b) {
          b = {
            key: bucketKey,
            alpha: core
              ? profile.pressure.core.alpha
              : mark.mode === 'marker'
              ? MARKER_TEXT.alpha
              : mark.level,
            core,
            tone: mark.tone,
            color: mark.color,
            mode: mark.mode,
            // Thumbnail centre-lines are stroked at the pen's usual width.
            width: mark.line
              ? profile.strokeWidth * U * 0.85 * (mark.wf || 1)
              : undefined,
            parts: [],
          };
          buckets.set(bucketKey, b);
        }
        b.parts.push(mark.d);
      }
    }
    // Hand-drawn underlines: filled outlines that thin at the ends.
    for (const u of line.underlines || []) {
      const top = row * rowHeight + baselineInRow + 0.36 * U;
      const pts = u.points;
      const left = [];
      const right = [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const h = Math.max(0.35, p.thickness * 0.6) / 2;
        left.push(`${f1(line.offsetX + p.x)} ${f1(top + p.y - h)}`);
        right.unshift(`${f1(line.offsetX + p.x)} ${f1(top + p.y + h)}`);
      }
      underlines.push({
        key: u.key,
        d: `M${left.join('L')}L${right.join('L')}Z`,
        alpha: 0.92,
      });
    }
  });
  // Marker text first (it sits under pen ink, like a highlighter), then
  // lighter ink, corrected (darker) ink over it, the dense core last.
  const order = b =>
    b.mode === 'marker' ? -1 : b.core ? 3 : b.tone === 'dark' ? 2 : b.alpha;
  return {
    buckets: Array.from(buckets.values())
      .sort((a, b) => order(a) - order(b))
      .map(b => ({
        key: b.key,
        alpha: b.alpha,
        d: b.parts.join(''),
        ...(b.width ? { width: b.width } : null),
        ...(b.tone ? { tone: b.tone } : null),
        ...(b.color ? { color: b.color } : null),
        ...(b.mode ? { mode: b.mode } : null),
      })),
    underlines,
  };
}
