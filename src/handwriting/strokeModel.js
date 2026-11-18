/**
 * Stroke model — turns a letter occurrence into pen strokes the way a hand
 * would write it, rather than stamping a fixed glyph.
 *
 *   glyph strokes (cubic chains, x-height units)
 *     → letterform (sets with several forms of a letter: chosen by the
 *       neighbours, never the same form twice in a row for a repeated letter)
 *     → contextual variant (chosen by previous · this · next letter)
 *     → sampled centre-lines (points along the pen path)
 *     → occurrence reshaping: a gentle warp, curve tension, entry/exit
 *       overshoot or shortfall, end-angle change
 *     → context: exit tail drawn toward the next letter's entry, a small
 *       lead-in from the previous letter
 *     → pressure along each stroke (landing, firmer middle, release; firmer
 *       on downstrokes and at turns)
 *
 * The renderer (glyphRender.js) places the result and draws each stroke as a
 * filled ribbon whose width follows the pressure.
 *
 * Every value is small and deterministic (seeded; never Math.random()).
 */
import { createRandom, hashString, mixSeed } from '../utils/variation';
import { GLYPH_FORMS, glyphFor, glyphForms } from './glyphs';

/** Distance between centre-line samples, x-height units. */
export const SAMPLE_STEP = 0.14;

/** Euclidean length (Math.hypot is several times slower in hot loops). */
export const dist = (dx, dy) => Math.sqrt(dx * dx + dy * dy);

// --- Sampling ------------------------------------------------------------------

/** Samples a cubic chain [x0, y0, c1x, c1y, c2x, c2y, x1, y1, …] to points. */
export function sampleChain(pts, step = SAMPLE_STEP) {
  const xs = [pts[0]];
  const ys = [pts[1]];
  for (let i = 2; i + 5 < pts.length; i += 6) {
    const x0 = pts[i - 2];
    const y0 = pts[i - 1];
    const [ax, ay, bx, by, x1, y1] = pts.slice(i, i + 6);
    const chord = dist(x1 - x0, y1 - y0);
    const poly =
      dist(ax - x0, ay - y0) +
      dist(bx - ax, by - ay) +
      dist(x1 - bx, y1 - by);
    const n = Math.min(24, Math.max(1, Math.ceil((chord + poly) / 2 / step)));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const u = 1 - t;
      const w0 = u * u * u;
      const w1 = 3 * u * u * t;
      const w2 = 3 * u * t * t;
      const w3 = t * t * t;
      xs.push(w0 * x0 + w1 * ax + w2 * bx + w3 * x1);
      ys.push(w0 * y0 + w1 * ay + w2 * by + w3 * y1);
    }
  }
  return { xs, ys };
}

