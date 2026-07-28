# Siteboard

Siteboard는 비전문 사용자가 한 장짜리 사업 홈페이지를 만들고 배포 파일을
ZIP으로 받는 로컬 제작기입니다. 편집 내용은 현재 브라우저에 자동
저장되며 계정이나 서버 데이터베이스를 사용하지 않습니다.

## 주요 기능

- 상호, 한 줄 소개, 서비스, 작업과 갤러리, 소개, 질문과 답변, 연락 정보
  편집
- 선택 사항인 로고·대표 이미지·작업 이미지 업로드(PNG, JPG, WEBP)
- 블록 표시 여부와 순서 변경
- 완성형 스타일 프리셋 3개와 강조색 설정
- 컴퓨터·휴대전화 크기 미리보기
- 100단계 되돌리기·다시 실행
- 필수 사업 정보·연락 링크 검사와 이미지·배포 주소 권장 안내
- v2 JSON 백업·가져오기와 v1 문서 자동 이전
- `index.html`, 업로드한 이미지, `robots.txt`, 배포 안내를 담은 ZIP 생성
- 로고가 있으면 favicon, 대표 이미지와 공개 주소가 함께 있으면 Open Graph
  이미지, 공개 주소가 있으면 `sitemap.xml` 추가
- `/siteboard/` 범위에서 설치 가능한 오프라인 편집 화면

## 로컬 실행

Node.js 22 이상을 권장합니다.

```bash
npm install
npm run dev
```

출시 전 확인:

```bash
npm test
npm run lint
npm run build
```

## 편집기 배포 위치

Vite, 웹 앱 매니페스트, 서비스 워커는 `/siteboard/`를 기준 경로로
사용합니다.

- `https://rad1092.github.io/siteboard/`
- `https://whago.net/siteboard/`는 기존 브라우저 작업을 백업하는 이전
  화면입니다.

`.github/workflows/deploy-pages.yml`은 테스트, 린트, 빌드를 통과한
`dist/`를 독립된 GitHub Pages 사이트에 배포합니다.

## 저장과 이전

현재 문서는 `siteboard.document.v2`, 직전 정상 문서는
`siteboard.document.backup.v2`에 저장됩니다. 기존
`siteboard.document.v1`과 `siteboard.document.backup.v1` 값은 그대로
보존하면서 편집 화면에서 v2 구조로 옮깁니다.

기본 저장 데이터를 읽지 못하거나 더 최신 형식이 발견되면 원문을
`siteboard.document.recovery.raw`에 추가 보관하고 자동 저장을 멈춥니다.
화면에서 원문 다운로드와 복구본 사용 중 하나를 선택할 수 있습니다.

이미지는 JSON 안에 Data URL로 저장됩니다. 이미지 한 장은 800KB,
문서 전체 이미지는 1.5MB까지 허용합니다. 현재 저장본과 직전 백업을
함께 보관할 수 있도록 정한 범위입니다. 브라우저 사이트 데이터를
지우기 전에는 JSON 백업을 저장하세요.

## 배포 ZIP

필수 점검을 마치면 다음 파일을 생성합니다.

- `index.html`: 반응형 CSS, 시맨틱 마크업, 검색·공유 메타데이터,
  구조화 데이터 포함
- `assets/`: 사용자가 추가한 로고, 대표 이미지, 작업 이미지와 Open Graph
  이미지
- `favicon.*`: 로고를 추가한 경우
- `robots.txt`
- `sitemap.xml`: 공개 주소를 입력한 경우
- `README.txt`: Cloudflare Pages와 GitHub Pages 업로드 안내

생성된 홈페이지는 외부 JavaScript, 웹 폰트, Siteboard 실행 코드를
불러오지 않습니다. 작성한 텍스트는 HTML 이스케이프하고 링크는
HTTP(S), 이메일, 전화, 페이지 안 앵커, 상대 경로만 허용합니다.

## PWA

서비스 워커는 내용 기반 릴리스 캐시를 사용하고 `/siteboard/` 안의 편집
화면 자산만 다룹니다. 첫 온라인 방문을 마치면 편집 화면을 오프라인에서
다시 열 수 있습니다. 사업 홈페이지 문서는 브라우저 로컬 저장소에
유지됩니다.

## License

[MIT](./LICENSE)
