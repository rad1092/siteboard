import { useCallback, useEffect, useState } from "react";
import {
  desktopProjects,
  type DesktopProjectFile,
  type DesktopRuntimeStatus,
  type DesktopWorkspaceLoad,
  type PersistOptions,
} from "./desktop-projects";

interface DesktopProjectCallbacks {
  onLoad(
    workspace: DesktopWorkspaceLoad | null,
    status: DesktopRuntimeStatus,
  ): void;
  onError(error: Error): void;
}

async function service() {
  const current = await desktopProjects();
  if (!current) {
    throw new Error("데스크톱 프로젝트 저장소를 시작하지 못했습니다.");
  }
  return current;
}

function asError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error("데스크톱 프로젝트 작업을 완료하지 못했습니다.");
}

export interface DesktopProjectController {
  status: DesktopRuntimeStatus | null;
  open(): Promise<DesktopProjectFile | null>;
  adopt(path: string): Promise<DesktopRuntimeStatus>;
  beginNew(): Promise<DesktopRuntimeStatus>;
  persist(
    content: string,
    options?: PersistOptions,
  ): Promise<DesktopRuntimeStatus>;
  saveAs(
    content: string,
    suggestedName: string,
  ): Promise<DesktopRuntimeStatus | null>;
  saveArchive(
    bytes: Uint8Array,
    suggestedName: string,
  ): Promise<string | null>;
  saveRecovery(
    content: string,
    suggestedName: string,
  ): Promise<string | null>;
}

export function useDesktopProjects(
  enabled: boolean,
  { onLoad, onError }: DesktopProjectCallbacks,
): DesktopProjectController {
  const [status, setStatus] = useState<DesktopRuntimeStatus | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void service()
      .then(async (current) => {
        const nextStatus = await current.status();
        const workspace = await current.loadWorkspace();
        if (!active) return;
        setStatus(nextStatus);
        onLoad(workspace, nextStatus);
      })
      .catch((error) => {
        if (active) onError(asError(error));
      });
    return () => {
      active = false;
    };
  }, [enabled, onError, onLoad]);

  const updateStatus = useCallback(
    async (
      operation: () => Promise<DesktopRuntimeStatus>,
    ): Promise<DesktopRuntimeStatus> => {
      const next = await operation();
      setStatus(next);
      return next;
    },
    [],
  );

  const open = useCallback(async () => (await service()).openProject(), []);
  const adopt = useCallback(
    (path: string) =>
      updateStatus(async () => (await service()).adoptProject(path)),
    [updateStatus],
  );
  const beginNew = useCallback(
    () => updateStatus(async () => (await service()).newProject()),
    [updateStatus],
  );
  const persist = useCallback(
    (content: string, options?: PersistOptions) =>
      updateStatus(async () =>
        (await service()).persist(content, options),
      ),
    [updateStatus],
  );
  const saveAs = useCallback(
    async (content: string, suggestedName: string) => {
      const next = await (await service()).saveProjectAs(
        content,
        suggestedName,
      );
      if (next) setStatus(next);
      return next;
    },
    [],
  );
  const saveArchive = useCallback(
    async (bytes: Uint8Array, suggestedName: string) =>
      (await service()).saveArchive(bytes, suggestedName),
    [],
  );
  const saveRecovery = useCallback(
    async (content: string, suggestedName: string) =>
      (await service()).saveRecovery(content, suggestedName),
    [],
  );

  return {
    status,
    open,
    adopt,
    beginNew,
    persist,
    saveAs,
    saveArchive,
    saveRecovery,
  };
}
