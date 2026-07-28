import { cloneDocument, demoDocument } from "./data";
import { parseImportedDocument } from "./site";
import type { SiteDocument } from "./types";

export const DOCUMENT_STORAGE_KEY = "siteboard.document.v1";
export const DOCUMENT_BACKUP_KEY = "siteboard.document.backup.v1";
export const DOCUMENT_RECOVERY_KEY = "siteboard.document.recovery.raw";

export type RecoveryKind = "corrupt" | "future-schema";

export interface StorageRecovery {
  kind: RecoveryKind;
  raw: string;
  preservedInStorage: boolean;
}

export interface StoredDocumentResult {
  document: SiteDocument;
  source: "primary" | "backup" | "demo";
  recovery: StorageRecovery | null;
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
      "schemaVersion" in parsed &&
      typeof parsed.schemaVersion === "number" &&
      parsed.schemaVersion > 1
    ) {
      return "future-schema";
    }
  } catch {
    // Invalid JSON is handled as a corrupt save.
  }

  return "corrupt";
}

function validStoredDocument(raw: string | null): SiteDocument | null {
  if (!raw) return null;
  const result = parseImportedDocument(raw);
  return result.ok ? result.document : null;
}

export function loadStoredDocument(storage: Storage): StoredDocumentResult {
  const primaryRaw = storage.getItem(DOCUMENT_STORAGE_KEY);

  if (!primaryRaw) {
    const backup = validStoredDocument(storage.getItem(DOCUMENT_BACKUP_KEY));
    return {
      document: backup ?? cloneDocument(demoDocument),
      source: backup ? "backup" : "demo",
      recovery: null,
    };
  }

  const primary = validStoredDocument(primaryRaw);
  if (primary) {
    return {
      document: primary,
      source: "primary",
      recovery: null,
    };
  }

  let preservedInStorage = false;
  try {
    storage.setItem(DOCUMENT_RECOVERY_KEY, primaryRaw);
    preservedInStorage = true;
  } catch {
    // The raw value remains in the primary slot and in memory for download.
  }

  const backup = validStoredDocument(storage.getItem(DOCUMENT_BACKUP_KEY));
  return {
    document: backup ?? cloneDocument(demoDocument),
    source: backup ? "backup" : "demo",
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
