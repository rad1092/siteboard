import { describe, expect, it, vi } from "vitest";
import {
  createDesktopProjectService,
  type DesktopBridge,
} from "./desktop-projects";

function bridge(
  overrides: Partial<DesktopBridge> = {},
): DesktopBridge {
  return {
    invoke: vi.fn(async () => ({
      kind: "desktop",
      appDataDirectory: "/data",
      activeProjectPath: null,
      activeProjectName: null,
    })),
    open: vi.fn(async () => null),
    save: vi.fn(async () => null),
    ...overrides,
  } as DesktopBridge;
}

describe("desktop project service", () => {
  it("does not read a project after the native open dialog is cancelled", async () => {
    const current = bridge();
    const service = createDesktopProjectService(current);

    await expect(service.openProject()).resolves.toBeNull();
    expect(current.invoke).not.toHaveBeenCalled();
  });

  it("reads only the path selected by the native dialog", async () => {
    const current = bridge({
      open: vi.fn(async () => "/projects/client.siteboard"),
      invoke: vi.fn(async (command, args) => {
          expect(command).toBe("desktop_read_project");
          expect(args).toEqual({ path: "/projects/client.siteboard" });
          return {
            content: "{}",
            path: "/projects/client.siteboard",
            fileName: "client.siteboard",
          };
        }) as unknown as DesktopBridge["invoke"],
    });
    const service = createDesktopProjectService(current);

    await expect(service.openProject()).resolves.toMatchObject({
      fileName: "client.siteboard",
    });
  });

  it("requires a destination before writing a project or archive", async () => {
    const current = bridge({ save: vi.fn(async () => null) });
    const service = createDesktopProjectService(current);

    await expect(
      service.saveProjectAs("{}", "client.siteboard"),
    ).resolves.toBeNull();
    await expect(
      service.saveArchive(new Uint8Array([1, 2]), "site.zip"),
    ).resolves.toBeNull();
    await expect(
      service.saveRecovery("{broken", "recovery.txt"),
    ).resolves.toBeNull();
    expect(current.invoke).not.toHaveBeenCalled();
  });

  it("sends the recovery override as an explicit boolean", async () => {
    const invoke = vi.fn(async () => ({
        kind: "desktop",
        appDataDirectory: "/data",
        activeProjectPath: null,
        activeProjectName: null,
      })) as unknown as DesktopBridge["invoke"];
    const service = createDesktopProjectService(bridge({ invoke }));

    await service.persist("{}", { allowUnsafeReplacement: true });

    expect(invoke).toHaveBeenCalledWith("desktop_save_project", {
      content: "{}",
      allowUnsafeReplacement: true,
    });
  });
});
