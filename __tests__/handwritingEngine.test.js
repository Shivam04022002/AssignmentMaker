/**
 * Phase 2 handwriting engine: determinism, variation, personalities,
 * baseline, layout (long words, paragraphs, punctuation, spacing), pens,
 * tuning and persistence.
 */
import React from 'react';
import { clearAllMockStorages } from '@react-native-async-storage/async-storage';
import {
  VARIATION_LIMITS,
  getHandwritingStyle,
  getHandwritingStyles,
  resetStyleOverrides,
  setStyleOverrides,
} from '../src/data/handwritingStyles';
import { XH_EM } from '../src/handwriting/handwritingProfiles';
import { PENS, getPen, inkColor } from '../src/data/pens';
import { PAGE_TYPES, getPageMetrics, rowHeightFor } from '../src/data/paper';
import {
  TUNING_PARAMETERS,
  exportStyleConfig,
  getTuningValue,
  resetTuning,
  stepTuningValue,
} from '../src/dev/tuning';
import { createDocument } from '../src/models/document';
import EditorScreen from '../src/screens/EditorScreen';
import {
  getDocument,
  saveDocument,
  setStorageBackend,
} from '../src/storage/documentStorage';
import {
  breakLongWord,
  createMeasurer,
  layoutHandwriting,
  tokenizeWithSpacing,
  verticalMetrics,
} from '../src/utils/textLayout';
import { randomFor } from '../src/utils/variation';
import {
  act,
  byTestId,
  changeText,
  inkAlphas,
  inkColors,
  render,
  renderedHandwriting,
  restoreRealTimers,
} from './helpers/render';

// One handwriting since Phase 7; old ids ('neat', …) resolve to it.
const STYLE_IDS = ['reference_student'];
const page = getPageMetrics();
const opts = (extra = {}) => ({
  fontSize: page.fontSize,
  contentWidth: page.contentWidth,
  seed: 'doc-1',
  ...extra,
});
const layout = (text, id = 'neat', extra) =>
  layoutHandwriting(text, getHandwritingStyle(id), opts(extra));
const lineTexts = l =>
  l.lines.map(line => line.words.map(w => w.shape.text).join(' '));
const lineWidth = line => {
  const last = line.words[line.words.length - 1];
  return last ? last.x + last.shape.width : 0;
};
/** Strip the shape cache (identity bookkeeping) before deep comparison. */
const model = l => ({ ...l, cache: undefined });

afterEach(() => resetStyleOverrides());

