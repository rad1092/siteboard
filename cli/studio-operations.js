import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  extractDeploymentArchive,
  writeRevisionMarker,
} from "./archive.js";
import {
  RemoteOutcomeUnknownError,
  archiveRevision,
  validateProjectName,
} from "./cloudflare.js";
import {
  verifyImmutableDeployment,
  verifyLiveUrl,
} from "./live-verify.js";

function safeMessage(error) {
  const value = error instanceof Error ? error.message : "작업을 완료하지 못했습니다.";
  return value
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[redacted]")
    .slice(0, 500);
}

function cleanDocumentName(value) {
  return typeof value === "string"
    ? value.trim().replace(/[\r\n\t]/g, " ").slice(0, 120)
    : "";
}

function normalizePublicOrigin(value) {
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

function transientRecord(input, status, message) {
  return Object.freeze({
    ...input,
    status,
    message,
    schemaVersion: 1,
    eventId: `unrecorded-${randomUUID()}`,
    createdAt: new Date().toISOString(),
  });
}

export class StudioOperations {
  constructor({
    cloudflare,
    history,
    verify = verifyLiveUrl,
    verifyImmutable = verifyImmutableDeployment,
  }) {
    this.cloudflare = cloudflare;
    this.history = history;
    this.verify = verify;
    this.verifyImmutable = verifyImmutable;
  }

  async status() {
    return this.cloudflare.authStatus();
  }

  async verifySafely(url, revision) {
    try {
      return await this.verify(url, { expectedRevision: revision });
    } catch (error) {
      return {
        ok: false,
        checkedAt: new Date().toISOString(),
        status: 0,
        url,
        message: safeMessage(error),
      };
    }
  }

  async inspectTarget(input) {
    return this.cloudflare.inspectTarget(input);
  }

  async persistOutcome(input, historyErrorStatus) {
    let record;
    try {
      record = await this.history.append(input);
    } catch (error) {
      const warning = `원격 작업은 완료됐지만 로컬 이력을 기록하지 못했습니다: ${safeMessage(error)}`;
      return {
        record: transientRecord(input, historyErrorStatus, warning),
        history: [],
        warning,
      };
    }

    try {
      return {
        record,
        history: await this.history.list(input.projectName),
        warning: "",
      };
    } catch (error) {
      return {
        record,
        history: [record],
        warning: `원격 작업과 로컬 기록은 완료됐지만 이력 목록을 다시 읽지 못했습니다: ${safeMessage(error)}`,
      };
    }
  }

  async recordFailure(input) {
    try {
      await this.history.append(input);
    } catch {
      // The original operation error remains the actionable result.
    }
  }

  async publish({ binding, documentName, publicUrl, archiveBase64 }) {
    const projectName = binding?.projectName ?? "";
    validateProjectName(projectName);
    const requestedOrigin = normalizePublicOrigin(publicUrl);
    const boundOrigin = normalizePublicOrigin(binding?.publicOrigin);
    if (requestedOrigin !== boundOrigin) {
      throw new Error(
        "작업 파일의 공개 주소가 확인한 Cloudflare 연결과 다릅니다. 배포 대상을 다시 연결하세요.",
      );
    }
    const workDirectory = await mkdtemp(join(tmpdir(), "siteboard-publish-"));
    let revision = "";

    try {
      const extracted = await extractDeploymentArchive(
        archiveBase64,
        workDirectory,
      );
      revision = archiveRevision(extracted.archiveBytes);
      await writeRevisionMarker(workDirectory, revision);
      const deployment = await this.cloudflare.publish({
        directory: workDirectory,
        binding,
        revision,
      });
      let target = deployment.target;
      if (
        !target ||
        !target.projectId ||
        target.accountId !== binding.accountId ||
        target.projectName !== projectName ||
        target.currentDeploymentId !== deployment.deploymentId
      ) {
        throw new RemoteOutcomeUnknownError(
          "Cloudflare production과 연결 프로젝트를 한 결과로 확인하지 못했습니다.",
        );
      }
      const liveUrl =
        requestedOrigin ||
        target.pagesOrigin ||
        target.currentUrl ||
        deployment.productionUrl ||
        deployment.deploymentUrl;
      let verification = await this.verifySafely(liveUrl, revision);
      if (verification.ok) {
        try {
          const confirmed = await this.cloudflare.confirmCanonical({
            binding: {
              ...binding,
              projectId: target.projectId,
              existedWhenBound: true,
            },
            deploymentId: deployment.deploymentId,
            revision,
          });
          if (confirmed) {
            target = confirmed;
          } else {
            verification = {
              ...verification,
              ok: false,
              message:
                "공개 확인 중 Cloudflare production이 다른 배포로 바뀌었습니다.",
            };
          }
        } catch (error) {
          verification = {
            ...verification,
            ok: false,
            message: `공개 확인 뒤 Cloudflare production을 다시 확인하지 못했습니다: ${safeMessage(error)}`,
          };
        }
      }
      const persisted = await this.persistOutcome({
        operation: "publish",
        status: verification.ok ? "live" : "verification-failed",
        projectName,
        documentName: cleanDocumentName(documentName),
        revision,
        deploymentId: deployment.deploymentId,
        deploymentUrl: deployment.deploymentUrl,
        productionUrl: liveUrl,
        createdProject: deployment.createdProject,
        verification,
      }, "deployed-history-error");
      return {
        record: persisted.record,
        deployment,
        verification,
        history: persisted.history,
        deployments: await this.safeDeployments(projectName),
        target,
        warning: persisted.warning,
      };
    } catch (error) {
      const message = safeMessage(error);
      await this.recordFailure({
        operation: "publish",
        status:
          error instanceof RemoteOutcomeUnknownError
            ? "outcome-unknown"
            : "failed",
        projectName,
        documentName: cleanDocumentName(documentName),
        revision,
        message,
      });
      throw new Error(message, { cause: error });
    } finally {
      await rm(workDirectory, { recursive: true, force: true });
    }
  }

  async rollback({ binding, deploymentId, publicUrl }) {
    const projectName = binding?.projectName ?? "";
    validateProjectName(projectName);
    const requestedOrigin = normalizePublicOrigin(publicUrl);
    const boundOrigin = normalizePublicOrigin(binding?.publicOrigin);
    if (requestedOrigin !== boundOrigin) {
      throw new Error(
        "작업 파일의 공개 주소가 확인한 Cloudflare 연결과 다릅니다. 복구 대상을 다시 연결하세요.",
      );
    }
    try {
      const deployment = await this.cloudflare.rollback({
        binding,
        deploymentId,
        verifyTarget: async ({ deploymentUrl, commitHash }) => {
          const verification = await this.verifyImmutable(deploymentUrl, {
            expectedCommitHash: commitHash,
          });
          if (!verification?.ok) {
            throw new Error(
              verification?.message ||
                "선택한 고정 배포 주소의 파일을 확인하지 못했습니다.",
            );
          }
          return verification;
        },
      });
      const liveUrl =
        requestedOrigin ||
        deployment.target?.pagesOrigin ||
        deployment.target?.currentUrl ||
        deployment.productionUrl ||
        deployment.deploymentUrl;
      let verification = await this.verifySafely(
        liveUrl,
        deployment.revision,
      );
      if (verification.ok) {
        try {
          const confirmed = await this.cloudflare.confirmCanonical({
            binding,
            deploymentId: deployment.deploymentId,
            revision: deployment.revision,
          });
          if (!confirmed) {
            verification = {
              ...verification,
              ok: false,
              message:
                "공개 확인 중 Cloudflare production이 다른 배포로 바뀌었습니다.",
            };
          }
        } catch (error) {
          verification = {
            ...verification,
            ok: false,
            message: `공개 확인 뒤 Cloudflare production을 다시 확인하지 못했습니다: ${safeMessage(error)}`,
          };
        }
      }
      const persisted = await this.persistOutcome({
        operation: "rollback",
        status: verification.ok ? "recovered" : "recovery-failed",
        projectName,
        deploymentId: deployment.deploymentId,
        deploymentUrl: deployment.deploymentUrl,
        productionUrl: liveUrl,
        revision: deployment.revision,
        verification,
      }, "recovered-history-error");
      return {
        record: persisted.record,
        deployment,
        verification,
        history: persisted.history,
        deployments: await this.safeDeployments(projectName),
        target: deployment.target,
        warning: persisted.warning,
      };
    } catch (error) {
      const message = safeMessage(error);
      await this.recordFailure({
        operation: "rollback",
        status:
          error instanceof RemoteOutcomeUnknownError
            ? "rollback-outcome-unknown"
            : "rollback-failed",
        projectName,
        deploymentId,
        message,
      });
      throw new Error(message, { cause: error });
    }
  }

  async safeDeployments(projectName) {
    try {
      return await this.cloudflare.listDeployments(projectName);
    } catch {
      return [];
    }
  }

  async deploymentState(projectName) {
    validateProjectName(projectName);
    const [history, deployments] = await Promise.all([
      this.history.list(projectName),
      this.safeDeployments(projectName),
    ]);
    return { history, deployments };
  }
}
