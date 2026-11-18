# Lang4 Phase 16: integration and release-readiness audit

**Scope:** an audit of the whole Lang4 flow. No app code was changed. One
end-to-end test file was added (`__tests__/lang4Integration.test.js`, 22
tests). This is not a production-readiness claim: no APK was built and
nothing was run on a device.

## 1. End-to-end flow status

| Stage | Code | Status | Evidence |
|---|---|---|---|
| Five photos (pick, decode) | `imageInput.js`, native `handwrite-samples` | **Integrated; native side untested here** | JS path tested with a fake picker. Native decoding was never run on a device. |
| Preprocessing → alignment → extraction | `analyzeSample.js` and the rest of `learn/` | **Verified on synthetic pages; measured on 3 real Latin pages** | Phases 8–15 tests; Phase 14/15 ground truth on real pages |
| Profile generation | `profileGeneration.js` | **Verified** (synthetic) | Wizard → build → requirements → save, in-app (integration step 1) |
| Versioned local storage | `profileRepository.js` | **Verified** | Immutable versions; v1 kept when v2 is added (step 7) |
| Profile selection | `HandwritingStyleSelector`, `NewDocumentScreen` | **Verified** | Pins `personal:<id>@<version>` (step 2) |
| Editor: typing, formatting, undo/redo, save | `EditorScreen`, `useDocumentHistory` | **Verified** | Strokes identical after undo and redo; the saved document keeps the reference and spans (step 3) |
| Reopen | `documentStorage`, `personalStore` | **Verified** | The same strokes, path for path (step 4) |
| Pagination | `paginatePersonal` | **Verified** | Integration tests, plus Phase 10–13 tests |
| Thumbnails | `PagesOverview` → `PaperPage` | **Verified** | Every thumbnail draws personal ink, with no built-in ink (step 5) |
| PDF / PNG / JPG export | `ExportRenderer`, `exportPlan`, native `handwrite-export` | **JS verified; native output untested** | Every exported page has personal ink and no built-in ink (step 6, recording exporter). No real file was written or inspected. |
| Rename / delete | `profileRepository`, `ProfileDetailsScreen` | **Verified** | Rename touches the index only. Delete removes unused v2 and keeps v1, which a document uses; the document still draws (step 8). |
| Missing version or profile | `personalStore`, `exportBlocker` | **Verified** | Explicit notice, no ink, export refused, no fallback (step 9) |

**Missing integrations:**

* **Native modules never run on a device.** The image picker and decoder
  and the PDF/image exporter have never been run on a device in this
  project.
* **Onboarding is deliberately off in release** (`PERSONAL_HANDWRITING_ONBOARDING = VALIDATION_TOOLS`).
  In a release build, profiles cannot be created. Profiles created earlier
  by a validation build on the same install remain selectable, because the
  selector is not gated by the flag. Documents using them keep working.

## 2. Bugs found and fixes made

No integration bug was found that breaks pinning, fallback, export or
deletion, so no app code was changed. Findings, none fixed in this audit:

| # | Finding | Severity | Recommendation |
|---|---|---|---|
| F1 | **Orphaned retained versions.** After a profile is deleted, versions still used by a document are kept. Nothing removes them once that document is deleted or switches style. The data is unreachable: it is hidden from the gallery and stays in storage (about 0.36 MB per version, measured on a synthetic profile). | low: storage only, nothing breaks | Purge versions of a deletion-requested profile that no document references, on document delete or style change, with tests. |
| F2 | **Built-in styles draw Hindi as a neutral mark without telling the user.** Lang1–3 have no Devanagari glyphs; personal profiles report missing characters, built-in styles do not. | medium (UX) | Add an editor notice for built-in styles without touching rendering, so the hash locks still hold. |
| F3 | **The style is outside undo.** Changing the handwriting style (like the page type) is a document setting, not an undo step. Undo of text keeps the current style. | by design | Document it in the UI if users expect otherwise. |
| F4 | **Dev tuner code is in the release bundle.** It is unreachable (`VALIDATION_TOOLS` is false). It contains `http://10.0.2.2:8081`, the local Metro server, used only to load reference images in development. | info | Optional: exclude dev screens from release bundles. |
| F5 | **Android manifest declares INTERNET.** This is the React Native template default. No app code makes network requests; only the dev tuner reads from Metro. | info | Remove it for release, if Metro debugging is not needed in that build type. |
| F6 | **A comment contradicts the code.** `glyphs.js` says built-in sets fall back to Lang1, while `glyphFor` says sets never borrow. Behaviour is locked by hashes, so only the comment is wrong. | info | Fix the comment when Lang1–3 files may be touched. |

