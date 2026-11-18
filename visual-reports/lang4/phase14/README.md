# Lang4 Phase 14: real handwriting validation

**Sample set:** three real handwritten pages, all English (Latin). There
is **no real Hindi (Devanagari) sample**, so nothing in this report says
anything about real Hindi handwriting. The e-matra boundary issue and the
missing Hindi clusters could not be investigated on real evidence, and the
explicit rejections stay as they were in Phase 13.

The protocol and how to run it on your own five photos are in
[PROTOCOL.md](PROTOCOL.md).

## Sample provenance

| Page | What it is | Status |
|---|---|---|
| `reference/handwriting_03.png` (852×753) | Print hand on ruled paper, 18 lines of prose | Analysed, with word-level ground truth |
| `reference/handwriting_02.png` (898×730) | Joined (cursive) hand on ruled paper, 16 lines | Analysed, with word-level ground truth |
| `reference/handwriting_01.png` (692×748) | Joined hand in a ruled notebook, 18 lines | Analysed, counts only |
| `reference/reference1.png` (960×1280) | Phone photo of an alphabet sheet on a desk, with several variants of each letter | Not analysed: no exact transcription could be typed with confidence. Page detection was already checked in Phase 9. |

`Lang2.png` and `Lang3.png` are byte-identical copies of
`handwriting_01.png` and `handwriting_03.png`.

All pages were provided with the project. The writer, the capture device
and any editing were not recorded, and the images are small (about
700–900 px wide), so writing x-heights are only 9–12 px. None of them is a
slot 1–4 prompt page. The protocol reports slots 1–4 as missing.

**Ground truth:** `__tests__/realTruth/reference-pages.words.json` holds
245 words (126 + 119). Word extents were read by eye from enlarged strips
with a pixel ruler, to about ±4 px. They were annotated by the assistant,
not by an independent person. One box was found wrong on a zoomed check:
the comma of "marketing," was 6 px further right than first annotated.
It was corrected.

## Results with ground truth (word boxes)

Phase 14 code, unaltered pages. "Right" means the box centre lands on the
annotated word and line.

| | handwriting_03 | handwriting_02 |
|---|---|---|
| Words in truth | 126 | 119 |
| Aligned words: right / wrong | 62 / 0 | 67 / 1 (`Q1.`) |
| Aligned precision / recall | 1.00 / 0.49 | 0.985 / 0.56 |
| Ambiguous words: on their word / elsewhere | 46 / 12 | 22 / 22 |
| Missing words | 6 | 7 |
| Aligned units: right / wrong | 221 / 0 | 0 / 0 |
| Accepted glyphs: in their own word / elsewhere | 136 / 0 | 0 / 0 |

On handwriting_02, every letter is refused because the hand is joined:
"touches a neighbour (boundary at a thin joining stroke)". This is a
correct refusal, not an accuracy result.

## Results by visual inspection (not ground truth)

* **Letter identity.** All 136 accepted glyphs of handwriting_03 were
  inspected on contact sheets (`real/h03-accepted-glyphs-*.png`), each
  shown as its source crop, stored strokes and label. All 136 carry the
  letter they were cut from.
