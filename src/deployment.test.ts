import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();

describe("deployment contract", () => {
  it("uses /siteboard/ for Vite, the manifest, icons, and service worker", async () => {
    const [viteConfig, indexHtml, manifestText, serviceWorker] =
      await Promise.all([
        readFile(resolve(projectRoot, "vite.config.ts"), "utf8"),
        readFile(resolve(projectRoot, "index.html"), "utf8"),
        readFile(resolve(projectRoot, "public/manifest.webmanifest"), "utf8"),
        readFile(resolve(projectRoot, "public/sw.js"), "utf8"),
      ]);
    const manifest = JSON.parse(manifestText) as {
      start_url: string;
      scope: string;
      icons: Array<{ src: string }>;
    };

    expect(viteConfig).toContain('base: "/siteboard/"');
    expect(indexHtml).toContain('href="/siteboard/manifest.webmanifest"');
    expect(manifest.start_url).toBe("/siteboard/");
    expect(manifest.scope).toBe("/siteboard/");
    expect(manifest.icons.every((icon) => icon.src.startsWith("/siteboard/")))
      .toBe(true);
    expect(serviceWorker).toContain('"siteboard-shell-v1"');

    await Promise.all([
      access(resolve(projectRoot, "public/icon-192.png")),
      access(resolve(projectRoot, "public/icon-512.png")),
      access(resolve(projectRoot, "public/siteboard-mark.svg")),
    ]);
  });

  it("ships a Pages workflow that gates deployment on test, lint, and build", async () => {
    const workflow = await readFile(
      resolve(projectRoot, ".github/workflows/deploy-pages.yml"),
      "utf8",
    );

    expect(workflow).toContain("npm test");
    expect(workflow).toContain("npm run lint");
    expect(workflow).toContain("npm run build");
    expect(workflow).toContain("actions/deploy-pages@v4");
  });
});
