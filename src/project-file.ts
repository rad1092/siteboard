import {
  isDeploymentRecord,
  type DeploymentRecord,
} from "./deployment";
import { cloneDocument } from "./data";
import { parseImportedDocument } from "./site";
import type { SiteDocument } from "./types";

export const PROJECT_FILE_SCHEMA_VERSION = 1;
export const SNAPSHOT_LIMIT = 12;

const projectNamePattern =
  /^[a-z0-9](?:[a-z0-9-]{0,56}[a-z0-9])?$/;

export interface CloudflareProjectBinding {
  provider: "cloudflare-pages";
  accountId: string;
  projectName: string;
  projectId: string;
  publicOrigin: string;
  existedWhenBound: boolean;
  boundAt: string;
}

export interface DraftSnapshot {
  id: string;
  name: string;
  createdAt: string;
  document: SiteDocument;
}

export interface WorkspaceState {
  schemaVersion: 1;
  binding: CloudflareProjectBinding | null;
  snapshots: DraftSnapshot[];
  lastDeployment: DeploymentRecord | null;
}

export interface SiteboardProjectFile {
  fileType: "siteboard-project";
  fileSchemaVersion: 1;
  exportedAt: string;
  document: SiteDocument;
  cloudflare: CloudflareProjectBinding | null;
  snapshots: DraftSnapshot[];
  lastDeployment: DeploymentRecord | null;
}

export interface ParsedProjectFile {
  document: SiteDocument;
  binding: CloudflareProjectBinding | null;
  snapshots: DraftSnapshot[];
  lastDeployment: DeploymentRecord | null;
  legacy: boolean;
  migratedFrom?: 1;
}

export type ProjectFileResult =
  | { ok: true; project: ParsedProjectFile }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isValidProjectName(value: string): boolean {
  return projectNamePattern.test(value);
}

export function normalizePublicOrigin(value: string): string | null {
  if (!value.trim()) return "";
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      (url.pathname !== "/" && url.pathname !== "") ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function isBinding(value: unknown): value is CloudflareProjectBinding {
  if (!isRecord(value)) return false;
  return (
    value.provider === "cloudflare-pages" &&
    typeof value.accountId === "string" &&
    value.accountId.length > 0 &&
    typeof value.projectName === "string" &&
    isValidProjectName(value.projectName) &&
    typeof value.projectId === "string" &&
    (value.existedWhenBound === true
      ? value.projectId.trim().length > 0
      : value.projectId === "") &&
    typeof value.publicOrigin === "string" &&
    normalizePublicOrigin(value.publicOrigin) !== null &&
    typeof value.existedWhenBound === "boolean" &&
    typeof value.boundAt === "string" &&
    value.boundAt.length > 0
  );
}

function isSnapshot(value: unknown): value is DraftSnapshot {
  if (!isRecord(value)) return false;
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.createdAt !== "string"
  ) {
    return false;
  }
  return parseImportedDocument(JSON.stringify(value.document)).ok;
}

function cleanSnapshots(value: unknown): DraftSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isSnapshot)
    .slice(-SNAPSHOT_LIMIT)
    .map((snapshot) => ({
      ...snapshot,
      document: cloneDocument(snapshot.document),
    }));
}

export function emptyWorkspace(): WorkspaceState {
  return {
    schemaVersion: 1,
    binding: null,
    snapshots: [],
    lastDeployment: null,
  };
}

export function createSnapshot(
  document: SiteDocument,
  name: string,
  now = new Date(),
): DraftSnapshot {
  return {
    id:
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `snapshot-${now.getTime()}`,
    name: name.trim().slice(0, 80) || "저장본",
    createdAt: now.toISOString(),
    document: cloneDocument(document),
  };
}

export function addSnapshot(
  snapshots: DraftSnapshot[],
  snapshot: DraftSnapshot,
): DraftSnapshot[] {
  return [...snapshots, snapshot].slice(-SNAPSHOT_LIMIT);
}

export function createProjectFile(
  document: SiteDocument,
  workspace: WorkspaceState,
  now = new Date(),
): SiteboardProjectFile {
  return {
    fileType: "siteboard-project",
    fileSchemaVersion: PROJECT_FILE_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    document: cloneDocument(document),
    cloudflare: workspace.binding,
    snapshots: workspace.snapshots.map((snapshot) => ({
      ...snapshot,
      document: cloneDocument(snapshot.document),
    })),
    lastDeployment: workspace.lastDeployment,
  };
}

export function exportProjectFile(
  document: SiteDocument,
  workspace: WorkspaceState,
): string {
  return `${JSON.stringify(createProjectFile(document, workspace), null, 2)}\n`;
}

export function parseProjectFile(json: string): ProjectFileResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: "Siteboard 작업 파일을 읽을 수 없습니다." };
  }

  if (
    isRecord(parsed) &&
    parsed.fileType === "siteboard-project" &&
    parsed.fileSchemaVersion === PROJECT_FILE_SCHEMA_VERSION
  ) {
    const documentResult = parseImportedDocument(
      JSON.stringify(parsed.document),
    );
    if (!documentResult.ok) {
      return { ok: false, error: documentResult.error };
    }
    if (parsed.cloudflare !== null && !isBinding(parsed.cloudflare)) {
      return {
        ok: false,
        error: "작업 파일의 Cloudflare 연결 정보를 확인해 주세요.",
      };
    }
    return {
      ok: true,
      project: {
        document: documentResult.document,
        binding: parsed.cloudflare,
        snapshots: cleanSnapshots(parsed.snapshots),
        lastDeployment: isDeploymentRecord(parsed.lastDeployment)
          ? parsed.lastDeployment
          : null,
        legacy: false,
        migratedFrom: documentResult.migratedFrom,
      },
    };
  }

  const legacy = parseImportedDocument(json);
  if (!legacy.ok) return { ok: false, error: legacy.error };
  return {
    ok: true,
    project: {
      document: legacy.document,
      binding: null,
      snapshots: [],
      lastDeployment: null,
      legacy: true,
      migratedFrom: legacy.migratedFrom,
    },
  };
}
