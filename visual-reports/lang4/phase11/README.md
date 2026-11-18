# Lang4 Phase 11 — glyph quality and extraction reliability

Real and synthetic evidence are kept apart. Nothing here measures real
handwriting accuracy.

## `real/` — `reference/handwriting_03.png` (visual inspection only)

There is no ground truth. These pictures show what the pipeline did. The
defects are judged by eye against the photo.

* `h03-learned-forms-before.png` / `-after.png`: the a, t, e, o, d and g
  variants a diagnostic profile learns from this page, with Phase 10
  extraction (before) and Phase 11 (after). The page alone does not make a
  usable profile and the app refuses it; the bench switches the coverage
  requirements off to build one for this diagnostic.
* `h03-defect-stages-before.png` / `-after.png`: for each defect glyph,
  six panels: gray, ink, after rule removal, after faint-line removal,
  final text mask, and trace.
* `h03-counter-unresolved-crops.png`: the 8 'e's now refused because their
  eye is too small to tell from a pinhole (top: mask; bottom: photo).
* `h03-extraction-summary.json`: extraction counts and variants per letter,
  Phase 10 and Phase 11.

Root causes found:

| Defect | Stage | Cause | Fix |
|---|---|---|---|
| a traced as o | skeleton | At a 2–3 px pen, Zhang–Suen thinning erased the short tail of the a's stem | Thin at 2× resolution when the pen is under 4 px |
| t without crossbar | skeleton | Thinning erased one crossbar arm; the other (2 px) was pruned as a spur exactly at the limit | Same |
| ruled-line piece under a / e | preprocessing | Faint-line removal kept every column that held letter ink, so the line under a letter standing on it stayed and was traced as a tail | In kept columns, clear the line's own pixels that are not next to the letter's ink; never cut a line crossing the band (a margin line) |
| e traced as c (found while checking) | image limit | The eye was pinhole-sized and filled before tracing | Refuse: `counter-unresolved` |
| a placed 0.33 above the baseline at 0.7× size (found while checking) | segmentation | The title line's x-height and baseline took in the capitals; only one x-height letter was aligned there, so the Phase 10 correction (which needs 3) could not apply | Refuse x-height letters whose ink does not span about 0–1 on their line: `metrics-inconsistent` |

## `synthetic/` — SYNTHETIC, scored against fixture truth

* `print-fixtures.json`: pages written with `letterforms: 'print'` (a with
  stem and tail, t with short crossbar arms, e with its bar). Conditions:
  small writing with a thick pen, ruled notebook, pale rules, mixed sizes,
  touching letters, regular size. Before (Phase 10) and after, per
  condition: glyphs extracted, glyphs defective (completeness < 0.9 or
  extra ink > 0.1, with tolerances of at least one pen width), and
  rejections by code.
* `phase5-extraction-before-after.json`: the original Phase 5 extraction
  bench (plain letterforms) before and after.
