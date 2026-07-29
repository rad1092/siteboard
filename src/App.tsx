import {
  type ChangeEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { createDeploymentZip } from "./archive";
import {
  detectCompanion,
  inspectCloudflareTarget,
  loadDeploymentState,
  loadStartupProject,
  publishWithCompanion,
  rollbackWithCompanion,
  type CompanionStatus,
  type DeploymentRecord,
  type DeploymentState,
} from "./deployment";
import {
  blockLabels,
  createBlankDocument,
  createFaq,
  createService,
  createWork,
} from "./data";
import { createHistory, historyReducer } from "./history";
import {
  addSnapshot,
  createSnapshot,
  emptyWorkspace,
  exportProjectFile as serializeProjectFile,
  isValidProjectName,
  normalizePublicOrigin,
  parseProjectFile,
  type CloudflareProjectBinding,
  type WorkspaceState,
} from "./project-file";
import {
  generateStaticHtml,
  imageAssetFromDataUrl,
  MAX_DOCUMENT_IMAGE_BYTES,
  presetLabels,
  validateDocument,
} from "./site";
import {
  loadStoredProject,
  saveStoredProject,
  type StorageRecovery,
} from "./storage";
import type {
  ImageAsset,
  SiteDocument,
  ThemePreset,
  ValidationIssue,
} from "./types";

type EditorStep = "content" | "structure" | "style" | "launch";
type ContentPanel =
  | "identity"
  | "services"
  | "work"
  | "about"
  | "faq"
  | "contact";
type PreviewDevice = "desktop" | "mobile";
type SaveState = "saved" | "saving" | "error" | "recovery";
type CompanionState = "checking" | "available" | "unavailable";
type DeploymentActionState = "idle" | "publishing" | "rolling-back";

const STUDIO_RELEASE_URL =
  "https://github.com/rad1092/siteboard/releases/latest";

const steps: Array<[EditorStep, string, string]> = [
  ["content", "1", "내용"],
  ["structure", "2", "구성"],
  ["style", "3", "스타일"],
  ["launch", "4", "배포"],
];

const contentPanels: Array<[ContentPanel, string]> = [
  ["identity", "기본 정보"],
  ["services", "서비스"],
  ["work", "작업과 갤러리"],
  ["about", "소개"],
  ["faq", "질문과 답변"],
  ["contact", "연락"],
];

function withTimestamp(document: SiteDocument): SiteDocument {
  return { ...document, updatedAt: new Date().toISOString() };
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadText(filename: string, value: string, type: string): void {
  downloadBlob(filename, new Blob([value], { type }));
}

function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () =>
      reject(reader.error ?? new Error("파일을 읽을 수 없습니다.")),
    );
    reader.readAsText(file);
  });
}

function readImageDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () =>
      reject(reader.error ?? new Error("이미지를 읽을 수 없습니다.")),
    );
    reader.readAsDataURL(file);
  });
}

function exportBasename(name: string): string {
  const normalized = name
    .trim()
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
  return normalized || "homepage";
}

function safeTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function documentImageBytes(document: SiteDocument): number {
  return [
    document.brand.logo,
    document.brand.heroImage,
    ...document.work.items.map((item) => item.image),
  ].reduce((total, asset) => total + (asset?.size ?? 0), 0);
}

