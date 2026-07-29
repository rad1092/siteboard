import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { unzipSync } from "fflate";

export const MAX_ARCHIVE_BYTES = 12 * 1024 * 1024;
export const MAX_UNPACKED_BYTES = 32 * 1024 * 1024;
export const MAX_ARCHIVE_FILES = 2_000;
export const REVISION_MARKER_PATH = "siteboard-revision.json";

function strictBase64(value) {
  if (
    typeof value !== "string" ||
    !value.length ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  ) {
    throw new Error("배포 ZIP 데이터가 올바르지 않습니다.");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.length > MAX_ARCHIVE_BYTES) {
    throw new Error("배포 ZIP은 12MB를 넘을 수 없습니다.");
  }
  return bytes;
}

export function safeArchivePath(root, entryPath) {
  if (
    typeof entryPath !== "string" ||
    !entryPath ||
    entryPath.includes("\0") ||
    entryPath.includes("\\") ||
    isAbsolute(entryPath) ||
    /^[A-Za-z]:/.test(entryPath)
  ) {
    throw new Error("배포 ZIP에 안전하지 않은 파일 경로가 있습니다.");
  }
  const segments = entryPath.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("배포 ZIP에 안전하지 않은 파일 경로가 있습니다.");
  }
  const target = resolve(root, ...segments);
  const inside = relative(root, target);
  if (inside.startsWith(`..${sep}`) || inside === ".." || isAbsolute(inside)) {
    throw new Error("배포 ZIP 경로가 작업 폴더를 벗어납니다.");
  }
  return target;
}

export async function extractDeploymentArchive(archiveBase64, directory) {
  const compressed = strictBase64(archiveBase64);
  const files = unzipSync(compressed);
  const entries = Object.entries(files);
  if (!entries.length || entries.length > MAX_ARCHIVE_FILES) {
    throw new Error("배포 ZIP의 파일 수를 확인해 주세요.");
  }
  if (!Object.hasOwn(files, "index.html")) {
    throw new Error("배포 ZIP에 index.html이 없습니다.");
  }

  let totalBytes = 0;
  for (const [entryPath, data] of entries) {
    totalBytes += data.byteLength;
    if (totalBytes > MAX_UNPACKED_BYTES) {
      throw new Error("압축을 푼 배포 파일은 32MB를 넘을 수 없습니다.");
    }
    const target = safeArchivePath(directory, entryPath);
    await mkdir(resolve(target, ".."), { recursive: true });
    await writeFile(target, data, { flag: "wx" });
  }
  return {
    compressedBytes: compressed.byteLength,
    unpackedBytes: totalBytes,
    fileCount: entries.length,
    archiveBytes: compressed,
  };
}

export async function writeRevisionMarker(directory, revision) {
  if (typeof revision !== "string" || !/^[a-f0-9]{64}$/.test(revision)) {
    throw new Error("배포 리비전이 올바르지 않습니다.");
  }
  const target = safeArchivePath(directory, REVISION_MARKER_PATH);
  await writeFile(
    target,
    `${JSON.stringify({
      schemaVersion: 1,
      revision,
    })}\n`,
    { encoding: "utf8", flag: "wx" },
  );
  return target;
}
