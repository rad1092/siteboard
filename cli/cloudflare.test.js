import { describe, expect, it, vi } from "vitest";
import { CloudflareApiClient } from "./cloudflare-api.js";
import {
  CloudflarePagesService,
  RemoteOutcomeUnknownError,
  archiveRevision,
  validateProjectName,
} from "./cloudflare.js";

function projectBinding(overrides = {}) {
  return {
    provider: "cloudflare-pages",
    accountId: "account-1",
    projectName: "example",
    projectId: "",
    publicOrigin: "",
    existedWhenBound: false,
    boundAt: "2026-07-29T00:00:00.000Z",
    ...overrides,
  };
}

function deployment({
  id = "deployment-new",
  revision = "a".repeat(40),
  url = `https://${id}.example.pages.dev`,
  aliases = ["https://example.pages.dev"],
  createdOn = "2026-07-29T00:00:00.000Z",
} = {}) {
  return {
    id,
    project_id: "project-1",
    environment: "production",
    created_on: createdOn,
    latest_stage: { status: "success" },
    deployment_trigger: { metadata: { commit_hash: revision } },
    aliases,
    url,
  };
}

function project(canonicalDeployment = null) {
  return {
    id: "project-1",
    subdomain: "example.pages.dev",
    domains: [],
    canonical_deployment: canonicalDeployment,
  };
}

function sequenceApi(projects, overrides = {}) {
  let index = 0;
  return {
    getProject: vi.fn(async () => {
      const value = projects[Math.min(index, projects.length - 1)];
      index += 1;
      if (value === null) {
        throw Object.assign(new Error("not found"), { status: 404 });
      }
      if (value instanceof Error) throw value;
      return value;
    }),
    listProductionDeployments: vi.fn(async () => []),
    rollbackDeployment: vi.fn(async () => ({})),
    ...overrides,
  };
}

function runner({ deployError = null } = {}) {
  const calls = [];
  return {
    calls,
    async run(args, options = {}) {
      calls.push({ args, options });
      const command = args.join(" ");
      if (command === "whoami --json") {
        return {
          stdout: JSON.stringify({
            loggedIn: true,
            authType: "OAuth Token",
            accounts: [{ id: "account-1", name: "Primary" }],
          }),
          stderr: "",
        };
      }
      if (command === "auth token --json") {
        return {
          stdout: JSON.stringify({ type: "oauth", token: "private-token" }),
          stderr: "",
        };
      }
      if (args[0] === "pages" && args[1] === "project") {
        return { stdout: "", stderr: "" };
      }
      if (args[0] === "pages" && args[1] === "deploy") {
        if (deployError) throw deployError;
        return { stdout: "uploaded", stderr: "", exitCode: 0 };
      }
      throw new Error(`Unexpected command: ${command}`);
    },
  };
}

function service(apiClient, commandRunner = runner()) {
  return new CloudflarePagesService({
    runner: commandRunner,
    apiClient,
    wait: async () => undefined,
  });
}

