/**
 * Phase 5: multi-page documents and export.
 */
import React from 'react';
import { Alert } from 'react-native';
import { clearAllMockStorages } from '@react-native-async-storage/async-storage';
import { getHandwritingStyle } from '../src/data/handwritingStyles';
import {
  PAGE,
  getPageMetrics,
  getPageType,
  rowHeightFor,
} from '../src/data/paper';
import {
  PDF_PAGE,
  RASTER_WIDTH,
  buildExportPlan,
  exportFileName,
  sanitizeTitle,
} from '../src/export/exportPlan';
import ExportRenderer from '../src/export/ExportRenderer';
import { setNativeExporter } from '../src/export/nativeExporter';
import { createDocument, normalizeDocument } from '../src/models/document';
import EditorScreen from '../src/screens/EditorScreen';
import {
  getDocument,
  getStorageBackend,
  saveDocument,
  setStorageBackend,
} from '../src/storage/documentStorage';
import { emptyFormatting } from '../src/utils/formatting';
import {
  addPage,
  deletePage,
  documentSheets,
  isolatePage,
  movePage,
  pageHasContent,
} from '../src/utils/pageOps';
import {
  PAGE_BREAK,
  breakLines,
  normalizePageIds,
  pageIndexAt,
  paginateDocument,
  rowsPerPage,
  splitSheets,
} from '../src/utils/pagination';
import {
  act,
  byTestId,
  changeText,
  press,
  render,
  renderedHandwriting,
  restoreRealTimers,
} from './helpers/render';

const PARA =
  "Working capital management refers to the strategic process of managing a company's short-term assets and liabilities. ";
// Long enough for 3+ pages on the default (dense, reference-like) ruling.
const LONG = PARA.repeat(24).trim();

function paginate(doc, styleId = 'neat', pageType = 'lined') {
  const style = getHandwritingStyle(styleId);
  const type = getPageType(pageType);
  const metrics = getPageMetrics({ pageType });
  const rowHeight = rowHeightFor(type, metrics, style);
  return paginateDocument({
    content: doc.content,
    formatting: doc.formatting,
    pageIds: doc.pageIds,
    style,
    metrics,
    rowHeight,
    seed: doc.id || 'doc',
  });
}
const docOf = (content, pageIds, formatting = emptyFormatting()) => ({
  id: 'doc-mp',
  content,
  pageIds: normalizePageIds(pageIds, splitSheets(content).length),
  formatting,
});
const sheetsText = doc => documentSheets(doc).map(s => s.content);
const strip = r =>
  r.pages.map(p => ({ ...p, lines: p.lines.map(l => ({ ...l })) }));

beforeEach(() => {
  clearAllMockStorages();
  setStorageBackend(null);
  setNativeExporter(null);
});

