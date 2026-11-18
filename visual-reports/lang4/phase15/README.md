# Lang4 Phase 15: alignment reliability and cursive feasibility

This phase uses the same pages and protocol as Phase 14
([PROTOCOL.md](../phase14/PROTOCOL.md)): three real English pages, with no
real Hindi page. Results come from three sources, kept apart below:

* **Ground truth:** hand-annotated word boxes on handwriting_03 (126
  words) and handwriting_02 (119 words), plus, new in this phase, letter
  boundaries in six joined words. All were annotated by the assistant from
  enlarged crops, with no second annotator.
* **Simulated conditions:** lighting, a hard shadow, skew, perspective and
  smaller writing, applied to the real pages and scored against the same
  ground truth.
* **Visual inspection:** unchanged from Phase 14. The extracted glyphs are
  identical in number on every page and condition, so Phase 14's
  inspection still stands.

## Root causes and fixes

| False match (Phase 14) | Root cause | Change | Kind |
|---|---|---|---|
| `Q1.` on handwriting_02 (clean, uneven light, skew 4°) | The detected first line spans rows 42–95, so it swallows the curled end of the double margin rule (rows 42–52). That curl is entirely above the line's writing band (x-height zone 73–82). It matched `Q1.` on width, and the real `Q1.` region was left over as extra ink. | **Word-to-line association**: a region that never reaches its line's writing band (± 0.25 x-height) cannot match, merge into or split from a word with a letter, digit or cluster. This joins the Phase 14 flat-region rule. It is not applied on lines that may hold two touching lines, because their baseline belongs to one line only. | exclusion |
| `Q1.` on handwriting_03, skew −7° | Its region (74 px, 5.3 x-heights tall) also holds the vertical margin rule. | A word region taller than **4 x-heights** is never "aligned". It is kept as ambiguous, with the reason. | uncertainty |
| `advantages` on handwriting_03, skew −7° | The end of line 1 is rotated out of the frame. `advantages` took the region of `Write its`: 7.2 x-heights, against 10.0 expected for `advantages` and 7.6 for `Write its`. It was then trusted because the line's end pinned it. | A **lone** word pinned only by a line end is not trusted when its inner neighbour is missing **and** its region fits those missing words about as well as itself (width cost within 0.15). A run of two or more matches in order keeps its anchor. | uncertainty |
| `By` on handwriting_02, low contrast | A joined word was cut in the wrong place. The period of `early.` became a 2×3 px speck, and `By` took the start of `recognizing`. Every width was plausible. | The word just after a **small** unexplained piece inside a line (narrower than 1 x-height) is doubted. A word-sized extra region, which is unexpected text, is not treated this way. | uncertainty |
| New, found by the synthetic regression page: three touching lines merged into one region | The writer's scale is estimated from the matched words. With a single match, the scale is made to fit it, and `and` was "aligned" to the whole page. | When the text has 3 or more words and fewer than **3** regions are matched, no match can be checked: all stay ambiguous, with the reason. | uncertainty |

**Not fixed:** `By` on handwriting_02 under perspective.
* There, the joined words `trends`, `early.` and `By` are cut at gaps
  inside words, with no extra piece left over.
* All seven regions match seven words in order, with plausible widths.
* Nothing in the geometry tells this apart from a correct line.

### What each change cost

Before keeping a rule, I counted the right and wrong aligned words it
affects across all ground-truth runs:

* The off-band, tall-region and small-piece rules each hit only wrong
  matches.
* The first version of the line-end rule also un-pinned whole runs. It cost
  6 to 14 right words per page, so it was narrowed to lone words that fit
  the missing ones.
* The first version of the unexplained-ink rule doubted a correct word next
  to a word-sized extra region on a synthetic page. It was narrowed to
  small pieces.
* As finally kept, no rule cost a correct match.

## Measurements: ground truth, unaltered pages

| | handwriting_03, Phase 14 → 15 | handwriting_02, Phase 14 → 15 |
|---|---|---|
| Aligned words: right / **false matches** | 62 / 0 → 62 / 0 | 67 / 1 → **68 / 0** |
| Aligned precision | 1.000 → 1.000 | 0.985 → **1.000** |
| Coverage (right ÷ truth words) | 0.492 → 0.492 | 0.563 → 0.571 |
| Extracted glyphs (yield ÷ units) | 136 (18 %) → 136 (18 %) | 0 → 0 (joined hand) |
| Glyphs outside their own word | 0 → 0 | 0 → 0 |
| Rejection reasons | identical | identical |

## Measurements: simulated conditions on the real pages (scored against truth)

These are totals over 18 runs (2 pages × 9 conditions); per run, see
`conditions-before-after.json`.

| | Phase 14 | Phase 15 |
|---|---|---|
| Aligned words right | 777 | **781** |
| False matches | 7 | **1** (`By`, handwriting_02 under perspective) |
| Aligned precision | 0.991 | **0.999** |
| Glyphs extracted | identical in every run | identical in every run |
| Glyphs outside their own word | 0 | 0 |
| Rejection reasons | identical in every run | identical in every run |

## Cursive feasibility (ground truth: letter boundaries)

I annotated the letter boundaries inside six joined words of
handwriting_02, 43 boundaries in all
(`__tests__/realTruth/cursive-letter-boundaries.json`). A seventh word,
`survival`, could not be annotated confidently even by eye.

The pipeline's candidate cuts were compared with these boundaries:

* **24 of 43 cuts (56 %)** fall within 0.35 x-height (about 3 px) of the
  true boundary.
* **No word** has every cut right.
* A letter needs both of its cuts right, so most letters would be cut
  wrongly.

**Conclusion: joined letters cannot be separated reliably at this
resolution.** The explicit rejection stays: "touches a neighbour (boundary
at a thin joining stroke)". An opt-in test pins that no letter of the
joined page is aligned or extracted.

This was measured on 9 px x-height writing. Higher-resolution photos of
joined writing are untested.

## Regression tests

`__tests__/lang4Phase15.test.js` has 19 tests:

* **Real geometry**: the line and region boxes measured on the real pages
  (numbers only), replayed through the step that failed. Each failure
  reproduces without its fix and is gone with it:
  * margin curl, and the vertical margin rule joined to a word;
  * a word lost at the photo's edge under strong skew;
  * a joined word cut in the wrong place.
* **Synthetic pages through the whole pipeline**, scored against their
  truth:
  * a curled double margin rule;
  * a rule fragment where a word is missing;
  * touching lines, both merged and still separable;
  * skew of 4° and −7°;
  * a line cut off at the end;
  * joined letters: words still found, every joined letter refused, none
    extracted.

The opt-in protocol test now requires `Q1.` to be right and at most one
false match across the simulated conditions (the known perspective `By`).
It also measures the cursive cut agreement.

## Limitations

* **Too few pages.** Three real English pages in two hands, at low
  resolution. The numbers describe these pages only, and coverage is about
  half the words. The safeguards favour refusal over guessing.
* **No real Hindi.** No real Devanagari sample exists, so none of this is
  evidence about Hindi.
* **Single annotator.** The ground truth was annotated by the assistant.
* **Simulated conditions.** The conditions were simulated on real pages;
  no new photos were taken.
* **One known false match remains**, under perspective on a joined hand.
* **Not tested on a device.** Nothing was tested on a device, and no APK
  was built.
