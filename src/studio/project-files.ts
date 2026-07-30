export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadText(
  filename: string,
  value: string,
  type: string,
): void {
  downloadBlob(filename, new Blob([value], { type }));
}

export function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () =>
      resolve(String(reader.result ?? "")),
    );
    reader.addEventListener("error", () =>
      reject(reader.error ?? new Error("파일을 읽을 수 없습니다.")),
    );
    reader.readAsText(file);
  });
}

export function exportBasename(name: string): string {
  const normalized = name
    .trim()
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
  return normalized || "homepage";
}

export function safeTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
