import { describe, expect, it, vi } from "vitest";
import {
  bytesToBase64,
  detectCompanion,
  publishWithCompanion,
  type CompanionStatus,
} from "./deployment";

const status: CompanionStatus = {
  available: true,
  version: 1,
  csrfToken: "csrf-only",
  cloudflare: {
    authenticated: true,
    authType: "OAuth Token",
    accounts: [{ id: "account-1", name: "Primary" }],
    selectedAccountId: "account-1",
  },
  capabilities: {
    publish: true,
    binding: true,
    history: true,
    rollback: true,
    liveVerify: true,
  },
};

describe("browser companion client", () => {
  it("does not probe localhost from the hosted PWA", async () => {
    const fetchImpl = vi.fn();
    const hosted = {
      protocol: "https:",
      hostname: "siteboard.whago.net",
    } as Location;

    await expect(detectCompanion(hosted, fetchImpl)).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends only the deployment archive and CSRF token, never Cloudflare credentials", async () => {
    const fetchImpl = vi.fn(async (_input, init) => {
      expect(init?.headers).toMatchObject({
        "X-Siteboard-CSRF": "csrf-only",
      });
      const body = String(init?.body);
      expect(body).toContain(bytesToBase64(new Uint8Array([1, 2, 3])));
      expect(body).not.toMatch(/OAuth|Cloudflare.*token|Bearer|secret/i);
      return new Response(
        JSON.stringify({
          record: { status: "live" },
          deployment: {},
          verification: { ok: true },
          history: [],
          deployments: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    await publishWithCompanion(
      status,
      {
        binding: {
          provider: "cloudflare-pages",
          accountId: "account-1",
          projectName: "example",
          projectId: "project-1",
          publicOrigin: "https://www.example.com",
          existedWhenBound: true,
          boundAt: "2026-07-29T00:00:00.000Z",
        },
        documentName: "Example",
        publicUrl: "https://www.example.com",
        archive: new Uint8Array([1, 2, 3]),
      },
      fetchImpl,
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(String(fetchImpl.mock.calls[0]?.[1]?.body)).toContain(
      "https://www.example.com",
    );
  });
});
