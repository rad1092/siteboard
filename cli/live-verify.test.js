import { describe, expect, it, vi } from "vitest";
import {
  assertPublicHttpsUrl,
  isPrivateAddress,
  verifyImmutableDeployment,
  verifyLiveUrl,
} from "./live-verify.js";

const publicLookup = async () => [
  { address: "93.184.216.34", family: 4 },
];

function markerResponse(revision) {
  return new Response(
    JSON.stringify({ schemaVersion: 1, revision }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

describe("live deployment verification", () => {
  it("requires a root HTTPS origin", async () => {
    await expect(
      assertPublicHttpsUrl("https://example.com/path", {
        lookupImpl: publicLookup,
      }),
    ).rejects.toThrow("경로가 없는");
    await expect(
      assertPublicHttpsUrl("http://example.com", {
        lookupImpl: publicLookup,
      }),
    ).rejects.toThrow();
  });

  it("blocks private, mapped, documentation, benchmark, and multicast addresses", () => {
    for (const address of [
      "127.0.0.1",
      "100.64.0.1",
      "192.0.2.1",
      "192.31.196.1",
      "198.18.0.1",
      "198.51.100.1",
      "203.0.113.1",
      "::ffff:127.0.0.1",
      "0:0:0:0:0:ffff:7f00:1",
      "0:0:0:0:0:0:0:1",
      "2001:0db8::1",
      "64:ff9b:1::7f00:1",
      "ff02::1",
    ]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
    expect(isPrivateAddress("93.184.216.34")).toBe(false);
    expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false);
  });

  it("does not accept an unrelated site that merely returns HTTP 200", async () => {
    const fetchImpl = vi.fn(async (url) =>
      String(url).endsWith("siteboard-revision.json")
        ? markerResponse("a".repeat(63) + "b")
        : new Response("<h1>Some other site</h1>", { status: 200 }),
    );
    const result = await verifyLiveUrl("https://example.com", {
      fetchImpl,
      lookupImpl: publicLookup,
      expectedRevision: "a".repeat(64),
      attempts: 1,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("리비전");
  });

  it("accepts only a schema-valid marker equal to the exact 64-hex revision", async () => {
    const revision = "b".repeat(64);
    const fetchImpl = vi.fn(async (url) =>
      String(url).endsWith("siteboard-revision.json")
        ? markerResponse(revision)
        : new Response("<h1>Published</h1>", { status: 200 }),
    );
    await expect(
      verifyLiveUrl("https://example.com", {
        fetchImpl,
        lookupImpl: publicLookup,
        expectedRevision: revision,
        attempts: 1,
      }),
    ).resolves.toMatchObject({ ok: true, revision });

    fetchImpl.mockImplementation(async (url) =>
      String(url).endsWith("siteboard-revision.json")
        ? markerResponse(`${revision}00`)
        : new Response("<h1>Published</h1>", { status: 200 }),
    );
    await expect(
      verifyLiveUrl("https://example.com", {
        fetchImpl,
        lookupImpl: publicLookup,
        expectedRevision: revision,
        attempts: 1,
      }),
    ).resolves.toMatchObject({ ok: false });
  });

  it("revalidates every redirect hop before making the next request", async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).endsWith("siteboard-revision.json")) {
        return new Response(null, {
          status: 302,
          headers: {
            Location: "https://[0:0:0:0:0:ffff:7f00:1]/marker.json",
          },
        });
      }
      return new Response("<h1>Published</h1>", { status: 200 });
    });
    const result = await verifyLiveUrl("https://example.com", {
      fetchImpl,
      lookupImpl: publicLookup,
      expectedRevision: "c".repeat(64),
      attempts: 1,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("예약된");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("requires the page and marker to finish on the same public origin", async () => {
    const revision = "d".repeat(64);
    const fetchImpl = vi.fn(async (url) => {
      const address = new URL(url);
      if (
        address.hostname === "example.com" &&
        address.pathname === "/siteboard-revision.json"
      ) {
        return new Response(null, {
          status: 302,
          headers: {
            Location: "https://marker.example/siteboard-revision.json",
          },
        });
      }
      if (address.hostname === "marker.example") {
        return markerResponse(revision);
      }
      return new Response("<h1>Published</h1>", { status: 200 });
    });
    const result = await verifyLiveUrl("https://example.com", {
      fetchImpl,
      lookupImpl: publicLookup,
      expectedRevision: revision,
      attempts: 1,
    });
    expect(result).toMatchObject({ ok: false });
    expect(result.message).toContain("최종 출처");
  });

  it("reads a full immutable marker only when it matches the API commit hash", async () => {
    const commitHash = "e".repeat(40);
    const revision = `${commitHash}${"f".repeat(24)}`;
    const fetchImpl = vi.fn(async (url) =>
      String(url).endsWith("siteboard-revision.json")
        ? markerResponse(revision)
        : new Response("<h1>Published</h1>", { status: 200 }),
    );
    await expect(
      verifyImmutableDeployment(
        "https://deployment-old.example.pages.dev",
        {
          fetchImpl,
          lookupImpl: publicLookup,
          expectedCommitHash: commitHash,
          attempts: 1,
        },
      ),
    ).resolves.toMatchObject({ ok: true, revision });
  });
});
