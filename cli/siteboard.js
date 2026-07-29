#!/usr/bin/env node

import { spawn } from "node:child_process";
import { access, readFile, stat } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CloudflarePagesService } from "./cloudflare.js";
import { DeploymentHistoryStore } from "./history-store.js";
import { createStudioServer } from "./server.js";
import { StudioOperations } from "./studio-operations.js";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageMetadata = JSON.parse(
  await readFile(resolve(packageDirectory, "package.json"), "utf8"),
);

function parsePort(args) {
  const index = args.indexOf("--port");
  if (index < 0) return 47831;
  const value = Number(args[index + 1]);
  if (!Number.isInteger(value) || value < 1024 || value > 65535) {
    throw new Error("--port에는 1024~65535 사이 숫자를 입력하세요.");
  }
  return value;
}

function openBrowser(url) {
  let command;
  let args;
  if (process.platform === "darwin") {
    command = "open";
    args = [url];
  } else if (process.platform === "win32") {
    command = "cmd";
    args = ["/c", "start", "", url];
  } else {
    command = "xdg-open";
    args = [url];
  }
  const child = spawn(command, args, {
    detached: true,
    shell: false,
    stdio: "ignore",
  });
  child.unref();
}

function usage() {
  process.stdout.write(
    [
      "Siteboard",
      "",
      "사용법:",
      "  siteboard studio [작업파일.siteboard.json] [--port 47831] [--no-open]",
      "  siteboard status",
      "  siteboard --version",
      "",
      "Cloudflare 인증은 CLOUDFLARE_API_TOKEN 또는 wrangler login을 사용합니다.",
      "",
    ].join("\n"),
  );
}

async function startupProject(args) {
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--port") {
      index += 1;
      continue;
    }
    if (value === "--no-open") continue;
    if (value.startsWith("-")) {
      throw new Error(`지원하지 않는 옵션입니다: ${value}`);
    }
    positional.push(value);
  }
  if (positional.length > 1) {
    throw new Error("한 번에 하나의 Siteboard 작업 파일만 열 수 있습니다.");
  }
  if (!positional.length) return null;
  const path = resolve(positional[0]);
  const file = await stat(path);
  if (!file.isFile() || file.size > 20 * 1024 * 1024) {
    throw new Error("20MB 이하의 Siteboard 작업 파일을 선택하세요.");
  }
  return {
    fileName: basename(path),
    content: await readFile(path, "utf8"),
  };
}

async function studio(args) {
  const staticDirectory = resolve(packageDirectory, "dist");
  try {
    await access(resolve(staticDirectory, "index.html"));
  } catch {
    throw new Error(
      "Siteboard 화면이 아직 빌드되지 않았습니다. 먼저 npm run build를 실행하세요.",
    );
  }

  const operations = new StudioOperations({
    cloudflare: new CloudflarePagesService(),
    history: new DeploymentHistoryStore(),
  });
  const studioServer = createStudioServer({
    staticDirectory,
    operations,
    startupProject: await startupProject(args),
  });
  const address = await studioServer.listen(parsePort(args));
  const url = `${address.origin}/`;

  process.stdout.write(
    [
      `Siteboard Studio가 ${url} 에서 실행 중입니다.`,
      "종료하려면 Ctrl+C를 누르세요.",
      "",
    ].join("\n"),
  );
  if (!args.includes("--no-open")) {
    openBrowser(url);
  }

  const shutdown = async () => {
    process.removeListener("SIGINT", shutdown);
    process.removeListener("SIGTERM", shutdown);
    await studioServer.close();
    process.exitCode = 0;
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function status() {
  const cloudflare = await new CloudflarePagesService().authStatus();
  process.stdout.write(
    [
      `Siteboard ${packageMetadata.version}`,
      `Cloudflare 로그인: ${cloudflare.authenticated ? "확인됨" : "필요"}`,
      `계정 선택: ${cloudflare.selectedAccountId ? "완료" : "미완료"}`,
      "",
    ].join("\n"),
  );
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h") {
    usage();
    return;
  }
  if (command === "--version" || command === "-v") {
    process.stdout.write(`${packageMetadata.version}\n`);
    return;
  }
  if (command === "status") {
    await status();
    return;
  }
  if (command !== "studio") {
    usage();
    process.exitCode = 1;
    return;
  }
  await studio(args);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Siteboard를 시작하지 못했습니다."}\n`,
  );
  process.exitCode = 1;
});
