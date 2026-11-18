import {
  applyPatch,
  createHistory,
  diffText,
  recordChange,
  redo,
  revertPatch,
  undo,
} from '../src/utils/textHistory';

/** Feeds a series of text states through the history, `gap` ms apart. */
function type(states, gap = 100) {
  let history = createHistory();
  for (let i = 1; i < states.length; i++) {
    history = recordChange(history, states[i - 1], states[i], { now: i * gap });
  }
  return history;
}

describe('diffText / patches', () => {
  it.each([
    ['', 'abc'],
    ['abc', ''],
    ['hello world', 'hello brave world'],
    ['Dear Sir,', 'Dear Madam,'],
    ['aaa', 'aaaa'],
  ])('round-trips %j → %j', (prev, next) => {
    const patch = diffText(prev, next);
    expect(applyPatch(prev, patch)).toBe(next);
    expect(revertPatch(next, patch)).toBe(prev);
  });

  it('returns null for identical text', () => {
    expect(diffText('same', 'same')).toBeNull();
  });
});

describe('undo / redo', () => {
  it('undoes and redoes a change', () => {
    let history = recordChange(createHistory(), 'Hello', 'Hello world', {
      coalesce: false,
    });
    const undone = undo(history, 'Hello world');
    expect(undone.text).toBe('Hello');
    const redone = redo(undone.history, undone.text);
    expect(redone.text).toBe('Hello world');
  });

  it('merges a burst of typing into one undo step', () => {
    const history = type(['', 'H', 'He', 'Hel', 'Hell', 'Hello']);
    expect(history.undoStack).toHaveLength(1);
    expect(undo(history, 'Hello').text).toBe('');
  });

  it('merges a burst of backspaces into one undo step', () => {
    const history = type(['Hello', 'Hell', 'Hel', 'He']);
    expect(history.undoStack).toHaveLength(1);
    expect(undo(history, 'He').text).toBe('Hello');
  });

  it('starts a new step after a pause or a new line', () => {
    expect(type(['', 'a', 'ab'], 5000).undoStack).toHaveLength(2);
    // Steps: 'ab' | '\nc' — the line break opens a new step.
    expect(type(['', 'ab', 'ab\n', 'ab\nc']).undoStack).toHaveLength(2);
  });

  it('walks back through several steps and forward again', () => {
    let history = createHistory();
    const states = ['', 'one', 'one two', 'one two three'];
    for (let i = 1; i < states.length; i++) {
      history = recordChange(history, states[i - 1], states[i], {
        coalesce: false,
      });
    }
    let text = states[states.length - 1];
    for (let i = states.length - 2; i >= 0; i--) {
      ({ history, text } = undo(history, text));
      expect(text).toBe(states[i]);
    }
    expect(undo(history, text)).toBeNull();
    for (let i = 1; i < states.length; i++) {
      ({ history, text } = redo(history, text));
      expect(text).toBe(states[i]);
    }
    expect(redo(history, text)).toBeNull();
  });

  it('clears redo after a new edit', () => {
    let history = recordChange(createHistory(), 'a', 'ab', { coalesce: false });
    ({ history } = undo(history, 'ab'));
    expect(history.redoStack).toHaveLength(1);
    history = recordChange(history, 'a', 'ax');
    expect(history.redoStack).toHaveLength(0);
  });

  it('caps the history length', () => {
    let history = createHistory();
    for (let i = 0; i < 20; i++) {
      history = recordChange(history, String(i), String(i + 1), {
        coalesce: false,
        limit: 5,
      });
    }
    expect(history.undoStack).toHaveLength(5);
  });
});
