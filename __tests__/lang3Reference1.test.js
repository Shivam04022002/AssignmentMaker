/**
 * Lang3 letterforms from reference/reference1.png (the alphabet sheet):
 * several genuine forms per letter, chosen deterministically from context,
 * with every existing system (spacing, gaps, formatting, corrections,
 * pagination, persistence, thumbnails, export) unchanged. Lang1 and Lang2
 * locked.
 */
import React from 'react';
import { clearAllMockStorages } from '@react-native-async-storage/async-storage';
import { getHandwritingStyle } from '../src/data/handwritingStyles';
import { getPageMetrics, getPageType, rowHeightFor } from '../src/data/paper';
import { baselineInRow } from '../src/components/HandwritingText';
import PaperPage from '../src/components/PaperPage';
import ExportRenderer from '../src/export/ExportRenderer';
import { buildExportPlan } from '../src/export/exportPlan';
import { setNativeExporter } from '../src/export/nativeExporter';
import { renderLines } from '../src/handwriting/glyphRender';
import {
  FALLBACK_GLYPH,
  FORM_WIDTH,
  GLYPHS,
  GLYPHS_LANG2,
  GLYPHS_LANG3,
  GLYPH_FORMS,
  glyphFor,
  glyphForms,
} from '../src/handwriting/glyphs';
import { FORMS_LANG3 } from '../src/handwriting/glyphsLang3';
import { LANG3_PROFILE_ID } from '../src/handwriting/handwritingProfiles';
import {
  chooseForm,
  entered,
  glyphContext,
  letterForm,
  letterStrokes,
  sampleChain,
} from '../src/handwriting/strokeModel';
import { createDocument } from '../src/models/document';
import { getDocument, saveDocument, setStorageBackend } from '../src/storage/documentStorage';
import {
  WORD_SPACING_STEPS,
  applySpanFormat,
  boundariesIn,
  emptyFormatting,
  setWordGap,
} from '../src/utils/formatting';
import { PAGE_BREAK, paginateDocument } from '../src/utils/pagination';
import { layoutHandwriting } from '../src/utils/textLayout';
import { hashString, mixSeed } from '../src/utils/variation';
import { act, render } from './helpers/render';

const L1 = getHandwritingStyle('reference_student');
const L2 = getHandwritingStyle('reference_student_lang2');
const L3 = getHandwritingStyle(LANG3_PROFILE_ID);
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const PUNCT = '.,:;?!\'"()[]-_/%';
const SYMBOLS = '•→←+=&#@₹°';
const PARA =
  'The international market refers to the exchange of goods, services, and resources across national borders. Unlike domestic marketing, which occurs within the confines of a single country, international marketing involves navigating diverse legal systems, cultural nuances, economic climates, and consumer behaviors.';
const metrics = getPageMetrics({ pageType: 'lined', style: L3 });
const rowHeight = rowHeightFor(getPageType('lined'), metrics, L3);

function draw(text, formatting, seed = 'r1', options = {}) {
  const l = layoutHandwriting(text, L3, { fontSize: 12.4, contentWidth: options.width || 292, lineHeight: 20, seed, formatting, corrections: options.corrections });
  const strokes = [];
  const drawn = renderLines(l.lines, { profile: L3, layout: l, rowHeight: 20, baselineInRow: baselineInRow(20, L3, l.fontSize), ink: { floor: 0.86, strength: 1 }, debug: strokes });
  return { layout: l, drawn, strokes };
}
/** One entry per drawn letter (its first stroke), in writing order. */
const lettersOf = strokes => strokes.filter(s => s.stroke === 0 && s.pass === 'main');
const ys = strokes => strokes.flatMap(p => p.filter((_, i) => i % 2));
const drawnYs = strokes => strokes.flatMap(p => sampleChain(p).ys);
/** Drawn x extent of a form: all ink, and its body (ink above y 0.25). */
function extent(strokes) {
  const e = { min: Infinity, max: -Infinity, bodyMin: Infinity, bodyMax: -Infinity };
  strokes.forEach(p => {
    const { xs: X, ys: Y } = sampleChain(p, 0.02);
    X.forEach((x, i) => {
      e.min = Math.min(e.min, x);
      e.max = Math.max(e.max, x);
      if (Y[i] > 0.25) {
        e.bodyMin = Math.min(e.bodyMin, x);
        e.bodyMax = Math.max(e.bodyMax, x);
      }
    });
  });
  return e;
}
/** A form whose first stroke is an entry: it starts low at the letter's left edge and runs right. */
function enteredForm(f, maxY = 0.7) {
  const p = f.strokes[0];
  const e = extent(f.strokes);
  const { xs: X } = sampleChain(p);
  return p[1] < maxY && p[0] <= e.min + 0.03 && Math.max(...X) > p[0] + 0.1;
}

