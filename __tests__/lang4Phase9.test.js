/**
 * Lang4 Phase 9 — page detection and image reliability.
 *
 * Every image here is SYNTHETIC: geometric pseudo-glyph pages (no fonts,
 * nobody's handwriting) photographed — in code — with perspective on a
 * cluttered desk (photoConditions.onDesk), turned sideways or upside down,
 * or printed with notebook rules. Each is scored against the fixture's own
 * ground truth. Nothing here is evidence of real-handwriting accuracy; the
 * real reference pages are run only by the opt-in
 * __tests__/realSamples.optin.test.js and reported separately.
 */
import { analyzeSample } from '../src/handwriting/learn/analyzeSample';
import { QUALITY_ISSUES, validateQualityResult } from '../src/handwriting/learn/contracts';
import { analysisToFrame, glyphToSource } from '../src/handwriting/learn/glyphExtraction';
import { applyHomography, homographyFrom, invertHomography, warpGray } from '../src/handwriting/learn/homography';
import { dilate, noiseSigma, orientationIssue } from '../src/handwriting/learn/imageQuality';
import { clearTurn, detectOrientation, turnMask } from '../src/handwriting/learn/orientation';
import { detectPage, pageAspect, rectifyPage } from '../src/handwriting/learn/pageDetection';
import { darkMask, despeckle, detectRules, dropBorderObjects, inkMask, normalise, restoreInkOnRules, suppressFaintBands, suppressRules } from '../src/handwriting/learn/preprocess';
import { backgroundGrid, makeRaster } from '../src/handwriting/learn/raster';
import { PERSONAL_HANDWRITING_ONBOARDING, VALIDATION_TOOLS } from '../src/dev/flags';
import { cameraCorners, onDesk, sideways, upsideDown } from './helpers/photoConditions';
import { syntheticTextPage } from './helpers/syntheticText';

jest.setTimeout(180000);

const LATIN = 'The quick brown fox jumps over the lazy dog.\nPack my box with five dozen liquor jugs!';
const HINDI = 'क्षमा विद्या ज्ञान प्रकाश\nकितने लोग सीता किताब';
const SIMPLE = 'abc def ghi\njkl mno pqr\nstu vwx yz';
const XH = 26;
const CORNERS = [
  [150, 130],
  [1130, 100],
  [1180, 700],
  [110, 670],
];
// A camera below and to the side of the sheet, tilted 35° and 10°, rolled 3°.
const STEEP = cameraCorners(1100, 500, { width: 1300, height: 800, tiltX: -35, tiltY: 10, roll: 3, fill: 0.6 });
const pageOf = (text, o = {}) => syntheticTextPage(text, { width: 1100, height: 500, top: 130, lineGap: 104, marginX: 80, xHeight: XH, stroke: 3, ...o });
const photoOf = (page, o = {}) => onDesk(page.raster, { width: 1300, height: 800, corners: CORNERS, ...o });

/**
 * Analyses a desk photo of a synthetic page and scores aligned units
 * against the truth, mapped page → photo → analysis frame (through the
 * rectification and deskew). The truth extent is taken over the letter's
 * height, as perspective shears letters in an unrectified photo.
 */
async function scoredPhoto(text, pageOpts = {}, deskOpts = {}) {
  const page = pageOf(text, pageOpts);
  const photo = photoOf(page, deskOpts);
  const r = await analyzeSample(photo.raster, { slot: 1, knownText: text, yieldFn: async () => {}, extract: true, source: { width: photo.raster.width * 2, height: photo.raster.height * 2 } });
  const Hinv = r.page.homography ? invertHomography(r.page.homography) : null;
  const size = r.page.size || { width: photo.raster.width, height: photo.raster.height };
  const t = { deskew: r.skew.applied ? { angle: r.skew.angle, cx: size.width / 2, cy: size.height / 2 } : null };
  const map = p => {
    let q = photo.toPhoto(p);
    if (Hinv) q = applyHomography(Hinv, q[0], q[1]);
    return analysisToFrame(q, t);
  };
  let good = 0;
  let wrong = 0;
  for (const u of r.alignment.observations.units.filter(x => x.state === 'aligned')) {
    const tr = page.truth.units.find(x => x.start === u.source.start);
    const b = page.truth.lines[tr.line].baseline;
    const ys = [b - 1.6 * XH, b, b + 0.7 * XH];
    const x0 = Math.min(...ys.map(y => map([tr.x0, y])[0]));
    const x1 = Math.max(...ys.map(y => map([tr.x1, y])[0]));
    const cy = map([(tr.x0 + tr.x1) / 2, b - XH / 2])[1];
    const [bx, by, bw, bh] = u.bbox;
    const cx = bx + bw / 2;
    if (tr.drawn && cx >= x0 - 2 && cx <= x1 + 2 && bx >= x0 - 5 && bx + bw <= x1 + 5 && cy >= by - XH && cy <= by + bh + XH) good++;
    else wrong++;
  }
  return { r, page, photo, good, wrong, expected: page.truth.units.length };
}

