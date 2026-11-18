/**
 * Document formatting: headings, underlines and labels as character ranges
 * over the plain text, which stays the single source of truth.
 *
 *   formatting = {
 *     headings:   [{ start, end, underline }]  paragraphs drawn as headings
 *     underlines: [{ start, end }]             hand-drawn underlines
 *     labels:     [{ start, end }]             extra labels (Q1./Ans:/1. are
 *                                              detected automatically)
 *     spans:      [{ start, end, color?, mode?, size?, spacing? }]
 *                                              handwriting of selected text:
 *                                              ink colour, pen or marker,
 *                                              handwriting size (scale of the
 *                                              reference handwriting) and
 *                                              word spacing — only properties
 *                                              that differ from the defaults
 *     gaps:       [{ start, end, value, left, right }]
 *                                              the space between one exact
 *                                              pair of words ("heads | to")
 *     autoLabels: true                         detect labels from the text
 *   }
 *
 * Ranges are half-open [start, end). When the text changes, ranges are moved
 * with the same minimal patch the undo history uses (utils/textHistory.js),
 * so formatting follows the words it was applied to.
 */
import { diffText } from './textHistory';

export function emptyFormatting() {
  return {
    headings: [],
    underlines: [],
    labels: [],
    spans: [],
    gaps: [],
    autoLabels: true,
  };
}

/** Every kind of range in formatting (moved together through edits/pages). */
export const RANGE_KEYS = ['headings', 'underlines', 'labels', 'spans', 'gaps'];


function cleanRanges(ranges, length, extra) {
  if (!Array.isArray(ranges)) {
    return [];
  }
  return ranges
    .map(r => ({
      start: Math.max(0, Math.min(length, Math.floor(Number(r && r.start)))),
      end: Math.max(0, Math.min(length, Math.floor(Number(r && r.end)))),
      ...(extra ? extra(r) : {}),
    }))
    .filter(
      r =>
        Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start,
    )
    .sort((a, b) => a.start - b.start);
}

