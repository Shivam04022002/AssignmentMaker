/**
 * Lang2: the joined school hand of reference/Lang2.png, as a second
 * handwriting profile beside Lang1 (which stays unchanged).
 */
import React from 'react';
import { clearAllMockStorages } from '@react-native-async-storage/async-storage';
import {
  DEFAULT_HANDWRITING_STYLE,
  getHandwritingStyle,
  resolveStyleId,
} from '../src/data/handwritingStyles';
import { baselineInRow } from '../src/components/HandwritingText';
import { renderLines } from '../src/handwriting/glyphRender';
import { GLYPHS, GLYPHS_LANG2, glyphFor } from '../src/handwriting/glyphs';
import {
  LANG2_PROFILE,
  LANG2_PROFILE_ID,
  REFERENCE_PROFILE,
} from '../src/handwriting/handwritingProfiles';
import {
  glyphContext,
  letterStrokes,
  sampleChain,
} from '../src/handwriting/strokeModel';
import { createDocument, normalizeDocument } from '../src/models/document';
import NewDocumentScreen from '../src/screens/NewDocumentScreen';
import {
  getDocument,
  saveDocument,
  setStorageBackend,
} from '../src/storage/documentStorage';
import { applySpanFormat, emptyFormatting } from '../src/utils/formatting';
import { layoutHandwriting } from '../src/utils/textLayout';
import { byTestId, press, render } from './helpers/render';

const L1 = getHandwritingStyle('reference_student');
const L2 = getHandwritingStyle(LANG2_PROFILE_ID);
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const ys = g => g.strokes.flatMap(p => p.filter((_, i) => i % 2));
const top = g => Math.max(...ys(g));
const bottom = g => Math.min(...ys(g));

function draw(text, profile = L2, options = {}) {
  const layout = layoutHandwriting(text, profile, {
    fontSize: 12.4,
    contentWidth: 292,
    lineHeight: 20,
    seed: options.seed || 'lang2',
    formatting: options.formatting,
    corrections: options.corrections,
  });
  const strokes = [];
  const drawn = renderLines(layout.lines, {
    profile,
    layout,
    rowHeight: 20,
    baselineInRow: baselineInRow(20, profile, layout.fontSize),
    ink: { floor: 0.86, strength: 1 },
    debug: strokes,
  });
  return { layout, drawn, strokes };
}

beforeEach(() => {
  clearAllMockStorages();
  setStorageBackend(null);
});

describe('Lang2 profile', () => {
  it('is a separate profile; Lang1 stays the default and unchanged', () => {
    expect(L2.id).toBe('reference_student_lang2');
    expect(L2.glyphSet).toBe('lang2');
    expect(DEFAULT_HANDWRITING_STYLE).toBe('reference_student');
    expect(L1.glyphSet).toBeUndefined();
    // Lang1's measured settings are untouched.
    expect(REFERENCE_PROFILE).toMatchObject({ xHeightPerPitch: 0.31, strokeWidth: 0.16, letterGap: 0.25, wordGap: 1.75 });
  });

  it('carries the Lang2 reference measurements', () => {
    // analyze-reference.js on Lang2.png: x-height/pitch 0.24, ascender 1.75,
    // descender 1.13, word gap 2.38 x-heights, fine stroke.
    expect(LANG2_PROFILE.xHeightPerPitch).toBeGreaterThan(0.22);
    expect(LANG2_PROFILE.xHeightPerPitch).toBeLessThan(0.3);
    expect(LANG2_PROFILE.ascender).toBeCloseTo(1.75, 2);
    expect(LANG2_PROFILE.descender).toBeGreaterThanOrEqual(0.95);
    expect(LANG2_PROFILE.wordGap).toBeGreaterThan(2.1);
    expect(LANG2_PROFILE.strokeWidth).toBeLessThan(REFERENCE_PROFILE.strokeWidth);
  });

  it('resolves the profile ids, old and new', () => {
    expect(resolveStyleId('reference_student_lang2')).toBe('reference_student_lang2');
    expect(resolveStyleId('reference_student_lang1')).toBe('reference_student');
    expect(resolveStyleId('cursive')).toBe('reference_student'); // old font ids → Lang1
  });
});