const cornerError = (found, truth) => Math.max(...found.map((c, i) => Math.hypot(c[0] - truth[i][0], c[1] - truth[i][1])));

describe('homography', () => {
  it('maps four corners exactly, inverts, and warps an image through it', () => {
    const src = [
      [0, 0],
      [100, 0],
      [100, 60],
      [0, 60],
    ];
    const H = homographyFrom(src, CORNERS);
    src.forEach((p, i) => {
      const q = applyHomography(H, p[0], p[1]);
      expect(q[0]).toBeCloseTo(CORNERS[i][0], 6);
      expect(q[1]).toBeCloseTo(CORNERS[i][1], 6);
    });
    const back = invertHomography(H);
    const q = applyHomography(back, ...applyHomography(H, 37, 21));
    expect(q[0]).toBeCloseTo(37, 6);
    expect(q[1]).toBeCloseTo(21, 6);
    expect(homographyFrom(src, [CORNERS[0], CORNERS[0], CORNERS[0], CORNERS[0]])).toBe(null);
    const img = makeRaster(4, 4, Uint8Array.from({ length: 16 }, (_, i) => i * 10));
    expect(Array.from(warpGray(img, [1, 0, 0, 0, 1, 0, 0, 0, 1], 4, 4, 255).data).slice(5, 7)).toEqual([50, 60]);
  });
});

describe('page outline in a photo (synthetic desk photos)', () => {
  it('finds the four corners of a sheet among a book and keys, within about a pixel', () => {
    for (const [corners, extra] of [
      [CORNERS, {}],
      [CORNERS, { keysOnPage: true }],
      [STEEP, {}],
      [CORNERS, { light: 0.3 }],
      [CORNERS, { desk: 205 }],
    ]) {
      const photo = photoOf(pageOf(LATIN), { corners, ...extra });
      const p = detectPage(photo.raster);
      expect([extra, p.status]).toEqual([extra, 'page']);
      expect(cornerError(p.corners, corners)).toBeLessThan(2);
    }
  });

  it('recovers the sheet proportions from a camera view (pinhole model)', () => {
    const cam = o => cameraCorners(1100, 500, { width: 1300, height: 800, ...o });
    // Tilted both ways: the focal length is measured from the corners.
    for (const o of [
      { tiltX: 25, tiltY: 12, roll: 4 },
      { tiltX: -20, tiltY: -15, roll: -6 },
      { tiltX: 30, tiltY: 10, focal: 650 },
    ]) {
      const a = pageAspect(cam(o), 1300, 800);
      expect([o, a.method]).toEqual([o, 'camera']);
      expect(Math.abs(a.ratio / 2.2 - 1)).toBeLessThan(0.01);
    }
    // Tilted one way only: a typical phone focal length is assumed (exact
    // when the camera has it; the side lengths alone are 6 % off here).
    const one = cam({ tiltX: 20 });
    expect(pageAspect(one, 1300, 800).method).toBe('assumed-focal');
    expect(Math.abs(pageAspect(one, 1300, 800).ratio / 2.2 - 1)).toBeLessThan(0.01);
    // Seen straight on: plain side lengths.
    expect(pageAspect(cam({ tiltX: 0 }), 1300, 800)).toEqual({ ratio: 2.2, method: 'sides' });
  });

  it('rectifies to the sheet itself: right proportions, no background left in it', () => {
    const page = pageOf(LATIN);
    const photo = photoOf(page, { corners: cameraCorners(1100, 500, { width: 1300, height: 800, tiltX: 25, tiltY: 12, roll: 4 }) });
    const p = detectPage(photo.raster);
    expect(p.status).toBe('page');
    const rect = rectifyPage(photo.raster, p);
    expect(Math.abs(rect.raster.width / rect.raster.height / 2.2 - 1)).toBeLessThan(0.03);
    // The rectified page's border rows and columns are paper, not desk or book.
    const { width: w, height: h, data } = rect.raster;
    let dark = 0;
    for (let x = 0; x < w; x++) dark += (data[x] < 200) + (data[(h - 1) * w + x] < 200);
    for (let y = 0; y < h; y++) dark += (data[y * w] < 200) + (data[y * w + w - 1] < 200);
    expect(dark / (2 * (w + h))).toBeLessThan(0.01);
  });

  it('leaves scans and pages that fill the photo alone', () => {
    expect(detectPage(pageOf(LATIN).raster).status).toBe('full-frame');
    const cluttered = syntheticTextPage(LATIN, { width: 1250, height: 352, top: 104, lineGap: 104, clutter: true });
    expect(['full-frame', 'partial']).toContain(detectPage(cluttered.raster).status);
    // The page as dark as the desk on one side: no edge to find — not
    // rectified, not rejected (the analysis runs on the photo as it is).
    const shaded = onDesk(pageOf(LATIN, { gradient: 0.3 }).raster, { width: 1300, height: 800, corners: CORNERS, light: 0.2 });
    expect(['full-frame', 'partial']).toContain(detectPage(shaded.raster).status);
  });

  it('rejects a page whose outline cannot be fitted, with the reasons', () => {
    const photo = photoOf(pageOf(LATIN), {
      sheet: [
        [40, 420],
        [520, 380],
        [560, 790],
        [60, 795],
      ],
    });
    const p = detectPage(photo.raster);
    expect(p.status).toBe('unclear');
    expect(p.corners).toBe(null);
    expect(p.reasons.length).toBeGreaterThan(0);
  });
});

