/**
 * Pure text → handwriting layout model.
 *
 *   raw text ──► paragraphs ──► tokens ──► measured word shapes
 *            ──► deterministic line breaking ──► lines of placed words
 *
 * Nothing here touches React, so the same model drives the on-screen
 * renderer today and PDF/PNG exporters later.
 *
 * Line breaking is done here, not by the platform, using the advance widths
 * of the reference glyph set (handwriting/glyphs.js) — exactly what the
 * glyph renderer draws. The page is laid out
 * in fixed logical units, so the same text wraps identically on every device.
 *
 * Determinism: each word's irregularity is seeded from
 *   document id · page id · text position · (character index)
 * where the text position is the word plus how many times it has occurred
 * before. Typing elsewhere therefore does not re-jitter a word, repeated
 * words ("letter letter letter") each get their own shape, and a saved
 * document looks exactly the same every time it is opened.
 */
import {
  CORRECTION_SETTINGS,
  planCorrection,
  wordCount,
} from '../handwriting/corrections';
import { glyphAdvance, glyphAdvanceMax } from '../handwriting/glyphs';
import { ATTEMPT_SALT, wordForms } from '../handwriting/strokeModel';
import { XH_EM } from '../handwriting/handwritingProfiles';
import { PAGE } from '../data/paper';
import { MAX_INK_EXTENT_LINES } from '../data/handwritingStyles';
import {
  correlated,
  createRandom,
  fade,
  hashString,
  mixSeed,
  randomFor,
  round,
  softSpread,
  spread,
} from './variation';

export { createRandom, hashString };

export const DEFAULT_PAGE_ID = 'page-1';
const TAB_SPACES = 4;

