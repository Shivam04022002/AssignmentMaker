# Android device-validation checklist (Lang4)

**Status: not run.** No APK has been built or installed, and nothing in
this file is a device result yet. Native photo decoding, PDF/PNG/JPG
export, permissions and performance are not verified on any device.

Rules for recording:

* Write every result as **pass, fail or not run**, with the steps that
  produced it.
* Name the device: model, Android version, RAM and free storage.
* Mark every number **measured** (read on this device, with the tool
  named), **estimated** (arithmetic or code comments) or **unknown**.
  Never copy an estimate into a measured column.
* Keep photos, reports and results in `real-samples/` (git-ignored). The
  project folder is not a git repository today; if one is created, check
  that `git check-ignore real-samples/x.png` answers.

## 0. Prerequisites (checked on the build PC, Phase 18)

| Item | Required | Found on the build PC |
|---|---|---|
| JDK | 17 | Temurin 17.0.15 (`JAVA_HOME` set) |
| Node | ≥ 22.11 | 22.16.0 |
| Android SDK | platform 37, build-tools 37.0.0, NDK 27.1.12297006 | installed (`ANDROID_HOME` set) |
| adb | any recent | 1.0.41 |
| Gradle | wrapper 9.4.1 | cached (offline manifest tasks ran in Phase 17) |
| Phone | Android 7.0+ (minSdk 24), USB debugging on | — |

## 1. Build the validation build (manual; not done yet)

1. In `src/dev/flags.js`, set `const VALIDATION_BUILD = true;`.

   While it is true, `__tests__/validationGuard.test.js` fails. That is on
   purpose: never commit it.

2. Build and install the **release** variant. On PowerShell, from the
   project folder:

   ```
   cd android
   .\gradlew.bat :app:installRelease -PreactNativeArchitectures=arm64-v8a
   ```

   * `arm64-v8a` builds only the phone's ABI. Drop the flag for all four
     ABIs.
   * The release variant is signed with the debug keystore. That is fine
     for side-loading and **not for distribution**.
   * Gradle bundles the JS (Hermes) itself.

3. Set the flag back to `false` immediately, and run
   `npx jest __tests__/validationGuard.test.js` (it must pass).

4. Expected on the phone:

   | Check | Expected |
   |---|---|
   | Badge on Home | a red "Validation build — not for release" badge |
   | Home buttons | **Create My Handwriting** and **My Handwritings** are shown |
   | Developer tools | long-pressing the title opens the tuner; the tuner's "Device validation" opens the timings screen |
   | Permissions (Settings → Apps → HandWrite → Permissions) | **none**. There is no network permission in release: `INTERNET` is debug-only. |
   | The tuner's compare panel | "Could not load the reference" for URLs (expected: there is no network); `file://` paths still work |

## 2. One handwriting type, five photos (real handwriting) — Phase 24 flow

Creating a handwriting (Phase 24) goes Home → Create My Handwriting
(introduction, "Get Started") → **one type** (English, Hindi, English +
Hindi, English + Maths, Hindi + Maths, or Hindi + English + Maths) → **Add
Reference Photos** (a grid of exactly **5** photos of the same person's
handwriting; × removes, tapping a tile replaces) → **Analyze Photos** (a
progress ring and the stages: image quality, matching to each page's text,
extracting characters, analysing writing style) → **Review Result** (a
banner, the photos used, "Detected characters (English/Hindi/Maths)" with a
bar and a row per set, missing and low-confidence characters, the engine's
details; tapping a photo shows its checks and lets you correct its text) →
**Name Your Handwriting** (name and details) → **Creating** (stages) →
**Handwriting Created** (details, "Create Another Handwriting", "Go to
Documents") → My Handwritings (type · v1 · date, search). All five photos
build **one** profile of that type. Another type is a separate handwriting.

**No text is read from a photo** (no OCR engine is approved: see
`visual-reports/lang4/phase24/OCR_STATUS.md`); the photo step says so.

The type controls every photo: photo N shows the type's page N, to copy
by hand exactly. There is no per-photo page choice, no free writing and
no typed transcription, and a type is never shown text in a script it
does not write (an English handwriting never sees Hindi). The wizard's
"What your pages can teach" panel shows which required characters the
chosen photos' pages contain (for a maths type, also digits and maths
symbols), and which of the type's pages to add.

**Writer and paper:** one writer, in pen, on ruled or plain A4 or letter
paper. Copy each practice page exactly, line for line, as the wizard shows
it.

