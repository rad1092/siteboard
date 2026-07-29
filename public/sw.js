const CACHE_PREFIX = "siteboard-shell-";
const RELEASE_ID = "__SITEBOARD_RELEASE__";
const CACHE_NAME = `${CACHE_PREFIX}${RELEASE_ID}`;
const SCOPE_URL = new URL(self.registration.scope);
const INDEX_URL = new URL("index.html", SCOPE_URL).href;
const CACHEABLE_DESTINATIONS = new Set([
  "font",
  "image",
  "manifest",
  "script",
  "style",
]);
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./siteboard-mark.svg",
  "./icon-192.png",
  "./icon-512.png",
];

function isInAppScope(url) {
  return (
    url.origin === SCOPE_URL.origin &&
    url.pathname.startsWith(SCOPE_URL.pathname)
  );
}

function isSafeAssetResponse(request, response) {
  if (!response || !response.ok) return false;
  if (!["script", "style"].includes(request.destination)) return true;
  return !response.headers.get("content-type")?.includes("text/html");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  if (!isInAppScope(requestUrl)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const response = await fetch(request);
          if (response?.ok) {
            try {
              await Promise.all([
                cache.put(request, response.clone()),
                cache.put(INDEX_URL, response.clone()),
              ]);
            } catch {
              // A cache quota error must not replace a valid network response.
            }
          }
          return response;
        } catch (error) {
          const cached =
            (await cache.match(request)) ?? (await cache.match(INDEX_URL));
          if (cached) return cached;
          throw error;
        }
      })(),
    );
    return;
  }

  if (!CACHEABLE_DESTINATIONS.has(request.destination)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;

      const response = await fetch(request);
      if (isSafeAssetResponse(request, response)) {
        try {
          await cache.put(request, response.clone());
        } catch {
          // Return the network response even when runtime caching is full.
        }
      }
      return response;
    })(),
  );
});