// Punctuation that must stay on the line of the word before it, or after it.
const CLOSING = /^[.,;:!?…%)\]}»”’"'\-–—]+$/;
const OPENING = /^[([{«“‘]+$/;
// Characters after which a long word may break without a hyphen.
const SOFT_BREAK = /[-–—/\\_.@:?&=+,]/;
const LETTER = /[\p{L}\p{N}]/u;

// --- Text structure ---------------------------------------------------------

/**
 * Splits text into paragraphs (hard line breaks). Always ≥ 1 paragraph.
 * A page break (\f) also ends a paragraph; page-aware callers split sheets
 * first (utils/pagination.js).
 */
export function splitParagraphs(content) {
  return String(content ?? '')
    .replace(/\r\n?/g, '\n')
    .split(/[\n\f]/);
}

/**
 * Splits a paragraph into words. Leading whitespace becomes an indent
 * (measured in spaces; a tab counts as four).
 */
export function tokenizeParagraph(paragraph) {
  const { indent, tokens } = tokenizeWithSpacing(paragraph);
  return { indent, words: tokens.map(t => t.text) };
}

/**
 * Like tokenizeParagraph, but keeps how many spaces follow each word and
 * marks punctuation that must not start (or end) a line on its own.
 */
export function tokenizeWithSpacing(paragraph) {
  const leading = paragraph.match(/^[ \t]*/)[0];
  const indent = leading.replace(/\t/g, ' '.repeat(TAB_SPACES)).length;
  const tokens = [];
  const re = /([^ \t]+)([ \t]*)/g;
  let match;
  re.lastIndex = leading.length;
  while ((match = re.exec(paragraph))) {
    tokens.push({
      text: match[1],
      // Offsets within the paragraph, for formatting ranges.
      start: match.index,
      end: match.index + match[1].length,
      spaces: match[2].replace(/\t/g, ' '.repeat(TAB_SPACES)).length,
      glueBefore: CLOSING.test(match[1]),
      glueAfter: OPENING.test(match[1]),
    });
  }
  return { indent, tokens };
}

/** Breaks a word longer than `maxChars` into chunks (character count). */
export function splitLongWord(word, maxChars) {
  const limit = Math.max(1, Math.floor(maxChars));
  const chars = Array.from(word);
  if (chars.length <= limit) {
    return [word];
  }
  const chunks = [];
  for (let i = 0; i < chars.length; i += limit) {
    chunks.push(chars.slice(i, i + limit).join(''));
  }
  return chunks;
}

// --- Measurement ------------------------------------------------------------

/**
 * Returns charWidth(char, form?) in px at glyph size `size`, from the
 * reference glyph set: each glyph's advance (body + letter gap), x-height
 * units — of the given letterform where the set has several. Exactly what
 * the glyph renderer draws, so line breaks are exact.
 */
export function createMeasurer(style, size) {
  const unit = size * XH_EM;
  const profile = style && typeof style === 'object' ? style : null;
  return (char, form) => glyphAdvance(char, profile, form) * unit;
}

/** charWidth(char) of the widest form of each character (px). */
export function createMaxMeasurer(style, size) {
  const unit = size * XH_EM;
  const profile = style && typeof style === 'object' ? style : null;
  return char => glyphAdvanceMax(char, profile) * unit;
}

/**
 * Splits a word that is wider than a line into pieces that fit.
 * Prefers natural break points (after "-", "/", "_", "." …); otherwise
 * breaks between letters and adds a hyphen.
 *
 * @param {string}   word
 * @param {function} measure     char → px (letter spacing included)
 * @param {number}   firstWidth  room left on the current line
 * @param {number}   lineWidth   room on a full line
 */
export function breakLongWord(word, measure, firstWidth, lineWidth) {
  const chars = Array.from(word);
  const hyphen = measure('-');
  const widthOf = (from, to) => {
    let w = 0;
    for (let i = from; i < to; i++) {
      w += measure(chars[i]);
    }
    return w;
  };
  const pieces = [];
  let start = 0;
  let room = firstWidth;

  while (start < chars.length) {
    let width = 0;
    let end = start;
    while (end < chars.length && width + measure(chars[end]) <= room) {
      width += measure(chars[end]);
      end++;
    }
    if (end === chars.length) {
      pieces.push(chars.slice(start).join(''));
      break;
    }
    if (end === start) {
      end = start + 1; // a single glyph wider than the line: never loop
    }
    // Back up to a natural break point in the latter part of the piece.
    let cut = end;
    for (let i = end - 1; i > start + (end - start) * 0.4; i--) {
      if (SOFT_BREAK.test(chars[i])) {
        cut = i + 1;
        break;
      }
    }
    let piece = chars.slice(start, cut).join('');
    if (cut === end && LETTER.test(chars[cut - 1]) && LETTER.test(chars[cut])) {
      // Make room for the hyphen.
      while (cut - 1 > start && widthOf(start, cut) + hyphen > room) {
        cut--;
      }
      piece = `${chars.slice(start, cut).join('')}-`;
    }
    pieces.push(piece);
    start = cut;
    room = lineWidth;
  }
  return pieces;
}

// --- Labels, headings, underlines --------------------------------------------

/**
 * Labels that start a paragraph in school writing: "Q1.", "Q.2", "Ans:",
 * "1.", "2)", "(a)", "iv.", "•", "-". Returns { count, kind } where count is
 * how many leading tokens form the label (e.g. "Ans" + ":"), or null.
 */
const LABEL_PATTERNS = [
  {
    kind: 'question',
    re: /^(Q|Que|Ques)\.?\s?\d{0,3}[.:)]?$/i,
    needsDigit: true,
  },
  // "Ans" may stand alone; whole words need a colon ("Answer the question"
  // is a sentence, "Answer:" is a label).
  { kind: 'answer', re: /^(Ans\.?[:.-]?|(Answer|Sol|Solution)[:.-])$/i },
  { kind: 'number', re: /^\(?\d{1,3}[.)]$/ },
  { kind: 'number', re: /^\(?[a-z][.)]$/i },
  { kind: 'number', re: /^\(?(i|ii|iii|iv|v|vi|vii|viii|ix|x)[.)]$/i },
  { kind: 'bullet', re: /^[•\-–*]$/ },
];

export function detectLabel(tokens) {
  if (!tokens.length) {
    return null;
  }
  const first = tokens[0].text;
  for (const pattern of LABEL_PATTERNS) {
    if (pattern.re.test(first) && (!pattern.needsDigit || /\d/.test(first))) {
      // "Ans :" / "Q1 ." — a detached colon or full stop belongs to the label.
      const count = tokens[1] && /^[:.)-]$/.test(tokens[1].text) ? 2 : 1;
      return { count, kind: pattern.kind };
    }
  }
  return null;
}

const overlaps = (ranges, start, end) =>
  ranges.find(r => r.start < end && r.end > start) || null;

/**
 * Hand-drawn underline geometry between x1 and x2 (content coordinates):
 * a few points with a slight wave, tilt and uneven thickness, starting a
 * hair early and overshooting a little — never a ruler-straight line.
 * y is relative to the underline's resting position (+ = down).
 */
export function buildUnderline(seedKey, x1, x2, unit, weight = 1) {
  const r = createRandom(hashString(`underline|${seedKey}`));
  const start = x1 - (0.02 + r() * 0.06) * unit;
  const end = x2 + (0.04 + r() * 0.16) * unit;
  const length = Math.max(1, end - start);
  const steps = Math.max(2, Math.round(length / (0.6 * unit)));
  const tilt = spread(r, 0.035) * unit; // total rise/fall over the length
  const phase = r() * Math.PI * 2;
  const amplitude = (0.012 + r() * 0.014) * unit;
  const base = (0.05 + r() * 0.012) * unit * weight;
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push({
      x: round(start + t * length),
      y: round(
        tilt * (t - 0.5) + amplitude * Math.sin(phase + t * Math.PI * 2.2),
      ),
      // Firmer in the middle, lighter where the pen lands and lifts.
      thickness: round(
        base * (0.75 + 0.35 * Math.sin(Math.PI * t) + spread(r, 0.08)),
      ),
    });
  }
  return { key: seedKey, x1: round(start), x2: round(end), points };
}

