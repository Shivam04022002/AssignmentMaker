/**
 * Rendering units for learned (personal) handwriting profiles.
 *
 * A handwriting is drawn unit by unit, and a unit is not a code point:
 *   - Latin: a letter (or digit, mark of punctuation …) together with any
 *     combining accents after it (e + ◌́ = one unit "é").
 *   - Devanagari: an orthographic cluster (akshara) — a consonant or a
 *     conjunct (consonants joined by virama), with its nukta, vowel sign
 *     (matra) and anusvara / chandrabindu / visarga; or an independent vowel
 *     with its signs. "कि" is one unit even though its vowel sign ि is drawn
 *     before the consonant; "क्ष" is one unit (a conjunct).
 *
 * Every unit keeps the exact range [start, end) of the original text (UTF-16
 * offsets), so formatting ranges, the cursor and undo/redo keep working on
 * the text the user typed — which is never rewritten. `key` is the lookup
 * key into a profile (NFC-normalised where the engine supports it; the
 * Devanagari nukta letters U+0958–U+095F are composition exclusions, so
 * "क़" typed precomposed or as क + ़ gets the same key).
 *
 * Pure JavaScript with explicit Unicode ranges: it does not rely on
 * Intl.Segmenter (not available on every Hermes build) or on Unicode
 * property escapes.
 */

export const SCRIPT = { LATIN: 'Latn', DEVANAGARI: 'Deva', COMMON: 'Zyyy', UNKNOWN: 'Zzzz' };

/** What a unit is, for coverage reports and rendering. */
export const UNIT_KIND = {
  LETTER: 'letter', // Latin letter (+ accents)
  DIGIT: 'digit',
  CLUSTER: 'cluster', // Devanagari akshara with a consonant or vowel base
  SIGN: 'sign', // Devanagari stand-alone sign (avagraha, om, abbreviation)
  PUNCTUATION: 'punctuation',
  SYMBOL: 'symbol',
  SPACE: 'space',
  ORPHAN_MARK: 'orphan-mark', // combining mark / vowel sign with no base
  OTHER: 'other', // any other script: unsupported by learned profiles
};

/** Roles of the parts of a Devanagari cluster (or Latin combining marks). */
export const ROLE = {
  BASE: 'base',
  NUKTA: 'nukta',
  VIRAMA: 'virama',
  MATRA: 'matra',
  MODIFIER: 'modifier', // anusvara, chandrabindu, visarga
  MARK: 'mark', // other combining marks (accents, Vedic stress)
  JOINER: 'joiner', // ZWJ / ZWNJ inside a conjunct
};

/** Where a dependent sign is drawn relative to its base. */
export const POSITION = { PRE: 'pre', ABOVE: 'above', BELOW: 'below', POST: 'post' };

const ZWNJ = 0x200c;
const ZWJ = 0x200d;

/** Devanagari code point → { cls, position? } (null outside U+0900–U+097F). */
export function devanagariClass(cp) {
  if (cp < 0x0900 || cp > 0x097f) return null;
  if (cp <= 0x0902) return { cls: 'modifier', position: POSITION.ABOVE };
  if (cp === 0x0903) return { cls: 'modifier', position: POSITION.POST };
  if (cp <= 0x0914) return { cls: 'vowel' };
  if (cp <= 0x0939) return { cls: 'consonant' };
  if (cp === 0x093a) return { cls: 'matra', position: POSITION.ABOVE };
  if (cp === 0x093b) return { cls: 'matra', position: POSITION.POST };
  if (cp === 0x093c) return { cls: 'nukta', position: POSITION.BELOW };
  if (cp === 0x093d) return { cls: 'sign' }; // avagraha
  if (cp === 0x093e) return { cls: 'matra', position: POSITION.POST };
  if (cp === 0x093f) return { cls: 'matra', position: POSITION.PRE }; // ि
  if (cp === 0x0940) return { cls: 'matra', position: POSITION.POST };
  if (cp <= 0x0944) return { cls: 'matra', position: POSITION.BELOW };
  if (cp <= 0x0948) return { cls: 'matra', position: POSITION.ABOVE };
  if (cp <= 0x094c) return { cls: 'matra', position: POSITION.POST };
  if (cp === 0x094d) return { cls: 'virama', position: POSITION.BELOW };
  if (cp === 0x094e) return { cls: 'matra', position: POSITION.PRE };
  if (cp === 0x094f) return { cls: 'matra', position: POSITION.POST };
  if (cp === 0x0950) return { cls: 'sign' }; // om
  if (cp <= 0x0954) return { cls: 'mark', position: cp === 0x0952 ? POSITION.BELOW : POSITION.ABOVE };
  if (cp === 0x0955) return { cls: 'matra', position: POSITION.ABOVE };
  if (cp <= 0x0957) return { cls: 'matra', position: POSITION.BELOW };
  if (cp <= 0x095f) return { cls: 'consonant' }; // nukta letters
  if (cp <= 0x0961) return { cls: 'vowel' };
  if (cp <= 0x0963) return { cls: 'matra', position: POSITION.BELOW };
  if (cp <= 0x0965) return { cls: 'punctuation' }; // danda, double danda
  if (cp <= 0x096f) return { cls: 'digit' };
  if (cp === 0x0970) return { cls: 'punctuation' }; // abbreviation sign
  if (cp === 0x0971) return { cls: 'sign' };
  if (cp <= 0x0977) return { cls: 'vowel' };
  return { cls: 'consonant' }; // U+0978–U+097F
}

