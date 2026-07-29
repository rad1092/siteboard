import type { DeploymentRecord } from "./deployment";
import type { SiteDocument } from "./types";

export const PROJECTS_STORAGE_KEY = "siteboard.projects.v1";
export const CURRENT_PROJECT_STORAGE_KEY = "siteboard.current-project.v1";

export interface SiteProjectSummary {
  schemaVersion: 1;
  id: string;
  name: string;
  pagesProject: string;
  documentUpdatedAt: string;
  lastOpenedAt: string;
  lastDeployment: DeploymentRecord | null;
}

function projectId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `project-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function suggestedPagesProject(name: string): string {
  const normalized = name
    .trim()
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 58)
    .replace(/-+$/g, "");
  return normalized || "my-site";
}

export function createProjectSummary(
  document: SiteDocument,
  previous?: SiteProjectSummary,
): SiteProjectSummary {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: previous?.id ?? projectId(),
    name: document.site.name.trim() || "이름 없는 홈페이지",
    pagesProject:
      previous?.pagesProject || suggestedPagesProject(document.site.name),
    documentUpdatedAt: document.updatedAt,
    lastOpenedAt: now,
    lastDeployment: previous?.lastDeployment ?? null,
  };
}

export function loadProjects(storage: Storage): SiteProjectSummary[] {
  const raw = storage.getItem(PROJECTS_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (project): project is SiteProjectSummary =>
        project?.schemaVersion === 1 &&
        typeof project.id === "string" &&
        typeof project.name === "string" &&
        typeof project.pagesProject === "string" &&
        typeof project.documentUpdatedAt === "string" &&
        typeof project.lastOpenedAt === "string",
    );
  } catch {
    return [];
  }
}

export function saveProjects(
  storage: Storage,
  projects: SiteProjectSummary[],
): void {
  storage.setItem(
    PROJECTS_STORAGE_KEY,
    JSON.stringify(
      [...projects]
        .sort((left, right) =>
          right.lastOpenedAt.localeCompare(left.lastOpenedAt),
        )
        .slice(0, 20),
    ),
  );
}

export function upsertProject(
  projects: SiteProjectSummary[],
  project: SiteProjectSummary,
): SiteProjectSummary[] {
  return [project, ...projects.filter((candidate) => candidate.id !== project.id)];
}

export function projectWithDeployment(
  project: SiteProjectSummary,
  deployment: DeploymentRecord,
): SiteProjectSummary {
  return {
    ...project,
    lastOpenedAt: new Date().toISOString(),
    lastDeployment: deployment,
  };
}
