import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStudioServer } from "./server.js";

const servers = [];
const directories = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function startServer(startupProject = null) {
  const directory = await mkdtemp(join(tmpdir(), "siteboard-server-test-"));
  directories.push(directory);
  await writeFile(join(directory, "index.html"), "<h1>Studio</h1>");
  const operations = {
    status: vi.fn(async () => ({
      authenticated: true,
      authType: "OAuth Token",
      accounts: [{ id: "account-1", name: "Primary" }],
      selectedAccountId: "account-1",
    })),
    publish: vi.fn(async () => ({ record: { status: "live" } })),
    rollback: vi.fn(async () => ({ record: { status: "recovered" } })),
    deploymentState: vi.fn(async () => ({
      history: [],
      deployments: [],
    })),
    inspectTarget: vi.fn(async ({ projectName, publicOrigin }) => ({
      projectName,
      publicOrigin,
      exists: false,
    })),
  };
  const studio = createStudioServer({
    staticDirectory: directory,
    operations,
    csrfToken: "csrf-for-test",
    startupProject,
  });
  servers.push(studio);
  const address = await studio.listen(0);
  return { studio, operations, origin: address.origin };
}

describe("localhost companion server security", () => {
  it("serves the Studio shell with restrictive security headers", async () => {
    const { origin } = await startServer();
    const response = await fetch(origin);
    expect(await response.text()).toContain("Studio");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("content-security-policy")).toContain(
      "connect-src 'self'",
    );
  });

  it("requires exact Origin, JSON, and CSRF for mutations", async () => {
    const { origin, operations } = await startServer();
    const rejected = await fetch(`${origin}/api/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(rejected.status).toBe(403);
    expect(operations.publish).not.toHaveBeenCalled();

    const accepted = await fetch(`${origin}/api/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        "X-Siteboard-CSRF": "csrf-for-test",
        "Sec-Fetch-Site": "same-origin",
      },
      body: JSON.stringify({ projectName: "example" }),
    });
    expect(accepted.status).toBe(200);
    expect(operations.publish).toHaveBeenCalledOnce();
  });

  it("rejects cross-site API reads and DNS rebinding Host headers", async () => {
    const { origin } = await startServer();
    const crossSite = await fetch(`${origin}/api/companion/status`, {
      headers: { "Sec-Fetch-Site": "cross-site" },
    });
    expect(crossSite.status).toBe(403);

    const reboundStatus = await new Promise((resolve, reject) => {
      const url = new URL(`${origin}/api/companion/status`);
      const request = httpRequest(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          headers: { Host: "attacker.example" },
        },
        (response) => {
          response.resume();
          response.on("end", () => resolve(response.statusCode));
        },
      );
      request.on("error", reject);
      request.end();
    });
    expect(reboundStatus).toBe(421);
  });

  it("never returns Cloudflare credentials to the browser", async () => {
    const { origin } = await startServer();
    const response = await fetch(`${origin}/api/companion/status`);
    const text = await response.text();
    expect(text).toContain('"csrfToken":"csrf-for-test"');
    expect(text).not.toMatch(/api[_-]?token|Bearer|secret/i);
  });

  it("serves an explicitly supplied startup project once without exposing its path", async () => {
    const { origin } = await startServer({
      fileName: "corner.siteboard.json",
      content: '{"fileType":"siteboard-project"}',
    });
    const status = await (await fetch(`${origin}/api/companion/status`)).json();
    expect(status.startupFile).toBe("corner.siteboard.json");
    const startup = await (
      await fetch(`${origin}/api/startup-project`)
    ).json();
    expect(startup).toEqual({
      fileName: "corner.siteboard.json",
      content: '{"fileType":"siteboard-project"}',
    });
    expect(JSON.stringify(status)).not.toContain("/");
    expect(
      (await fetch(`${origin}/api/startup-project`)).status,
    ).toBe(404);
    const consumedStatus = await (
      await fetch(`${origin}/api/companion/status`)
    ).json();
    expect(consumedStatus.startupFile).toBe("");
  });
});
