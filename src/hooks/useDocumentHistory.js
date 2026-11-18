/**
 * One undo/redo history for everything the user changes on a document:
 *
 *   text      typed text (minimal patches, typing bursts merged —
 *             utils/textHistory.js)
 *   ink       a pen/marker stroke or an eraser gesture (before/after ink
 *             snapshots; snapshots share unchanged stroke arrays, so they
 *             cost little)
 *   compound  a page operation that changes text and ink together
 *   format    a formatting change (selected-text handwriting, heading,
 *             underline): before/after snapshots of the formatting; undo
 *             and redo hand the snapshot back as `formattingRestore`
 *
 * Entries are kept in one stack in the order they happened, so
 * "type, draw, highlight, Undo" removes the highlight, the next Undo the
 * stroke, and so on.
 */
import { useCallback, useReducer } from 'react';
import {
  DEFAULT_HISTORY_LIMIT,
  applyPatch,
  createHistory,
  diffText,
  recordChange,
  revertPatch,
} from '../utils/textHistory';

let tokenCounter = 0;
const nextToken = () => {
  tokenCounter += 1;
  return tokenCounter;
};

function push(history, entry) {
  const undoStack = [...history.undoStack, entry];
  return {
    undoStack:
      undoStack.length > DEFAULT_HISTORY_LIMIT
        ? undoStack.slice(-DEFAULT_HISTORY_LIMIT)
        : undoStack,
    redoStack: [],
  };
}

function reducer(state, action) {
  switch (action.type) {
    case 'text': {
      if (action.text === state.text) {
        return state;
      }
      return {
        ...state,
        text: action.text,
        history: recordChange(state.history, state.text, action.text, {
          coalesce: action.coalesce,
        }),
      };
    }
    case 'ink': {
      if (action.ink === state.ink) {
        return state;
      }
      return {
        ...state,
        ink: action.ink,
        history: push(state.history, {
          type: 'ink',
          before: state.ink,
          after: action.ink,
          time: 0,
        }),
      };
    }
    case 'format': {
      if (action.before === action.after) {
        return state;
      }
      return {
        ...state,
        history: push(state.history, {
          type: 'format',
          before: action.before,
          after: action.after,
          time: 0,
        }),
      };
    }
    case 'compound': {
      const patch = diffText(state.text, action.text);
      if (!patch && action.ink === state.ink) {
        return state;
      }
      return {
        ...state,
        text: action.text,
        ink: action.ink,
        history: push(state.history, {
          type: 'compound',
          patch,
          before: state.ink,
          after: action.ink,
          time: 0,
        }),
      };
    }
    case 'undo': {
      const entry = state.history.undoStack[state.history.undoStack.length - 1];
      if (!entry) {
        return state;
      }
      const history = {
        undoStack: state.history.undoStack.slice(0, -1),
        redoStack: [...state.history.redoStack, { ...entry, time: 0 }],
      };
      if (entry.type === 'ink') {
        return { ...state, ink: entry.before, history };
      }
      if (entry.type === 'format') {
        return {
          ...state,
          history,
          formattingRestore: { value: entry.before, token: nextToken() },
        };
      }
      if (entry.type === 'compound') {
        return {
          ...state,
          text: entry.patch ? revertPatch(state.text, entry.patch) : state.text,
          ink: entry.before,
          history,
        };
      }
      return { ...state, text: revertPatch(state.text, entry), history };
    }
    case 'redo': {
      const entry = state.history.redoStack[state.history.redoStack.length - 1];
      if (!entry) {
        return state;
      }
      const history = {
        undoStack: [...state.history.undoStack, entry],
        redoStack: state.history.redoStack.slice(0, -1),
      };
      if (entry.type === 'ink') {
        return { ...state, ink: entry.after, history };
      }
      if (entry.type === 'format') {
        return {
          ...state,
          history,
          formattingRestore: { value: entry.after, token: nextToken() },
        };
      }
      if (entry.type === 'compound') {
        return {
          ...state,
          text: entry.patch ? applyPatch(state.text, entry.patch) : state.text,
          ink: entry.after,
          history,
        };
      }
      return { ...state, text: applyPatch(state.text, entry), history };
    }
    case 'reset':
      return {
        text: action.text,
        ink: action.ink || {},
        history: createHistory(),
        token: nextToken(),
      };
    default:
      return state;
  }
}

export default function useDocumentHistory(initialText = '', initialInk = {}) {
  const [state, dispatch] = useReducer(reducer, null, () => ({
    text: initialText,
    ink: initialInk || {},
    history: createHistory(),
    token: nextToken(),
  }));

  const setText = useCallback(
    (text, { coalesce = true } = {}) =>
      dispatch({ type: 'text', text, coalesce }),
    [],
  );
  const setInk = useCallback(ink => dispatch({ type: 'ink', ink }), []);
  const applyCompound = useCallback(
    (text, ink) => dispatch({ type: 'compound', text, ink }),
    [],
  );
  const recordFormatting = useCallback(
    (before, after) => dispatch({ type: 'format', before, after }),
    [],
  );
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);
  const reset = useCallback(
    (text, ink) => dispatch({ type: 'reset', text, ink }),
    [],
  );

  return {
    text: state.text,
    ink: state.ink,
    setText,
    setInk,
    applyCompound,
    recordFormatting,
    formattingRestore: state.formattingRestore || null,
    undo,
    redo,
    reset,
    canUndo: state.history.undoStack.length > 0,
    canRedo: state.history.redoStack.length > 0,
  };
}
