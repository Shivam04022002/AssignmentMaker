import { getHandwritingStyle } from '../src/data/handwritingStyles';
import {
  createRandom,
  layoutHandwriting,
  splitLongWord,
  splitParagraphs,
  tokenizeParagraph,
  verticalMetrics,
} from '../src/utils/textLayout';

const neat = getHandwritingStyle('neat');
const cursive = getHandwritingStyle('cursive');

describe('text structure', () => {
  it('keeps paragraphs and blank lines', () => {
    expect(splitParagraphs('Dear Sir,\n\nThanks')).toEqual([
      'Dear Sir,',
      '',
      'Thanks',
    ]);
    expect(splitParagraphs('a\r\nb')).toEqual(['a', 'b']);
    expect(splitParagraphs('')).toEqual(['']);
  });

  it('turns leading whitespace into an indent', () => {
    expect(tokenizeParagraph('  Hello   world')).toEqual({
      indent: 2,
      words: ['Hello', 'world'],
    });
    expect(tokenizeParagraph('\tTab').indent).toBe(4);
  });

  it('splits words that cannot fit on a line', () => {
    expect(splitLongWord('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
    expect(splitLongWord('short', 10)).toEqual(['short']);
  });
});

describe('layoutHandwriting', () => {
  const text = 'Dear Sir,\n\nI am writing this application.';

  it('is deterministic for the same input', () => {
    expect(layoutHandwriting(text, neat, { seed: 'd1' })).toEqual(
      layoutHandwriting(text, neat, { seed: 'd1' }),
    );
  });

  it('varies between documents (seed) and words', () => {
    const a = layoutHandwriting(text, neat, { seed: 'd1' });
    const b = layoutHandwriting(text, neat, { seed: 'd2' });
    expect(a.paragraphs[2].words).not.toEqual(b.paragraphs[2].words);

    const rotations = a.paragraphs[2].words.map(w => w.rotate);
    expect(new Set(rotations).size).toBeGreaterThan(1);
  });

  it('keeps variation subtle', () => {
    const { paragraphs, fontSize } = layoutHandwriting(text, neat, {
      fontSize: 20,
    });
    for (const word of paragraphs.flatMap(p => p.words)) {
      expect(Math.abs(word.rotate)).toBeLessThanOrEqual(
        neat.variation.rotation,
      );
      expect(Math.abs(word.translateY)).toBeLessThan(fontSize * 0.1);
      expect(word.opacity).toBeGreaterThan(0.8);
    }
  });

  it('does not re-jitter other paragraphs when one is edited', () => {
    const before = layoutHandwriting('First line here\nSecond line', neat, {
      seed: 's',
    });
    const after = layoutHandwriting(
      'First line here\nSecond line edited',
      neat,
      {
        seed: 's',
      },
    );
    expect(after.paragraphs[0]).toEqual(before.paragraphs[0]);
  });

  it('splits words into individually jittered letters (print hand)', () => {
    const word = layoutHandwriting('Hello', neat).paragraphs[0].words[0];
    expect(word.chars.map(c => c.char).join('')).toBe('Hello');
    // Each letter gets its own small, deterministic jitter.
    expect(new Set(word.chars.map(c => c.rotate)).size).toBeGreaterThan(1);
  });

  it('applies the style font scale', () => {
    expect(
      layoutHandwriting('x', cursive, { fontSize: 20 }).fontSize,
    ).toBeCloseTo(20 * cursive.fontScale);
  });
});

describe('createRandom', () => {
  it('produces repeatable values in [0, 1)', () => {
    const a = createRandom(42);
    const b = createRandom(42);
    for (let i = 0; i < 100; i++) {
      const value = a();
      expect(value).toBe(b());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('verticalMetrics', () => {
  it('puts the visible baseline of every style on the ruled line', () => {
    const rowHeight = 28;
    for (const id of ['neat', 'casual', 'cursive', 'rounded', 'fast']) {
      const style = getHandwritingStyle(id);
      const size = 21 * style.fontScale;
      const { lineHeight, translateY } = verticalMetrics(
        style,
        size,
        rowHeight,
      );
      const m = style.metrics;

      // Never shorter than the font box, so Android and iOS agree.
      expect(lineHeight).toBeGreaterThanOrEqual((m.ascent + m.descent) * size);

      const baseline =
        translateY +
        (lineHeight - (m.ascent + m.descent) * size) / 2 +
        m.ascent * size;
      const visibleBottom = baseline - m.baseline * size;
      expect(visibleBottom).toBeGreaterThan(rowHeight - 3);
      expect(visibleBottom).toBeLessThanOrEqual(rowHeight);
    }
  });
});

describe('style metrics', () => {
  it('sizes the x-height to the measured share of the line pitch', () => {
    const style = getHandwritingStyle('reference_student');
    // Page font size is 0.62 × pitch; the visible x-height is XH_EM of it.
    const visible = 0.62 * style.fontScale * style.metrics.xHeight;
    expect(visible).toBeCloseTo(style.xHeightPerPitch, 2);
  });

  it('measures with the glyph set, not a font file', () => {
    const style = getHandwritingStyle('reference_student');
    expect(style.fontFamily).toBeUndefined();
    const narrow = layoutHandwriting('iiii', style, { fontSize: 20 });
    const wide = layoutHandwriting('mmmm', style, { fontSize: 20 });
    expect(wide.paragraphs[0].words[0].width).toBeGreaterThan(
      narrow.paragraphs[0].words[0].width * 2,
    );
  });
});