function formatImageBytes(bytes: number): string {
  if (bytes < 1_000_000) return `${Math.round(bytes / 1_000)}KB`;
  return `${(bytes / 1_000_000).toFixed(2)}MB`;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function ImageUploader({
  label,
  description,
  asset,
  onChange,
  onError,
}: {
  label: string;
  description: string;
  asset: ImageAsset | null;
  onChange: (asset: ImageAsset | null) => void;
  onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await readImageDataUrl(file);
      onChange(imageAssetFromDataUrl(file, dataUrl));
    } catch (error) {
      onError(error instanceof Error ? error.message : "이미지를 확인해 주세요.");
    }
  };

  return (
    <div className={`image-uploader ${asset ? "has-image" : ""}`}>
      <input
        className="sr-only"
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label={`${label} 선택`}
        onChange={handleImage}
      />
      {asset ? (
        <img src={asset.dataUrl} alt="" />
      ) : (
        <span className="image-placeholder" aria-hidden="true">
          +
        </span>
      )}
      <div>
        <strong>{label}</strong>
        <p>{description}</p>
        <div className="inline-actions">
          <button type="button" onClick={() => inputRef.current?.click()}>
            {asset ? "이미지 바꾸기" : "이미지 선택"}
          </button>
          {asset ? (
            <button type="button" onClick={() => onChange(null)}>
              제거
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function deploymentStatusLabel(record: DeploymentRecord | null): string {
  if (!record) return "아직 배포하지 않음";
  if (record.status === "live") return "운영 중";
  if (record.status === "deployed-history-error") {
    return "배포됨 · 로컬 이력 확인 필요";
  }
  if (record.status === "recovered") return "이전 버전으로 복구됨";
  if (record.status === "recovered-history-error") {
    return "복구됨 · 로컬 이력 확인 필요";
  }
  if (record.status === "verification-failed") return "배포됨 · 응답 확인 필요";
  if (record.status === "recovery-failed") return "복구됨 · 응답 확인 필요";
  if (record.status === "rollback-failed") return "복구 실패";
  if (record.status === "outcome-unknown") return "배포 결과 확인 필요";
  if (record.status === "rollback-outcome-unknown") {
    return "복구 결과 확인 필요";
  }
  return "배포 실패";
}

function ProjectDashboard({
  document,
  workspace,
  hasExistingProject,
  companionState,
  companion,
  onContinue,
  onCreate,
  onOpen,
  onExport,
}: {
  document: SiteDocument;
  workspace: WorkspaceState;
  hasExistingProject: boolean;
  companionState: CompanionState;
  companion: CompanionStatus | null;
  onContinue: () => void;
  onCreate: () => void;
  onOpen: () => void;
  onExport: () => void;
}) {
  const lastDeployment = workspace.lastDeployment;
  const binding = workspace.binding;
  return (
    <main className="start-screen" id="dashboard">
      <header className="dashboard-heading">
        <p className="start-kicker">SITEBOARD / OPERATIONS</p>
        <h1>홈페이지 운영</h1>
        <p>최근 작업을 열고, 편집부터 실제 배포와 복구까지 이어갑니다.</p>
      </header>

      <section className="recent-projects" aria-labelledby="recent-title">
        <div className="dashboard-section-heading">
          <div>
            <p>현재 작업</p>
            <h2 id="recent-title">
              {hasExistingProject ? "이어서 편집할 홈페이지" : "첫 홈페이지 만들기"}
            </h2>
          </div>
          <div className="start-actions">
            <button className="primary-button" type="button" onClick={onCreate}>
              새 홈페이지 만들기
            </button>
            <button type="button" onClick={onOpen}>
              작업 파일 열기
            </button>
            {hasExistingProject ? (
              <button type="button" onClick={onExport}>
                Studio용 작업 파일 저장
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
                <strong>{document.site.name.trim() || "이름 없는 홈페이지"}</strong>
                <p>
                  {binding
                    ? binding.publicOrigin || `${binding.projectName}.pages.dev`
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
              <button className="primary-button" type="button" onClick={onContinue}>
                계속 편집
              </button>
            </div>
          </article>
        ) : (
          <div className="empty-project">
            <strong>저장된 프로젝트가 없습니다.</strong>
            <p>내용을 만든 뒤 ZIP으로 보관하거나 Studio에서 바로 배포할 수 있습니다.</p>
          </div>
        )}
      </section>

      <section className="companion-summary" aria-labelledby="companion-title">
        <div>
          <p>로컬 배포 연결</p>
          <h2 id="companion-title">
            {companionState === "checking"
              ? "Studio 확인 중"
              : companionState === "available"
                ? "Studio 연결됨"
                : "브라우저 편집 모드"}
          </h2>
        </div>
        <p>
          {companionState === "available"
            ? companion?.cloudflare.authenticated
              ? "Cloudflare 인증을 확인했습니다. 편집 화면에서 배포와 복구를 실행할 수 있습니다."
              : "Studio는 연결됐지만 Cloudflare 로그인이 필요합니다."
            : hasExistingProject
              ? "작업 파일을 저장한 뒤 로컬 Studio의 ‘작업 파일 열기’로 이어서 배포할 수 있습니다."
              : "배포와 복구는 컴퓨터에서 siteboard studio를 실행한 뒤 사용할 수 있습니다. ZIP 내보내기는 그대로 제공됩니다."}
        </p>
        {companionState === "unavailable" ? (
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

function Preview({
  html,
  device,
  onDeviceChange,
}: {
  html: string;
  device: PreviewDevice;
  onDeviceChange: (device: PreviewDevice) => void;
}) {
  const deviceLabel = device === "desktop" ? "컴퓨터" : "휴대전화";
  return (
    <section className="preview-panel" aria-labelledby="preview-title">
      <header>
        <div>
          <p>미리보기</p>
          <h2 id="preview-title">현재 홈페이지</h2>
        </div>
        <div className="device-toggle" aria-label="미리보기 크기">
          <button
            type="button"
            aria-pressed={device === "desktop"}
            onClick={() => onDeviceChange("desktop")}
          >
            컴퓨터
          </button>
          <button
            type="button"
            aria-pressed={device === "mobile"}
            onClick={() => onDeviceChange("mobile")}
          >
            휴대전화
          </button>
        </div>
      </header>
      <div className={`preview-frame preview-frame--${device}`}>
        <iframe title={`${deviceLabel} 홈페이지 미리보기`} srcDoc={html} sandbox="" />
      </div>
    </section>
  );
}

export default function App() {
  const [initialStorage] = useState(() =>
    loadStoredProject(window.localStorage),
  );
  const [history, dispatch] = useReducer(
    historyReducer,
    initialStorage.document,
    createHistory,
  );
  const document = history.present;
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>(() =>
    initialStorage.workspace,
  );
  const [hasExistingProject, setHasExistingProject] = useState(
    initialStorage.source !== "starter",
  );
  const [started, setStarted] = useState(
    Boolean(initialStorage.recovery),
  );
  const [step, setStep] = useState<EditorStep>("content");
  const [contentPanel, setContentPanel] =
    useState<ContentPanel>("identity");
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [recovery, setRecovery] = useState<StorageRecovery | null>(
    initialStorage.recovery,
  );
  const [autosaveAllowed, setAutosaveAllowed] = useState(
    initialStorage.source !== "starter" && !initialStorage.recovery,
  );
  const [saveState, setSaveState] = useState<SaveState>(
    initialStorage.recovery
      ? "recovery"
      : initialStorage.source === "starter"
        ? "saved"
        : "saving",
  );
  const [feedback, setFeedback] = useState(
    initialStorage.source === "migrated"
      ? "기존 Siteboard 파일을 새 홈페이지 형식으로 옮겼습니다. 공개 전에 내용과 연락처를 확인해 주세요."
      : "",
  );
  const [companionState, setCompanionState] =
    useState<CompanionState>("checking");
  const [companion, setCompanion] = useState<CompanionStatus | null>(null);
  const [deploymentState, setDeploymentState] = useState<DeploymentState>({
    history: [],
    deployments: [],
  });
  const [deploymentAction, setDeploymentAction] =
    useState<DeploymentActionState>("idle");
  const [pagesProject, setPagesProject] = useState(
    workspaceState.binding?.projectName ?? "",
  );
  const [snapshotName, setSnapshotName] = useState("");
  const importInput = useRef<HTMLInputElement>(null);

  const issues = useMemo(() => validateDocument(document), [document]);
  const errors = issues.filter((item) => item.level === "error");
  const warnings = issues.filter((item) => item.level === "warning");
  const imageBytes = documentImageBytes(document);
  const previewHtml = useMemo(
    () => generateStaticHtml(document, { preview: true }),
    [document],
  );

  const commit = (update: (current: SiteDocument) => SiteDocument) => {
    setStarted(true);
    setAutosaveAllowed(true);
    setSaveState("saving");
    dispatch({
      type: "update",
      update,
      updatedAt: new Date().toISOString(),
    });
  };

  const storeWorkspace = (next: WorkspaceState) => {
    if (!saveStoredProject(window.localStorage, document, next).ok) {
      setFeedback("작업 연결과 저장본을 브라우저에 저장하지 못했습니다.");
      return false;
    }
    setWorkspaceState(next);
    return true;
  };

  useEffect(() => {
    let active = true;
    detectCompanion().then(async (detected) => {
      if (!active) return;
      setCompanion(detected);
      setCompanionState(detected ? "available" : "unavailable");
      if (!detected?.startupFile) return;
      try {
        const startup = await loadStartupProject();
        const result = parseProjectFile(startup.content);
        if (!result.ok) {
          setFeedback(result.error);
          return;
        }
        const imported = withTimestamp(result.project.document);
        const nextWorkspace: WorkspaceState = {
          schemaVersion: 1,
          binding: result.project.binding,
          snapshots: result.project.snapshots,
          lastDeployment: result.project.lastDeployment,
        };
        const saved = saveStoredProject(
          window.localStorage,
          imported,
          nextWorkspace,
          { allowUnsafePrimaryReplacement: true },
        );
        if (!saved.ok || !active) {
          setFeedback("시작 작업 파일을 브라우저에 저장하지 못했습니다.");
          return;
        }
        dispatch({ type: "replace", document: imported });
        setWorkspaceState(nextWorkspace);
        setPagesProject(nextWorkspace.binding?.projectName ?? "");
        setStarted(true);
        setAutosaveAllowed(true);
        setHasExistingProject(true);
        setSaveState("saved");
        setFeedback(`${startup.fileName} 작업 파일을 Studio에서 열었습니다.`);
      } catch (error) {
        setFeedback(
          error instanceof Error
            ? error.message
            : "시작 작업 파일을 열지 못했습니다.",
        );
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!started || !autosaveAllowed) return;
    const timeout = window.setTimeout(() => {
      const result = saveStoredProject(
        window.localStorage,
        document,
        workspaceState,
      );
      if (result.ok) {
        setSaveState("saved");
        setHasExistingProject(true);
      } else if (result.reason === "unsafe-primary") {
        const nextLoad = loadStoredProject(window.localStorage);
        setRecovery(nextLoad.recovery);
        setAutosaveAllowed(false);
        setSaveState("recovery");
      } else {
        setSaveState("error");
      }
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [autosaveAllowed, document, started, workspaceState]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier || event.key.toLowerCase() !== "z") return;
      if (event.shiftKey && history.future.length === 0) return;
      if (!event.shiftKey && history.past.length === 0) return;
      event.preventDefault();
      setSaveState(autosaveAllowed ? "saving" : "recovery");
      dispatch({ type: event.shiftKey ? "redo" : "undo" });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [autosaveAllowed, history.future.length, history.past.length]);

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

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    let result;
    try {
      result = parseProjectFile(await readFileText(file));
    } catch {
      setFeedback("선택한 파일을 읽을 수 없습니다.");
      return;
    }
    if (!result.ok) {
      setFeedback(result.error);
      return;
    }

    if (hasExistingProject) {
      const confirmed = window.confirm(
        `"${file.name}" 파일을 열면 현재 내용을 교체합니다. 먼저 지금 작업 파일을 저장하고, 되돌리기 기록은 새로 시작합니다.`,
      );
      if (!confirmed) {
        setFeedback("현재 홈페이지 내용을 유지했습니다.");
        return;
      }
      downloadText(
        `${exportBasename(document.site.name)}-before-import-${safeTimestamp()}.siteboard.json`,
        serializeProjectFile(document, workspaceState),
        "application/json",
      );
    }

    const imported = withTimestamp(result.project.document);
    const importedWorkspace: WorkspaceState = {
      schemaVersion: 1,
      binding: result.project.binding,
      snapshots: result.project.snapshots,
      lastDeployment: result.project.lastDeployment,
    };
    const saved = saveStoredProject(
      window.localStorage,
      imported,
      importedWorkspace,
      { allowUnsafePrimaryReplacement: true },
    );
    if (!saved.ok) {
      setFeedback("가져온 내용을 브라우저에 저장하지 못했습니다.");
      setSaveState(saved.reason === "unsafe-primary" ? "recovery" : "error");
      return;
    }

    dispatch({ type: "replace", document: imported });
    setWorkspaceState(importedWorkspace);
    setPagesProject(importedWorkspace.binding?.projectName ?? "");
    setDeploymentState({ history: [], deployments: [] });
    setStarted(true);
    setAutosaveAllowed(true);
    setRecovery(null);
    setSaveState("saved");
    setStep("content");
    setContentPanel("identity");
    setFeedback(
      result.project.migratedFrom === 1
        ? "이전 버전의 내용을 새 형식으로 옮겼습니다. 공개 전에 내용과 연락처를 확인해 주세요."
        : result.project.legacy
          ? `${file.name} 내용을 열었습니다. 기존 문서에는 배포 연결이 없어 Studio에서 대상을 새로 확인해야 합니다.`
          : `${file.name} 작업을 열었습니다. 되돌리기 기록을 새로 시작합니다.`,
    );
  };

  const startNew = () => {
    if (
      hasExistingProject &&
      !window.confirm(
        "현재 작업 파일을 먼저 저장한 뒤 새 홈페이지를 시작합니다. 계속할까요?",
      )
    ) {
      return;
    }
    if (hasExistingProject) {
      downloadText(
        `${exportBasename(document.site.name)}-before-new-${safeTimestamp()}.siteboard.json`,
        serializeProjectFile(document, workspaceState),
        "application/json",
      );
    }
    const blank = createBlankDocument();
    const nextWorkspace = emptyWorkspace();
    const saved = saveStoredProject(
      window.localStorage,
      blank,
      nextWorkspace,
      { allowUnsafePrimaryReplacement: true },
    );
    if (!saved.ok) {
      setFeedback("새 홈페이지를 브라우저에 저장하지 못했습니다.");
      return;
    }
    dispatch({ type: "replace", document: blank });
    setWorkspaceState(nextWorkspace);
    setPagesProject("");
    setDeploymentState({ history: [], deployments: [] });
    setStarted(true);
    setAutosaveAllowed(true);
    setRecovery(null);
    setSaveState("saving");
    setStep("content");
    setContentPanel("identity");
    setFeedback("상호와 첫 화면 문구부터 입력하세요.");
  };

  const exportProjectFile = () => {
    downloadText(
      `${exportBasename(document.site.name)}.siteboard.json`,
      serializeProjectFile(document, workspaceState),
      "application/json",
    );
    setFeedback(
      "작업 파일을 저장했습니다. 로컬 Studio에서 ‘작업 파일 열기’로 불러오세요.",
    );
  };

  const acceptRecovery = () => {
    const saved = saveStoredProject(
      window.localStorage,
      document,
      workspaceState,
      { allowUnsafePrimaryReplacement: true },
    );
    if (!saved.ok) {
      setFeedback("복구한 내용을 브라우저에 저장하지 못했습니다.");
      return;
    }
    setRecovery(null);
    setAutosaveAllowed(true);
    setSaveState("saved");
    setFeedback("화면에 열린 내용을 새 저장본으로 사용합니다.");
  };

  const downloadRecovery = () => {
    if (!recovery) return;
    downloadText(
      `siteboard-recovery-${safeTimestamp()}.txt`,
      recovery.raw,
      "text/plain",
    );
    setFeedback("기존 저장 데이터를 파일로 받았습니다.");
  };

  const updateSite = (patch: Partial<SiteDocument["site"]>) =>
    commit((current) => ({
      ...current,
      site: { ...current.site, ...patch },
    }));
  const updateHero = (patch: Partial<SiteDocument["hero"]>) =>
    commit((current) => ({
      ...current,
      hero: { ...current.hero, ...patch },
    }));

  const renderIdentity = () => (
    <div className="editor-stack">
      <section className="editor-card">
        <header>
          <p>첫 화면</p>
          <h3>누가 무엇을 제공하는지 적습니다.</h3>
        </header>
        <Field label="상호 또는 이름">
          <input
            value={document.site.name}
            onChange={(event) => updateSite({ name: event.target.value })}
          />
        </Field>
        <Field
          label="한 줄 소개"
          hint="방문자가 첫 화면에서 바로 이해할 문장을 권합니다."
        >
          <textarea
            rows={2}
            value={document.site.tagline}
            onChange={(event) => updateSite({ tagline: event.target.value })}
          />
        </Field>
        <Field label="설명">
          <textarea
            rows={4}
            value={document.site.summary}
            onChange={(event) => updateSite({ summary: event.target.value })}
          />
        </Field>
        <Field label="작은 안내 문구" hint="지역, 업종, 운영 상태 등을 적을 수 있습니다.">
          <input
            value={document.hero.eyebrow}
            onChange={(event) => updateHero({ eyebrow: event.target.value })}
          />
        </Field>
      </section>

      <section className="editor-card">
        <header>
          <p>이미지</p>
          <h3>필요하면 로고와 대표 화면을 추가합니다.</h3>
        </header>
        <ImageUploader
          label="로고"
          description="선택 사항 · 없으면 상호 첫 글자를 표시합니다. PNG, JPG, WEBP · 800KB 이하"
          asset={document.brand.logo}
          onError={setFeedback}
          onChange={(logo) =>
            commit((current) => ({
              ...current,
              brand: { ...current.brand, logo },
            }))
          }
        />
        <ImageUploader
          label="대표 이미지"
          description="선택 사항 · 없으면 선택한 스타일의 색상 화면을 표시합니다. 800KB 이하"
          asset={document.brand.heroImage}
          onError={setFeedback}
          onChange={(heroImage) =>
            commit((current) => ({
              ...current,
              brand: { ...current.brand, heroImage },
            }))
          }
        />
        <p className="image-budget">
          현재 이미지 {formatImageBytes(imageBytes)} / 전체{" "}
          {formatImageBytes(MAX_DOCUMENT_IMAGE_BYTES)}
        </p>
      </section>

      <section className="editor-card">
        <header>
          <p>연결</p>
          <h3>첫 화면 버튼과 공개 주소를 정합니다.</h3>
        </header>
        <div className="field-grid">
          <Field label="주요 버튼 문구">
            <input
              value={document.hero.primaryLabel}
              onChange={(event) =>
                updateHero({ primaryLabel: event.target.value })
              }
            />
          </Field>
          <Field label="주요 버튼 주소">
            <input
              value={document.hero.primaryUrl}
              onChange={(event) =>
                updateHero({ primaryUrl: event.target.value })
              }
            />
          </Field>
          <Field label="보조 버튼 문구">
            <input
              value={document.hero.secondaryLabel}
              onChange={(event) =>
                updateHero({ secondaryLabel: event.target.value })
              }
            />
          </Field>
          <Field label="보조 버튼 주소">
            <input
              value={document.hero.secondaryUrl}
              onChange={(event) =>
                updateHero({ secondaryUrl: event.target.value })
              }
            />
          </Field>
        </div>
        <Field
          label="공개할 홈페이지 주소 (선택)"
          hint="배포 후 주소가 정해지면 입력해 다시 받을 수 있습니다."
        >
          <input
            type="url"
            value={document.site.baseUrl}
            onChange={(event) => updateSite({ baseUrl: event.target.value })}
          />
        </Field>
      </section>
    </div>
  );

  const renderServices = () => (
    <div className="editor-stack">
      <section className="editor-card">
        <header>
          <p>서비스</p>
          <h3>방문자가 선택할 수 있는 일을 적습니다.</h3>
        </header>
        <Field label="제목">
          <input
            value={document.services.heading}
            onChange={(event) =>
              commit((current) => ({
                ...current,
                services: {
                  ...current.services,
                  heading: event.target.value,
                },
              }))
            }
          />
        </Field>
        <Field label="짧은 설명">
          <textarea
            rows={3}
            value={document.services.intro}
            onChange={(event) =>
              commit((current) => ({
                ...current,
                services: { ...current.services, intro: event.target.value },
              }))
            }
          />
        </Field>
      </section>
      {document.services.items.map((item, index) => (
        <section className="editor-card item-card" key={item.id}>
          <header>
            <p>서비스 {index + 1}</p>
            <button
              type="button"
              onClick={() =>
                commit((current) => ({
                  ...current,
                  services: {
                    ...current.services,
                    items: current.services.items.filter(
                      (candidate) => candidate.id !== item.id,
                    ),
                  },
                }))
              }
            >
              삭제
            </button>
          </header>
          <Field label={`서비스 ${index + 1} 이름`}>
            <input
              value={item.title}
              onChange={(event) =>
                commit((current) => ({
                  ...current,
                  services: {
                    ...current.services,
                    items: current.services.items.map((candidate) =>
                      candidate.id === item.id
                        ? { ...candidate, title: event.target.value }
                        : candidate,
                    ),
                  },
                }))
              }
            />
          </Field>
          <Field label={`서비스 ${index + 1} 설명`}>
            <textarea
              rows={3}
              value={item.description}
              onChange={(event) =>
                commit((current) => ({
                  ...current,
                  services: {
                    ...current.services,
                    items: current.services.items.map((candidate) =>
                      candidate.id === item.id
                        ? { ...candidate, description: event.target.value }
                        : candidate,
                    ),
                  },
                }))
              }
            />
          </Field>
        </section>
      ))}
      <button
        className="add-item-button"
        type="button"
        onClick={() =>
          commit((current) => ({
            ...current,
            services: {
              ...current.services,
              items: [...current.services.items, createService()],
            },
            layout: {
              ...current.layout,
              visible: {
                ...current.layout.visible,
                services:
                  current.services.items.length === 0
                    ? true
                    : current.layout.visible.services,
              },
            },
          }))
        }
      >
        + 서비스 추가
      </button>
    </div>
  );

  const renderWork = () => (
    <div className="editor-stack">
      <section className="editor-card">
        <header>
          <p>작업과 갤러리</p>
          <h3>완성한 일과 결과를 보여줍니다.</h3>
        </header>
        <Field label="제목">
          <input
            value={document.work.heading}
            onChange={(event) =>
              commit((current) => ({
                ...current,
                work: { ...current.work, heading: event.target.value },
              }))
            }
          />
        </Field>
        <Field label="짧은 설명">
          <textarea
            rows={3}
            value={document.work.intro}
            onChange={(event) =>
              commit((current) => ({
                ...current,
                work: { ...current.work, intro: event.target.value },
              }))
            }
          />
        </Field>
      </section>
      {document.work.items.map((item, index) => (
        <section className="editor-card item-card" key={item.id}>
          <header>
            <p>작업 {index + 1}</p>
            <button
              type="button"
              onClick={() =>
                commit((current) => ({
                  ...current,
                  work: {
                    ...current.work,
                    items: current.work.items.filter(
                      (candidate) => candidate.id !== item.id,
                    ),
                  },
                }))
              }
            >
              삭제
            </button>
          </header>
          <ImageUploader
            label={`작업 ${index + 1} 이미지`}
            description="결과 화면이나 현장 사진을 올립니다."
            asset={item.image}
            onError={setFeedback}
            onChange={(image) =>
              commit((current) => ({
                ...current,
                work: {
                  ...current.work,
                  items: current.work.items.map((candidate) =>
                    candidate.id === item.id
                      ? { ...candidate, image }
                      : candidate,
                  ),
                },
              }))
            }
          />
          <Field label={`작업 ${index + 1} 이름`}>
            <input
              value={item.title}
              onChange={(event) =>
                commit((current) => ({
                  ...current,
                  work: {
                    ...current.work,
                    items: current.work.items.map((candidate) =>
                      candidate.id === item.id
                        ? { ...candidate, title: event.target.value }
                        : candidate,
                    ),
                  },
                }))
              }
            />
          </Field>
          <Field label={`작업 ${index + 1} 설명`}>
            <textarea
              rows={4}
              value={item.description}
              onChange={(event) =>
                commit((current) => ({
                  ...current,
                  work: {
                    ...current.work,
                    items: current.work.items.map((candidate) =>
                      candidate.id === item.id
                        ? { ...candidate, description: event.target.value }
                        : candidate,
                    ),
                  },
                }))
              }
            />
          </Field>
          <div className="field-grid">
            <Field label="링크 문구">
              <input
                value={item.linkLabel}
                onChange={(event) =>
                  commit((current) => ({
                    ...current,
                    work: {
                      ...current.work,
                      items: current.work.items.map((candidate) =>
                        candidate.id === item.id
                          ? { ...candidate, linkLabel: event.target.value }
                          : candidate,
                      ),
                    },
                  }))
                }
              />
            </Field>
            <Field label="링크 주소">
              <input
                value={item.linkUrl}
                onChange={(event) =>
                  commit((current) => ({
                    ...current,
                    work: {
                      ...current.work,
                      items: current.work.items.map((candidate) =>
                        candidate.id === item.id
                          ? { ...candidate, linkUrl: event.target.value }
                          : candidate,
                      ),
                    },
                  }))
                }
              />
            </Field>
          </div>
        </section>
      ))}
      <button
        className="add-item-button"
        type="button"
        onClick={() =>
          commit((current) => ({
            ...current,
            work: {
              ...current.work,
              items: [...current.work.items, createWork()],
            },
            layout: {
              ...current.layout,
              visible: {
                ...current.layout.visible,
                work:
                  current.work.items.length === 0
                    ? true
                    : current.layout.visible.work,
              },
            },
          }))
        }
      >
        + 작업 추가
      </button>
    </div>
  );

  const renderAbout = () => (
    <div className="editor-stack">
      <section className="editor-card">
        <header>
          <p>소개</p>
          <h3>경력, 방식, 장소처럼 신뢰에 필요한 정보를 적습니다.</h3>
        </header>
        <Field label="제목">
          <input
            value={document.about.heading}
            onChange={(event) =>
              commit((current) => ({
                ...current,
                about: { ...current.about, heading: event.target.value },
              }))
            }
          />
        </Field>
        <Field label="소개 글">
          <textarea
            rows={9}
            value={document.about.body}
            onChange={(event) =>
              commit((current) => ({
                ...current,
                about: { ...current.about, body: event.target.value },
                layout:
                  !current.about.body.trim() && event.target.value.trim()
                  ? {
                      ...current.layout,
                      visible: { ...current.layout.visible, about: true },
                    }
                  : current.layout,
              }))
            }
          />
        </Field>
      </section>
    </div>
  );

  const renderFaq = () => (
    <div className="editor-stack">
      <section className="editor-card">
        <header>
          <p>질문과 답변</p>
          <h3>문의 전에 자주 확인하는 내용을 정리합니다.</h3>
        </header>
        <Field label="제목">
          <input
            value={document.faq.heading}
            onChange={(event) =>
              commit((current) => ({
                ...current,
                faq: { ...current.faq, heading: event.target.value },
              }))
            }
          />
        </Field>
      </section>
      {document.faq.items.map((item, index) => (
        <section className="editor-card item-card" key={item.id}>
          <header>
            <p>질문 {index + 1}</p>
            <button
              type="button"
              onClick={() =>
                commit((current) => ({
                  ...current,
                  faq: {
                    ...current.faq,
                    items: current.faq.items.filter(
                      (candidate) => candidate.id !== item.id,
                    ),
                  },
                }))
              }
            >
              삭제
            </button>
          </header>
          <Field label={`질문 ${index + 1}`}>
            <input
              value={item.question}
              onChange={(event) =>
                commit((current) => ({
                  ...current,
                  faq: {
                    ...current.faq,
                    items: current.faq.items.map((candidate) =>
                      candidate.id === item.id
                        ? { ...candidate, question: event.target.value }
                        : candidate,
                    ),
                  },
                }))
              }
            />
          </Field>
          <Field label={`답변 ${index + 1}`}>
            <textarea
              rows={4}
              value={item.answer}
              onChange={(event) =>
                commit((current) => ({
                  ...current,
                  faq: {
                    ...current.faq,
                    items: current.faq.items.map((candidate) =>
                      candidate.id === item.id
                        ? { ...candidate, answer: event.target.value }
                        : candidate,
                    ),
                  },
                }))
              }
            />
          </Field>
        </section>
      ))}
      <button
        className="add-item-button"
        type="button"
        onClick={() =>
          commit((current) => ({
            ...current,
            faq: {
              ...current.faq,
              items: [...current.faq.items, createFaq()],
            },
            layout: {
              ...current.layout,
              visible: {
                ...current.layout.visible,
                faq:
                  current.faq.items.length === 0
                    ? true
                    : current.layout.visible.faq,
              },
            },
          }))
        }
      >
        + 질문 추가
      </button>
    </div>
  );

  const renderContact = () => (
    <div className="editor-stack">
      <section className="editor-card">
        <header>
          <p>연락</p>
          <h3>방문자가 바로 연락할 수 있는 정보를 적습니다.</h3>
        </header>
        <Field label="제목">
          <input
            value={document.contact.heading}
            onChange={(event) =>
              commit((current) => ({
                ...current,
                contact: { ...current.contact, heading: event.target.value },
              }))
            }
          />
        </Field>
        <Field label="안내 문구">
          <textarea
            rows={4}
            value={document.contact.message}
            onChange={(event) =>
              commit((current) => ({
                ...current,
                contact: { ...current.contact, message: event.target.value },
              }))
            }
          />
        </Field>
        <div className="field-grid">
          <Field label="이메일">
            <input
              type="email"
              value={document.contact.email}
              onChange={(event) =>
                commit((current) => ({
                  ...current,
                  contact: { ...current.contact, email: event.target.value },
                }))
              }
            />
          </Field>
          <Field label="전화번호">
            <input
              type="tel"
              value={document.contact.phone}
              onChange={(event) =>
                commit((current) => ({
                  ...current,
                  contact: { ...current.contact, phone: event.target.value },
                }))
              }
            />
          </Field>
        </div>
        <Field label="주소">
          <input
            value={document.contact.address}
            onChange={(event) =>
              commit((current) => ({
                ...current,
                contact: { ...current.contact, address: event.target.value },
              }))
            }
          />
        </Field>
        <Field label="운영 시간">
          <textarea
            rows={3}
            value={document.contact.hours}
            onChange={(event) =>
              commit((current) => ({
                ...current,
                contact: { ...current.contact, hours: event.target.value },
              }))
            }
          />
        </Field>
      </section>
    </div>
  );

  const renderContent = () => (
    <>
      <nav className="content-tabs" aria-label="내용 항목">
        {contentPanels.map(([value, label]) => (
          <button
            type="button"
            aria-pressed={contentPanel === value}
            key={value}
            onClick={() => setContentPanel(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      {contentPanel === "identity" ? renderIdentity() : null}
      {contentPanel === "services" ? renderServices() : null}
      {contentPanel === "work" ? renderWork() : null}
      {contentPanel === "about" ? renderAbout() : null}
      {contentPanel === "faq" ? renderFaq() : null}
      {contentPanel === "contact" ? renderContact() : null}
    </>
  );

  const renderStructure = () => (
    <div className="editor-stack">
      <section className="editor-card">
        <header>
          <p>구성</p>
          <h3>보여줄 블록과 순서를 정합니다.</h3>
        </header>
        <ol className="block-list">
          {document.layout.order.map((kind, index) => (
            <li key={kind}>
              <label>
                <input
                  type="checkbox"
                  checked={document.layout.visible[kind]}
                  onChange={(event) =>
                    commit((current) => ({
                      ...current,
                      layout: {
                        ...current.layout,
                        visible: {
                          ...current.layout.visible,
                          [kind]: event.target.checked,
                        },
                      },
                    }))
                  }
                />
                <span>{blockLabels[kind]}</span>
              </label>
              <div>
                <button
                  type="button"
                  aria-label={`${blockLabels[kind]} 위로 이동`}
                  disabled={index === 0}
                  onClick={() =>
                    commit((current) => ({
                      ...current,
                      layout: {
                        ...current.layout,
                        order: moveItem(current.layout.order, index, -1),
                      },
                    }))
                  }
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`${blockLabels[kind]} 아래로 이동`}
                  disabled={index === document.layout.order.length - 1}
                  onClick={() =>
                    commit((current) => ({
                      ...current,
                      layout: {
                        ...current.layout,
                        order: moveItem(current.layout.order, index, 1),
                      },
                    }))
                  }
                >
                  ↓
                </button>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );

  const renderStyle = () => (
    <div className="editor-stack">
      <section className="editor-card">
        <header>
          <p>스타일</p>
          <h3>완성된 화면 성격을 고릅니다.</h3>
        </header>
        <div className="preset-grid">
          {(Object.keys(presetLabels) as ThemePreset[]).map((preset) => (
            <button
              className={`preset-card preset-card--${preset}`}
              type="button"
              aria-pressed={document.theme.preset === preset}
              key={preset}
              onClick={() =>
                commit((current) => ({
                  ...current,
                  theme: { ...current.theme, preset },
                }))
              }
            >
              <span className="preset-preview" aria-hidden="true">
                <i />
                <b />
                <em />
              </span>
              <strong>{presetLabels[preset]}</strong>
            </button>
          ))}
        </div>
        <div className="accent-field">
          <label htmlFor="accent-color">강조색</label>
          <input
            type="color"
            aria-label="강조색 선택"
            value={
              /^#[0-9a-f]{6}$/i.test(document.theme.accent)
                ? document.theme.accent
                : "#b5482d"
            }
            onChange={(event) =>
              commit((current) => ({
                ...current,
                theme: { ...current.theme, accent: event.target.value },
              }))
            }
          />
          <input
            id="accent-color"
            value={document.theme.accent}
            maxLength={7}
            onChange={(event) =>
              commit((current) => ({
                ...current,
                theme: { ...current.theme, accent: event.target.value },
              }))
            }
          />
        </div>
      </section>
    </div>
  );

  const launchChecks = [
    {
      label: "사업 이름과 첫 화면 문구",
      complete: Boolean(
        document.site.name.trim() &&
          document.site.tagline.trim() &&
          document.site.summary.trim(),
      ),
    },
    {
      label: "연락 수단",
      complete: Boolean(
        !document.layout.visible.contact ||
          document.contact.email.trim() ||
          document.contact.phone.trim(),
      ),
    },
    { label: "연결 주소와 내용 검사", complete: errors.length === 0 },
  ];

  const exportZip = () => {
    if (errors.length) {
      setFeedback(`내보내기 전에 ${errors.length}개 항목을 확인해 주세요.`);
      return;
    }
    try {
      const bytes = createDeploymentZip(document);
      const arrayBuffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      downloadBlob(
        `${exportBasename(document.site.name)}-website.zip`,
        new Blob([arrayBuffer], { type: "application/zip" }),
      );
      setFeedback(
        "홈페이지 파일을 저장했습니다. 압축을 푼 전체 내용을 함께 올리세요.",
      );
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "홈페이지 파일을 만들지 못했습니다.",
      );
    }
  };

  const draftPublicOrigin = normalizePublicOrigin(document.site.baseUrl);
  const bindingReady = Boolean(
    workspaceState.binding &&
      workspaceState.binding.projectName === pagesProject.trim() &&
      draftPublicOrigin !== null &&
      workspaceState.binding.publicOrigin === draftPublicOrigin,
  );

  const rememberDeployment = (
    record: DeploymentRecord,
    options: {
      binding?: CloudflareProjectBinding | null;
      snapshots?: WorkspaceState["snapshots"];
    } = {},
  ) => {
    storeWorkspace({
      schemaVersion: 1,
      binding:
        options.binding === undefined
          ? workspaceState.binding
          : options.binding,
      snapshots: options.snapshots ?? workspaceState.snapshots,
      lastDeployment: record,
    });
  };

  const bindCloudflareTarget = async () => {
    const normalizedProject = pagesProject.trim();
    if (!companion || companionState !== "available") {
      setFeedback("로컬 Studio에서만 Cloudflare 배포 대상을 연결할 수 있습니다.");
      return;
    }
    if (!companion.cloudflare.authenticated) {
      setFeedback("터미널에서 wrangler login을 실행한 뒤 Studio를 다시 시작하세요.");
      return;
    }
    if (!isValidProjectName(normalizedProject)) {
      setFeedback(
        "프로젝트 이름은 영문 소문자와 숫자, 가운데 하이픈으로 1~58자까지 입력하세요.",
      );
      return;
    }
    if (draftPublicOrigin === null) {
      setFeedback("공개 주소는 경로가 없는 HTTPS 주소로 입력하세요.");
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
      storeWorkspace({
        ...workspaceState,
        binding,
      });
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

  const saveNamedSnapshot = () => {
    const snapshot = createSnapshot(
      document,
      snapshotName || `저장본 ${workspaceState.snapshots.length + 1}`,
    );
    const snapshots = addSnapshot(workspaceState.snapshots, snapshot);
    storeWorkspace({ ...workspaceState, snapshots });
    setSnapshotName("");
    setFeedback(`“${snapshot.name}” 편집 저장본을 만들었습니다.`);
  };

  const restoreDraftSnapshot = (snapshotId: string) => {
    const snapshot = workspaceState.snapshots.find(
      (candidate) => candidate.id === snapshotId,
    );
    if (
      !snapshot ||
      !window.confirm(
        `“${snapshot.name}” 편집본을 현재 화면에 복원할까요? 공개 중인 production은 바뀌지 않습니다.`,
      )
    ) {
      return;
    }
    const restored = withTimestamp(snapshot.document);
    dispatch({ type: "replace", document: restored });
    saveStoredProject(window.localStorage, restored, workspaceState, {
      allowUnsafePrimaryReplacement: true,
    });
    setSaveState("saved");
    setFeedback(
      `“${snapshot.name}” 편집본을 복원했습니다. production은 변경하지 않았습니다.`,
    );
  };

  const refreshDeploymentHistory = async () => {
    if (!companion || !bindingReady || !workspaceState.binding) {
      setFeedback("먼저 Cloudflare 배포 대상을 확인해 연결하세요.");
      return;
    }
    try {
      setDeploymentState(await loadDeploymentState(pagesProject.trim()));
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
      setFeedback("컴퓨터에서 siteboard studio를 실행한 뒤 다시 열어 주세요.");
      return;
    }
    if (!companion.cloudflare.authenticated) {
      setFeedback("터미널에서 wrangler login을 실행한 뒤 Studio를 다시 시작하세요.");
      return;
    }
    if (errors.length) {
      setFeedback(`배포 전에 ${errors.length}개 필수 항목을 확인해 주세요.`);
      return;
    }
    if (!workspaceState.binding || !bindingReady) {
      setFeedback("배포 전에 Cloudflare 대상을 확인해 연결하세요.");
      return;
    }

    const normalizedProject = pagesProject.trim();
    const deploymentDocument = document;
    const predeploySnapshot = createSnapshot(
      document,
      `배포 전 ${new Intl.DateTimeFormat("ko-KR", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date())}`,
    );
    const nextSnapshots = addSnapshot(
      workspaceState.snapshots,
      predeploySnapshot,
    );
    storeWorkspace({ ...workspaceState, snapshots: nextSnapshots });

    setDeploymentAction("publishing");
    setFeedback("Cloudflare Pages에 새 리비전을 배포하고 있습니다.");
    try {
      const result = await publishWithCompanion(companion, {
        binding: workspaceState.binding,
        documentName: deploymentDocument.site.name,
        publicUrl: deploymentDocument.site.baseUrl,
        archive: createDeploymentZip(deploymentDocument),
      });
      const deployedOrigin =
        normalizePublicOrigin(
          result.target?.pagesOrigin ||
            result.target?.currentUrl ||
            result.deployment.productionUrl,
        ) || "";
      const nextOrigin =
        draftPublicOrigin || deployedOrigin;
      const nextBinding: CloudflareProjectBinding = {
        ...workspaceState.binding,
        projectId:
          result.target?.projectId || workspaceState.binding.projectId,
        publicOrigin: nextOrigin,
        existedWhenBound: true,
        boundAt: new Date().toISOString(),
      };
      if (!document.site.baseUrl.trim() && nextOrigin) {
        const nextDocument = withTimestamp({
          ...document,
          site: { ...document.site, baseUrl: nextOrigin },
        });
        dispatch({ type: "commit", document: nextDocument });
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
        error instanceof Error ? error.message : "배포를 완료하지 못했습니다.",
      );
      try {
        setDeploymentState(await loadDeploymentState(normalizedProject));
      } catch {
        // The visible error above remains the useful failure.
      }
    } finally {
      setDeploymentAction("idle");
    }
  };

  const rollbackDeployment = async (deploymentId: string) => {
    if (!companion || !workspaceState.binding || !bindingReady) {
      setFeedback("복구 전에 Cloudflare 배포 대상을 다시 확인하세요.");
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
        binding: workspaceState.binding,
        deploymentId,
        publicUrl:
          workspaceState.binding.publicOrigin ||
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
        error instanceof Error ? error.message : "이전 배포로 복구하지 못했습니다.",
      );
      try {
        setDeploymentState(await loadDeploymentState(pagesProject.trim()));
      } catch {
        // The rollback error remains visible when history refresh also fails.
      }
    } finally {
      setDeploymentAction("idle");
    }
  };

  const renderLaunch = () => (
    <div className="editor-stack">
      <section className="editor-card">
        <header>
          <p>검색 정보</p>
          <h3>검색 결과와 링크 공유에 표시할 문구입니다.</h3>
        </header>
        <Field
          label={`검색 결과 제목 (선택) · ${document.seo.title.length}/60`}
          hint={`비워 두면 “${document.site.name || "사업 이름"}”을 사용합니다.`}
        >
          <input
            value={document.seo.title}
            onChange={(event) =>
              commit((current) => ({
                ...current,
                seo: { ...current.seo, title: event.target.value },
              }))
            }
          />
        </Field>
        <Field
          label={`검색 결과 설명 (선택) · ${document.seo.description.length}/160`}
          hint="비워 두면 첫 화면 설명을 사용합니다."
        >
          <textarea
            rows={4}
            value={document.seo.description}
            onChange={(event) =>
              commit((current) => ({
                ...current,
                seo: { ...current.seo, description: event.target.value },
              }))
            }
          />
        </Field>
      </section>

      <section className="editor-card launch-card">
        <header>
          <p>배포 점검</p>
          <h3>
            {errors.length
              ? `${errors.length}개 항목을 마치면 배포할 수 있습니다.`
              : "새 리비전을 배포할 준비가 끝났습니다."}
          </h3>
        </header>
        <ul className="launch-checks">
          {launchChecks.map((check) => (
            <li className={check.complete ? "is-complete" : ""} key={check.label}>
              <span aria-hidden="true">{check.complete ? "✓" : "○"}</span>
              {check.label}
            </li>
          ))}
        </ul>
        {issues.length ? (
          <ul className="issue-list" aria-label="배포 점검 결과">
            {issues.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => setTarget(item.target)}>
                  <span className={item.level}>{item.level === "error" ? "필수" : "권장"}</span>
                  {item.message}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {companionState === "available" ? (
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
            onChange={(event) => setPagesProject(event.target.value)}
          />
        </Field>

        <div
          className={`companion-state companion-state--${companionState}`}
          role="status"
        >
          <span aria-hidden="true" />
          <div>
            <strong>
              {companion?.cloudflare.authenticated
                ? "로컬 Studio와 Cloudflare 연결됨"
                : "Studio 연결됨 · Cloudflare 로그인 필요"}
            </strong>
            <p>
              {companion?.cloudflare.authenticated
                ? companion.cloudflare.selectedAccountId
                  ? "토큰은 브라우저로 전달하거나 저장하지 않습니다."
                  : "계정이 여러 개면 CLOUDFLARE_ACCOUNT_ID를 지정하고 Studio를 다시 실행하세요."
                : "터미널에서 wrangler login을 실행하고 Studio를 다시 시작하세요."}
            </p>
          </div>
        </div>

        <div className="binding-summary" role="status">
          <strong>
            {bindingReady && workspaceState.binding
              ? `${workspaceState.binding.projectName} 연결됨`
              : "배포 대상 확인 필요"}
          </strong>
          <p>
            {bindingReady && workspaceState.binding
              ? workspaceState.binding.publicOrigin ||
                "첫 배포에서 pages.dev 주소를 확정합니다."
              : "기존 프로젝트를 자동 재사용하지 않습니다. 대상을 확인해 명시적으로 연결하세요."}
          </p>
        </div>

        <div className="deployment-actions">
          <button
            type="button"
            disabled={
              deploymentAction !== "idle" ||
              !companion?.cloudflare.authenticated ||
              !isValidProjectName(pagesProject.trim()) ||
              draftPublicOrigin === null
            }
            onClick={bindCloudflareTarget}
          >
            대상 확인 및 연결
          </button>
          <button
            className="publish-button"
            type="button"
            disabled={
              errors.length > 0 ||
              deploymentAction !== "idle" ||
              companionState !== "available" ||
              !companion?.cloudflare.authenticated ||
              !companion.cloudflare.selectedAccountId ||
              !bindingReady
            }
            onClick={publishWebsite}
          >
            {deploymentAction === "publishing"
              ? "배포하고 확인하는 중…"
              : "새 리비전 배포"}
          </button>
          <button
            type="button"
            disabled={
              deploymentAction !== "idle" ||
              companionState !== "available"
            }
            onClick={refreshDeploymentHistory}
          >
            배포 이력 새로고침
          </button>
          <button
            type="button"
            disabled={errors.length > 0}
            onClick={exportZip}
          >
            ZIP 내보내기
          </button>
        </div>
        <p className="package-note">
          ZIP 내보내기는 언제든 사용할 수 있습니다. 배포 인증과 이력 파일은
          현재 컴퓨터의 로컬 Studio에서 관리합니다.
        </p>
      </section>
      ) : (
        <section className="editor-card deployment-card">
          <header>
            <p>Studio에서 배포</p>
            <h3>작업 파일을 저장하고 로컬 Studio에서 엽니다.</h3>
          </header>
          <ol className="studio-steps">
            <li>현재 작업 파일을 저장합니다.</li>
            <li>Siteboard Studio를 설치하고 작업 파일과 함께 실행합니다.</li>
            <li>Studio에서 Cloudflare 대상을 확인한 뒤 배포합니다.</li>
          </ol>
          <div className="deployment-actions">
            <button className="publish-button" type="button" onClick={exportProjectFile}>
              Studio용 작업 파일 저장
            </button>
            <a href={STUDIO_RELEASE_URL} target="_blank" rel="noreferrer">
              최신 Studio 설치 안내 ↗
            </a>
            <button type="button" disabled={errors.length > 0} onClick={exportZip}>
              ZIP 내보내기
            </button>
          </div>
        </section>
      )}

      <section className="editor-card snapshot-card">
        <header>
          <p>편집 저장본</p>
          <h3>현재 초안을 저장하거나 이전 초안으로 돌아갑니다.</h3>
        </header>
        <div className="snapshot-create">
          <input
            aria-label="편집 저장본 이름"
            value={snapshotName}
            maxLength={80}
            placeholder="예: 가격표 수정 전"
            onChange={(event) => setSnapshotName(event.target.value)}
          />
          <button type="button" onClick={saveNamedSnapshot}>
            현재 초안 저장
          </button>
        </div>
        {workspaceState.snapshots.length ? (
          <ol className="snapshot-list">
            {[...workspaceState.snapshots].reverse().map((snapshot) => (
              <li key={snapshot.id}>
                <div>
                  <strong>{snapshot.name}</strong>
                  <small>
                    {new Intl.DateTimeFormat("ko-KR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(snapshot.createdAt))}
                  </small>
                </div>
                <button
                  type="button"
                  onClick={() => restoreDraftSnapshot(snapshot.id)}
                >
                  편집본 복원
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="package-note">아직 만든 편집 저장본이 없습니다.</p>
        )}
        <p className="package-note">
          편집본 복원은 현재 초안만 바꾸며 공개 중인 production은 변경하지 않습니다.
        </p>
      </section>

      {companionState === "available" && deploymentState.deployments.length ? (
        <section className="editor-card deployment-history-card">
          <header>
            <p>Production 배포</p>
            <h3>현재 버전과 복구 가능한 이전 버전입니다.</h3>
          </header>
          <ol className="cloudflare-deployments">
            {deploymentState.deployments.map((deployment) => (
              <li key={deployment.deploymentId}>
                <div>
                  <span>{deployment.current ? "현재" : "이전"}</span>
                  <strong>
                    {deployment.source || deployment.deploymentId.slice(0, 12)}
                  </strong>
                  <small>{deployment.status}</small>
                </div>
                <div>
                  <a href={deployment.url} target="_blank" rel="noreferrer">
                    주소 열기 ↗
                  </a>
                  {deployment.rollbackable ? (
                    <button
                      type="button"
                      disabled={deploymentAction !== "idle"}
                      onClick={() =>
                        rollbackDeployment(deployment.deploymentId)
                      }
                    >
                      이 배포로 복구
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {companionState === "available" && deploymentState.history.length ? (
        <section className="editor-card deployment-history-card">
          <header>
            <p>로컬 운영 이력</p>
            <h3>성공, 실패, 복구 결과를 변경 없이 이어서 기록합니다.</h3>
          </header>
          <ol className="local-deployment-history">
            {deploymentState.history.map((record) => (
              <li key={record.eventId}>
                <span
                  className={`history-status history-status--${record.status}`}
                >
                  {deploymentStatusLabel(record)}
                </span>
                <div>
                  <strong>
                    {record.operation === "publish" ? "배포" : "복구"}
                    {record.revision
                      ? ` · ${record.revision.slice(0, 12)}`
                      : ""}
                  </strong>
                  <small>
                    {new Intl.DateTimeFormat("ko-KR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(record.createdAt))}
                  </small>
                  {record.message ? <p>{record.message}</p> : null}
                </div>
                {record.productionUrl ? (
                  <a href={record.productionUrl} target="_blank" rel="noreferrer">
                    공개 주소 ↗
                  </a>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );

  const openDashboard = () => {
    if (!started) return;
    if (started && autosaveAllowed) {
      const saved = saveStoredProject(
        window.localStorage,
        document,
        workspaceState,
      );
      setSaveState(saved.ok ? "saved" : "error");
    }
    setStarted(false);
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
        accept="application/json,.json"
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
        </button>
        {started ? (
          <>
            <p
              className={`save-status save-status--${saveState}`}
              role="status"
              aria-live="polite"
            >
              {saveState === "saving"
                ? "브라우저에 저장 중"
                : saveState === "error"
                  ? "저장 공간을 확인해 주세요"
                  : saveState === "recovery"
                    ? "복구 선택이 필요합니다"
                    : "브라우저에 저장됨"}
            </p>
            <div className="header-actions">
              <div aria-label="되돌리기 기록">
                <button
                  type="button"
                  disabled={!history.past.length}
                  onClick={() => {
                    setSaveState("saving");
                    dispatch({ type: "undo" });
                  }}
                >
                  되돌리기
                </button>
                <button
                  type="button"
                  disabled={!history.future.length}
                  onClick={() => {
                    setSaveState("saving");
                    dispatch({ type: "redo" });
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
                  onClick={() => importInput.current?.click()}
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
          onContinue={() => {
            setStarted(true);
            setAutosaveAllowed(!recovery);
            setSaveState(recovery ? "recovery" : "saved");
          }}
          onCreate={startNew}
          onOpen={() => importInput.current?.click()}
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
            {step === "content" ? renderContent() : null}
            {step === "structure" ? renderStructure() : null}
            {step === "style" ? renderStyle() : null}
            {step === "launch" ? renderLaunch() : null}
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
