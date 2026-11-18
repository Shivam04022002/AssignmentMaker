/**
 * Lang3 fidelity refinement: reference1 is the authority for letterforms
 * (obsolete forms of the earlier Lang3 page are never chosen), each form
 * has its own natural width, the layout measures words with the forms the
 * renderer draws, and neighbouring letters never touch. Everything else
 * (formatting, gaps, corrections, pagination, persistence, thumbnails,
 * export) keeps working; Lang1 and Lang2 are locked.
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
  FORM_WIDTH,
  GLYPHS,
  GLYPHS_LANG2,
  GLYPHS_LANG3,
  GLYPH_FORMS,
  glyphAdvance,
  glyphAdvanceMax,
  glyphForms,
} from '../src/handwriting/glyphs';
import { LANG3_PROFILE_ID, XH_EM } from '../src/handwriting/handwritingProfiles';
import { ATTEMPT_SALT, sampleChain, wordForms } from '../src/handwriting/strokeModel';
import { createDocument } from '../src/models/document';
import { getDocument, saveDocument, setStorageBackend } from '../src/storage/documentStorage';
import {
  applySpanFormat,
  boundariesIn,
  emptyFormatting,
  reformat,
  setWordGap,
} from '../src/utils/formatting';
import { PAGE_BREAK, paginateDocument } from '../src/utils/pagination';
import { createMaxMeasurer, createMeasurer, layoutHandwriting } from '../src/utils/textLayout';
import { hashString, mixSeed } from '../src/utils/variation';
import { act, render } from './helpers/render';

const L1 = getHandwritingStyle('reference_student');
const L2 = getHandwritingStyle('reference_student_lang2');
const L3 = getHandwritingStyle(LANG3_PROFILE_ID);
const PARA =
  'The international market refers to the exchange of goods, services, and resources across national borders. Unlike domestic marketing, which occurs within the confines of a single country, international marketing involves navigating diverse legal systems, cultural nuances, economic climates, and consumer behaviors.';
const LOOPY = 'fluffy yellow jelly fly fifty finally carefully all yearly holly llama allow yolk effect';
const metrics = getPageMetrics({ pageType: 'lined', style: L3 });
const rowHeight = rowHeightFor(getPageType('lined'), metrics, L3);
const OPTS = { fontSize: 12.4, contentWidth: 292, lineHeight: 20 };

function draw(text, formatting, seed = 'fid', options = {}) {
  const l = layoutHandwriting(text, L3, { ...OPTS, contentWidth: options.width || OPTS.contentWidth, seed, formatting, corrections: options.corrections });
  const strokes = [];
  const drawn = renderLines(l.lines, { profile: L3, layout: l, rowHeight: 20, baselineInRow: baselineInRow(20, L3, l.fontSize), ink: { floor: 0.86, strength: 1 }, debug: strokes });
  return { layout: l, drawn, strokes };
}
/** Drawn letters of one pass, in order, with all their strokes' points. */
function letters(strokes, pass = 'main') {
  const out = [];
  strokes
    .filter(s => s.pass === pass)
    .forEach(s => {
      if (s.stroke === 0) out.push({ at: s.at, word: s.word, char: s.char, form: s.form, unit: s.unit, xs: [], ys: [] });
      const L = out[out.length - 1];
      L.xs.push(...s.xs);
      L.ys.push(...s.ys);
      if (!L.unit && s.unit) L.unit = s.unit;
    });
  return out;
}
const words = layout => layout.lines.flatMap(l => l.words);
const minY = strokes => Math.min(...strokes.flatMap(p => sampleChain(p).ys));

beforeEach(() => {
  clearAllMockStorages();
  setStorageBackend(null);
  setNativeExporter(null);
});

// --- Obsolete forms -----------------------------------------------------------------

