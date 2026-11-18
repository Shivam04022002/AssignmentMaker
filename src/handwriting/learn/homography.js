/**
 * Plane perspective (homography) helpers for page rectification.
 *
 * A homography H (3 × 3, row-major, H[8] = 1) maps (x, y) to
 * ((h0 x + h1 y + h2) / w, (h3 x + h4 y + h5) / w), w = h6 x + h7 y + 1.
 */

/** H mapping the four points src[i] onto dst[i] (each [x, y]), or null if degenerate. */
export function homographyFrom(src, dst) {
  // Eight equations in h0…h7.
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  // Gaussian elimination with partial pivoting.
  const n = 8;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) return null;
    [A[c], A[p]] = [A[p], A[c]];
    [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      if (!f) continue;
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const h = b.map((v, i) => v / A[i][i]);
  return [...h, 1];
}

export function applyHomography(H, x, y) {
  const w = H[6] * x + H[7] * y + 1;
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

/** Inverse of a homography (adjugate / determinant, normalised to H[8] = 1). */
export function invertHomography(H) {
  const [a, b, c, d, e, f, g, h, i] = H;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const inv = [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map(v => v / det);
  return inv.map(v => v / inv[8]);
}

/**
 * Samples a gray raster through H (output pixel centre → input position),
 * bilinear; outside the input → `outside`. Returns a { width, height, data } raster.
 */
export function warpGray(raster, H, width, height, outside = 255) {
  const { width: w, height: h, data } = raster;
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [sx, sy] = applyHomography(H, x + 0.5, y + 0.5);
      const fx = sx - 0.5;
      const fy = sy - 0.5;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      if (x0 < 0 || y0 < 0 || x0 + 1 >= w || y0 + 1 >= h) {
        out[y * width + x] = outside;
        continue;
      }
      const ax = fx - x0;
      const ay = fy - y0;
      const i = y0 * w + x0;
      const top = data[i] * (1 - ax) + data[i + 1] * ax;
      const bottom = data[i + w] * (1 - ax) + data[i + w + 1] * ax;
      out[y * width + x] = Math.round(top * (1 - ay) + bottom * ay);
    }
  }
  return { width, height, data: out };
}
