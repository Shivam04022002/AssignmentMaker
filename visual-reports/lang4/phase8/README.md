# Lang4 Phase 8 — validation reports

Two kinds of evidence, kept apart.

## `real/` — real handwriting images (Latin only)

The pages in `reference/` that came with the project, run through the full
pipeline (decode as the native module does → analysis → alignment →
extraction) with transcriptions typed from the images.

* There is **no ground truth** for these pages: the PNGs show the computed
  boxes (blue = aligned, with the letter it was matched to) and the
  extracted glyphs **for visual inspection**. Correctness was checked by eye,
  not measured. Nothing here is an accuracy figure.
* There is **no real Devanagari sample**; Devanagari is validated on
  synthetic pages only.
* Provenance of the pages (photographed, scanned or otherwise produced) is
  not verified. `reference1.png` is clearly a phone photo of a sheet on a
  desk; it has no transcription (its letter groups do not follow a prompt),
  so only image analysis runs on it.
* Re-run: `REAL_SAMPLES=1 npx jest __tests__/realSamples.optin.test.js`
  (safety checks only; skipped in normal test runs).

## `synthetic/` — modelled photo conditions

`conditions.json`: synthetic pages (geometric pseudo-glyphs, no fonts,
nobody's handwriting) with the conditions the real pages showed — pale
notebook rules under the writing, objects around the page, perspective, low
resolution, a sideways photo — scored against the fixture's ground truth.
`before` = Phase 8 preprocessing (faint-line and background-object removal)
switched off; `after` = as shipped. Synthetic results are not evidence of
real-handwriting quality.
