# Final pre-build audit (Lang4 and the app)

**No APK was built or installed, and nothing was run on a device.** The
only native step run was compiling the two Kotlin modules
(`:handwrite-export:compileReleaseKotlin`,
`:handwrite-samples:compileReleaseKotlin`) to check the fixes compile.
iOS code was reviewed only.

## Fixes

| # | Area | Problem | Fix | Test |
|---|---|---|---|---|
| 1 | Profile storage | `createProfileVersion` read an unreadable profile index as empty and then wrote it back. Saving one handwriting would drop every other one from the gallery. | Uses the strict index read. If the index is unreadable it returns `unreadable-index` and writes nothing. The wizard explains it. | `preBuildAudit` |
| 2 | Wizard save | A storage error (e.g. disk full) during save left the screen on "Saving…" with the button disabled, and the rejection was unhandled. | Caught: an error message is shown and the user can retry. | **not directly tested** (it needs the full wizard flow with a failing store); code review only |
| 3 | Wizard build | An unexpected exception in profile generation, run synchronously from a tap, would be fatal in release. | `safeGenerate` turns it into a `failed` result, which the result step explains. | `preBuildAudit` |
| 4 | Document delete (Home, editor) | A storage error became an unhandled rejection. | Caught. "Could not delete": the document is kept and the editor stays open. | `preBuildAudit` |
| 5 | Handwriting rename / delete | Storage errors were unhandled, and an unreadable index during delete was not reported. | Caught. "Could not delete … nothing was changed"; `onDeleted` is not called. | `preBuildAudit` |
| 6 | Deletion notice | When versions were kept because a document could not be read, the notice said "saved documents use them". | It now says a saved document could not be read. | `preBuildAudit` |
| 7 | Android photo copy | `copyAndDescribe` runs on a background thread and caught only Security/IO exceptions. Any other provider exception would have ended the app, and the promise would never settle. | Catches `Exception` too, deletes the partial copy and rejects. | static check + Kotlin compile |
| 8 | Android export | `OutOfMemoryError` (not an `Exception`) while drawing a page bitmap (up to 2480 px wide, about 35 MB) or writing a file would crash the app from the UI or IO thread. | Caught in `addPdfPage`, `captureView` (draw and write) and `finishPdf`, then rejected with a message. | static check + Kotlin compile |

## Reviewed, no change needed

* **Flow:** traced in Phase 16 and re-run: pinning, no fallback to Lang1,
  missing glyphs boxed and listed, built-in Hindi notice, formatting,
  undo/redo, pagination, thumbnails and export through a recording fake.
* **Temporary photos:** all copies are cleared when the wizard opens,
  released when a photo is replaced, the wizard closes or the profile is
  saved. Native code deletes only inside its own cache folder. If the app
  is killed mid-wizard, the copies remain until the wizard is next opened.
* **Malformed native output:** validated (`rasterFromNative`). Analysis
  catches its own errors and returns `failed`.
* **Registration:** both packages are autolinked (`PackageList.java`);
  `node_modules` entries are junctions to `modules/`. FileProvider is
  limited to `cache/exports/`. The release manifest has no INTERNET.
* **Flags:** `VALIDATION_BUILD = false`. The guard and release
  configuration tests pass.
* **Accessibility:** every pressable on the critical screens has a role
  and state. Banners use the text or alert role. Loading, empty and error
  states exist on Home, the wizard, My Handwritings, details and the
  editor.
* **Privacy:** no app or native code logs image data or URIs. Local
  reports are confined to `real-samples/`. The conversion script strips
  EXIF.

## Remaining risks (unverified)

* All native behaviour on a device: picking, decoding (HEIC needs API
  28+), memory, PDF/PNG/JPG output and sharing. iOS was not compiled.
* Storage queue interplay is reasoned, not stress-tested (Phase 17).
* OOM handling only reports the failure; it does not retry at a lower
  resolution.
* Real-handwriting accuracy: three low-resolution English pages, no Hindi.
