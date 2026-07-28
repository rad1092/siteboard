import { describe, expect, it } from "vitest";
import { cloneDocument, demoDocument } from "./data";
import {
  contrastRatio,
  generateStaticHtml,
  isSafeHref,
  parseImportedDocument,
  validateDocument,
} from "./site";

describe("document validation", () => {
  it("accepts the neutral demo without export-blocking errors", () => {
    const errors = validateDocument(demoDocument).filter(
      (item) => item.level === "error",
    );
    expect(errors).toEqual([]);
  });

  it("detects duplicate slugs, unsafe links, and missing visible sections", () => {
    const document = cloneDocument(demoDocument);
    document.pages[1].slug = document.pages[0].slug;
    document.pages[0].sections[0].linkUrl = "javascript:alert(1)";
    document.pages[2].sections[0].hidden = true;

    const issueIds = validateDocument(document).map((item) => item.id);
    expect(issueIds).toContain(`page-slug-duplicate-${document.pages[1].id}`);
    expect(issueIds).toContain(
      `section-link-safe-${document.pages[0].sections[0].id}`,
    );
    expect(issueIds).toContain(`page-sections-${document.pages[2].id}`);
  });

  it("checks contrast and safe protocols", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21);
    expect(isSafeHref("mailto:hello@example.com")).toBe(true);
    expect(isSafeHref("#contact")).toBe(true);
    expect(isSafeHref("data:text/html,unsafe")).toBe(false);
  });

  it("ignores unfinished hidden content and only blocks visible collisions", () => {
    const document = cloneDocument(demoDocument);
    document.pages[1].hidden = true;
    document.pages[1].title = "";
    document.pages[1].navLabel = "";
    document.pages[1].slug = document.pages[0].slug;
    document.pages[1].sections[0].title = "";
    document.pages[1].sections[0].linkUrl = "javascript:alert(1)";
    document.pages[0].sections[1].hidden = true;
    document.pages[0].sections[1].title = "";
    document.pages[0].sections[1].linkUrl = "javascript:alert(1)";

    const hiddenIssueIds = validateDocument(document).map((item) => item.id);
    expect(
      hiddenIssueIds.some(
        (id) =>
          id.includes(document.pages[1].id) ||
          id.includes(document.pages[1].sections[0].id) ||
          id.includes(document.pages[0].sections[1].id),
      ),
    ).toBe(false);

    document.pages[2].slug = document.pages[0].slug;
    const visibleIssueIds = validateDocument(document).map((item) => item.id);
    expect(visibleIssueIds).toContain(
      `page-slug-duplicate-${document.pages[2].id}`,
    );
  });

  it("blocks unreadable color combinations used by exported pages", () => {
    const document = cloneDocument(demoDocument);
    document.theme.text = document.theme.background;
    document.theme.muted = document.theme.surface;
    document.theme.accent = document.theme.surface;

    const issueIds = validateDocument(document)
      .filter((item) => item.level === "error")
      .map((item) => item.id);

    expect(issueIds).toContain("theme-contrast-text-background");
    expect(issueIds).toContain("theme-contrast-muted-surface");
    expect(issueIds).toContain("theme-contrast-surface-accent");
  });

  it("blocks visible links to pages that are hidden from export", () => {
    const document = cloneDocument(demoDocument);
    document.pages[1].hidden = true;

    const issueIds = validateDocument(document).map((item) => item.id);

    expect(issueIds).toContain(
      `section-link-page-${document.pages[0].sections[1].id}`,
    );
  });
});

describe("imports and static export", () => {
  it("parses schemaVersion 1 documents and rejects malformed data", () => {
    expect(parseImportedDocument(JSON.stringify(demoDocument)).ok).toBe(true);
    expect(parseImportedDocument("{broken").ok).toBe(false);
    expect(parseImportedDocument('{"schemaVersion":2}').ok).toBe(false);
  });

  it("exports escaped content, metadata, visible pages, and no React runtime", () => {
    const document = cloneDocument(demoDocument);
    document.pages[0].sections[0].title = "<script>alert(1)</script>";
    document.pages[1].hidden = true;

    const html = generateStaticHtml(document);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain('<meta property="og:title"');
    expect(html).toContain("page-home");
    expect(html).not.toContain('class="site-page" id="page-services"');
    expect(html).not.toContain("react");
    expect(html).not.toContain("opacity: .86");
  });
});
