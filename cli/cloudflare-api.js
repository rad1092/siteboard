function authHeaders(credentials) {
  if (
    (credentials.type === "api_token" || credentials.type === "oauth") &&
    typeof credentials.token === "string"
  ) {
    return { Authorization: `Bearer ${credentials.token}` };
  }

  if (
    credentials.type === "api_key" &&
    typeof credentials.key === "string" &&
    typeof credentials.email === "string"
  ) {
    return {
      "X-Auth-Key": credentials.key,
      "X-Auth-Email": credentials.email,
    };
  }

  throw new Error("Cloudflare authentication is unavailable.");
}

function apiErrorMessage(payload, status) {
  const first = Array.isArray(payload?.errors) ? payload.errors[0] : null;
  const message =
    first && typeof first.message === "string"
      ? first.message
      : `Cloudflare API request failed (${status}).`;
  return message.slice(0, 500);
}

export class CloudflareApiError extends Error {
  constructor(message, { status, code = "" } = {}) {
    super(message);
    this.name = "CloudflareApiError";
    this.status = status;
    this.code = code;
  }
}

export class CloudflareApiClient {
  constructor({
    fetchImpl = fetch,
    apiBaseUrl =
      process.env.CLOUDFLARE_API_BASE_URL ??
      "https://api.cloudflare.com/client/v4",
  } = {}) {
    this.fetchImpl = fetchImpl;
    this.apiBaseUrl = apiBaseUrl.replace(/\/+$/, "");
  }

  async request(path, { credentials, method = "GET", body } = {}) {
    const response = await this.fetchImpl(`${this.apiBaseUrl}${path}`, {
      method,
      headers: {
        ...authHeaders(credentials),
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000),
    });

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new CloudflareApiError(
        `Cloudflare API returned an invalid response (${response.status}).`,
        { status: response.status },
      );
    }

    if (!response.ok || payload?.success !== true || payload.result == null) {
      const first = Array.isArray(payload?.errors) ? payload.errors[0] : null;
      throw new CloudflareApiError(apiErrorMessage(payload, response.status), {
        status: response.status,
        code:
          first && (typeof first.code === "number" || typeof first.code === "string")
            ? String(first.code)
            : "",
      });
    }
    return payload.result;
  }

  async getProject({ accountId, projectName, credentials }) {
    return this.request(
      `/accounts/${encodeURIComponent(accountId)}` +
        `/pages/projects/${encodeURIComponent(projectName)}`,
      { credentials },
    );
  }

  async listProductionDeployments({
    accountId,
    projectName,
    credentials,
  }) {
    const result = await this.request(
      `/accounts/${encodeURIComponent(accountId)}` +
        `/pages/projects/${encodeURIComponent(projectName)}` +
        "/deployments?env=production&per_page=25",
      { credentials },
    );
    return Array.isArray(result) ? result : [];
  }

  async rollbackDeployment({
    accountId,
    projectName,
    deploymentId,
    credentials,
  }) {
    return this.request(
      `/accounts/${encodeURIComponent(accountId)}` +
        `/pages/projects/${encodeURIComponent(projectName)}` +
        `/deployments/${encodeURIComponent(deploymentId)}/rollback`,
      { credentials, method: "POST", body: {} },
    );
  }
}
