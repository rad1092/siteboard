import { createFaq } from "../../data";
import type { SiteDocument } from "../../types";
import { type Commit, Field } from "./ContentControls";

interface FaqSectionProps {
  document: SiteDocument;
  commit: Commit;
}

export function FaqSection({
  document,
  commit,
}: FaqSectionProps) {
  return (
    <div className="editor-stack">
      <section className="editor-card">
        <header>
          <p>질문과 답변</p>
          <h3>문의 전에 자주 확인하는 내용을 정리합니다.</h3>
        </header>
        <Field label="제목">
          <input
            value={document.faq.heading}
            onChange={(event) =>
              commit((current) => ({
                ...current,
                faq: {
                  ...current.faq,
                  heading: event.target.value,
                },
              }))
            }
          />
        </Field>
      </section>
      {document.faq.items.map((item, index) => (
        <section className="editor-card item-card" key={item.id}>
          <header>
            <p>질문 {index + 1}</p>
            <button
              type="button"
              onClick={() =>
                commit((current) => ({
                  ...current,
                  faq: {
                    ...current.faq,
                    items: current.faq.items.filter(
                      (candidate) => candidate.id !== item.id,
                    ),
                  },
                }))
              }
            >
              삭제
            </button>
          </header>
          <Field label={`질문 ${index + 1}`}>
            <input
              value={item.question}
              onChange={(event) =>
                commit((current) => ({
                  ...current,
                  faq: {
                    ...current.faq,
                    items: current.faq.items.map((candidate) =>
                      candidate.id === item.id
                        ? {
                            ...candidate,
                            question: event.target.value,
                          }
                        : candidate,
                    ),
                  },
                }))
              }
            />
          </Field>
          <Field label={`답변 ${index + 1}`}>
            <textarea
              rows={4}
              value={item.answer}
              onChange={(event) =>
                commit((current) => ({
                  ...current,
                  faq: {
                    ...current.faq,
                    items: current.faq.items.map((candidate) =>
                      candidate.id === item.id
                        ? {
                            ...candidate,
                            answer: event.target.value,
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
            faq: {
              ...current.faq,
              items: [...current.faq.items, createFaq()],
            },
            layout: {
              ...current.layout,
              visible: {
                ...current.layout.visible,
                faq:
                  current.faq.items.length === 0
                    ? true
                    : current.layout.visible.faq,
              },
            },
          }))
        }
      >
        + 질문 추가
      </button>
    </div>
  );
}
