export type DeploymentRecordStatus =
  | "live"
  | "failed"
  | "verification-failed"
  | "deployed-history-error"
  | "recovered"
  | "recovered-history-error"
  | "recovery-failed"
  | "rollback-failed"
  | "outcome-unknown"
  | "rollback-outcome-unknown";

export interface LiveVerification {
  ok: boolean;
  checkedAt: string;
  status: number;
  url: string;
  message?: string;
  revision?: string;
  checks?: LiveVerification[];
}

export interface DeploymentRecord {
  schemaVersion: 1;
  eventId: string;
  createdAt: string;
  operation: "publish" | "rollback";
  status: DeploymentRecordStatus;
  projectName: string;
  documentName?: string;
  revision?: string;
  deploymentId?: string;
  deploymentUrl?: string;
  productionUrl?: string;
  message?: string;
  verification?: LiveVerification;
}

const deploymentStatuses = new Set<DeploymentRecordStatus>([
  "live",
  "failed",
  "verification-failed",
  "deployed-history-error",
  "recovered",
  "recovered-history-error",
  "recovery-failed",
  "rollback-failed",
  "outcome-unknown",
  "rollback-outcome-unknown",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Number.isFinite(Date.parse(value))
  );
}

function isHttpsUrl(value: unknown, rootOnly = false): value is string {
  if (typeof value !== "string") return false;
  if (!value) return true;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      (!rootOnly ||
        ((url.pathname === "/" || url.pathname === "") && !url.search))
    );
  } catch {
    return false;
  }
}

function isOptionalHttpsOrigin(value: unknown): value is string | undefined {
  return value === undefined || isHttpsUrl(value, true);
}

function isLiveVerification(
  value: unknown,
  depth = 0,
): value is LiveVerification {
  if (!isRecord(value) || depth > 1) return false;
  if (
    typeof value.ok !== "boolean" ||
    !isTimestamp(value.checkedAt) ||
    typeof value.status !== "number" ||
    !Number.isInteger(value.status) ||
    value.status < 0 ||
    value.status > 599 ||
    !isHttpsUrl(value.url) ||
    !isOptionalString(value.message) ||
    !isOptionalString(value.revision)
  ) {
    return false;
  }
  if (
    value.revision !== undefined &&
    !/^[a-f0-9]{64}$/.test(value.revision)
  ) {
    return false;
  }
  return (
    value.checks === undefined ||
    (Array.isArray(value.checks) &&
      value.checks.length <= 16 &&
      value.checks.every((check) => isLiveVerification(check, depth + 1)))
  );
}

export function isDeploymentRecord(
  value: unknown,
): value is DeploymentRecord {
  if (!isRecord(value)) return false;
  return (
    value.schemaVersion === 1 &&
    typeof value.eventId === "string" &&
    value.eventId.length > 0 &&
    isTimestamp(value.createdAt) &&
    (value.operation === "publish" || value.operation === "rollback") &&
    typeof value.status === "string" &&
    deploymentStatuses.has(value.status as DeploymentRecordStatus) &&
    typeof value.projectName === "string" &&
    /^[a-z0-9](?:[a-z0-9-]{0,56}[a-z0-9])?$/.test(value.projectName) &&
    isOptionalString(value.documentName) &&
    isOptionalString(value.revision) &&
    (value.revision === undefined ||
      value.revision === "" ||
      /^[a-f0-9]{40}$|^[a-f0-9]{64}$/.test(value.revision)) &&
    isOptionalString(value.deploymentId) &&
    isOptionalHttpsOrigin(value.deploymentUrl) &&
    isOptionalHttpsOrigin(value.productionUrl) &&
    isOptionalString(value.message) &&
    (value.verification === undefined ||
      isLiveVerification(value.verification))
  );
}

export interface CloudflareDeployment {
  deploymentId: string;
  url: string;
  status: string;
  source: string;
  revision: string;
  environment: string;
  dashboardUrl: string;
  current: boolean;
  rollbackable: boolean;
}

