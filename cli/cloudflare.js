import { createHash } from "node:crypto";
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

function deploymentRevision(deployment) {
  return firstString(
    deployment?.deployment_trigger?.metadata?.commit_hash,
  );
}

function successfulProduction(deployment) {
  return (
    firstString(deployment?.environment).toLowerCase() === "production" &&
    firstString(deployment?.latest_stage?.status).toLowerCase() === "success"
  );
}

function normalizeOrigin(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("공개 주소가 올바르지 않습니다.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    throw new Error("공개 주소는 경로가 없는 HTTPS 주소여야 합니다.");
  }
  return url.origin;
}

function pagesOrigin(project) {
  if (typeof project?.subdomain !== "string" || !project.subdomain.trim()) {
    return "";
  }
  return normalizeOrigin(
    project.subdomain.includes("://")
      ? project.subdomain
      : `https://${project.subdomain}`,
  );
}

function projectOrigins(project) {
  const values = new Set();
  values.add(pagesOrigin(project));
  for (const domain of Array.isArray(project?.domains) ? project.domains : []) {
    if (typeof domain === "string" && domain.trim()) {
      values.add(
        normalizeOrigin(`https://${domain.replace(/^https?:\/\//, "")}`),
      );
    }
  }
  for (const alias of Array.isArray(project?.canonical_deployment?.aliases)
    ? project.canonical_deployment.aliases
    : []) {
    if (typeof alias === "string" && alias.trim()) {
      values.add(normalizeOrigin(alias));
    }
  }
  return [...values].filter(Boolean);
}

function deploymentResult(
  row,
  accountId,
  projectId,
  createdProject,
  revision,
  target,
) {
  return {
    accountId,
    projectId,
    createdProject,
    deploymentId: firstString(row?.id, row?.deployment_id),
    deploymentUrl: firstString(row?.url),
    productionUrl: productionUrl(row),
    environment: firstString(row?.environment, "production"),
    revision,
    reconciled: true,
    target,
  };
}

function projectTarget(project, {
  accountId,
  projectName,
  publicOrigin = "",
}) {
  const origins = projectOrigins(project);
  return {
    accountId,
    projectName,
    projectId: firstString(project?.id),
    exists: Boolean(project),
    publicOrigin: normalizeOrigin(publicOrigin),
    origins,
    pagesOrigin: pagesOrigin(project),
    currentDeploymentId: firstString(project?.canonical_deployment?.id),
    currentUrl: productionUrl(project?.canonical_deployment),
    currentRevision: deploymentRevision(project?.canonical_deployment),
  };
}

