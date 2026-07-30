import type { SiteDocument } from "../../types";
import {
  type Commit,
  Field,
  ImageBudget,
  ImageUploader,
} from "./ContentControls";

interface IdentitySectionProps {
  document: SiteDocument;
  commit: Commit;
  onFeedback(message: string): void;
}

export function IdentitySection({
  document,
  commit,
  onFeedback,
}: IdentitySectionProps) {
  const updateSite = (patch: Partial<SiteDocument["site"]>) =>
    commit((current) => ({
      ...current,
      site: { ...current.site, ...patch },
    }));
  const updateHero = (patch: Partial<SiteDocument["hero"]>) =>
    commit((current) => ({
      ...current,
      hero: { ...current.hero, ...patch },
    }));

  return (
    <div className="editor-stack">
      <section className="editor-card">
        <header>
          <p>첫 화면</p>
          <h3>누가 무엇을 제공하는지 적습니다.</h3>
        </header>
        <Field label="상호 또는 이름">
          <input
            value={document.site.name}
            onChange={(event) =>
              updateSite({ name: event.target.value })
            }
          />
        </Field>
        <Field
          label="한 줄 소개"
          hint="방문자가 첫 화면에서 바로 이해할 문장을 권합니다."
        >
          <textarea
            rows={2}
            value={document.site.tagline}
            onChange={(event) =>
              updateSite({ tagline: event.target.value })
            }
          />
        </Field>
        <Field label="설명">
          <textarea
            rows={4}
            value={document.site.summary}
            onChange={(event) =>
              updateSite({ summary: event.target.value })
            }
          />
        </Field>
        <Field
          label="작은 안내 문구"
          hint="지역, 업종, 운영 상태 등을 적을 수 있습니다."
        >
          <input
            value={document.hero.eyebrow}
            onChange={(event) =>
              updateHero({ eyebrow: event.target.value })
            }
          />
        </Field>
      </section>

      <section className="editor-card">
        <header>
          <p>이미지</p>
          <h3>필요하면 로고와 대표 화면을 추가합니다.</h3>
        </header>
        <ImageUploader
          label="로고"
          description="선택 사항 · 없으면 상호 첫 글자를 표시합니다. PNG, JPG, WEBP · 800KB 이하"
          asset={document.brand.logo}
          onError={onFeedback}
          onChange={(logo) =>
            commit((current) => ({
              ...current,
              brand: { ...current.brand, logo },
            }))
          }
        />
        <ImageUploader
          label="대표 이미지"
          description="선택 사항 · 없으면 선택한 스타일의 색상 화면을 표시합니다. 800KB 이하"
          asset={document.brand.heroImage}
          onError={onFeedback}
          onChange={(heroImage) =>
            commit((current) => ({
              ...current,
              brand: { ...current.brand, heroImage },
            }))
          }
        />
        <ImageBudget document={document} />
      </section>

      <section className="editor-card">
        <header>
          <p>연결</p>
          <h3>첫 화면 버튼과 공개 주소를 정합니다.</h3>
        </header>
        <div className="field-grid">
          <Field label="주요 버튼 문구">
            <input
              value={document.hero.primaryLabel}
              onChange={(event) =>
                updateHero({ primaryLabel: event.target.value })
              }
            />
          </Field>
          <Field label="주요 버튼 주소">
            <input
              value={document.hero.primaryUrl}
              onChange={(event) =>
                updateHero({ primaryUrl: event.target.value })
              }
            />
          </Field>
          <Field label="보조 버튼 문구">
            <input
              value={document.hero.secondaryLabel}
              onChange={(event) =>
                updateHero({ secondaryLabel: event.target.value })
              }
            />
          </Field>
          <Field label="보조 버튼 주소">
            <input
              value={document.hero.secondaryUrl}
              onChange={(event) =>
                updateHero({ secondaryUrl: event.target.value })
              }
            />
          </Field>
        </div>
        <Field
          label="공개할 홈페이지 주소 (선택)"
          hint="배포 후 주소가 정해지면 입력해 다시 받을 수 있습니다."
        >
          <input
            type="url"
            value={document.site.baseUrl}
            onChange={(event) =>
              updateSite({ baseUrl: event.target.value })
            }
          />
        </Field>
      </section>
    </div>
  );
}