export function strokeLength({ xs, ys }) {
  let len = 0;
  for (let i = 1; i < xs.length; i++) {
    len += dist(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
  }
  return len;
}

// --- Variants ------------------------------------------------------------------

const variantCache = new Map();

/** Cache key of a glyph form (form 0 keeps the key it always had). */
const formKey = (set, char, form) =>
  form ? `${set}\u0000${char}\u0001${form}` : `${set}\u0000${char}`;

/** The pen strokes of one of a character's forms (form 0: the glyph). */
export function glyphFormStrokes(char, set = 'lang1', form = 0) {
  const forms = form ? glyphForms(char, set) : null;
  return forms && forms[form] ? forms[form].strokes : glyphFor(char, set).strokes;
}

/**
 * One of a few subtle shapes for a glyph (control points moved by a smooth,
 * low-frequency offset), so a letter keeps its identity — the same person
 * writing it again — without being a copy.
 */
export function glyphVariant(char, variant, amount, set = 'lang1', form = 0) {
  const key = `${formKey(set, char, form)}\u0000${variant}\u0000${amount}`;
  let strokes = variantCache.get(key);
  if (!strokes) {
    const glyphStrokes = glyphFormStrokes(char, set, form);
    if (!variant || !amount) {
      strokes = glyphStrokes;
    } else {
      const r = createRandom(
        hashString(form ? `glyph|${char}|${variant}|${form}` : `glyph|${char}|${variant}`),
      );
      const p1 = r() * Math.PI * 2;
      const p2 = r() * Math.PI * 2;
      const f1 = 1.2 + r() * 1.6;
      const f2 = 1.2 + r() * 1.6;
      const sx = 1 + (r() - 0.5) * 0.05;
      strokes = glyphStrokes.map(pts => {
        const out = new Array(pts.length);
        for (let i = 0; i < pts.length; i += 2) {
          const x = pts[i];
          const y = pts[i + 1];
          out[i] = x * sx + amount * Math.sin(p1 + y * f1 + x * 0.7);
          out[i + 1] = y + amount * Math.sin(p2 + x * f2 - y * 0.5);
        }
        return out;
      });
    }
    variantCache.set(key, strokes);
  }
  return strokes;
}

const sampledCache = new Map();

/** Sampled centre-lines of a glyph variant (cached; never mutated). */
function sampledVariant(char, variant, amount, set, form = 0) {
  const key = `${formKey(set, char, form)}\u0000${variant}\u0000${amount}`;
  let sampled = sampledCache.get(key);
  if (!sampled) {
    sampled = glyphVariant(char, variant, amount, set, form).map(pts => sampleChain(pts));
    sampledCache.set(key, sampled);
  }
  return sampled;
}

/** Letters, by how they are written: used for contextual choices. */
const LETTER = /\p{L}/u;
export function letterClass(char) {
  if (!char || char === ' ') {
    return 'space';
  }
  if (/[a-z]/.test(char)) {
    if ('bdfhklt'.includes(char)) return 'tall';
    if ('gjpqy'.includes(char)) return 'deep';
    if ('aceos'.includes(char)) return 'round';
    return 'stem';
  }
  if (/[A-Z]/.test(char)) return 'capital';
  if (/[0-9]/.test(char)) return 'digit';
  return LETTER.test(char) ? 'letter' : 'mark';
}

/**
 * Which of the profile's variants this occurrence uses. The neighbours take
 * part, so the `a` in "and" and the `a` in "day" are chosen differently;
 * the occurrence seed (document · page · word · position) keeps repeated
 * contexts from always matching.
 */
export function contextualVariant(char, prev, next, seed, count) {
  if (count <= 1) {
    return 0;
  }
  const context = hashString(`${letterClass(prev)}|${prev || ''}|${char}|${next || ''}`);
  const r = createRandom(mixSeed(context, seed));
  return Math.floor(r() * count);
}

// --- Letterforms ---------------------------------------------------------------

/** Seed salt of a crossed-out attempt (layout measures it, renderer writes it). */
export const ATTEMPT_SALT = 0xa77e;

/**
 * A form entered from the baseline at its left: its first stroke starts low
 * at the letter's leftmost ink (an entry stroke, not e.g. the bar of an e).
 */
const enteredCache = new Map();
export function entered(char, set, form) {
  const key = formKey(set, char, form);
  let v = enteredCache.get(key);
  if (v === undefined) {
    const strokes = glyphFormStrokes(char, set, form);
    let left = Infinity;
    strokes.forEach(p => {
      for (const x of sampleChain(p).xs) left = Math.min(left, x);
    });
    v = strokes[0][1] < 0.45 && strokes[0][0] <= left + 0.02;
    enteredCache.set(key, v);
  }
  return v;
}

/** Weight factor of an entered form after a letter that leaves the baseline. */
export const ENTRY_AFTER_EXIT = 0;

/**
 * Which form of a letter this occurrence uses (sets whose reference shows
 * the letter written several ways; 0 otherwise). Deterministic: the
 * occurrence seed and the neighbours decide. Forms with an entry stroke
 * are written as the sheet shows them, on a letter begun afresh (a word's
 * first letter, or after a letter that does not end on the baseline).
 * After a letter that leaves the baseline with a foot or flick (prev, in
 * its form prevForm) they are not used (ENTRY_AFTER_EXIT): the two flicks
 * would meet — a join the reference does not show. `avoid` (a form index:
 * the form of the same letter just before) is not chosen while any other
 * form is available — if need be an entered one, never an unused one.
 */
export function chooseForm(char, prev, next, seed, set, avoid = -1, prevForm = 0) {
  const forms = glyphForms(char, set);
  if (!forms || forms.length < 2) {
    return 0;
  }
  const prevExit = prev && /[a-z]/.test(prev) ? glyphContext(prev, set, prevForm).exit : null;
  const fromLine = !!(prevExit && !prevExit.high);
  const weigh = (skip, context) =>
    forms.map((f, i) => {
      if (i === skip) return 0;
      if (!context || !entered(char, set, i)) return f.weight;
      return f.weight * (fromLine ? ENTRY_AFTER_EXIT : prev ? 0.8 : 1);
    });
  let weights = weigh(avoid, true);
  let total = weights.reduce((a, b) => a + b, 0);
  for (const [skip, context] of [
    [avoid, false],
    [-1, true],
  ]) {
    if (total > 0) break;
    weights = weigh(skip, context);
    total = weights.reduce((a, b) => a + b, 0);
  }
  const r = createRandom(mixSeed(hashString(`form|${prev || ''}|${char}|${next || ''}`), seed));
  let pick = r() * total;
  for (let i = 0; i < weights.length; i++) {
    pick -= weights[i];
    if (pick < 0 && weights[i] > 0) return i;
  }
  return weights.findIndex(w => w > 0);
}

/**
 * Forms of a word's first `count` letters, left to right (chars: its
 * letters; seedAt(i): letter i's seed). Each letter sees the form of the
 * one before it; a repeated letter (ll, ss, aaaa) never uses the form of
 * the one before it, so a run of the same letter is never stamped.
 */
function formsUpTo(chars, count, seedAt, set) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const char = chars[i];
    if (!glyphForms(char, set)) {
      out.push(0);
      continue;
    }
    const prev = i > 0 ? chars[i - 1] : null;
    out.push(
      chooseForm(
        char,
        prev,
        i < chars.length - 1 ? chars[i + 1] : null,
        seedAt(i),
        set,
        prev === char ? out[i - 1] : -1,
        i > 0 ? out[i - 1] : 0,
      ),
    );
  }
  return out;
}

