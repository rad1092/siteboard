import type { SiteboardRuntime } from "../../platform/runtime";

const STUDIO_RELEASE_URL =
  "https://github.com/rad1092/siteboard/releases/latest";

interface PackageExportPanelProps {
  runtime: SiteboardRuntime;
  companionAvailable: boolean;
  errorCount: number;
  onExportZip(): void;
  onExportProject(): void;
}

export function PackageExportPanel({
  runtime,
  companionAvailable,
  errorCount,
  onExportZip,
  onExportProject,
}: PackageExportPanelProps) {
  const desktop = runtime === "desktop";
  return (
    <section className="editor-card deployment-card">
      <header>
        <p>{desktop ? "배포 파일" : "프로젝트와 배포 파일"}</p>
        <h3>
          {desktop
            ? "검사된 정적 홈페이지 ZIP을 컴퓨터에 만듭니다."
            : companionAvailable
              ? "정적 ZIP이나 다른 컴퓨터에서 열 프로젝트 파일을 저장합니다."
              : "작업 파일을 저장하고 로컬 Studio에서 배포할 수 있습니다."}
        </h3>
      </header>
      {!companionAvailable ? (
        <ol className="studio-steps">
          {desktop ? (
            <>
              <li>필수 내용과 연락 링크 검사를 마칩니다.</li>
              <li>현재 미리보기와 같은 정적 파일을 ZIP으로 저장합니다.</li>
              <li>Cloudflare 인증은 별도 Studio에서만 사용합니다.</li>
            </>
          ) : (
            <>
              <li>현재 작업 파일을 저장합니다.</li>
              <li>
                Siteboard Studio를 설치하고 작업 파일과 함께
                실행합니다.
              </li>
              <li>
                Studio에서 Cloudflare 대상을 확인한 뒤 배포합니다.
              </li>
            </>
          )}
        </ol>
      ) : null}
      <div className="deployment-actions">
        <button
          className={desktop ? "publish-button" : undefined}
          type="button"
          disabled={errorCount > 0}
          onClick={onExportZip}
        >
          {desktop ? "배포용 ZIP 저장" : "ZIP 내보내기"}
        </button>
        <button type="button" onClick={onExportProject}>
          {desktop
            ? "프로젝트 파일로 저장"
            : "Studio용 작업 파일 저장"}
        </button>
        {!companionAvailable && runtime !== "desktop" ? (
          <a
            href={STUDIO_RELEASE_URL}
            target="_blank"
            rel="noreferrer"
          >
            Cloudflare 배포 Studio ↗
          </a>
        ) : null}
      </div>
    </section>
  );
}