describe('deterministic variation', () => {
  const text = 'Dear Sir,\n\nI am writing this application to request leave.';

  it.each(STYLE_IDS)(
    'produces identical output for identical input (%s)',
    id => {
      expect(model(layout(text, id))).toEqual(model(layout(text, id)));
    },
  );

  it('never calls Math.random while laying out', () => {
    const spy = jest.spyOn(Math, 'random');
    STYLE_IDS.forEach(id => layout(text, id));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('seeds by document id and page id', () => {
    const base = layout(text).paragraphs[2].words;
    expect(
      layout(text, 'neat', { seed: 'doc-2' }).paragraphs[2].words,
    ).not.toEqual(base);
    expect(
      layout(text, 'neat', { pageId: 'page-2' }).paragraphs[2].words,
    ).not.toEqual(base);
  });

  it('gives repeated words their own shape ("letter letter letter letter")', () => {
    const words = layout('letter letter letter letter').paragraphs[0].words;
    const signatures = words.map(w =>
      JSON.stringify([
        w.rotate,
        w.translateY,
        w.scale,
        w.chars.map(c => [c.rotate, c.translateY]),
      ]),
    );
    expect(new Set(signatures).size).toBe(4);
  });

  it('gives repeated letters within a word different marks', () => {
    const word = layout('mississippi').paragraphs[0].words[0];
    const sChars = word.chars.filter(c => c.char === 's');
    expect(
      new Set(sChars.map(c => `${c.rotate}/${c.translateY}/${c.scale}`)).size,
    ).toBe(4);
  });

  it('keeps unrelated words stable when the text changes elsewhere', () => {
    const before = layout('Alpha beta gamma\nDelta epsilon');
    const after = layout('Alpha beta gamma\nDelta zeta epsilon');
    expect(after.paragraphs[0]).toEqual(before.paragraphs[0]);
    const find = (l, t) => l.paragraphs[1].words.find(w => w.text === t);
    expect(find(after, 'epsilon')).toEqual(find(before, 'epsilon'));
  });

  it('reuses unchanged word shapes between layouts (render cache)', () => {
    const style = getHandwritingStyle('neat');
    const first = layoutHandwriting('One two three', style, opts());
    const second = layoutHandwriting('One two three four', style, {
      ...opts(),
      cache: first.cache,
    });
    first.paragraphs[0].words.forEach((shape, i) => {
      expect(second.paragraphs[0].words[i]).toBe(shape);
    });
  });

  it('a seeded generator repeats exactly', () => {
    const a = randomFor('doc', 'page-1', 'word#0', 3);
    const b = randomFor('doc', 'page-1', 'word#0', 3);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('word and character variation', () => {
  const sample =
    'The quick brown fox jumps over the lazy dog while the writer keeps a steady hand across the page. '.repeat(
      3,
    );

  it.each(STYLE_IDS)('stays subtle (%s)', id => {
    const style = getHandwritingStyle(id);
    const l = layout(sample, id);
    for (const w of l.paragraphs[0].words) {
      expect(Math.abs(w.rotate)).toBeLessThanOrEqual(2);
      expect(w.scale).toBeGreaterThanOrEqual(0.97);
      expect(w.scale).toBeLessThanOrEqual(1.03);
      expect(w.opacity).toBeGreaterThanOrEqual(0.9);
      expect(Math.abs(w.translateY)).toBeLessThanOrEqual(0.06 * l.unit);
      expect(Math.abs(w.slant - style.slant)).toBeLessThanOrEqual(
        style.variation.slant,
      );
      for (const c of w.chars || []) {
        expect(c.opacity).toBeGreaterThanOrEqual(0.88);
        if (c.rotate !== undefined) {
          expect(Math.abs(c.rotate)).toBeLessThanOrEqual(
            VARIATION_LIMITS.rotation,
          );
          expect(Math.abs(c.scale - 1)).toBeLessThanOrEqual(0.06);
        }
      }
    }
  });

  it('varies words independently: rotation, offset, scale, spacing and ink all differ', () => {
    const words = layout(sample, 'casual').paragraphs[0].words;
    for (const key of [
      'rotate',
      'translateY',
      'scale',
      'letterSpacing',
      'opacity',
      'gapJitter',
    ]) {
      expect(new Set(words.map(w => w[key])).size).toBeGreaterThan(5);
    }
  });

  it('wanders the baseline along a line, gently', () => {
    const l = layout(sample, 'casual');
    const drifts = l.lines[0].words.map(w => w.drift);
    expect(new Set(drifts).size).toBeGreaterThan(3);
    drifts.forEach(d => expect(Math.abs(d)).toBeLessThan(0.1 * l.unit + 2));
  });


});

describe('baseline', () => {
  it.each(STYLE_IDS)('uses the glyph set metrics (%s)', id => {
    const style = getHandwritingStyle(id);
    expect(style.metrics.xHeight).toBe(XH_EM);
    expect(style.metrics.inkAscent).toBeCloseTo(style.ascender * XH_EM);
    expect(style.metrics.inkDescent).toBeCloseTo(style.descender * XH_EM);
    expect(style.metrics.baseline).toBe(0);
  });

  it.each(STYLE_IDS)('applies the configured baselineAdjust (%s)', id => {
    const size = page.fontSize * getHandwritingStyle(id).fontScale;
    const before = verticalMetrics(
      getHandwritingStyle(id),
      size,
      page.lineSpacing,
    );
    setStyleOverrides(id, { baselineAdjust: 0.1 });
    const after = verticalMetrics(
      getHandwritingStyle(id),
      size,
      page.lineSpacing,
    );
    expect(after.translateY - before.translateY).toBeCloseTo(0.1 * size, 2);
    expect(after.lineHeight).toBe(before.lineHeight);
  });
});

describe('long words', () => {
  it('splits a word longer than a line into pieces that fit', () => {
    const measure = createMeasurer(getHandwritingStyle('reference_student'), 20);
    const word = 'Pneumonoultramicroscopicsilicovolcanoconiosis';
    const pieces = breakLongWord(word, measure, 120, 120);
    expect(pieces.length).toBeGreaterThan(1);
    pieces.forEach(p => {
      expect(
        Array.from(p).reduce((w, c) => w + measure(c), 0),
      ).toBeLessThanOrEqual(120);
    });
    expect(pieces.join('').replace(/-/g, '')).toBe(word);
  });

  it('prefers natural break points such as "/" over hyphenating', () => {
    const measure = createMeasurer(getHandwritingStyle('reference_student'), 20);
    const pieces = breakLongWord(
      'https://example.com/a/very/long/path',
      measure,
      150,
      150,
    );
    pieces.slice(0, -1).forEach(p => expect(p).toMatch(/[/.:]$/));
  });

  it('does not break normal words', () => {
    const l = layout('Supercalifragilistic is long but fits on one line.');
    for (const line of l.lines) {
      for (const item of line.words) {
        expect(item.shape.text).not.toMatch(/\w-$/);
      }
    }
  });

  const tricky = [
    'Supercalifragilisticexpialidocious-and-more antidisestablishmentarianism',
    'https://example.com/a/very/long/path/that/never/ends/at/all?query=string&x=1',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm wwwwwwwwwwwwwwwwwwwwwwwww',
    `${'word '.repeat(80)}`,
    '    Indented paragraph with a WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW word.',
    'Emoji 😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀 and ünïcödé wörds',
  ];

  it.each(STYLE_IDS)('never lets a line overflow the page (%s)', id => {
    for (const text of tricky) {
      const l = layout(text, id);
      for (const line of l.lines) {
        // Closing punctuation may hang ≤ 0.4 em into the margin by design.
        expect(lineWidth(line)).toBeLessThanOrEqual(
          page.contentWidth + 0.4 * l.unit,
        );
      }
      const original = text.trim().replace(/\s+/g, '');
      const rendered = l.lines
        .flatMap(line => line.words.map(w => w.shape.text))
        .join('');
      expect(rendered.replace(/-/g, '')).toBe(original.replace(/-/g, ''));
    }
  });
});

describe('paragraphs, spacing and punctuation', () => {
  const letter =
    'Dear Sir,\n\nI am writing this application to request leave.\n\nI will return to work after the requested leave period.\n\nThank you.';

  it('turns blank lines into paragraph spacing of one ruled line', () => {
    const l = layout(letter);
    expect(l.paragraphs.map(p => p.kind)).toEqual([
      'text',
      'blank',
      'text',
      'blank',
      'text',
      'blank',
      'text',
    ]);
    expect(
      l.paragraphs
        .filter(p => p.kind === 'blank')
        .every(p => p.lines.length === 1),
    ).toBe(true);
    expect(l.paragraphs[2].breakBefore).toBe('paragraph');
  });

  it('distinguishes a single line break from a paragraph break', () => {
    const l = layout('Yours faithfully,\nJohn');
    expect(l.paragraphs.map(p => p.kind)).toEqual(['text', 'text']);
    expect(l.paragraphs[1].breakBefore).toBe('line');
    expect(l.lineCount).toBe(2);
  });

  it('keeps every blank line the user typed', () => {
    expect(layout('a\n\n\n\nb').lineCount).toBe(5);
  });

  it('widens the gap for extra typed spaces', () => {
    const one = layout('a b').lines[0].words[0].gap;
    const three = layout('a   b').lines[0].words[0].gap;
    expect(three).toBeGreaterThan(one);
  });

  it('adds a little air after a sentence', () => {
    const style = getHandwritingStyle('neat');
    setStyleOverrides('neat', { variation: { spacing: 0 } });
    const plain = layout('word next').lines[0].words[0].gap;
    const sentence = layout('word. next').lines[0].words[0].gap;
    expect(sentence).toBeGreaterThan(plain);
    expect(style).toBeTruthy();
  });

  it('turns leading spaces and tabs into an indent', () => {
    expect(tokenizeWithSpacing('\tHello').indent).toBe(4);
    expect(layout('    Hello').paragraphs[0].indent).toBeGreaterThan(0);
  });

  it('never starts a line with detached closing punctuation', () => {
    for (const id of STYLE_IDS) {
      for (let n = 20; n < 60; n++) {
        const l = layout(`${'ab '.repeat(n)}word !`, id);
        for (const line of l.lines.slice(1)) {
          expect(line.words[0].shape.text).not.toBe('!');
        }
      }
    }
  });

  it('wraps identically every time (fixed-width layout)', () => {
    const a = lineTexts(layout(letter, 'rounded'));
    const b = lineTexts(layout(letter, 'rounded'));
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(7);
  });

  it('uses the style line height on blank paper only', () => {
    const [blank, lined] = PAGE_TYPES;
    const fast = getHandwritingStyle('fast');
    expect(rowHeightFor(lined, page, fast)).toBe(page.lineSpacing);
    expect(rowHeightFor(blank, page, fast)).toBe(
      Math.round(page.lineSpacing * fast.lineHeight),
    );
  });
});

describe('pens and ink', () => {
  it('defines realistic blue and black inks', () => {
    expect(getPen('blue')).toMatchObject({
      color: '#123A8C',
      kind: 'ballpoint',
    });
    expect(getPen('black').color).toBe('#151515');
    expect(getPen('black').color).not.toBe('#000000');
    for (const pen of PENS) {
      expect(pen.ink.floor).toBeGreaterThanOrEqual(0.85);
      expect(pen.ink.bleed.opacity).toBeLessThanOrEqual(0.3);
    }
  });

  it('expresses ink strength as an rgba of the pen colour', () => {
    expect(inkColor('#123A8C', 1)).toBe('#123A8C');
    expect(inkColor('#123A8C', 0.9)).toBe('rgba(18,58,140,0.9)');
  });
});

describe('developer tuning', () => {
  it('covers the required parameters', () => {
    const ids = TUNING_PARAMETERS.map(p => p.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'baselineAdjust',
        'fontSize',
        'lineHeight',
        'letterSpacing',
        'rotation',
        'verticalVariation',
        'scaleVariation',
        'opacityVariation',
      ]),
    );
  });

  it('steps a value, clamps it, exports it and resets', () => {
    const param = TUNING_PARAMETERS.find(p => p.id === 'rotation');
    const base = getTuningValue('casual', param);
    stepTuningValue('casual', param, 1);
    expect(getTuningValue('casual', param)).toBeCloseTo(base + param.step);
    for (let i = 0; i < 200; i++) {
      stepTuningValue('casual', param, 1);
    }
    expect(getTuningValue('casual', param)).toBe(param.max);
    expect(JSON.parse(exportStyleConfig('casual')).variation.rotation).toBe(
      param.max,
    );
    resetTuning('casual');
    expect(getTuningValue('casual', param)).toBe(base);
  });

  it('never changes documents or adds styles', () => {
    const count = getHandwritingStyles().length;
    const doc = createDocument({ handwritingStyle: 'casual' });
    stepTuningValue('casual', TUNING_PARAMETERS[0], 3);
    expect(doc).toEqual({ ...doc });
    expect(getHandwritingStyles().length).toBe(count);
  });
});

describe('rendering and persistence', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    clearAllMockStorages();
    setStorageBackend(null);
  });
  afterEach(() => restoreRealTimers(jest));

  const snapshot = renderer =>
    JSON.stringify(
      renderer.root
        .findAll(
          n =>
            n.props.testID === 'handwriting-text' && typeof n.type === 'string',
        )[0]
        .findAll(n => n.type === 'Text' || n.type === 'View')
        .map(n => [
          n.props.style,
          n.props.children && typeof n.props.children === 'string'
            ? n.props.children
            : null,
        ]),
    );

  it('reopening a document preserves text, style, pen, page type and identical handwriting', async () => {
    const saved = await saveDocument({
      ...createDocument({
        pageType: 'blank',
        pen: 'black',
        handwritingStyle: 'fast',
      }),
      content: 'Dear Sir,\n\nletter letter letter.',
    });

    const first = await render(
      <EditorScreen documentId={saved.id} onClose={jest.fn()} />,
    );
    await act(async () => {});
    const firstLook = snapshot(first);
    await act(async () => first.unmount());

    const reloaded = await getDocument(saved.id);
    expect(reloaded).toMatchObject({
      content: 'Dear Sir,\n\nletter letter letter.',
      handwritingStyle: 'fast',
      pen: 'black',
      pageType: 'blank',
    });

    const second = await render(
      <EditorScreen documentId={saved.id} onClose={jest.fn()} />,
    );
    await act(async () => {});
    expect(renderedHandwriting(second)).toBe(
      'Dear Sir,\n\nletter letter letter.',
    );
    expect(inkColors(second)).toEqual(new Set(['#151515']));
    expect(snapshot(second)).toBe(firstLook);
  });

  it('unrelated UI state does not change the handwriting', async () => {
    const doc = { ...createDocument(), content: 'Steady handwriting here.' };
    const renderer = await render(
      <EditorScreen initialDocument={doc} onClose={jest.fn()} />,
    );
    const before = snapshot(renderer);
    await act(async () => {
      byTestId(renderer, 'menu-button', 'onPress').props.onPress();
    });
    await changeText(renderer, 'title-input', 'Renamed');
    expect(snapshot(renderer)).toBe(before);
  });

  it('varies ink subtly, never below the pen floor', async () => {
    const doc = {
      ...createDocument(),
      content: 'The quick brown fox jumps over the lazy dog again and again.',
    };
    const renderer = await render(
      <EditorScreen initialDocument={doc} onClose={jest.fn()} />,
    );
    // Ink strength is bucketed (a few paths per page), so it varies over a
    // few levels between the pen's floor and full ink.
    const alphas = inkAlphas(renderer);
    expect(new Set(alphas).size).toBeGreaterThanOrEqual(2);
    alphas.forEach(a => {
      expect(a).toBeGreaterThanOrEqual(getPen('blue').ink.floor);
      expect(a).toBeLessThanOrEqual(1);
    });
  });
});