describe('Lang2 glyphs and stroke order', () => {
  it('has its own complete set: letters, capitals, digits, punctuation, symbols', () => {
    for (const ch of LOWER) {
      expect([ch, glyphFor(ch, 'lang2')]).toEqual([ch, GLYPHS_LANG2[ch]]);
      expect(glyphFor(ch, 'lang2')).not.toEqual(GLYPHS[ch]);
    }
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:;?!()-/%•&@+→←°₹') {
      expect([ch, glyphFor(ch, 'lang2')]).toEqual([ch, GLYPHS_LANG2[ch]]);
    }
    // Lang1 is unaffected.
    expect(glyphFor('a')).toBe(GLYPHS.a);
  });

  it('starts joining letters with an upstroke from the baseline', () => {
    for (const ch of 'beiklmnprstuy') {
      const [x, y] = glyphFor(ch, 'lang2').strokes[0];
      expect([ch, x < 0.12 && y < 0.25]).toEqual([ch, true]);
    }
  });

  it('ends letters with an exit to the right — o, r, v, w from the top', () => {
    for (const ch of 'acdehiklmnstuz') {
      const info = glyphContext(ch, 'lang2');
      expect([ch, !!info.exit && !info.exit.high]).toEqual([ch, true]);
    }
    // r leaves from its arm at the top, like o, v and w.
    for (const ch of 'orvw') {
      expect([ch, glyphContext(ch, 'lang2').exit.high]).toEqual([ch, true]);
      if (ch !== 'r') expect(glyphContext(ch).exit).toBeNull(); // Lang1 o/v/w do not join
    }
  });

  it('draws tall looped ascenders and long descenders', () => {
    for (const ch of 'bdhkl') {
      expect([ch, top(glyphFor(ch, 'lang2')) > 1.65]).toEqual([ch, true]);
    }
    for (const ch of 'fgjpqy') {
      expect([ch, bottom(glyphFor(ch, 'lang2')) < -0.85]).toEqual([ch, true]);
    }
    // f: a top hook and a loop below the line, as in the reference.
    expect(glyphFor('f', 'lang2').strokes).toHaveLength(2);
  });

  it('writes the cursive r (up, a small flag, one stroke down) distinct from n', () => {
    // Downstrokes that fall from x-height to the baseline: r has one, n two.
    const downstrokes = ch => {
      const { ys: y } = sampleChain(glyphFor(ch, 'lang2').strokes[0]);
      let count = 0;
      let high = false;
      for (const v of y) {
        if (v > 0.75) high = true;
        if (high && v < 0.2) {
          count++;
          high = false;
        }
      }
      return count;
    };
    expect(downstrokes('r')).toBe(1);
    expect(downstrokes('n')).toBe(2);
    // The flag is small: r is much narrower than n.
    expect(glyphFor('r', 'lang2').w).toBeLessThan(glyphFor('n', 'lang2').w * 0.75);
  });
});

describe('Lang2 connections (semi-cursive)', () => {
  const words = 'working capital management strategic process of managing assets liabilities ensure sufficient liquidity operate efficiently balancing between solvency heavily influenced banking regulations unique credit cycles market'.split(' ');

  it('joins many, but not all, neighbouring letters', () => {
    let pairs = 0;
    let joined = 0;
    words.forEach((w, wi) => {
      const letters = Array.from(w);
      letters.forEach((ch, i) => {
        const next = letters[i + 1];
        if (!next || !glyphContext(ch, 'lang2').exit) return;
        pairs++;
        const st = letterStrokes(ch, { profile: L2, prev: letters[i - 1], next, seed: wi * 31 + i, nextAdvance: 0.8 });
        if (st.some(s => s.joined)) joined++;
      });
    });
    const share = joined / pairs;
    expect(share).toBeGreaterThan(0.4);
    expect(share).toBeLessThan(0.85);
  });

  it('joins from the top after o, at x-height', () => {
    let seen = false;
    for (let seed = 0; seed < 30; seed++) {
      const st = letterStrokes('o', { profile: L2, prev: 'w', next: 'r', seed, nextAdvance: 0.8 }).find(s => s.tail);
      if (st && st.joined) {
        seen = true;
        expect(st.ys[st.ys.length - 1]).toBeGreaterThan(0.6);
      }
    }
    expect(seen).toBe(true);
  });

  it('meets a round letter at its upper left, never through the bowl', () => {
    for (let seed = 0; seed < 30; seed++) {
      const st = letterStrokes('e', { profile: L2, prev: 'h', next: 'a', seed, nextAdvance: 0.84 }).find(s => s.tail);
      const endX = st.xs[st.xs.length - 1];
      const leftOfA = 0.84 + glyphContext('a', 'lang2').left;
      expect(endX).toBeLessThanOrEqual(leftOfA);
      if (st.joined) expect(st.ys[st.ys.length - 1]).toBeGreaterThan(0.5);
    }
  });

  it('leaves Lang1 exactly as before (no joins from the top)', () => {
    const st = letterStrokes('o', { profile: L1, prev: 'w', next: 'r', seed: 3, nextAdvance: 0.8 });
    expect(st.some(s => s.tail)).toBe(false);
  });
});

