/**
 * Reference handwriting glyph set — the letterforms of the reference
 * student's print hand (reference/handwriting_03.png), drawn as pen strokes.
 *
 * Not a font. Each character is a list of pen strokes — the centre-line the
 * pen travels, in writing order — built from arcs, lines and curves, in
 * x-height units. strokeModel.js samples, reshapes and connects them per
 * occurrence; the renderer gives them pressure and width:
 *
 *   y = 0      baseline             y = 1      x-height
 *   y = 1.55   capitals / digits     y = 1.72   ascenders (b d f h k l)
 *   y = -0.72  descenders (g j p q y)
 *
 * y points up here; the renderer flips it. Letterform notes (from the scans):
 *   a, d, g, q  single-storey: a round bowl, then a straight right stem
 *   g           stem drops and hooks back left in an open tail
 *   y           left arm meets a straight right stroke that curls left
 *   r           short stem with a small, high shoulder
 *   t           crossed high, the foot curving out to the right
 *   f           tall, hooked top, crossed at x-height
 *   e           a bar, then the bowl swept over the top
 *   I           top and bottom bars;   1  a flag, no foot;   W  pointed
 *
 * Strokes are stored as cubic Bézier chains: [x0, y0, c1x, c1y, c2x, c2y,
 * x1, y1, …], so every variation is a cheap affine map of control points.
 */

import { DEFS_LANG2 } from './glyphsLang2';
import { DEFS_LANG3, FORMS_LANG3 } from './glyphsLang3';
import { dot, s } from './strokeBuilder';

// Shared components (same pen habits in every letter that uses them).
// Written as the pen moves: a, d, g, q are one stroke — the bowl from its
// top-right, round to the right side, up to the top of the stem and back
// down it; n, m, h, r, b, p go down the stem and retrace up into the arch
// or bowl.
const bowlUp = (stemTop, x = 0.74) => s().arc(0.38, 0.5, 0.35, 0.5, 52, 368).L(x, stemTop);
const archTo = (st, x0, x1, end = 0) =>
  st
    .L(x0, 0.58)
    .Q(x0 + 0.05, 1, x0 + (x1 - x0) * 0.5, 1)
    .Q(x1 - 0.01, 0.99, x1, 0.6)
    .L(x1, end);

