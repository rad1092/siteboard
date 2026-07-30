import type { WorkspaceState } from "../../project-file";
import type { SiteDocument } from "../../types";

export type SaveState =
  | "saved"
  | "saving"
  | "error"
  | "recovery";

export type CompanionState =
  | "checking"
  | "available"
  | "unavailable";

export type ActivateProject = (
  document: SiteDocument,
  workspace: WorkspaceState,
  options?: {
    started?: boolean;
    saveState?: SaveState;
    autosave?: boolean;
  },
) => void;
