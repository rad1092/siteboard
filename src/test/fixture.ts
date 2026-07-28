import {
  createBlankDocument,
  createFaq,
  createService,
  createWork,
} from "../data";
import type { ImageAsset, SiteDocument } from "../types";

export function tinyImage(
  name = "image.png",
  mimeType: ImageAsset["mimeType"] = "image/png",
): ImageAsset {
  return {
    id: `image-${name}`,
    name,
    mimeType,
    dataUrl: `data:${mimeType};base64,AAECAwQ=`,
    size: 5,
  };
}

export function minimalDocument(): SiteDocument {
  const document = createBlankDocument();
  document.site.name = "동그라미 식물점";
  document.site.tagline = "집에서 오래 키울 식물을 골라 드립니다.";
  document.site.summary = "서울 망원동에서 식물과 화분을 판매합니다.";
  document.contact.email = "hello@plant.example";
  return document;
}

export function completeDocument(): SiteDocument {
  const document = minimalDocument();
  document.site = {
    name: "모서리 공방",
    tagline: "매일 쓰는 나무 가구를 만듭니다.",
    summary:
      "서울에서 주문 가구를 설계하고 제작합니다. 상담부터 설치까지 한 사람이 맡습니다.",
    baseUrl: "https://corner.example",
    language: "ko",
  };
  document.brand.logo = tinyImage("logo.png");
  document.brand.heroImage = tinyImage("hero.jpg", "image/jpeg");
  document.hero.eyebrow = "서울 · 주문 제작";
  document.hero.secondaryLabel = "작업 보기";
  document.hero.secondaryUrl = "#work";
  document.layout.visible = {
    services: true,
    work: true,
    about: true,
    faq: true,
    contact: true,
  };
  document.services.items = [
    {
      ...createService(),
      title: "맞춤 가구",
      description: "공간을 확인하고 필요한 크기로 설계합니다.",
    },
  ];
  document.work.items = [
    {
      ...createWork(),
      title: "연희동 책장",
      description: "벽면 크기에 맞춰 수납과 작업 공간을 함께 구성했습니다.",
      linkLabel: "작업 기록 보기",
      linkUrl: "https://corner.example/work/bookshelf",
      image: tinyImage("work.webp", "image/webp"),
    },
  ];
  document.about.body =
    "목재 선택, 설계, 제작, 설치 과정을 직접 맡습니다.";
  document.faq.items = [
    {
      ...createFaq(),
      question: "제작 기간은 얼마나 걸리나요?",
      answer: "상담과 실측 뒤 예상 일정을 안내합니다.",
    },
  ];
  document.contact.message = "공간 사진과 필요한 크기를 이메일로 보내 주세요.";
  document.contact.email = "hello@corner.example";
  document.contact.address = "서울특별시";
  document.seo.title = "모서리 공방 | 서울 주문 가구";
  document.seo.description =
    "서울에서 맞춤 책장과 테이블을 설계하고 제작하는 모서리 공방입니다.";
  return document;
}