const isLatinMark = cp => cp >= 0x0300 && cp <= 0x036f;
const isVariationOrModifier = cp =>
  (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0x1f3fb && cp <= 0x1f3ff);
const isLatinLetter = cp =>
  (cp >= 0x41 && cp <= 0x5a) ||
  (cp >= 0x61 && cp <= 0x7a) ||
  (cp >= 0xc0 && cp <= 0x24f && cp !== 0xd7 && cp !== 0xf7) ||
  (cp >= 0x1e00 && cp <= 0x1eff);
const isSpace = cp =>
  cp === 0x20 || cp === 0x09 || cp === 0x0a || cp === 0x0d || cp === 0x0c || cp === 0xa0;
const isAsciiPunct = cp =>
  (cp >= 0x21 && cp <= 0x2f) || (cp >= 0x3a && cp <= 0x40) || (cp >= 0x5b && cp <= 0x60) || (cp >= 0x7b && cp <= 0x7e);
const isGeneralPunct = cp => (cp >= 0x2010 && cp <= 0x2027) || (cp >= 0x2030 && cp <= 0x205e) || cp === 0xa1 || cp === 0xbf;

/** NFC where the engine supports String.prototype.normalize; identity otherwise. */
export function lookupKey(text) {
  try {
    return typeof text.normalize === 'function' ? text.normalize('NFC') : text;
  } catch (e) {
    return text;
  }
}

/** Code points of a string with their UTF-16 offsets. */
function codePoints(text) {
  const out = [];
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i);
    const len = cp > 0xffff ? 2 : 1;
    out.push({ cp, char: text.slice(i, i + len), start: i, end: i + len });
    i += len;
  }
  return out;
}

function simpleKind(cp) {
  if (isSpace(cp)) return { script: SCRIPT.COMMON, kind: UNIT_KIND.SPACE };
  if (cp >= 0x30 && cp <= 0x39) return { script: SCRIPT.COMMON, kind: UNIT_KIND.DIGIT };
  if (isLatinLetter(cp)) return { script: SCRIPT.LATIN, kind: UNIT_KIND.LETTER };
  if (isAsciiPunct(cp) || isGeneralPunct(cp)) return { script: SCRIPT.COMMON, kind: UNIT_KIND.PUNCTUATION };
  if (
    (cp >= 0xa2 && cp <= 0xbe) ||
    cp === 0xd7 ||
    cp === 0xf7 ||
    (cp >= 0x20a0 && cp <= 0x20cf) || // currency (₹ U+20B9)
    (cp >= 0x2190 && cp <= 0x21ff) || // arrows
    (cp >= 0x2200 && cp <= 0x22ff) || // maths
    cp === 0x2022 ||
    cp === 0x00b7
  ) {
    return { script: SCRIPT.COMMON, kind: UNIT_KIND.SYMBOL };
  }
  return { script: SCRIPT.UNKNOWN, kind: UNIT_KIND.OTHER };
}

/**
 * Splits text into rendering units. Joining every unit's `text` gives back
 * the input exactly; units are contiguous and never overlap.
 *
 * Unit: { text, start, end, key, script, kind, components, conjunct,
 *         consonants, halant }
 *   components  [{ char, role, position?, start, end }] for Devanagari
 *               clusters and Latin letters with marks; [] otherwise.
 *   conjunct    true when two or more consonants are joined by virama.
 *   halant      true when the cluster ends in a visible virama (half form).
 */
