import process from "node:process";
import console from "node:console";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const root = process.cwd();
const dist = resolve(root, "dist");
const original = await readFile(resolve(dist, "index.html"), "utf8");
if (!original.includes('Siteboard')) throw new Error("Build the original app before retirement packaging");
await mkdir(resolve(dist, "legacy"), { recursive: true });
if (original.includes('data-product=')) {
  const legacy = await readFile(resolve(dist, "legacy/index.html"), "utf8");
  if (legacy.includes('data-product=')) throw new Error("Legacy app is missing; rebuild the original app before packaging");
} else {
  await writeFile(resolve(dist, "legacy/index.html"), original);
}
await cp(resolve(root, "retirement"), dist, { recursive: true });
// Replace old navigation caching while keeping all app assets and user storage.
// A retained network-first shell serves the retirement page offline after first load.
const worker = `const CACHE = "Siteboard-archive-20260905";
const STATIC_DESTINATIONS = new Set(["script", "style", "font", "image", "manifest"]);
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(["/", "/legacy/", "/data-move.js", "/data-move.css", "/register-retirement.js"])).then(() => self.skipWaiting())));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  const navigation = request.mode === "navigate";
  if (!navigation && !STATIC_DESTINATIONS.has(request.destination)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      const html = response.headers.get("content-type")?.includes("text/html");
      if (response.ok && (navigation ? html : !html || !["script", "style"].includes(request.destination))) {
        try { await cache.put(request, response.clone()); } catch { /* Keep a valid response when cache quota is full. */ }
      }
      return response;
    } catch {
      const cached = await cache.match(request);
      if (cached) return cached;
      if (navigation) return (await cache.match(url.pathname.startsWith("/legacy/") ? "/legacy/" : "/")) || Response.error();
      return (await caches.match(request)) || Response.error();
    }
  })());
});
`;
await writeFile(resolve(dist, "sw.js"), worker);
console.log("Siteboard retirement entry and /legacy/ app built; original browser storage is untouched.");