/** The form of letter `index` of a word (see formsUpTo). */
export function letterForm(chars, index, seedAt, set) {
  if (!glyphForms(chars[index], set)) {
    return 0;
  }
  return formsUpTo(chars, index + 1, seedAt, set)[index];
}

/**
 * The form of every letter of a word written from `seedBase` (letter i's
 * seed is mixSeed(seedBase, i)), or null for sets with one form per letter.
 * The layout sizes the word from these forms and the renderer draws them.
 */
export function wordForms(chars, seedBase, set) {
  if (!set || !GLYPH_FORMS[set]) {
    return null;
  }
  return formsUpTo(chars, chars.length, i => mixSeed(seedBase, i), set);
}

// --- Entry / exit --------------------------------------------------------------

const contextCache = new Map();

/**
 * Where a letter is entered (start of its first stroke) and, for letters
 * that finish on the baseline at the right (a d h i l m n t u …), where the
 * pen leaves it.
 */
export function glyphContext(char, set = 'lang1', form = 0) {
  const cacheKey = formKey(set, char, form);
  let info = contextCache.get(cacheKey);
  if (!info) {
    const glyph = { w: glyphFor(char, set).w, strokes: glyphFormStrokes(char, set, form) };
    const first = glyph.strokes[0];
    let exit = null;
    if (/[a-z]/.test(char)) {
      glyph.strokes.forEach((pts, stroke) => {
        const x = pts[pts.length - 2];
        const y = pts[pts.length - 1];
        if (y < 0.3 && y > -0.12 && x > glyph.w * 0.55 && (!exit || x > exit.x)) {
          exit = { stroke, x, y };
        }
      });
      // A joined hand also leaves some letters from the top (o, v, w).
      if (!exit && set !== 'lang1') {
        const last = glyph.strokes.length - 1;
        const pts = glyph.strokes[last];
        const x = pts[pts.length - 2];
        const y = pts[pts.length - 1];
        if (y > 0.6 && y < 1.1 && x > glyph.w * 0.7) {
          exit = { stroke: last, x, y, high: true };
        }
      }
    }
    // A stem letter starts at the top-left of the x-height (i m n p r u …).
    const lead =
      /[a-z]/.test(char) &&
      first[1] > 0.78 &&
      first[1] < 1.1 &&
      first[0] < glyph.w * 0.3;
    // Left edge of the letter body (tails must stop short of it).
    let left = Infinity;
    glyph.strokes.forEach(pts => {
      for (let i = 0; i < pts.length; i += 2) left = Math.min(left, pts[i]);
    });
    info = { entry: { x: first[0], y: first[1] }, left, exit, lead };
    contextCache.set(cacheKey, info);
  }
  return info;
}

// --- Occurrence reshaping ------------------------------------------------------

const smooth = t => t * t * (3 - 2 * t);

/**
 * Per-occurrence construction (profiles that set stroke.construction):
 * how tall this ascender reaches, how deep this descender drops, how full
 * this bowl is — the things a hand changes from one letter to the next,
 * rather than the whole letter being scaled or rotated. Own random
 * stream, so other profiles are unaffected.
 */
