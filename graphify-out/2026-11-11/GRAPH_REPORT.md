# Graph Report - AssignmentMaker  (2026-10-28)

## Corpus Check
- 241 files · ~293,231 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 31 file(s) not represented in the graph (top: (none) 8, .xml 8, .properties 2)

## Summary
- 1968 nodes · 6858 edges · 109 communities (82 shown, 27 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 99 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- alignSample.js
- CreateHandwritingScreen.js
- ink.test.js
- realism.test.js
- profileSchema.js
- profileGeneration.js
- lang3Reference1.test.js
- personalStore.js
- Handwriting Tuner
- lang4Phase22.test.js
- Synthetic Page Fixtures
- referenceHandwriting.test.js
- EditorToolbar.js
- Sample Analysis Pipeline
- RN Imports & Screens
- EditorScreen.js
- lang4Phase8.test.js
- textLayout.js
- iOS Native Modules
- Real-Sample Protocol
- handwritingStyles.js
- Personal Renderer
- lang3Fidelity.test.js
- lang4Analysis.test.js
- Handwriting Components
- Page Detection
- document.js
- Glyph Stroke Definitions
- glyphExtraction.js
- lang4Alignment.test.js
- lang3.test.js
- Undo/Redo History
- Android Samples Methods
- iOS App Delegate
- deviceRendering.test.js
- index.js
- documentStorage.js
- Lang4 — Phase 0 baseline and architecture assessment
- analyze-reference.js
- Android Export Methods
- Extraction Tests
- lang4Extraction.test.js
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
- lang4Phase13.test.js
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
- profileBuilder.js
- EditorScreen.js
- notebookLayout.test.js
- RN CLI
- lang4Model.test.js
- Jest Preset
- contracts.js
- textUnits.js
- devanagariAlignment.js
- lang4Profile.test.js
- lang4Integration.test.js
- ZoomablePage.js
- lang4Phase11.test.js
- segmentation.js
- skeleton.js
- lang4ProfileUI.test.js
- syntheticTextPage
- wordAlignment.js
- ValidationScreen.js
- Architecture
- paper.js
- expectedText.js
- strokeFit.js
- lang4Phase12.test.js
- compose
- realSamples.optin.test.js
- @babel/preset-env@^7.25.3
- prettier@2.8.8
- @react-native-community/cli-platform-ios@20.2.0

## God Nodes (most connected - your core abstractions)
1. `EditorScreen()` - 72 edges
2. `react` - 69 edges
3. `getHandwritingStyle()` - 64 edges
4. `analyzeSample()` - 56 edges
5. `layoutHandwriting()` - 54 edges
6. `CreateHandwritingScreen()` - 52 edges
7. `render()` - 48 edges
8. `createDocument()` - 46 edges
9. `react-native` - 45 edges
10. `getPageType()` - 44 edges

## Surprising Connections (you probably didn't know these)
- `Reviewed, no change needed` --references--> `rasterFromNative()`  [INFERRED]
  visual-reports/lang4/prebuild-audit/README.md → src/handwriting/learn/raster.js
- `Freehand ink (Phase 6)` --references--> `screenToPage()`  [INFERRED]
  README.md → src/ink/strokes.js
- `6.4 Text units for Devanagari` --references--> `breakLongWord()`  [INFERRED]
  visual-reports/lang4/phase0-baseline.md → src/utils/textLayout.js
- `4. Baseline tests and regression locks (recorded 2026-10-18, before any change)` --references--> `hashString()`  [INFERRED]
  visual-reports/lang4/phase0-baseline.md → src/utils/variation.js
- `2. Describe them: `real-samples/manifest.json`` --references--> `validateManifest()`  [INFERRED]
  visual-reports/lang4/phase14/PROTOCOL.md → __tests__/helpers/realProtocol.js

## Import Cycles
- None detected.

## Communities (109 total, 27 thin omitted)

### Community 0 - "alignSample.js"
Cohesion: 0.16
Nodes (23): alignTranscription(), finish(), LOST_WORD_MARGIN, LOW_MARK_TOP, LOW_MARKS, measureShape(), MIN_INK_HEIGHT, MIN_SCALE_WORDS (+15 more)

### Community 1 - "CreateHandwritingScreen.js"
Cohesion: 0.06
Nodes (76): measure(), now(), record(), resetPerf(), samples, setPerfEnabled(), clearTemporaryImages(), decodeSampleImage() (+68 more)

### Community 2 - "ink.test.js"
Cohesion: 0.12
Nodes (38): demoStroke(), strokesFor(), DrawingSurface(), styles, addPoint(), angleAt(), centerlinePath(), clamp() (+30 more)

### Community 3 - "realism.test.js"
Cohesion: 0.15
Nodes (24): createDocument(), NewDocumentScreen(), openNew(), startEditing(), baseInk(), byTestId(), changeText(), cleanup() (+16 more)

### Community 4 - "profileSchema.js"
Cohesion: 0.23
Nodes (17): deserializeProfile(), FORM_METHODS, isObj(), isProfileId(), migrateProfile(), MIGRATIONS, PARAM_SOURCES, PERSONAL_PREFIX (+9 more)

### Community 5 - "profileGeneration.js"
Cohesion: 0.22
Nodes (17): generatePersonalProfile(), headlineAnchors(), languageSupport(), MATHS_CORE_TEXT, MATHS_EXTRA_TEXT, mean(), measureParams(), median() (+9 more)

### Community 6 - "lang3Reference1.test.js"
Cohesion: 0.09
Nodes (46): glyphFor(), glyphForms(), tableFor(), appendTail(), chooseForm(), construct(), contextCache, contextualVariant() (+38 more)

### Community 7 - "personalStore.js"
Cohesion: 0.36
Nodes (12): cache, clearPersonalCache(), failure(), getPersonalResolution(), inflight, listeners, loadPersonal(), notify() (+4 more)

### Community 8 - "Handwriting Tuner"
Cohesion: 0.14
Nodes (27): PaperBackground(), PaperCanvas(), Ruling(), styles, getStyleOverrides(), getPaperVersion(), resetPaperAppearance(), setPaperAppearance() (+19 more)

### Community 9 - "lang4Phase22.test.js"
Cohesion: 0.25
Nodes (13): checkedScripts(), HANDWRITING_TYPES, handwritingType(), MAX_PHOTOS, MIN_PHOTOS, REQUIRED_SETS, checked(), flush() (+5 more)

### Community 10 - "Synthetic Page Fixtures"
Cohesion: 0.18
Nodes (22): analysisToFrame(), applyHomography(), homographyFrom(), invertHomography(), warpGray(), rectifyPage(), rotateGray(), makeRaster() (+14 more)

### Community 11 - "referenceHandwriting.test.js"
Cohesion: 0.12
Nodes (30): getPageMetrics(), getPageType(), rowHeightFor(), pathPoints(), FALLBACK_GLYPH, paginateDocument(), paginate(), drawPoem() (+22 more)

### Community 12 - "EditorToolbar.js"
Cohesion: 0.18
Nodes (24): Divider(), EditorToolbar(), Option(), styles, Swatch(), ToolButton(), ToolOptions(), Box() (+16 more)

### Community 13 - "Sample Analysis Pipeline"
Cohesion: 0.16
Nodes (25): analyzeSample(), DESKEW_MIN, now(), clearTurn(), detectOrientation(), linkDirections(), ORIENTATION, pieces() (+17 more)

### Community 14 - "RN Imports & Screens"
Cohesion: 0.13
Nodes (26): react-native, react-native-safe-area-context, Action(), styles, PageTypeSelector(), PaperThumb(), styles, PenSelector() (+18 more)

### Community 15 - "EditorScreen.js"
Cohesion: 0.10
Nodes (31): MARKER_TEXT, applySpanFormat(), cleanGaps(), cleanRanges(), closest(), compact(), emptyFormatting(), headingAt() (+23 more)

### Community 16 - "lang4Phase8.test.js"
Cohesion: 0.16
Nodes (34): coverageOf(), loadProfileSummaries(), SCRIPT_NAMES, createProfileVersion(), enqueueWrite(), listProfiles(), listVersions(), purgeOrphanedVersions() (+26 more)

### Community 17 - "textLayout.js"
Cohesion: 0.10
Nodes (43): CORRECTION_KINDS, CORRECTION_SETTINGS, isEligible(), misspell(), planCorrection(), SIMILAR, wordCount(), glyphAdvance() (+35 more)

### Community 18 - "iOS Native Modules"
Cohesion: 0.08
Nodes (16): HandWriteExport, HandWriteExportPdfJob, -init, -methodQueue, -prepareFile, +requiresMainQueueSetup, -viewForTag, HandWriteSamples (+8 more)

### Community 19 - "Real-Sample Protocol"
Cohesion: 0.09
Nodes (33): ROLE, decodePngGray(), REAL_CONDITIONS, analysisToOriginal(), assertPrivate(), CAPTURE, count(), DANDA (+25 more)

### Community 20 - "handwritingStyles.js"
Cohesion: 0.06
Nodes (62): demoInk(), ellipse(), formattingFor(), inkSvg(), LONG_SAMPLE, renderPage(), ROOT, SAMPLE (+54 more)

### Community 21 - "Personal Renderer"
Cohesion: 0.06
Nodes (67): baselineIn(), Ink(), PersonalLines(), PersonalText(), PersonalUnavailable(), styles, usePersonalResolution(), getStylesVersion() (+59 more)

### Community 22 - "lang3Fidelity.test.js"
Cohesion: 0.10
Nodes (20): DEFS, FALLBACK, FORM_WIDTH, formsOf(), GLYPH_FORMS, GLYPHS_LANG2, GLYPHS_LANG3, inkExtent() (+12 more)

### Community 23 - "lang4Analysis.test.js"
Cohesion: 0.10
Nodes (29): assessQuality(), dilate(), edgeSharpness(), METHODS, noiseSigma(), orientationIssue(), QUALITY_THRESHOLDS, ramp() (+21 more)

### Community 24 - "Handwriting Components"
Cohesion: 0.06
Nodes (29): PERSONAL_HANDWRITING_ONBOARDING(), VALIDATION_RELEASE(), VALIDATION_TOOLS(), 2. Bugs found and fixes made, 3. Test results and regression matrix, 4. Performance and memory, 5. Feature classification, 6. Release blockers and recommended next phase (+21 more)

### Community 25 - "Page Detection"
Cohesion: 0.15
Nodes (26): boundaryOf(), cross(), detectPage(), extremum(), fillHoles(), fitLine(), fitQuad(), growInto() (+18 more)

### Community 26 - "document.js"
Cohesion: 0.23
Nodes (13): isHandwritingStyle(), isPageType(), DEFAULT_PEN, isPen(), inkSignature(), normalizeInk(), DEFAULT_TITLE, DOCUMENT_VERSION (+5 more)

### Community 27 - "Glyph Stroke Definitions"
Cohesion: 0.12
Nodes (12): bowlUp(), DEFS_LANG2, entry(), loopUp(), bowlUp(), DEFS_LANG3, FORMS_LANG3, hookIn() (+4 more)

### Community 28 - "glyphExtraction.js"
Cohesion: 0.17
Nodes (21): COUNTER_LETTERS, cross2(), DETACHABLE, detachableMarks(), DOT_MARK_NAMES, dotMarkNames(), expectedDots(), extractGlyphs() (+13 more)

### Community 29 - "lang4Alignment.test.js"
Cohesion: 0.18
Nodes (17): ALIGNMENT_THRESHOLDS, BLUR, blurReach(), blurredGap(), DEGRADING, edgeConfidence(), hairlineGap(), MIN_GAP_PX (+9 more)

### Community 30 - "lang3.test.js"
Cohesion: 0.08
Nodes (36): baselineInRow(), DEFAULT_HANDWRITING_STYLE, alphaLevels(), f1(), renderLines(), GLYPHS, LANG2_PROFILE, LANG2_PROFILE_ID (+28 more)

### Community 31 - "Undo/Redo History"
Cohesion: 0.28
Nodes (17): nextToken(), push(), reducer(), useDocumentHistory(), reducer(), useTextHistory(), applyPatch(), COALESCE_WINDOW_MS (+9 more)

### Community 33 - "iOS App Delegate"
Cohesion: 0.12
Nodes (6): AppDelegate, ReactNativeDelegate, React, React_RCTAppDelegate, ReactAppDependencyProvider, UIKit

### Community 34 - "deviceRendering.test.js"
Cohesion: 0.11
Nodes (33): Pages and export (Phase 5), react-native-svg, PagesOverview(), PaperPage(), styles, MAX_SVG_PIXELS, renderScaleFor(), shrinkStyle() (+25 more)

### Community 36 - "documentStorage.js"
Cohesion: 0.20
Nodes (18): VALIDATION_RELEASE, DocumentCard(), EmptyState(), HomeScreen(), MiniPage(), styles, tidyProfiles(), deleteDocument() (+10 more)

### Community 37 - "Lang4 — Phase 0 baseline and architecture assessment"
Cohesion: 0.15
Nodes (12): 2. Data structures a Lang4 profile must plug into, 4. Baseline tests and regression locks (recorded 2026-10-18, before any change), 5. Native capabilities and gaps, 6.2 JS learning pipeline: `src/handwriting/learn/` (pure functions, Jest-testable), 6.3 Profile schema (sketch), 6.4 Text units for Devanagari, 6.5 Shared-code changes needed (all additive, all gated), 6.6 Test strategy without private handwriting (+4 more)

### Community 38 - "analyze-reference.js"
Cohesion: 0.67
Nodes (6): analyze(), decodePng(), lum(), measurePage(), measureVariation(), median()

### Community 41 - "Extraction Tests"
Cohesion: 0.08
Nodes (23): grid(), 1. Collect five photos, 2. Describe them: `real-samples/manifest.json`, 3. Run, 5. Reading the results honestly, Real handwriting validation protocol (Lang4 Phase 14), Confirmed defects, Files (+15 more)

### Community 42 - "lang4Extraction.test.js"
Cohesion: 0.15
Nodes (17): analysisToPhoto(), analysisToSource(), EXTRACTION, formPointsInAnalysis(), frameToAnalysis(), glyphToAnalysis(), glyphToFrame(), glyphToSource() (+9 more)

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
Cohesion: 0.15
Nodes (29): CHECKLIST, POEM, setNativeExporter(), mapFormatting(), RANGE_KEYS, addPage(), boundariesOf(), countBreaks() (+21 more)

### Community 47 - "Formatting Editor Tests"
Cohesion: 0.50
Nodes (3): `consistency.png` and `synthetic/` — SYNTHETIC (scored against fixture truth), Lang4 Phase 10 — personal handwriting rendering quality, `real/` — REAL glyphs from `reference/handwriting_03.png` (visual only)

### Community 48 - "Document Storage"
Cohesion: 0.50
Nodes (3): Lang4 Phase 11 — glyph quality and extraction reliability, `real/` — `reference/handwriting_03.png` (visual inspection only), `synthetic/` — SYNTHETIC, scored against fixture truth

### Community 49 - "Dev Dependencies"
Cohesion: 0.15
Nodes (13): devDependencies, @babel/core@^7.25.2, jest@^29.6.3, @react-native/babel-preset@0.87.1, @react-native-community/cli@20.2.0, @react-native-community/cli-platform-android@20.2.0, @react-native/eslint-config@0.87.1, @babel/core (+5 more)

### Community 50 - "Word Gap Tests"
Cohesion: 0.50
Nodes (3): Images, Lang4 Phase 12 — Devanagari and multilingual reliability, `synthetic/devanagari-extraction.json`

### Community 51 - "Natural Rhythm Lock"
Cohesion: 0.50
Nodes (3): Lang4 Phase 8 — validation reports, `real/` — real handwriting images (Latin only), `synthetic/` — modelled photo conditions

### Community 52 - "ESLint Config Deps"
Cohesion: 0.20
Nodes (9): @babel/runtime@^7.25.0, @react-native/jest-preset@0.87.1, engines, node, name, private, version, @babel/runtime (+1 more)

### Community 53 - "lang4Phase13.test.js"
Cohesion: 0.10
Nodes (23): App(), HOME, styles, react, @react-native-async-storage/async-storage, PERSONAL_HANDWRITING_ONBOARDING, VALIDATION_TOOLS, deletionNotice() (+15 more)

### Community 54 - "Stroke Fitting"
Cohesion: 0.50
Nodes (3): Lang4 Phase 9 — page detection and image reliability, `real/` — the reference pages (Latin only, no ground truth), `synthetic/` — modelled conditions, scored against fixture truth

### Community 57 - "Runtime Dependencies"
Cohesion: 0.20
Nodes (10): dependencies, handwrite-export@file:modules/handwrite-export, handwrite-samples@file:modules/handwrite-samples, react@19.2.3, react-native@0.87.1, @react-native-async-storage/async-storage@^3.1.1, react-native-safe-area-context@^5.5.2, react-native-svg@15.15.5 (+2 more)

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
Cohesion: 0.21
Nodes (21): around(), blob(), centreLine(), closedSpline(), mul(), nearest(), pushNums(), quickStroke() (+13 more)

### Community 66 - "Metro Config"
Cohesion: 0.40
Nodes (3): config, @react-native/metro-config@0.87.1, @react-native/metro-config

### Community 67 - "AsyncStorage Mock"
Cohesion: 0.50
Nodes (3): createAsyncStorage(), createMemoryStorage(), databases

### Community 69 - "profileBuilder.js"
Cohesion: 0.15
Nodes (17): buildProfileVersion(), clone(), defaultParamNotes(), nextVersion(), normaliseUnits(), ENGINE_VERSION, PARAM_BOUNDS, PERSONAL_KIND (+9 more)

### Community 70 - "EditorScreen.js"
Cohesion: 0.12
Nodes (29): PersonalDocumentBanner(), buildExportPlan(), remapInk(), EditorScreen(), ExportButton(), FormatButton(), SettingsSheet(), styles (+21 more)

### Community 71 - "notebookLayout.test.js"
Cohesion: 0.12
Nodes (14): PAGE, EXPORT_FORMATS, exportFileName(), JPEG_QUALITY, PDF_PAGE, RASTER_WIDTH, sanitizeTitle(), L1 (+6 more)

### Community 73 - "lang4Model.test.js"
Cohesion: 0.23
Nodes (13): bandOf(), CONFIDENCE_DIMENSIONS, COVERAGE_STATES, DEFAULT_BANDS, DRAWABLE_STATES, summariseCoverage(), unmeasuredConfidence(), validateConfidence() (+5 more)

### Community 86 - "contracts.js"
Cohesion: 0.20
Nodes (20): validateScore(), ALIGNMENT_LEVELS, ALIGNMENT_STATES, FORBIDDEN_SAMPLE_FIELDS, isBox(), isObj(), METRIC_NAMES, QUALITY_ISSUES (+12 more)

### Community 87 - "textUnits.js"
Cohesion: 0.19
Nodes (16): keysOf(), codePoints(), devanagariClass(), drawingOrder(), isAsciiPunct(), isGeneralPunct(), isLatinLetter(), isLatinMark() (+8 more)

### Community 88 - "devanagariAlignment.js"
Cohesion: 0.22
Nodes (14): blobs(), detachedBelowMarks(), headlineBand(), marksOf(), notSliver(), segmentDevanagariWord(), stemAttributionCost(), STRUCTURE_COST (+6 more)

### Community 89 - "lang4Profile.test.js"
Cohesion: 0.19
Nodes (14): PIPELINE_STAGES, ENGINE_DEFAULT_PARAMS, REQUIREMENTS, allLatin(), extraction(), form(), latinProfile(), meta() (+6 more)

### Community 90 - "lang4Integration.test.js"
Cohesion: 0.08
Nodes (47): knownTextFor(), setImageInput(), DEVANAGARI_ALPHABET, ENGLISH_EVERYDAY, ENGLISH_WORDS, EXTRA_SLOT, HINDI_NUMBERS, HINDI_SUGGESTED (+39 more)

### Community 91 - "ZoomablePage.js"
Cohesion: 0.24
Nodes (12): centringInset(), clampZoom(), MAX_ZOOM, middle(), MIN_ZOOM, scrollAfterZoom(), spread(), stepZoom() (+4 more)

### Community 92 - "lang4Phase11.test.js"
Cohesion: 0.16
Nodes (11): COUNTER_SPACE, EXTRACTION_STATUS, isObj(), REJECTION_CODES, validateExtraction(), FAINT_LINES, SKELETON, nearest() (+3 more)

### Community 93 - "segmentation.js"
Cohesion: 0.42
Nodes (8): median(), bandsOf(), clamp01(), classifyComponents(), round1(), segment(), smooth(), wordGapThreshold()

### Community 94 - "skeleton.js"
Cohesion: 0.27
Nodes (13): components8(), dotOf(), leaving(), N8, orient(), orientLoop(), pruneSpurs(), pt() (+5 more)

### Community 95 - "lang4ProfileUI.test.js"
Cohesion: 0.33
Nodes (9): fillWizard(), flush(), line(), outer(), photo(), photos(), smallProfile(), textOf() (+1 more)

### Community 96 - "syntheticTextPage"
Cohesion: 0.20
Nodes (10): syntheticTextPage(), photo(), analysed(), syntheticWithTruth(), page(), photo(), photo(), sample() (+2 more)

### Community 97 - "wordAlignment.js"
Cohesion: 0.24
Nodes (12): BAND_SLACK, cannotHoldLetters(), expectedShape(), FLAT_REGION, isFlatRegion(), isOffBand(), needsHeight(), PUNCTUATION_ONLY (+4 more)

### Community 98 - "ValidationScreen.js"
Cohesion: 0.31
Nodes (9): BackIcon(), IconButton(), ScreenHeader(), styles, perfSummary(), buildValidationDocument(), VALIDATION_DOCS, styles (+1 more)

### Community 99 - "Architecture"
Cohesion: 0.20
Nodes (9): Adding a handwriting style, Architecture, Fonts, Freehand ink (Phase 6), HandWrite, Handwriting engine (Phase 2), Handwriting styles (Phase 3), Realism (Phase 4) (+1 more)

### Community 100 - "paper.js"
Cohesion: 0.20
Nodes (9): appearance, BASE_APPEARANCE, byId, listeners, MARGIN_TEXT_GAP, PAGE_TYPES, PAPER_APPEARANCE, RED_MARGIN (+1 more)

### Community 101 - "expectedText.js"
Cohesion: 0.33
Nodes (9): DEEP, NARROW, prepareExpectedText(), PUNCT_SMALL, TALL, unitPriors(), WIDE, WIDTH_PRIORS (+1 more)

### Community 102 - "strokeFit.js"
Cohesion: 0.38
Nodes (9): catmullRom(), dist(), FIT, fitError(), fitStroke(), segDist(), simplify(), smoothPath() (+1 more)

### Community 103 - "lang4Phase12.test.js"
Cohesion: 0.36
Nodes (8): DOT_MARKS, cluster(), HINDI, hindiProfile(), line(), nearest(), scored(), segPts()

### Community 104 - "compose"
Cohesion: 0.40
Nodes (6): boxBlur(), canvas(), compose(), rng(), syntheticPage(), inked()

### Community 105 - "realSamples.optin.test.js"
Cohesion: 0.40
Nodes (3): DIR, run(), TEXT

## Knowledge Gaps
- **11 isolated node(s):** `UIKit`, `React`, `React_RCTAppDelegate`, `ReactAppDependencyProvider`, `+requiresMainQueueSetup` (+6 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 476 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **27 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `lang4Phase13.test.js` to `CreateHandwritingScreen.js`, `ink.test.js`, `realism.test.js`, `lang3Reference1.test.js`, `Handwriting Tuner`, `lang4Phase22.test.js`, `referenceHandwriting.test.js`, `EditorToolbar.js`, `RN Imports & Screens`, `EditorScreen.js`, `lang4Phase8.test.js`, `textLayout.js`, `handwritingStyles.js`, `Personal Renderer`, `lang3Fidelity.test.js`, `lang4Analysis.test.js`, `lang4Alignment.test.js`, `lang3.test.js`, `Undo/Redo History`, `deviceRendering.test.js`, `documentStorage.js`, `Lang3 Fidelity`, `multipage.test.js`, `ESLint Config Deps`, `Runtime Dependencies`, `EditorScreen.js`, `notebookLayout.test.js`, `lang4Integration.test.js`, `ZoomablePage.js`, `lang4ProfileUI.test.js`, `ValidationScreen.js`?**
  _High betweenness centrality (0.107) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `getHandwritingStyle()` (e.g. with `1. Relevant files and what they do` and `3. Renderer integration points`) actually correct?**
  _`getHandwritingStyle()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `UIKit`, `React`, `React_RCTAppDelegate` to the rest of the system?**
  _11 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `CreateHandwritingScreen.js` be split into smaller, more focused modules?**
  _Cohesion score 0.060240963855421686 - nodes in this community are weakly interconnected._
- **Why does `6. Proposed Lang4 architecture` connect `Lang4 — Phase 0 baseline and architecture assessment` to `Android Samples Methods`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Should `ink.test.js` be split into smaller, more focused modules?**
  _Cohesion score 0.11962833914053426 - nodes in this community are weakly interconnected._
- **Why does `6.1 Native: a small in-repo module, `modules/handwrite-samples` (recommended)` connect `Android Samples Methods` to `Lang4 — Phase 0 baseline and architecture assessment`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._