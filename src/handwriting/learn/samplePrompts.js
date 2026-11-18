/**
 * The five reference samples a personal handwriting is learned from.
 *
 * Characters are identified by aligning what was written to known text —
 * there is no OCR. Slots 1–3 have prescribed text the user copies by hand;
 * slots 4–5 are free writing with an optional typed transcription (without
 * one, a free sample contributes measurements only, not letterforms).
 * Slots 4–5 also offer a suggested text (Phase 13): copying it, the user
 * can take it as the transcription with one tap. Devanagari is learned
 * cluster by cluster — ता is its own shape, never assembled from त and ा —
 * so the Hindi suggestion is ordinary sentences dense in the clusters
 * everyday text uses most (ता ना दी मा है ने से में …) and the danda।
 * Slot 6 is an optional extra sample requested for missing characters.
 */

/** Both alphabets, then letters that vary a lot, written several times. */
export const LATIN_ALPHABET = [
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  'abcdefghijklmnopqrstuvwxyz',
  'aaa eee ooo rrr sss ttt nnn ggg yyy fff kkk',
].join('\n');

/**
 * Hindi alphabet sample: independent vowels, consonants, nukta letters,
 * vowel signs on क (pre-, post-, above- and below-base), anusvara,
 * chandrabindu, visarga, an explicit halant and common conjuncts.
 */
export const DEVANAGARI_ALPHABET = [
  'अ आ इ ई उ ऊ ऋ ए ऐ ओ औ अं अः',
  'क ख ग घ ङ च छ ज झ ञ ट ठ ड ढ ण',
  'त थ द ध न प फ ब भ म य र ल व श ष स ह',
  'क़ ख़ ग़ ज़ ड़ ढ़ फ़',
  'का कि की कु कू कृ के कै को कौ कं कँ कः क्',
  'क्ष त्र ज्ञ श्र द्ध प्र क्र स्त',
].join('\n');

export const LATIN_DIGITS_TEXT = [
  '0123456789',
  // Punctuation inside words, as it is used (Phase 13): a row of lone marks
  // ". , ; : …" gives no word spacing to tell marks apart, and none was learned.
  'Yes. No, maybe; at 5: why? Wow!',
  '(soon) re-do "hi" it\'s a/b 50% A&B 2+2=4 ₹10',
  'The quick brown fox jumps over the lazy dog.',
].join('\n');

/**
 * Suggested Hindi paragraph (slot 4): everyday sentences chosen for the
 * consonant–matra clusters ordinary Hindi uses most, which the alphabet
 * sample (matras shown on क only) cannot teach, and the danda. Chosen by
 * hand, not from a measured corpus frequency list: on a held-out passage
 * of ordinary Hindi it raises the share of clusters the prompts can teach
 * from 46 % to 77 % (synthetic text audit; see the Phase 13 report).
 */
export const HINDI_SUGGESTED = [
  'माता जी ने दादी को चाय दी और नाना जी बाज़ार गए।',
  'हम सब मिलकर पढ़ते हैं, खेलते हैं और गाना गाते हैं।',
  'यह मेरा घर है, यहाँ एक बड़ा पेड़ भी है।',
  'आज मौसम अच्छा था, बच्चे बाहर खेल रहे थे।',
  'क्या तुम कल स्कूल जाओगे? हाँ, मैं ज़रूर जाऊँगा।',
  'सुबह माँ ने लाल साड़ी पहनी और दीया जलाया।',
  'रेलगाड़ी से भाई शहर लौटा, रास्ते में बारिश होती रही।',
  'पानी पीना, समय पर सोना और रोज़ पढ़ना अच्छी आदतें हैं।',
].join('\n');

/** Suggested mixed paragraph (slot 5): English and Hindi as they are mixed in notes, with numbers and a dash. */
export const MIXED_SUGGESTED = [
  'Today I went to the market with my brother.',
  'हमने सब्ज़ी, फल और दूध खरीदा।',
  'The bill was ₹ 245 — not too much!',
  'घर आकर माँ ने खाना बनाया।',
  'After dinner we watched a film on TV.',
  'फ़िल्म बहुत अच्छी थी, सबको पसंद आई।',
  'Next week, on 12 June, we will visit our grandparents.',
  'वहाँ हम दो दिन रुकेंगे।',
].join('\n');

