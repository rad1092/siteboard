import {
  type ChangeEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { cloneDocument, createPage, createSection, demoDocument } from "./data";
import { createHistory, historyReducer } from "./history";
import {
  generateStaticHtml,
  jsonExport,
  parseImportedDocument,
  validateDocument,
} from "./site";
import type {
  FontToken,
  RadiusToken,
  SectionKind,
  SiteDocument,
  SitePage,
  SiteSection,
  ThemeTokens,
  ValidationIssue,
} from "./types";

const STORAGE_KEY = "siteboard.document.v1";

type InspectorTab = "content" | "theme" | "seo" | "validation";
type PreviewDevice = "desktop" | "mobile";
type SaveState = "saved" | "saving" | "error";

function loadInitialDocument(): SiteDocument {
  if (typeof window === "undefined") return cloneDocument(demoDocument);

  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (!saved) return cloneDocument(demoDocument);

  const result = parseImportedDocument(saved);
  return result.ok ? result.document : cloneDocument(demoDocument);
}

function withTimestamp(document: SiteDocument): SiteDocument {
  return {
    ...document,
    updatedAt: new Date().toISOString(),
  };
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= items.length) return items;

  const next = [...items];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

function downloadText(filename: string, value: string, type: string): void {
  const blob = new Blob([value], { type });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function exportBasename(siteName: string): string {
  const normalized = siteName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || "site";
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
      <span className="field-label">{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function IconButton({
  label,
  disabled,
  pressed,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className="icon-button"
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      title={label}
    >
      {children}
    </button>
  );
}

interface OutlineProps {
  pages: SitePage[];
  selectedPageId: string;
  selectedSectionId: string;
  onSelectPage: (pageId: string) => void;
  onSelectSection: (sectionId: string) => void;
  onAddPage: () => void;
  onAddSection: () => void;
  onMovePage: (index: number, direction: -1 | 1) => void;
  onMoveSection: (index: number, direction: -1 | 1) => void;
  onTogglePage: (pageId: string) => void;
  onToggleSection: (sectionId: string) => void;
}

function Outline({
  pages,
  selectedPageId,
  selectedSectionId,
  onSelectPage,
  onSelectSection,
  onAddPage,
  onAddSection,
  onMovePage,
  onMoveSection,
  onTogglePage,
  onToggleSection,
}: OutlineProps) {
  const selectedPage = pages.find((page) => page.id === selectedPageId);

  return (
    <aside className="panel outline-panel" aria-labelledby="outline-title">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">Structure</p>
          <h2 id="outline-title">Pages</h2>
        </div>
        <button className="compact-button" type="button" onClick={onAddPage}>
          + Page
        </button>
      </div>

      <ol className="outline-list" aria-label="Site pages">
        {pages.map((page, index) => (
          <li className={page.hidden ? "is-hidden" : ""} key={page.id}>
            <div className="outline-row">
              <button
                className="outline-select"
                type="button"
                aria-current={page.id === selectedPageId ? "page" : undefined}
                onClick={() => onSelectPage(page.id)}
              >
                <span>{page.title || "Untitled page"}</span>
                <small>/{page.slug || "missing-slug"}</small>
              </button>
              <div className="row-actions">
                <IconButton
                  label={`Move ${page.title} up`}
                  disabled={index === 0}
                  onClick={() => onMovePage(index, -1)}
                >
                  ↑
                </IconButton>
                <IconButton
                  label={`Move ${page.title} down`}
                  disabled={index === pages.length - 1}
                  onClick={() => onMovePage(index, 1)}
                >
                  ↓
                </IconButton>
                <IconButton
                  label={`${page.hidden ? "Show" : "Hide"} ${page.title}`}
                  pressed={page.hidden}
                  onClick={() => onTogglePage(page.id)}
                >
                  {page.hidden ? "○" : "●"}
                </IconButton>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="section-outline">
        <div className="panel-heading panel-heading--small">
          <div>
            <p className="panel-kicker">Selected page</p>
            <h3>Sections</h3>
          </div>
          <button
            className="compact-button"
            type="button"
            disabled={!selectedPage}
            onClick={onAddSection}
          >
            + Section
          </button>
        </div>

        {selectedPage ? (
          <ol className="outline-list section-list" aria-label="Page sections">
            {selectedPage.sections.map((section, index) => (
              <li
                className={section.hidden ? "is-hidden" : ""}
                key={section.id}
              >
                <div className="outline-row">
                  <button
                    className="outline-select"
                    type="button"
                    aria-current={
                      section.id === selectedSectionId ? "true" : undefined
                    }
                    onClick={() => onSelectSection(section.id)}
                  >
                    <span>{section.title || "Untitled section"}</span>
                    <small>{section.kind}</small>
                  </button>
                  <div className="row-actions">
                    <IconButton
                      label={`Move ${section.title} up`}
                      disabled={index === 0}
                      onClick={() => onMoveSection(index, -1)}
                    >
                      ↑
                    </IconButton>
                    <IconButton
                      label={`Move ${section.title} down`}
                      disabled={index === selectedPage.sections.length - 1}
                      onClick={() => onMoveSection(index, 1)}
                    >
                      ↓
                    </IconButton>
                    <IconButton
                      label={`${section.hidden ? "Show" : "Hide"} ${section.title}`}
                      pressed={section.hidden}
                      onClick={() => onToggleSection(section.id)}
                    >
                      {section.hidden ? "○" : "●"}
                    </IconButton>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty-note">Add or select a page first.</p>
        )}
      </div>
    </aside>
  );
}

interface ContentEditorProps {
  page?: SitePage;
  section?: SiteSection;
  canDeletePage: boolean;
  onUpdatePage: (patch: Partial<SitePage>) => void;
  onUpdateSection: (patch: Partial<SiteSection>) => void;
  onDeletePage: () => void;
  onDeleteSection: () => void;
}

function ContentEditor({
  page,
  section,
  canDeletePage,
  onUpdatePage,
  onUpdateSection,
  onDeletePage,
  onDeleteSection,
}: ContentEditorProps) {
  if (!page) {
    return <p className="empty-note">Add a page to start editing.</p>;
  }

  return (
    <div className="inspector-stack">
      <fieldset>
        <legend>Page</legend>
        <Field label="Page title">
          <input
            value={page.title}
            onChange={(event) => onUpdatePage({ title: event.target.value })}
          />
        </Field>
        <div className="field-grid">
          <Field label="Navigation label">
            <input
              value={page.navLabel}
              onChange={(event) =>
                onUpdatePage({ navLabel: event.target.value })
              }
            />
          </Field>
          <Field label="URL slug" hint="Lowercase letters, numbers and hyphens.">
            <input
              value={page.slug}
              onChange={(event) =>
                onUpdatePage({ slug: event.target.value.toLowerCase() })
              }
              spellCheck={false}
            />
          </Field>
        </div>
        <label className="check-field">
          <input
            type="checkbox"
            checked={page.hidden}
            onChange={(event) =>
              onUpdatePage({ hidden: event.target.checked })
            }
          />
          Hide this page from navigation and export
        </label>
        <button
          className="text-button danger-button"
          type="button"
          disabled={!canDeletePage}
          onClick={onDeletePage}
        >
          Delete page
        </button>
      </fieldset>

      {section ? (
        <fieldset>
          <legend>Section</legend>
          <Field label="Section type">
            <select
              value={section.kind}
              onChange={(event) =>
                onUpdateSection({
                  kind: event.target.value as SectionKind,
                })
              }
            >
              <option value="hero">Hero</option>
              <option value="content">Content</option>
              <option value="callout">Callout</option>
            </select>
          </Field>
          <Field label="Eyebrow">
            <input
              value={section.eyebrow}
              onChange={(event) =>
                onUpdateSection({ eyebrow: event.target.value })
              }
            />
          </Field>
          <Field label="Heading">
            <input
              value={section.title}
              onChange={(event) =>
                onUpdateSection({ title: event.target.value })
              }
            />
          </Field>
          <Field label="Body">
            <textarea
              value={section.body}
              rows={6}
              onChange={(event) =>
                onUpdateSection({ body: event.target.value })
              }
            />
          </Field>
          <div className="field-grid">
            <Field label="Link text">
              <input
                value={section.linkLabel}
                onChange={(event) =>
                  onUpdateSection({ linkLabel: event.target.value })
                }
              />
            </Field>
            <Field label="Link URL">
              <input
                value={section.linkUrl}
                inputMode="url"
                spellCheck={false}
                onChange={(event) =>
                  onUpdateSection({ linkUrl: event.target.value })
                }
              />
            </Field>
          </div>
          <label className="check-field">
            <input
              type="checkbox"
              checked={section.hidden}
              onChange={(event) =>
                onUpdateSection({ hidden: event.target.checked })
              }
            />
            Hide this section from preview and export
          </label>
          <button
            className="text-button danger-button"
            type="button"
            onClick={onDeleteSection}
          >
            Delete section
          </button>
        </fieldset>
      ) : (
        <p className="empty-note">Add or select a section to edit its content.</p>
      )}
    </div>
  );
}

function ThemeEditor({
  theme,
  onChange,
}: {
  theme: ThemeTokens;
  onChange: (patch: Partial<ThemeTokens>) => void;
}) {
  const colors: Array<[keyof ThemeTokens, string]> = [
    ["background", "Background"],
    ["surface", "Surface"],
    ["text", "Text"],
    ["muted", "Muted text"],
    ["accent", "Accent"],
  ];

  return (
    <div className="inspector-stack">
      <fieldset>
        <legend>Color tokens</legend>
        {colors.map(([key, label]) => {
          const value = String(theme[key]);
          const pickerValue = /^#[0-9a-f]{6}$/i.test(value)
            ? value
            : "#000000";
          return (
            <div className="color-field" key={key}>
              <label htmlFor={`color-${key}`}>{label}</label>
              <input
                aria-label={`${label} color picker`}
                type="color"
                value={pickerValue}
                onChange={(event) => onChange({ [key]: event.target.value })}
              />
              <input
                id={`color-${key}`}
                value={value}
                maxLength={7}
                spellCheck={false}
                onChange={(event) => onChange({ [key]: event.target.value })}
              />
            </div>
          );
        })}
      </fieldset>

      <fieldset>
        <legend>Typography and shape</legend>
        <Field label="Font family">
          <select
            value={theme.font}
            onChange={(event) =>
              onChange({ font: event.target.value as FontToken })
            }
          >
            <option value="system">System sans</option>
            <option value="serif">Editorial serif</option>
            <option value="mono">Monospace</option>
          </select>
        </Field>
        <Field label="Corner radius">
          <select
            value={theme.radius}
            onChange={(event) =>
              onChange({ radius: event.target.value as RadiusToken })
            }
          >
            <option value="0">Square</option>
            <option value="8">8 px</option>
            <option value="18">18 px</option>
          </select>
        </Field>
      </fieldset>
    </div>
  );
}

function SeoEditor({
  document,
  onSiteChange,
  onSeoChange,
}: {
  document: SiteDocument;
  onSiteChange: (patch: Partial<SiteDocument["site"]>) => void;
  onSeoChange: (patch: Partial<SiteDocument["seo"]>) => void;
}) {
  return (
    <div className="inspector-stack">
      <fieldset>
        <legend>Site identity</legend>
        <Field label="Site name">
          <input
            value={document.site.name}
            onChange={(event) => onSiteChange({ name: event.target.value })}
          />
        </Field>
        <Field label="Base URL" hint="Use the final https:// address if known.">
          <input
            type="url"
            value={document.site.baseUrl}
            spellCheck={false}
            onChange={(event) => onSiteChange({ baseUrl: event.target.value })}
          />
        </Field>
      </fieldset>

      <fieldset>
        <legend>Search metadata</legend>
        <Field
          label={`SEO title (${document.seo.title.length}/60)`}
          hint="Used for the exported HTML title."
        >
          <input
            value={document.seo.title}
            onChange={(event) => onSeoChange({ title: event.target.value })}
          />
        </Field>
        <Field label={`Description (${document.seo.description.length}/160)`}>
          <textarea
            rows={4}
            value={document.seo.description}
            onChange={(event) =>
              onSeoChange({ description: event.target.value })
            }
          />
        </Field>
      </fieldset>

      <fieldset>
        <legend>Social card</legend>
        <Field label="Social title">
          <input
            value={document.seo.socialTitle}
            onChange={(event) =>
              onSeoChange({ socialTitle: event.target.value })
            }
          />
        </Field>
        <Field label="Social description">
          <textarea
            rows={3}
            value={document.seo.socialDescription}
            onChange={(event) =>
              onSeoChange({ socialDescription: event.target.value })
            }
          />
        </Field>
        <Field label="Social image URL">
          <input
            value={document.seo.socialImage}
            inputMode="url"
            spellCheck={false}
            onChange={(event) =>
              onSeoChange({ socialImage: event.target.value })
            }
          />
        </Field>
        <div className="social-card" aria-label="Social card text preview">
          <span>{document.site.baseUrl || "example.com"}</span>
          <strong>
            {document.seo.socialTitle ||
              document.seo.title ||
              "Untitled site"}
          </strong>
          <p>
            {document.seo.socialDescription ||
              document.seo.description ||
              "No description yet."}
          </p>
        </div>
      </fieldset>
    </div>
  );
}

function ValidationPanel({
  issues,
  onSelect,
}: {
  issues: ValidationIssue[];
  onSelect: (issue: ValidationIssue) => void;
}) {
  const errorCount = issues.filter((item) => item.level === "error").length;
  const warningCount = issues.length - errorCount;

  return (
    <div className="validation-panel">
      <div className={`validation-summary ${errorCount ? "has-errors" : ""}`}>
        <strong>
          {errorCount
            ? `${errorCount} export-blocking ${errorCount === 1 ? "error" : "errors"}`
            : "Ready to export"}
        </strong>
        <span>
          {warningCount} {warningCount === 1 ? "warning" : "warnings"}
        </span>
      </div>

      {issues.length ? (
        <ul className="issue-list">
          {issues.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => onSelect(item)}>
                <span className={`issue-level ${item.level}`}>
                  {item.level}
                </span>
                <span>{item.message}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-note">
          No structural, link, color, or metadata issues found.
        </p>
      )}
    </div>
  );
}

interface InspectorProps {
  tab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  document: SiteDocument;
  selectedPage?: SitePage;
  selectedSection?: SiteSection;
  issues: ValidationIssue[];
  onUpdatePage: (patch: Partial<SitePage>) => void;
  onUpdateSection: (patch: Partial<SiteSection>) => void;
  onUpdateTheme: (patch: Partial<ThemeTokens>) => void;
  onUpdateSite: (patch: Partial<SiteDocument["site"]>) => void;
  onUpdateSeo: (patch: Partial<SiteDocument["seo"]>) => void;
  onDeletePage: () => void;
  onDeleteSection: () => void;
  onSelectIssue: (issue: ValidationIssue) => void;
}

function Inspector({
  tab,
  onTabChange,
  document,
  selectedPage,
  selectedSection,
  issues,
  onUpdatePage,
  onUpdateSection,
  onUpdateTheme,
  onUpdateSite,
  onUpdateSeo,
  onDeletePage,
  onDeleteSection,
  onSelectIssue,
}: InspectorProps) {
  const errorCount = issues.filter((item) => item.level === "error").length;

  return (
    <section className="panel inspector-panel" aria-labelledby="inspector-title">
      <div className="panel-heading inspector-heading">
        <div>
          <p className="panel-kicker">Edit</p>
          <h2 id="inspector-title">Inspector</h2>
        </div>
      </div>

      <div className="inspector-tabs" aria-label="Inspector sections">
        {(
          [
            ["content", "Content"],
            ["theme", "Theme"],
            ["seo", "SEO"],
            ["validation", `Check${errorCount ? ` · ${errorCount}` : ""}`],
          ] as Array<[InspectorTab, string]>
        ).map(([value, label]) => (
          <button
            type="button"
            aria-pressed={tab === value}
            key={value}
            onClick={() => onTabChange(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="inspector-body">
        {tab === "content" ? (
          <ContentEditor
            page={selectedPage}
            section={selectedSection}
            canDeletePage={document.pages.length > 1}
            onUpdatePage={onUpdatePage}
            onUpdateSection={onUpdateSection}
            onDeletePage={onDeletePage}
            onDeleteSection={onDeleteSection}
          />
        ) : null}
        {tab === "theme" ? (
          <ThemeEditor theme={document.theme} onChange={onUpdateTheme} />
        ) : null}
        {tab === "seo" ? (
          <SeoEditor
            document={document}
            onSiteChange={onUpdateSite}
            onSeoChange={onUpdateSeo}
          />
        ) : null}
        {tab === "validation" ? (
          <ValidationPanel issues={issues} onSelect={onSelectIssue} />
        ) : null}
      </div>
    </section>
  );
}

function Preview({
  html,
  device,
  onDeviceChange,
  pageTitle,
}: {
  html: string;
  device: PreviewDevice;
  onDeviceChange: (device: PreviewDevice) => void;
  pageTitle: string;
}) {
  return (
    <section className="panel preview-panel" aria-labelledby="preview-title">
      <div className="panel-heading preview-heading">
        <div>
          <p className="panel-kicker">Live</p>
          <h2 id="preview-title">Preview</h2>
        </div>
        <div className="device-toggle" aria-label="Preview size">
          <button
            type="button"
            aria-pressed={device === "desktop"}
            onClick={() => onDeviceChange("desktop")}
          >
            Desktop
          </button>
          <button
            type="button"
            aria-pressed={device === "mobile"}
            onClick={() => onDeviceChange("mobile")}
          >
            Mobile
          </button>
        </div>
      </div>
      <div className={`preview-canvas preview-canvas--${device}`}>
        <iframe
          title={`${pageTitle || "Site"} ${device} preview`}
          srcDoc={html}
          sandbox=""
        />
      </div>
    </section>
  );
}

export default function App() {
  const [history, dispatch] = useReducer(
    historyReducer,
    undefined,
    () => createHistory(loadInitialDocument()),
  );
  const siteDocument = history.present;
  const [selectedPageId, setSelectedPageId] = useState(
    () => siteDocument.pages[0]?.id ?? "",
  );
  const [selectedSectionId, setSelectedSectionId] = useState(
    () => siteDocument.pages[0]?.sections[0]?.id ?? "",
  );
  const [inspectorTab, setInspectorTab] =
    useState<InspectorTab>("content");
  const [previewDevice, setPreviewDevice] =
    useState<PreviewDevice>("desktop");
  const [saveState, setSaveState] = useState<SaveState>("saving");
  const [feedback, setFeedback] = useState("");
  const importInput = useRef<HTMLInputElement>(null);

  const effectivePageId = siteDocument.pages.some(
    (page) => page.id === selectedPageId,
  )
    ? selectedPageId
    : (siteDocument.pages[0]?.id ?? "");
  const selectedPage = siteDocument.pages.find(
    (page) => page.id === effectivePageId,
  );
  const effectiveSectionId = selectedPage?.sections.some(
    (section) => section.id === selectedSectionId,
  )
    ? selectedSectionId
    : (selectedPage?.sections[0]?.id ?? "");
  const selectedSection = selectedPage?.sections.find(
    (section) => section.id === effectiveSectionId,
  );
  const issues = useMemo(
    () => validateDocument(siteDocument),
    [siteDocument],
  );
  const errorCount = issues.filter((item) => item.level === "error").length;
  const previewHtml = useMemo(
    () =>
      generateStaticHtml(siteDocument, {
        previewPageId: effectivePageId,
      }),
    [siteDocument, effectivePageId],
  );

  const commit = (update: (document: SiteDocument) => SiteDocument) => {
    const next = update(siteDocument);
    if (JSON.stringify(next) === JSON.stringify(siteDocument)) return;

    setSaveState("saving");
    dispatch({
      type: "commit",
      document: withTimestamp(next),
    });
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(siteDocument),
        );
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [siteDocument]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier || event.key.toLowerCase() !== "z") return;
      if (event.shiftKey && history.future.length === 0) return;
      if (!event.shiftKey && history.past.length === 0) return;

      event.preventDefault();
      setSaveState("saving");
      dispatch({ type: event.shiftKey ? "redo" : "undo" });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [history.future.length, history.past.length]);

  const selectPage = (pageId: string) => {
    const page = siteDocument.pages.find((item) => item.id === pageId);
    setSelectedPageId(pageId);
    setSelectedSectionId(page?.sections[0]?.id ?? "");
  };

  const addPage = () => {
    const page = createPage(
      siteDocument.pages.length + 1,
      siteDocument.pages.map((item) => item.slug),
    );
    commit((document) => ({
      ...document,
      pages: [...document.pages, page],
    }));
    setSelectedPageId(page.id);
    setSelectedSectionId(page.sections[0]?.id ?? "");
    setInspectorTab("content");
  };

  const addSection = () => {
    if (!selectedPage) return;
    const section = createSection(
      "content",
      selectedPage.sections.length + 1,
    );
    commit((document) => ({
      ...document,
      pages: document.pages.map((page) =>
        page.id === selectedPage.id
          ? { ...page, sections: [...page.sections, section] }
          : page,
      ),
    }));
    setSelectedSectionId(section.id);
    setInspectorTab("content");
  };

  const updatePage = (patch: Partial<SitePage>) => {
    if (!selectedPage) return;
    commit((document) => ({
      ...document,
      pages: document.pages.map((page) =>
        page.id === selectedPage.id ? { ...page, ...patch } : page,
      ),
    }));
  };

  const updateSection = (patch: Partial<SiteSection>) => {
    if (!selectedPage || !selectedSection) return;
    commit((document) => ({
      ...document,
      pages: document.pages.map((page) =>
        page.id === selectedPage.id
          ? {
              ...page,
              sections: page.sections.map((section) =>
                section.id === selectedSection.id
                  ? { ...section, ...patch }
                  : section,
              ),
            }
          : page,
      ),
    }));
  };

  const movePage = (index: number, direction: -1 | 1) => {
    commit((document) => ({
      ...document,
      pages: moveItem(document.pages, index, direction),
    }));
  };

  const moveSection = (index: number, direction: -1 | 1) => {
    if (!selectedPage) return;
    commit((document) => ({
      ...document,
      pages: document.pages.map((page) =>
        page.id === selectedPage.id
          ? {
              ...page,
              sections: moveItem(page.sections, index, direction),
            }
          : page,
      ),
    }));
  };

  const deletePage = () => {
    if (!selectedPage || siteDocument.pages.length <= 1) return;
    if (!window.confirm(`Delete "${selectedPage.title}"? You can undo this.`)) {
      return;
    }

    const remaining = siteDocument.pages.filter(
      (page) => page.id !== selectedPage.id,
    );
    commit((document) => ({ ...document, pages: remaining }));
    setSelectedPageId(remaining[0]?.id ?? "");
    setSelectedSectionId(remaining[0]?.sections[0]?.id ?? "");
  };

  const deleteSection = () => {
    if (!selectedPage || !selectedSection) return;
    if (
      !window.confirm(`Delete "${selectedSection.title}"? You can undo this.`)
    ) {
      return;
    }

    const remaining = selectedPage.sections.filter(
      (section) => section.id !== selectedSection.id,
    );
    commit((document) => ({
      ...document,
      pages: document.pages.map((page) =>
        page.id === selectedPage.id
          ? { ...page, sections: remaining }
          : page,
      ),
    }));
    setSelectedSectionId(remaining[0]?.id ?? "");
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const result = parseImportedDocument(await file.text());
    if (!result.ok) {
      setFeedback(result.error);
      return;
    }

    const imported = withTimestamp(result.document);
    setSaveState("saving");
    dispatch({ type: "replace", document: imported });
    setSelectedPageId(imported.pages[0]?.id ?? "");
    setSelectedSectionId(imported.pages[0]?.sections[0]?.id ?? "");
    setFeedback(`Imported ${file.name}.`);
  };

  const selectIssue = (item: ValidationIssue) => {
    if (item.pageId) {
      setSelectedPageId(item.pageId);
      const page = siteDocument.pages.find(
        (candidate) => candidate.id === item.pageId,
      );
      setSelectedSectionId(item.sectionId ?? page?.sections[0]?.id ?? "");
      setInspectorTab("content");
    } else if (item.id.startsWith("theme-")) {
      setInspectorTab("theme");
    } else {
      setInspectorTab("seo");
    }
  };

  const resetDemo = () => {
    if (!window.confirm("Replace this document with the demo? Export first if needed.")) {
      return;
    }

    const fresh = withTimestamp(cloneDocument(demoDocument));
    setSaveState("saving");
    dispatch({ type: "replace", document: fresh });
    setSelectedPageId(fresh.pages[0]?.id ?? "");
    setSelectedSectionId(fresh.pages[0]?.sections[0]?.id ?? "");
    setFeedback("Demo content restored.");
  };

  const basename = exportBasename(siteDocument.site.name);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">
        Skip to editor
      </a>

      <header className="app-header">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <div>
            <h1>Siteboard</h1>
            <p
              className={`save-status save-status--${saveState}`}
              role="status"
              aria-live="polite"
            >
              {saveState === "saving"
                ? "Saving locally…"
                : saveState === "error"
                  ? "Local save failed"
                  : "Saved locally"}
            </p>
          </div>
        </div>

        <div className="history-actions" aria-label="Edit history">
          <button
            type="button"
            disabled={!history.past.length}
            onClick={() => {
              setSaveState("saving");
              dispatch({ type: "undo" });
            }}
          >
            Undo
          </button>
          <button
            type="button"
            disabled={!history.future.length}
            onClick={() => {
              setSaveState("saving");
              dispatch({ type: "redo" });
            }}
          >
            Redo
          </button>
        </div>

        <div className="document-actions" aria-label="Document actions">
          <input
            className="sr-only"
            ref={importInput}
            type="file"
            accept="application/json,.json"
            onChange={handleImport}
          />
          <button type="button" onClick={() => importInput.current?.click()}>
            Import
          </button>
          <button
            type="button"
            onClick={() =>
              downloadText(
                `${basename}.siteboard.json`,
                jsonExport(siteDocument),
                "application/json",
              )
            }
          >
            JSON
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={errorCount > 0}
            title={
              errorCount
                ? "Resolve validation errors before exporting HTML."
                : "Export a standalone index.html file."
            }
            onClick={() =>
              downloadText(
                "index.html",
                generateStaticHtml(siteDocument),
                "text/html",
              )
            }
          >
            Export HTML
          </button>
          <button className="quiet-button" type="button" onClick={resetDemo}>
            Reset demo
          </button>
        </div>
      </header>

      <p className="feedback" role="status" aria-live="polite">
        {feedback}
      </p>

      <main className="workspace" id="workspace">
        <Outline
          pages={siteDocument.pages}
          selectedPageId={effectivePageId}
          selectedSectionId={effectiveSectionId}
          onSelectPage={selectPage}
          onSelectSection={setSelectedSectionId}
          onAddPage={addPage}
          onAddSection={addSection}
          onMovePage={movePage}
          onMoveSection={moveSection}
          onTogglePage={(pageId) => {
            const page = siteDocument.pages.find((item) => item.id === pageId);
            if (page) {
              setSelectedPageId(pageId);
              setSelectedSectionId(page.sections[0]?.id ?? "");
              commit((document) => ({
                ...document,
                pages: document.pages.map((item) =>
                  item.id === pageId
                    ? { ...item, hidden: !item.hidden }
                    : item,
                ),
              }));
            }
          }}
          onToggleSection={(sectionId) => {
            const section = selectedPage?.sections.find(
              (item) => item.id === sectionId,
            );
            if (!selectedPage || !section) return;
            setSelectedSectionId(sectionId);
            commit((document) => ({
              ...document,
              pages: document.pages.map((page) =>
                page.id === selectedPage.id
                  ? {
                      ...page,
                      sections: page.sections.map((item) =>
                        item.id === sectionId
                          ? { ...item, hidden: !item.hidden }
                          : item,
                      ),
                    }
                  : page,
              ),
            }));
          }}
        />

        <Inspector
          tab={inspectorTab}
          onTabChange={setInspectorTab}
          document={siteDocument}
          selectedPage={selectedPage}
          selectedSection={selectedSection}
          issues={issues}
          onUpdatePage={updatePage}
          onUpdateSection={updateSection}
          onUpdateTheme={(patch) =>
            commit((document) => ({
              ...document,
              theme: { ...document.theme, ...patch },
            }))
          }
          onUpdateSite={(patch) =>
            commit((document) => ({
              ...document,
              site: { ...document.site, ...patch },
            }))
          }
          onUpdateSeo={(patch) =>
            commit((document) => ({
              ...document,
              seo: { ...document.seo, ...patch },
            }))
          }
          onDeletePage={deletePage}
          onDeleteSection={deleteSection}
          onSelectIssue={selectIssue}
        />

        <Preview
          html={previewHtml}
          device={previewDevice}
          onDeviceChange={setPreviewDevice}
          pageTitle={selectedPage?.title ?? siteDocument.site.name}
        />
      </main>
    </div>
  );
}