describe('reference1 is the authority: f, l, y', () => {
  it('keeps the earlier page’s f, l and y in the table but never chooses them', () => {
    for (const ch of 'fly') {
      expect([ch, GLYPH_FORMS.lang3[ch][0].weight]).toEqual([ch, 0]);
      expect([ch, GLYPH_FORMS.lang3[ch][0].strokes]).toEqual([ch, GLYPHS_LANG3[ch].strokes]); // backward compatibility
    }
    for (let s = 0; s < 300; s++) {
      for (const word of ['f', 'l', 'y', 'ff', 'll', 'yy', 'fly', 'fully', 'yell', 'off', 'all', 'lily']) {
        const f = wordForms([...word], s, 'lang3');
        [...word].forEach((c, i) => 'fly'.includes(c) && expect([word, s, i, f[i]]).not.toEqual([word, s, i, 0]));
      }
    }
  });

  it('writes every f with a loop below the line', () => {
    const fs = letters(draw(LOOPY, undefined, 'f1', { width: 900 }).strokes).filter(l => l.char === 'f');
    expect(fs.length).toBeGreaterThan(8);
    fs.forEach(l => expect([l.form, minY(glyphForms('f', 'lang3')[l.form].strokes) < -0.5]).toEqual([l.form, true]));
  });

  it('writes every l looped (an ascender loop), as on the sheet', () => {
    const ls = letters(draw(LOOPY, undefined, 'l1', { width: 900 }).strokes).filter(l => l.char === 'l');
    expect(ls.length).toBeGreaterThan(8);
    ls.forEach(l => {
      const st = glyphForms('l', 'lang3')[l.form].strokes[0];
      const { xs, ys } = sampleChain(st);
      const top = ys.indexOf(Math.max(...ys));
      // Up the right of the loop, over, and down its left: the path crosses back left of the top.
      expect([l.form, ys[top] > 1.6 && Math.min(...xs.slice(top)) < xs[top] - 0.05 && ys[ys.length - 1] < 0.2]).toEqual([l.form, true]);
    });
  });

  it('writes every y with the sheet’s descender (closed loop or open hook), not the u-shaped y', () => {
    const ys = letters(draw(LOOPY, undefined, 'y1', { width: 900 }).strokes).filter(l => l.char === 'y');
    expect(ys.length).toBeGreaterThan(5);
    expect(new Set(ys.map(l => l.form))).toEqual(new Set([1, 2]));
    ys.forEach(l => expect(minY(glyphForms('y', 'lang3')[l.form].strokes)).toBeLessThan(-0.55));
  });

  it('keeps the sheet’s main forms of a, e, b, g, j, k in use; the plain a and footless i are rare', () => {
    const used = {};
    letters(draw(`${PARA} ${LOOPY} bake jagged knob jab gable keg`, undefined, 'm1', { width: 4000 }).strokes).forEach(l => {
      used[l.char] = used[l.char] || [];
      used[l.char].push(l.form);
    });
    for (const ch of 'aebgjk') {
      const forms = glyphForms(ch, 'lang3');
      const sheet = forms.map((f, i) => i).filter(i => i > 0 && forms[i].weight > 0.5);
      expect([ch, sheet.some(i => used[ch].includes(i))]).toEqual([ch, true]);
    }
    const plainA = used.a.filter(f => f === 0).length / used.a.length;
    expect(plainA).toBeLessThan(0.2);
    expect(glyphForms('a', 'lang3')[0].weight).toBeLessThan(0.2);
    expect(glyphForms('i', 'lang3')[0].weight).toBeLessThan(0.5);
  });
});

// --- Widths -------------------------------------------------------------------------