/** Merges overlapping/adjacent ranges (same extra fields assumed). */
function mergeRanges(ranges) {
  const out = [];
  for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

/** Validates stored formatting against the text (old documents have none). */
export function normalizeFormatting(formatting, contentLength = Infinity) {
  const f = formatting && typeof formatting === 'object' ? formatting : {};
  const length = Number.isFinite(contentLength) ? contentLength : 1e9;
  return {
    headings: cleanRanges(f.headings, length, r => ({
      underline: !(r && r.underline === false),
    })),
    underlines: mergeRanges(cleanRanges(f.underlines, length)),
    labels: cleanRanges(f.labels, length),
    spans: normalizeSpans(f.spans, length),
    gaps: cleanGaps(f.gaps, length),
    autoLabels: f.autoLabels !== false,
  };
}

/** Moves a range through a text patch { at, removed, inserted }. */
export function mapRange(range, patch) {
  const R = patch.removed.length;
  const I = patch.inserted.length;
  const at = patch.at;
  // Text typed right before or right after a range stays outside it; text
  // typed inside it becomes part of it.
  const start =
    range.start < at
      ? range.start
      : range.start >= at + R
      ? range.start - R + I
      : at + I;
  const end =
    range.end <= at ? range.end : range.end >= at + R ? range.end - R + I : at;
  return end > start ? { ...range, start, end } : null;
}

export function mapFormatting(formatting, patch) {
  if (!formatting || !patch) {
    return formatting;
  }
  const map = list => list.map(r => mapRange(r, patch)).filter(Boolean);
  const out = { ...formatting };
  RANGE_KEYS.forEach(key => {
    out[key] = map(formatting[key] || []);
  });
  return out;
}

/**
 * Formatting after the text changes from `prev` to `next`. Individual word
 * gaps whose word pair was edited away are dropped.
 */
export function reformat(formatting, prev, next) {
  const mapped = mapFormatting(formatting, diffText(prev, next));
  return mapped && mapped.gaps && mapped.gaps.length
    ? { ...mapped, gaps: pruneGaps(mapped.gaps, next) }
    : mapped;
}

/** [start, end) of the paragraph (hard line or page) containing `pos`. */
export function paragraphAt(text, pos) {
  const p = Math.max(0, Math.min(text.length, pos));
  const start =
    Math.max(text.lastIndexOf('\n', p - 1), text.lastIndexOf('\f', p - 1)) + 1;
  const ends = [text.indexOf('\n', p), text.indexOf('\f', p)].filter(
    i => i !== -1,
  );
  return { start, end: ends.length ? Math.min(...ends) : text.length };
}

/** Paragraph ranges touched by a selection. */
function paragraphsIn(text, selection) {
  const first = paragraphAt(text, selection.start);
  const last = paragraphAt(text, Math.max(selection.start, selection.end));
  return { start: first.start, end: Math.max(first.end, last.end) };
}

export function headingAt(formatting, text, pos) {
  const para = paragraphAt(text, pos);
  return (
    (formatting.headings || []).find(
      r => r.start < Math.max(para.end, para.start + 1) && r.end > para.start,
    ) || null
  );
}

/**
 * Cycles the heading state of the selected paragraph(s):
 * none → heading with underline → heading without underline → none.
 */
export function toggleHeading(formatting, text, selection) {
  const f = normalizeFormatting(formatting, text.length);
  const span = paragraphsIn(text, selection);
  if (span.end <= span.start) {
    return f;
  }
  const current = headingAt(f, text, selection.start);
  const others = f.headings.filter(
    r => !(r.start < span.end && r.end > span.start),
  );
  let headings = others;
  if (!current) {
    headings = [...others, { ...span, underline: true }];
  } else if (current.underline) {
    headings = [...others, { ...span, underline: false }];
  }
  return { ...f, headings: headings.sort((a, b) => a.start - b.start) };
}

/** Word around `pos`, for underlining with an empty selection. */
function wordAt(text, pos) {
  let start = pos;
  let end = pos;
  while (start > 0 && !/\s/.test(text[start - 1])) {
    start--;
  }
  while (end < text.length && !/\s/.test(text[end])) {
    end++;
  }
  return { start, end };
}

export function isUnderlined(formatting, start, end) {
  return (formatting.underlines || []).some(
    r => r.start <= start && r.end >= end,
  );
}

/**
 * Underlines the selection (or the word at the cursor); if it is already
 * fully underlined, removes the underline from it instead.
 */
export function toggleUnderline(formatting, text, selection) {
  const f = normalizeFormatting(formatting, text.length);
  const target =
    selection.end > selection.start
      ? { start: selection.start, end: selection.end }
      : wordAt(text, selection.start);
  if (target.end <= target.start) {
    return f;
  }
  if (isUnderlined(f, target.start, target.end)) {
    const underlines = [];
    for (const r of f.underlines) {
      if (r.end <= target.start || r.start >= target.end) {
        underlines.push(r);
        continue;
      }
      if (r.start < target.start) {
        underlines.push({ start: r.start, end: target.start });
      }
      if (r.end > target.end) {
        underlines.push({ start: target.end, end: r.end });
      }
    }
    return { ...f, underlines };
  }
  return { ...f, underlines: mergeRanges([...f.underlines, target]) };
}

// --- Handwriting of selected text -------------------------------------------------
//
// Spans give selected text its own ink colour, pen or marker, handwriting
// size (a scale of the reference handwriting — never another typeface) and
// word spacing. Like every range here they are text offsets, never screen
// positions, so they follow their words through edits, reflow and pages.

/** Defaults: the document's pen colour, pen, 100 %, normal word spacing. */
export const SPAN_DEFAULTS = { color: null, mode: 'pen', size: 1, spacing: 0 };
/** Handwriting sizes (scale of the reference handwriting). */
export const HANDWRITING_SIZES = [0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4];
/**
 * Word spacing steps, −5 … +5. Up from 0 and down to −2 each step is
 * ≈0.35 x-height; −3 … −5 close the rest of the way to a tight but
 * readable gap (≈20 % of the natural one) — see textLayout gapAfter.
 */
export const WORD_SPACING_STEPS = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
export const SPAN_MODES = ['pen', 'marker'];

const HEX = /^#[0-9a-f]{6}$/i;
const closest = (list, v) =>
  list.reduce((b, x) => (Math.abs(x - v) < Math.abs(b - v) ? x : b), list[0]);

/** A span's properties, validated (unknown values fall back to defaults). */
export function spanProps(r) {
  const color =
    r && typeof r.color === 'string' && HEX.test(r.color)
      ? r.color.toUpperCase()
      : null;
  const mode = r && SPAN_MODES.includes(r.mode) ? r.mode : 'pen';
  const size =
    r && r.size !== undefined && Number.isFinite(Number(r.size))
      ? closest(HANDWRITING_SIZES, Number(r.size))
      : 1;
  const spacing =
    r && r.spacing !== undefined && Number.isFinite(Number(r.spacing))
      ? closest(WORD_SPACING_STEPS, Number(r.spacing))
      : 0;
  return { color, mode, size, spacing };
}

const isDefaultProps = p =>
  p.color === null && p.mode === 'pen' && p.size === 1 && p.spacing === 0;
const propsKey = p => `${p.color}|${p.mode}|${p.size}|${p.spacing}`;

/** Only the properties that differ from the defaults (compact storage). */
function compact(p) {
  const out = {};
  if (p.color !== null) out.color = p.color;
  if (p.mode !== 'pen') out.mode = p.mode;
  if (p.size !== 1) out.size = p.size;
  if (p.spacing !== 0) out.spacing = p.spacing;
  return out;
}

/**
 * Non-overlapping, sorted spans: overlaps resolved (the later span wins),
 * neighbours with identical properties merged, default-only spans dropped.
 */
export function normalizeSpans(list, length = Infinity) {
  const len = Number.isFinite(length) ? length : 1e9;
  if (!Array.isArray(list) || !list.length) {
    return [];
  }
  // Keep each span's properties and its order (later wins on overlap).
  const ranges = list
    .map((r, order) => ({
      start: Math.max(0, Math.min(len, Math.floor(Number(r && r.start)))),
      end: Math.max(0, Math.min(len, Math.floor(Number(r && r.end)))),
      props: spanProps(r),
      order,
    }))
    .filter(r => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start);
  const cuts = Array.from(new Set(ranges.flatMap(r => [r.start, r.end]))).sort(
    (a, b) => a - b,
  );
  const out = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const start = cuts[i];
    const end = cuts[i + 1];
    let props = null;
    let order = -1;
    for (const r of ranges) {
      if (r.start <= start && r.end >= end && r.order > order) {
        props = r.props;
        order = r.order;
      }
    }
    if (!props || isDefaultProps(props)) {
      continue;
    }
    const last = out[out.length - 1];
    if (last && last.end === start && propsKey(spanProps(last)) === propsKey(props)) {
      last.end = end;
    } else {
      out.push({ start, end, ...compact(props) });
    }
  }
  return out;
}

