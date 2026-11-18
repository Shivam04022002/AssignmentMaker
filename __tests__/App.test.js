/**
 * @format
 */
import React from 'react';
import { clearAllMockStorages } from '@react-native-async-storage/async-storage';
import App from '../App';
import { createDocument } from '../src/models/document';
import {
  saveDocument,
  setStorageBackend,
} from '../src/storage/documentStorage';
import {
  act,
  byTestId,
  changeText,
  press,
  queryByTestId,
  render,
  renderedHandwriting,
  restoreRealTimers,
} from './helpers/render';

beforeEach(() => {
  clearAllMockStorages();
  setStorageBackend(null);
});

const flush = () => act(async () => {});

test('launches on Home with the empty state', async () => {
  const renderer = await render(<App />);
  await flush();
  const texts = renderer.root
    .findAll(n => n.type === 'Text')
    .map(n => n.props.children);
  expect(texts).toEqual(
    expect.arrayContaining([
      'HandWrite',
      'Turn your text into handwritten pages',
      'Recent Documents',
    ]),
  );
  expect(queryByTestId(renderer, 'home-empty-state')).toBe(true);
});

test('shows saved documents on Home and opens them for editing', async () => {
  const saved = await saveDocument({
    ...createDocument(),
    title: 'Letter',
    content: 'Hi',
  });
  const renderer = await render(<App />);
  await flush();

  expect(queryByTestId(renderer, 'home-empty-state')).toBe(false);
  await press(renderer, `document-card-${saved.id}`);
  await flush();
  expect(byTestId(renderer, 'title-input', 'value').props.value).toBe('Letter');
  expect(renderedHandwriting(renderer)).toBe('Hi');
});

test('full flow: create, write, save, and find it on Home', async () => {
  jest.useFakeTimers();
  const renderer = await render(<App />);
  await flush();

  await press(renderer, 'new-document-button');
  await press(renderer, 'page-type-blank');
  await press(renderer, 'create-document-button');

  await press(renderer, 'toolbar-edit');
  await act(async () => {
    jest.runOnlyPendingTimers();
  });
  await changeText(renderer, 'text-input', 'Dear Sir,\n\nThank you.');
  await press(renderer, 'save-button');
  await flush();
  await press(renderer, 'back-button');
  await flush();

  const cards = renderer.root.findAll(
    n =>
      typeof n.props.testID === 'string' &&
      n.props.testID.startsWith('document-card-'),
  );
  expect(cards.length).toBeGreaterThan(0);
  restoreRealTimers(jest);
});
