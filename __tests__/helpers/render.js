import ReactTestRenderer, { act } from 'react-test-renderer';
import { Path } from 'react-native-svg';

const mounted = new Set();

export async function render(element) {
  let renderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(element);
  });
  mounted.add(renderer);
  return renderer;
}

/**
 * Unmounts everything rendered by a test, so nothing updates afterwards.
 * Synchronous on purpose: async act() would wait on faked timers.
 */
export function cleanup() {
  for (const renderer of mounted) {
    act(() => {
      try {
        renderer.unmount();
      } catch (error) {
        // Already unmounted by the test.
      }
    });
  }
  mounted.clear();
}

/**
 * Switches back to real timers safely: components mounted under fake timers
 * are unmounted and their pending fake timers dropped *first*. Restoring
 * real timers while they are still mounted strands React Native's
 * fake-timer callbacks, which kept the Jest worker busy forever and hung
 * whichever test file ran next in the same worker.
 */
export function restoreRealTimers(jestObject) {
  cleanup();
  jestObject.clearAllTimers();
  jestObject.useRealTimers();
}

if (typeof afterEach === 'function') {
  afterEach(cleanup);
}

/**
 * The outermost component carrying `testID` (and `prop`, when given).
 * Wrappers forward testID down, so `prop` picks the layer that owns it,
 * e.g. 'onPress' or 'accessibilityState' on the Pressable.
 */
export function byTestId(renderer, testID, prop) {
  const matches = renderer.root.findAll(
    node =>
      node.props.testID === testID &&
      typeof node.type !== 'string' &&
      (!prop || node.props[prop] !== undefined),
  );
  if (!matches.length) {
    throw new Error(`No element with testID "${testID}"`);
  }
  return matches[0];
}

export function queryByTestId(renderer, testID) {
  return renderer.root.findAll(node => node.props.testID === testID).length > 0;
}

export async function press(renderer, testID) {
  await act(async () => {
    byTestId(renderer, testID, 'onPress').props.onPress();
  });
}

export async function changeText(renderer, testID, text) {
  await act(async () => {
    byTestId(renderer, testID, 'onChangeText').props.onChangeText(text);
  });
}

/**
 * Ink paths of the handwriting renderer(s): the stroke paths (one per ink
 * bucket) and the filled underline outlines, as react-native-svg Paths.
 */
export function handwritingPaths(renderer) {
  return renderer.root
    .findAll(node => node.props.testID === 'handwriting-ink')
    .filter(node => typeof node.type !== 'string')
    .flatMap(svg => svg.findAll(node => node.type === Path))
    .filter((node, i, all) => all.indexOf(node) === i);
}

/** Text rendered as handwriting, words joined with spaces. */
export function renderedHandwriting(renderer) {
  const container = renderer.root.findAll(
    node =>
      node.props.testID === 'handwriting-text' && typeof node.type === 'string',
  )[0];
  return container.props.accessibilityLabel;
}

/** '#RRGGBB' or 'rgba(r,g,b,a)' → base '#RRGGBB' (ink strength ignored). */
function baseInk(color) {
  const m = /^rgba?\((\d+),(\d+),(\d+)/.exec(String(color).replace(/\s/g, ''));
  if (!m) {
    return String(color).toUpperCase();
  }
  return `#${m
    .slice(1, 4)
    .map(v => Number(v).toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase();
}

/** Base ink colours of all rendered handwriting (strokes and underlines). */
export function inkColors(renderer) {
  return new Set(
    handwritingPaths(renderer).map(node =>
      baseInk(node.props.stroke || node.props.fill),
    ),
  );
}

/**
 * Ink strengths (alpha) of the rendered handwriting paths. The dense-core
 * overlay (extra ink where the pen pressed hardest, drawn over the ink) is
 * not a strength of its own and is left out.
 */
export function inkAlphas(renderer) {
  return handwritingPaths(renderer)
    .filter(node => node.props.id !== 'ink-core')
    .map(node =>
    Number(node.props.strokeOpacity ?? node.props.fillOpacity ?? 1),
  );
}

export { act };