/** Glyph table: char → { w: body width, strokes: [[…cubic chain…], …] }. */
const DEFS = {
  // ── lowercase ────────────────────────────────────────────────────────
  a: [0.8, [bowlUp(0.98).L(0.74, 0.1).Q(0.75, 0, 0.84, 0.03)]],
  b: [0.78, [s().M(0.08, 1.72).L(0.08, 0.02).L(0.09, 0.62).arc(0.42, 0.5, 0.34, 0.5, 160, -165)]],
  c: [0.66, [s().arc(0.36, 0.5, 0.33, 0.5, 38, 318)]],
  d: [0.82, [bowlUp(1.72).L(0.74, 0.1).Q(0.75, 0, 0.84, 0.03)]],
  e: [0.72, [s().M(0.06, 0.5).L(0.66, 0.53).arc(0.36, 0.5, 0.31, 0.5, 6, 318)]],
  // Ref 3's f drops a little below the line ("refers", "of").
  f: [0.56, [s().M(0.64, 1.56).Q(0.5, 1.8, 0.36, 1.6).L(0.3, -0.4), s().M(0.06, 0.98).L(0.56, 1)]],
  g: [0.8, [bowlUp(0.98).L(0.74, -0.38).Q(0.73, -0.72, 0.42, -0.72).Q(0.18, -0.71, 0.1, -0.55)]],
  h: [0.76, [archTo(s().M(0.08, 1.72).L(0.08, 0), 0.08, 0.7)]],
  i: [0.22, [s().M(0.1, 0.98).L(0.1, 0.06).Q(0.11, 0, 0.18, 0.02), dot(0.11, 1.36)]],
  j: [0.38, [s().M(0.3, 0.98).L(0.3, -0.42).Q(0.28, -0.72, 0.04, -0.66), dot(0.31, 1.36)]],
  k: [0.68, [s().M(0.08, 1.72).L(0.08, 0), s().M(0.6, 0.98).L(0.12, 0.44).L(0.66, 0)]],
  l: [0.24, [s().M(0.1, 1.72).L(0.1, 0.08).Q(0.12, 0, 0.2, 0.02)]],
  m: [1.18, [archTo(archTo(s().M(0.06, 0.98).L(0.06, 0), 0.06, 0.56), 0.56, 1.06)]],
  n: [0.76, [archTo(s().M(0.08, 0.98).L(0.08, 0), 0.08, 0.7)]],
  o: [0.78, [s().arc(0.38, 0.5, 0.36, 0.5, 100, 468)]],
  p: [0.8, [s().M(0.08, 0.98).L(0.08, -0.72).L(0.09, 0.62).arc(0.42, 0.5, 0.34, 0.5, 160, -165)]],
  q: [0.8, [bowlUp(0.98).L(0.74, -0.72).Q(0.75, -0.72, 0.82, -0.64)]],
  r: [0.54, [s().M(0.08, 0.98).L(0.08, 0).L(0.08, 0.6).Q(0.16, 0.98, 0.42, 1).Q(0.52, 1, 0.56, 0.93)]],
  s: [0.62, [s().M(0.56, 0.86).Q(0.46, 1.02, 0.3, 1).Q(0.07, 0.98, 0.08, 0.76).Q(0.1, 0.56, 0.32, 0.5).Q(0.57, 0.44, 0.57, 0.24).Q(0.55, 0, 0.3, 0).Q(0.1, 0, 0.02, 0.14)]],
  t: [0.54, [s().M(0.24, 1.42).L(0.24, 0.16).Q(0.26, 0, 0.42, 0).Q(0.5, 0, 0.56, 0.07), s().M(0.02, 0.98).L(0.5, 0.99)]],
  u: [0.78, [s().M(0.08, 0.98).L(0.08, 0.36).Q(0.1, 0, 0.38, 0).Q(0.66, 0, 0.7, 0.36).L(0.7, 0.98).L(0.7, 0.1).Q(0.71, 0, 0.8, 0.03)]],
  v: [0.7, [s().M(0.02, 0.98).L(0.35, 0).L(0.68, 0.98)]],
  w: [1.06, [s().M(0.02, 0.98).L(0.26, 0).L(0.52, 0.82).L(0.78, 0).L(1.03, 0.98)]],
  x: [0.68, [s().M(0.04, 0.98).L(0.64, 0), s().M(0.64, 0.98).L(0.04, 0)]],
  y: [0.72, [s().M(0.04, 0.98).L(0.36, 0.06), s().M(0.68, 0.98).L(0.3, -0.48).Q(0.2, -0.74, 0.02, -0.68)]],
  z: [0.66, [s().M(0.04, 0.98).L(0.62, 0.98).L(0.04, 0).L(0.66, 0)]],

  // ── capitals ─────────────────────────────────────────────────────────
  A: [0.9, [s().M(0.02, 0).L(0.45, 1.55).L(0.88, 0), s().M(0.2, 0.6).L(0.7, 0.6)]],
  B: [0.8, [s().M(0.08, 1.55).L(0.08, 0), s().M(0.08, 1.55).Q(0.66, 1.58, 0.64, 1.18).Q(0.62, 0.82, 0.08, 0.8), s().M(0.08, 0.8).Q(0.76, 0.82, 0.74, 0.38).Q(0.72, 0, 0.08, 0)]],
  C: [0.98, [s().arc(0.55, 0.775, 0.5, 0.775, 48, 312)]],
  D: [0.96, [s().M(0.08, 1.55).L(0.08, 0), s().M(0.08, 1.55).Q(0.92, 1.5, 0.92, 0.78).Q(0.92, 0.04, 0.08, 0)]],
  E: [0.74, [s().M(0.7, 1.55).L(0.08, 1.55).L(0.08, 0).L(0.72, 0), s().M(0.08, 0.8).L(0.58, 0.8)]],
  F: [0.72, [s().M(0.7, 1.55).L(0.08, 1.55).L(0.08, 0), s().M(0.08, 0.82).L(0.56, 0.82)]],
  G: [1.06, [s().arc(0.55, 0.775, 0.5, 0.775, 45, 338).L(1.04, 0.72).L(0.66, 0.72)]],
  H: [0.9, [s().M(0.08, 1.55).L(0.08, 0), s().M(0.82, 1.55).L(0.82, 0), s().M(0.08, 0.8).L(0.82, 0.8)]],
  I: [0.6, [s().M(0.06, 1.55).L(0.54, 1.55), s().M(0.3, 1.55).L(0.3, 0), s().M(0.04, 0).L(0.56, 0)]],
  J: [0.8, [s().M(0.2, 1.55).L(0.78, 1.55), s().M(0.55, 1.55).L(0.55, 0.3).Q(0.52, 0, 0.28, 0).Q(0.06, 0, 0.04, 0.28)]],
  K: [0.82, [s().M(0.08, 1.55).L(0.08, 0), s().M(0.76, 1.55).L(0.1, 0.7), s().M(0.32, 0.92).L(0.8, 0)]],
  L: [0.7, [s().M(0.08, 1.55).L(0.08, 0).L(0.66, 0)]],
  M: [1.0, [s().M(0.06, 0).L(0.1, 1.55).L(0.5, 0.45).L(0.9, 1.55).L(0.94, 0)]],
  N: [0.88, [s().M(0.08, 0).L(0.08, 1.55).L(0.8, 0).L(0.8, 1.55)]],
  O: [1.04, [s().arc(0.52, 0.775, 0.5, 0.775, 100, 466)]],
  P: [0.76, [s().M(0.08, 1.55).L(0.08, 0), s().M(0.08, 1.55).Q(0.72, 1.58, 0.7, 1.12).Q(0.68, 0.7, 0.08, 0.7)]],
  Q: [1.06, [s().arc(0.52, 0.775, 0.5, 0.775, 100, 466), s().M(0.6, 0.3).L(1, -0.1)]],
  R: [0.82, [s().M(0.08, 1.55).L(0.08, 0), s().M(0.08, 1.55).Q(0.72, 1.58, 0.7, 1.12).Q(0.68, 0.7, 0.08, 0.7), s().M(0.36, 0.7).L(0.78, 0)]],
  S: [0.8, [s().M(0.74, 1.32).Q(0.62, 1.56, 0.38, 1.55).Q(0.06, 1.52, 0.08, 1.16).Q(0.1, 0.86, 0.42, 0.78).Q(0.76, 0.7, 0.76, 0.38).Q(0.74, 0, 0.38, 0).Q(0.1, 0, 0.02, 0.22)]],
  T: [0.88, [s().M(0.02, 1.55).L(0.86, 1.55), s().M(0.44, 1.55).L(0.44, 0)]],
  U: [0.9, [s().M(0.08, 1.55).L(0.08, 0.42).Q(0.1, 0, 0.44, 0).Q(0.8, 0, 0.82, 0.42).L(0.82, 1.55)]],
  V: [0.84, [s().M(0.02, 1.55).L(0.42, 0).L(0.82, 1.55)]],
  W: [1.24, [s().M(0.02, 1.55).L(0.3, 0).L(0.62, 1.1).L(0.94, 0).L(1.22, 1.55)]],
  X: [0.84, [s().M(0.04, 1.55).L(0.8, 0), s().M(0.8, 1.55).L(0.04, 0)]],
  Y: [0.84, [s().M(0.02, 1.55).L(0.42, 0.8).L(0.82, 1.55), s().M(0.42, 0.8).L(0.42, 0)]],
  Z: [0.84, [s().M(0.06, 1.55).L(0.78, 1.55).L(0.04, 0).L(0.8, 0)]],

  // ── digits ───────────────────────────────────────────────────────────
  0: [0.76, [s().arc(0.38, 0.75, 0.34, 0.75, 100, 466)]],
  1: [0.46, [s().M(0.06, 1.16).L(0.36, 1.5).L(0.36, 0)]],
  2: [0.74, [s().M(0.06, 1.18).Q(0.12, 1.52, 0.4, 1.52).Q(0.7, 1.5, 0.68, 1.18).Q(0.66, 0.9, 0.04, 0).L(0.72, 0)]],
  3: [0.74, [s().M(0.08, 1.36).Q(0.24, 1.54, 0.42, 1.52).Q(0.68, 1.48, 0.66, 1.18).Q(0.64, 0.84, 0.3, 0.8).Q(0.74, 0.78, 0.72, 0.38).Q(0.7, 0, 0.38, 0).Q(0.12, 0, 0.04, 0.2)]],
  4: [0.78, [s().M(0.56, 0).L(0.56, 1.5).L(0.02, 0.42).L(0.76, 0.42)]],
  5: [0.74, [s().M(0.66, 1.5).L(0.14, 1.5).L(0.1, 0.86).Q(0.3, 0.98, 0.42, 0.96).Q(0.72, 0.92, 0.72, 0.48).Q(0.7, 0, 0.36, 0).Q(0.12, 0, 0.04, 0.18)]],
  6: [0.74, [s().M(0.6, 1.46).Q(0.42, 1.54, 0.3, 1.4).Q(0.06, 1.1, 0.06, 0.52).Q(0.08, 0, 0.38, 0).Q(0.7, 0, 0.7, 0.46).Q(0.7, 0.9, 0.38, 0.9).Q(0.12, 0.9, 0.07, 0.6)]],
  7: [0.74, [s().M(0.04, 1.5).L(0.72, 1.5).L(0.28, 0)]],
  8: [0.76, [s().M(0.38, 0.82).Q(0.68, 0.9, 0.66, 1.18).Q(0.64, 1.52, 0.38, 1.52).Q(0.1, 1.52, 0.1, 1.18).Q(0.1, 0.9, 0.38, 0.82).Q(0.74, 0.74, 0.72, 0.38).Q(0.7, 0, 0.38, 0).Q(0.06, 0, 0.05, 0.38).Q(0.04, 0.74, 0.38, 0.82)]],
  9: [0.74, [s().M(0.66, 1.08).Q(0.6, 0.66, 0.36, 0.66).Q(0.06, 0.68, 0.06, 1.08).Q(0.08, 1.5, 0.38, 1.5).Q(0.68, 1.5, 0.66, 1.06).L(0.6, 0)]],

  // ── punctuation and assignment marks ────────────────────────────────
  // Ref 3 punctuation is firm: a full dot, and a comma like a tadpole (a dot
  // with a tail curling down-left), set a little apart from the word.
  '.': [0.3, [dot(0.16, 0.05)]],
  ',': [0.32, [dot(0.19, 0.08), s().M(0.2, 0.1).Q(0.21, -0.08, 0.06, -0.32)]],
  '?': [0.66, [s().M(0.06, 1.28).Q(0.12, 1.54, 0.36, 1.52).Q(0.62, 1.5, 0.6, 1.2).Q(0.58, 0.94, 0.32, 0.82).L(0.32, 0.42), dot(0.32, 0.04)]],
  '!': [0.26, [s().M(0.13, 1.55).L(0.12, 0.42), dot(0.12, 0.04)]],
  ':': [0.3, [dot(0.15, 0.88), dot(0.15, 0.06)]],
  ';': [0.32, [dot(0.18, 0.88), dot(0.19, 0.08), s().M(0.2, 0.1).Q(0.21, -0.08, 0.06, -0.32)]],
  "'": [0.2, [s().M(0.11, 1.62).L(0.09, 1.2)]],
  '’': [0.2, [s().M(0.12, 1.62).Q(0.13, 1.4, 0.05, 1.22)]],
  '‘': [0.2, [s().M(0.12, 1.22).Q(0.04, 1.4, 0.1, 1.62)]],
  '"': [0.38, [s().M(0.09, 1.62).L(0.08, 1.22), s().M(0.28, 1.62).L(0.27, 1.22)]],
  '“': [0.38, [s().M(0.12, 1.22).Q(0.04, 1.4, 0.1, 1.62), s().M(0.31, 1.22).Q(0.23, 1.4, 0.29, 1.62)]],
  '”': [0.38, [s().M(0.12, 1.62).Q(0.13, 1.4, 0.05, 1.22), s().M(0.31, 1.62).Q(0.32, 1.4, 0.24, 1.22)]],
  '-': [0.48, [s().M(0.04, 0.52).L(0.43, 0.54)]],
  '–': [0.7, [s().M(0.04, 0.52).L(0.65, 0.54)]],
  '—': [1.1, [s().M(0.04, 0.52).L(1.05, 0.54)]],
  _: [0.74, [s().M(0, -0.16).L(0.72, -0.15)]],
  '(': [0.42, [s().arc(0.66, 0.64, 0.52, 1.02, 118, 242)]],
  ')': [0.42, [s().arc(-0.24, 0.64, 0.52, 1.02, 62, -62)]],
  '[': [0.36, [s().M(0.3, 1.62).L(0.1, 1.62).L(0.1, -0.32).L(0.3, -0.32)]],
  ']': [0.36, [s().M(0.06, 1.62).L(0.26, 1.62).L(0.26, -0.32).L(0.06, -0.32)]],
  '{': [0.42, [s().M(0.34, 1.62).Q(0.14, 1.6, 0.16, 1.2).Q(0.18, 0.7, 0.04, 0.64).Q(0.18, 0.58, 0.16, 0.1).Q(0.14, -0.32, 0.34, -0.34)]],
  '}': [0.42, [s().M(0.06, 1.62).Q(0.26, 1.6, 0.24, 1.2).Q(0.22, 0.7, 0.36, 0.64).Q(0.22, 0.58, 0.24, 0.1).Q(0.26, -0.32, 0.06, -0.34)]],
  '/': [0.56, [s().M(0.52, 1.62).L(0.02, -0.26)]],
  '\\': [0.56, [s().M(0.02, 1.62).L(0.52, -0.26)]],
  '|': [0.24, [s().M(0.12, 1.62).L(0.12, -0.3)]],
  '%': [0.9, [s().arc(0.2, 1.22, 0.16, 0.24, 90, 450), s().M(0.78, 1.5).L(0.1, 0), s().arc(0.68, 0.3, 0.16, 0.24, 90, 450)]],
  '+': [0.76, [s().M(0.04, 0.6).L(0.72, 0.61), s().M(0.38, 0.96).L(0.37, 0.24)]],
  '=': [0.66, [s().M(0.06, 0.8).L(0.6, 0.81), s().M(0.06, 0.42).L(0.6, 0.43)]],
  '*': [0.56, [s().M(0.28, 1.5).L(0.28, 0.94), s().M(0.04, 1.36).L(0.52, 1.08), s().M(0.52, 1.36).L(0.04, 1.08)]],
  '<': [0.6, [s().M(0.54, 0.96).L(0.06, 0.6).L(0.54, 0.24)]],
  '>': [0.6, [s().M(0.06, 0.96).L(0.54, 0.6).L(0.06, 0.24)]],
  '&': [0.86, [s().M(0.82, 0).L(0.22, 1.08).Q(0.14, 1.5, 0.38, 1.52).Q(0.6, 1.5, 0.56, 1.24).Q(0.52, 1.0, 0.18, 0.72).Q(-0.02, 0.48, 0.12, 0.18).Q(0.3, -0.06, 0.58, 0.14).L(0.8, 0.46)]],
  '#': [0.82, [s().M(0.3, 1.4).L(0.2, 0.1), s().M(0.62, 1.4).L(0.52, 0.1), s().M(0.06, 1.0).L(0.78, 1.0), s().M(0.02, 0.5).L(0.74, 0.5)]],
  '@': [1.1, [s().arc(0.56, 0.62, 0.18, 0.28, 0, 360), s().M(0.74, 0.62).L(0.74, 0.44).Q(0.76, 0.3, 0.88, 0.32).Q(1.04, 0.36, 1.04, 0.66).Q(1.02, 1.2, 0.56, 1.2).Q(0.06, 1.18, 0.06, 0.62).Q(0.08, 0.04, 0.56, 0.04).Q(0.78, 0.04, 0.92, 0.14)]],
  $: [0.7, [s().M(0.62, 1.2).Q(0.5, 1.4, 0.34, 1.38).Q(0.08, 1.34, 0.1, 1.08).Q(0.12, 0.84, 0.36, 0.78).Q(0.62, 0.7, 0.62, 0.44).Q(0.6, 0.16, 0.34, 0.16).Q(0.14, 0.16, 0.04, 0.32), s().M(0.36, 1.6).L(0.34, -0.06)]],
  // A filled dot, as in the reference lists: a small ring, scribbled in.
  '•': [0.5, [s().arc(0.22, 0.52, 0.16, 0.16, 0, 360), s().arc(0.22, 0.52, 0.09, 0.09, 20, 380), dot(0.22, 0.52)]],
  '·': [0.26, [dot(0.13, 0.56)]],
  '→': [1.4, [s().M(0.04, 0.56).Q(0.7, 0.58, 1.32, 0.56), s().M(1.02, 0.86).L(1.34, 0.56).L(1.02, 0.28)]],
  '←': [1.4, [s().M(1.36, 0.56).Q(0.7, 0.58, 0.08, 0.56), s().M(0.38, 0.86).L(0.06, 0.56).L(0.38, 0.28)]],
  '°': [0.36, [s().arc(0.18, 1.4, 0.12, 0.14, 90, 450)]],
  '€': [0.9, [s().arc(0.56, 0.75, 0.42, 0.72, 48, 312), s().M(0.02, 0.92).L(0.6, 0.92), s().M(0.02, 0.6).L(0.56, 0.6)]],
  '£': [0.8, [s().M(0.66, 1.3).Q(0.58, 1.54, 0.4, 1.52).Q(0.2, 1.5, 0.22, 1.2).L(0.24, 0.2).Q(0.2, 0.04, 0.06, 0).L(0.74, 0), s().M(0.04, 0.72).L(0.52, 0.72)]],
  '~': [0.66, [s().M(0.04, 0.5).Q(0.18, 0.72, 0.32, 0.56).Q(0.46, 0.4, 0.62, 0.62)]],
  '^': [0.52, [s().M(0.04, 1.2).L(0.26, 1.55).L(0.48, 1.2)]],
};

