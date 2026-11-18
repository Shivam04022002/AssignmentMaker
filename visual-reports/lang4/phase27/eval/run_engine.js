/* eslint-env node */
/**
 * Runs the app's own analysis (segmentation → alignment → glyph extraction) on
 * every sample of a dataset manifest and writes one JSON report — counts,
 * codes, scores and glyph boxes; never pixels (assertPrivate).
 *
 *   node run_engine.js [--manifest m.json] [--dir images/] [--out out/run1]
 *                      [--ocr out/run1/ocr.json] [--scale 2]
 *
 * Defaults: the project's reference set. With --ocr, each sample is analysed a
 * second time with the recognised text instead of the typed one, and the two
 * sets of extracted glyphs are matched by position (IoU ≥ 0.5): same label /
 * WRONG label / unmatched — the number that decides whether OCR text may be
 * trusted for learning.
 */
const fs = require('fs');
const path = require('path');
const { analyzeSample } = require('./lib/src/handwriting/learn/analyzeSample');
const { makeRaster } = require('./lib/src/handwriting/learn/raster');
const { decodePngGray } = require('./lib/__tests__/helpers/pngGray');
const { assertPrivate, scoreAgainstTruth, summarizeAnalysis, truthWords, validateManifest } = require('./lib/__tests__/helpers/realProtocol');
const { datasetProblems, loadManifest } = require('./manifest');

const ROOT = path.resolve(__dirname, '../../../..');
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : null)).filter(Boolean));
const manifestFile = path.resolve(args.manifest || path.join(ROOT, '__tests__/realTruth/reference.manifest.json'));
const imagesDir = path.resolve(args.dir || (args.manifest ? path.dirname(manifestFile) : path.join(ROOT, 'reference')));
const truthDir = path.resolve(args['truth-dir'] || path.dirname(manifestFile));
const outDir = path.resolve(args.out || path.join(__dirname, 'out', `${path.basename(manifestFile, '.json')}-${new Date().toISOString().slice(0, 10)}`));
const ocr = args.ocr ? JSON.parse(fs.readFileSync(path.resolve(args.ocr), 'utf8')) : null;
const scale = args.scale ? Number(args.scale) : 1;

const box = u => u.observation && u.observation.bbox;
const iou = (a, b) => {
  const x0 = Math.max(a[0], b[0]), y0 = Math.max(a[1], b[1]), x1 = Math.min(a[0] + a[2], b[0] + b[2]), y1 = Math.min(a[1] + a[3], b[1] + b[3]);
  const i = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const u = a[2] * a[3] + b[2] * b[3] - i;
  return u > 0 ? i / u : 0;
};
const hist = (xs, f) =>
  xs.reduce((h, x) => {
    h[f(x)] = (h[f(x)] || 0) + 1;
    return h;
  }, {});

/** Nearest-neighbour resample (an experiment switch, not a substitute for real pixels). */
function scaled(r, f) {
  if (f === 1) return r;
  const w = Math.round(r.width * f), h = Math.round(r.height * f);
  const d = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = r.data[Math.min(r.height - 1, Math.floor(y / f)) * r.width + Math.min(r.width - 1, Math.floor(x / f))];
  return makeRaster(w, h, d);
}

async function analyse(raster, s, text) {
  return analyzeSample(raster, { slot: s.slot, knownText: text, scripts: s.scripts, extract: true, yieldFn: async () => {}, sampleId: s.id });
}

function summary(r, s, truth, f) {
  const ex = r.extraction ? r.extraction.units.filter(u => u.status === 'extracted') : [];
  const seg = r.segmentation;
  let truthScore = null;
  if (truth) {
    try {
      const words = truthWords(truth, s.transcription);
      truthScore = scoreAgainstTruth(r, words, (x, y) => [x / f, y / f]);
    } catch (e) {
      truthScore = { error: e.message };
    }
  }
  return {
    quality: { usable: r.quality.usable, score: r.quality.score && r.quality.score.score, issues: r.quality.issues.map(i => `${i.code}:${i.severity}`), metrics: r.quality.metrics || null },
    segmentation: { lines: seg.lines.length, expectedLines: seg.diagnostics.expectedLines, words: seg.words.length, xHeight: seg.diagnostics.medianXHeight, headlines: seg.diagnostics.possibleHeadlines, regionScore: seg.region ? seg.region.confidence.score : null },
    skew: r.skew && { angle: r.skew.angle, applied: r.skew.applied },
    alignment: r.alignment ? r.alignment.summary : null,
    unitStates: r.alignment ? hist(r.alignment.observations.units, u => u.state) : null,
    extraction: r.extraction ? r.extraction.summary : null,
    glyphsPerChar: hist(ex, u => u.text),
    glyphs: ex.map(u => ({ text: u.text, word: u.word, bbox: box(u), conf: u.confidence ? u.confidence.score : null })),
    truthScore,
    protocol: summarizeAnalysis(r, { truth: truth ? { words: truthWords(truth, s.transcription), toOriginal: (x, y) => [x / f, y / f] } : null }),
  };
}

