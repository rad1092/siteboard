import { useCallback, useState } from "react";
import type { DesktopWorkspaceLoad } from "../platform/desktop-projects";
import {
  isDesktopRuntime,
  type SiteboardRuntime,
} from "../platform/runtime";
import {
  parseProjectFile,
  type WorkspaceState,
} from "../project-file";
import { saveStoredProject, type StorageRecovery } from "../storage";
import type { SiteDocument } from "../types";
import {
  workspaceFromProject,
} from "./workspace/projectTransforms";
import type { SaveState } from "./workspace/types";
import { useDocumentHistory } from "./workspace/useDocumentHistory";
import { useProjectFileActions } from "./workspace/useProjectFileActions";
import { useProjectRecovery } from "./workspace/useProjectRecovery";
import { useStudioCompanion } from "./workspace/useStudioCompanion";
import {
  loadInitialWorkspace,
  useWorkspacePersistence,
} from "./workspace/useWorkspacePersistence";

export type { CompanionState, SaveState } from "./workspace/types";

export function useProjectWorkspace() {
  const [runtime] = useState<SiteboardRuntime>(() =>
    isDesktopRuntime() ? "desktop" : "web",
  );
  const [initialStorage] = useState(() =>
    loadInitialWorkspace(runtime),
  );
  const [workspace, setWorkspace] = useState<WorkspaceState>(
    initialStorage.workspace,
  );
  const [hasExistingProject, setHasExistingProject] = useState(
    initialStorage.source !== "starter",
  );
  const [started, setStarted] = useState(
    Boolean(initialStorage.recovery),
  );
  const [recovery, setRecovery] = useState<StorageRecovery | null>(
    initialStorage.recovery,
  );
  const [autosaveAllowed, setAutosaveAllowed] = useState(
    initialStorage.source !== "starter" &&
      !initialStorage.recovery,
  );
  const [saveState, setSaveState] = useState<SaveState>(
    initialStorage.recovery
      ? "recovery"
      : initialStorage.source === "starter"
        ? "saved"
        : "saving",
  );
  const [feedback, setFeedback] = useState(
    initialStorage.source === "migrated"
      ? "기존 Siteboard 파일을 새 홈페이지 형식으로 옮겼습니다. 공개 전에 내용과 연락처를 확인해 주세요."
      : "",
  );

  const markEdited = useCallback(() => {
    setStarted(true);
    setAutosaveAllowed(true);
    setSaveState("saving");
  }, []);
  const markHistoryNavigation = useCallback(() => {
    setSaveState(autosaveAllowed ? "saving" : "recovery");
  }, [autosaveAllowed]);
  const {
    document,
    history,
    commit,
    replaceDocument,
    commitDocument,
    replaceHistory,
    undo,
    redo,
  } = useDocumentHistory(initialStorage.document, {
    onEdit: markEdited,
    onHistoryNavigation: markHistoryNavigation,
  });

  const activate = useCallback(
    (
      nextDocument: SiteDocument,
      nextWorkspace: WorkspaceState,
      options: {
        started?: boolean;
        saveState?: SaveState;
        autosave?: boolean;
      } = {},
    ) => {
      replaceHistory(nextDocument);
      setWorkspace(nextWorkspace);
      setStarted(options.started ?? true);
      setAutosaveAllowed(options.autosave ?? true);
      setHasExistingProject(true);
      setSaveState(options.saveState ?? "saved");
    },
    [replaceHistory],
  );

  const handleDesktopLoad = useCallback(
    (loaded: DesktopWorkspaceLoad | null) => {
      if (!loaded) return;
      const result = parseProjectFile(loaded.content);
      if (!result.ok) {
        setFeedback(result.error);
        return;
      }
      activate(
        result.project.document,
        workspaceFromProject(result.project),
        {
          started: Boolean(loaded.recoveryRaw),
          autosave: !loaded.recoveryRaw,
          saveState: loaded.recoveryRaw ? "recovery" : "saved",
        },
      );
      setRecovery(
        loaded.recoveryRaw && loaded.recoveryKind
          ? {
              raw: loaded.recoveryRaw,
              kind: loaded.recoveryKind,
              preservedInStorage: true,
            }
          : null,
      );
      setFeedback(
        loaded.source === "backup"
          ? loaded.recoveryRaw
            ? `${loaded.fileName}의 직전 정상 저장본을 열었습니다. 손상 원본은 복구 폴더에 보존했습니다.`
            : `${loaded.fileName} 저장이 중단되어 직전 정상 저장본을 열었습니다.`
          : `${loaded.fileName} 프로젝트를 열었습니다.`,
      );
    },
    [activate],
  );

  const persistence = useWorkspacePersistence({
    runtime,
    document,
    workspace,
    started,
    autosaveAllowed,
    onDesktopLoad: handleDesktopLoad,
    setWorkspace,
    setRecovery,
    setAutosaveAllowed,
    setHasExistingProject,
    setSaveState,
    setFeedback,
  });
  const { acceptRecovery, downloadRecovery } = useProjectRecovery({
    runtime,
    recovery,
    document,
    workspace,
    persistDesktopProject: persistence.persistDesktopProject,
    saveDesktopRecovery: persistence.saveDesktopRecovery,
    setRecovery,
    setAutosaveAllowed,
    setSaveState,
    setFeedback,
  });
  const fileActions = useProjectFileActions({
    runtime,
    document,
    workspace,
    hasExistingProject,
    activate,
    openDesktopProject: persistence.openDesktopProject,
    adoptDesktopProject: persistence.adoptDesktopProject,
    beginDesktopProject: persistence.beginDesktopProject,
    saveDesktopProjectAs: persistence.saveDesktopProjectAs,
    setRecovery,
    setSaveState,
    setFeedback,
  });
  const { companionState, companion } = useStudioCompanion({
    runtime,
    activate,
    setFeedback,
  });

  const openDashboard = useCallback(() => {
    if (!started) return;
    if (
      runtime !== "desktop" &&
      autosaveAllowed
    ) {
      const saved = saveStoredProject(
        window.localStorage,
        document,
        workspace,
      );
      setSaveState(saved.ok ? "saved" : "error");
    }
    setStarted(false);
  }, [
    autosaveAllowed,
    document,
    runtime,
    started,
    workspace,
  ]);

  return {
    runtime,
    document,
    history,
    workspace,
    hasExistingProject,
    started,
    setStarted,
    recovery,
    autosaveAllowed,
    setAutosaveAllowed,
    saveState,
    setSaveState,
    feedback,
    setFeedback,
    companionState,
    companion,
    desktopStatus: persistence.desktopStatus,
    importInput: fileActions.importInput,
    handleImport: fileActions.handleImport,
    openProjectFile: fileActions.openProjectFile,
    startNew: fileActions.startNew,
    exportProject: fileActions.exportProject,
    acceptRecovery,
    downloadRecovery,
    openDashboard,
    undo,
    redo,
    commit,
    replaceDocument,
    commitDocument,
    storeWorkspace: persistence.storeWorkspace,
    saveDesktopArchive: persistence.saveDesktopArchive,
  };
}
