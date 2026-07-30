import type {
  ParsedProjectFile,
  WorkspaceState,
} from "../../project-file";
import type { SiteDocument } from "../../types";

export function timestampDocument(
  document: SiteDocument,
): SiteDocument {
  return { ...document, updatedAt: new Date().toISOString() };
}

export function workspaceFromProject(
  project: ParsedProjectFile,
): WorkspaceState {
  return {
    schemaVersion: 1,
    binding: project.binding,
    snapshots: project.snapshots,
    lastDeployment: project.lastDeployment,
  };
}
