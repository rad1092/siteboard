import {
  type Dispatch,
  type SetStateAction,
  useCallback,
} from "react";
import type { SiteboardRuntime } from "../../platform/runtime";
import {
  exportProjectFile as serializeProjectFile,
  type WorkspaceState,
} from "../../project-file";
import {
  saveStoredProject,
  type StorageRecovery,
} from "../../storage";
import type { SiteDocument } from "../../types";
import { downloadText, safeTimestamp } from "../project-files";
import type { SaveState } from "./types";

interface UseProjectRecoveryOptions {
  runtime: SiteboardRuntime;
  recovery: StorageRecovery | null;
  document: SiteDocument;
  workspace: WorkspaceState;
  persistDesktopProject(
    content: string,
    options?: { allowUnsafeReplacement?: boolean },
  ): Promise<unknown>;
  saveDesktopRecovery(
    content: string,
    suggestedName: string,
  ): Promise<string | null>;
  setRecovery: Dispatch<SetStateAction<StorageRecovery | null>>;
  setAutosaveAllowed: Dispatch<SetStateAction<boolean>>;
  setSaveState: Dispatch<SetStateAction<SaveState>>;
  setFeedback: Dispatch<SetStateAction<string>>;
}

export function useProjectRecovery({
  runtime,
  recovery,
  document,
  workspace,
  persistDesktopProject,
  saveDesktopRecovery,
  setRecovery,
  setAutosaveAllowed,
  setSaveState,
  setFeedback,
}: UseProjectRecoveryOptions) {
  const acceptRecovery = useCallback(async () => {
    if (runtime === "desktop") {
      try {
        await persistDesktopProject(
          serializeProjectFile(document, workspace),
          { allowUnsafeReplacement: true },
        );
        setRecovery(null);
        setAutosaveAllowed(true);
        setSaveState("saved");
        setFeedback(
          "열린 정상 저장본을 현재 프로젝트로 사용합니다.",
        );
      } catch (error) {
        setFeedback(
          error instanceof Error
            ? error.message
            : "복구한 프로젝트를 저장하지 못했습니다.",
        );
      }
      return;
    }
    const saved = saveStoredProject(
      window.localStorage,
      document,
      workspace,
      { allowUnsafePrimaryReplacement: true },
    );
    if (!saved.ok) {
      setFeedback(
        "복구한 내용을 브라우저에 저장하지 못했습니다.",
      );
      return;
    }
    setRecovery(null);
    setAutosaveAllowed(true);
    setSaveState("saved");
    setFeedback("화면에 열린 내용을 새 저장본으로 사용합니다.");
  }, [
    document,
    persistDesktopProject,
    runtime,
    setAutosaveAllowed,
    setFeedback,
    setRecovery,
    setSaveState,
    workspace,
  ]);

  const downloadRecovery = useCallback(async () => {
    if (!recovery) return;
    if (runtime === "desktop") {
      try {
        const path = await saveDesktopRecovery(
          recovery.raw,
          `siteboard-recovery-${safeTimestamp()}.txt`,
        );
        if (path) {
          setFeedback("손상 원본의 복구 사본을 저장했습니다.");
        }
      } catch (error) {
        setFeedback(
          error instanceof Error
            ? error.message
            : "복구 원본을 저장하지 못했습니다.",
        );
      }
      return;
    }
    downloadText(
      `siteboard-recovery-${safeTimestamp()}.txt`,
      recovery.raw,
      "text/plain",
    );
    setFeedback("기존 저장 데이터를 파일로 받았습니다.");
  }, [
    recovery,
    runtime,
    saveDesktopRecovery,
    setFeedback,
  ]);

  return { acceptRecovery, downloadRecovery };
}
