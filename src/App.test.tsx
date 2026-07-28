import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import { cloneDocument } from "./data";
import {
  DOCUMENT_BACKUP_KEY,
  DOCUMENT_RECOVERY_KEY,
  DOCUMENT_STORAGE_KEY,
} from "./storage";
import { completeDocument } from "./test/fixture";

function mockDownloads() {
  if (!URL.createObjectURL) {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: () => "blob:siteboard-test",
    });
  }
  if (!URL.revokeObjectURL) {
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: () => undefined,
    });
  }

  const createObjectUrl = vi
    .spyOn(URL, "createObjectURL")
    .mockReturnValue("blob:siteboard-test");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => undefined);

  return { click, createObjectUrl };
}

describe("Siteboard 제작 흐름", () => {
  it("빈 브라우저에서는 새 홈페이지와 작업 파일 열기로 시작한다", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", {
        name: "사업 홈페이지를 한 장으로 완성하세요.",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "새 홈페이지 만들기" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "작업 파일 열기" }),
    ).toBeVisible();
    expect(screen.queryByLabelText("상호 또는 이름")).not.toBeInTheDocument();
  });

  it("사업 정보를 입력하면 미리보기에 바로 반영한다", () => {
    render(<App />);
    fireEvent.click(
      screen.getByRole("button", { name: "새 홈페이지 만들기" }),
    );

    fireEvent.change(screen.getByLabelText("상호 또는 이름"), {
      target: { value: "소나무 수선실" },
    });
    fireEvent.change(screen.getByLabelText(/^한 줄 소개/), {
      target: { value: "오래 입을 옷을 고쳐 드립니다." },
    });

    const preview = screen.getByTitle("컴퓨터 홈페이지 미리보기");
    expect(preview.getAttribute("srcdoc")).toContain("소나무 수선실");
    expect(preview.getAttribute("srcdoc")).toContain(
      "오래 입을 옷을 고쳐 드립니다.",
    );
  });

  it("항목 추가, 되돌리기, 휴대전화 미리보기를 제공한다", () => {
    render(<App />);
    fireEvent.click(
      screen.getByRole("button", { name: "새 홈페이지 만들기" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "서비스" }));
    fireEvent.click(screen.getByRole("button", { name: "+ 서비스 추가" }));

    expect(screen.getByLabelText("서비스 1 이름")).toBeVisible();
    fireEvent.change(screen.getByLabelText("서비스 1 이름"), {
      target: { value: "의자 수리" },
    });
    fireEvent.click(screen.getByRole("button", { name: "되돌리기" }));
    expect(screen.getByLabelText("서비스 1 이름")).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: "휴대전화" }));
    expect(screen.getByRole("button", { name: "휴대전화" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTitle("휴대전화 홈페이지 미리보기")).toBeVisible();
  });

  it("선택 내용을 처음 추가하면 해당 블록을 자동으로 표시한다", () => {
    render(<App />);
    fireEvent.click(
      screen.getByRole("button", { name: "새 홈페이지 만들기" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "서비스" }));
    fireEvent.click(screen.getByRole("button", { name: "+ 서비스 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "작업과 갤러리" }));
    fireEvent.click(screen.getByRole("button", { name: "+ 작업 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "소개" }));
    fireEvent.change(screen.getByLabelText("소개 글"), {
      target: { value: "처음 입력한 소개입니다." },
    });
    fireEvent.click(screen.getByRole("button", { name: "질문과 답변" }));
    fireEvent.click(screen.getByRole("button", { name: "+ 질문 추가" }));

    fireEvent.click(screen.getByRole("button", { name: /구성$/ }));
    for (const label of ["서비스", "작업과 갤러리", "소개", "자주 묻는 질문"]) {
      expect(screen.getByRole("checkbox", { name: label })).toBeChecked();
    }
  });

  it("로고 이미지를 읽어 편집 문서에 넣는다", async () => {
    render(<App />);
    fireEvent.click(
      screen.getByRole("button", { name: "새 홈페이지 만들기" }),
    );

    fireEvent.change(screen.getByLabelText("로고 선택"), {
      target: {
        files: [
          new File([new Uint8Array([0, 1, 2, 3])], "logo.png", {
            type: "image/png",
          }),
        ],
      },
    });

    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: "이미지 바꾸기" })[0],
      ).toBeVisible(),
    );
  });

  it("필수 항목이 남으면 ZIP 받기를 잠근다", () => {
    render(<App />);
    fireEvent.click(
      screen.getByRole("button", { name: "새 홈페이지 만들기" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "출시 준비" }));

    expect(
      screen.getByRole("button", { name: "홈페이지 파일 받기" }),
    ).toBeDisabled();
    expect(screen.getByText("상호나 이름을 입력하세요.")).toBeVisible();
    expect(
      screen.getByText(
        "로고를 추가하면 상호 첫 글자 대신 브랜드 이미지를 표시합니다.",
      ),
    ).toBeVisible();
  });

  it("완성 문서는 전체 배포 ZIP을 내려받는다", () => {
    const downloads = mockDownloads();
    localStorage.setItem(
      DOCUMENT_STORAGE_KEY,
      JSON.stringify(completeDocument()),
    );

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "출시 준비" }));
    const download = screen.getByRole("button", {
      name: "홈페이지 파일 받기",
    });

    expect(download).toBeEnabled();
    fireEvent.click(download);
    expect(downloads.click).toHaveBeenCalledOnce();
    const blob = downloads.createObjectUrl.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("application/zip");
    expect(screen.getByText(/홈페이지 파일을 저장했습니다/)).toBeVisible();
  });

  it("사업 정보와 연락처만으로 이미지와 공개 주소 없이 ZIP을 만든다", () => {
    const downloads = mockDownloads();
    render(<App />);
    fireEvent.click(
      screen.getByRole("button", { name: "새 홈페이지 만들기" }),
    );

    fireEvent.change(screen.getByLabelText("상호 또는 이름"), {
      target: { value: "동그라미 식물점" },
    });
    fireEvent.change(screen.getByLabelText(/^한 줄 소개/), {
      target: { value: "집에서 오래 키울 식물을 골라 드립니다." },
    });
    fireEvent.change(screen.getByLabelText("설명"), {
      target: { value: "서울 망원동에서 식물과 화분을 판매합니다." },
    });
    fireEvent.click(screen.getByRole("button", { name: "연락" }));
    fireEvent.change(screen.getByLabelText("이메일"), {
      target: { value: "hello@plant.example" },
    });

    fireEvent.click(screen.getByRole("button", { name: "출시 준비" }));
    const download = screen.getByRole("button", {
      name: "홈페이지 파일 받기",
    });
    expect(download).toBeEnabled();
    expect(
      screen.getByText(
        "대표 이미지를 추가하면 첫 화면과 링크 공유 카드에 표시합니다.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        "공개 주소를 추가하면 검색용 주소 파일도 함께 만듭니다.",
      ),
    ).toBeVisible();
    expect(screen.queryByText("서비스를 추가하거나 구성에서 이 블록을 숨기세요."))
      .not.toBeInTheDocument();
    expect(screen.queryByText("검색 결과 제목을 입력하세요."))
      .not.toBeInTheDocument();

    fireEvent.click(download);
    expect(downloads.click).toHaveBeenCalledOnce();
    expect(screen.getByText(/홈페이지 파일을 저장했습니다/)).toBeVisible();
  });

  it("사용자가 숨긴 소개 블록은 글을 수정해도 다시 표시하지 않는다", () => {
    localStorage.setItem(
      DOCUMENT_STORAGE_KEY,
      JSON.stringify(completeDocument()),
    );
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /구성$/ }));
    const aboutToggle = screen.getByRole("checkbox", { name: "소개" });
    fireEvent.click(aboutToggle);
    expect(aboutToggle).not.toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: /내용$/ }));
    fireEvent.click(screen.getByRole("button", { name: "소개" }));
    fireEvent.change(screen.getByLabelText("소개 글"), {
      target: { value: "숨긴 상태에서 소개 글을 고쳤습니다." },
    });

    expect(
      screen.getByTitle("컴퓨터 홈페이지 미리보기").getAttribute("srcdoc"),
    ).not.toContain('id="about"');
    fireEvent.click(screen.getByRole("button", { name: /구성$/ }));
    expect(screen.getByRole("checkbox", { name: "소개" })).not.toBeChecked();
  });

  it.each([
    ["서비스", "서비스", "+ 서비스 추가", "services"],
    ["작업과 갤러리", "작업과 갤러리", "+ 작업 추가", "work"],
    ["질문과 답변", "자주 묻는 질문", "+ 질문 추가", "faq"],
  ])(
    "사용자가 숨긴 %s 블록은 항목을 더해도 다시 표시하지 않는다",
    (panelName, toggleName, addButtonName, sectionId) => {
      localStorage.setItem(
        DOCUMENT_STORAGE_KEY,
        JSON.stringify(completeDocument()),
      );
      render(<App />);

      fireEvent.click(screen.getByRole("button", { name: /구성$/ }));
      const toggle = screen.getByRole("checkbox", { name: toggleName });
      fireEvent.click(toggle);
      expect(toggle).not.toBeChecked();

      fireEvent.click(screen.getByRole("button", { name: /내용$/ }));
      fireEvent.click(
        screen.getByRole("button", { name: panelName }),
      );
      fireEvent.click(
        screen.getByRole("button", { name: addButtonName }),
      );

      expect(
        screen.getByTitle("컴퓨터 홈페이지 미리보기").getAttribute("srcdoc"),
      ).not.toContain(`id="${sectionId}"`);
      fireEvent.click(screen.getByRole("button", { name: /구성$/ }));
      expect(
        screen.getByRole("checkbox", { name: toggleName }),
      ).not.toBeChecked();
    },
  );

  it("첫 사용자가 모든 선택 내용을 채워 전체 배포 ZIP까지 만든다", async () => {
    const downloads = mockDownloads();
    render(<App />);
    fireEvent.click(
      screen.getByRole("button", { name: "새 홈페이지 만들기" }),
    );

    fireEvent.change(screen.getByLabelText("상호 또는 이름"), {
      target: { value: "동그라미 식물점" },
    });
    fireEvent.change(screen.getByLabelText(/^한 줄 소개/), {
      target: { value: "집에서 오래 키울 식물을 골라 드립니다." },
    });
    fireEvent.change(screen.getByLabelText("설명"), {
      target: { value: "서울 망원동에서 식물과 화분을 판매합니다." },
    });
    fireEvent.change(screen.getByLabelText(/^공개할 홈페이지 주소/), {
      target: { value: "https://plant.example" },
    });
    const imageFile = (name: string, type = "image/png") =>
      new File([new Uint8Array([0, 1, 2, 3])], name, { type });
    fireEvent.change(screen.getByLabelText("로고 선택"), {
      target: { files: [imageFile("logo.png")] },
    });
    fireEvent.change(screen.getByLabelText("대표 이미지 선택"), {
      target: { files: [imageFile("hero.jpg", "image/jpeg")] },
    });
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: "이미지 바꾸기" }),
      ).toHaveLength(2),
    );

    fireEvent.click(screen.getByRole("button", { name: "서비스" }));
    fireEvent.click(screen.getByRole("button", { name: "+ 서비스 추가" }));
    fireEvent.change(screen.getByLabelText("서비스 1 이름"), {
      target: { value: "식물 상담" },
    });
    fireEvent.change(screen.getByLabelText("서비스 1 설명"), {
      target: { value: "채광과 관리 시간을 듣고 식물을 추천합니다." },
    });

    fireEvent.click(screen.getByRole("button", { name: "작업과 갤러리" }));
    fireEvent.click(screen.getByRole("button", { name: "+ 작업 추가" }));
    fireEvent.change(screen.getByLabelText("작업 1 이름"), {
      target: { value: "창가 식물 구성" },
    });
    fireEvent.change(screen.getByLabelText("작업 1 설명"), {
      target: { value: "오전 햇빛에 맞는 세 종류를 배치했습니다." },
    });
    fireEvent.change(screen.getByLabelText("작업 1 이미지 선택"), {
      target: { files: [imageFile("work.webp", "image/webp")] },
    });

    fireEvent.click(screen.getByRole("button", { name: "소개" }));
    fireEvent.change(screen.getByLabelText("소개 글"), {
      target: { value: "식물을 고르고 돌보는 과정을 함께 안내합니다." },
    });

    fireEvent.click(screen.getByRole("button", { name: "질문과 답변" }));
    fireEvent.click(screen.getByRole("button", { name: "+ 질문 추가" }));
    fireEvent.change(screen.getByLabelText("질문 1"), {
      target: { value: "배송할 수 있나요?" },
    });
    fireEvent.change(screen.getByLabelText("답변 1"), {
      target: { value: "서울 지역은 날짜를 정해 배송합니다." },
    });

    fireEvent.click(screen.getByRole("button", { name: "연락" }));
    fireEvent.change(screen.getByLabelText("이메일"), {
      target: { value: "hello@plant.example" },
    });

    fireEvent.click(screen.getByRole("button", { name: "출시 준비" }));
    fireEvent.change(screen.getByLabelText(/^검색 결과 제목/), {
      target: { value: "동그라미 식물점 | 망원동 식물 상담" },
    });
    fireEvent.change(screen.getByLabelText(/^검색 결과 설명/), {
      target: { value: "망원동에서 식물과 화분을 판매하고 관리법을 안내합니다." },
    });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "홈페이지 파일 받기" }),
      ).toBeEnabled(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "홈페이지 파일 받기" }),
    );
    expect(downloads.click).toHaveBeenCalledOnce();
    expect(screen.getByText(/홈페이지 파일을 저장했습니다/)).toBeVisible();
  });

  it("JSON을 열기 전에 현재 백업을 받고 편집 기록을 새로 시작한다", async () => {
    const downloads = mockDownloads();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const current = completeDocument();
    const imported = cloneDocument(current);
    imported.site.name = "가져온 홈페이지";
    localStorage.setItem(DOCUMENT_STORAGE_KEY, JSON.stringify(current));

    render(<App />);
    fireEvent.change(screen.getByLabelText("상호 또는 이름"), {
      target: { value: "백업할 이름" },
    });
    fireEvent.change(screen.getByLabelText("Siteboard 작업 파일 선택"), {
      target: {
        files: [
          new File([JSON.stringify(imported)], "replacement.json", {
            type: "application/json",
          }),
        ],
      },
    });

    await waitFor(() =>
      expect(screen.getByLabelText("상호 또는 이름")).toHaveValue(
        "가져온 홈페이지",
      ),
    );
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(downloads.click).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "되돌리기" })).toBeDisabled();
  });

  it("손상된 저장 데이터와 정상 백업을 분리해 복구한다", () => {
    const raw = '{"schemaVersion":2,"unfinished":';
    const backup = completeDocument();
    backup.site.name = "마지막 정상 저장본";
    localStorage.setItem(DOCUMENT_STORAGE_KEY, raw);
    localStorage.setItem(DOCUMENT_BACKUP_KEY, JSON.stringify(backup));

    render(<App />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "브라우저 저장 데이터를 읽는 중 문제가 생겼습니다.",
    );
    expect(screen.getByLabelText("상호 또는 이름")).toHaveValue(
      "마지막 정상 저장본",
    );
    expect(localStorage.getItem(DOCUMENT_STORAGE_KEY)).toBe(raw);

    fireEvent.click(screen.getByRole("button", { name: "열린 내용 사용" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(localStorage.getItem(DOCUMENT_RECOVERY_KEY)).toBe(raw);
  });
});
