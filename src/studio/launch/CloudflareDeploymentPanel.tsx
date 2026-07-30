import type { CompanionStatus } from "../../deployment";
import { isValidProjectName } from "../../project-file";
import { Field } from "../Field";
import type { CompanionState } from "../workspace/types";
import type { DeploymentActionState } from "./useDeploymentManager";

interface CloudflareDeploymentPanelProps {
  companionState: CompanionState;
  companion: CompanionStatus;
  pagesProject: string;
  bindingReady: boolean;
  publicOriginValid: boolean;
  errorCount: number;
  action: DeploymentActionState;
  onProjectChange(project: string): void;
  onBind(): void;
  onPublish(): void;
  onRefresh(): void;
}

export function CloudflareDeploymentPanel({
  companionState,
  companion,
  pagesProject,
  bindingReady,
  publicOriginValid,
  errorCount,
  action,
  onProjectChange,
  onBind,
  onPublish,
  onRefresh,
}: CloudflareDeploymentPanelProps) {
  return (
    <section className="editor-card deployment-card">
      <header>
        <p>Cloudflare Pages</p>
        <h3>배포하고 실제 공개 주소를 확인합니다.</h3>
      </header>
      <Field
        label="Cloudflare Pages 프로젝트"
        hint="영문 소문자, 숫자, 가운데 하이픈을 사용합니다. 없으면 첫 배포 때 만듭니다."
      >
        <input
          value={pagesProject}
          spellCheck={false}
          onChange={(event) => onProjectChange(event.target.value)}
        />
      </Field>

      <div
        className={`companion-state companion-state--${companionState}`}
        role="status"
      >
        <span aria-hidden="true" />
        <div>
          <strong>
            {companion.cloudflare.authenticated
              ? "로컬 Studio와 Cloudflare 연결됨"
              : "Studio 연결됨 · Cloudflare 로그인 필요"}
          </strong>
          <p>
            {companion.cloudflare.authenticated
              ? companion.cloudflare.selectedAccountId
                ? "토큰은 브라우저로 전달하거나 저장하지 않습니다."
                : "계정이 여러 개면 CLOUDFLARE_ACCOUNT_ID를 지정하고 Studio를 다시 실행하세요."
              : "터미널에서 wrangler login을 실행하고 Studio를 다시 시작하세요."}
          </p>
        </div>
      </div>

      <div className="binding-summary" role="status">
        <strong>
          {bindingReady
            ? `${pagesProject.trim()} 연결됨`
            : "배포 대상 확인 필요"}
        </strong>
        <p>
          {bindingReady
            ? "현재 프로젝트 파일에 확인된 배포 대상이 연결돼 있습니다."
            : "기존 프로젝트를 자동 재사용하지 않습니다. 대상을 확인해 명시적으로 연결하세요."}
        </p>
      </div>

      <div className="deployment-actions">
        <button
          type="button"
          disabled={
            action !== "idle" ||
            !companion.cloudflare.authenticated ||
            !isValidProjectName(pagesProject.trim()) ||
            !publicOriginValid
          }
          onClick={onBind}
        >
          대상 확인 및 연결
        </button>
        <button
          className="publish-button"
          type="button"
          disabled={
            errorCount > 0 ||
            action !== "idle" ||
            !companion.cloudflare.authenticated ||
            !companion.cloudflare.selectedAccountId ||
            !bindingReady
          }
          onClick={onPublish}
        >
          {action === "publishing"
            ? "배포하고 확인하는 중…"
            : "새 리비전 배포"}
        </button>
        <button
          type="button"
          disabled={action !== "idle"}
          onClick={onRefresh}
        >
          배포 이력 새로고침
        </button>
      </div>
      <p className="package-note">
        인증과 배포 이력은 이 컴퓨터의 로컬 Studio에서만 관리합니다.
      </p>
    </section>
  );
}
