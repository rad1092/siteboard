import type {
  FontToken,
  RadiusToken,
  SectionKind,
  SiteDocument,
  SitePage,
  SiteSection,
  ValidationIssue,
} from "./types";

const allowedSectionKinds: SectionKind[] = ["hero", "content", "callout"];
const allowedFonts: FontToken[] = ["system", "serif", "mono"];
const allowedRadii: RadiusToken[] = ["0", "8", "18"];
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const hexPattern = /^#[0-9a-f]{6}$/i;

const fontStacks: Record<FontToken, string> = {
  system:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasString(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === "string";
}

function isSection(value: unknown): value is SiteSection {
  if (!isRecord(value)) return false;

  return (
    hasString(value, "id") &&
    allowedSectionKinds.includes(value.kind as SectionKind) &&
    hasString(value, "eyebrow") &&
    hasString(value, "title") &&
    hasString(value, "body") &&
    hasString(value, "linkLabel") &&
    hasString(value, "linkUrl") &&
    typeof value.hidden === "boolean"
  );
}

function isPage(value: unknown): value is SitePage {
  if (!isRecord(value)) return false;

  return (
    hasString(value, "id") &&
    hasString(value, "title") &&
    hasString(value, "navLabel") &&
    hasString(value, "slug") &&
    typeof value.hidden === "boolean" &&
    Array.isArray(value.sections) &&
    value.sections.every(isSection)
  );
}

export function isSiteDocument(value: unknown): value is SiteDocument {
  if (!isRecord(value) || value.schemaVersion !== 1) return false;
  if (!isRecord(value.site) || !isRecord(value.theme) || !isRecord(value.seo)) {
    return false;
  }

  const site = value.site;
  const theme = value.theme;
  const seo = value.seo;

  return (
    hasString(value, "updatedAt") &&
    hasString(site, "name") &&
    hasString(site, "baseUrl") &&
    hasString(theme, "background") &&
    hasString(theme, "surface") &&
    hasString(theme, "text") &&
    hasString(theme, "muted") &&
    hasString(theme, "accent") &&
    allowedFonts.includes(theme.font as FontToken) &&
    allowedRadii.includes(theme.radius as RadiusToken) &&
    hasString(seo, "title") &&
    hasString(seo, "description") &&
    hasString(seo, "socialTitle") &&
    hasString(seo, "socialDescription") &&
    hasString(seo, "socialImage") &&
    Array.isArray(value.pages) &&
    value.pages.every(isPage)
  );
}

export type ImportResult =
  | { ok: true; document: SiteDocument }
  | { ok: false; error: string };

export function parseImportedDocument(json: string): ImportResult {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!isSiteDocument(parsed)) {
      return {
        ok: false,
        error:
          "This file is not a Siteboard schemaVersion 1 document, or required fields are missing.",
      };
    }

    return {
      ok: true,
      document: structuredClone(parsed),
    };
  } catch {
    return {
      ok: false,
      error: "The selected file is not valid JSON.",
    };
  }
}

