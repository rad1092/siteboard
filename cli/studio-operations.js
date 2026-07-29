import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractDeploymentArchive } from "./archive.js";
import {
  archiveRevision,
  validateProjectName,
} from "./cloudflare.js";
import { verifyLiveUrl } from "./live-verify.js";

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
  constructor({ cloudflare, history, verify = verifyLiveUrl }) {
    this.cloudflare = cloudflare;
    this.history = history;
    this.verify = verify;
  }

  async status() {
    return this.cloudflare.authStatus();
  }

  async verifySafely(url) {
    try {
      return await this.verify(url);
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

  async publish({ projectName, documentName, publicUrl, archiveBase64 }) {
    validateProjectName(projectName);
    const workDirectory = await mkdtemp(join(tmpdir(), "siteboard-publish-"));
    let revision = "";

    try {
      const extracted = await extractDeploymentArchive(
        archiveBase64,
        workDirectory,
      );
      revision = archiveRevision(extracted.archiveBytes);
      const deployment = await this.cloudflare.publish({
        directory: workDirectory,
        projectName,
        revision,
      });
      const liveUrl =
        (typeof publicUrl === "string" && publicUrl.trim()) ||
        deployment.productionUrl ||
        deployment.deploymentUrl;
      const verification = await this.verifySafely(liveUrl);
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
        warning: persisted.warning,
      };
    } catch (error) {
      const message = safeMessage(error);
      await this.recordFailure({
        operation: "publish",
        status: "failed",
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

  async rollback({ projectName, deploymentId, publicUrl }) {
    validateProjectName(projectName);
    try {
      const deployment = await this.cloudflare.rollback({
        projectName,
        deploymentId,
      });
      const liveUrl =
        (typeof publicUrl === "string" && publicUrl.trim()) ||
        deployment.productionUrl ||
        deployment.deploymentUrl;
      const verification = await this.verifySafely(liveUrl);
      const persisted = await this.persistOutcome({
        operation: "rollback",
        status: verification.ok ? "recovered" : "recovery-failed",
        projectName,
        deploymentId: deployment.deploymentId,
        deploymentUrl: deployment.deploymentUrl,
        productionUrl: liveUrl,
        verification,
      }, "recovered-history-error");
      return {
        record: persisted.record,
        deployment,
        verification,
        history: persisted.history,
        deployments: await this.safeDeployments(projectName),
        warning: persisted.warning,
      };
    } catch (error) {
      const message = safeMessage(error);
      await this.recordFailure({
        operation: "rollback",
        status: "rollback-failed",
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
