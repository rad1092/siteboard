import { isDesktopRuntime } from "./runtime";

const externalProtocols = new Set(["https:", "http:", "mailto:", "tel:"]);

function clickedAnchor(target: EventTarget | null): HTMLAnchorElement | null {
  return target instanceof Element ? target.closest("a[href]") : null;
}

export function installDesktopExternalLinks(): () => void {
  if (!isDesktopRuntime()) return () => undefined;

  const onClick = (event: MouseEvent) => {
    const anchor = clickedAnchor(event.target);
    if (!anchor || event.defaultPrevented) return;
    const url = new URL(anchor.href, window.location.href);
    if (!externalProtocols.has(url.protocol)) return;
    event.preventDefault();
    void import("@tauri-apps/plugin-opener")
      .then(({ openUrl }) => openUrl(url.toString()))
      .catch(() => undefined);
  };
  document.addEventListener("click", onClick);
  return () => document.removeEventListener("click", onClick);
}

