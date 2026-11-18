# Dataset evaluation tooling (Phase 27)

Repeatable, desktop-only runs of OCR, segmentation, alignment and glyph
extraction over a real-sample manifest (`../DATASET_SPEC.md`). Nothing here is
part of the app; `lib/` and `out/` are generated and git-ignored.

Requirements: Node (the project's `node_modules` for Babel), and for OCR the
Phase 25 virtualenv (`../../phase25/poc/requirements-used.txt`) plus the three
PP-OCRv5 model folders — either in `../../phase25/poc/models/` or wherever
`PPOCR_MODELS` points. Models are downloaded (Apache-2.0), never committed.

```
node transpile27.js                                   # once per engine change → lib/
python -X utf8 run_ocr.py    --manifest <set>/manifest.json --out out/<run>
node run_engine.js           --manifest <set>/manifest.json --out out/<run> --ocr out/<run>/ocr.json
python -X utf8 report.py out/<run> [--categories categories.json]   # → out/<run>/REPORT.md
```

With no `--manifest`, all three use the project's reference set
(`__tests__/realTruth/reference.manifest.json`, images in `reference/`);
`reference.categories.json` supplies its categories. `--scale 2` on
`run_engine.js` is an experiment switch (nearest-neighbour upscaling), not a
data step.

Manifest: the Phase 14 schema plus `category`, `writer`, `original`, `page`,
`transcriptionFile` (`manifest.template.json`). The Jest protocol needs the
transcription inline; make a local copy for it, never commit it:

```
node -e "const {loadManifest}=require('./manifest');const m=loadManifest(process.argv[1]);m.samples.forEach(s=>{delete s.transcriptionFile});require('fs').writeFileSync(process.argv[2],JSON.stringify(m,null,1))" <set>/manifest.json <set>/manifest.inline.json
```

Outputs contain counts, codes, scores, texts and boxes — no pixels
(`assertPrivate`); keep `out/` local when it comes from private samples.
