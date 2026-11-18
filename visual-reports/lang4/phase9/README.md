# Lang4 Phase 9 — page detection and image reliability

Two kinds of evidence, kept apart. Nothing here is a measure of
real-handwriting accuracy.

## `real/` — the reference pages (Latin only, no ground truth)

`reference/reference1.png` (a phone photo of a sheet on a desk) and
`reference/handwriting_03.png` run through the full pipeline. The PNGs show
the photo with the detected page outline (green), the analysed text mask
(in the rectified page when the sheet was cut out), and the aligned units
and extracted glyphs, **for visual inspection only**. Checked by eye, not
measured:

* reference1: all four sheet edges found (the sheet's top edge is curled;
  the fitted line follows it within a few pixels); desk, book and keys are
  outside the cut-out page; nine rows of letters found. The rectified
  page's width / height came out 0.703 with the focal length measured from
  the corners — consistent with an A4 sheet (0.707) **if** it is A4, which
  has not been verified. No transcription exists, so nothing is aligned.
* handwriting_03: a page that fills the photo, so it is left as it is;
  alignment and extraction unchanged from Phase 8 (219 aligned units, 133
  glyphs, still unverified by any ground truth).
* Provenance of the pages is not verified. No real Devanagari page exists.
* Re-run: `REAL_SAMPLES=1 npx jest __tests__/realSamples.optin.test.js`.

## `synthetic/` — modelled conditions, scored against fixture truth

Pages of geometric pseudo-glyphs (no fonts, nobody's writing), photographed
in code (`__tests__/helpers/photoConditions.js`): perspective from a
pinhole camera or an arbitrary trapezoid, a wood desk, a book, keys (beside
or across the sheet), clothes along the bottom, lighting gradients, a
second sheet under the page, small writing, sideways and upside-down
photos, ruled notebook paper with pale / dark / thick rules, underlines,
Hindi headlines and marks.

* `desk-photos.json` — before (Phase 8) / after alignment and extraction;
  `wrong` = an aligned unit not on its true letter.
* `notebook-ink.json` — share of real ink (all, underlines, headlines,
  marks above headlines) kept through rule removal, and rule pixels left.
* `orientation.json` — turned photos: in a turned photo any aligned unit
  is a false match (one REAL entry, handwriting_03, kept under `real`).
* `page-aspect.json` — proportions of the rectified page.
* `phase8-conditions-rerun.json` — the Phase 8 conditions with Phase 9 code.
* Images: a steep camera view of a notebook page on a desk with the found
  outline, its rectified page, and the two-sheet photo that is rejected.
