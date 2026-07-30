import { blockLabels } from "../data";
import { presetLabels } from "../site";
import type {
  SiteDocument,
  ThemePreset,
} from "../types";

type Commit = (
  update: (current: SiteDocument) => SiteDocument,
) => void;

function moveItem<T>(
  items: T[],
  index: number,
  direction: -1 | 1,
): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function StructureEditor({
  document,
  commit,
}: {
  document: SiteDocument;
  commit: Commit;
}) {
  return (
    <div className="editor-stack">
      <section className="editor-card">
        <header>
          <p>구성</p>
          <h3>보여줄 블록과 순서를 정합니다.</h3>
        </header>
        <ol className="block-list">
          {document.layout.order.map((kind, index) => (
            <li key={kind}>
              <label>
                <input
                  type="checkbox"
                  checked={document.layout.visible[kind]}
                  onChange={(event) =>
                    commit((current) => ({
                      ...current,
                      layout: {
                        ...current.layout,
                        visible: {
                          ...current.layout.visible,
                          [kind]: event.target.checked,
                        },
                      },
                    }))
                  }
                />
                <span>{blockLabels[kind]}</span>
              </label>
              <div>
                <button
                  type="button"
                  aria-label={`${blockLabels[kind]} 위로 이동`}
                  disabled={index === 0}
                  onClick={() =>
                    commit((current) => ({
                      ...current,
                      layout: {
                        ...current.layout,
                        order: moveItem(
                          current.layout.order,
                          index,
                          -1,
                        ),
                      },
                    }))
                  }
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`${blockLabels[kind]} 아래로 이동`}
                  disabled={index === document.layout.order.length - 1}
                  onClick={() =>
                    commit((current) => ({
                      ...current,
                      layout: {
                        ...current.layout,
                        order: moveItem(
                          current.layout.order,
                          index,
                          1,
                        ),
                      },
                    }))
                  }
                >
                  ↓
                </button>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export function StyleEditor({
  document,
  commit,
}: {
  document: SiteDocument;
  commit: Commit;
}) {
  return (
    <div className="editor-stack">
      <section className="editor-card">
        <header>
          <p>스타일</p>
          <h3>완성된 화면 성격을 고릅니다.</h3>
        </header>
        <div className="preset-grid">
          {(Object.keys(presetLabels) as ThemePreset[]).map(
            (preset) => (
              <button
                className={`preset-card preset-card--${preset}`}
                type="button"
                aria-pressed={document.theme.preset === preset}
                key={preset}
                onClick={() =>
                  commit((current) => ({
                    ...current,
                    theme: { ...current.theme, preset },
                  }))
                }
              >
                <span className="preset-preview" aria-hidden="true">
                  <i />
                  <b />
                  <em />
                </span>
                <strong>{presetLabels[preset]}</strong>
              </button>
            ),
          )}
        </div>
        <div className="accent-field">
          <label htmlFor="accent-color">강조색</label>
          <input
            type="color"
            aria-label="강조색 선택"
            value={
              /^#[0-9a-f]{6}$/i.test(document.theme.accent)
                ? document.theme.accent
                : "#b5482d"
            }
            onChange={(event) =>
              commit((current) => ({
                ...current,
                theme: {
                  ...current.theme,
                  accent: event.target.value,
                },
              }))
            }
          />
          <input
            id="accent-color"
            value={document.theme.accent}
            maxLength={7}
            onChange={(event) =>
              commit((current) => ({
                ...current,
                theme: {
                  ...current.theme,
                  accent: event.target.value,
                },
              }))
            }
          />
        </div>
      </section>
    </div>
  );
}
