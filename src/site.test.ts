import { describe, expect, it } from "vitest";
import { cloneDocument } from "./data";
import {
  buildExportFiles,
  generateStaticHtml,
  imageAssetFromDataUrl,
  isSafeHref,
  parseImportedDocument,
  validateDocument,
} from "./site";
import { completeDocument, minimalDocument, tinyImage } from "./test/fixture";

const legacyV1 = {
  schemaVersion: 1,
  updatedAt: "2026-01-01T00:00:00.000Z",
  site: {
    name: "기존 가게",
    baseUrl: "https://legacy.example",
  },
  theme: {
    background: "#ffffff",
    surface: "#f7f7f7",
    text: "#111111",
    muted: "#666666",
    accent: "#245d48",
    font: "serif",
    radius: "8",
  },
  seo: {
    title: "기존 가게",
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
          eyebrow: "서울",
          title: "오래 쓰는 물건을 만듭니다.",
          body: "주문을 받아 직접 제작합니다.",
          linkLabel: "연락하기",
          linkUrl: "#contact",
          hidden: false,
        },
      ],
    },
    {
      id: "services",
      title: "Services",
      navLabel: "Services",
      slug: "services",
      hidden: false,
      sections: [
        {
          id: "service-1",
          kind: "content",
          eyebrow: "",
          title: "수리",
          body: "상태를 확인하고 수리합니다.",
          linkLabel: "",
          linkUrl: "",
          hidden: false,
        },
      ],
    },
    {
      id: "work",
      title: "Work",
      navLabel: "Work",
      slug: "work",
      hidden: false,
      sections: [
        {
          id: "work-1",
          kind: "content",
          eyebrow: "",
          title: "이전 작업",
          body: "이전 버전에서 옮긴 작업입니다.",
          linkLabel: "작업 보기",
          linkUrl: "/work",
          hidden: false,
        },
      ],
    },
    {
      id: "about",
      title: "About",
      navLabel: "About",
      slug: "about",
      hidden: false,
      sections: [
        {
          id: "about-1",
          kind: "content",
          eyebrow: "",
          title: "공방 소개",
          body: "이전 버전에서 옮긴 소개입니다.",
          linkLabel: "",
          linkUrl: "",
          hidden: false,
        },
      ],
    },
  ],
};

