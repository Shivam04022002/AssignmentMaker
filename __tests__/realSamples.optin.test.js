/**
 * OPT-IN validation on REAL handwriting images (Latin only) — the reference
 * pages in reference/ that came with the project. Skipped unless
 * REAL_SAMPLES=1 and the images are present; they are never copied into
 * tests or fixtures. The transcriptions below were typed from the images.
 *
 *   REAL_SAMPLES=1 npx jest __tests__/realSamples.optin.test.js
 *
 * There is no ground truth for these pages: the checks are the safety
 * properties verified by eye on the overlays (visual-reports/lang4/phase8/
 * real/ and phase9/real/) — what must be refused is refused, and the confidently wrong
 * matches found on handwriting_03 stay doubted. Passing is not a measure of
 * real-handwriting accuracy.
 */
import fs from 'fs';
import path from 'path';
import { analyzeSample } from '../src/handwriting/learn/analyzeSample';
import { sampleChain } from '../src/handwriting/learn/strokeFit';
import { decodePngGray } from './helpers/pngGray';
import { sideways, upsideDown } from './helpers/photoConditions';

const DIR = path.join(__dirname, '..', 'reference');
const ENABLED =
  process.env.REAL_SAMPLES === '1' &&
  fs.existsSync(path.join(DIR, 'handwriting_03.png'));
const maybe = ENABLED ? describe : describe.skip;
jest.setTimeout(240000);

const TEXT = {
  'handwriting_03.png':
    'Q1. What is the international market? Write its advantages\nand its disadvantages.\nAns\n1. Introduction to the International Market\nThe international market refers to the exchange of goods,\nservices, and resources across national borders. Unlike\ndomestic marketing, which occurs within the confines of a\nsingle country, international marketing involves navigating\ndiverse legal systems, cultural nuances, economic climates,\nand consumer behaviors.\nIn a globalized world, the international market is not\njust an option for growth—it is often a necessity for\nsurvival. It allows companies to tap into a much larger\ncustomer base (the global population) rather than being\nlimited by the saturation or economic downturns of a\nsingle home market. It encompasses various modes of\nentry, including exporting, licensing, franchising, joint\nventures, and foreign direct investment (FDI).',
  'handwriting_01.png':
    "Q1. What is working capital management in India ?\nAns :\nWorking Capital Management (WCM) in India refers to the\nstrategic process of managing a company's short-term\nassets and liabilities to ensure it has sufficient liquidity\nto operate efficiently.\nIn the Indian business landscape, this is a delicate\nbalancing act between profitability and solvency, heavily\ninfluenced by local banking regulations and the unique\ncredit cycles of the Indian market.\nThe core objective is to maintain a satisfactory level of\nworking capital to avoid the risk of technical insolvency\nor bankruptcy.\n1. Key Concepts and Definitions\nIn India, working capital is typically viewed through two\nconceptual lenses :\n• Gross Working Capital (GWC) : The total investment in all\ncurrent assets, such as cash, inventory, and receivables.",
  'handwriting_02.png':
    'Q1. Why it is important for business enterprise to understand\ntheir environment ? Explain\nAns :\nUnderstanding the business environment is not just a\ntheoretical exercise; it is a fundamental necessity for the\nsurvival and growth of any enterprise. The environment\nconsists of all external forces — economic, social, legal,\ntechnological, and political — that influence a business but\nare outside its direct control.\nHere is why it is critical for a business to understand\nthese factors :\n1. Identifying Opportunities and Getting the First-Mover Advantage\nA business that is aware of its environment can spot\nfavorable trends early. By recognizing these opportunities\nbefore competitors, an enterprise can launch new products\nor services first, capturing a larger market share.',
};

const run = async (file, knownText = TEXT[file] || null, turn = r => r) =>
  analyzeSample(turn(decodePngGray(path.join(DIR, file))), {
    slot: 4,
    knownText,
    sampleId: file,
    revision: 1,
    yieldFn: async () => {},
    extract: true,
  });

