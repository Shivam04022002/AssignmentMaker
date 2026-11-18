# Lang4 Phase 18: device-validation preflight

No APK was built or installed, and nothing here is a device result.
Native photo decoding, PDF/PNG/JPG export, permissions and performance
remain **unverified on any device**.

## What `VALIDATION_BUILD` does (verified in code and tests)

| | Debug (`__DEV__`) | Normal release | Release with `VALIDATION_BUILD = true` |
|---|---|---|---|
| `VALIDATION_TOOLS` | on | **off** | on |
| Create My Handwriting, My Handwritings (`PERSONAL_HANDWRITING_ONBOARDING`) | on | **off** | on |
| Tuner (title long-press), Device validation screen | on | **off**; routes fall back to Home | on |
| Timings (`dev/perf.js`) | recorded | no-op | recorded |
| "Validation build — not for release" badge (`VALIDATION_RELEASE`) | no | no | **yes** (new) |
| Android permissions | INTERNET (debug manifest) | **none** | **none**: the flag does not touch manifests |
| Saved personal handwritings | usable | usable if they exist; they cannot be created | usable |

**Risk of shipping it by accident: mitigated, not removed.** The flag is
a hand-edited source constant.

* `__tests__/validationGuard.test.js` fails while it is `true`.
* A release built with it on shows a red badge on Home.
* Remaining risk: someone builds with the flag on and distributes the
  build without running the tests or looking at Home. The build is
  debug-keystore signed, so it cannot go to a store unchanged.

## Privacy of real samples (verified in code)

* `real-samples/` is git-ignored. The project is **not a git repository**
  today, so this only matters once one is created.
* Reports hold counts, codes and words. `assertPrivate` refuses pixels,
  data URIs, long arrays and absolute paths.
* **New:** reports for your own samples are written only inside a
  `real-samples` folder. Elsewhere they are refused, because they hold
  your transcribed words.
* **New:** `scripts/real-samples-to-png.ps1` converts phone JPEGs to PNG
  using Windows' built-in .NET imaging (no new dependency):
  * applies EXIF orientation and scales to 2000 px, like the app;
  * drops EXIF, so no GPS data is copied;
  * prints only names and sizes;
  * refuses any target folder outside `real-samples`.

  It was tried on one converted reference image. EXIF rotation is
  implemented but **not exercised**: no rotated JPEG was available.
* **Logging:** no app or native code logs image data or file URIs. The
  only logs are warnings, the tuner's style configuration and the
  validation timings JSON.

## Instrumentation added (for measured device numbers)

The wizard records `decode photo (native)` (the native decoder's own
`decodeMillis`), `analyse sample`, `build profile` and
`save profile version`. Personal drawing records
`render personal handwriting`. All of these are no-ops unless the
validation tools are on.

## Build environment (checked; no build run)

The PC has:

* JDK 17.0.15 (Temurin) and Node 22.16.0;
* Android SDK platform 37, build-tools 37.0.0, NDK 27.1.12297006 and
  adb 1.0.41;
* Gradle 9.4.1 cached.

Both native modules are autolinked (`PackageList.java` from the Phase 17
manifest run). The release variant is signed with the debug keystore and
has Proguard off.

The install command is in the checklist:
`.\gradlew.bat :app:installRelease -PreactNativeArchitectures=arm64-v8a`.
It is not executed here.

## Readiness

**Ready to start the manual device stage**, with these blockers that only
it can clear:

1. Native decoding and export on a phone (never run).
2. Real English and Hindi handwriting (none exists yet).
3. Device timings and memory (unknown).
4. The release permission set on an installed build. The merged manifest
   says none; the phone settings will confirm.

The steps are in
[../phase17/DEVICE_VALIDATION_CHECKLIST.md](../phase17/DEVICE_VALIDATION_CHECKLIST.md),
rewritten in this phase. It has exact sample texts (a test keeps them
equal to the wizard's prompts), an expected outcome per step, export-file
checks, and measured-only rules for timings and memory.