## 3. Test results and regression matrix

| Check | Result |
|---|---|
| Full Jest | **1185 passed**, 15 skipped (opt-in), 0 failed |
| ESLint | clean |
| Android / iOS release JS bundles | built (1.56 MB / 1.55 MB) |
| Lang1–3 hash locks | 94 / 94 passed |
| Opt-in real-sample tests (`REAL_SAMPLES=1`) | 15 / 15 passed |

| | English | Hindi | Mixed | Failure cases | Export |
|---|---|---|---|---|---|
| **Built-in Lang1–3** | ✓ built-in engine only | drawn as neutral marks, no notice (F2) | ✓ Latin drawn; Hindi as neutral marks | unknown style id → Lang1, by design (legacy ids) | ✓ existing export tests |
| **Personal profile** | ✓ pinned, drawn, missing characters listed | ✓ learned clusters drawn; others as dashed boxes, listed | ✓ (integration step 3) | ✓ missing version or profile, damaged version, loading: notice, no ink, export blocked | ✓ PDF, PNG (all pages), JPG (current page); recording exporter only |

Personal-profile rows use synthetic profiles and photos. They verify
integration, not real handwriting.

## 4. Performance and memory

**Measured** in Node 22 on the development PC, not Hermes or a phone (`performance-node.json`):

* Analysing one sample at the analysis size (2000 × 1500, page detection
  included) takes **1.2–1.4 s**. The JS heap plus array buffers peak at
  **12–41 MB** above baseline.
* Profile generation from five samples takes **about 0.4 s**.
* A stored profile version is **about 359 KB** of JSON (225 units,
  synthetic).
* Personal pagination takes **7 ms** for 1,000 characters (1 page),
  **17 ms** for 5,000 (4 pages) and **41 ms** for 20,000 (16 pages).
* The release JS bundle is **about 1.56 MB**.

**Estimated, not measured on a device:**

* about 45 MB peak JS memory per sample (`raster.js`, arithmetic);
* a page bitmap capped at about 24 MB (`svgScale.js`, computed budget).

**Unknown:**

* Hermes speed and memory on a phone;
* native decode time and memory;
* AsyncStorage limits on a device with many profiles;
* export time and output files on a device;
* thumbnail scrolling performance.

## 5. Feature classification

| Class | Features |
|---|---|
| **Verified** (automated tests in this repo; synthetic data where noted) | Pinning to the exact version through save, reopen, edit, thumbnails and export. No fallback to Lang1 or any style for a personal document. Missing characters listed and boxed. Missing or damaged version: notice and export refused. Immutable versions. Rename and delete safety. Formatting and undo/redo with the same strokes. Local-only storage. Lang1–3 unchanged (hash locks). |
| **Experimental** (synthetic-only, or real evidence from 3 Latin pages only) | Recognition quality of every pipeline stage. Profile coverage. Devanagari extraction (synthetic only). Desk-photo profiles: five simulated desk photos were insufficient on capitals (15/26 against the 75 % required), so the optional extra sample was needed. Real-page alignment (ground truth on 2 pages). |
| **Unsupported** (refused with a reason) | Joined (cursive) letters. Writing with an x-height of 9 px or less. Hard-shadowed pages. Devanagari in built-in styles. Clusters not learned (dashed boxes). |
| **Blocked** (cannot be verified here) | Native photo picking and decoding, and PDF/PNG/JPG file output, on a device. Hermes performance and memory. Any real Hindi accuracy: no real Hindi samples. Release onboarding: disabled by design. |

## 6. Release blockers and recommended next phase

**Blockers:**

1. Native modules (image input, export) have never run on a device.
2. There are no real Hindi samples, and only three low-resolution English
   pages.
3. Onboarding is disabled in release by design.
4. Device performance and memory are unmeasured.
5. Built-in styles don't report unsupported Hindi (F2).

**Recommended Phase 17: device validation build.**

* Produce a `VALIDATION_BUILD` on one Android phone, which you would build
  and run.
* Run the five-photo protocol with real English and Hindi pages.
* Record native decode, analysis and export timings and memory with the
  existing perf tools.
* Inspect real PDF/PNG/JPG files.
* Fix F1 and F2 behind tests.
* Decide on the release-time INTERNET permission (F5) and dev-screen
  exclusion (F4).
