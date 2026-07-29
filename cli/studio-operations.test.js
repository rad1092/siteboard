import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeploymentHistoryStore } from "./history-store.js";
import { StudioOperations } from "./studio-operations.js";

const directories = [];

async function harness(cloudflare, verify) {
  const directory = await mkdtemp(join(tmpdir(), "siteboard-ops-test-"));
  directories.push(directory);
  const history = new DeploymentHistoryStore({ directory });
  return {
    history,
    operations: new StudioOperations({ cloudflare, history, verify }),
  };
}

function validArchive() {
  return Buffer.from(
    zipSync({ "index.html": strToU8("<h1>Published</h1>") }),
  ).toString("base64");
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("Studio publish and recovery loop", () => {
  it("publishes, verifies, records a revision, and returns deployment history", async () => {
    const cloudflare = {
      publish: vi.fn(async () => ({
        deploymentId: "deployment-new",
        deploymentUrl: "https://hash.example.pages.dev",
        productionUrl: "https://example.pages.dev",
        createdProject: false,
      })),
      listDeployments: vi.fn(async () => [
        { deploymentId: "deployment-new", current: true },
      ]),
      authStatus: vi.fn(),
    };
    const verify = vi.fn(async (url) => ({
      ok: true,
      checkedAt: "2026-07-29T00:00:00.000Z",
      status: 200,
      url,
    }));
    const { operations } = await harness(cloudflare, verify);

    const result = await operations.publish({
      projectName: "example",
      documentName: "Example",
      publicUrl: "https://www.example.com",
      archiveBase64: validArchive(),
    });

    expect(result.record.status).toBe("live");
    expect(result.record.revision).toHaveLength(64);
    expect(result.record.productionUrl).toBe("https://www.example.com");
    expect(verify).toHaveBeenCalledWith("https://www.example.com");
    expect(result.history).toHaveLength(1);
    expect(result.deployments[0]).toMatchObject({ current: true });
  });

  it("records a deployment failure separately", async () => {
    const cloudflare = {
      publish: vi.fn(async () => {
        throw new Error("upload failed");
      }),
      listDeployments: vi.fn(async () => []),
      authStatus: vi.fn(),
    };
    const { operations, history } = await harness(
      cloudflare,
      vi.fn(),
    );

    await expect(
      operations.publish({
        projectName: "example",
        documentName: "Example",
        archiveBase64: validArchive(),
      }),
    ).rejects.toThrow("upload failed");
    expect((await history.list("example"))[0].status).toBe("failed");
  });

  it("rolls production back and records the verified recovery", async () => {
    const cloudflare = {
      rollback: vi.fn(async () => ({
        deploymentId: "deployment-old",
        deploymentUrl: "https://old.example.pages.dev",
        productionUrl: "https://example.pages.dev",
      })),
      listDeployments: vi.fn(async () => []),
      authStatus: vi.fn(),
    };
    const { operations } = await harness(cloudflare, async (url) => ({
      ok: true,
      checkedAt: "2026-07-29T00:00:00.000Z",
      status: 200,
      url,
    }));
    const result = await operations.rollback({
      projectName: "example",
      deploymentId: "deployment-old",
      publicUrl: "https://www.example.com",
    });

    expect(result.record.status).toBe("recovered");
    expect(result.record.operation).toBe("rollback");
    expect(result.verification.url).toBe("https://www.example.com");
  });

  it("does not relabel a successful upload as failed when live verification fails", async () => {
    const cloudflare = {
      publish: vi.fn(async () => ({
        deploymentId: "deployment-new",
        deploymentUrl: "https://hash.example.pages.dev",
        productionUrl: "https://example.pages.dev",
      })),
      listDeployments: vi.fn(async () => []),
      authStatus: vi.fn(),
    };
    const { operations } = await harness(cloudflare, async () => {
      throw new Error("DNS not ready");
    });
    const result = await operations.publish({
      projectName: "example",
      documentName: "Example",
      archiveBase64: validArchive(),
    });

    expect(result.record.status).toBe("verification-failed");
    expect(result.verification.ok).toBe(false);
  });

  it("reports a completed remote deployment when local history cannot be written", async () => {
    const cloudflare = {
      publish: vi.fn(async () => ({
        deploymentId: "deployment-new",
        deploymentUrl: "https://hash.example.pages.dev",
        productionUrl: "https://example.pages.dev",
      })),
      listDeployments: vi.fn(async () => []),
      authStatus: vi.fn(),
    };
    const history = {
      append: vi.fn(async () => {
        throw new Error("disk is read-only");
      }),
      list: vi.fn(async () => []),
    };
    const operations = new StudioOperations({
      cloudflare,
      history,
      verify: vi.fn(async (url) => ({
        ok: true,
        checkedAt: "2026-07-29T00:00:00.000Z",
        status: 200,
        url,
      })),
    });

    const result = await operations.publish({
      projectName: "example",
      documentName: "Example",
      publicUrl: "https://www.example.com",
      archiveBase64: validArchive(),
    });

    expect(result.record.status).toBe("deployed-history-error");
    expect(result.record.deploymentId).toBe("deployment-new");
    expect(result.warning).toContain("로컬 이력을 기록하지 못했습니다");
    expect(result.deployment.deploymentId).toBe("deployment-new");
    expect(result.history).toEqual([]);
  });

  it("reports a completed rollback when local history cannot be written", async () => {
    const cloudflare = {
      rollback: vi.fn(async () => ({
        deploymentId: "deployment-old",
        deploymentUrl: "https://old.example.pages.dev",
        productionUrl: "https://example.pages.dev",
      })),
      listDeployments: vi.fn(async () => []),
      authStatus: vi.fn(),
    };
    const history = {
      append: vi.fn(async () => {
        throw new Error("disk is read-only");
      }),
      list: vi.fn(async () => []),
    };
    const operations = new StudioOperations({
      cloudflare,
      history,
      verify: vi.fn(async (url) => ({
        ok: true,
        checkedAt: "2026-07-29T00:00:00.000Z",
        status: 200,
        url,
      })),
    });

    const result = await operations.rollback({
      projectName: "example",
      deploymentId: "deployment-old",
      publicUrl: "https://www.example.com",
    });

    expect(result.record.status).toBe("recovered-history-error");
    expect(result.record.deploymentId).toBe("deployment-old");
    expect(result.warning).toContain("로컬 이력을 기록하지 못했습니다");
    expect(result.deployment.deploymentId).toBe("deployment-old");
  });
});
