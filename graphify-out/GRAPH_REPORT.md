# Graph Report - AssignmentMaker  (2026-11-13)

## Corpus Check
- 279 files · ~330,699 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 34 file(s) not represented in the graph (top: (none) 9, .xml 8, .properties 2)

## Summary
- 2237 nodes · 7518 edges · 113 communities (83 shown, 30 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 143 edges (avg confidence: 0.92)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Phase 26 — From recognised text to handwritten glyphs: where the gap really is (12 Nov 2026)
- CreateHandwritingScreen.js
- ink.test.js
- lang4Phase24.test.js
- ppocr.py
- profileGeneration.js
- CreateHandwritingScreen.js
- lang4Phase22.test.js
- handwritingStyles.js
- syntheticTextPage
- run_engine.js
- getHandwritingStyle
- EditorToolbar.js
- Sample Analysis Pipeline
- react-native
- EditorScreen.js
- lang4Model.test.js
- corrections.test.js
- iOS Native Modules
- Real-Sample Protocol
- visual-preview.js
- Personal Renderer
- lang4Phase11.test.js
- lang4Analysis.test.js
- Handwriting Components
- Page Detection
- pens.js
- lang3Reference1.test.js
- glyphExtraction.js
- CreateHandwritingViews.js
- referenceHandwriting.test.js
- Undo/Redo History
- Android Samples Methods
- iOS App Delegate
- ExportRenderer.js
- skeleton.js
- documentStorage.js
- Lang4 — Phase 0 baseline and architecture assessment
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
- textLayout.js
- Metro Config
- AsyncStorage Mock
- lang4Extraction.test.js
- react
- EditorScreen.js
- alignSample.js
- lang4Phase21.test.js
- lang4Alignment.test.js
- contracts.js
- s
- devanagariAlignment.js
- HandwritingStyleSelector.js
- lang4Integration.test.js
- deviceRendering.test.js
- harm.js
- wordAlignment.js
- Phase 25 — Offline handwriting OCR proof of concept (12 Nov 2026)
- Stroke
- strokeFit.js
- validationDocs.js
- ZoomablePage.js
- expectedText.js
- lang4PersonalRender.test.js
- Architecture
- reviewSummary.js
- @react-native-community/cli-platform-android@20.2.0
- HandwritingTunerScreen.js
- Text recognition (OCR) — status and blocker
- @babel/preset-env@^7.25.3
- poc/README.md
- jest@^29.6.3
- prettier@2.8.8
- eslint@^8.19.0
- @react-native/eslint-config@0.87.1
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
- `4. What the report contains (and what it does not)` --references--> `assertPrivate()`  [INFERRED]
  visual-reports/lang4/phase14/PROTOCOL.md → __tests__/helpers/realProtocol.js
- `Privacy of real samples (verified in code)` --references--> `assertPrivate()`  [INFERRED]
  visual-reports/lang4/phase18/README.md → __tests__/helpers/realProtocol.js
- `Freehand ink (Phase 6)` --references--> `screenToPage()`  [INFERRED]
  README.md → src/ink/strokes.js
- `6.4 Text units for Devanagari` --references--> `breakLongWord()`  [INFERRED]
  visual-reports/lang4/phase0-baseline.md → src/utils/textLayout.js
- `4. Baseline tests and regression locks (recorded 2026-10-18, before any change)` --references--> `hashString()`  [INFERRED]
  visual-reports/lang4/phase0-baseline.md → src/utils/variation.js

## Import Cycles
- None detected.

## Communities (113 total, 30 thin omitted)

### Community 0 - "Phase 26 — From recognised text to handwritten glyphs: where the gap really is (12 Nov 2026)"
Cohesion: 0.15
Nodes (12): stateFor(), 1. The photographs, 2. Root cause: why print gives 136 glyphs and cursive gives 0, 3. Can OCR coordinates improve glyph association? No., 4. Actual glyph extraction accuracy (print page, typed or OCR text), 5. Proposed solution — keeps every glyph's real geometry, fabricates nothing, 6. What reliable Hindi needs, 7. Is native OCR integration ready? Not yet. (+4 more)

### Community 1 - "CreateHandwritingScreen.js"
Cohesion: 0.13
Nodes (33): handwritingType(), analysisInputs(), DEFAULT_TYPE, discardAll(), dropSample(), FILE_LIMITS, heldUris(), knownTextOf() (+25 more)

### Community 2 - "ink.test.js"
Cohesion: 0.13
Nodes (30): angleAt(), centerlinePath(), clamp(), cleanStroke(), DEFAULT_TOOLS, densify(), eraseStrokes(), fmt() (+22 more)

### Community 3 - "lang4Phase24.test.js"
Cohesion: 0.12
Nodes (26): setImageInput(), recognizeText(), setTextRecognizer(), textRecognitionEngine(), press(), queryByTestId(), chooseType(), renderWizard() (+18 more)

### Community 4 - "ppocr.py"
Cohesion: 0.05
Nodes (36): main(), bag_recall(), main(), norm(), tokens(), letters_only(), levenshtein(), main() (+28 more)

### Community 5 - "profileGeneration.js"
Cohesion: 0.12
Nodes (30): PIPELINE_STAGES, ENGINE_DEFAULT_PARAMS, generatePersonalProfile(), headlineAnchors(), languageSupport(), MATHS_CORE_TEXT, MATHS_EXTRA_TEXT, mean() (+22 more)

### Community 6 - "CreateHandwritingScreen.js"
Cohesion: 0.13
Nodes (31): CoveragePlan(), Guidelines(), NoRecognitionNote(), clearTemporaryImages(), decodeSampleImage(), ERROR_MESSAGES, errorFor(), getImageInput() (+23 more)

### Community 7 - "lang4Phase22.test.js"
Cohesion: 0.12
Nodes (20): PERSONAL_HANDWRITING_ONBOARDING, VALIDATION_RELEASE, VALIDATION_TOOLS, ENGLISH_EVERYDAY, ENGLISH_WORDS, EXTRA_SLOT, HINDI_NUMBERS, HINDI_WORDS (+12 more)

### Community 8 - "handwritingStyles.js"
Cohesion: 0.05
Nodes (64): withOverrides(), baseProfiles, clampVariation(), getStyleOverrides(), handwritingStyles, isHandwritingStyle(), LEGACY, LEGACY_STYLE_IDS (+56 more)

### Community 9 - "syntheticTextPage"
Cohesion: 0.09
Nodes (34): rotateGray(), boxBlur(), makeRaster(), rowSums(), cameraCorners(), downscale(), keystone(), onDesk() (+26 more)

### Community 10 - "run_engine.js"
Cohesion: 0.08
Nodes (12): CATEGORIES, datasetProblems(), loadManifest(), args, box(), hist(), imagesDir, manifestFile (+4 more)

### Community 11 - "getHandwritingStyle"
Cohesion: 0.10
Nodes (52): renderPage(), builtInHindiGaps(), BuiltInScriptNotice(), styles, BuiltinHandwritingLines, Guides(), HandwritingLines, HandwritingText() (+44 more)

### Community 12 - "EditorToolbar.js"
Cohesion: 0.17
Nodes (25): Divider(), EditorToolbar(), Option(), styles, Swatch(), ToolButton(), ToolOptions(), Box() (+17 more)

### Community 13 - "Sample Analysis Pipeline"
Cohesion: 0.13
Nodes (33): analyzeSample(), DESKEW_MIN, now(), invertHomography(), clearTurn(), detectOrientation(), linkDirections(), ORIENTATION (+25 more)

### Community 14 - "react-native"
Cohesion: 0.15
Nodes (22): react-native, react-native-safe-area-context, styles, styles, PenSelector(), styles, SelectableCard(), styles (+14 more)

### Community 15 - "EditorScreen.js"
Cohesion: 0.07
Nodes (52): MARKER_TEXT, EditorScreen(), FormatButton(), tidyProfiles(), applySpanFormat(), boundariesIn(), cleanGaps(), cleanRanges() (+44 more)

### Community 16 - "lang4Model.test.js"
Cohesion: 0.09
Nodes (52): bandOf(), CONFIDENCE_DIMENSIONS, COVERAGE_STATES, DEFAULT_BANDS, DRAWABLE_STATES, summariseCoverage(), unmeasuredConfidence(), validateConfidence() (+44 more)

### Community 17 - "corrections.test.js"
Cohesion: 0.10
Nodes (33): CORRECTION_KINDS, CORRECTION_SETTINGS, isEligible(), misspell(), planCorrection(), SIMILAR, wordCount(), createDocument() (+25 more)

### Community 18 - "iOS Native Modules"
Cohesion: 0.08
Nodes (16): HandWriteExport, HandWriteExportPdfJob, -init, -methodQueue, -prepareFile, +requiresMainQueueSetup, -viewForTag, HandWriteSamples (+8 more)

### Community 19 - "Real-Sample Protocol"
Cohesion: 0.07
Nodes (40): analysisToOriginal(), assertPrivate(), CAPTURE, count(), DANDA, isRelative(), isVowelLetter(), MANIFEST_VERSION (+32 more)

### Community 20 - "visual-preview.js"
Cohesion: 0.21
Nodes (10): demoInk(), ellipse(), formattingFor(), inkSvg(), LONG_SAMPLE, ROOT, SAMPLE, seg() (+2 more)

### Community 21 - "Personal Renderer"
Cohesion: 0.08
Nodes (53): baselineIn(), Ink(), PersonalDocumentBanner(), PersonalLines(), PersonalText(), PersonalUnavailable(), styles, usePersonalResolution() (+45 more)

### Community 22 - "lang4Phase11.test.js"
Cohesion: 0.12
Nodes (15): COUNTER_SPACE, expectedDots(), formPointsInAnalysis(), FAINT_LINES, SKELETON, normalised(), similarityResidual(), A (+7 more)

### Community 23 - "lang4Analysis.test.js"
Cohesion: 0.08
Nodes (37): assessQuality(), dilate(), edgeSharpness(), METHODS, noiseSigma(), orientationIssue(), QUALITY_THRESHOLDS, ramp() (+29 more)

### Community 24 - "Handwriting Components"
Cohesion: 0.06
Nodes (30): PERSONAL_HANDWRITING_ONBOARDING(), VALIDATION_RELEASE(), VALIDATION_TOOLS(), 2. Bugs found and fixes made, 3. Test results and regression matrix, 4. Performance and memory, 5. Feature classification, 6. Release blockers and recommended next phase (+22 more)

### Community 25 - "Page Detection"
Cohesion: 0.13
Nodes (30): applyHomography(), homographyFrom(), warpGray(), boundaryOf(), cross(), detectPage(), extremum(), fillHoles() (+22 more)

### Community 26 - "pens.js"
Cohesion: 0.40
Nodes (5): byId, DEFAULT_PEN, hexToRgb(), inkColor(), rgbCache

### Community 27 - "lang3Reference1.test.js"
Cohesion: 0.06
Nodes (47): DEFS, FALLBACK, FALLBACK_GLYPH, FORM_WIDTH, formsOf(), GLYPH_FORMS, glyphAdvance(), glyphAdvanceMax() (+39 more)

### Community 28 - "glyphExtraction.js"
Cohesion: 0.13
Nodes (27): analysisToPhoto(), analysisToSource(), COUNTER_LETTERS, cross2(), DETACHABLE, detachableMarks(), DOT_MARK_NAMES, DOT_MARKS (+19 more)

### Community 29 - "CreateHandwritingViews.js"
Cohesion: 0.11
Nodes (35): AnalyzingView(), Bar(), BuildDetails(), Button(), Checks(), CreatingView(), DetailsCard(), DoneView() (+27 more)

### Community 30 - "referenceHandwriting.test.js"
Cohesion: 0.08
Nodes (43): baselineInRow(), pathPoints(), renderLines(), GLYPHS, LANG2_PROFILE, LANG2_PROFILE_ID, LANG3_PROFILE, REFERENCE_PROFILE (+35 more)

### Community 31 - "Undo/Redo History"
Cohesion: 0.28
Nodes (17): nextToken(), push(), reducer(), useDocumentHistory(), reducer(), useTextHistory(), applyPatch(), COALESCE_WINDOW_MS (+9 more)

### Community 33 - "iOS App Delegate"
Cohesion: 0.12
Nodes (6): AppDelegate, ReactNativeDelegate, React, React_RCTAppDelegate, ReactAppDependencyProvider, UIKit

### Community 34 - "ExportRenderer.js"
Cohesion: 0.29
Nodes (15): delay(), exportBlocker(), ExportRenderer(), nextFrame(), styles, addPdfPage(), beginPdf(), cancelPdf() (+7 more)

### Community 35 - "skeleton.js"
Cohesion: 0.29
Nodes (12): components8(), dotOf(), leaving(), N8, orient(), orientLoop(), pruneSpurs(), pt() (+4 more)

### Community 36 - "documentStorage.js"
Cohesion: 0.45
Nodes (10): deleteDocument(), docKey(), enqueueWrite(), getBackend(), getDocument(), listDocuments(), parse(), readIndex() (+2 more)

### Community 37 - "Lang4 — Phase 0 baseline and architecture assessment"
Cohesion: 0.15
Nodes (12): 2. Data structures a Lang4 profile must plug into, 4. Baseline tests and regression locks (recorded 2026-10-18, before any change), 5. Native capabilities and gaps, 6.2 JS learning pipeline: `src/handwriting/learn/` (pure functions, Jest-testable), 6.3 Profile schema (sketch), 6.4 Text units for Devanagari, 6.5 Shared-code changes needed (all additive, all gated), 6.6 Test strategy without private handwriting (+4 more)

### Community 38 - "realSamples.optin.test.js"
Cohesion: 0.13
Nodes (17): analyze(), decodePng(), lum(), measurePage(), measureVariation(), median(), ENTRIES, OUT (+9 more)

### Community 41 - "Extraction Tests"
Cohesion: 0.07
Nodes (24): grid(), 1. Collect five photos, 2. Describe them: `real-samples/manifest.json`, 3. Run, 4. What the report contains (and what it does not), 5. Reading the results honestly, Real handwriting validation protocol (Lang4 Phase 14), Confirmed defects (+16 more)

### Community 42 - "lang4Phase8.test.js"
Cohesion: 0.17
Nodes (28): createProfileVersion(), enqueueWrite(), listProfiles(), listVersions(), purgeOrphanedVersions(), readIndex(), readIndexStrict(), readProfileVersion() (+20 more)

### Community 43 - "SelectionFormatBar.js"
Cohesion: 0.53
Nodes (5): Chip(), SelectionFormatBar(), step(), styles, Swatch()

### Community 44 - "Personal Metrics"
Cohesion: 0.29
Nodes (6): Characters the sheet does not show, Fidelity refinement (follow-up phase), Known approximations, Per-letter findings, reference1.png — Lang3 alphabet sheet analysis (development only), What can and cannot be measured

### Community 45 - "Reference Handwriting Tests"
Cohesion: 0.29
Nodes (6): Lang4 Phase 13: handwriting coverage and profile readiness, Mark boundaries, Prompt changes, `synthetic/document-coverage.json`, `synthetic/prompt-audit-and-support.json`, What a profile claims

### Community 46 - "multipage.test.js"
Cohesion: 0.10
Nodes (39): buildExportPlan(), exportFileName(), JPEG_QUALITY, PDF_PAGE, sanitizeTitle(), setNativeExporter(), mapFormatting(), RANGE_KEYS (+31 more)

### Community 47 - "Formatting Editor Tests"
Cohesion: 0.50
Nodes (3): `consistency.png` and `synthetic/` — SYNTHETIC (scored against fixture truth), Lang4 Phase 10 — personal handwriting rendering quality, `real/` — REAL glyphs from `reference/handwriting_03.png` (visual only)

### Community 48 - "Document Storage"
Cohesion: 0.50
Nodes (3): Lang4 Phase 11 — glyph quality and extraction reliability, `real/` — `reference/handwriting_03.png` (visual inspection only), `synthetic/` — SYNTHETIC, scored against fixture truth

### Community 49 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, @babel/core@^7.25.2, @babel/runtime@^7.25.0, @react-native/babel-preset@0.87.1, @react-native-community/cli@20.2.0, @react-native/jest-preset@0.87.1, @babel/core, @babel/runtime (+3 more)

### Community 50 - "Word Gap Tests"
Cohesion: 0.50
Nodes (3): Images, Lang4 Phase 12 — Devanagari and multilingual reliability, `synthetic/devanagari-extraction.json`

### Community 51 - "Natural Rhythm Lock"
Cohesion: 0.50
Nodes (3): Lang4 Phase 8 — validation reports, `real/` — real handwriting images (Latin only), `synthetic/` — modelled photo conditions

### Community 52 - "ESLint Config Deps"
Cohesion: 0.20
Nodes (9): @react-native-community/cli-platform-ios@20.2.0, react-test-renderer@19.2.3, engines, node, name, private, version, @react-native-community/cli-platform-ios (+1 more)

### Community 53 - "preBuildAudit.test.js"
Cohesion: 0.20
Nodes (11): PARAM_BOUNDS, line(), syntheticForm(), syntheticProfile(), syntheticUnits(), cluster(), HINDI, hindiProfile() (+3 more)

### Community 54 - "Stroke Fitting"
Cohesion: 0.50
Nodes (3): Lang4 Phase 9 — page detection and image reliability, `real/` — the reference pages (Latin only, no ground truth), `synthetic/` — modelled conditions, scored against fixture truth

### Community 57 - "Runtime Dependencies"
Cohesion: 0.22
Nodes (9): dependencies, handwrite-export@file:modules/handwrite-export, handwrite-samples@file:modules/handwrite-samples, react@19.2.3, react-native@0.87.1, @react-native-async-storage/async-storage@^3.1.1, react-native-safe-area-context@^5.5.2, handwrite-export (+1 more)

### Community 61 - "Export Module Manifest"
Cohesion: 0.25
Nodes (7): description, files, license, main, name, private, version

### Community 62 - "Samples Module Manifest"
Cohesion: 0.25
Nodes (7): description, files, license, main, name, private, version

### Community 64 - "npm Scripts"
Cohesion: 0.33
Nodes (6): scripts, android, ios, lint, start, test

### Community 65 - "textLayout.js"
Cohesion: 0.07
Nodes (73): alphaLevels(), around(), blob(), centreLine(), closedSpline(), f1(), mul(), nearest() (+65 more)

### Community 66 - "Metro Config"
Cohesion: 0.40
Nodes (3): config, @react-native/metro-config@0.87.1, @react-native/metro-config

### Community 67 - "AsyncStorage Mock"
Cohesion: 0.50
Nodes (3): createAsyncStorage(), createMemoryStorage(), databases

### Community 69 - "lang4Extraction.test.js"
Cohesion: 0.18
Nodes (14): analysisToFrame(), isObj(), REJECTION_CODES, validateExtraction(), validateGlyphForm(), againstTruth(), blank(), cache (+6 more)

### Community 70 - "react"
Cohesion: 0.13
Nodes (18): App(), displayName, HOME, name, styles, react, PlusIcon(), Action() (+10 more)

### Community 71 - "EditorScreen.js"
Cohesion: 0.18
Nodes (14): BackIcon(), PageTypeSelector(), PaperThumb(), IconButton(), ScreenHeader(), styles, Button(), short() (+6 more)

### Community 72 - "alignSample.js"
Cohesion: 0.15
Nodes (21): alignTranscription(), finish(), LOST_WORD_MARGIN, LOW_MARK_TOP, LOW_MARKS, measureShape(), MIN_INK_HEIGHT, MIN_SCALE_WORDS (+13 more)

### Community 73 - "lang4Phase21.test.js"
Cohesion: 0.14
Nodes (21): knownTextFor(), SAMPLE_SLOTS, createSampleSet(), toBase64(), nativeDouble(), fakeNativeInput(), fakeNativeInput(), checked() (+13 more)

### Community 74 - "lang4Alignment.test.js"
Cohesion: 0.18
Nodes (17): ALIGNMENT_THRESHOLDS, BLUR, blurReach(), blurredGap(), DEGRADING, edgeConfidence(), hairlineGap(), MIN_GAP_PX (+9 more)

### Community 86 - "contracts.js"
Cohesion: 0.20
Nodes (20): validateScore(), ALIGNMENT_LEVELS, ALIGNMENT_STATES, FORBIDDEN_SAMPLE_FIELDS, isBox(), isObj(), METRIC_NAMES, QUALITY_ISSUES (+12 more)

### Community 87 - "s"
Cohesion: 0.19
Nodes (10): bowlUp(), DEFS_LANG2, entry(), loopUp(), bowlUp(), DEFS_LANG3, hookIn(), loopUp() (+2 more)

### Community 88 - "devanagariAlignment.js"
Cohesion: 0.20
Nodes (15): blobs(), detachedBelowMarks(), headlineBand(), marksOf(), notSliver(), segmentDevanagariWord(), stemAttributionCost(), BOUNDARY_COSTS (+7 more)

### Community 89 - "HandwritingStyleSelector.js"
Cohesion: 0.24
Nodes (16): Card(), cardTestId(), HandwritingStyleSelector(), PersonalCard(), personalPreviewText(), PinnedCard(), styles, coverageOf() (+8 more)

### Community 90 - "lang4Integration.test.js"
Cohesion: 0.09
Nodes (37): @react-native-async-storage/async-storage, clearPersonalCache(), DEVANAGARI_ALPHABET, HINDI_SUGGESTED, LATIN_ALPHABET, LATIN_DIGITS_TEXT, MIXED_SUGGESTED, setStorageBackend() (+29 more)

### Community 91 - "deviceRendering.test.js"
Cohesion: 0.12
Nodes (23): react-native-svg@15.15.5, react-native-svg, MAX_SVG_PIXELS, renderScaleFor(), shrinkStyle(), measure(), now(), perfSummary() (+15 more)

### Community 92 - "harm.js"
Cohesion: 0.12
Nodes (9): csvRows(), MANIFEST, META, PAGES, raster(), run(), wordsText(), MANIFEST (+1 more)

### Community 93 - "wordAlignment.js"
Cohesion: 0.23
Nodes (13): alignWords(), BAND_SLACK, cannotHoldLetters(), expectedShape(), FLAT_REGION, isFlatRegion(), isOffBand(), needsHeight() (+5 more)

### Community 94 - "Phase 25 — Offline handwriting OCR proof of concept (12 Nov 2026)"
Cohesion: 0.15
Nodes (12): 1. Setup, 2. Results — English (real handwriting), 2a. Full page, detector + recogniser (the realistic path), 2b. Word crops from the truth boxes (recognition alone, 245 words), 2c. Confidence as a filter (tight crops), 2d. Can the recogniser place characters on the ink?, 2e. The question that matters: glyphs extracted from OCR text alone, 3. Hindi (+4 more)

### Community 96 - "strokeFit.js"
Cohesion: 0.29
Nodes (12): catmullRom(), dist(), distanceTo(), FIT, fitError(), fitStroke(), sampleChain(), segDist() (+4 more)

### Community 97 - "validationDocs.js"
Cohesion: 0.26
Nodes (11): demoStroke(), CHECKLIST, strokesFor(), DrawingSurface(), styles, addPoint(), finishStroke(), screenToPage() (+3 more)

### Community 98 - "ZoomablePage.js"
Cohesion: 0.24
Nodes (12): centringInset(), clampZoom(), MAX_ZOOM, middle(), MIN_ZOOM, scrollAfterZoom(), spread(), stepZoom() (+4 more)

### Community 99 - "expectedText.js"
Cohesion: 0.29
Nodes (10): DEEP, NARROW, prepareExpectedText(), PUNCT_SMALL, TALL, unitPriors(), WIDE, WIDTH_PRIORS (+2 more)

### Community 100 - "lang4PersonalRender.test.js"
Cohesion: 0.16
Nodes (21): getHandwritingStyles(), GLYPH_SETS, cache, failure(), getPersonalResolution(), inflight, listeners, loadPersonal() (+13 more)

### Community 101 - "Architecture"
Cohesion: 0.18
Nodes (10): Adding a handwriting style, Architecture, Fonts, Freehand ink (Phase 6), HandWrite, Handwriting engine (Phase 2), Handwriting styles (Phase 3), Pages and export (Phase 5) (+2 more)

### Community 102 - "reviewSummary.js"
Cohesion: 0.27
Nodes (10): checkedScripts(), REQUIRED_SETS, SET_INFO, setsFor(), isDigit(), ROW_LABELS, rowsOf(), SCRIPT_LABELS (+2 more)

### Community 104 - "HandwritingTunerScreen.js"
Cohesion: 0.29
Nodes (9): DEFAULT_HANDWRITING_STYLE, PAPER_TEMPLATES, REFERENCE_PROFILE_ID, Chip(), ComparePanel(), devServerOrigin(), REFERENCES, referenceUrl() (+1 more)

### Community 105 - "Text recognition (OCR) — status and blocker"
Cohesion: 0.50
Nodes (3): Proposed path (unchanged from the investigation report), Text recognition (OCR) — status and blocker, Why it is a blocker, not a gap

## Knowledge Gaps
- **11 isolated node(s):** `UIKit`, `React`, `React_RCTAppDelegate`, `ReactAppDependencyProvider`, `+requiresMainQueueSetup` (+6 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 585 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **30 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `6. Proposed Lang4 architecture` connect `Lang4 — Phase 0 baseline and architecture assessment` to `Android Samples Methods`?**
  _High betweenness centrality (0.154) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `CreateHandwritingScreen()` (e.g. with `isImageInputAvailable()` and `createSampleSet()`) actually correct?**
  _`CreateHandwritingScreen()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `UIKit`, `React`, `React_RCTAppDelegate` to the rest of the system?**
  _11 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `CreateHandwritingScreen.js` be split into smaller, more focused modules?**
  _Cohesion score 0.12612612612612611 - nodes in this community are weakly interconnected._
- **Why does `Lang4 — Phase 0 baseline and architecture assessment` connect `Lang4 — Phase 0 baseline and architecture assessment` to `textLayout.js`, `lang3Reference1.test.js`?**
  _High betweenness centrality (0.118) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `getHandwritingStyle()` (e.g. with `1. Relevant files and what they do` and `3. Renderer integration points`) actually correct?**
  _`getHandwritingStyle()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `ink.test.js` be split into smaller, more focused modules?**
  _Cohesion score 0.1268939393939394 - nodes in this community are weakly interconnected._