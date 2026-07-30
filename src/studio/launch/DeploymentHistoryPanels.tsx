import {
  type DeploymentState,
} from "../../deployment";
import { deploymentStatusLabel } from "../../components/ProjectDashboard";
import type { DeploymentActionState } from "./useDeploymentManager";

interface DeploymentHistoryPanelsProps {
  state: DeploymentState;
  action: DeploymentActionState;
  onRollback(deploymentId: string): void;
}

export function DeploymentHistoryPanels({
  state,
  action,
  onRollback,
}: DeploymentHistoryPanelsProps) {
  return (
    <>
      {state.deployments.length ? (
        <section className="editor-card deployment-history-card">
          <header>
            <p>Production 배포</p>
            <h3>현재 버전과 복구 가능한 이전 버전입니다.</h3>
          </header>
          <ol className="cloudflare-deployments">
            {state.deployments.map((deployment) => (
              <li key={deployment.deploymentId}>
                <div>
                  <span>{deployment.current ? "현재" : "이전"}</span>
                  <strong>
                    {deployment.source ||
                      deployment.deploymentId.slice(0, 12)}
                  </strong>
                  <small>{deployment.status}</small>
                </div>
                <div>
                  <a
                    href={deployment.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    주소 열기 ↗
                  </a>
                  {deployment.rollbackable ? (
                    <button
                      type="button"
                      disabled={action !== "idle"}
                      onClick={() =>
                        onRollback(deployment.deploymentId)
                      }
                    >
                      이 배포로 복구
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {state.history.length ? (
        <section className="editor-card deployment-history-card">
          <header>
            <p>로컬 운영 이력</p>
            <h3>성공, 실패, 복구 결과를 변경 없이 기록합니다.</h3>
          </header>
          <ol className="local-deployment-history">
            {state.history.map((record) => (
              <li key={record.eventId}>
                <span
                  className={`history-status history-status--${record.status}`}
                >
                  {deploymentStatusLabel(record)}
                </span>
                <div>
                  <strong>
                    {record.operation === "publish" ? "배포" : "복구"}
                    {record.revision
                      ? ` · ${record.revision.slice(0, 12)}`
                      : ""}
                  </strong>
                  <small>
                    {new Intl.DateTimeFormat("ko-KR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(record.createdAt))}
                  </small>
                  {record.message ? <p>{record.message}</p> : null}
                </div>
                {record.productionUrl ? (
                  <a
                    href={record.productionUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    공개 주소 ↗
                  </a>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </>
  );
}