function construct(strokes, seed, k) {
  const r = createRandom(mixSeed(seed, 0xc0d5));
  const asc = 1 + (r() * 2 - 1) * k.ascender;
  const desc = 1 + (r() * 2 - 1) * k.descender;
  const bowl = 1 + (r() * 2 - 1) * k.bowl;
  let cx = 0;
  let count = 0;
  for (const st of strokes) {
    for (let i = 0; i < st.xs.length; i++) {
      if (st.ys[i] > 0.05 && st.ys[i] < 1.05) {
        cx += st.xs[i];
        count++;
      }
    }
  }
  cx = count ? cx / count : 0;
  for (const st of strokes) {
    const { xs, ys } = st;
    for (let i = 0; i < xs.length; i++) {
      const y = ys[i];
      if (y > 1.05) ys[i] = 1.05 + (y - 1.05) * asc;
      else if (y < -0.05) ys[i] = -0.05 + (y + 0.05) * desc;
      else xs[i] = cx + (xs[i] - cx) * bowl;
    }
  }
}

/** Reshapes copied centre-lines of one occurrence (in place). */
function reshape(strokes, r, cfg) {
  const p1 = r() * Math.PI * 2;
  const p2 = r() * Math.PI * 2;
  const f1 = 1.5 + r() * 2;
  const f2 = 1.5 + r() * 2;
  for (const st of strokes) {
    const { xs, ys } = st;
    const n = xs.length;
    if (n < 2) continue;
    // Curve tension: how far the path bows away from its chord.
    const ax = xs[0];
    const ay = ys[0];
    const cx = xs[n - 1] - ax;
    const cy = ys[n - 1] - ay;
    const chord = dist(cx, cy);
    const tension = 1 + (r() * 2 - 1) * cfg.tension;
    if (n > 3 && chord > 0.25) {
      const ux = cx / chord;
      const uy = cy / chord;
      for (let i = 1; i < n - 1; i++) {
        const dx = xs[i] - ax;
        const dy = ys[i] - ay;
        const along = dx * ux + dy * uy;
        xs[i] = ax + ux * along + (dx - ux * along) * tension;
        ys[i] = ay + uy * along + (dy - uy * along) * tension;
      }
    }
    // A gentle warp, smooth across the letter.
    for (let i = 0; i < n; i++) {
      const x = xs[i];
      const y = ys[i];
      xs[i] = x + cfg.warp * Math.sin(p1 + y * f1 + x * 0.9);
      ys[i] = y + cfg.warp * Math.sin(p2 + x * f2 - y * 0.6);
    }
    // Hand tremor: a tiny, smooth wobble across the path (a few cycles per
    // x-height of travel), so no line is geometrically perfect.
    if (cfg.tremor && n > 3) {
      const ph = r() * Math.PI * 2;
      const fr = 2.2 + r() * 1.6;
      let s = 0;
      const ox = xs.slice();
      const oy = ys.slice();
      for (let i = 0; i < n; i++) {
        if (i) s += dist(ox[i] - ox[i - 1], oy[i] - oy[i - 1]);
        const j0 = Math.max(0, i - 1);
        const j1 = Math.min(n - 1, i + 1);
        const tx = ox[j1] - ox[j0];
        const ty = oy[j1] - oy[j0];
        const len = dist(tx, ty) || 1;
        const w =
          cfg.tremor *
          (Math.sin(ph + s * fr * Math.PI * 2) * 0.7 +
            Math.sin(ph * 1.7 + s * fr * 5.3) * 0.3);
        xs[i] = ox[i] - (ty / len) * w;
        ys[i] = oy[i] + (tx / len) * w;
      }
    }
    if (n < 3) continue;
    // Entry and exit: a hair of overshoot or stopping short, and a slight
    // change of angle over the last part of the stroke.
    const extend = (from, to, amount) => {
      const dx = xs[from] - xs[to];
      const dy = ys[from] - ys[to];
      const len = dist(dx, dy) || 1;
      xs[from] += (dx / len) * amount;
      ys[from] += (dy / len) * amount;
    };
    extend(0, 1, (r() * 2 - 1) * cfg.endpoint);
    extend(n - 1, n - 2, (r() * 2 - 1) * cfg.endpoint);
    const turn = (((r() * 2 - 1) * cfg.endAngle) * Math.PI) / 180;
    const pivot = Math.floor(n * 0.7);
    const px = xs[pivot];
    const py = ys[pivot];
    for (let i = pivot + 1; i < n; i++) {
      const a = turn * smooth((i - pivot) / (n - 1 - pivot));
      const dx = xs[i] - px;
      const dy = ys[i] - py;
      xs[i] = px + dx * Math.cos(a) - dy * Math.sin(a);
      ys[i] = py + dx * Math.sin(a) + dy * Math.cos(a);
    }
  }
}

