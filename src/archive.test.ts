import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { createDeploymentZip } from "./archive";
import { completeDocument, minimalDocument } from "./test/fixture";

describe("ZIP 배포 패키지", () => {
  it("브라우저 실행 코드가 없어도 열리는 전체 파일을 담는다", () => {
    const files = unzipSync(createDeploymentZip(completeDocument()));

    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        "index.html",
        "assets/logo.png",
        "assets/hero.jpg",
        "assets/og.jpg",
        "assets/work-01.webp",
        "favicon.png",
        "robots.txt",
        "sitemap.xml",
        "README.txt",
      ]),
    );
    const html = strFromU8(files["index.html"]);
    expect(html).toContain("모서리 공방");
    expect(html).not.toContain("react");
    expect(html).not.toContain('type="module"');
    expect(strFromU8(files["README.txt"])).toContain("Cloudflare Pages");
  });

  it("이미지와 공개 주소 없이도 바로 올릴 최소 ZIP을 만든다", () => {
    const files = unzipSync(createDeploymentZip(minimalDocument()));

    expect(Object.keys(files).sort()).toEqual(
      ["README.txt", "index.html", "robots.txt"].sort(),
    );
    const html = strFromU8(files["index.html"]);
    expect(html).toContain("<title>동그라미 식물점</title>");
    expect(html).toContain("logo-placeholder");
    expect(html).toContain("hero-image-placeholder");
    expect(strFromU8(files["robots.txt"])).not.toContain("Sitemap:");
  });
});
