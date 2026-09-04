import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm, copyFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { URL } from "node:url";
import test from "node:test";
import { runInNewContext } from "node:vm";
test("retirement packaging preserves original app and is safe to repeat", async () => {
 const root = await mkdtemp(join(tmpdir(),"retirement-test-"));
 try {
  await mkdir(join(root,"dist")); await mkdir(join(root,"retirement"));
  const original = '<html><title>Siteboard</title><div id="root"></div><script src="/assets/app.js"></script></html>';
  await writeFile(join(root,"dist/index.html"),original);
  await writeFile(join(root,"retirement/index.html"),'<body data-product="Siteboard">Development ended</body>');
  await copyFile(new URL("./retire-web.mjs", import.meta.url),join(root,"retire-web.mjs"));
  execFileSync(process.execPath,["retire-web.mjs"],{cwd:root});
  execFileSync(process.execPath,["retire-web.mjs"],{cwd:root});
  assert.equal(await readFile(join(root,"dist/legacy/index.html"),"utf8"),original);
  assert.match(await readFile(join(root,"dist/index.html"),"utf8"),/Development ended/);
  const worker = await readFile(join(root,"dist/sw.js"),"utf8");
  assert.ok(worker.includes('self.clients.claim()'));
  assert.ok(!worker.includes('localStorage') && !worker.includes('indexedDB'));
  await verifyOfflineLegacy(worker, original);
 } finally { await rm(root,{recursive:true,force:true}); }
});

async function verifyOfflineLegacy(worker, original) {
 const origin = "https://archive.example";
 const handlers = new Map();
 const entries = new Map();
 let online = true;
 const key = request => new URL(typeof request === "string" ? request : request.url, origin).href;
 const cache = {
  async addAll(paths) {
   for (const path of paths) entries.set(key(path), new globalThis.Response(path === "/legacy/" ? original : "retirement shell", { headers: { "content-type": "text/html" } }));
  },
  async match(request) { return entries.get(key(request))?.clone(); },
  async put(request, response) { entries.set(key(request), response.clone()); },
 };
 runInNewContext(worker, {
  URL,
  Response: globalThis.Response,
  self: { location: { origin }, addEventListener(type, callback) { handlers.set(type, callback); }, skipWaiting() {}, clients: { claim() {} } },
  caches: { async open() { return cache; }, async match(request) { return cache.match(request); } },
  async fetch(request) {
   if (!online) throw new Error("offline");
   return new globalThis.Response("retained legacy asset", { headers: { "content-type": request.destination === "script" ? "application/javascript" : "text/html" } });
  },
 });
 let installation;
 handlers.get("install")({ waitUntil(promise) { installation = promise; } });
 await installation;
 async function request(path, mode, destination, method = "GET") {
  let reply;
  handlers.get("fetch")({ request: { url: origin + path, method, mode, destination }, respondWith(promise) { reply = promise; } });
  return reply;
 }
 assert.equal(await (await request("/assets/legacy.js", "cors", "script")).text(), "retained legacy asset");
 online = false;
 assert.equal(await (await request("/legacy/", "navigate", "document")).text(), original);
 assert.equal(await (await request("/legacy/reopened", "navigate", "document")).text(), original);
 assert.equal(await (await request("/", "navigate", "document")).text(), "retirement shell");
 assert.equal(await (await request("/assets/legacy.js", "cors", "script")).text(), "retained legacy asset");
 assert.equal(await request("/api/private-data", "cors", ""), undefined, "API data is never intercepted or cached");
 assert.equal(await request("/assets/legacy.js", "cors", "script", "POST"), undefined);
}


test("retirement registration works with same-origin script-only CSP", async () => {
 const html = await readFile(new URL("../retirement/index.html", import.meta.url), "utf8");
 assert.match(html, /<script src="\/register-retirement\.js" defer><\/script>/);
 assert.doesNotMatch(html, /<script\b(?![^>]*\bsrc=)[^>]*>/);
 const script = await readFile(new URL("../retirement/register-retirement.js", import.meta.url), "utf8");
 const calls = [];
 let onLoad;
 runInNewContext(script, {
  window: { addEventListener(event, callback) { assert.equal(event, "load"); onLoad = callback; } },
  navigator: { serviceWorker: { register(path, options) { calls.push([path, options.scope]); return Promise.resolve(); } } },
 });
 assert.equal(calls.length, 0);
 onLoad();
 assert.deepEqual(calls, [["/sw.js", "/"]]);
});