export function splitUnits(text) {
  const source = String(text ?? '');
  const cps = codePoints(source);
  const units = [];
  let i = 0;
  const peek = k => cps[i + k];
  const devaAt = k => (cps[i + k] ? devanagariClass(cps[i + k].cp) : null);

  while (i < cps.length) {
    const first = cps[i];
    const deva = devanagariClass(first.cp);
    const components = [];
    let kind;
    let script;
    let consonants = 0;
    let halant = false;
    const take = (role, position) => {
      const c = cps[i];
      components.push({ char: c.char, role, ...(position ? { position } : null), start: c.start, end: c.end });
      i++;
    };

    if (deva && (deva.cls === 'consonant' || deva.cls === 'vowel')) {
      script = SCRIPT.DEVANAGARI;
      kind = UNIT_KIND.CLUSTER;
      if (deva.cls === 'consonant') {
        take(ROLE.BASE);
        consonants = 1;
        if (devaAt(0) && devaAt(0).cls === 'nukta') take(ROLE.NUKTA, POSITION.BELOW);
        // Conjuncts: consonant (nukta)? (virama joiner? consonant (nukta)?)*
        while (devaAt(0) && devaAt(0).cls === 'virama') {
          take(ROLE.VIRAMA, POSITION.BELOW);
          halant = true;
          if (peek(0) && (peek(0).cp === ZWJ || peek(0).cp === ZWNJ)) take(ROLE.JOINER);
          if (devaAt(0) && devaAt(0).cls === 'consonant') {
            take(ROLE.BASE);
            consonants++;
            halant = false;
            if (devaAt(0) && devaAt(0).cls === 'nukta') take(ROLE.NUKTA, POSITION.BELOW);
          } else {
            break;
          }
        }
      } else {
        take(ROLE.BASE);
        if (devaAt(0) && devaAt(0).cls === 'nukta') take(ROLE.NUKTA, POSITION.BELOW);
      }
      // Dependent signs: matras, modifiers, marks (and a stray nukta).
      for (;;) {
        const d = devaAt(0);
        if (d && d.cls === 'matra' && consonants > 0 && !halant) take(ROLE.MATRA, d.position);
        else if (d && d.cls === 'modifier') take(ROLE.MODIFIER, d.position);
        else if (d && (d.cls === 'mark' || d.cls === 'nukta')) take(d.cls === 'nukta' ? ROLE.NUKTA : ROLE.MARK, d.position);
        else if (d && d.cls === 'virama' && consonants > 0 && !halant) {
          take(ROLE.VIRAMA, POSITION.BELOW);
          halant = true;
        } else break;
      }
    } else if (deva && ['matra', 'modifier', 'nukta', 'virama', 'mark'].includes(deva.cls)) {
      // A vowel sign or mark with nothing to attach to (e.g. after a space).
      script = SCRIPT.DEVANAGARI;
      kind = UNIT_KIND.ORPHAN_MARK;
      while (devaAt(0) && ['matra', 'modifier', 'nukta', 'virama', 'mark'].includes(devaAt(0).cls)) {
        take(ROLE.MARK, devaAt(0).position);
      }
    } else if (deva) {
      script = SCRIPT.DEVANAGARI;
      kind =
        deva.cls === 'digit'
          ? UNIT_KIND.DIGIT
          : deva.cls === 'punctuation'
          ? UNIT_KIND.PUNCTUATION
          : UNIT_KIND.SIGN;
      take(ROLE.BASE);
      while (devaAt(0) && (devaAt(0).cls === 'modifier' || devaAt(0).cls === 'mark')) take(ROLE.MARK, devaAt(0).position);
    } else if (isLatinMark(first.cp)) {
      script = SCRIPT.LATIN;
      kind = UNIT_KIND.ORPHAN_MARK;
      while (peek(0) && isLatinMark(peek(0).cp)) take(ROLE.MARK);
    } else {
      ({ script, kind } = simpleKind(first.cp));
      take(ROLE.BASE);
      // Grapheme extension: accents, variation selectors, emoji modifiers
      // and ZWJ sequences stay with their base.
      for (;;) {
        const n = peek(0);
        if (!n || kind === UNIT_KIND.SPACE) break;
        if (isLatinMark(n.cp)) take(ROLE.MARK);
        else if (isVariationOrModifier(n.cp)) take(ROLE.MARK);
        else if (n.cp === ZWJ && peek(1) && !devanagariClass(peek(1).cp)) {
          take(ROLE.JOINER);
          take(ROLE.BASE);
        } else break;
      }
    }

    const start = first.start;
    const end = components.length ? components[components.length - 1].end : first.end;
    const unitText = source.slice(start, end);
    // Plain one-code-point units (spaces, punctuation …) need no parts list.
    const plain = components.length === 1 && components[0].role === ROLE.BASE && kind !== UNIT_KIND.CLUSTER;
    units.push({
      text: unitText,
      start,
      end,
      key: lookupKey(unitText),
      script,
      kind,
      components: plain ? [] : components,
      conjunct: consonants > 1,
      consonants,
      halant,
    });
  }
  return units;
}

/** The unit containing UTF-16 offset `offset` (or null past the end). */
export function unitAt(units, offset) {
  let lo = 0;
  let hi = units.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const u = units[mid];
    if (offset < u.start) hi = mid - 1;
    else if (offset >= u.end) lo = mid + 1;
    else return u;
  }
  return null;
}

/**
 * Snaps a text range outward to whole units, so a selection or a break
 * never cuts a cluster ("कि" is selected, formatted and wrapped whole).
 */
export function snapRangeToUnits(units, start, end) {
  const a = unitAt(units, start);
  const b = end > start ? unitAt(units, end - 1) : a;
  return { start: a ? a.start : start, end: b ? b.end : end };
}

/** Components of a cluster in the order they are drawn (pre-base signs first). */
export function drawingOrder(unit) {
  const pre = unit.components.filter(c => c.position === POSITION.PRE && c.role === ROLE.MATRA);
  return [...pre, ...unit.components.filter(c => !pre.includes(c))];
}