describe('analysis of desk photos (synthetic, against ground truth)', () => {
  it('a sheet on a desk is cut out, straightened and aligned with no wrong box', async () => {
    const s = await scoredPhoto(LATIN, {}, { keysOnPage: true });
    expect(s.r.page.status).toBe('page');
    expect(s.wrong).toBe(0);
    expect(s.good).toBeGreaterThanOrEqual(0.9 * s.expected);
    expect(s.r.quality.issues.map(i => i.code)).not.toContain('uneven-lighting');
    // The result stays valid and carries no pixels.
    expect(validateQualityResult(s.r.quality)).toEqual([]);
    expect(s.r.page.homography).toHaveLength(9);
    expect(s.r.page.metrics.workImage).toBeUndefined();
    expect(s.r.representations).toBeUndefined();
    expect(JSON.stringify(s.r.page).length).toBeLessThan(4000);
    // Extracted glyphs map back into the photo, onto their letters.
    const g = s.r.extraction.units.find(u => u.status === 'extracted' && u.text === 'q');
    const tr = s.page.truth.units.find(u => u.start === g.source.start);
    const inPhoto = glyphToSource([g.form.w / 2, 0.5], g.transform).map(v => v / 2);
    const truth = s.photo.toPhoto([(tr.x0 + tr.x1) / 2, s.page.truth.lines[tr.line].baseline - XH / 2]);
    expect(Math.hypot(inPhoto[0] - truth[0], inPhoto[1] - truth[1])).toBeLessThan(XH * 0.6);
  });

  it('steep perspective, a notebook page and a Hindi page: every box right', async () => {
    const steep = await scoredPhoto(LATIN, {}, { corners: STEEP });
    expect([steep.r.page.status, steep.wrong]).toEqual(['page', 0]);
    expect(steep.good).toBeGreaterThanOrEqual(0.9 * steep.expected);
    const notebook = await scoredPhoto(LATIN, { notebook: true, noise: 6, blur: 1 });
    expect([notebook.r.page.status, notebook.wrong, notebook.r.orientation.status]).toEqual(['page', 0, 'across']);
    expect(notebook.good).toBeGreaterThanOrEqual(0.9 * notebook.expected);
    const hindi = await scoredPhoto(HINDI, {}, { corners: STEEP });
    expect([hindi.r.page.status, hindi.wrong]).toEqual(['page', 0]);
    expect(hindi.good).toBeGreaterThanOrEqual(0.85 * hindi.expected);
  });

  it('an unclear page is rejected with advice — nothing aligned, nothing extracted', async () => {
    const s = await scoredPhoto(LATIN, {}, {
      sheet: [
        [40, 420],
        [520, 380],
        [560, 790],
        [60, 795],
      ],
    });
    expect(s.r.page.status).toBe('unclear');
    expect(s.r.quality.usable).toBe(false);
    const issue = s.r.quality.issues.find(i => i.code === 'page-unclear');
    expect(issue.severity).toBe('error');
    expect(issue.advice).toMatch(/four corners/);
    expect(s.good + s.wrong).toBe(0);
    expect(s.r.extraction.summary.extracted).toBe(0);
  });
});

