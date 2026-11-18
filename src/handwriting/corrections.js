/**
 * Natural corrections — the occasional fix a student makes while writing.
 *
 * Calibrated on the reference pages (≈150–180 words each), which show about
 * one correction per page and no dramatic cross-outs:
 *   ref 3  "including" — the first letters struck through with a short,
 *          heavy, darker stroke; the word itself left as written
 *   ref 2  "Advantage" — two letters written over with the right ones, in
 *          slightly darker, doubled ink
 *   ref 1  a stray dot under a word
 *
 * Kinds (most → least common):
 *   letter-fix   a wrong letter written first, the right one over it, darker
 *   strike       a short, heavy strike through one or two letters
 *   overwrite    part of the word (2–4 letters) traced again, slightly
 *                offset and darker
 *   crossed      a misspelt or abandoned attempt, crossed out, then the word
 *                (rare; widens the word, so it is planned before layout)
 *   dot          a stray dot (a tiny imperfection, rarer still)
 *
 * Corrections are rendering metadata only: the typed text never changes.
 * Each is anchored to a word in its context — (document, the word and the
 * words either side of it) — and computed from it, never stored as
 * coordinates. So a correction moves with its word through edits, reflow,
 * page splits and page reordering; disappears when the word (or a word
 * right next to it) is changed or deleted; and editing other text leaves it
 * alone. Everything is seeded; never Math.random().
 */
import { randomFor } from '../utils/variation';

export const CORRECTION_KINDS = [
  'letter-fix',
  'strike',
  'overwrite',
  'crossed',
  'dot',
];

/**
 * Frequency and mix (per eligible prose word). The profile carries its own
 * copy (handwritingProfiles.js → corrections), which the developer tuner
 * can adjust; this is the fallback.
 */
export const CORRECTION_SETTINGS = {
  /**
   * Chance that an eligible word carries a correction. About half of the
   * words in prose are eligible, so this is ≈1 correction per 160 words —
   * about one per reference page.
   */
  rate: 1 / 90,
  /** Stray dots, per word of any kind that is eligible. */
  dotRate: 1 / 420,
  /** Pages shorter than this are left clean. */
  minWords: 40,
  /** Mix of kinds (relative weights). */
  mix: { 'letter-fix': 0.4, strike: 0.2, overwrite: 0.22, crossed: 0.18 },
};

/**
 * correct letter → the slip written first. The slip is always a part of the
 * right letter (o inside a, c inside e, r inside n …), so writing the right
 * letter over it reads as a fix, never as a different word — as in ref 2,
 * where "an" became "or" under the corrected letters.
 */
const SIMILAR = {
  a: 'o',
  b: 'o',
  d: 'a',
  e: 'c',
  g: 'a',
  h: 'n',
  m: 'n',
  n: 'r',
  o: 'c',
  q: 'a',
  w: 'v',
  y: 'v',
};

const WORD = /^([A-Za-z]+)([,.;:!?]?)$/;

/**
 * Whether a word may carry a correction: ordinary prose words only — not
 * headings, labels (Q1., Ans:, 1., •), underlined text, numbers, very short
 * or very long words, or words in capitals.
 */
export function isEligible(text, { heading, label, underline } = {}) {
  if (heading || label || underline) {
    return false;
  }
  const m = WORD.exec(text);
  if (!m) {
    return false;
  }
  const letters = m[1];
  return (
    letters.length >= 4 &&
    letters.length <= 10 &&
    letters !== letters.toUpperCase()
  );
}

/** A plausible slip for a word: two neighbouring letters swapped. */
export function misspell(letters, r) {
  for (let tries = 0; tries < 6; tries++) {
    const i = 1 + Math.floor(r() * Math.max(1, letters.length - 2));
    if (i + 1 >= letters.length) continue;
    const swapped =
      letters.slice(0, i) + letters[i + 1] + letters[i] + letters.slice(i + 2);
    if (swapped !== letters) {
      return swapped;
    }
  }
  return letters.slice(0, Math.max(2, letters.length - 1));
}

/**
 * The correction for one word occurrence, or null.
 *
 * @param seedKey    document (· style) seed
 * @param position   the word's anchor: "previous word · word · next word"
 * @param text       the word as typed (may end in punctuation)
 * @param context    { heading, label, underline }
 * @param settings   CORRECTION_SETTINGS (overridable for tests/tuning)
 */
export function planCorrection(
  seedKey,
  position,
  text,
  context = {},
  settings = CORRECTION_SETTINGS,
) {
  const eligible = isEligible(text, context);
  if (!eligible) {
    return null;
  }
  const r = randomFor(seedKey, 'correction', position);
  const roll = r();
  const letters = WORD.exec(text)[1];
  if (roll >= settings.rate) {
    // Not corrected — perhaps a stray dot instead.
    if (roll < settings.rate + settings.dotRate) {
      return { kind: 'dot', seed: Math.floor(r() * 2 ** 31) };
    }
    return null;
  }
  const mix = settings.mix;
  const total = Object.values(mix).reduce((t, v) => t + v, 0);
  let pick = r() * total;
  let kind = 'letter-fix';
  for (const [k, w] of Object.entries(mix)) {
    if (pick < w) {
      kind = k;
      break;
    }
    pick -= w;
  }
  const seed = Math.floor(r() * 2 ** 31);
  if (kind === 'letter-fix') {
    // An inner letter that has a look-alike.
    const options = [];
    for (let i = 1; i < letters.length; i++) {
      if (SIMILAR[letters[i]]) options.push(i);
    }
    if (!options.length) {
      kind = 'overwrite';
    } else {
      const index = options[Math.floor(r() * options.length)];
      return { kind, seed, index, wrong: SIMILAR[letters[index]] };
    }
  }
  if (kind === 'strike') {
    // One or two letters, usually near the start (as in "including").
    const count = r() < 0.6 ? 2 : 1;
    const from = r() < 0.65 ? 0 : 1 + Math.floor(r() * (letters.length - 2));
    return { kind, seed, from, count: Math.min(count, letters.length - from) };
  }
  if (kind === 'crossed') {
    // A misspelt attempt, or an abandoned start.
    const attempt =
      r() < 0.55
        ? misspell(letters, r)
        : letters.slice(0, 2 + Math.floor(r() * Math.min(3, letters.length - 2)));
    return { kind, seed, attempt, pattern: Math.floor(r() * 3) };
  }
  // Part of the word gone over again (a whole bold word looks printed).
  const count = Math.min(letters.length, 2 + Math.floor(r() * 3));
  const from = Math.floor(r() * (letters.length - count + 1));
  return { kind: 'overwrite', seed, from, count };
}

/** Number of words in a text (for the minimum-length rule). */
export function wordCount(text) {
  const m = text.match(/\S+/g);
  return m ? m.length : 0;
}