describe('variant-specific widths', () => {
  it('gives forms their own natural widths, within bounds', () => {
    const all = Object.entries(GLYPH_FORMS.lang3).flatMap(([ch, forms]) => forms.slice(1).map(f => [ch, f.w, GLYPHS_LANG3[ch].w]));
    expect(all.filter(([, w, b]) => w > b + 0.04).length).toBeGreaterThan(20); // looped, wider
    expect(all.filter(([, w, b]) => w < b - 0.04).length).toBeGreaterThanOrEqual(2); // narrower (the cursive e: its entry runs in the gap)
    expect(glyphForms('e', 'lang3')[1].w).toBeLessThan(GLYPHS_LANG3.e.w - 0.05);
    all.forEach(([ch, w, b]) => expect([ch, w >= b * FORM_WIDTH.min - 1e-9 && w <= b + FORM_WIDTH.extra + 1e-9]).toEqual([ch, true]));
    // The looped l takes the room its loop needs: about twice the plain stem.
    expect(glyphForms('l', 'lang3')[1].w).toBeGreaterThan(GLYPHS_LANG3.l.w * 1.8);
  });

  it('measures a letter by its form; Lang1, Lang2 and a form-less call are unchanged', () => {
    const f = glyphForms('l', 'lang3');
    f.forEach((g, i) => expect(glyphAdvance('l', L3, i)).toBeCloseTo(g.w * L3.glyphWidth + L3.letterGap, 9));
    expect(glyphAdvance('l', L3)).toBe(glyphAdvance('l', L3, 0));
    expect(glyphAdvanceMax('l', L3)).toBe(Math.max(...f.map((_, i) => glyphAdvance('l', L3, i))));
    for (const p of [L1, L2]) {
      for (const ch of 'alyMW?') {
        const set = p === L1 ? GLYPHS : GLYPHS_LANG2;
        expect(glyphAdvance(ch, p, 2)).toBe(set[ch].w * (p.glyphWidth || 1) + (p.letterGap ?? 0.18));
        expect(glyphAdvanceMax(ch, p)).toBe(glyphAdvance(ch, p));
      }
    }
    const m = createMeasurer(L3, 12.4);
    expect(m('l', 1)).toBeCloseTo(glyphAdvance('l', L3, 1) * 12.4 * XH_EM, 9);
    expect(createMaxMeasurer(L3, 12.4)('l')).toBeCloseTo(glyphAdvanceMax('l', L3) * 12.4 * XH_EM, 9);
  });

  it('sizes each word from the forms the renderer draws (one source)', () => {
    const { layout, strokes } = draw(`${PARA} ${LOOPY}`, undefined, 'w1', { width: 4000 });
    const drawn = letters(strokes);
    const unit = layout.fontSize * XH_EM; // layout fontSize is the glyph size
    let k = 0;
    words(layout).forEach(w => {
      const chars = [...w.shape.text];
      expect(w.shape.forms).toEqual(wordForms(chars, w.shape.seed, 'lang3'));
      chars.forEach((c, i) => {
        expect([c, drawn[k].char, drawn[k].form]).toEqual([c, c, w.shape.forms[i]]);
        k++;
      });
      // Width = the chosen forms' advances + spacing (letter jitter evens out within the word).
      const want = chars.reduce((t, c, i) => t + glyphAdvance(c, L3, w.shape.forms[i]) * unit + w.shape.letterSpacing, 0) * w.shape.scaleX;
      expect(Math.abs(w.shape.width - want)).toBeLessThan(0.02);
    });
  });

  it('never lets neighbouring letters touch: centre-lines stay apart', () => {
    let worst = Infinity;
    let pairs = 0;
    for (const seed of ['n1', 'n2', 'n3', 'n4']) {
      const ls = letters(draw(`${PARA} ${LOOPY} aaaa eeee bookkeeper committee`, undefined, seed, { width: 4000 }).strokes);
      for (let i = 1; i < ls.length; i++) {
        const a = ls[i - 1];
        const b = ls[i];
        if (a.at !== b.at) continue;
        let d = Infinity;
        for (let p = 0; p < a.xs.length; p++) {
          for (let q = 0; q < b.xs.length; q++) d = Math.min(d, Math.hypot(a.xs[p] - b.xs[q], a.ys[p] - b.ys[q]));
        }
        worst = Math.min(worst, d / (a.unit || b.unit));
        pairs++;
      }
    }
    expect(pairs).toBeGreaterThan(1000);
    expect(worst).toBeGreaterThan(0.05); // x-heights
  });

  it('breaks words longer than a line into pieces that always fit', () => {
    const long = 'fluffyllamallamafluffyyellowjellyfluffyllamallamafluffyyellowjellyfluffyllama';
    for (const seed of ['p1', 'p2', 'p3']) {
      const l = layoutHandwriting(`${long} ${long}`, L3, { ...OPTS, contentWidth: 150, seed });
      l.lines.forEach(line => line.words.forEach(w => expect(w.x + w.shape.width).toBeLessThanOrEqual(150 + 0.4 * l.unit + 1e-6)));
    }
  });
});

