/**
 * Image input for handwriting samples — the boundary to the in-repo native
 * module `HandWriteSamples` (modules/handwrite-samples: Kotlin on Android,
 * Objective-C on iOS).
 *
 * Where the module is missing (a build without it, or tests), this
 * interface says so: pickSampleImage() resolves { status: 'unavailable' }.
 * It never returns a made-up image. Tests plug in through setImageInput(),
 * like the exporter's setNativeExporter().
 *
 * Native contract:
 *   pickImage() → Promise<null | { uri, mime, width, height, bytes,
 *                 orientation }>   null = the user closed the picker
 *   decodeForAnalysis(uri, maxLongEdge) → Promise<{ width, height,
 *                 encoding: 'gray8-base64', data, sourceWidth, sourceHeight,
 *                 orientation, orientationApplied, decodeMillis }>
 *   releaseImage(uri) → Promise<boolean>   only the module's own copies;
 *                 safe to call more than once
 *   clearTemporaryImages() → Promise<number>
 *   Rejection codes: picker-busy, permission-denied, unreadable,
 *   unsupported-format, out-of-memory, temp-file, unknown.
 *
 * Temporary files: the module copies the chosen photo into the app's own
 * cache and returns that copy's uri. The copy lives until releaseImage()
 * (or the system clears the cache); the user's original photo in their
 * library is never modified or deleted. Callers must not keep a uri after
 * releasing it, and must not assume a uri survives an app restart.
 */
import { NativeModules } from 'react-native';
import { ANALYSIS_LONG_EDGE, rasterFromNative } from './raster';

let override = null;

/** Replace the native image input (tests; or a module under development). */
export function setImageInput(next) {
  override = next;
}

export function getImageInput() {
  return override || NativeModules.HandWriteSamples || null;
}

export function isImageInputAvailable() {
  const input = getImageInput();
  return !!(input && typeof input.pickImage === 'function');
}

/** Why picking failed, in words the wizard can show. */
const ERROR_MESSAGES = {
  'permission-denied': {
    message: 'HandWrite was not allowed to open your photos.',
    advice: 'Allow photo access for HandWrite in your phone settings, then try again.',
  },
  'unreadable': {
    message: 'That image could not be opened.',
    advice: 'Try a different photo, or take the picture again.',
  },
  'unsupported-format': {
    message: 'This image format cannot be opened on this phone.',
    advice: 'Choose a JPEG or PNG photo instead.',
  },
  'out-of-memory': {
    message: 'This photo is too large to check on this phone.',
    advice: 'Close other apps and try again, or use a smaller photo.',
  },
  'temp-file': {
    message: 'The photo could not be prepared for checking.',
    advice: 'Free some storage space and try again.',
  },
  'picker-busy': {
    message: 'A photo is already being chosen.',
    advice: 'Finish choosing that photo first.',
  },
  'invalid-pixels': {
    message: 'The photo’s pixels could not be read.',
    advice: 'Try again, or choose a different photo.',
  },
  'unknown': {
    message: 'Something went wrong while choosing the image.',
    advice: 'Try again.',
  },
};

const errorFor = error => {
  const code = error && ERROR_MESSAGES[error.code] ? error.code : 'unknown';
  return { status: 'error', code, ...ERROR_MESSAGES[code] };
};

/**
 * Asks the user for one image.
 * Resolves (never rejects):
 *   { status: 'picked', image: { uri, mime, width, height, bytes, orientation? } }
 *   { status: 'cancelled' }
 *   { status: 'unavailable' }           no image input on this build
 *   { status: 'error', code, message, advice }
 */
export async function pickSampleImage() {
  const input = getImageInput();
  if (!input || typeof input.pickImage !== 'function') return { status: 'unavailable' };
  try {
    const result = await input.pickImage();
    if (!result) return { status: 'cancelled' };
    const image = {
      uri: result.uri,
      mime: typeof result.mime === 'string' ? result.mime.toLowerCase() : result.mime,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      ...(result.orientation !== undefined ? { orientation: result.orientation } : null),
    };
    return { status: 'picked', image };
  } catch (error) {
    return errorFor(error);
  }
}

/** Whether this build can decode sample pixels for analysis. */
export function isAnalysisAvailable() {
  const input = getImageInput();
  return !!(input && typeof input.decodeForAnalysis === 'function');
}

/**
 * Decodes a picked sample (its temporary copy) for analysis: orientation
 * corrected, long edge ≤ maxLongEdge, 8-bit grayscale (raster.js).
 * Resolves (never rejects):
 *   { status: 'decoded', raster, info: { sourceWidth, sourceHeight,
 *     orientation, decodeMillis, transferBytes } }
 *   { status: 'unavailable' } | { status: 'error', code, message, advice }
 */
export async function decodeSampleImage(uri, maxLongEdge = ANALYSIS_LONG_EDGE) {
  const input = getImageInput();
  if (!input || typeof input.decodeForAnalysis !== 'function') return { status: 'unavailable' };
  try {
    const result = await input.decodeForAnalysis(uri, maxLongEdge);
    const { raster, errors } = rasterFromNative(result);
    if (!raster) return { ...errorFor({ code: 'invalid-pixels' }), details: errors };
    return {
      status: 'decoded',
      raster,
      info: {
        sourceWidth: result.sourceWidth,
        sourceHeight: result.sourceHeight,
        orientation: result.orientation,
        decodeMillis: result.decodeMillis,
        transferBytes: typeof result.data === 'string' ? result.data.length : 0,
      },
    };
  } catch (error) {
    return errorFor(error);
  }
}

/** Deletes every temporary sample copy (e.g. left by an interrupted session). */
export async function clearTemporaryImages() {
  const input = getImageInput();
  if (!input || typeof input.clearTemporaryImages !== 'function') return 0;
  try {
    return await input.clearTemporaryImages();
  } catch (e) {
    return 0;
  }
}

/** Releases temporary copies (best effort; failures are not fatal). */
export async function releaseImages(uris) {
  const input = getImageInput();
  const list = (uris || []).filter(u => typeof u === 'string' && u);
  if (!list.length || !input || typeof input.releaseImage !== 'function') return 0;
  let released = 0;
  for (const uri of list) {
    try {
      await input.releaseImage(uri);
      released++;
    } catch (e) {
      // A temp copy the system already cleared: nothing left to release.
    }
  }
  return released;
}
