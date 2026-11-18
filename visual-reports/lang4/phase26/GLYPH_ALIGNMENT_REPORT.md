# Phase 26 — From recognised text to handwritten glyphs: where the gap really is (12 Nov 2026)

Desktop investigation only; no app, native, dependency or Lang1–3 change.
Scripts and outputs: `poc/` (they reuse the Phase 25 PoC: `../phase25/poc/`).
Everything below was measured on the project's real pages with the
engine itself (transpiled and run in Node) or on the images directly.

## 1. The photographs

The project holds **four** distinct real handwriting images, not five:
`handwriting_03.png` (print hand), `handwriting_02.png` and
`handwriting_01.png` (cursive), `reference1.png` (an alphabet page with print
and cursive variants — the only *mixed* sample, with no transcription).
`Lang2.png` and `Lang3.png` are byte-identical to 01 and 03 (md5). All are
low resolution (692–960 px wide; x-height 9–12 px). `real-samples/` is
empty. No further assignment photos exist in the project; none were
substituted.

| Page | Hand | x-height | Engine verdict on quality |
|---|---|---|---|
| handwriting_03 | print | 12 px | usable, no issues |
| handwriting_02 | cursive | 9 px | usable, **too-small** |
| handwriting_01 | cursive, notebook | 9 px | **unusable** (too-small) |
| reference1 | mixed alphabet, desk photo | — | not analysable without text |

## 2. Root cause: why print gives 136 glyphs and cursive gives 0

Three layers, each measured.

### Layer 1 — resolution (affects both, decisive for the supplied cursive pages)

`alignmentConfidence.js:58–62`: writing with an x-height under 10 px is
flagged `too-small`, which caps every unit's image factor at **0.4 — below
`boundaryOk` 0.45 — so by design no unit on such a page can ever be
"aligned"**. Page 02 (x-height 9 px): 349 of 349 units in clearly aligned
words carry "image: the writing is small"; boundary score median 0.18.
Page 01 is unusable outright: 685 units `low-quality`.

Upscaling the same pages 2× (bicubic; a proxy, not a substitute for real
pixels) lifts the cap:

| Page ×2 | Units aligned | Glyphs extracted | Before |
|---|---|---|---|
| handwriting_03 (print) | 274 of 751 | **209** | 136 |
| handwriting_02 (cursive) | 11 of 658 | **4** | 0 |
| handwriting_01 (cursive) | 1 of 685 | 0 | 0 |

So resolution alone raises the print yield by half, and barely moves
cursive: the rest is structural.

### Layer 2 — joined strokes (inherent to cursive, a deliberate engine rule)

At the 43 hand-read letter boundaries of six cursive words (`cuts.py`):
**43 of 43 cuts pass through ink** — 35 through a single connecting stroke
(≈3 px, the stroke width), 8 through overlapping letter bodies. There is
no gap to cut at. The engine ends a unit only at a gap or at a *valley*
inside connected ink, and `stateFor()` makes any unit bounded by a valley
**ambiguous by rule**, with the edge confidence capped at 0.2–0.6
(`unitBoundaries.js`, `alignmentConfidence.js:134–143`). On page 02, 332 of
349 units in aligned words say "touches a neighbour (boundary at a thin
joining stroke)"; at 2× the boundary median is still 0.43 < 0.45. Cursive
yields nothing because the engine refuses to cut through ink — a safety
rule, not a defect. The print page shows the same effect in miniature: 72
of its 355 units in aligned words also touch a neighbour.

### Layer 3 — even if cutting were allowed, choosing the cut is the hard part

`guided_cuts.py`, same 43 cuts: the column profile offers **70 valleys for
43 true cuts; 25 valleys are letter-internal** (m, n, u, w, r). The
information is in the ink — the valley nearest the *true* cut is within
3 px for 84 % of cuts — but nothing available picks it:

| How the k-th boundary is placed | mean error | within ±3 px |
|---|---|---|
| equal letter widths (the engine's prior when only the text is known) | 4.2 px | 51 % |
| OCR character spans (PP-OCRv5 CTC steps) | 5.5 px | 28 % |
| valley nearest the OCR span boundary | 5.2 px | 44 % |
| *oracle:* valley nearest the hand-read cut | 1.9 px | 84 % |

And the tolerance is tiny: **no true cut lies on a thin connector 6 px or
wider**, so a ±3 px error already bites into a letter body.

## 3. Can OCR coordinates improve glyph association? No.

OCR character positions are coarser than the engine's own width prior
(28 % vs 51 % within 3 px) and far from the oracle; using them to pick
valleys makes placement worse, not better. OCR's contribution is the
**text** (Phase 25: with OCR text the print page gave exactly the same 136
glyphs, none mislabelled), not coordinates. Word-level OCR boxes add
nothing either: the engine's word alignment already localises words (Phase
15 ground truth: 781 right, 1 wrong across 18 runs).

