import React from 'react';
import { clearAllMockStorages } from '@react-native-async-storage/async-storage';
import EditorScreen from '../src/screens/EditorScreen';
import { getHandwritingStyle } from '../src/data/handwritingStyles';
import { createDocument } from '../src/models/document';
import {
  getDocument,
  saveDocument,
  setStorageBackend,
} from '../src/storage/documentStorage';
import {
  act,
  byTestId,
  changeText,
  handwritingPaths,
  inkColors,
  press,
  queryByTestId,
  render,
  renderedHandwriting,
  restoreRealTimers,
} from './helpers/render';

const BLUE = '#123A8C';
const BLACK = '#151515';

beforeEach(() => {
  jest.useFakeTimers();
  clearAllMockStorages();
  setStorageBackend(null);
});

afterEach(() => {
  restoreRealTimers(jest);
});

async function openNew(options) {
  const onClose = jest.fn();
  const doc = createDocument(options);
  const renderer = await render(
    <EditorScreen initialDocument={doc} onClose={onClose} />,
  );
  return { renderer, doc, onClose };
}

async function startEditing(renderer) {
  await press(renderer, 'toolbar-edit');
  await act(async () => {
    jest.runOnlyPendingTimers();
  });
}

describe('EditorScreen rendering', () => {
  it('renders typed text as handwriting in the chosen style and pen', async () => {
    const { renderer } = await openNew({ handwritingStyle: 'cursive' });
    await startEditing(renderer);
    await changeText(renderer, 'text-input', 'Dear Sir,\n\nThank you.');

    expect(renderedHandwriting(renderer)).toBe('Dear Sir,\n\nThank you.');
    // Drawn as reference-handwriting strokes (SVG paths), not font text.
    expect(handwritingPaths(renderer).length).toBeGreaterThan(0);
    expect(getHandwritingStyle('cursive').id).toBe('reference_student');
    expect(inkColors(renderer)).toEqual(new Set([BLUE]));
  });

  it('switches all rendered handwriting to the selected pen colour', async () => {
    const { renderer } = await openNew();
    await startEditing(renderer);
    await changeText(renderer, 'text-input', 'Ink test');
    expect(inkColors(renderer)).toEqual(new Set([BLUE]));

    await press(renderer, 'toolbar-pen-black');
    expect(inkColors(renderer)).toEqual(new Set([BLACK]));
    expect(
      byTestId(renderer, 'toolbar-pen-black', 'accessibilityState').props
        .accessibilityState.selected,
    ).toBe(true);

    await press(renderer, 'toolbar-pen-blue');
    expect(inkColors(renderer)).toEqual(new Set([BLUE]));
  });

  it('keeps the text editable: the source text stays in the input', async () => {
    const { renderer } = await openNew();
    await startEditing(renderer);
    await changeText(renderer, 'text-input', 'First');
    await changeText(renderer, 'text-input', 'First edited');
    expect(byTestId(renderer, 'text-input', 'value').props.value).toBe(
      'First edited',
    );
    expect(renderedHandwriting(renderer)).toBe('First edited');
  });

  it('shows a placeholder on an empty page', async () => {
    const { renderer } = await openNew();
    expect(renderedHandwriting(renderer)).toMatch(/start writing/);
  });

  it('can switch between lined and blank paper from the menu', async () => {
    const { renderer } = await openNew({ pageType: 'lined' });
    await press(renderer, 'menu-button');
    await press(renderer, 'page-type-blank');
    expect(
      byTestId(renderer, 'page-type-blank', 'accessibilityState').props
        .accessibilityState.selected,
    ).toBe(true);
  });
});