| Practice page | Exact text |
|---|---|
| English alphabet | `ABCDEFGHIJKLMNOPQRSTUVWXYZ` / `abcdefghijklmnopqrstuvwxyz` / `aaa eee ooo rrr sss ttt nnn ggg yyy fff kkk` |
| Hindi alphabet | `अ आ इ ई उ ऊ ऋ ए ऐ ओ औ अं अः` / `क ख ग घ ङ च छ ज झ ञ ट ठ ड ढ ण` / `त थ द ध न प फ ब भ म य र ल व श ष स ह` / `क़ ख़ ग़ ज़ ड़ ढ़ फ़` / `का कि की कु कू कृ के कै को कौ कं कँ कः क्` / `क्ष त्र ज्ञ श्र द्ध प्र क्र स्त` |
| Numbers, punctuation and a sentence | `0123456789` / `Yes. No, maybe; at 5: why? Wow!` / `(soon) re-do "hi" it's a/b 50% A&B 2+2=4 ₹10` / `The quick brown fox jumps over the lazy dog.` |
| Everyday Hindi | `माता जी ने दादी को चाय दी और नाना जी बाज़ार गए।` / `हम सब मिलकर पढ़ते हैं, खेलते हैं और गाना गाते हैं।` / `यह मेरा घर है, यहाँ एक बड़ा पेड़ भी है।` / `आज मौसम अच्छा था, बच्चे बाहर खेल रहे थे।` / `क्या तुम कल स्कूल जाओगे? हाँ, मैं ज़रूर जाऊँगा।` / `सुबह माँ ने लाल साड़ी पहनी और दीया जलाया।` / `रेलगाड़ी से भाई शहर लौटा, रास्ते में बारिश होती रही।` / `पानी पीना, समय पर सोना और रोज़ पढ़ना अच्छी आदतें हैं।` |
| English words and sentences | `apple bridge candle dream giant hello jump kite lemon` / `music night orange puzzle queen river sunny table under` / `voice water box yellow zebra quick brown fox lazy` / `My name is Sam. I like to read books.` / `We will meet at the park after school.` |
| Everyday English | `Today the weather was bright and warm.` / `My sister and I walked to the market.` / `We bought fresh fruit, bread and milk.` / `In the evening we finished our homework.` / `Tomorrow we will visit our grandparents.` |
| Hindi words and sentences | `किताब कलम पानी घर स्कूल बाज़ार` / `मेहनत दोस्त परिवार त्योहार ख़ुशी` / `बच्चे खेलते हैं और गाना गाते हैं।` / `मैं रोज़ सुबह पढ़ाई करता हूँ।` / `क्या आप कल आएँगे? हाँ, ज़रूर।` |
| Hindi numbers and punctuation | `० १ २ ३ ४ ५ ६ ७ ८ ९` / `एक दो तीन चार पाँच छह सात आठ नौ दस` / `आज तारीख़ १२ है। कल १३ होगी।` / `क्या, कब, कहाँ? हाँ! नहीं।` |
| Maths in English | `0 1 2 3 4 5 6 7 8 9` / `12 + 7 = 19   45 − 18 = 27` / `6 × 8 = 48   72 ÷ 9 = 8` / `(3 + 4) × 2 = 14   3/4 = 0.75   50%` / `5 > 3   2 < 9   7 ≤ 7   x ≥ 0   √16 = 4   x² + y²` / `one two three four five six seven eight nine ten` |
| Maths in Hindi | `0 1 2 3 4 5 6 7 8 9` / `० १ २ ३ ४ ५ ६ ७ ८ ९` / `एक दो तीन चार पाँच छह सात आठ नौ दस` / `15 + 27 = 42   100 − 35 = 65` / `9 × 6 = 54   81 ÷ 9 = 9   (2 + 3) × 4 = 20` / `3/4 = 0.75   50%   5 > 3   2 < 9   7 ≤ 8   √16 = 4` / `जोड़ + घटाना − गुणा × भाग ÷ बराबर =` |
| English and Hindi together | `Today I went to the market with my brother.` / `हमने सब्ज़ी, फल और दूध खरीदा।` / `The bill was ₹ 245 — not too much!` / `घर आकर माँ ने खाना बनाया।` / `After dinner we watched a film on TV.` / `फ़िल्म बहुत अच्छी थी, सबको पसंद आई।` / `Next week, on 12 June, we will visit our grandparents.` / `वहाँ हम दो दिन रुकेंगे।` |

(`/` separates lines.) Leave a small space between the separate letters
of the two alphabet pages.

**The page of each photo, per type** (photos 1–3 alone cover every
required character; 4–5 add examples):

