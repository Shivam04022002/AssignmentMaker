/**
 * The app as a RELEASE build sees it (dev/flags.js mocked: no development
 * or validation tools): no handwriting tuner, no device-validation screen,
 * no Create My Handwriting and no My Handwritings. The development
 * configuration is the one every other test runs in (__DEV__ is true under
 * Jest), where lang4ProfileUI.test.js opens them.
 */
import React from 'react';
import { clearAllMockStorages } from '@react-native-async-storage/async-storage';
import App from '../App';
import { setStorageBackend } from '../src/storage/documentStorage';
import { act, byTestId, queryByTestId, render } from './helpers/render';

jest.mock('../src/dev/flags', () => ({ VALIDATION_TOOLS: false, VALIDATION_RELEASE: false, PERSONAL_HANDWRITING_ONBOARDING: false }));

beforeEach(() => {
  clearAllMockStorages();
  setStorageBackend(null);
});

test('release: Home offers no developer tools and no handwriting onboarding', async () => {
  const r = await render(<App />);
  await act(async () => {});
  expect(byTestId(r, 'app-title').props.onLongPress).toBeUndefined(); // the tuner's hidden entry
  expect(queryByTestId(r, 'create-handwriting-button')).toBe(false);
  expect(queryByTestId(r, 'my-handwritings-button')).toBe(false);
  expect(queryByTestId(r, 'new-document-button')).toBe(true);
});

test('release: the flags really are off in this configuration', () => {
  const flags = require('../src/dev/flags');
  expect(flags).toEqual({ VALIDATION_TOOLS: false, VALIDATION_RELEASE: false, PERSONAL_HANDWRITING_ONBOARDING: false });
});
