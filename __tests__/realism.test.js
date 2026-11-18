/**
 * Phase 4: reference-driven realism — letter shape variation, baseline,
 * spacing, pressure, ink, paper templates, margins, headings, underlines,
 * labels, presets, style × paper combinations and persistence.
 */
import React from 'react';
import { clearAllMockStorages } from '@react-native-async-storage/async-storage';
import {
  MAX_INK_EXTENT_LINES,
  getHandwritingStyle,
  getHandwritingStyles,
  resetStyleOverrides,
  setStyleOverrides,
} from '../src/data/handwritingStyles';
import {
  MARGIN_TEXT_GAP,
  PAGE_TYPES,
  PAPER_TEMPLATES,
  getPageMetrics,
  getPageType,
  getPaperAppearance,
  resetPaperAppearance,
  rowHeightFor,
} from '../src/data/paper';
import { PENS } from '../src/data/pens';
import {
  TUNING_PARAMETERS,
  getTuningValue,
  resetTuning,
  setTuningValue,
} from '../src/dev/tuning';
import { createDocument, normalizeDocument } from '../src/models/document';
import PaperCanvas from '../src/components/PaperCanvas';
import { pathPoints } from '../src/handwriting/glyphRender';
import EditorScreen from '../src/screens/EditorScreen';
import {
  getDocument,
  getStorageBackend,
  saveDocument,
  setStorageBackend,
} from '../src/storage/documentStorage';
import {
  emptyFormatting,
  headingAt,
  mapRange,
  normalizeFormatting,
  reformat,
  toggleHeading,
  toggleUnderline,
} from '../src/utils/formatting';
import {
  buildUnderline,
  detectLabel,
  layoutHandwriting,
  tokenizeWithSpacing,
  verticalMetrics,
} from '../src/utils/textLayout';
import {
  act,
  byTestId,
  changeText,
  handwritingPaths,
  inkColors,
  press,
  render,
  renderedHandwriting,
  restoreRealTimers,
} from './helpers/render';

const STYLES = getHandwritingStyles();
const TEMPLATES = PAPER_TEMPLATES.map(t => t.id);

const LETTER = [
  'Q1. What is working capital management in India? Explain with suitable examples.',
  'Ans:',
  "    Working capital management refers to the strategic process of managing a company's short-term assets and liabilities.",
  '',
  '1. Key Concepts and Definitions',
  '• Gross Working Capital (GWC): the total investment in all current assets.',
].join('\n');

function headingFormatting(text) {
  const start = text.indexOf('1. Key Concepts');
  return {
    ...emptyFormatting(),
    headings: [{ start, end: text.indexOf('\n', start), underline: true }],
  };
}

function layoutOn(text, styleId, pageType, extra = {}) {
  const style = getHandwritingStyle(styleId);
  const type = getPageType(pageType);
  const m = getPageMetrics({ pageType });
  const row = rowHeightFor(type, m, style);
  return {
    style,
    m,
    row,
    layout: layoutHandwriting(text, style, {
      fontSize: m.fontSize,
      contentWidth: m.contentWidth,
      lineHeight: row,
      seed: 'doc-real',
      ...extra,
    }),
  };
}

const lineRight = line => {
  const last = line.words[line.words.length - 1];
  return last ? last.x + last.shape.width : 0;
};
const strip = l => ({ ...l, cache: undefined });

beforeEach(() => {
  clearAllMockStorages();
  setStorageBackend(null);
  resetStyleOverrides();
  resetPaperAppearance();
});

