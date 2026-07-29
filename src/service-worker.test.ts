import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";
import { beforeAll, describe, expect, it, vi } from "vitest";

type WorkerListener = (event: {
  request?: {
    method: string;
    mode: string;
    url: string;
    destination: string;
  };
  respondWith?: (response: Promise<unknown>) => void;
  waitUntil?: (work: Promise<unknown>) => void;
}) => void;

let workerSource = "";

beforeAll(async () => {
  workerSource = await readFile(
    resolve(process.cwd(), "public/sw.js"),
    "utf8",
  );
});

function createHarness(fetchResult?: object) {
  const listeners = new Map<string, WorkerListener>();
  const cache = {
    addAll: vi.fn(async () => undefined),
    match: vi.fn(async () => undefined),
    put: vi.fn(async () => undefined),
  };
  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => [] as string[]),
    delete: vi.fn(async () => true),
  };
  const fetchMock = vi.fn(async () => fetchResult);
  const workerSelf = {
    registration: { scope: "https://siteboard.whago.net/" },
    clients: { claim: vi.fn(async () => undefined) },
    skipWaiting: vi.fn(async () => undefined),
    addEventListener: vi.fn((name: string, listener: WorkerListener) => {
      listeners.set(name, listener);
    }),
  };

  vm.runInNewContext(workerSource, {
    URL,
    Promise,
    Set,
    caches,
    fetch: fetchMock,
    self: workerSelf,
  });

  return { cache, caches, fetchMock, listeners, workerSelf };
}

function request(
  path: string,
  options: Partial<{
    method: string;
    mode: string;
    destination: string;
  }> = {},
) {
  return {
    method: options.method ?? "GET",
    mode: options.mode ?? "cors",
    destination: options.destination ?? "script",
    url: new URL(path, "https://siteboard.whago.net").href,
  };
}

describe("Siteboard service worker", () => {
  it("deletes only stale Siteboard shell caches", async () => {
    const harness = createHarness();
    harness.caches.keys.mockResolvedValue([
      "siteboard-shell-old",
      "siteboard-shell-__SITEBOARD_RELEASE__",
      "daymark-shell-v4",
      "unrelated-cache",
    ]);
    let activation: Promise<unknown> | undefined;

    harness.listeners.get("activate")?.({
      waitUntil: (work) => {
        activation = work;
      },
    });
    await activation;

    expect(harness.caches.delete).toHaveBeenCalledTimes(1);
    expect(harness.caches.delete).toHaveBeenCalledWith(
      "siteboard-shell-old",
    );
    expect(harness.workerSelf.clients.claim).toHaveBeenCalledOnce();
  });

  it("handles its independent origin and ignores external origins", async () => {
    const networkResponse = {
      ok: true,
      clone: vi.fn(() => ({})),
      headers: { get: vi.fn(() => "text/javascript") },
    };
    const harness = createHarness(networkResponse);
    const respondWith = vi.fn();
    const fetchListener = harness.listeners.get("fetch");

    fetchListener?.({
      request: request("https://cdn.example.test/siteboard/app.js"),
      respondWith,
    });

    expect(respondWith).not.toHaveBeenCalled();

    fetchListener?.({
      request: request("/assets/app.js"),
      respondWith,
    });
    expect(respondWith).toHaveBeenCalledOnce();
    await respondWith.mock.calls[0][0];
  });

  it("updates navigation caches after a successful network response", async () => {
    const responseCopy = { cached: true };
    const networkResponse = {
      ok: true,
      clone: vi.fn(() => responseCopy),
      headers: { get: vi.fn(() => "text/html") },
    };
    const harness = createHarness(networkResponse);
    const navigationRequest = request("/", {
      mode: "navigate",
      destination: "document",
    });
    let responsePromise: Promise<unknown> | undefined;

    harness.listeners.get("fetch")?.({
      request: navigationRequest,
      respondWith: (response) => {
        responsePromise = response;
      },
    });

    await expect(responsePromise).resolves.toBe(networkResponse);
    expect(harness.cache.put).toHaveBeenCalledWith(
      navigationRequest,
      responseCopy,
    );
    expect(harness.cache.put).toHaveBeenCalledWith(
      "https://siteboard.whago.net/index.html",
      responseCopy,
    );
  });

  it("returns a successful navigation even if its cache write fails", async () => {
    const networkResponse = {
      ok: true,
      clone: vi.fn(() => ({})),
      headers: { get: vi.fn(() => "text/html") },
    };
    const harness = createHarness(networkResponse);
    harness.cache.put.mockRejectedValue(new Error("quota"));
    let responsePromise: Promise<unknown> | undefined;

    harness.listeners.get("fetch")?.({
      request: request("/", {
        mode: "navigate",
        destination: "document",
      }),
      respondWith: (response) => {
        responsePromise = response;
      },
    });

    await expect(responsePromise).resolves.toBe(networkResponse);
  });
});