describe('orientation (never turned automatically)', () => {
  const inkOf = raster => Uint8Array.from(raster.data, v => (v < 128 ? 1 : 0));

  it('tells lines running across from a photo on its side', () => {
    for (const text of [LATIN, HINDI]) {
      const r = pageOf(text).raster;
      expect(detectOrientation(inkOf(r), r.width, r.height).status).toBe('across');
      const s = sideways(r).raster;
      expect(detectOrientation(inkOf(s), s.width, s.height).status).toBe('sideways');
    }
  });

  it('turns masks exactly and names a turn only when it is clearly better', () => {
    const r = pageOf(LATIN).raster;
    const m = inkOf(r);
    const cw = turnMask(m, r.width, r.height, 'clockwise');
    const back = turnMask(cw.mask, cw.width, cw.height, 'anticlockwise');
    expect([back.width, back.height]).toEqual([r.width, r.height]);
    expect(back.mask).toEqual(m);
    const half = turnMask(turnMask(m, r.width, r.height, 'half').mask, r.width, r.height, 'half');
    expect(half.mask).toEqual(m);
    expect(clearTurn({ none: 0, half: 26 })).toBe('half');
    expect(clearTurn({ none: 5, half: 11 })).toBe(null); // not twice as many (+2)
    expect(clearTurn({ none: 0, half: 4 })).toBe(null); // too few to trust
    expect(clearTurn({ clockwise: 0, anticlockwise: 0 })).toBe(null);
  });

  it('a sideways photo is rejected with the direction to turn it, when the text shows it', async () => {
    const latin = await analyzeSample(sideways(pageOf(LATIN).raster).raster, { slot: 1, knownText: LATIN, yieldFn: async () => {}, extract: true });
    const issue = latin.quality.issues.find(i => i.code === 'sideways');
    expect(issue.severity).toBe('error');
    expect(issue.advice).toMatch(/anticlockwise/);
    expect(latin.orientation.turn).toBe('anticlockwise');
    expect(latin.alignment.summary.units.aligned).toBe(0);
    expect(latin.extraction.summary.extracted).toBe(0);
    // Turned the other way (three quarter turns clockwise): turn it clockwise.
    const other = sideways(sideways(sideways(pageOf(HINDI).raster).raster).raster).raster;
    const hindi = await analyzeSample(other, { slot: 1, knownText: HINDI, yieldFn: async () => {} });
    expect(hindi.orientation.turn).toBe('clockwise');
    expect(hindi.quality.issues.find(i => i.code === 'sideways').advice).toMatch(/quarter turn clockwise/);
  });

  it('an upside-down photo is rejected — no false matches from reading it backwards', async () => {
    for (const text of [LATIN, SIMPLE]) {
      const r = await analyzeSample(upsideDown(pageOf(text).raster).raster, { slot: 1, knownText: text, yieldFn: async () => {}, extract: true });
      expect([text, r.orientation.status]).toEqual([text, 'upside-down']);
      expect(r.quality.usable).toBe(false);
      expect(r.quality.issues.find(i => i.code === 'upside-down').advice).toMatch(/180°/);
      expect(r.alignment.summary.units.aligned).toBe(0);
      expect(r.extraction.summary.extracted).toBe(0);
    }
  });

  it('upright pages are not flagged', async () => {
    for (const [text, o] of [
      [LATIN, {}],
      [HINDI, {}],
    ]) {
      const r = await analyzeSample(pageOf(text, o).raster, { slot: 1, knownText: text, yieldFn: async () => {} });
      expect(r.orientation.status).toBe('across');
      expect(r.quality.issues.map(i => i.code).filter(c => c === 'sideways' || c === 'upside-down')).toEqual([]);
    }
  });
});

