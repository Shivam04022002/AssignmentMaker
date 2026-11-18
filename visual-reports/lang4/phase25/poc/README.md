# OCR proof of concept — reproduction

Desktop only. Not part of the app; do not import from `src/`.

1. `python -m venv venv && venv/Scripts/pip install -r requirements-used.txt`
   (Windows; the versions used are pinned there).
2. Download, into `models/<repo>/inference.onnx` and `inference.yml`:
   - `https://huggingface.co/PaddlePaddle/PP-OCRv5_mobile_det_onnx`
   - `https://huggingface.co/PaddlePaddle/en_PP-OCRv5_mobile_rec_onnx`
   - `https://huggingface.co/PaddlePaddle/devanagari_PP-OCRv5_mobile_rec_onnx`
   (all Apache-2.0; `PaddleOCR-LICENSE.txt` is the project licence).
3. `python -X utf8 smoke.py` — printed-text sanity check (not evidence).
4. `python -X utf8 eval_words.py [--tight]` — 245 real word crops (pages 02/03) → `out/words*.csv`.
5. `python -X utf8 eval_pages.py` — full pages, detector + recogniser → `out/pages.json`; `line_report.py` for the line view.
6. `python -X utf8 char_positions.py` — CTC character spans vs hand-read letter cuts.
7. `python -X utf8 offline_check.py` — inference with sockets blocked.
8. `node transpile.js && node harm.js` — the app's own pipeline (transpiled to `lib/`)
   run with the OCR text instead of the typed text; glyphs matched by position
   → `out/harm.json`. Needs `data/*.gray` (raw grayscale of the reference pages,
   made by the one-liner in the Phase 25 report) — regenerate with PIL:
   `Image.open(png).convert('L').tobytes()` and `data/meta.json` sizes.

Paths inside the scripts point at `D:/AssignmentMaker`; adjust if the project
lives elsewhere.
