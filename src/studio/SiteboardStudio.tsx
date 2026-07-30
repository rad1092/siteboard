import { useMemo, useState } from "react";
import { ProjectDashboard } from "../components/ProjectDashboard";
import { Preview } from "../components/Preview";
import { runtimeLabel } from "../platform/runtime";
import { generateStaticHtml, validateDocument } from "../site";
import type { ValidationIssue } from "../types";
import { ContentEditor, type ContentPanel } from "./ContentEditor";
import { LaunchEditor } from "./LaunchEditor";
import { getLaunchChecks } from "./launch-checks";
import { StructureEditor, StyleEditor } from "./StructureStyleEditor";
import { useProjectWorkspace } from "./useProjectWorkspace";

type EditorStep = "content" | "structure" | "style" | "launch";
type PreviewDevice = "desktop" | "mobile";

const steps: Array<[EditorStep, string, string]> = [
  ["content", "1", "내용"],
  ["structure", "2", "구성"],
  ["style", "3", "스타일"],
  ["launch", "4", "배포"],
];

export default function SiteboardStudio() {
  const [step, setStep] = useState<EditorStep>("content");
  const [contentPanel, setContentPanel] =
    useState<ContentPanel>("identity");
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const project = useProjectWorkspace();
  const {
    runtime,
    document,
    history,
    workspace: workspaceState,
    hasExistingProject,
    started,
    setStarted,
    recovery,
    setAutosaveAllowed,
    saveState,
    setSaveState,
    feedback,
    setFeedback,
    companionState,
    companion,
    desktopStatus,
    importInput,
    handleImport,
    openProjectFile,
    startNew,
    exportProject: exportProjectFile,
    acceptRecovery,
    downloadRecovery,
    openDashboard,
    undo,
    redo,
    commit,
    replaceDocument,
    commitDocument,
    storeWorkspace,
    saveDesktopArchive,
  } = project;

  const issues = useMemo(
    () => validateDocument(document),
    [document],
  );
  const errors = issues.filter((item) => item.level === "error");
  const warnings = issues.filter(
    (item) => item.level === "warning",
  );
  const previewHtml = useMemo(
    () => generateStaticHtml(document, { preview: true }),
    [document],
  );
  const launchChecks = getLaunchChecks(document, errors);

  const setTarget = (target: ValidationIssue["target"]) => {
    if (target === "style") {
      setStep("style");
      return;
    }
    if (target === "launch") {
      setStep("launch");
      return;
    }
    setStep("content");
    setContentPanel(target);
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href={started ? "#editor-main" : "#dashboard"}>
        {started ? "편집 화면으로 이동" : "프로젝트 화면으로 이동"}
      </a>
      <input
        className="sr-only"
        ref={importInput}
        type="file"
        accept="application/json,.json,.siteboard"
        aria-label="Siteboard 작업 파일 선택"
        onChange={handleImport}
      />

      <header className="app-header">
        <button
          className="brand-button"
          type="button"
          aria-label="Siteboard 프로젝트 화면"
          onClick={openDashboard}
        >
          <span aria-hidden="true">S</span>
          <strong>Siteboard</strong>
          <small>{runtimeLabel(runtime)}</small>
        </button>
        {started ? (
          <>
            <p
              className={`save-status save-status--${saveState}`}
              role="status"
              aria-live="polite"
            >
              {saveState === "saving"
                ? runtime === "desktop"
                  ? "프로젝트 저장 중"
                  : "웹 데모에 저장 중"
                : saveState === "error"
                  ? "저장 공간을 확인해 주세요"
                  : saveState === "recovery"
                    ? "복구 선택이 필요합니다"
                    : runtime === "desktop"
                      ? "프로젝트 저장됨"
                      : "웹 데모에 저장됨"}
            </p>
            <div className="header-actions">
              <div aria-label="되돌리기 기록">
                <button
                  type="button"
                  disabled={!history.past.length}
                  onClick={() => {
                    undo();
                  }}
                >
                  되돌리기
                </button>
                <button
                  type="button"
                  disabled={!history.future.length}
                  onClick={() => {
                    redo();
                  }}
                >
                  다시 실행
                </button>
              </div>
              <div aria-label="홈페이지 파일">
                <button type="button" onClick={startNew}>
                  새로 만들기
                </button>
                <button
                  type="button"
                  onClick={openProjectFile}
                >
                  작업 파일 열기
                </button>
                <button
                  type="button"
                  onClick={exportProjectFile}
                >
                  작업 파일 백업
                </button>
              </div>
              <button
                className="primary-button"
                type="button"
                onClick={() => setStep("launch")}
              >
                배포 관리
              </button>
            </div>
          </>
        ) : null}
      </header>

      {recovery ? (
        <section className="recovery-banner" role="alert">
          <div>
            <strong>
              {recovery.kind === "future-schema"
                ? "더 최신 버전에서 만든 저장 데이터가 있습니다."
                : runtime === "desktop"
                  ? "프로젝트 파일을 읽는 중 문제가 생겼습니다."
                  : "브라우저 저장 데이터를 읽는 중 문제가 생겼습니다."}
            </strong>
            <p>기존 데이터는 그대로 보관했으며, 화면에는 복구 가능한 내용을 열었습니다.</p>
          </div>
          <div>
            <button type="button" onClick={downloadRecovery}>
              기존 데이터 받기
            </button>
            <button className="primary-button" type="button" onClick={acceptRecovery}>
              열린 내용 사용
            </button>
          </div>
        </section>
      ) : null}

      <p className="feedback" role="status" aria-live="polite">
        {feedback}
      </p>

      {!started ? (
        <ProjectDashboard
          document={document}
          workspace={workspaceState}
          hasExistingProject={hasExistingProject}
          companionState={companionState}
          companion={companion}
          runtime={runtime}
          desktopStatus={desktopStatus}
          onContinue={() => {
            setStarted(true);
            setAutosaveAllowed(!recovery);
            setSaveState(recovery ? "recovery" : "saved");
          }}
          onCreate={startNew}
          onOpen={openProjectFile}
          onExport={exportProjectFile}
        />
      ) : (
        <main className="workspace" id="editor-main">
          <nav className="step-nav" aria-label="홈페이지 관리 단계">
            <p>관리 단계</p>
            {steps.map(([value, number, label]) => (
              <button
                type="button"
                aria-current={step === value ? "step" : undefined}
                key={value}
                onClick={() => setStep(value)}
              >
                <span>{number}</span>
                {label}
                {value === "launch" && errors.length ? (
                  <b>{errors.length}</b>
                ) : null}
              </button>
            ))}
            <div className="progress-card">
              <span>
                {launchChecks.filter((item) => item.complete).length}/
                {launchChecks.length}
              </span>
              <p>배포 준비 완료</p>
              {warnings.length ? <small>권장 {warnings.length}개</small> : null}
            </div>
          </nav>

          <section className="editor-panel" aria-labelledby="editor-title">
            <header className="editor-heading">
              <p>
                {step === "content"
                  ? "내용"
                  : step === "structure"
                    ? "구성"
                    : step === "style"
                      ? "스타일"
                      : "배포"}
              </p>
              <h2 id="editor-title">
                {step === "content"
                  ? "홈페이지 내용을 채웁니다."
                  : step === "structure"
                    ? "보여줄 순서를 정합니다."
                    : step === "style"
                      ? "화면 인상을 고릅니다."
                      : "새 버전을 배포하고 복구합니다."}
              </h2>
            </header>
            {step === "content" ? (
              <ContentEditor
                document={document}
                panel={contentPanel}
                onPanelChange={setContentPanel}
                commit={commit}
                onFeedback={setFeedback}
              />
            ) : null}
            {step === "structure" ? (
              <StructureEditor
                document={document}
                commit={commit}
              />
            ) : null}
            {step === "style" ? (
              <StyleEditor document={document} commit={commit} />
            ) : null}
            {step === "launch" ? (
              <LaunchEditor
                document={document}
                workspaceState={workspaceState}
                issues={issues}
                errors={errors}
                runtime={runtime}
                companionState={companionState}
                companion={companion}
                commit={commit}
                commitDocument={commitDocument}
                replaceDocument={replaceDocument}
                storeWorkspace={storeWorkspace}
                setSaveState={setSaveState}
                setFeedback={setFeedback}
                setTarget={setTarget}
                saveDesktopArchive={saveDesktopArchive}
                exportProjectFile={exportProjectFile}
              />
            ) : null}
          </section>

          <Preview
            html={previewHtml}
            device={device}
            onDeviceChange={setDevice}
          />
        </main>
      )}
    </div>
  );
}