/** Points along a form (all strokes, by arc length), centred, unit RMS. */
function normalised(strokes, n = 96) {
  const pts = [];
  strokes.forEach(p => {
    const { xs: X, ys: Y } = sampleChain(p, 0.02);
    X.forEach((x, i) => pts.push([x, Y[i]]));
  });
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1] || 1;
  const out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const t = (k / (n - 1)) * total;
    while (j < cum.length - 2 && cum[j + 1] < t) j++;
    const u = cum[j + 1] > cum[j] ? (t - cum[j]) / (cum[j + 1] - cum[j]) : 0;
    out.push([pts[j][0] + (pts[j + 1] ? pts[j + 1][0] - pts[j][0] : 0) * u, pts[j][1] + (pts[j + 1] ? pts[j + 1][1] - pts[j][1] : 0) * u]);
  }
  const cx = out.reduce((a, p) => a + p[0], 0) / n;
  const cy = out.reduce((a, p) => a + p[1], 0) / n;
  const c = out.map(([x, y]) => [x - cx, y - cy]);
  const rms = Math.sqrt(c.reduce((a, [x, y]) => a + x * x + y * y, 0) / n) || 1;
  return c.map(([x, y]) => [x / rms, y / rms]);
}
/**
 * Residual after the best similarity transform (translation, uniform scale,
 * rotation) maps form a onto form b: ≈0 for a scaled or rotated copy.
 */
function similarityResidual(a, b) {
  const A = normalised(a);
  const B = normalised(b);
  let dot = 0;
  let cross = 0;
  A.forEach(([ax, ay], i) => {
    dot += ax * B[i][0] + ay * B[i][1];
    cross += ax * B[i][1] - ay * B[i][0];
  });
  const th = Math.atan2(cross, dot);
  const c = Math.cos(th);
  const s = Math.sin(th);
  return A.reduce((t, [x, y], i) => t + (x * c - y * s - B[i][0]) ** 2 + (x * s + y * c - B[i][1]) ** 2, 0) / A.length;
}

beforeEach(() => {
  clearAllMockStorages();
  setStorageBackend(null);
  setNativeExporter(null);
});

// --- Coverage ------------------------------------------------------------------------

