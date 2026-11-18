/**
 * Expected text for transcription-guided segmentation: the known text of a
 * sample (prescribed prompt or the user's transcription) split into lines,
 * words and rendering units, each keeping its exact range in the original
 * text (which is never rewritten).
 *
 * Units come from textUnits.splitUnits — the same units the renderer will
 * use — so a Latin letter keeps its accents and a Devanagari akshara
 * (conjunct, matras, nukta, anusvara …) is one unit.
 *
 * Each unit also gets *priors* used only to choose among boundaries the
 * pixels offer and to align words — never to place a box by themselves:
 *   width      typical advance in x-heights (WIDTH_PRIORS)
 *   tall/deep  ascender or capital / descender
 *   detached   expects a separate mark (i/j dot, accent, punctuation)
 *   marks      Devanagari: dependent signs above / below / before / after
 */
import { POSITION, ROLE, splitUnits, UNIT_KIND } from './textUnits';

/**
 * Width priors (x-heights, including the gap to the next letter). Rough by
 * design: handwriting varies a lot; they only rank alternatives.
 */
export const WIDTH_PRIORS = {
  latinNarrow: 0.42, // i j l t f r I J 1 ! | :
  latinNormal: 0.72,
  latinWide: 1.05, // m w M W
  capital: 0.9,
  digit: 0.72,
  punctuation: 0.32, // . , ; : ' " ! ?
  symbol: 0.8,
  devaConsonant: 0.95,
  devaConjunctExtra: 0.55, // each further consonant of a conjunct
  devaSideMatra: 0.35, // ि ा ी ो ौ (beside the base)
  devaVowel: 1.0,
  devaSign: 0.5, // danda, avagraha …
  other: 0.8,
};

const NARROW = new Set('ijltfrIJ1!|:;'.split(''));
const WIDE = new Set('mwMW'.split(''));
const TALL = new Set('bdfhklt'.split(''));
const DEEP = new Set('gjpqy'.split(''));
const PUNCT_SMALL = new Set(".,;:'\"!?".split(''));

/** Priors for one rendering unit (see module comment). */
export function unitPriors(u) {
  const base = u.components.length ? u.components[0].char : u.text;
  if (u.script === 'Deva' && u.kind === UNIT_KIND.CLUSTER) {
    const marks = { pre: false, above: false, below: false, post: false };
    for (const c of u.components) {
      if (c.role === ROLE.BASE) continue;
      if (c.position === POSITION.PRE) marks.pre = true;
      else if (c.position === POSITION.ABOVE) marks.above = true;
      else if (c.position === POSITION.BELOW) marks.below = true;
      else if (c.position === POSITION.POST) marks.post = true;
    }
    const width =
      (u.consonants ? WIDTH_PRIORS.devaConsonant + (u.consonants - 1) * WIDTH_PRIORS.devaConjunctExtra : WIDTH_PRIORS.devaVowel) +
      (marks.pre ? WIDTH_PRIORS.devaSideMatra : 0) +
      (marks.post ? WIDTH_PRIORS.devaSideMatra : 0);
    return { width, tall: marks.above, deep: marks.below, detached: marks.above || marks.below, marks, conjunct: u.conjunct, halant: u.halant };
  }
  let width = WIDTH_PRIORS.other;
  if (u.kind === UNIT_KIND.LETTER) {
    if (NARROW.has(base)) width = WIDTH_PRIORS.latinNarrow;
    else if (WIDE.has(base)) width = WIDTH_PRIORS.latinWide;
    else if (base >= 'A' && base <= 'Z') width = WIDTH_PRIORS.capital;
    else width = WIDTH_PRIORS.latinNormal;
  } else if (u.kind === UNIT_KIND.DIGIT) width = u.script === 'Deva' ? WIDTH_PRIORS.devaConsonant * 0.7 : base === '1' ? WIDTH_PRIORS.latinNarrow : WIDTH_PRIORS.digit;
  else if (u.kind === UNIT_KIND.PUNCTUATION) width = PUNCT_SMALL.has(base) ? WIDTH_PRIORS.punctuation : u.script === 'Deva' ? WIDTH_PRIORS.devaSign : 0.5;
  else if (u.kind === UNIT_KIND.SIGN) width = WIDTH_PRIORS.devaSign;
  else if (u.kind === UNIT_KIND.SYMBOL) width = WIDTH_PRIORS.symbol;
  const tall = TALL.has(base) || (base >= 'A' && base <= 'Z') || (base >= '0' && base <= '9') || base === 'i' || base === 'j';
  return {
    width,
    tall,
    deep: DEEP.has(base) || base === ',' || base === ';',
    detached: base === 'i' || base === 'j' || base === '!' || base === '?' || base === ';' || base === ':' || u.components.length > 1,
    marks: null,
    conjunct: false,
    halant: false,
  };
}

/**
 * Splits known text into { lines: [{ index, start, end, words }], words,
 * units, scripts }. A word: { index, line, start, end, text, units,
 * width (prior, x-heights), script ('Latn' | 'Deva' | 'mixed' | other) }.
 * A unit: the textUnits unit plus { word, indexInWord, priors }.
 * All ranges are UTF-16 offsets into `text` exactly as given.
 */
export function prepareExpectedText(text) {
  const source = typeof text === 'string' ? text : '';
  const lines = [];
  const words = [];
  const units = [];
  let lineStart = 0;
  source.split('\n').forEach(lineText => {
    const line = { index: lines.length, start: lineStart, end: lineStart + lineText.length, words: [] };
    const re = /[^ \t\r]+/g;
    let m;
    while ((m = re.exec(lineText))) {
      const start = lineStart + m.index;
      const word = { index: words.length, line: line.index, start, end: start + m[0].length, text: m[0], units: [] };
      splitUnits(m[0]).forEach((u, k) => {
        const unit = { ...u, start: u.start + start, end: u.end + start, word: word.index, indexInWord: k, priors: unitPriors(u) };
        unit.components = u.components.map(c => ({ ...c, start: c.start + start, end: c.end + start }));
        word.units.push(unit);
        units.push(unit);
      });
      const scripts = new Set(word.units.map(u => u.script).filter(s => s !== 'Zyyy'));
      word.script = scripts.size === 1 ? [...scripts][0] : scripts.size ? 'mixed' : 'Zyyy';
      word.width = word.units.reduce((a, u) => a + u.priors.width, 0);
      words.push(word);
      line.words.push(word.index);
    }
    if (line.words.length) lines.push(line); // index = position among lines that have words
    lineStart += lineText.length + 1;
  });
  return { text: source, lines, words, units, scripts: [...new Set(units.map(u => u.script))] };
}
