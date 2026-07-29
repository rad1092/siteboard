import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoteOutcomeUnknownError } from "./cloudflare.js";
import { DeploymentHistoryStore } from "./history-store.js";
import { StudioOperations } from "./studio-operations.js";

const directories = [];

function binding(publicOrigin = "https://www.example.com") {
  return {
    provider: "cloudflare-pages",
    accountId: "account-1",
    projectName: "example",
    projectId: "project-1",
    publicOrigin,
    existedWhenBound: true,
    boundAt: "2026-07-29T00:00:00.000Z",
  };
}

function target(deploymentId = "deployment-new", publicOrigin = "") {
  return {
    accountId: "account-1",
    projectName: "example",
    projectId: "project-1",
    exists: true,
    publicOrigin,
    origins: [
      "https://example.pages.dev",
      ...(publicOrigin ? [publicOrigin] : []),
    ],
    pagesOrigin: "https://example.pages.dev",
    currentDeploymentId: deploymentId,
    currentUrl: "https://example.pages.dev",
    currentRevision: "a".repeat(40),
  };
}

function publishResult(revision, publicOrigin = "") {
  return {
    deploymentId: "deployment-new",
    deploymentUrl: "https://hash.example.pages.dev",
    productionUrl: "https://example.pages.dev",
    createdProject: false,
    revision,
    target: target("deployment-new", publicOrigin),
  };
}

function rollbackResult(revision) {
  return {
    deploymentId: "deployment-old",
    deploymentUrl: "https://old.example.pages.dev",
    productionUrl: "https://example.pages.dev",
    createdProject: false,
    revision,
    target: target("deployment-old", "https://www.example.com"),
  };
}

function successfulVerification(url, revision) {
  return {
    ok: true,
    checkedAt: "2026-07-29T00:00:00.000Z",
    status: 200,
    url,
    revision,
  };
}

