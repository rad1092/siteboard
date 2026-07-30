import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
} from "react";
import type { DesktopWorkspaceLoad } from "../../platform/desktop-projects";
import { useDesktopProjects } from "../../platform/use-desktop-projects";
import {
  exportProjectFile as serializeProjectFile,
  type WorkspaceState,
} from "../../project-file";
import type { SiteDocument } from "../../types";
import type { SaveState } from "./types";

interface UseDesktopWorkspacePersistenceOptions {
  enabled: boolean;
  document: SiteDocument;
  workspace: WorkspaceState;
  started: boolean;
  autosaveAllowed: boolean;
  onLoad(load: DesktopWorkspaceLoad | null): void;
  setHasExistingProject: Dispatch<SetStateAction<boolean>>;
  setSaveState: Dispatch<SetStateAction<SaveState>>;
  setFeedback: Dispatch<SetStateAction<string>>;
}

export function useDesktopWorkspacePersistence({
  enabled,
  document,
  workspace,
  started,
  autosaveAllowed,
  onLoad,
  setHasExistingProject,
  setSaveState,
  setFeedback,
}: UseDesktopWorkspacePersistenceOptions) {
  const handleError = useCallback(
    (error: Error) => {
      setSaveState("error");
      setFeedback(error.message);
    },
    [setFeedback, setSaveState],
  );
  const controller = useDesktopProjects(enabled, {
    onLoad,
    onError: handleError,
  });
  const persist = controller.persist;

  useEffect(() => {
    if (!enabled || !started || !autosaveAllowed) return;
    const timeout = window.setTimeout(() => {
      void persist(serializeProjectFile(document, workspace))
        .then(() => {
          setSaveState("saved");
          setHasExistingProject(true);
        })
        .catch((error) => {
          setSaveState("error");
          setFeedback(
            error instanceof Error
              ? error.message
              : "프로젝트 파일을 저장하지 못했습니다.",
          );
        });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [
    autosaveAllowed,
    document,
    enabled,
    persist,
    setFeedback,
    setHasExistingProject,
    setSaveState,
    started,
    workspace,
  ]);

  return controller;
}
