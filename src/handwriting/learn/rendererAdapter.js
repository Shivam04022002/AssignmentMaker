/**
 * Adapter from a learned profile to the existing stroke renderer.
 *
 * Conversion, text → unit resolution and Devanagari headline joins; the
 * profile is not registered with the app's glyph and style registries
 * (that shared change comes with renderer integration, behind the Lang1–3
 * hash locks — not part of Phase 6).
 *
 * The renderer's glyph format is used unchanged: a table entry
 * { w, strokes } (form 0) and forms [{ w, weight, strokes }], exactly as
 * glyphs.js holds Lang3's letterforms.
 */
import { DRAWABLE_STATES } from './confidence';
import { splitUnits, UNIT_KIND } from './textUnits';

/** { table, forms } in the renderer's format, from the drawable units only. */
export function rendererGlyphs(profile) {
  const table = {};
  const forms = {};
  for (const [key, unit] of Object.entries(profile.units || {})) {
    if (!DRAWABLE_STATES.includes(unit.coverage) || !unit.forms.length) continue;
    const list = unit.forms.map(f => ({ w: f.w, weight: f.weight, strokes: f.strokes }));
    table[key] = { w: list[0].w, strokes: list[0].strokes };
    if (list.length > 1) forms[key] = list;
  }
  return { table, forms };
}

/** Why a unit cannot be drawn with a profile. */
export const UNSUPPORTED_REASONS = {
  MISSING: 'missing', // the profile has no drawable form for it
  NOT_LEARNED: 'not-learned', // in the profile as missing / unsupported
  ORPHAN_MARK: 'orphan-mark', // a vowel sign or accent without a base
  SCRIPT: 'unsupported-script', // outside Latin and Devanagari
};

/**
 * Splits `text` into rendering units and says how each one is drawn:
 *   status 'glyph'        drawable from the profile (unit.coverage tells how)
 *          'space'        whitespace (no ink)
 *          'unsupported'  shown as a visible marker, with a reason
 * Every unit keeps its original text range, so unsupported text can be
 * pointed out in the editor without touching the text itself.
 */
export function resolveText(profile, text) {
  return splitUnits(text).map(u => {
    if (u.kind === UNIT_KIND.SPACE) return { ...u, status: 'space' };
    if (u.kind === UNIT_KIND.ORPHAN_MARK) return { ...u, status: 'unsupported', reason: UNSUPPORTED_REASONS.ORPHAN_MARK };
    if (u.kind === UNIT_KIND.OTHER) return { ...u, status: 'unsupported', reason: UNSUPPORTED_REASONS.SCRIPT };
    const unit = profile.units && profile.units[u.key];
    if (!unit) return { ...u, status: 'unsupported', reason: UNSUPPORTED_REASONS.MISSING };
    if (!DRAWABLE_STATES.includes(unit.coverage)) return { ...u, status: 'unsupported', reason: UNSUPPORTED_REASONS.NOT_LEARNED };
    return { ...u, status: 'glyph', coverage: unit.coverage };
  });
}

/** Unsupported text as merged ranges: [{ start, end, text, reasons }]. */
export function unsupportedRanges(resolved) {
  const out = [];
  for (const u of resolved) {
    if (u.status !== 'unsupported') continue;
    const last = out[out.length - 1];
    if (last && last.end === u.start) {
      last.end = u.end;
      last.text += u.text;
      if (!last.reasons.includes(u.reason)) last.reasons.push(u.reason);
    } else {
      out.push({ start: u.start, end: u.end, text: u.text, reasons: [u.reason] });
    }
  }
  return out;
}

/**
 * Devanagari headline joining. A learned cluster carries only its own
 * headline segment (its anchors headlineLeft / headlineRight, glyph units);
 * in a word the shirorekha runs on unbroken, so a renderer bridges each pair
 * of neighbouring clusters from the left one's headlineRight to the right
 * one's headlineLeft.
 * @param placed [{ key, x (the glyph's origin in the word, x-heights), unit }]
 *               neighbouring Devanagari clusters of one word, in order
 * Returns { joins: [cubic chain], unjoined: [{ left, right, reason }] } —
 * a pair that cannot be joined is reported, never silently left open.
 */
export function headlineJoins(placed) {
  const joins = [];
  const unjoined = [];
  for (let i = 1; i < placed.length; i++) {
    const a = placed[i - 1];
    const b = placed[i];
    const ra = a.unit && a.unit.anchors && a.unit.anchors.headlineRight;
    const lb = b.unit && b.unit.anchors && b.unit.anchors.headlineLeft;
    if (!ra || !lb) {
      unjoined.push({ left: a.key, right: b.key, reason: `${!ra ? a.key : b.key} has no traced headline` });
      continue;
    }
    const x0 = a.x + ra[0];
    const y0 = ra[1];
    const x1 = b.x + lb[0];
    const y1 = lb[1];
    if (x1 <= x0) continue; // the headlines already meet or overlap
    if (x1 - x0 > 1) {
      unjoined.push({ left: a.key, right: b.key, reason: 'too far apart to belong to one word' });
      continue;
    }
    const r3 = v => Math.round(v * 1000) / 1000;
    joins.push([x0, y0, x0 + (x1 - x0) / 3, y0 + (y1 - y0) / 3, x0 + ((x1 - x0) * 2) / 3, y0 + ((y1 - y0) * 2) / 3, x1, y1].map(r3));
  }
  return { joins, unjoined };
}