describe("Cloudflare Pages service", () => {
  it("creates a project, resolves its ID, and accepts only the new API canonical production", async () => {
    const revision = "a".repeat(64);
    const canonical = deployment({ revision: revision.slice(0, 40) });
    const apiClient = sequenceApi([
      null,
      project(),
      project(canonical),
    ]);
    const commandRunner = runner();

    await expect(
      service(apiClient, commandRunner).publish({
        directory: "/tmp/site",
        binding: projectBinding(),
        revision,
      }),
    ).resolves.toMatchObject({
      projectId: "project-1",
      createdProject: true,
      deploymentId: "deployment-new",
      deploymentUrl: "https://deployment-new.example.pages.dev",
      revision,
      reconciled: true,
      target: {
        projectId: "project-1",
        currentDeploymentId: "deployment-new",
      },
    });
    expect(
      commandRunner.calls.some(({ args }) =>
        args.join(" ").includes("pages project create example"),
      ),
    ).toBe(true);
    const deployCall = commandRunner.calls.find(
      ({ args }) => args[0] === "pages" && args[1] === "deploy",
    );
    expect(deployCall.args).toEqual(
      expect.arrayContaining(["--commit-hash", "a".repeat(40)]),
    );
    expect(JSON.stringify(commandRunner.calls)).not.toContain("private-token");
  });

  it("requires a nonempty project ID for an existing binding", async () => {
    const commandRunner = runner();
    await expect(
      service(sequenceApi([project()]), commandRunner).publish({
        directory: "/tmp/site",
        binding: projectBinding({ existedWhenBound: true }),
        revision: "b".repeat(64),
      }),
    ).rejects.toThrow("다시 확인해 연결");
    expect(
      commandRunner.calls.some(
        ({ args }) => args[0] === "pages" && args[1] === "deploy",
      ),
    ).toBe(false);
  });

  it("reuses an explicitly bound project and never creates another one", async () => {
    const revision = "b".repeat(64);
    const old = deployment({
      id: "deployment-old",
      revision: "0".repeat(40),
    });
    const next = deployment({ revision: revision.slice(0, 40) });
    const commandRunner = runner();
    const result = await service(
      sequenceApi([project(old), project(next)]),
      commandRunner,
    ).publish({
      directory: "/tmp/site",
      binding: projectBinding({
        projectId: "project-1",
        existedWhenBound: true,
      }),
      revision,
    });

    expect(result.deploymentId).toBe("deployment-new");
    expect(
      commandRunner.calls.some(({ args }) =>
        args.join(" ").includes("pages project create"),
      ),
    ).toBe(false);
  });

  it("does not deploy until a newly created project's ID is confirmed", async () => {
    const commandRunner = runner();
    await expect(
      service(sequenceApi([null]), commandRunner).publish({
        directory: "/tmp/site",
        binding: projectBinding(),
        revision: "c".repeat(64),
      }),
    ).rejects.toBeInstanceOf(RemoteOutcomeUnknownError);
    expect(
      commandRunner.calls.some(
        ({ args }) => args[0] === "pages" && args[1] === "deploy",
      ),
    ).toBe(false);
  });

  it("waits for canonical production convergence instead of trusting command output", async () => {
    const revision = "d".repeat(64);
    const old = deployment({
      id: "deployment-old",
      revision: "0".repeat(40),
    });
    const next = deployment({ revision: revision.slice(0, 40) });
    await expect(
      service(sequenceApi([project(old), project(old), project(next)])).publish({
        directory: "/tmp/site",
        binding: projectBinding({
          projectId: "project-1",
          existedWhenBound: true,
        }),
        revision,
      }),
    ).resolves.toMatchObject({
      deploymentId: "deployment-new",
      reconciled: true,
    });
  });

  it("does not accept the previous canonical deployment with the same revision", async () => {
    const revision = "e".repeat(64);
    const previous = deployment({
      id: "deployment-old",
      revision: revision.slice(0, 40),
    });
    await expect(
      service(sequenceApi([project(previous)])).publish({
        directory: "/tmp/site",
        binding: projectBinding({
          projectId: "project-1",
          existedWhenBound: true,
        }),
        revision,
      }),
    ).rejects.toBeInstanceOf(RemoteOutcomeUnknownError);
  });

  it("does not accept canonical convergence after the bound custom origin is removed", async () => {
    const revision = "9".repeat(64);
    const old = deployment({
      id: "deployment-old",
      revision: "0".repeat(40),
    });
    const next = deployment({ revision: revision.slice(0, 40) });
    const before = {
      ...project(old),
      domains: ["www.example.com"],
    };
    const after = project(next);
    await expect(
      service(sequenceApi([before, after])).publish({
        directory: "/tmp/site",
        binding: projectBinding({
          projectId: "project-1",
          publicOrigin: "https://www.example.com",
          existedWhenBound: true,
        }),
        revision,
      }),
    ).rejects.toBeInstanceOf(RemoteOutcomeUnknownError);
  });

  it("records a nonzero deploy result as unknown when canonical production cannot prove the outcome", async () => {
    const previous = deployment({
      id: "deployment-old",
      revision: "0".repeat(40),
    });
    await expect(
      service(
        sequenceApi([project(previous)]),
        runner({ deployError: new Error("wrangler exited 1") }),
      ).publish({
        directory: "/tmp/site",
        binding: projectBinding({
          projectId: "project-1",
          existedWhenBound: true,
        }),
        revision: "f".repeat(64),
      }),
    ).rejects.toBeInstanceOf(RemoteOutcomeUnknownError);
  });

  it("confirms the same bound canonical deployment after live verification", async () => {
    const revision = "8".repeat(64);
    const canonical = deployment({
      revision: revision.slice(0, 40),
    });
    await expect(
      service(sequenceApi([project(canonical)])).confirmCanonical({
        binding: projectBinding({
          projectId: "project-1",
          existedWhenBound: true,
        }),
        deploymentId: "deployment-new",
        revision,
      }),
    ).resolves.toMatchObject({
      projectId: "project-1",
      currentDeploymentId: "deployment-new",
    });
  });

  it("requires a custom origin to belong to the explicitly selected project", async () => {
    const apiClient = sequenceApi([
      {
        ...project(deployment()),
        domains: ["www.example.com"],
      },
    ]);
    const pages = service(apiClient);
    await expect(
      pages.inspectTarget({
        projectName: "example",
        publicOrigin: "https://wrong.example",
      }),
    ).rejects.toThrow("연결되어 있지 않습니다");
    await expect(
      pages.inspectTarget({
        projectName: "example",
        publicOrigin: "https://www.example.com",
      }),
    ).resolves.toMatchObject({
      exists: true,
      projectId: "project-1",
      publicOrigin: "https://www.example.com",
    });
  });

  it("lists immutable production deployment URLs in a stable UI shape", async () => {
    const old = deployment({
      id: "deployment-old",
      revision: "b".repeat(40),
      url: "https://deployment-old.example.pages.dev",
      createdOn: "2026-07-28T00:00:00.000Z",
    });
    const next = deployment({
      id: "deployment-new",
      revision: "a".repeat(40),
      url: "https://deployment-new.example.pages.dev",
      aliases: ["https://mutable.example.pages.dev"],
    });
    const apiClient = sequenceApi([project(old)], {
      listProductionDeployments: vi.fn(async () => [next, old]),
    });
    await expect(service(apiClient).listDeployments("example")).resolves.toEqual([
      expect.objectContaining({
        deploymentId: "deployment-new",
        url: "https://deployment-new.example.pages.dev",
        current: false,
      }),
      expect.objectContaining({
        deploymentId: "deployment-old",
        current: true,
      }),
    ]);
  });

  it("refuses rollback before mutation when the immutable marker is not verified", async () => {
    const current = deployment({
      id: "deployment-current",
      revision: "c".repeat(40),
    });
    const old = deployment({
      id: "deployment-old",
      revision: "d".repeat(40),
    });
    const apiClient = sequenceApi([project(current)], {
      listProductionDeployments: vi.fn(async () => [old]),
      rollbackDeployment: vi.fn(async () => old),
    });
    await expect(
      service(apiClient).rollback({
        binding: projectBinding({
          projectId: "project-1",
          existedWhenBound: true,
        }),
        deploymentId: "deployment-old",
        verifyTarget: vi.fn(async () => ({ ok: false })),
      }),
    ).rejects.toThrow("고정 배포 주소");
    expect(apiClient.rollbackDeployment).not.toHaveBeenCalled();
  });

  it("rolls back only after immutable marker verification and canonical reconciliation", async () => {
    const current = deployment({
      id: "deployment-current",
      revision: "c".repeat(40),
    });
    const oldCommit = "d".repeat(40);
    const oldRevision = `${oldCommit}${"e".repeat(24)}`;
    const old = deployment({
      id: "deployment-old",
      revision: oldCommit,
    });
    const apiClient = sequenceApi(
      [project(current), project(current), project(old)],
      {
        listProductionDeployments: vi.fn(async () => [old]),
        rollbackDeployment: vi.fn(async () => old),
      },
    );
    const verifyTarget = vi.fn(async () => ({
      ok: true,
      revision: oldRevision,
    }));

    await expect(
      service(apiClient).rollback({
        binding: projectBinding({
          projectId: "project-1",
          existedWhenBound: true,
        }),
        deploymentId: "deployment-old",
        verifyTarget,
      }),
    ).resolves.toMatchObject({
      deploymentId: "deployment-old",
      revision: oldRevision,
      target: { currentDeploymentId: "deployment-old" },
    });
    expect(verifyTarget).toHaveBeenCalledWith({
      deploymentUrl: "https://deployment-old.example.pages.dev",
      commitHash: oldCommit,
    });
    expect(apiClient.rollbackDeployment).toHaveBeenCalledOnce();
  });

  it("reports rollback as unknown when mutation starts but canonical cannot prove the result", async () => {
    const current = deployment({
      id: "deployment-current",
      revision: "1".repeat(40),
    });
    const oldCommit = "2".repeat(40);
    const old = deployment({
      id: "deployment-old",
      revision: oldCommit,
    });
    const apiClient = sequenceApi([project(current)], {
      listProductionDeployments: vi.fn(async () => [old]),
      rollbackDeployment: vi.fn(async () => {
        throw new Error("connection reset");
      }),
    });

    await expect(
      service(apiClient).rollback({
        binding: projectBinding({
          projectId: "project-1",
          existedWhenBound: true,
        }),
        deploymentId: "deployment-old",
        verifyTarget: vi.fn(async () => ({
          ok: true,
          revision: `${oldCommit}${"3".repeat(24)}`,
        })),
      }),
    ).rejects.toBeInstanceOf(RemoteOutcomeUnknownError);
  });

  it("uses the official rollback endpoint without exposing credentials", async () => {
    const fetchImpl = vi.fn(async (_url, request) => {
      expect(request.headers.Authorization).toBe("Bearer private-token");
      return new Response(
        JSON.stringify({
          success: true,
          result: {
            id: "deployment-old",
            url: "https://old.example.pages.dev",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const client = new CloudflareApiClient({ fetchImpl });
    await expect(
      client.rollbackDeployment({
        accountId: "account-1",
        projectName: "example",
        deploymentId: "deployment-old",
        credentials: { type: "api_token", token: "private-token" },
      }),
    ).resolves.toMatchObject({ id: "deployment-old" });
    expect(fetchImpl.mock.calls[0][0]).toContain(
      "/accounts/account-1/pages/projects/example/deployments/deployment-old/rollback",
    );
  });

  it("validates project names and derives immutable archive revisions", () => {
    expect(validateProjectName("my-business-site")).toBe("my-business-site");
    expect(() => validateProjectName("../escape")).toThrow();
    expect(archiveRevision(Buffer.from("same"))).toHaveLength(64);
    expect(archiveRevision(Buffer.from("same"))).toBe(
      archiveRevision(Buffer.from("same")),
    );
  });
});
