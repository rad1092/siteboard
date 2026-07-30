import { useState } from "react";
import { createDeploymentZip } from "../../archive";
import {
  inspectCloudflareTarget,
  loadDeploymentState,
  publishWithCompanion,
  rollbackWithCompanion,
  type CompanionStatus,
  type DeploymentRecord,
  type DeploymentState,
} from "../../deployment";
import {
  addSnapshot,
  createSnapshot,
  isValidProjectName,
  normalizePublicOrigin,
  type CloudflareProjectBinding,
  type WorkspaceState,
} from "../../project-file";
import type { SiteDocument, ValidationIssue } from "../../types";
import type {
  CompanionState,
  SaveState,
} from "../workspace/types";
import type { StoreWorkspace } from "./types";

export type DeploymentActionState =
  | "idle"
  | "publishing"
  | "rolling-back";

interface UseDeploymentManagerOptions {
  document: SiteDocument;
  workspace: WorkspaceState;
  errors: ValidationIssue[];
  companionState: CompanionState;
  companion: CompanionStatus | null;
  commitDocument(document: SiteDocument): void;
  storeWorkspace: StoreWorkspace;
  setSaveState(state: SaveState): void;
  setFeedback(message: string): void;
}

function timestampDocument(document: SiteDocument): SiteDocument {
  return { ...document, updatedAt: new Date().toISOString() };
}

