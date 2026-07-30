import type { SiteDocument } from "../../types";
import { type Commit, Field } from "./ContentControls";

interface ContactSectionProps {
  document: SiteDocument;
  commit: Commit;
}

export function ContactSection({
  document,
  commit,
}: ContactSectionProps) {
  return (
    <div className="editor-stack">
      <section className="editor-card">
        <header>
          <p>연락</p>
          <h3>방문자가 바로 연락할 수 있는 정보를 적습니다.</h3>
        </header>
        <Field label="제목">
          <input
            value={document.contact.heading}
            onChange={(event) =>
              commit((current) => ({
                ...current,
                contact: {
                  ...current.contact,
                  heading: event.target.value,
                },
              }))
            }
          />
        </Field>
        <Field label="안내 문구">
          <textarea
            rows={4}
            value={document.contact.message}
            onChange={(event) =>
              commit((current) => ({
                ...current,
                contact: {
                  ...current.contact,
                  message: event.target.value,
                },
              }))
            }
          />
        </Field>
        <div className="field-grid">
          <Field label="이메일">
            <input
              type="email"
              value={document.contact.email}
              onChange={(event) =>
                commit((current) => ({
                  ...current,
                  contact: {
                    ...current.contact,
                    email: event.target.value,
                  },
                }))
              }
            />
          </Field>
          <Field label="전화번호">
            <input
              type="tel"
              value={document.contact.phone}
              onChange={(event) =>
                commit((current) => ({
                  ...current,
                  contact: {
                    ...current.contact,
                    phone: event.target.value,
                  },
                }))
              }
            />
          </Field>
        </div>
        <Field label="주소">
          <input
            value={document.contact.address}
            onChange={(event) =>
              commit((current) => ({
                ...current,
                contact: {
                  ...current.contact,
                  address: event.target.value,
                },
              }))
            }
          />
        </Field>
        <Field label="운영 시간">
          <textarea
            rows={3}
            value={document.contact.hours}
            onChange={(event) =>
              commit((current) => ({
                ...current,
                contact: {
                  ...current.contact,
                  hours: event.target.value,
                },
              }))
            }
          />
        </Field>
      </section>
    </div>
  );
}
