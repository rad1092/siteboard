import { strToU8, zipSync } from "fflate";
import { buildExportFiles } from "./site";
import type { ExportFile, SiteDocument } from "./types";

export function createZip(files: ExportFile[]): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  files.forEach((file) => {
    entries[file.path] =
      typeof file.data === "string" ? strToU8(file.data) : file.data;
  });
  return zipSync(entries, { level: 6 });
}

export function createDeploymentZip(document: SiteDocument): Uint8Array {
  return createZip(buildExportFiles(document));
}
