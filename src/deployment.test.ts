import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();

describe("deployment contract", () => {
  it("uses the independent siteboard.whago.net root for Vite and the PWA", async () => {
    const [viteConfig, indexHtml, mainSource, manifestText, serviceWorker] =
      await Promise.all([
        readFile(resolve(projectRoot, "vite.config.ts"), "utf8"),
        readFile(resolve(projectRoot, "index.html"), "utf8"),
        readFile(resolve(projectRoot, "src/main.tsx"), "utf8"),
        readFile(resolve(projectRoot, "public/manifest.webmanifest"), "utf8"),
        readFile(resolve(projectRoot, "public/sw.js"), "utf8"),
      ]);
    const manifest = JSON.parse(manifestText) as {
      id: string;
      start_url: string;
      scope: string;
      lang: string;
      icons: Array<{ src: string }>;
    };

    expect(viteConfig).not.toContain('base: "/siteboard/"');
    expect(indexHtml).toContain('href="/manifest.webmanifest"');
    expect(indexHtml).toContain(
      '<link rel="canonical" href="https://siteboard.whago.net/"',
    );
    expect(indexHtml).not.toContain("rad1092.github.io");
    expect(manifest.id).toBe("/");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.lang).toBe("ko");
    expect(indexHtml).toContain('<html lang="ko">');
    expect(manifest.icons.every((icon) => icon.src.startsWith("/"))).toBe(true);
    expect(
      manifest.icons.every((icon) => !icon.src.startsWith("/siteboard/")),
    ).toBe(true);
    expect(mainSource).toContain("scope: import.meta.env.BASE_URL");
    expect(serviceWorker).toContain(
      'const CACHE_PREFIX = "siteboard-shell-"',
    );
    expect(serviceWorker).toContain(
      'const RELEASE_ID = "__SITEBOARD_RELEASE__"',
    );
    expect(serviceWorker).toContain("key.startsWith(CACHE_PREFIX)");
    expect(serviceWorker).toContain("isInAppScope(requestUrl)");
    expect(viteConfig).toContain(
      'worker.replaceAll("__SITEBOARD_RELEASE__", releaseId)',
    );

    await Promise.all([
      access(resolve(projectRoot, "public/icon-192.png")),
      access(resolve(projectRoot, "public/icon-512.png")),
      access(resolve(projectRoot, "public/siteboard-mark.svg")),
    ]);
  });

  it("ships a local Studio CLI and no GitHub Pages deployment workflow", async () => {
    const [packageText, cli, server, ci] = await Promise.all([
      readFile(resolve(projectRoot, "package.json"), "utf8"),
      readFile(resolve(projectRoot, "cli/siteboard.js"), "utf8"),
      readFile(resolve(projectRoot, "cli/server.js"), "utf8"),
      readFile(resolve(projectRoot, ".github/workflows/ci.yml"), "utf8"),
    ]);
    const packageJson = JSON.parse(packageText) as {
      bin: Record<string, string>;
      files: string[];
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
    };

    expect(packageJson.bin.siteboard).toBe("./cli/siteboard.js");
    expect(packageJson.scripts.studio).toContain("siteboard.js studio");
    expect(packageJson.scripts.prepare).toBe("npm run build");
    expect(packageJson.files).toContain("dist");
    expect(packageJson.files).toContain("cli/siteboard.js");
    expect(packageJson.files.every((file) => !file.endsWith(".test.js"))).toBe(
      true,
    );
    expect(packageJson.dependencies.wrangler).toMatch(/^\^4\./);
    expect(cli).toContain("createStudioServer");
    expect(server).toContain('server.listen(port, "127.0.0.1"');
    expect(ci).toContain("npm test");
    expect(ci).toContain("npm run lint");
    expect(ci).toContain("npm run build");
    await expect(
      access(resolve(projectRoot, ".github/workflows/deploy-pages.yml")),
    ).rejects.toThrow();
  });
});
