import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { generateStaticHtml } from "./site";
import { completeDocument } from "./test/fixture";

describe("모바일 화면 계약", () => {
  it("생성된 홈페이지에 뷰포트와 한 열 전환 규칙을 포함한다", () => {
    const html = generateStaticHtml(completeDocument());
    expect(html).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1"',
    );
    expect(html).toContain("@media (max-width: 760px)");
    expect(html).toContain(".hero { min-height: auto; grid-template-columns: 1fr;");
    expect(html).toContain(".service-grid { grid-template-columns: 1fr;");
    expect(html).toContain(".work-card { grid-template-columns: 1fr;");
  });

  it("편집 화면을 작은 폭에서 한 열과 상단 단계 메뉴로 바꾼다", async () => {
    const css = await readFile(
      resolve(process.cwd(), "src/styles.css"),
      "utf8",
    );
    expect(css).toContain("@media (max-width: 680px)");
    expect(css).toContain(".workspace {\n    display: block;");
    expect(css).toContain("grid-template-columns: repeat(4, 1fr)");
    expect(css).toContain(".field-grid,\n  .preset-grid {\n    grid-template-columns: 1fr;");
  });
});
