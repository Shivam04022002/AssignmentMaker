/**
 * Builds pen strokes for the glyph sets: cubic Bézier chains in x-height
 * units ([x0, y0, c1x, c1y, c2x, c2y, x1, y1, …]; y up). Lines, quadratics
 * and arcs are converted to cubics, so every variation is a cheap map of
 * control points.
 */

const K = 0.5522847498; // cubic approximation of a quarter circle

/** Builds one continuous pen stroke. */
export class Stroke {
  constructor() {
    this.pts = [];
  }

  get x() {
    return this.pts[this.pts.length - 2];
  }

  get y() {
    return this.pts[this.pts.length - 1];
  }

  M(x, y) {
    this.pts.push(x, y);
    return this;
  }

  C(c1x, c1y, c2x, c2y, x, y) {
    this.pts.push(c1x, c1y, c2x, c2y, x, y);
    return this;
  }

  L(x, y) {
    const { x: x0, y: y0 } = this;
    return this.C(x0 + (x - x0) / 3, y0 + (y - y0) / 3, x0 + ((x - x0) * 2) / 3, y0 + ((y - y0) * 2) / 3, x, y);
  }

  Q(cx, cy, x, y) {
    const { x: x0, y: y0 } = this;
    return this.C(x0 + ((cx - x0) * 2) / 3, y0 + ((cy - y0) * 2) / 3, x + ((cx - x) * 2) / 3, y + ((cy - y) * 2) / 3, x, y);
  }

  /** Elliptical arc from angle a0 to a1 (degrees, counter-clockwise). */
  arc(cx, cy, rx, ry, a0, a1) {
    const rad = d => (d * Math.PI) / 180;
    const at = a => [cx + rx * Math.cos(rad(a)), cy + ry * Math.sin(rad(a))];
    const [sx, sy] = at(a0);
    if (!this.pts.length) {
      this.M(sx, sy);
    } else if (Math.hypot(this.x - sx, this.y - sy) > 1e-6) {
      this.L(sx, sy);
    }
    const steps = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 90));
    const step = (a1 - a0) / steps;
    for (let i = 0; i < steps; i++) {
      const s = a0 + step * i;
      const e = s + step;
      const k = (K * step) / 90;
      const [x0, y0] = at(s);
      const [x1, y1] = at(e);
      this.C(
        x0 - k * rx * Math.sin(rad(s)),
        y0 + k * ry * Math.cos(rad(s)),
        x1 + k * rx * Math.sin(rad(e)),
        y1 - k * ry * Math.cos(rad(e)),
        x1,
        y1,
      );
    }
    return this;
  }
}

export const s = () => new Stroke();
/** A dot (i, j, full stop…): a very short stroke the round cap makes round. */
export const dot = (x, y) => s().M(x - 0.015, y - 0.01).L(x + 0.015, y + 0.01);
