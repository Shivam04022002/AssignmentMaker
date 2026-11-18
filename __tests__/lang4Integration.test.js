/**
 * Lang4 Phase 16 — integration audit: the whole personal-handwriting flow in
 * the app's own screens, one step after the other on the same profile.
 *
 *   five photos → analysis → profile → saved version → New Document →
 *   editor (typing, formatting, undo / redo, save) → reopen → thumbnails →
 *   PDF / PNG / JPG export → a newer version → rename → delete → missing
 *
 * The photos are SYNTHETIC pages (geometric pseudo-glyphs, no fonts,
 * nobody's writing) served through a fake image picker, and the exporter is
 * a recording fake: this checks the integration — the exact version is
 * pinned, drawn and exported everywhere, never another handwriting — not
 * real-handwriting accuracy, device rendering or native file output.
 */
import React from 'react';
import { Alert } from 'react-native';
import { clearAllMockStorages } from '@react-native-async-storage/async-storage';
import PaperPage from '../src/components/PaperPage';
import { getHandwritingStyle, getHandwritingStyles, isPersonalStyleId } from '../src/data/handwritingStyles';
import { getPageMetrics, getPageType, rowHeightFor } from '../src/data/paper';
import { setNativeExporter } from '../src/export/nativeExporter';
import { hasGlyph } from '../src/handwriting/glyphs';
import { createDocument } from '../src/models/document';
import { paginateDocument } from '../src/utils/pagination';
import { setImageInput } from '../src/handwriting/learn/imageInput';
import { clearPersonalCache, loadPersonal } from '../src/handwriting/learn/personalStore';
import { createProfileVersion, listProfiles, listVersions, readProfileVersion, renameProfile, requestProfileDeletion } from '../src/handwriting/learn/profileRepository';
import { formatProfileRef, parseProfileRef } from '../src/handwriting/learn/profileSchema';
import { DEVANAGARI_ALPHABET, HINDI_SUGGESTED, LATIN_ALPHABET, LATIN_DIGITS_TEXT, MIXED_SUGGESTED, SAMPLE_SLOTS } from '../src/handwriting/learn/samplePrompts';
import { PERSONAL_HANDWRITING_ONBOARDING, VALIDATION_TOOLS } from '../src/dev/flags';
import CreateHandwritingScreen from '../src/screens/CreateHandwritingScreen';
import EditorScreen from '../src/screens/EditorScreen';
import NewDocumentScreen from '../src/screens/NewDocumentScreen';
import { getDocument, listDocuments, setStorageBackend } from '../src/storage/documentStorage';
import { act, byTestId, changeText, press, queryByTestId, render } from './helpers/render';
import { toBase64 } from './helpers/syntheticRaster';
import { syntheticTextPage } from './helpers/syntheticText';
import { chooseType } from './helpers/wizard';

jest.setTimeout(600000);

const outer = (r, id) => r.root.findAll(n => n.props.testID === id && typeof n.type !== 'string' && !(n.parent && n.parent.props.testID === id));
const textOf = node => {
  const out = [];
  const walk = n => (typeof n === 'string' ? out.push(n) : n && n.children && n.children.forEach(walk));
  walk(node);
  return out.join('');
};
const flush = async (n = 3) => {
  for (let i = 0; i < n; i++) {
    await act(async () => {
      await new Promise(res => setTimeout(res, 0));
    });
  }
};
async function waitFor(check, limit = 4000) {
  for (let i = 0; i < limit; i++) {
    if (check()) return;
    await flush(1);
  }
  throw new Error('condition not reached');
}
/** Every personal stroke drawn on screen, as SVG path data (the exact geometry). */
const personalStrokes = r =>
  r.root
    .findAll(n => n.props.testID === 'personal-handwriting-ink' && typeof n.type !== 'string')
    .flatMap(svg => svg.findAll(n => typeof n.props.d === 'string'))
    .filter((n, i, all) => all.indexOf(n) === i)
    .map(n => n.props.d);
