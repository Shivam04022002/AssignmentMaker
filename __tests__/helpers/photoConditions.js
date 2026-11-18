/* eslint-env node */
/**
 * SYNTHETIC photo conditions applied to a synthetic page (not real photos):
 * the distortions real phone photos add, each with the mapping of the
 * page's ground-truth x positions so results stay measurable.
 *
 *   keystone(raster, k)   perspective seen from below the page: row y is
 *                         scaled horizontally about the centre by
 *                         1 + k · (y / h − ½) (top narrower for k > 0)
 *   downscale(raster, f)  a lower-resolution photo (box average, factor f < 1)
 *   sideways(raster)      a photo turned 90° with no orientation tag
 *   upsideDown(raster)    a photo turned 180°
 *   onDesk(raster, o)     the page photographed with perspective on a
 *                         cluttered desk (returns toPhoto instead of mapX)
 *   cameraCorners(...)    where a pinhole camera sees the page's corners
 *
 * Each returns { raster, mapX(x, y) } — where a truth x at row y lands.
 */
import { applyHomography, homographyFrom } from '../../src/handwriting/learn/homography';
import { makeRaster } from '../../src/handwriting/learn/raster';
import { rng } from './syntheticRaster';

export function keystone(raster, k) {
  const { width: w, height: h, data } = raster;
  const out = new Uint8Array(w * h).fill(255);
  const cx = w / 2;
  const scale = y => 1 + k * (y / h - 0.5);
  for (let y = 0; y < h; y++) {
    const s = scale(y);
    for (let x = 0; x < w; x++) {
      const sx = Math.round(cx + (x - cx) / s);
      out[y * w + x] = sx >= 0 && sx < w ? data[y * w + sx] : 240;
    }
  }
  return { raster: makeRaster(w, h, out), mapX: (x, y) => cx + (x - cx) * scale(y) };
}

export function downscale(raster, f) {
  const { width: w, height: h, data } = raster;
  const W = Math.max(1, Math.round(w * f));
  const H = Math.max(1, Math.round(h * f));
  const out = new Uint8Array(W * H);
  for (let Y = 0; Y < H; Y++) {
    for (let X = 0; X < W; X++) {
      const x0 = Math.floor(X / f);
      const y0 = Math.floor(Y / f);
      const x1 = Math.min(w, Math.floor((X + 1) / f));
      const y1 = Math.min(h, Math.floor((Y + 1) / f));
      let sum = 0;
      let n = 0;
      for (let y = y0; y < Math.max(y1, y0 + 1); y++) for (let x = x0; x < Math.max(x1, x0 + 1); x++) {
        sum += data[y * w + x];
        n++;
      }
      out[Y * W + X] = Math.round(sum / n);
    }
  }
  return { raster: makeRaster(W, H, out), mapX: x => x * f };
}

export function sideways(raster) {
  const { width: w, height: h, data } = raster;
  const out = new Uint8Array(w * h);
  // 90° clockwise: new width h, new height w.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[x * h + (h - 1 - y)] = data[y * w + x];
  return { raster: makeRaster(h, w, out), mapX: null };
}

export function upsideDown(raster) {
  const { width: w, height: h, data } = raster;
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[w * h - 1 - i] = data[i];
  return { raster: makeRaster(w, h, out), mapX: null };
}

/**
 * Where a pinhole camera (optical centre at the photo's centre, focal
 * length `focal` px) sees the corners of a pw × ph page tilted by `tiltX`
 * (top away from the camera), `tiltY` and `roll` degrees, at a distance
 * that makes the page about `fill` of the photo's width. TL, TR, BR, BL —
 * for onDesk's `corners`; the true page proportions stay recoverable.
 */