/** English words and short sentences: common letter pairs and word shapes (Phase 23). */
export const ENGLISH_WORDS = [
  'apple bridge candle dream giant hello jump kite lemon',
  'music night orange puzzle queen river sunny table under',
  'voice water box yellow zebra quick brown fox lazy',
  'My name is Sam. I like to read books.',
  'We will meet at the park after school.',
].join('\n');

/** An everyday English paragraph (Phase 23). */
export const ENGLISH_EVERYDAY = [
  'Today the weather was bright and warm.',
  'My sister and I walked to the market.',
  'We bought fresh fruit, bread and milk.',
  'In the evening we finished our homework.',
  'Tomorrow we will visit our grandparents.',
].join('\n');

/** Hindi words and short sentences: matras, nukta letters and conjuncts in use (Phase 23). */
export const HINDI_WORDS = [
  'किताब कलम पानी घर स्कूल बाज़ार',
  'मेहनत दोस्त परिवार त्योहार ख़ुशी',
  'बच्चे खेलते हैं और गाना गाते हैं।',
  'मैं रोज़ सुबह पढ़ाई करता हूँ।',
  'क्या आप कल आएँगे? हाँ, ज़रूर।',
].join('\n');

/** Hindi numbers and punctuation, without any Latin text (Phase 23). */
export const HINDI_NUMBERS = [
  '० १ २ ३ ४ ५ ६ ७ ८ ९',
  'एक दो तीन चार पाँच छह सात आठ नौ दस',
  'आज तारीख़ १२ है। कल १३ होगी।',
  'क्या, कब, कहाँ? हाँ! नहीं।',
].join('\n');

/**
 * Maths practice pages (Phase 22): digits, the operators and signs of school
 * maths, a fraction, a power and a root, and number words. π is left out on
 * purpose: Greek letters are outside the scripts a profile can learn.
 */
export const MATHS_ENGLISH = [
  '0 1 2 3 4 5 6 7 8 9',
  '12 + 7 = 19   45 − 18 = 27',
  '6 × 8 = 48   72 ÷ 9 = 8',
  '(3 + 4) × 2 = 14   3/4 = 0.75   50%',
  '5 > 3   2 < 9   7 ≤ 7   x ≥ 0   √16 = 4   x² + y²',
  'one two three four five six seven eight nine ten',
].join('\n');

/** Maths in Hindi: the same signs, Devanagari digits and Hindi number words. */
export const MATHS_HINDI = [
  '0 1 2 3 4 5 6 7 8 9',
  '० १ २ ३ ४ ५ ६ ७ ८ ९',
  'एक दो तीन चार पाँच छह सात आठ नौ दस',
  '15 + 27 = 42   100 − 35 = 65',
  '9 × 6 = 54   81 ÷ 9 = 9   (2 + 3) × 4 = 20',
  '3/4 = 0.75   50%   5 > 3   2 < 9   7 ≤ 8   √16 = 4',
  'जोड़ + घटाना − गुणा × भाग ÷ बराबर =',
].join('\n');

