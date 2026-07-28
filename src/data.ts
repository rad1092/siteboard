import type {
  SectionKind,
  SiteDocument,
  SitePage,
  SiteSection,
} from "./types";

let fallbackId = 0;

export function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  fallbackId += 1;
  return `${prefix}-${Date.now()}-${fallbackId}`;
}

export function createSection(
  kind: SectionKind = "content",
  index = 1,
): SiteSection {
  return {
    id: createId("section"),
    kind,
    eyebrow: kind === "hero" ? "A short introduction" : "",
    title: kind === "hero" ? "New headline" : `New section ${index}`,
    body: "Add clear, useful copy for this section.",
    linkLabel: "",
    linkUrl: "",
    hidden: false,
  };
}

export function createPage(index: number, usedSlugs: string[]): SitePage {
  let suffix = index;
  let slug = `page-${suffix}`;

  while (usedSlugs.includes(slug)) {
    suffix += 1;
    slug = `page-${suffix}`;
  }

  return {
    id: createId("page"),
    title: `Untitled page ${suffix}`,
    navLabel: `Page ${suffix}`,
    slug,
    hidden: false,
    sections: [createSection("hero")],
  };
}

export const demoDocument: SiteDocument = {
  schemaVersion: 1,
  updatedAt: "2026-07-28T00:00:00.000Z",
  site: {
    name: "Harbor Bike Workshop",
    baseUrl: "https://harbor-bike.example",
  },
  theme: {
    background: "#f4f1e8",
    surface: "#fffdf7",
    text: "#17201b",
    muted: "#5d675f",
    accent: "#d9552f",
    font: "system",
    radius: "8",
  },
  seo: {
    title: "Harbor Bike Workshop | Bicycle repair in Portland",
    description:
      "Tune-ups, repairs, and safety checks for everyday riders in Portland, Maine.",
    socialTitle: "Harbor Bike Workshop",
    socialDescription:
      "Straightforward bicycle service, Tuesday through Saturday.",
    socialImage: "https://harbor-bike.example/social-card.jpg",
  },
  pages: [
    {
      id: "page-home",
      title: "Home",
      navLabel: "Home",
      slug: "home",
      hidden: false,
      sections: [
        {
          id: "section-home-hero",
          kind: "hero",
          eyebrow: "Bicycle repair in Portland, Maine",
          title: "Harbor Bike Workshop",
          body: "Tune-ups, repairs, and safety checks for everyday riders. Open Tuesday–Saturday, 9:00–17:00.",
          linkLabel: "Book a service",
          linkUrl: "mailto:hello@harbor-bike.example?subject=Service%20booking",
          hidden: false,
        },
        {
          id: "section-home-turnaround",
          kind: "content",
          eyebrow: "Current turnaround",
          title: "Most repairs are ready in two working days.",
          body: "We inspect the bike first, confirm the price, and contact you before doing any work outside the estimate.",
          linkLabel: "See services",
          linkUrl: "#page-services",
          hidden: false,
        },
      ],
    },
    {
      id: "page-services",
      title: "Services",
      navLabel: "Services",
      slug: "services",
      hidden: false,
      sections: [
        {
          id: "section-services-tune",
          kind: "hero",
          eyebrow: "Service menu",
          title: "Repairs with a clear estimate.",
          body: "Standard tune-up $95 · Flat repair from $24 · Brake and shifting adjustments from $32.",
          linkLabel: "Ask about a repair",
          linkUrl: "mailto:hello@harbor-bike.example",
          hidden: false,
        },
        {
          id: "section-services-parts",
          kind: "callout",
          eyebrow: "Parts",
          title: "Bring your own, or ask us to source them.",
          body: "We work on commuter, road, gravel, and most electric bicycles. We will tell you before booking if a repair needs a specialist.",
          linkLabel: "",
          linkUrl: "",
          hidden: false,
        },
      ],
    },
    {
      id: "page-about",
      title: "About",
      navLabel: "About",
      slug: "about",
      hidden: false,
      sections: [
        {
          id: "section-about",
          kind: "hero",
          eyebrow: "Independent since 2018",
          title: "A neighborhood workshop for bikes that get used.",
          body: "Harbor Bike Workshop is owned and operated by two mechanics. The workshop is step-free and has outdoor bike parking.",
          linkLabel: "Get directions",
          linkUrl: "https://maps.example.com/harbor-bike-workshop",
          hidden: false,
        },
      ],
    },
  ],
};

export function cloneDocument(document: SiteDocument): SiteDocument {
  return structuredClone(document);
}
