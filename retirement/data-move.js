/* global Blob, URL, document, window */
(() => {
  const prefixes = { Daymark: ["daymark:"], Siteboard: ["siteboard.document.", "siteboard.project."] };
  function collect(storage, name) {
    if (!prefixes[name]) throw new Error("Unknown product");
    const records = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (!key || !prefixes[name].some((prefix) => key.startsWith(prefix))) continue;
      const raw = storage.getItem(key);
      if (raw === null) continue;
      let parsed = null;
      try { parsed = JSON.parse(raw); } catch { /* Keep damaged originals too. */ }
      records.push({ key, raw, parsed });
    }
    return records.sort((a, b) => a.key.localeCompare(b.key));
  }
  function csvCell(value) {
    let text = typeof value === "string" ? value : value == null ? "" : String(value);
    if (/^[\s]*[=+@-]/.test(text) || /^[\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  }
  function tasksCsv(value) {
    if (!value || !Array.isArray(value.tasks)) return null;
    const fields = ["title", "status", "notes", "nextStep", "reviewOn", "blockedReason", "estimateMinutes", "createdAt", "completedAt"];
    return "\uFEFF" + [fields.map(csvCell).join(","), ...value.tasks.filter((t) => t && typeof t === "object").map((t) => fields.map((f) => csvCell(t[f])).join(","))].join("\r\n");
  }
  globalThis.WhagoRecovery = { collect, tasksCsv };
  if (typeof document === "undefined") return;
  const productName = document.body.dataset.product;
  const list = document.querySelector("#backup-list");
  const count = document.querySelector("#backup-count");
  if (!list || !count || !prefixes[productName]) return;
  function download(contents, filename, type) {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = filename;
    document.body.append(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  let records;
  try { records = collect(window.localStorage, productName); }
  catch { count.textContent = "저장소 접근 불가"; list.textContent = "브라우저가 저장소 접근을 막고 있습니다. 사용하던 일반 창에서 다시 열어주세요. 자료를 읽거나 변경하지 못했습니다."; return; }
  count.textContent = `${records.length}개`;
  if (!records.length) {
    list.textContent = "이 주소에서 찾은 자료가 없습니다. 사용하던 브라우저와 주소인지 확인하세요. 설치판 자료는 설치판에서 백업해야 합니다.";
    return;
  }
  for (const record of records) {
    const row = document.createElement("div"); row.className = "backup-row";
    const label = document.createElement("p"); label.textContent = record.key;
    const filename = record.key.replace(/[^a-zA-Z0-9._-]/g, "-");
    const original = document.createElement("button"); original.type = "button"; original.className = "backup-button";
    original.textContent = record.parsed === null ? "원본 그대로 저장 (.txt)" : "원본 JSON 저장";
    original.addEventListener("click", () => download(record.raw, filename + (record.parsed === null ? ".txt" : ".json"), record.parsed === null ? "text/plain;charset=utf-8" : "application/json"));
    row.append(label, original);
    const csv = productName === "Daymark" ? tasksCsv(record.parsed) : null;
    if (csv !== null) {
      const readable = document.createElement("button"); readable.type = "button"; readable.className = "backup-button secondary"; readable.textContent = "할 일 CSV 저장";
      readable.addEventListener("click", () => download(csv, filename + "-tasks.csv", "text/csv;charset=utf-8")); row.append(readable);
    }
    list.append(row);
  }
})();
