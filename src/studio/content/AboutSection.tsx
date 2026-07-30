import type { SiteDocument } from "../../types";
import { type Commit, Field } from "./ContentControls";

interface AboutSectionProps {
  document: SiteDocument;
  commit: Commit;
}

export function AboutSection({
  document,
  commit,
}: AboutSectionProps) {
  return (
    <div className="editor-stack">
      <section className="editor-card">
        <header>
          <p>소개</p>
          <h3>경력, 방식, 장소처럼 신뢰에 필요한 정보를 적습니다.</h3>
        </header>
        <Field label="제목">
          <input
            value={document.about.heading}
            onChange={(event) =>
              commit((current) => ({
                ...current,
                about: {
                  ...current.about,
                  heading: event.target.value,
                },
              }))
            }
          />
        </Field>
        <Field label="소개 글">
          <textarea
            rows={9}
            value={document.about.body}
            onChange={(event) =>
              commit((current) => ({
                ...current,
                about: {
                  ...current.about,
                  body: event.target.value,
                },
                layout:
                  !current.about.body.trim() &&
                  event.target.value.trim()
                    ? {
                        ...current.layout,
                        visible: {
                          ...current.layout.visible,
                          about: true,
                        },
                      }
                    : current.layout,
              }))
            }
          />
        </Field>
      </section>
    </div>
  );
}
