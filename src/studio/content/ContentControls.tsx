import {
  type ChangeEvent,
  useRef,
} from "react";
import {
  imageAssetFromDataUrl,
  MAX_DOCUMENT_IMAGE_BYTES,
} from "../../site";
import type { ImageAsset, SiteDocument } from "../../types";
export { Field } from "../Field";

export type Commit = (
  update: (current: SiteDocument) => SiteDocument,
) => void;

function readImageDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () =>
      resolve(String(reader.result ?? "")),
    );
    reader.addEventListener("error", () =>
      reject(reader.error ?? new Error("파일을 읽을 수 없습니다.")),
    );
    reader.readAsDataURL(file);
  });
}

export function ImageUploader({
  label,
  description,
  asset,
  onChange,
  onError,
}: {
  label: string;
  description: string;
  asset: ImageAsset | null;
  onChange(asset: ImageAsset | null): void;
  onError(message: string): void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      onChange(imageAssetFromDataUrl(file, await readImageDataUrl(file)));
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "이미지를 확인해 주세요.",
      );
    }
  };

  return (
    <div className={`image-uploader ${asset ? "has-image" : ""}`}>
      <input
        className="sr-only"
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label={`${label} 선택`}
        onChange={handleImage}
      />
      {asset ? (
        <img src={asset.dataUrl} alt="" />
      ) : (
        <span className="image-placeholder" aria-hidden="true">
          +
        </span>
      )}
      <div>
        <strong>{label}</strong>
        <p>{description}</p>
        <div className="inline-actions">
          <button type="button" onClick={() => inputRef.current?.click()}>
            {asset ? "이미지 바꾸기" : "이미지 선택"}
          </button>
          {asset ? (
            <button type="button" onClick={() => onChange(null)}>
              제거
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function formatImageBytes(bytes: number): string {
  if (bytes < 1_000_000) return `${Math.round(bytes / 1_000)}KB`;
  return `${(bytes / 1_000_000).toFixed(2)}MB`;
}

function documentImageBytes(document: SiteDocument): number {
  return [
    document.brand.logo,
    document.brand.heroImage,
    ...document.work.items.map((item) => item.image),
  ].reduce((total, asset) => total + (asset?.size ?? 0), 0);
}

export function ImageBudget({
  document,
}: {
  document: SiteDocument;
}) {
  return (
    <p className="image-budget">
      현재 이미지 {formatImageBytes(documentImageBytes(document))} / 전체{" "}
      {formatImageBytes(MAX_DOCUMENT_IMAGE_BYTES)}
    </p>
  );
}