| Type | Photo 1 | Photo 2 | Photo 3 | Photo 4 | Photo 5 |
|---|---|---|---|---|---|
| English | English alphabet | English words and sentences | Numbers, punctuation and a sentence | Everyday English | English alphabet (second copy) |
| Hindi | Hindi alphabet | Hindi words and sentences | Hindi numbers and punctuation | Everyday Hindi | Hindi alphabet (second copy) |
| English + Hindi | English alphabet | Hindi alphabet | Numbers, punctuation and a sentence | Everyday Hindi | English and Hindi together |
| English + Maths | English alphabet | Maths in English | Numbers, punctuation and a sentence | English words and sentences | Everyday English |
| Hindi + Maths | Hindi alphabet | Maths in Hindi | Hindi words and sentences | Everyday Hindi | Hindi numbers and punctuation |
| Hindi + English + Maths | English alphabet | Hindi alphabet | Maths in English | Maths in Hindi | English and Hindi together |

**Recommended runs for this validation:** at least **English + Hindi**
and **Hindi + English + Maths**, five photos each. If time allows, every
type once.

**Photos:**

* Full camera resolution, JPEG. On an iPhone, Settings → Camera → Formats
  → Most Compatible; HEIC cannot be converted on the PC without extra
  software.
* The whole sheet in view, in even daylight, held flat.
* Take the five main photos first.
* Then one **condition** photo each of the numbers page under each of:
  uneven light, a hard shadow, the page tilted about 7°, a strongly
  angled camera, and small writing (half size).

**In the wizard, record:**

| Step | Expected | Result |
|---|---|---|
| Introduction | "Create Your Handwriting Profile" with the four steps; Get Started opens the type step; back from the type step returns to it | |
| Type step | six types listed with a glyph and a description; Continue disabled until one is chosen; "Change type" returns to it | |
| Photo picker | system picker opens, with no storage-permission prompt | |
| Prompts follow the type | each card says "Photo N · page" with that page's exact text; no page, script or transcription choice on any photo; English types show no Hindi text, Hindi types no English text | |
| Fewer than 5 photos | "N of 5 photos added"; the problems list says "Add all 5 photos"; Analyze Photos disabled | |
| Photo grid | each photo as a numbered tile with ✓ / ! once checked; × removes it (the copy is released); tapping a tile replaces the photo | |
| Coverage panel | with the planned pages: every required character on some page (maths types: "Digits and maths symbols: N of N") | |
| Each photo | quality result, "Text located …" and "Letters usable from this photo: N of M"; no crash; no freeze longer than about 10 s | |
| Change the type after photos were checked | each photo takes the new type's page; photos whose page changed are checked again (their "Text located" changes) | |
| Reorder (Move up / down) | the page moves with the photo | |
| The same photo chosen twice | refused: "The same photo is chosen for photos N and M" | |
| A condition photo that is too small, blurred, rotated or hard-shadowed | refused or warned **with advice**, never silently accepted; replacing it with a good photo allows the build | |
| Analyze Photos | the analysis screen shows each photo's state and the four stages ticking in order; the percentage only rises; no freeze longer than about 10 s per photo | |
| Review | **one** result for all the photos: "Good coverage" only when every requirement passes; per script a bar and rows (English: uppercase, lowercase, numbers, punctuation; Hindi: consonants, vowels/matras/clusters; Maths: digits and symbols); missing characters named; low-confidence count shown; Details list the requirements with ✓ or ✗; Hindi **never** described as complete | |
| A photo on the review | tapping it shows its quality score, writing region, "Text located …", letters used; "I wrote something different" lets you type the text actually on the photo; a script the type does not write is refused; applying re-checks that photo and rebuilds the review | |
| Insufficient evidence | e.g. English + Maths whose maths photo shows another page: red banner "Not enough characters yet", the missing symbols named, Continue disabled, nothing saved | |
| Capitals | may fail (synthetic desk photos gave 15 of 26). If so, retake the English alphabet photo larger and clearer, or add photo 5 (a second copy of the alphabet, English type) | |
| Name and save | the name step shows type, photos used and the date; Save disabled for an empty name; the creating screen's stages tick; the success screen shows type, 5 photos, date and v1 | |
| After success | "Create Another Handwriting" returns to the type step with an empty grid; "Go to Documents" returns Home | |
| My Handwritings | each card: glyph, name, "Type · v1 · date", coverage, "Ready to use"; the search field narrows the list by name or type | |
| A second handwriting of another type | made the same way; both listed; documents keep the exact version they chose | |
| Save failure (if it can be provoked, e.g. full storage) | back on the name step with "could not be saved … try again"; nothing partial listed; retry works once storage is free | |

## 3. Real samples through the local protocol (PC)

