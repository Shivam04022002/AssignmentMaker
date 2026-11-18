/**
 * Image-quality measurements of a handwriting sample, from its pixels.
 *
 * Every check is computed from the raster and its preprocessing products
 * (preprocess.js) and reported as { value, threshold, pass } with its method
 * in METHODS. Thresholds live in QUALITY_THRESHOLDS (configurable). The
 * overall score is a documented combination of the checks — an engineering
 * measure, not a calibrated probability.
 */
import { histogram, median, percentile } from './raster';

export const QUALITY_THRESHOLDS = {
  minLongEdge: 800, // analysis raster (px)
  writingSizeGood: 10, // median x-height (px) for a clear sample
  writingSizeMin: 6, // below: too small to learn letter shapes
  contrastGood: 0.3,
  contrastLow: 0.25, // warning
  contrastMin: 0.1, // unusable
  paperGood: 140,
  paperDark: 110, // warning
  paperMin: 60, // unusable
  blownOut: 0.5, // share of pixels ≥ 252 that, with low contrast, means overexposed
  unevenLight: 0.4, // (p95 − p5) / p95 of the paper level
  coverageMin: 0.0008, // writing ink / page: below = almost nothing written
  coverageLow: 0.003,
  coverageHigh: 0.25, // above: shadows or dark background read as ink
  noiseGood: 6, // σ (gray levels) on the paper
  noiseHigh: 12,
  skewGood: 2, // degrees
  skewHigh: 4,
  edgeWidthGood: 3, // px; sharp writing has narrow edges
  edgeWidthBlurry: 4.5,
  minStrokeForSharpness: 2.5, // px; thinner strokes make the edge estimate unreliable
  regionGood: 0.5,
};

export const METHODS = {
  pixels: 'raster validation: integer size, one byte per pixel, length = width × height',
  resolution: 'long edge of the decoded analysis raster',
  writingSize: 'median x-height of the detected text lines (rows carrying at least half the typical ink row)',
  contrast: '(paper − ink) / paper; paper = median gray of non-ink pixels, ink = median gray of detected ink pixels',
  exposure: 'median paper gray (0–255); share of pixels at ≥ 252',
  lighting: 'spread of the paper level across the page: (p95 − p5) / p95 of the 90th-percentile block grid, leaving out blocks covered by objects removed as background around the page',
  inkCoverage: 'writing ink pixels (after removing specks, page-edge artefacts and paper rules) / all pixels',
  noise: "Immerkær's estimator σ = √(π/2) · mean|L| / 6 over paper pixels away from ink (L = 3 × 3 noise-difference kernel)",
  skew: 'projection-profile sharpness over −8…8° (0.05° refinement)',
  sharpness: 'median edge width = (paper − ink) / max central-difference gradient near ink boundary pixels; skipped when strokes are too thin to measure',
  writingRegion: 'segmentation region score (line separation, page-edge ink)',
  page: 'page outline in the photo (pageDetection.js): regions between brightness steps; the brightest large one fitted with a quadrilateral whose sides must be sharp steps; rectified when all four sides are found, rejected when a page with background around it cannot be fitted',
  orientation: 'nearest-neighbour links between ink pieces (orientation.js): lines run across when most link weight is horizontal, sideways when most is vertical; upside down only when the half-turned writing aligns with the known text clearly better',
};

/** The quality issue for a sideways or upside-down sample (never turned automatically), or null. */
export function orientationIssue(orientation) {
  if (!orientation) return null;
  const retake = 'or retake the photo holding the phone the same way up as the page.';
  if (orientation.status === 'upside-down') {
    return { code: 'upside-down', message: 'The writing is upside down in this photo.', advice: `Turn the photo half a turn (180°) so the writing reads the right way up, ${retake}` };
  }
  if (orientation.status !== 'sideways') return null;
  const how =
    orientation.turn === 'clockwise'
      ? 'Turn the photo a quarter turn clockwise (to the right) so the lines run left to right, '
      : orientation.turn === 'anticlockwise'
        ? 'Turn the photo a quarter turn anticlockwise (to the left) so the lines run left to right, '
        : 'Turn the photo a quarter turn so the lines of writing run left to right and read the right way up, ';
  return { code: 'sideways', message: 'The lines of writing run up and down in this photo: it is turned on its side.', advice: how + retake };
}

const ramp = (v, bad, good) => Math.max(0, Math.min(1, (v - bad) / (good - bad)));
const round = (v, d = 3) => (v === null || v === undefined ? v : Math.round(v * 10 ** d) / 10 ** d);

