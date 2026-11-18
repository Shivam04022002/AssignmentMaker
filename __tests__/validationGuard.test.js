/**
 * Guards against shipping a device-validation build by accident.
 *
 * VALIDATION_BUILD (src/dev/flags.js) turns on the developer tools and the
 * personal-handwriting onboarding in a release build. It is set to true
 * only by hand, for the device-validation stage, and must be false in the
 * source: this test fails otherwise. A release built with it on shows a
 * "Validation build — not for release" badge on Home.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { clearAllMockStorages } from '@react-native-async-storage/async-storage';
import { setStorageBackend } from '../src/storage/documentStorage';
import { act, queryByTestId, render } from './helpers/render';

const FLAGS = path.join(__dirname, '..', 'src', 'dev', 'flags.js');

test('VALIDATION_BUILD is false in the source', () => {
  const src = fs.readFileSync(FLAGS, 'utf8');
  const m = /^const VALIDATION_BUILD = (true|false);$/m.exec(src);
  expect(m).not.toBeNull();
  expect(m[1]).toBe('false');
});

test('the flags derive from it as documented', () => {
  const src = fs.readFileSync(FLAGS, 'utf8');
  expect(src).toMatch(/export const VALIDATION_TOOLS = __DEV__ \|\| VALIDATION_BUILD;/);
  expect(src).toMatch(/export const VALIDATION_RELEASE = !__DEV__ && VALIDATION_BUILD;/);
  expect(src).toMatch(/export const PERSONAL_HANDWRITING_ONBOARDING = VALIDATION_TOOLS;/);
});

test('the device checklist quotes every prompt line exactly as the wizard shows it', () => {
  const { DEVANAGARI_ALPHABET, HINDI_SUGGESTED, LATIN_ALPHABET, LATIN_DIGITS_TEXT, MIXED_SUGGESTED } = require('../src/handwriting/learn/samplePrompts');
  const checklist = fs.readFileSync(path.join(__dirname, '..', 'visual-reports', 'lang4', 'phase17', 'DEVICE_VALIDATION_CHECKLIST.md'), 'utf8');
  [LATIN_ALPHABET, DEVANAGARI_ALPHABET, LATIN_DIGITS_TEXT, HINDI_SUGGESTED, MIXED_SUGGESTED]
    .flatMap(t => t.split('\n'))
    .forEach(line => expect([line, checklist.includes(`\`${line}\``)]).toEqual([line, true]));
});

// The flags as each build sees them, switched per test (read when Home renders).
const mockFlags = { VALIDATION_TOOLS: false, VALIDATION_RELEASE: false, PERSONAL_HANDWRITING_ONBOARDING: false };
jest.mock('../src/dev/flags', () => ({
  get VALIDATION_TOOLS() {
    return mockFlags.VALIDATION_TOOLS;
  },
  get VALIDATION_RELEASE() {
    return mockFlags.VALIDATION_RELEASE;
  },
  get PERSONAL_HANDWRITING_ONBOARDING() {
    return mockFlags.PERSONAL_HANDWRITING_ONBOARDING;
  },
}));

describe('Home', () => {
  beforeEach(() => {
    clearAllMockStorages();
    setStorageBackend(null);
  });

  const homeWith = async flags => {
    Object.assign(mockFlags, flags);
    const HomeScreen = require('../src/screens/HomeScreen').default;
    const r = await render(<HomeScreen onNewDocument={jest.fn()} onOpenDocument={jest.fn()} />);
    await act(async () => {});
    return r;
  };

  test('a validation release build shows the badge', async () => {
    const r = await homeWith({ VALIDATION_TOOLS: true, VALIDATION_RELEASE: true, PERSONAL_HANDWRITING_ONBOARDING: true });
    expect(queryByTestId(r, 'validation-build-badge')).toBe(true);
  });

  test('normal release and development builds do not', async () => {
    expect(queryByTestId(await homeWith({ VALIDATION_TOOLS: false, VALIDATION_RELEASE: false, PERSONAL_HANDWRITING_ONBOARDING: false }), 'validation-build-badge')).toBe(false);
    expect(queryByTestId(await homeWith({ VALIDATION_TOOLS: true, VALIDATION_RELEASE: false, PERSONAL_HANDWRITING_ONBOARDING: true }), 'validation-build-badge')).toBe(false);
  });
});
