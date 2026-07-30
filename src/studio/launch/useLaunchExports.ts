import { useCallback } from "react";
import { createDeploymentZip } from "../../archive";
import type { SiteboardRuntime } from "../../platform/runtime";
import type { SiteDocument, ValidationIssue } from "../../types";
import { downloadBlob, exportBasename } from "../project-files";

interface UseLaunchExportsOptions {
  document: SiteDocument;
  errors: ValidationIssue[];
  runtime: SiteboardRuntime;
  saveDesktopArchive(
    bytes: Uint8Array,
    suggestedName: string,
  ): Promise<string | null>;
  setFeedback(message: string): void;
}

export function useLaunchExports({
  document,
  errors,
  runtime,
  saveDesktopArchive,
  setFeedback,
}: UseLaunchExportsOptions) {
  const exportZip = useCallback(async () => {
    if (errors.length) {
      setFeedback(
        `내보내기 전에 ${errors.length}개 항목을 확인해 주세요.`,
      );
      return;
    }
    try {
      const bytes = createDeploymentZip(document);
      const suggestedName = `${exportBasename(document.site.name)}-website.zip`;
      if (runtime === "desktop") {
        const path = await saveDesktopArchive(bytes, suggestedName);
        if (!path) return;
        setFeedback("배포용 ZIP을 선택한 위치에 저장했습니다.");
        return;
      }
      const arrayBuffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      downloadBlob(
        suggestedName,
        new Blob([arrayBuffer], { type: "application/zip" }),
      );
      setFeedback(
        "홈페이지 파일을 저장했습니다. 압축을 푼 전체 내용을 함께 올리세요.",
      );
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "홈페이지 파일을 만들지 못했습니다.",
      );
    }
  }, [
    document,
    errors.length,
    runtime,
    saveDesktopArchive,
    setFeedback,
  ]);

  return { exportZip };
}
