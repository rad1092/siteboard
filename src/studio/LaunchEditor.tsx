import { getLaunchChecks } from "./launch-checks";
import { CloudflareDeploymentPanel } from "./launch/CloudflareDeploymentPanel";
import { DeploymentHistoryPanels } from "./launch/DeploymentHistoryPanels";
import { LaunchChecksPanel } from "./launch/LaunchChecksPanel";
import { PackageExportPanel } from "./launch/PackageExportPanel";
import { SeoPanel } from "./launch/SeoPanel";
import { SnapshotPanel } from "./launch/SnapshotPanel";
import type { LaunchEditorProps } from "./launch/types";
import { useDeploymentManager } from "./launch/useDeploymentManager";
import { useLaunchExports } from "./launch/useLaunchExports";
import { useSnapshotManager } from "./launch/useSnapshotManager";

export function LaunchEditor({
  document,
  workspaceState,
  issues,
  errors,
  runtime,
  companionState,
  companion,
  commit,
  commitDocument,
  replaceDocument,
  storeWorkspace,
  setSaveState,
  setFeedback,
  setTarget,
  saveDesktopArchive,
  exportProjectFile,
}: LaunchEditorProps) {
  const deployment = useDeploymentManager({
    document,
    workspace: workspaceState,
    errors,
    companionState,
    companion,
    commitDocument,
    storeWorkspace,
    setSaveState,
    setFeedback,
  });
  const { exportZip } = useLaunchExports({
    document,
    errors,
    runtime,
    saveDesktopArchive,
    setFeedback,
  });
  const snapshots = useSnapshotManager({
    document,
    workspace: workspaceState,
    replaceDocument,
    storeWorkspace,
    setSaveState,
    setFeedback,
  });
  const companionAvailable =
    companionState === "available" && companion !== null;

  return (
    <div className="editor-stack">
      <SeoPanel document={document} commit={commit} />
      <LaunchChecksPanel
        checks={getLaunchChecks(document, errors)}
        issues={issues}
        errors={errors}
        onSelectTarget={setTarget}
      />
      {companionAvailable ? (
        <CloudflareDeploymentPanel
          companionState={companionState}
          companion={companion}
          pagesProject={deployment.pagesProject}
          bindingReady={deployment.bindingReady}
          publicOriginValid={deployment.draftPublicOrigin !== null}
          errorCount={errors.length}
          action={deployment.deploymentAction}
          onProjectChange={deployment.setPagesProject}
          onBind={deployment.bindCloudflareTarget}
          onPublish={deployment.publishWebsite}
          onRefresh={deployment.refreshDeploymentHistory}
        />
      ) : null}
      <PackageExportPanel
        runtime={runtime}
        companionAvailable={companionAvailable}
        errorCount={errors.length}
        onExportZip={exportZip}
        onExportProject={exportProjectFile}
      />
      <SnapshotPanel
        snapshots={workspaceState.snapshots}
        name={snapshots.snapshotName}
        onNameChange={snapshots.setSnapshotName}
        onSave={snapshots.saveSnapshot}
        onRestore={snapshots.restoreSnapshot}
      />
      {companionAvailable ? (
        <DeploymentHistoryPanels
          state={deployment.deploymentState}
          action={deployment.deploymentAction}
          onRollback={deployment.rollbackDeployment}
        />
      ) : null}
    </div>
  );
}
