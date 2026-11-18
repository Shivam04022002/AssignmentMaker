# Phase 25 — Offline handwriting OCR proof of concept (12 Nov 2026)

Desktop-only. Nothing in the app, its native modules, dependencies or
Lang1–3 changed. The PoC lives outside the project; its scripts (not the
models or the virtualenv) are copied to `poc/` with reproduction notes.

**Candidate:** PaddleOCR PP-OCRv5 *mobile* models (DB detector, CTC
recognisers for English and Devanagari), official ONNX exports, run with
ONNX Runtime 1.31.1 on CPU. Inference re-implemented from the models' own
`inference.yml` (no PaddleOCR Python package).

## 1. Setup

| Item | Value |
|---|---|
| Detector | `PaddlePaddle/PP-OCRv5_mobile_det_onnx` — 4.83 MB |
| English recogniser | `PaddlePaddle/en_PP-OCRv5_mobile_rec_onnx` — 7.85 MB, 438-symbol dictionary |
| Devanagari recogniser | `PaddlePaddle/devanagari_PP-OCRv5_mobile_rec_onnx` — 7.91 MB, 570-symbol dictionary (Devanagari **and** Latin letters) |
| Runtime | onnxruntime 1.31.1 (pip wheel), CPUExecutionProvider, 4 threads |
| Machine | AMD64 family 23 (Zen) desktop CPU; Windows 11 |
| Test images | the project's real reference pages: `handwriting_03.png` (print hand, ruled, 852×753), `handwriting_02.png` (cursive, ruled, 898×730), `handwriting_01.png` (cursive, notebook, 692×748), `reference1.png` (desk photo, 960×1280, no transcription). These are the "five real English photographs": `Lang2.png`/`Lang3.png` are byte-identical to 01 and 03. All low resolution (692–960 px wide), far below a phone photo. |
| Ground truth | `__tests__/realTruth/reference.manifest.json` (typed transcriptions), `reference-pages.words.json` (245 word boxes on pages 02/03), `cursive-letter-boundaries.json` (43 hand-read letter cuts on page 02) |

Two mistakes in my first implementation are worth recording because they
change the result by an order of magnitude: the recogniser must get a
**tight** crop at its natural width (height 48, width proportional, padded
to a multiple of 32 — *not* squeezed to 320 px), and the detector takes BGR.
With the line crops squeezed to 320 px the page results were 8–10 % words;
with the correct preprocessing they are below.

## 2. Results — English (real handwriting)

### 2a. Full page, detector + recogniser (the realistic path)

| Page | Hand | Lines found | Words verbatim | Page CER | Mean line conf | Time (desktop) |
|---|---|---|---|---|---|---|
| handwriting_03 | print | 19 | **126 / 126 (100 %)** | **0.0 %** | 0.995 | 2.2 s |
| handwriting_02 | cursive | 17 | 107 / 119 (89.9 %) | 2.8 % | 0.978 | 2.1 s |
| handwriting_01 | cursive, notebook | 20 | 114 / 126 (90.5 %) | 3.1 % | 0.970 | 1.8 s |
| reference1 | desk photo | 9 | — (no transcription) | — | 0.729 | 0.8 s |

Of the 52 recognised lines that match a transcription line, 49 have
confidence ≥ 0.95 and 13 of those are not exact. Most differences are the
transcription's typed spacing before `?` and `:`; the genuine recognition
errors are `surwival`, `Advorstage`, `wcM`, `Gwc`, `company''s` and one
dropped full stop — all at confidence 0.93–0.99. Detection also picked up
`Date:` / `apsara` headers that the transcriptions omit.

### 2b. Word crops from the truth boxes (recognition alone, 245 words)