describe('undo / redo', () => {
  it('undoes and redoes text edits', async () => {
    const { renderer } = await openNew();
    await startEditing(renderer);
    expect(byTestId(renderer, 'toolbar-undo', 'disabled').props.disabled).toBe(
      true,
    );

    await changeText(renderer, 'text-input', 'Hello');
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    // Separate step: pause longer than the coalescing window.
    jest.setSystemTime(Date.now() + 5000);
    await changeText(renderer, 'text-input', 'Hello world');

    await press(renderer, 'toolbar-undo');
    expect(renderedHandwriting(renderer)).toBe('Hello');
    expect(byTestId(renderer, 'text-input', 'value').props.value).toBe('Hello');

    await press(renderer, 'toolbar-undo');
    expect(byTestId(renderer, 'text-input', 'value').props.value).toBe('');
    expect(byTestId(renderer, 'toolbar-undo', 'disabled').props.disabled).toBe(
      true,
    );

    await press(renderer, 'toolbar-redo');
    await press(renderer, 'toolbar-redo');
    expect(byTestId(renderer, 'text-input', 'value').props.value).toBe(
      'Hello world',
    );
    expect(byTestId(renderer, 'toolbar-redo', 'disabled').props.disabled).toBe(
      true,
    );
  });

  it('"Add Text" starts a new paragraph as its own undo step', async () => {
    const { renderer } = await openNew();
    await startEditing(renderer);
    await changeText(renderer, 'text-input', 'Line one');
    await press(renderer, 'toolbar-add');
    expect(byTestId(renderer, 'text-input', 'value').props.value).toBe(
      'Line one\n\n',
    );
    await press(renderer, 'toolbar-undo');
    expect(byTestId(renderer, 'text-input', 'value').props.value).toBe(
      'Line one',
    );
  });
});

describe('saving', () => {
  it('saves the document with all fields', async () => {
    const { renderer, doc } = await openNew({
      pageType: 'blank',
      handwritingStyle: 'fast',
    });
    await startEditing(renderer);
    await changeText(renderer, 'title-input', 'Leave letter');
    await changeText(renderer, 'text-input', 'Dear Sir,');
    await press(renderer, 'toolbar-pen-black');
    await press(renderer, 'save-button');

    const stored = await getDocument(doc.id);
    expect(stored).toMatchObject({
      id: doc.id,
      title: 'Leave letter',
      pageType: 'blank',
      pen: 'black',
      handwritingStyle: 'fast',
      content: 'Dear Sir,',
      createdAt: doc.createdAt,
    });
    expect(stored.updatedAt).toEqual(expect.any(Number));
  });

  it('reopens a saved document and saves further edits', async () => {
    const saved = await saveDocument({
      ...createDocument({ handwritingStyle: 'rounded' }),
      title: 'Notes',
      content: 'Saved text',
    });
    const onClose = jest.fn();
    const renderer = await render(
      <EditorScreen documentId={saved.id} onClose={onClose} />,
    );
    await act(async () => {});

    expect(renderedHandwriting(renderer)).toBe('Saved text');
    expect(byTestId(renderer, 'title-input', 'value').props.value).toBe(
      'Notes',
    );

    await startEditing(renderer);
    expect(byTestId(renderer, 'text-input', 'value').props.value).toBe(
      'Saved text',
    );
    await changeText(renderer, 'text-input', 'Saved text, now edited');
    await press(renderer, 'save-button');

    const stored = await getDocument(saved.id);
    expect(stored.content).toBe('Saved text, now edited');
    expect(stored.handwritingStyle).toBe('rounded');
    expect(stored.createdAt).toBe(saved.createdAt);
  });

  it('closes without prompting when there are no changes', async () => {
    const { renderer, onClose } = await openNew();
    await press(renderer, 'back-button');
    expect(onClose).toHaveBeenCalled();
  });

  it('asks before discarding unsaved changes', async () => {
    const { Alert } = require('react-native');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { renderer, onClose } = await openNew();
    await startEditing(renderer);
    await changeText(renderer, 'text-input', 'Unsaved');
    await press(renderer, 'done-editing-button');
    expect(queryByTestId(renderer, 'text-input')).toBe(false);

    await press(renderer, 'back-button');
    expect(onClose).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(
      'Save changes?',
      expect.any(String),
      expect.any(Array),
    );
    alert.mockRestore();
  });
});
