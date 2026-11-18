/**
 * Orientation of the writing in a sample photo (Phase 9). The photo is
 * never turned automatically: a sideways or upside-down sample is rejected
 * with advice on how to turn it (or retake it).
 *
 * Sideways — letters and words sit next to their neighbours along the line,
 * so in upright writing most nearest-neighbour links between ink pieces run
 * across the photo; in a photo turned on its side they run up and down. Each
 * piece links to its nearest piece (gap between bounding boxes); dots and
 * marks (i, j, anusvara, matras) — which sit above or below their letters —
 * take no part.
 *
 * Upside down — a photo turned by half looks like ordinary writing (lines
 * still run across), and no reading of letter shapes without the text is
 * reliable enough on real handwriting (ascender / descender balance was
 * tried and failed on the reference pages). With the sample's known text,
 * analyzeSample aligns the writing as it is and turned by half (turnMask)
 * and reports 'upside-down' only when the turned writing matches the text
 * clearly better. The same comparison, a quarter each way, tells a
 * sideways photo's direction.
 *
 * Every verdict needs a margin and enough writing; anything else is
 * 'unknown' and changes nothing.
 */

export const ORIENTATION = {
  MIN_LINKS: 4, // weighted links needed for a verdict (a Devanagari word is one piece: few links)
  ACROSS_UPRIGHT: 0.6, // share of link weight running across: lines across at or above
  ACROSS_SIDEWAYS: 0.35, // … sideways at or below
  ELONGATED: 8, // length / thickness of a piece that is a line, not a letter or word
  LONG_PIECE: 0.3, // pieces longer than this share of the photo's longer side are not writing (rules, margins, edges)
  TURNED_MIN_UNITS: 6, // a turned photo must align at least this many units …
  TURNED_RATIO: 2, // … and this many times (plus 2) as many as the other way
  SKIP_TURN_CHECK: 0.6, // share of expected units aligned as it is: no half-turn check needed
};

const r3 = v => Math.round(v * 1000) / 1000;

/** 8-connected ink pieces: [{ x0, y0, x1, y1, area }]. */
function pieces(mask, w, h) {
  const label = new Int32Array(w * h).fill(-1);
  const stack = new Int32Array(w * h);
  const out = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || label[s] >= 0) continue;
    const id = out.length;
    const p = { x0: w, y0: h, x1: -1, y1: -1, area: 0 };
    let top = 0;
    stack[top++] = s;
    label[s] = id;
    while (top) {
      const i = stack[--top];
      p.area++;
      const x = i % w;
      const y = (i - x) / w;
      if (x < p.x0) p.x0 = x;
      if (x > p.x1) p.x1 = x;
      if (y < p.y0) p.y0 = y;
      if (y > p.y1) p.y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const j = yy * w + xx;
          if (mask[j] && label[j] < 0) {
            label[j] = id;
            stack[top++] = j;
          }
        }
      }
    }
    out.push(p);
  }
  return out;
}