export interface CompanionStatus {
  available: true;
  version: number;
  csrfToken: string;
  cloudflare: {
    authenticated: boolean;
    authType: string;
    accounts: Array<{ id: string; name: string }>;
    selectedAccountId: string;
  };
  capabilities: {
    publish: boolean;
    binding: boolean;
    history: boolean;
    rollback: boolean;
    liveVerify: boolean;
  };
  startupFile?: string;
}

export interface DeploymentState {
  history: DeploymentRecord[];
  deployments: CloudflareDeployment[];
}

export interface DeploymentMutationResult extends DeploymentState {
  record: DeploymentRecord;
  deployment: {
    deploymentId: string;
    deploymentUrl: string;
    productionUrl: string;
    environment: string;
    revision?: string;
  };
  verification: LiveVerification;
  target?: CloudflareTarget;
  warning?: string;
}

export interface CloudflareTarget {
  accountId: string;
  projectName: string;
  projectId: string;
  exists: boolean;
  publicOrigin: string;
  origins: string[];
  pagesOrigin: string;
  currentDeploymentId: string;
  currentUrl: string;
  currentRevision: string;
}

function studioLocation(location: Location): boolean {
  return (
    location.protocol === "http:" &&
    location.hostname === "127.0.0.1"
  );
}

async function responseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok || !payload) {
    throw new Error(
      payload?.error || `로컬 companion 요청에 실패했습니다 (${response.status}).`,
    );
  }
  return payload;
}

export async function detectCompanion(
  location: Location = window.location,
  fetchImpl: typeof fetch = fetch,
): Promise<CompanionStatus | null> {
  if (!studioLocation(location)) return null;
  try {
    const response = await fetchImpl("/api/companion/status", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return await responseJson<CompanionStatus>(response);
  } catch {
    return null;
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function companionPost<T>(
  path: string,
  status: CompanionStatus,
  body: unknown,
  fetchImpl: typeof fetch,
): Promise<T> {
  const response = await fetchImpl(path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-Siteboard-CSRF": status.csrfToken,
    },
    body: JSON.stringify(body),
  });
  return responseJson<T>(response);
}

export async function publishWithCompanion(
  status: CompanionStatus,
  input: {
    binding: {
      provider: "cloudflare-pages";
      accountId: string;
      projectName: string;
      projectId: string;
      publicOrigin: string;
      existedWhenBound: boolean;
      boundAt: string;
    };
    documentName: string;
    publicUrl: string;
    archive: Uint8Array;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<DeploymentMutationResult> {
  return companionPost(
    "/api/publish",
    status,
    {
      binding: input.binding,
      documentName: input.documentName,
      publicUrl: input.publicUrl,
      archiveBase64: bytesToBase64(input.archive),
    },
    fetchImpl,
  );
}

export async function inspectCloudflareTarget(
  status: CompanionStatus,
  input: { projectName: string; publicOrigin: string },
  fetchImpl: typeof fetch = fetch,
): Promise<CloudflareTarget> {
  return companionPost(
    "/api/project-target",
    status,
    input,
    fetchImpl,
  );
}

export async function loadStartupProject(
  fetchImpl: typeof fetch = fetch,
): Promise<{ fileName: string; content: string }> {
  const response = await fetchImpl("/api/startup-project", {
    credentials: "same-origin",
    cache: "no-store",
  });
  return responseJson(response);
}

export async function loadDeploymentState(
  projectName: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DeploymentState> {
  const response = await fetchImpl(
    `/api/deployments?project=${encodeURIComponent(projectName)}`,
    {
      credentials: "same-origin",
      cache: "no-store",
    },
  );
  return responseJson<DeploymentState>(response);
}

export async function rollbackWithCompanion(
  status: CompanionStatus,
  input: {
    binding: {
      provider: "cloudflare-pages";
      accountId: string;
      projectName: string;
      projectId: string;
      publicOrigin: string;
      existedWhenBound: boolean;
      boundAt: string;
    };
    deploymentId: string;
    publicUrl: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<DeploymentMutationResult> {
  return companionPost("/api/rollback", status, input, fetchImpl);
}
