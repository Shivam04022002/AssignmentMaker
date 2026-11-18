/**
 * Rendering text with a personal (learned) handwriting profile.
 *
 * Kept apart from the built-in engine (textLayout.js / glyphRender.js), which
 * lays out code point by code point for Lang1–3: a personal profile is drawn
 * by rendering units (textUnits.splitUnits) — a Latin letter, or a whole
 * Devanagari cluster with its matras, marks and conjunct parts, exactly as
 * learned. Nothing here borrows a glyph from another profile or a font:
 *
 *   glyph     the unit's learned form (a variant chosen deterministically
 *             — see pickForm), placed by its render-time transform
 *             (personalMetrics.js: consistent size, baseline and spacing;
 *             the stored geometry is not changed)
 *   missing   a unit the profile cannot draw (missing / not learned /
 *             orphan mark / unsupported script): a visible dashed marker of
 *             fixed width, reported with its text range and reason
 *   space     word spacing (the profile's wordGap)
 *
 * Neighbouring Devanagari clusters of a word have their headlines joined
 * (rendererAdapter.headlineJoins, at the drawn forms' own headline ends);
 * a run is broken by a missing cluster, and a pair that cannot be joined is
 * reported (unjoined), never faked.
 *
 * Sizes: the x-height in pixels follows the built-in rule (font size ×
 * xHeightPerPitch / 0.62, capped so ascenders and descenders fit the row);
 * strokes are the learned centre-lines drawn with the profile's measured
 * pen width. No pressure, variation or natural corrections are applied
 * (the learned forms are used as they are, only placed consistently).
 */
import { MAX_INK_EXTENT_LINES } from '../../data/handwritingStyles';
import { breakLines, normalizePageIds, rowsPerPage, sheetFormatting, splitSheets } from '../../utils/pagination';
import { buildUnderline, detectLabel, HEADING_SCALE } from '../../utils/textLayout';
import { DRAWABLE_STATES } from './confidence';
import { placeChain, profileLayoutMetrics } from './personalMetrics';
import { headlineJoins, UNSUPPORTED_REASONS } from './rendererAdapter';
import { splitUnits, UNIT_KIND } from './textUnits';

export const MARKER_WIDTH = 0.6; // x-heights
const FONT_TO_LINE = 0.62;

/** x-height in pixels for a page font size and row height. */
export function personalXHeight(profile, fontSize, rowHeight) {
  const p = profile.params;
  const natural = (fontSize * p.xHeightPerPitch) / FONT_TO_LINE;
  const cap = rowHeight ? (MAX_INK_EXTENT_LINES * rowHeight) / (p.ascender + p.descender) : Infinity;
  return Math.min(natural, cap);
}

/**
 * Deterministic 0–1 from a string: 32-bit FNV-1a with a final avalanche
 * (MurmurHash3 fmix32), so keys differing only in their last characters
 * (the occurrence of a repeated word) still land far apart.
 */