/** Ink grown by `r` pixels in every direction (separable distance test). */
export function dilate(mask, w, h, r) {
  const across = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let last = -1e9;
    for (let x = 0; x < w; x++) {
      if (mask[row + x]) last = x;
      if (x - last <= r) across[row + x] = 1;
    }
    let next = 1e9;
    for (let x = w - 1; x >= 0; x--) {
      if (mask[row + x]) next = x;
      if (next - x <= r) across[row + x] = 1;
    }
  }
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    let last = -1e9;
    for (let y = 0; y < h; y++) {
      if (across[y * w + x]) last = y;
      if (y - last <= r) out[y * w + x] = 1;
    }
    let next = 1e9;
    for (let y = h - 1; y >= 0; y--) {
      if (across[y * w + x]) next = y;
      if (next - y <= r) out[y * w + x] = 1;
    }
  }
  return out;
}

/** Immerkær noise σ over paper pixels at least 3 px away from ink. */
export function noiseSigma(r, ink) {
  const { width: w, height: h, data } = r;
  const near = dilate(ink, w, h, 2);
  let sum = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (near[i]) continue;
      const L =
        data[i - w - 1] - 2 * data[i - w] + data[i - w + 1] - 2 * data[i - 1] + 4 * data[i] - 2 * data[i + 1] + data[i + w - 1] - 2 * data[i + w] + data[i + w + 1];
      sum += L < 0 ? -L : L;
      n++;
    }
  }
  return n > 100 ? (Math.sqrt(Math.PI / 2) * sum) / n / 6 : null;
}

/**
 * Edge width at ink boundaries (px) and a stroke-width estimate
 * (2 · ink area / boundary length). Returns { edgeWidth, strokeWidth,
 * samples } — edgeWidth null when it cannot be measured reliably.
 */
export function edgeSharpness(r, mask, paper, ink, minStroke = QUALITY_THRESHOLDS.minStrokeForSharpness) {
  const { width: w, height: h, data } = r;
  let area = 0;
  let boundary = 0;
  const widths = [];
  const contrast = paper - ink;
  const stride = 3;
  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    for (let x = 1; x < w - 1; x++) {
      const i = row + x;
      if (!mask[i]) continue;
      area++;
      if (mask[i - 1] && mask[i + 1] && mask[i - w] && mask[i + w]) continue;
      boundary++;
      if (boundary % stride || contrast < 20 || y < 2 || y > h - 3 || x < 2 || x > w - 3) continue;
      let g = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const j = i + dy * w + dx;
          const gx = (data[j + 1] - data[j - 1]) / 2;
          const gy = (data[j + w] - data[j - w]) / 2;
          const m = Math.sqrt(gx * gx + gy * gy);
          if (m > g) g = m;
        }
      }
      if (g > 0) widths.push(contrast / g);
    }
  }
  const strokeWidth = boundary ? (2 * area) / boundary : null;
  if (!widths.length || strokeWidth === null || strokeWidth < minStroke) {
    return { edgeWidth: null, strokeWidth, samples: widths.length };
  }
  return { edgeWidth: median(widths), strokeWidth, samples: widths.length };
}

/**
 * Quality of one sample. Inputs come from analyzeSample(): the raster, the
 * background grid, the raw ink mask, the writing mask (specks, edges and
 * rules removed), the skew estimate and the segmentation.
 * Returns a contracts.validateQualityResult-shaped object plus `metrics`
 * (raw values and methods) and `severity` on each issue.
 */