describe('Lang3 coverage', () => {
  it('has its own glyph for every supported character and the neutral fallback otherwise', () => {
    for (const ch of UPPER + LOWER + DIGITS + PUNCT + SYMBOLS + '₹%&+=()→←•') {
      expect([ch, glyphFor(ch, 'lang3')]).toEqual([ch, GLYPHS_LANG3[ch]]);
    }
    for (const ch of Object.keys(GLYPHS_LANG2)) expect([ch, !!GLYPHS_LANG3[ch]]).toEqual([ch, true]);
    for (const ch of '漢あ€̸☃') {
      if (!GLYPHS_LANG3[ch]) expect(glyphFor(ch, 'lang3')).toBe(FALLBACK_GLYPH);
    }
  });

  // I: both I's on reference1 are the same construction, so it has one form.
  const SINGLE = 'I';
  it('gives every letter A–Z and a–z several forms (I: one); digits, punctuation and symbols one', () => {
    expect(glyphForms('I', 'lang3')).toBeNull();
    for (const ch of [...UPPER + LOWER].filter(c => !SINGLE.includes(c))) {
      const forms = glyphForms(ch, 'lang3');
      expect([ch, forms && forms.length >= 2]).toEqual([ch, true]);
      expect(forms[0].strokes).toBe(GLYPHS_LANG3[ch].strokes);
    }
    expect(glyphForms('a', 'lang3').length).toBe(5);
    for (const ch of DIGITS + PUNCT + SYMBOLS) expect([ch, glyphForms(ch, 'lang3')]).toEqual([ch, null]);
    // Accented letters use their base letter's forms.
    expect(glyphForms('é', 'lang3')).toBe(glyphForms('e', 'lang3'));
  });

  it('never borrows Lang1 or Lang2 geometry in any form', () => {
    const other = new Set([...Object.values(GLYPHS), ...Object.values(GLYPHS_LANG2)].flatMap(g => g.strokes.map(p => JSON.stringify(p))));
    for (const [ch, forms] of Object.entries(GLYPH_FORMS.lang3)) {
      forms.forEach((f, i) => f.strokes.forEach(p => expect([ch, i, other.has(JSON.stringify(p))]).toEqual([ch, i, false])));
    }
  });

  it('defines every form as finite cubic strokes inside the writing band and its own letter box', () => {
    for (const [ch, forms] of Object.entries(GLYPH_FORMS.lang3)) {
      const base = GLYPHS_LANG3[ch].w;
      forms.forEach((f, i) => {
        // Its own width, bounded relative to the letter's body width.
        expect([ch, i, f.w >= base * FORM_WIDTH.min - 1e-9 && f.w <= base + FORM_WIDTH.extra + 1e-9]).toEqual([ch, i, true]);
        expect([ch, i, f.weight >= 0]).toEqual([ch, i, true]);
        f.strokes.forEach(p => expect([ch, i, (p.length - 2) % 6 === 0 && p.every(Number.isFinite)]).toEqual([ch, i, true]));
        const y = ys(f.strokes);
        expect([ch, i, Math.max(...y) <= 1.9 && Math.min(...y) >= -0.7]).toEqual([ch, i, true]);
        if (i === 0) return; // form 0 is the glyph table's entry, unchanged
        // Entry strokes and exit hooks reach only a little way into the gaps.
        const e = extent(f.strokes);
        expect([ch, i, e.min >= -FORM_WIDTH.entry - 0.01]).toEqual([ch, i, true]);
        expect([ch, i, e.max <= f.w + FORM_WIDTH.exit + 0.01 || f.w >= base + FORM_WIDTH.extra - 1e-9]).toEqual([ch, i, true]);
      });
    }
  });

  it('registers forms for Lang3 only', () => {
    expect(Object.keys(GLYPH_FORMS)).toEqual(['lang3']);
    expect(glyphForms('a', 'lang1')).toBeNull();
    expect(glyphForms('a', 'lang2')).toBeNull();
    expect(Object.keys(FORMS_LANG3).sort().join('')).toBe([...UPPER, ...LOWER].filter(c => c !== 'I').sort().join(''));
  });
});

// --- Reference-derived shapes --------------------------------------------------------

