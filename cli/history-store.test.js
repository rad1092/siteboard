import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DeploymentHistoryStore } from "./history-store.js";

const directories = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("append-only deployment history", () => {
  it("appends immutable records and keeps previous lines byte-for-byte", async () => {
    const directory = await mkdtemp(join(tmpdir(), "siteboard-history-test-"));
    directories.push(directory);
    const store = new DeploymentHistoryStore({ directory });

    const first = await store.append({
      projectName: "example",
      operation: "publish",
      status: "live",
      eventId: "caller-cannot-override",
    });
    const firstRaw = await readFile(store.path, "utf8");
    const second = await store.append({
      projectName: "example",
      operation: "rollback",
      status: "recovered",
    });
    const secondRaw = await readFile(store.path, "utf8");

    expect(first.eventId).not.toBe("caller-cannot-override");
    expect(first.eventId).not.toBe(second.eventId);
    expect(secondRaw.startsWith(firstRaw)).toBe(true);
    expect(await store.list("example")).toEqual([second, first]);
  });

  it("keeps failures separate from successful recovery states", async () => {
    const directory = await mkdtemp(join(tmpdir(), "siteboard-history-test-"));
    directories.push(directory);
    const store = new DeploymentHistoryStore({ directory });
    await store.append({
      projectName: "example",
      operation: "publish",
      status: "failed",
    });
    await store.append({
      projectName: "example",
      operation: "rollback",
      status: "recovered",
    });

    expect((await store.list("example")).map((record) => record.status)).toEqual([
      "recovered",
      "failed",
    ]);
  });
});