describe('Lang2 rendering', () => {
  const TEXT = "Q1. What is working capital management in India?\nAns:\nWorking Capital Management (WCM) in India refers to the strategic process of managing a company's short-term assets.\n1. Key Concepts and Definitions\n• Gross Working Capital (GWC): cash, inventory, and receivables.";

  it('is deterministic, and different from Lang1', () => {
    expect(draw(TEXT).drawn).toEqual(draw(TEXT).drawn);
    expect(draw(TEXT).drawn).not.toEqual(draw(TEXT, L1).drawn);
  });

  it('writes headings, Ans:, numbers and bullets with the same Lang2 hand', () => {
    const line = '1. Key Concepts and Definitions';
    const start = TEXT.indexOf(line);
    const formatting = { ...emptyFormatting(), headings: [{ start, end: start + line.length, underline: true }] };
    const { strokes, layout, drawn } = draw(TEXT, L2, { formatting });
    const strokeOf = (word, char) => strokes.find(s => s.word === word && s.char === char && !s.dot);
    // The heading's "e" is a Lang2 e (one looped stroke from the baseline).
    const he = strokeOf('Key', 'e');
    expect(he).toBeTruthy();
    expect(layout.paragraphs.find(p => p.heading)).toBeTruthy();
    expect(drawn.underlines.length).toBeGreaterThan(0);
    expect(strokeOf('Ans:', 'n')).toBeTruthy();
    expect(strokes.some(s => s.word === '•')).toBe(true);
    expect(strokes.some(s => s.word === '1.' && s.char === '1')).toBe(true);
  });

  it('presses harder on downstrokes, with more contrast than Lang1', () => {
    const contrast = profile => {
      const { strokes } = draw('minimum running hill', profile);
      const ratios = strokes.filter(s => !s.dot).map(s => Math.max(...s.halfWidth) / Math.min(...s.halfWidth));
      return ratios.reduce((a, b) => a + b, 0) / ratios.length;
    };
    expect(contrast(L2)).toBeGreaterThan(contrast(L1));
  });

  it('keeps the profile for selected-text formatting and corrections', () => {
    const text = 'The night slips quietly away.';
    const at = text.indexOf('slips quietly');
    const formatting = applySpanFormat(emptyFormatting(), text, { start: at, end: at + 13 }, { color: '#151515', size: 1.2 });
    const { strokes } = draw(text, L2, { formatting });
    strokes.filter(s => s.word === 'slips').forEach(s => expect(s).toMatchObject({ color: '#151515', size: 1.2 }));
    // Corrections plan and draw with Lang2 too.
    const long =
      'In the Indian business landscape, working capital management is a delicate balancing act between profitability and solvency, heavily influenced by local banking regulations and the unique credit cycles of the market. Companies must maintain a satisfactory level of working capital to avoid the risk of technical insolvency or bankruptcy, while still investing enough in inventory, receivables and cash to operate efficiently every single day of the financial year. ';
    let found = null;
    for (let seed = 0; seed < 40 && !found; seed++) {
      const result = draw(long.repeat(2), L2, { corrections: true, seed: `fix-${seed}` });
      if (result.layout.corrections.some(c => c.kind !== 'dot')) found = result;
    }
    expect(found).toBeTruthy();
    // Correction strokes are drawn with the Lang2 hand too.
    expect(found.strokes.some(s => s.pass === 'fix' || s.pass === 'strike' || s.pass === 'attempt')).toBe(true);
  });
});

describe('choosing Lang2', () => {
  it('creates, saves and reopens a Lang2 document', async () => {
    const doc = createDocument({ handwritingStyle: LANG2_PROFILE_ID });
    expect(doc.handwritingStyle).toBe(LANG2_PROFILE_ID);
    const saved = await saveDocument({ ...doc, content: 'Lang2 text' });
    expect((await getDocument(saved.id)).handwritingStyle).toBe(LANG2_PROFILE_ID);
    // Old documents keep resolving to Lang1.
    expect(getHandwritingStyle(normalizeDocument({ handwritingStyle: 'neat' }).handwritingStyle).id).toBe('reference_student');
  });

  it('offers both handwritings on the New Document screen', async () => {
    const onCreate = jest.fn();
    const r = await render(<NewDocumentScreen onCreate={onCreate} onBack={jest.fn()} />);
    const selected = id => byTestId(r, id, 'accessibilityState').props.accessibilityState.selected;
    expect(selected('handwriting-reference')).toBe(true);
    expect(selected('handwriting-reference-lang2')).toBe(false);
    await press(r, 'handwriting-reference-lang2');
    expect(selected('handwriting-reference-lang2')).toBe(true);
    await press(r, 'create-document-button');
    expect(onCreate.mock.calls[0][0].handwritingStyle).toBe(LANG2_PROFILE_ID);
  });
});

describe('performance', () => {
  it.each([500, 1000, 2500, 5000])('draws %i characters of Lang2 as a few grouped paths', n => {
    const text = 'Working capital management refers to the strategic process of managing. '.repeat(80).slice(0, n);
    const started = Date.now();
    const { drawn } = draw(text);
    // Coarse guard: Jest runs untransformed-for-speed code and suites in
    // parallel; plain Node takes well under a second for 5,000 characters.
    expect(Date.now() - started).toBeLessThan(20000);
    expect(drawn.buckets.length).toBeLessThan(12);
  });
});