describe('reference1 letterforms', () => {
  const forms = ch => GLYPH_FORMS.lang3[ch] || [GLYPHS_LANG3[ch]];
  /** A stroke entered from the baseline that rises into an ascender loop and comes back down. */
  const loopedAscender = p => {
    const { xs: X, ys: Y } = sampleChain(p);
    const top = Y.indexOf(Math.max(...Y));
    return Y[0] < 0.45 && Y[top] > 1.55 && Math.min(...Y.slice(top)) < 0.1 && X[0] < X[top];
  };
  /** A descender that closes back up to the baseline (a loop, not a hook). */
  const loopedDescender = p => {
    const { ys: Y } = sampleChain(p);
    const low = Y.indexOf(Math.min(...Y));
    return Y[low] < -0.5 && Math.max(...Y.slice(low)) > -0.15;
  };

  it('looped ascenders in b, h, k, l (entered from the baseline)', () => {
    for (const ch of 'bhkl') expect([ch, forms(ch).some(f => loopedAscender(f.strokes[0]))]).toEqual([ch, true]);
  });

  it('looped descenders in f, g, j, y and a cursive z below the line', () => {
    for (const ch of 'fgjy') expect([ch, forms(ch).some(f => loopedDescender(f.strokes[0]))]).toEqual([ch, true]);
    expect(forms('f').filter(f => Math.min(...drawnYs(f.strokes)) < -0.5).length).toBe(2); // the sheet's f loops below the line
    expect(forms('z').some(f => Math.min(...drawnYs(f.strokes)) < -0.5)).toBe(true);
  });

  it('a: single-storey with an exit hook, entered from the left, ∂-like, two-storey', () => {
    const [, hook, enteredA, curl, twoStorey] = forms('a');
    const end = p => [p[p.length - 2], p[p.length - 1]];
    expect(end(hook.strokes[0])[0]).toBeGreaterThan(0.85); // exit hook to the right
    expect(enteredA.strokes[0][0]).toBeLessThan(0);
    expect(enteredA.strokes[0][1]).toBeLessThan(0.3);
    expect(Math.max(...drawnYs(curl.strokes))).toBeGreaterThan(1.1); // the curled top rises above the x-height
    expect(Math.max(...drawnYs(curl.strokes))).toBeLessThan(1.4);
    expect(twoStorey.strokes).toHaveLength(2);
  });

  it('entry hooks on i, m, n, r, u and exit hooks on the baseline', () => {
    for (const ch of 'imnru') {
      expect([ch, forms(ch).some(g => enteredForm(g))]).toEqual([ch, true]);
      expect([ch, enteredForm(forms(ch)[0])]).toEqual([ch, false]);
    }
    for (const ch of 'adhiu') {
      expect([ch, forms(ch).some(g => g.strokes.some(p => p[p.length - 1] < 0.1 && p[p.length - 2] > g.w - 0.1))]).toEqual([ch, true]);
    }
  });

  it('epsilon E, looped capitals with entry strokes, M with rounded shoulders', () => {
    // Ɛ: one stroke, no stem — the middle point sits right of the top and bottom curves.
    const eps = forms('E')[1];
    expect(eps.strokes).toHaveLength(1);
    const { xs: X, ys: Y } = sampleChain(eps.strokes[0]);
    const near = y => X[Y.reduce((b, v, i) => (Math.abs(v - y) < Math.abs(Y[b] - y) ? i : b), 0)];
    expect(near(0.8)).toBeGreaterThan(Math.min(near(1.14), near(0.38)) + 0.2);
    for (const ch of 'KMNPR') expect([ch, forms(ch).some(f => enteredForm(f, 0.3))]).toEqual([ch, true]);
    expect(Math.max(...drawnYs(forms('M')[1].strokes))).toBeLessThan(1.56);
  });

  it('capitals keep cap height (1.4–1.6); the sheet’s descending Y is the one exception', () => {
    for (const ch of UPPER) {
      forms(ch).forEach((f, i) => {
        const top = Math.max(...drawnYs(f.strokes));
        expect([ch, i, top > 1.38 && top < 1.62]).toEqual([ch, i, true]);
        if (!(ch === 'Y' && i === 2)) expect([ch, i, Math.min(...drawnYs(f.strokes)) > -0.12]).toEqual([ch, i, true]);
      });
    }
  });

  it('keeps capitals and lowercase distinct (c o s v w x z: height)', () => {
    for (const ch of 'cosvwxz') {
      forms(ch).forEach((f, i) => expect([ch, i, Math.max(...drawnYs(f.strokes)) < 1.16]).toEqual([ch, i, true]));
      forms(ch.toUpperCase()).forEach((f, i) => expect([ch, i, Math.max(...drawnYs(f.strokes)) > 1.38]).toEqual([ch, i, true]));
    }
  });
});

// --- Variants ------------------------------------------------------------------------

