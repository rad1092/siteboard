import type { ValidationIssue } from "../../types";
import type { LaunchCheck } from "../launch-checks";

interface LaunchChecksPanelProps {
  checks: LaunchCheck[];
  issues: ValidationIssue[];
  errors: ValidationIssue[];
  onSelectTarget(target: ValidationIssue["target"]): void;
}

export function LaunchChecksPanel({
  checks,
  issues,
  errors,
  onSelectTarget,
}: LaunchChecksPanelProps) {
  return (
    <section className="editor-card launch-card">
      <header>
        <p>배포 점검</p>
        <h3>
          {errors.length
            ? `${errors.length}개 항목을 마치면 배포할 수 있습니다.`
            : "새 리비전을 배포할 준비가 끝났습니다."}
        </h3>
      </header>
      <ul className="launch-checks">
        {checks.map((check) => (
          <li
            className={check.complete ? "is-complete" : ""}
            key={check.label}
          >
            <span aria-hidden="true">
              {check.complete ? "✓" : "○"}
            </span>
            {check.label}
          </li>
        ))}
      </ul>
      {issues.length ? (
        <ul className="issue-list" aria-label="배포 점검 결과">
          {issues.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelectTarget(item.target)}
              >
                <span className={item.level}>
                  {item.level === "error" ? "필수" : "권장"}
                </span>
                {item.message}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