export function isSafeHref(value: string): boolean {
  const href = value.trim();
  if (!href) return false;
  if (
    href.startsWith("#") ||
    href.startsWith("/") ||
    href.startsWith("./") ||
    href.startsWith("../")
  ) {
    return true;
  }

  try {
    const url = new URL(href);
    return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function isSafeImageHref(value: string): boolean {
  const href = value.trim();
  if (!href) return true;
  if (
    href.startsWith("/") ||
    href.startsWith("./") ||
    href.startsWith("../")
  ) {
    return true;
  }

  try {
    const url = new URL(href);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function isAbsoluteWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function issue(
  level: ValidationIssue["level"],
  id: string,
  message: string,
  pageId?: string,
  sectionId?: string,
): ValidationIssue {
  return { level, id, message, pageId, sectionId };
}

function relativeLuminance(hex: string): number | null {
  if (!hexPattern.test(hex)) return null;
  const values = [1, 3, 5].map((index) =>
    Number.parseInt(hex.slice(index, index + 2), 16),
  );
  const linear = values.map((value) => {
    const channel = value / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

export function contrastRatio(first: string, second: string): number | null {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  if (firstLuminance === null || secondLuminance === null) return null;

  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export function validateDocument(document: SiteDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const visiblePages = document.pages.filter((page) => !page.hidden);
  const visiblePageAnchors = new Set(
    visiblePages.map((page) => `#page-${page.slug}`),
  );

  if (!document.site.name.trim()) {
    issues.push(issue("error", "site-name", "Site name is required."));
  }

  if (
    document.site.baseUrl.trim() &&
    !isAbsoluteWebUrl(document.site.baseUrl)
  ) {
    issues.push(
      issue(
        "error",
        "site-url",
        "Base URL must be a complete http:// or https:// URL.",
      ),
    );
  }

  if (visiblePages.length === 0) {
    issues.push(
      issue("error", "visible-page", "At least one page must be visible."),
    );
  }

  const seenSlugs = new Set<string>();
  visiblePages.forEach((page, pageIndex) => {
    if (!page.title.trim()) {
      issues.push(
        issue(
          "error",
          `page-title-${page.id}`,
          `Page ${pageIndex + 1} needs a title.`,
          page.id,
        ),
      );
    }

    if (!page.navLabel.trim()) {
      issues.push(
        issue(
          "warning",
          `page-nav-${page.id}`,
          `"${page.title || `Page ${pageIndex + 1}`}" has no navigation label.`,
          page.id,
        ),
      );
    }

    if (!slugPattern.test(page.slug)) {
      issues.push(
        issue(
          "error",
          `page-slug-${page.id}`,
          `"${page.slug || "(empty)"}" is not a valid lowercase URL slug.`,
          page.id,
        ),
      );
    } else if (seenSlugs.has(page.slug)) {
      issues.push(
        issue(
          "error",
          `page-slug-duplicate-${page.id}`,
          `The slug "${page.slug}" is used more than once.`,
          page.id,
        ),
      );
    }
    seenSlugs.add(page.slug);

    if (page.sections.filter((section) => !section.hidden).length === 0) {
      issues.push(
        issue(
          "error",
          `page-sections-${page.id}`,
          `"${page.title}" needs at least one visible section.`,
          page.id,
        ),
      );
    }

    page.sections
      .filter((section) => !section.hidden)
      .forEach((section, sectionIndex) => {
      if (!section.title.trim()) {
        issues.push(
          issue(
            "error",
            `section-title-${section.id}`,
            `Section ${sectionIndex + 1} on "${page.title}" needs a title.`,
            page.id,
            section.id,
          ),
        );
      }

      if (!section.body.trim()) {
        issues.push(
          issue(
            "warning",
            `section-body-${section.id}`,
            `"${section.title || `Section ${sectionIndex + 1}`}" has no body copy.`,
            page.id,
            section.id,
          ),
        );
      }

      if (section.linkLabel.trim() && !section.linkUrl.trim()) {
        issues.push(
          issue(
            "error",
            `section-link-url-${section.id}`,
            `"${section.title}" has link text but no URL.`,
            page.id,
            section.id,
          ),
        );
      }

      if (section.linkUrl.trim() && !section.linkLabel.trim()) {
        issues.push(
          issue(
            "warning",
            `section-link-label-${section.id}`,
            `"${section.title}" has a URL but no link text.`,
            page.id,
            section.id,
          ),
        );
      }

      if (section.linkUrl.trim() && !isSafeHref(section.linkUrl)) {
        issues.push(
          issue(
            "error",
            `section-link-safe-${section.id}`,
            `"${section.title}" uses an invalid or unsafe link URL.`,
            page.id,
            section.id,
          ),
        );
      }

      if (
        section.linkUrl.startsWith("#page-") &&
        !visiblePageAnchors.has(section.linkUrl)
      ) {
        issues.push(
          issue(
            "error",
            `section-link-page-${section.id}`,
            `"${section.title}" links to a page that is missing or hidden.`,
            page.id,
            section.id,
          ),
        );
      }
      });
  });

  const colorEntries = Object.entries(document.theme).filter(
    ([key]) => !["font", "radius"].includes(key),
  );
  colorEntries.forEach(([key, value]) => {
    if (typeof value !== "string" || !hexPattern.test(value)) {
      issues.push(
        issue(
          "error",
          `theme-${key}`,
          `${key} must be a six-digit hex color such as #17201b.`,
        ),
      );
    }
  });

  const contrastPairs = [
    {
      id: "text-background",
      label: "Text on background",
      foreground: document.theme.text,
      background: document.theme.background,
    },
    {
      id: "muted-background",
      label: "Muted text on background",
      foreground: document.theme.muted,
      background: document.theme.background,
    },
    {
      id: "text-surface",
      label: "Text on surface",
      foreground: document.theme.text,
      background: document.theme.surface,
    },
    {
      id: "muted-surface",
      label: "Muted text on surface",
      foreground: document.theme.muted,
      background: document.theme.surface,
    },
    {
      id: "surface-accent",
      label: "Callout text on accent",
      foreground: document.theme.surface,
      background: document.theme.accent,
    },
  ];

  contrastPairs.forEach((pair) => {
    const ratio = contrastRatio(pair.foreground, pair.background);
    if (ratio !== null && ratio < 4.5) {
      issues.push(
        issue(
          "error",
          `theme-contrast-${pair.id}`,
          `${pair.label} contrast is ${ratio.toFixed(1)}:1; exported text requires at least 4.5:1.`,
        ),
      );
    }
  });

  if (!document.seo.title.trim()) {
    issues.push(issue("error", "seo-title", "SEO title is required."));
  } else if (document.seo.title.length > 60) {
    issues.push(
      issue(
        "warning",
        "seo-title-length",
        `SEO title is ${document.seo.title.length} characters; 60 or fewer is safer.`,
      ),
    );
  }

  if (!document.seo.description.trim()) {
    issues.push(
      issue("warning", "seo-description", "SEO description is empty."),
    );
  } else if (document.seo.description.length > 160) {
    issues.push(
      issue(
        "warning",
        "seo-description-length",
        `SEO description is ${document.seo.description.length} characters; 160 or fewer is safer.`,
      ),
    );
  }

  if (!isSafeImageHref(document.seo.socialImage)) {
    issues.push(
      issue(
        "error",
        "seo-social-image",
        "Social image must be an http(s) or relative URL.",
      ),
    );
  }

  return issues;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeColor(value: string, fallback: string): string {
  return hexPattern.test(value) ? value : fallback;
}

function safeHref(value: string): string {
  return isSafeHref(value) ? value.trim() : "#";
}

function bodyMarkup(value: string): string {
  return escapeHtml(value).replaceAll("\n", "<br />");
}

function renderSection(section: SiteSection): string {
  const link =
    section.linkLabel.trim() && section.linkUrl.trim()
      ? `<a class="section-link" href="${escapeHtml(safeHref(section.linkUrl))}">${escapeHtml(section.linkLabel)} <span aria-hidden="true">→</span></a>`
      : "";

  return `
        <section class="content-section content-section--${section.kind}">
          <div class="content-inner">
            ${section.eyebrow.trim() ? `<p class="eyebrow">${escapeHtml(section.eyebrow)}</p>` : ""}
            <h2>${escapeHtml(section.title)}</h2>
            ${section.body.trim() ? `<p class="body-copy">${bodyMarkup(section.body)}</p>` : ""}
            ${link}
          </div>
        </section>`;
}

function orderPagesForPreview(
  pages: SitePage[],
  previewPageId?: string,
): SitePage[] {
  const visible = pages.filter((page) => !page.hidden);
  if (!previewPageId) return visible;

  const selected = pages.find((page) => page.id === previewPageId);
  if (!selected) return visible;

  return [selected, ...visible.filter((page) => page.id !== selected.id)];
}

export interface HtmlOptions {
  previewPageId?: string;
}

export function generateStaticHtml(
  document: SiteDocument,
  options: HtmlOptions = {},
): string {
  const background = safeColor(document.theme.background, "#f4f1e8");
  const surface = safeColor(document.theme.surface, "#fffdf7");
  const text = safeColor(document.theme.text, "#17201b");
  const muted = safeColor(document.theme.muted, "#5d675f");
  const accent = safeColor(document.theme.accent, "#b84122");
  const radius = allowedRadii.includes(document.theme.radius)
    ? document.theme.radius
    : "8";
  const font = fontStacks[document.theme.font] ?? fontStacks.system;
  const pages = orderPagesForPreview(document.pages, options.previewPageId);
  const visibleNavigation = document.pages.filter((page) => !page.hidden);
  const title = document.seo.title || document.site.name || "Untitled site";
  const socialTitle = document.seo.socialTitle || title;
  const socialDescription =
    document.seo.socialDescription || document.seo.description;

  const navigation = visibleNavigation
    .map(
      (page) =>
        `<a href="#page-${escapeHtml(page.slug)}">${escapeHtml(page.navLabel || page.title)}</a>`,
    )
    .join("");

  const pageMarkup =
    pages.length > 0
      ? pages
          .map(
            (page) => `
      <article class="site-page" id="page-${escapeHtml(page.slug)}" aria-labelledby="title-${escapeHtml(page.id)}">
        <h1 class="sr-only" id="title-${escapeHtml(page.id)}">${escapeHtml(page.title)}</h1>
        ${page.sections
          .filter((section) => !section.hidden)
          .map(renderSection)
          .join("")}
      </article>`,
          )
          .join("")
      : `<main class="empty-site"><h1>No visible pages</h1><p>Open Siteboard and make at least one page visible.</p></main>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(document.seo.description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(socialTitle)}" />
    <meta property="og:description" content="${escapeHtml(socialDescription)}" />
    ${document.site.baseUrl.trim() ? `<meta property="og:url" content="${escapeHtml(document.site.baseUrl)}" />` : ""}
    ${document.seo.socialImage.trim() ? `<meta property="og:image" content="${escapeHtml(document.seo.socialImage)}" />` : ""}
    <style>
      :root {
        color-scheme: light;
        --background: ${background};
        --surface: ${surface};
        --text: ${text};
        --muted: ${muted};
        --accent: ${accent};
        --radius: ${radius}px;
        --font: ${font};
      }
      * { box-sizing: border-box; }
      html { scroll-behavior: smooth; background: var(--background); }
      body {
        margin: 0;
        background: var(--background);
        color: var(--text);
        font-family: var(--font);
        line-height: 1.5;
        text-rendering: optimizeLegibility;
      }
      a { color: inherit; }
      a:focus-visible { outline: 3px solid var(--accent); outline-offset: 4px; }
      .sr-only {
        position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
        overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
      }
      .site-header {
        display: flex; min-height: 72px; align-items: center; justify-content: space-between;
        gap: 24px; padding: 0 clamp(20px, 5vw, 72px); border-bottom: 1px solid color-mix(in srgb, var(--text) 16%, transparent);
      }
      .site-name { font-size: 15px; font-weight: 800; text-decoration: none; }
      .site-nav { display: flex; flex-wrap: wrap; gap: 22px; }
      .site-nav a { font-size: 13px; font-weight: 700; text-decoration: none; }
      .content-section { padding: clamp(68px, 11vw, 148px) clamp(20px, 7vw, 112px); }
      .content-section:nth-child(even) { background: var(--surface); }
      .content-inner { width: min(100%, 1050px); margin: 0 auto; }
      .eyebrow {
        margin: 0 0 24px; color: var(--muted); font-size: 12px; font-weight: 800;
        letter-spacing: .08em; text-transform: uppercase;
      }
      h2 {
        max-width: 13ch; margin: 0; font-size: clamp(48px, 9vw, 112px);
        letter-spacing: -.055em; line-height: .95;
      }
      .content-section--content h2 { font-size: clamp(38px, 6vw, 76px); }
      .content-section--callout .content-inner {
        padding: clamp(28px, 5vw, 64px); border-radius: var(--radius); background: var(--accent); color: var(--surface);
      }
      .body-copy {
        max-width: 650px; margin: 32px 0 0; color: var(--muted);
        font-size: clamp(18px, 2.2vw, 25px); line-height: 1.65;
      }
      .content-section--callout .body-copy, .content-section--callout .eyebrow { color: inherit; }
      .section-link {
        display: inline-flex; gap: 28px; margin-top: 32px; padding: 13px 16px;
        border: 1px solid currentColor; border-radius: var(--radius);
        font-size: 14px; font-weight: 800; text-decoration: none;
      }
      .site-footer {
        display: flex; justify-content: space-between; gap: 20px;
        padding: 36px clamp(20px, 5vw, 72px); background: var(--text); color: var(--background); font-size: 13px;
      }
      .empty-site { min-height: 70vh; padding: 80px 6vw; }
      @media (max-width: 620px) {
        .site-header { align-items: flex-start; flex-direction: column; padding-block: 20px; }
        .site-nav { gap: 15px; }
        .content-section { padding-block: 64px; }
        .site-footer { flex-direction: column; }
      }
      @media (prefers-reduced-motion: reduce) {
        html { scroll-behavior: auto; }
      }
    </style>
  </head>
  <body>
    <header class="site-header">
      <a class="site-name" href="#page-${escapeHtml(pages[0]?.slug ?? "home")}">${escapeHtml(document.site.name || "Untitled site")}</a>
      <nav class="site-nav" aria-label="Primary navigation">${navigation}</nav>
    </header>
    <main>${pageMarkup}</main>
    <footer class="site-footer">
      <strong>${escapeHtml(document.site.name || "Untitled site")}</strong>
      <span>Built as a static site.</span>
    </footer>
  </body>
</html>`;
}

export function jsonExport(document: SiteDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
