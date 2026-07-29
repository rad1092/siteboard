import { randomBytes } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, relative, resolve, sep } from "node:path";

const BODY_LIMIT = 17 * 1024 * 1024;
const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

function securityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; " +
      "script-src 'self'; style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: blob:; frame-src 'self' data: blob:; " +
      "connect-src 'self'; manifest-src 'self';",
  );
}

function sendJson(response, status, value) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(value));
}

function publicError(error) {
  return error instanceof Error
    ? error.message.slice(0, 500)
    : "요청을 처리하지 못했습니다.";
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > BODY_LIMIT) {
      throw Object.assign(new Error("요청 데이터가 너무 큽니다."), {
        statusCode: 413,
      });
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("JSON 요청을 읽지 못했습니다."), {
      statusCode: 400,
    });
  }
}

function safeStaticPath(root, pathname) {
  const decoded = decodeURIComponent(pathname);
  const requested = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const target = resolve(root, requested);
  const inside = relative(root, target);
  if (inside === ".." || inside.startsWith(`..${sep}`) || inside.startsWith("/")) {
    return null;
  }
  return target;
}

export function createStudioServer({
  staticDirectory,
  operations,
  csrfToken = randomBytes(32).toString("base64url"),
  startupProject = null,
}) {
  let expectedOrigin = "";
  let expectedHost = "";
  let pendingStartupProject = startupProject;

  const server = createServer(async (request, response) => {
    securityHeaders(response);
    if (!expectedOrigin || request.headers.host !== expectedHost) {
      sendJson(response, 421, { error: "허용되지 않은 로컬 주소입니다." });
      return;
    }

    let requestUrl;
    try {
      requestUrl = new URL(request.url ?? "/", expectedOrigin);
    } catch {
      sendJson(response, 400, { error: "요청 주소가 올바르지 않습니다." });
      return;
    }

    try {
      if (
        requestUrl.pathname.startsWith("/api/") &&
        request.headers["sec-fetch-site"] &&
        request.headers["sec-fetch-site"] !== "same-origin"
      ) {
        sendJson(response, 403, { error: "교차 출처 요청은 허용하지 않습니다." });
        return;
      }

      if (
        request.method === "GET" &&
        requestUrl.pathname === "/api/companion/status"
      ) {
        sendJson(response, 200, {
          available: true,
          version: 1,
          csrfToken,
          cloudflare: await operations.status(),
          capabilities: {
            publish: true,
            binding: true,
            history: true,
            rollback: true,
            liveVerify: true,
          },
          startupFile: pendingStartupProject?.fileName ?? "",
        });
        return;
      }

      if (
        request.method === "GET" &&
        requestUrl.pathname === "/api/startup-project"
      ) {
        if (!pendingStartupProject) {
          sendJson(response, 404, {
            error: "시작할 작업 파일이 없습니다.",
          });
          return;
        }
        const project = pendingStartupProject;
        pendingStartupProject = null;
        sendJson(response, 200, project);
        return;
      }

      if (requestUrl.pathname.startsWith("/api/")) {
        if (
          request.method === "POST" &&
          (request.headers.origin !== expectedOrigin ||
            request.headers["x-siteboard-csrf"] !== csrfToken ||
            !request.headers["content-type"]?.startsWith("application/json"))
        ) {
          sendJson(response, 403, { error: "로컬 요청 확인에 실패했습니다." });
          return;
        }

        if (
          request.method === "GET" &&
          requestUrl.pathname === "/api/deployments"
        ) {
          const projectName = requestUrl.searchParams.get("project") ?? "";
          sendJson(
            response,
            200,
            await operations.deploymentState(projectName),
          );
          return;
        }

        if (
          request.method === "POST" &&
          requestUrl.pathname === "/api/project-target"
        ) {
          sendJson(
            response,
            200,
            await operations.inspectTarget(await readJson(request)),
          );
          return;
        }

        if (
          request.method === "POST" &&
          requestUrl.pathname === "/api/publish"
        ) {
          sendJson(response, 200, await operations.publish(await readJson(request)));
          return;
        }

        if (
          request.method === "POST" &&
          requestUrl.pathname === "/api/rollback"
        ) {
          sendJson(response, 200, await operations.rollback(await readJson(request)));
          return;
        }

        sendJson(response, 404, { error: "지원하지 않는 companion 요청입니다." });
        return;
      }

      if (!["GET", "HEAD"].includes(request.method ?? "")) {
        response.statusCode = 405;
        response.setHeader("Allow", "GET, HEAD");
        response.end();
        return;
      }

      let target = safeStaticPath(staticDirectory, requestUrl.pathname);
      if (!target) {
        sendJson(response, 404, { error: "파일을 찾을 수 없습니다." });
        return;
      }
      try {
        if (!(await stat(target)).isFile()) throw new Error("not-file");
      } catch {
        target = resolve(staticDirectory, "index.html");
      }
      const content = await readFile(target);
      response.statusCode = 200;
      response.setHeader(
        "Content-Type",
        CONTENT_TYPES[extname(target)] ?? "application/octet-stream",
      );
      response.setHeader(
        "Cache-Control",
        target.endsWith("index.html")
          ? "no-store"
          : "public, max-age=31536000, immutable",
      );
      if (request.method === "HEAD") {
        response.end();
      } else {
        response.end(content);
      }
    } catch (error) {
      sendJson(response, error?.statusCode ?? 500, {
        error: publicError(error),
      });
    }
  });

  return {
    server,
    csrfToken,
    async listen(port) {
      await new Promise((resolvePromise, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => {
          server.off("error", reject);
          resolvePromise();
        });
      });
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("로컬 서버 주소를 확인하지 못했습니다.");
      }
      expectedHost = `127.0.0.1:${address.port}`;
      expectedOrigin = `http://${expectedHost}`;
      return { host: "127.0.0.1", port: address.port, origin: expectedOrigin };
    },
    async close() {
      await new Promise((resolvePromise, reject) => {
        server.close((error) => (error ? reject(error) : resolvePromise()));
      });
    },
  };
}
