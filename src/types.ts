export type BlockKind = "services" | "work" | "about" | "faq" | "contact";
export type ThemePreset = "studio" | "editorial" | "signal";

export interface ImageAsset {
  id: string;
  name: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  dataUrl: string;
  size: number;
}

export interface ServiceItem {
  id: string;
  title: string;
  description: string;
}

export interface WorkItem {
  id: string;
  title: string;
  description: string;
  linkLabel: string;
  linkUrl: string;
  image: ImageAsset | null;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface SiteDocument {
  schemaVersion: 2;
  updatedAt: string;
  site: {
    name: string;
    tagline: string;
    summary: string;
    baseUrl: string;
    language: "ko" | "en";
  };
  brand: {
    logo: ImageAsset | null;
    heroImage: ImageAsset | null;
  };
  hero: {
    eyebrow: string;
    primaryLabel: string;
    primaryUrl: string;
    secondaryLabel: string;
    secondaryUrl: string;
  };
  services: {
    heading: string;
    intro: string;
    items: ServiceItem[];
  };
  work: {
    heading: string;
    intro: string;
    items: WorkItem[];
  };
  about: {
    heading: string;
    body: string;
  };
  faq: {
    heading: string;
    items: FaqItem[];
  };
  contact: {
    heading: string;
    message: string;
    email: string;
    phone: string;
    address: string;
    hours: string;
  };
  layout: {
    order: BlockKind[];
    visible: Record<BlockKind, boolean>;
  };
  theme: {
    preset: ThemePreset;
    accent: string;
  };
  seo: {
    title: string;
    description: string;
  };
}

export type ValidationLevel = "error" | "warning";

export interface ValidationIssue {
  id: string;
  level: ValidationLevel;
  message: string;
  target:
    | "identity"
    | "services"
    | "work"
    | "about"
    | "faq"
    | "contact"
    | "style"
    | "launch";
}

export interface ExportFile {
  path: string;
  data: string | Uint8Array;
}