/** Body width of the neutral fallback mark (unknown characters). */
const FALLBACK = [0.62, [s().M(0.06, 0).L(0.06, 1.1).L(0.56, 1.1).L(0.56, 0).L(0.06, 0)]];

const tableOf = defs => {
  const table = {};
  for (const [ch, [w, strokes]] of Object.entries(defs)) {
    table[ch] = { w, strokes: strokes.map(st => st.pts) };
  }
  return table;
};

/** Lang1: the print hand of reference 3. */
export const GLYPHS = tableOf(DEFS);
/** Lang2: the joined school hand of reference 1 (glyphsLang2.js). */
export const GLYPHS_LANG2 = tableOf(DEFS_LANG2);
/** Lang3: the upright print hand of reference 3, traced afresh (glyphsLang3.js). */
export const GLYPHS_LANG3 = tableOf(DEFS_LANG3);

/**
 * Glyph sets by name. A set may define only some characters; the rest come
 * from Lang1 (digits, most punctuation and capitals are shared).
 */
export const GLYPH_SETS = {
  lang1: GLYPHS,
  lang2: GLYPHS_LANG2,
  lang3: GLYPHS_LANG3,
};
export const FALLBACK_GLYPH = { w: FALLBACK[0], strokes: FALLBACK[1].map(st => st.pts) };

