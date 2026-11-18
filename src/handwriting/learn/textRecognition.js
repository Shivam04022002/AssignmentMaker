/**
 * Text recognition (OCR) — the seam in front of alignment, NOT an engine.
 *
 * The Lang4 pipeline learns letters only from writing it can match to known
 * text (alignSample.js): every photo's text is the page the type prescribes
 * for it, copied by hand. Reading the text from the photo itself needs an
 * on-device recogniser for handwritten English and Hindi, and no engine
 * that is open, offline and verified on handwriting has been approved yet
 * (see visual-reports/lang4/phase24/OCR_STATUS.md).
 *
 * Until one is, this module reports 'unavailable' and the wizard says so:
 * nothing here guesses text, and nothing falls back to another handwriting.
 * A future recogniser registers itself with setTextRecognizer(); its result
 * would only ever be a *candidate* text that alignment must still confirm
 * against the ink, word by word, before any letter is learned from it.
 *
 *   recognizeText(raster, { scripts }) →
 *     { status: 'unavailable' }
 *   | { status: 'recognized', lines: [{ text, confidence }], engine }
 *   | { status: 'failed', message }
 */
let recognizer = null;

/** Registers (or, with null, removes) the on-device recogniser. Tests and a future native module use this. */
export function setTextRecognizer(next) {
  recognizer = next && typeof next.recognize === 'function' ? next : null;
}

/** Whether this build can read text from a photo at all. False until an engine is approved and bundled. */
export function isTextRecognitionAvailable() {
  return !!recognizer;
}

/** The engine's name for the review screen, or null. */
export function textRecognitionEngine() {
  return recognizer && typeof recognizer.name === 'string' ? recognizer.name : null;
}

export async function recognizeText(raster, options = {}) {
  if (!recognizer) return { status: 'unavailable' };
  try {
    const result = await recognizer.recognize(raster, options);
    if (!result || !Array.isArray(result.lines)) return { status: 'failed', message: 'The recogniser returned no text.' };
    const lines = result.lines
      .filter(l => l && typeof l.text === 'string' && l.text.trim())
      .map(l => ({ text: l.text, confidence: Number.isFinite(l.confidence) ? Math.max(0, Math.min(1, l.confidence)) : 0 }));
    return { status: 'recognized', lines, engine: textRecognitionEngine() };
  } catch (error) {
    return { status: 'failed', message: error && error.message ? error.message : String(error) };
  }
}
