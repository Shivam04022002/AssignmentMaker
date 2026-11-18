# Phase 27 — Real handwriting validation dataset: specification (12 Nov 2026)

Purpose: a dataset of **real** handwriting photographs, with typed ground
truth kept apart from the images, on which OCR, segmentation, alignment and
glyph extraction can be measured repeatably **before** the engine is
changed. No synthetic page ever counts as a sample here; synthetic fixtures
remain what they are — regression tests of the code paths.

Everything in the dataset stays in the git‑ignored `real-samples/` folder on
the owner's PC. Nothing is uploaded, logged or copied into tests; reports
contain counts, codes, scores and boxes, never pixels (`assertPrivate`).

## 1. Inventory — what exists today

| Set | Images | Hand / script | Resolution | Ground truth | Status |
|---|---|---|---|---|---|
| `reference/handwriting_03.png` | 1 | English **print** | 852×753, x‑height 12 px | typed transcription; 126 word boxes | usable; too small for the engine's own target |
| `reference/handwriting_02.png` | 1 | English **cursive** | 898×730, x‑height 9 px | transcription; 119 word boxes; 43 letter cuts (6 words) | engine: `too-small` |
| `reference/handwriting_01.png` | 1 | English cursive, notebook | 692×748, x‑height 9 px | transcription | engine: unusable (`too-small`) |
| `reference/reference1.png` | 1 | English **mixed** alphabet variants, desk photo | 960×1280 | none | not measurable |
| `reference/Lang2.png`, `Lang3.png` | 2 | duplicates of 01 and 03 (md5) | — | — | do not count |
| `real-samples/` | 0 | — | — | — | **empty** |
| Hindi / Devanagari | **0** | — | — | — | **none exists** |

Truth files: `__tests__/realTruth/reference.manifest.json`,
`reference-pages.words.json`, `cursive-letter-boundaries.json`, all
annotated by the assistant (±4 px words, ±1.5 px cuts), not independently
checked. Tooling that already exists: the Phase 14 protocol
(`__tests__/realProtocol.optin.test.js`, `helpers/realProtocol.js`,
`helpers/realConditions.js`), `scripts/real-samples-to-png.ps1`, and the
Phase 25/26 PoC scripts.

**Coverage gaps:** no photo at camera resolution; no page with x‑height
≥ 20 px; no second writer; no mixed‑hand page with known text; no Hindi at
all; no matra/conjunct material; no capture‑condition series on real
pages (conditions were simulated in Phase 14).

## 2. Categories and the samples required

One **writer** is one person; `w1`, `w2`… in the manifest, never a name.
"Page" means one A4/letter sheet, photographed once. Texts for the
prescribed pages are the wizard's own practice pages
(`src/handwriting/learn/samplePrompts.js`; listed in
`phase17/DEVICE_VALIDATION_CHECKLIST.md` §2); "free" means text the writer
chose, typed afterwards.

| Category | Writers | Pages per writer | Content | Minimum | Target |
|---|---|---|---|---|---|
| **english-print** (separated letters) | 2 | 5 prescribed (English alphabet, words & sentences, numbers & punctuation, everyday ×2) + 2 free | the English type's pages; free text ≥ 60 words | 7 (1 writer) | 14 |
| **english-cursive** (joined) | 2 | same 5 prescribed + 2 free | the same texts in the writer's joined hand | 7 | 14 |
| **english-mixed** (print capitals / joined lowercase, or alternating) | 1–2 | 5 prescribed + 1 free + a re‑shoot of the alphabet‑variants page with its text written down | | 7 | 14 |
| **hindi-devanagari** | 2 | 5 prescribed (Hindi alphabet, words & sentences, numbers & punctuation, everyday ×2) + 2 free | the Hindi type's pages | 7 | 14 |
| **hindi-matras-conjuncts** | 2 | 3: a matra table (क…ह each with ा ि ी ु ू े ै ो ौ ं ः), a conjunct page (क्ष त्र ज्ञ श्र द्ध प्र क्र स्त क्त त्न द्व ह्म and 20 common conjunct words), a dense sentence page | | 3 | 6 |
| **conditions** (per script, one writer) | 1 | the numbers page under: uneven light, hard shadow, ~7° tilt, camera angled ~25°, writing at half size | real captures, not simulated | 5 per script | 10 |

Minimum viable dataset: **36 photos** (one writer per category plus the
conditions); target: **72**. Every page also needs its typed transcription;
word boxes for at least two pages per category; letter/cluster cuts for ten
words per cursive and per Hindi writer.

## 3. Image‑quality requirements (measurable; the engine measures them)

