/* eslint-env node */
/**
 * Photo conditions applied to a REAL page for the Phase 14 protocol: the
 * handwriting stays real, the condition is simulated, and each returns
 * toOriginal(x, y) so hand-annotated truth still applies. Lighting, a hard
 * shadow, skew, perspective on a desk and smaller writing; the reference
 * pages are already ruled.
 */
import { rotateGray } from '../../src/handwriting/learn/preprocess';
import { applyHomography, homographyFrom } from '../../src/handwriting/learn/homography';
import { makeRaster } from '../../src/handwriting/learn/raster';
import { cameraCorners, downscale, onDesk } from './photoConditions';

const identity = (x, y) => [x, y];
const pixels = (r, f) => {
  const d = new Uint8Array(r.data.length);
  for (let i = 0; i < d.length; i++) d[i] = Math.max(0, Math.min(255, Math.round(f(r.data[i], i % r.width, Math.floor(i / r.width)))));
  return makeRaster(r.width, r.height, d);
};
const rotated = (r, deg) => {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const cx = r.width / 2;
  const cy = r.height / 2;
  // rotateGray samples the source at R·(x − centre): the same map takes a photo point to the original.
  return {
    raster: makeRaster(r.width, r.height, rotateGray(r.data, r.width, r.height, deg)),
    toOriginal: (x, y) => [(x - cx) * c + (y - cy) * s + cx, -(x - cx) * s + (y - cy) * c + cy],
  };
};
const smaller = (r, f) => ({ raster: downscale(r, f).raster, toOriginal: (x, y) => [x / f, y / f] });

export const REAL_CONDITIONS = {
  clean: r => ({ raster: r, toOriginal: identity }),
  'uneven light': r => ({ raster: pixels(r, (v, x) => v * (1 - 0.45 * (x / r.width))), toOriginal: identity }),
  'dim, low contrast': r => ({ raster: pixels(r, v => 70 + v * 0.5), toOriginal: identity }),
  'hard shadow band': r => ({ raster: pixels(r, (v, x, y) => (Math.abs(x - y * 1.1 - 120) < 140 ? v * 0.55 : v)), toOriginal: identity }),
  'skew 4°': r => rotated(r, 4),
  'skew −7°': r => rotated(r, -7),
  'perspective on a desk': r => {
    // A landscape photo of a landscape page, a portrait photo of a portrait one.
    const photo = r.width >= r.height ? { width: 1600, height: 1200 } : { width: 1200, height: 1600 };
    const corners = cameraCorners(r.width, r.height, { ...photo, tiltX: 25, roll: 3, fill: 0.62 });
    const toPage = homographyFrom(corners, [
      [0, 0],
      [r.width, 0],
      [r.width, r.height],
      [0, r.height],
    ]);
    return { raster: onDesk(r, { ...photo, corners, light: 0.25 }).raster, toOriginal: (x, y) => applyHomography(toPage, x, y) };
  },
  'writing ×0.75': r => smaller(r, 0.75),
  'writing ×0.6': r => smaller(r, 0.6),
};