describe('page model', () => {
  it('new documents have one page with a stable id', () => {
    const doc = createDocument();
    expect(doc.pageIds).toEqual(['page-1']);
    expect(doc.pageNumbers).toBe(false);
    expect(splitSheets(doc.content)).toHaveLength(1);
  });

  it('reads the explicit pages shape', () => {
    const doc = normalizeDocument({
      pages: [
        {
          id: 'a',
          content: 'First page',
          formatting: { underlines: [{ start: 0, end: 5 }] },
        },
        {
          id: 'b',
          content: 'Second page',
          formatting: { headings: [{ start: 0, end: 6 }] },
        },
      ],
    });
    expect(doc.content).toBe(`First page${PAGE_BREAK}Second page`);
    expect(doc.pageIds).toEqual(['a', 'b']);
    expect(doc.formatting.underlines).toEqual([{ start: 0, end: 5 }]);
    expect(doc.formatting.headings).toEqual([
      { start: 11, end: 17, underline: true },
    ]);
    expect(sheetsText(doc)).toEqual(['First page', 'Second page']);
  });

  it('fills, keeps and de-duplicates page ids', () => {
    expect(normalizePageIds(undefined, 1)).toEqual(['page-1']);
    expect(normalizePageIds(['x'], 3)).toEqual(['x', 'page-2', 'page-3']);
    expect(normalizePageIds(['x', 'x'], 2)).toEqual(['x', 'page-2']);
    expect(normalizePageIds(['a', 'b', 'c'], 2)).toEqual(['a', 'b']);
  });

  it('adds an empty page after a given page', () => {
    const doc = docOf(`One${PAGE_BREAK}Three`, ['a', 'c']);
    const { doc: next, sheetIndex } = addPage(doc, 0, () => 'b');
    expect(sheetIndex).toBe(1);
    expect(sheetsText(next)).toEqual(['One', '', 'Three']);
    expect(next.pageIds).toEqual(['a', 'b', 'c']);
  });

  it('deletes a page and its text, never leaving zero pages', () => {
    const doc = docOf(`One${PAGE_BREAK}Two${PAGE_BREAK}Three`, ['a', 'b', 'c']);
    const pages = paginate(doc).pages;
    const next = deletePage(doc, pages, 1);
    expect(sheetsText(next)).toEqual(['One', 'Three']);
    expect(next.pageIds).toEqual(['a', 'c']);
    const last = deletePage(next, paginate(next).pages, 1);
    expect(sheetsText(last)).toEqual(['One']);
    const only = deletePage(last, paginate(last).pages, 0);
    expect(sheetsText(only)).toEqual(['']);
    expect(only.pageIds).toEqual(['a']);
  });

  it('reorders pages, moving formatting with the text', () => {
    const doc = docOf(`Alpha text${PAGE_BREAK}Beta text`, ['a', 'b'], {
      ...emptyFormatting(),
      underlines: [{ start: 0, end: 5 }],
    });
    const result = movePage(doc, paginate(doc).pages, 0, 1);
    expect(result.index).toBe(1);
    expect(sheetsText(result.doc)).toEqual(['Beta text', 'Alpha text']);
    expect(result.doc.pageIds).toEqual(['b', 'a']);
    const alphaStart = result.doc.content.indexOf('Alpha');
    expect(result.doc.formatting.underlines).toEqual([
      { start: alphaStart, end: alphaStart + 5 },
    ]);
    expect(movePage(doc, paginate(doc).pages, 0, -1)).toBeNull();
  });

  it('isolates a continuation page before moving or deleting it', () => {
    const doc = docOf(LONG, ['a']);
    const pages = paginate(doc).pages;
    expect(pages.length).toBeGreaterThan(2);
    const { doc: isolated, sheetIndex } = isolatePage(doc, pages, 1);
    expect(sheetIndex).toBe(1);
    expect(splitSheets(isolated.content)).toHaveLength(3);
    // No text is lost or changed — only page breaks were inserted.
    expect(isolated.content.split(PAGE_BREAK).join('')).toBe(LONG);
    const deleted = deletePage(doc, pages, 1);
    expect(deleted.content.split(PAGE_BREAK).join('')).toBe(
      LONG.slice(0, pages[1].start) + LONG.slice(pages[1].end),
    );
  });

  it('knows whether a page has writing', () => {
    const pages = paginate(docOf(`Text${PAGE_BREAK}   `, ['a', 'b'])).pages;
    expect(pageHasContent(pages, 0)).toBe(true);
    expect(pageHasContent(pages, 1)).toBe(false);
  });
});

