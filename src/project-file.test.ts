import { describe, expect, it } from "vitest";
import {
  addSnapshot,
  createProjectFile,
  createSnapshot,
  exportProjectFile,
  isValidProjectName,
  normalizePublicOrigin,
  parseProjectFile,
} from "./project-file";
import { completeDocument } from "./test/fixture";

const binding = {
  provider: "cloudflare-pages" as const,
  accountId: "account-1",
  projectName: "corner-workshop",
  projectId: "project-1",
  publicOrigin: "https://corner.example",
  existedWhenBound: true,
  boundAt: "2026-07-29T00:00:00.000Z",
};

describe("Siteboard project files", () => {
  it("round-trips the document, explicit Cloudflare binding, and snapshots", () => {
    const document = completeDocument();
    const snapshots = [
      createSnapshot(document, "배포 전", new Date("2026-07-29T00:00:00Z")),
    ];
    const result = parseProjectFile(
      exportProjectFile(document, {
        schemaVersion: 1,
        binding,
        snapshots,
        lastDeployment: null,
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      project: {
        legacy: false,
        binding,
      },
    });
    if (result.ok) {
      expect(result.project.document.site.name).toBe("모서리 공방");
      expect(result.project.snapshots[0].name).toBe("배포 전");
    }
  });

  it("opens a legacy v2 document unbound", () => {
    const result = parseProjectFile(JSON.stringify(completeDocument()));
    expect(result).toMatchObject({
      ok: true,
      project: { legacy: true, binding: null, snapshots: [] },
    });
  });

  it("rejects a malformed binding instead of silently targeting another project", () => {
    const file = createProjectFile(
      completeDocument(),
      {
        schemaVersion: 1,
        binding,
        snapshots: [],
        lastDeployment: null,
      },
    ) as unknown as Record<string, unknown>;
    file.cloudflare = { ...binding, projectName: "My Project" };
    expect(parseProjectFile(JSON.stringify(file))).toEqual({
      ok: false,
      error: "작업 파일의 Cloudflare 연결 정보를 확인해 주세요.",
    });

    file.cloudflare = { ...binding, projectId: "" };
    expect(parseProjectFile(JSON.stringify(file))).toEqual({
      ok: false,
      error: "작업 파일의 Cloudflare 연결 정보를 확인해 주세요.",
    });
  });

  it("accepts only root HTTPS public origins and valid Pages names", () => {
    expect(normalizePublicOrigin("https://example.com/")).toBe(
      "https://example.com",
    );
    expect(normalizePublicOrigin("http://example.com")).toBeNull();
    expect(normalizePublicOrigin("https://example.com/path")).toBeNull();
    expect(isValidProjectName("corner-workshop")).toBe(true);
    expect(isValidProjectName("")).toBe(false);
    expect(isValidProjectName("My Project")).toBe(false);
  });

  it("keeps only the newest twelve named draft snapshots", () => {
    const document = completeDocument();
    const snapshots = Array.from({ length: 13 }, (_, index) =>
      createSnapshot(document, `저장본 ${index}`, new Date(index * 1_000)),
    ).reduce(addSnapshot, []);
    expect(snapshots).toHaveLength(12);
    expect(snapshots[0].name).toBe("저장본 1");
  });

  it("keeps only a field-valid last deployment record", () => {
    const file = createProjectFile(
      completeDocument(),
      {
        schemaVersion: 1,
        binding,
        snapshots: [],
        lastDeployment: null,
      },
    ) as unknown as Record<string, unknown>;
    const validRecord = {
      schemaVersion: 1,
      eventId: "event-1",
      createdAt: "2026-07-29T00:00:00.000Z",
      operation: "publish",
      status: "live",
      projectName: "corner-workshop",
      revision: "a".repeat(64),
      deploymentId: "deployment-1",
      deploymentUrl: "https://hash.corner.pages.dev",
      productionUrl: "https://corner.example",
      verification: {
        ok: true,
        checkedAt: "2026-07-29T00:00:01.000Z",
        status: 200,
        url: "https://corner.example/",
        revision: "a".repeat(64),
      },
    };
    file.lastDeployment = validRecord;
    const valid = parseProjectFile(JSON.stringify(file));
    expect(valid).toMatchObject({
      ok: true,
      project: { lastDeployment: validRecord },
    });

    file.lastDeployment = {
      ...validRecord,
      createdAt: "not-a-date",
      productionUrl: "javascript:alert(1)",
    };
    const invalid = parseProjectFile(JSON.stringify(file));
    expect(invalid).toMatchObject({
      ok: true,
      project: { lastDeployment: null },
    });
  });
});
