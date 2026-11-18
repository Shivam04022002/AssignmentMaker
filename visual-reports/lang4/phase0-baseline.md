# Lang4 — Phase 0 baseline and architecture assessment

**Date:** 2026-10-18
**Scope:** audit only. No production file was modified and no dependency was added.
**Validation:** desktop/Jest only. **Device not tested** (no device or emulator; `adb` unavailable). **No APK built.**

## 1. Relevant files and what they do

| Area | File(s) | Role |
|---|---|---|
| App shell / navigation | `App.js` | In-memory screen stack (Home → New → Editor, plus dev tuner and validation). No navigation library. |
| Profile registry | `src/data/handwritingStyles.js` | Static registry built once from `HANDWRITING_PROFILES`. `resolveStyleId` and `getHandwritingStyle` (unknown id → Lang1). Dev overrides are in-memory only. |
| Profiles | `src/handwriting/handwritingProfiles.js` | `REFERENCE_PROFILE` (Lang1), `LANG2_PROFILE`, `LANG3_PROFILE`. `completeProfile()` derives `fontScale`, spacing and metrics. |
| Glyph data | `glyphs.js` (Lang1 + registry), `glyphsLang2.js`, `glyphsLang3.js`, `strokeBuilder.js` | Glyph = `{ w, strokes: [cubic chain] }` in x-height units (baseline 0, y up). `GLYPH_SETS` is a static object. `GLYPH_FORMS` (Lang3 only) holds per-letter forms `{ w, weight, strokes }`. `glyphFor(char, set)` falls back to the neutral `FALLBACK_GLYPH` box and never borrows across sets. |
| Stroke model | `src/handwriting/strokeModel.js` | Per occurrence: form choice (`chooseForm` / `wordForms`), variant warp, sampling, construction, reshape, exit tails, pressure curve. Seeded; no `Math.random`. |
| Renderer | `src/handwriting/glyphRender.js` | `renderLines(lines, {profile, layout, …})` → grouped SVG paths (buckets by colour, mode and ink level); pressure ribbons; corrections; thumbnails. |
| Layout | `src/utils/textLayout.js` | Paragraphs → whitespace tokens → word shapes (`buildWordShape`: per-letter variation, forms, width) → lines. Measures via `createMeasurer` / `glyphAdvance`. Word seed = document · page · style · word-in-context. |
| Pagination | `src/utils/pagination.js` | Sheets (on `\f`) laid out once per sheet with a stable page id; lines dealt onto pages without re-measuring. |
| Formatting | `src/utils/formatting.js` | Text-range model (headings, underlines, labels, spans, gaps); `reformat()` maps ranges through edits. |
| Document | `src/models/document.js` (`DOCUMENT_VERSION = 5`) | `normalizeDocument` keeps `handwritingStyle` only if `isHandwritingStyle(id)`, **otherwise it resets the document to Lang1**. |
| Persistence | `src/storage/documentStorage.js` | AsyncStorage v3, `createAsyncStorage('handwrite')`. Keys `documents:index` and `doc:<id>`, JSON. The backend is swappable for tests. |
| Editor and UI | `EditorScreen.js`, `NewDocumentScreen.js`, `HandwritingStyleSelector.js` (live preview cards from `getHandwritingStyles()`), `SelectionFormatBar.js`, `WordGapControl.js`, `PaperPage.js`, `PaperCanvas.js`, `HandwritingText.js`, `ZoomablePage.js` | — |
| Editing | `useDocumentHistory.js`, `useTextHistory.js`, `ink/*` (freehand pen, marker, eraser), `handwriting/corrections.js` | — |
| Export | `src/export/*` + `modules/handwrite-export` | In-repo native module (Kotlin + Obj-C, `NativeModules.HandWriteExport`): vector PDF, PNG/JPG capture, share. |
| Dev tools | `scripts/visual-preview.js` (Jest-run HTML renderer), `src/dev/*`, `HandwritingTunerScreen`, `ValidationScreen` | — |

## 2. Data structures a Lang4 profile must plug into

