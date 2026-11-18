# Phase 24 — the ten-screen handwriting-profile flow (11 Nov 2026)

Reference: the ten-screen HandWrite storyboard (Home, introduction, type,
reference photos, analysing, review, name, creating, success, My
Handwritings). Everything below is implemented with the existing engine;
**no text is read from photos** (see `OCR_STATUS.md`), so each photo still
shows the page the type prescribes for it, and the wizard says so.

## Screens

| # | Screen | Where | What is real |
|---|---|---|---|
| 1 | Home | `HomeScreen.js` (unchanged) | New Document, Create My Handwriting, My Handwritings, Recent Documents |
| 2 | Introduction | `IntroView` | the four steps; Get Started |
| 3 | Choose a type | `TypeChooser` | six types with glyph, title, description, radio; Continue waits for a choice |
| 4 | Add Reference Photos | `PhotoGrid` + `SampleCard` | exactly 5 tiles; add / replace (tap) / remove (×, copy released); per-photo page text, checks, move; guidelines; the no-OCR note; coverage plan; Analyze Photos enabled only with 5 valid distinct photos |
| 5 | Analyzing | `AnalyzingView`, `analysisProgress()` | per-photo state from the recorded analysis stages (`analyzeSample` now reports each stage through `onStage`); four stages tick in order; the percentage is the mean stage progress; failures stop with the problems named |
| 6 | Review Result | `ReviewView`, `reviewSummary.js` | banner from the build status; photos used with their verdicts and checks; per script a bar and a row per set (counts from the build report only); missing and low-confidence characters; the engine's details; **text correction** per photo (`setTextOverride`), re-checked and rebuilt |
| 7 | Name | `NameView` | name, type, photos, date; Save disabled for an empty name |
| 8 | Creating | `CreatingView` | processing → learning → saving → finalising, each after the real step; a failure returns to the name step with the message |
| 9 | Success | `DoneView` | type, photos, date, version; Create Another Handwriting (back to the type step); Go to Documents (Home) |
| 10 | My Handwritings | `ProfilesScreen.js` | glyph, name, "Type · v1 · date", coverage, status; search |

## Files changed

- `src/screens/CreateHandwritingScreen.js` — rewritten as the eight-step flow (state, pipeline calls, saving).
- `src/components/CreateHandwritingViews.js` — new: the views above.
- `src/handwriting/learn/reviewSummary.js` — new: coverage per script/set from the build report.
- `src/handwriting/learn/textRecognition.js` — new: the OCR seam, `unavailable` (no engine).
- `src/handwriting/learn/analyzeSample.js` — optional `onStage` progress callback (reporting only).
- `src/handwriting/learn/sampleSet.js` — `knownTextOf`, `setTextOverride`, `textOverrideProblem`; metadata mode `user` for a correction; five-photo wording.
- `src/handwriting/learn/handwritingTypes.js` — `MIN_PHOTOS = 5`; `glyph` and `subtitle` per type.
- `src/handwriting/learn/profileLibrary.js` — summaries carry `handwritingType` and `createdAt`.
- `src/screens/ProfilesScreen.js` — new card layout, `metaLine`, `typeLabel`, search.
- `src/utils/format.js` — `formatDay`.
- `App.js` — the wizard gets `onGoToDocuments`; it no longer jumps to the list on save.
- `src/dev/flags.js` — `VALIDATION_BUILD` restored to `false` (it was `true` from a validation build).
- Tests: new `__tests__/lang4Phase24.test.js`; updated `lang4Onboarding`, `lang4Phase20`–`22`, `lang4ProfileUI`, `lang4Integration`, `lang4Analysis`, `helpers/wizard.js`.
- Docs: this report, `OCR_STATUS.md`, section 2 of `phase17/DEVICE_VALIDATION_CHECKLIST.md`.

Unchanged: Lang1–3 and their hash locks, glyph extraction, the renderer,
pagination, export, profile versioning and document pinning, native
modules, dependencies, release configuration.

## Not done / limitations

- **OCR**: not implemented; blocker and proposal in `OCR_STATUS.md`.
- **Camera capture**: the native image modules offer the system photo picker
  only (`ACTION_PICK_IMAGES` / `PHPicker`); taking a photo in-app would be a
  native-module change, not made. Users take the photo with the camera app
  and pick it.
- **"Recognised text" on the review** is the page text the photo was matched
  to (or the user's correction), never text read from the photo.
- Only the Lang4 pipeline's existing per-stage granularity is shown; the
  stage list is honest about what completed, not a time estimate.
- No device run: not built, not installed.
