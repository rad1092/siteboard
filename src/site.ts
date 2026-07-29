import {
  cloneDocument,
  createBlankDocument,
  createId,
  createService,
  createWork,
} from "./data";
import type {
  BlockKind,
  ExportFile,
  ImageAsset,
  SiteDocument,
  ThemePreset,
  ValidationIssue,
} from "./types";

const blockKinds: BlockKind[] = [
  "services",
  "work",
  "about",
  "faq",
  "contact",
];
const themePresets: ThemePreset[] = ["studio", "editorial", "signal"];
const imageMimeTypes = ["image/png", "image/jpeg", "image/webp"] as const;
const hexPattern = /^#[0-9a-f]{6}$/i;
const dataUrlPattern =
  /^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=\r\n]+)$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MAX_IMAGE_BYTES = 800_000;
export const MAX_DOCUMENT_IMAGE_BYTES = 1_500_000;

export const presetLabels: Record<ThemePreset, string> = {
  studio: "차분한 스튜디오",
  editorial: "따뜻한 에디토리얼",
  signal: "선명한 다크",
};

interface PresetTokens {
  background: string;
  surface: string;
  text: string;
  muted: string;
  line: string;
  headingFont: string;
  bodyFont: string;
  radius: string;
}

const presetTokens: Record<ThemePreset, PresetTokens> = {
  studio: {
    background: "#f4f1e9",
    surface: "#fffdf7",
    text: "#1a1e1b",
    muted: "#5d655f",
    line: "#c9cec8",
    headingFont:
      '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
    bodyFont:
      '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
    radius: "14px",
  },
  editorial: {
    background: "#f5efe5",
    surface: "#fffaf1",
    text: "#261f1a",
    muted: "#6b5f55",
    line: "#cfc2b2",
    headingFont: 'Georgia, "Times New Roman", "Noto Serif KR", serif',
    bodyFont:
      '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
    radius: "2px",
  },
  signal: {
    background: "#111411",
    surface: "#1b201c",
    text: "#f3f5ed",
    muted: "#b4bcb4",
    line: "#3e463f",
    headingFont:
      '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
    bodyFont:
      '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
    radius: "20px",
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasString(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === "string";
}

function stringValue(record: Record<string, unknown>, key: string): string {
  return typeof record[key] === "string" ? record[key] : "";
}

function isImageAsset(value: unknown): value is ImageAsset {
  if (!isRecord(value)) return false;
  const dataUrl = typeof value.dataUrl === "string" ? value.dataUrl : "";
  const match = dataUrl.match(dataUrlPattern);
  const encodedLength = match?.[2].replace(/\s/g, "").length ?? 0;
  const estimatedBytes = Math.floor((encodedLength * 3) / 4);
  return (
    hasString(value, "id") &&
    hasString(value, "name") &&
    imageMimeTypes.includes(
      value.mimeType as (typeof imageMimeTypes)[number],
    ) &&
    Boolean(match) &&
    match?.[1].toLowerCase() === value.mimeType &&
    estimatedBytes <= MAX_IMAGE_BYTES &&
    typeof value.size === "number" &&
    Number.isFinite(value.size) &&
    value.size >= 0 &&
    value.size <= MAX_IMAGE_BYTES
  );
}

function isNullableImageAsset(value: unknown): value is ImageAsset | null {
  return value === null || isImageAsset(value);
}

function hasExactBlockOrder(value: unknown): value is BlockKind[] {
  if (!Array.isArray(value) || value.length !== blockKinds.length) return false;
  return (
    value.every((item) => blockKinds.includes(item as BlockKind)) &&
    new Set(value).size === blockKinds.length
  );
}

export function isSiteDocument(value: unknown): value is SiteDocument {
  if (!isRecord(value) || value.schemaVersion !== 2) return false;
  if (
    !isRecord(value.site) ||
    !isRecord(value.brand) ||
    !isRecord(value.hero) ||
    !isRecord(value.services) ||
    !isRecord(value.work) ||
    !isRecord(value.about) ||
    !isRecord(value.faq) ||
    !isRecord(value.contact) ||
    !isRecord(value.layout) ||
    !isRecord(value.theme) ||
    !isRecord(value.seo)
  ) {
    return false;
  }

  const {
    site,
    brand,
    hero,
    services,
    work,
    about,
    faq,
    contact,
    layout,
    theme,
    seo,
  } = value;
  const visible = isRecord(layout.visible) ? layout.visible : null;

  if (
    !hasString(value, "updatedAt") ||
    !["ko", "en"].includes(String(site.language)) ||
    !["name", "tagline", "summary", "baseUrl"].every((key) =>
      hasString(site, key),
    ) ||
    !isNullableImageAsset(brand.logo) ||
    !isNullableImageAsset(brand.heroImage) ||
    ![
      "eyebrow",
      "primaryLabel",
      "primaryUrl",
      "secondaryLabel",
      "secondaryUrl",
    ].every((key) => hasString(hero, key)) ||
    !["heading", "intro"].every((key) => hasString(services, key)) ||
    !["heading", "intro"].every((key) => hasString(work, key)) ||
    !["heading", "body"].every((key) => hasString(about, key)) ||
    !hasString(faq, "heading") ||
    ![
      "heading",
      "message",
      "email",
      "phone",
      "address",
      "hours",
    ].every((key) => hasString(contact, key)) ||
    !hasExactBlockOrder(layout.order) ||
    !visible ||
    !blockKinds.every((kind) => typeof visible[kind] === "boolean") ||
    !themePresets.includes(theme.preset as ThemePreset) ||
    !hasString(theme, "accent") ||
    !["title", "description"].every((key) => hasString(seo, key))
  ) {
    return false;
  }

  if (
    !Array.isArray(services.items) ||
    !services.items.every(
      (item) =>
        isRecord(item) &&
        ["id", "title", "description"].every((key) => hasString(item, key)),
    )
  ) {
    return false;
  }

  if (
    !Array.isArray(work.items) ||
    !work.items.every(
      (item) =>
        isRecord(item) &&
        ["id", "title", "description", "linkLabel", "linkUrl"].every((key) =>
          hasString(item, key),
        ) &&
        isNullableImageAsset(item.image),
    )
  ) {
    return false;
  }

  return (
    Array.isArray(faq.items) &&
    faq.items.every(
      (item) =>
        isRecord(item) &&
        ["id", "question", "answer"].every((key) => hasString(item, key)),
    )
  );
}

interface LegacySection {
  kind: string;
  title: string;
  body: string;
  eyebrow: string;
  linkLabel: string;
  linkUrl: string;
  hidden: boolean;
}

interface LegacyPage {
  title: string;
  slug: string;
  hidden: boolean;
  sections: LegacySection[];
}

function legacyPages(value: Record<string, unknown>): LegacyPage[] {
  if (!Array.isArray(value.pages)) return [];

  return value.pages
    .filter(isRecord)
    .map((page) => ({
      title: stringValue(page, "title"),
      slug: stringValue(page, "slug"),
      hidden: page.hidden === true,
      sections: Array.isArray(page.sections)
        ? page.sections.filter(isRecord).map((section) => ({
            kind: stringValue(section, "kind"),
            title: stringValue(section, "title"),
            body: stringValue(section, "body"),
            eyebrow: stringValue(section, "eyebrow"),
            linkLabel: stringValue(section, "linkLabel"),
            linkUrl: stringValue(section, "linkUrl"),
            hidden: section.hidden === true,
          }))
        : [],
    }));
}

export function migrateVersionOne(value: unknown): SiteDocument | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;

  const document = createBlankDocument();
  const site = isRecord(value.site) ? value.site : {};
  const seo = isRecord(value.seo) ? value.seo : {};
  const theme = isRecord(value.theme) ? value.theme : {};
  const pages = legacyPages(value).filter((page) => !page.hidden);
  const allSections = pages.flatMap((page) =>
    page.sections.filter((section) => !section.hidden),
  );
  const hero =
    allSections.find((section) => section.kind === "hero") ?? allSections[0];
  const servicesPage = pages.find((page) =>
    /service|서비스/i.test(`${page.slug} ${page.title}`),
  );
  const workPage = pages.find((page) =>
    /work|project|portfolio|작업|프로젝트/i.test(
      `${page.slug} ${page.title}`,
    ),
  );
  const aboutPage = pages.find((page) =>
    /about|studio|소개/i.test(`${page.slug} ${page.title}`),
  );
  const contactPage = pages.find((page) =>
    /contact|연락|문의/i.test(`${page.slug} ${page.title}`),
  );

  document.site.name = stringValue(site, "name");
  document.site.baseUrl = stringValue(site, "baseUrl");
  document.site.tagline = hero?.title ?? "";
  document.site.summary = hero?.body ?? "";
  document.hero.eyebrow = hero?.eyebrow ?? "";
  document.hero.primaryLabel = hero?.linkLabel || "연락하기";
  document.hero.primaryUrl = hero?.linkUrl || "#contact";

  document.services.items = (servicesPage?.sections ?? [])
    .filter((section) => !section.hidden)
    .map((section) => ({
      ...createService(),
      title: section.title,
      description: section.body,
    }));
  document.work.items = (workPage?.sections ?? [])
    .filter((section) => !section.hidden)
    .map((section) => ({
      ...createWork(),
      title: section.title,
      description: section.body,
      linkLabel: section.linkLabel,
      linkUrl: section.linkUrl,
    }));
  const about = aboutPage?.sections.find((section) => !section.hidden);
  if (about) {
    document.about.heading = about.title || "소개";
    document.about.body = about.body;
  }
  const contact = contactPage?.sections.find((section) => !section.hidden);
  if (contact) {
    document.contact.heading = contact.title || "연락";
    document.contact.message = contact.body;
  }
  document.layout.visible.services = document.services.items.length > 0;
  document.layout.visible.work = document.work.items.length > 0;
  document.layout.visible.about = Boolean(document.about.body.trim());

  document.theme.preset =
    theme.font === "serif"
      ? "editorial"
      : theme.font === "mono"
        ? "signal"
        : "studio";
  if (typeof theme.accent === "string" && hexPattern.test(theme.accent)) {
    document.theme.accent = theme.accent;
  }
  document.seo.title = stringValue(seo, "title");
  document.seo.description = stringValue(seo, "description");
  document.updatedAt = new Date().toISOString();

  return document;
}

export type ImportResult =
  | { ok: true; document: SiteDocument; migratedFrom?: 1 }
  | { ok: false; error: string; futureSchema?: number };

export function parseImportedDocument(json: string): ImportResult {
  try {
    const parsed: unknown = JSON.parse(json);
    if (isSiteDocument(parsed)) {
      return { ok: true, document: cloneDocument(parsed) };
    }

    const migrated = migrateVersionOne(parsed);
    if (migrated) {
      return { ok: true, document: migrated, migratedFrom: 1 };
    }

    if (
      isRecord(parsed) &&
      typeof parsed.schemaVersion === "number" &&
      parsed.schemaVersion > 2
    ) {
      return {
        ok: false,
        error: `이 파일은 Siteboard v${parsed.schemaVersion}에서 만들어졌습니다. 해당 버전에서 열어 주세요.`,
        futureSchema: parsed.schemaVersion,
      };
    }

    return {
      ok: false,
      error: "Siteboard 홈페이지 파일의 필수 항목을 확인해 주세요.",
    };
  } catch {
    return {
      ok: false,
      error: "JSON 파일을 읽을 수 없습니다.",
    };
  }
}

export function isSafeHref(value: string): boolean {
  const href = value.trim();
  if (!href) return false;
  if (/^#[a-z0-9][a-z0-9-]*$/i.test(href)) return true;
  if (
    (href.startsWith("/") && !href.startsWith("//")) ||
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

function isRootHttpsOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.pathname === "/" || url.pathname === "") &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function issue(
  level: ValidationIssue["level"],
  id: string,
  message: string,
  target: ValidationIssue["target"],
): ValidationIssue {
  return { level, id, message, target };
}

function documentImages(document: SiteDocument): ImageAsset[] {
  return [
    document.brand.logo,
    document.brand.heroImage,
    ...document.work.items.map((item) => item.image),
  ].filter((asset): asset is ImageAsset => asset !== null);
}

export function validateDocument(document: SiteDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!document.site.name.trim()) {
    issues.push(issue("error", "site-name", "상호나 이름을 입력하세요.", "identity"));
  }
  if (!document.site.tagline.trim()) {
    issues.push(
      issue("error", "site-tagline", "첫 화면의 한 줄 소개를 입력하세요.", "identity"),
    );
  }
  if (!document.site.summary.trim()) {
    issues.push(
      issue("error", "site-summary", "방문자에게 전할 설명을 입력하세요.", "identity"),
    );
  }
  const baseUrl = document.site.baseUrl.trim();
  if (!baseUrl) {
    issues.push(
      issue(
        "warning",
        "site-url",
        "공개 주소를 추가하면 검색용 주소 파일도 함께 만듭니다.",
        "identity",
      ),
    );
  } else if (!isRootHttpsOrigin(baseUrl)) {
    issues.push(
      issue(
        "error",
        "site-url-invalid",
        "공개 주소는 경로가 없는 HTTPS 주소로 입력하세요.",
        "identity",
      ),
    );
  }
  if (!document.brand.logo) {
    issues.push(
      issue(
        "warning",
        "brand-logo",
        "로고를 추가하면 상호 첫 글자 대신 브랜드 이미지를 표시합니다.",
        "identity",
      ),
    );
  }
  if (!document.brand.heroImage) {
    issues.push(
      issue(
        "warning",
        "brand-hero",
        "대표 이미지를 추가하면 첫 화면과 링크 공유 카드에 표시합니다.",
        "identity",
      ),
    );
  }

  const imageBytes = documentImages(document).reduce(
    (sum, asset) => sum + asset.size,
    0,
  );
  if (imageBytes > MAX_DOCUMENT_IMAGE_BYTES) {
    issues.push(
      issue(
        "error",
        "image-total",
        "이미지 전체 용량을 1.5MB 아래로 줄여 주세요.",
        "identity",
      ),
    );
  }

  [
    [document.hero.primaryLabel, document.hero.primaryUrl, "primary"],
    [document.hero.secondaryLabel, document.hero.secondaryUrl, "secondary"],
  ].forEach(([label, url, key]) => {
    if (label.trim() && !url.trim()) {
      issues.push(
        issue(
          "error",
          `hero-${key}-url`,
          `"${label}" 버튼의 연결 주소를 입력하세요.`,
          "identity",
        ),
      );
    }
    if (url.trim() && !label.trim()) {
      issues.push(
        issue(
          "error",
          `hero-${key}-label`,
          `"${url}" 주소에 표시할 버튼 문구를 입력하세요.`,
          "identity",
        ),
      );
    }
    if (url.trim() && !isSafeHref(url)) {
      issues.push(
        issue(
          "error",
          `hero-${key}-unsafe`,
          `"${url}" 연결 주소를 확인하세요.`,
          "identity",
        ),
      );
    }
    if (
      /^#(services|work|about|faq|contact)$/.test(url.trim()) &&
      !document.layout.visible[
        url.trim().slice(1) as BlockKind
      ]
    ) {
      issues.push(
        issue(
          "error",
          `hero-${key}-hidden`,
          `"${label}" 버튼이 숨긴 블록을 가리킵니다.`,
          "identity",
        ),
      );
    }
  });

  if (document.layout.visible.services) {
    if (!document.services.heading.trim()) {
      issues.push(
        issue("error", "services-heading", "서비스 제목을 입력하세요.", "services"),
      );
    }
    if (document.services.items.length === 0) {
      issues.push(
        issue(
          "warning",
          "services-empty",
          "서비스를 추가하거나 구성에서 이 블록을 숨기세요.",
          "services",
        ),
      );
    }
    document.services.items.forEach((item, index) => {
      if (!item.title.trim() || !item.description.trim()) {
        issues.push(
          issue(
            "error",
            `service-${item.id}`,
            `서비스 ${index + 1}의 이름과 설명을 입력하세요.`,
            "services",
          ),
        );
      }
    });
  }

  if (document.layout.visible.work) {
    if (!document.work.heading.trim()) {
      issues.push(
        issue("error", "work-heading", "작업 제목을 입력하세요.", "work"),
      );
    }
    if (document.work.items.length === 0) {
      issues.push(
        issue(
          "warning",
          "work-empty",
          "작업을 추가하거나 구성에서 이 블록을 숨기세요.",
          "work",
        ),
      );
    }
    document.work.items.forEach((item, index) => {
      if (!item.title.trim() || !item.description.trim()) {
        issues.push(
          issue(
            "error",
            `work-${item.id}`,
            `작업 ${index + 1}의 이름과 설명을 입력하세요.`,
            "work",
          ),
        );
      }
      if (item.linkUrl.trim() && !isSafeHref(item.linkUrl)) {
        issues.push(
          issue(
            "error",
            `work-link-${item.id}`,
            `작업 ${index + 1}의 연결 주소를 확인하세요.`,
            "work",
          ),
        );
      }
      if (item.linkUrl.trim() !== "" && item.linkLabel.trim() === "") {
        issues.push(
          issue(
            "error",
            `work-label-${item.id}`,
            `작업 ${index + 1}의 링크 문구를 입력하세요.`,
            "work",
          ),
        );
      }
      if (item.linkLabel.trim() && !item.linkUrl.trim()) {
        issues.push(
          issue(
            "error",
            `work-url-${item.id}`,
            `작업 ${index + 1}의 링크 주소를 입력하세요.`,
            "work",
          ),
        );
      }
    });
  }

  if (document.layout.visible.about) {
    if (!document.about.heading.trim()) {
      issues.push(
        issue("error", "about-heading", "소개 제목을 입력하세요.", "about"),
      );
    }
    if (!document.about.body.trim()) {
      issues.push(
        issue(
          "warning",
          "about-empty",
          "소개 글을 입력하거나 구성에서 이 블록을 숨기세요.",
          "about",
        ),
      );
    }
  }

  if (document.layout.visible.faq) {
    if (!document.faq.heading.trim()) {
      issues.push(
        issue("error", "faq-heading", "질문과 답변 제목을 입력하세요.", "faq"),
      );
    }
    if (document.faq.items.length === 0) {
      issues.push(
        issue(
          "warning",
          "faq-empty",
          "질문을 추가하거나 구성에서 이 블록을 숨기세요.",
          "faq",
        ),
      );
    }
    document.faq.items.forEach((item, index) => {
      if (!item.question.trim() || !item.answer.trim()) {
        issues.push(
          issue(
            "error",
            `faq-${item.id}`,
            `질문 ${index + 1}의 질문과 답변을 입력하세요.`,
            "faq",
          ),
        );
      }
    });
  }

  if (
    document.layout.visible.contact &&
    !document.contact.email.trim() &&
    !document.contact.phone.trim()
  ) {
    issues.push(
      issue(
        "error",
        "contact-method",
        "이메일이나 전화번호 중 하나를 입력하세요.",
        "contact",
      ),
    );
  }
  if (
    document.layout.visible.contact &&
    !document.contact.heading.trim()
  ) {
    issues.push(
      issue("error", "contact-heading", "연락 제목을 입력하세요.", "contact"),
    );
  }
  if (
    document.contact.email.trim() &&
    !emailPattern.test(document.contact.email.trim())
  ) {
    issues.push(
      issue("error", "contact-email", "이메일 주소를 확인하세요.", "contact"),
    );
  }

  if (!hexPattern.test(document.theme.accent)) {
    issues.push(
      issue(
        "error",
        "theme-accent",
        "강조색을 여섯 자리 색상 코드로 입력하세요.",
        "style",
      ),
    );
  }

  const seoTitle = document.seo.title.trim() || document.site.name.trim();
  if (seoTitle.length > 60) {
    issues.push(
      issue(
        "warning",
        "seo-title-length",
        "검색 결과 제목을 60자 안으로 줄이면 읽기 편합니다.",
        "launch",
      ),
    );
  }
  const seoDescription =
    document.seo.description.trim() || document.site.summary.trim();
  if (seoDescription.length > 160) {
    issues.push(
      issue(
        "warning",
        "seo-description-length",
        "검색 결과 설명을 160자 안으로 줄이면 전달력이 좋아집니다.",
        "launch",
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

function bodyMarkup(value: string): string {
  return escapeHtml(value).replaceAll("\n", "<br />");
}

function safeHref(value: string): string {
  return isSafeHref(value) ? value.trim() : "#";
}

function normalizedBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function extensionForMime(mimeType: ImageAsset["mimeType"]): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

function decodeAsset(asset: ImageAsset): Uint8Array {
  const match = asset.dataUrl.match(dataUrlPattern);
  if (!match || match[1].toLowerCase() !== asset.mimeType) {
    throw new Error(`이미지 "${asset.name}"의 데이터를 읽을 수 없습니다.`);
  }
  const binary = globalThis.atob(match[2].replace(/\s/g, ""));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

interface AssetPaths {
  logo: string;
  hero: string;
  og: string;
  favicon: string;
  work: Map<string, string>;
}

function exportAssetPaths(document: SiteDocument): AssetPaths {
  const logoExtension = document.brand.logo
    ? extensionForMime(document.brand.logo.mimeType)
    : "";
  const heroExtension = document.brand.heroImage
    ? extensionForMime(document.brand.heroImage.mimeType)
    : "";
  return {
    logo: logoExtension ? `assets/logo.${logoExtension}` : "",
    hero: heroExtension ? `assets/hero.${heroExtension}` : "",
    og: heroExtension ? `assets/og.${heroExtension}` : "",
    favicon: logoExtension ? `favicon.${logoExtension}` : "",
    work: new Map(
      document.work.items
        .filter((item) => item.image)
        .map((item, index) => [
          item.id,
          `assets/work-${String(index + 1).padStart(2, "0")}.${extensionForMime(item.image!.mimeType)}`,
        ]),
    ),
  };
}

function previewAssetPaths(document: SiteDocument): AssetPaths {
  return {
    logo: document.brand.logo?.dataUrl ?? "",
    hero: document.brand.heroImage?.dataUrl ?? "",
    og: document.brand.heroImage?.dataUrl ?? "",
    favicon: document.brand.logo?.dataUrl ?? "",
    work: new Map(
      document.work.items
        .filter((item) => item.image)
        .map((item) => [item.id, item.image!.dataUrl]),
    ),
  };
}

function contrastText(background: string): string {
  if (!hexPattern.test(background)) return "#ffffff";
  const channels = [1, 3, 5].map((position) => {
    const value = Number.parseInt(background.slice(position, position + 2), 16);
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  const luminance =
    channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return luminance > 0.42 ? "#111411" : "#ffffff";
}

function renderServices(document: SiteDocument): string {
  if (!document.services.items.length) return "";
  const items = document.services.items
    .map(
      (item, index) => `
          <article class="service-card">
            <span>${String(index + 1).padStart(2, "0")}</span>
            <h3>${escapeHtml(item.title)}</h3>
            <p>${bodyMarkup(item.description)}</p>
          </article>`,
    )
    .join("");
  return `
      <section class="section" id="services">
        <div class="section-heading">
          <p>서비스</p>
          <div><h2>${escapeHtml(document.services.heading)}</h2>${document.services.intro.trim() ? `<p>${bodyMarkup(document.services.intro)}</p>` : ""}</div>
        </div>
        <div class="service-grid">${items}</div>
      </section>`;
}

function renderWork(document: SiteDocument, paths: AssetPaths): string {
  if (!document.work.items.length) return "";
  const items = document.work.items
    .map((item, index) => {
      const imagePath = paths.work.get(item.id);
      const link =
        item.linkLabel.trim() && item.linkUrl.trim()
          ? `<a href="${escapeHtml(safeHref(item.linkUrl))}">${escapeHtml(item.linkLabel)} <span aria-hidden="true">↗</span></a>`
          : "";
      return `
          <article class="work-card">
            ${imagePath ? `<img src="${escapeHtml(imagePath)}" alt="${escapeHtml(item.title)}" />` : ""}
            <div>
              <span>${String(index + 1).padStart(2, "0")}</span>
              <h3>${escapeHtml(item.title)}</h3>
              <p>${bodyMarkup(item.description)}</p>
              ${link}
            </div>
          </article>`;
    })
    .join("");
  return `
      <section class="section" id="work">
        <div class="section-heading">
          <p>작업</p>
          <div><h2>${escapeHtml(document.work.heading)}</h2>${document.work.intro.trim() ? `<p>${bodyMarkup(document.work.intro)}</p>` : ""}</div>
        </div>
        <div class="work-grid">${items}</div>
      </section>`;
}

function renderAbout(document: SiteDocument): string {
  if (!document.about.body.trim()) return "";
  return `
      <section class="section split-section" id="about">
        <p>소개</p>
        <div>
          <h2>${escapeHtml(document.about.heading)}</h2>
          <p class="large-copy">${bodyMarkup(document.about.body)}</p>
        </div>
      </section>`;
}

function renderFaq(document: SiteDocument): string {
  if (!document.faq.items.length) return "";
  const items = document.faq.items
    .map(
      (item) => `
          <details>
            <summary>${escapeHtml(item.question)}</summary>
            <p>${bodyMarkup(item.answer)}</p>
          </details>`,
    )
    .join("");
  return `
      <section class="section split-section" id="faq">
        <p>질문과 답변</p>
        <div>
          <h2>${escapeHtml(document.faq.heading)}</h2>
          <div class="faq-list">${items}</div>
        </div>
      </section>`;
}

function renderContact(document: SiteDocument): string {
  const email = document.contact.email.trim();
  const phone = document.contact.phone.trim();
  return `
      <section class="contact-section" id="contact">
        <p>연락</p>
        <div>
          <h2>${escapeHtml(document.contact.heading)}</h2>
          ${document.contact.message.trim() ? `<p>${bodyMarkup(document.contact.message)}</p>` : ""}
          <div class="contact-links">
            ${email ? `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>` : ""}
            ${phone ? `<a href="tel:${escapeHtml(phone.replace(/[^\d+]/g, ""))}">${escapeHtml(phone)}</a>` : ""}
          </div>
          <dl>
            ${document.contact.address.trim() ? `<div><dt>주소</dt><dd>${escapeHtml(document.contact.address)}</dd></div>` : ""}
            ${document.contact.hours.trim() ? `<div><dt>운영 시간</dt><dd>${bodyMarkup(document.contact.hours)}</dd></div>` : ""}
          </dl>
        </div>
      </section>`;
}

function renderBlock(
  kind: BlockKind,
  document: SiteDocument,
  paths: AssetPaths,
): string {
  if (!document.layout.visible[kind]) return "";
  if (kind === "services") return renderServices(document);
  if (kind === "work") return renderWork(document, paths);
  if (kind === "about") return renderAbout(document);
  if (kind === "faq") return renderFaq(document);
  return renderContact(document);
}

interface HtmlOptions {
  preview?: boolean;
}

export function generateStaticHtml(
  document: SiteDocument,
  options: HtmlOptions = {},
): string {
  const preset = presetTokens[document.theme.preset] ?? presetTokens.studio;
  const accent = hexPattern.test(document.theme.accent)
    ? document.theme.accent
    : "#b5482d";
  const accentText = contrastText(accent);
  const paths = options.preview
    ? previewAssetPaths(document)
    : exportAssetPaths(document);
  const baseUrl = isRootHttpsOrigin(document.site.baseUrl.trim())
    ? normalizedBaseUrl(document.site.baseUrl)
    : "";
  const seoTitle = document.seo.title.trim() || document.site.name.trim();
  const seoDescription =
    document.seo.description.trim() || document.site.summary.trim();
  const navigation = document.layout.order
    .filter((kind) => document.layout.visible[kind])
    .filter((kind) => {
      if (kind === "services") return document.services.items.length > 0;
      if (kind === "work") return document.work.items.length > 0;
      if (kind === "about") return document.about.body.trim();
      if (kind === "faq") return document.faq.items.length > 0;
      return true;
    })
    .map((kind) => {
      const label: Record<BlockKind, string> = {
        services: document.services.heading || "서비스",
        work: document.work.heading || "작업",
        about: document.about.heading || "소개",
        faq: document.faq.heading || "질문",
        contact: document.contact.heading || "연락",
      };
      return `<a href="#${kind}">${escapeHtml(label[kind])}</a>`;
    })
    .join("");
  const sections = document.layout.order
    .map((kind) => renderBlock(kind, document, paths))
    .join("");
  const primary =
    document.hero.primaryLabel.trim() && document.hero.primaryUrl.trim()
      ? `<a class="button button-primary" href="${escapeHtml(safeHref(document.hero.primaryUrl))}">${escapeHtml(document.hero.primaryLabel)}</a>`
      : "";
  const secondary =
    document.hero.secondaryLabel.trim() && document.hero.secondaryUrl.trim()
      ? `<a class="button button-secondary" href="${escapeHtml(safeHref(document.hero.secondaryUrl))}">${escapeHtml(document.hero.secondaryLabel)}</a>`
      : "";
  const logo = paths.logo
    ? `<img src="${escapeHtml(paths.logo)}" alt="" />`
    : `<span class="logo-placeholder" aria-hidden="true">${escapeHtml(document.site.name.slice(0, 1) || "S")}</span>`;
  const heroImage = paths.hero
    ? `<img src="${escapeHtml(paths.hero)}" alt="${escapeHtml(document.site.name)} 대표 이미지" />`
    : `<div class="hero-image-placeholder" aria-hidden="true"></div>`;
  const organization = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: document.site.name,
    url: baseUrl || undefined,
    email: document.contact.email || undefined,
    telephone: document.contact.phone || undefined,
    address: document.contact.address || undefined,
  }).replaceAll("<", "\\u003c");
  const year = new Date().getFullYear();

  return `<!doctype html>
<html lang="${document.site.language}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(seoTitle)}</title>
    <meta name="description" content="${escapeHtml(seoDescription)}" />
    <meta name="theme-color" content="${preset.background}" />
    ${baseUrl ? `<link rel="canonical" href="${escapeHtml(baseUrl)}/" />` : ""}
    ${paths.favicon ? `<link rel="icon" href="${escapeHtml(paths.favicon)}" type="${document.brand.logo?.mimeType ?? "image/png"}" />` : ""}
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(seoTitle)}" />
    <meta property="og:description" content="${escapeHtml(seoDescription)}" />
    ${baseUrl ? `<meta property="og:url" content="${escapeHtml(baseUrl)}/" />` : ""}
    ${baseUrl && paths.og ? `<meta property="og:image" content="${escapeHtml(baseUrl)}/${escapeHtml(paths.og)}" />` : ""}
    <script type="application/ld+json">${organization}</script>
    <style>
      :root {
        color-scheme: ${document.theme.preset === "signal" ? "dark" : "light"};
        --background: ${preset.background};
        --surface: ${preset.surface};
        --text: ${preset.text};
        --muted: ${preset.muted};
        --line: ${preset.line};
        --accent: ${accent};
        --accent-text: ${accentText};
        --heading: ${preset.headingFont};
        --body: ${preset.bodyFont};
        --radius: ${preset.radius};
        --page: min(1180px, calc(100vw - 40px));
      }
      * { box-sizing: border-box; }
      html { scroll-behavior: smooth; background: var(--background); }
      body {
        margin: 0; background: var(--background); color: var(--text);
        font-family: var(--body); line-height: 1.6; text-rendering: optimizeLegibility;
        -webkit-font-smoothing: antialiased;
      }
      img { display: block; max-width: 100%; }
      a { color: inherit; }
      a:focus-visible, summary:focus-visible { outline: 3px solid var(--accent); outline-offset: 4px; }
      h1, h2, h3, p { margin: 0; }
      h1, h2, h3 { font-family: var(--heading); text-wrap: balance; }
      .site-header {
        display: flex; width: var(--page); min-height: 78px; margin: 0 auto;
        align-items: center; justify-content: space-between; gap: 32px;
        border-bottom: 1px solid var(--line);
      }
      .brand { display: inline-flex; align-items: center; gap: 12px; font-size: 14px; font-weight: 800; text-decoration: none; }
      .brand img { width: 36px; height: 36px; border-radius: 9px; object-fit: cover; }
      .logo-placeholder { display: grid; width: 36px; height: 36px; place-items: center; border-radius: 9px; background: var(--accent); color: var(--accent-text); }
      .site-nav { display: flex; flex-wrap: wrap; gap: clamp(14px, 2vw, 28px); }
      .site-nav a { font-size: 13px; font-weight: 700; text-decoration: none; }
      .site-nav a:hover { color: var(--accent); }
      .hero {
        display: grid; width: var(--page); min-height: min(780px, calc(100svh - 78px));
        grid-template-columns: minmax(0, 1.06fr) minmax(320px, .94fr);
        gap: clamp(40px, 7vw, 100px); align-items: center; margin: 0 auto;
        padding: clamp(72px, 10vw, 132px) 0;
      }
      .eyebrow, .section-heading > p, .split-section > p, .contact-section > p {
        color: var(--accent); font-size: 12px; font-weight: 850; letter-spacing: .08em;
      }
      .hero h1 {
        max-width: 13ch; margin-top: 22px; font-size: clamp(52px, 7vw, 94px);
        letter-spacing: -.055em; line-height: .97;
      }
      .hero-summary { max-width: 650px; margin-top: 28px; color: var(--muted); font-size: clamp(18px, 2vw, 23px); }
      .hero-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 34px; }
      .button {
        display: inline-flex; min-height: 50px; align-items: center; justify-content: center;
        padding: 0 18px; border: 1px solid var(--text); border-radius: var(--radius);
        font-size: 13px; font-weight: 800; text-decoration: none;
      }
      .button-primary { border-color: var(--accent); background: var(--accent); color: var(--accent-text); }
      .button-secondary { background: transparent; }
      .hero-media { overflow: hidden; aspect-ratio: 4 / 5; border-radius: var(--radius); background: var(--surface); }
      .hero-media img { width: 100%; height: 100%; object-fit: cover; }
      .hero-image-placeholder { width: 100%; height: 100%; background: linear-gradient(145deg, var(--surface), var(--accent)); opacity: .42; }
      .section, .split-section, .contact-section {
        width: var(--page); margin: 0 auto; padding: clamp(78px, 10vw, 142px) 0;
        border-top: 1px solid var(--line);
      }
      .section-heading, .split-section, .contact-section {
        display: grid; grid-template-columns: minmax(120px, .35fr) minmax(0, 1.65fr); gap: clamp(28px, 6vw, 92px);
      }
      .section-heading h2, .split-section h2, .contact-section h2 {
        font-size: clamp(38px, 5.5vw, 72px); letter-spacing: -.045em; line-height: 1.02;
      }
      .section-heading > div > p { max-width: 620px; margin-top: 18px; color: var(--muted); font-size: 18px; }
      .service-grid {
        display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px;
        margin-top: 56px; overflow: hidden; border: 1px solid var(--line);
        border-radius: var(--radius); background: var(--line);
      }
      .service-card { min-height: 270px; padding: 28px; background: var(--surface); }
      .service-card > span, .work-card > div > span { color: var(--accent); font-size: 11px; font-weight: 850; }
      .service-card h3, .work-card h3 { margin-top: 62px; font-size: 25px; letter-spacing: -.025em; }
      .service-card p, .work-card p { margin-top: 14px; color: var(--muted); font-size: 15px; }
      .work-grid { display: grid; gap: 28px; margin-top: 56px; }
      .work-card {
        display: grid; grid-template-columns: minmax(260px, .9fr) minmax(0, 1.1fr);
        overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface);
      }
      .work-card > img { width: 100%; height: 100%; min-height: 360px; object-fit: cover; }
      .work-card > div { display: flex; min-height: 360px; flex-direction: column; align-items: flex-start; justify-content: center; padding: clamp(28px, 5vw, 64px); }
      .work-card h3 { margin-top: 24px; font-size: clamp(30px, 4vw, 52px); }
      .work-card a { margin-top: 26px; color: var(--accent); font-size: 13px; font-weight: 850; text-underline-offset: 5px; }
      .large-copy { max-width: 820px; margin-top: 28px; color: var(--muted); font-size: clamp(20px, 2.8vw, 31px); line-height: 1.65; }
      .faq-list { margin-top: 46px; border-top: 1px solid var(--line); }
      details { border-bottom: 1px solid var(--line); }
      summary { padding: 24px 0; cursor: pointer; font-size: 18px; font-weight: 780; }
      details p { max-width: 680px; padding: 0 0 24px; color: var(--muted); }
      .contact-section { margin-bottom: clamp(20px, 4vw, 52px); padding-inline: clamp(24px, 5vw, 64px); border: 0; border-radius: var(--radius); background: var(--accent); color: var(--accent-text); }
      .contact-section > p { color: inherit; }
      .contact-section > div > p { max-width: 680px; margin-top: 24px; font-size: 18px; }
      .contact-links { display: flex; flex-wrap: wrap; gap: 18px 32px; margin-top: 36px; }
      .contact-links a { font-size: clamp(21px, 3vw, 36px); font-weight: 850; letter-spacing: -.03em; }
      dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; margin: 48px 0 0; }
      dl div { border-top: 1px solid currentColor; padding-top: 14px; }
      dt { font-size: 11px; font-weight: 850; }
      dd { margin: 7px 0 0; font-size: 14px; }
      .site-footer { display: flex; width: var(--page); min-height: 100px; align-items: center; justify-content: space-between; gap: 20px; margin: 0 auto; border-top: 1px solid var(--line); font-size: 12px; }
      @media (max-width: 760px) {
        :root { --page: min(100% - 32px, 680px); }
        .site-header { min-height: 70px; }
        .site-nav { display: none; }
        .hero { min-height: auto; grid-template-columns: 1fr; padding-block: 64px; }
        .hero-copy { order: 1; }
        .hero-media { order: 0; aspect-ratio: 4 / 3; }
        .hero h1 { font-size: clamp(44px, 14vw, 68px); }
        .section-heading, .split-section, .contact-section { grid-template-columns: 1fr; }
        .service-grid { grid-template-columns: 1fr; }
        .service-card { min-height: auto; }
        .service-card h3 { margin-top: 36px; }
        .work-card { grid-template-columns: 1fr; }
        .work-card > img { min-height: 240px; max-height: 360px; }
        .work-card > div { min-height: auto; }
        dl { grid-template-columns: 1fr; }
        .site-footer { align-items: flex-start; flex-direction: column; justify-content: center; }
      }
      @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
    </style>
  </head>
  <body>
    <header class="site-header">
      <a class="brand" href="#top">${logo}<span>${escapeHtml(document.site.name || "이름")}</span></a>
      <nav class="site-nav" aria-label="주요 메뉴">${navigation}</nav>
    </header>
    <main id="top">
      <section class="hero">
        <div class="hero-copy">
          ${document.hero.eyebrow.trim() ? `<p class="eyebrow">${escapeHtml(document.hero.eyebrow)}</p>` : ""}
          <h1>${escapeHtml(document.site.tagline || "한 줄 소개를 입력하세요")}</h1>
          <p class="hero-summary">${bodyMarkup(document.site.summary || "방문자에게 전할 설명을 입력하세요.")}</p>
          <div class="hero-actions">${primary}${secondary}</div>
        </div>
        <div class="hero-media">${heroImage}</div>
      </section>
      ${sections}
    </main>
    <footer class="site-footer">
      <strong>${escapeHtml(document.site.name || "이름")}</strong>
      <span>© ${year}</span>
    </footer>
  </body>
</html>`;
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function buildExportFiles(document: SiteDocument): ExportFile[] {
  const paths = exportAssetPaths(document);
  const baseUrl = isRootHttpsOrigin(document.site.baseUrl.trim())
    ? normalizedBaseUrl(document.site.baseUrl)
    : "";
  const files: ExportFile[] = [
    { path: "index.html", data: generateStaticHtml(document) },
    {
      path: "robots.txt",
      data:
        `User-agent: *\nAllow: /\n` +
        (baseUrl ? `Sitemap: ${baseUrl}/sitemap.xml\n` : ""),
    },
    {
      path: "README.txt",
      data:
        `${document.site.name || "홈페이지"} 배포 안내\n\n` +
        `압축을 푼 뒤 이 폴더의 전체 내용을 함께 업로드하세요.\n\n` +
        `Cloudflare Pages\n` +
        `1. Siteboard Studio에서 프로젝트 이름을 입력하고 배포합니다.\n` +
        `2. 또는 Pages의 Direct Upload에서 압축을 푼 전체 파일을 올립니다.\n` +
        `3. 공개 주소에서 화면과 연락 링크를 확인합니다.\n\n` +
        `다른 정적 호스팅\n` +
        `이 폴더의 전체 내용을 문서 루트에 함께 업로드하세요.\n` +
        `공개 주소가 바뀌면 Siteboard의 홈페이지 주소와 검색 정보를 갱신해 다시 내보냅니다.\n`,
    },
  ];

  if (document.brand.logo) {
    files.push(
      { path: paths.logo, data: decodeAsset(document.brand.logo) },
      { path: paths.favicon, data: decodeAsset(document.brand.logo) },
    );
  }
  if (document.brand.heroImage) {
    files.push({ path: paths.hero, data: decodeAsset(document.brand.heroImage) });
    if (baseUrl) {
      files.push({
        path: paths.og,
        data: decodeAsset(document.brand.heroImage),
      });
    }
  }
  if (document.layout.visible.work) {
    document.work.items.forEach((item) => {
      if (!item.image) return;
      const path = paths.work.get(item.id);
      if (path) files.push({ path, data: decodeAsset(item.image) });
    });
  }
  if (baseUrl) {
    files.push({
      path: "sitemap.xml",
      data:
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        `  <url><loc>${xmlEscape(baseUrl)}/</loc></url>\n` +
        `</urlset>\n`,
    });
  }

  return files;
}

export function jsonExport(document: SiteDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

export function imageAssetFromDataUrl(
  file: Pick<File, "name" | "type" | "size">,
  dataUrl: string,
): ImageAsset {
  if (
    !imageMimeTypes.includes(file.type as (typeof imageMimeTypes)[number]) ||
    !dataUrlPattern.test(dataUrl)
  ) {
    throw new Error("PNG, JPG, WEBP 이미지를 선택하세요.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("이미지 한 장의 용량을 800KB 아래로 줄여 주세요.");
  }
  return {
    id: createId("image"),
    name: file.name,
    mimeType: file.type as ImageAsset["mimeType"],
    dataUrl,
    size: file.size,
  };
}

export { presetTokens };