// --- Stability ----------------------------------------------------------------------

describe('layout and pagination stability', () => {
  const paginate = doc => paginateDocument({ content: doc.content, formatting: doc.formatting, pageIds: doc.pageIds, style: L3, metrics, rowHeight, seed: doc.id });
  const breaks = p => p.pages.map(pg => [pg.start, pg.end, pg.lines.map(l => [l.start, l.end])]);

  it('lays out and paginates the same saved document identically every time', async () => {
    const content = Array.from({ length: 4 }, (_, i) => `Page ${i + 1}. ${PARA} ${LOOPY}`).join(PAGE_BREAK);
    const doc = { ...createDocument({ handwritingStyle: LANG3_PROFILE_ID }), content };
    const a = paginate(doc);
    expect(breaks(paginate(doc))).toEqual(breaks(a));
    const back = await getDocument((await saveDocument(doc)).id);
    const b = paginate(back);
    expect(breaks(b)).toEqual(breaks(a));
    expect(b.pages.flatMap(p => p.lines.flatMap(l => l.words.map(w => w.shape.forms)))).toEqual(a.pages.flatMap(p => p.lines.flatMap(l => l.words.map(w => w.shape.forms))));
    // Overflow lines are dealt onto pages without re-measuring: no text lost or repeated.
    const text = content.split(PAGE_BREAK).join('');
    const covered = a.pages.flatMap(p => p.lines.flatMap(l => l.words.map(w => w.shape.text))).join('');
    expect(covered).toBe(text.replace(/\s+/g, ''));
  });

  it('renders a reopened document stroke for stroke', async () => {
    const content = `${PARA}${PAGE_BREAK}${LOOPY}`;
    let f = applySpanFormat(emptyFormatting(), content, { start: 4, end: 17 }, { color: '#151515', size: 1.2, mode: 'marker' });
    f = setWordGap(f, content, boundariesIn(content, { start: 0, end: 40 })[2], 4);
    const doc = { ...createDocument({ handwritingStyle: LANG3_PROFILE_ID }), content, formatting: f };
    const out = d => {
      const p = paginate(d);
      return p.pages.map(pg => JSON.stringify(renderLines(pg.lines, { profile: L3, layout: p.layout, rowHeight, baselineInRow: baselineInRow(rowHeight, L3, p.layout.fontSize), ink: { floor: 0.86, strength: 1 } })));
    };
    const back = await getDocument((await saveDocument(doc)).id);
    expect(out(back)).toEqual(out(doc));
  });
});

// --- Editing ------------------------------------------------------------------------