/** Built-in (Lang1–3 engine) ink anywhere on screen. */
const builtInInk = r => outer(r, 'handwriting-ink').length;

// --- Synthetic photos through a fake picker ----------------------------------------------------

function photo(slot, text) {
  const lines = text.split('\n').length;
  const { raster } = syntheticTextPage(text, { width: 1400, xHeight: 26, stroke: 3, top: 104, lineGap: 104, marginX: 50, height: 104 * (lines + 1) + 40, jitter: 0.04 });
  return { raster, picked: { uri: `file:///cache/handwrite-samples/s${slot}.png`, mime: 'image/png', width: 3000, height: 4000, bytes: 2000000 + slot, orientation: 1 } };
}
function fakeNativeInput(pages) {
  const queue = [...pages];
  return {
    pickImage: jest.fn(async () => (queue.length ? queue.shift().picked : null)),
    decodeForAnalysis: jest.fn(async uri => {
      const p = pages.find(x => x.picked.uri === uri);
      return { width: p.raster.width, height: p.raster.height, encoding: 'gray8-base64', data: toBase64(p.raster.data), sourceWidth: p.raster.width * 2, sourceHeight: p.raster.height * 2, orientation: 1, orientationApplied: true, decodeMillis: 5 };
    }),
    releaseImage: jest.fn(async () => {}),
    clearTemporaryImages: jest.fn(async () => 0),
  };
}
// Phase 23: every photo shows its type's page. English + Hindi: photo 4 Everyday Hindi, photo 5 English and Hindi together.
const FREE_HINDI = HINDI_SUGGESTED;
const FREE_ENGLISH = MIXED_SUGGESTED;

// --- A recording exporter ------------------------------------------------------------------------

function recordingExporter() {
  const calls = [];
  let mounted = null;
  const pageInk = () => {
    const pages = mounted.root.findAll(n => n.props.testID === 'export-page' && n.props.page);
    return { pages: [...new Set(pages.map(p => p.props.page.number))], personal: personalStrokes(mounted).length, builtIn: builtInInk(mounted) };
  };
  return {
    calls,
    setRenderer: r => (mounted = r),
    exporter: {
      getExportDirectory: jest.fn(async () => '/cache/exports'),
      beginPdf: jest.fn(async (path, w, h) => {
        calls.push({ op: 'beginPdf', path, w, h });
        return 'job-1';
      }),
      addPdfPage: jest.fn(async () => calls.push({ op: 'addPdfPage', ...pageInk() })),
      finishPdf: jest.fn(async () => '/cache/exports/x/HandWrite.pdf'),
      cancelPdf: jest.fn(),
      captureView: jest.fn(async (tag, path, format, width) => {
        calls.push({ op: 'capture', path, format, width, ...pageInk() });
        return path;
      }),
      share: jest.fn(async () => true),
    },
  };
}

// --- The flow, step by step on one profile -------------------------------------------------------

const CONTENT = 'The quick fox said नमस्ते to the dog.\nHello दुनिया, how are you?\nकितने लोग here: 42 & more!';

