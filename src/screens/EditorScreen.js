/**
 * Document editor.
 *
 *   Document data (meta + plain text)          ← source of truth
 *        ↓
 *   Text editor (TextInput, undo/redo history)
 *        ↓
 *   Pagination (utils/pagination.js: sheets → layout lines → pages)
 *        ↓
 *   Handwriting renderer (HandwritingLines) on PaperPage
 *        ↓
 *   Export (ExportRenderer → native exporter) — the same PaperPage
 *
 * The handwriting is regenerated from the text on every change; nothing
 * rendered is ever stored.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import EditorToolbar from '../components/EditorToolbar';
import HandwritingStyleSelector from '../components/HandwritingStyleSelector';
import { MoreIcon } from '../components/Icons';
import PageTypeSelector from '../components/PageTypeSelector';
import PagesOverview from '../components/PagesOverview';
import BuiltInScriptNotice from '../components/BuiltInScriptNotice';
import { PersonalDocumentBanner } from '../components/PersonalHandwriting';
import PaperPage from '../components/PaperPage';
import SelectionFormatBar from '../components/SelectionFormatBar';
import WordGapControl from '../components/WordGapControl';
import ZoomablePage, { stepZoom } from '../components/ZoomablePage';
import ScreenHeader, { IconButton } from '../components/ScreenHeader';
import ExportRenderer from '../export/ExportRenderer';
import { EXPORT_FORMATS, buildExportPlan } from '../export/exportPlan';
import { isExportAvailable, shareFiles } from '../export/nativeExporter';
import useDocumentPages from '../hooks/useDocumentPages';
import useDocumentHistory from '../hooks/useDocumentHistory';
import DrawingSurface from '../ink/DrawingSurface';
import {
  DEFAULT_TOOLS,
  ERASER_SIZES,
  eraseStrokes,
  remapInk,
} from '../ink/strokes';
import { hasDocumentChanges } from '../models/document';
import {
  emptyFormatting,
  headingAt,
  isUnderlined,
  reformat,
  applySpanFormat,
  boundariesIn,
  gapAt,
  selectionFormat,
  setWordGap,
  toggleHeading,
  toggleUnderline,
} from '../utils/formatting';
import {
  deleteDocument,
  getDocument,
  saveDocument,
} from '../storage/documentStorage';
import {
  addPage,
  deletePage,
  movePage,
  pageHasContent,
} from '../utils/pageOps';
import { PAGE_BREAK, pageIndexAt } from '../utils/pagination';
import { getPenColor } from '../data/pens';
import { isPersonalStyleId } from '../data/handwritingStyles';
import { purgeOrphanedVersions } from '../handwriting/learn/profileRepository';
import { colors, radii, spacing, typography } from '../theme/theme';

const PAPER_GUTTER = 16;
const MAX_PAPER_WIDTH = 720;

function SettingsSheet({
  visible,
  onClose,
  meta,
  onChange,
  onDelete,
  canDelete,
  onExport,
  pageCount,
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        testID="settings-backdrop"
      />
      <View
        style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}
      >
        <View style={styles.sheetHandle} />
        <ScrollView
          style={styles.sheetList}
          contentContainerStyle={styles.sheetContent}
        >
          <Text style={styles.sheetLabel}>Export</Text>
          <View style={styles.exportRow}>
            <ExportButton
              label="PDF"
              detail={`${pageCount} ${pageCount === 1 ? 'page' : 'pages'}`}
              onPress={() => onExport('pdf', 'all')}
              testID="export-pdf"
            />
            <ExportButton
              label="PNG"
              detail="This page"
              onPress={() => onExport('png', 'current')}
              testID="export-png-current"
            />
            <ExportButton
              label="PNG"
              detail="All pages"
              onPress={() => onExport('png', 'all')}
              testID="export-png-all"
            />
            <ExportButton
              label="JPG"
              detail="This page"
              onPress={() => onExport('jpg', 'current')}
              testID="export-jpg-current"
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Page numbers on paper</Text>
            <Switch
              value={!!meta.pageNumbers}
              onValueChange={pageNumbers => onChange({ pageNumbers })}
              accessibilityLabel="Page numbers on paper"
              testID="page-numbers-switch"
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Natural corrections</Text>
            <Switch
              value={!!meta.naturalCorrections}
              onValueChange={naturalCorrections =>
                onChange({ naturalCorrections })
              }
              accessibilityLabel="Natural corrections"
              accessibilityHint="Occasionally shows a letter written over or struck through, as in real handwriting. Your text is not changed."
              testID="natural-corrections-switch"
            />
          </View>
          <Text style={[styles.sheetLabel, styles.sheetLabelSpaced]}>
            Page Type
          </Text>
          <PageTypeSelector
            value={meta.pageType}
            onChange={pageType => onChange({ pageType })}
          />
          <Text style={[styles.sheetLabel, styles.sheetLabelSpaced]}>
            Handwriting
          </Text>
          <HandwritingStyleSelector
            value={meta.handwritingStyle}
            pen={meta.pen}
            onChange={handwritingStyle => onChange({ handwritingStyle })}
          />
          {canDelete ? (
            <Pressable
              onPress={onDelete}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.deleteButton,
                pressed && styles.pressed,
              ]}
              testID="delete-document-button"
            >
              <Text style={styles.deleteText}>Delete document</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function ExportButton({ label, detail, onPress, testID }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Export ${label}, ${detail}`}
      testID={testID}
      style={({ pressed }) => [styles.exportButton, pressed && styles.pressed]}
    >
      <Text style={styles.exportLabel}>{label}</Text>
      <Text style={styles.exportDetail}>{detail}</Text>
    </Pressable>
  );
}

function FormatButton({
  label,
  underlined,
  active,
  onPress,
  accessibilityLabel,
  testID,
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: !!active }}
      testID={testID}
      style={[styles.formatButton, active && styles.formatButtonActive]}
    >
      <Text
        style={[
          styles.formatButtonText,
          underlined && styles.formatButtonUnderlined,
          active && styles.formatButtonTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Removes versions of deleted handwritings no document uses any more (never blocks the editor). */
