import type { SiteDocument } from "./types";

export interface HistoryState {
  past: SiteDocument[];
  present: SiteDocument;
  future: SiteDocument[];
}

export type HistoryAction =
  | { type: "commit"; document: SiteDocument }
  | {
      type: "update";
      update: (document: SiteDocument) => SiteDocument;
      updatedAt: string;
    }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "replace"; document: SiteDocument };

const HISTORY_LIMIT = 100;

export function createHistory(document: SiteDocument): HistoryState {
  return {
    past: [],
    present: document,
    future: [],
  };
}

export function historyReducer(
  state: HistoryState,
  action: HistoryAction,
): HistoryState {
  if (action.type === "replace") {
    return createHistory(action.document);
  }

  if (action.type === "commit") {
    if (JSON.stringify(action.document) === JSON.stringify(state.present)) {
      return state;
    }

    return {
      past: [...state.past, state.present].slice(-HISTORY_LIMIT),
      present: action.document,
      future: [],
    };
  }

  if (action.type === "update") {
    const updated = action.update(state.present);
    if (JSON.stringify(updated) === JSON.stringify(state.present)) {
      return state;
    }

    return {
      past: [...state.past, state.present].slice(-HISTORY_LIMIT),
      present: { ...updated, updatedAt: action.updatedAt },
      future: [],
    };
  }

  if (action.type === "undo") {
    const previous = state.past.at(-1);
    if (!previous) return state;

    return {
      past: state.past.slice(0, -1),
      present: previous,
      future: [state.present, ...state.future],
    };
  }

  const next = state.future[0];
  if (!next) return state;

  return {
    past: [...state.past, state.present].slice(-HISTORY_LIMIT),
    present: next,
    future: state.future.slice(1),
  };
}
