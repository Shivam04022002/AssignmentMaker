# Real handwriting validation protocol (Lang4 Phase 14)

This protocol measures the Lang4 pipeline on real photos of handwriting.
It never changes what the app does. The photos stay on your computer: the
`real-samples/` folder is git-ignored, and nothing is uploaded or logged.

## 1. Collect five photos

Write the five wizard samples by hand. Copy each exactly, including line
breaks:

| Slot | Content | Scripts |
|---|---|---|
| 1 | English alphabet prompt (`LATIN_ALPHABET` in `src/handwriting/learn/samplePrompts.js`) | Latn |
| 2 | Hindi alphabet prompt (`DEVANAGARI_ALPHABET`) | Deva |
| 3 | Digits, punctuation and sentence (`LATIN_DIGITS_TEXT`) | Latn |
| 4 | Hindi paragraph, ideally the suggested text (`HINDI_SUGGESTED`) | Deva |
| 5 | Mixed English and Hindi, ideally the suggested text (`MIXED_SUGGESTED`) | Latn, Deva |

How to take the photos:

* Use a phone camera at full resolution, with the whole sheet in view.
* Export each photo as **PNG**. The offline test runner only decodes PNG;
  the app's native decoder also reads JPEG and HEIC.
* Optionally, retake one or more pages under the conditions you want to
  measure: uneven light, a shadow, ruled paper, a tilted page, a photo
  taken at an angle, or smaller writing. Record each condition in the
  manifest.

## 2. Describe them: `real-samples/manifest.json`

```json
{
  "version": 1,
  "samples": [
    {
      "id": "hindi-paragraph",
      "file": "slot4.png",
      "slot": 4,
      "scripts": ["Deva"],
      "transcription": "माता जी ने दादी को चाय दी और नाना जी बाज़ार गए।\n…",
      "capture": { "lighting": "even", "paper": "ruled", "writingSize": "normal", "skewDeg": 2, "perspective": true },
      "provenance": { "source": "my own handwriting, phone photo, 20 Oct 2026", "consent": true },
      "truth": "slot4.words.json"
    }
  ]
}
```

Field rules:

* **transcription** is the exact text written, line for line. It is the
  expected text, and every result is measured against it.
* **capture.lighting** is one of `even`, `uneven`, `dim`, `shadow` or
  `flash`.
* **capture.paper** is one of `plain`, `ruled`, `grid` or `notebook`.
* **capture.writingSize** is one of `normal`, `small` or `large`.
* **provenance.consent** must be `true`: the writer agreed to this local
  test.
* **truth** is optional: a word-box file in the format of
  `__tests__/realTruth/reference-pages.words.json`. It gives each line's
  centre y, and for each word its text and left and right x, in the
  original photo's pixels. Without a truth file a sample still gets counts
  and refusal reasons, but no right/wrong score.

`validateManifest()` lists every problem, and nothing runs on an invalid
manifest. Missing slots are reported, not refused.

## 3. Run

```
REAL_SAMPLES=1 REAL_REPORT_DIR=real-samples/report npx jest __tests__/realProtocol.optin.test.js
```

It runs both the reference pages (`reference/`) and your
`real-samples/`. Set `REAL_SAMPLES_DIR` to use another folder.

## 4. What the report contains (and what it does not)

For each sample, the report gives:

* image quality and issues, page detection, orientation, skew and line
  count;
* alignment counts (aligned, ambiguous and missing words and units);
* extraction counts, **usable-glyph yield** (glyphs kept ÷ units in the
  text) and refusals by code.

The same counts are broken down by **script feature**:

* Latin letters, capitals, digits and punctuation;
* Devanagari vowels and consonants, matras (pre, post, above, below),
  nukta, conjuncts, halant, anusvara and visarga, and danda;
* units on mixed-script lines.

For Devanagari, the report also counts how many accepted clusters have a
traceable headline.

The rest depends on what's available:

* **With truth:** an aligned word is right when its box centre lands on
  its annotated word. Units and accepted glyphs are scored as "in their
  own word". This is ground truth.
* **Simulated conditions:** samples with truth are re-run under lighting,
  shadow, skew, perspective and smaller-writing variants, all mapped back
  to the truth.
* **Profile:** a profile is built from the set, with its status, the
  requirements, and each script's required and optional coverage.

The report does not contain:

* **Letter identity.** Whether an accepted glyph is the right letter needs
  visual inspection of a contact sheet. Phase 14 did this for one page by
  hand (`real/h03-accepted-glyphs-*.png`), and it is reported separately
  from the ground-truth numbers.
* **Pixels, image data or absolute paths.** `assertPrivate()` checks this
  before anything is written.

## 5. Reading the results honestly

A handful of pages measures those pages. Report the sample count next to
every number, keep truth-based results apart from visual inspection, and
don't generalise to "accuracy". With no real Hindi page, nothing is known
about real Devanagari handwriting.