## 4. Actual glyph extraction accuracy (print page, typed or OCR text)

- 136 glyphs from 751 characters (18 %); 20 of 26 lowercase letters and 1
  capital represented (`e` only twice — its counter is usually "too small
  to see" at 12 px). At 2×: 209 glyphs (28 %), 24 of 26 lowercase.
- All 136 boxes inspected at 4× (`poc/out/glyphs-handwriting_03.png`,
  assistant's judgement, not an independent one): **every box holds the
  letter it is labelled with**; the five commas' boxes also include a piece
  of the ruled line; a few boxes clip a neighbour's tail. No wrong letter.
- Rejections are the engine saying why: 530 not aligned, 74 next to an
  uncertain neighbour, 8 counter unresolved, 2 outside the band.
- Cursive pages: 0 glyphs (4 at 2×, all correct by the same inspection).
- Mixed page (reference1): not measurable — no text; OCR reads it badly
  (mean confidence 0.73; e.g. `KkKRK LLEIle` for the K/L rows) because an
  alphabet page has no words for the recogniser's language model to lean
  on. This is exactly where the *prescribed* page text is strongest.

## 5. Proposed solution — keeps every glyph's real geometry, fabricates nothing

1. **Resolution gate before anything else.** Require camera-resolution
   photos (x-height ≥ 20 px; the engine's own limit is 10 px) and say so on
   the photo step. On the supplied pages this is the single largest lever
   for print hands and a precondition for any cursive progress.
2. **Separated letters (print, and the separated letters of any hand):**
   keep the current path. With OCR text it is as safe as with typed text.
   Free-text pages can be photo-only for English print hands once the
   Phase 25 integration is approved; the *alphabet* page stays prescribed
   (OCR has nothing to recognise there, and it is where capitals come from).
3. **Joined letters (cursive): do not cut; learn connected groups.** Store
   each run of ink between real gaps as one *composite* unit keyed by its
   text (a whole word, or a syllable such as `ing`, `th`, `er`), with its
   real geometry; render it only when exactly that text is typed, otherwise
   fall back to the writer's separated letters (never to Lang1). The profile
   reports honestly "N letters learned separately, M connected groups".
   Coverage grows with more photos; nothing is ever cut through ink.
4. **Connector-aware cutting stays research.** Cutting at the right valley
   needs a letter-shape model (the oracle shows 84 % is reachable; position
   priors reach 51 %). If pursued: templates from the writer's own
   separated letters, cuts flagged `joined-left/right` with the half
   connector kept as the glyph's entry/exit stroke, and the renderer
   overlapping those strokes. That is new engine and renderer work and must
   be validated on phone-resolution pages before it touches a profile.

## 6. What reliable Hindi needs

- **Samples (none exist):** 3–5 phone-resolution pages per writer, two
  writers if possible: the alphabet with matras and conjuncts, everyday
  sentences, digits; careful and quick hands; ruled and plain paper; typed
  transcriptions; consent. Kept local.
- **Engine checks on real pages:** headline (shirorekha) detection
  (`segmentation.js:278–311`, measured only on synthetic pages); cluster
  separation *below* the headline (`devanagariAlignment.js`) — Devanagari is
  structurally joined at the headline, so its glyph unit is the cluster, and
  conjuncts/matras raise the same "joined ink" question as cursive;
  false-positive headlines on Latin pages (for script warnings).
- **OCR:** the Devanagari PP-OCRv5 model runs offline and reads printed text,
  but has no handwriting evidence; its dictionary also holds Latin letters,
  so mixed Hindi/English pages may be one pass — unverified.
- **Ground truth:** word boxes and a few hand-read cluster boundaries, as
  was done for English in Phase 14.

## 7. Is native OCR integration ready? Not yet.

- The glyph gap is in the engine's cursive handling and in image
  resolution, not in OCR; integrating OCR would not change the cursive
  result at all.
- The evidence for OCR is one print-hand English page at low resolution;
  Hindi is unmeasured.
- Integration costs a ~30 MB native runtime for a benefit limited today to
  photo-only free-text pages in print-hand English.

Recommended order: (1) phone-resolution English pages (print and cursive)
and real Hindi pages through the Phase 25/26 scripts; (2) the resolution
gate and the connected-group learning design, reviewed on that data; (3)
only then the OCR integration decision. No native work has been started.
