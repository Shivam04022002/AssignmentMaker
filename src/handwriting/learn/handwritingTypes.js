/**
 * The six kinds of personal handwriting (Phase 22). The user chooses one,
 * then photographs five pages of the same person's handwriting for it; all
 * the photos together build ONE profile of that type. Each type carries the
 * glyph and the one-line description the type chooser shows (Phase 24).
 *
 * Phase 23: the type controls the whole wizard. It fixes the page each of
 * the five photos shows (`pages`, all in the type's own scripts — an
 * English handwriting is never shown Hindi text), whether the profile must
 * write maths (digits and maths symbols, a requirement of its own), and
 * the scripts it is checked for. Photos 1–3 alone cover every required
 * character; 4–5 add more examples. Where a type has fewer distinct pages,
 * a page repeats: a second handwritten copy gives more letter variants.
 * A photo's page is the exact text its letters are aligned to (no OCR).
 */

// Phase 24: exactly five reference photos, one per page of the type.
export const MIN_PHOTOS = 5;
export const MAX_PHOTOS = 5;

export const HANDWRITING_TYPES = [
  { id: 'english', title: 'English', glyph: 'ABC', subtitle: 'English letters, numbers, punctuation and sentences.', scripts: ['Latn'], maths: false, pages: ['latin-alphabet', 'english-words', 'latin-digits-text', 'english-everyday', 'latin-alphabet'] },
  { id: 'hindi', title: 'Hindi', glyph: 'अ', subtitle: 'Hindi letters, numbers, punctuation and sentences.', scripts: ['Deva'], maths: false, pages: ['devanagari-alphabet', 'hindi-words', 'hindi-numbers', 'hindi-everyday', 'devanagari-alphabet'] },
  { id: 'english-hindi', title: 'English + Hindi', glyph: 'ABC अ', subtitle: 'Both English and Hindi writing.', scripts: ['Latn', 'Deva'], maths: false, pages: ['latin-alphabet', 'devanagari-alphabet', 'latin-digits-text', 'hindi-everyday', 'mixed-everyday'] },
  { id: 'english-maths', title: 'English + Maths', glyph: 'ABC +', subtitle: 'English letters, digits and maths symbols.', scripts: ['Latn'], maths: true, pages: ['latin-alphabet', 'maths-english', 'latin-digits-text', 'english-words', 'english-everyday'] },
  { id: 'hindi-maths', title: 'Hindi + Maths', glyph: 'अ +', subtitle: 'Hindi letters, digits and maths symbols.', scripts: ['Deva'], maths: true, pages: ['devanagari-alphabet', 'maths-hindi', 'hindi-words', 'hindi-everyday', 'hindi-numbers'] },
  { id: 'hindi-english-maths', title: 'Hindi + English + Maths', glyph: 'ABC अ +', subtitle: 'Both scripts with digits and maths symbols.', scripts: ['Latn', 'Deva'], maths: true, pages: ['latin-alphabet', 'devanagari-alphabet', 'maths-english', 'maths-hindi', 'mixed-everyday'] },
];

export const handwritingType = id => HANDWRITING_TYPES.find(t => t.id === id) || null;

/** The (pseudo-)scripts a type is checked for: its scripts, plus 'Math' for a maths type. */
export const checkedScripts = type => (type ? (type.maths ? [...type.scripts, 'Math'] : [...type.scripts]) : []);
