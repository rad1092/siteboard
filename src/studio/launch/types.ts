import type { CompanionStatus } from "../../deployment";
import type { WorkspaceState } from "../../project-file";
import type { SiteboardRuntime } from "../../platform/runtime";
import type { SiteDocument, ValidationIssue } from "../../types";
import type { CompanionState, SaveState } from "../workspace/types";

export type Commit = (
  update: (current: SiteDocument) => SiteDocument,
) => void;

export type StoreWorkspace = (workspace: WorkspaceState) => boolean;

export interface LaunchEditorProps {
  document: SiteDocument;
  workspaceState: WorkspaceState;
  issues: ValidationIssue[];
  errors: ValidationIssue[];
  runtime: SiteboardRuntime;
  companionState: CompanionState;
  companion: CompanionStatus | null;
  commit: Commit;
  commitDocument(document: SiteDocument): void;
  replaceDocument(document: SiteDocument): void;
  storeWorkspace: StoreWorkspace;
  setSaveState(state: SaveState): void;
  setFeedback(message: string): void;
  setTarget(target: ValidationIssue["target"]): void;
  saveDesktopArchive(
    bytes: Uint8Array,
    suggestedName: string,
  ): Promise<string | null>;
  exportProjectFile(): void | Promise<void>;
}