async function harness(
  cloudflare,
  verify = vi.fn(async (url, { expectedRevision }) =>
    successfulVerification(url, expectedRevision),
  ),
  verifyImmutable = vi.fn(
    async (url, { expectedCommitHash }) =>
      successfulVerification(
        url,
        `${expectedCommitHash}${"f".repeat(24)}`,
      ),
  ),
) {
  const directory = await mkdtemp(
    join(tmpdir(), "siteboard-ops-test-"),
  );
  directories.push(directory);
  const history = new DeploymentHistoryStore({ directory });
  cloudflare.confirmCanonical ??= vi.fn(
    async ({ deploymentId, binding: connected }) =>
      target(deploymentId, connected.publicOrigin),
  );
  cloudflare.listDeployments ??= vi.fn(async () => []);
  return {
    history,
    operations: new StudioOperations({
      cloudflare,
      history,
      verify,
      verifyImmutable,
    }),
    verify,
    verifyImmutable,
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
  it("records live only after API canonical, one exact live check, and final canonical confirmation", async () => {
    const cloudflare = {
      publish: vi.fn(async ({ directory, revision, binding: connected }) => {
        expect(connected.projectName).toBe("example");
        expect(
          JSON.parse(
            await readFile(
              join(directory, "siteboard-revision.json"),
              "utf8",
            ),
          ),
        ).toEqual({ schemaVersion: 1, revision });
        return publishResult(revision, connected.publicOrigin);
      }),
      listDeployments: vi.fn(async () => [
        { deploymentId: "deployment-new", current: true },
      ]),
    };
    const { operations, verify } = await harness(cloudflare);

    const result = await operations.publish({
      binding: binding(),
      documentName: "Example",
      publicUrl: "https://www.example.com/",
      archiveBase64: validArchive(),
    });

    expect(result.record.status).toBe("live");
    expect(result.record.revision).toHaveLength(64);
    expect(result.record.productionUrl).toBe("https://www.example.com");
    expect(verify).toHaveBeenCalledOnce();
    expect(verify).toHaveBeenCalledWith(
      "https://www.example.com",
      expect.objectContaining({ expectedRevision: result.record.revision }),
    );
    expect(cloudflare.confirmCanonical).toHaveBeenCalledWith(
      expect.objectContaining({
        deploymentId: "deployment-new",
        revision: result.record.revision,
      }),
    );
    expect(result.history).toHaveLength(1);
  });

  it("does not record live if canonical production changes during public verification", async () => {
    const cloudflare = {
      publish: vi.fn(async ({ revision }) => publishResult(revision)),
      confirmCanonical: vi.fn(async () => null),
    };
    const { operations } = await harness(cloudflare);
    const result = await operations.publish({
      binding: binding(""),
      documentName: "Example",
      archiveBase64: validArchive(),
    });

    expect(result.record.status).toBe("verification-failed");
    expect(result.verification.ok).toBe(false);
    expect(result.verification.message).toContain("다른 배포");
  });

  it("keeps definite local/preflight failure separate from unknown remote outcome", async () => {
    const failedCloudflare = {
      publish: vi.fn(async () => {
        throw new Error("upload preflight failed");
      }),
    };
    const failed = await harness(failedCloudflare, vi.fn());
    await expect(
      failed.operations.publish({
        binding: binding(""),
        documentName: "Example",
        archiveBase64: validArchive(),
      }),
    ).rejects.toThrow("upload preflight failed");
    expect((await failed.history.list("example"))[0].status).toBe(
      "failed",
    );

    const unknownCloudflare = {
      publish: vi.fn(async () => {
        throw new RemoteOutcomeUnknownError("remote outcome unknown");
      }),
    };
    const unknown = await harness(unknownCloudflare, vi.fn());
    await expect(
      unknown.operations.publish({
        binding: binding(""),
        documentName: "Example",
        archiveBase64: validArchive(),
      }),
    ).rejects.toThrow("remote outcome unknown");
    expect((await unknown.history.list("example"))[0].status).toBe(
      "outcome-unknown",
    );
  });

  it("does not relabel an API-confirmed upload as failed when live verification fails", async () => {
    const cloudflare = {
      publish: vi.fn(async ({ revision }) => publishResult(revision)),
      confirmCanonical: vi.fn(),
    };
    const { operations } = await harness(cloudflare, async () => {
      throw new Error("DNS not ready");
    });
    const result = await operations.publish({
      binding: binding(""),
      documentName: "Example",
      archiveBase64: validArchive(),
    });

    expect(result.record.status).toBe("verification-failed");
    expect(result.verification.ok).toBe(false);
    expect(cloudflare.confirmCanonical).not.toHaveBeenCalled();
  });

  it("verifies the immutable rollback target before mutation and records the full recovered revision", async () => {
    const commitHash = "d".repeat(40);
    const revision = `${commitHash}${"f".repeat(24)}`;
    const cloudflare = {
      rollback: vi.fn(async ({ verifyTarget }) => {
        const preflight = await verifyTarget({
          deploymentUrl: "https://old.example.pages.dev",
          commitHash,
        });
        expect(preflight.revision).toBe(revision);
        return rollbackResult(preflight.revision);
      }),
    };
    const { operations, verifyImmutable, verify } =
      await harness(cloudflare);
    const result = await operations.rollback({
      binding: binding(),
      deploymentId: "deployment-old",
      publicUrl: "https://www.example.com",
    });

    expect(verifyImmutable).toHaveBeenCalledBefore(
      cloudflare.confirmCanonical,
    );
    expect(verify).toHaveBeenCalledWith(
      "https://www.example.com",
      { expectedRevision: revision },
    );
    expect(result.record.status).toBe("recovered");
    expect(result.record.operation).toBe("rollback");
    expect(result.record.revision).toBe(revision);
  });

  it("refuses to verify rollback against an origin outside the saved binding", async () => {
    const cloudflare = {
      rollback: vi.fn(),
    };
    const { operations } = await harness(cloudflare);

    await expect(
      operations.rollback({
        binding: binding(),
        deploymentId: "deployment-old",
        publicUrl: "https://attacker.example",
      }),
    ).rejects.toThrow("Cloudflare 연결과 다릅니다");
    expect(cloudflare.rollback).not.toHaveBeenCalled();
  });

  it("reports a completed remote deployment when local history cannot be written", async () => {
    const cloudflare = {
      publish: vi.fn(async ({ revision }) =>
        publishResult(revision, "https://www.example.com"),
      ),
      confirmCanonical: vi.fn(async () =>
        target("deployment-new", "https://www.example.com"),
      ),
      listDeployments: vi.fn(async () => []),
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
      verify: vi.fn(async (url, { expectedRevision }) =>
        successfulVerification(url, expectedRevision),
      ),
    });

    const result = await operations.publish({
      binding: binding(),
      documentName: "Example",
      publicUrl: "https://www.example.com",
      archiveBase64: validArchive(),
    });

    expect(result.record.status).toBe("deployed-history-error");
    expect(result.warning).toContain("로컬 이력을 기록하지 못했습니다");
    expect(result.deployment.deploymentId).toBe("deployment-new");
    expect(result.history).toEqual([]);
  });

  it("reports a completed rollback when local history cannot be written", async () => {
    const commitHash = "e".repeat(40);
    const revision = `${commitHash}${"f".repeat(24)}`;
    const cloudflare = {
      rollback: vi.fn(async ({ verifyTarget }) => {
        const preflight = await verifyTarget({
          deploymentUrl: "https://old.example.pages.dev",
          commitHash,
        });
        return rollbackResult(preflight.revision);
      }),
      confirmCanonical: vi.fn(async () =>
        target("deployment-old", "https://www.example.com"),
      ),
      listDeployments: vi.fn(async () => []),
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
      verify: vi.fn(async (url, { expectedRevision }) =>
        successfulVerification(url, expectedRevision),
      ),
      verifyImmutable: vi.fn(async (url) =>
        successfulVerification(url, revision),
      ),
    });

    const result = await operations.rollback({
      binding: binding(),
      deploymentId: "deployment-old",
      publicUrl: "https://www.example.com",
    });

    expect(result.record.status).toBe("recovered-history-error");
    expect(result.record.revision).toBe(revision);
    expect(result.warning).toContain("로컬 이력을 기록하지 못했습니다");
  });
});