describe('formatting, gaps and corrections with variant widths', () => {
  it('keeps formatting on the right letters after text is inserted and lines reflow', () => {
    const prev = PARA;
    const at = prev.indexOf('domestic');
    const f = applySpanFormat(emptyFormatting(), prev, { start: at, end: at + 8 }, { color: '#C0392B', size: 1.3, mode: 'marker' });
    const next = `Fluffy yellow llamas, briefly: ${prev}`;
    const moved = reformat(f, prev, next);
    const at2 = next.indexOf('domestic');
    expect(moved.spans.map(s => [s.start, s.end])).toEqual([[at2, at2 + 8]]);
    const before = draw(prev, f).strokes.filter(s => s.color === '#C0392B');
    const after = draw(next, moved).strokes.filter(s => s.color === '#C0392B');
    expect(new Set(before.map(s => s.word))).toEqual(new Set(['domestic']));
    expect(new Set(after.map(s => s.word))).toEqual(new Set(['domestic']));
    after.forEach(s => expect([s.size, s.mode]).toEqual([1.3, 'marker']));
    // The reflow really moved it (different line or position).
    const pos = l => words(l).find(w => w.shape.text === 'domestic');
    const a = draw(prev, f).layout;
    const b = draw(next, moved).layout;
    expect([pos(a).x, a.lines.findIndex(l => l.words.includes(pos(a)))]).not.toEqual([pos(b).x, b.lines.findIndex(l => l.words.includes(pos(b)))]);
  });

  it('moves only the chosen word gap (−5 … +5); everything before it stays put', () => {
    const line = 'the market and a busy llama fluffy market';
    const at = v => {
      const b = boundariesIn(line, { start: 0, end: line.length }).find(x => x.left === 'busy');
      const f = v === 0 ? emptyFormatting() : setWordGap(emptyFormatting(), line, b, v);
      return words(layoutHandwriting(line, L3, { ...OPTS, contentWidth: 4000, seed: 'g', formatting: f }));
    };
    const base = at(0);
    let last = -Infinity;
    for (const v of [-5, -3, -1, 1, 3, 5]) {
      const w = at(v);
      const i = w.findIndex(x => x.shape.text === 'llama');
      w.slice(0, i).forEach((x, k) => expect(x.x).toBeCloseTo(base[k].x, 6));
      const shift = w[i].x - base[i].x;
      w.slice(i).forEach((x, k) => expect(x.x - base[i + k].x).toBeCloseTo(shift, 6));
      expect(Math.sign(shift)).toBe(Math.sign(v));
      expect(shift).toBeGreaterThan(last);
      last = shift;
      // Forms (and so widths) never depend on the gap.
      w.forEach((x, k) => expect(x.shape.forms).toEqual(base[k].shape.forms));
    }
  });

  it('measures a crossed-out attempt with its own forms and keeps traced-over letters in their forms', () => {
    const text = `${PARA} `.repeat(6);
    const kinds = new Set();
    for (let s = 0; s < 160 && kinds.size < 3; s++) {
      const { layout, strokes } = draw(text, undefined, `cx-${s}`, { corrections: true, width: 4000 });
      for (const w of words(layout).filter(x => x.shape.correction)) {
        const fix = w.shape.correction;
        const mine = strokes.filter(x => x.at === w.start);
        const main = letters(mine);
        if (fix.kind === 'crossed') {
          kinds.add('crossed');
          const chars = [...fix.attempt];
          const af = wordForms(chars, mixSeed(w.shape.seed, ATTEMPT_SALT), 'lang3');
          const att = letters(mine, 'attempt');
          expect(att.map(l => l.form)).toEqual(af);
          // The attempt (and its strike) ends before the word begins.
          const attemptRight = Math.max(...att.flatMap(l => l.xs));
          const wordLeft = Math.min(...main.flatMap(l => l.xs));
          expect(attemptRight).toBeLessThan(wordLeft);
        } else if (fix.kind === 'overwrite') {
          kinds.add(fix.kind);
          // Traced again in the same forms (new variation only).
          const pairs = new Set(main.map(l => `${l.char}${l.form}`));
          letters(mine, 'fix').forEach(l => expect(pairs.has(`${l.char}${l.form}`)).toBe(true));
        } else if (fix.kind === 'letter-fix') {
          kinds.add(fix.kind);
          // The slip is written in place of the letter; the right letter goes
          // over it in the form the layout measured for that position.
          const [right] = letters(mine, 'fix');
          expect([right.char, right.form]).toEqual([[...w.shape.text][fix.index], w.shape.forms[fix.index]]);
          expect(main[fix.index].char).toBe(fix.wrong);
        }
      }
    }
    expect(kinds.has('crossed')).toBe(true);
    expect(kinds.size).toBeGreaterThanOrEqual(2);
  });
});

// --- Thumbnails and export ----------------------------------------------------------