/** Properties at text offset `pos` (defaults where no span applies). */
export function spanAt(formatting, pos) {
  for (const r of (formatting && formatting.spans) || []) {
    if (r.start <= pos && r.end > pos) {
      return spanProps(r);
    }
  }
  return { ...SPAN_DEFAULTS };
}

/**
 * Applies handwriting properties to a selection (or the word at the cursor):
 * `patch` is any of { color, mode, size, spacing }, or 'reset' for the
 * defaults. Only the selected characters change; their other properties
 * stay as they were.
 */
export function applySpanFormat(formatting, text, selection, patch) {
  const f = normalizeFormatting(formatting, text.length);
  const target =
    selection.end > selection.start
      ? { start: selection.start, end: selection.end }
      : wordAt(text, selection.start);
  if (target.end <= target.start) {
    return f;
  }
  // Keep what lies outside the selection.
  const pieces = [];
  for (const r of f.spans) {
    if (r.end <= target.start || r.start >= target.end) {
      pieces.push(r);
      continue;
    }
    if (r.start < target.start) pieces.push({ ...r, end: target.start });
    if (r.end > target.end) pieces.push({ ...r, start: target.end });
  }
  // Restyle the inside, segment by segment (it may cross styled text).
  const cuts = Array.from(
    new Set([
      target.start,
      target.end,
      ...f.spans.flatMap(r => [r.start, r.end]).filter(c => c > target.start && c < target.end),
    ]),
  ).sort((a, b) => a - b);
  for (let i = 0; i < cuts.length - 1; i++) {
    const props =
      patch === 'reset'
        ? { ...SPAN_DEFAULTS }
        : spanProps({ ...spanAt(f, cuts[i]), ...patch });
    pieces.push({ start: cuts[i], end: cuts[i + 1], ...props });
  }
  return { ...f, spans: normalizeSpans(pieces, text.length) };
}

/**
 * What the toolbar shows for a selection: each property's value, or
 * undefined where the selected characters differ.
 */