The engine analyses at a long edge of 2000 px (`raster.js
ANALYSIS_LONG_EDGE`); the thresholds below are at that size and come from
`imageQuality.js QUALITY_THRESHOLDS` and Phase 26.

| Requirement | Value | Why | How measured |
|---|---|---|---|
| Camera | phone main camera, full resolution, JPEG ("Most compatible" on iPhone; HEIC is not read by the PC script) | | `original.width/height` in the manifest, ≥ 3000 px long edge |
| Framing | whole sheet in view, filling ≥ 70 % of the frame width, phone parallel to the page | perspective and margins | `capture.perspective`, page detection status |
| **Writing size** | **x‑height ≥ 20 px** at analysis size (≈ 3 mm on A4 at 2000 px; write 4–5 mm) | engine: < 10 px `too-small` warning caps every unit below `boundaryOk` (Phase 26); 12 px gave 18 % yield, 24 px gave 28 % | `segmentation.diagnostics.medianXHeight` |
| Focus | edge width ≤ 3 px (`edgeWidthGood`); no `blurry` | letter boundaries | `quality.metrics.edgeWidth` |
| Lighting | even daylight or a bright lamp; no flash; unevenness ≤ 0.4; paper level ≥ 140; no shadow of hand or phone | `uneven-lighting`, `shadows`, `too-dark` | `quality.metrics` |
| Contrast | dark blue or black pen, medium tip; contrast ≥ 0.3 | `low-contrast` | `quality.metrics.contrast` |
| Noise | σ ≤ 6 on the paper | grainy low‑light photos | `quality.metrics.noise` |
| Skew | ≤ 2° (the engine corrects more, but the conditions series covers that) | | `skew.angle` |
| Paper | plain or ruled for the main sets; ruled lines are removed by the engine; grid and notebook only in the conditions series | | `capture.paper` |
| Acceptance | **no error‑level quality issue; no `too-small` or `blurry` warning** | | `quality.issues` |

A photo that fails is re‑taken, not edited: no sharpening, cropping to a
line, contrast changes or upscaling (upscaling was an experiment switch in
Phase 26, not a data step).

## 4. Storage — images and typed truth apart

```
real-samples/                          git-ignored; local only
  <set-id>/                            e.g. 2026-11-english-w1
    originals/   IMG_*.jpg             camera files (EXIF, GPS) — never leave this folder
    images/      <id>.png              EXIF-stripped, long edge 2000 (scripts/real-samples-to-png.ps1)
    truth/       <id>.txt              typed transcription, UTF-8, line for line, exactly as written
                 <id>.words.json       word boxes (optional): format of __tests__/realTruth/reference-pages.words.json
                 <id>.cuts.json        letter / cluster cuts (optional): format of cursive-letter-boundaries.json
    manifest.json                      metadata only (template: eval/manifest.template.json)
```

Rules:

- **Transcriptions live in `truth/<id>.txt`, referenced by
  `transcriptionFile`**; the manifest itself carries no text, so it can be
  shared or committed as an inventory without the writing's content. The
  evaluation tools (`eval/manifest.js`, `eval/run_ocr.py`) resolve the file;
  the Jest protocol (`realProtocol.optin.test.js`) still wants the inline
  `transcription` field — generate that copy locally when needed
  (`node -e` one‑liner in `eval/README.md`), do not commit it.
- Typed exactly as written, including the writer's mistakes, crossings‑out
  marked `[x]`, line breaks as on the page. A second person checks each
  transcription against the photo before it is used (the reference truth
  was never independently checked — do better here).
- Word boxes: line centre `y`, and per word `[text, left, right]` in the
  **PNG's** pixels (the analysis image, not the camera original), ±4 px.
- Letter/cluster cuts: per word, the x of each internal boundary, read at
  ≥ 4× zoom, ±1.5 px; for Devanagari, cluster boundaries below the headline.
- Writers consent in writing to local testing (`provenance.consent: true`);
  no names, no faces, no addresses on the page.

Manifest fields (Phase 14 schema, validated by `validateManifest`, plus
dataset fields validated by `eval/manifest.js`): `id`, `file`, `slot`,
`scripts`, `transcriptionFile`, `capture {lighting, paper, writingSize,
skewDeg, perspective}`, `provenance {source, consent}`, `truth`, `cuts`,
**`category`**, **`writer`**, **`original {width, height}`**, `device`
(model string, optional), `page` (prescribed page id or `free`).

## 5. Methodology — the same run every time

1. Photos → `originals/`; `powershell -File scripts/real-samples-to-png.ps1
   -Source real-samples/<set>/originals -Target real-samples/<set>/images`.