describe('thumbnails and export use the same forms and widths', () => {
  const paginate = doc => paginateDocument({ content: doc.content, formatting: doc.formatting, pageIds: doc.pageIds, style: L3, metrics, rowHeight, seed: doc.id });

  it('draws the thumbnail from the editor page model', async () => {
    const doc = { ...createDocument({ handwritingStyle: LANG3_PROFILE_ID }), content: `${LOOPY} ${PARA}` };
    const paged = paginate(doc);
    const r = await render(<PaperPage document={doc} page={paged.pages[0]} layout={paged.layout} metrics={metrics} rowHeight={rowHeight} width={110} quality="preview" />);
    const svg = r.root.findAll(n => n.props.testID === 'handwriting-ink' && typeof n.type !== 'string')[0];
    const got = [...new Set(svg.findAll(n => n.props.d).map(n => n.props.d))].join('').split('M').filter(Boolean).sort();
    const r2 = renderLines(paged.pages[0].lines, { profile: L3, layout: paged.layout, rowHeight, baselineInRow: baselineInRow(rowHeight, L3, paged.layout.fontSize), ink: { floor: 0.86, strength: 1 }, quality: 'preview' });
    expect(got).toEqual([...r2.buckets, ...r2.underlines].map(b => b.d).join('').split('M').filter(Boolean).sort());
  });

  it.each(['pdf', 'png', 'jpg'])('exports %s with the editor’s words, widths and forms', async format => {
    const doc = { ...createDocument({ handwritingStyle: LANG3_PROFILE_ID }), content: `${LOOPY} ${PARA}` };
    const paged = { ...paginate(doc), metrics, rowHeight };
    const sig = page => page.lines.flatMap(l => l.words.map(w => [w.x, w.shape.text, w.shape.width, w.shape.forms]));
    const editor = sig(paged.pages[0]);
    let mounted = null;
    const seen = [];
    const grab = () => seen.push(sig(mounted.root.findAll(n => n.props.testID === 'export-page' && n.props.page)[0].props.page));
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
    mounted = await render(<ExportRenderer plan={buildExportPlan({ title: 'F', format, pageCount: 1 })} document={doc} paged={paged} onProgress={() => {}} onFinish={o => (done = o)} onError={() => {}} />);
    for (let i = 0; i < 200 && !done; i++) {
      await act(async () => {
        await new Promise(res => setTimeout(res, 10));
      });
    }
    expect(done).toBeTruthy();
    expect(seen[0]).toEqual(editor);
  }, 30000);
});

// --- Lang1 / Lang2 ------------------------------------------------------------------

describe('Lang1 and Lang2 locks', () => {
  it('Lang1 glyphs, layout and output are unchanged', () => {
    const text = 'The night slips quietly away,\nAnd wakes the gold and blue of day. Working Capital 2026, 25% (a) → done!';
    const l = layoutHandwriting(text, L1, { ...OPTS, seed: 'lang1-lock' });
    const out = JSON.stringify(renderLines(l.lines, { profile: L1, layout: l, rowHeight: 20, baselineInRow: 19, ink: { floor: 0.86, strength: 1 } }));
    expect(hashString(JSON.stringify(GLYPHS))).toBe(3649923111);
    expect(hashString(JSON.stringify(l.lines.map(x => x.words.map(w => [w.x, w.shape.width, w.gap]))))).toBe(4194404481);
    expect(out.length).toBe(47216);
    expect(hashString(out)).toBe(2797748489);
    expect(words(l).some(w => 'forms' in w.shape)).toBe(false);
  });

  it('Lang2 glyphs and output are unchanged', () => {
    const text = 'The night slips quietly away,\nAnd wakes the gold and blue of day. Working Capital 2026, 25% (a) → ₹50!';
    const l = layoutHandwriting(text, L2, { ...OPTS, seed: 'lang2-lock' });
    const out = JSON.stringify(renderLines(l.lines, { profile: L2, layout: l, rowHeight: 20, baselineInRow: 19, ink: { floor: 0.86, strength: 1 } }));
    expect(hashString(JSON.stringify(GLYPHS_LANG2))).toBe(1005853950);
    expect(out.length).toBe(52295);
    expect(hashString(out)).toBe(4030609738);
    expect(words(l).some(w => 'forms' in w.shape)).toBe(false);
    expect(L1.stroke.tailClearance).toBeUndefined();
    expect(L2.stroke.tailClearance).toBeUndefined();
  });
});