function tidyProfiles() {
  purgeOrphanedVersions().catch(error => console.warn('[HandWrite] Could not tidy handwriting profiles', error));
}

export default function EditorScreen({ documentId, initialDocument, onClose }) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const scrollRef = useRef(null);
  const scrollOffset = useRef(0);
  const zoomRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const inputRef = useRef(null);
  const selectionRef = useRef({ start: 0, end: 0 });

  const [meta, setMeta] = useState(initialDocument || null);
  const [saved, setSaved] = useState(null); // last persisted copy
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved
  // One history for typed text, freehand ink and page operations.
  const history = useDocumentHistory(
    initialDocument ? initialDocument.content : '',
    initialDocument ? initialDocument.ink : {},
  );
  const {
    text,
    setText,
    reset,
    ink,
    setInk,
    applyCompound,
    recordFormatting,
    formattingRestore,
  } = history;
  // Explicit tools: 'text' edits typed text; 'pen' and 'marker' draw;
  // 'eraser' removes freehand ink only.
  const [tool, setTool] = useState('text');
  const [penSettings, setPenSettings] = useState(DEFAULT_TOOLS.pen);
  const [markerSettings, setMarkerSettings] = useState(DEFAULT_TOOLS.marker);
  const [eraserSize, setEraserSize] = useState(DEFAULT_TOOLS.eraser.size);
  // While erasing: the page's strokes before the gesture and the preview.
  const eraseBaseRef = useRef(null);
  const [erasePreview, setErasePreview] = useState(null);
  // Text the current formatting ranges refer to (see the effect below).
  const formattedTextRef = useRef(
    initialDocument ? initialDocument.content : '',
  );
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  // Rendered page shown in the editor (pages flow automatically).
  const [currentPage, setCurrentPage] = useState(0);
  const [pagesOpen, setPagesOpen] = useState(false);
  // { plan, phase: running|done|error, done, total, outputs, error }
  const [exportRun, setExportRun] = useState(null);
  // Absolute offset where the sheet being edited starts (see sheet below).
  const sheetStartRef = useRef(0);
  // After typing, show the page the cursor ended up on.
  const followCursorRef = useRef(false);

  // Open an existing document.
  useEffect(() => {
    if (!documentId) {
      return undefined;
    }
    let cancelled = false;
    getDocument(documentId).then(doc => {
      if (cancelled) {
        return;
      }
      if (!doc) {
        Alert.alert('Document not found', 'It may have been deleted.');
        onClose();
        return;
      }
      formattedTextRef.current = doc.content;
      setMeta(doc);
      setSaved(doc);
      reset(doc.content, doc.ink);
    });
    return () => {
      cancelled = true;
    };
  }, [documentId, onClose, reset]);

  // Formatting follows the words it was applied to: every text change
  // (typing, paste, undo, redo) moves the ranges with the same minimal patch.
  useEffect(() => {
    const previous = formattedTextRef.current;
    if (previous === text) {
      return;
    }
    formattedTextRef.current = text;
    setMeta(current =>
      current
        ? {
            ...current,
            formatting: reformat(
              current.formatting || emptyFormatting(),
              previous,
              text,
            ),
          }
        : current,
    );
  }, [text]);

  // The text panel edits one sheet; formatting works on absolute offsets.
  const absoluteSelection = () => ({
    start: sheetStartRef.current + selectionRef.current.start,
    end: sheetStartRef.current + selectionRef.current.end,
  });

  // Undo/redo of a formatting change hands back the formatting to restore.
  useEffect(() => {
    if (!formattingRestore) {
      return;
    }
    formattedTextRef.current = text;
    setMeta(current =>
      current ? { ...current, formatting: formattingRestore.value } : current,
    );
    // Only when a restore arrives (its token changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formattingRestore]);

  /** Applies a formatting change as one undoable step. */
  const changeFormatting = useCallback(
    change => {
      if (!meta) {
        return;
      }
      const before = meta.formatting || emptyFormatting();
      const after = change(before);
      if (after === before) {
        return;
      }
      setMeta(current => ({ ...current, formatting: after }));
      recordFormatting(before, after);
    },
    [meta, recordFormatting],
  );

  const applyHeading = useCallback(() => {
    const range = absoluteSelection();
    changeFormatting(f => toggleHeading(f, text, range));
  }, [text, changeFormatting]);

  const applyUnderline = useCallback(() => {
    const range = absoluteSelection();
    changeFormatting(f => toggleUnderline(f, text, range));
  }, [text, changeFormatting]);

  /** The space between one exact pair of words (one undoable step). */
  const applyWordGap = useCallback(
    (boundary, value) => {
      changeFormatting(f => setWordGap(f, text, boundary, value));
    },
    [text, changeFormatting],
  );

  /** Handwriting of the selected text: colour, pen/marker, size, spacing. */
  const applySelectionFormat = useCallback(
    patchOrReset => {
      const range = absoluteSelection();
      changeFormatting(f => applySpanFormat(f, text, range, patchOrReset));
    },
    [text, changeFormatting],
  );

  const document = useMemo(
    () => (meta ? { ...meta, content: text, ink } : null),
    [meta, text, ink],
  );

  // Pages, laid out by the same engine the paper, thumbnails and export use.
  const paged = useDocumentPages(document);
  const pageCount = paged ? paged.pages.length : 1;
  const pageIndex = Math.min(currentPage, pageCount - 1);
  const page = paged ? paged.pages[pageIndex] : null;
  const sheet = paged && page ? paged.sheets[page.sheetIndex] : null;
  sheetStartRef.current = sheet ? sheet.start : 0;

  useEffect(() => {
    if (currentPage > pageCount - 1) {
      setCurrentPage(pageCount - 1);
    }
  }, [currentPage, pageCount]);

  // Typing past the end of a page continues on the next one: follow it.
  useEffect(() => {
    if (!followCursorRef.current || !paged || !sheet) {
      return;
    }
    followCursorRef.current = false;
    const cursor = sheet.start + selectionRef.current.end;
    const target = pageIndexAt(paged.pages, cursor);
    if (paged.pages[target].sheetIndex === page.sheetIndex) {
      setCurrentPage(target);
    }
  }, [paged, sheet, page]);

  /** Applies a page operation: text, formatting and page ids together. */
  const applyPageDoc = useCallback(
    (next, inkKeyMap, removedPageKeys) => {
      // The operation already moved the formatting; don't map it twice.
      formattedTextRef.current = next.content;
      setMeta(current => ({
        ...current,
        formatting: next.formatting,
        pageIds: next.pageIds,
      }));
      // Text and ink change together: one undo step. Ink follows its page.
      applyCompound(next.content, remapInk(ink, inkKeyMap, removedPageKeys));
    },
    [applyCompound, ink],
  );

  const goToPage = useCallback(
    index => {
      const target = Math.max(0, Math.min(index, pageCount - 1));
      setCurrentPage(target);
      // Put the text cursor where the shown page begins, so typing happens
      // on the page being looked at.
      const p = paged && paged.pages[target];
      if (p) {
        const rel = p.start - paged.sheets[p.sheetIndex].start;
        selectionRef.current = { start: rel, end: rel };
        setTimeout(() => inputRef.current?.setSelection?.(rel, rel), 0);
      }
    },
    [pageCount, paged],
  );

  const pageDoc = () => ({
    content: text,
    formatting: meta.formatting,
    pageIds: paged.pageIds,
  });

  const addPageAfter = index => {
    const at = paged.pages[index];
    const { doc: next, sheetIndex } = addPage(pageDoc(), at.sheetIndex);
    applyPageDoc(next);
    // The new page follows every page of the sheet it was added after.
    const firstOfSheet = paged.pages.filter(
      p => p.sheetIndex < sheetIndex,
    ).length;
    setCurrentPage(firstOfSheet);
    return firstOfSheet;
  };

  const removePage = index => {
    const run = () => {
      const next = deletePage(pageDoc(), paged.pages, index);
      applyPageDoc(next, next.inkKeyMap, next.removedPageKeys);
      setCurrentPage(Math.max(0, Math.min(index, paged.pages.length - 2)));
    };
    if (!pageHasContent(paged.pages, index)) {
      if (paged.pages.length > 1) {
        run();
      }
      return;
    }
    Alert.alert(
      'Delete page?',
      paged.pages.length === 1
        ? 'This page contains handwriting. It will be cleared.'
        : 'This page contains handwriting. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: run },
      ],
    );
  };

  const reorderPage = (index, direction) => {
    const result = movePage(pageDoc(), paged.pages, index, direction);
    if (result) {
      applyPageDoc(result.doc, result.keyMap);
      setCurrentPage(result.index);
    }
  };

  const startExport = (format, scope) => {
    setMenuOpen(false);
    if (!isExportAvailable()) {
      Alert.alert(
        'Export unavailable',
        'This build of the app does not include the exporter.',
      );
      return;
    }
    const plan = buildExportPlan({
      title: meta.title,
      format,
      scope,
      pageCount,
      currentPage: pageIndex,
    });
    setExportRun({
      plan,
      phase: 'running',
      done: 0,
      total: plan.pageIndexes.length,
      outputs: [],
    });
  };

  const shareExport = async () => {
    try {
      await shareFiles(exportRun.outputs, exportRun.plan.mime, meta.title);
    } catch (error) {
      Alert.alert(
        'Could not share',
        String(error && error.message ? error.message : error),
      );
    }
  };

  // A brand-new empty document has nothing worth keeping.
  const isDirty = document
    ? saved
      ? hasDocumentChanges(document, saved)
      : document.content.trim().length > 0
    : false;

  useEffect(() => {
    if (isDirty && saveState === 'saved') {
      setSaveState('idle');
    }
  }, [isDirty, saveState]);

  const updateMeta = useCallback(patch => {
    setMeta(current => ({ ...current, ...patch }));
  }, []);

  const save = useCallback(async () => {
    if (!document) {
      return null;
    }
    setSaveState('saving');
    try {
      const stored = await saveDocument(document);
      // A personal handwriting this document no longer uses may now be unused
      // by every document: remove its versions if its profile was deleted.
      if (saved && isPersonalStyleId(saved.handwritingStyle) && saved.handwritingStyle !== stored.handwritingStyle) {
        tidyProfiles();
      }
      setSaved(stored);
      setMeta(current => ({
        ...current,
        title: stored.title,
        updatedAt: stored.updatedAt,
      }));
      setSaveState('saved');
      return stored;
    } catch (error) {
      setSaveState('idle');
      Alert.alert(
        'Could not save',
        String(error && error.message ? error.message : error),
      );
      return null;
    }
  }, [document, saved]);

  const requestClose = useCallback(() => {
    if (!isDirty) {
      onClose();
      return;
    }
    Alert.alert('Save changes?', 'You have unsaved changes to this document.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onClose },
      {
        text: 'Save',
        onPress: async () => {
          if (await save()) {
            onClose();
          }
        },
      },
    ]);
  }, [isDirty, onClose, save]);

  const stopEditing = useCallback(() => {
    inputRef.current?.blur();
    setEditing(false);
  }, []);

  // Android back: leave edit mode first, then leave the screen.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (editing) {
        stopEditing();
      } else {
        requestClose();
      }
      return true;
    });
    return () => sub.remove();
  }, [editing, requestClose, stopEditing]);

  const startEditing = useCallback(() => {
    setEditing(true);
    // Focus after the editor panel has mounted.
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const toggleEditing = useCallback(() => {
    if (tool !== 'text') {
      setTool('text');
      startEditing();
    } else if (editing) {
      stopEditing();
    } else {
      startEditing();
    }
  }, [tool, editing, startEditing, stopEditing]);

  const chooseTool = useCallback(
    next => {
      setTool(next);
      if (next !== 'text') {
        stopEditing(); // drawing needs the whole page, not the keyboard
      }
    },
    [stopEditing],
  );

  // --- Freehand ink -------------------------------------------------------
  const pageKey = page ? page.key : null;

  const addStroke = useCallback(
    stroke => {
      if (!pageKey) {
        return;
      }
      setInk({ ...ink, [pageKey]: [...(ink[pageKey] || []), stroke] });
    },
    [ink, pageKey, setInk],
  );

  const eraserRadius = (
    ERASER_SIZES.find(size => size.id === eraserSize) || ERASER_SIZES[1]
  ).radius;

  const onEraseStart = useCallback(() => {
    eraseBaseRef.current = (pageKey && ink[pageKey]) || [];
  }, [ink, pageKey]);

  const onEraseMove = useCallback(
    path => {
      const base = eraseBaseRef.current || [];
      const next = eraseStrokes(base, path, eraserRadius);
      setErasePreview(next === base ? null : next);
    },
    [eraserRadius],
  );

  // One eraser gesture = one undo step.
  const onEraseEnd = useCallback(
    path => {
      const base = eraseBaseRef.current || [];
      eraseBaseRef.current = null;
      setErasePreview(null);
      if (!path || !pageKey) {
        return;
      }
      const next = eraseStrokes(base, path, eraserRadius);
      if (next === base) {
        return;
      }
      const updated = { ...ink };
      if (next.length) {
        updated[pageKey] = next;
      } else {
        delete updated[pageKey];
      }
      setInk(updated);
    },
    [eraserRadius, ink, pageKey, setInk],
  );

  // Adds a new paragraph at the end of the sheet being edited.
  const addText = useCallback(() => {
    const start = sheet ? sheet.start : 0;
    const end = sheet ? sheet.end : text.length;
    const sheetText = text.slice(start, end);
    const needsBreak = sheetText.length > 0 && !sheetText.endsWith('\n\n');
    const nextSheet = needsBreak
      ? sheetText.replace(/\n?$/, '\n\n')
      : sheetText;
    setText(text.slice(0, start) + nextSheet + text.slice(end), {
      coalesce: false,
    });
    selectionRef.current = { start: nextSheet.length, end: nextSheet.length };
    followCursorRef.current = true;
    setEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelection?.(nextSheet.length, nextSheet.length);
    }, 50);
  }, [text, setText, sheet]);

  // The text panel shows one sheet; splice its edits back into the document.
  const onChangeText = useCallback(
    value => {
      const start = sheet ? sheet.start : 0;
      const end = sheet ? sheet.end : text.length;
      // Page breaks are made with Add Page, never typed or pasted.
      const clean = value.split(PAGE_BREAK).join('\n');
      followCursorRef.current = true;
      setText(text.slice(0, start) + clean + text.slice(end));
    },
    [setText, text, sheet],
  );

  const deleteCurrent = useCallback(() => {
    Alert.alert('Delete document?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setMenuOpen(false);
          try {
            await deleteDocument(meta.id);
          } catch (error) {
            Alert.alert('Could not delete', 'The document is unchanged. Please try again.');
            return;
          }
          if (isPersonalStyleId(meta.handwritingStyle)) {
            tidyProfiles();
          }
          onClose();
        },
      },
    ]);
  }, [meta, onClose]);

  if (!document) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }

  const formatting = meta.formatting || emptyFormatting();
  const sheetStart = sheet ? sheet.start : 0;
  const sheetText = sheet ? sheet.text : text;
  const currentHeading = headingAt(
    formatting,
    text,
    sheetStart + selection.start,
  );
  const selectionUnderlined =
    selection.end > selection.start &&
    isUnderlined(
      formatting,
      sheetStart + selection.start,
      sheetStart + selection.end,
    );
  const paperWidth = Math.min(window.width - PAPER_GUTTER * 2, MAX_PAPER_WIDTH);
  const editorHeight = Math.round(
    Math.min(150, Math.max(96, window.height * 0.18)),
  );
  const saveLabel =
    saveState === 'saving'
      ? 'Saving…'
      : saveState === 'saved' && !isDirty
      ? 'Saved'
      : 'Save';

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader
        onBack={requestClose}
        right={
          <>
            <Pressable
              onPress={save}
              disabled={saveState === 'saving'}
              accessibilityRole="button"
              accessibilityLabel="Save document"
              testID="save-button"
              style={({ pressed }) => [
                styles.saveButton,
                !isDirty && saved && styles.saveButtonIdle,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[
                  styles.saveText,
                  !isDirty && saved && styles.saveTextIdle,
                ]}
              >
                {saveLabel}
              </Text>
            </Pressable>
            <IconButton
              onPress={() => setMenuOpen(true)}
              label="Document settings"
              testID="menu-button"
            >
              <MoreIcon color={colors.text} />
            </IconButton>
          </>
        }
      >
        <TextInput
          value={meta.title}
          onChangeText={title => updateMeta({ title })}
          onEndEditing={() =>
            !meta.title.trim() &&
            updateMeta({ title: saved?.title || 'My Document' })
          }
          placeholder="Untitled"
          placeholderTextColor={colors.textFaint}
          maxLength={80}
          returnKeyType="done"
          accessibilityLabel="Document title"
          testID="title-input"
          style={styles.titleInput}
        />
      </ScreenHeader>
      <PersonalDocumentBanner paged={paged} />
      <BuiltInScriptNotice text={text} styleId={meta.handwritingStyle} />

      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.paperScroll}
          contentContainerStyle={styles.paperScrollContent}
          keyboardShouldPersistTaps="handled"
          onScroll={e => {
            scrollOffset.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
        >
          <ZoomablePage
            ref={zoomRef}
            zoom={zoom}
            onZoomChange={setZoom}
            baseWidth={paperWidth}
            viewportWidth={window.width}
            gutter={PAPER_GUTTER}
            top={spacing.sm}
            vertical={{ ref: scrollRef, offset: scrollOffset }}
          >
            {shownWidth => (
          <PaperPage
            document={document}
            page={page}
            layout={paged.layout}
            metrics={paged.metrics}
            rowHeight={paged.rowHeight}
            width={shownWidth}
            pageCount={pageCount}
            placeholder={
              pageCount === 1 ? 'Tap here to start writing…' : 'Empty page'
            }
            onPress={editing ? () => inputRef.current?.focus() : startEditing}
            ink={erasePreview || (pageKey ? ink[pageKey] : undefined)}
            overlay={
              tool !== 'text' ? (
                <DrawingSurface
                  tool={tool}
                  settings={tool === 'marker' ? markerSettings : penSettings}
                  eraserRadius={eraserRadius}
                  scale={shownWidth / paged.metrics.width}
                  pageWidth={paged.metrics.width}
                  pageHeight={paged.metrics.minHeight}
                  onStroke={addStroke}
                  onEraseStart={onEraseStart}
                  onEraseMove={onEraseMove}
                  onEraseEnd={onEraseEnd}
                />
              ) : null
            }
            testID="paper-canvas"
          />
            )}
          </ZoomablePage>
        </ScrollView>

        <View style={styles.pageBar}>
          <Pressable
            onPress={() => goToPage(pageIndex - 1)}
            disabled={pageIndex === 0}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Previous page"
            testID="page-prev"
            style={[styles.pageArrow, pageIndex === 0 && styles.disabled]}
          >
            <Text style={styles.pageArrowText}>‹</Text>
          </Pressable>
          <Pressable
            onPress={() => setPagesOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Page ${
              pageIndex + 1
            } of ${pageCount}. Show all pages`}
            testID="page-indicator"
            style={styles.pageIndicator}
          >
            <Text style={styles.pageIndicatorText}>
              Page {pageIndex + 1} of {pageCount}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => goToPage(pageIndex + 1)}
            disabled={pageIndex >= pageCount - 1}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Next page"
            testID="page-next"
            style={[
              styles.pageArrow,
              pageIndex >= pageCount - 1 && styles.disabled,
            ]}
          >
            <Text style={styles.pageArrowText}>›</Text>
          </Pressable>
          <View style={styles.zoomControls}>
            <Pressable
              onPress={() => zoomRef.current?.zoomTo(stepZoom(zoom, -1))}
              disabled={zoom <= 0.751}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Zoom out"
              testID="zoom-out"
              style={[styles.zoomButton, zoom <= 0.751 && styles.disabled]}
            >
              <Text style={styles.zoomButtonText}>−</Text>
            </Pressable>
            <Pressable
              onPress={() => zoomRef.current?.reset()}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Zoom ${Math.round(zoom * 100)} percent. Reset view`}
              testID="zoom-reset"
              style={styles.zoomLabel}
            >
              <Text style={styles.zoomLabelText}>{Math.round(zoom * 100)}%</Text>
            </Pressable>
            <Pressable
              onPress={() => zoomRef.current?.zoomTo(stepZoom(zoom, 1))}
              disabled={zoom >= 2.999}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Zoom in"
              testID="zoom-in"
              style={[styles.zoomButton, zoom >= 2.999 && styles.disabled]}
            >
              <Text style={styles.zoomButtonText}>+</Text>
            </Pressable>
          </View>
        </View>

        <View
          style={[
            styles.bottom,
            {
              paddingBottom: editing ? spacing.sm : insets.bottom + spacing.sm,
            },
          ]}
        >
          {editing ? (
            <View style={styles.editorPanel}>
              <View style={styles.editorHeader}>
                <Text style={styles.editorLabel}>Text</Text>
                <View style={styles.formatButtons}>
                  <FormatButton
                    label="H"
                    accessibilityLabel={
                      currentHeading
                        ? currentHeading.underline
                          ? 'Heading with underline. Tap for heading without underline'
                          : 'Heading. Tap to remove heading'
                        : 'Make this paragraph a heading'
                    }
                    active={!!currentHeading}
                    onPress={applyHeading}
                    testID="format-heading"
                  />
                  <FormatButton
                    label="U"
                    underlined
                    accessibilityLabel="Underline selection"
                    active={selectionUnderlined}
                    onPress={applyUnderline}
                    testID="format-underline"
                  />
                </View>
                <Pressable
                  onPress={stopEditing}
                  hitSlop={8}
                  accessibilityRole="button"
                  testID="done-editing-button"
                >
                  <Text style={styles.doneText}>Done</Text>
                </Pressable>
              </View>
              {selection.end > selection.start ? (
                <SelectionFormatBar
                  format={selectionFormat(meta.formatting, text, {
                    start: sheetStartRef.current + selection.start,
                    end: sheetStartRef.current + selection.end,
                  })}
                  documentColor={getPenColor(meta.pen)}
                  onApply={applySelectionFormat}
                  onReset={() => applySelectionFormat('reset')}
                />
              ) : null}
              <WordGapControl
                boundaries={boundariesIn(text, {
                  start: sheetStartRef.current + selection.start,
                  end: sheetStartRef.current + selection.end,
                })}
                valueAt={boundary => gapAt(meta.formatting, boundary)}
                onSet={applyWordGap}
              />
              <TextInput
                ref={inputRef}
                value={sheetText}
                onChangeText={onChangeText}
                onSelectionChange={e => {
                  selectionRef.current = e.nativeEvent.selection;
                  setSelection(e.nativeEvent.selection);
                }}
                multiline
                scrollEnabled
                textAlignVertical="top"
                placeholder="Type or paste your text…"
                placeholderTextColor={colors.textFaint}
                autoCorrect
                accessibilityLabel="Document text"
                testID="text-input"
                style={[styles.textInput, { height: editorHeight }]}
              />
            </View>
          ) : null}
          <EditorToolbar
            tool={tool}
            onToolChange={chooseTool}
            penSettings={penSettings}
            onPenSettings={patch =>
              setPenSettings(current => ({ ...current, ...patch }))
            }
            markerSettings={markerSettings}
            onMarkerSettings={patch =>
              setMarkerSettings(current => ({ ...current, ...patch }))
            }
            eraserSize={eraserSize}
            onEraserSize={setEraserSize}
            pen={meta.pen}
            onPenChange={pen => updateMeta({ pen })}
            editing={editing}
            onToggleEdit={toggleEditing}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            onUndo={history.undo}
            onRedo={history.redo}
            onAddText={addText}
            onPages={() => setPagesOpen(true)}
          />
        </View>
      </KeyboardAvoidingView>

      <SettingsSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        meta={meta}
        onChange={updateMeta}
        onDelete={deleteCurrent}
        canDelete={!!saved}
        onExport={startExport}
        pageCount={pageCount}
      />

      <PagesOverview
        visible={pagesOpen}
        onClose={() => setPagesOpen(false)}
        document={document}
        paged={paged}
        currentPage={pageIndex}
        onOpenPage={index => {
          goToPage(index);
          setPagesOpen(false);
        }}
        onAddPage={addPageAfter}
        onMovePage={reorderPage}
        onDeletePage={removePage}
      />

      {exportRun && exportRun.phase === 'running' ? (
        <ExportRenderer
          plan={exportRun.plan}
          document={document}
          paged={paged}
          onProgress={(done, total) =>
            setExportRun(run => run && { ...run, done, total })
          }
          onFinish={outputs =>
            setExportRun(run => run && { ...run, phase: 'done', outputs })
          }
          onError={error =>
            setExportRun(
              run =>
                run && {
                  ...run,
                  phase: 'error',
                  error: String(error && error.message ? error.message : error),
                },
            )
          }
        />
      ) : null}

      <Modal
        visible={!!exportRun}
        transparent
        animationType="fade"
        onRequestClose={() =>
          exportRun && exportRun.phase !== 'running' && setExportRun(null)
        }
        statusBarTranslucent
      >
        <View style={styles.exportBackdrop}>
          {exportRun ? (
            <View style={styles.exportCard} testID="export-dialog">
              {exportRun.phase === 'running' ? (
                <>
                  <ActivityIndicator color={colors.accent} />
                  <Text style={styles.exportTitle}>Preparing document…</Text>
                  <Text style={styles.exportText} testID="export-progress">
                    Page {Math.min(exportRun.done + 1, exportRun.total)} of{' '}
                    {exportRun.total}
                  </Text>
                </>
              ) : exportRun.phase === 'done' ? (
                <>
                  <Text style={styles.exportTitle}>
                    {EXPORT_FORMATS[exportRun.plan.format].label}{' '}
                    {exportRun.outputs.length > 1 ? 'files' : 'file'} created
                  </Text>
                  <Text style={styles.exportText} testID="export-result">
                    {exportRun.plan.files.map(f => f.fileName).join('\n')}
                  </Text>
                  <View style={styles.exportActions}>
                    <Pressable
                      onPress={shareExport}
                      accessibilityRole="button"
                      testID="export-share"
                      style={[styles.exportAction, styles.exportPrimary]}
                    >
                      <Text style={styles.exportPrimaryText}>Share</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setExportRun(null)}
                      accessibilityRole="button"
                      testID="export-done"
                      style={styles.exportAction}
                    >
                      <Text style={styles.exportActionText}>Done</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.exportTitle}>Export failed</Text>
                  <Text style={styles.exportText}>{exportRun.error}</Text>
                  <Pressable
                    onPress={() => setExportRun(null)}
                    accessibilityRole="button"
                    testID="export-done"
                    style={styles.exportAction}
                  >
                    <Text style={styles.exportActionText}>Done</Text>
                  </Pressable>
                </>
              )}
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  pageBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
    gap: spacing.sm,
  },
  zoomControls: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: spacing.sm,
    gap: 2,
  },
  zoomButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomButtonText: {
    fontSize: 18,
    color: colors.text,
  },
  zoomLabel: {
    minWidth: 44,
    alignItems: 'center',
  },
  zoomLabelText: {
    fontSize: 12,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  pageArrow: {
    width: 36,
    height: 28,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageArrowText: {
    fontSize: 22,
    lineHeight: 24,
    color: colors.text,
  },
  pageIndicator: {
    paddingHorizontal: spacing.md,
    height: 28,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'center',
  },
  pageIndicatorText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.text,
  },
  disabled: {
    opacity: 0.3,
  },
  exportRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  exportButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  exportLabel: {
    ...typography.title,
    fontSize: 14,
  },
  exportDetail: {
    ...typography.caption,
    fontSize: 11,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  switchLabel: {
    ...typography.body,
  },
  sheetLabelSpaced: {
    marginTop: spacing.xl,
  },
  exportBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(20,20,20,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  exportCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  exportTitle: {
    ...typography.title,
    textAlign: 'center',
  },
  exportText: {
    ...typography.caption,
    textAlign: 'center',
  },
  exportActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignSelf: 'stretch',
  },
  exportAction: {
    flex: 1,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  exportPrimary: {
    backgroundColor: colors.charcoal,
  },
  exportPrimaryText: {
    color: colors.onCharcoal,
    fontWeight: '600',
  },
  exportActionText: {
    color: colors.text,
    fontWeight: '600',
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleInput: {
    ...typography.title,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  saveButton: {
    height: 34,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.charcoal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonIdle: {
    backgroundColor: colors.surfaceMuted,
  },
  saveText: {
    color: colors.onCharcoal,
    fontSize: 14,
    fontWeight: '600',
  },
  saveTextIdle: {
    color: colors.textMuted,
  },
  pressed: {
    opacity: 0.8,
  },
  body: {
    flex: 1,
  },
  paperScroll: {
    flex: 1,
  },
  paperScrollContent: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  bottom: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.sm,
    width: '100%',
    maxWidth: MAX_PAPER_WIDTH + PAPER_GUTTER * 2,
    alignSelf: 'center',
  },
  editorPanel: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  editorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  editorLabel: {
    ...typography.sectionLabel,
    fontSize: 11,
  },
  formatButtons: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginLeft: 'auto',
    marginRight: spacing.md,
  },
  formatButton: {
    minWidth: 30,
    height: 26,
    paddingHorizontal: 6,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  formatButtonActive: {
    backgroundColor: colors.charcoal,
  },
  formatButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  formatButtonUnderlined: {
    textDecorationLine: 'underline',
  },
  formatButtonTextActive: {
    color: colors.onCharcoal,
  },
  doneText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  textInput: {
    ...typography.body,
    paddingVertical: spacing.sm,
    paddingHorizontal: 0,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20,20,20,0.35)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    // Fixed height so the style list inside can scroll.
    height: '85%',
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginTop: spacing.sm,
  },
  sheetList: {
    flex: 1,
  },
  sheetContent: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg + 4,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  sheetLabel: {
    ...typography.sectionLabel,
    marginBottom: spacing.md,
  },
  deleteButton: {
    marginTop: spacing.xl,
    height: 48,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#E8C4C1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '600',
  },
});
