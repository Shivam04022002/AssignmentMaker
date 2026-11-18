/**
 * Sharp SVG on scaled pages.
 *
 * react-native-svg draws each <Svg> into a native bitmap the size of its
 * *layout* box (Android: SvgView.drawOutput; iOS: the layer's backing
 * store). Pages are laid out at their logical size (PAGE.width units) and
 * enlarged with a view transform — for the phone's width, for zoom, for
 * export — so that bitmap would be stretched and the handwriting blurred.
 *
 * Instead each Svg is laid out `k` times larger (same viewBox, so the same
 * drawing) and shrunk back by 1/k: its bitmap then matches the pixels it is
 * actually shown at. k is capped by a pixel budget, so a 3× zoom cannot
 * allocate huge bitmaps (it is then a little soft rather than out of
 * memory), and is below 1 for thumbnails (smaller, cheaper bitmaps).
 */
import { PixelRatio } from 'react-native';

/** Largest bitmap one page layer may use (≈24 MB at 4 bytes/pixel). */
export const MAX_SVG_PIXELS = 6000000;

/**
 * Render scale for an Svg of logical size w × h shown at `scale`.
 * Rounded so small changes (scrolling, re-renders) do not redraw bitmaps.
 */
export function renderScaleFor(scale, w, h, density = PixelRatio.get()) {
  const area = Math.max(1, w * h * density * density);
  const cap = Math.sqrt(MAX_SVG_PIXELS / area);
  const k = Math.max(0.25, Math.min(scale || 1, cap));
  return Math.round(k * 20) / 20;
}

/** Style that shrinks a k-times-larger Svg back to its logical box. */
export function shrinkStyle(k) {
  return k && k !== 1
    ? { transform: [{ scale: 1 / k }], transformOrigin: 'top left' }
    : null;
}
