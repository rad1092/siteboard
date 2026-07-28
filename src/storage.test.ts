import { describe, expect, it } from "vitest";
import { cloneDocument } from "./data";
import {
  DOCUMENT_BACKUP_KEY,
  DOCUMENT_RECOVERY_KEY,
  DOCUMENT_STORAGE_KEY,
  LEGACY_DOCUMENT_STORAGE_KEY,
  loadStoredDocument,
  saveStoredDocument,
} from "./storage";
import { completeDocument } from "./test/fixture";

const legacyV1 = {
  schemaVersion: 1,
  updatedAt: "2026-01-01T00:00:00.000Z",
  site: { name: "기존 상점", baseUrl: "https://legacy.example" },
  theme: {
    background: "#ffffff",
    surface: "#ffffff",
    text: "#111111",
    muted: "#666666",
    accent: "#245d48",
    font: "system",
    radius: "8",
  },
  seo: {
    title: "기존 상점",
    description: "기존 설명",
    socialTitle: "",
    socialDescription: "",
    socialImage: "",
  },
  pages: [
    {
      id: "home",
      title: "Home",
      navLabel: "Home",
      slug: "home",
      hidden: false,
      sections: [
        {
          id: "hero",
          kind: "hero",
          eyebrow: "",
          title: "기존 한 줄 소개",
          body: "기존 설명",
          linkLabel: "",
          linkUrl: "",
          hidden: false,
        },
      ],
    },
  ],
};

describe("브라우저 문서 저장", () => {
  it("v2 기본 저장본을 읽는다", () => {
    const document = completeDocument();
    document.site.name = "기본 저장본";
    localStorage.setItem(DOCUMENT_STORAGE_KEY, JSON.stringify(document));

    const result = loadStoredDocument(localStorage);

    expect(result.source).toBe("primary");
    expect(result.document.site.name).toBe("기본 저장본");
    expect(result.recovery).toBeNull();
  });

  it("v1 저장본을 그대로 보존하며 v2 문서로 옮긴다", () => {
    const raw = JSON.stringify(legacyV1);
    localStorage.setItem(LEGACY_DOCUMENT_STORAGE_KEY, raw);

    const result = loadStoredDocument(localStorage);

    expect(result.source).toBe("migrated");
    expect(result.document.schemaVersion).toBe(2);
    expect(result.document.site.name).toBe("기존 상점");
    expect(localStorage.getItem(LEGACY_DOCUMENT_STORAGE_KEY)).toBe(raw);
  });

  it("손상된 기본 저장본을 보존하고 정상 백업을 연다", () => {
    const raw = '{"schemaVersion":2,"broken":';
    const backup = completeDocument();
    backup.site.name = "정상 백업";
    localStorage.setItem(DOCUMENT_STORAGE_KEY, raw);
    localStorage.setItem(DOCUMENT_BACKUP_KEY, JSON.stringify(backup));

    const result = loadStoredDocument(localStorage);

    expect(result.source).toBe("backup");
    expect(result.document.site.name).toBe("정상 백업");
    expect(result.recovery).toMatchObject({
      kind: "corrupt",
      raw,
      preservedInStorage: true,
    });
    expect(localStorage.getItem(DOCUMENT_STORAGE_KEY)).toBe(raw);
    expect(localStorage.getItem(DOCUMENT_RECOVERY_KEY)).toBe(raw);
  });

  it("미래 형식의 기본 저장본을 시작 문서로 덮지 않는다", () => {
    const raw = JSON.stringify({
      schemaVersion: 8,
      futureField: "keep exactly",
    });
    localStorage.setItem(DOCUMENT_STORAGE_KEY, raw);

    const result = loadStoredDocument(localStorage);

    expect(result.source).toBe("starter");
    expect(result.recovery?.kind).toBe("future-schema");
    expect(result.recovery?.raw).toBe(raw);
    expect(localStorage.getItem(DOCUMENT_STORAGE_KEY)).toBe(raw);
  });

  it("안전하지 않은 기본 슬롯에는 자동 저장을 멈춘다", () => {
    const raw = "{not-json";
    localStorage.setItem(DOCUMENT_STORAGE_KEY, raw);

    const result = saveStoredDocument(localStorage, completeDocument());

    expect(result).toEqual({ ok: false, reason: "unsafe-primary" });
    expect(localStorage.getItem(DOCUMENT_STORAGE_KEY)).toBe(raw);
  });

  it("직전 정상 저장본을 백업으로 돌린다", () => {
    const previous = completeDocument();
    previous.site.name = "이전";
    const next = cloneDocument(previous);
    next.site.name = "현재";
    localStorage.setItem(DOCUMENT_STORAGE_KEY, JSON.stringify(previous));

    expect(saveStoredDocument(localStorage, next)).toEqual({ ok: true });

    expect(
      JSON.parse(localStorage.getItem(DOCUMENT_BACKUP_KEY) ?? "{}").site.name,
    ).toBe("이전");
    expect(
      JSON.parse(localStorage.getItem(DOCUMENT_STORAGE_KEY) ?? "{}").site.name,
    ).toBe("현재");
  });
});