// --- Shapes -----------------------------------------------------------------

/**
 * A word's position-independent shape: its own tilt, size, ink, stroke
 * weight and per-letter shape irregularities. Pure function of (seed key,
 * text, style, size, emphasis), so it can be cached while typing elsewhere.
 *
 * Realism model (all deterministic, all tiny):
 *   word    tilt, rise/fall, size, horizontal stretch, lean, tracking, ink
 *   letter  width, height, lean, rise/fall, sideways shift, gap, tilt, ink
 *   ink     pressure fades slightly along the word; stroke weight varies
 */
function buildWordShape(
  key,
  text,
  style,
  ctx,
  fixedLetterSpacing,
  correction,
  charFormat,
) {
  const v = style.variation;
  const cv = style.charVariation;
  const ink = style.ink || { weight: 0, weightVariation: 0, trend: 0 };
  const strength = style.inkStrength ?? 1;
  const { size, unit, seedPrefix, measureGlyph, emphasis } = ctx;
  // Seed = document id · page id · style · text position (word#occurrence).
  const wordSeed = hashString(`${seedPrefix}|${key}`);
  const random = createRandom(wordSeed);

  const drawnSpacing =
    (style.letterSpacing + spread(random, v.letterSpacing)) * size;
  // Pieces of a split word keep the whole word's spacing, so they are exactly
  // as wide as the line breaker measured them.
  const letterSpacing = fixedLetterSpacing ?? drawnSpacing;
  // Pieces keep exact measured advances (no stretch or gap jitter) so they
  // never exceed the room breakLongWord gave them.
  const isPiece = fixedLetterSpacing !== undefined;
  const shape = {
    key,
    // Seed of the stroke details (document · page · style · position).
    seed: wordSeed,
    text,
    translateY: round(softSpread(random, v.vertical) * unit),
    rotate: round(softSpread(random, v.rotation)),
    scale: round(1 + softSpread(random, v.scale)),
    slant: round(style.slant + spread(random, v.slant)),
    letterSpacing: round(letterSpacing),
    opacity: round(
      Math.max(
        emphasis > 1 ? 0.95 : 0.9,
        1 - fade(random, v.opacity) * strength,
      ),
    ),
    gapJitter: round(spread(random, v.spacing) * unit),
    scaleX: isPiece ? 1 : round(1 + softSpread(random, v.width || 0)),
    // Stroke weight in px: how far the downstroke-thickening copy is offset.
    weight: round(
      ink.weight * size * emphasis * (1 + spread(random, ink.weightVariation)),
    ),
    width: 0,
  };

  const chars = Array.from(text);
  // Letterforms (sets with several forms of a letter): chosen here, from the
  // word's seed, so the word is measured with the forms the renderer draws.
  const forms = wordForms(chars, wordSeed, style.glyphSet);
  if (forms) {
    shape.forms = forms;
  }
  const shapesLetters =
    !style.connected &&
    (cv.rotation > 0 ||
      cv.vertical > 0 ||
      cv.scale > 0 ||
      cv.width > 0 ||
      cv.height > 0 ||
      cv.slant > 0);
  const variesInk = cv.opacity > 0 || ink.trend > 0;
  const n = chars.length;

  // Letter variation as correlated sequences along the word.
  const rho = cv.correlation ?? 0;
  const seq = createRandom(mixSeed(wordSeed, 0xc0de));
  const seqOf = amount => correlated(seq, n, amount, rho);
  const lv = shapesLetters
    ? {
        vertical: seqOf(cv.vertical),
        rotate: seqOf(cv.rotation),
        scale: seqOf(cv.scale),
        width: seqOf(cv.width || 0),
        height: seqOf(cv.height || 0),
        slant: seqOf(cv.slant || 0),
        spacing: seqOf(cv.spacing || 0),
      }
    : null;

  let width = 0;
  const built = chars.map((char, index) => {
    // … · character index.
    const r = createRandom(mixSeed(wordSeed, index));
    // Handwriting of selected text: this letter's size, colour and pen.
    const fmt = charFormat ? charFormat[index] : null;
    const sized = fmt && fmt.size !== 1 ? fmt.size : 1;
    const advance = measureGlyph(char, forms ? forms[index] : undefined) * sized;
    const c = { key: String(index), char };
    if (fmt) {
      if (sized !== 1) c.size = sized;
      if (fmt.color) c.color = fmt.color;
      if (fmt.mode !== 'pen') c.mode = fmt.mode;
    }
    let extra = 0;
    if (shapesLetters) {
      c.translateY = round(lv.vertical[index] * unit);
      c.rotate = round(lv.rotate[index]);
      c.scale = round(1 + lv.scale[index]);
      c.scaleX = round(1 + lv.width[index]);
      c.scaleY = round(1 + lv.height[index]);
      c.slant = round(lv.slant[index]);
      c.shift = round(softSpread(r, cv.shift || 0) * unit);
      // A wider letter takes a little more room; spacing has its own rhythm.
      const jitter = lv.spacing[index] * unit;
      extra = isPiece ? 0 : advance * (c.scaleX - 1) + jitter;
      c.gap = letterSpacing + extra;
      c.extra = extra;
    }
    if (variesInk) {
      // Ballpoint pressure: steady with tiny per-letter changes, thinning a
      // little towards the end of the word.
      const along = n > 1 ? index / (n - 1) : 0;
      c.opacity = round(
        Math.max(
          0.88,
          1 - fade(r, cv.opacity) * strength - ink.trend * along * strength,
        ),
      );
      c.weight = round(shape.weight * (1 + spread(r, 0.25)));
    }
    if (style.alternates.length) {
      // -1 = the default glyph, otherwise an index into style.alternates.
      c.variant = Math.floor(r() * (style.alternates.length + 1)) - 1;
    }
    width += advance + letterSpacing + extra;
    return c;
  });
  // The letter rhythm (wider/narrower letters, tighter/looser gaps) evens
  // out within the word: the word keeps its measured width, so line breaks
  // never depend on letter-level jitter.
  if (shapesLetters) {
    const mean = built.reduce((t, c) => t + c.extra, 0) / Math.max(1, n);
    built.forEach(c => {
      c.gap = round(c.gap - mean);
      delete c.extra;
    });
    width -= mean * n;
  }

  shape.width = round(Math.max(0, width) * shape.scaleX);
  if (correction) {
    shape.correction = correction;
    if (correction.kind === 'crossed') {
      // The crossed-out attempt is written first, then the word after it.
      const attemptChars = Array.from(correction.attempt);
      // The attempt's own forms, from the seed the renderer writes it with.
      const attemptForms = wordForms(attemptChars, mixSeed(wordSeed, ATTEMPT_SALT), style.glyphSet);
      const attempt = attemptChars.reduce(
        (t, ch, i) => t + measureGlyph(ch, attemptForms ? attemptForms[i] : undefined) + letterSpacing,
        0,
      );
      shape.prefix = round(attempt + style.wordSpacing * unit * 0.6);
      shape.width = round(shape.width + shape.prefix);
    }
  }
  if (shapesLetters || variesInk || style.alternates.length || charFormat) {
    shape.chars = built;
  }
  return shape;
}

