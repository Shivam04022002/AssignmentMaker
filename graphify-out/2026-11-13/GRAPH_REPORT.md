# Graph Report - AssignmentMaker  (2026-11-12)

## Corpus Check
- 270 files · ~325,419 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 33 file(s) not represented in the graph (top: (none) 8, .xml 8, .properties 2)

## Summary
- 2174 nodes · 7409 edges · 114 communities (85 shown, 29 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 133 edges (avg confidence: 0.92)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Phase 26 — From recognised text to handwritten glyphs: where the gap really is (12 Nov 2026)
- CreateHandwritingScreen.js
- ink.test.js
- lang4Phase24.test.js
- ppocr.py
- profileGeneration.js
- lang3Reference1.test.js
- lang4Phase22.test.js
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
- lang4Phase11.test.js
- lang4Analysis.test.js
- Handwriting Components
- Page Detection
- handwritingEngine.test.js
- Glyph Stroke Definitions
- glyphExtraction.js
- CreateHandwritingViews.js
- naturalRhythm.test.js
- Undo/Redo History
- Android Samples Methods
- iOS App Delegate
- ExportRenderer.js
- skeleton.js
- selectionFormatting.test.js
- lang3Fidelity.test.js
- realSamples.optin.test.js
- Android Export Methods
- Extraction Tests
- lang4Phase8.test.js
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
- preBuildAudit.test.js
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
- lang4Extraction.test.js
- HomeScreen.js
- notebookLayout.test.js
- alignSample.js
- lang2.test.js
- lang4Phase12.test.js
- contracts.js
- textUnits.js
- devanagariAlignment.js
- HandwritingStyleSelector.js
- lang4Integration.test.js
- deviceRendering.test.js
- harm.js
- wordAlignment.js
- Phase 25 — Offline handwriting OCR proof of concept (12 Nov 2026)
- Stroke
- strokeFit.js
- corrections.test.js
- HandwritingText.js
- expectedText.js
- lang4PersonalRender.test.js
- strokeModel.test.js
- @react-native-community/cli@20.2.0
- @react-native-community/cli-platform-android@20.2.0
- segmentation.js
- glyphToSource
- Real handwriting validation protocol (Lang4 Phase 14)
- poc/README.md
- 6. Proposed Lang4 architecture
- Final pre-build audit (Lang4 and the app)
- eslint@^8.19.0
- @react-native/jest-preset@0.87.1
- react-test-renderer
- phase26/poc/README.md

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
- `Reviewed, no change needed` --references--> `rasterFromNative()`  [INFERRED]
  visual-reports/lang4/prebuild-audit/README.md → src/handwriting/learn/raster.js
- `Freehand ink (Phase 6)` --references--> `screenToPage()`  [INFERRED]
  README.md → src/ink/strokes.js
- `4. Baseline tests and regression locks (recorded 2026-10-18, before any change)` --references--> `hashString()`  [INFERRED]
  visual-reports/lang4/phase0-baseline.md → src/utils/variation.js
- `2. Describe them: `real-samples/manifest.json`` --references--> `validateManifest()`  [INFERRED]
  visual-reports/lang4/phase14/PROTOCOL.md → __tests__/helpers/realProtocol.js
- `4. What the report contains (and what it does not)` --references--> `assertPrivate()`  [INFERRED]
  visual-reports/lang4/phase14/PROTOCOL.md → __tests__/helpers/realProtocol.js

## Import Cycles
- None detected.

## Communities (114 total, 29 thin omitted)

### Community 0 - "Phase 26 — From recognised text to handwritten glyphs: where the gap really is (12 Nov 2026)"
Cohesion: 0.15
Nodes (12): stateFor(), 1. The photographs, 2. Root cause: why print gives 136 glyphs and cursive gives 0, 3. Can OCR coordinates improve glyph association? No., 4. Actual glyph extraction accuracy (print page, typed or OCR text), 5. Proposed solution — keeps every glyph's real geometry, fabricates nothing, 6. What reliable Hindi needs, 7. Is native OCR integration ready? Not yet. (+4 more)

### Community 1 - "CreateHandwritingScreen.js"
Cohesion: 0.08
Nodes (65): knownTextFor(), handwritingType(), clearTemporaryImages(), decodeSampleImage(), ERROR_MESSAGES, errorFor(), getImageInput(), isAnalysisAvailable() (+57 more)

### Community 2 - "ink.test.js"
Cohesion: 0.11
Nodes (40): demoStroke(), strokesFor(), DrawingSurface(), styles, addPoint(), angleAt(), centerlinePath(), clamp() (+32 more)

### Community 3 - "lang4Phase24.test.js"
Cohesion: 0.12
Nodes (23): checkedScripts(), MAX_PHOTOS, MIN_PHOTOS, REQUIRED_SETS, SET_INFO, isDigit(), ROW_LABELS, rowsOf() (+15 more)

### Community 4 - "ppocr.py"
Cohesion: 0.06
Nodes (27): main(), bag_recall(), main(), norm(), tokens(), letters_only(), levenshtein(), main() (+19 more)

### Community 5 - "profileGeneration.js"
Cohesion: 0.12
Nodes (31): PIPELINE_STAGES, ENGINE_DEFAULT_PARAMS, generatePersonalProfile(), headlineAnchors(), languageSupport(), MATHS_CORE_TEXT, MATHS_EXTRA_TEXT, mean() (+23 more)

### Community 6 - "lang3Reference1.test.js"
Cohesion: 0.19
Nodes (23): glyphFor(), glyphForms(), tableFor(), chooseForm(), construct(), contextCache, contextualVariant(), entered() (+15 more)

### Community 7 - "lang4Phase22.test.js"
Cohesion: 0.17
Nodes (18): ENGLISH_EVERYDAY, ENGLISH_WORDS, EXTRA_SLOT, HINDI_NUMBERS, HINDI_WORDS, MATHS_ENGLISH, MATHS_HINDI, PRACTICE_PAGES (+10 more)

### Community 8 - "Handwriting Tuner"
Cohesion: 0.10
Nodes (31): getStyleOverrides(), appearance, BASE_APPEARANCE, byId, DEFAULT_PAGE_TYPE, getPaperAppearance(), listeners, MARGIN_TEXT_GAP (+23 more)

### Community 9 - "lang4Phase15.test.js"
Cohesion: 0.14
Nodes (17): boxBlur(), rowSums(), canvas(), compose(), rng(), syntheticPage(), syntheticTextPage(), photo() (+9 more)

### Community 10 - "Synthetic Page Fixtures"
Cohesion: 0.16
Nodes (23): applyHomography(), homographyFrom(), invertHomography(), warpGray(), rectifyPage(), rotateGray(), makeRaster(), cameraCorners() (+15 more)

### Community 11 - "getHandwritingStyle"
Cohesion: 0.18
Nodes (29): renderPage(), builtInHindiGaps(), BuiltInScriptNotice(), styles, PaperCanvas(), getHandwritingStyle(), getStylesVersion(), isPersonalStyleId() (+21 more)

### Community 12 - "EditorToolbar.js"
Cohesion: 0.11
Nodes (34): Adding a handwriting style, Architecture, Fonts, Freehand ink (Phase 6), HandWrite, Handwriting engine (Phase 2), Handwriting styles (Phase 3), Pages and export (Phase 5) (+26 more)

### Community 13 - "Sample Analysis Pipeline"
Cohesion: 0.15
Nodes (27): analyzeSample(), DESKEW_MIN, now(), clearTurn(), detectOrientation(), linkDirections(), ORIENTATION, pieces() (+19 more)

### Community 14 - "react"
Cohesion: 0.10
Nodes (39): App(), displayName, HOME, name, styles, react, react-native, react-native-safe-area-context (+31 more)

### Community 15 - "EditorScreen.js"
Cohesion: 0.08
Nodes (58): Action(), PagesOverview(), PersonalDocumentBanner(), IconButton(), ERASER_SIZES, remapInk(), hasDocumentChanges(), EditorScreen() (+50 more)

### Community 16 - "lang4Model.test.js"
Cohesion: 0.14
Nodes (31): bandOf(), CONFIDENCE_DIMENSIONS, COVERAGE_STATES, DEFAULT_BANDS, summariseCoverage(), unmeasuredConfidence(), validateConfidence(), buildProfileVersion() (+23 more)

### Community 17 - "textLayout.js"
Cohesion: 0.16
Nodes (25): CORRECTION_KINDS, CORRECTION_SETTINGS, isEligible(), misspell(), planCorrection(), SIMILAR, wordCount(), buildUnderline() (+17 more)

### Community 18 - "iOS Native Modules"
Cohesion: 0.08
Nodes (16): HandWriteExport, HandWriteExportPdfJob, -init, -methodQueue, -prepareFile, +requiresMainQueueSetup, -viewForTag, HandWriteSamples (+8 more)

### Community 19 - "Real-Sample Protocol"
Cohesion: 0.09
Nodes (35): ROLE, decodePngGray(), REAL_CONDITIONS, analysisToOriginal(), assertPrivate(), CAPTURE, count(), DANDA (+27 more)

### Community 20 - "referenceHandwriting.test.js"
Cohesion: 0.08
Nodes (36): demoInk(), ellipse(), formattingFor(), LONG_SAMPLE, ROOT, SAMPLE, seg(), SHORT (+28 more)

### Community 21 - "Personal Renderer"
Cohesion: 0.08
Nodes (49): baselineIn(), Ink(), PersonalLines(), PersonalText(), PersonalUnavailable(), styles, usePersonalResolution(), LATIN_ZONES (+41 more)

### Community 22 - "lang4Phase11.test.js"
Cohesion: 0.18
Nodes (9): COUNTER_LETTERS, COUNTER_SPACE, FAINT_LINES, SKELETON, A, nearest(), scored(), segPts() (+1 more)

### Community 23 - "lang4Analysis.test.js"
Cohesion: 0.11
Nodes (26): assessQuality(), dilate(), edgeSharpness(), METHODS, noiseSigma(), orientationIssue(), QUALITY_THRESHOLDS, ramp() (+18 more)

### Community 24 - "Handwriting Components"
Cohesion: 0.06
Nodes (29): PERSONAL_HANDWRITING_ONBOARDING(), VALIDATION_RELEASE(), VALIDATION_TOOLS(), 2. Bugs found and fixes made, 3. Test results and regression matrix, 4. Performance and memory, 5. Feature classification, 6. Release blockers and recommended next phase (+21 more)

### Community 25 - "Page Detection"
Cohesion: 0.15
Nodes (26): boundaryOf(), cross(), detectPage(), extremum(), fillHoles(), fitLine(), fitQuad(), growInto() (+18 more)

### Community 26 - "handwritingEngine.test.js"
Cohesion: 0.12
Nodes (16): VARIATION_LIMITS, byId, DEFAULT_PEN, hexToRgb(), inkColor(), PENS, rgbCache, XH_EM (+8 more)

### Community 27 - "Glyph Stroke Definitions"
Cohesion: 0.07
Nodes (35): bowlUp(), DEFS, FALLBACK, FALLBACK_GLYPH, formsOf(), GLYPH_FORMS, GLYPHS_LANG2, GLYPHS_LANG3 (+27 more)

### Community 28 - "glyphExtraction.js"
Cohesion: 0.16
Nodes (24): cross2(), DETACHABLE, detachableMarks(), DOT_MARK_NAMES, dotMarkNames(), extractGlyphs(), EXTRACTION_STATUS, extractUnit() (+16 more)

### Community 29 - "CreateHandwritingViews.js"
Cohesion: 0.11
Nodes (36): AnalyzingView(), Bar(), BuildDetails(), Button(), Checks(), CoveragePlan(), CreatingView(), DetailsCard() (+28 more)

### Community 30 - "naturalRhythm.test.js"
Cohesion: 0.15
Nodes (25): baselineInRow(), alphaLevels(), f1(), renderLines(), GLYPHS, headingFactor(), layoutHandwriting(), overlaps() (+17 more)

### Community 31 - "Undo/Redo History"
Cohesion: 0.28
Nodes (17): nextToken(), push(), reducer(), useDocumentHistory(), reducer(), useTextHistory(), applyPatch(), COALESCE_WINDOW_MS (+9 more)

### Community 33 - "iOS App Delegate"
Cohesion: 0.12
Nodes (6): AppDelegate, ReactNativeDelegate, React, React_RCTAppDelegate, ReactAppDependencyProvider, UIKit

### Community 34 - "ExportRenderer.js"
Cohesion: 0.14
Nodes (25): record(), delay(), exportBlocker(), ExportRenderer(), exportRenderScale(), nextFrame(), styles, addPdfPage() (+17 more)

### Community 35 - "skeleton.js"
Cohesion: 0.27
Nodes (13): components8(), dotOf(), leaving(), N8, orient(), orientLoop(), pruneSpurs(), pt() (+5 more)

### Community 36 - "selectionFormatting.test.js"
Cohesion: 0.11
Nodes (28): isPageType(), isPen(), createDocument(), DEFAULT_TITLE, DOCUMENT_VERSION, fromPages(), generateId(), normalizeDocument() (+20 more)

### Community 37 - "lang3Fidelity.test.js"
Cohesion: 0.10
Nodes (22): FORM_WIDTH, glyphAdvance(), glyphAdvanceMax(), ATTEMPT_SALT, breakLongWord(), createMaxMeasurer(), createMeasurer(), L1 (+14 more)

### Community 38 - "realSamples.optin.test.js"
Cohesion: 0.18
Nodes (11): analyze(), decodePng(), lum(), measurePage(), measureVariation(), median(), ENTRIES, OUT (+3 more)

### Community 41 - "Extraction Tests"
Cohesion: 0.10
Nodes (17): Confirmed defects, Files, Lang4 Phase 14: real handwriting validation, Limitations, Photo conditions (simulated on the real pages, scored against truth), Profile coverage, Results by visual inspection (not ground truth), Results with ground truth (word boxes) (+9 more)

### Community 42 - "lang4Phase8.test.js"
Cohesion: 0.13
Nodes (38): coverageOf(), loadProfileSummaries(), SCRIPT_NAMES, createProfileVersion(), enqueueWrite(), listProfiles(), listVersions(), purgeOrphanedVersions() (+30 more)

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
Cohesion: 0.14
Nodes (33): CHECKLIST, paginatePersonal(), mapFormatting(), RANGE_KEYS, addPage(), boundariesOf(), countBreaks(), deletePage() (+25 more)

### Community 47 - "Formatting Editor Tests"
Cohesion: 0.50
Nodes (3): `consistency.png` and `synthetic/` — SYNTHETIC (scored against fixture truth), Lang4 Phase 10 — personal handwriting rendering quality, `real/` — REAL glyphs from `reference/handwriting_03.png` (visual only)

### Community 48 - "Document Storage"
Cohesion: 0.50
Nodes (3): Lang4 Phase 11 — glyph quality and extraction reliability, `real/` — `reference/handwriting_03.png` (visual inspection only), `synthetic/` — SYNTHETIC, scored against fixture truth

### Community 49 - "devDependencies"
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

### Community 53 - "preBuildAudit.test.js"
Cohesion: 0.24
Nodes (7): safeGenerate(), ALL_DEFAULT, line(), PARAMS, SOURCES, syntheticProfile(), syntheticUnits()

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
Cohesion: 0.15
Nodes (26): around(), blob(), centreLine(), closedSpline(), MARKER_TEXT, mul(), nearest(), pushNums() (+18 more)

### Community 66 - "Metro Config"
Cohesion: 0.40
Nodes (3): config, @react-native/metro-config@0.87.1, @react-native/metro-config

### Community 67 - "AsyncStorage Mock"
Cohesion: 0.50
Nodes (3): createAsyncStorage(), createMemoryStorage(), databases

### Community 69 - "lang4Extraction.test.js"
Cohesion: 0.21
Nodes (11): analysisToFrame(), EXTRACTION, againstTruth(), blank(), cache, clipX(), extracted(), nearest() (+3 more)

### Community 70 - "HomeScreen.js"
Cohesion: 0.27
Nodes (10): getPenColor(), DocumentCard(), EmptyState(), HomeScreen(), MiniPage(), styles, tidyProfiles(), formatDay() (+2 more)

### Community 71 - "notebookLayout.test.js"
Cohesion: 0.09
Nodes (21): PAGE, buildExportPlan(), EXPORT_FORMATS, exportFileName(), JPEG_QUALITY, PDF_PAGE, RASTER_WIDTH, sanitizeTitle() (+13 more)

### Community 72 - "alignSample.js"
Cohesion: 0.12
Nodes (33): ALIGNMENT_THRESHOLDS, BLUR, blurReach(), blurredGap(), DEGRADING, edgeConfidence(), hairlineGap(), MIN_GAP_PX (+25 more)

### Community 73 - "lang2.test.js"
Cohesion: 0.24
Nodes (10): HANDWRITING_PROFILES, LANG2_PROFILE, LANG2_PROFILE_ID, LANG3_PROFILE, REFERENCE_PROFILE, bottom(), L1, L2 (+2 more)

### Community 74 - "lang4Phase12.test.js"
Cohesion: 0.31
Nodes (10): DOT_MARKS, expectedDots(), formPointsInAnalysis(), cluster(), HINDI, hindiProfile(), line(), nearest() (+2 more)

### Community 86 - "contracts.js"
Cohesion: 0.20
Nodes (20): validateScore(), ALIGNMENT_LEVELS, ALIGNMENT_STATES, FORBIDDEN_SAMPLE_FIELDS, isBox(), isObj(), METRIC_NAMES, QUALITY_ISSUES (+12 more)

### Community 87 - "textUnits.js"
Cohesion: 0.15
Nodes (19): keysOf(), codePoints(), devanagariClass(), drawingOrder(), isAsciiPunct(), isGeneralPunct(), isLatinLetter(), isLatinMark() (+11 more)

### Community 88 - "devanagariAlignment.js"
Cohesion: 0.16
Nodes (20): blobs(), detachedBelowMarks(), headlineBand(), marksOf(), notSliver(), segmentDevanagariWord(), stemAttributionCost(), STRUCTURE_COST (+12 more)

### Community 89 - "HandwritingStyleSelector.js"
Cohesion: 0.38
Nodes (9): Card(), cardTestId(), HandwritingStyleSelector(), PersonalCard(), personalPreviewText(), PinnedCard(), styles, getHandwritingStyles() (+1 more)

### Community 90 - "lang4Integration.test.js"
Cohesion: 0.06
Nodes (73): @react-native-async-storage/async-storage, PERSONAL_HANDWRITING_ONBOARDING, VALIDATION_RELEASE, VALIDATION_TOOLS, setImageInput(), clearPersonalCache(), DEVANAGARI_ALPHABET, HINDI_SUGGESTED (+65 more)

### Community 91 - "deviceRendering.test.js"
Cohesion: 0.12
Nodes (22): MAX_SVG_PIXELS, centringInset(), clampZoom(), MAX_ZOOM, middle(), MIN_ZOOM, scrollAfterZoom(), spread() (+14 more)

### Community 92 - "harm.js"
Cohesion: 0.12
Nodes (9): csvRows(), MANIFEST, META, PAGES, raster(), run(), wordsText(), MANIFEST (+1 more)

### Community 93 - "wordAlignment.js"
Cohesion: 0.24
Nodes (12): BAND_SLACK, cannotHoldLetters(), expectedShape(), FLAT_REGION, isFlatRegion(), isOffBand(), needsHeight(), PUNCTUATION_ONLY (+4 more)

### Community 94 - "Phase 25 — Offline handwriting OCR proof of concept (12 Nov 2026)"
Cohesion: 0.10
Nodes (18): aligned(), pageFor(), Proposed path (unchanged from the investigation report), Text recognition (OCR) — status and blocker, Why it is a blocker, not a gap, 1. Setup, 2. Results — English (real handwriting), 2a. Full page, detector + recogniser (the realistic path) (+10 more)

### Community 96 - "strokeFit.js"
Cohesion: 0.38
Nodes (9): catmullRom(), dist(), FIT, fitError(), fitStroke(), segDist(), simplify(), smoothPath() (+1 more)

### Community 97 - "corrections.test.js"
Cohesion: 0.27
Nodes (7): DARK, draw(), layout(), style(), TEXT, WORDS, renderedHandwriting()

### Community 98 - "HandwritingText.js"
Cohesion: 0.16
Nodes (20): inkSvg(), BuiltinHandwritingLines, Guides(), HandwritingLines, HandwritingText(), HandwritingTextSwitch(), styles, useStylesVersion() (+12 more)

### Community 99 - "expectedText.js"
Cohesion: 0.39
Nodes (8): DEEP, NARROW, prepareExpectedText(), PUNCT_SMALL, TALL, unitPriors(), WIDE, POSITION

### Community 100 - "lang4PersonalRender.test.js"
Cohesion: 0.13
Nodes (27): GLYPH_SETS, DRAWABLE_STATES, MARKER_WIDTH, cache, failure(), getPersonalResolution(), inflight, listeners (+19 more)

### Community 101 - "strokeModel.test.js"
Cohesion: 0.36
Nodes (7): SAMPLE_STEP, ctx(), lag1(), mean(), POEM, profile(), sd()

### Community 104 - "segmentation.js"
Cohesion: 0.42
Nodes (8): median(), bandsOf(), clamp01(), classifyComponents(), round1(), segment(), smooth(), wordGapThreshold()

### Community 105 - "glyphToSource"
Cohesion: 0.33
Nodes (6): analysisToPhoto(), analysisToSource(), frameToAnalysis(), glyphToAnalysis(), glyphToFrame(), glyphToSource()

### Community 106 - "Real handwriting validation protocol (Lang4 Phase 14)"
Cohesion: 0.33
Nodes (6): grid(), 1. Collect five photos, 2. Describe them: `real-samples/manifest.json`, 3. Run, 5. Reading the results honestly, Real handwriting validation protocol (Lang4 Phase 14)

### Community 108 - "6. Proposed Lang4 architecture"
Cohesion: 0.40
Nodes (5): 6.2 JS learning pipeline: `src/handwriting/learn/` (pure functions, Jest-testable), 6.3 Profile schema (sketch), 6.5 Shared-code changes needed (all additive, all gated), 6.6 Test strategy without private handwriting, 6. Proposed Lang4 architecture

### Community 109 - "Final pre-build audit (Lang4 and the app)"
Cohesion: 0.40
Nodes (4): Final pre-build audit (Lang4 and the app), Fixes, Remaining risks (unverified), Reviewed, no change needed

## Knowledge Gaps
- **11 isolated node(s):** `UIKit`, `React`, `React_RCTAppDelegate`, `ReactAppDependencyProvider`, `+requiresMainQueueSetup` (+6 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 548 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **29 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `6. Proposed Lang4 architecture` connect `6. Proposed Lang4 architecture` to `Android Samples Methods`, `lang3Fidelity.test.js`?**
  _High betweenness centrality (0.124) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `CreateHandwritingScreen()` (e.g. with `isImageInputAvailable()` and `createSampleSet()`) actually correct?**
  _`CreateHandwritingScreen()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `UIKit`, `React`, `React_RCTAppDelegate` to the rest of the system?**
  _11 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `CreateHandwritingScreen.js` be split into smaller, more focused modules?**
  _Cohesion score 0.08490945674044266 - nodes in this community are weakly interconnected._
- **Why does `react` connect `react` to `CreateHandwritingScreen.js`, `ink.test.js`, `lang4Phase24.test.js`, `lang4Phase22.test.js`, `Handwriting Tuner`, `getHandwritingStyle`, `EditorToolbar.js`, `EditorScreen.js`, `referenceHandwriting.test.js`, `Personal Renderer`, `lang4Analysis.test.js`, `handwritingEngine.test.js`, `Glyph Stroke Definitions`, `CreateHandwritingViews.js`, `naturalRhythm.test.js`, `Undo/Redo History`, `ExportRenderer.js`, `selectionFormatting.test.js`, `lang3Fidelity.test.js`, `lang4Phase8.test.js`, `SelectionFormatBar.js`, `multipage.test.js`, `ESLint Config Deps`, `preBuildAudit.test.js`, `Runtime Dependencies`, `HomeScreen.js`, `notebookLayout.test.js`, `lang2.test.js`, `devanagariAlignment.js`, `HandwritingStyleSelector.js`, `lang4Integration.test.js`, `deviceRendering.test.js`, `corrections.test.js`, `HandwritingText.js`, `lang4PersonalRender.test.js`?**
  _High betweenness centrality (0.091) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `getHandwritingStyle()` (e.g. with `1. Relevant files and what they do` and `3. Renderer integration points`) actually correct?**
  _`getHandwritingStyle()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `ink.test.js` be split into smaller, more focused modules?**
  _Cohesion score 0.11416490486257928 - nodes in this community are weakly interconnected._