describe("문서 검증과 v1 이전", () => {
  it("완성된 v2 문서를 출시 가능한 상태로 판단한다", () => {
    const errors = validateDocument(completeDocument()).filter(
      (item) => item.level === "error",
    );
    expect(errors).toEqual([]);
  });

  it("필수 사업 정보와 연락만 오류로 막고 이미지와 주소는 권장한다", () => {
    const document = completeDocument();
    document.site.name = "";
    document.site.baseUrl = "";
    document.brand.logo = null;
    document.brand.heroImage = null;
    document.contact.email = "";
    document.seo.title = "";
    document.seo.description = "";

    const issues = validateDocument(document);
    const errors = issues
      .filter((item) => item.level === "error")
      .map((item) => item.id);
    const warnings = issues
      .filter((item) => item.level === "warning")
      .map((item) => item.id);
    expect(errors).toContain("site-name");
    expect(errors).toContain("contact-method");
    expect(errors).not.toContain("brand-logo");
    expect(errors).not.toContain("brand-hero");
    expect(errors).not.toContain("site-url");
    expect(errors).not.toContain("seo-title");
    expect(errors).not.toContain("seo-description");
    expect(warnings).toEqual(
      expect.arrayContaining(["brand-logo", "brand-hero", "site-url"]),
    );
  });

  it("입력한 공개 주소가 잘못된 경우에만 오류로 막는다", () => {
    const document = minimalDocument();
    document.site.baseUrl = "example dot com";

    expect(validateDocument(document)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "site-url-invalid",
          level: "error",
        }),
      ]),
    );
  });

  it("새 문서는 선택 블록을 숨기고 사용자가 켠 빈 블록만 권장한다", () => {
    const document = minimalDocument();
    expect(document.layout.visible).toEqual({
      services: false,
      work: false,
      about: false,
      faq: false,
      contact: true,
    });

    for (const [kind, issueId] of [
      ["services", "services-empty"],
      ["work", "work-empty"],
      ["about", "about-empty"],
      ["faq", "faq-empty"],
    ] as const) {
      const enabled = minimalDocument();
      enabled.layout.visible[kind] = true;
      expect(validateDocument(enabled)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: issueId, level: "warning" }),
        ]),
      );
    }
  });

  it("안전한 연결 주소만 허용한다", () => {
    expect(isSafeHref("mailto:hello@example.com")).toBe(true);
    expect(isSafeHref("https://example.com/work")).toBe(true);
    expect(isSafeHref("#contact")).toBe(true);
    expect(isSafeHref("//evil.example")).toBe(false);
    expect(isSafeHref("javascript:alert(1)")).toBe(false);
    expect(isSafeHref("data:text/html,unsafe")).toBe(false);
  });

  it("v1 내용을 v2 한 페이지 문서로 옮기고 원본 객체를 바꾸지 않는다", () => {
    const raw = JSON.stringify(legacyV1);
    const result = parseImportedDocument(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.migratedFrom).toBe(1);
    expect(result.document.schemaVersion).toBe(2);
    expect(result.document.site.name).toBe("기존 가게");
    expect(result.document.site.tagline).toBe("오래 쓰는 물건을 만듭니다.");
    expect(result.document.services.items[0].title).toBe("수리");
    expect(result.document.layout.visible.services).toBe(true);
    expect(result.document.layout.visible.work).toBe(true);
    expect(result.document.layout.visible.about).toBe(true);
    expect(result.document.work.items[0].title).toBe("이전 작업");
    expect(result.document.about.body).toBe("이전 버전에서 옮긴 소개입니다.");
    expect(result.document.theme.preset).toBe("editorial");
    expect(JSON.parse(raw)).toEqual(legacyV1);
  });

  it("미래 형식과 손상된 JSON을 안전하게 거절한다", () => {
    const future = parseImportedDocument('{"schemaVersion":9}');
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.futureSchema).toBe(9);
    expect(parseImportedDocument("{broken").ok).toBe(false);
  });
});