// --- Layout -----------------------------------------------------------------

/** Heading size relative to body text, capped so lines cannot collide. */
export const HEADING_SCALE = 1.1;
const HEADING_EMPHASIS = 1.35;
const LABEL_EMPHASIS = 1.15;

function headingFactor(style, fontSize, size, lineHeight) {
  const m = style.metrics || {};
  const extent = ((m.inkAscent || 0.8) + (m.inkDescent || 0.3)) * size;
  const row = lineHeight || fontSize / PAGE.fontToLineRatio;
  return Math.max(1, Math.min(HEADING_SCALE, (1.2 * row) / extent));
}

/**
 * Builds the layout model.
 *
 * @param {string} content  Document text.
 * @param {object} style    Resolved handwriting style.
 * @param {object} options
 *   fontSize      Base size; glyphs use fontSize × style.fontScale while
 *                 spacing and variation are measured against fontSize.
 *   contentWidth  Width available for writing.
 *   seed          Document id (two documents with the same text should not
 *                 look photocopied).
 *   pageId        Page id, for multi-page documents later.
 *   lineHeight    Row height; glyphs are capped so lines cannot collide.
 *   formatting    { headings, underlines, labels } character ranges
 *                 (see utils/formatting.js); labels such as "Q1." and
 *                 "Ans:" are also detected automatically.
 *   cache         A previous layout's `cache`; unchanged words keep their
 *                 shape objects so the renderer can skip them.
 *   corrections   true (or settings) for natural corrections — the odd
 *                 letter overwritten or struck (handwriting/corrections.js).
 *                 Listed in the result's `corrections` with text ranges.
 */
