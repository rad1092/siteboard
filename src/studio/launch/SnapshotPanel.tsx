import type { WorkspaceState } from "../../project-file";

interface SnapshotPanelProps {
  snapshots: WorkspaceState["snapshots"];
  name: string;
  onNameChange(name: string): void;
  onSave(): void;
  onRestore(snapshotId: string): void;
}

export function SnapshotPanel({
  snapshots,
  name,
  onNameChange,
  onSave,
  onRestore,
}: SnapshotPanelProps) {
  return (
    <section className="editor-card snapshot-card">
      <header>
        <p>편집 저장본</p>
        <h3>현재 초안을 저장하거나 이전 초안으로 돌아갑니다.</h3>
      </header>
      <div className="snapshot-create">
        <input
          aria-label="편집 저장본 이름"
          value={name}
          maxLength={80}
          placeholder="예: 가격표 수정 전"
          onChange={(event) => onNameChange(event.target.value)}
        />
        <button type="button" onClick={onSave}>
          현재 초안 저장
        </button>
      </div>
      {snapshots.length ? (
        <ol className="snapshot-list">
          {[...snapshots].reverse().map((snapshot) => (
            <li key={snapshot.id}>
              <div>
                <strong>{snapshot.name}</strong>
                <small>
                  {new Intl.DateTimeFormat("ko-KR", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(snapshot.createdAt))}
                </small>
              </div>
              <button
                type="button"
                onClick={() => onRestore(snapshot.id)}
              >
                편집본 복원
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="package-note">
          아직 만든 편집 저장본이 없습니다.
        </p>
      )}
      <p className="package-note">
        편집본 복원은 현재 초안만 바꾸며 공개 중인 production은
        변경하지 않습니다.
      </p>
    </section>
  );
}
