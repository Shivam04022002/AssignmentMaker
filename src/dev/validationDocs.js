/**
 * Test documents for checking the app on a real device (validation tools):
 * the exact poem from the device screenshot, documents of 500–5,000
 * characters, multi-page documents, pages with 100–1,000 freehand strokes,
 * and a page that shows natural corrections. They are ordinary documents,
 * saved to the library, so they are opened, edited and exported normally.
 */
import { createDocument } from '../models/document';
import { finishStroke, strokeStyle } from '../ink/strokes';
import { PAGE_BREAK, generatePageId } from '../utils/pagination';
import { createRandom } from '../utils/variation';

export const POEM = [
  'The night slips quietly away,',
  'And wakes the gold and blue of day.',
  'A little bird begins to sing,',
  'And shakes the dewdrop from its wing.',
  'The flowers lift their heads to see',
  'The light dance softly through the tree,',
  'And all the world is bright and new,',
  'With morning waiting there for you.',
].join('\n');

const PROSE =
  'Working capital management refers to the strategic process of managing a company’s short-term assets and liabilities to ensure it has sufficient liquidity to operate efficiently. ';

/** Letters, capitals, digits and punctuation, for the visual checklist. */
export const CHECKLIST = [
  'a e g r s t n m y f h l — aaaa eeee gggg rrrr ssss tttt',
  'A T W L B M — Alpha Tango Whisky Lima Bravo Mike',
  '0 1 2 3 4 5 6 7 8 9 — 2024, 87%, 12/05',
  'Punctuation: . , ? ! : ; ( ) - % — Why? Yes! (a) 3:4; end.',
].join('\n');

function prose(chars) {
  return PROSE.repeat(Math.ceil(chars / PROSE.length)).slice(0, chars).trim();
}

/** Freehand strokes spread over the first page (pen and marker mixed). */
function strokesFor(count, seed = 1) {
  const r = createRandom(seed);
  const out = [];
  for (let i = 0; i < count; i++) {
    const marker = i % 7 === 0;
    const x0 = 30 + r() * 280;
    const y0 = 60 + r() * 420;
    const n = 8 + Math.floor(r() * 18);
    const points = [];
    for (let k = 0; k < n; k++) {
      points.push(x0 + k * (2 + r() * 2), y0 + Math.sin(k / 2 + r()) * 4);
    }
    const style = marker
      ? strokeStyle('marker', { color: ['#FFE14D', '#FF8FC7', '#7FE0A6', '#8EC9FF'][i % 4], width: 16 })
      : strokeStyle('pen', { color: i % 2 ? '#123A8C' : '#151515', width: [1, 2, 3, 4, 6, 8][i % 6] });
    out.push(finishStroke({ points, pressure: null }, style, `v${seed}-${i}`));
  }
  return out;
}

/** The test documents: { key, title, build() → document }. */
export const VALIDATION_DOCS = [
  { key: 'poem', title: 'Validation: poem', build: () => ({ content: POEM }) },
  { key: 'checklist', title: 'Validation: letters & punctuation', build: () => ({ content: CHECKLIST }) },
  ...[500, 1000, 2500, 5000].map(n => ({
    key: `chars-${n}`,
    title: `Validation: ${n} characters`,
    build: () => ({ content: prose(n) }),
  })),
  ...[2, 3, 5].map(n => ({
    key: `pages-${n}`,
    title: `Validation: ${n} pages`,
    build: () => {
      const pageIds = Array.from({ length: n }, () => generatePageId());
      return {
        content: Array.from({ length: n }, (_, i) => `Page ${i + 1}\n${prose(700)}`).join(PAGE_BREAK),
        pageIds,
        ink: { [`${pageIds[0]}#0`]: strokesFor(12, n), [`${pageIds[n - 1]}#0`]: strokesFor(8, n + 1) },
      };
    },
  })),
  ...[100, 500, 1000].map(n => ({
    key: `strokes-${n}`,
    title: `Validation: ${n} strokes`,
    build: () => ({ content: POEM, pageIds: ['page-1'], ink: { 'page-1#0': strokesFor(n, n) } }),
  })),
  {
    key: 'corrections',
    title: 'Validation: natural corrections',
    build: () => ({ content: prose(2200), naturalCorrections: true }),
  },
];

/** A new document for a validation entry (blue pen, ruled paper, margin). */
export function buildValidationDocument(entry) {
  return {
    ...createDocument({ pageType: 'lined', pen: 'blue' }),
    title: entry.title,
    ...entry.build(),
  };
}