export class RemoteOutcomeUnknownError extends Error {
  constructor(message, { cause } = {}) {
    super(message, { cause });
    this.name = "RemoteOutcomeUnknownError";
  }
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
    wait = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
  } = {}) {
    this.runner = runner;
    this.apiClient = apiClient;
    this.wait = wait;
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

  async projectOrNull(accountId, projectName, credentials) {
    try {
      return await this.apiClient.getProject({
        accountId,
        projectName,
        credentials,
      });
    } catch (error) {
      if (error?.status === 404) return null;
      throw error;
    }
  }

  async inspectTarget({ projectName, publicOrigin = "" }) {
    validateProjectName(projectName);
    const accountId = await this.requireAccount();
    const credentials = await this.credentials();
    const project = await this.projectOrNull(
      accountId,
      projectName,
      credentials,
    );
    const normalizedOrigin = normalizeOrigin(publicOrigin);
    if (project && !firstString(project.id)) {
      throw new Error("Cloudflare 프로젝트 ID를 확인하지 못했습니다.");
    }
    const origins = projectOrigins(project);
    if (normalizedOrigin && project && !origins.includes(normalizedOrigin)) {
      throw new Error(
        "공개 주소가 이 Cloudflare Pages 프로젝트에 연결되어 있지 않습니다.",
      );
    }
    if (normalizedOrigin && !project) {
      throw new Error(
        "새 프로젝트는 첫 배포 뒤 발급된 pages.dev 주소를 확인하고 공개 주소를 연결하세요.",
      );
    }
    return projectTarget(project, {
      accountId,
      projectName,
      publicOrigin: normalizedOrigin,
    });
  }

  async ensureBoundProject(binding, accountId, credentials) {
    if (
      !binding ||
      binding.provider !== "cloudflare-pages" ||
      binding.accountId !== accountId ||
      binding.projectName !== validateProjectName(binding.projectName) ||
      typeof binding.existedWhenBound !== "boolean" ||
      typeof binding.projectId !== "string" ||
      (binding.existedWhenBound
        ? !binding.projectId.trim()
        : binding.projectId !== "")
    ) {
      throw new Error("Cloudflare 배포 대상을 다시 확인해 연결하세요.");
    }
    const project = await this.projectOrNull(
      accountId,
      binding.projectName,
      credentials,
    );
    if (project) {
      if (!binding.existedWhenBound) {
        throw new Error(
          "확인 뒤 같은 이름의 프로젝트가 생겼습니다. 배포 대상을 다시 연결하세요.",
        );
      }
      if (
        !firstString(project.id) ||
        firstString(project.id) !== binding.projectId
      ) {
        throw new Error(
          "연결했던 Cloudflare 프로젝트가 바뀌었습니다. 배포 대상을 다시 연결하세요.",
        );
      }
      const normalizedOrigin = normalizeOrigin(binding.publicOrigin);
      if (
        normalizedOrigin &&
        !projectOrigins(project).includes(normalizedOrigin)
      ) {
        throw new Error(
          "공개 주소가 이 Cloudflare Pages 프로젝트에 연결되어 있지 않습니다.",
        );
      }
      return { project, createdProject: false };
    }
    if (binding.existedWhenBound) {
      throw new Error(
        "연결했던 Cloudflare 프로젝트를 찾지 못했습니다. 배포 대상을 다시 연결하세요.",
      );
    }
    if (normalizeOrigin(binding.publicOrigin)) {
      throw new Error(
        "새 프로젝트의 공개 주소는 첫 배포 뒤 다시 연결하세요.",
      );
    }

    try {
      await this.runner.run(
        [
          "pages",
          "project",
          "create",
          binding.projectName,
          "--production-branch",
          "main",
        ],
        {
          env: { CLOUDFLARE_ACCOUNT_ID: accountId },
          timeoutMs: 60_000,
        },
      );
    } catch (error) {
      throw new RemoteOutcomeUnknownError(
        "Cloudflare 프로젝트 생성 결과를 확정하지 못했습니다. 배포 대상을 다시 확인하세요.",
        { cause: error },
      );
    }

    let lastError = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const created = await this.projectOrNull(
          accountId,
          binding.projectName,
          credentials,
        );
        if (created && firstString(created.id)) {
          return { project: created, createdProject: true };
        }
      } catch (error) {
        lastError = error;
      }
      if (attempt < 3) await this.wait(200 * (attempt + 1));
    }
    throw new RemoteOutcomeUnknownError(
      "Cloudflare 프로젝트는 생성됐지만 프로젝트 ID를 확정하지 못했습니다. 배포 대상을 다시 확인하세요.",
      { cause: lastError ?? undefined },
    );
  }

  async findCanonicalDeploymentByRevision({
    accountId,
    projectName,
    credentials,
    revision,
    projectId,
    previousDeploymentId,
    publicOrigin,
    createdProject,
  }) {
    const commitHash = revision.slice(0, 40);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const project = await this.projectOrNull(
        accountId,
        projectName,
        credentials,
      ).catch(() => null);
      const canonical = project?.canonical_deployment;
      const canonicalProjectId = firstString(canonical?.project_id);
      if (
        firstString(project?.id) === projectId &&
        successfulProduction(canonical) &&
        firstString(canonical?.id) &&
        firstString(canonical?.id) !== previousDeploymentId &&
        (!canonicalProjectId || canonicalProjectId === projectId) &&
        deploymentRevision(canonical) === commitHash &&
        (!normalizeOrigin(publicOrigin) ||
          projectOrigins(project).includes(normalizeOrigin(publicOrigin)))
      ) {
        const target = projectTarget(project, {
          accountId,
          projectName,
          publicOrigin,
        });
        return deploymentResult(
          canonical,
          accountId,
          projectId,
          createdProject,
          revision,
          target,
        );
      }
      if (attempt < 4) await this.wait(250 * (attempt + 1));
    }
    return null;
  }

  async publish({ directory, binding, revision }) {
    const projectName = validateProjectName(binding?.projectName ?? "");
    if (typeof revision !== "string" || !/^[a-f0-9]{64}$/.test(revision)) {
      throw new Error("배포 리비전이 올바르지 않습니다.");
    }
    const accountId = await this.requireAccount();
    const credentials = await this.credentials();
    const { project, createdProject } = await this.ensureBoundProject(
      binding,
      accountId,
      credentials,
    );
    const projectId = firstString(project?.id);
    const previousDeploymentId = firstString(
      project?.canonical_deployment?.id,
    );
    let commandError = null;
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
          env: { CLOUDFLARE_ACCOUNT_ID: accountId },
          timeoutMs: 240_000,
        },
      );
    } catch (error) {
      commandError = error;
    }

    const reconciled = await this.findCanonicalDeploymentByRevision({
      accountId,
      projectName,
      credentials,
      revision,
      projectId,
      previousDeploymentId,
      publicOrigin: binding.publicOrigin,
      createdProject,
    }).catch(() => null);
    if (reconciled) return reconciled;
    throw new RemoteOutcomeUnknownError(
      "Cloudflare가 새 production 배포를 적용했는지 확정하지 못했습니다. 배포 이력을 새로 확인하세요.",
      { cause: commandError ?? undefined },
    );
  }

  async confirmCanonical({ binding, deploymentId, revision }) {
    if (
      typeof deploymentId !== "string" ||
      !/^[A-Za-z0-9-]{8,128}$/.test(deploymentId) ||
      typeof revision !== "string" ||
      !/^[a-f0-9]{64}$/.test(revision)
    ) {
      throw new Error("확인할 production 배포 정보가 올바르지 않습니다.");
    }
    const accountId = await this.requireAccount();
    const credentials = await this.credentials();
    const { project } = await this.ensureBoundProject(
      binding,
      accountId,
      credentials,
    );
    const projectId = firstString(project?.id);
    const canonical = project?.canonical_deployment;
    const canonicalProjectId = firstString(canonical?.project_id);
    if (
      firstString(canonical?.id) !== deploymentId ||
      !successfulProduction(canonical) ||
      deploymentRevision(canonical) !== revision.slice(0, 40) ||
      (canonicalProjectId && canonicalProjectId !== projectId)
    ) {
      return null;
    }
    return projectTarget(project, {
      accountId,
      projectName: binding.projectName,
      publicOrigin: binding.publicOrigin,
    });
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
      if (!successfulProduction(row)) {
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
        const commitHash = deploymentRevision(row);
        const current = deploymentId === currentId;
        return {
          deploymentId,
          url: firstString(row?.url),
          status: "success",
          source: commitHash ? commitHash.slice(0, 12) : firstString(row.short_id),
          revision: commitHash,
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

  async rollback({ binding, deploymentId, verifyTarget }) {
    const projectName = validateProjectName(binding?.projectName ?? "");
    validateProjectName(projectName);
    if (
      typeof deploymentId !== "string" ||
      !/^[A-Za-z0-9-]{8,128}$/.test(deploymentId)
    ) {
      throw new Error("되돌릴 배포 ID가 올바르지 않습니다.");
    }
    const accountId = await this.requireAccount();
    const credentials = await this.credentials();
    if (!binding || !binding.existedWhenBound) {
      throw new Error("Cloudflare 배포 대상을 다시 확인해 연결하세요.");
    }
    const { project: boundProject } = await this.ensureBoundProject(
      binding,
      accountId,
      credentials,
    );
    const projectId = firstString(boundProject?.id);
    const deployments = await this.apiClient.listProductionDeployments({
      accountId,
      projectName,
      credentials,
    });
    const target = deployments.find(
      (deployment) =>
        firstString(deployment?.id) === deploymentId &&
        successfulProduction(deployment) &&
        firstString(deployment?.id) !==
          firstString(boundProject?.canonical_deployment?.id) &&
        (!firstString(deployment?.project_id) ||
          firstString(deployment?.project_id) === projectId),
    );
    if (!target) {
      throw new Error(
        "복구 대상은 성공한 production 배포 이력에서 다시 선택하세요.",
      );
    }
    const targetRevision = deploymentRevision(target);
    const immutableUrl = firstString(target?.url);
    if (
      !/^[a-f0-9]{40}$/.test(targetRevision) ||
      !immutableUrl
    ) {
      throw new Error("복구 대상의 리비전을 확인하지 못했습니다.");
    }
    if (typeof verifyTarget !== "function") {
      throw new Error("복구 대상 파일을 확인할 수 없습니다.");
    }
    const preflight = await verifyTarget({
      deploymentUrl: normalizeOrigin(immutableUrl),
      commitHash: targetRevision,
    });
    if (
      !preflight?.ok ||
      typeof preflight.revision !== "string" ||
      !/^[a-f0-9]{64}$/.test(preflight.revision) ||
      !preflight.revision.startsWith(targetRevision)
    ) {
      throw new Error(
        "선택한 고정 배포 주소의 리비전을 확인하지 못해 복구를 중단했습니다.",
      );
    }

    let rollbackError = null;
    try {
      await this.apiClient.rollbackDeployment({
        accountId,
        projectName,
        deploymentId,
        credentials,
      });
    } catch (error) {
      if (typeof error?.status === "number" && error.status < 500) {
        throw error;
      }
      rollbackError = error;
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const project = await this.projectOrNull(
        accountId,
        projectName,
        credentials,
      ).catch(() => null);
      const canonical = project?.canonical_deployment;
      const canonicalProjectId = firstString(canonical?.project_id);
      if (
        firstString(project?.id) === projectId &&
        firstString(canonical?.id) === deploymentId &&
        successfulProduction(canonical) &&
        (!canonicalProjectId || canonicalProjectId === projectId) &&
        deploymentRevision(canonical) === targetRevision
      ) {
        const targetState = projectTarget(project, {
          accountId,
          projectName,
          publicOrigin: binding.publicOrigin,
        });
        return deploymentResult(
          canonical,
          accountId,
          projectId,
          false,
          preflight.revision,
          targetState,
        );
      }
      if (attempt < 4) await this.wait(250 * (attempt + 1));
    }
    throw new RemoteOutcomeUnknownError(
      "Cloudflare 복구 결과를 확정하지 못했습니다. 현재 production을 새로 확인하세요.",
      { cause: rollbackError ?? undefined },
    );
  }
}