/**
 * A set's glyph table. Unknown names keep the Lang1 table (as before),
 * except a personal handwriting reference (personal:<id>@<version>): its
 * letters live in the stored profile and are drawn by the personal
 * renderer only, so here it has no glyphs at all — never Lang1's.
 */
const NO_GLYPHS = Object.freeze({});
function tableFor(set) {
  if (GLYPH_SETS[set]) {
    return GLYPH_SETS[set];
  }
  return typeof set === 'string' && set.startsWith('personal:') ? NO_GLYPHS : GLYPHS;
}

/**
 * Horizontal extent of the drawn curves (not their control points): of all
 * the ink, and of the letter's body — the ink above the baseline flicks
 * (y > 0.25), where entry strokes and exit hooks run.
 */
function inkExtent(strokes) {
  const ext = { min: Infinity, max: -Infinity, bodyMin: Infinity, bodyMax: -Infinity };
  const add = (x, y) => {
    ext.min = Math.min(ext.min, x);
    ext.max = Math.max(ext.max, x);
    if (y > 0.25) {
      ext.bodyMin = Math.min(ext.bodyMin, x);
      ext.bodyMax = Math.max(ext.bodyMax, x);
    }
  };
  for (const p of strokes) {
    add(p[0], p[1]);
    for (let i = 2; i + 5 < p.length; i += 6) {
      for (let k = 1; k <= 8; k++) {
        const t = k / 8;
        const u = 1 - t;
        const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
        const at = o => w[0] * p[i - 2 + o] + w[1] * p[i + o] + w[2] * p[i + 2 + o] + w[3] * p[i + 4 + o];
        add(at(0), at(1));
      }
    }
  }
  return ext;
}

