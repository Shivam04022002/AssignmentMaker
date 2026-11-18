# Phase 26 scripts

Run from a copy of `../../phase25/poc/` (same virtualenv, models, `lib/` and `data/*.gray`; add the 2x grays as in the report):

- `node diag.js [page …]` — alignment states, rejection codes and reasons per page → `out/diag*.json`
- `python -X utf8 cuts.py` — ink at the 43 hand-read cursive letter cuts
- `python -X utf8 guided_cuts.py` — valleys vs true cuts; width prior / OCR span / OCR→valley / oracle placement
- `python -X utf8 glyph_sheet.py handwriting_03` — contact sheet of the extracted glyphs → `out/glyphs-*.png`