describe('ruled notebook pages keep their ink', () => {
  // Rules removed as analyzeSample does, with and without the Phase 9 restoration.
  const masks = (text, o) => {
    const p = pageOf(text, { noise: 6, blur: 1, notebook: true, ...o });
    const { width: w, height: h } = p.raster;
    const clean = pageOf(text, { ...o, notebook: false }).raster.data;
    const ink = Uint8Array.from(clean, v => (v < 150 ? 1 : 0));
    const nm = normalise(p.raster, backgroundGrid(p.raster));
    const raw = inkMask(nm);
    const sp = despeckle(raw, w, h).mask;
    const level = Math.round(255 - Math.max(20, 3.5 * (noiseSigma(nm, raw) || 0)));
    const rules = detectRules(sp, w, h, { dark: darkMask(nm, level) });
    // As analyzeSample: rules cleared, feet restored, faint bands cleared.
    const cleared = suppressFaintBands(suppressRules(sp, w, h, rules).mask, nm.data, w, h).mask;
    const back = restoreInkOnRules(sp, suppressRules(sp, w, h, rules).mask, nm.data, w, h, rules);
    const restored = { ...back, mask: suppressFaintBands(back.mask, nm.data, w, h).mask };
    const kept = (m, which = ink) => {
      const d = dilate(m, w, h, 1);
      let a = 0;
      let b = 0;
      for (let i = 0; i < w * h; i++) if (which[i]) {
        a += 1;
        b += d[i];
      }
      return b / a;
    };
    const near = dilate(ink, w, h, 3);
    let rule = 0;
    let left = 0;
    for (let i = 0; i < w * h; i++) if (p.raster.data[i] < 200 && !near[i] && clean[i] > 200) {
      rule += 1;
      left += restored.mask[i];
    }
    return { p, w, h, ink, clean, cleared, restored, kept, ruleLeft: left / rule };
  };

  it('letters standing on the rules keep their feet; the rules still go', () => {
    for (const o of [{}, { notebookRuleInk: 200 }, { notebookRuleInk: 120 }, { xHeight: 14, stroke: 2, lineGap: 60, top: 70, height: 260 }]) {
      const m = masks(LATIN, o);
      expect([o, m.kept(m.restored.mask) >= 0.99]).toEqual([o, true]);
      expect(m.ruleLeft).toBeLessThan(0.01);
    }
    // Without the restoration the feet were lost on pale rules.
    const pale = masks(LATIN, { notebookRuleInk: 200 });
    expect(pale.kept(pale.cleared)).toBeLessThan(0.95);
    expect(pale.restored.restoredPixels).toBeGreaterThan(0);
  });

  it('Hindi headlines, marks above them and underlines are kept', () => {
    const m = masks(HINDI, { underline: [0, 5] });
    const head = new Uint8Array(m.w * m.h);
    const above = new Uint8Array(m.w * m.h);
    for (const wd of m.p.truth.words) {
      if (!wd.headline) continue;
      const hy = (wd.headline[1] + wd.headline[3]) / 2;
      for (let y = 0; y < m.h; y++) {
        for (let x = Math.floor(wd.headline[0]); x <= Math.ceil(wd.headline[2]); x++) {
          const i = y * m.w + x;
          if (!m.ink[i]) continue;
          if (Math.abs(y + 0.5 - hy) <= 2) head[i] = 1;
          else if (y + 0.5 < hy - 3) above[i] = 1;
        }
      }
    }
    const plain = pageOf(HINDI, {}).raster.data;
    const under = Uint8Array.from(m.clean, (v, i) => (v < 150 && plain[i] >= 150 ? 1 : 0));
    expect(m.kept(m.restored.mask)).toBeGreaterThanOrEqual(0.99);
    expect(m.kept(m.restored.mask, head)).toBeGreaterThanOrEqual(0.99);
    expect(m.kept(m.restored.mask, above)).toBeGreaterThanOrEqual(0.99);
    expect(m.kept(m.restored.mask, under)).toBeGreaterThanOrEqual(0.99);
  });

  it('gives nothing back where the ink is as light as the rule (pencil)', () => {
    const W = 120;
    const H = 40;
    const before = new Uint8Array(W * H);
    const gray = new Uint8Array(W * H).fill(255);
    const put = (x0, x1, y0, y1, v) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        before[y * W + x] = 1;
        gray[y * W + x] = v;
      }
    };
    put(0, W - 1, 29, 31, 170); // the rule
    put(20, 22, 10, 31, 165); // pencil strokes standing on it
    put(60, 62, 10, 31, 160);
    const rules = { horizontal: [{ kind: 'rule', from: 29, to: 31 }], vertical: [] };
    const after = suppressRules(before, W, H, rules).mask;
    expect(restoreInkOnRules(before, after, gray, W, H, rules).restoredPixels).toBe(0);
    // A pen stroke on the same rule comes back down to the rule's bottom.
    put(40, 42, 10, 31, 40);
    const back = restoreInkOnRules(before, suppressRules(before, W, H, rules).mask, gray, W, H, rules);
    expect(back.mask[31 * W + 41]).toBe(1);
    expect(back.mask[31 * W + 50]).toBe(0); // the rule beside it stays removed
  });

  it('on a cut-out page, keys across the sheet edge go; letters near the edge stay', () => {
    const w = 400;
    const h = 600;
    const m = new Uint8Array(w * h);
    const fill = (x0, x1, y0, y1) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m[y * w + x] = 1;
    };
    for (let k = 0; k < 8; k++) fill(40 + k * 30, 52 + k * 30, 40, 64); // writing, 25 px tall
    fill(385, 399, 20, 70); // keys across the right edge, 51 px tall… (stay: under 4 × 25)
    fill(380, 399, 100, 230); // … and 131 px tall: an object
    fill(0, 8, 150, 172); // a letter cut by the left edge
    const plain = dropBorderObjects(m, w, h);
    expect(plain.objects).toBe(0);
    const cut = dropBorderObjects(m, w, h, undefined, { pageEdges: true });
    expect(cut.objects).toBe(1);
    expect(cut.mask[150 * w + 390]).toBe(0);
    expect(cut.mask[40 * w + 390]).toBe(1);
    expect(cut.mask[160 * w + 4]).toBe(1);
    expect(cut.mask[50 * w + 45]).toBe(1);
  });
});

