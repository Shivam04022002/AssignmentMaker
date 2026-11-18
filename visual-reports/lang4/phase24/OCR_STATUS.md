# Text recognition (OCR) — status and blocker

**Status: not implemented. No engine is approved.** The wizard says so on
the photo step and the review ("This version cannot read handwriting from a
photo"), every photo keeps the page the type prescribes, and nothing guesses
text. The seam where a recogniser would plug in exists
(`src/handwriting/learn/textRecognition.js`) and reports `unavailable`.

## Why it is a blocker, not a gap

The engine learns a letter only from ink it can match to known text
(`alignTranscription`, `src/handwriting/learn/alignSample.js:270` returns
`no-text` without it; `extractGlyphs`, `glyphExtraction.js:293`, rejects
every letter that is not `aligned`). Reading that text from the photo needs
an on-device recogniser for **handwritten** English and Hindi. None in the
current dependencies does this, and none of the candidates examined (11 Nov
2026) is at once open, offline, verified on handwriting and available for
both scripts:

| Option | Handwriting, English / Hindi | Licence | Offline / network | Why not yet |
|---|---|---|---|---|
| Google ML Kit Text Recognition v2 (bundled Latin + Devanagari) | documented for printed text; handwriting not documented | closed-source Google terms; usage metrics sent to Google, users must be told | models bundled, but `transport-backend-cct` adds `INTERNET` and `ACCESS_NETWORK_STATE`; "may contact Google servers" | breaks the local-only rule; accuracy on handwriting unknown; iOS has no confidence API |
| ML Kit Digital Ink | handwriting, but pen strokes on screen, not photos | closed | models downloaded at run time | wrong input |
| Apple Vision | Hindi not listed; handwriting unconfirmed | part of iOS | on-device | iOS only |
| Tesseract | printed text | Apache 2.0 | offline | poor on handwriting |
| TrOCR (handwritten) | verified, English only | code MIT; IAM training data non-commercial | offline | ~234 MB, no Hindi, licence |
| Indic HTR baselines (IIIT-INDIC-HW-WORDS) | verified Hindi words (papers) | code MIT; dataset licence unconfirmed for Hindi; weights not found | offline | nothing shippable yet |
| PaddleOCR PP-OCRv5 mobile + ONNX Runtime Mobile | English handwriting claimed; Devanagari printed only | Apache 2.0 / MIT | fully on-device | **best candidate**, unmeasured on our pages |

## Proposed path (unchanged from the investigation report)

1. Desktop bench: run PaddleOCR's English and Devanagari mobile recognisers
   with ONNX Runtime on the app's own word cuts of the real reference pages
   (245-word ground truth); measure word accuracy and, above all, the wrong
   words that survive both a confidence threshold and the alignment check.
2. Agree a go/no-go gate (suggested: at most 1 wrong word learned in 200).
3. Hindi needs 3–5 real handwritten pages with their texts; without them
   Hindi stays unmeasured.
4. Only if the gate passes: a native spike (permissions in the runtime's
   manifest, reduced-build size, quantised models), behind the existing seam.

## How a recogniser would be wired (when approved)

`recognizeText(raster, { scripts })` returns candidate lines with
confidence. The wizard would use them as the photo's *candidate* known text;
`alignTranscription` still has to confirm every word against the ink, and
only `aligned` letters are learned — the same safeguard as today. The review
would show the recognised text per photo for correction (the correction UI
already exists: `setTextOverride` in `sampleSet.js`), and the analysis
screen's "Reading handwriting" stage replaces "Matching handwriting to each
page's text" (`isTextRecognitionAvailable()`).
