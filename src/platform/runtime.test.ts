import { describe, expect, it } from "vitest";
import { isDesktopRuntime, runtimeLabel } from "./runtime";

describe("runtime boundary", () => {
  it("recognizes Tauri without looking at the URL", () => {
    expect(
      isDesktopRuntime({ __TAURI_INTERNALS__: {} }),
    ).toBe(true);
    expect(isDesktopRuntime({})).toBe(false);
  });

  it("uses honest product labels for each surface", () => {
    expect(runtimeLabel("desktop")).toBe("컴퓨터 프로젝트");
    expect(runtimeLabel("studio")).toBe("로컬 Studio");
    expect(runtimeLabel("web")).toBe("웹 데모");
  });
});
