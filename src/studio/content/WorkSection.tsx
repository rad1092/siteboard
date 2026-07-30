import { createWork } from "../../data";
import type { SiteDocument } from "../../types";
import {
  type Commit,
  Field,
  ImageUploader,
} from "./ContentControls";

interface WorkSectionProps {
  document: SiteDocument;
  commit: Commit;
  onFeedback(message: string): void;
}

export function WorkSection({
  document,
  commit,
  onFeedback,
}: WorkSectionProps) {
  return (
    <div className="editor-stack">
      <section className="editor-card">
        <header>
          <p>작업과 갤러리</p>
          <h3>완성한 일과 결과를 보여줍니다.</h3>
        </header>
        <Field label="제목">
          <input
            value={document.work.heading}
            onChange={(event) =>
              commit((current) => ({
                ...current,
                work: {
                  ...current.work,
                  heading: event.target.value,
                },
              }))
            }
          />
        </Field>
        <Field label="짧은 설명">
          <textarea
            rows={3}
            value={document.work.intro}
            onChange={(event) =>
              commit((current) => ({
                ...current,
                work: {
                  ...current.work,
                  intro: event.target.value,
                },
              }))
            }
          />
        </Field>
      </section>
      {document.work.items.map((item, index) => (
        <section className="editor-card item-card" key={item.id}>
          <header>
            <p>작업 {index + 1}</p>
            <button
              type="button"
              onClick={() =>
                commit((current) => ({
                  ...current,
                  work: {
                    ...current.work,
                    items: current.work.items.filter(
                      (candidate) => candidate.id !== item.id,
                    ),
                  },
                }))
              }
            >
              삭제
            </button>
          </header>
          <ImageUploader
            label={`작업 ${index + 1} 이미지`}
            description="결과 화면이나 현장 사진을 올립니다."
            asset={item.image}
            onError={onFeedback}
            onChange={(image) =>
              commit((current) => ({
                ...current,
                work: {
                  ...current.work,
                  items: current.work.items.map((candidate) =>
                    candidate.id === item.id
                      ? { ...candidate, image }
                      : candidate,
                  ),
                },
              }))
            }
          />
          <Field label={`작업 ${index + 1} 이름`}>
            <input
              value={item.title}
              onChange={(event) =>
                commit((current) => ({
                  ...current,
                  work: {
                    ...current.work,
                    items: current.work.items.map((candidate) =>
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
          <Field label={`작업 ${index + 1} 설명`}>
            <textarea
              rows={4}
              value={item.description}
              onChange={(event) =>
                commit((current) => ({
                  ...current,
                  work: {
                    ...current.work,
                    items: current.work.items.map((candidate) =>
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
          <div className="field-grid">
            <Field label="링크 문구">
              <input
                value={item.linkLabel}
                onChange={(event) =>
                  commit((current) => ({
                    ...current,
                    work: {
                      ...current.work,
                      items: current.work.items.map((candidate) =>
                        candidate.id === item.id
                          ? {
                              ...candidate,
                              linkLabel: event.target.value,
                            }
                          : candidate,
                      ),
                    },
                  }))
                }
              />
            </Field>
            <Field label="링크 주소">
              <input
                value={item.linkUrl}
                onChange={(event) =>
                  commit((current) => ({
                    ...current,
                    work: {
                      ...current.work,
                      items: current.work.items.map((candidate) =>
                        candidate.id === item.id
                          ? {
                              ...candidate,
                              linkUrl: event.target.value,
                            }
                          : candidate,
                      ),
                    },
                  }))
                }
              />
            </Field>
          </div>
        </section>
      ))}
      <button
        className="add-item-button"
        type="button"
        onClick={() =>
          commit((current) => ({
            ...current,
            work: {
              ...current.work,
              items: [...current.work.items, createWork()],
            },
            layout: {
              ...current.layout,
              visible: {
                ...current.layout.visible,
                work:
                  current.work.items.length === 0
                    ? true
                    : current.layout.visible.work,
              },
            },
          }))
        }
      >
        + 작업 추가
      </button>
    </div>
  );
}