export function selectionFormat(formatting, text, selection) {
  const target =
    selection.end > selection.start ? selection : wordAt(text, selection.start);
  const seen = {
    color: new Set(),
    mode: new Set(),
    size: new Set(),
    spacing: new Set(),
  };
  const end = Math.max(target.end, target.start + 1);
  for (let i = target.start; i < end; i++) {
    // Spaces count only for word spacing.
    const p = spanAt(formatting, i);
    if (!(i < text.length && /\s/.test(text[i]))) {
      seen.color.add(p.color);
      seen.mode.add(p.mode);
      seen.size.add(p.size);
    }
    seen.spacing.add(p.spacing);
  }
  const one = set => (set.size === 1 ? [...set][0] : undefined);
  return {
    color: seen.color.size ? one(seen.color) : SPAN_DEFAULTS.color,
    mode: seen.mode.size ? one(seen.mode) : SPAN_DEFAULTS.mode,
    size: seen.size.size ? one(seen.size) : SPAN_DEFAULTS.size,
    spacing: one(seen.spacing),
  };
}

// --- Individual word gaps -------------------------------------------------------
//
// The space between ONE pair of adjacent words, e.g. "heads | to":
//   gaps: [{ start, end, value, left, right }]
// start..end covers the left word, the space and the right word; left and
// right are the two words as typed. The range moves with the text like any
// other; a gap applies only while that exact pair is still there — if
// either word is changed or deleted, or a word is typed between them, it is
// dropped (pruneGaps), so it never lands on unrelated words.
//
// Precedence: an individual gap replaces the general word spacing (spans)
// for its boundary. Values are steps of ≈0.35 x-height, like spans.

const GAP_PAIR = /^(\S+)(\s+)(\S+)$/;

/** The word boundaries a selection (or the cursor) touches. */
export function boundariesIn(text, selection) {
  const words = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(text))) {
    words.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
  }
  const out = [];
  const a = Math.min(selection.start, selection.end);
  const b = Math.max(selection.start, selection.end);
  for (let i = 0; i < words.length - 1; i++) {
    const L = words[i];
    const R = words[i + 1];
    const between = text.slice(L.end, R.start);
    // Words on different lines or pages have no gap between them.
    if (/[\n\f]/.test(between)) continue;
    const touches =
      a === b
        ? a >= L.end && a <= R.start // cursor in (or at the edge of) the space
        : a <= L.end && b >= R.start; // the selection covers the space
    if (touches) {
      out.push({ start: L.start, end: R.end, left: L.text, right: R.text, at: L.end });
    }
  }
  return out;
}

/** Gaps whose word pair is still exactly in the text; the rest are dropped. */
export function pruneGaps(gaps, text) {
  const edge = i => i < 0 || i >= text.length || /\s/.test(text[i]);
  return (gaps || []).filter(g => {
    const m = GAP_PAIR.exec(text.slice(g.start, g.end));
    return (
      !!m &&
      m[1] === g.left &&
      m[3] === g.right &&
      !/[\n\f]/.test(m[2]) &&
      // Whole words: "to" must not have become "toward".
      edge(g.start - 1) &&
      edge(g.end)
    );
  });
}

/** The individual gap value at a boundary (0 when none). */
export function gapAt(formatting, boundary) {
  const g = ((formatting && formatting.gaps) || []).find(
    x => x.start === boundary.start && x.end === boundary.end,
  );
  return g ? g.value : 0;
}

/** Sets (value ≠ 0) or removes (0) the individual gap at one boundary. */
export function setWordGap(formatting, text, boundary, value) {
  const f = normalizeFormatting(formatting, text.length);
  const v = closest(WORD_SPACING_STEPS, Number(value) || 0);
  const others = f.gaps.filter(g => !(g.start === boundary.start && g.end === boundary.end));
  const gaps = v
    ? [...others, { start: boundary.start, end: boundary.end, value: v, left: boundary.left, right: boundary.right }]
    : others;
  return { ...f, gaps: pruneGaps(gaps, text).sort((x, y) => x.start - y.start) };
}

function cleanGaps(list, length) {
  if (!Array.isArray(list)) {
    return [];
  }
  return list
    .filter(g => g && typeof g.left === 'string' && typeof g.right === 'string')
    .map(g => ({
      start: Math.floor(Number(g.start)),
      end: Math.floor(Number(g.end)),
      value: closest(WORD_SPACING_STEPS, Number(g.value) || 0),
      left: g.left,
      right: g.right,
    }))
    .filter(
      g =>
        Number.isFinite(g.start) &&
        Number.isFinite(g.end) &&
        g.start >= 0 &&
        g.end <= length &&
        g.end > g.start &&
        g.value !== 0,
    )
    .sort((a, b) => a.start - b.start);
}

export function formattingEquals(a, b) {
  return (
    JSON.stringify(a || emptyFormatting()) ===
    JSON.stringify(b || emptyFormatting())
  );
}
