/* eslint-env node */
/**
 * Create My Handwriting starts with an introduction, then one handwriting
 * type (Phase 22/24). Tests written for the earlier wizard used English +
 * Hindi with its five-page plan, which is that type's plan: they start,
 * choose it and continue.
 */
import { press, queryByTestId } from './render';

export async function chooseType(r, typeId = 'english-hindi') {
  if (queryByTestId(r, 'intro-start')) await press(r, 'intro-start');
  await press(r, `type-${typeId}`);
  await press(r, 'type-continue');
}
