import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CloudflareApiClient } from "./cloudflare-api.js";
import { createCommandRunner } from "./command-runner.js";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const wranglerExecutable = join(
  moduleDirectory,
  "..",
  "node_modules",
  "wrangler",
  "bin",
  "wrangler.js",
);

function parseJsonOutput(stdout, label) {
  try {
    return JSON.parse(stdout.trim());
  } catch {
    throw new Error(`${label} 응답을 읽지 못했습니다.`);
  }
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim()) ?? "";
}

function productionUrl(deployment) {
  const aliases = Array.isArray(deployment?.aliases)
    ? deployment.aliases.filter((value) => typeof value === "string")
    : [];
  return firstString(aliases[0], deployment?.alias, deployment?.url);
}

export function validateProjectName(projectName) {
  if (
    typeof projectName !== "string" ||
    !/^[a-z0-9](?:[a-z0-9-]{0,56}[a-z0-9])?$/.test(projectName)
  ) {
    throw new Error(
      "프로젝트 이름은 영문 소문자와 숫자, 가운데 하이픈으로 1~58자까지 입력하세요.",
    );
  }
  return projectName;
}

export function archiveRevision(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function createWranglerRunner() {
  return createCommandRunner({
    command: process.execPath,
    prefixArgs: [wranglerExecutable],
  });
}

export class CloudflarePagesService {
  constructor({
    runner = createWranglerRunner(),
    apiClient = new CloudflareApiClient(),
  } = {}) {
    this.runner = runner;
    this.apiClient = apiClient;
  }

  async authStatus() {
    try {
      const result = await this.runner.run(["whoami", "--json"], {
        sensitive: true,
        timeoutMs: 30_000,
      });
      const payload = parseJsonOutput(result.stdout, "Cloudflare 인증");
      const accounts = Array.isArray(payload.accounts)
        ? payload.accounts
            .filter(
              (account) =>
                typeof account?.id === "string" &&
                typeof account?.name === "string",
            )
            .map((account) => ({ id: account.id, name: account.name }))
        : [];
      return {
        authenticated: payload.loggedIn === true && accounts.length > 0,
        authType:
          typeof payload.authType === "string" ? payload.authType : "",
        accounts,
        selectedAccountId: this.selectAccountId(accounts),
      };
    } catch {
      return {
        authenticated: false,
        authType: "",
        accounts: [],
        selectedAccountId: "",
      };
    }
  }

  selectAccountId(accounts) {
    const configured = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
    if (configured) {
      return accounts.some((account) => account.id === configured)
        ? configured
        : "";
    }
    return accounts.length === 1 ? accounts[0].id : "";
  }

  async requireAccount() {
    const status = await this.authStatus();
    if (!status.authenticated) {
      throw new Error(
        "Cloudflare 인증이 없습니다. 터미널에서 wrangler login을 먼저 실행하세요.",
      );
    }
    if (!status.selectedAccountId) {
      throw new Error(
        "Cloudflare 계정이 여러 개입니다. CLOUDFLARE_ACCOUNT_ID를 지정하고 Siteboard를 다시 실행하세요.",
      );
    }
    return status.selectedAccountId;
  }

  async listProjects(accountId) {
    const result = await this.runner.run(
      ["pages", "project", "list", "--json"],
      {
        env: { CLOUDFLARE_ACCOUNT_ID: accountId },
        timeoutMs: 60_000,
      },
    );
    const projects = parseJsonOutput(result.stdout, "Cloudflare 프로젝트");
    return Array.isArray(projects) ? projects : [];
  }

  async ensureProject(projectName, accountId) {
    const projects = await this.listProjects(accountId);
    const exists = projects.some(
      (project) =>
        project?.name === projectName ||
        project?.Name === projectName ||
        project?.["Project Name"] === projectName,
    );
    if (exists) return false;

    await this.runner.run(
      [
        "pages",
        "project",
        "create",
        projectName,
        "--production-branch",
        "main",
      ],
      {
        env: { CLOUDFLARE_ACCOUNT_ID: accountId },
        timeoutMs: 60_000,
      },
    );
    return true;
  }

  async publish({ directory, projectName, revision }) {
    validateProjectName(projectName);
    const accountId = await this.requireAccount();
    const createdProject = await this.ensureProject(projectName, accountId);
    const outputDirectory = await mkdtemp(
      join(tmpdir(), "siteboard-wrangler-"),
    );
    const outputPath = join(outputDirectory, "output.jsonl");

    try {
      await this.runner.run(
        [
          "pages",
          "deploy",
          directory,
          "--project-name",
          projectName,
          "--branch",
          "main",
          "--commit-hash",
          revision.slice(0, 40),
          "--commit-message",
          `Siteboard revision ${revision.slice(0, 12)}`,
          "--commit-dirty=false",
        ],
        {
          env: {
            CLOUDFLARE_ACCOUNT_ID: accountId,
            WRANGLER_OUTPUT_FILE_PATH: outputPath,
          },
          timeoutMs: 240_000,
        },
      );

      const output = await readFile(outputPath, "utf8");
      const events = output
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      const detailed = events.findLast(
        (event) => event.type === "pages-deploy-detailed",
      );
      const basic = events.findLast((event) => event.type === "pages-deploy");
      const event = detailed ?? basic;
      if (!event?.deployment_id || !event?.url) {
        throw new Error("Cloudflare 배포 결과에 배포 ID와 주소가 없습니다.");
      }

      return {
        accountId,
        createdProject,
        deploymentId: event.deployment_id,
        deploymentUrl: event.url,
        productionUrl: firstString(event.alias, event.url),
        environment: firstString(event.environment, "production"),
      };
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  }

  async listDeployments(projectName) {
    validateProjectName(projectName);
    const accountId = await this.requireAccount();
    const credentials = await this.credentials();
    const [project, rows] = await Promise.all([
      this.apiClient.getProject({ accountId, projectName, credentials }),
      this.apiClient.listProductionDeployments({
        accountId,
        projectName,
        credentials,
      }),
    ]);
    const canonical = project?.canonical_deployment;
    const currentId = firstString(canonical?.id);
    const unique = new Map();
    for (const row of [canonical, ...rows]) {
      const id = firstString(row?.id);
      if (!id || unique.has(id)) continue;
      if (
        firstString(row?.environment).toLowerCase() !== "production" ||
        firstString(row?.latest_stage?.status).toLowerCase() !== "success"
      ) {
        continue;
      }
      unique.set(id, row);
    }

    return [...unique.values()]
      .sort((left, right) =>
        firstString(right.created_on).localeCompare(
          firstString(left.created_on),
        ),
      )
      .map((row) => {
        const deploymentId = firstString(row.id);
        const commitHash = firstString(
          row?.deployment_trigger?.metadata?.commit_hash,
        );
        const current = deploymentId === currentId;
        return {
          deploymentId,
          url: productionUrl(row),
          status: "success",
          source: commitHash ? commitHash.slice(0, 12) : firstString(row.short_id),
          environment: "Production",
          dashboardUrl:
            `https://dash.cloudflare.com/${encodeURIComponent(accountId)}` +
            `/pages/view/${encodeURIComponent(projectName)}` +
            `/${encodeURIComponent(deploymentId)}`,
          current,
          rollbackable: !current,
        };
      });
  }

  async credentials() {
    const result = await this.runner.run(["auth", "token", "--json"], {
      sensitive: true,
      timeoutMs: 30_000,
    });
    return parseJsonOutput(result.stdout, "Cloudflare 인증");
  }

  async rollback({ projectName, deploymentId }) {
    validateProjectName(projectName);
    if (
      typeof deploymentId !== "string" ||
      !/^[A-Za-z0-9-]{8,128}$/.test(deploymentId)
    ) {
      throw new Error("되돌릴 배포 ID가 올바르지 않습니다.");
    }
    const accountId = await this.requireAccount();
    const deployment = await this.apiClient.rollbackDeployment({
      accountId,
      projectName,
      deploymentId,
      credentials: await this.credentials(),
    });
    return {
      accountId,
      deploymentId: firstString(deployment.id, deploymentId),
      deploymentUrl: firstString(deployment.url),
      productionUrl: productionUrl(deployment),
      environment: firstString(deployment.environment, "production"),
    };
  }
}