describe('Lang4 end to end (synthetic photos, fake picker and exporter)', () => {
  const state = {};
  beforeAll(() => {
    clearAllMockStorages();
    setStorageBackend(null);
    clearPersonalCache();
  });
  afterEach(() => {
    setImageInput(null);
    setNativeExporter(null);
  });

  it('1. five photos → analysis → profile → version 1 saved locally', async () => {
    const texts = { 1: LATIN_ALPHABET, 2: DEVANAGARI_ALPHABET, 3: LATIN_DIGITS_TEXT, 4: FREE_HINDI, 5: FREE_ENGLISH };
    setImageInput(fakeNativeInput(SAMPLE_SLOTS.map(s => photo(s.slot, texts[s.slot]))));
    const onSaved = jest.fn();
    const r = await render(<CreateHandwritingScreen onBack={jest.fn()} onSaved={onSaved} />);
    await chooseType(r);
    for (const s of SAMPLE_SLOTS) {
      await press(r, `sample-pick-${s.slot}`);
    }
    await waitFor(() => SAMPLE_SLOTS.every(s => queryByTestId(r, `sample-quality-${s.slot}`) && /checked/.test(textOf(outer(r, `sample-quality-${s.slot}`)[0]))));
    await press(r, 'analyze-photos-button');
    await waitFor(() => queryByTestId(r, 'review-step'));
    expect(textOf(outer(r, 'build-status')[0])).toBe('Your handwriting is ready to save.');
    // Coverage is stated per script, never as complete support.
    expect(textOf(outer(r, 'support-Deva')[0])).not.toMatch(/complete|full support/i);
    await press(r, 'review-continue');
    await changeText(r, 'profile-name-input', 'Audit hand');
    await press(r, 'save-handwriting-button');
    await waitFor(() => onSaved.mock.calls.length > 0);
    state.ref = onSaved.mock.calls[0][0];
    state.id = parseProfileRef(state.ref).id;
    expect(state.ref).toBe(formatProfileRef(state.id, 1));
    const stored = (await readProfileVersion(state.id, 1)).profile;
    expect(stored.synthetic).toBeFalsy(); // built by the pipeline from (synthetic) photos, as the app would
    expect(JSON.stringify(stored)).not.toMatch(/file:\/\/|base64|data:/); // no photos, paths or pixels kept
  });

  it('2. New Document offers it and pins the exact version', async () => {
    const onCreate = jest.fn();
    const r = await render(<NewDocumentScreen onBack={jest.fn()} onCreate={onCreate} />);
    await waitFor(() => queryByTestId(r, `handwriting-personal-${state.id}`));
    await press(r, `handwriting-personal-${state.id}`);
    await press(r, 'create-document-button');
    state.doc = onCreate.mock.calls[0][0];
    expect(state.doc.handwritingStyle).toBe(state.ref);
  });

  it('3. editor: English / Hindi / mixed text, formatting, undo / redo, save — the same handwriting throughout', async () => {
    const r = await render(<EditorScreen initialDocument={state.doc} onClose={jest.fn()} />);
    await act(async () => {
      await loadPersonal(state.ref);
    });
    await press(r, 'toolbar-edit');
    await changeText(r, 'title-input', 'Audit');
    await changeText(r, 'text-input', CONTENT);
    await flush();
    const typed = personalStrokes(r);
    expect(typed.length).toBeGreaterThan(0);
    expect(builtInInk(r)).toBe(0); // never Lang1 or another built-in style
    // What it cannot write is listed, and drawn as dashed boxes.
    const banner = textOf(outer(r, 'personal-unsupported-banner')[0]);
    expect(banner).toMatch(/appear as dashed boxes/);
    expect(outer(r, 'personal-missing-glyph').length).toBeGreaterThan(0);

    // Selected-text settings: size up on “quick fox”, then undo and redo.
    const start = CONTENT.indexOf('quick fox');
    await act(async () => {
      byTestId(r, 'text-input', 'onSelectionChange').props.onSelectionChange({ nativeEvent: { selection: { start, end: start + 9 } } });
    });
    await press(r, 'selection-size-up');
    await flush();
    const spans = () => r.root.findAll(n => n.props.testID === 'paper-canvas' && n.props.document)[0].props.document.formatting.spans;
    expect(spans()).toEqual([{ start, end: start + 9, size: 1.1 }]);
    const sized = personalStrokes(r);
    expect(sized).not.toEqual(typed);
    await press(r, 'toolbar-undo');
    await flush();
    expect(spans()).toEqual([]);
    expect(personalStrokes(r)).toEqual(typed); // undo restores the exact drawing
    await press(r, 'toolbar-redo');
    await flush();
    expect(personalStrokes(r)).toEqual(sized);
    expect(builtInInk(r)).toBe(0);

    await press(r, 'save-button');
    await flush();
    const stored = await getDocument(state.doc.id);
    expect(stored).toMatchObject({ handwritingStyle: state.ref, content: CONTENT, title: 'Audit' });
    expect(stored.formatting.spans).toEqual([{ start, end: start + 9, size: 1.1 }]);
    state.strokes = sized;
  });

  it('4. reopening from storage draws exactly the same strokes', async () => {
    const r = await render(<EditorScreen documentId={state.doc.id} onClose={jest.fn()} />);
    await act(async () => {
      await loadPersonal(state.ref);
    });
    await waitFor(() => personalStrokes(r).length > 0);
    expect(personalStrokes(r)).toEqual(state.strokes);
    expect(builtInInk(r)).toBe(0);
  });

  it('5. thumbnails draw the pages in the same personal handwriting', async () => {
    const r = await render(<EditorScreen documentId={state.doc.id} onClose={jest.fn()} />);
    await act(async () => {
      await loadPersonal(state.ref);
    });
    await waitFor(() => personalStrokes(r).length > 0);
    await press(r, 'toolbar-pages');
    await flush();
    const thumbs = r.root.findAll(n => typeof n.props.testID === 'string' && /^thumb-page-\d+$/.test(n.props.testID) && typeof n.type !== 'string');
    expect(thumbs.length).toBeGreaterThan(0);
    thumbs.forEach(t => {
      expect(t.findAll(n => n.props.testID === 'personal-handwriting-ink').length).toBeGreaterThan(0);
      expect(t.findAll(n => n.props.testID === 'handwriting-ink')).toHaveLength(0);
    });
  });

  it.each([
    ['export-pdf', 'addPdfPage', null],
    ['export-png-all', 'capture', 'png'],
    ['export-jpg-current', 'capture', 'jpg'],
  ])('6. %s exports every page in the personal handwriting, never a built-in style', async (button, op, format) => {
    const rec = recordingExporter();
    setNativeExporter(rec.exporter);
    const r = await render(<EditorScreen documentId={state.doc.id} onClose={jest.fn()} />);
    rec.setRenderer(r);
    await act(async () => {
      await loadPersonal(state.ref);
    });
    await waitFor(() => personalStrokes(r).length > 0);
    await press(r, 'menu-button');
    await press(r, button);
    await waitFor(() => rec.calls.some(c => c.op === op) && queryByTestId(r, 'export-share'));
    const pages = rec.calls.filter(c => c.op === op);
    expect(pages.length).toBeGreaterThan(0);
    pages.forEach(c => {
      expect(c.personal).toBeGreaterThan(0);
      expect(c.builtIn).toBe(0);
      if (format) expect(c.format).toBe(format);
    });
  });

  it('7. a newer version does not change the document: it stays on version 1', async () => {
    const v1 = (await readProfileVersion(state.id, 1)).profile;
    const v2 = JSON.parse(JSON.stringify(v1));
    v2.version = 2;
    v2.createdAt = v1.createdAt + 1;
    Object.values(v2.units).forEach(u => (u.forms || []).forEach(f => (f.w = f.w * 1.3)));
    expect((await createProfileVersion(v2)).status).toBe('ok');
    expect(await listVersions(state.id)).toEqual([1, 2]);
    clearPersonalCache();
    const r = await render(<EditorScreen documentId={state.doc.id} onClose={jest.fn()} />);
    await act(async () => {
      await loadPersonal(state.ref);
    });
    await waitFor(() => personalStrokes(r).length > 0);
    expect((await getDocument(state.doc.id)).handwritingStyle).toBe(state.ref);
    expect(personalStrokes(r)).toEqual(state.strokes);
  });

  it('8. rename, then delete: the document keeps its version; the unused one goes', async () => {
    expect((await renameProfile(state.id, 'Renamed hand')).status).toBe('ok');
    expect((await readProfileVersion(state.id, 1)).profile.name).toBe('Audit hand'); // versions keep their name
    const result = await requestProfileDeletion(state.id, { documents: await listDocuments() });
    expect(result).toEqual({ status: 'ok', removed: [2], retained: [1] });
    expect(await listProfiles()).toEqual([]); // hidden from the gallery
    clearPersonalCache();
    const r = await render(<EditorScreen documentId={state.doc.id} onClose={jest.fn()} />);
    await act(async () => {
      await loadPersonal(state.ref);
    });
    await waitFor(() => personalStrokes(r).length > 0);
    expect(personalStrokes(r)).toEqual(state.strokes);
    expect(queryByTestId(r, 'personal-handwriting-banner-error')).toBe(false);
  });

  it('9. a reference to a removed version: explicit notice, no ink, export refused — no fallback', async () => {
    const ref = formatProfileRef(state.id, 2); // removed in step 8
    const doc = { ...state.doc, id: 'doc-missing-version', handwritingStyle: ref };
    const rec = recordingExporter();
    setNativeExporter(rec.exporter);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const r = await render(<EditorScreen initialDocument={doc} onClose={jest.fn()} />);
    rec.setRenderer(r);
    await act(async () => {
      await loadPersonal(ref);
    });
    await flush();
    expect(textOf(outer(r, 'personal-handwriting-banner-error')[0])).toMatch(/not shown in another handwriting/);
    expect(personalStrokes(r)).toEqual([]);
    expect(builtInInk(r)).toBe(0);
    await press(r, 'menu-button');
    await press(r, 'export-pdf');
    await flush(20);
    expect(rec.exporter.beginPdf).not.toHaveBeenCalled();
    expect(rec.exporter.captureView).not.toHaveBeenCalled();
    const shown = [...alert.mock.calls.map(c => c.join(' ')), ...outer(r, 'export-dialog').map(textOf)].join(' ');
    expect(shown).toMatch(/Personal handwriting unavailable/);
    alert.mockRestore();
  });
});

