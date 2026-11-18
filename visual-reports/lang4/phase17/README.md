# Lang4 Phase 17: validation-readiness fixes

No APK was built, and nothing was validated on a device. The Android
change was checked by running only Gradle's manifest-merge tasks, which
build no APK.

## 1. Orphaned personal-profile versions (Phase 16 F1)

**What changed:**

* **New cleanup:** `profileRepository.purgeOrphanedVersions()` removes the
  versions of **deleted** handwritings that no saved document refers to
  any more. Versions of handwritings that were not deleted are never
  removed, used or not.
* **It refuses to act on incomplete information.**
  * It does nothing if the profile index cannot be read. Before this
    change, an unreadable index read as empty.
  * It does nothing if **any** saved document cannot be read, because that
    document might refer to the version. `documentStorage.listDocumentsChecked()`
    reports whether the document list is complete.
* **Safer deletion:** `requestProfileDeletion` also uses the checked list.
  If a document cannot be read, it hides the handwriting but keeps every
  version (`incomplete: true`).
  * Before: an unreadable document was skipped silently, so a version it
    used could be deleted.
  * Before: the details screen read the document list outside the write
    queue. Now the repository reads it itself.
* **Order of writes:** the index is written first, then the version
  records, as deletion already did.
* **When it runs:**
  * after a document using a personal handwriting is deleted (editor or
    Home);
  * after a document's saved personal handwriting changes;
  * once when Home loads, which tidies orphans left by deletions made
    before this phase.

  It never blocks the screen, and errors are only logged.

Covered by 9 tests in `__tests__/lang4Phase17.test.js`: unit-level cases
plus the editor, Home and save paths.

## 2. Hindi in built-in styles (Phase 16 F2)

`src/components/BuiltInScriptNotice.js` adds an editor notice. For a
built-in Lang1–3 document containing Devanagari, it reads: "*Reference
Handwriting has no Hindi letters: N Hindi characters are drawn as plain
marks (…). Your text is kept unchanged.*"

Built-in rendering is untouched. The notice only reads the text and the
style's glyph table. The hash locks pass, and the rendered text is checked
to be unchanged for all three built-in styles.

## 3. Dev tuner and the Android INTERNET permission

**What depends on the network:**

| Part | Needs the network? | Notes |
|---|---|---|
| Documents, profiles, AsyncStorage | No | local key-value store |
| Photo picking and decoding (`handwrite-samples`) | No | system picker grants one image; its manifest declares no permissions |
| Export and share (`handwrite-export`) | No | writes files to the app cache; shares through a FileProvider |
| react-native-svg, safe-area-context | No | |
| Metro dev server (debug builds: JS bundle, fast refresh) | **Yes** | debug only |
| Dev tuner's reference images (`HandwritingTunerScreen`) | **Yes, in debug** (from Metro), or any typed URL | reachable only when `VALIDATION_TOOLS` is on |

**What changed:**

* **Android:** `INTERNET` moved from `src/main/AndroidManifest.xml` to a
  new `src/debug/AndroidManifest.xml`. Debug builds keep Metro.
  **Release builds have no network permission.** Gradle's merged manifests
  confirm it: debug has INTERNET (plus React Native's dev permissions);
  release has only AndroidX's internal receiver permission.
  * A release-based validation build (`VALIDATION_BUILD = true`) has no
    network either. The tuner's compare panel then shows "Could not load
    the reference" for URLs; `file://` paths still work.
* **App.js:** the `tuner` and `validation` routes now render Home unless
  `VALIDATION_TOOLS` is on. This backs up the Home entry point, which was
  already gated.
* **Not changed:** the tuner's code is still in the release JS bundle.
  Metro bundles every imported module, and excluding it would need a
  bundler change. It is unreachable in release.
* **Release configuration tested:** `__tests__/releaseConfig.test.js`
  renders the app with the flags off. There is no tuner long-press, no
  Create My Handwriting and no My Handwritings. The development
  configuration is what every other test runs in.

## 4. Device-validation checklist

See [DEVICE_VALIDATION_CHECKLIST.md](DEVICE_VALIDATION_CHECKLIST.md).

## Remaining risks

* **Cleanup is untested on a device.** The orphan cleanup relies on
  AsyncStorage reads succeeding. If a device returns errors (not just
  unreadable data), the cleanup logs them and leaves storage as it is.
* **A narrow race remains.** The cleanup reads the document list on the
  profile queue, while documents are saved on their own queue. A document
  can only refer to a deleted handwriting's version if it already did, so
  the race cannot strand a document. This is reasoned, not
  stress-tested.
* **Hindi notice wording.** It names the style and counts the characters
  only. It does not suggest a personal handwriting, because onboarding is
  disabled in release.
* **Debug-only network.** Anything that might later need the network in
  release (for example crash reporting) would need the permission back.
* **Unchanged since Phase 16:** no real Hindi samples, and no device
  measurements.
