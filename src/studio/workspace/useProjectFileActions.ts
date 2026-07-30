import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { createBlankDocument } from "../../data";
import type {
  DesktopProjectFile,
  DesktopRuntimeStatus,
} from "../../platform/desktop-projects";
import type { SiteboardRuntime } from "../../platform/runtime";
import {
  emptyWorkspace,
  exportProjectFile as serializeProjectFile,
  parseProjectFile,
  type ParsedProjectFile,
  type WorkspaceState,
} from "../../project-file";
import {
  saveStoredProject,
  type StorageRecovery,
} from "../../storage";
import type { SiteDocument } from "../../types";
import {
  downloadText,
  exportBasename,
  readFileText,
  safeTimestamp,
} from "../project-files";
import { workspaceFromProject } from "./projectTransforms";
import type { ActivateProject, SaveState } from "./types";

interface UseProjectFileActionsOptions {
  runtime: SiteboardRuntime;
  document: SiteDocument;
  workspace: WorkspaceState;
  hasExistingProject: boolean;
  activate: ActivateProject;
  openDesktopProject(): Promise<DesktopProjectFile | null>;
  adoptDesktopProject(path: string): Promise<DesktopRuntimeStatus>;
  beginDesktopProject(): Promise<DesktopRuntimeStatus>;
  saveDesktopProjectAs(
    content: string,
    suggestedName: string,
  ): Promise<DesktopRuntimeStatus | null>;
  setRecovery(recovery: StorageRecovery | null): void;
  setSaveState(state: SaveState): void;
  setFeedback(message: string): void;
}