export function useDeploymentManager({
  document,
  workspace,
  errors,
  companionState,
  companion,
  commitDocument,
  storeWorkspace,
  setSaveState,
  setFeedback,
}: UseDeploymentManagerOptions) {
  const [deploymentAction, setDeploymentAction] =
    useState<DeploymentActionState>("idle");
  const boundProjectName = workspace.binding?.projectName ?? "";
  const [deploymentCache, setDeploymentCache] = useState<{
    projectName: string;
    state: DeploymentState;
  }>({
    projectName: boundProjectName,
    state: { history: [], deployments: [] },
  });
  const deploymentState =
    deploymentCache.projectName === boundProjectName
      ? deploymentCache.state
      : { history: [], deployments: [] };
  const setDeploymentState = (state: DeploymentState) =>
    setDeploymentCache({ projectName: boundProjectName, state });
  const [pagesDraft, setPagesDraft] = useState({
    binding: boundProjectName,
    value: boundProjectName,
  });
  const pagesProject =
    pagesDraft.binding === boundProjectName
      ? pagesDraft.value
      : boundProjectName;
  const setPagesProject = (value: string) =>
    setPagesDraft({ binding: boundProjectName, value });
  const draftPublicOrigin = normalizePublicOrigin(
    document.site.baseUrl,
  );
  const bindingReady = Boolean(
    workspace.binding &&
      workspace.binding.projectName === pagesProject.trim() &&
      draftPublicOrigin !== null &&
      workspace.binding.publicOrigin === draftPublicOrigin,
  );

  const rememberDeployment = (
    record: DeploymentRecord,
    options: {
      binding?: CloudflareProjectBinding | null;
      snapshots?: WorkspaceState["snapshots"];
    } = {},
  ) =>
    storeWorkspace({
      schemaVersion: 1,
      binding:
        options.binding === undefined
          ? workspace.binding
          : options.binding,
      snapshots: options.snapshots ?? workspace.snapshots,
      lastDeployment: record,
    });

  const bindCloudflareTarget = async () => {
    const normalizedProject = pagesProject.trim();
    if (!companion || companionState !== "available") {
      setFeedback(
        "로컬 Studio에서만 Cloudflare 배포 대상을 연결할 수 있습니다.",
      );
      return;
    }
    if (!companion.cloudflare.authenticated) {
      setFeedback(
        "터미널에서 wrangler login을 실행한 뒤 Studio를 다시 시작하세요.",
      );
      return;
    }
    if (!isValidProjectName(normalizedProject)) {
      setFeedback(
        "프로젝트 이름은 영문 소문자와 숫자, 가운데 하이픈으로 1~58자까지 입력하세요.",
      );
      return;
    }
    if (draftPublicOrigin === null) {
      setFeedback(
        "공개 주소는 경로가 없는 HTTPS 주소로 입력하세요.",
      );
      return;
    }
    setDeploymentAction("publishing");
    setFeedback("Cloudflare 배포 대상을 확인하고 있습니다.");
    try {
      const target = await inspectCloudflareTarget(companion, {
        projectName: normalizedProject,
        publicOrigin: draftPublicOrigin,
      });
      if (
        target.exists &&
        !window.confirm(
          `${target.projectName} 프로젝트의 현재 production과 도메인을 확인했습니다. 이 작업 파일을 해당 프로젝트에 연결할까요?`,
        )
      ) {
        setFeedback("기존 Cloudflare 프로젝트를 연결하지 않았습니다.");
        return;
      }
      const binding: CloudflareProjectBinding = {
        provider: "cloudflare-pages",
        accountId: target.accountId,
        projectName: target.projectName,
        projectId: target.projectId,
        publicOrigin: target.publicOrigin,
        existedWhenBound: target.exists,
        boundAt: new Date().toISOString(),
      };
      if (!storeWorkspace({ ...workspace, binding })) return;
      setFeedback(
        target.exists
          ? `${target.projectName}의 현재 production을 배포 대상으로 연결했습니다.`
          : `${target.projectName} 이름이 비어 있음을 확인했습니다. 첫 배포 때 새 프로젝트를 만듭니다.`,
      );
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Cloudflare 배포 대상을 확인하지 못했습니다.",
      );
    } finally {
      setDeploymentAction("idle");
    }
  };

  const refreshDeploymentHistory = async () => {
    if (!companion || !bindingReady || !workspace.binding) {
      setFeedback(
        "먼저 Cloudflare 배포 대상을 확인해 연결하세요.",
      );
      return;
    }
    try {
      setDeploymentState(
        await loadDeploymentState(pagesProject.trim()),
      );
      setFeedback("Cloudflare 배포 이력을 새로 확인했습니다.");
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "배포 이력을 확인하지 못했습니다.",
      );
    }
  };

  const publishWebsite = async () => {
    if (!companion) {
      setFeedback(
        "컴퓨터에서 siteboard studio를 실행한 뒤 다시 열어 주세요.",
      );
      return;
    }
    if (!companion.cloudflare.authenticated) {
      setFeedback(
        "터미널에서 wrangler login을 실행한 뒤 Studio를 다시 시작하세요.",
      );
      return;
    }
    if (errors.length) {
      setFeedback(
        `배포 전에 ${errors.length}개 필수 항목을 확인해 주세요.`,
      );
      return;
    }
    if (!workspace.binding || !bindingReady) {
      setFeedback(
        "배포 전에 Cloudflare 대상을 확인해 연결하세요.",
      );
      return;
    }

    const normalizedProject = pagesProject.trim();
    const predeploySnapshot = createSnapshot(
      document,
      `배포 전 ${new Intl.DateTimeFormat("ko-KR", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date())}`,
    );
    const nextSnapshots = addSnapshot(
      workspace.snapshots,
      predeploySnapshot,
    );
    if (
      !storeWorkspace({
        ...workspace,
        snapshots: nextSnapshots,
      })
    ) {
      return;
    }

    setDeploymentAction("publishing");
    setFeedback(
      "Cloudflare Pages에 새 리비전을 배포하고 있습니다.",
    );
    try {
      const result = await publishWithCompanion(companion, {
        binding: workspace.binding,
        documentName: document.site.name,
        publicUrl: document.site.baseUrl,
        archive: createDeploymentZip(document),
      });
      const deployedOrigin =
        normalizePublicOrigin(
          result.target?.pagesOrigin ||
            result.target?.currentUrl ||
            result.deployment.productionUrl,
        ) || "";
      const nextOrigin = draftPublicOrigin || deployedOrigin;
      const nextBinding: CloudflareProjectBinding = {
        ...workspace.binding,
        projectId:
          result.target?.projectId || workspace.binding.projectId,
        publicOrigin: nextOrigin,
        existedWhenBound: true,
        boundAt: new Date().toISOString(),
      };
      if (!document.site.baseUrl.trim() && nextOrigin) {
        commitDocument(
          timestampDocument({
            ...document,
            site: { ...document.site, baseUrl: nextOrigin },
          }),
        );
        setSaveState("saving");
      }
      setDeploymentState({
        history: result.history,
        deployments: result.deployments,
      });
      rememberDeployment(result.record, {
        binding: nextBinding,
        snapshots: nextSnapshots,
      });
      setFeedback(
        result.warning
          ? `배포는 완료됐습니다. ${result.warning} 배포 ID ${result.deployment.deploymentId}`
          : result.verification.ok
            ? `배포와 공개 주소 확인을 마쳤습니다. 리비전 ${result.record.revision?.slice(0, 12) ?? ""}`
            : "배포는 완료됐지만 공개 주소 응답을 확인하지 못했습니다. 이력에서 상태를 확인하세요.",
      );
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "배포를 완료하지 못했습니다.",
      );
      try {
        setDeploymentState(
          await loadDeploymentState(normalizedProject),
        );
      } catch {
        // Keep the publish failure visible if history refresh also fails.
      }
    } finally {
      setDeploymentAction("idle");
    }
  };

  const rollbackDeployment = async (deploymentId: string) => {
    if (!companion || !workspace.binding || !bindingReady) {
      setFeedback(
        "복구 전에 Cloudflare 배포 대상을 다시 확인하세요.",
      );
      return;
    }
    if (
      !window.confirm(
        "선택한 정상 production 배포로 즉시 되돌릴까요? 현재 배포는 이력에 그대로 남습니다.",
      )
    ) {
      return;
    }
    setDeploymentAction("rolling-back");
    setFeedback("선택한 production 배포로 복구하고 있습니다.");
    try {
      const result = await rollbackWithCompanion(companion, {
        binding: workspace.binding,
        deploymentId,
        publicUrl:
          workspace.binding.publicOrigin ||
          document.site.baseUrl.trim(),
      });
      setDeploymentState({
        history: result.history,
        deployments: result.deployments,
      });
      rememberDeployment(result.record);
      setFeedback(
        result.warning
          ? `복구 요청은 완료됐습니다. ${result.warning} 배포 ID ${result.deployment.deploymentId}`
          : result.verification.ok
            ? "이전 production 배포로 복구하고 공개 주소까지 확인했습니다."
            : "복구 요청은 완료됐지만 공개 주소 응답을 확인하지 못했습니다.",
      );
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "이전 배포로 복구하지 못했습니다.",
      );
      try {
        setDeploymentState(
          await loadDeploymentState(pagesProject.trim()),
        );
      } catch {
        // Keep the rollback failure visible if history refresh also fails.
      }
    } finally {
      setDeploymentAction("idle");
    }
  };

  return {
    deploymentState,
    deploymentAction,
    pagesProject,
    setPagesProject,
    draftPublicOrigin,
    bindingReady,
    bindCloudflareTarget,
    refreshDeploymentHistory,
    publishWebsite,
    rollbackDeployment,
  };
}