describe('meaningful variants', () => {
  it('every form is a different construction, never a scaled or rotated copy', () => {
    for (const [ch, forms] of Object.entries(GLYPH_FORMS.lang3)) {
      for (let i = 0; i < forms.length; i++) {
        for (let j = i + 1; j < forms.length; j++) {
          const r = similarityResidual(forms[i].strokes, forms[j].strokes);
          // A scaled / rotated / moved copy scores ≈0; an added loop, hook or
          // entry, a different bowl or crossbar scores above 0.01.
          expect([ch, i, j, r > 0.01]).toEqual([ch, i, j, true]);
        }
      }
    }
  });

  it('uses every form of a letter in running text', () => {
    const text = `${PARA} ${PARA.toUpperCase()} quiz jazz fjord buzzword mixed zebra quickly`;
    const used = {};
    for (const seed of ['a', 'b', 'c', 'd']) {
      lettersOf(draw(text, undefined, seed, { width: 900 }).strokes).forEach(s => {
        used[s.char] = used[s.char] || new Set();
        used[s.char].add(s.form);
      });
    }
    for (const ch of 'aeinorstABCEMNT') expect([ch, used[ch].size]).toEqual([ch, glyphForms(ch, 'lang3').length]);
  });

  it('is deterministic: same document, same forms and strokes (reopen = same render)', () => {
    const a = draw(PARA);
    const b = draw(PARA);
    expect(b.drawn).toEqual(a.drawn);
    expect(lettersOf(b.strokes).map(s => s.form)).toEqual(lettersOf(a.strokes).map(s => s.form));
    expect(lettersOf(draw(PARA, undefined, 'other').strokes).map(s => s.form)).not.toEqual(lettersOf(a.strokes).map(s => s.form));
  });

  it('chooses forms without Math.random', () => {
    const spy = jest.spyOn(Math, 'random');
    draw(PARA);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('repeated letters and words', () => {
  it.each(['aaaaaa', 'eeeeee', 'oooooo', 'rrrrrr', 'tttttt', 'mmmmmm'])('%s: never the same form twice in a row', run => {
    const letters = lettersOf(draw(run).strokes);
    expect(letters).toHaveLength(6);
    const forms = letters.map(s => s.form);
    forms.slice(1).forEach((f, i) => expect(f).not.toBe(forms[i]));
    expect(new Set(forms).size).toBeGreaterThanOrEqual(run[0] === 'a' ? 3 : 2);
  });

  it('holds for any seed, inside longer words too (letterForm)', () => {
    for (let s = 0; s < 200; s++) {
      for (const word of ['aaaa', 'bookkeeper', 'llama', 'ssss', 'committee']) {
        const chars = [...word];
        const seedAt = i => mixSeed(s, i);
        const f = chars.map((_, i) => letterForm(chars, i, seedAt, 'lang3'));
        chars.forEach((c, i) => i && c === chars[i - 1] && expect(f[i]).not.toBe(f[i - 1]));
      }
    }
  });

  it('writes "market" differently in the market / a busy market / market conditions / international market', () => {
    const text = 'the market\na busy market\nmarket conditions\ninternational market';
    const letters = lettersOf(draw(text).strokes).filter(s => s.word === 'market');
    const byWord = {};
    letters.forEach(s => (byWord[s.at] = (byWord[s.at] || []).concat(s.form)));
    const seqs = Object.values(byWord).map(f => f.join(''));
    expect(seqs).toHaveLength(4);
    expect(new Set(seqs).size).toBeGreaterThanOrEqual(3);
    // Each is still "market": six letters, same advance-based width.
    seqs.forEach(sq => expect(sq).toHaveLength(6));
  });

  // Changed in the fidelity refinement: entries are written on letters begun
  // afresh (as on the sheet), not after a baseline exit, where two flicks meet.
  it('lets context steer the form: entry strokes at a word start and after a capital, never after a baseline exit', () => {
    let afterN = 0;
    let afterT = 0;
    let first = 0;
    const isEntered = f => entered('a', 'lang3', f);
    expect([1, 2].map(isEntered)).toEqual([false, true]); // a's entered form is form 2
    expect(glyphContext('n', 'lang3').exit).toBeTruthy();
    for (let s = 0; s < 400; s++) {
      if (isEntered(chooseForm('a', 'n', 'r', s, 'lang3'))) afterN++;
      if (isEntered(chooseForm('a', 'T', 'r', s, 'lang3'))) afterT++;
      if (isEntered(chooseForm('a', null, 'r', s, 'lang3'))) first++;
    }
    expect(afterN).toBe(0);
    expect(afterT).toBeGreaterThan(40);
    expect(first).toBeGreaterThan(afterT);
    // The neighbours take part: same seed, different context → different choices overall.
    const seq = (p, n) => Array.from({ length: 60 }, (_, s) => chooseForm('e', p, n, s, 'lang3')).join('');
    expect(seq('r', 'd')).not.toBe(seq('h', 's'));
  });
});

// --- Stroke rendering --------------------------------------------------------------

describe('stroke model and pressure', () => {
  it('keeps one fine pen: width under 0.26 x-height, pressure varying along each stroke', () => {
    const pen = draw('looping fly hold bright quiz').strokes.filter(s => !s.dot);
    expect(new Set(pen.map(s => s.base)).size).toBe(1);
    pen.forEach(s => {
      expect(Math.max(...s.halfWidth) * 2).toBeLessThan(s.unit * 0.26);
      expect(Math.max(...s.pressure)).toBeGreaterThan(Math.min(...s.pressure));
    });
  });

  it('presses harder on downstrokes than on upstrokes (loops included)', () => {
    let down = 0;
    let nd = 0;
    let up = 0;
    let nu = 0;
    draw(PARA).strokes.filter(s => !s.dot).forEach(s => {
      for (let i = 1; i < s.ys.length; i++) {
        const dy = s.ys[i] - s.ys[i - 1];
        if (dy > 0.05) {
          down += s.pressure[i];
          nd++;
        } else if (dy < -0.05) {
          up += s.pressure[i];
          nu++;
        }
      }
    });
    expect(down / nd).toBeGreaterThan(up / nu);
  });

  it('tapers stroke ends (landing and release lighter than the middle)', () => {
    const long = draw('looping').strokes.filter(s => !s.dot && s.pressure.length > 12);
    expect(long.length).toBeGreaterThan(3);
    long.forEach(s => {
      const mid = Math.max(...s.pressure.slice(3, -3));
      expect(Math.min(s.pressure[0], s.pressure[s.pressure.length - 1])).toBeLessThan(mid);
    });
  });

  it('keeps letters unjoined; exit flicks stay short', () => {
    for (let seed = 0; seed < 40; seed++) {
      for (const [ch, next] of [['a', 'n'], ['h', 'e'], ['l', 'l'], ['o', 'n'], ['u', 'r']]) {
        const st = letterStrokes(ch, { profile: L3, prev: null, next, seed, nextAdvance: 1 });
        expect(st.some(s => s.joined)).toBe(false);
      }
    }
  });

  it('draws digits, punctuation and symbols with Lang3 strokes', () => {
    const { strokes } = draw('2026 25% ₹50 (a) → b & c + d = e • f.');
    const chars = new Set(strokes.map(s => s.char));
    for (const ch of '0256%₹()→&+=•.') expect([ch, chars.has(ch)]).toEqual([ch, true]);
    strokes.forEach(s => expect([s.char, glyphFor(s.char, 'lang3') !== FALLBACK_GLYPH]).toEqual([s.char, true]));
  });
});

// --- Existing systems ----------------------------------------------------------------

describe('Lang3 forms with the existing systems', () => {
  it('does not move layout: word positions depend on advances only', () => {
    const l = layoutHandwriting(PARA, L3, { fontSize: 12.4, contentWidth: 292, lineHeight: 20, seed: 'r1' });
    l.lines.forEach(line => line.words.forEach(w => expect(w.shape.width).toBeGreaterThan(0)));
    expect(hashString(JSON.stringify(l.lines.map(x => x.words.map(w => [w.x, w.shape.text]))))).toBe(
      hashString(JSON.stringify(layoutHandwriting(PARA, L3, { fontSize: 12.4, contentWidth: 292, lineHeight: 20, seed: 'r1' }).lines.map(x => x.words.map(w => [w.x, w.shape.text])))),
    );
  });

  it('Word Space −5…+5 and individual gaps −5…+5 still work', () => {
    const line = 'the market and a busy market';
    const avg = v => {
      const f = applySpanFormat(emptyFormatting(), line, { start: 0, end: line.length }, { spacing: v });
      const w = layoutHandwriting(line, L3, { fontSize: 12.4, contentWidth: 2000, lineHeight: 20, seed: 's', formatting: f }).lines[0].words;
      return w.slice(1).reduce((t, x, i) => t + x.x - (w[i].x + w[i].shape.width), 0) / (w.length - 1);
    };
    const v = WORD_SPACING_STEPS.map(avg);
    for (let i = 1; i < v.length; i++) expect(v[i]).toBeGreaterThan(v[i - 1]);
    const b = boundariesIn(line, { start: 0, end: line.length }).find(x => x.left === 'busy');
    for (const value of [-5, 5]) {
      const f = setWordGap(emptyFormatting(), line, b, value);
      expect(f.gaps[0].value).toBe(value);
      expect(lettersOf(draw(line, f).strokes).length).toBe(line.replace(/ /g, '').length);
    }
  });

  it('keeps selected-text formatting on letters drawn with any form', () => {
    const text = 'Working Capital: international market advantages';
    let f = emptyFormatting();
    f = applySpanFormat(f, text, { start: 0, end: 16 }, { color: '#151515', size: 1.2, mode: 'marker' });
    f = applySpanFormat(f, text, { start: 17, end: text.length }, { color: '#C0392B', size: 0.8 });
    const { strokes } = draw(text, f);
    const first = strokes.filter(s => s.word === 'Working' || s.word === 'Capital:');
    const rest = strokes.filter(s => ['international', 'market', 'advantages'].includes(s.word));
    expect(first.every(s => s.color === '#151515' && s.size === 1.2 && s.mode === 'marker')).toBe(true);
    expect(rest.every(s => s.color === '#C0392B' && s.size === 0.8 && s.mode === 'pen')).toBe(true);
    expect(new Set(lettersOf(strokes).map(s => s.form)).size).toBeGreaterThan(1);
  });

  it('draws natural corrections with Lang3 letterforms', () => {
    const text = `${PARA} `.repeat(4);
    let found = null;
    for (let s = 0; s < 80 && !found; s++) {
      const r = draw(text, undefined, `c1-${s}`, { corrections: true });
      if (r.strokes.some(x => x.pass === 'fix' || x.pass === 'attempt')) found = r;
    }
    expect(found).toBeTruthy();
    found.strokes.filter(x => x.pass === 'fix' || x.pass === 'attempt').forEach(s => {
      expect(!!GLYPHS_LANG3[s.char] || s.char === ' ').toBe(true);
      if (glyphForms(s.char, 'lang3')) expect(s.form).toBeLessThan(glyphForms(s.char, 'lang3').length);
    });
  });

  const paginate = doc => paginateDocument({ content: doc.content, formatting: doc.formatting, pageIds: doc.pageIds, style: L3, metrics, rowHeight, seed: doc.id });
  const renderPage = (page, layout) =>
    JSON.stringify(renderLines(page.lines, { profile: L3, layout, rowHeight, baselineInRow: baselineInRow(rowHeight, L3, layout.fontSize), ink: { floor: 0.86, strength: 1 } }));

  it('paginates and reopens to the identical render (save → load → render)', async () => {
    const content = `${PARA}\n\n${PARA}${PAGE_BREAK}Second page: quiz jazz fjord.`;
    const f = applySpanFormat(emptyFormatting(), content, { start: 4, end: 17 }, { color: '#151515', size: 1.2 });
    const doc = { ...createDocument({ handwritingStyle: LANG3_PROFILE_ID }), content, formatting: f };
    const before = paginate(doc);
    const back = await getDocument((await saveDocument(doc)).id);
    const after = paginate(back);
    expect(after.pages.map(p => [p.start, p.end])).toEqual(before.pages.map(p => [p.start, p.end]));
    before.pages.forEach((p, i) => expect(renderPage(after.pages[i], after.layout)).toBe(renderPage(p, before.layout)));
  });

  it('draws thumbnails with the same Lang3 forms as the editor', async () => {
    const doc = { ...createDocument({ handwritingStyle: LANG3_PROFILE_ID }), content: `${PARA} quiz jazz` };
    const paged = paginate(doc);
    const r = await render(<PaperPage document={doc} page={paged.pages[0]} layout={paged.layout} metrics={metrics} rowHeight={rowHeight} width={110} quality="preview" />);
    const svg = r.root.findAll(n => n.props.testID === 'handwriting-ink' && typeof n.type !== 'string')[0];
    const got = [...new Set(svg.findAll(n => n.props.d).map(n => n.props.d))].join('').split('M').filter(Boolean).sort();
    const r2 = renderLines(paged.pages[0].lines, { profile: L3, layout: paged.layout, rowHeight, baselineInRow: baselineInRow(rowHeight, L3, paged.layout.fontSize), ink: { floor: 0.86, strength: 1 }, quality: 'preview' });
    const want = [...r2.buckets, ...r2.underlines].map(b => b.d).join('').split('M').filter(Boolean).sort();
    expect(got).toEqual(want);
  });

  it.each(['pdf', 'png', 'jpg'])('exports %s with the editor page model and renderer', async format => {
    const doc = { ...createDocument({ handwritingStyle: LANG3_PROFILE_ID }), content: `${PARA} quiz jazz` };
    const paged = { ...paginate(doc), metrics, rowHeight };
    const editor = paged.pages[0].lines.flatMap(l => l.words.map(w => [w.x, w.shape.text, w.shape.seed]));
    let mounted = null;
    const seen = [];
    const grab = () => {
      const p = mounted.root.findAll(n => n.props.testID === 'export-page' && n.props.page)[0];
      seen.push(p.props.page.lines.flatMap(l => l.words.map(w => [w.x, w.shape.text, w.shape.seed])));
    };
    setNativeExporter({
      getExportDirectory: jest.fn(async () => '/c'),
      beginPdf: jest.fn(async () => 'j'),
      addPdfPage: jest.fn(async () => grab()),
      finishPdf: jest.fn(async () => '/c/x.pdf'),
      cancelPdf: jest.fn(),
      captureView: jest.fn(async (t, p) => {
        grab();
        return p;
      }),
      share: jest.fn(async () => true),
    });
    let done = null;
    mounted = await render(<ExportRenderer plan={buildExportPlan({ title: 'R1', format, pageCount: 1 })} document={doc} paged={paged} onProgress={() => {}} onFinish={o => (done = o)} onError={() => {}} />);
    for (let i = 0; i < 200 && !done; i++) {
      await act(async () => {
        await new Promise(res => setTimeout(res, 10));
      });
    }
    expect(done).toBeTruthy();
    // Same words, positions and seeds → the same forms (forms follow the seed).
    expect(seen[0]).toEqual(editor);
  }, 30000);
});

// --- Lang1 / Lang2 ---------------------------------------------------------------------

describe('Lang1 and Lang2 protection', () => {
  it('Lang1 glyphs, spacing and output are unchanged', () => {
    const text = 'The night slips quietly away,\nAnd wakes the gold and blue of day. Working Capital 2026, 25% (a) → done!';
    const l = layoutHandwriting(text, L1, { fontSize: 12.4, contentWidth: 292, lineHeight: 20, seed: 'lang1-lock' });
    const out = JSON.stringify(renderLines(l.lines, { profile: L1, layout: l, rowHeight: 20, baselineInRow: 19, ink: { floor: 0.86, strength: 1 } }));
    expect(hashString(JSON.stringify(GLYPHS))).toBe(3649923111);
    expect(hashString(JSON.stringify(l.lines.map(x => x.words.map(w => [w.x, w.shape.width, w.gap]))))).toBe(4194404481);
    expect(out.length).toBe(47216);
    expect(hashString(out)).toBe(2797748489);
  });

  it('Lang2 glyphs and output are unchanged', () => {
    const text = 'The night slips quietly away,\nAnd wakes the gold and blue of day. Working Capital 2026, 25% (a) → ₹50!';
    const l = layoutHandwriting(text, L2, { fontSize: 12.4, contentWidth: 292, lineHeight: 20, seed: 'lang2-lock' });
    const out = JSON.stringify(renderLines(l.lines, { profile: L2, layout: l, rowHeight: 20, baselineInRow: 19, ink: { floor: 0.86, strength: 1 } }));
    expect(hashString(JSON.stringify(GLYPHS_LANG2))).toBe(1005853950);
    expect(out.length).toBe(52295);
    expect(hashString(out)).toBe(4030609738);
  });

  it('gives Lang1 and Lang2 a single form per letter and no form in their debug output', () => {
    for (const ch of LOWER + UPPER) {
      expect(letterStrokes(ch, { profile: L1, prev: 'a', next: 'b', seed: 7, nextAdvance: 1 }).form).toBe(0);
      expect(letterStrokes(ch, { profile: L2, prev: 'a', next: 'b', seed: 7, nextAdvance: 1 }).form).toBe(0);
    }
    const l = layoutHandwriting('aaaa market', L2, { fontSize: 12.4, contentWidth: 292, lineHeight: 20, seed: 'x' });
    const dbg = [];
    renderLines(l.lines, { profile: L2, layout: l, rowHeight: 20, baselineInRow: 19, ink: { floor: 0.86, strength: 1 }, debug: dbg });
    expect(dbg.some(s => 'form' in s)).toBe(false);
  });
});
