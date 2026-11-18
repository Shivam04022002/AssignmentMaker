# Graph Report - AssignmentMaker  (2026-10-28)

## Corpus Check
- 240 files · ~293,270 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 31 file(s) not represented in the graph (top: (none) 8, .xml 8, .properties 2)

## Summary
- 1968 nodes · 6854 edges · 101 communities (73 shown, 28 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 99 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- lang4Alignment.test.js
- CreateHandwritingScreen.js
- ink.test.js
- realism.test.js
- Profile Schema & Text Units
- Profile Generation & Prompts
- strokeModel.js
- personalStore.js
- Handwriting Tuner
- lang4Phase22.test.js
- Synthetic Page Fixtures
- Text Layout & Corrections
- lang2Complete.test.js
- Sample Analysis Pipeline
- RN Imports & Screens
- EditorScreen.js
- lang4Phase8.test.js
- textLayout.js
- iOS Native Modules
- Real-Sample Protocol
- Style Registry
- Personal Renderer
- lang3.test.js
- lang4Analysis.test.js
- Handwriting Components
- Page Detection
- HandwritingStyleSelector.js
- Glyph Stroke Definitions
- Glyph Extraction
- getHandwritingStyle
- naturalRhythm.test.js
- Undo/Redo History
- Android Samples Methods
- iOS App Delegate
- deviceRendering.test.js
- App.js
- HomeScreen.js
- glyphForms
- analyze-reference.js
- Android Export Methods
- Extraction Tests
- lang4Onboarding.test.js
- Lang3 Fidelity
- Personal Metrics
- Reference Handwriting Tests
- multipage.test.js
- Formatting Editor Tests
- Document Storage
- Dev Dependencies
- Word Gap Tests
- Natural Rhythm Lock
- ESLint Config Deps
- lang4PersonalRender.test.js
- Stroke Fitting
- Android Application
- Samples Package
- Runtime Dependencies
- Document Model
- Android Activity
- Export Package
- Export Module Manifest
- Samples Module Manifest
- Export Plan
- npm Scripts
- glyphRender.js
- Metro Config
- AsyncStorage Mock
- lang4Phase13.test.js
- render
- RN CLI
- lang3Reference1.test.js
- Jest Preset
- contracts.js
- textUnits.js
- lang4Phase21.test.js
- document.js
- lang4Integration.test.js
- ZoomablePage.js
- lang4Phase20.test.js
- segmentation.js
- Stroke
- lang4ProfileUI.test.js
- syntheticTextPage
- safeGenerate
- @react-native-community/cli@20.2.0
- @react-native-community/cli-platform-android@20.2.0
- @react-native/jest-preset@0.87.1

## God Nodes (most connected - your core abstractions)
1. `EditorScreen()` - 72 edges
2. `react` - 68 edges
3. `getHandwritingStyle()` - 64 edges
4. `analyzeSample()` - 56 edges
5. `CreateHandwritingScreen()` - 54 edges
6. `layoutHandwriting()` - 54 edges
7. `render()` - 47 edges
8. `createDocument()` - 46 edges
9. `react-native` - 45 edges
10. `getPageType()` - 44 edges

## Surprising Connections (you probably didn't know these)
- `4. What the report contains (and what it does not)` --references--> `assertPrivate()`  [INFERRED]
  visual-reports/lang4/phase14/PROTOCOL.md → __tests__/helpers/realProtocol.js
- `Privacy of real samples (verified in code)` --references--> `assertPrivate()`  [INFERRED]
  visual-reports/lang4/phase18/README.md → __tests__/helpers/realProtocol.js
- `Reviewed, no change needed` --references--> `rasterFromNative()`  [INFERRED]
  visual-reports/lang4/prebuild-audit/README.md → src/handwriting/learn/raster.js
- `4. Baseline tests and regression locks (recorded 2026-10-18, before any change)` --references--> `hashString()`  [INFERRED]
  visual-reports/lang4/phase0-baseline.md → src/utils/variation.js
- `2. Describe them: `real-samples/manifest.json`` --references--> `validateManifest()`  [INFERRED]
  visual-reports/lang4/phase14/PROTOCOL.md → __tests__/helpers/realProtocol.js

## Import Cycles
- None detected.

## Communities (101 total, 28 thin omitted)

### Community 0 - "lang4Alignment.test.js"
Cohesion: 0.05
Nodes (79): ALIGNMENT_THRESHOLDS, BLUR, blurReach(), blurredGap(), DEGRADING, edgeConfidence(), hairlineGap(), MIN_GAP_PX (+71 more)

### Community 1 - "CreateHandwritingScreen.js"
Cohesion: 0.12
Nodes (33): clearTemporaryImages(), decodeSampleImage(), ERROR_MESSAGES, errorFor(), getImageInput(), isAnalysisAvailable(), isImageInputAvailable(), pickSampleImage() (+25 more)

### Community 2 - "ink.test.js"
Cohesion: 0.06
Nodes (77): Adding a handwriting style, Architecture, Fonts, Freehand ink (Phase 6), HandWrite, Handwriting engine (Phase 2), Handwriting styles (Phase 3), Realism (Phase 4) (+69 more)

### Community 3 - "realism.test.js"
Cohesion: 0.13
Nodes (20): @react-native-async-storage/async-storage, getHandwritingStyles(), PAGE_TYPES, setStorageBackend(), tokenizeWithSpacing(), page, STYLE_IDS, baseInk() (+12 more)

### Community 4 - "Profile Schema & Text Units"
Cohesion: 0.14
Nodes (32): bandOf(), CONFIDENCE_DIMENSIONS, COVERAGE_STATES, DEFAULT_BANDS, summariseCoverage(), unmeasuredConfidence(), validateConfidence(), validateScore() (+24 more)

### Community 5 - "Profile Generation & Prompts"
Cohesion: 0.11
Nodes (32): PIPELINE_STAGES, ENGINE_DEFAULT_PARAMS, generatePersonalProfile(), headlineAnchors(), languageSupport(), MATHS_CORE_TEXT, MATHS_EXTRA_TEXT, mean() (+24 more)

### Community 6 - "strokeModel.js"
Cohesion: 0.16
Nodes (25): glyphFor(), appendTail(), ATTEMPT_SALT, chooseForm(), construct(), contextCache, contextualVariant(), enteredCache (+17 more)

### Community 7 - "personalStore.js"
Cohesion: 0.19
Nodes (23): baselineIn(), Ink(), PersonalLines(), PersonalText(), PersonalUnavailable(), styles, usePersonalResolution(), personalXHeight() (+15 more)

### Community 8 - "Handwriting Tuner"
Cohesion: 0.20
Nodes (20): resetPaperAppearance(), setPaperAppearance(), exportStyleConfig(), getTuningValue(), hasTuning(), resetTuning(), setTuningValue(), stepTuningValue() (+12 more)

### Community 9 - "lang4Phase22.test.js"
Cohesion: 0.12
Nodes (32): checkedScripts(), HANDWRITING_TYPES, handwritingType(), MAX_PHOTOS, MIN_PHOTOS, REQUIRED_SETS, DEFAULT_PAGES, EXTRA_SLOT (+24 more)

### Community 10 - "Synthetic Page Fixtures"
Cohesion: 0.17
Nodes (23): QUALITY_ISSUES, validateQualityResult(), applyHomography(), homographyFrom(), invertHomography(), warpGray(), rectifyPage(), rotateGray() (+15 more)

### Community 11 - "Text Layout & Corrections"
Cohesion: 0.10
Nodes (49): demoInk(), ellipse(), formattingFor(), inkSvg(), LONG_SAMPLE, renderPage(), ROOT, SAMPLE (+41 more)

### Community 12 - "lang2Complete.test.js"
Cohesion: 0.20
Nodes (8): LANG2_PROFILE_ID, ACADEMIC, L1, L1_STROKES, L2, metrics, paginate(), rowHeight

### Community 13 - "Sample Analysis Pipeline"
Cohesion: 0.16
Nodes (24): analyzeSample(), DESKEW_MIN, now(), clearTurn(), detectOrientation(), linkDirections(), ORIENTATION, pieces() (+16 more)

### Community 14 - "RN Imports & Screens"
Cohesion: 0.14
Nodes (27): react, react-native, Action(), styles, PageTypeSelector(), PaperThumb(), styles, PenSelector() (+19 more)

### Community 15 - "EditorScreen.js"
Cohesion: 0.08
Nodes (54): PagesOverview(), PersonalDocumentBanner(), EditorScreen(), ExportButton(), FormatButton(), SettingsSheet(), styles, tidyProfiles() (+46 more)

### Community 16 - "lang4Phase8.test.js"
Cohesion: 0.13
Nodes (38): coverageOf(), loadProfileSummaries(), SCRIPT_NAMES, createProfileVersion(), enqueueWrite(), listProfiles(), listVersions(), purgeOrphanedVersions() (+30 more)

### Community 17 - "textLayout.js"
Cohesion: 0.14
Nodes (26): CORRECTION_KINDS, CORRECTION_SETTINGS, isEligible(), misspell(), planCorrection(), SIMILAR, wordCount(), buildUnderline() (+18 more)

### Community 18 - "iOS Native Modules"
Cohesion: 0.08
Nodes (16): HandWriteExport, HandWriteExportPdfJob, -init, -methodQueue, -prepareFile, +requiresMainQueueSetup, -viewForTag, HandWriteSamples (+8 more)

### Community 19 - "Real-Sample Protocol"
Cohesion: 0.10
Nodes (32): decodePngGray(), REAL_CONDITIONS, analysisToOriginal(), assertPrivate(), CAPTURE, count(), DANDA, isRelative() (+24 more)

### Community 20 - "Style Registry"
Cohesion: 0.06
Nodes (52): withOverrides(), baseProfiles, clampVariation(), getStyleOverrides(), handwritingStyles, isHandwritingStyle(), LEGACY, LEGACY_STYLE_IDS (+44 more)

### Community 21 - "Personal Renderer"
Cohesion: 0.08
Nodes (47): LATIN_ZONES, DRAWABLE_STATES, BASELINE, cache, CLASSES, classOf(), heightOf(), inkBox() (+39 more)

### Community 22 - "lang3.test.js"
Cohesion: 0.07
Nodes (26): setNativeExporter(), FALLBACK_GLYPH, GLYPHS, GLYPHS_LANG2, LANG3_PROFILE_ID, XH_EM, L2, L3 (+18 more)

### Community 23 - "lang4Analysis.test.js"
Cohesion: 0.10
Nodes (30): assessQuality(), dilate(), edgeSharpness(), METHODS, noiseSigma(), orientationIssue(), QUALITY_THRESHOLDS, ramp() (+22 more)

### Community 24 - "Handwriting Components"
Cohesion: 0.06
Nodes (27): VALIDATION_TOOLS(), 2. Bugs found and fixes made, 3. Test results and regression matrix, 4. Performance and memory, 5. Feature classification, 6. Release blockers and recommended next phase, Lang4 Phase 16: integration and release-readiness audit, 0. Prerequisites (checked on the build PC, Phase 18) (+19 more)

### Community 25 - "Page Detection"
Cohesion: 0.15
Nodes (26): boundaryOf(), cross(), detectPage(), extremum(), fillHoles(), fitLine(), fitQuad(), growInto() (+18 more)

### Community 26 - "HandwritingStyleSelector.js"
Cohesion: 0.23
Nodes (13): Card(), cardTestId(), HandwritingStyleSelector(), PersonalCard(), personalPreviewText(), PinnedCard(), styles, byId (+5 more)

### Community 27 - "Glyph Stroke Definitions"
Cohesion: 0.11
Nodes (20): bowlUp(), DEFS, FALLBACK, formsOf(), GLYPH_FORMS, GLYPHS_LANG3, inkExtent(), LETTER_GAP (+12 more)

### Community 28 - "Glyph Extraction"
Cohesion: 0.05
Nodes (77): GLYPH_SETS, analysisToFrame(), analysisToPhoto(), analysisToSource(), COUNTER_LETTERS, COUNTER_SPACE, cross2(), DETACHABLE (+69 more)

### Community 29 - "getHandwritingStyle"
Cohesion: 0.12
Nodes (35): Pages and export (Phase 5), builtInHindiGaps(), BuiltInScriptNotice(), styles, BuiltinHandwritingLines, Guides(), HandwritingLines, HandwritingText() (+27 more)

### Community 30 - "naturalRhythm.test.js"
Cohesion: 0.23
Nodes (11): emptyFormatting(), all(), draw(), gapPair(), gapsOf(), L1, L2, lag1() (+3 more)

### Community 31 - "Undo/Redo History"
Cohesion: 0.28
Nodes (17): nextToken(), push(), reducer(), useDocumentHistory(), reducer(), useTextHistory(), applyPatch(), COALESCE_WINDOW_MS (+9 more)

### Community 33 - "iOS App Delegate"
Cohesion: 0.12
Nodes (6): AppDelegate, ReactNativeDelegate, React, React_RCTAppDelegate, ReactAppDependencyProvider, UIKit

### Community 34 - "deviceRendering.test.js"
Cohesion: 0.12
Nodes (30): now(), perfSummary(), record(), resetPerf(), samples, setPerfEnabled(), buildValidationDocument(), POEM (+22 more)

### Community 35 - "App.js"
Cohesion: 0.22
Nodes (11): App(), displayName, HOME, name, styles, react-native-safe-area-context, coverageText(), deletionNotice() (+3 more)

### Community 36 - "HomeScreen.js"
Cohesion: 0.29
Nodes (8): VALIDATION_RELEASE, DocumentCard(), EmptyState(), HomeScreen(), MiniPage(), styles, tidyProfiles(), formatRelativeTime()

### Community 37 - "glyphForms"
Cohesion: 0.10
Nodes (25): glyphAdvance(), glyphAdvanceMax(), glyphForms(), tableFor(), formsUpTo(), letterForm(), wordForms(), breakLongWord() (+17 more)

### Community 38 - "analyze-reference.js"
Cohesion: 0.54
Nodes (6): analyze(), decodePng(), lum(), measurePage(), measureVariation(), median()

### Community 41 - "Extraction Tests"
Cohesion: 0.07
Nodes (24): grid(), 1. Collect five photos, 2. Describe them: `real-samples/manifest.json`, 3. Run, 4. What the report contains (and what it does not), 5. Reading the results honestly, Real handwriting validation protocol (Lang4 Phase 14), Confirmed defects (+16 more)

### Community 42 - "lang4Onboarding.test.js"
Cohesion: 0.14
Nodes (25): analysisInputs(), discardAll(), dropSample(), heldUris(), moveSample(), pageOf(), problem(), QUALITY_NOT_ANALYSED (+17 more)

### Community 43 - "Lang3 Fidelity"
Cohesion: 0.23
Nodes (11): Chip(), SelectionFormatBar(), step(), styles, Swatch(), Button(), short(), styles (+3 more)

### Community 44 - "Personal Metrics"
Cohesion: 0.29
Nodes (6): Characters the sheet does not show, Fidelity refinement (follow-up phase), Known approximations, Per-letter findings, reference1.png — Lang3 alphabet sheet analysis (development only), What can and cannot be measured

### Community 45 - "Reference Handwriting Tests"
Cohesion: 0.29
Nodes (6): Lang4 Phase 13: handwriting coverage and profile readiness, Mark boundaries, Prompt changes, `synthetic/document-coverage.json`, `synthetic/prompt-audit-and-support.json`, What a profile claims

### Community 46 - "multipage.test.js"
Cohesion: 0.14
Nodes (31): buildExportPlan(), EXPORT_FORMATS, exportFileName(), JPEG_QUALITY, PDF_PAGE, RASTER_WIDTH, sanitizeTitle(), mapFormatting() (+23 more)

### Community 47 - "Formatting Editor Tests"
Cohesion: 0.50
Nodes (3): `consistency.png` and `synthetic/` — SYNTHETIC (scored against fixture truth), Lang4 Phase 10 — personal handwriting rendering quality, `real/` — REAL glyphs from `reference/handwriting_03.png` (visual only)

### Community 48 - "Document Storage"
Cohesion: 0.50
Nodes (3): Lang4 Phase 11 — glyph quality and extraction reliability, `real/` — `reference/handwriting_03.png` (visual inspection only), `synthetic/` — SYNTHETIC, scored against fixture truth

### Community 49 - "Dev Dependencies"
Cohesion: 0.15
Nodes (13): devDependencies, @babel/core@^7.25.2, @babel/preset-env@^7.25.3, @babel/runtime@^7.25.0, @react-native/babel-preset@0.87.1, @react-native-community/cli-platform-ios@20.2.0, @react-native/eslint-config@0.87.1, @babel/core (+5 more)

### Community 50 - "Word Gap Tests"
Cohesion: 0.50
Nodes (3): Images, Lang4 Phase 12 — Devanagari and multilingual reliability, `synthetic/devanagari-extraction.json`

### Community 51 - "Natural Rhythm Lock"
Cohesion: 0.50
Nodes (3): Lang4 Phase 8 — validation reports, `real/` — real handwriting images (Latin only), `synthetic/` — modelled photo conditions

### Community 52 - "ESLint Config Deps"
Cohesion: 0.20
Nodes (9): jest@^29.6.3, prettier@2.8.8, engines, node, name, private, version, jest (+1 more)

### Community 53 - "lang4PersonalRender.test.js"
Cohesion: 0.12
Nodes (23): PERSONAL_ERROR_MESSAGES, ALL_DEFAULT, line(), PARAMS, SOURCES, syntheticForm(), syntheticProfile(), syntheticUnits() (+15 more)

### Community 54 - "Stroke Fitting"
Cohesion: 0.50
Nodes (3): Lang4 Phase 9 — page detection and image reliability, `real/` — the reference pages (Latin only, no ground truth), `synthetic/` — modelled conditions, scored against fixture truth

### Community 57 - "Runtime Dependencies"
Cohesion: 0.18
Nodes (11): dependencies, handwrite-export@file:modules/handwrite-export, handwrite-samples@file:modules/handwrite-samples, react@19.2.3, react-native@0.87.1, @react-native-async-storage/async-storage@^3.1.1, react-native-safe-area-context@^5.5.2, react-native-svg@15.15.5 (+3 more)

### Community 61 - "Export Module Manifest"
Cohesion: 0.25
Nodes (7): description, files, license, main, name, private, version

### Community 62 - "Samples Module Manifest"
Cohesion: 0.25
Nodes (7): description, files, license, main, name, private, version

### Community 64 - "npm Scripts"
Cohesion: 0.33
Nodes (6): scripts, android, ios, lint, start, test

### Community 65 - "glyphRender.js"
Cohesion: 0.18
Nodes (23): alphaLevels(), around(), blob(), centreLine(), closedSpline(), f1(), MARKER_TEXT, mul() (+15 more)

### Community 66 - "Metro Config"
Cohesion: 0.40
Nodes (3): config, @react-native/metro-config@0.87.1, @react-native/metro-config

### Community 67 - "AsyncStorage Mock"
Cohesion: 0.50
Nodes (3): createAsyncStorage(), createMemoryStorage(), databases

### Community 69 - "lang4Phase13.test.js"
Cohesion: 0.12
Nodes (18): PERSONAL_HANDWRITING_ONBOARDING, VALIDATION_TOOLS, DEVANAGARI_ALPHABET, LATIN_ALPHABET, LATIN_DIGITS_TEXT, ALL_PROMPTS, completeProfile(), ENGLISH_DOC (+10 more)

### Community 70 - "render"
Cohesion: 0.17
Nodes (19): LANG2_PROFILE, createDocument(), open(), openNew(), startEditing(), byTestId(), press(), render() (+11 more)

### Community 73 - "lang3Reference1.test.js"
Cohesion: 0.16
Nodes (15): FORM_WIDTH, entered(), sampleChain(), minY(), drawnYs(), enteredForm(), extent(), L1 (+7 more)

### Community 86 - "contracts.js"
Cohesion: 0.24
Nodes (16): ALIGNMENT_LEVELS, ALIGNMENT_STATES, FORBIDDEN_SAMPLE_FIELDS, isBox(), isObj(), METRIC_NAMES, SAMPLE_MIME_TYPES, SAMPLE_SCRIPTS (+8 more)

### Community 87 - "textUnits.js"
Cohesion: 0.21
Nodes (15): keysOf(), codePoints(), devanagariClass(), drawingOrder(), isAsciiPunct(), isGeneralPunct(), isLatinLetter(), isLatinMark() (+7 more)

### Community 88 - "lang4Phase21.test.js"
Cohesion: 0.26
Nodes (14): knownTextFor(), SAMPLE_SLOTS, createSampleSet(), allChecked(), buildDisabled(), checked(), file(), flush() (+6 more)

### Community 89 - "document.js"
Cohesion: 0.44
Nodes (9): deleteDocument(), docKey(), enqueueWrite(), getBackend(), listDocuments(), parse(), readIndex(), saveDocument() (+1 more)

### Community 90 - "lang4Integration.test.js"
Cohesion: 0.20
Nodes (12): toBase64(), nativeDouble(), builtInInk(), fakeNativeInput(), flush(), outer(), personalStrokes(), recordingExporter() (+4 more)

### Community 91 - "ZoomablePage.js"
Cohesion: 0.24
Nodes (12): centringInset(), clampZoom(), MAX_ZOOM, middle(), MIN_ZOOM, scrollAfterZoom(), spread(), stepZoom() (+4 more)

### Community 92 - "lang4Phase20.test.js"
Cohesion: 0.29
Nodes (11): setImageInput(), chooseType(), fakeNativeInput(), flush(), outer(), photo(), saveState(), textOf() (+3 more)

### Community 93 - "segmentation.js"
Cohesion: 0.42
Nodes (8): median(), bandsOf(), clamp01(), classifyComponents(), round1(), segment(), smooth(), wordGapThreshold()

### Community 95 - "lang4ProfileUI.test.js"
Cohesion: 0.39
Nodes (8): changeText(), fillWizard(), flush(), outer(), photo(), photos(), textOf(), waitFor()

### Community 96 - "syntheticTextPage"
Cohesion: 0.20
Nodes (15): boxBlur(), canvas(), compose(), rng(), syntheticPage(), syntheticTextPage(), photo(), analysed() (+7 more)

### Community 97 - "safeGenerate"
Cohesion: 0.33
Nodes (5): safeGenerate(), Final pre-build audit (Lang4 and the app), Fixes, Remaining risks (unverified), Reviewed, no change needed

## Knowledge Gaps
- **11 isolated node(s):** `UIKit`, `React`, `React_RCTAppDelegate`, `ReactAppDependencyProvider`, `+requiresMainQueueSetup` (+6 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 473 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **28 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `RN Imports & Screens` to `lang4Alignment.test.js`, `CreateHandwritingScreen.js`, `ink.test.js`, `realism.test.js`, `personalStore.js`, `Handwriting Tuner`, `lang4Phase22.test.js`, `Text Layout & Corrections`, `lang2Complete.test.js`, `EditorScreen.js`, `lang4Phase8.test.js`, `Style Registry`, `Personal Renderer`, `lang3.test.js`, `lang4Analysis.test.js`, `HandwritingStyleSelector.js`, `getHandwritingStyle`, `naturalRhythm.test.js`, `Undo/Redo History`, `deviceRendering.test.js`, `App.js`, `HomeScreen.js`, `lang4Onboarding.test.js`, `Lang3 Fidelity`, `multipage.test.js`, `ESLint Config Deps`, `lang4PersonalRender.test.js`, `Runtime Dependencies`, `lang4Phase13.test.js`, `render`, `lang3Reference1.test.js`, `lang4Phase21.test.js`, `lang4Integration.test.js`, `ZoomablePage.js`, `lang4Phase20.test.js`, `lang4ProfileUI.test.js`?**
  _High betweenness centrality (0.096) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `getHandwritingStyle()` (e.g. with `1. Relevant files and what they do` and `3. Renderer integration points`) actually correct?**
  _`getHandwritingStyle()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `UIKit`, `React`, `React_RCTAppDelegate` to the rest of the system?**
  _11 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `lang4Alignment.test.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05318352059925094 - nodes in this community are weakly interconnected._
- **Why does `6.1 Native: a small in-repo module, `modules/handwrite-samples` (recommended)` connect `glyphForms` to `Android Samples Methods`?**
  _High betweenness centrality (0.092) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `CreateHandwritingScreen()` (e.g. with `isImageInputAvailable()` and `createSampleSet()`) actually correct?**
  _`CreateHandwritingScreen()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `CreateHandwritingScreen.js` be split into smaller, more focused modules?**
  _Cohesion score 0.1226890756302521 - nodes in this community are weakly interconnected._