1. Copy the phone photos into `real-samples\originals\`.
2. Convert them. This applies EXIF orientation, scales to 2000 px like
   the app, writes PNG and keeps no GPS or camera data:

   ```
   powershell -ExecutionPolicy Bypass -File scripts\real-samples-to-png.ps1
   ```

3. Write `real-samples\manifest.json` in the format of
   `visual-reports/lang4/phase14/PROTOCOL.md`, one entry per PNG:
   * `transcription`: the exact texts above;
   * `capture`: what was really done;
   * `provenance.consent: true`.
4. Run it. In PowerShell:

   ```
   $env:REAL_SAMPLES='1'; $env:REAL_REPORT_DIR='real-samples\report'; npx jest __tests__/realProtocol.optin.test.js; Remove-Item Env:REAL_SAMPLES, Env:REAL_REPORT_DIR
   ```

   In Git Bash:
   `REAL_SAMPLES=1 REAL_REPORT_DIR=real-samples/report npx jest __tests__/realProtocol.optin.test.js`

   Reports for your samples are written only inside a `real-samples`
   folder; elsewhere they are refused. They hold counts, codes and words,
   and never pixels.
5. Expected:
   * the "local samples" test passes;
   * `real-samples/report/local-report.json` lists, per sample, quality,
     alignment, yield and refusal codes, and, for Hindi, the Devanagari
     features (vowels, matras by position, nukta, conjuncts, danda,
     headlines).
6. **Optional ground truth:** annotate word boxes for one English and one
   Hindi page (format: `__tests__/realTruth/reference-pages.words.json`)
   to get aligned-word precision. Without it, results are counts only.

## 4. Profile save and reopen

| Step | Expected | Result |
|---|---|---|
| New document → choose the new handwriting → paste the slot 5 text → Save | saved; personal ink; no built-in ink | |
| Swipe the app away, reopen, open the document | same handwriting; details show version 1 | |
| Reboot the phone, reopen | same | |
| Rename the handwriting | document unchanged; versions keep the old name | |
| Delete the handwriting while the document uses it | document still opens and draws | |
| Delete the document, return to Home | the handwriting's last version is removed. Not visible in the UI: note it as not observable unless storage can be inspected. | |

## 5. Missing glyphs

| Text typed in a personal document | Expected | Result |
|---|---|---|
| `ॐ राष्ट्र` | dashed boxes for units not learned (at least `ॐ` and `ष्ट्र`), listed in the banner; never another handwriting | |
| A built-in (Reference Handwriting) document with `Hello नमस्ते` | notice "… has no Hindi letters: 6 Hindi characters are drawn as plain marks …"; English unchanged | |

## 6. Real export files

Use one personal document. Device validation → "2 pages" document →
settings → choose the personal handwriting → paste the slot 5 text at
the top → underline a word → Save. Use one built-in document as well.

| Export | Check on the phone (Files app) and on the PC | Result |
|---|---|---|
| PDF | opens in a PDF viewer; page count = the app's page indicator; pages in order; the handwriting matches the editor; the underline is present; dashed boxes present where expected | |
| PNG, all pages | one file per page (`…_page-01.png` …); width = the planned pixel width (in the export dialog); white paper, not black or transparent | |
| JPG, current page | one file; readable; white background | |
| Share to Files, Drive or mail | the file arrives intact | |
| Export a document whose handwriting was removed | refused with "Personal handwriting unavailable"; no file written | |

Record each file's size and page count.

## 7. Timings and memory (measured only)

* **Timings:** tuner → Device validation, then **Log timings**. Read it
  from `adb logcat -s ReactNativeJS`, line `[HandWrite validation]`.
  Recorded labels:
  * `decode photo (native)`, `analyse sample`, `build profile`,
    `save profile version`;
  * `paginate`, `render handwriting`, `render personal handwriting`,
    `render thumbnail`, `group ink`;
  * `export pdf page`, `export png page`, `export jpg page`.

  Tap **Reset** before each scenario, so each log covers one scenario.
* **Memory:** run `adb shell dumpsys meminfo com.handwrite` before,
  during and after a photo analysis and an export. Record TOTAL PSS. Also
  use the Android Studio profiler (Memory) if available. These are
  measured values; the in-code estimates (about 45 MB of JS per sample,
  a 24 MB page bitmap cap) stay labelled **estimated**.
* **Stability:** note any crash, ANR or out-of-memory, with steps, plus
  `adb logcat` around it. Logs must not contain image data; the app logs
  none.

## 8. Afterwards

* `VALIDATION_BUILD = false`, and `validationGuard.test.js` passes.
* Uninstall the validation build from the phone, or install a normal
  build over it.
* Keep `real-samples/` local. Publish only aggregated results, as
  "measured on <device>", for this one writer and sample set.