/** Appends a quadratic from the stroke's end toward (tx, ty). */
function appendTail(st, tx, ty, steps) {
  const { xs, ys } = st;
  const n = xs.length;
  const ex = xs[n - 1];
  const ey = ys[n - 1];
  const dx = ex - xs[n - 2];
  const dy = ey - ys[n - 2];
  const len = dist(dx, dy) || 1;
  const reach = dist(tx - ex, ty - ey);
  const cx = ex + (dx / len) * reach * 0.45;
  const cy = ey + (dy / len) * reach * 0.45;
  for (let k = 1; k <= steps; k++) {
    const t = k / steps;
    const u = 1 - t;
    xs.push(u * u * ex + 2 * u * t * cx + t * t * tx);
    ys.push(u * u * ey + 2 * u * t * cy + t * t * ty);
  }
  st.tail = steps;
}

/**
 * The strokes of one letter occurrence, in glyph units (y up), before
 * placement. Each stroke: { xs, ys, lead?, tail?, joined? }.
 *
 * @param char   the letter
 * @param ctx    { prev, next, seed, nextAdvance (glyph units from this
 *                 letter's origin to the next letter's origin), profile,
 *                 form?, nextForm? (letterforms, see letterForm) }
 *
 * The returned array carries `form`: the letterform used.
 */
export function letterStrokes(char, ctx) {
  const { profile, prev, next, seed } = ctx;
  const cfg = profile.stroke;
  const variant = contextualVariant(char, prev, next, seed, profile.glyphVariants);
  const set = profile.glyphSet || 'lang1';
  const form = ctx.form ?? chooseForm(char, prev, next, seed, set);
  const base = sampledVariant(char, variant, profile.variantAmount, set, form);
  const strokes = base.map(st => ({ xs: st.xs.slice(), ys: st.ys.slice() }));
  const r = createRandom(mixSeed(seed, 0x5eed));
  if (cfg.construction) {
    construct(strokes, seed, cfg.construction);
  }
  reshape(strokes, r, cfg);

  const info = glyphContext(char, set, form);
  // Exit tail toward the next letter (same word only).
  if (info.exit && next && /[a-z]/.test(next)) {
    const nextInfo = glyphContext(next, set, ctx.nextForm || 0);
    const target = nextInfo.entry;
    // Aim at the next letter's entry, but never past its left edge (a tail
    // must not cut into the bowl of an o, a, e …).
    // (Profiles may keep more clearance: tailClearance, x-heights.)
    const edge = ctx.nextAdvance + nextInfo.left - (cfg.tailClearance ?? 0.06);
    const tx = Math.min(ctx.nextAdvance + target.x, edge);
    const atEdge = target.x - nextInfo.left < 0.08;
    // A joined hand meets a round letter at its upper left, and a letter
    // left from the top meets the next one at x-height.
    let ty = target.y;
    if (info.exit.high) {
      ty = Math.min(info.exit.y, 0.92) - 0.06;
    } else if (!atEdge && cfg.joinRound) {
      ty = 0.72;
    }
    const st = strokes[info.exit.stroke];
    const n = st.xs.length;
    const ex = st.xs[n - 1];
    const ey = st.ys[n - 1];
    const pair = createRandom(mixSeed(hashString(`${char}${next}`), seed));
    // Joining where the next letter is entered at its left edge (or, in a
    // joined hand, at a round letter's side or from the top).
    // A top exit (r, o, v, w) running straight into the top of an arched
    // letter (n, m …) would close "rn" into "m": there the pen stops short.
    const archAhead =
      info.exit.high && cfg.highStopBefore && cfg.highStopBefore.includes(next);
    const join =
      !archAhead &&
      pair() < cfg.join &&
      ty < 1.1 &&
      (atEdge || (cfg.joinRound && !atEdge) || info.exit.high);
    const reach = archAhead ? [0.18, 0.32] : cfg.tail;
    const f = join ? 1 : reach[0] + pair() * (reach[1] - reach[0]);
    const endY = join
      ? ty
      : info.exit.high
      ? ey + (ty - ey) * f
      : Math.min(ey + (ty - ey) * f, 0.42);
    // A joined hand also varies how high a connection leaves (own stream).
    const lift = cfg.exitLift
      ? (createRandom(mixSeed(seed, 0xe1f7))() * 2 - 1) * cfg.exitLift
      : 0;
    // A profile that keeps clearance draws no tail where there is no room
    // ahead (it would turn back up beside the next letter).
    const room = cfg.tailClearance === undefined || join || tx - ex > 0.04;
    if (room) {
      appendTail(st, ex + (tx - ex) * f, endY + (join ? lift * 0.5 : lift), join ? 6 : 3);
    }
    st.joined = join && room;
  }
  // Lead-in: the pen arrives at a stem letter from below-left, as it does
  // after a letter that ended on the baseline.
  const prevInfo = prev ? glyphContext(prev, set) : null;
  if (info.lead && prevInfo && prevInfo.exit && r() < cfg.leadIn) {
    const st = strokes[0];
    const k = 0.06 + r() * 0.06;
    st.xs.unshift(st.xs[0] - k * 0.8, st.xs[0] - k * 0.35);
    st.ys.unshift(st.ys[0] - k * 1.1, st.ys[0] - k * 0.4);
    st.lead = 2;
  }
  strokes.form = form;
  return strokes;
}