- **Profile object** (after `completeProfile`): `id`, `name`, `glyphSet`, `xHeightPerPitch`, `ascender`, `capHeight`, `descender`, `strokeWidth`, `letterGap`, `glyphWidth`, `wordGap`, `slant`, `variation{}`, `charVariation{}`, `stroke{}`, `pressure{}`, `ink{}`, `corrections{}`, `rhythm`, `contextSeed`, optional `page{}` (own notebook layout), `metrics{}`.
- **Glyph** (`{ w, strokes }`): cubic chains `[x0,y0, c1x,c1y, c2x,c2y, x1,y1, …]`, sampled by `sampleChain`. A dot is a very short stroke.
- **Forms**: `GLYPH_FORMS[set][char] = [{ w, weight, strokes }, …]`. Layout stores `shape.forms`, and the renderer draws exactly those.

The learned geometry can be expressed in this format. Image-derived centre-lines become cubic chains in x-height units, measured against the writer's own baseline and x-height, so the renderer needs no new glyph format.

## 3. Renderer integration points

1. **Glyph lookup** — `glyphFor`, `glyphForms`, `glyphAdvance`, `glyphAdvanceMax`, read from `GLYPH_SETS` / `GLYPH_FORMS`. Lang4 needs dynamic registration (`registerGlyphSet(name, table, forms)`), additive only.
2. **Profile lookup** — `getHandwritingStyle`, `resolveStyleId`, `isHandwritingStyle`. Lang4 needs dynamic registration of saved personal profiles (`registerProfile` / `unregisterProfile`).
3. **Text units** — everything is code-point based (`Array.from(text)`):
   - `buildWordShape` (letters, forms, per-letter formatting);
   - `breakLongWord`;
   - `glyphRender` (`shape.chars` / `Array.from(shape.text)`);
   - corrections (`fix.attempt`).

   Devanagari needs grapheme or orthographic clusters (for example "कि" = क + ि with ि drawn **before** क). A cluster path is therefore required, enabled per profile so the code-point path for Lang1–3 stays byte-identical.
4. **Document normalisation** — `normalizeDocument` must stop dropping `personal:` ids. If such a profile isn't loaded, the document keeps its id and the editor shows "profile unavailable" instead of silently switching to Lang1.
5. **Style selector** — lists `getHandwritingStyles()`; personal profiles would appear once registered.

## 4. Baseline tests and regression locks (recorded 2026-10-18, before any change)

- **Tests:** `npx jest` gives **24 suites, 715 tests, all passing** (≈131 s). `npx eslint .` is **clean**.
- **Bundles:** `npx react-native bundle --platform android|ios --dev false` built successfully in the last phase.
- **Hash locks** (`hashString`):

| Lock | Hash | Notes |
|---|---|---|
| Lang1 glyph data | 3649923111 | — |
| Lang1 layout `[x, width, gap]` | 4194404481 | seed `'lang1-lock'` |
| Lang1 render output | 2797748489 | length 47216 |
| Lang2 glyph data | 1005853950 | — |
| Lang2 render output | 4030609738 | length 52295, seed `'lang2-lock'` |

  Locations: `naturalRhythm.test.js`, `lang3.test.js`, `lang3Reference1.test.js`, `lang3Fidelity.test.js`, `notebookLayout.test.js`.
- **Lang3:** there is no hash lock. It is protected by behavioural tests, including the notebook layout calibration, forms, widths and clearance. Before shared changes I'll add a Lang3 output hash lock, so "unchanged" can be proven byte-for-byte.

## 5. Native capabilities and gaps

| Capability | Status |
|---|---|
| Image picking | **None.** No image-picker dependency, no native picker code. |
| Image decoding to pixels | **None.** Nothing in the app can turn a JPEG/PNG/HEIC into pixel data in JS. |
| EXIF orientation | None. |
| Local file and temp management | Only inside `handwrite-export` (export directory, share). |
| Storage | AsyncStorage v3 (scoped `handwrite` store). Fine for profiles of a few hundred KB; use one key per profile (plus chunks if needed). The Android SQLite row/CursorWindow limits (~2 MB) need verifying on a device. |
| JS engine | Hermes, New Architecture on (`newArchEnabled=true`, `hermesEnabled=true`). |
| `Intl.Segmenter` on Hermes | **Not reliable.** Hermes's `Intl` support is partial and this can't be verified here. Lang4 must not depend on it. |
| Unicode property regexes (`/\p{L}/u`) | Already used in the app, but never verified on a device (all validation so far is desktop). |
| Network | The manifest has `INTERNET` (React Native default). Lang4 adds no network code. |

## 6. Proposed Lang4 architecture

