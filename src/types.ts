export type SectionKind = "hero" | "content" | "callout";
export type FontToken = "system" | "serif" | "mono";
export type RadiusToken = "0" | "8" | "18";

export interface SiteSection {
  id: string;
  kind: SectionKind;
  eyebrow: string;
  title: string;
  body: string;
  linkLabel: string;
  linkUrl: string;
  hidden: boolean;
}

export interface SitePage {
  id: string;
  title: string;
  navLabel: string;
  slug: string;
  hidden: boolean;
  sections: SiteSection[];
}

export interface ThemeTokens {
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  font: FontToken;
  radius: RadiusToken;
}

export interface SeoSettings {
  title: string;
  description: string;
  socialTitle: string;
  socialDescription: string;
  socialImage: string;
}

export interface SiteDocument {
  schemaVersion: 1;
  updatedAt: string;
  site: {
    name: string;
    baseUrl: string;
  };
  theme: ThemeTokens;
  seo: SeoSettings;
  pages: SitePage[];
}

export type ValidationLevel = "error" | "warning";

export interface ValidationIssue {
  id: string;
  level: ValidationLevel;
  message: string;
  pageId?: string;
  sectionId?: string;
}