describe('conservative alignment', () => {
  it('a lost comma or full stop is not matched to part of the letter beside it', async () => {
    const text = 'Sphinx of black quartz, judge my vow.\nHow vexingly quick daft zebras jump, now.';
    const p = syntheticTextPage(text, { width: 1250, height: 300, top: 110, lineGap: 104, marginX: 80, xHeight: XH, stroke: 3 });
    // Erase the punctuation (as a mark too faint to threshold would be).
    const { width: w, data } = p.raster;
    const marks = p.truth.units.filter(u => u.text === ',' || u.text === '.');
    for (const u of marks) {
      const b = p.truth.lines[u.line].baseline;
      for (let y = Math.floor(b - 0.6 * XH); y <= Math.ceil(b + 0.5 * XH); y++) for (let x = Math.floor(u.x0); x <= Math.ceil(u.x1); x++) data[y * w + x] = 236;
    }
    const r = await analyzeSample(p.raster, { slot: 1, knownText: text, yieldFn: async () => {} });
    const units = r.alignment.observations.units;
    for (const u of marks) {
      const o = units.find(x => x.source.start === u.start);
      expect([u.text, u.start, o.state === 'aligned']).toEqual([u.text, u.start, false]);
    }
    // Everything that is aligned is right.
    for (const o of units.filter(x => x.state === 'aligned')) {
      const t = p.truth.units.find(x => x.start === o.source.start);
      const c = o.bbox[0] + o.bbox[2] / 2;
      expect([o.text, c >= t.x0 && c <= t.x1]).toEqual([o.text, true]);
    }
  });
});

describe('contracts and release state', () => {
  it('the new rejections are valid quality issues with advice', () => {
    for (const code of ['page-unclear', 'sideways', 'upside-down']) expect(QUALITY_ISSUES).toContain(code);
    expect(orientationIssue({ status: 'sideways', turn: null }).advice).toMatch(/quarter turn so the lines/);
    expect(orientationIssue({ status: 'sideways', turn: 'clockwise' }).advice).toMatch(/clockwise \(to the right\)/);
    expect(orientationIssue({ status: 'across', turn: null })).toBe(null);
    expect(orientationIssue(null)).toBe(null);
  });

  it('the onboarding release flag is still tied to development / validation builds', () => {
    expect(PERSONAL_HANDWRITING_ONBOARDING).toBe(VALIDATION_TOOLS);
  });
});
