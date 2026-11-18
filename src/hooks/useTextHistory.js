import { useCallback, useReducer } from 'react';
import {
  createHistory,
  recordChange,
  redo as redoHistory,
  undo as undoHistory,
} from '../utils/textHistory';

function reducer(state, action) {
  switch (action.type) {
    case 'change': {
      if (action.text === state.text) {
        return state;
      }
      return {
        text: action.text,
        history: recordChange(state.history, state.text, action.text, {
          coalesce: action.coalesce,
        }),
      };
    }
    case 'undo':
      return undoHistory(state.history, state.text) || state;
    case 'redo':
      return redoHistory(state.history, state.text) || state;
    case 'reset':
      return { text: action.text, history: createHistory() };
    default:
      return state;
  }
}

/**
 * Text state with undo/redo. `setText(next, { coalesce: false })` forces the
 * change into its own undo step.
 */
export default function useTextHistory(initialText = '') {
  const [state, dispatch] = useReducer(reducer, initialText, text => ({
    text,
    history: createHistory(),
  }));

  const setText = useCallback(
    (text, { coalesce = true } = {}) =>
      dispatch({ type: 'change', text, coalesce }),
    [],
  );
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);
  const reset = useCallback(text => dispatch({ type: 'reset', text }), []);

  return {
    text: state.text,
    setText,
    undo,
    redo,
    reset,
    canUndo: state.history.undoStack.length > 0,
    canRedo: state.history.redoStack.length > 0,
  };
}