describe('automatic pagination', () => {
  it('keeps a short document on one page', () => {
    const r = paginate(docOf('Dear Sir,\n\nThank you.', ['a']));
    expect(r.pages).toHaveLength(1);
    expect(r.pages[0].text).toBe('Dear Sir,\n\nThank you.');
  });

  it.each(['lined', 'ruled', 'blank', 'wide', 'narrow'])(
    'flows a long document over several %s pages at real line boundaries',
    pageType => {
      const doc = docOf(LONG, ['a']);
      const r = paginate(doc, 'neat', pageType);
      const capacity = rowsPerPage(
        r.metrics || getPageMetrics({ pageType }),
        rowHeightFor(
          getPageType(pageType),
          getPageMetrics({ pageType }),
          getHandwritingStyle('neat'),
        ),
      );
      expect(r.pages.length).toBeGreaterThan(1);
      r.pages.forEach((p, i) => {
        expect(p.lines.length).toBeLessThanOrEqual(capacity);
        expect(p.number).toBe(i + 1);
        if (i > 0) {
          expect(p.lines[0].start).toBe(p.start); // starts on a line boundary
          expect(p.lines[0].words.length).toBeGreaterThan(0); // no blank top line
        }
      });
      // No text lost, none duplicated.
      expect(r.pages.map(p => p.text).join('')).toBe(LONG);
    },
  );

  it('starts every explicit page on a new sheet of paper', () => {
    const r = paginate(docOf(`Short one${PAGE_BREAK}Short two`, ['a', 'b']));
    expect(r.pages.map(p => p.text)).toEqual(['Short one', 'Short two']);
    expect(r.pages.map(p => p.sheetId)).toEqual(['a', 'b']);
  });

  it('never leaves a heading alone at the bottom of a page', () => {
    const lines = Array.from({ length: 6 }, (_, i) => ({
      start: i,
      words: [{}],
      heading: i === 2,
    }));
    expect(breakLines(lines, 3).map(p => p.length)).toEqual([2, 3, 1]);
  });

  it('finds the page showing a text position', () => {
    const r = paginate(docOf(LONG, ['a']));
    expect(pageIndexAt(r.pages, 0)).toBe(0);
    expect(pageIndexAt(r.pages, r.pages[1].start + 3)).toBe(1);
    expect(pageIndexAt(r.pages, LONG.length)).toBe(r.pages.length - 1);
  });
});

describe('large documents', () => {
  it.each([1, 3, 5, 10, 20])(
    'paginates a %i-page document completely and quickly',
    target => {
      const perPage = paginate(docOf(LONG, ['a'])).pages[0].text;
      const content = Array.from({ length: target }, () => perPage.trim()).join(
        PAGE_BREAK,
      );
      const doc = docOf(content);
      const started = Date.now();
      const r = paginate(doc);
      const elapsed = Date.now() - started;
      expect(r.pages).toHaveLength(target);
      expect(r.pages.map(p => p.text).join(PAGE_BREAK)).toBe(content);
      expect(elapsed).toBeLessThan(3000);
    },
  );
});

describe('determinism', () => {
  it('produces identical pages for the same document', () => {
    const doc = docOf(`${LONG}${PAGE_BREAK}Second`, ['a', 'b']);
    expect(strip(paginate(doc))).toEqual(strip(paginate(doc)));
  });

  it('seeds each page by its page id', () => {
    const r = paginate(
      docOf(`Same words here${PAGE_BREAK}Same words here`, ['a', 'b']),
    );
    expect(r.pages[0].lines[0].words[0].shape).not.toEqual(
      r.pages[1].lines[0].words[0].shape,
    );
  });

  it("keeps a page's handwriting when pages are reordered", () => {
    const doc = docOf(`First page${PAGE_BREAK}Second page`, ['a', 'b']);
    const before = paginate(doc).pages[1].lines[0].words.map(w => w.shape);
    const moved = movePage(doc, paginate(doc).pages, 1, -1).doc;
    const after = paginate({
      ...moved,
      id: doc.id,
    }).pages[0].lines[0].words.map(w => w.shape);
    expect(after).toEqual(before);
  });
});

