/**
 * Patch-based undo/redo for a text value.
 *
 * Instead of keeping a full copy of the document for every keystroke, each
 * history entry is a minimal patch: { at, removed, inserted }. Consecutive
 * typing (or consecutive backspacing) is merged into one entry so a single
 * undo removes a whole burst of typing, as users expect.
 *
 * All functions are pure; `useTextHistory` wraps them for React.
 */

export const DEFAULT_HISTORY_LIMIT = 200;
export const COALESCE_WINDOW_MS = 1000;

export function createHistory() {
  return { undoStack: [], redoStack: [] };
}

/** Smallest single-range patch that turns `prev` into `next`. */
export function diffText(prev, next) {
  if (prev === next) {
    return null;
  }
  const max = Math.min(prev.length, next.length);
  let start = 0;
  while (start < max && prev[start] === next[start]) {
    start++;
  }
  let endPrev = prev.length;
  let endNext = next.length;
  while (
    endPrev > start &&
    endNext > start &&
    prev[endPrev - 1] === next[endNext - 1]
  ) {
    endPrev--;
    endNext--;
  }
  return {
    at: start,
    removed: prev.slice(start, endPrev),
    inserted: next.slice(start, endNext),
  };
}

export function applyPatch(text, patch) {
  return (
    text.slice(0, patch.at) +
    patch.inserted +
    text.slice(patch.at + patch.removed.length)
  );
}

export function revertPatch(text, patch) {
  return (
    text.slice(0, patch.at) +
    patch.removed +
    text.slice(patch.at + patch.inserted.length)
  );
}

function tryMerge(last, patch) {
  if (!last || patch.time - last.time > COALESCE_WINDOW_MS) {
    return null;
  }
  const isInsert = p => p.removed === '' && p.inserted !== '';
  const isDelete = p => p.inserted === '' && p.removed !== '';

  // Typing forward: "Hel" + "l" + "o". A new line starts a fresh entry.
  if (
    isInsert(last) &&
    isInsert(patch) &&
    patch.at === last.at + last.inserted.length &&
    !patch.inserted.includes('\n')
  ) {
    return {
      ...last,
      inserted: last.inserted + patch.inserted,
      time: patch.time,
    };
  }
  // Backspacing: deletions that end where the previous one began.
  if (
    isDelete(last) &&
    isDelete(patch) &&
    patch.at + patch.removed.length === last.at
  ) {
    return {
      at: patch.at,
      removed: patch.removed + last.removed,
      inserted: '',
      time: patch.time,
    };
  }
  return null;
}

/**
 * Records the change prev → next. Any new change clears the redo stack.
 * `options.coalesce = false` forces a separate undo step (e.g. "Add Text").
 */
export function recordChange(history, prev, next, options = {}) {
  const diff = diffText(prev, next);
  if (!diff) {
    return history;
  }
  const {
    now = Date.now(),
    coalesce = true,
    limit = DEFAULT_HISTORY_LIMIT,
  } = options;
  const patch = { ...diff, time: now };
  const last = history.undoStack[history.undoStack.length - 1];
  const merged = coalesce ? tryMerge(last, patch) : null;

  const undoStack = merged
    ? [...history.undoStack.slice(0, -1), merged]
    : [...history.undoStack, patch];

  return {
    undoStack: undoStack.length > limit ? undoStack.slice(-limit) : undoStack,
    redoStack: [],
  };
}

/** Returns { history, text } or null when there is nothing to undo. */
export function undo(history, text) {
  const patch = history.undoStack[history.undoStack.length - 1];
  if (!patch) {
    return null;
  }
  return {
    text: revertPatch(text, patch),
    history: {
      undoStack: history.undoStack.slice(0, -1),
      // Stamp 0 so a redone patch never merges with later typing.
      redoStack: [...history.redoStack, { ...patch, time: 0 }],
    },
  };
}

/** Returns { history, text } or null when there is nothing to redo. */
export function redo(history, text) {
  const patch = history.redoStack[history.redoStack.length - 1];
  if (!patch) {
    return null;
  }
  return {
    text: applyPatch(text, patch),
    history: {
      undoStack: [...history.undoStack, patch],
      redoStack: history.redoStack.slice(0, -1),
    },
  };
}
