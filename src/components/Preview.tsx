interface PreviewProps {
  html: string;
  device: "desktop" | "mobile";
  onDeviceChange(device: "desktop" | "mobile"): void;
}

export function Preview({
  html,
  device,
  onDeviceChange,
}: PreviewProps) {
  const deviceLabel = device === "desktop" ? "컴퓨터" : "휴대전화";
  return (
    <section className="preview-panel" aria-labelledby="preview-title">
      <header>
        <div>
          <p>미리보기</p>
          <h2 id="preview-title">현재 홈페이지</h2>
        </div>
        <div className="device-toggle" aria-label="미리보기 크기">
          <button
            type="button"
            aria-pressed={device === "desktop"}
            onClick={() => onDeviceChange("desktop")}
          >
            컴퓨터
          </button>
          <button
            type="button"
            aria-pressed={device === "mobile"}
            onClick={() => onDeviceChange("mobile")}
          >
            휴대전화
          </button>
        </div>
      </header>
      <div className={`preview-frame preview-frame--${device}`}>
        <iframe
          title={`${deviceLabel} 홈페이지 미리보기`}
          srcDoc={html}
          sandbox=""
        />
      </div>
    </section>
  );
}
