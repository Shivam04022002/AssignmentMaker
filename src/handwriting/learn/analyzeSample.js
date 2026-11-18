/**
 * Analysis of one handwriting sample raster: the page outline (a photo of
 * a sheet on a desk is cut out and its perspective removed; an outline that
 * cannot be fitted reliably rejects the sample — pageDetection.js),
 * preprocessing, rule detection,
 * initial segmentation, image quality and — when the sample's text is known
 * (prompt or transcription) — transcription-guided unit alignment
 * (alignSample.js) and, on request (`extract`), glyph geometry from the
 * reliably aligned units (glyphExtraction.js). No character recognition.
 *
 * Stages run one after another and yield between them, so the UI stays
 * responsive and a cancelled analysis stops at the next stage boundary.
 * Returns
 *   { status: 'done', quality, page, orientation, segmentation: { region,
 *     lines, words, uncertain, diagnostics }, rules, skew, timings,
 *     representations? }
 * When the page was rectified (page.status 'page'), every position in the
 * result is in the rectified page's pixels; page.homography maps them back
 * to the photo. The writing's orientation is checked, never corrected: a
 * sideways or upside-down sample gets a quality error with advice on how to
 * turn the photo (orientation.js).
 *   { status: 'cancelled' } | { status: 'failed', error }
 * `representations` (normalised raster, masks) only with keepRepresentations
 * (diagnostics and tests); the wizard does not keep pixels. `extraction`
 * (geometry only, no pixels) only with extract — it needs the text mask,
 * which is released when this returns; `source` ({ width, height } of the
 * upright source image) lets it map glyphs back to the original photo.
 */
import { alignTranscription } from './alignSample';
import { extractGlyphs } from './glyphExtraction';
import { assessQuality, noiseSigma } from './imageQuality';
import { clearTurn, detectOrientation, ORIENTATION, turnMask } from './orientation';
import { detectPage, rectifyPage } from './pageDetection';
import { darkMask, despeckle, detectRules, dropBorderObjects, estimateSkew, inkMask, normalise, restoreInkOnRules, rotateGray, rotateMask, suppressFaintBands, suppressRules } from './preprocess';
import { backgroundGrid, validateRaster } from './raster';
import { segment } from './segmentation';

const now = () => Date.now();
const defaultYield = () => new Promise(resolve => setTimeout(resolve, 0));

/** Skew below this (degrees) is left alone. */
export const DESKEW_MIN = 0.3;

