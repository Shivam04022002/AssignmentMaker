/**
 * Pen registry. Later phases (marker, highlighter, custom inks) add entries
 * here; `kind` lets the renderer distinguish writing tools.
 *
 * ink
 *   strength   Multiplier on a style's opacity variation. Ballpoint ink
 *              skips and fades a little more than gel ink.
 *   floor      Lowest opacity any letter may reach (keeps text readable).
 *   bleed      Optional same-colour halo (radius in page units, opacity
 *              0–1). Disabled for ballpoints: compared with real pages it
 *              read as a digital glow. Ballpoint ink is crisp; its weight is
 *              simulated by the renderer's downstroke thickening instead.
 *              Kept for future gel/fountain pens.
 */
export const PENS = [
  {
    id: 'blue',
    label: 'Blue',
    kind: 'ballpoint',
    // Deep ballpoint/gel blue: dark enough to read, clearly not black.
    color: '#123A8C',
    ink: { strength: 1, floor: 0.86, bleed: { radius: 0.9, opacity: 0 } },
  },
  {
    id: 'black',
    label: 'Black',
    kind: 'ballpoint',
    // Soft carbon black rather than #000; reads as ink, not as print.
    color: '#151515',
    ink: { strength: 0.85, floor: 0.88, bleed: { radius: 0.8, opacity: 0 } },
  },
];

export const DEFAULT_PEN = 'blue';

const byId = new Map(PENS.map(pen => [pen.id, pen]));

export function isPen(id) {
  return byId.has(id);
}

export function getPen(id) {
  return byId.get(id) || byId.get(DEFAULT_PEN);
}

export function getPenColor(id) {
  return getPen(id).color;
}

const rgbCache = new Map();

/** '#RRGGBB' → [r, g, b]. */
export function hexToRgb(hex) {
  let rgb = rgbCache.get(hex);
  if (!rgb) {
    const value = String(hex).replace('#', '');
    const full =
      value.length === 3
        ? value
            .split('')
            .map(c => c + c)
            .join('')
        : value;
    rgb = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) || 0);
    rgbCache.set(hex, rgb);
  }
  return rgb;
}

/** The ink colour at a given strength (0–1) as an rgba() string. */
export function inkColor(hex, alpha = 1) {
  if (alpha >= 0.999) {
    return hex;
  }
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${Math.round(alpha * 1000) / 1000})`;
}
