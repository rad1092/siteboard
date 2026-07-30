import type { SiteDocument } from "../types";
import { AboutSection } from "./content/AboutSection";
import { ContactSection } from "./content/ContactSection";
import type { Commit } from "./content/ContentControls";
import { FaqSection } from "./content/FaqSection";
import { IdentitySection } from "./content/IdentitySection";
import { ServicesSection } from "./content/ServicesSection";
import { WorkSection } from "./content/WorkSection";

export type ContentPanel =
  | "identity"
  | "services"
  | "work"
  | "about"
  | "faq"
  | "contact";

const panels: Array<[ContentPanel, string]> = [
  ["identity", "기본 정보"],
  ["services", "서비스"],
  ["work", "작업과 갤러리"],
  ["about", "소개"],
  ["faq", "질문과 답변"],
  ["contact", "연락"],
];

interface ContentEditorProps {
  document: SiteDocument;
  panel: ContentPanel;
  onPanelChange(panel: ContentPanel): void;
  commit: Commit;
  onFeedback(message: string): void;
}

export function ContentEditor({
  document,
  panel,
  onPanelChange,
  commit,
  onFeedback,
}: ContentEditorProps) {
  const content: Record<ContentPanel, React.ReactNode> = {
    identity: (
      <IdentitySection
        document={document}
        commit={commit}
        onFeedback={onFeedback}
      />
    ),
    services: (
      <ServicesSection document={document} commit={commit} />
    ),
    work: (
      <WorkSection
        document={document}
        commit={commit}
        onFeedback={onFeedback}
      />
    ),
    about: <AboutSection document={document} commit={commit} />,
    faq: <FaqSection document={document} commit={commit} />,
    contact: (
      <ContactSection document={document} commit={commit} />
    ),
  };

  return (
    <>
      <nav className="content-tabs" aria-label="내용 항목">
        {panels.map(([value, label]) => (
          <button
            type="button"
            aria-pressed={panel === value}
            key={value}
            onClick={() => onPanelChange(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      {content[panel]}
    </>
  );
}
