/* eslint-env node */
/**
 * The question that matters for profile learning: when the OCR text (instead of
 * the true text) is handed to the app's own alignment + glyph extraction, which
 * glyphs come out, and how many carry the WRONG label?
 *
 * Runs the real pipeline (transpiled, ./lib) on the real pages twice: with the
 * typed transcription (truth) and with the recognised text, then matches the
 * extracted glyphs by position (IoU ≥ 0.5 in the same analysis frame).
 *
 * Variants of recognised text:
 *   words  — the recogniser on the truth word boxes (best case: perfect word
 *            segmentation), lines rebuilt from out/words.csv
 *   page   — the full PP-OCRv5 det + rec result, out/pages.json
 */
const fs = require('fs');
const path = require('path');
const { analyzeSample } = require('./lib/handwriting/learn/analyzeSample');
const { makeRaster } = require('./lib/handwriting/learn/raster');

const HERE = __dirname;
const MANIFEST = JSON.parse(fs.readFileSync('D:/AssignmentMaker/__tests__/realTruth/reference.manifest.json', 'utf8'));
const META = JSON.parse(fs.readFileSync(path.join(HERE, 'data/meta.json'), 'utf8'));
const PAGES = ['handwriting_03', 'handwriting_02', 'handwriting_01'];

function raster(name) {
  const { width, height } = META[name];
  const bytes = fs.readFileSync(path.join(HERE, 'data', `${name}.gray`));
  return makeRaster(width, height, new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length));
}

function csvRows(file) {
  const [head, ...lines] = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  const cols = head.split(',');
  return lines.map(l => {
    // minimal CSV: fields with quotes may contain commas
    const out = [];
    let cur = '';
    let q = false;
    for (const ch of l) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
    out.push(cur);
    return Object.fromEntries(cols.map((c, i) => [c, out[i]]));
  });
}

function wordsText(page) {
  const rows = csvRows(path.join(HERE, 'out/words.csv')).filter(r => r.page === `${page}.png`);
  if (!rows.length) return null;
  const lines = new Map();
  for (const r of rows) (lines.get(+r.line) || lines.set(+r.line, []).get(+r.line)).push(r.got);
  return [...lines.keys()].sort((a, b) => a - b).map(k => lines.get(k).join(' ')).join('\n');
}
function pageText(page) {
  const p = JSON.parse(fs.readFileSync(path.join(HERE, 'out/pages.json'), 'utf8'))[`${page}.png`];
  return p.lines.map(l => l.text).join('\n');
}

// bbox = [x, y, w, h] in the analysis frame
const iou = (a, b) => {
  const x0 = Math.max(a[0], b[0]), y0 = Math.max(a[1], b[1]), x1 = Math.min(a[0] + a[2], b[0] + b[2]), y1 = Math.min(a[1] + a[3], b[1] + b[3]);
  const i = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const u = a[2] * a[3] + b[2] * b[3] - i;
  return u > 0 ? i / u : 0;
};
const box = u => u.observation && u.observation.bbox;

async function run(page, knownText) {
  const r = await analyzeSample(raster(page), { slot: 5, knownText, scripts: ['Latn'], extract: true, yieldFn: async () => {}, source: { width: META[page].width, height: META[page].height } });
  if (r.status !== 'done') throw new Error(`${page}: ${r.status}`);
  const units = r.extraction.units;
  return { units, extracted: units.filter(u => u.status === 'extracted'), summary: r.extraction.summary, alignment: r.alignment && r.alignment.summary };
}

(async () => {
  const report = {};
  for (const page of PAGES) {
    const truthText = MANIFEST.samples.find(s => s.file === `${page}.png`).transcription;
    const truth = await run(page, truthText);
    const truthWithBox = truth.units.filter(u => box(u));
    report[page] = { truth: { extracted: truth.extracted.length, considered: truth.summary.considered } };
    console.log(`\n=== ${page}: truth text → ${truth.extracted.length} of ${truth.summary.considered} glyphs extracted`);
    for (const [variant, text] of [['words', wordsText(page)], ['page', pageText(page)]]) {
      if (text === null) continue;
      const ocr = await run(page, text);
      let same = 0, wrong = 0, unmatched = 0;
      const wrongExamples = [];
      for (const g of ocr.extracted) {
        const b = box(g);
        let best = null, bestIou = 0;
        for (const t of truthWithBox) {
          const v = iou(b, box(t));
          if (v > bestIou) {
            bestIou = v;
            best = t;
          }
        }
        if (!best || bestIou < 0.5) unmatched++;
        else if (best.text === g.text) same++;
        else {
          wrong++;
          if (wrongExamples.length < 8) wrongExamples.push(`${g.text}←ink of “${best.text}” (word ${best.word})`);
        }
      }
      const kept = truth.extracted.length ? same / truth.extracted.length : 0;
      report[page][variant] = { extracted: ocr.extracted.length, considered: ocr.summary.considered, sameLabel: same, wrongLabel: wrong, unmatched, keptOfTruth: +kept.toFixed(3), alignedWords: ocr.alignment && ocr.alignment.words ? ocr.alignment.words.aligned : null, expectedWords: ocr.alignment ? ocr.alignment.expectedWords : null };
      console.log(`  ${variant.padEnd(5)} text → ${ocr.extracted.length} glyphs extracted of ${ocr.summary.considered} considered · words aligned ${report[page][variant].alignedWords}/${report[page][variant].expectedWords}`);
      console.log(`         same label as truth ${same} · WRONG label ${wrong} (${ocr.extracted.length ? ((100 * wrong) / ocr.extracted.length).toFixed(1) : 0}% of extracted) · no truth glyph at that spot ${unmatched} · keeps ${(100 * kept).toFixed(0)}% of the truth-run glyphs`);
      if (wrongExamples.length) console.log(`         e.g. ${wrongExamples.join('; ')}`);
    }
  }
  fs.writeFileSync(path.join(HERE, 'out/harm.json'), JSON.stringify(report, null, 1));
})().catch(e => {
  console.error(e);
  process.exit(1);
});
