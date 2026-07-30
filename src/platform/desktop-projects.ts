import type { OpenDialogOptions, SaveDialogOptions } from "@tauri-apps/plugin-dialog";
import type { RecoveryKind } from "../storage";
import { isDesktopRuntime } from "./runtime";

export interface DesktopRuntimeStatus {
  kind: "desktop";
  appDataDirectory: string;
  activeProjectPath: string | null;
  activeProjectName: string | null;
}

export interface DesktopProjectFile {
  content: string;
  path: string;
  fileName: string;
}

export interface DesktopWorkspaceLoad extends DesktopProjectFile {
  source: "primary" | "backup";
  recoveryRaw: string | null;
  recoveryKind: RecoveryKind | null;
}

export interface DesktopBridge {
  invoke<T>(
    command: string,
    args?: Record<string, unknown>,
  ): Promise<T>;
  open(options: OpenDialogOptions): Promise<string | string[] | null>;
  save(options: SaveDialogOptions): Promise<string | null>;
}

export interface PersistOptions {
  allowUnsafeReplacement?: boolean;
}

export interface DesktopProjectService {
  status(): Promise<DesktopRuntimeStatus>;
  loadWorkspace(): Promise<DesktopWorkspaceLoad | null>;
  openProject(): Promise<DesktopProjectFile | null>;
  adoptProject(path: string): Promise<DesktopRuntimeStatus>;
  newProject(): Promise<DesktopRuntimeStatus>;
  persist(
    content: string,
    options?: PersistOptions,
  ): Promise<DesktopRuntimeStatus>;
  saveProjectAs(
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

const projectFilters = [
  {
    name: "Siteboard 프로젝트",
    extensions: ["siteboard", "json"],
  },
];

function singlePath(value: string | string[] | null): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

export function createDesktopProjectService(
  bridge: DesktopBridge,
): DesktopProjectService {
  let writeQueue: Promise<void> = Promise.resolve();
  const enqueueWrite = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = writeQueue.then(operation, operation);
    writeQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  return {
    status() {
      return bridge.invoke("desktop_runtime_status");
    },
    loadWorkspace() {
      return bridge.invoke("desktop_load_workspace");
    },
    async openProject() {
      const selected = singlePath(
        await bridge.open({
          multiple: false,
          directory: false,
          filters: projectFilters,
        }),
      );
      if (!selected) return null;
      return bridge.invoke("desktop_read_project", { path: selected });
    },
    adoptProject(path) {
      return enqueueWrite(() =>
        bridge.invoke("desktop_use_project", { path }),
      );
    },
    newProject() {
      return enqueueWrite(() => bridge.invoke("desktop_new_project"));
    },
    persist(content, options = {}) {
      return enqueueWrite(() =>
        bridge.invoke("desktop_save_project", {
          content,
          allowUnsafeReplacement:
            options.allowUnsafeReplacement === true,
        }),
      );
    },
    async saveProjectAs(content, suggestedName) {
      const selected = await bridge.save({
        defaultPath: suggestedName,
        filters: projectFilters,
      });
      if (!selected) return null;
      return enqueueWrite(() =>
        bridge.invoke("desktop_save_project_to", {
          path: selected,
          content,
        }),
      );
    },
    async saveArchive(bytes, suggestedName) {
      const selected = await bridge.save({
        defaultPath: suggestedName,
        filters: [
          {
            name: "배포용 ZIP",
            extensions: ["zip"],
          },
        ],
      });
      if (!selected) return null;
      return enqueueWrite(() =>
        bridge.invoke("desktop_write_archive", {
          path: selected,
          bytes: Array.from(bytes),
        }),
      );
    },
    async saveRecovery(content, suggestedName) {
      const selected = await bridge.save({
        defaultPath: suggestedName,
        filters: [
          {
            name: "복구 원본",
            extensions: ["txt"],
          },
        ],
      });
      if (!selected) return null;
      return enqueueWrite(() =>
        bridge.invoke("desktop_write_recovery_export", {
          path: selected,
          content,
        }),
      );
    },
  };
}

let servicePromise: Promise<DesktopProjectService | null> | null = null;

export function desktopProjects(): Promise<DesktopProjectService | null> {
  if (!isDesktopRuntime()) return Promise.resolve(null);
  if (!servicePromise) {
    servicePromise = Promise.all([
      import("@tauri-apps/api/core"),
      import("@tauri-apps/plugin-dialog"),
    ]).then(([core, dialog]) =>
      createDesktopProjectService({
        invoke: core.invoke,
        open: dialog.open,
        save: dialog.save,
      }),
    );
  }
  return servicePromise;
}
