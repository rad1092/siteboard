import { writeFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { CloudflareApiClient } from "./cloudflare-api.js";
import {
  CloudflarePagesService,
  archiveRevision,
  validateProjectName,
} from "./cloudflare.js";

function successfulRunner() {
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
      if (command === "pages project list --json") {
        return { stdout: "[]", stderr: "" };
      }
      if (args[0] === "pages" && args[1] === "project") {
        return { stdout: "", stderr: "" };
      }
      if (args[0] === "pages" && args[1] === "deploy") {
        await writeFile(
          options.env.WRANGLER_OUTPUT_FILE_PATH,
          [
            JSON.stringify({
              type: "pages-deploy",
              deployment_id: "deployment-123",
              url: "https://hash.example.pages.dev",
            }),
            JSON.stringify({
              type: "pages-deploy-detailed",
              deployment_id: "deployment-123",
              url: "https://hash.example.pages.dev",
              alias: "https://example.pages.dev",
              environment: "production",
            }),
          ].join("\n"),
        );
        return { stdout: "deployed", stderr: "" };
      }
      if (command.includes("pages deployment list")) {
        return {
          stdout: JSON.stringify([
            {
              Id: "deployment-123",
              Environment: "Production",
              Source: "abc1234",
              Deployment: "https://example.pages.dev",
              Status: "1 minute ago",
              Build: "https://dash.cloudflare.com/build",
            },
          ]),
          stderr: "",
        };
      }
      if (command === "auth token --json") {
        return {
          stdout: JSON.stringify({
            type: "oauth",
            token: "secret-that-must-never-be-logged",
          }),
          stderr: "",
        };
      }
      throw new Error(`Unexpected command: ${command}`);
    },
  };
}

describe("Cloudflare Pages service", () => {
  it("creates a missing Direct Upload project and parses structured deploy output", async () => {
    const runner = successfulRunner();
    const service = new CloudflarePagesService({ runner });
    const result = await service.publish({
      directory: "/tmp/site",
      projectName: "example",
      revision: "a".repeat(64),
    });

    expect(result).toMatchObject({
      createdProject: true,
      deploymentId: "deployment-123",
      deploymentUrl: "https://hash.example.pages.dev",
      productionUrl: "https://example.pages.dev",
    });
    expect(
      runner.calls.some(({ args }) =>
        args.join(" ").includes("pages project create example"),
      ),
    ).toBe(true);
    const deployCall = runner.calls.find(
      ({ args }) => args[0] === "pages" && args[1] === "deploy",
    );
    expect(deployCall.args).toEqual(
      expect.arrayContaining([
        "--project-name",
        "example",
        "--branch",
        "main",
        "--commit-hash",
        "a".repeat(40),
      ]),
    );
    expect(JSON.stringify(runner.calls)).not.toContain(
      "secret-that-must-never-be-logged",
    );
  });

  it("lists production deployments in a stable UI shape", async () => {
    const apiClient = {
      getProject: vi.fn(async () => ({
        canonical_deployment: {
          id: "deployment-old",
          environment: "production",
          created_on: "2026-07-28T00:00:00.000Z",
          latest_stage: { status: "success" },
          deployment_trigger: {
            metadata: { commit_hash: "b".repeat(40) },
          },
          aliases: ["https://example.pages.dev"],
          url: "https://old.example.pages.dev",
        },
      })),
      listProductionDeployments: vi.fn(async () => [
        {
          id: "deployment-new",
          environment: "production",
          created_on: "2026-07-29T00:00:00.000Z",
          latest_stage: { status: "success" },
          deployment_trigger: {
            metadata: { commit_hash: "a".repeat(40) },
          },
          url: "https://new.example.pages.dev",
        },
        {
          id: "deployment-old",
          environment: "production",
          created_on: "2026-07-28T00:00:00.000Z",
          latest_stage: { status: "success" },
          url: "https://old.example.pages.dev",
        },
        {
          id: "deployment-failed",
          environment: "production",
          created_on: "2026-07-30T00:00:00.000Z",
          latest_stage: { status: "failure" },
          url: "https://failed.example.pages.dev",
        },
      ]),
    };
    const service = new CloudflarePagesService({
      runner: successfulRunner(),
      apiClient,
    });
    await expect(service.listDeployments("example")).resolves.toEqual([
      expect.objectContaining({
        deploymentId: "deployment-new",
        current: false,
        rollbackable: true,
        source: "aaaaaaaaaaaa",
      }),
      expect.objectContaining({
        deploymentId: "deployment-old",
        current: true,
        rollbackable: false,
        source: "bbbbbbbbbbbb",
      }),
    ]);
    expect(apiClient.getProject).toHaveBeenCalledOnce();
    expect(apiClient.listProductionDeployments).toHaveBeenCalledOnce();
  });

  it("reuses an existing project from Wrangler's JSON column names", async () => {
    const runner = successfulRunner();
    const originalRun = runner.run.bind(runner);
    runner.run = async (args, options) => {
      if (args.join(" ") === "pages project list --json") {
        runner.calls.push({ args, options });
        return {
          stdout: JSON.stringify([{ "Project Name": "example" }]),
          stderr: "",
        };
      }
      return originalRun(args, options);
    };
    const service = new CloudflarePagesService({ runner });
    await service.publish({
      directory: "/tmp/site",
      projectName: "example",
      revision: "b".repeat(64),
    });
    expect(
      runner.calls.some(({ args }) =>
        args.join(" ").includes("pages project create"),
      ),
    ).toBe(false);
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