describe('persistence', () => {
  it('saves and reopens a multi-page document exactly', async () => {
    const content = `Q1. Page one${PAGE_BREAK}Page two${PAGE_BREAK}Page three`;
    const formatting = {
      ...emptyFormatting(),
      headings: [{ start: 13, end: 21, underline: true }],
    };
    const saved = await saveDocument({
      ...createDocument({
        pageType: 'wide',
        pen: 'black',
        handwritingStyle: 'casual',
      }),
      content,
      formatting,
      pageIds: ['p1', 'p2', 'p3'],
      pageNumbers: true,
    });
    const doc = await getDocument(saved.id);
    expect(doc).toMatchObject({
      content,
      pageIds: ['p1', 'p2', 'p3'],
      pageType: 'wide',
      pen: 'black',
      handwritingStyle: 'casual',
      pageNumbers: true,
    });
    expect(doc.formatting.headings).toEqual([
      { start: 13, end: 21, underline: true },
    ]);
    expect(strip(paginate(doc, 'casual', 'wide'))).toEqual(
      strip(paginate(saved, 'casual', 'wide')),
    );
  });

  it('opens a Phase 1–4 single-page document without rewriting it', async () => {
    const legacy = {
      id: 'legacy',
      title: 'Old',
      pageType: 'lined',
      pen: 'blue',
      handwritingStyle: 'neat',
      content: 'Old single page document',
      formatting: {
        headings: [],
        underlines: [],
        labels: [],
        autoLabels: true,
      },
      createdAt: 1,
      updatedAt: 2,
      version: 2,
    };
    const raw = JSON.stringify(legacy);
    await getStorageBackend().setItem('document:legacy', raw);
    const doc = await getDocument('legacy');
    expect(doc.pageIds).toEqual(['page-1']);
    expect(paginate(doc).pages).toHaveLength(1);
    // Nothing is written back until the user saves.
    expect(await getStorageBackend().getItem('document:legacy')).toBe(raw);
  });
});

describe('editor pages', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => restoreRealTimers(jest));

  async function openEditor(content, extra = {}) {
    const doc = { ...createDocument(), content, ...extra };
    const r = await render(
      <EditorScreen initialDocument={doc} onClose={jest.fn()} />,
    );
    return { r, doc };
  }
  const indicator = r =>
    byTestId(r, 'page-indicator', 'accessibilityLabel').props
      .accessibilityLabel;
  const startEditing = async r => {
    await press(r, 'toolbar-edit');
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
  };

  it('navigates pages of a long document', async () => {
    const { r } = await openEditor(LONG);
    expect(indicator(r)).toMatch(/^Page 1 of [3-9]/);
    await press(r, 'page-next');
    expect(indicator(r)).toMatch(/^Page 2 of/);
    await press(r, 'page-prev');
    expect(indicator(r)).toMatch(/^Page 1 of/);
  });

  it('edits only the page being shown', async () => {
    const { r, doc } = await openEditor(
      `Page one text${PAGE_BREAK}Page two text`,
      {
        pageIds: ['a', 'b'],
      },
    );
    await press(r, 'page-next');
    await startEditing(r);
    expect(byTestId(r, 'text-input', 'value').props.value).toBe(
      'Page two text',
    );
    await changeText(r, 'text-input', 'Page two edited');
    await press(r, 'save-button');
    const stored = await getDocument(doc.id);
    expect(stored.content).toBe(`Page one text${PAGE_BREAK}Page two edited`);
    expect(stored.pageIds).toEqual(['a', 'b']);
  });

  it('adds, moves and deletes pages from the overview', async () => {
    const alert = jest
      .spyOn(Alert, 'alert')
      .mockImplementation((t, m, buttons) => {
        const destructive = (buttons || []).find(
          b => b.style === 'destructive',
        );
        destructive && destructive.onPress();
      });
    const { r, doc } = await openEditor('First page');
    await press(r, 'toolbar-pages');
    await press(r, 'add-page-button');
    expect(indicator(r)).toBe('Page 2 of 2. Show all pages');
    await press(r, 'close-pages');
    await startEditing(r);
    await changeText(r, 'text-input', 'Second page');
    await press(r, 'done-editing-button');
    await press(r, 'toolbar-pages');
    await press(r, 'page-thumb-1');
    await press(r, 'move-page-left');
    await press(r, 'save-button');
    expect(sheetsText(await getDocument(doc.id))).toEqual([
      'Second page',
      'First page',
    ]);
    await press(r, 'page-thumb-0');
    await press(r, 'delete-page-button');
    expect(alert).toHaveBeenCalledWith(
      'Delete page?',
      expect.any(String),
      expect.any(Array),
    );
    await press(r, 'save-button');
    expect(sheetsText(await getDocument(doc.id))).toEqual(['First page']);
    alert.mockRestore();
  });

  it('shows thumbnails drawn by the page renderer', async () => {
    const { r } = await openEditor(LONG);
    await press(r, 'toolbar-pages');
    const thumbs = r.root.findAll(
      n =>
        typeof n.props.testID === 'string' &&
        /^thumb-page-\d+$/.test(n.props.testID) &&
        typeof n.type !== 'string' &&
        n.props.page,
    );
    expect(thumbs.length).toBeGreaterThan(2);
    thumbs.forEach(t => expect(t.props.quality).toBe('preview'));
  });

  it('renders handwritten page numbers when enabled', async () => {
    const { r } = await openEditor('Numbered', { pageNumbers: false });
    expect(r.root.findAll(n => n.props.testID === 'page-number').length).toBe(
      0,
    );
    await press(r, 'menu-button');
    await act(async () => {
      byTestId(r, 'page-numbers-switch', 'onValueChange').props.onValueChange(
        true,
      );
    });
    expect(
      r.root.findAll(n => n.props.testID === 'page-number').length,
    ).toBeGreaterThan(0);
  });

  it('keeps single-page editing exactly as before', async () => {
    const { r } = await openEditor('');
    expect(renderedHandwriting(r)).toMatch(/start writing/);
    expect(indicator(r)).toBe('Page 1 of 1. Show all pages');
  });
});