describe("정적 홈페이지와 배포 파일", () => {
  it("내용을 이스케이프하고 외부 실행 코드 없이 한 페이지를 만든다", () => {
    const document = completeDocument();
    document.site.tagline = '<script src="bad.js">alert(1)</script>';
    document.site.name = "</script><img src=x onerror=alert(1)>";
    document.layout.visible.faq = false;

    const html = generateStaticHtml(document);
    expect(html).toContain("&lt;script");
    expect(html).not.toContain('<script src="bad.js">');
    expect(html).not.toContain("</script><img");
    expect(html).toContain("\\u003c/script>");
    expect(html).toContain('<html lang="ko">');
    expect(html).toContain('id="services"');
    expect(html).not.toContain('id="faq"');
    expect(html).toContain('src="assets/logo.png"');
    expect(html).not.toContain("react");
    expect(html).not.toContain("data:image/");
  });

  it("미리보기에는 로컬 이미지 데이터를 사용한다", () => {
    const html = generateStaticHtml(completeDocument(), { preview: true });
    expect(html).toContain("data:image/png;base64");
    expect(html).toContain("data:image/jpeg;base64");
  });

  it("ZIP에 들어갈 홈페이지, 자산, 검색 파일, 안내문을 구성한다", () => {
    const files = buildExportFiles(completeDocument());
    const paths = files.map((file) => file.path);

    expect(paths).toEqual(
      expect.arrayContaining([
        "index.html",
        "assets/logo.png",
        "assets/hero.jpg",
        "assets/og.jpg",
        "assets/work-01.webp",
        "favicon.png",
        "robots.txt",
        "sitemap.xml",
        "README.txt",
      ]),
    );
    expect(files.find((file) => file.path === "assets/logo.png")?.data).toBeInstanceOf(
      Uint8Array,
    );
    expect(String(files.find((file) => file.path === "robots.txt")?.data)).toContain(
      "https://corner.example/sitemap.xml",
    );
  });

  it("이미지와 공개 주소 없이 최소 홈페이지 파일을 구성한다", () => {
    const document = minimalDocument();
    const errors = validateDocument(document).filter(
      (item) => item.level === "error",
    );
    const files = buildExportFiles(document);
    const paths = files.map((file) => file.path);
    const html = String(files.find((file) => file.path === "index.html")?.data);
    const robots = String(
      files.find((file) => file.path === "robots.txt")?.data,
    );

    expect(errors).toEqual([]);
    expect(paths).toEqual(["index.html", "robots.txt", "README.txt"]);
    expect(html).toContain("<title>동그라미 식물점</title>");
    expect(html).toContain(
      '<meta name="description" content="서울 망원동에서 식물과 화분을 판매합니다." />',
    );
    expect(html).toContain("logo-placeholder");
    expect(html).toContain("hero-image-placeholder");
    expect(html).not.toContain("assets/logo");
    expect(html).not.toContain("assets/hero");
    expect(html).not.toContain('rel="canonical"');
    expect(html).toContain(
      '<meta property="og:title" content="동그라미 식물점" />',
    );
    expect(html).toContain(
      '<meta property="og:description" content="서울 망원동에서 식물과 화분을 판매합니다." />',
    );
    expect(html).not.toContain('property="og:url"');
    expect(html).not.toContain('property="og:image"');
    expect(robots).not.toContain("Sitemap:");
    expect(paths).not.toContain("sitemap.xml");
  });

  it("로고와 대표 이미지를 서로 독립적으로 ZIP에 포함한다", () => {
    const logoOnly = minimalDocument();
    logoOnly.brand.logo = tinyImage("logo.png");
    const logoPaths = buildExportFiles(logoOnly).map((file) => file.path);
    expect(logoPaths).toEqual(
      expect.arrayContaining(["assets/logo.png", "favicon.png"]),
    );
    expect(logoPaths).not.toContain("assets/hero.jpg");
    expect(logoPaths).not.toContain("assets/og.jpg");

    const heroOnly = minimalDocument();
    heroOnly.brand.heroImage = tinyImage("hero.jpg", "image/jpeg");
    const heroPaths = buildExportFiles(heroOnly).map((file) => file.path);
    expect(heroPaths).toContain("assets/hero.jpg");
    expect(heroPaths).not.toContain("assets/og.jpg");
    expect(heroPaths).not.toContain("assets/logo.png");
    expect(heroPaths).not.toContain("favicon.png");

    heroOnly.site.baseUrl = "https://plant.example";
    expect(buildExportFiles(heroOnly).map((file) => file.path)).toContain(
      "assets/og.jpg",
    );
  });

  it("별도 검색 문구가 있으면 기본 문구보다 우선한다", () => {
    const document = minimalDocument();
    document.seo.title = "검색 전용 제목";
    document.seo.description = "검색 전용 설명";

    const html = generateStaticHtml(document);
    expect(html).toContain("<title>검색 전용 제목</title>");
    expect(html).toContain(
      '<meta name="description" content="검색 전용 설명" />',
    );
  });

  it("숨긴 작업 블록의 이미지는 ZIP에 넣지 않는다", () => {
    const document = completeDocument();
    document.layout.visible.work = false;

    const paths = buildExportFiles(document).map((file) => file.path);
    expect(paths).not.toContain("assets/work-01.webp");
  });

  it("파일 이름과 크기를 검사해 이미지 자산을 만든다", () => {
    const asset = imageAssetFromDataUrl(
      { name: "logo.png", type: "image/png", size: 5 },
      "data:image/png;base64,AAECAwQ=",
    );
    expect(asset.name).toBe("logo.png");

    expect(() =>
      imageAssetFromDataUrl(
        { name: "logo.svg", type: "image/svg+xml", size: 5 },
        "data:image/svg+xml;base64,AA==",
      ),
    ).toThrow(/PNG/);

    expect(() =>
      imageAssetFromDataUrl(
        { name: "large.png", type: "image/png", size: 2_000_000 },
        "data:image/png;base64,AA==",
      ),
    ).toThrow(/800KB/);
  });

  it("원본 문서를 복제해도 이미지와 항목이 독립적으로 유지된다", () => {
    const original = completeDocument();
    const copy = cloneDocument(original);
    copy.services.items[0].title = "변경";
    copy.brand.logo!.name = "changed.png";
    expect(original.services.items[0].title).toBe("맞춤 가구");
    expect(original.brand.logo?.name).toBe("logo.png");
  });
});
