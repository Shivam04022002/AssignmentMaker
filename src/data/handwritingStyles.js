/**
 * Handwriting registry.
 *
 * Handwriting is no longer "a font": the app writes with one reference
 * handwriting profile (src/handwriting/handwritingProfiles.js) whose
 * letterforms are the stroke glyphs in src/handwriting/glyphs.js.
 *
 * Compatibility: documents created before Phase 7 stored one of the old
 * font-style ids (neat, casual, cursive, rounded, fast, or one of the 25
 * Phase 3 ids). They all resolve to the reference profile — the document
 * opens and is drawn in the reference handwriting.
 *
 * Developer tuning (the Handwriting Tuner) still works through
 * setStyleOverrides(); overrides live in memory only.
 */
import {
  HANDWRITING_PROFILES,
  REFERENCE_PROFILE_ID,
  completeProfile,
} from '../handwriting/handwritingProfiles';

export const DEFAULT_HANDWRITING_STYLE = REFERENCE_PROFILE_ID;

/** Sample used to preview the handwriting (capitals, digits, punctuation). */
export const PREVIEW_SAMPLE = 'Dear Sir,\n\nThis is my handwriting.\nI can write 123, too!';

/** Every handwriting id used before Phase 7 (all fonts, now retired). */
export const LEGACY_STYLE_IDS = [
  'neat', 'casual', 'cursive', 'rounded', 'fast',
  'school-notebook', 'exam-writing', 'clean-notes', 'simple-student', 'small-notes',
  'natural', 'relaxed', 'everyday', 'messy', 'quick-notes',
  'formal', 'professional', 'academic', 'assignment', 'letter-writing', 'journal',
  'soft-cursive', 'connected-cursive', 'slanted-cursive', 'elegant-cursive',
  'soft', 'elegant', 'vintage', 'rough-pen', 'personal',
  'neat-student', 'classic-cursive',
];
const LEGACY = new Set(LEGACY_STYLE_IDS);

/**
 * Tuning ceilings so overrides can never distort the writing. Word tilt and
 * letter tilt share `rotation`; the profile stays far below these.
 */
export const VARIATION_LIMITS = {
  rotation: 3.5,
  vertical: 0.08,
  drift: 0.1,
  scale: 0.06,
  spacing: 0.15,
  letterSpacing: 0.03,
  opacity: 0.12,
  slant: 3,
  width: 0.05,
  height: 0.05,
  shift: 0.03,
};

/** Ascenders + descenders may span at most this many line pitches. */
export const MAX_INK_EXTENT_LINES = 1.1;

function clampVariation(variation) {
  const out = {};
  for (const [key, value] of Object.entries(variation || {})) {
    const limit = VARIATION_LIMITS[key];
    const v = Math.abs(Number(value) || 0);
    out[key] = limit === undefined ? v : Math.min(v, limit);
  }
  return out;
}

const baseProfiles = new Map(HANDWRITING_PROFILES.map(p => [p.id, p]));
const overrides = new Map();
const registry = new Map();
const listeners = new Set();
let version = 0;

function rebuild(id) {
  const patch = overrides.get(id) || {};
  const base = baseProfiles.get(id);
  const merged = {
    ...base,
    ...patch,
    variation: { ...base.variation, ...(patch.variation || {}) },
    charVariation: { ...base.charVariation, ...(patch.charVariation || {}) },
    ink: { ...base.ink, ...(patch.ink || {}) },
    stroke: { ...base.stroke, ...(patch.stroke || {}) },
    pressure: { ...base.pressure, ...(patch.pressure || {}) },
    corrections: { ...base.corrections, ...(patch.corrections || {}) },
  };
  const completed = completeProfile(merged);
  registry.set(id, {
    ...completed,
    // Explicit tuned values win over derived ones.
    ...(patch.fontScale ? { fontScale: patch.fontScale } : null),
    variation: clampVariation(completed.variation),
    charVariation: clampVariation(completed.charVariation),
  });
}

function notify() {
  version += 1;
  listeners.forEach(listener => listener());
}

baseProfiles.forEach((_, id) => rebuild(id));

export function getHandwritingStyles() {
  return Array.from(registry.values());
}

/** Maps any stored handwriting id (old or new) to a registered profile. */
export function resolveStyleId(id) {
  if (registry.has(id)) {
    return id;
  }
  // "Lang1" by name: the original reference handwriting.
  if (id === 'reference_student_lang1') {
    return DEFAULT_HANDWRITING_STYLE;
  }
  if (LEGACY.has(id)) {
    return DEFAULT_HANDWRITING_STYLE;
  }
  return null;
}

export function isHandwritingStyle(id) {
  return resolveStyleId(id) !== null;
}

/** A personal handwriting reference: personal:<profileId>@<version>. */
export const isPersonalStyleId = id => typeof id === 'string' && id.startsWith('personal:');

/**
 * The page-level style of a personal handwriting reference: the standard
 * page layout (no measured notebook layout, line height 1) and nothing
 * else — no glyphs, no pen, no variation. Its letters are drawn only by
 * the personal renderer (handwriting/learn/personalRenderer.js) from the
 * exact stored version; a renderer that is handed this style instead
 * draws nothing rather than another handwriting.
 */
function personalPageStyle(id) {
  return { id, name: 'Personal handwriting', personal: true, glyphSet: id, page: null, lineHeight: 1 };
}

/**
 * The profile for an id. Built-in, legacy (pre-Phase 7) and other unknown
 * ids get the reference profile, as before; a personal reference never
 * does — it gets its personal page style (see personalPageStyle).
 */
export function getHandwritingStyle(id) {
  if (isPersonalStyleId(id)) {
    return personalPageStyle(id);
  }
  return registry.get(resolveStyleId(id)) || registry.get(DEFAULT_HANDWRITING_STYLE);
}

// --- Developer tuning ------------------------------------------------------

export function setStyleOverrides(id, patch) {
  const target = resolveStyleId(id) || DEFAULT_HANDWRITING_STYLE;
  const current = overrides.get(target) || {};
  overrides.set(target, {
    ...current,
    ...patch,
    variation: { ...(current.variation || {}), ...(patch.variation || {}) },
    charVariation: {
      ...(current.charVariation || {}),
      ...(patch.charVariation || {}),
    },
    ink: { ...(current.ink || {}), ...(patch.ink || {}) },
    stroke: { ...(current.stroke || {}), ...(patch.stroke || {}) },
    pressure: { ...(current.pressure || {}), ...(patch.pressure || {}) },
    corrections: {
      ...(current.corrections || {}),
      ...(patch.corrections || {}),
    },
  });
  rebuild(target);
  notify();
}

export function resetStyleOverrides(id) {
  const ids = id ? [resolveStyleId(id) || id] : Array.from(overrides.keys());
  ids.forEach(styleId => {
    overrides.delete(styleId);
    if (baseProfiles.has(styleId)) {
      rebuild(styleId);
    }
  });
  notify();
}

export function getStyleOverrides(id) {
  return overrides.get(resolveStyleId(id) || id) || null;
}

export function getStylesVersion() {
  return version;
}

export function subscribeToStyles(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Map form, e.g. `handwritingStyles.reference_student`. */
export const handwritingStyles = new Proxy(
  {},
  {
    get: (_, id) => registry.get(id),
    has: (_, id) => registry.has(id),
    ownKeys: () => Array.from(registry.keys()),
    getOwnPropertyDescriptor: (_, id) =>
      registry.has(id)
        ? { enumerable: true, configurable: true, value: registry.get(id) }
        : undefined,
  },
);

export default handwritingStyles;