2. Write `truth/<id>.txt`; have them checked; fill `manifest.json`.
3. `node eval/transpile27.js` once (the engine as it is, from `src/`).
4. `python -X utf8 eval/run_ocr.py --manifest real-samples/<set>/manifest.json --out eval/out/<run>`
   — PP‑OCRv5 mobile: full page vs transcription (word recall, CER), word
   crops vs word boxes (accuracy, CER, confident‑wrong count). Model folder:
   `PPOCR_MODELS` or `phase25/poc/models/` (downloaded, never committed).
5. `node eval/run_engine.js --manifest … --out eval/out/<run> --ocr eval/out/<run>/ocr.json`
   — the real pipeline with the typed text and again with the OCR text:
   quality metrics, lines, alignment states, word‑truth score, extraction
   counts, glyph boxes, and the **label comparison** (same / WRONG /
   unmatched).
6. `python -X utf8 eval/report.py eval/out/<run>` → `REPORT.md` with the
   criteria below per sample and category.
7. For regression gates on the shipping checks, the Jest protocol:
   `REAL_SAMPLES=1 REAL_SAMPLES_DIR=real-samples/<set> npx jest __tests__/realProtocol.optin.test.js`.
8. Glyph *identity* is checked by eye on a contact sheet
   (`phase26/poc/glyph_sheet.py`) by someone other than the person who
   wrote the truth; count wrong letters.

What is **not** claimed from these runs: letter‑level correctness without
step 8; anything about writers or conditions not in the set; Hindi until
Hindi pages exist.

## 6. Acceptance criteria (per sample unless stated; evaluated by `report.py`)

| Id | Criterion | Print / Devanagari | Cursive / mixed |
|---|---|---|---|
| Q1 | x‑height at analysis size | ≥ 20 px | ≥ 20 px |
| Q2 | quality issues | none at error level; no `too-small`, no `blurry` | same |
| O1 | OCR page word recall vs transcription | ≥ 95 % | ≥ 85 % |
| O2 | OCR page CER | ≤ 3 % | ≤ 3 % |
| O3 | OCR confident‑wrong words (conf ≥ 0.95, wrong) on word crops | reported; decides nothing — alignment is the filter | reported |
| A1 | clearly aligned words on the annotated word (truth file) | wrong = 0 | wrong = 0 |
| A2 | lines found vs expected | within ±10 % | within ±10 % |
| G1 | glyphs extracted from OCR text vs from typed text | **WRONG label = 0** | WRONG label = 0 |
| G2 | glyph yield (extracted / characters) | ≥ 40 % | reported (expected ≈ 0 until connected‑group learning exists) |
| G3 | letter identity on the contact sheet (step 8) | 0 wrong letters in the set | 0 |
| D1 | dataset: writers per category | ≥ 2 | ≥ 2 |
| D2 | dataset: pages per category passing Q1–Q2 | ≥ 7 | ≥ 7 |
| H1 | Devanagari lines with a detected headline | ≥ 95 % | — |
| H2 | Latin lines with a (false) headline | ≤ 2 % | ≤ 2 % |

Baseline on the existing reference set (the first run of this tooling, real
pages, low resolution): `eval/out/reference-baseline/REPORT.md` — Q1 fails on
every page (x‑height 9–12 px), which is the point of §3.

## 7. Samples still needed (exact)

- **English print:** 14 photos (2 writers × 7) at camera resolution — none exist at that size.
- **English cursive:** 14 photos (2 × 7) + letter cuts for 10 words per writer.
- **English mixed:** 7–14 photos (1–2 writers), including the alphabet‑variants page re‑shot with its text written down.
- **Hindi Devanagari:** 14 photos (2 × 7) — **none exist**.
- **Hindi matras and conjuncts:** 6 photos (2 × 3) + cluster cuts for 10 words per writer — **none exist**.
- **Conditions:** 10 photos (5 per script).
- **Transcriptions:** one per photo, checked by a second person; **word boxes** for ≥ 2 pages per category.

Nothing synthetic is substituted for any of these.

## 8. Next recommended experiment

Collect the **minimum viable English set first** (one print writer, one
cursive writer: 7 + 7 photos at camera resolution, with transcriptions and
word boxes for two pages each) and run steps 3–8. The questions it answers,
in order of value: does Q1 (≥ 20 px) hold with ordinary phone photos; does
the print yield rise to the G2 target at real resolution (Phase 26 saw
18 % → 28 % with a 2× proxy); does G1 stay at zero wrong labels with OCR
text at that resolution; and how much of the cursive set the engine still
refuses. Those four numbers decide the resolution gate, the OCR integration
and whether connected‑group learning is worth building — before any Hindi
or engine work.