export const SAMPLE_SLOTS = [
  {
    slot: 1,
    category: 'latin-alphabet',
    title: 'English alphabet',
    scripts: ['Latn'],
    transcription: 'prescribed',
    prompt: LATIN_ALPHABET,
    instructions: [
      'Copy the text below in your normal handwriting, on plain or ruled paper.',
      'Write each letter separately and leave a small space between letters.',
      'The last line repeats letters on purpose: write each one as you naturally would, not identically.',
    ],
  },
  {
    slot: 2,
    category: 'devanagari-alphabet',
    title: 'Hindi alphabet',
    scripts: ['Deva'],
    transcription: 'prescribed',
    prompt: DEVANAGARI_ALPHABET,
    instructions: [
      'Copy the Hindi text below in your natural handwriting, with the headline (shirorekha) as you usually draw it.',
      'Leave enough space between characters so each one can be told apart.',
      'Write the vowel signs on क exactly as shown: they show how you attach matras.',
    ],
  },
  {
    slot: 3,
    category: 'latin-digits-text',
    title: 'Numbers, punctuation and a sentence',
    scripts: ['Latn'],
    transcription: 'prescribed',
    prompt: LATIN_DIGITS_TEXT,
    instructions: [
      'Copy the digits, punctuation and sentence below.',
      'Write the sentence the way you normally write words, not letter by letter.',
    ],
  },
  {
    slot: 4,
    category: 'devanagari-text',
    title: 'Hindi paragraph',
    scripts: ['Deva'],
    transcription: 'optional',
    prompt: null,
    request: 'A short Hindi paragraph (5–8 lines) of ordinary text with vowel signs, punctuation (।) and a few conjuncts such as क्ष, त्र or प्र.',
    suggestion: HINDI_SUGGESTED,
    instructions: [
      'Write naturally, the way you would in a notebook.',
      'Copying the suggested text teaches the letter combinations everyday Hindi uses most (ता, ना, दी, मा …).',
      'Optional: type exactly what you wrote, or tap “I copied the suggested text”. Without a transcription, this sample only helps measure your size, slant and spacing.',
    ],
  },
  {
    slot: 5,
    category: 'natural-text',
    title: 'Natural writing (English and/or Hindi)',
    scripts: ['Latn', 'Deva'],
    scriptsSelectable: true,
    transcription: 'optional',
    prompt: null,
    request: 'A longer paragraph (8–12 lines) in your usual mix of English and Hindi.',
    suggestion: MIXED_SUGGESTED,
    instructions: [
      'Write at your normal speed: this sample shows how your handwriting really flows.',
      'Choose which scripts the page contains.',
      'Optional: type exactly what you wrote, or tap “I copied the suggested text”. Without a transcription, this sample only helps measure your size, slant and spacing.',
    ],
  },
];

/**
 * The pages a photo can show. Since Phase 23 the chosen handwriting type
 * (handwritingTypes.js) fixes which page each photo shows: the user copies
 * it by hand, exactly, and that text is what the photo's letters are
 * aligned to (there is no OCR). No photo is free writing.
 */
export const PRACTICE_PAGES = [
  { id: 'latin-alphabet', title: 'English alphabet', scripts: ['Latn'], text: LATIN_ALPHABET, category: 'latin-alphabet' },
  { id: 'devanagari-alphabet', title: 'Hindi alphabet', scripts: ['Deva'], text: DEVANAGARI_ALPHABET, category: 'devanagari-alphabet' },
  { id: 'latin-digits-text', title: 'Numbers, punctuation and a sentence', scripts: ['Latn'], text: LATIN_DIGITS_TEXT, category: 'latin-digits-text' },
  { id: 'hindi-everyday', title: 'Everyday Hindi', scripts: ['Deva'], text: HINDI_SUGGESTED, category: 'devanagari-text' },
  { id: 'mixed-everyday', title: 'English and Hindi together', scripts: ['Latn', 'Deva'], text: MIXED_SUGGESTED, category: 'natural-text' },
  { id: 'english-words', title: 'English words and sentences', scripts: ['Latn'], text: ENGLISH_WORDS, category: 'natural-text' },
  { id: 'english-everyday', title: 'Everyday English', scripts: ['Latn'], text: ENGLISH_EVERYDAY, category: 'natural-text' },
  { id: 'hindi-words', title: 'Hindi words and sentences', scripts: ['Deva'], text: HINDI_WORDS, category: 'devanagari-text' },
  { id: 'hindi-numbers', title: 'Hindi numbers and punctuation', scripts: ['Deva'], text: HINDI_NUMBERS, category: 'devanagari-text' },
  { id: 'maths-english', title: 'Maths in English', scripts: ['Latn'], text: MATHS_ENGLISH, category: 'maths' },
  { id: 'maths-hindi', title: 'Maths in Hindi', scripts: ['Deva'], text: MATHS_HINDI, category: 'maths' },
];
export const practicePage = id => PRACTICE_PAGES.find(p => p.id === id) || null;

/** The optional extra sample for missing characters (not part of the five). */
export const EXTRA_SLOT = { slot: 6, category: 'extra', title: 'Missing characters', transcription: 'prescribed', prompt: null };

export const SAMPLE_CATEGORIES = [...SAMPLE_SLOTS.map(s => s.category), EXTRA_SLOT.category, 'maths'];
export const REQUIRED_SAMPLE_COUNT = SAMPLE_SLOTS.length;
