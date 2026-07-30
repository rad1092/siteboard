import type { SiteDocument } from "../../types";
import { Field } from "../Field";
import type { Commit } from "./types";

interface SeoPanelProps {
  document: SiteDocument;
  commit: Commit;
}

export function SeoPanel({ document, commit }: SeoPanelProps) {
  return (
    <section className="editor-card">
      <header>
        <p>검색 정보</p>
        <h3>검색 결과와 링크 공유에 표시할 문구입니다.</h3>
      </header>
      <Field
        label={`검색 결과 제목 (선택) · ${document.seo.title.length}/60`}
        hint={`비워 두면 “${document.site.name || "사업 이름"}”을 사용합니다.`}
      >
        <input
          value={document.seo.title}
          onChange={(event) =>
            commit((current) => ({
              ...current,
              seo: { ...current.seo, title: event.target.value },
            }))
          }
        />
      </Field>
      <Field
        label={`검색 결과 설명 (선택) · ${document.seo.description.length}/160`}
        hint="비워 두면 첫 화면 설명을 사용합니다."
      >
        <textarea
          rows={4}
          value={document.seo.description}
          onChange={(event) =>
            commit((current) => ({
              ...current,
              seo: {
                ...current.seo,
                description: event.target.value,
              },
            }))
          }
        />
      </Field>
    </section>
  );
}
