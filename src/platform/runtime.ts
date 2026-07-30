export type SiteboardRuntime = "desktop" | "studio" | "web";

type TauriGlobal = {
  __TAURI_INTERNALS__?: unknown;
};

export function isDesktopRuntime(
  target: TauriGlobal = globalThis as unknown as TauriGlobal,
): boolean {
  return Boolean(target.__TAURI_INTERNALS__);
}

export function runtimeLabel(runtime: SiteboardRuntime): string {
  if (runtime === "desktop") return "컴퓨터 프로젝트";
  if (runtime === "studio") return "로컬 Studio";
  return "웹 데모";
}
