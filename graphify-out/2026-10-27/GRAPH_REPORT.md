# Graph Report - AssignmentMaker  (2026-10-27)

## Corpus Check
- 397 files · ~284,437 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 31 file(s) not represented in the graph (top: (none) 8, .xml 8, .properties 2)

## Summary
- 1773 nodes · 6311 edges · 86 communities (60 shown, 26 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 40 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Transcription Alignment
- Handwriting Onboarding Wizard
- Freehand Ink & Toolbar
- App Integration Tests
- Profile Schema & Text Units
- Profile Generation & Prompts
- Built-in Stroke Rendering
- Personal Profile Store
- Handwriting Tuner
- Lang2/Lang3 Profiles
- Synthetic Page Fixtures
- Text Layout & Corrections
- Page Metrics & Paper
- Sample Analysis Pipeline
- RN Imports & Screens
- Selection Formatting
- Profile Repository & Details
- Pagination & Page Ops
- iOS Native Modules
- Real-Sample Protocol
- Style Registry
- Personal Renderer
- Glyph Tables (Lang1-3)
- Raster & Segmentation
- Handwriting Components
- Page Detection
- Line Layout & Drawing
- Glyph Stroke Definitions
- Glyph Extraction
- Home & Style Selector
- Editor Screen
- Undo/Redo History
- Android Samples Methods
- iOS App Delegate
- Export Renderer
- Device Validation Tools
- Extraction Validation Tests
- Real Reference Pages
- Android Export Methods
- Extraction Tests
- Skeleton Tracing
- Lang3 Fidelity
- Personal Metrics
- Reference Handwriting Tests
- Zoomable Page
- Formatting Editor Tests
- Document Storage
- Dev Dependencies
- Word Gap Tests
- Natural Rhythm Lock
- ESLint Config Deps
- Devanagari Phase 12 Tests
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
- Orientation Detection
- Metro Config
- AsyncStorage Mock
- App Entry
- Babel Runtime
- Prettier
- RN CLI
- RN CLI Platforms
- Jest Preset

## God Nodes (most connected - your core abstractions)
1. `EditorScreen()` - 71 edges
2. `react` - 65 edges
3. `getHandwritingStyle()` - 62 edges
4. `analyzeSample()` - 54 edges
5. `layoutHandwriting()` - 54 edges
6. `react-native` - 45 edges
7. `getPageType()` - 44 edges
8. `createDocument()` - 44 edges
9. `render()` - 43 edges
10. `CreateHandwritingScreen()` - 43 edges

## Surprising Connections (you probably didn't know these)
- `docOf()` --calls--> `createDocument()`  [EXTRACTED]
  __tests__/corrections.test.js → src/models/document.js
- `save()` --calls--> `createProfileVersion()`  [EXTRACTED]
  __tests__/lang4PersonalRender.test.js → src/handwriting/learn/profileRepository.js
- `profile()` --calls--> `buildProfileVersion()`  [EXTRACTED]
  __tests__/lang4Phase10.test.js → src/handwriting/learn/profileBuilder.js
- `failingBackend()` --calls--> `getStorageBackend()`  [EXTRACTED]
  __tests__/preBuildAudit.test.js → src/storage/documentStorage.js
- `paginate()` --calls--> `paginateDocument()`  [EXTRACTED]
  __tests__/selectionFormatting.test.js → src/utils/pagination.js

## Import Cycles
- None detected.

## Communities (86 total, 26 thin omitted)

### Community 0 - "Transcription Alignment"
Cohesion: 0.05
Nodes (78): ALIGNMENT_THRESHOLDS, BLUR, blurReach(), blurredGap(), DEGRADING, edgeConfidence(), hairlineGap(), MIN_GAP_PX (+70 more)

### Community 1 - "Handwriting Onboarding Wizard"
Cohesion: 0.06
Nodes (79): validateScore(), ALIGNMENT_LEVELS, ALIGNMENT_STATES, FORBIDDEN_SAMPLE_FIELDS, isBox(), isObj(), knownTextFor(), METRIC_NAMES (+71 more)

### Community 2 - "Freehand Ink & Toolbar"
Cohesion: 0.06
Nodes (73): demoStroke(), Divider(), EditorToolbar(), Option(), styles, Swatch(), ToolButton(), ToolOptions() (+65 more)

### Community 3 - "App Integration Tests"
Cohesion: 0.08
Nodes (52): App(), HOME, styles, @react-native-async-storage/async-storage, PERSONAL_HANDWRITING_ONBOARDING, VALIDATION_TOOLS, createDocument(), HomeScreen() (+44 more)

### Community 4 - "Profile Schema & Text Units"
Cohesion: 0.09
Nodes (51): bandOf(), CONFIDENCE_DIMENSIONS, COVERAGE_STATES, DEFAULT_BANDS, DRAWABLE_STATES, summariseCoverage(), unmeasuredConfidence(), validateConfidence() (+43 more)

### Community 5 - "Profile Generation & Prompts"
Cohesion: 0.07
Nodes (48): PIPELINE_STAGES, setImageInput(), ENGINE_DEFAULT_PARAMS, generatePersonalProfile(), headlineAnchors(), keysOf(), languageSupport(), mean() (+40 more)

### Community 6 - "Built-in Stroke Rendering"
Cohesion: 0.12
Nodes (48): around(), blob(), centreLine(), closedSpline(), mul(), nearest(), pushNums(), quickStroke() (+40 more)

### Community 7 - "Personal Profile Store"
Cohesion: 0.09
Nodes (35): react-test-renderer, GLYPH_SETS, cache, clearPersonalCache(), failure(), getPersonalResolution(), inflight, listeners (+27 more)

### Community 8 - "Handwriting Tuner"
Cohesion: 0.09
Nodes (34): ScreenHeader(), VARIATION_LIMITS, appearance, BASE_APPEARANCE, byId, listeners, PAGE_TYPES, PAPER_APPEARANCE (+26 more)

### Community 9 - "Lang2/Lang3 Profiles"
Cohesion: 0.07
Nodes (32): PAGE, buildExportPlan(), GLYPHS, GLYPHS_LANG2, LANG2_PROFILE, LANG2_PROFILE_ID, LANG3_PROFILE, REFERENCE_PROFILE (+24 more)

### Community 10 - "Synthetic Page Fixtures"
Cohesion: 0.11
Nodes (34): applyHomography(), homographyFrom(), invertHomography(), warpGray(), rectifyPage(), boxBlur(), makeRaster(), cameraCorners() (+26 more)

### Community 11 - "Text Layout & Corrections"
Cohesion: 0.09
Nodes (34): setNativeExporter(), CORRECTION_KINDS, CORRECTION_SETTINGS, isEligible(), misspell(), planCorrection(), SIMILAR, wordCount() (+26 more)

### Community 12 - "Page Metrics & Paper"
Cohesion: 0.15
Nodes (35): renderPage(), builtInHindiGaps(), BuiltInScriptNotice(), styles, HandwritingLines, HandwritingText(), HandwritingTextSwitch(), useStylesVersion() (+27 more)

### Community 13 - "Sample Analysis Pipeline"
Cohesion: 0.12
Nodes (33): analyzeSample(), DESKEW_MIN, now(), dilate(), noiseSigma(), clearTurn(), turnMask(), BACKGROUND_SHARE (+25 more)

### Community 14 - "RN Imports & Screens"
Cohesion: 0.13
Nodes (29): react, react-native, react-native-safe-area-context, styles, PageTypeSelector(), PaperThumb(), styles, PenSelector() (+21 more)

### Community 15 - "Selection Formatting"
Cohesion: 0.12
Nodes (33): MARGIN_TEXT_GAP, applySpanFormat(), cleanGaps(), cleanRanges(), closest(), compact(), emptyFormatting(), formattingEquals() (+25 more)

### Community 16 - "Profile Repository & Details"
Cohesion: 0.17
Nodes (31): getHandwritingStyles(), coverageOf(), loadProfileSummaries(), SCRIPT_NAMES, createProfileVersion(), enqueueWrite(), listProfiles(), listVersions() (+23 more)

### Community 17 - "Pagination & Page Ops"
Cohesion: 0.16
Nodes (31): paginatePersonal(), mapFormatting(), RANGE_KEYS, addPage(), boundariesOf(), countBreaks(), deletePage(), documentSheets() (+23 more)

### Community 18 - "iOS Native Modules"
Cohesion: 0.08
Nodes (16): HandWriteExport, HandWriteExportPdfJob, -init, -methodQueue, -prepareFile, +requiresMainQueueSetup, -viewForTag, HandWriteSamples (+8 more)

### Community 19 - "Real-Sample Protocol"
Cohesion: 0.12
Nodes (28): REAL_CONDITIONS, analysisToOriginal(), assertPrivate(), CAPTURE, count(), DANDA, isRelative(), isVowelLetter() (+20 more)

### Community 20 - "Style Registry"
Cohesion: 0.11
Nodes (26): demoInk(), ellipse(), formattingFor(), inkSvg(), LONG_SAMPLE, ROOT, SAMPLE, seg() (+18 more)

### Community 21 - "Personal Renderer"
Cohesion: 0.13
Nodes (27): MAX_INK_EXTENT_LINES, LATIN_ZONES, placeChain(), chainPath(), DEFAULT_FORMAT, EMPHASIS, fmt(), hash01() (+19 more)

### Community 22 - "Glyph Tables (Lang1-3)"
Cohesion: 0.09
Nodes (23): DEFS, FALLBACK, FORM_WIDTH, formsOf(), GLYPH_FORMS, glyphAdvanceMax(), GLYPHS_LANG3, hasGlyph() (+15 more)

### Community 23 - "Raster & Segmentation"
Cohesion: 0.12
Nodes (24): assessQuality(), edgeSharpness(), METHODS, orientationIssue(), QUALITY_THRESHOLDS, ramp(), B64, decodeBase64() (+16 more)

### Community 24 - "Handwriting Components"
Cohesion: 0.16
Nodes (23): react-native-svg@15.15.5, react-native-svg, BuiltinHandwritingLines, Guides(), styles, baselineIn(), Ink(), PersonalLines() (+15 more)

### Community 25 - "Page Detection"
Cohesion: 0.15
Nodes (26): boundaryOf(), cross(), detectPage(), extremum(), fillHoles(), fitLine(), fitQuad(), growInto() (+18 more)

### Community 26 - "Line Layout & Drawing"
Cohesion: 0.15
Nodes (25): baselineInRow(), alphaLevels(), f1(), renderLines(), SAMPLE_STEP, strokeLength(), breakLongWord(), createMeasurer() (+17 more)

### Community 27 - "Glyph Stroke Definitions"
Cohesion: 0.13
Nodes (11): bowlUp(), DEFS_LANG2, entry(), loopUp(), bowlUp(), DEFS_LANG3, hookIn(), loopUp() (+3 more)

### Community 28 - "Glyph Extraction"
Cohesion: 0.14
Nodes (25): analysisToPhoto(), analysisToSource(), COUNTER_LETTERS, cross2(), DETACHABLE, detachableMarks(), DOT_MARK_NAMES, dotMarkNames() (+17 more)

### Community 29 - "Home & Style Selector"
Cohesion: 0.14
Nodes (19): Card(), cardTestId(), HandwritingStyleSelector(), PersonalCard(), personalPreviewText(), PinnedCard(), styles, byId (+11 more)

### Community 30 - "Editor Screen"
Cohesion: 0.16
Nodes (21): Action(), PagesOverview(), PersonalDocumentBanner(), IconButton(), Button(), short(), styles, WordGapControl() (+13 more)

### Community 31 - "Undo/Redo History"
Cohesion: 0.28
Nodes (17): nextToken(), push(), reducer(), useDocumentHistory(), reducer(), useTextHistory(), applyPatch(), COALESCE_WINDOW_MS (+9 more)

### Community 33 - "iOS App Delegate"
Cohesion: 0.12
Nodes (6): AppDelegate, ReactNativeDelegate, React, React_RCTAppDelegate, ReactAppDependencyProvider, UIKit

### Community 34 - "Export Renderer"
Cohesion: 0.24
Nodes (18): renderScaleFor(), record(), delay(), exportBlocker(), ExportRenderer(), exportRenderScale(), nextFrame(), styles (+10 more)

### Community 35 - "Device Validation Tools"
Cohesion: 0.19
Nodes (13): perfSummary(), resetPerf(), samples, setPerfEnabled(), buildValidationDocument(), CHECKLIST, POEM, VALIDATION_DOCS (+5 more)

### Community 37 - "Extraction Validation Tests"
Cohesion: 0.15
Nodes (13): COUNTER_SPACE, EXTRACTION_STATUS, formPointsInAnalysis(), isObj(), REJECTION_CODES, validateExtraction(), FAINT_LINES, SKELETON (+5 more)

### Community 38 - "Real Reference Pages"
Cohesion: 0.23
Nodes (10): analyze(), decodePng(), lum(), measurePage(), measureVariation(), median(), decodePngGray(), DIR (+2 more)

### Community 41 - "Extraction Tests"
Cohesion: 0.19
Nodes (11): analysisToFrame(), EXTRACTION, againstTruth(), blank(), cache, clipX(), extracted(), nearest() (+3 more)

### Community 42 - "Skeleton Tracing"
Cohesion: 0.27
Nodes (13): components8(), dotOf(), leaving(), N8, orient(), orientLoop(), pruneSpurs(), pt() (+5 more)

### Community 43 - "Lang3 Fidelity"
Cohesion: 0.19
Nodes (12): sampleChain(), minY(), drawnYs(), enteredForm(), extent(), L1, L2, L3 (+4 more)

### Community 44 - "Personal Metrics"
Cohesion: 0.21
Nodes (13): BASELINE, cache, CLASSES, classOf(), heightOf(), inkBox(), profileLayoutMetrics(), r3() (+5 more)

### Community 45 - "Reference Handwriting Tests"
Cohesion: 0.18
Nodes (10): LEGACY_STYLE_IDS, PREVIEW_SAMPLE, pathPoints(), FALLBACK_GLYPH, normalizedSubpaths(), NOTATION, pathNumbers(), profile() (+2 more)

### Community 46 - "Zoomable Page"
Cohesion: 0.24
Nodes (12): centringInset(), clampZoom(), MAX_ZOOM, middle(), MIN_ZOOM, scrollAfterZoom(), spread(), stepZoom() (+4 more)

### Community 47 - "Formatting Editor Tests"
Cohesion: 0.15
Nodes (8): MARKER_TEXT, cleanup(), restoreRealTimers(), LONG, metrics, paginate(), rowHeight, style

### Community 48 - "Document Storage"
Cohesion: 0.42
Nodes (11): deleteDocument(), docKey(), enqueueWrite(), getBackend(), getDocument(), listDocuments(), listDocumentsChecked(), parse() (+3 more)

### Community 49 - "Dev Dependencies"
Cohesion: 0.17
Nodes (12): devDependencies, @babel/core@^7.25.2, @babel/preset-env@^7.25.3, jest@^29.6.3, @react-native/babel-preset@0.87.1, @react-native-community/cli-platform-android@20.2.0, react-test-renderer@19.2.3, @babel/core (+4 more)

### Community 50 - "Word Gap Tests"
Cohesion: 0.21
Nodes (10): boundary(), gaps(), L1, L2, lay(), metrics, paginate(), rowHeight (+2 more)

### Community 51 - "Natural Rhythm Lock"
Cohesion: 0.25
Nodes (9): WORD_SPACING_STEPS, draw(), gapsOf(), L1, L2, lag1(), lay(), mean() (+1 more)

### Community 52 - "ESLint Config Deps"
Cohesion: 0.20
Nodes (9): eslint@^8.19.0, @react-native/eslint-config@0.87.1, engines, node, name, private, version, eslint (+1 more)

### Community 53 - "Devanagari Phase 12 Tests"
Cohesion: 0.33
Nodes (9): DOT_MARKS, expectedDots(), cluster(), HINDI, hindiProfile(), line(), nearest(), scored() (+1 more)

### Community 54 - "Stroke Fitting"
Cohesion: 0.38
Nodes (9): catmullRom(), dist(), FIT, fitError(), fitStroke(), segDist(), simplify(), smoothPath() (+1 more)

### Community 57 - "Runtime Dependencies"
Cohesion: 0.22
Nodes (9): dependencies, handwrite-export@file:modules/handwrite-export, handwrite-samples@file:modules/handwrite-samples, react@19.2.3, react-native@0.87.1, @react-native-async-storage/async-storage@^3.1.1, react-native-safe-area-context@^5.5.2, handwrite-export (+1 more)

### Community 58 - "Document Model"
Cohesion: 0.36
Nodes (8): isHandwritingStyle(), isPageType(), isPen(), DEFAULT_TITLE, DOCUMENT_VERSION, fromPages(), generateId(), normalizeDocument()

### Community 61 - "Export Module Manifest"
Cohesion: 0.25
Nodes (7): description, files, license, main, name, private, version

### Community 62 - "Samples Module Manifest"
Cohesion: 0.25
Nodes (7): description, files, license, main, name, private, version

### Community 63 - "Export Plan"
Cohesion: 0.33
Nodes (6): EXPORT_FORMATS, exportFileName(), JPEG_QUALITY, PDF_PAGE, RASTER_WIDTH, sanitizeTitle()

### Community 64 - "npm Scripts"
Cohesion: 0.33
Nodes (6): scripts, android, ios, lint, start, test

### Community 65 - "Orientation Detection"
Cohesion: 0.60
Nodes (5): detectOrientation(), linkDirections(), ORIENTATION, pieces(), r3()

### Community 66 - "Metro Config"
Cohesion: 0.40
Nodes (3): config, @react-native/metro-config@0.87.1, @react-native/metro-config

### Community 67 - "AsyncStorage Mock"
Cohesion: 0.50
Nodes (3): createAsyncStorage(), createMemoryStorage(), databases

## Knowledge Gaps
- **11 isolated node(s):** `UIKit`, `React`, `React_RCTAppDelegate`, `ReactAppDependencyProvider`, `+requiresMainQueueSetup` (+6 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 386 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **26 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `RN Imports & Screens` to `Transcription Alignment`, `Handwriting Onboarding Wizard`, `Freehand Ink & Toolbar`, `App Integration Tests`, `Profile Generation & Prompts`, `Personal Profile Store`, `Handwriting Tuner`, `Lang2/Lang3 Profiles`, `Text Layout & Corrections`, `Page Metrics & Paper`, `Sample Analysis Pipeline`, `Selection Formatting`, `Profile Repository & Details`, `Pagination & Page Ops`, `Personal Renderer`, `Glyph Tables (Lang1-3)`, `Handwriting Components`, `Home & Style Selector`, `Editor Screen`, `Undo/Redo History`, `Export Renderer`, `Device Validation Tools`, `Lang3 Fidelity`, `Reference Handwriting Tests`, `Zoomable Page`, `Formatting Editor Tests`, `Word Gap Tests`, `Natural Rhythm Lock`, `ESLint Config Deps`, `Runtime Dependencies`?**
  _High betweenness centrality (0.085) - this node is a cross-community bridge._
- **What connects `UIKit`, `React`, `React_RCTAppDelegate` to the rest of the system?**
  _11 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Transcription Alignment` be split into smaller, more focused modules?**
  _Cohesion score 0.054136874361593465 - nodes in this community are weakly interconnected._
- **Why does `react-native` connect `RN Imports & Screens` to `Handwriting Onboarding Wizard`, `Freehand Ink & Toolbar`, `App Integration Tests`, `Export Renderer`, `App Entry`, `Device Validation Tools`, `Personal Profile Store`, `Handwriting Tuner`, `Page Metrics & Paper`, `Zoomable Page`, `Profile Repository & Details`, `Pagination & Page Ops`, `ESLint Config Deps`, `Handwriting Components`, `Runtime Dependencies`, `Home & Style Selector`, `Editor Screen`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Should `Handwriting Onboarding Wizard` be split into smaller, more focused modules?**
  _Cohesion score 0.06347469220246238 - nodes in this community are weakly interconnected._
- **Why does `render()` connect `App Integration Tests` to `Transcription Alignment`, `Handwriting Onboarding Wizard`, `Freehand Ink & Toolbar`, `Profile Generation & Prompts`, `Personal Profile Store`, `Handwriting Tuner`, `Lang2/Lang3 Profiles`, `Text Layout & Corrections`, `Page Metrics & Paper`, `Sample Analysis Pipeline`, `Selection Formatting`, `Profile Repository & Details`, `Pagination & Page Ops`, `Personal Renderer`, `Glyph Tables (Lang1-3)`, `Device Validation Tools`, `Lang3 Fidelity`, `Reference Handwriting Tests`, `Formatting Editor Tests`, `Word Gap Tests`, `Natural Rhythm Lock`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Should `Freehand Ink & Toolbar` be split into smaller, more focused modules?**
  _Cohesion score 0.06265822784810127 - nodes in this community are weakly interconnected._