/* eslint-disable no-bitwise -- hashing is bit arithmetic */
export function hash01(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/* eslint-enable no-bitwise */

/**
 * Which learned variant a unit is drawn with: deterministic and stable. By
 * the forms' weights, from a hash of the profile version, the document
 * seed, the word's text, which occurrence of that word on the sheet it is,
 * and the unit's place in the word. Typing elsewhere on the page does not
 * reshuffle a word's letters (text positions are not part of the key), the
 * same document and profile version always draw the same variants, and a
 * doubled unit (ll, मम) is not drawn twice with the same variant when the
 * profile has another one.
 */
export function pickForm(forms, key, previous = -1) {
  if (forms.length === 1) return 0;
  const u = hash01(key);
  let acc = 0;
  let pick = forms.length - 1;
  for (let i = 0; i < forms.length; i++) {
    acc += forms[i].weight;
    if (u < acc) {
      pick = i;
      break;
    }
  }
  return pick === previous ? (pick + 1) % forms.length : pick;
}

function reasonFor(profile, u) {
  if (u.kind === UNIT_KIND.ORPHAN_MARK) return UNSUPPORTED_REASONS.ORPHAN_MARK;
  if (u.kind === UNIT_KIND.OTHER) return UNSUPPORTED_REASONS.SCRIPT;
  const unit = profile.units[u.key];
  if (!unit) return UNSUPPORTED_REASONS.MISSING;
  return UNSUPPORTED_REASONS.NOT_LEARNED;
}

/**
 * Items of one word: glyphs and markers, x and w in the word's x-heights
 * (`format(u)` → { size, color, mode } for each unit: a glyph of size s is
 * s times as large; colour and pen/marker only change how it is drawn).
 */
function layoutWord(word, start, profile, seed, occurrence = 0, format = () => DEFAULT_FORMAT) {
  const gap = profile.params.letterGap;
  const metrics = profileLayoutMetrics(profile);
  const items = [];
  let x = 0;
  let prev = null;
  splitUnits(word).forEach((u, k) => {
    const abs = start + u.start;
    const unit = profile.units[u.key];
    const f = format(abs);
    const style = f === DEFAULT_FORMAT ? null : { size: f.size, color: f.color, mode: f.mode };
    if (unit && DRAWABLE_STATES.includes(unit.coverage) && unit.forms.length) {
      const previous = prev && prev.key === u.key ? prev.form : -1;
      const form = pickForm(unit.forms, `${profile.id}@${profile.version}|${seed}|${word}|${occurrence}|${k}`, previous);
      const t = metrics.forms.get(u.key)[form];
      items.push({ kind: 'glyph', key: u.key, text: u.text, script: u.script, start: abs, end: start + u.end, x, w: r3(t.advance * f.size), form, coverage: unit.coverage, ...(style ? { style } : null) });
      prev = { key: u.key, form };
      x += t.advance * f.size + gap * f.size;
    } else {
      items.push({ kind: 'missing', key: u.key, text: u.text, script: u.script, start: abs, end: start + u.end, x, w: r3(MARKER_WIDTH * f.size), reason: reasonFor(profile, u), ...(style ? { style } : null) });
      prev = null;
      x += (MARKER_WIDTH + gap) * f.size;
    }
  });
  const last = items[items.length - 1];
  const width = Math.max(0, x - gap * (last && last.style ? last.style.size : 1));
  // Headline joins inside runs of learned Devanagari clusters of one size.
  const joins = [];
  const unjoined = [];
  let run = [];
  const sizeOf = it => (it.style ? it.style.size : 1);
  const flush = () => {
    if (run.length > 1) {
      const s = sizeOf(run[0]);
      // Each drawn form's own headline ends (placed), not the unit's first form's.
      const anchorsOf = it => {
        const a = metrics.forms.get(it.key)[it.form].anchors;
        return a && { headlineLeft: [a.headlineLeft[0] * s, a.headlineLeft[1] * s], headlineRight: [a.headlineRight[0] * s, a.headlineRight[1] * s] };
      };
      const r = headlineJoins(run.map(it => ({ key: it.key, x: it.x, unit: { anchors: anchorsOf(it) } })));
      joins.push(...r.joins.map(c => ({ chain: c, style: run[0].style || null })));
      unjoined.push(...r.unjoined);
    }
    run = [];
  };
  for (const it of items) {
    const cluster = it.kind === 'glyph' && it.script === 'Deva' && profile.units[it.key].kind === UNIT_KIND.CLUSTER;
    if (cluster && run.length && sizeOf(run[run.length - 1]) !== sizeOf(it)) {
      unjoined.push({ left: run[run.length - 1].key, right: it.key, reason: 'written at different sizes' });
      flush();
    }
    if (cluster) run.push(it);
    else flush();
  }
  flush();
  return { items, width, joins: joins.map(j => j.chain), joinStyles: joins.map(j => j.style), unjoined };
}

const DEFAULT_FORMAT = { size: 1, color: null, mode: 'pen' };
const r3 = v => Math.round(v * 1000) / 1000;
/** Pen weight of headings and labels (as the built-in engine's emphasis). */
export const EMPHASIS = { heading: 1.35, label: 1.15 };
const overlapsRange = (ranges, start, end) => (ranges || []).find(r => r.start < end && r.end > start) || null;

/**
 * Lays out text with a resolved personal profile.
 * @param options { xHeight (px), maxXHeight (px: the row's limit for
 *   headings and larger text), contentWidth, seed, offset, formatting
 *   (utils/formatting.js ranges over the whole document), formatOffset (the
 *   document position of `text`'s first character) }
 * Formatting drawn as the built-in engine does: headings (larger, heavier
 * pen, underlined unless turned off), underlines (the built-in hand-drawn
 * underline), labels — Q1., Ans: … detected automatically, or marked —
 * (heavier pen; continuation lines hang after the label), and selected
 * text's colour, pen / marker, size and word spacing, and exact word gaps.
 * A size the row cannot hold is limited to the row and listed in `notes`.
 * @returns { lines: [{ start, end, heading, label, words: [{ start, end,
 *   x (px), xHeight (px), emphasis, items, joins, unjoined, width (px),
 *   underline }], underlines: [{ x1, x2, points, weight }] }],
 *   unsupported: [{ start, end, text, reason }], notes: [string], xHeight }
 *   Offsets are code-unit offsets into `text` (+ offset).
 */
export function layoutPersonalText(text, profile, { xHeight, maxXHeight = Infinity, contentWidth = Infinity, seed = '', offset = 0, formatting = null, formatOffset = 0 } = {}) {
  const lines = [];
  const unsupported = [];
  const notes = new Set();
  const f = formatting || {};
  const spans = f.spans || [];
  const spanAt = pos => spans.find(r => pos >= r.start && pos < r.end) || null;
  const gapsByStart = new Map((f.gaps || []).map(g => [g.start, g]));
  const autoLabels = !formatting || f.autoLabels !== false;
  const paragraphs = text.split('\n');
  const seen = new Map(); // word -> occurrences so far (variant keys)
  let pos = 0;
  for (const para of paragraphs) {
    const pStart = formatOffset + pos;
    const heading = overlapsRange(f.headings, pStart, Math.max(pStart + para.length, pStart + 1));
    let paraXh = xHeight;
    if (heading) {
      paraXh = Math.min(xHeight * HEADING_SCALE, Math.max(xHeight, maxXHeight));
      if (paraXh < xHeight * HEADING_SCALE) notes.add('a heading is drawn only as large as the ruled line allows');
    }
    const tokens = [];
    const re = /[^ \t]+/g;
    let m;
    while ((m = re.exec(para))) tokens.push({ text: m[0], start: m.index });
    const auto = autoLabels && !heading ? detectLabel(tokens) : null;
    const wordGap = profile.params.wordGap * paraXh;
    const step = 0.35 * paraXh;
    let line = { start: offset + pos, end: offset + pos, heading: !!heading, label: auto ? auto.kind : null, words: [], underlines: [] };
    let x = 0;
    let hang = 0;
    let firstLine = true;
    tokens.forEach((tok, ti) => {
      const start = offset + pos + tok.start;
      const absStart = pStart + tok.start;
      const absEnd = absStart + tok.text.length;
      const isLabel = !heading && ((auto && ti < auto.count) || !!overlapsRange(f.labels, absStart, absEnd));
      const format = docPos => {
        const r = spanAt(docPos);
        if (!r) return DEFAULT_FORMAT;
        const size = r.size || 1;
        const limited = Math.min(size, Math.max(1, maxXHeight / paraXh));
        if (limited < size) notes.add(`text at ${Math.round(size * 100)} % is drawn only as large as the ruled line allows`);
        return { size: limited, color: r.color || null, mode: r.mode || 'pen' };
      };
      const occurrence = seen.get(tok.text) || 0;
      seen.set(tok.text, occurrence + 1);
      const w = layoutWord(tok.text, start, profile, seed, occurrence, abs => format(abs - offset + formatOffset));
      w.items.filter(it => it.kind === 'missing').forEach(it => unsupported.push({ start: it.start, end: it.end, text: it.text, reason: it.reason }));
      const widthPx = w.width * paraXh;
      // The gap before this word: the profile's word gap, changed by the
      // word spacing of selected text or an exact gap for this word pair.
      let gapPx = wordGap;
      if (ti > 0) {
        const prevTok = tokens[ti - 1];
        const prevAbs = pStart + prevTok.start;
        const own = gapsByStart.get(prevAbs);
        const exact = own && own.end === absEnd && own.left === prevTok.text && own.right === tok.text;
        const spaceSpan = spanAt(prevAbs + prevTok.text.length);
        const wordSpan = spanAt(prevAbs + prevTok.text.length - 1);
        const steps = exact ? own.value : spaceSpan && spaceSpan.spacing ? spaceSpan.spacing : wordSpan && wordSpan.spacing ? wordSpan.spacing : 0;
        if (steps >= -2) gapPx = wordGap + steps * step;
        else {
          const atMinus2 = wordGap - 2 * step;
          const tightest = Math.min(atMinus2, 0.2 * wordGap);
          gapPx = atMinus2 - ((-steps - 2) / 3) * (atMinus2 - tightest);
        }
      }
      const needs = line.words.length ? x + gapPx + widthPx : x + widthPx;
      if (line.words.length && needs > contentWidth) {
        lines.push(line);
        firstLine = false;
        line = { start, end: start, heading: !!heading, label: null, words: [], underlines: [] };
        x = hang;
      }
      const wx = line.words.length ? x + gapPx : x;
      const underline = (heading && heading.underline !== false) || !!overlapsRange(f.underlines, absStart, absEnd);
      const emphasis = heading ? EMPHASIS.heading : isLabel ? EMPHASIS.label : 1;
      line.words.push({ start, end: start + tok.text.length, x: wx, xHeight: paraXh, emphasis, items: w.items, joins: w.joins, joinStyles: w.joinStyles, unjoined: w.unjoined, width: widthPx, underline });
      line.end = start + tok.text.length;
      x = wx + widthPx;
      // Continuation lines hang after a label ("Ans: …"), as the built-in engine.
      if (auto && firstLine && ti === auto.count - 1 && ti < tokens.length - 1) hang = Math.min(x + wordGap, contentWidth * 0.4);
    });
    lines.push(line);
    pos += para.length + 1;
  }
  // Underlines: one hand-drawn stroke per run of underlined words on a line.
  for (const l of lines) {
    let run = null;
    const flush = () => {
      if (run) l.underlines.push({ ...buildUnderline(`${seed}|${l.start}|${run.from}`, run.x1, run.x2, 2 * run.xh, l.heading ? 1.15 : 1), unit: 2 * run.xh });
      run = null;
    };
    for (const wd of l.words) {
      if (!wd.underline) {
        flush();
        continue;
      }
      if (run) run.x2 = wd.x + wd.width;
      else run = { from: wd.start, x1: wd.x, x2: wd.x + wd.width, xh: wd.xHeight };
    }
    flush();
  }
  return { lines, unsupported, notes: [...notes], xHeight };
}

const fmt = v => Math.round(v * 100) / 100;

/** A cubic chain (glyph units) → SVG path data at (ox, baseline). */
function chainPath(chain, ox, baseline, xh) {
  const P = i => `${fmt(ox + chain[i] * xh)} ${fmt(baseline - chain[i + 1] * xh)}`;
  let d = `M${P(0)}`;
  for (let i = 2; i + 5 < chain.length; i += 6) d += `C${P(i)} ${P(i + 2)} ${P(i + 4)}`;
  return d;
}

/** Marker text: as the built-in engine — a wider, translucent tip. */
export const MARKER_TEXT = { width: 2, alpha: 0.58 };

/**
 * SVG geometry for laid-out lines — row r's baseline at r · rowHeight +
 * baselineInRow:
 *   paths       [d] strokes in the document's pen at penWidth
 *   styled      [{ d, width, color, alpha, mode }] strokes with their own
 *               pen weight, colour or marker (headings, labels, selected
 *               text); marker strokes come first (under the pen ink)
 *   underlines  [{ d, alpha }] filled hand-drawn underline outlines
 *   markers     [{ x, y, w, h, text, reason }] missing units
 */
export function personalPaths(lines, profile, { xHeight, rowHeight, baselineInRow }) {
  const metrics = profileLayoutMetrics(profile);
  const pen = profile.params.strokeWidth;
  const penWidth = fmt(Math.max(0.6, pen * xHeight));
  const paths = [];
  const styled = [];
  const underlines = [];
  const markers = [];
  const add = (d, xh, emphasis, style) => {
    const size = style ? style.size : 1;
    const marker = style && style.mode === 'marker';
    const width = fmt(Math.max(0.6, pen * xh * size * emphasis * (marker ? MARKER_TEXT.width : 1)));
    if (!style && emphasis === 1 && xh === xHeight) paths.push(d);
    else styled.push({ d, width, color: style ? style.color : null, alpha: marker ? MARKER_TEXT.alpha : 1, mode: marker ? 'marker' : 'pen' });
  };
  lines.forEach((line, row) => {
    const baseline = row * rowHeight + baselineInRow;
    for (const word of line.words) {
      const xh = word.xHeight || xHeight;
      const emphasis = word.emphasis || 1;
      for (const it of word.items) {
        const ox = word.x + it.x * xh;
        const size = it.style ? it.style.size : 1;
        if (it.kind === 'glyph') {
          const form = profile.units[it.key].forms[it.form];
          const t = metrics.forms.get(it.key)[it.form];
          for (const chain of form.strokes) add(chainPath(placeChain(chain, t), ox, baseline, xh * size), xh, emphasis, it.style || null);
        } else {
          markers.push({ x: fmt(ox), y: fmt(baseline - xh * size), w: fmt(it.w * xh), h: fmt(xh * size), text: it.text, reason: it.reason });
        }
      }
      (word.joins || []).forEach((chain, i) => add(chainPath(chain, word.x, baseline, xh), xh, emphasis, (word.joinStyles && word.joinStyles[i]) || null));
    }
    for (const u of line.underlines || []) {
      const top = baseline + 0.36 * u.unit;
      const left = [];
      const right = [];
      for (const p of u.points) {
        const h = Math.max(0.35, p.thickness * 0.6) / 2;
        left.push(`${fmt(p.x)} ${fmt(top + p.y - h)}`);
        right.unshift(`${fmt(p.x)} ${fmt(top + p.y + h)}`);
      }
      underlines.push({ d: `M${left.join('L')}L${right.join('L')}Z`, alpha: 0.92 });
    }
  });
  styled.sort((a, b) => (a.mode === 'marker' ? 0 : 1) - (b.mode === 'marker' ? 0 : 1));
  return { paths, styled, underlines, markers, penWidth };
}

/** Document formatting the personal renderer does not draw (said, not hidden). */
export function personalFormattingNotes({ corrections = false } = {}) {
  return corrections ? ['natural corrections (overwritten or struck letters) are not drawn in a personal handwriting'] : [];
}

/**
 * Pages of a document written with a personal profile — the same page
 * objects as utils/pagination.paginateDocument (key, number, sheetIndex,
 * sheetId, chunk, chunks, lines, start, end, text, corrections) so the
 * editor and export handle them alike. When the profile is not available,
 * every sheet still gets its page (the text is kept), with no lines: the
 * page shows the explicit error instead of handwriting. `formatting` is
 * the document's (utils/formatting.js); `notes` lists formatting that is
 * drawn differently or not at all.
 */
export function paginatePersonal({ content, pageIds, resolution, metrics, rowHeight, seed = '', inkChunks, formatting = null, corrections = false }) {
  const sheets = splitSheets(content);
  const ids = normalizePageIds(pageIds, sheets.length);
  const capacity = rowsPerPage(metrics, rowHeight);
  const ok = resolution && resolution.status === 'ok';
  const xHeight = ok ? personalXHeight(resolution.profile, metrics.fontSize, rowHeight) : 0;
  const maxXHeight = ok ? personalXHeight(resolution.profile, Infinity, rowHeight) : 0;
  const pages = [];
  const unsupported = [];
  const notes = new Set(personalFormattingNotes({ corrections }));
  sheets.forEach(sheet => {
    const sheetId = ids[sheet.index];
    const laid = ok
      ? layoutPersonalText(sheet.text, resolution.profile, { xHeight, maxXHeight, contentWidth: metrics.contentWidth, seed: `${seed}|${sheetId}`, formatting: sheetFormatting(formatting, sheet) })
      : { lines: [], unsupported: [], notes: [] };
    laid.unsupported.forEach(u => unsupported.push({ ...u, start: sheet.start + u.start, end: sheet.start + u.end }));
    laid.notes.forEach(n => notes.add(n));
    const chunks = ok ? breakLines(laid.lines, capacity) : [[]];
    const keep = inkChunks ? inkChunks.get(sheetId) || 0 : 0;
    while (chunks.length < keep) chunks.push([]);
    chunks.forEach((lines, chunk) => {
      const startInSheet = chunk === 0 ? 0 : lines.length ? lines[0].start : sheet.text.length;
      const next = chunks[chunk + 1];
      const endInSheet = next && next.length ? next[0].start : sheet.text.length;
      pages.push({
        key: `${sheetId}#${chunk}`,
        number: pages.length + 1,
        sheetIndex: sheet.index,
        sheetId,
        chunk,
        chunks: chunks.length,
        lines,
        start: sheet.start + startInSheet,
        end: sheet.start + endInSheet,
        text: sheet.text.slice(startInSheet, endInSheet),
        corrections: [],
      });
    });
  });
  return {
    pages,
    layout: { fontSize: metrics.fontSize, headingFontSize: metrics.fontSize, unit: metrics.fontSize, personal: { xHeight } },
    sheets,
    pageIds: ids,
    unsupported,
    notes: [...notes],
    handwriting: resolution,
  };
}