maybe('real reference pages (opt-in, Latin only)', () => {
  it('handwriting_03 (ruled, neat): rules cleared, letters located, the shifted matches stay doubted', async () => {
    const r = await run('handwriting_03.png');
    expect(r.quality.usable).toBe(true);
    expect(r.rules.faintPixels).toBeGreaterThan(1000);
    expect(r.alignment.summary.units.aligned).toBeGreaterThanOrEqual(190);
    expect(r.extraction.summary.extracted).toBeGreaterThanOrEqual(100);
    // First line: a rule fragment joins What and is; the matches after it
    // could be shifted by a word and must not be trusted.
    const word = t =>
      r.alignment.observations.words.find(
        w => w.text === t && w.expectedLine === 0,
      );
    expect(word('is').state).toBe('ambiguous');
    expect(word('market?').state).toBe('ambiguous');
    expect(word('advantages').state).toBe('aligned'); // pinned to the line's end
  });

  it('handwriting_03 learned shapes (Phase 11, checked by eye): an a is never a bare o, every t has its crossbar', async () => {
    const r = await run('handwriting_03.png');
    const got = r.extraction.units.filter(u => u.status === 'extracted');
    const pts = u => u.form.strokes.flatMap(c => sampleChain(c, 0.02));
    // An a is more than one closed ring: its stem runs on past the bowl.
    for (const a of got.filter(u => u.text === 'a')) {
      const ps = pts(a);
      const xs = ps.map(p => p[0]);
      const right = Math.max(...xs);
      const low = ps.filter(p => p[1] < 0.3);
      expect(low.some(p => p[0] > right - 0.15)).toBe(true); // ink at the lower right: the stem's foot or tail
    }
    // A t has a crossbar: points either side of its stem near the x-height.
    for (const t of got.filter(u => u.text === 't')) {
      const ps = pts(t);
      const stem = ps.filter(p => p[1] > 0.3 && p[1] < 0.7).map(p => p[0]);
      const sx = stem.reduce((q, v) => q + v, 0) / stem.length;
      const bar = ps.filter(p => p[1] > 0.75 && p[1] < 1.3);
      expect(bar.some(p => p[0] < sx - 0.15) && bar.some(p => p[0] > sx + 0.15)).toBe(true);
    }
    // Refused counters say why; no refused glyph carries a shape.
    const refused = r.extraction.units.filter(u => u.code === 'counter-unresolved');
    refused.forEach(u => {
      expect(u.reasons.join(' ')).toMatch(/counter/);
      expect(u.form).toBeUndefined();
    });
  });

  it('handwriting_01 (x-height ≈ 9 px): refused as too small, nothing extracted', async () => {
    const r = await run('handwriting_01.png');
    expect(r.quality.usable).toBe(false);
    expect(r.quality.issues.map(i => i.code)).toContain('too-small');
    expect(r.extraction.summary.extracted).toBe(0);
  });

  it('handwriting_02 (small, joined writing): warned, and no letter is trusted', async () => {
    const r = await run('handwriting_02.png');
    expect(r.quality.issues.map(i => i.code)).toContain('too-small');
    expect(r.extraction.summary.extracted).toBeLessThanOrEqual(5);
    // At this size marks and commas were matched as letters: nothing counts as aligned.
    expect(r.alignment.summary.units.aligned).toBe(0);
  });

  it('reference1 (phone photo on a desk): the sheet is found, cut out and straightened', async () => {
    const r = await run('reference1.png', null);
    expect(r.page.status).toBe('page');
    // Corners checked by eye on the overlay: inside the photo, on the sheet.
    r.page.corners.forEach(([x, y]) => {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(960);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(1280);
    });
    // The desk, book and keys are outside the cut-out page.
    expect(r.rules.backgroundObjects).toBe(0);
    expect(r.orientation.status).toBe('across');
    expect(r.segmentation.lines.length).toBe(9); // nine rows of letters on the sheet
    expect(r.extraction).toBeNull(); // no transcription: measurements only
  });

  it('handwriting_03 turned sideways or upside down: refused with advice, nothing matched', async () => {
    const side = await run('handwriting_03.png', undefined, r => sideways(r).raster);
    expect(side.quality.issues.map(i => i.code)).toContain('sideways');
    expect(side.alignment.summary.units.aligned).toBe(0);
    const down = await run('handwriting_03.png', undefined, r => upsideDown(r).raster);
    expect(down.orientation.status).toBe('upside-down');
    expect(down.alignment.summary.units.aligned).toBe(0); // Phase 8 matched 1 unit here, wrongly
    expect(down.extraction.summary.extracted).toBe(0);
  });
});