export function assessQuality({ slot, raster, background, rawInk, writingInk, skew, segmentation, aroundMask = null, page = null, orientation = null, thresholds = QUALITY_THRESHOLDS }) {
  const T = thresholds;
  const { width: w, height: h, data } = raster;
  const N = w * h;
  const issues = [];
  const issue = (code, severity, message, advice) => issues.push({ code, severity, message, advice });

  // Paper and ink levels from the original gray values.
  const paperHist = histogram(data, rawInk, 0);
  const inkHist = histogram(data, writingInk, 1);
  const paper = percentile(paperHist, 0.5);
  const ink = percentile(inkHist, 0.5);
  let writingPixels = 0;
  for (let i = 0; i < N; i++) writingPixels += writingInk[i];
  const coverage = writingPixels / N;
  const contrast = paper && ink !== null ? (paper - ink) / paper : 0;
  let blown = 0;
  for (let i = 0; i < N; i++) if (data[i] >= 252) blown++;
  const blownShare = blown / N;
  // Lighting over the whole frame, except the blocks covered by objects
  // around the page that were removed as background (a dark desk edge is
  // not uneven light on the page). Without such objects: every block.
  let cells = Array.from(background.grid);
  if (aroundMask && background.gw) {
    const b = background.block;
    const covered = new Uint8Array(background.gw * background.gh);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (aroundMask[y * w + x]) covered[Math.floor(y / b) * background.gw + Math.floor(x / b)] = 1;
      }
    }
    const kept = cells.filter((_, k) => !covered[k]);
    if (kept.length >= 4) cells = kept;
  }
  const grid = cells.sort((a, b) => a - b);
  const p95 = grid[Math.floor(0.95 * (grid.length - 1))];
  const p5 = grid[Math.floor(0.05 * (grid.length - 1))];
  const unevenness = p95 > 0 ? (p95 - p5) / p95 : 0;
  const noise = noiseSigma(raster, rawInk);
  const sharp = edgeSharpness(raster, writingInk, paper || 255, ink === null ? 0 : ink);
  const xHeight = segmentation.diagnostics.medianXHeight;
  const regionScore = segmentation.region ? segmentation.region.confidence.score : 0;
  const lines = segmentation.lines.length;

  const checks = {
    resolution: { value: Math.max(w, h), threshold: T.minLongEdge, pass: Math.max(w, h) >= T.minLongEdge },
    contrast: { value: round(contrast), threshold: T.contrastGood, pass: contrast >= T.contrastGood },
    exposure: { value: paper === null ? 0 : paper, threshold: T.paperGood, pass: paper !== null && paper >= T.paperGood },
    lighting: { value: round(unevenness), threshold: T.unevenLight, pass: unevenness <= T.unevenLight },
    inkCoverage: { value: round(coverage, 5), threshold: T.coverageLow, pass: coverage >= T.coverageLow && coverage <= T.coverageHigh },
    skew: { value: round(Math.abs(skew.angle), 2), threshold: T.skewGood, pass: Math.abs(skew.angle) <= T.skewGood },
    writingRegion: { value: round(regionScore), threshold: T.regionGood, pass: regionScore >= T.regionGood },
  };
  if (xHeight !== null) checks.writingSize = { value: xHeight, threshold: T.writingSizeGood, pass: xHeight >= T.writingSizeGood };
  if (noise !== null) checks.noise = { value: round(noise, 2), threshold: T.noiseGood, pass: noise <= T.noiseGood };
  if (sharp.edgeWidth !== null) checks.sharpness = { value: round(sharp.edgeWidth, 2), threshold: T.edgeWidthGood, pass: sharp.edgeWidth <= T.edgeWidthGood };

  // Issues, worst first.
  if (!lines || coverage < T.coverageMin) {
    issue('too-little-writing', 'error', 'No handwriting could be found in this photo.', 'Photograph the written page so the writing fills most of the picture.');
  } else if (coverage < T.coverageLow) {
    issue('too-little-writing', 'warning', 'Very little writing was found in this photo.', 'Make sure the whole sample is in the picture, close enough to read.');
  }
  if (paper !== null && paper < T.paperMin) issue('too-dark', 'error', 'The photo is too dark to see the writing.', 'Take the photo in daylight or under a bright lamp.');
  else if (paper !== null && paper < T.paperDark) issue('too-dark', 'warning', 'The photo is quite dark.', 'More light will make the writing clearer.');
  const found = lines > 0;
  if (found && contrast < T.contrastMin) issue('low-contrast', 'error', 'The writing barely stands out from the paper.', 'Use a darker pen, or photograph in better light.');
  else if (found && contrast < T.contrastLow) issue('low-contrast', 'warning', 'The writing is faint compared with the paper.', 'A darker pen or brighter, even light will help.');
  if (blownShare > T.blownOut && contrast < T.contrastGood) issue('overexposed', 'warning', 'The photo is washed out (too bright).', 'Avoid direct sunlight or flash on the page.');
  if (unevenness > T.unevenLight) issue('uneven-lighting', 'warning', 'The lighting is uneven across the page.', 'Avoid shadows from your hand or phone; light the page evenly.');
  if (coverage > T.coverageHigh) issue('shadows', 'warning', 'Large dark areas were found that are probably not writing.', 'Crop to the page and avoid shadows or a dark background.');
  if (noise !== null && noise > T.noiseHigh) issue('noisy', 'warning', 'The photo is grainy.', 'Use more light so the camera does not need to brighten the picture.');
  if (Math.abs(skew.angle) > T.skewHigh) {
    // On a page cut out of the photo the sheet is already square: what slopes is the writing.
    if (page && page.status === 'page') issue('rotated', 'warning', `The lines of writing slope by about ${Math.abs(skew.angle).toFixed(1)}° on the page. They were straightened for analysis.`, 'Writing along the lines of the page gives the clearest letters.');
    else issue('rotated', 'warning', `The page is tilted by about ${Math.abs(skew.angle).toFixed(1)}°. It was straightened for analysis.`, 'Hold the phone square to the page for the best result.');
  }
  if (sharp.edgeWidth !== null && sharp.edgeWidth > T.edgeWidthBlurry) issue('blurry', 'warning', 'The writing looks blurry.', 'Hold the phone steady and tap to focus on the writing.');
  if (xHeight !== null && xHeight < T.writingSizeMin) issue('too-small', 'error', 'The writing is too small in the photo to see letter shapes.', 'Move closer so the writing fills the picture.');
  else if (xHeight !== null && xHeight < T.writingSizeGood) issue('too-small', 'warning', 'The writing is small in the photo.', 'Move a little closer for more detail.');
  if (Math.max(w, h) < T.minLongEdge) issue('too-small', 'error', 'The image is too small to analyse.', 'Use the original camera photo.');
  // The page and the writing's direction (pageDetection.js, orientation.js).
  if (page && page.status === 'unclear') {
    issue('page-unclear', 'error', 'The edges of the page could not be found clearly in this photo.', 'Lay the page flat on a plain, darker surface and photograph it from straight above with all four corners in the picture, or move closer so the page fills the whole photo.');
  }
  const turnIssue = orientationIssue(orientation);
  if (turnIssue) issue(turnIssue.code, 'error', turnIssue.message, turnIssue.advice);

  // Overall: geometric mean of per-check scores (each 0–1 on a linear ramp).
  const parts = {
    contrast: ramp(contrast, T.contrastMin, T.contrastGood),
    exposure: paper === null ? 0 : ramp(paper, T.paperMin, T.paperGood),
    coverage: coverage > T.coverageHigh ? ramp(0.5 - coverage, 0, 0.5 - T.coverageHigh) : ramp(coverage, T.coverageMin, T.coverageLow),
    writingRegion: regionScore,
    // σ ≤ noiseGood → 1, σ ≥ 2 × noiseHigh → 0.
    ...(noise !== null ? { noise: ramp(2 * T.noiseHigh - noise, 0, 2 * T.noiseHigh - T.noiseGood) } : null),
    ...(sharp.edgeWidth !== null ? { sharpness: ramp(T.edgeWidthBlurry * 1.5 - sharp.edgeWidth, 0, T.edgeWidthBlurry * 1.5 - T.edgeWidthGood) } : null),
    ...(xHeight !== null ? { writingSize: ramp(xHeight, T.writingSizeMin / 2, T.writingSizeGood) } : null),
  };
  const values = Object.values(parts);
  const overall = values.some(v => v === 0) ? 0 : Math.exp(values.reduce((a, v) => a + Math.log(v), 0) / values.length);

  return {
    slot,
    checks,
    issues: issues.map(({ code, message, advice, severity }) => ({ code, message, advice, severity })),
    usable: !issues.some(i => i.severity === 'error'),
    score: {
      score: round(overall),
      basis: 'geometric mean of linear ramps of contrast, exposure, ink coverage, writing-region score, noise, sharpness and writing size (each 0–1; not a calibrated probability)',
      inputs: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, round(v)])),
    },
    metrics: {
      paperLevel: paper,
      inkLevel: ink,
      contrast: round(contrast),
      blownShare: round(blownShare),
      unevenness: round(unevenness),
      coverage: round(coverage, 5),
      noiseSigma: round(noise, 2),
      edgeWidth: round(sharp.edgeWidth, 2),
      strokeWidth: round(sharp.strokeWidth, 2),
      sharpnessNote: sharp.edgeWidth === null ? 'Sharpness not estimated: strokes too thin or too few edges to measure reliably at this resolution.' : null,
      skewDeg: skew.angle,
      skewConfidence: round(skew.confidence),
      medianXHeight: xHeight,
      lines,
      methods: METHODS,
    },
  };
}

export { median };