export function layoutHandwriting(content, style, options = {}) {
  const {
    fontSize = 20,
    contentWidth = Infinity,
    seed = '',
    pageId = DEFAULT_PAGE_ID,
    formatting,
    lineHeight,
    cache,
    corrections = false,
  } = options;
  const correctionSettings =
    corrections && typeof corrections === 'object'
      ? corrections
      : style.corrections || CORRECTION_SETTINGS;
  // Short pages are left clean.
  const correcting =
    !!corrections && wordCount(content) >= correctionSettings.minWords;
  const planned = [];
  const headings = (formatting && formatting.headings) || [];
  // Handwriting of selected text (colour, pen/marker, size, word spacing).
  const spans = (formatting && formatting.spans) || [];
  // Individual word gaps, by the start of their left word.
  const gapsByStart = new Map(
    ((formatting && formatting.gaps) || []).map(g => [g.start, g]),
  );
  const spanFor = pos => {
    let lo = 0;
    let hi = spans.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1; // eslint-disable-line no-bitwise
      const r = spans[mid];
      if (pos < r.start) hi = mid - 1;
      else if (pos >= r.end) lo = mid + 1;
      else return r;
    }
    return null;
  };
  const underlines = (formatting && formatting.underlines) || [];
  const explicitLabels = (formatting && formatting.labels) || [];
  const autoLabels = !formatting || formatting.autoLabels !== false;

  // Glyph size, capped so ascenders and descenders of neighbouring rows
  // cannot collide on this paper's actual line pitch.
  const inkExtent =
    ((style.metrics && style.metrics.inkAscent) || 0.8) +
    ((style.metrics && style.metrics.inkDescent) || 0.3);
  const size = Math.min(
    fontSize * (style.fontScale || 1),
    lineHeight ? (MAX_INK_EXTENT_LINES * lineHeight) / inkExtent : Infinity,
  );
  const unit = fontSize;
  const seedPrefix = `${seed}|${pageId}|${style.id}`;
  const headScale = headingFactor(style, fontSize, size, lineHeight);
  const contexts = new Map();
  const ctxFor = (factor, emphasis) => {
    const id = `${factor}|${emphasis}`;
    if (!contexts.has(id)) {
      contexts.set(id, {
        size: size * factor,
        unit,
        seedPrefix,
        measureGlyph: createMeasurer(style, size * factor),
        measureMax: createMaxMeasurer(style, size * factor),
        emphasis,
      });
    }
    return contexts.get(id);
  };
  const bodyCtx = ctxFor(1, 1);
  const spaceWidth = bodyCtx.measureGlyph(' ');

  const cacheKey = `${seedPrefix}|${size}|${correcting ? 'fix' : ''}`;
  const previous =
    cache && cache.style === style && cache.key === cacheKey
      ? cache.shapes
      : null;
  const shapes = new Map();
  const shapeFor = (key, text, ctx, letterSpacing, correction, charFormat) => {
    const id = `${key}\u0000${text}\u0000${ctx.size}|${ctx.emphasis}\u0000${
      letterSpacing ?? ''
    }\u0000${correction ? `${correction.kind}${correction.seed}` : ''}\u0000${
      charFormat ? charFormat.key : ''
    }`;
    const shape =
      (previous && previous.get(id)) ||
      buildWordShape(
        key,
        text,
        style,
        ctx,
        letterSpacing,
        correction,
        charFormat,
      );
    shapes.set(id, shape);
    return shape;
  };

  const occurrences = new Map();
  let previousBlank = false;
  let offset = 0;

  const paragraphs = splitParagraphs(content).map((paragraph, pIndex) => {
    const pKey = `p${pIndex}`;
    const pStart = offset;
    const pEnd = offset + paragraph.length;
    offset = pEnd + 1; // the line break
    const { indent, tokens } = tokenizeWithSpacing(paragraph);
    const breakBefore =
      pIndex === 0 ? 'none' : previousBlank ? 'paragraph' : 'line';
    previousBlank = tokens.length === 0;

    if (!tokens.length) {
      return {
        key: pKey,
        kind: 'blank',
        breakBefore,
        indent: 0,
        start: pStart,
        end: pEnd,
        lines: [
          {
            key: `${pKey}-l0`,
            offsetX: 0,
            words: [],
            underlines: [],
            start: pStart,
            end: pEnd,
          },
        ],
        words: [],
      };
    }

    // Paragraph formatting.
    const headingRange = overlaps(headings, pStart, Math.max(pEnd, pStart + 1));
    const heading = headingRange
      ? { underline: headingRange.underline !== false }
      : null;
    const ctx = heading ? ctxFor(headScale, HEADING_EMPHASIS) : bodyCtx;
    let label = autoLabels ? detectLabel(tokens) : null;
    if (!label && explicitLabels.length) {
      const first = tokens[0];
      if (overlaps(explicitLabels, pStart + first.start, pStart + first.end)) {
        label = { count: 1, kind: 'custom' };
      }
    }
    const labelCtx = heading ? ctx : ctxFor(1, LABEL_EMPHASIS);

    const indentWidth = round(
      Math.min(indent * spaceWidth, contentWidth * 0.5),
    );
    const lines = [];
    const words = [];
    let line = null;
    let x = 0;
    let hang = 0; // continuation lines start after a label (hanging indent)

    const startLine = () => {
      line = {
        key: `${pKey}-l${lines.length}`,
        offsetX: 0,
        words: [],
        underlines: [],
        heading: !!heading,
      };
      lines.push(line);
      x = lines.length === 1 ? indentWidth : hang;
    };
    const place = (shape, gapAfter, flags) => {
      line.words.push({ shape, gap: gapAfter, x: round(x), ...flags });
      words.push(shape);
      x += shape.width + gapAfter;
    };
    // Smooth gap rhythm for this paragraph: two slow waves with
    // incommensurate periods (correlated from word to word, never a cycle).
    const rr = style.rhythm ? randomFor(seedPrefix, 'rhythm', pKey) : null;
    const rw = rr
      ? [rr() * 6.283, rr() * 6.283, 0.35 + rr() * 0.3, 0.9 + rr() * 0.5]
      : null;
    const gapRhythm = i =>
      rw ? 0.65 * Math.sin(rw[0] + rw[2] * i) + 0.35 * Math.sin(rw[1] + rw[3] * i) : 0;
    const tIndexOf = token => tokens.indexOf(token);
    const gapAfter = (shape, token, nextToken) => {
      let gap = style.wordSpacing * unit + shape.gapJitter;
      // An individual gap for exactly this word pair ("heads | to") wins;
      // otherwise the word spacing of selected text: the space after the
      // word decides, else the word itself (≈0.35 x-height per step).
      const own = nextToken && gapsByStart.get(pStart + token.start);
      const exact =
        own &&
        own.end === pStart + nextToken.end &&
        own.left === token.text &&
        own.right === nextToken.text;
      const spaceSpan = spanFor(pStart + token.end);
      const wordSpan = spanFor(pStart + token.end - 1);
      const steps = exact
        ? own.value
        : spaceSpan && spaceSpan.spacing
        ? spaceSpan.spacing
        : wordSpan && wordSpan.spacing
        ? wordSpan.spacing
        : 0;
      const step = 0.35 * size * XH_EM;
      if (steps >= -2) {
        gap += steps * step;
      } else {
        // Below −2: the rest of the way to ≈20 % of the natural gap, so −5
        // is tight but the words never touch.
        const atMinus2 = gap - 2 * step;
        const tightest = Math.min(atMinus2, 0.2 * style.wordSpacing * unit);
        gap = atMinus2 - ((-steps - 2) / 3) * (atMinus2 - tightest);
      }
      // Natural rhythm (profiles that have one): when nothing is set
      // explicitly, the gaps breathe with the hand's pace — a smooth,
      // correlated wave across the paragraph, ≈±1 step at most.
      if (!steps && style.rhythm && style.rhythm.gap) {
        gap += gapRhythm(tIndexOf(token)) * style.rhythm.gap * size * XH_EM;
      }
      gap += Math.max(0, token.spaces - 1) * spaceWidth; // typed extra spaces
      if (/[.!?…]["”’)]*$/.test(token.text)) {
        gap += 0.12 * unit; // a little more air after a sentence
      } else if (/[,;:]$/.test(token.text)) {
        gap += 0.04 * unit;
      }
      return round(Math.max(0.12 * unit, gap));
    };

    startLine();
    tokens.forEach((token, tIndex) => {
      const seen = occurrences.get(token.text) || 0;
      occurrences.set(token.text, seen + 1);
      // Profiles with contextual seeds also take the neighbouring words
      // into the word's seed, so the same word reads differently in
      // different company (not only on its nth occurrence).
      const position = style.contextSeed
        ? `${token.text}#${seen}|${tokens[tIndex - 1] ? tokens[tIndex - 1].text : ''}|${
            tokens[tIndex + 1] ? tokens[tIndex + 1].text : ''
          }`
        : `${token.text}#${seen}`;
      const isLabel = !!label && tIndex < label.count;
      const wordCtx = isLabel ? labelCtx : ctx;
      const absStart = pStart + token.start;
      const absEnd = pStart + token.end;
      const flags = {
        underline:
          (heading && heading.underline) ||
          (isLabel && label.kind === 'answer') ||
          !!overlaps(underlines, absStart, absEnd),
        label: isLabel ? label.kind : undefined,
        start: absStart,
        end: absEnd,
      };
      // Natural corrections, anchored to the word in its context (the words
      // either side of it) and seeded by the document — not by the page or
      // the word's count, so a correction survives pages being split,
      // reordered or reflowed, and edits anywhere but right next to it.
      const anchor = `${tokens[tIndex - 1] ? tokens[tIndex - 1].text : ''} ${
        token.text
      } ${tokens[tIndex + 1] ? tokens[tIndex + 1].text : ''}`;
      const correction = correcting
        ? planCorrection(
            `${seed}|${style.id}`,
            anchor,
            token.text,
            {
              heading: !!heading,
              label: isLabel,
              underline: flags.underline,
            },
            correctionSettings,
          )
        : null;
      if (correction) {
        planned.push({
          id: anchor,
          ...correction,
          word: token.text,
          start: absStart,
          end: absEnd,
        });
      }
      // Per-letter handwriting formatting, if any span touches the word.
      let charFormat = null;
      if (spans.length) {
        let any = false;
        const letters = Array.from(token.text);
        const list = [];
        let at = absStart;
        for (const ch of letters) {
          const r = spanFor(at);
          const p = r
            ? {
                color: r.color || null,
                mode: r.mode || 'pen',
                size: r.size || 1,
              }
            : { color: null, mode: 'pen', size: 1 };
          if (r && (p.color || p.mode !== 'pen' || p.size !== 1)) any = true;
          list.push(p);
          at += ch.length;
        }
        if (any) {
          charFormat = list;
          charFormat.key = list
            .map(p => `${p.color || ''}${p.mode[0]}${p.size}`)
            .join(',');
        }
      }
      const shape = shapeFor(
        position,
        token.text,
        wordCtx,
        undefined,
        correction,
        charFormat,
      );
      const atLineStart = line.words.length === 0;
      const isLast = tIndex === tokens.length - 1;
      const gap = isLast ? 0 : gapAfter(shape, token, tokens[tIndex + 1]);
      // Punctuation stays with its word; an opening bracket/quote stays with
      // the word after it.
      const prev = tokens[tIndex - 1];
      const glued = token.glueBefore || (prev && prev.glueAfter);

      const placeAndHang = () => {
        place(shape, gap, flags);
        if (
          label &&
          tIndex === label.count - 1 &&
          !isLast &&
          lines.length === 1
        ) {
          // Continuation lines align with the text after the label.
          hang = Math.min(x, contentWidth * 0.4);
        }
      };

      if (x + shape.width <= contentWidth) {
        placeAndHang();
        return;
      }
      if (shape.width <= contentWidth - hang) {
        if (glued && !atLineStart) {
          if (x + shape.width <= contentWidth + 0.4 * unit) {
            // Nearly fits: let it hang into the margin a little.
            placeAndHang();
            return;
          }
          // Carry the word it belongs to over to the next line with it.
          const carried = line.words.pop();
          if (carried && line.words.length) {
            words.pop();
            startLine();
            line.words.push({ ...carried, x: round(x) });
            words.push(carried.shape);
            x += carried.shape.width + carried.gap;
            placeAndHang();
            return;
          }
          if (carried) {
            line.words.push(carried);
          }
        }
        if (!atLineStart) {
          startLine();
        }
        placeAndHang();
        return;
      }

      // Longer than a whole line: split gracefully.
      // Pieces are measured with each letter's widest form: whichever forms
      // a piece then uses, it never exceeds the room it was given.
      const measure = c => wordCtx.measureMax(c) + shape.letterSpacing;
      const room = contentWidth - x;
      const useRest = !atLineStart && room > contentWidth * 0.35;
      if (!useRest && !atLineStart) {
        startLine();
      }
      const pieces = breakLongWord(
        token.text,
        measure,
        useRest ? room : contentWidth - x,
        contentWidth - hang,
      );
      pieces.forEach((piece, i) => {
        if (i > 0) {
          startLine();
        }
        const pieceShape = shapeFor(
          `${position}#${i}`,
          piece,
          wordCtx,
          shape.letterSpacing,
          null,
          charFormat
            ? Object.assign(
                charFormat.slice(
                  Array.from(pieces.slice(0, i).join('')).length,
                  Array.from(pieces.slice(0, i + 1).join('')).length,
                ),
                { key: `${charFormat.key}#${i}` },
              )
            : null,
        );
        place(pieceShape, i === pieces.length - 1 ? gap : 0, flags);
      });
    });

    lines.forEach(l => {
      // Line-level irregularity: each line starts a hair off the margin and
      // follows its own slow wander, like a hand moving across the page.
      const anchor = l.words[0] ? l.words[0].shape.key : l.key;
      const r = randomFor(seedPrefix, 'line', pKey, anchor);
      // Text offset where the line starts, so pages can be split exactly
      // at line boundaries (pagination).
      l.start = l.words[0] ? l.words[0].start : pStart;
      l.end = l.words.length ? l.words[l.words.length - 1].end : pEnd;
      l.offsetX = round(Math.abs(spread(r, 0.14 * unit)));
      const phase = r() * Math.PI * 2;
      const period = 140 + r() * 120;
      const amplitude = style.variation.drift * unit;
      // Line tilt (profiles may set variation.slope; default unchanged).
      const slopeMax = style.variation.slope ?? 0.004;
      const slope = amplitude > 0 ? spread(r, slopeMax) : 0;
      l.words = l.words.map(item => {
        const centre = item.x + item.shape.width / 2;
        const drift =
          amplitude * Math.sin((centre / period) * Math.PI * 2 + phase) +
          slope * centre;
        return { ...item, drift: round(drift) };
      });

      // Underlines: one hand-drawn stroke per run of underlined words.
      let run = null;
      const flush = () => {
        if (run) {
          l.underlines.push(
            buildUnderline(
              `${seedPrefix}|${l.key}|${run.from}`,
              run.x1,
              run.x2,
              unit,
              heading ? 1.15 : 1,
            ),
          );
          run = null;
        }
      };
      l.words.forEach(item => {
        if (!item.underline) {
          flush();
          return;
        }
        const x2 = item.x + item.shape.width;
        if (run) {
          run.x2 = x2;
        } else {
          run = { from: item.shape.key, x1: item.x, x2 };
        }
      });
      flush();
    });

    return {
      key: pKey,
      kind: 'text',
      breakBefore,
      indent: indentWidth,
      start: pStart,
      end: pEnd,
      heading,
      label: label ? label.kind : null,
      hang: round(hang),
      lines,
      words,
    };
  });

  const lines = paragraphs.flatMap(p => p.lines);
  return {
    fontSize: size,
    headingFontSize: round(size * headScale),
    unit,
    lineCount: lines.length,
    paragraphs,
    lines,
    corrections: planned,
    cache: { style, key: cacheKey, shapes },
  };
}

