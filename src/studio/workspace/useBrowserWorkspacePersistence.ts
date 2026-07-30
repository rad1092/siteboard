import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
} from "react";
import type { WorkspaceState } from "../../project-file";
import {
  loadStoredProject,
  saveStoredProject,
  type StorageRecovery,
} from "../../storage";
import type { SiteDocument } from "../../types";
import type { SaveState } from "./types";

export function loadBrowserWorkspace() {
  return loadStoredProject(window.localStorage);
}

interface UseBrowserWorkspacePersistenceOptions {
  enabled: boolean;
  document: SiteDocument;
  workspace: WorkspaceState;
  started: boolean;
  autosaveAllowed: boolean;
  setWorkspace: Dispatch<SetStateAction<WorkspaceState>>;
  setRecovery: Dispatch<SetStateAction<StorageRecovery | null>>;
  setAutosaveAllowed: Dispatch<SetStateAction<boolean>>;
  setHasExistingProject: Dispatch<SetStateAction<boolean>>;
  setSaveState: Dispatch<SetStateAction<SaveState>>;
  setFeedback: Dispatch<SetStateAction<string>>;
}

export function useBrowserWorkspacePersistence({
  enabled,
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
}: UseBrowserWorkspacePersistenceOptions) {
  const storeWorkspace = useCallback(
    (next: WorkspaceState) => {
      if (
        !saveStoredProject(window.localStorage, document, next).ok
      ) {
        setFeedback(
          "작업 연결과 저장본을 브라우저에 저장하지 못했습니다.",
        );
        return false;
      }
      setWorkspace(next);
      return true;
    },
    [document, setFeedback, setWorkspace],
  );

  useEffect(() => {
    if (!enabled || !started || !autosaveAllowed) return;
    const timeout = window.setTimeout(() => {
      const result = saveStoredProject(
        window.localStorage,
        document,
        workspace,
      );
      if (result.ok) {
        setSaveState("saved");
        setHasExistingProject(true);
      } else if (result.reason === "unsafe-primary") {
        const nextLoad = loadStoredProject(window.localStorage);
        setRecovery(nextLoad.recovery);
        setAutosaveAllowed(false);
        setSaveState("recovery");
      } else {
        setSaveState("error");
      }
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [
    autosaveAllowed,
    document,
    enabled,
    setAutosaveAllowed,
    setHasExistingProject,
    setRecovery,
    setSaveState,
    started,
    workspace,
  ]);

  return { storeWorkspace };
}
