import React from 'react';
import NewDocumentScreen from '../src/screens/NewDocumentScreen';
import { byTestId, press, queryByTestId, render } from './helpers/render';

async function renderScreen() {
  const onCreate = jest.fn();
  const onBack = jest.fn();
  const renderer = await render(
    <NewDocumentScreen onCreate={onCreate} onBack={onBack} />,
  );
  return { renderer, onCreate, onBack };
}

const isSelected = (renderer, testID) =>
  byTestId(renderer, testID, 'accessibilityState').props.accessibilityState
    .selected;

describe('NewDocumentScreen', () => {
  it('defaults to a lined page, blue pen and the reference handwriting', async () => {
    const { renderer, onCreate } = await renderScreen();
    expect(isSelected(renderer, 'page-type-lined')).toBe(true);
    expect(isSelected(renderer, 'page-type-blank')).toBe(false);
    expect(isSelected(renderer, 'pen-blue')).toBe(true);
    expect(isSelected(renderer, 'handwriting-reference')).toBe(true);

    await press(renderer, 'create-document-button');
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        pageType: 'lined',
        pen: 'blue',
        handwritingStyle: 'reference_student',
      }),
    );
  });

  it('offers a single handwriting option: Reference Handwriting', async () => {
    const { renderer } = await renderScreen();
    const card = byTestId(renderer, 'handwriting-reference', 'accessibilityLabel');
    expect(card.props.accessibilityLabel).toBe(
      'Reference Handwriting, selected',
    );
    // No font list: none of the retired style cards exist.
    for (const id of ['neat', 'casual', 'cursive', 'rounded', 'fast']) {
      expect(queryByTestId(renderer, `handwriting-${id}`)).toBe(false);
    }
  });

  it('keeps the pen choice separate from the handwriting', async () => {
    const { renderer, onCreate } = await renderScreen();
    await press(renderer, 'page-type-blank');
    await press(renderer, 'pen-black');

    expect(isSelected(renderer, 'page-type-blank')).toBe(true);
    expect(isSelected(renderer, 'page-type-lined')).toBe(false);
    expect(isSelected(renderer, 'pen-black')).toBe(true);
    expect(isSelected(renderer, 'pen-blue')).toBe(false);
    expect(isSelected(renderer, 'handwriting-reference')).toBe(true);

    await press(renderer, 'create-document-button');
    const doc = onCreate.mock.calls[0][0];
    expect(doc).toMatchObject({
      pageType: 'blank',
      pen: 'black',
      handwritingStyle: 'reference_student',
      content: '',
    });
    expect(doc.id).toBeTruthy();
  });

  it('goes back', async () => {
    const { renderer, onBack } = await renderScreen();
    await press(renderer, 'back-button');
    expect(onBack).toHaveBeenCalled();
  });
});
