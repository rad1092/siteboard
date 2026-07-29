import { createBlankDocument } from "./data";
import {
  emptyWorkspace,
  exportProjectFile,
  parseProjectFile,
  type WorkspaceState,
} from "./project-file";
import { parseImportedDocument } from "./site";
import type { SiteDocument } from "./types";

export const DOCUMENT_STORAGE_KEY = "siteboard.document.v2";
export const DOCUMENT_BACKUP_KEY = "siteboard.document.backup.v2";
export const DOCUMENT_RECOVERY_KEY = "siteboard.document.recovery.raw";
export const LEGACY_DOCUMENT_STORAGE_KEY = "siteboard.document.v1";
export const LEGACY_DOCUMENT_BACKUP_KEY = "siteboard.document.backup.v1";
export const PROJECT_STORAGE_KEY = "siteboard.project.v1";
export const PROJECT_BACKUP_KEY = "siteboard.project.backup.v1";
export const PROJECT_RECOVERY_KEY = "siteboard.project.recovery.raw";

export type RecoveryKind = "corrupt" | "future-schema";

export interface StorageRecovery {
  kind: RecoveryKind;
  raw: string;
  preservedInStorage: boolean;
}

export interface StoredDocumentResult {
  document: SiteDocument;
  source: "primary" | "backup" | "migrated" | "starter";
  recovery: StorageRecovery | null;
}

export interface StoredProjectResult extends StoredDocumentResult {
  workspace: WorkspaceState;
}

interface SaveOptions {
  allowUnsafePrimaryReplacement?: boolean;
}

export type SaveDocumentResult =
  | { ok: true }
  | { ok: false; reason: "unsafe-primary" | "storage-error" };

function recoveryKind(raw: string): RecoveryKind {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      (("schemaVersion" in parsed &&
        typeof parsed.schemaVersion === "number" &&
        parsed.schemaVersion > 2) ||
        ("fileType" in parsed &&
          parsed.fileType === "siteboard-project" &&
          "fileSchemaVersion" in parsed &&
          typeof parsed.fileSchemaVersion === "number" &&
          parsed.fileSchemaVersion > 1))
    ) {
      return "future-schema";
    }
  } catch {
    // The caller reports invalid JSON as a damaged local save.
  }

  return "corrupt";
}

interface ParsedStored {
  document: SiteDocument;
  migrated: boolean;
}

function validStoredDocument(raw: string | null): ParsedStored | null {
  if (!raw) return null;
  const result = parseImportedDocument(raw);
  return result.ok
    ? { document: result.document, migrated: result.migratedFrom === 1 }
    : null;
}

function legacyDocument(storage: Storage): ParsedStored | null {
  return (
    validStoredDocument(storage.getItem(LEGACY_DOCUMENT_STORAGE_KEY)) ??
    validStoredDocument(storage.getItem(LEGACY_DOCUMENT_BACKUP_KEY))
  );
}

export function loadStoredDocument(storage: Storage): StoredDocumentResult {
  const primaryRaw = storage.getItem(DOCUMENT_STORAGE_KEY);

  if (!primaryRaw) {
    const backup = validStoredDocument(storage.getItem(DOCUMENT_BACKUP_KEY));
    if (backup) {
      return {
        document: backup.document,
        source: backup.migrated ? "migrated" : "backup",
        recovery: null,
      };
    }

    const legacy = legacyDocument(storage);
    return {
      document: legacy?.document ?? createBlankDocument(),
      source: legacy ? "migrated" : "starter",
      recovery: null,
    };
  }

  const primary = validStoredDocument(primaryRaw);
  if (primary) {
    return {
      document: primary.document,
      source: primary.migrated ? "migrated" : "primary",
      recovery: null,
    };
  }

  let preservedInStorage = false;
  try {
    storage.setItem(DOCUMENT_RECOVERY_KEY, primaryRaw);
    preservedInStorage = true;
  } catch {
    // The primary slot still contains the untouched value.
  }

  const backup = validStoredDocument(storage.getItem(DOCUMENT_BACKUP_KEY));
  const legacy = backup ? null : legacyDocument(storage);
  return {
    document:
      backup?.document ?? legacy?.document ?? createBlankDocument(),
    source: backup ? "backup" : legacy ? "migrated" : "starter",
    recovery: {
      kind: recoveryKind(primaryRaw),
      raw: primaryRaw,
      preservedInStorage,
    },
  };
}