describe('determinism', () => {
  it('lays out the same document identically, formatting and underlines included', () => {
    const a = layoutOn(LETTER, 'neat', 'lined', {
      formatting: headingFormatting(LETTER),
    });
    const b = layoutOn(LETTER, 'neat', 'lined', {
      formatting: headingFormatting(LETTER),
    });
    expect(strip(a.layout)).toEqual(strip(b.layout));
  });

  it('never uses Math.random for realism', () => {
    const spy = jest.spyOn(Math, 'random');
    STYLES.forEach(s =>
      layoutOn(LETTER, s.id, 'lined', {
        formatting: headingFormatting(LETTER),
      }),
    );
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('character shape variation', () => {
  it('gives repeated letters different widths, heights, leans and shifts', () => {
    const word = layoutOn('eeeeeeeeeeee', 'neat', 'lined').layout.paragraphs[0]
      .words[0];
    for (const key of [
      'scaleX',
      'scaleY',
      'slant',
      'shift',
      'gap',
      'opacity',
    ]) {
      expect(new Set(word.chars.map(c => c[key])).size).toBeGreaterThan(4);
    }
  });

  it.each(STYLES.map(s => [s.id]))(
    '%s keeps letter and word shapes within safe limits',
    id => {
      const { layout } = layoutOn(LETTER, id, 'lined');
      for (const w of layout.paragraphs.flatMap(p => p.words)) {
        expect(Math.abs(w.scaleX - 1)).toBeLessThanOrEqual(0.03);
        expect(Math.abs(w.rotate)).toBeLessThanOrEqual(2);
        for (const c of w.chars || []) {
          if (c.scaleX !== undefined) {
            expect(Math.abs(c.scaleX - 1)).toBeLessThanOrEqual(0.05);
            expect(Math.abs(c.scaleY - 1)).toBeLessThanOrEqual(0.05);
            expect(Math.abs(c.slant)).toBeLessThanOrEqual(3);
            expect(Math.abs(c.shift)).toBeLessThanOrEqual(0.03 * layout.unit);
          }
        }
      }
    },
  );


  it('includes letter width and gap changes in the measured word width', () => {
    const { layout } = layoutOn('measure', 'casual', 'lined');
    const w = layout.paragraphs[0].words[0];
    expect(w.chars.some(c => c.gap !== w.letterSpacing)).toBe(true);
  });
});

describe('spacing', () => {
  it('varies gaps between letters and between words, within limits', () => {
    const { layout, style } = layoutOn(
      'This is my assignment for the class today.',
      'neat',
      'lined',
    );
    const gaps = layout.lines[0].words.slice(0, -1).map(w => w.gap);
    expect(new Set(gaps).size).toBeGreaterThan(3);
    gaps.forEach(g => {
      expect(g).toBeGreaterThan(0.15 * layout.unit);
      expect(g).toBeLessThan((style.wordSpacing + 0.4) * layout.unit);
    });
  });

  it('uses generous word spacing, as on real pages', () => {
    const ratios = STYLES.map(
      st => st.wordSpacing / (st.metrics.xHeight * st.fontScale),
    );
    // Deliberately tight hands (Small Notes, Quick Notes, Fast) stay ≥ 0.7
    // x-heights; the catalogue as a whole matches the references' ~1×.
    ratios.forEach(r => expect(r).toBeGreaterThanOrEqual(0.7));
    const sorted = [...ratios].sort((x, y) => x - y);
    expect(sorted[Math.floor(sorted.length / 2)]).toBeGreaterThanOrEqual(0.85);
  });
});

describe('baseline', () => {
  it.each(TEMPLATES)(
    'keeps every style on the ruled line on %s paper',
    pageType => {
      for (const s of STYLES) {
        const { layout, row } = layoutOn('Baseline test', s.id, pageType);
        const v = verticalMetrics(s, layout.fontSize, row);
        const m = s.metrics;
        const baseline =
          v.translateY +
          (v.lineHeight - (m.ascent + m.descent) * layout.fontSize) / 2 +
          m.ascent * layout.fontSize;
        const visibleBottom =
          baseline -
          m.baseline * layout.fontSize +
          s.baselineAdjust * layout.fontSize;
        expect(
          Math.abs(visibleBottom - (row - Math.max(1, row * 0.05))),
        ).toBeLessThan(0.6 + Math.abs(s.baselineAdjust * layout.fontSize) * 2);
      }
    },
  );

  it('keeps per-word baseline movement tiny', () => {
    for (const s of STYLES) {
      const { layout } = layoutOn(LETTER, s.id, 'lined');
      for (const line of layout.lines) {
        for (const w of line.words) {
          expect(Math.abs(w.shape.translateY + w.drift)).toBeLessThan(
            0.15 * layout.unit,
          );
        }
      }
    }
  });
});

describe('pressure and ink', () => {
  it('keeps ink strength and stroke weight inside safe limits', () => {
    for (const s of STYLES) {
      const { layout } = layoutOn(LETTER, s.id, 'lined');
      for (const w of layout.paragraphs.flatMap(p => p.words)) {
        expect(w.opacity).toBeGreaterThanOrEqual(0.9);
        expect(w.weight).toBeGreaterThanOrEqual(0);
        expect(w.weight).toBeLessThan(0.05 * layout.fontSize * 1.5);
        for (const c of w.chars || []) {
          expect(c.opacity).toBeGreaterThanOrEqual(0.88);
          expect(c.opacity).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('thins ink slightly towards the end of words (pen pressure)', () => {
    const { layout } = layoutOn(
      'pressure '.repeat(40),
      'exam-writing',
      'lined',
    );
    const words = layout.paragraphs[0].words;
    const avg = idx =>
      words.reduce((t, w) => t + w.chars[idx(w)].opacity, 0) / words.length;
    expect(avg(() => 0)).toBeGreaterThan(avg(w => w.chars.length - 1));
  });

  it("draws strokes with the profile's pen width", async () => {
    const doc = { ...createDocument(), content: 'Firm strokes' };
    // Ink area of the ribbons (shoelace over each closed subpath).
    const inkArea = async () => {
      const r = await render(<PaperCanvas document={doc} width={360} />);
      let area = 0;
      for (const node of handwritingPaths(r)) {
        if (node.props.id) continue; // core overlay, underlines
        for (const pts of pathPoints(node.props.d)) {
          let a = 0;
          for (let i = 0; i < pts.length; i++) {
            const [x0, y0] = pts[i];
            const [x1, y1] = pts[(i + 1) % pts.length];
            a += x0 * y1 - x1 * y0;
          }
          area += Math.abs(a) / 2;
        }
      }
      return area;
    };
    const normal = await inkArea();
    await act(async () => {
      setStyleOverrides('reference_student', { strokeWidth: 0.3 });
    });
    expect(await inkArea()).toBeGreaterThan(normal * 1.5);
  });

  it('no longer draws a glow halo around ballpoint ink', () => {
    PENS.forEach(p => expect(p.ink.bleed.opacity).toBe(0));
  });

  it('draws ink as single crisp strokes: no shadow, blur or halo', async () => {
    const doc = {
      ...createDocument({ pageType: 'lined' }),
      content: 'Downstrokes',
    };
    const r = await render(<PaperCanvas document={doc} width={360} />);
    const shadowed = r.root
      .findAll(n => n.type === 'Text')
      .map(n => Object.assign({}, ...[].concat(n.props.style).flat(Infinity).filter(Boolean)))
      .filter(st => st.textShadowOffset || st.textShadowRadius);
    expect(shadowed).toHaveLength(0);
    const paths = handwritingPaths(r);
    expect(paths.length).toBeGreaterThan(0);
    paths.forEach(p => {
      expect(p.props.filter).toBeUndefined();
      // Ink is filled ribbons; the dense core is a thin overlay on top.
      const alpha = Number(p.props.fillOpacity);
      if (p.props.id === 'ink-core') {
        expect(alpha).toBeLessThan(0.4);
      } else {
        expect(alpha).toBeGreaterThanOrEqual(0.8);
      }
    });
    expect(inkColors(r)).toEqual(new Set(['#123A8C']));
  });
});

describe('paper templates', () => {
  it('provides blank, blue ruled, ruled + margin, wide and narrow', () => {
    const byId = id => PAGE_TYPES.find(t => t.id === id);
    expect(byId('blank')).toMatchObject({ ruled: false, margin: null });
    expect(byId('ruled')).toMatchObject({ ruled: true, margin: null });
    expect(byId('lined')).toMatchObject({ ruled: true });
    expect(byId('lined').margin).toBeTruthy();
    expect(getPageMetrics({ pageType: 'wide' }).lineSpacing).toBeGreaterThan(
      getPageMetrics({ pageType: 'lined' }).lineSpacing,
    );
    expect(getPageMetrics({ pageType: 'narrow' }).lineSpacing).toBeLessThan(
      getPageMetrics({ pageType: 'lined' }).lineSpacing,
    );
  });

  it('keeps the original page types compatible', () => {
    expect(PAGE_TYPES[0].id).toBe('blank');
    expect(PAGE_TYPES[1].id).toBe('lined');
    expect(normalizeDocument({ pageType: 'lined' }).pageType).toBe('lined');
    expect(normalizeDocument({ pageType: 'narrow' }).pageType).toBe('narrow');
  });

  it('writes a little smaller on narrow and larger on wide ruling', () => {
    const size = id => getPageMetrics({ pageType: id }).fontSize;
    expect(size('narrow')).toBeLessThan(size('lined'));
    expect(size('wide')).toBeGreaterThan(size('lined'));
    // Sub-linear: narrow ruling shrinks writing less than the pitch.
    const pitch = id => getPageMetrics({ pageType: id }).lineSpacing;
    expect(size('narrow') / size('lined')).toBeGreaterThan(
      pitch('narrow') / pitch('lined'),
    );
  });

  it.each(TEMPLATES)(
    'renders %s paper with the right rules and margin',
    async pageType => {
      const doc = { ...createDocument({ pageType }), content: 'Paper test' };
      const r = await render(<PaperCanvas document={doc} width={360} />);
      const type = getPageType(pageType);
      const ids = id =>
        r.root.findAll(n => n.props.testID === id && typeof n.type === 'string')
          .length;
      expect(ids('paper-rule') > 0).toBe(type.ruled);
      expect(ids('paper-margin')).toBe(type.margin ? 1 : 0);
      expect(ids('paper-header-rule')).toBe(
        type.margin && type.headerRule ? 1 : 0,
      );
    },
  );

  it('keeps grain and rules faint enough for the ink to dominate', () => {
    const look = getPaperAppearance();
    expect(look.grainOpacity).toBeLessThanOrEqual(0.8);
    expect(look.ruleOpacity).toBeLessThanOrEqual(0.8);
    expect(look.ruleWidth).toBeLessThanOrEqual(1);
  });
});

describe('margin', () => {
  it.each(TEMPLATES)(
    'text never enters the red margin on %s paper',
    pageType => {
      const m = getPageMetrics({ pageType });
      if (m.margin) {
        const marginRight =
          m.margin.x + (m.margin.double || 0) + m.margin.width;
        expect(m.padding.left - marginRight).toBeGreaterThanOrEqual(
          MARGIN_TEXT_GAP - 0.01,
        );
      }
      for (const s of STYLES) {
        const { layout, row } = layoutOn(LETTER, s.id, pageType);
        // Worst case lean/tilt overhang of the first glyph to the left.
        const lean =
          Math.abs(s.slant) + s.variation.slant + s.variation.rotation + 3;
        const overhang = row * Math.tan((lean * Math.PI) / 180);
        for (const line of layout.lines) {
          const left = line.offsetX + (line.words[0] ? line.words[0].x : 0);
          expect(left).toBeGreaterThanOrEqual(0);
          expect(m.padding.left + left - overhang).toBeGreaterThan(
            m.margin ? m.margin.x + (m.margin.double || 0) + m.margin.width : 0,
          );
        }
      }
    },
  );
});

describe('style × paper', () => {
  it.each(TEMPLATES)(
    'all styles fit %s paper: no overflow, no collisions',
    pageType => {
      for (const s of STYLES) {
        const { layout, m, row } = layoutOn(LETTER, s.id, pageType, {
          formatting: headingFormatting(LETTER),
        });
        for (const line of layout.lines) {
          expect(lineRight(line)).toBeLessThanOrEqual(
            m.contentWidth + 0.4 * layout.unit,
          );
        }
        const extent =
          (s.metrics.inkAscent + s.metrics.inkDescent) * layout.fontSize;
        expect(extent).toBeLessThanOrEqual(MAX_INK_EXTENT_LINES * row + 0.01);
        const headingExtent =
          (s.metrics.inkAscent + s.metrics.inkDescent) * layout.headingFontSize;
        expect(headingExtent).toBeLessThanOrEqual(1.2 * row + 0.01);
      }
    },
  );
});

describe('labels', () => {
  const label = text => detectLabel(tokenizeWithSpacing(text).tokens);

  it.each([
    ['Q1. What is it?', 'question', 1],
    ['Q.2 Explain', 'question', 1],
    ['Q1 . Define', 'question', 2],
    ['Ans:', 'answer', 1],
    ['Ans : The', 'answer', 2],
    ['Ans', 'answer', 1],
    ['Answer: yes', 'answer', 1],
    ['1. Introduction', 'number', 1],
    ['2) Second', 'number', 1],
    ['(a) first', 'number', 1],
    ['iv. fourth', 'number', 1],
    ['• Bullet point', 'bullet', 1],
  ])('detects %j as a %s label', (text, kind, count) => {
    expect(label(text)).toEqual({ kind, count });
  });

  it.each([
    'Quick note',
    'Answer the question',
    'Q is a letter',
    'Dear Sir,',
    'The 1. thing',
  ])('does not treat %j as a label', text => expect(label(text)).toBeNull());

  it('aligns continuation lines after a label (hanging indent)', () => {
    const { layout } = layoutOn(
      'Q1. What is the international market? Write its advantages and its disadvantages in detail.',
      'neat',
      'lined',
    );
    const p = layout.paragraphs[0];
    expect(p.label).toBe('question');
    expect(p.lines.length).toBeGreaterThan(1);
    expect(p.hang).toBeGreaterThan(0);
    p.lines.slice(1).forEach(l => expect(l.words[0].x).toBe(p.hang));
  });

  it('underlines "Ans:" but not "Q1."', () => {
    const { layout } = layoutOn('Q1. Why?\nAns:\n1. First', 'neat', 'lined');
    expect(layout.paragraphs[0].lines[0].underlines).toHaveLength(0);
    expect(layout.paragraphs[1].lines[0].underlines).toHaveLength(1);
    expect(layout.paragraphs[2].lines[0].underlines).toHaveLength(0);
  });

  it('draws labels with the same reference glyph strokes', async () => {
    const doc = {
      ...createDocument({ handwritingStyle: 'casual' }),
      content: 'Q1. Test\nAns: yes',
    };
    const r = await render(<PaperCanvas document={doc} width={360} />);
    expect(renderedHandwriting(r)).toBe('Q1. Test\nAns: yes');
    expect(r.root.findAll(n => n.type === 'Text').length).toBe(0);
    expect(handwritingPaths(r).length).toBeGreaterThan(0);
  });

  it('honours explicit labels and can turn auto-detection off', () => {
    const text = 'Note this down';
    const explicit = layoutOn(text, 'neat', 'lined', {
      formatting: { ...emptyFormatting(), labels: [{ start: 0, end: 4 }] },
    });
    expect(explicit.layout.paragraphs[0].label).toBe('custom');
    const off = layoutOn('Q1. Test', 'neat', 'lined', {
      formatting: { ...emptyFormatting(), autoLabels: false },
    });
    expect(off.layout.paragraphs[0].label).toBeNull();
  });
});

describe('underlines', () => {
  it('is deterministic', () => {
    expect(buildUnderline('k', 10, 120, 18)).toEqual(
      buildUnderline('k', 10, 120, 18),
    );
    expect(buildUnderline('k', 10, 120, 18)).not.toEqual(
      buildUnderline('j', 10, 120, 18),
    );
  });

  it('looks hand-drawn: overshoots, wavers and varies in thickness', () => {
    const u = buildUnderline('heading', 0, 200, 18);
    expect(u.x1).toBeLessThan(0);
    expect(u.x2).toBeGreaterThan(200);
    expect(new Set(u.points.map(p => p.y)).size).toBeGreaterThan(3);
    expect(new Set(u.points.map(p => p.thickness)).size).toBeGreaterThan(3);
    u.points.forEach(p => {
      expect(Math.abs(p.y)).toBeLessThan(0.08 * 18);
      expect(p.thickness).toBeGreaterThan(0.4);
      expect(p.thickness).toBeLessThan(2);
    });
  });

  it('underlines formatted ranges word by word, one stroke per run', () => {
    const text = 'one two three four';
    const { layout } = layoutOn(text, 'neat', 'lined', {
      formatting: { ...emptyFormatting(), underlines: [{ start: 4, end: 13 }] },
    });
    const line = layout.lines[0];
    expect(line.words.map(w => !!w.underline)).toEqual([
      false,
      true,
      true,
      false,
    ]);
    expect(line.underlines).toHaveLength(1);
  });

  it('renders hand-drawn underline strokes', async () => {
    const text = 'Heading here';
    const doc = {
      ...createDocument(),
      content: text,
      formatting: {
        ...emptyFormatting(),
        headings: [{ start: 0, end: text.length, underline: true }],
      },
    };
    const r = await render(<PaperCanvas document={doc} width={360} />);
    const outlines = handwritingPaths(r).filter(
      n => n.props.id === 'ink-underline',
    );
    expect(outlines).toHaveLength(1);
    expect(outlines[0].props.d).toMatch(/Z$/);
  });
});

describe('headings', () => {
  it('draws headings slightly larger and firmer, capped by the line pitch', () => {
    const { layout } = layoutOn(LETTER, 'neat', 'lined', {
      formatting: headingFormatting(LETTER),
    });
    const heading = layout.paragraphs.find(p => p.heading);
    expect(heading.lines[0].heading).toBe(true);
    expect(layout.headingFontSize).toBeGreaterThan(layout.fontSize);
    expect(layout.headingFontSize).toBeLessThanOrEqual(
      layout.fontSize * 1.1 + 0.001,
    );
    // Firmer: the renderer draws heading strokes wider (see
    // referenceHandwriting.test.js for the drawn widths).
    expect(getHandwritingStyle('neat').heading.strokeWeight).toBeGreaterThan(1);
    expect(heading.lines[0].underlines).toHaveLength(1);
  });

  it('cycles heading → heading without underline → none', () => {
    const text = 'Title line\nBody text';
    let f = toggleHeading(emptyFormatting(), text, { start: 2, end: 2 });
    expect(headingAt(f, text, 0)).toMatchObject({
      start: 0,
      end: 10,
      underline: true,
    });
    f = toggleHeading(f, text, { start: 2, end: 2 });
    expect(headingAt(f, text, 0)).toMatchObject({ underline: false });
    f = toggleHeading(f, text, { start: 2, end: 2 });
    expect(headingAt(f, text, 0)).toBeNull();
    expect(
      headingAt(toggleHeading(f, text, { start: 0, end: 0 }), text, 12),
    ).toBeNull();
  });

  it('toggles underlines on a selection or the word at the cursor', () => {
    const text = 'alpha beta gamma';
    let f = toggleUnderline(emptyFormatting(), text, { start: 7, end: 7 });
    expect(f.underlines).toEqual([{ start: 6, end: 10 }]);
    f = toggleUnderline(f, text, { start: 0, end: 16 });
    expect(f.underlines).toEqual([{ start: 0, end: 16 }]);
    f = toggleUnderline(f, text, { start: 6, end: 10 });
    expect(f.underlines).toEqual([
      { start: 0, end: 6 },
      { start: 10, end: 16 },
    ]);
  });

  it('moves formatting with the text it was applied to', () => {
    const range = { start: 6, end: 10 };
    expect(mapRange(range, { at: 0, removed: '', inserted: 'XX' })).toEqual({
      start: 8,
      end: 12,
    });
    expect(mapRange(range, { at: 8, removed: '', inserted: 'zz' })).toEqual({
      start: 6,
      end: 12,
    });
    expect(mapRange(range, { at: 10, removed: '', inserted: '!' })).toEqual({
      start: 6,
      end: 10,
    });
    expect(
      mapRange(range, { at: 5, removed: 'xbeta', inserted: '' }),
    ).toBeNull();
    const f = {
      ...emptyFormatting(),
      headings: [{ start: 0, end: 5, underline: true }],
    };
    expect(
      reformat(f, 'Title\nbody', 'My Title\nbody').headings[0],
    ).toMatchObject({ start: 3, end: 8 });
  });

  it('cleans up invalid stored formatting', () => {
    const f = normalizeFormatting(
      {
        headings: [
          { start: 5, end: 2 },
          { start: 0, end: 99 },
        ],
        underlines: [
          { start: 1, end: 3 },
          { start: 2, end: 6 },
        ],
      },
      10,
    );
    expect(f.headings).toEqual([{ start: 0, end: 10, underline: true }]);
    expect(f.underlines).toEqual([{ start: 1, end: 6 }]);
    expect(normalizeFormatting(undefined, 5)).toEqual(emptyFormatting());
  });
});

describe('developer tuning', () => {
  it('tunes paper appearance live and resets it', () => {
    const p = TUNING_PARAMETERS.find(x => x.id === 'paperLineOpacity');
    setTuningValue('neat', p, 0.3);
    expect(getPaperAppearance().ruleOpacity).toBe(0.3);
    const margin = TUNING_PARAMETERS.find(x => x.id === 'marginPosition');
    setTuningValue('neat', margin, 28);
    expect(getPageMetrics({ pageType: 'lined' }).margin.x).toBe(28);
    resetTuning('neat');
    expect(getPaperAppearance().ruleOpacity).not.toBe(0.3);
  });

  it('covers the required parameters', () => {
    const ids = TUNING_PARAMETERS.map(p => p.id);
    [
      'baselineAdjust',
      'fontSize',
      'lineHeight',
      'letterSpacing',
      'wordSpacing',
      'rotation',
      'verticalVariation',
      'scaleVariation',
      'opacityVariation',
      'slant',
      'pressure',
      'inkStrength',
      'paperLineOpacity',
      'paperGrainOpacity',
      'marginPosition',
    ].forEach(id => expect(ids).toContain(id));
    const pressure = TUNING_PARAMETERS.find(x => x.id === 'pressure');
    setTuningValue('neat', pressure, 0.3);
    expect(getTuningValue('neat', pressure)).toBe(0.3);
    setTuningValue('neat', pressure, 0.9);
    expect(getTuningValue('neat', pressure)).toBe(pressure.max);
  });
});

describe('persistence', () => {
  it('save/reopen preserves text, style, pen, paper template and formatting', async () => {
    const text = 'Q1. Title here\nAns:\nBody text';
    const formatting = {
      ...emptyFormatting(),
      headings: [{ start: 0, end: 14, underline: false }],
      underlines: [{ start: 20, end: 24 }],
    };
    const saved = await saveDocument({
      ...createDocument({
        pageType: 'narrow',
        pen: 'black',
        handwritingStyle: 'messy',
      }),
      content: text,
      formatting,
    });
    const reopened = await getDocument(saved.id);
    expect(reopened).toMatchObject({
      content: text,
      pageType: 'narrow',
      pen: 'black',
      handwritingStyle: 'messy',
      formatting: normalizeFormatting(formatting, text.length),
    });
  });

  it('opens documents saved before formatting existed', async () => {
    const legacy = {
      id: 'old',
      title: 'Old',
      pageType: 'lined',
      pen: 'blue',
      handwritingStyle: 'neat',
      content: 'Hi',
      createdAt: 1,
      updatedAt: 2,
    };
    await getStorageBackend().setItem('document:old', JSON.stringify(legacy));
    const doc = await getDocument('old');
    expect(doc.formatting).toEqual(emptyFormatting());
  });

  it('applies heading and underline from the editor and keeps them on save', async () => {
    jest.useFakeTimers();
    const doc = {
      ...createDocument(),
      content: 'Key Concepts\nSome body text',
    };
    const r = await render(
      <EditorScreen initialDocument={doc} onClose={jest.fn()} />,
    );
    await press(r, 'toolbar-edit');
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    await press(r, 'format-heading');
    expect(
      byTestId(r, 'format-heading', 'accessibilityState').props
        .accessibilityState.selected,
    ).toBe(true);
    await press(r, 'format-underline');
    // Typing before the heading moves the formatting with the words.
    await changeText(r, 'text-input', '1. Key Concepts\nSome body text');
    await press(r, 'save-button');
    const stored = await getDocument(doc.id);
    expect(stored.formatting.headings).toEqual([
      { start: 3, end: 15, underline: true },
    ]);
    expect(stored.formatting.underlines).toEqual([{ start: 3, end: 6 }]);
    expect(renderedHandwriting(r)).toBe('1. Key Concepts\nSome body text');
    restoreRealTimers(jest);
  });
});

describe('performance', () => {
  it('lays out a 3,000-character document quickly, and re-layouts on a keystroke faster', () => {
    const text = `${LETTER}\n`.repeat(8).slice(0, 3000);
    const style = getHandwritingStyle('neat');
    const m = getPageMetrics();
    const opts = {
      fontSize: m.fontSize,
      contentWidth: m.contentWidth,
      lineHeight: m.lineSpacing,
      seed: 'perf',
    };
    let t = Date.now();
    const first = layoutHandwriting(text, style, opts);
    const cold = Date.now() - t;
    t = Date.now();
    for (let i = 0; i < 5; i++) {
      layoutHandwriting(`${text}x`, style, { ...opts, cache: first.cache });
    }
    const warm = (Date.now() - t) / 5;
    expect(cold).toBeLessThan(1500);
    expect(warm).toBeLessThan(cold + 50);
  });
});