(async () => {
  const manifest = loadManifest(manifestFile);
  const errors = [...validateManifest(manifest), ...datasetProblems(manifest)];
  const report = { manifest: path.basename(manifestFile), imagesDir: path.basename(imagesDir), scale, ran: new Date().toISOString(), manifestErrors: errors, samples: {} };
  if (errors.length) console.log('manifest problems:', errors);
  for (const s of manifest.samples) {
    if (errors.length) break;
    const file = path.join(imagesDir, s.file);
    if (!fs.existsSync(file)) {
      report.samples[s.id] = { skipped: 'image not found' };
      console.log(`${s.id}: image not found`);
      continue;
    }
    const raster = scaled(decodePngGray(file), scale);
    const truth = s.truth ? (() => {
      const [tf, page] = s.truth.split('#');
      const all = JSON.parse(fs.readFileSync(path.join(truthDir, tf), 'utf8'));
      return page ? all.pages[page] : all;
    })() : null;
    const t0 = Date.now();
    const r = await analyse(raster, s, s.transcription);
    const entry = { category: s.category || null, writer: s.writer || null, scripts: s.scripts, image: { width: raster.width, height: raster.height }, ms: Date.now() - t0, status: r.status };
    if (r.status !== 'done') {
      report.samples[s.id] = { ...entry, error: r.error || null };
      console.log(`${s.id}: ${r.status}`);
      continue;
    }
    entry.typed = summary(r, s, truth, scale);
    const o = ocr && ocr.samples && ocr.samples[s.id] && typeof ocr.samples[s.id].text === 'string' ? ocr.samples[s.id] : null;
    if (o) {
      const r2 = await analyse(raster, s, o.text);
      if (r2.status === 'done') {
        const typedUnits = r.extraction.units.filter(u => box(u));
        const ex2 = r2.extraction.units.filter(u => u.status === 'extracted');
        let same = 0, wrong = 0, unmatched = 0;
        const wrongExamples = [];
        for (const g of ex2) {
          let best = null, bestIou = 0;
          for (const t of typedUnits) {
            const v = iou(box(g), box(t));
            if (v > bestIou) {
              bestIou = v;
              best = t;
            }
          }
          if (!best || bestIou < 0.5) unmatched++;
          else if (best.text === g.text) same++;
          else {
            wrong++;
            if (wrongExamples.length < 10) wrongExamples.push(`${g.text}←${best.text}`);
          }
        }
        entry.ocrText = { ...summary(r2, s, truth, scale), labels: { sameAsTyped: same, wrong, unmatched, typedExtracted: entry.typed.extraction.extracted, wrongExamples } };
      }
    }
    report.samples[s.id] = entry;
    const q = entry.typed;
    console.log(`${s.id}: x-height ${q.segmentation.xHeight} px · quality ${q.quality.usable ? 'usable' : 'UNUSABLE'} ${q.quality.issues.join(',') || 'no issues'} · lines ${q.segmentation.lines}/${q.segmentation.expectedLines} · words aligned ${q.alignment ? q.alignment.words.aligned : '-'}/${q.alignment ? q.alignment.expectedWords : '-'} · glyphs ${q.extraction ? q.extraction.extracted : '-'}/${q.extraction ? q.extraction.considered : '-'}` + (entry.ocrText ? ` · with OCR text: glyphs ${entry.ocrText.extraction.extracted}, wrong label ${entry.ocrText.labels.wrong}` : '') + (q.truthScore && !q.truthScore.error ? ` · truth ${JSON.stringify(q.truthScore).slice(0, 120)}` : ''));
  }
  try {
    assertPrivate(report);
  } catch (e) {
    report.privacyCheck = `FAILED: ${e.message}`;
  }
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'engine.json'), JSON.stringify(report, null, 1));
  console.log(`\nwritten ${path.join(outDir, 'engine.json')}${report.privacyCheck ? ` — ${report.privacyCheck}` : ''}`);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