export async function analyzeSample(photo, { slot = 0, knownText = null, scripts = null, sampleId = 'unknown', revision = 0, align = true, extract = false, source = null, shouldCancel = () => false, yieldFn = defaultYield, keepRepresentations = false, onStage = null } = {}) {
  const timings = {};
  const errors = validateRaster(photo);
  if (errors.length) return { status: 'failed', error: { code: 'invalid-raster', message: errors.join('; ') } };
  let t = now();
  // Progress for the caller (the wizard's analysis screen): the name of each
  // stage as it completes. Reporting only; nothing about the analysis changes.
  const reached = name => {
    if (typeof onStage === 'function') onStage(name);
  };
  const stage = async name => {
    timings[name] = Math.round((now() - t) * 10) / 10;
    reached(name);
    await yieldFn();
    t = now();
    return shouldCancel();
  };
  try {
    // The page in the photo: rectified when its outline is reliable.
    const found = detectPage(photo);
    let raster = photo;
    let page = { status: found.status, corners: found.corners, size: null, homography: null, photo: { width: photo.width, height: photo.height }, reasons: found.reasons, metrics: found.metrics };
    if (found.status === 'page') {
      const rect = rectifyPage(photo, found);
      if (rect && !validateRaster(rect.raster).length) {
        raster = rect.raster;
        page = { ...page, size: { width: raster.width, height: raster.height }, homography: rect.homography };
      } else {
        page = { ...page, status: 'unclear', reasons: ['the page outline could not be turned into a usable straightened page'] };
      }
    }
    if (await stage('page')) return { status: 'cancelled' };
    const { width: w, height: h } = raster;

    const background = backgroundGrid(raster);
    const normalised = normalise(raster, background);
    if (await stage('normalise')) return { status: 'cancelled' };

    const rawInk = inkMask(normalised);
    const speckless = despeckle(rawInk, w, h);
    if (await stage('threshold')) return { status: 'cancelled' };

    const skew = estimateSkew(speckless.mask, w, h);
    const deskew = Math.abs(skew.angle) >= DESKEW_MIN && skew.confidence > 0.05;
    const deskewed = deskew ? rotateMask(speckless.mask, w, h, skew.angle) : speckless.mask;
    if (await stage('deskew')) return { status: 'cancelled' };

    // "Darker than paper" must stand clear of the paper's own grain: the cut
    // sits max(20, 3.5 σ) below white, σ measured on the normalised paper.
    const paperSigma = noiseSigma(normalised, rawInk) || 0;
    const darkLevel = Math.round(255 - Math.max(20, 3.5 * paperSigma));
    const dark = darkMask(normalised, darkLevel);
    const rules = detectRules(deskewed, w, h, { dark: deskew ? rotateMask(dark, w, h, skew.angle) : dark });
    const grayFrame = deskew ? rotateGray(normalised.data, w, h, skew.angle) : normalised.data;
    const cleared = suppressRules(deskewed, w, h, rules);
    // Letters standing on a rule: their feet, darker than the rule, come back.
    const feet = restoreInkOnRules(deskewed, cleared.mask, grayFrame, w, h, rules);
    const ruled = { ...cleared, mask: feet.mask };
    // Faint printed lines the rule test kept (the writing sits on them,
    // as on a notebook page): cleared where clearly lighter than the writing.
    const faint = suppressFaintBands(ruled.mask, grayFrame, w, h);
    // Objects around the page in a photo (desk, book, keys): border-touching
    // blobs far larger than writing; on a cut-out page, anything much taller
    // than the writing that crosses the sheet's edge.
    const around = dropBorderObjects(faint.mask, w, h, undefined, { pageEdges: page.status === 'page' });
    const suppressed = { ...ruled, mask: around.mask };
    if (await stage('rules')) return { status: 'cancelled' };

    const segmentation = segment(suppressed.mask, w, h, { slot, knownText, script: scripts });
    if (await stage('segment')) return { status: 'cancelled' };

    // Quality is measured against the original pixels; the writing mask is
    // taken back to the original orientation for that.
    const writingInk = deskew ? rotateMask(suppressed.mask, w, h, -skew.angle) : suppressed.mask;
    // The background objects removed above, back in the photo's orientation.
    let aroundMask = null;
    if (around.objects) {
      const removed = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) removed[i] = faint.mask[i] && !around.mask[i] ? 1 : 0;
      aroundMask = deskew ? rotateMask(removed, w, h, -skew.angle) : removed;
    }
    // Which way the lines run (never corrected; a sideways photo is rejected).
    const orientation = { ...detectOrientation(suppressed.mask, w, h), turn: null };
    const qualityNow = () => assessQuality({ slot, raster, background, rawInk, writingInk, skew, segmentation, aroundMask, page, orientation });
    let quality = qualityNow();
    timings.quality = Math.round((now() - t) * 10) / 10;
    reached('quality');

    // Transcription-guided segmentation (Phase 4), while the text mask is
    // still here; it is released with the rest when this returns.
    let alignment = null;
    if (align && knownText) {
      await yieldFn();
      if (shouldCancel()) return { status: 'cancelled' };
      t = now();
      const alignIn = (mask, mw, mh, seg, q) => alignTranscription({ mask, width: mw, height: mh, segmentation: seg, quality: q, knownText, sampleId, revision, frame: deskew ? 'deskewed' : 'original' });
      const alignedCount = a => (a && a.observations ? a.observations.units.filter(u => u.state === 'aligned').length : 0);
      // The writing turned: how many units would match the text then.
      const turned = turn => {
        const m = turnMask(suppressed.mask, w, h, turn);
        const seg = segment(m.mask, m.width, m.height, { slot, knownText, script: scripts });
        // The photo's quality with the turned lines (writing size, line
        // count) and without an orientation verdict.
        const plain = assessQuality({ slot, raster, background, rawInk, writingInk, skew, segmentation: seg, aroundMask, page, orientation: null });
        return alignedCount(alignIn(m.mask, m.width, m.height, seg, plain));
      };
      alignment = alignIn(suppressed.mask, w, h, segmentation, quality);
      const asIs = alignedCount(alignment);
      const expected = alignment && alignment.observations ? alignment.observations.units.length : 0;
      if (orientation.status === 'sideways' && expected) {
        // Which quarter turn makes it read: named in the advice when clear.
        const counts = { clockwise: turned('clockwise'), anticlockwise: turned('anticlockwise') };
        orientation.turned = counts;
        orientation.turn = clearTurn(counts);
        quality = qualityNow();
      } else if (orientation.status !== 'sideways' && expected && asIs < ORIENTATION.SKIP_TURN_CHECK * expected) {
        // Upside down? Only the known text can tell: the half-turned writing
        // must match it clearly better than the photo as it is.
        const counts = { none: asIs, half: turned('half') };
        orientation.turned = counts;
        if (clearTurn(counts) === 'half') {
          orientation.status = 'upside-down';
          orientation.turn = 'half';
          quality = qualityNow();
          // Nothing in an upside-down photo is used.
          alignment = alignIn(suppressed.mask, w, h, segmentation, quality);
        }
      }
      timings.align = Math.round((now() - t) * 10) / 10;
      reached('align');
    }

    // Glyph geometry (Phase 5) from the reliably aligned units, on request.
    let extraction = null;
    if (extract && alignment) {
      await yieldFn();
      if (shouldCancel()) return { status: 'cancelled' };
      t = now();
      extraction = extractGlyphs({ mask: suppressed.mask, width: w, height: h, alignment, segmentation, quality, skew: { angle: skew.angle, applied: deskew }, slot, source, page });
      timings.extract = Math.round((now() - t) * 10) / 10;
      reached('extract');
    }

    const { components, ...segmentationOut } = segmentation;
    return {
      status: 'done',
      quality,
      page,
      orientation,
      segmentation: segmentationOut,
      rules: {
        rules: rules.horizontal.filter(b => b.kind === 'rule').length,
        uncertain: rules.horizontal.filter(b => b.kind === 'uncertain').length + rules.vertical.filter(b => b.kind === 'uncertain').length,
        margins: rules.vertical.filter(b => b.kind === 'rule').length,
        periodic: rules.periodic,
        spacing: rules.spacing,
        removedPixels: suppressed.removedPixels,
        restoredPixels: feet.restoredPixels,
        fragments: suppressed.fragments,
        faintPixels: faint.removedPixels,
        faintBands: faint.bands.filter(b => b.cleared > 0).length,
        backgroundObjects: around.objects,
        backgroundPixels: around.removedPixels,
        darkLevel,
        bands: rules.horizontal,
      },
      skew: { ...skew, applied: deskew },
      alignment,
      ...(extract ? { extraction } : null),
      despeckle: { specks: speckless.specks, removedPixels: speckless.removedPixels },
      timings,
      ...(keepRepresentations
        ? { representations: { normalised, rawInk, cleanInk: speckless.mask, deskewed, textMask: suppressed.mask, writingInk, components } }
        : null),
    };
  } catch (error) {
    return { status: 'failed', error: { code: 'analysis-error', message: error && error.message ? error.message : String(error) } };
  }
}