/**
 * A form's own advance width: bounded relative to its letter's body width
 * (min ×, + extra; pad: body to advance, as in the glyph table); entry
 * strokes may reach `entry` into the gap before the letter and exit hooks
 * `exit` into the gap after it (the letter gap is 0.2, so neighbouring
 * letters never meet).
 */
export const FORM_WIDTH = { min: 0.85, extra: 0.35, entry: 0.06, exit: 0.04, pad: 0.06 };

/**
 * Letterforms per character, for sets whose reference shows a letter
 * written in more than one way (Lang3: glyphsLang3.js → FORMS_LANG3).
 * Form 0 is the glyph table's own entry. Every other form gets its own
 * natural width from its body (the ink above the baseline flicks), as the
 * hand spaces letters by their bodies: entry strokes and exit hooks run
 * into the space between letters, never further than FORM_WIDTH allows
 * (the form is moved right, or widened, where they would). Weight 0 marks a form that is kept for reference
 * but never chosen. Sets without forms (Lang1, Lang2) have one form per
 * character.
 */
const formsOf = (forms, table) => {
  const out = {};
  for (const [ch, [baseWeight, ...alts]] of Object.entries(forms)) {
    const glyph = table[ch];
    out[ch] = [
      { ...glyph, weight: baseWeight },
      ...alts.map(([weight, built]) => {
        let strokes = built.map(st => st.pts);
        const e = inkExtent(strokes);
        const shift = Math.max(0, 0.02 - e.bodyMin, -FORM_WIDTH.entry - e.min);
        if (shift) {
          strokes = strokes.map(p => p.map((v, i) => (i % 2 ? v : v + shift)));
        }
        const natural = Math.max(
          e.bodyMax + shift + FORM_WIDTH.pad,
          e.max + shift - FORM_WIDTH.exit,
        );
        const w = Math.min(
          glyph.w + FORM_WIDTH.extra,
          Math.max(glyph.w * FORM_WIDTH.min, natural),
        );
        return { w: Math.round(w * 1000) / 1000, weight, strokes };
      }),
    ];
  }
  return out;
};
export const GLYPH_FORMS = {
  lang3: formsOf(FORMS_LANG3, GLYPHS_LANG3),
};

