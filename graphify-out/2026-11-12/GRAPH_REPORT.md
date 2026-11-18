# Graph Report - AssignmentMaker  (2026-11-12)

## Corpus Check
- 261 files · ~311,817 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 33 file(s) not represented in the graph (top: (none) 8, .xml 8, .properties 2)

## Summary
- 2141 nodes · 7349 edges · 108 communities (79 shown, 29 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 131 edges (avg confidence: 0.92)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- lang4Alignment.test.js
- CreateHandwritingScreen.js
- ink.test.js
- lang4Phase24.test.js
- ppocr.py
- profileGeneration.js
- lang3Reference1.test.js
- lang4Profile.test.js
- Handwriting Tuner
- lang4Phase15.test.js
- Synthetic Page Fixtures
- getHandwritingStyle
- EditorToolbar.js
- Sample Analysis Pipeline
- react
- EditorScreen.js
- lang4Model.test.js
- textLayout.js
- iOS Native Modules
- Real-Sample Protocol
- referenceHandwriting.test.js
- Personal Renderer
- lang3Reference1.test.js
- imageQuality.js
- Handwriting Components
- Page Detection
- document.js
- Glyph Stroke Definitions
- glyphExtraction.js
- CreateHandwritingViews.js
- lang3.test.js
- Undo/Redo History
- Android Samples Methods
- iOS App Delegate
- ExportRenderer.js
- index.js
- lang4Integration.test.js
- 1. Relevant files and what they do
- realSamples.optin.test.js
- Android Export Methods
- Extraction Tests
- lang4Phase20.test.js
- SelectionFormatBar.js
- Personal Metrics
- Reference Handwriting Tests
- multipage.test.js
- Formatting Editor Tests
- Document Storage
- devDependencies
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
- validationDocs.js
- wordGaps.test.js
- notebookLayout.test.js
- alignSample.js
- imageInput.js
- lang4Phase8.test.js
- contracts.js
- textUnits.js
- devanagariAlignment.js
- ProfilesScreen.js
- lang4Integration.test.js
- ZoomablePage.js
- harm.js
- wordAlignment.js
- Phase 25 — Offline handwriting OCR proof of concept (12 Nov 2026)
- Stroke
- orientation.js
- deviceRendering.test.js
- Architecture
- HandwritingStyleSelector.js
- jest@^29.6.3
- @react-native-community/cli@20.2.0
- @react-native-community/cli-platform-android@20.2.0
- raster.js
- Text recognition (OCR) — status and blocker
- @react-native/eslint-config@0.87.1
- poc/README.md

## God Nodes (most connected - your core abstractions)
1. `EditorScreen()` - 72 edges
2. `react` - 71 edges
3. `CreateHandwritingScreen()` - 69 edges
4. `getHandwritingStyle()` - 64 edges
5. `analyzeSample()` - 57 edges
6. `layoutHandwriting()` - 54 edges
7. `render()` - 49 edges
8. `react-native` - 46 edges
9. `createDocument()` - 46 edges
10. `getPageType()` - 44 edges

## Surprising Connections (you probably didn't know these)
- `Freehand ink (Phase 6)` --references--> `screenToPage()`  [INFERRED]
  README.md → src/ink/strokes.js
- `4. Baseline tests and regression locks (recorded 2026-10-18, before any change)` --references--> `hashString()`  [INFERRED]
  visual-reports/lang4/phase0-baseline.md → src/utils/variation.js
- `2. Describe them: `real-samples/manifest.json`` --references--> `validateManifest()`  [INFERRED]
  visual-reports/lang4/phase14/PROTOCOL.md → __tests__/helpers/realProtocol.js
- `4. What the report contains (and what it does not)` --references--> `assertPrivate()`  [INFERRED]
  visual-reports/lang4/phase14/PROTOCOL.md → __tests__/helpers/realProtocol.js
- `Privacy of real samples (verified in code)` --references--> `assertPrivate()`  [INFERRED]
  visual-reports/lang4/phase18/README.md → __tests__/helpers/realProtocol.js

## Import Cycles
- None detected.

## Communities (108 total, 29 thin omitted)

### Community 0 - "lang4Alignment.test.js"
Cohesion: 0.21
Nodes (15): ALIGNMENT_THRESHOLDS, BLUR, blurReach(), blurredGap(), DEGRADING, edgeConfidence(), hairlineGap(), MIN_GAP_PX (+7 more)

### Community 1 - "CreateHandwritingScreen.js"
Cohesion: 0.11
Nodes (49): CoveragePlan(), Guidelines(), NoRecognitionNote(), handwritingType(), generateProfileId(), PRACTICE_PAGES, practicePage(), analysisInputs() (+41 more)

### Community 2 - "ink.test.js"
Cohesion: 0.13
Nodes (28): angleAt(), centerlinePath(), clamp(), cleanStroke(), DEFAULT_TOOLS, densify(), eraseStrokes(), fmt() (+20 more)

### Community 3 - "lang4Phase24.test.js"
Cohesion: 0.13
Nodes (21): isTextRecognitionAvailable(), recognizeText(), setTextRecognizer(), textRecognitionEngine(), analysisProgress(), photoProgress(), reached(), STAGE_ORDER (+13 more)

### Community 4 - "ppocr.py"
Cohesion: 0.07
Nodes (21): main(), bag_recall(), main(), norm(), tokens(), letters_only(), levenshtein(), main() (+13 more)

### Community 5 - "profileGeneration.js"
Cohesion: 0.11
Nodes (29): checkedScripts(), MAX_PHOTOS, MIN_PHOTOS, ENGINE_DEFAULT_PARAMS, generatePersonalProfile(), headlineAnchors(), languageSupport(), MATHS_CORE_TEXT (+21 more)

### Community 6 - "lang3Reference1.test.js"
Cohesion: 0.15
Nodes (26): appendTail(), ATTEMPT_SALT, chooseForm(), construct(), contextCache, contextualVariant(), enteredCache, ENTRY_AFTER_EXIT (+18 more)

### Community 7 - "lang4Profile.test.js"
Cohesion: 0.15
Nodes (19): GLYPH_SETS, DRAWABLE_STATES, PIPELINE_STAGES, headlineJoins(), rendererGlyphs(), resolveText(), UNSUPPORTED_REASONS, unsupportedRanges() (+11 more)

### Community 8 - "Handwriting Tuner"
Cohesion: 0.18
Nodes (22): getStyleOverrides(), PAPER_TEMPLATES, resetPaperAppearance(), setPaperAppearance(), exportStyleConfig(), getTuningValue(), hasTuning(), resetTuning() (+14 more)

### Community 9 - "lang4Phase15.test.js"
Cohesion: 0.12
Nodes (23): LOST_WORD_MARGIN, MIN_SCALE_WORDS, TALL_REGION, UNEXPLAINED_PIECE, writingBand(), canvas(), compose(), rng() (+15 more)

### Community 10 - "Synthetic Page Fixtures"
Cohesion: 0.19
Nodes (20): applyHomography(), homographyFrom(), invertHomography(), warpGray(), rectifyPage(), makeRaster(), cameraCorners(), downscale() (+12 more)

### Community 11 - "getHandwritingStyle"
Cohesion: 0.11
Nodes (47): renderPage(), BuiltinHandwritingLines, Guides(), HandwritingLines, HandwritingText(), HandwritingTextSwitch(), styles, useStylesVersion() (+39 more)

### Community 12 - "EditorToolbar.js"
Cohesion: 0.17
Nodes (25): Divider(), EditorToolbar(), Option(), styles, Swatch(), ToolButton(), ToolOptions(), Box() (+17 more)

### Community 13 - "Sample Analysis Pipeline"
Cohesion: 0.12
Nodes (32): analyzeSample(), DESKEW_MIN, now(), clearTurn(), turnMask(), BACKGROUND_SHARE, components(), darkMask() (+24 more)

### Community 14 - "react"
Cohesion: 0.13
Nodes (27): HOME, styles, react, react-native, react-native-safe-area-context, styles, PageTypeSelector(), PaperThumb() (+19 more)

### Community 15 - "EditorScreen.js"
Cohesion: 0.07
Nodes (59): builtInHindiGaps(), BuiltInScriptNotice(), styles, Action(), PagesOverview(), PersonalDocumentBanner(), IconButton(), isPersonalStyleId() (+51 more)

### Community 16 - "lang4Model.test.js"
Cohesion: 0.15
Nodes (28): bandOf(), CONFIDENCE_DIMENSIONS, COVERAGE_STATES, DEFAULT_BANDS, summariseCoverage(), unmeasuredConfidence(), validateConfidence(), coverageSummary() (+20 more)

### Community 17 - "textLayout.js"
Cohesion: 0.14
Nodes (26): CORRECTION_KINDS, CORRECTION_SETTINGS, isEligible(), misspell(), planCorrection(), SIMILAR, wordCount(), buildUnderline() (+18 more)

### Community 18 - "iOS Native Modules"
Cohesion: 0.08
Nodes (16): HandWriteExport, HandWriteExportPdfJob, -init, -methodQueue, -prepareFile, +requiresMainQueueSetup, -viewForTag, HandWriteSamples (+8 more)

### Community 19 - "Real-Sample Protocol"
Cohesion: 0.10
Nodes (32): REAL_CONDITIONS, analysisToOriginal(), assertPrivate(), CAPTURE, count(), DANDA, isRelative(), isVowelLetter() (+24 more)

### Community 20 - "referenceHandwriting.test.js"
Cohesion: 0.07
Nodes (41): formattingFor(), inkSvg(), LONG_SAMPLE, ROOT, SAMPLE, SHORT, withOverrides(), baseProfiles (+33 more)

### Community 21 - "Personal Renderer"
Cohesion: 0.08
Nodes (47): baselineIn(), Ink(), PersonalLines(), PersonalText(), PersonalUnavailable(), styles, usePersonalResolution(), LATIN_ZONES (+39 more)

### Community 22 - "lang3Reference1.test.js"
Cohesion: 0.14
Nodes (17): FORM_WIDTH, GLYPH_FORMS, FORMS_LANG3, entered(), sampleChain(), minY(), drawnYs(), enteredForm() (+9 more)

### Community 23 - "imageQuality.js"
Cohesion: 0.27
Nodes (10): assessQuality(), dilate(), edgeSharpness(), METHODS, noiseSigma(), orientationIssue(), QUALITY_THRESHOLDS, ramp() (+2 more)

### Community 24 - "Handwriting Components"
Cohesion: 0.06
Nodes (29): PERSONAL_HANDWRITING_ONBOARDING(), VALIDATION_RELEASE(), VALIDATION_TOOLS(), 2. Bugs found and fixes made, 3. Test results and regression matrix, 4. Performance and memory, 5. Feature classification, 6. Release blockers and recommended next phase (+21 more)

### Community 25 - "Page Detection"
Cohesion: 0.15
Nodes (26): boundaryOf(), cross(), detectPage(), extremum(), fillHoles(), fitLine(), fitQuad(), growInto() (+18 more)

### Community 26 - "document.js"
Cohesion: 0.06
Nodes (40): handwritingStyles, isHandwritingStyle(), VARIATION_LIMITS, appearance, BASE_APPEARANCE, byId, DEFAULT_PAGE_TYPE, isPageType() (+32 more)

### Community 27 - "Glyph Stroke Definitions"
Cohesion: 0.11
Nodes (23): bowlUp(), DEFS, FALLBACK, formsOf(), glyphAdvance(), glyphAdvanceMax(), glyphFor(), glyphForms() (+15 more)

### Community 28 - "glyphExtraction.js"
Cohesion: 0.05
Nodes (81): analysisToFrame(), analysisToPhoto(), analysisToSource(), COUNTER_LETTERS, COUNTER_SPACE, cross2(), DETACHABLE, detachableMarks() (+73 more)

### Community 29 - "CreateHandwritingViews.js"
Cohesion: 0.12
Nodes (33): AnalyzingView(), Bar(), BuildDetails(), Button(), Checks(), CreatingView(), DetailsCard(), DoneView() (+25 more)

### Community 30 - "lang3.test.js"
Cohesion: 0.07
Nodes (44): baselineInRow(), renderLines(), FALLBACK_GLYPH, GLYPHS, GLYPHS_LANG2, GLYPHS_LANG3, LANG3_PROFILE_ID, createMaxMeasurer() (+36 more)

### Community 31 - "Undo/Redo History"
Cohesion: 0.28
Nodes (17): nextToken(), push(), reducer(), useDocumentHistory(), reducer(), useTextHistory(), applyPatch(), COALESCE_WINDOW_MS (+9 more)

### Community 33 - "iOS App Delegate"
Cohesion: 0.12
Nodes (6): AppDelegate, ReactNativeDelegate, React, React_RCTAppDelegate, ReactAppDependencyProvider, UIKit

### Community 34 - "ExportRenderer.js"
Cohesion: 0.13
Nodes (28): delay(), exportBlocker(), ExportRenderer(), exportRenderScale(), nextFrame(), styles, addPdfPage(), beginPdf() (+20 more)

### Community 36 - "lang4Integration.test.js"
Cohesion: 0.10
Nodes (37): App(), @react-native-async-storage/async-storage, react-test-renderer, DEVANAGARI_ALPHABET, createDocument(), HomeScreen(), tidyProfiles(), deletionNotice() (+29 more)

### Community 37 - "1. Relevant files and what they do"
Cohesion: 0.13
Nodes (14): breakLongWord(), 1. Relevant files and what they do, 2. Data structures a Lang4 profile must plug into, 4. Baseline tests and regression locks (recorded 2026-10-18, before any change), 5. Native capabilities and gaps, 6.2 JS learning pipeline: `src/handwriting/learn/` (pure functions, Jest-testable), 6.3 Profile schema (sketch), 6.4 Text units for Devanagari (+6 more)

### Community 38 - "realSamples.optin.test.js"
Cohesion: 0.15
Nodes (15): analyze(), decodePng(), lum(), measurePage(), measureVariation(), median(), decodePngGray(), DIR (+7 more)

### Community 41 - "Extraction Tests"
Cohesion: 0.08
Nodes (23): grid(), 1. Collect five photos, 2. Describe them: `real-samples/manifest.json`, 3. Run, 5. Reading the results honestly, Real handwriting validation protocol (Lang4 Phase 14), Confirmed defects, Files (+15 more)

### Community 42 - "lang4Phase20.test.js"
Cohesion: 0.21
Nodes (25): createProfileVersion(), enqueueWrite(), purgeOrphanedVersions(), readIndex(), readIndexStrict(), readProfileVersion(), referencedVersions(), renameProfile() (+17 more)

### Community 43 - "SelectionFormatBar.js"
Cohesion: 0.23
Nodes (11): Chip(), SelectionFormatBar(), step(), styles, Swatch(), Button(), short(), styles (+3 more)

### Community 44 - "Personal Metrics"
Cohesion: 0.29
Nodes (6): Characters the sheet does not show, Fidelity refinement (follow-up phase), Known approximations, Per-letter findings, reference1.png — Lang3 alphabet sheet analysis (development only), What can and cannot be measured

### Community 45 - "Reference Handwriting Tests"
Cohesion: 0.29
Nodes (6): Lang4 Phase 13: handwriting coverage and profile readiness, Mark boundaries, Prompt changes, `synthetic/document-coverage.json`, `synthetic/prompt-audit-and-support.json`, What a profile claims

### Community 46 - "multipage.test.js"
Cohesion: 0.19
Nodes (28): paginatePersonal(), mapFormatting(), RANGE_KEYS, addPage(), boundariesOf(), countBreaks(), deletePage(), documentSheets() (+20 more)

### Community 47 - "Formatting Editor Tests"
Cohesion: 0.50
Nodes (3): `consistency.png` and `synthetic/` — SYNTHETIC (scored against fixture truth), Lang4 Phase 10 — personal handwriting rendering quality, `real/` — REAL glyphs from `reference/handwriting_03.png` (visual only)

### Community 48 - "Document Storage"
Cohesion: 0.50
Nodes (3): Lang4 Phase 11 — glyph quality and extraction reliability, `real/` — `reference/handwriting_03.png` (visual inspection only), `synthetic/` — SYNTHETIC, scored against fixture truth

### Community 49 - "devDependencies"
Cohesion: 0.14
Nodes (14): devDependencies, @babel/core@^7.25.2, eslint@^8.19.0, prettier@2.8.8, @react-native/babel-preset@0.87.1, @react-native-community/cli-platform-ios@20.2.0, @react-native/jest-preset@0.87.1, react-test-renderer@19.2.3 (+6 more)

### Community 50 - "Word Gap Tests"
Cohesion: 0.50
Nodes (3): Images, Lang4 Phase 12 — Devanagari and multilingual reliability, `synthetic/devanagari-extraction.json`

### Community 51 - "Natural Rhythm Lock"
Cohesion: 0.50
Nodes (3): Lang4 Phase 8 — validation reports, `real/` — real handwriting images (Latin only), `synthetic/` — modelled photo conditions

### Community 52 - "ESLint Config Deps"
Cohesion: 0.20
Nodes (9): @babel/preset-env@^7.25.3, @babel/runtime@^7.25.0, engines, node, name, private, version, @babel/preset-env (+1 more)

### Community 53 - "lang4PersonalRender.test.js"
Cohesion: 0.12
Nodes (27): PERSONAL_ERROR_MESSAGES, buildProfileVersion(), clone(), nextVersion(), normaliseUnits(), ALL_DEFAULT, line(), PARAMS (+19 more)

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

### Community 69 - "validationDocs.js"
Cohesion: 0.17
Nodes (17): demoInk(), demoStroke(), ellipse(), seg(), CHECKLIST, POEM, strokesFor(), DrawingSurface() (+9 more)

### Community 70 - "wordGaps.test.js"
Cohesion: 0.19
Nodes (11): boundary(), gaps(), L1, L2, lay(), metrics, open(), paginate() (+3 more)

### Community 71 - "notebookLayout.test.js"
Cohesion: 0.15
Nodes (13): buildExportPlan(), EXPORT_FORMATS, exportFileName(), JPEG_QUALITY, PDF_PAGE, sanitizeTitle(), L1, L2 (+5 more)

### Community 72 - "alignSample.js"
Cohesion: 0.22
Nodes (17): alignTranscription(), finish(), LOW_MARK_TOP, LOW_MARKS, measureShape(), MIN_INK_HEIGHT, r3(), SHAPED_KINDS (+9 more)

### Community 73 - "imageInput.js"
Cohesion: 0.33
Nodes (10): clearTemporaryImages(), decodeSampleImage(), ERROR_MESSAGES, errorFor(), getImageInput(), isAnalysisAvailable(), isImageInputAvailable(), pickSampleImage() (+2 more)

### Community 74 - "lang4Phase8.test.js"
Cohesion: 0.18
Nodes (13): clearPersonalCache(), listProfiles(), listVersions(), CONFIDENCE_LABELS, deletionMessage(), ProfileDetailsScreen(), REJECTION_LABELS, Row() (+5 more)

### Community 86 - "contracts.js"
Cohesion: 0.20
Nodes (20): validateScore(), ALIGNMENT_LEVELS, ALIGNMENT_STATES, FORBIDDEN_SAMPLE_FIELDS, isBox(), isObj(), METRIC_NAMES, QUALITY_ISSUES (+12 more)

### Community 87 - "textUnits.js"
Cohesion: 0.12
Nodes (26): DEEP, NARROW, prepareExpectedText(), PUNCT_SMALL, TALL, unitPriors(), WIDE, WIDTH_PRIORS (+18 more)

### Community 88 - "devanagariAlignment.js"
Cohesion: 0.22
Nodes (14): blobs(), detachedBelowMarks(), headlineBand(), marksOf(), notSliver(), segmentDevanagariWord(), stemAttributionCost(), STRUCTURE_COST (+6 more)

### Community 89 - "ProfilesScreen.js"
Cohesion: 0.29
Nodes (10): BackIcon(), ScreenHeader(), styles, metaLine(), ProfileCard(), ProfilesScreen(), styles, typeLabel() (+2 more)

### Community 90 - "lang4Integration.test.js"
Cohesion: 0.06
Nodes (66): PERSONAL_HANDWRITING_ONBOARDING, VALIDATION_TOOLS, knownTextFor(), setImageInput(), ENGLISH_EVERYDAY, ENGLISH_WORDS, EXTRA_SLOT, HINDI_NUMBERS (+58 more)

### Community 91 - "ZoomablePage.js"
Cohesion: 0.24
Nodes (12): centringInset(), clampZoom(), MAX_ZOOM, middle(), MIN_ZOOM, scrollAfterZoom(), spread(), stepZoom() (+4 more)

### Community 92 - "harm.js"
Cohesion: 0.18
Nodes (7): csvRows(), MANIFEST, META, PAGES, raster(), run(), wordsText()

### Community 93 - "wordAlignment.js"
Cohesion: 0.24
Nodes (12): BAND_SLACK, cannotHoldLetters(), expectedShape(), FLAT_REGION, isFlatRegion(), isOffBand(), needsHeight(), PUNCTUATION_ONLY (+4 more)

### Community 94 - "Phase 25 — Offline handwriting OCR proof of concept (12 Nov 2026)"
Cohesion: 0.15
Nodes (12): 1. Setup, 2. Results — English (real handwriting), 2a. Full page, detector + recogniser (the realistic path), 2b. Word crops from the truth boxes (recognition alone, 245 words), 2c. Confidence as a filter (tight crops), 2d. Can the recogniser place characters on the ink?, 2e. The question that matters: glyphs extracted from OCR text alone, 3. Hindi (+4 more)

### Community 97 - "orientation.js"
Cohesion: 0.60
Nodes (5): detectOrientation(), linkDirections(), ORIENTATION, pieces(), r3()

### Community 98 - "deviceRendering.test.js"
Cohesion: 0.14
Nodes (19): MAX_SVG_PIXELS, shrinkStyle(), measure(), now(), perfSummary(), record(), resetPerf(), samples (+11 more)

### Community 99 - "Architecture"
Cohesion: 0.18
Nodes (10): Adding a handwriting style, Architecture, Fonts, Freehand ink (Phase 6), HandWrite, Handwriting engine (Phase 2), Handwriting styles (Phase 3), Pages and export (Phase 5) (+2 more)

### Community 100 - "HandwritingStyleSelector.js"
Cohesion: 0.18
Nodes (23): Card(), cardTestId(), HandwritingStyleSelector(), PersonalCard(), personalPreviewText(), PinnedCard(), styles, getHandwritingStyles() (+15 more)

### Community 104 - "raster.js"
Cohesion: 0.13
Nodes (20): B64, boxBlur(), decodeBase64(), MAX_ANALYSIS_EDGE, median(), MIN_ANALYSIS_EDGE, otsu(), rasterFromNative() (+12 more)

### Community 105 - "Text recognition (OCR) — status and blocker"
Cohesion: 0.29
Nodes (6): aligned(), pageFor(), Proposed path (unchanged from the investigation report), Text recognition (OCR) — status and blocker, Why it is a blocker, not a gap, 6. Recommendation

## Knowledge Gaps
- **11 isolated node(s):** `UIKit`, `React`, `React_RCTAppDelegate`, `ReactAppDependencyProvider`, `+requiresMainQueueSetup` (+6 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 533 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **29 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `react` to `lang4Alignment.test.js`, `CreateHandwritingScreen.js`, `ink.test.js`, `lang4Phase24.test.js`, `Handwriting Tuner`, `getHandwritingStyle`, `EditorToolbar.js`, `Sample Analysis Pipeline`, `EditorScreen.js`, `referenceHandwriting.test.js`, `Personal Renderer`, `lang3Reference1.test.js`, `document.js`, `CreateHandwritingViews.js`, `lang3.test.js`, `Undo/Redo History`, `ExportRenderer.js`, `lang4Integration.test.js`, `lang4Phase20.test.js`, `SelectionFormatBar.js`, `multipage.test.js`, `ESLint Config Deps`, `lang4PersonalRender.test.js`, `Runtime Dependencies`, `validationDocs.js`, `wordGaps.test.js`, `notebookLayout.test.js`, `lang4Phase8.test.js`, `ProfilesScreen.js`, `lang4Integration.test.js`, `ZoomablePage.js`, `deviceRendering.test.js`, `HandwritingStyleSelector.js`?**
  _High betweenness centrality (0.089) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `CreateHandwritingScreen()` (e.g. with `isImageInputAvailable()` and `createSampleSet()`) actually correct?**
  _`CreateHandwritingScreen()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `UIKit`, `React`, `React_RCTAppDelegate` to the rest of the system?**
  _11 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `CreateHandwritingScreen.js` be split into smaller, more focused modules?**
  _Cohesion score 0.11041229909154437 - nodes in this community are weakly interconnected._
- **Why does `6. Proposed Lang4 architecture` connect `1. Relevant files and what they do` to `Android Samples Methods`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `getHandwritingStyle()` (e.g. with `1. Relevant files and what they do` and `3. Renderer integration points`) actually correct?**
  _`getHandwritingStyle()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `ink.test.js` be split into smaller, more focused modules?**
  _Cohesion score 0.12903225806451613 - nodes in this community are weakly interconnected._