export function cameraCorners(pw, ph, { width = 1600, height = 1200, focal = 0.75 * Math.max(width, height), tiltX = 20, tiltY = 0, roll = 0, fill = 0.7, shiftX = 0, shiftY = 0 } = {}) {
  const rad = Math.PI / 180;
  const [a, b, c] = [tiltX * rad, tiltY * rad, roll * rad];
  const rot = ([x, y, z]) => {
    // x-axis tilt, then y-axis, then roll about the optical axis.
    let [X, Y, Z] = [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
    [X, Z] = [X * Math.cos(b) + Z * Math.sin(b), -X * Math.sin(b) + Z * Math.cos(b)];
    return [X * Math.cos(c) - Y * Math.sin(c), X * Math.sin(c) + Y * Math.cos(c), Z];
  };
  const distance = (focal * pw) / (fill * width);
  return [
    [0, 0],
    [pw, 0],
    [pw, ph],
    [0, ph],
  ].map(([u, v]) => {
    const [X, Y, Z] = rot([u - pw / 2, v - ph / 2, 0]);
    const z = Z + distance;
    return [width / 2 + shiftX + (focal * X) / z, height / 2 + shiftY + (focal * Y) / z];
  });
}

/**
 * The page photographed on a cluttered desk (SYNTHETIC): the page raster is
 * placed with perspective so that its corners land on `corners` (TL, TR,
 * BR, BL in photo pixels) of a `width` × `height` photo. Around it: a wood
 * desk (grain stripes, level `desk`), a dark book along the top, keys on
 * the desk (or overlapping the page edge with `keysOnPage`) and, with
 * `lap`, a dark band along the bottom (clothes). `light`: brightness falls
 * off by this share from left to right over the whole photo. `sheet`: the
 * corners of a second, blank sheet lying under the page (the page outline
 * is then no longer a simple four-sided shape).
 *
 * Returns { raster, toPhoto([x, y]) — page point → photo point }.
 */
export function onDesk(page, o = {}) {
  const {
    width = 1600,
    height = 1200,
    corners = [
      [260, 190],
      [1390, 150],
      [1460, 1050],
      [180, 1010],
    ],
    desk = 175,
    seed = 5,
    book = true,
    keys = true,
    keysOnPage = false,
    lap = false,
    light = 0,
    sheet = null,
  } = o;
  const { width: pw, height: ph, data } = page;
  const inside = (q, x, y) => q.every((a, i) => {
    const b = q[(i + 1) % 4];
    return (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) >= 0;
  });
  const rect = [
    [0, 0],
    [pw, 0],
    [pw, ph],
    [0, ph],
  ];
  const toPage = homographyFrom(corners, rect);
  const toPhotoH = homographyFrom(rect, corners);
  const g = rng(seed);
  const grain = Array.from({ length: 6 }, () => [0.004 + 0.02 * g(), 2 * Math.PI * g(), 2 + 3 * g()]);
  const out = new Uint8Array(width * height);
  const keyRings = keys ? [[keysOnPage ? corners[1][0] - 10 : width - 90, keysOnPage ? corners[1][1] + 60 : 120, 34]] : [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const lit = 1 - light * (x / width);
      const [u, v] = applyHomography(toPage, x + 0.5, y + 0.5);
      let val;
      if (u >= 0.5 && v >= 0.5 && u < pw - 0.5 && v < ph - 0.5) {
        const fx = u - 0.5;
        const fy = v - 0.5;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const ax = fx - x0;
        const ay = fy - y0;
        const i = y0 * pw + x0;
        const x1 = Math.min(pw - 1, x0 + 1) - x0;
        const y1 = Math.min(ph - 1, y0 + 1) - y0;
        val = (data[i] * (1 - ax) + data[i + x1] * ax) * (1 - ay) + (data[i + y1 * pw] * (1 - ax) + data[i + y1 * pw + x1] * ax) * ay;
      } else {
        val = desk;
        for (const [f, p, a] of grain) val += a * Math.sin(f * (y + 0.15 * x) + p);
        if (book && y < 70 && x > 120 && x < width - 220) val = 55;
        if (lap && y > height - 110) val = 30;
        if (sheet && inside(sheet, x + 0.5, y + 0.5)) val = 230;
      }
      for (const [kx, ky, kr] of keyRings) {
        const d = Math.hypot(x - kx, y - ky);
        if (Math.abs(d - kr) < 4 || (x > kx - 4 && x < kx + 4 && y > ky + kr && y < ky + kr + 90) || Math.hypot(x - kx, y - ky - kr - 100) < 14) val = 70;
      }
      out[y * width + x] = Math.max(0, Math.min(255, Math.round(val * lit)));
    }
  }
  return { raster: makeRaster(width, height, out), toPhoto: ([x, y]) => applyHomography(toPhotoH, x, y) };
}