export function useProjectFileActions({
  runtime,
  document,
  workspace,
  hasExistingProject,
  activate,
  openDesktopProject,
  adoptDesktopProject,
  beginDesktopProject,
  saveDesktopProjectAs,
  setRecovery,
  setSaveState,
  setFeedback,
}: UseProjectFileActionsOptions) {
  const importInput = useRef<HTMLInputElement>(null);

  const applyOpenedProject = useCallback(
    async (
      project: ParsedProjectFile,
      fileName: string,
      desktopPath?: string,
    ) => {
      if (hasExistingProject) {
        const confirmed = window.confirm(
          `"${fileName}" 파일을 열면 현재 내용을 교체하고 되돌리기 기록을 새로 시작합니다.`,
        );
        if (!confirmed) {
          setFeedback("현재 홈페이지 내용을 유지했습니다.");
          return false;
        }
        if (runtime !== "desktop") {
          downloadText(
            `${exportBasename(document.site.name)}-before-import-${safeTimestamp()}.siteboard.json`,
            serializeProjectFile(document, workspace),
            "application/json",
          );
        }
      }

      const nextWorkspace = workspaceFromProject(project);
      if (runtime === "desktop") {
        if (!desktopPath) {
          setFeedback(
            "데스크톱 프로젝트 경로를 확인하지 못했습니다.",
          );
          return false;
        }
        await adoptDesktopProject(desktopPath);
      } else {
        const saved = saveStoredProject(
          window.localStorage,
          project.document,
          nextWorkspace,
          { allowUnsafePrimaryReplacement: true },
        );
        if (!saved.ok) {
          setFeedback(
            "가져온 내용을 웹 데모 저장소에 저장하지 못했습니다.",
          );
          setSaveState(
            saved.reason === "unsafe-primary"
              ? "recovery"
              : "error",
          );
          return false;
        }
      }

      activate(project.document, nextWorkspace);
      setRecovery(null);
      setFeedback(
        project.migratedFrom === 1
          ? "이전 버전의 내용을 새 형식으로 옮겼습니다. 공개 전에 내용과 연락처를 확인해 주세요."
          : project.legacy
            ? `${fileName} 내용을 열었습니다. 기존 문서에는 배포 연결 정보가 없습니다.`
            : `${fileName} 프로젝트를 열었습니다.`,
      );
      return true;
    },
    [
      activate,
      adoptDesktopProject,
      document,
      hasExistingProject,
      runtime,
      setFeedback,
      setRecovery,
      setSaveState,
      workspace,
    ],
  );

  const handleImport = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      try {
        const result = parseProjectFile(await readFileText(file));
        if (!result.ok) {
          setFeedback(result.error);
          return;
        }
        await applyOpenedProject(result.project, file.name);
      } catch (error) {
        setFeedback(
          error instanceof Error
            ? error.message
            : "선택한 파일을 읽을 수 없습니다.",
        );
      }
    },
    [applyOpenedProject, setFeedback],
  );

  const openProjectFile = useCallback(async () => {
    if (runtime !== "desktop") {
      importInput.current?.click();
      return;
    }
    try {
      const selected = await openDesktopProject();
      if (!selected) return;
      const result = parseProjectFile(selected.content);
      if (!result.ok) {
        setFeedback(result.error);
        return;
      }
      await applyOpenedProject(
        result.project,
        selected.fileName,
        selected.path,
      );
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "프로젝트 파일을 열지 못했습니다.",
      );
    }
  }, [
    applyOpenedProject,
    openDesktopProject,
    runtime,
    setFeedback,
  ]);

  useEffect(() => {
    if (runtime !== "desktop") return;
    let disposed = false;
    const unlisteners: Array<() => void> = [];
    void import("@tauri-apps/api/event")
      .then(async ({ listen }) => {
        const opened = await listen<DesktopProjectFile>(
          "desktop-project-open-requested",
          ({ payload }) => {
            const result = parseProjectFile(payload.content);
            if (!result.ok) {
              setFeedback(result.error);
              return;
            }
            void applyOpenedProject(
              result.project,
              payload.fileName,
              payload.path,
            ).catch((error) => {
              setFeedback(
                error instanceof Error
                  ? error.message
                  : "프로젝트 파일을 열지 못했습니다.",
              );
            });
          },
        );
        const failed = await listen<string>(
          "desktop-project-open-failed",
          ({ payload }) => setFeedback(payload),
        );
        if (disposed) {
          opened();
          failed();
          return;
        }
        unlisteners.push(opened, failed);
      })
      .catch((error) => {
        setFeedback(
          error instanceof Error
            ? error.message
            : "운영체제 파일 열기 연결을 시작하지 못했습니다.",
        );
      });
    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [applyOpenedProject, runtime, setFeedback]);

  const startNew = useCallback(async () => {
    if (
      hasExistingProject &&
      !window.confirm(
        "현재 프로젝트는 저장된 상태로 남겨 두고 새 홈페이지를 시작합니다. 계속할까요?",
      )
    ) {
      return;
    }
    if (hasExistingProject && runtime !== "desktop") {
      downloadText(
        `${exportBasename(document.site.name)}-before-new-${safeTimestamp()}.siteboard.json`,
        serializeProjectFile(document, workspace),
        "application/json",
      );
    }
    const blank = createBlankDocument();
    const nextWorkspace = emptyWorkspace();
    if (runtime === "desktop") {
      try {
        await beginDesktopProject();
      } catch (error) {
        setFeedback(
          error instanceof Error
            ? error.message
            : "새 프로젝트를 시작하지 못했습니다.",
        );
        return;
      }
    } else {
      const saved = saveStoredProject(
        window.localStorage,
        blank,
        nextWorkspace,
        { allowUnsafePrimaryReplacement: true },
      );
      if (!saved.ok) {
        setFeedback(
          "새 홈페이지를 웹 데모 저장소에 저장하지 못했습니다.",
        );
        return;
      }
    }
    activate(blank, nextWorkspace, { saveState: "saving" });
    setRecovery(null);
    setFeedback("상호와 첫 화면 문구부터 입력하세요.");
  }, [
    activate,
    beginDesktopProject,
    document,
    hasExistingProject,
    runtime,
    setFeedback,
    setRecovery,
    workspace,
  ]);

  const exportProject = useCallback(async () => {
    const content = serializeProjectFile(document, workspace);
    if (runtime === "desktop") {
      try {
        const status = await saveDesktopProjectAs(
          content,
          `${exportBasename(document.site.name)}.siteboard`,
        );
        if (!status) return;
        setSaveState("saved");
        setFeedback(
          `${status.activeProjectName ?? "프로젝트"} 파일로 저장했습니다.`,
        );
      } catch (error) {
        setSaveState("error");
        setFeedback(
          error instanceof Error
            ? error.message
            : "프로젝트 파일을 저장하지 못했습니다.",
        );
      }
      return;
    }
    downloadText(
      `${exportBasename(document.site.name)}.siteboard.json`,
      content,
      "application/json",
    );
    setFeedback(
      "작업 파일을 저장했습니다. 로컬 Studio에서 ‘작업 파일 열기’로 불러오세요.",
    );
  }, [
    document,
    runtime,
    saveDesktopProjectAs,
    setFeedback,
    setSaveState,
    workspace,
  ]);

  return {
    importInput,
    handleImport,
    openProjectFile,
    startNew,
    exportProject,
  };
}
