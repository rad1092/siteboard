import { useEffect, useState } from "react";
import {
  detectCompanion,
  loadStartupProject,
  type CompanionStatus,
} from "../../deployment";
import type { SiteboardRuntime } from "../../platform/runtime";
import { parseProjectFile } from "../../project-file";
import { saveStoredProject } from "../../storage";
import {
  timestampDocument,
  workspaceFromProject,
} from "./projectTransforms";
import type {
  ActivateProject,
  CompanionState,
} from "./types";

interface UseStudioCompanionOptions {
  runtime: SiteboardRuntime;
  activate: ActivateProject;
  setFeedback(message: string): void;
}

export function useStudioCompanion({
  runtime,
  activate,
  setFeedback,
}: UseStudioCompanionOptions) {
  const [state, setState] = useState<CompanionState>(
    runtime === "desktop" ? "unavailable" : "checking",
  );
  const [status, setStatus] =
    useState<CompanionStatus | null>(null);

  useEffect(() => {
    if (runtime === "desktop") return;
    let active = true;
    void detectCompanion().then(async (detected) => {
      if (!active) return;
      setState(detected ? "available" : "unavailable");
      setStatus(detected);
      if (!detected?.startupFile) return;
      try {
        const startup = await loadStartupProject();
        const result = parseProjectFile(startup.content);
        if (!result.ok) {
          setFeedback(result.error);
          return;
        }
        const imported = timestampDocument(
          result.project.document,
        );
        const workspace = workspaceFromProject(result.project);
        const saved = saveStoredProject(
          window.localStorage,
          imported,
          workspace,
          { allowUnsafePrimaryReplacement: true },
        );
        if (!saved.ok || !active) {
          setFeedback(
            "시작 작업 파일을 브라우저에 저장하지 못했습니다.",
          );
          return;
        }
        activate(imported, workspace);
        setFeedback(
          `${startup.fileName} 작업 파일을 Studio에서 열었습니다.`,
        );
      } catch (error) {
        setFeedback(
          error instanceof Error
            ? error.message
            : "시작 작업 파일을 열지 못했습니다.",
        );
      }
    });
    return () => {
      active = false;
    };
  }, [activate, runtime, setFeedback]);

  return { companionState: state, companion: status };
}
