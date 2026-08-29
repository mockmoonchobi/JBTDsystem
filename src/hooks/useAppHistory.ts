import { useState, useCallback, useEffect, useRef } from 'react';
import { AppSnapshot } from '../types';

const MAX_HISTORY_LENGTH = 50;

interface UseAppHistoryProps {
  getCurrentSnapshot: () => AppSnapshot;
  restoreSnapshot: (snapshot: AppSnapshot) => void;
  onUndoRequest?: () => void;
}

export function useAppHistory({ getCurrentSnapshot, restoreSnapshot, onUndoRequest }: UseAppHistoryProps) {
  const [undoStack, setUndoStack] = useState<AppSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<AppSnapshot[]>([]);

  // Keep references to prevent stale closures
  const getCurrentSnapshotRef = useRef(getCurrentSnapshot);
  getCurrentSnapshotRef.current = getCurrentSnapshot;

  const restoreSnapshotRef = useRef(restoreSnapshot);
  restoreSnapshotRef.current = restoreSnapshot;

  const onUndoRequestRef = useRef(onUndoRequest);
  onUndoRequestRef.current = onUndoRequest;

  const undoStackRef = useRef(undoStack);
  undoStackRef.current = undoStack;

  const redoStackRef = useRef(redoStack);
  redoStackRef.current = redoStack;

  /**
   * Records a new state change before applying it
   * @param description Brief label of the action (e.g. '世帯情報の編集', '過去帳の削除', '抽出外の切り替え', '並び順の変更')
   */
  const recordHistory = useCallback((description: string) => {
    const current = getCurrentSnapshotRef.current();
    const snapshotToSave: AppSnapshot = {
      ...current,
      description,
      timestamp: Date.now(),
    };

    setUndoStack((prev) => {
      const next = [...prev, snapshotToSave];
      if (next.length > MAX_HISTORY_LENGTH) {
        return next.slice(next.length - MAX_HISTORY_LENGTH);
      }
      return next;
    });

    // Clear redo stack on new user action
    setRedoStack([]);
  }, []);

  /**
   * Undo the last action
   */
  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;

    const current = getCurrentSnapshotRef.current();
    const prevStack = [...undoStackRef.current];
    const targetSnapshot = prevStack.pop();

    if (!targetSnapshot) return;

    // Push current to redo stack
    setRedoStack((prev) => [
      ...prev,
      {
        ...current,
        description: targetSnapshot.description,
        timestamp: Date.now(),
      },
    ]);

    setUndoStack(prevStack);
    restoreSnapshotRef.current(targetSnapshot);
  }, []);

  /**
   * Redo the last undone action
   */
  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;

    const current = getCurrentSnapshotRef.current();
    const nextRedoStack = [...redoStackRef.current];
    const targetSnapshot = nextRedoStack.pop();

    if (!targetSnapshot) return;

    // Push current to undo stack
    setUndoStack((prev) => [
      ...prev,
      {
        ...current,
        description: targetSnapshot.description,
        timestamp: Date.now(),
      },
    ]);

    setRedoStack(nextRedoStack);
    restoreSnapshotRef.current(targetSnapshot);
  }, []);

  // Keyboard shortcut listener (Ctrl+Z / Cmd+Z, Ctrl+Y / Ctrl+Shift+Z / Cmd+Shift+Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      if (!modifier) return;

      const target = e.target as HTMLElement;
      // Do not intercept if user is typing in standard editable inputs or textareas
      const isInput = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      );

      // Check for Undo (Ctrl+Z without Shift)
      if (e.key === 'z' && !e.shiftKey) {
        if (isInput) return; // Allow native input undo
        e.preventDefault();
        if (onUndoRequestRef.current) {
          onUndoRequestRef.current();
        } else {
          undo();
        }
      }
      // Check for Redo (Ctrl+Y or Ctrl+Shift+Z)
      else if ((e.key === 'y' && !e.shiftKey) || (e.key === 'z' && e.shiftKey) || (e.key === 'Z')) {
        if (isInput) return; // Allow native input redo
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;
  const undoDescription = undoStack.length > 0 ? undoStack[undoStack.length - 1].description : undefined;
  const redoDescription = redoStack.length > 0 ? redoStack[redoStack.length - 1].description : undefined;

  return {
    canUndo,
    canRedo,
    undoDescription,
    redoDescription,
    undo,
    redo,
    recordHistory,
  };
}