// --- Built-in styles: the regression rows of the matrix -------------------------------------------

describe('built-in styles with English, Hindi and mixed text (regression rows)', () => {
  const TEXTS = { English: 'Q1. The quick brown fox, 42 times!', Hindi: 'नमस्ते दुनिया', mixed: 'Hello दुनिया 42' };
  const builtIns = getHandwritingStyles().filter(s => !isPersonalStyleId(s.id));

  it('there are built-in styles to check, and none is personal', () => {
    expect(builtIns.length).toBeGreaterThanOrEqual(3);
  });

  it.each(builtIns.flatMap(s => Object.keys(TEXTS).map(t => [s.id, t])))('%s / %s: drawn by the built-in engine only', async (styleId, kind) => {
    const doc = { ...createDocument({ handwritingStyle: styleId }), content: TEXTS[kind] };
    const style = getHandwritingStyle(styleId);
    const type = getPageType(doc.pageType);
    const metrics = getPageMetrics({ pageType: doc.pageType });
    const rowHeight = rowHeightFor(type, metrics, style);
    const paged = paginateDocument({ ...doc, style, metrics, rowHeight, seed: doc.id });
    const r = await render(<PaperPage document={doc} page={paged.pages[0]} layout={paged.layout} metrics={metrics} rowHeight={rowHeight} width={360} />);
    expect(builtInInk(r)).toBeGreaterThan(0);
    expect(personalStrokes(r)).toEqual([]);
    expect(queryByTestId(r, 'personal-missing-glyph')).toBe(false);
    // Built-in glyph sets have no Devanagari: Hindi is drawn as the neutral mark (documented as unsupported).
    const hindi = [...TEXTS[kind]].filter(ch => /[ऀ-ॿ]/.test(ch));
    hindi.forEach(ch => expect(hasGlyph(ch, style.glyphSet)).toBe(false));
  });
});

describe('release state', () => {
  it('onboarding stays tied to development / validation builds', () => {
    expect(PERSONAL_HANDWRITING_ONBOARDING).toBe(VALIDATION_TOOLS);
  });
});
