# Lang4 Phase 12 — Devanagari and multilingual reliability

**There is no real Hindi sample in this project.** Everything here is
SYNTHETIC: geometric pseudo-glyph clusters (headline, stems, bowls, matras,
dots — no fonts, nobody's writing), scored against the fixture's own
ground truth, or rendering checks of profiles built from such pages. None
of it is evidence of real Hindi accuracy. The only real page is Latin
(`reference/handwriting_03.png`), rechecked by the opt-in test for
regressions.

## `synthetic/devanagari-extraction.json`

Phase 11 (before) and Phase 12 (after) on Hindi pages: clean, ruled
notebook, 3° skew, small writing (x-height 14, pen 2.6), touching clusters,
blur with noise, the Hindi alphabet prompt, and mixed English / Hindi
(also ruled and small). `marksApart` places dot marks clear of other
strokes, as usually written; the default fixture fuses anusvara with the
matra above, a case that must be refused.

* **defective**: a kept cluster that is incomplete, carries ink from
  elsewhere, or has lost a dot mark (anusvara, chandrabindu, visarga or
  nukta not stored as a dot).
* **wrong**: a kept cluster on another cluster's columns.

## Images

* `hindi-rendering.png`: a profile learned end to end from synthetic pages
  writes Hindi and mixed text. Headlines join across neighbouring learned
  clusters; dashed boxes mark clusters the profile does not have, which are
  never assembled from parts or borrowed.
* `mixed-document.png`: a mixed document on a ruled page, with heading,
  labels and hanging indent, an underlined Hindi word, colour, and larger
  Hindi text.
* `refused-clusters.png`: each refused cluster with the reason the pipeline
  gives.
* `headline-joins.txt`: joins per word (expected, drawn, where they break).
