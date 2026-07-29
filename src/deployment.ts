export type DeploymentRecordStatus =
  | "live"
  | "failed"
  | "verification-failed"
  | "deployed-history-error"
  | "recovered"
  | "recovered-history-error"
  | "recovery-failed"
  | "rollback-failed";

export interface LiveVerification {
  ok: boolean;
  checkedAt: string;
  status: number;
  url: string;
  message?: string;
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

export interface CloudflareDeployment {
  deploymentId: string;
  url: string;
  status: string;
  source: string;
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
    history: boolean;
    rollback: boolean;
    liveVerify: boolean;
  };
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
  };
  verification: LiveVerification;
  warning?: string;
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
    projectName: string;
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
      projectName: input.projectName,
      documentName: input.documentName,
      publicUrl: input.publicUrl,
      archiveBase64: bytesToBase64(input.archive),
    },
    fetchImpl,
  );
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
  input: { projectName: string; deploymentId: string; publicUrl: string },
  fetchImpl: typeof fetch = fetch,
): Promise<DeploymentMutationResult> {
  return companionPost("/api/rollback", status, input, fetchImpl);
}
