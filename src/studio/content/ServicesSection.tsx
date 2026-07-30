import { createService } from "../../data";
import type { SiteDocument } from "../../types";
import { type Commit, Field } from "./ContentControls";

interface ServicesSectionProps {
  document: SiteDocument;
  commit: Commit;
}

export function ServicesSection({
  document,
  commit,
}: ServicesSectionProps) {
  return (
    <div className="editor-stack">
      <section className="editor-card">
        <header>
          <p>서비스</p>
          <h3>방문자가 선택할 수 있는 일을 적습니다.</h3>
        </header>
        <Field label="제목">
          <input
            value={document.services.heading}
            onChange={(event) =>
              commit((current) => ({
                ...current,
                services: {
                  ...current.services,
                  heading: event.target.value,
                },
              }))
            }
          />
        </Field>
        <Field label="짧은 설명">
          <textarea
            rows={3}
            value={document.services.intro}
            onChange={(event) =>
              commit((current) => ({
                ...current,
                services: {
                  ...current.services,
                  intro: event.target.value,
                },
              }))
            }
          />
        </Field>
      </section>
      {document.services.items.map((item, index) => (
        <section className="editor-card item-card" key={item.id}>
          <header>
            <p>서비스 {index + 1}</p>
            <button
              type="button"
              onClick={() =>
                commit((current) => ({
                  ...current,
                  services: {
                    ...current.services,
                    items: current.services.items.filter(
                      (candidate) => candidate.id !== item.id,
                    ),
                  },
                }))
              }
            >
              삭제
            </button>
          </header>
          <Field label={`서비스 ${index + 1} 이름`}>
            <input
              value={item.title}
              onChange={(event) =>
                commit((current) => ({
                  ...current,
                  services: {
                    ...current.services,
                    items: current.services.items.map((candidate) =>
                      candidate.id === item.id
                        ? {
                            ...candidate,
                            title: event.target.value,
                          }
                        : candidate,
                    ),
                  },
                }))
              }
            />
          </Field>
          <Field label={`서비스 ${index + 1} 설명`}>
            <textarea
              rows={3}
              value={item.description}
              onChange={(event) =>
                commit((current) => ({
                  ...current,
                  services: {
                    ...current.services,
                    items: current.services.items.map((candidate) =>
                      candidate.id === item.id
                        ? {
                            ...candidate,
                            description: event.target.value,
                          }
                        : candidate,
                    ),
                  },
                }))
              }
            />
          </Field>
        </section>
      ))}
      <button
        className="add-item-button"
        type="button"
        onClick={() =>
          commit((current) => ({
            ...current,
            services: {
              ...current.services,
              items: [...current.services.items, createService()],
            },
            layout: {
              ...current.layout,
              visible: {
                ...current.layout.visible,
                services:
                  current.services.items.length === 0
                    ? true
                    : current.layout.visible.services,
              },
            },
          }))
        }
      >
        + 서비스 추가
      </button>
    </div>
  );
}