### 6.1 Native: a small in-repo module, `modules/handwrite-samples` (recommended)
It would follow the `handwrite-export` pattern (Kotlin + Obj-C, `NativeModules` interop) and use platform decoders only, with no network and no third-party SDK:

- **`pickImage()`:** Android Photo Picker (`ACTION_PICK_IMAGES`, falling back to `ACTION_GET_CONTENT`); iOS `PHPickerViewController`. It copies the image into an app-private temp folder and returns `{ uri, width, height, bytes, mime }`.
- **`decodeLuminance(uri, maxSide)`:** applies EXIF orientation, decodes downsampled (`inSampleSize` / `CGImageSource` thumbnail) to about 2000 px on the long side, and returns 8-bit luminance as base64 plus its dimensions. This keeps 12 MP and HEIC phone photos workable in JS memory.
- **`deleteTemp(paths)` / `clearTemp()`:** cleanup after success or cancellation.

**Why not off-the-shelf libraries?**
- `react-native-image-picker` only picks; decoding would still be missing.
- Pure-JS decoders (`jpeg-js`, `upng-js`) are slow on Hermes for full-resolution photos and can't read HEIC.
- An in-repo module adds no npm dependency.

**Risk:** native code I can't build or run here (no APK builds, no device). I can only compile-check it by inspection and test the JS side against a mock. It needs your manual device build to validate.

### 6.2 JS learning pipeline: `src/handwriting/learn/` (pure functions, Jest-testable)

