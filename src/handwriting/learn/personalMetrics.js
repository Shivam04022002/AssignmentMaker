/**
 * Render-time consistency for a personal profile (Lang4 Phase 10).
 *
 * The forms in a stored profile are never changed (versions are immutable
 * and their geometry is the extracted evidence). What the renderer may do is
 * place each form consistently: every form gets a draw transform
 *
 *   x' = PAD + (x − PAD) · scale      y' = y · scale + shift
 *   (PAD: the side padding every extracted form carries)
 *
 * derived from the profile itself, deterministically:
 *
 *   size      forms of one class — x-height letters (and the x-height part
 *             of g p q y), ascender letters, capitals, digits, Devanagari
 *             clusters (headline height) — are scaled so their top meets
 *             the class's median over the whole profile (each form counted
 *             by the observations behind it). A form learned
 *             from a line whose x-height was mis-measured is drawn at the
 *             size of its siblings. Scales outside SIZE.min–max are not
 *             trusted (the form is drawn as stored and the reason noted).
 *   baseline  a systematic offset of a form standing on the baseline (its
 *             ink bottom) up to BASELINE.max x-height is removed; larger
 *             offsets are the writer's (a tail, a raised mark) and stay.
 *   spacing   advance = 2 PAD + (learned width − 2 PAD) × scale: the side
 *             padding extraction gave every form stays as it is, so the gap
 *             between letters is the profile's letter gap at any scale; a
 *             form at its class's size is laid out exactly as learned.
 *   headline  a Devanagari form's headline ends are measured on that form
 *             (not borrowed from the unit's first form) and transformed,
 *             so neighbouring clusters join where their headlines really are.
 *   pen       stroke thickness is the profile's one measured pen width; the
 *             scale changes the letter's size, never its stroke.
 *
 * Units, punctuation and signs with no class are drawn as stored.
 */
import { headlineAnchors, PROFILE_THRESHOLDS } from './profileGeneration';
import { sampleChain } from './strokeFit';
import { UNIT_KIND } from './textUnits';

export const SIZE = { min: 0.6, max: 1.6 };
export const BASELINE = { max: 0.15 };
const PAD = PROFILE_THRESHOLDS.PAD;

const CLASSES = {
  short: 'acemnorsuvwxzgpqy', // top = x-height (g p q y: their x-height part)
  ascender: 'bdhkl',
  standing: 'acemnorsuvwxzbdhklABCDEFGHIKLMNOPRSTUVWXYZ0123456789', // ink bottom on the baseline
};

const r3 = v => Math.round(v * 1000) / 1000;
/** Median of [value, weight] pairs (lower median). */
const weightedMedian = pairs => {
  if (!pairs.length) return null;
  const s = pairs.slice().sort((a, b) => a[0] - b[0]);
  const total = s.reduce((t, [, w]) => t + w, 0);
  let acc = 0;
  for (const [v, w] of s) {
    acc += w;
    if (acc >= total / 2) return v;
  }
  return s[s.length - 1][0];
};

/** Ink extent of a form (glyph units): { x0, x1, y0, y1 }. */
export function inkBox(form) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const s of form.strokes) {
    for (const [x, y] of sampleChain(s, 0.02)) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return Number.isFinite(x0) ? { x0, x1, y0, y1 } : { x0: 0, x1: form.w, y0: 0, y1: 1 };
}

function classOf(key, unit) {
  if (unit.script === 'Deva' && unit.kind === UNIT_KIND.CLUSTER) return 'deva';
  if (key.length !== 1) return null;
  if (CLASSES.short.includes(key)) return 'short';
  if (CLASSES.ascender.includes(key)) return 'ascender';
  if (key >= 'A' && key <= 'Z') return 'capital';
  if (key >= '0' && key <= '9') return 'digit';
  return null;
}

/** The height a form's class is measured by (headline height for Devanagari). */
function heightOf(cls, box, anchors) {
  if (cls === 'deva') return anchors ? anchors.headlineLeft[1] : null;
  return box.y1;
}

const cache = new WeakMap();

/**
 * Draw transforms for every drawable form of a profile:
 * { forms: Map(key → [{ scale, shift, advance, anchors, notes, form }]),
 *   references }. Cached per profile object.
 */
export function profileLayoutMetrics(profile) {
  if (cache.has(profile)) return cache.get(profile);
  const boxes = new Map();
  const heights = {};
  for (const [key, unit] of Object.entries(profile.units || {})) {
    if (!unit.forms || !unit.forms.length) continue;
    const cls = classOf(key, unit);
    const list = unit.forms.map(f => {
      const box = inkBox(f);
      const anchors = cls === 'deva' ? headlineAnchors(f) : null;
      const h = cls ? heightOf(cls, box, anchors) : null;
      const n = Array.isArray(f.observations) && f.observations.length ? f.observations.length : 1;
      if (h !== null && h > 0) (heights[cls] = heights[cls] || []).push([h, n]);
      return { box, anchors, cls };
    });
    boxes.set(key, list);
  }
  const references = Object.fromEntries(Object.entries(heights).map(([c, v]) => [c, r3(weightedMedian(v))]));
  const forms = new Map();
  for (const [key, list] of boxes) {
    const unit = profile.units[key];
    forms.set(
      key,
      list.map(({ box, anchors, cls }, i) => {
        const notes = [];
        let scale = 1;
        const h = cls ? heightOf(cls, box, anchors) : null;
        const ref = cls ? references[cls] : null;
        if (h && ref) {
          const s = ref / h;
          if (s >= SIZE.min && s <= SIZE.max) scale = s;
          else notes.push(`size ${r3(s)}× its class is outside ${SIZE.min}–${SIZE.max}: drawn as stored`);
        }
        let shift = 0;
        if (unit.script === 'Latn' && key.length === 1 && CLASSES.standing.includes(key)) {
          const off = box.y0 * scale;
          if (Math.abs(off) <= BASELINE.max) shift = -off;
        }
        const w = profile.units[key].forms[i].w;
        const t = { scale: r3(scale), shift: r3(shift), advance: r3(2 * PAD + (w - 2 * PAD) * scale), notes };
        const place = ([x, y]) => [r3(PAD + (x - PAD) * scale), r3(y * scale + shift)];
        t.anchors = anchors ? { headlineLeft: place(anchors.headlineLeft), headlineRight: place(anchors.headlineRight) } : null;
        t.form = i;
        return t;
      }),
    );
  }
  const out = { forms, references };
  cache.set(profile, out);
  return out;
}

/** A form's cubic chain in word units (x from the glyph's origin) under its transform. */
export function placeChain(chain, t) {
  const out = new Array(chain.length);
  for (let i = 0; i < chain.length; i += 2) {
    out[i] = PAD + (chain[i] - PAD) * t.scale;
    out[i + 1] = chain[i + 1] * t.scale + t.shift;
  }
  return out;
}
