import type {
  BlockKind,
  FaqItem,
  ServiceItem,
  SiteDocument,
  WorkItem,
} from "./types";

let fallbackId = 0;

export function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  fallbackId += 1;
  return `${prefix}-${Date.now()}-${fallbackId}`;
}

export function createService(): ServiceItem {
  return {
    id: createId("service"),
    title: "",
    description: "",
  };
}

export function createWork(): WorkItem {
  return {
    id: createId("work"),
    title: "",
    description: "",
    linkLabel: "",
    linkUrl: "",
    image: null,
  };
}

export function createFaq(): FaqItem {
  return {
    id: createId("faq"),
    question: "",
    answer: "",
  };
}

export const blockLabels: Record<BlockKind, string> = {
  services: "서비스",
  work: "작업과 갤러리",
  about: "소개",
  faq: "자주 묻는 질문",
  contact: "연락",
};

export function createBlankDocument(): SiteDocument {
  return {
    schemaVersion: 2,
    updatedAt: new Date().toISOString(),
    site: {
      name: "",
      tagline: "",
      summary: "",
      baseUrl: "",
      language: "ko",
    },
    brand: {
      logo: null,
      heroImage: null,
    },
    hero: {
      eyebrow: "",
      primaryLabel: "연락하기",
      primaryUrl: "#contact",
      secondaryLabel: "",
      secondaryUrl: "",
    },
    services: {
      heading: "서비스",
      intro: "",
      items: [],
    },
    work: {
      heading: "작업",
      intro: "",
      items: [],
    },
    about: {
      heading: "소개",
      body: "",
    },
    faq: {
      heading: "자주 묻는 질문",
      items: [],
    },
    contact: {
      heading: "연락",
      message: "",
      email: "",
      phone: "",
      address: "",
      hours: "",
    },
    layout: {
      order: ["services", "work", "about", "faq", "contact"],
      visible: {
        services: false,
        work: false,
        about: false,
        faq: false,
        contact: true,
      },
    },
    theme: {
      preset: "studio",
      accent: "#b5482d",
    },
    seo: {
      title: "",
      description: "",
    },
  };
}

export function cloneDocument(document: SiteDocument): SiteDocument {
  return structuredClone(document);
}
