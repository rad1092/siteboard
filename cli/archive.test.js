import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import {
  extractDeploymentArchive,
  safeArchivePath,
  writeRevisionMarker,
} from "./archive.js";

const directories = [];

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "siteboard-archive-test-"));
  directories.push(directory);
  return directory;
}

function archive(entries) {
  return Buffer.from(zipSync(entries)).toString("base64");
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("deployment archive extraction", () => {
  it("extracts a valid static site into the isolated directory", async () => {
    const directory = await temporaryDirectory();
    const result = await extractDeploymentArchive(
      archive({
        "index.html": strToU8("<h1>Siteboard</h1>"),
        "assets/site.css": strToU8("body{}"),
      }),
      directory,
    );

    expect(result.fileCount).toBe(2);
    expect(await readFile(join(directory, "index.html"), "utf8")).toContain(
      "Siteboard",
    );
  });

  it.each(["../outside.txt", "/absolute.txt", "assets\\escape.txt", "a/../b"])(
    "rejects path traversal entry %s",
    async (entryPath) => {
      const directory = await temporaryDirectory();
      await expect(
        extractDeploymentArchive(
          archive({
            "index.html": strToU8("ok"),
            [entryPath]: strToU8("escape"),
          }),
          directory,
        ),
      ).rejects.toThrow(/안전하지 않은|벗어납니다/);
      await expect(access(join(directory, "..", "outside.txt"))).rejects.toThrow();
    },
  );

  it("requires a deployable index.html", async () => {
    const directory = await temporaryDirectory();
    await expect(
      extractDeploymentArchive(
        archive({ "robots.txt": strToU8("User-agent: *") }),
        directory,
      ),
    ).rejects.toThrow("index.html");
  });

  it("keeps resolved paths inside the extraction root", async () => {
    const directory = await temporaryDirectory();
    expect(safeArchivePath(directory, "assets/image.png")).toBe(
      join(directory, "assets", "image.png"),
    );
  });

  it("writes the immutable deployment revision marker", async () => {
    const directory = await temporaryDirectory();
    await writeRevisionMarker(directory, "a".repeat(64));
    expect(
      JSON.parse(
        await readFile(join(directory, "siteboard-revision.json"), "utf8"),
      ),
    ).toEqual({ schemaVersion: 1, revision: "a".repeat(64) });
  });
});