describe('export plan', () => {
  it('builds safe, readable file names', () => {
    expect(exportFileName('International Market', 'pdf')).toBe(
      'HandWrite_International_Market.pdf',
    );
    expect(sanitizeTitle('  Q1: What/is*the "market"?  ')).toBe(
      'Q1_What_is_the_market',
    );
    expect(sanitizeTitle('Résumé — draft')).toBe('Resume_draft');
    expect(sanitizeTitle('')).toBe('Document');
    expect(sanitizeTitle('a'.repeat(200)).length).toBeLessThanOrEqual(60);
    expect(exportFileName('Notes', 'png', 3, 12)).toBe(
      'HandWrite_Notes_page-03.png',
    );
    expect(exportFileName('Notes', 'png', 3, 120)).toBe(
      'HandWrite_Notes_page-003.png',
    );
  });

  it('puts every page in a PDF, in order', () => {
    const plan = buildExportPlan({
      title: 'T',
      format: 'pdf',
      pageCount: 5,
      currentPage: 3,
    });
    expect(plan.pageIndexes).toEqual([0, 1, 2, 3, 4]);
    expect(plan.files).toEqual([
      { pageIndex: null, fileName: 'HandWrite_T.pdf' },
    ]);
    expect(plan.mime).toBe('application/pdf');
  });

  it('exports the current page or every page as images', () => {
    const current = buildExportPlan({
      title: 'T',
      format: 'png',
      scope: 'current',
      pageCount: 4,
      currentPage: 2,
    });
    expect(current.files).toEqual([
      { pageIndex: 2, fileName: 'HandWrite_T_page-03.png' },
    ]);
    const all = buildExportPlan({
      title: 'T',
      format: 'jpg',
      scope: 'all',
      pageCount: 3,
    });
    expect(all.files.map(f => f.fileName)).toEqual([
      'HandWrite_T_page-01.jpg',
      'HandWrite_T_page-02.jpg',
      'HandWrite_T_page-03.jpg',
    ]);
    expect(all.quality).toBeLessThan(1);
  });

  it('uses page dimensions matching the paper', () => {
    expect(PDF_PAGE.height / PDF_PAGE.width).toBeCloseTo(PAGE.aspectRatio, 2);
    const plan = buildExportPlan({ title: 'T', format: 'png', pageCount: 1 });
    expect(plan.pixelWidth).toBe(RASTER_WIDTH);
    expect(plan.pixelHeight / plan.pixelWidth).toBeCloseTo(PAGE.aspectRatio, 2);
    // Bounded memory: one A4 page at 150 dpi, never more than one at a time.
    expect(plan.pixelWidth * plan.pixelHeight * 4).toBeLessThan(
      10 * 1024 * 1024,
    );
  });
});