// --- Pressure ------------------------------------------------------------------

/**
 * Pen pressure (≈0.3–1.15) at each sample of a placed stroke: a light
 * landing that builds up, a firmer middle with a slow swell, a release at
 * the end — each stroke with its own lengths and levels — plus a little
 * extra on downstrokes and at turns (where ballpoint ink pools).
 *
 * xs, ys are page coordinates (y down); `unit` is the x-height in px.
 */
export function pressureCurve(xs, ys, unit, r, cfg, level = 1) {
  const n = xs.length;
  const out = new Array(n);
  if (n === 1) {
    out[0] = level;
    return out;
  }
  const cum = new Array(n);
  cum[0] = 0;
  for (let i = 1; i < n; i++) {
    cum[i] = cum[i - 1] + dist(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
  }
  const total = cum[n - 1] || 1;
  const lenX = total / unit; // stroke length in x-heights
  // Taper scales how light the landing and release are (tuner).
  const taper = cfg.taper ?? 1;
  const p0 = 1 - (1 - (cfg.landing[0] + r() * (cfg.landing[1] - cfg.landing[0]))) * taper;
  const p1 = 1 - (1 - (cfg.release[0] + r() * (cfg.release[1] - cfg.release[0]))) * taper;
  // Ramps are a fixed bit of *pen travel*, so short strokes stay mostly light.
  const a = Math.min(0.45, (cfg.landingLength[0] + r() * (cfg.landingLength[1] - cfg.landingLength[0])) / lenX);
  const b = Math.min(0.45, (cfg.releaseLength[0] + r() * (cfg.releaseLength[1] - cfg.releaseLength[0])) / lenX);
  const wave = cfg.wave[0] + r() * (cfg.wave[1] - cfg.wave[0]);
  const freq = 0.5 + r() * 1.2;
  const phase = r() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const s = cum[i] / total;
    const land = p0 + (1 - p0) * smooth(Math.min(1, s / a));
    const rel = 1 - (1 - p1) * smooth(Math.max(0, (s - (1 - b)) / b));
    let p = land * rel * (1 + wave * Math.sin(phase + s * freq * Math.PI * 2));
    // Direction at this sample.
    const j0 = Math.max(0, i - 1);
    const j1 = Math.min(n - 1, i + 1);
    const dx = xs[j1] - xs[j0];
    const dy = ys[j1] - ys[j0];
    const d = dist(dx, dy) || 1;
    if (dy > 0) {
      p += cfg.down * (dy / d) * land * rel; // y grows downwards
    }
    if (i > 0 && i < n - 1) {
      const ax = xs[i] - xs[i - 1];
      const ay = ys[i] - ys[i - 1];
      const bx = xs[i + 1] - xs[i];
      const by = ys[i + 1] - ys[i];
      const la = dist(ax, ay) || 1;
      const lb = dist(bx, by) || 1;
      // 1 − cos of the turning angle; 0.175 ≈ a 0.6 rad (34°) turn.
      const bend = 1 - (ax * bx + ay * by) / (la * lb);
      p += cfg.turn * Math.min(1, bend / 0.175) * land * rel;
    }
    out[i] = Math.max(0.2, p * level);
  }
  return out;
}