| Stage (spec name) | Implementation |
|---|---|
| ImageQualityAnalyzer | Size, sharpness (variance of Laplacian), exposure (histogram), contrast, ink coverage, skew estimate. Gives each issue + advice. |
| ImagePreprocessor | Luminance → background flattening (large-window mean) → adaptive threshold (Sauvola) tuned to keep thin strokes → ruled-line suppression (long thin horizontal runs with uniform thickness, removed only where they don't cross ink blobs) → deskew (projection-profile variance). |
| WritingRegionDetector | Ink bounding region, margins, row projection → text lines with baseline / x-height estimates and confidence. |
| LineAndCharacterSegmenter | Connected components per line; word gaps from a gap histogram. Latin: components merged by overlap (i/j dots, accents). Devanagari: shirorekha = the dominant dense row band in the upper third of a word; it is excluded when splitting into aksharas, so a word isn't cut at the headline. Marks above/below are attached to the nearest base. Uncertain splits are kept and reported, not forced. |
| ScriptAndCharacterAnalyzer | **No OCR is possible on-device without an ML model, which the spec rules out.** Characters are identified by aligning segments to **known prompt text** (DP alignment allowing merges and splits); see decision D2. |
| GlyphGeometryExtractor / StrokeGeometryReconstructor | Zhang–Suen thinning → skeleton graph (end points, junctions) → path tracing (heuristic pen order: left-to-right, top-to-bottom, preferring smooth continuation at junctions) → Douglas–Peucker → cubic fitting → normalised to the existing x-height units. Stroke width from a distance transform. Low-quality shapes are labelled `outline-approx` or rejected; nothing claims to be the recovered pen order. |
| GlyphVariantBuilder | Repeated observations of a unit become forms `{ w, weight, strokes }` — the same structure Lang3 uses. |
| HandwritingMetricsAnalyzer | x-height, ascender/descender and cap ratios, slant (dominant near-vertical skeleton angle), letter and word gaps, baseline drift, stroke width, size variation — all measured, each with a sample count. |
| ProfileConfidenceAnalyzer | Per unit, nine 0–1 components from measurable quantities: image quality score, region and segmentation margins, alignment cost, skeleton cleanliness (spurs/breaks), fit residual, number of observations, composition evidence. Combined by a documented weighted geometric mean. Not calibrated probabilities. |
| MissingCharacterResolver | Coverage by script; compositions only from observed components (e.g. consonant + observed matra). Otherwise unsupported, with a request for an extra sample. Never Lang1–3, never a font. |
| PersonalProfileBuilder | Versioned JSON (see 6.3). Engine defaults only for renderer mechanics (pressure model, warp amounts), never for letter shapes, and every default is listed in `limitations`. |
| ProfileRepository | Keys `profiles:index` and `profile:<id>@<version>`; validation and migration; rename, delete, orphan policy (see decision D3). |

### 6.3 Profile schema (sketch)
Profile id `personal:<id>` with fields:
- `kind: 'personal-learned'`, `schemaVersion`, `engineVersion`, `version`;
- `supportedScripts`, `metrics`, `params` (the renderer profile fields);
- `units: { "<unit string>": { forms: [{ w, weight, strokes, source, method, confidence }], script, class, anchors? } }`;
- `coverage`, `confidence`, `diagnostics`, `limitations`.

A unit is a Latin character or a Devanagari cluster string. No pixels are kept by default; only small optional preview thumbnails, if you choose.

### 6.4 Text units for Devanagari
- A small own segmenter (Devanagari U+0900–U+097F categories: consonant, independent vowel, matra (pre/post/above/below), virama, nukta, anusvara/chandrabindu/visarga) builds orthographic clusters with source ranges `[start, end)`.
- It is used by layout and renderer only when the profile declares `units: 'cluster'`. Lang1–3 keep the code-point path unchanged, guarded by hash locks.
- Formatting and gaps stay text-range based; a cluster takes the formatting of its first code point.
- Line breaking already happens at words; `breakLongWord` would split at cluster boundaries for Lang4.
- Rendering order: a whole observed cluster is drawn as observed. A composed cluster places the pre-base ि left of its base and other matras by anchors measured from the samples. The shirorekha is drawn per word from the measured headline height and thickness.

### 6.5 Shared-code changes needed (all additive, all gated)
1. `glyphs.js`: `registerGlyphSet` / `unregisterGlyphSet` for `personal:*` sets.
2. `handwritingStyles.js`: register and unregister personal profiles; a change listener already exists (`notify`).
3. `document.js`: keep `personal:*` ids; carry `handwritingProfileVersion`.
4. `textLayout.js` / `glyphRender.js`: a cluster-unit path used only by `units: 'cluster'` profiles.
5. A visible marker for unsupported units, plus an editor list of unsupported ranges.

Each of these will be proven harmless by the Lang1/Lang2 hash locks and a new Lang3 hash lock.

### 6.6 Test strategy without private handwriting
- **Synthetic fixtures** are generated in Jest by rasterising known stroke geometry into luminance buffers (a small pure-JS rasteriser in the test helpers), then degraded: rotation, blur, low contrast, uneven light, ruled lines, noise. The pipeline's recovered regions and geometry are compared with the known truth.
- **Devanagari fixtures** need hand-authored test shapes (fixture-only, never app glyphs).
- **Your reference images** are your handwriting. I won't add them as fixtures unless you allow it (decision D4).

## 7. Technical limitations to state up front
- **Pen movement:** pen order, direction and pressure can't be recovered from a photo; they are reconstructed heuristically and labelled as such.
- **Identification:** without OCR, a character is only known from where it sits in the prompt text, or from what you typed for a free sample. A free sample with neither contributes only metrics (size, slant, spacing, stroke width), not glyphs.
- **Hindi coverage:** five images cannot cover the thousands of possible conjuncts.
  - Expect consonants, independent vowels, matras and a handful of observed conjuncts.
  - Other conjuncts are composed from half-forms only where a half-form was observed; otherwise they are marked unsupported.
- **Thinning artefacts:** loops that touch, ink blobs and touching letters weaken skeleton quality, which shows up in confidence rather than being hidden.
- **On-device validation:** native picking and decoding, Hermes performance, memory and AsyncStorage size limits all need your device build; I can only measure in Node.

## 8. Decisions needed before Phase 1

| # | Decision | Recommendation |
|---|---|---|
| D1 | Image input | The in-repo native module `handwrite-samples` (picker + EXIF + downsampled luminance + temp cleanup). |
| D2 | Character identification | Guided prompts. Images 1–3 use fixed prompt text shown in the wizard; images 4–5 take an optional typed transcription of what was written. Untranscribed text contributes metrics only. |
| D3 | Profile updates vs existing documents | Versions are immutable and a document pins `profileId@version`. Updating creates a new version; old versions are kept while any document references them. Deleting a referenced profile asks first and keeps the versions those documents need. |
| D4 | Your handwriting as test fixtures | Synthetic fixtures only by default; real samples only if you approve, and kept out of the repo. |
| D5 | Shared-code changes | The five additive, gated changes in 6.5, guarded by the Lang1/Lang2 locks and a new Lang3 hash lock added first. |