describe('export rendering', () => {
  function mockExporter() {
    const calls = [];
    let mounted = null;
    return {
      calls,
      setRenderer: r => (mounted = r),
      exporter: {
        getExportDirectory: jest.fn(async () => '/cache/exports'),
        beginPdf: jest.fn(async (path, w, h) => {
          calls.push(['beginPdf', path, w, h]);
          return 'job-1';
        }),
        addPdfPage: jest.fn(async () => {
          const pages = mounted.root.findAll(
            n => n.props.testID === 'export-page' && n.props.page,
          );
          calls.push([
            'addPdfPage',
            [...new Set(pages.map(p => p.props.page.number))],
          ]);
        }),
        finishPdf: jest.fn(async () => '/cache/exports/x/HandWrite_T.pdf'),
        cancelPdf: jest.fn(),
        captureView: jest.fn(async (tag, path, format, width) => {
          const pages = mounted.root.findAll(
            n => n.props.testID === 'export-page' && n.props.page,
          );
          calls.push([
            'capture',
            path,
            format,
            width,
            [...new Set(pages.map(p => p.props.page.number))],
          ]);
          return path;
        }),
        share: jest.fn(async () => true),
      },
    };
  }

  function pagedFor(doc) {
    const style = getHandwritingStyle(doc.handwritingStyle);
    const type = getPageType(doc.pageType);
    const metrics = getPageMetrics({ pageType: doc.pageType });
    const rowHeight = rowHeightFor(type, metrics, style);
    return {
      ...paginateDocument({ ...doc, style, metrics, rowHeight, seed: doc.id }),
      metrics,
      rowHeight,
    };
  }

  async function runExport(plan, doc) {
    const mock = mockExporter();
    setNativeExporter(mock.exporter);
    const progress = [];
    let finished = null;
    let failed = null;
    const r = await render(
      <ExportRenderer
        plan={plan}
        document={doc}
        paged={pagedFor(doc)}
        onProgress={(d, t) => progress.push([d, t])}
        onFinish={o => (finished = o)}
        onError={e => (failed = e)}
      />,
    );
    mock.setRenderer(r);
    for (let i = 0; i < 200 && !finished && !failed; i++) {
      await act(async () => {
        await new Promise(res => setTimeout(res, 10));
      });
    }
    return { mock, progress, finished, failed, r };
  }

  const longDoc = () => ({
    ...createDocument(),
    title: 'Market',
    content: LONG,
  });

  it('writes every page into one PDF, in order, one page mounted at a time', async () => {
    const doc = longDoc();
    const count = pagedFor(doc).pages.length;
    const plan = buildExportPlan({
      title: doc.title,
      format: 'pdf',
      pageCount: count,
    });
    const { mock, progress, finished, failed } = await runExport(plan, doc);
    expect(failed).toBeNull();
    expect(mock.calls[0]).toEqual([
      'beginPdf',
      '/cache/exports/' +
        mock.calls[0][1].split('/')[3] +
        '/HandWrite_Market.pdf',
      PDF_PAGE.width,
      PDF_PAGE.height,
    ]);
    const pages = mock.calls.filter(c => c[0] === 'addPdfPage').map(c => c[1]);
    expect(pages).toEqual(Array.from({ length: count }, (_, i) => [i + 1]));
    expect(progress[progress.length - 1]).toEqual([count, count]);
    expect(finished).toEqual(['/cache/exports/x/HandWrite_T.pdf']);
  }, 30000);

  it('exports each page as a numbered PNG at the planned resolution', async () => {
    const doc = longDoc();
    const count = pagedFor(doc).pages.length;
    const plan = buildExportPlan({
      title: doc.title,
      format: 'png',
      scope: 'all',
      pageCount: count,
    });
    const { mock, finished } = await runExport(plan, doc);
    const captures = mock.calls.filter(c => c[0] === 'capture');
    expect(captures).toHaveLength(count);
    captures.forEach((c, i) => {
      expect(c[1]).toMatch(
        new RegExp(`HandWrite_Market_page-0${i + 1}\\.png$`),
      );
      expect(c[2]).toBe('png');
      expect(c[3]).toBe(RASTER_WIDTH);
      expect(c[4]).toEqual([i + 1]);
    });
    expect(finished).toHaveLength(count);
  }, 30000);

  it("renders export pages with the editor's renderer and content", async () => {
    const doc = {
      ...createDocument({ handwritingStyle: 'casual' }),
      title: 'T',
      content: 'Q1. Same renderer\nAns: yes',
    };
    const plan = buildExportPlan({
      title: 'T',
      format: 'png',
      scope: 'current',
      pageCount: 1,
    });
    const mock = mockExporter();
    setNativeExporter(mock.exporter);
    const r = await render(
      <ExportRenderer
        plan={plan}
        document={doc}
        paged={pagedFor(doc)}
        onProgress={() => {}}
        onFinish={() => {}}
        onError={() => {}}
      />,
    );
    const page = r.root.findAll(
      n => n.props.testID === 'export-page' && n.props.page,
    )[0];
    expect(page.props.bare).toBe(true);
    expect(page.props.width).toBe(PAGE.width);
    expect(renderedHandwriting(r)).toBe('Q1. Same renderer\nAns: yes');
  });

  it('reports failures and cancels a half-written PDF', async () => {
    const doc = longDoc();
    const mock = mockExporter();
    mock.exporter.addPdfPage = jest.fn(async () => {
      throw new Error('disk full');
    });
    setNativeExporter(mock.exporter);
    let failed = null;
    const plan = buildExportPlan({ title: 'T', format: 'pdf', pageCount: 3 });
    await render(
      <ExportRenderer
        plan={plan}
        document={doc}
        paged={pagedFor(doc)}
        onProgress={() => {}}
        onFinish={() => {}}
        onError={e => (failed = e)}
      />,
    );
    for (let i = 0; i < 100 && !failed; i++) {
      await act(async () => {
        await new Promise(res => setTimeout(res, 10));
      });
    }
    expect(String(failed)).toMatch(/disk full/);
    expect(mock.exporter.cancelPdf).toHaveBeenCalledWith('job-1');
  }, 30000);

  it('exports and shares from the editor', async () => {
    const mock = mockExporter();
    setNativeExporter(mock.exporter);
    const doc = {
      ...createDocument(),
      title: 'International Market',
      content: LONG,
    };
    const r = await render(
      <EditorScreen initialDocument={doc} onClose={jest.fn()} />,
    );
    mock.setRenderer(r);
    await press(r, 'menu-button');
    await press(r, 'export-pdf');
    expect(
      r.root.findAll(n => n.props.testID === 'export-dialog').length,
    ).toBeGreaterThan(0);
    for (
      let i = 0;
      i < 300 &&
      r.root.findAll(n => n.props.testID === 'export-share').length === 0;
      i++
    ) {
      await act(async () => {
        await new Promise(res => setTimeout(res, 10));
      });
    }
    await press(r, 'export-share');
    expect(mock.exporter.share).toHaveBeenCalledWith(
      ['/cache/exports/x/HandWrite_T.pdf'],
      'application/pdf',
      'International Market',
    );
    expect(mock.exporter.beginPdf.mock.calls[0][0]).toMatch(
      /HandWrite_International_Market\.pdf$/,
    );
  }, 30000);

  it('explains when the exporter is not available', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const r = await render(
      <EditorScreen initialDocument={createDocument()} onClose={jest.fn()} />,
    );
    await press(r, 'menu-button');
    await press(r, 'export-pdf');
    expect(alert).toHaveBeenCalledWith(
      'Export unavailable',
      expect.any(String),
    );
    alert.mockRestore();
  });
});
