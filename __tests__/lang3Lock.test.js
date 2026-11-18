/**
 * Lang3 regression lock (taken 2026-10-18, before any Lang4 shared change).
 * Same method as the Lang1 and Lang2 locks (naturalRhythm.test.js,
 * lang3.test.js): the same text laid out and rendered with a fixed seed,
 * hashed with hashString. Covers the glyph table, the reference1 forms
 * (with their widths), the layout (positions, widths, gaps, chosen forms)
 * and the full rendered output.
 */
import { getHandwritingStyle } from '../src/data/handwritingStyles';
import { renderLines } from '../src/handwriting/glyphRender';
import { GLYPHS_LANG3, GLYPH_FORMS } from '../src/handwriting/glyphs';
import { LANG3_PROFILE_ID } from '../src/handwriting/handwritingProfiles';
import { layoutHandwriting } from '../src/utils/textLayout';
import { hashString } from '../src/utils/variation';

const L3 = getHandwritingStyle(LANG3_PROFILE_ID);
const TEXT = 'The night slips quietly away,\nAnd wakes the gold and blue of day. Working Capital 2026, 25% (a) → ₹50!';

describe('Lang3 lock', () => {
  it('glyph table and reference1 forms are unchanged', () => {
    expect(hashString(JSON.stringify(GLYPHS_LANG3))).toBe(3369507586);
    expect(hashString(JSON.stringify(GLYPH_FORMS.lang3))).toBe(670974586);
  });

  it('layout and rendered output are unchanged', () => {
    const l = layoutHandwriting(TEXT, L3, { fontSize: 12.4, contentWidth: 292, lineHeight: 20, seed: 'lang3-lock' });
    expect(hashString(JSON.stringify(l.lines.map(x => x.words.map(w => [w.x, w.shape.width, w.gap, w.shape.forms]))))).toBe(1560000210);
    const out = JSON.stringify(renderLines(l.lines, { profile: L3, layout: l, rowHeight: 20, baselineInRow: 19, ink: { floor: 0.86, strength: 1 } }));
    expect(out.length).toBe(48058);
    expect(hashString(out)).toBe(2906402811);
  });
});
