# Lang4 Phase 10 — personal handwriting rendering quality

Synthetic and real evidence are kept apart. Nothing here measures how well
real handwriting is reproduced.

## `consistency.png` and `synthetic/` — SYNTHETIC (scored against fixture truth)

Profiles learned end to end (analysis → extraction → profile generation)
from synthetic pseudo-glyph pages: the six sample slots, with slot 6
written "Aa Bb Cc …". The synthetic writer draws every x-height letter
exactly 1 x-height tall on the baseline, so the spread of the rendered
glyphs should be about zero.

* **legacy**: a profile built with the Phase 9 pipeline. On "Aa Bb" lines
  the x-height was measured at the capitals' height, so every letter
  learned there is about 0.68× too small.
* **fixed**: the same pages with the Phase 10 x-height fix.
* **before**: Phase 9 placement (forms drawn as stored; headline joins at
  the unit's first form's anchors). **after**: Phase 10 render-time
  placement. Both use the Phase 10 variant choice, so the same variants
  are compared.

`synthetic/consistency.json` holds the numbers. `synthetic/document.png`
shows a ruled document with headings, labels, underline, colour, marker,
size and spacing, a form-feed page break, Devanagari, and dashed boxes for
missing units (`document.json`: pages, missing ranges, notes).
`synthetic/variants.png` shows deterministic variant choice.

## `real/` — REAL glyphs from `reference/handwriting_03.png` (visual only)

The page alone does not make a usable profile (lowercase 81 %, capitals
4 % observed), and the app refuses it. To look at real learned geometry,
the bench switched the coverage requirements off. This is a diagnostic
only. There is no ground truth: the spreads in
`h03-diagnostic-consistency.json` describe the drawn forms, not accuracy.
`h03-learned-forms-a-t-e.png` shows learned variants with defects that
rendering cannot fix:

* an 'a' whose stem merged into its bowl (it reads as 'o');
* an 'a' and an 'e' carrying a piece of the ruled line under them;
* 't' variants without their crossbar.

The source letters on the page are correct.
