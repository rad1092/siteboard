import type {
  CompanionStatus,
  DeploymentRecord,
} from "../deployment";
import type { WorkspaceState } from "../project-file";
import type { DesktopRuntimeStatus } from "../platform/desktop-projects";
import type { SiteboardRuntime } from "../platform/runtime";
import type { SiteDocument } from "../types";

const STUDIO_RELEASE_URL =
  "https://github.com/rad1092/siteboard/releases/latest";

export function deploymentStatusLabel(
  record: DeploymentRecord | null,
): string {
  if (!record) return "아직 배포하지 않음";
  if (record.status === "live") return "운영 중";
  if (record.status === "deployed-history-error") {
    return "배포됨 · 로컬 이력 확인 필요";
  }
  if (record.status === "recovered") return "이전 버전으로 복구됨";
  if (record.status === "recovered-history-error") {
    return "복구됨 · 로컬 이력 확인 필요";
  }
  if (record.status === "verification-failed") {
    return "배포됨 · 응답 확인 필요";
  }
  if (record.status === "recovery-failed") {
    return "복구됨 · 응답 확인 필요";
  }
  if (record.status === "rollback-failed") return "복구 실패";
  if (record.status === "outcome-unknown") return "배포 결과 확인 필요";
  if (record.status === "rollback-outcome-unknown") {
    return "복구 결과 확인 필요";
  }
  return "배포 실패";
}

interface ProjectDashboardProps {
  document: SiteDocument;
  workspace: WorkspaceState;
  hasExistingProject: boolean;
  companionState: "checking" | "available" | "unavailable";
  companion: CompanionStatus | null;
  runtime: SiteboardRuntime;
  desktopStatus: DesktopRuntimeStatus | null;
  onContinue(): void;
  onCreate(): void;
  onOpen(): void;
  onExport(): void;
}

export function ProjectDashboard({
  document,
  workspace,
  hasExistingProject,
  companionState,
  companion,
  runtime,
  desktopStatus,
  onContinue,
  onCreate,
  onOpen,
  onExport,
}: ProjectDashboardProps) {
  const lastDeployment = workspace.lastDeployment;
  const binding = workspace.binding;
  return (
    <main className="start-screen" id="dashboard">
      <header className="dashboard-heading">
        <p className="start-kicker">
          SITEBOARD / {runtime === "desktop" ? "DESKTOP" : "OPERATIONS"}
        </p>
        <h1>홈페이지 운영</h1>
        <p>
          {runtime === "desktop"
            ? "컴퓨터의 프로젝트 파일을 열어 편집하고, 미리보고, 배포 파일을 만듭니다."
            : "최근 작업을 열고, 편집부터 실제 배포와 복구까지 이어갑니다."}
        </p>
      </header>

      <section className="recent-projects" aria-labelledby="recent-title">
        <div className="dashboard-section-heading">
          <div>
            <p>현재 작업</p>
            <h2 id="recent-title">
              {hasExistingProject
                ? "이어서 편집할 홈페이지"
                : "첫 홈페이지 만들기"}
            </h2>
          </div>
          <div className="start-actions">
            <button
              className="primary-button"
              type="button"
              onClick={onCreate}
            >
              새 홈페이지 만들기
            </button>
            <button type="button" onClick={onOpen}>
              작업 파일 열기
            </button>
            {hasExistingProject ? (
              <button type="button" onClick={onExport}>
                {runtime === "desktop"
                  ? "프로젝트 파일로 저장"
                  : "Studio용 작업 파일 저장"}
              </button>
            ) : null}
          </div>
        </div>
        {hasExistingProject ? (
          <article className="project-row">
            <div>
              <span
                className={`deployment-dot deployment-dot--${lastDeployment?.status ?? "empty"}`}
                aria-hidden="true"
              />
              <div>
                <strong>
                  {document.site.name.trim() || "이름 없는 홈페이지"}
                </strong>
                <p>
                  {binding
                    ? binding.publicOrigin ||
                      `${binding.projectName}.pages.dev`
                    : "Cloudflare 배포 대상 미연결"}
                </p>
              </div>
            </div>
            <dl>
              <div>
                <dt>상태</dt>
                <dd>{deploymentStatusLabel(lastDeployment)}</dd>
              </div>
              <div>
                <dt>최근 수정</dt>
                <dd>
                  {new Intl.DateTimeFormat("ko-KR", {
                    dateStyle: "medium",
                  }).format(new Date(document.updatedAt))}
                </dd>
              </div>
              <div>
                <dt>리비전</dt>
                <dd>{lastDeployment?.revision?.slice(0, 12) || "—"}</dd>
              </div>
            </dl>
            <div className="project-row-actions">
              {lastDeployment?.productionUrl ? (
                <a
                  href={lastDeployment.productionUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  운영 사이트 ↗
                </a>
              ) : null}
              <button
                className="primary-button"
                type="button"
                onClick={onContinue}
              >
                계속 편집
              </button>
            </div>
          </article>
        ) : (
          <div className="empty-project">
            <strong>저장된 프로젝트가 없습니다.</strong>
            <p>
              {runtime === "desktop"
                ? "내용을 만든 뒤 프로젝트와 배포용 ZIP을 컴퓨터에 저장할 수 있습니다."
                : "내용을 만든 뒤 ZIP으로 보관하거나 Studio에서 바로 배포할 수 있습니다."}
            </p>
          </div>
        )}
      </section>

      <section
        className="companion-summary"
        aria-labelledby="companion-title"
      >
        <div>
          <p>{runtime === "desktop" ? "실행 환경" : "로컬 배포 연결"}</p>
          <h2 id="companion-title">
            {runtime === "desktop"
              ? "Siteboard Desktop"
              : companionState === "checking"
                ? "Studio 확인 중"
                : companionState === "available"
                  ? "Studio 연결됨"
                  : "브라우저 편집 모드"}
          </h2>
        </div>
        <p>
          {runtime === "desktop"
            ? desktopStatus?.activeProjectPath
              ? `${desktopStatus.activeProjectName ?? "프로젝트"} 파일에 자동 저장합니다. Cloudflare 자격 증명은 프로젝트 파일에 넣지 않습니다.`
              : "앱 데이터 폴더에 복구 가능한 자동 저장본을 유지합니다. 이름을 정한 프로젝트 파일은 ‘작업 파일 백업’으로 저장하세요."
            : companionState === "available"
              ? companion?.cloudflare.authenticated
                ? "Cloudflare 인증을 확인했습니다. 편집 화면에서 배포와 복구를 실행할 수 있습니다."
                : "Studio는 연결됐지만 Cloudflare 로그인이 필요합니다."
              : hasExistingProject
                ? "작업 파일을 저장한 뒤 로컬 Studio의 ‘작업 파일 열기’로 이어서 배포할 수 있습니다."
                : "배포와 복구는 컴퓨터에서 siteboard studio를 실행한 뒤 사용할 수 있습니다. ZIP 내보내기는 그대로 제공됩니다."}
        </p>
        {runtime !== "desktop" && companionState === "unavailable" ? (
          <a
            className="studio-install-link"
            href={STUDIO_RELEASE_URL}
            target="_blank"
            rel="noreferrer"
          >
            Studio 설치 ↗
          </a>
        ) : null}
      </section>
    </main>
  );
}