/** Nearest-neighbour link directions: { across, along, links, pieces }. */
export function linkDirections(mask, w, h) {
  const T = ORIENTATION;
  const long = T.LONG_PIECE * Math.max(w, h);
  // Long or line-like pieces (rules, underlines, a stem on its own) say
  // nothing about where the neighbours are; either way round alike.
  const ps = pieces(mask, w, h).filter(p => {
    const a = p.x1 - p.x0 + 1;
    const b = p.y1 - p.y0 + 1;
    return p.area >= 4 && Math.max(a, b) <= long && Math.max(a, b) <= T.ELONGATED * Math.min(a, b);
  });
  if (ps.length < 3) return { across: 0, along: 0, links: 0, pieces: ps.length };
  // Typical piece: the ink-weighted median size (half the ink lies in
  // pieces at least this big), so specks and marks do not set it.
  const bySize = ps.map(p => [Math.max(p.x1 - p.x0, p.y1 - p.y0) + 1, p.area]).sort((a, b) => a[0] - b[0]);
  const totalInk = bySize.reduce((t, [, a]) => t + a, 0);
  let acc = 0;
  let s = bySize[bySize.length - 1][0];
  for (const [size, a] of bySize) {
    acc += a;
    if (acc >= totalInk / 2) {
      s = size;
      break;
    }
  }
  const reach = 3 * s;
  // Dots and marks (under half the typical size) neither link nor are
  // linked to: a Devanagari word's nearest piece is often its own mark.
  const linkable = ps.map(p => Math.max(p.x1 - p.x0, p.y1 - p.y0) + 1 >= s / 2);
  // Buckets of `reach` px for the neighbour search.
  const cell = Math.max(1, reach);
  const gw = Math.ceil(w / cell);
  const buckets = new Map();
  ps.forEach((p, k) => {
    for (let by = Math.floor(p.y0 / cell); by <= Math.floor(p.y1 / cell); by++) {
      for (let bx = Math.floor(p.x0 / cell); bx <= Math.floor(p.x1 / cell); bx++) {
        const key = by * gw + bx;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(k);
      }
    }
  });
  let across = 0;
  let along = 0;
  let links = 0;
  ps.forEach((p, k) => {
    if (!linkable[k]) return;
    let best = -1;
    let bestD = Infinity;
    const seen = new Set();
    for (let by = Math.floor((p.y0 - reach) / cell); by <= Math.floor((p.y1 + reach) / cell); by++) {
      for (let bx = Math.floor((p.x0 - reach) / cell); bx <= Math.floor((p.x1 + reach) / cell); bx++) {
        const list = buckets.get(by * gw + bx);
        if (!list) continue;
        for (const j of list) {
          if (j === k || seen.has(j) || !linkable[j]) continue;
          seen.add(j);
          const q = ps[j];
          const gx = Math.max(0, Math.max(p.x0, q.x0) - Math.min(p.x1, q.x1));
          const gy = Math.max(0, Math.max(p.y0, q.y0) - Math.min(p.y1, q.y1));
          const d = Math.hypot(gx, gy);
          if (d < bestD) {
            bestD = d;
            best = j;
          }
        }
      }
    }
    if (best < 0 || bestD > reach) return;
    const q = ps[best];
    const dx = Math.abs((p.x0 + p.x1) / 2 - (q.x0 + q.x1) / 2);
    const dy = Math.abs((p.y0 + p.y1) / 2 - (q.y0 + q.y1) / 2);
    if (dx === dy) return;
    // Weighted by the smaller piece's size: letters count more than fragments.
    const size = Math.min(Math.max(p.x1 - p.x0, p.y1 - p.y0), Math.max(q.x1 - q.x0, q.y1 - q.y0)) + 1;
    const weight = Math.min(1, size / s);
    if (dx > dy) across += weight;
    else along += weight;
    links += weight;
  });
  return { across: r3(across), along: r3(along), links: r3(links), pieces: ps.length };
}

/**
 * The mask turned: 'clockwise' / 'anticlockwise' (a quarter) or 'half'.
 * Returns { mask, width, height }.
 */
export function turnMask(mask, w, h, turn) {
  const out = new Uint8Array(w * h);
  if (turn === 'half') {
    for (let i = 0; i < w * h; i++) out[w * h - 1 - i] = mask[i];
    return { mask: out, width: w, height: h };
  }
  // Clockwise: (x, y) → (h − 1 − y, x) in an h × w image.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      if (turn === 'clockwise') out[x * h + (h - 1 - y)] = 1;
      else out[(w - 1 - x) * h + y] = 1;
    }
  }
  return { mask: out, width: h, height: w };
}

/**
 * Which turn of the photo makes the writing match its text: given the
 * aligned-unit counts per turn ({ none?, clockwise?, … }), the best turn
 * when it is clearly better than every other, else null.
 */
export function clearTurn(counts) {
  const T = ORIENTATION;
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return null;
  const [best, n] = entries[0];
  if (n < T.TURNED_MIN_UNITS) return null;
  return entries.slice(1).every(([, m]) => n >= T.TURNED_RATIO * m + 2) ? best : null;
}

/**
 * Direction of the writing's lines in a text mask (from links alone).
 * Returns { status: 'across' | 'sideways' | 'unknown', metrics }.
 */
export function detectOrientation(mask, w, h) {
  const T = ORIENTATION;
  const links = linkDirections(mask, w, h);
  const metrics = { links };
  if (links.links < T.MIN_LINKS) return { status: 'unknown', metrics };
  const acrossShare = links.across / links.links;
  metrics.acrossShare = r3(acrossShare);
  if (acrossShare <= T.ACROSS_SIDEWAYS) return { status: 'sideways', metrics };
  if (acrossShare >= T.ACROSS_UPRIGHT) return { status: 'across', metrics };
  return { status: 'unknown', metrics };
}
