import type { SiteDocument, ValidationIssue } from "../types";

export interface LaunchCheck {
  label: string;
  complete: boolean;
}

export function getLaunchChecks(
  document: SiteDocument,
  errors: ValidationIssue[],
): LaunchCheck[] {
  return [
    {
      label: "사업 이름과 첫 화면 문구",
      complete: Boolean(
        document.site.name.trim() &&
          document.site.tagline.trim() &&
          document.site.summary.trim(),
      ),
    },
    {
      label: "연락 수단",
      complete: Boolean(
        !document.layout.visible.contact ||
          document.contact.email.trim() ||
          document.contact.phone.trim(),
      ),
    },
    {
      label: "연결 주소와 내용 검사",
      complete: errors.length === 0,
    },
  ];
}
