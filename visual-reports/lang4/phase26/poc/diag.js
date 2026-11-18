/* eslint-env node */
/**
 * Why does the engine extract 136 glyphs from the print page and none from the
 * cursive pages? Per page (typed transcription as the text): alignment summary,
 * unit states, rejection codes, boundary/alignment confidence of the units in
 * clearly aligned words, and the reasons the engine gives.
 */
const fs = require('fs');
const path = require('path');
const { analyzeSample } = require('./lib/handwriting/learn/analyzeSample');
const { makeRaster } = require('./lib/handwriting/learn/raster');

const HERE = __dirname;
const MANIFEST = JSON.parse(fs.readFileSync('D:/AssignmentMaker/__tests__/realTruth/reference.manifest.json', 'utf8'));
const META = JSON.parse(fs.readFileSync(path.join(HERE, 'data/meta.json'), 'utf8'));

function raster(name) {
  const { width, height } = META[name];
  const bytes = fs.readFileSync(path.join(HERE, 'data', `${name}.gray`));
  return makeRaster(width, height, new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length));
}
const hist = (xs, f) =>
  xs.reduce((h, x) => {
    h[f(x)] = (h[f(x)] || 0) + 1;
    return h;
  }, {});
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(0)}%` : '—');
const q = (arr, p) => (arr.length ? [...arr].sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor(p * arr.length))] : null);

(async () => {
  const out = {};
  const pages = process.argv.length > 2 ? process.argv.slice(2) : ['handwriting_03', 'handwriting_02', 'handwriting_01'];
  for (const page of pages) {
    const text = MANIFEST.samples.find(s => s.file === `${page.replace(/x2$/, '')}.png`).transcription;
    const r = await analyzeSample(raster(page), { slot: 5, knownText: text, scripts: ['Latn'], extract: true, yieldFn: async () => {} });
    const al = r.alignment;
    const units = al.observations.units;
    const letters = units.filter(u => u.kind === 'letter' || u.kind === 'digit' || u.kind === 'punctuation');
    const states = hist(units, u => u.state);
    const rej = hist(r.extraction.units.filter(u => u.status === 'rejected'), u => u.code);
    const alignedWords = new Set(al.observations.words.filter(w => w.state === 'aligned').map(w => w.index !== undefined ? w.index : w.word));
    // units inside clearly aligned words
    const inAligned = units.filter(u => u.wordState === 'aligned' || alignedWords.has(u.word));
    const bScores = inAligned.map(u => (u.boundaryConfidence ? u.boundaryConfidence.score : null)).filter(x => x !== null);
    const aScores = inAligned.map(u => (u.alignmentConfidence ? u.alignmentConfidence.score : null)).filter(x => x !== null);
    const reasons = hist(inAligned.filter(u => u.state === 'ambiguous').flatMap(u => (u.reasons || []).map(s => String(s).replace(/[\d.]+/g, '#').slice(0, 70))), s => s);
    const topReasons = Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const seg = r.segmentation;
    out[page] = {
      quality: { usable: r.quality.usable, score: r.quality.score && r.quality.score.score, issues: r.quality.issues.map(i => i.code) },
      segmentation: { lines: seg.lines.length, expectedLines: seg.diagnostics.expectedLines, words: seg.words.length, medianXHeight: seg.diagnostics.medianXHeight, headlines: seg.diagnostics.possibleHeadlines },
      skew: r.skew,
      alignment: al.summary,
      unitStates: states,
      rejections: rej,
      inAlignedWords: { units: inAligned.length, aligned: inAligned.filter(u => u.state === 'aligned').length, boundaryMedian: q(bScores, 0.5), boundaryP25: q(bScores, 0.25), alignmentMedian: q(aScores, 0.5), belowBoundaryOk: bScores.filter(s => s < 0.45).length, belowAlignmentOk: aScores.filter(s => s < 0.5).length },
      topAmbiguousReasons: topReasons,
      extracted: r.extraction.summary,
    };
    console.log(`\n=== ${page}`);
    console.log(`quality usable ${out[page].quality.usable} score ${out[page].quality.score} issues ${JSON.stringify(out[page].quality.issues)} · lines ${seg.lines.length} (expected ${seg.diagnostics.expectedLines}) · words ${seg.words.length} · x-height ${seg.diagnostics.medianXHeight} px · skew ${JSON.stringify(r.skew)}`);
    console.log(`alignment: words ${JSON.stringify(al.summary.words)} of ${al.summary.expectedWords}; units ${JSON.stringify(al.summary.units)} of ${al.summary.expectedUnits}`);
    console.log(`unit states ${JSON.stringify(states)} · letters ${letters.length}`);
    console.log(`extracted ${r.extraction.summary.extracted} of ${r.extraction.summary.considered}; rejections ${JSON.stringify(rej)}`);
    const ia = out[page].inAlignedWords;
    console.log(`units inside clearly aligned words: ${ia.units}, of which aligned ${ia.aligned} (${pct(ia.aligned, ia.units)}); boundary score median ${ia.boundaryMedian} (p25 ${ia.boundaryP25}), below 0.45: ${ia.belowBoundaryOk}; alignment score median ${ia.alignmentMedian}, below 0.5: ${ia.belowAlignmentOk}`);
    console.log('top reasons for ambiguous units in aligned words:');
    for (const [s, n] of topReasons) console.log(`   ${String(n).padStart(4)}  ${s}`);
    const sample = inAligned.find(u => u.state === 'ambiguous');
    if (sample) console.log('example ambiguous unit:', JSON.stringify({ text: sample.text, word: sample.word, state: sample.state, boundary: sample.boundaryConfidence, alignment: sample.alignmentConfidence, reasons: (sample.reasons || []).slice(0, 4) }).slice(0, 900));
  }
  fs.writeFileSync(path.join(HERE, process.argv.length > 2 ? 'out/diag-x2.json' : 'out/diag.json'), JSON.stringify(out, null, 1));
})().catch(e => {
  console.error(e);
  process.exit(1);
});
