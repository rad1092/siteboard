import {
  useCallback,
  useEffect,
  useReducer,
} from "react";
import { createHistory, historyReducer } from "../../history";
import type { SiteDocument } from "../../types";

interface UseDocumentHistoryOptions {
  onEdit(): void;
  onHistoryNavigation(): void;
}

export function useDocumentHistory(
  initialDocument: SiteDocument,
  {
    onEdit,
    onHistoryNavigation,
  }: UseDocumentHistoryOptions,
) {
  const [history, dispatch] = useReducer(
    historyReducer,
    initialDocument,
    createHistory,
  );

  const commit = useCallback(
    (update: (current: SiteDocument) => SiteDocument) => {
      onEdit();
      dispatch({
        type: "update",
        update,
        updatedAt: new Date().toISOString(),
      });
    },
    [onEdit],
  );

  const replaceDocument = useCallback(
    (document: SiteDocument) => {
      dispatch({ type: "replace", document });
      onEdit();
    },
    [onEdit],
  );

  const commitDocument = useCallback(
    (document: SiteDocument) => {
      dispatch({ type: "commit", document });
      onEdit();
    },
    [onEdit],
  );

  const replaceHistory = useCallback((document: SiteDocument) => {
    dispatch({ type: "replace", document });
  }, []);

  const undo = useCallback(() => {
    onHistoryNavigation();
    dispatch({ type: "undo" });
  }, [onHistoryNavigation]);

  const redo = useCallback(() => {
    onHistoryNavigation();
    dispatch({ type: "redo" });
  }, [onHistoryNavigation]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier || event.key.toLowerCase() !== "z") return;
      if (event.shiftKey && history.future.length === 0) return;
      if (!event.shiftKey && history.past.length === 0) return;
      event.preventDefault();
      if (event.shiftKey) {
        redo();
      } else {
        undo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    history.future.length,
    history.past.length,
    redo,
    undo,
  ]);

  return {
    document: history.present,
    history,
    commit,
    replaceDocument,
    commitDocument,
    replaceHistory,
    undo,
    redo,
  };
}