| Crop | Exact | Case/punct‑insensitive | CER | Print page | Cursive page |
|---|---|---|---|---|---|
| line band ±0.55 pitch | 224 / 245 (91.4 %) | 91.8 % | 2.1 % | 98.4 % | 84.0 % |
| ink‑tight (like the app's word boxes) | 227 / 245 (92.7 %) | 92.7 % | 1.8 % | 98.4 % | 86.6 % |

27–28 ms per word on this CPU.

### 2c. Confidence as a filter (tight crops)

| Threshold on mean char prob | Accepted | Correct | **Wrong accepted** | Precision |
|---|---|---|---|---|
| none | 245 | 227 | 18 | 92.7 % |
| ≥ 0.90 | 239 | 223 | 16 | 93.3 % |
| ≥ 0.95 | 234 | 221 | 13 | 94.4 % |
| ≥ 0.98 | 229 | 219 | 10 | 95.6 % |

**Confidence does not separate the errors.** Typical confident mistakes
(conf 0.98–1.00): `franchising,`→`franchising`, `fundamental`→`fundament`,
`launch`→`aunch`, `can`→`an`, `early.`→`earl`, `its`→`it`. These are
dropped first/last letters and punctuation on the cursive page — exactly
the kind of error that would put a wrong label on real ink if the text were
trusted blindly. The filter has to be the engine's alignment, not the OCR
score (see 2e).

### 2d. Can the recogniser place characters on the ink?

CTC time steps give each character a horizontal span. Against the 43
hand-read letter boundaries of six cursive words (all six read correctly):
mean |error| 5.8 px, median 5.1 px, 90th percentile 12.1 px, only 33 % within
3 px, on a page whose x-height is ≈13 px. The recogniser knows *what* the
word says, not *where* each letter is; glyph boundaries must still come
from the engine.

### 2e. The question that matters: glyphs extracted from OCR text alone

The real pipeline (transpiled and run in Node) was given the recognised
text instead of the typed one, and its extracted glyphs matched by position
(IoU ≥ 0.5) against the truth run:

| Page | Truth text → glyphs | OCR page text → glyphs | Same label | **Wrong label** | Unmatched |
|---|---|---|---|---|---|
| handwriting_03 (print) | 136 of 751 | **136 of 751** | **136** | **0** | 0 |
| handwriting_02 (cursive) | 0 of 658 | 0 of 671 | — | — | — |
| handwriting_01 (cursive) | 0 of 685 | 0 of 695 | — | — | — |

On the print‑hand page, OCR text alone produced **exactly the glyphs the
typed transcription produced, with no mislabelled glyph**: the engine's
alignment (62 of 126 words clearly aligned, 221 of 751 units) rejected the
rest, as it does with the typed text. On the cursive pages the engine
extracts nothing with either text — the Phase 15 finding (joined letters
cannot be cut safely), unchanged by OCR.

## 3. Hindi

**Not measured on handwriting: there is no real Hindi sample** (`real-samples/`
is empty; no Devanagari page ships with the project). What was verified:

- the Devanagari model loads and runs offline (same size class, 28–37 ms per
  word);
- on **printed** Nirmala text it read `नमस्ते भारत` exactly (conf 1.0),
  `किताब कलम पानी घर` with one matra-order slip (`कतिाब`, conf 0.97) and
  `क ख ग घ ङ` with `ङ`→`ड` (conf 0.93). Printed text says nothing about
  handwriting; PaddleOCR publishes no handwritten-Devanagari figure, only
  84.96 % on its 3,611-image Devanagari set of unknown composition;
- the English model on the same Devanagari crops returns Latin garbage at
  conf 0.30–0.69, and the Devanagari dictionary contains the Latin letters —
  so a script decision could come from running both and comparing, but that
  too is unverified on handwriting.

**Samples needed to evaluate Hindi** (kept local, never uploaded): 3–5
full-resolution phone photos of handwritten Hindi by one writer — at least
one page of the alphabet with matras and conjuncts, two pages of everyday
sentences, one with digits — in both a careful and a quick hand, on ruled
and plain paper, each with its exact typed transcription, plus the writer's
consent. Ideally a second writer. With those, `poc/eval_pages.py` and the
glyph-association run can be repeated unchanged.

## 4. Offline, licensing, size, time

- **Offline:** `poc/offline_check.py` runs detection and both recognisers
  with every socket call monkey-patched to fail: inference completed, **no
  connection attempt was made**. The pip wheel lists an unused
  `AzureExecutionProvider`; a mobile build would exclude it.
- **Licences:** PaddleOCR and the model repositories are **Apache‑2.0**
  (`poc/PaddleOCR-LICENSE.txt` downloaded from the project; each Hugging Face
  repo card states apache-2.0). ONNX Runtime is MIT. The PoC's helper
  packages (NumPy BSD, OpenCV Apache‑2.0, pyclipper MIT, Shapely BSD) are
  desktop-only and would not ship. No training-data licence restriction is
  stated for the models (unlike TrOCR's IAM data).
- **Size:** models 20.6 MB in fp32 (4.8 + 7.9 + 7.9), shipped once, not per
  CPU architecture. The runtime is the larger part on Android: ONNX Runtime
  Mobile is ≈24 MB prebuilt for all ABIs (v1.18 figures) or ≈7–8 MB as a
  reduced build; a per‑ABI split or int8 quantisation would roughly halve
  the models. Not measured here — PoC only.
- **Time (desktop CPU, 4 threads):** detector 210–280 ms per page; recogniser
  27 ms per word, 1.5–1.9 s for a page of 17–21 lines; 1.8–2.2 s per page
  end to end. PaddlePaddle's own mobile figure for PP-OCRv5_mobile is 1.75 s
  per image on a phone CPU; a 12‑megapixel phone photo would be downscaled
  (the detector caps the long side at 960 px) so detection time stays flat,
  recognition scales with the number of lines. Expect several seconds per
  photo on a phone; not measured.

## 5. Limitations of this evaluation

- Four low-resolution pages, one writer's print hand and two cursive hands;
  no phone-resolution photos, no lighting/skew conditions, no Hindi.
- Ground truth was transcribed and boxed by the assistant, not an
  independent annotator.
- The "handwriting" benchmark PaddlePaddle publishes for this model is 49 %
  recognition accuracy on *its* handwritten English set; our pages are
  neater than that set evidently is. Real users' writing will sit somewhere
  between.
- The engine's own yield on these pages is low (136 glyphs from 751 units on
  the best page; none on cursive). OCR removes the need to type the text; it
  does not make more letters extractable.

## 6. Recommendation

The acceptance criterion is met for **print-hand English**: arbitrary text
was recognised (100 % words on that page) *and* its actual glyphs were
extracted by the existing engine from the recognised text with zero
mislabelling, because alignment — not the OCR confidence — decides what is
learned. It is **not** met for cursive (the engine extracts nothing, as
before) and **cannot be judged for Hindi** without real samples.

Proposed next steps, in order, none of which touches the app yet:

1. **Hindi evidence first.** Provide the samples in §3; rerun the PoC. If
   Devanagari handwriting falls well below the English numbers, Hindi stays
   on prescribed pages while English goes photo-only.
2. **Phone-resolution English evidence.** 3–5 phone photos of print-hand
   English pages with typed text, through the same scripts, to confirm the
   result holds at camera resolution and under the Phase 14 conditions.
3. **Design the integration honestly** (no code until you approve): OCR text
   becomes the photo's *candidate* text; every word still has to align
   (`alignTranscription`) and only `aligned` glyphs are learned; the review
   shows the recognised text for correction (the Phase 24 correction UI
   already exists); the "Reading handwriting" stage replaces "Matching to
   the page". Native work would be a self-contained ONNX Runtime module
   (Android: `onnxruntime-android` reduced build; iOS: `onnxruntime-objc`),
   models bundled, no network permission, which needs your dependency
   approval.
4. Only then a device run.

If you would rather not add a ~30 MB native runtime, the alternative that
keeps the engine honest is the current one: prescribed pages, with the
Phase 24 per-photo correction.

## 7. Reproduction

See `poc/README.md`: a virtualenv with the packages in
`poc/requirements-used.txt`, the three model repos above (download
`inference.onnx` + `inference.yml` into `models/<repo>/`), then
`eval_words.py`, `eval_pages.py`, `char_positions.py`, `offline_check.py`,
and `node transpile.js && node harm.js` for the glyph-association run.
Outputs of this run are in `poc/out/` (recognised text and metrics only;
no images).
