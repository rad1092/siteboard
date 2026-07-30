import { useCallback, useState } from "react";
import {
  addSnapshot,
  createSnapshot,
  type WorkspaceState,
} from "../../project-file";
import type { SiteDocument } from "../../types";
import type { SaveState } from "../workspace/types";
import type { StoreWorkspace } from "./types";

interface UseSnapshotManagerOptions {
  document: SiteDocument;
  workspace: WorkspaceState;
  replaceDocument(document: SiteDocument): void;
  storeWorkspace: StoreWorkspace;
  setSaveState(state: SaveState): void;
  setFeedback(message: string): void;
}

export function useSnapshotManager({
  document,
  workspace,
  replaceDocument,
  storeWorkspace,
  setSaveState,
  setFeedback,
}: UseSnapshotManagerOptions) {
  const [snapshotName, setSnapshotName] = useState("");

  const saveSnapshot = useCallback(() => {
    const snapshot = createSnapshot(
      document,
      snapshotName || `저장본 ${workspace.snapshots.length + 1}`,
    );
    const snapshots = addSnapshot(workspace.snapshots, snapshot);
    storeWorkspace({ ...workspace, snapshots });
    setSnapshotName("");
    setFeedback(`“${snapshot.name}” 편집 저장본을 만들었습니다.`);
  }, [
    document,
    setFeedback,
    snapshotName,
    storeWorkspace,
    workspace,
  ]);

  const restoreSnapshot = useCallback(
    (snapshotId: string) => {
      const snapshot = workspace.snapshots.find(
        (candidate) => candidate.id === snapshotId,
      );
      if (
        !snapshot ||
        !window.confirm(
          `“${snapshot.name}” 편집본을 현재 화면에 복원할까요? 공개 중인 production은 바뀌지 않습니다.`,
        )
      ) {
        return;
      }
      replaceDocument({
        ...snapshot.document,
        updatedAt: new Date().toISOString(),
      });
      setSaveState("saving");
      setFeedback(
        `“${snapshot.name}” 편집본을 복원했습니다. production은 변경하지 않았습니다.`,
      );
    },
    [
      replaceDocument,
      setFeedback,
      setSaveState,
      workspace.snapshots,
    ],
  );

  return {
    snapshotName,
    setSnapshotName,
    saveSnapshot,
    restoreSnapshot,
  };
}