/**
 * Vertical placement of glyphs inside a row of height `rowHeight`, so the
 * letters visibly sit on the row's bottom edge (the ruled line).
 *
 * React Native centres the font's ascent+descent box inside the Text's
 * lineHeight on both Android (CustomLineHeightSpan) and iOS (baseline
 * offset), *provided* lineHeight ≥ ascent + descent. We therefore give the
 * Text a lineHeight at least that tall, which puts the baseline at
 *   (lineHeight - ascent - descent) / 2 + ascent
 * from its top, and return the shift that moves it onto the line.
 * `style.baselineAdjust` (em, + = down) is added on top for fine tuning.
 *
 * @returns {{ lineHeight: number, translateY: number }}
 */
export function verticalMetrics(style, size, rowHeight) {
  const m = style.metrics || {};
  const ascent = (m.ascent ?? 1) * size;
  const descent = (m.descent ?? 0.3) * size;
  const lineHeight = Math.max(rowHeight, Math.ceil(ascent + descent) + 2);
  const baselineFromTop = (lineHeight - ascent - descent) / 2 + ascent;
  // Ink sits on the line, not floating over it; a hair above reads best.
  const target = rowHeight - Math.max(1, rowHeight * 0.05);
  const visibleBaseline = (m.baseline || 0) * size; // + = letters float up
  const adjust = (style.baselineAdjust || 0) * size;
  return {
    lineHeight,
    translateY: round(target - baselineFromTop + visibleBaseline + adjust),
  };
}