* **Shape defects.** Two have minor flaws: one `l` (#31) is traced with a
  kink, and one `u` (#132) has its right stem traced short.
* **Rendered output.** `real/h03-validation-render.png` shows text drawn
  with glyphs learned from handwriting_03. It is a validation-only render,
  not a saved profile. Learned letters are drawn in the page's hand.
  Letters the page did not teach (`f j q v x y :`) are dashed boxes.

## Profile coverage

A profile built from these pages is **refused as insufficient**, and the
reasons are given:

* lowercase: 20 of 26 learned, missing `f j q v x y`;
* capitals: 1 of 26 learned (`I`);
* digits: none.

The support text reads "English: not enough learned to write it". Prose
pages cannot replace the prompt pages.

## Photo conditions (simulated on the real pages, scored against truth)

The table below is for handwriting_03. On handwriting_02, aligned words
stay 59–96 right with 0–1 wrong, but no glyphs are kept (joined hand).

| Condition | Usable | Aligned right / wrong | Glyphs kept (yield) |
|---|---|---|---|
| Clean | yes | 62 / 0 | 136 (18 %) |
| Uneven light (45 % falloff) | yes | 62 / 0 | 71 (9.5 %) |
| Dim, low contrast | yes | 68 / 0 | 191 (25 %) |
| Hard shadow band | **refused** (page unclear) | 0 | 0 |
| Skew 4° | yes | 59 / 0 | 98 (13 %) |
| Skew −7° | yes | 60 / **2** (`Q1.`, `advantages`) | 98 (13 %) |
| Perspective on a desk (25° tilt) | yes, page found and straightened | 38 / 0 | 102 (14 %) |
| Writing ×0.75 (x-height 9 px) | **refused** (too small) | 0 | 0 |
| Writing ×0.6 (x-height 8 px) | **refused** (too small) | 0 | 0 |

Under every condition, on both pages, every accepted glyph comes from its
own word: none were found elsewhere. Wrong aligned words appear only under
skew −7° and on handwriting_02 (`Q1.`, `By`), and none of them produced
glyphs.

## Confirmed defects

1. **Fixed: a rule fragment was accepted as a word.** On handwriting_03, a
   3 px tall piece of the ruled line (x 728–850) was aligned as the heading
   word "Market", on width alone. On handwriting_02, such fragments were
   also absorbing words.
   * **Fix** (`src/handwriting/learn/wordAlignment.js`): a region flatter
     than 0.4 x-height can no longer match, merge into or split from a
     word that contains a letter, digit or cluster. Words made only of
     punctuation, such as a dash, still can.
   * **Effect:**
     * handwriting_03: wrong aligned words 1 → 0.
     * handwriting_02: aligned words 55 → 68, all right except the known
       `Q1.`; ambiguous words placed elsewhere 37 → 22.
   * **Regression checks:**
     * The Devanagari bench is identical.
     * The Latin sweep and conditions benches are identical.
     * In the Phase 11 extraction bench, one refused unit's code changes;
       nothing kept changes.
2. **Not fixed: the curled end of a double margin rule.** On
   handwriting_02, `Q1.` is matched to the curl at the margin rule's left
   end.
   * Its height (1.2 x-height) and ink density don't separate it from
     thin-pen letters, so no safe criterion was found.
   * It produces no glyphs, because no letter on that page is accepted.
   * It is pinned in the opt-in test as a known failure.
3. **Not fixed: wrong words on touching lines under strong skew.** Under a
   simulated skew of −7°, two words on a crowded first line are matched
   one word off. The "lines touch" warning is on 48 right and 2 wrong
   aligned words, so demoting those words would discard far more right
   matches than wrong ones. No change.
4. **Not fixed: a cursive word cut in two shifts a neighbour.** On
   handwriting_02 under low contrast or perspective, one word (`By`) was
   matched part of a word off when a cursive word split. This happened in
   1 of 77–97 aligned words. No change.
5. **Not fixed: limits that are refused with their reason.**
   * Joined (cursive) hands give no letters.
   * Writing with an x-height of 9 px or less is refused as too small:
     handwriting_01, and both pages scaled down.
   * A hard-edged shadow makes the page "unclear" and the sample is
     refused.
   * Uneven light halves the glyph yield.

## Files

* `real/protocol-report.json`: the opt-in protocol run on the reference
  pages (counts only; checked free of pixels and paths).
* `real/truth-alignment-before-after.json`: ground-truth scores before and
  after the fix.
* `real/h03-accepted-glyphs-{0,1,2}.png`: contact sheets for the visual
  inspection.
* `real/h03-validation-render.png`: the validation-only render.

## Limitations

* **Too few pages.** Three real pages in two hands, low resolution, with no
  prompt pages. These numbers describe these pages only. They are not a
  measure of accuracy.
* **No real Hindi.** No real Devanagari sample exists, so there is no
  evidence on matras, nukta, conjuncts or headlines in real writing. The
  protocol measures all of these once real pages are added.
* **Single annotator.** The ground truth was annotated by the assistant,
  with no second annotator.
* **Simulated conditions.** The photo conditions were simulated on real
  pages; no new photos were taken.
* **Not tested on a device.** Nothing was tested on a device, and no APK
  was built.