export function saveStoredDocument(
  storage: Storage,
  document: SiteDocument,
  options: SaveOptions = {},
): SaveDocumentResult {
  try {
    const serialized = JSON.stringify(document);
    const primaryRaw = storage.getItem(DOCUMENT_STORAGE_KEY);
    const primary = validStoredDocument(primaryRaw);

    if (primaryRaw && !primary && !options.allowUnsafePrimaryReplacement) {
      return { ok: false, reason: "unsafe-primary" };
    }

    if (primaryRaw && primary) {
      storage.setItem(DOCUMENT_BACKUP_KEY, primaryRaw);
    } else if (primaryRaw) {
      storage.setItem(DOCUMENT_RECOVERY_KEY, primaryRaw);
      if (!validStoredDocument(storage.getItem(DOCUMENT_BACKUP_KEY))) {
        storage.setItem(DOCUMENT_BACKUP_KEY, serialized);
      }
    } else {
      storage.setItem(DOCUMENT_BACKUP_KEY, serialized);
    }

    storage.setItem(DOCUMENT_STORAGE_KEY, serialized);
    return { ok: true };
  } catch {
    return { ok: false, reason: "storage-error" };
  }
}

function validProject(raw: string | null) {
  if (!raw) return null;
  const result = parseProjectFile(raw);
  return result.ok ? result.project : null;
}

function preserveProjectRecovery(
  storage: Storage,
  raw: string,
): boolean {
  try {
    storage.setItem(PROJECT_RECOVERY_KEY, raw);
    return true;
  } catch {
    return false;
  }
}

export function loadStoredProject(storage: Storage): StoredProjectResult {
  const primaryRaw = storage.getItem(PROJECT_STORAGE_KEY);
  const primary = validProject(primaryRaw);
  if (primary) {
    return {
      document: primary.document,
      workspace: {
        schemaVersion: 1,
        binding: primary.binding,
        snapshots: primary.snapshots,
        lastDeployment: primary.lastDeployment,
      },
      source: "primary",
      recovery: null,
    };
  }

  const preservedInStorage = primaryRaw
    ? preserveProjectRecovery(storage, primaryRaw)
    : false;
  const backup = validProject(storage.getItem(PROJECT_BACKUP_KEY));
  if (backup) {
    return {
      document: backup.document,
      workspace: {
        schemaVersion: 1,
        binding: backup.binding,
        snapshots: backup.snapshots,
        lastDeployment: backup.lastDeployment,
      },
      source: "backup",
      recovery: primaryRaw
        ? {
            kind: recoveryKind(primaryRaw),
            raw: primaryRaw,
            preservedInStorage,
          }
        : null,
    };
  }

  const legacy = loadStoredDocument(storage);
  return {
    ...legacy,
    workspace: emptyWorkspace(),
    recovery: primaryRaw
      ? {
          kind: recoveryKind(primaryRaw),
          raw: primaryRaw,
          preservedInStorage,
        }
      : legacy.recovery,
  };
}

export function saveStoredProject(
  storage: Storage,
  document: SiteDocument,
  workspace: WorkspaceState,
  options: SaveOptions = {},
): SaveDocumentResult {
  try {
    const serialized = exportProjectFile(document, workspace);
    const primaryRaw = storage.getItem(PROJECT_STORAGE_KEY);
    const primary = validProject(primaryRaw);
    if (primaryRaw && !primary) {
      if (!options.allowUnsafePrimaryReplacement) {
        return { ok: false, reason: "unsafe-primary" };
      }
      if (!preserveProjectRecovery(storage, primaryRaw)) {
        return { ok: false, reason: "storage-error" };
      }
    }
    if (primaryRaw && primary) {
      storage.setItem(PROJECT_BACKUP_KEY, primaryRaw);
    } else if (!primaryRaw || !validProject(storage.getItem(PROJECT_BACKUP_KEY))) {
      storage.setItem(PROJECT_BACKUP_KEY, serialized);
    }
    storage.setItem(PROJECT_STORAGE_KEY, serialized);
    return { ok: true };
  } catch {
    return { ok: false, reason: "storage-error" };
  }
}
