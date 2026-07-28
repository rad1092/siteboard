import { describe, expect, it } from "vitest";
import { cloneDocument, demoDocument } from "./data";
import {
  DOCUMENT_BACKUP_KEY,
  DOCUMENT_RECOVERY_KEY,
  DOCUMENT_STORAGE_KEY,
  loadStoredDocument,
  saveStoredDocument,
} from "./storage";

describe("local document storage", () => {
  it("loads a valid primary document", () => {
    const document = cloneDocument(demoDocument);
    document.site.name = "Primary document";
    localStorage.setItem(DOCUMENT_STORAGE_KEY, JSON.stringify(document));

    const result = loadStoredDocument(localStorage);

    expect(result.source).toBe("primary");
    expect(result.document.site.name).toBe("Primary document");
    expect(result.recovery).toBeNull();
  });

  it("preserves corrupt primary data and opens the last valid backup", () => {
    const raw = '{"schemaVersion":1,"broken":';
    const backup = cloneDocument(demoDocument);
    backup.site.name = "Last valid backup";
    localStorage.setItem(DOCUMENT_STORAGE_KEY, raw);
    localStorage.setItem(DOCUMENT_BACKUP_KEY, JSON.stringify(backup));

    const result = loadStoredDocument(localStorage);

    expect(result.source).toBe("backup");
    expect(result.document.site.name).toBe("Last valid backup");
    expect(result.recovery).toMatchObject({
      kind: "corrupt",
      raw,
      preservedInStorage: true,
    });
    expect(localStorage.getItem(DOCUMENT_STORAGE_KEY)).toBe(raw);
    expect(localStorage.getItem(DOCUMENT_RECOVERY_KEY)).toBe(raw);
  });

  it("preserves a future-schema primary without treating it as version 1", () => {
    const raw = JSON.stringify({
      ...demoDocument,
      schemaVersion: 2,
      futureField: "keep exactly",
    });
    localStorage.setItem(DOCUMENT_STORAGE_KEY, raw);

    const result = loadStoredDocument(localStorage);

    expect(result.source).toBe("demo");
    expect(result.recovery?.kind).toBe("future-schema");
    expect(result.recovery?.raw).toBe(raw);
    expect(localStorage.getItem(DOCUMENT_STORAGE_KEY)).toBe(raw);
  });

  it("blocks routine autosave when the primary slot is unsafe", () => {
    const raw = "{not-json";
    localStorage.setItem(DOCUMENT_STORAGE_KEY, raw);

    const result = saveStoredDocument(localStorage, demoDocument);

    expect(result).toEqual({ ok: false, reason: "unsafe-primary" });
    expect(localStorage.getItem(DOCUMENT_STORAGE_KEY)).toBe(raw);
  });

  it("rotates the prior valid primary into the last-known-good backup", () => {
    const previous = cloneDocument(demoDocument);
    previous.site.name = "Previous";
    const next = cloneDocument(demoDocument);
    next.site.name = "Next";
    localStorage.setItem(DOCUMENT_STORAGE_KEY, JSON.stringify(previous));

    expect(saveStoredDocument(localStorage, next)).toEqual({ ok: true });

    expect(
      JSON.parse(localStorage.getItem(DOCUMENT_BACKUP_KEY) ?? "{}").site.name,
    ).toBe("Previous");
    expect(
      JSON.parse(localStorage.getItem(DOCUMENT_STORAGE_KEY) ?? "{}").site.name,
    ).toBe("Next");
  });

  it("keeps an existing good backup during an explicit recovery", () => {
    const raw = '{"schemaVersion":99}';
    const backup = cloneDocument(demoDocument);
    backup.site.name = "Keep this backup";
    const replacement = cloneDocument(demoDocument);
    replacement.site.name = "Recovered copy";
    localStorage.setItem(DOCUMENT_STORAGE_KEY, raw);
    localStorage.setItem(DOCUMENT_BACKUP_KEY, JSON.stringify(backup));

    expect(
      saveStoredDocument(localStorage, replacement, {
        allowUnsafePrimaryReplacement: true,
      }),
    ).toEqual({ ok: true });

    expect(localStorage.getItem(DOCUMENT_RECOVERY_KEY)).toBe(raw);
    expect(
      JSON.parse(localStorage.getItem(DOCUMENT_BACKUP_KEY) ?? "{}").site.name,
    ).toBe("Keep this backup");
    expect(
      JSON.parse(localStorage.getItem(DOCUMENT_STORAGE_KEY) ?? "{}").site.name,
    ).toBe("Recovered copy");
  });
});