/** A character's forms in a set (accented letters: their base letter's), or null. */
export function glyphForms(char, set = 'lang1') {
  const forms = GLYPH_FORMS[set];
  if (!forms) {
    return null;
  }
  if (forms[char]) {
    return forms[char];
  }
  if (tableFor(set)[char]) {
    return null;
  }
  const base = char.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  return (base && forms[base[0]]) || null;
}

/** Space between letters, x-height units (measured: ≈ 0.17). */
export const LETTER_GAP = 0.18;

/**
 * The glyph for a character: exact match, else the same letter without its
 * accent (é → e), else a neutral mark so nothing is ever silently dropped.
 */
export function glyphFor(char, set = 'lang1') {
  // Each set is complete on its own: a Lang2 page never borrows Lang1
  // strokes (that would switch handwriting mid-page). Accented letters use
  // their base letter from the same set; anything else gets the neutral mark.
  const own = tableFor(set);
  if (own[char]) {
    return own[char];
  }
  const base = char.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  if (base && own[base[0]]) {
    return own[base[0]];
  }
  return FALLBACK_GLYPH;
}

export function hasGlyph(char, set = 'lang1') {
  return !!tableFor(set)[char];
}

/**
 * Advance of a character in x-height units: its body (times the profile's
 * glyph width) plus the profile's letter gap. `form` (sets with several
 * letterforms) selects that form's own width. The renderer uses the same
 * numbers, so measured and drawn lines always agree.
 */
export function glyphAdvance(char, profile, form) {
  const width = (profile && profile.glyphWidth) || 1;
  const gap = profile && profile.letterGap !== undefined ? profile.letterGap : LETTER_GAP;
  const set = profile && profile.glyphSet;
  const forms = form ? glyphForms(char, set) : null;
  const glyph = forms && forms[form] ? forms[form] : glyphFor(char, set);
  return glyph.w * width + gap;
}

/** The widest advance any form of a character can take (long-word breaking). */
export function glyphAdvanceMax(char, profile) {
  const forms = glyphForms(char, profile && profile.glyphSet);
  if (!forms) {
    return glyphAdvance(char, profile);
  }
  return Math.max(...forms.map((_, i) => glyphAdvance(char, profile, i)));
}
