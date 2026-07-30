import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProjectFile, emptyWorkspace } from "./project-file";
import { completeDocument } from "./test/fixture";

const desktop = vi.hoisted(() => {
  const status = {
    kind: "desktop" as const,
    appDataDirectory: "/Users/example/Library/Application Support/siteboard",
    activeProjectPath: null,
    activeProjectName: null,
  };
  return {
    status,
    service: {
      status: vi.fn(),
      loadWorkspace: vi.fn(),
      openProject: vi.fn(),
      adoptProject: vi.fn(),
      newProject: vi.fn(),
      persist: vi.fn(),
      saveProjectAs: vi.fn(),
      saveArchive: vi.fn(),
      saveRecovery: vi.fn(),
    },
  };
});

vi.mock("./platform/desktop-projects", () => ({
  desktopProjects: vi.fn(async () => desktop.service),
}));

import App from "./App";

describe("Siteboard Desktop", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    for (const method of Object.values(desktop.service)) {
      method.mockReset();
    }
    desktop.service.status.mockResolvedValue(desktop.status);
    desktop.service.loadWorkspace.mockResolvedValue(null);
    desktop.service.newProject.mockResolvedValue(desktop.status);
    desktop.service.persist.mockResolvedValue(desktop.status);
    desktop.service.adoptProject.mockResolvedValue({
      ...desktop.status,
      activeProjectPath: "/projects/client.siteboard",
      activeProjectName: "client.siteboard",
    });
  });

  it("uses the app data project store instead of browser localStorage", async () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Siteboard Desktop" }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "새 홈페이지 만들기" }),
    );
    fireEvent.change(await screen.findByLabelText("상호 또는 이름"), {
      target: { value: "데스크톱 공방" },
    });

    await waitFor(
      () => expect(desktop.service.persist).toHaveBeenCalled(),
      { timeout: 1_000 },
    );
    expect(localStorage.length).toBe(0);
    expect(
      String(desktop.service.persist.mock.calls.at(-1)?.[0]),
    ).toContain("데스크톱 공방");
  });

  it("opens the path chosen by the native project dialog", async () => {
    const project = createProjectFile(
      completeDocument(),
      emptyWorkspace(),
    );
    desktop.service.openProject.mockResolvedValue({
      content: JSON.stringify(project),
      path: "/projects/client.siteboard",
      fileName: "client.siteboard",
    });

    render(<App />);
    fireEvent.click(
      screen.getByRole("button", { name: "작업 파일 열기" }),
    );

    await waitFor(() =>
      expect(desktop.service.adoptProject).toHaveBeenCalledWith(
        "/projects/client.siteboard",
      ),
    );
    expect(await screen.findByDisplayValue("모서리 공방")).toBeVisible();
  });
});
