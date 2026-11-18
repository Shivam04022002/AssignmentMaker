/**
 * Deterministic "randomness" for handwriting.
 *
 * Every irregularity on a page comes from a PRNG seeded by a stable key
 * (document id · page id · text position · character index), never from
 * Math.random(). The same text therefore always produces exactly the same
 * handwriting: across re-renders, app restarts and devices.
 */

/* eslint-disable no-bitwise -- hashing and PRNG are bit arithmetic by nature */

/** 32-bit FNV-1a hash. */
export function hashString(input) {
  let hash = 0x811c9dc5;
  const str = String(input);
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Small seeded PRNG (mulberry32). Returns floats in [0, 1). */
export function createRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Derives the seed of a sub-element (e.g. character `index` of a word) from
 * its parent's seed, without re-hashing strings for every letter.
 */
export function mixSeed(seed, index) {
  let h = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/* eslint-enable no-bitwise */

/** PRNG for a seed key made of parts, e.g. randomFor(docId, pageId, pos). */
export function randomFor(...parts) {
  return createRandom(hashString(parts.join('|')));
}

/** Uniform value in [-amount, amount]. */
export function spread(random, amount) {
  return amount ? (random() * 2 - 1) * amount : 0;
}

/**
 * Softer, centre-weighted value in [-amount, amount] (average of two
 * draws): most marks stay close to "correct", a few wander further, as in
 * real writing.
 */
export function softSpread(random, amount) {
  return amount ? (random() + random() - 1) * amount : 0;
}

/**
 * A correlated sequence of n values in [-amount, amount]: each value leans
 * on the one before (AR(1) with correlation rho), so neighbouring letters
 * vary together — a little taller for a few letters, then a little
 * shorter — instead of jumping independently.
 */
export function correlated(random, n, amount, rho = 0.4) {
  const out = new Array(n);
  if (!amount) {
    return out.fill(0);
  }
  const keep = Math.sqrt(1 - rho * rho);
  let v = softSpread(random, amount);
  for (let i = 0; i < n; i++) {
    if (i) {
      v = rho * v + keep * softSpread(random, amount);
    }
    out[i] = Math.max(-amount, Math.min(amount, v));
  }
  return out;
}

/** Fade in [0, amount]: how much lighter than full ink a mark is. */
export function fade(random, amount) {
  return amount ? random() * amount : 0;
}

export const round = value => Math.round(value * 1000) / 1000;
