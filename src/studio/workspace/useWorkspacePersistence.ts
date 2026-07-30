import {
  type Dispatch,
  type SetStateAction,
  useCallback,
} from "react";
import { createBlankDocument } from "../../data";
import type { DesktopWorkspaceLoad } from "../../platform/desktop-projects";
import type { SiteboardRuntime } from "../../platform/runtime";
import {
  emptyWorkspace,
  type WorkspaceState,
} from "../../project-file";
import type { StorageRecovery } from "../../storage";
import type { SiteDocument } from "../../types";
import type { SaveState } from "./types";
import {
  loadBrowserWorkspace,
  useBrowserWorkspacePersistence,
} from "./useBrowserWorkspacePersistence";
import { useDesktopWorkspacePersistence } from "./useDesktopWorkspacePersistence";

export function loadInitialWorkspace(runtime: SiteboardRuntime) {
  if (runtime !== "desktop") return loadBrowserWorkspace();
  return {
    document: createBlankDocument(),
    workspace: emptyWorkspace(),
    source: "starter" as const,
    recovery: null,
  };
}

interface UseWorkspacePersistenceOptions {
  runtime: SiteboardRuntime;
  document: SiteDocument;
  workspace: WorkspaceState;
  started: boolean;
  autosaveAllowed: boolean;
  onDesktopLoad(load: DesktopWorkspaceLoad | null): void;
  setWorkspace: Dispatch<SetStateAction<WorkspaceState>>;
  setRecovery: Dispatch<SetStateAction<StorageRecovery | null>>;
  setAutosaveAllowed: Dispatch<SetStateAction<boolean>>;
  setHasExistingProject: Dispatch<SetStateAction<boolean>>;
  setSaveState: Dispatch<SetStateAction<SaveState>>;
  setFeedback: Dispatch<SetStateAction<string>>;
}

export function useWorkspacePersistence({
  runtime,
  document,
  workspace,
  started,
  autosaveAllowed,
  onDesktopLoad,
  setWorkspace,
  setRecovery,
  setAutosaveAllowed,
  setHasExistingProject,
  setSaveState,
  setFeedback,
}: UseWorkspacePersistenceOptions) {
  const desktop = useDesktopWorkspacePersistence({
    enabled: runtime === "desktop",
    document,
    workspace,
    started,
    autosaveAllowed,
    onLoad: onDesktopLoad,
    setHasExistingProject,
    setSaveState,
    setFeedback,
  });
  const { storeWorkspace: storeBrowserWorkspace } =
    useBrowserWorkspacePersistence({
    enabled: runtime !== "desktop",
    document,
    workspace,
    started,
    autosaveAllowed,
    setWorkspace,
    setRecovery,
    setAutosaveAllowed,
    setHasExistingProject,
    setSaveState,
    setFeedback,
    });

  const storeWorkspace = useCallback(
    (next: WorkspaceState) => {
      if (runtime !== "desktop") {
        return storeBrowserWorkspace(next);
      }
      setWorkspace(next);
      setSaveState("saving");
      return true;
    },
    [
      runtime,
      setSaveState,
      setWorkspace,
      storeBrowserWorkspace,
    ],
  );

  return {
    desktopStatus: desktop.status,
    openDesktopProject: desktop.open,
    adoptDesktopProject: desktop.adopt,
    beginDesktopProject: desktop.beginNew,
    persistDesktopProject: desktop.persist,
    saveDesktopProjectAs: desktop.saveAs,
    saveDesktopArchive: desktop.saveArchive,
    saveDesktopRecovery: desktop.saveRecovery,
    storeWorkspace,
  };
}
