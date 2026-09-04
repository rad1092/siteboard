> **개발 종료 · 2026-09-05**
> Siteboard의 독립 제품 개발을 종료했습니다. 원본 자료는 삭제하지 않습니다.
> [자료 회수](https://siteboard.whago.net/) · [구버전 열기](https://siteboard.whago.net/legacy/)
> 아래 문서는 보존된 구버전의 문서입니다. 웹 종료 배포는 `npm run build:retired`, 원래 앱 빌드는 기존 명령을 사용합니다.

# Siteboard

Siteboard는 운영체제에 설치하는 로컬 우선 홈페이지 제작 소프트웨어입니다.
사업 홈페이지의 내용 편집, 컴퓨터·휴대전화 화면 확인, 정적 배포 파일 생성과
프로젝트 복구를 한 창에서 처리합니다.

데스크톱 본체는 원격 웹사이트를 띄우지 않습니다. 빌드에 포함된 화면을
Tauri 2의 시스템 WebView에서 실행하고, 프로젝트는 앱 데이터 폴더 또는
사용자가 정한 `.siteboard` 파일에 원자적으로 저장합니다. 직전 정상 파일과
손상 원본을 별도로 보존합니다.

Cloudflare 자격 증명은 프로젝트, WebView 저장소, 앱 번들에 넣지 않습니다.
Cloudflare Pages 직접 배포와 production 복구는 현재 공식 Wrangler 인증을
사용하는 로컬 companion 경계가 담당합니다. 데스크톱만으로는 검증된 정적
ZIP까지 만들 수 있으며, 지원하지 않는 직접 배포를 지원되는 것처럼 표시하지
않습니다.

## 운영 흐름

1. 최근 프로젝트와 마지막 배포 상태를 확인합니다.
2. 내용, 블록 구성, 스타일, 검색 정보를 편집하고 컴퓨터·휴대전화 화면을
   확인합니다.
3. Studio에서 Cloudflare Pages 프로젝트 이름을 정해 새 production
   리비전을 배포합니다.
4. Siteboard가 Cloudflare API의 현재 production, 연결한 프로젝트 ID,
   실제 공개 주소의 64자리 콘텐츠 리비전을 차례로 확인하고 로컬 이력에
   결과를 추가합니다.
5. 문제가 생기면 정상적으로 완료된 이전 production deployment를 골라
   고정 배포 주소의 리비전을 먼저 확인한 뒤 Cloudflare Pages Rollback
   API로 복구하고 현재 production과 공개 주소를 다시 확인합니다.

`https://siteboard.whago.net/`은 파일 설치 전 확인할 수 있는 웹 데모입니다.
웹 데모의 브라우저 저장소는 데스크톱 프로젝트 저장소와 분리됩니다.

## 주요 기능

- 상호, 소개, 서비스, 작업과 갤러리, 질문과 답변, 연락 정보 편집
- 로고·대표 이미지·작업 이미지 업로드(PNG, JPG, WEBP)
- 블록 표시 여부와 순서 변경
- 완성형 스타일 프리셋 3개와 강조색 설정
- 컴퓨터·휴대전화 미리보기
- 100단계 편집 되돌리기·다시 실행
- 필수 정보, 연락 링크, 이미지와 공개 주소 점검
- `.siteboard` 프로젝트 저장·열기, JSON 백업 호환과 v1 문서 자동 이전
- 정적 `index.html`, 이미지, 검색 파일, 배포 안내를 담은 ZIP 생성
- Cloudflare Pages Direct Upload 프로젝트 자동 생성과 production 배포
- API가 확인한 production 배포, 콘텐츠 리비전, 공개 검증 결과의
  append-only 로컬 이력
- Cloudflare production deployment 조회와 이전 정상 배포 롤백
- 배포 실패, 검증 실패, 복구 성공, 복구 후 검증 실패를 구분한 상태
- macOS·Windows·Linux 설치 패키지를 만드는 Tauri 2 데스크톱 셸
- 앱 데이터 자동 저장, 원자적 파일 교체, 직전 정상 백업과 손상 원본 보존
- 단일 인스턴스, 창 상태 복원, 운영체제 파일 선택·저장 대화상자
- 독립 루트의 오프라인 웹 데모

## 데스크톱 실행과 패키징

소스에서 실행하려면 Node.js 22 이상과 Rust stable, 운영체제별 Tauri 2
빌드 도구가 필요합니다.

```bash
npm ci
npm run desktop
```

설치 패키지를 만들려면:

```bash
npm run desktop:build
```

Tauri가 현재 운영체제에 맞는 앱 번들과 설치기를 `src-tauri/target/release/bundle`
아래에 만듭니다. 공식 배포물은 플랫폼 코드 서명과 macOS 공증을 통과한
결과만 사용합니다. 자세한 절차는
[`docs/releasing.md`](./docs/releasing.md)에 있습니다.

웹 데모만 개발할 때는:

```bash
npm run dev
```

## Cloudflare companion

직접 배포와 production 복구를 개발 환경에서 사용하려면:

```bash
npx wrangler login
npm run build:web
npm run studio
```

companion이 `http://127.0.0.1:47831/`을 열면 Cloudflare 대상 연결,
배포, 공개 주소 확인과 복구를 사용할 수 있습니다. 다른 포트는
`npm run studio -- --port 47832`, 브라우저를 자동으로 열지 않으려면
`--no-open`을 사용합니다.

## Cloudflare 인증

Studio는 공식 Wrangler 인증을 그대로 사용합니다.

설치할 때 로그인하지 않았다면:

```bash
npx wrangler login
siteboard studio
```

자동화용 범위 제한 토큰을 쓰는 환경에서는:

```bash
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ACCOUNT_ID=...
siteboard studio
```

인증된 계정이 하나면 Studio가 그 계정을 선택합니다. 계정이 여러 개면
`CLOUDFLARE_ACCOUNT_ID`를 명시해야 합니다. Studio는
`wrangler auth token --json`의 결과를 rollback API 요청 메모리에서만
사용하며 출력, 브라우저 응답, 배포 이력에 기록하지 않습니다.

배포는 공식 명령과 API를 사용합니다.

- `wrangler pages project list --json`
- `wrangler pages project create <name> --production-branch main`
- `wrangler pages deploy <directory> --project-name <name> --branch main`
- `GET /accounts/{account_id}/pages/projects/{project_name}`
- `GET /accounts/{account_id}/pages/projects/{project_name}/deployments?env=production`
- `POST /accounts/{account_id}/pages/projects/{project_name}/deployments/{deployment_id}/rollback`

## 데이터와 이력

데스크톱의 현재 편집 문서, Cloudflare 연결, 편집 저장본과 마지막 배포는
`.siteboard` 작업 envelope에 함께 저장합니다. 파일을 정하기 전에는
운영체제 앱 데이터 폴더의 `autosave.siteboard`를 사용합니다. 저장할 때
임시 파일을 디스크에 동기화한 뒤 교체하며, 직전 정상 파일은
`*.backup`, 손상 원본은 앱 데이터 폴더의 `recovery/`에 보존합니다.

웹 데모는 호환을 위해 `siteboard.project.v1`과
`siteboard.project.backup.v1` 브라우저 키를 사용합니다. 기존 문서
v1·v2 키는 변경하지 않고 새 작업 형식으로 읽어 옵니다.

손상됐거나 더 최신 형식인 작업 원본은
`siteboard.project.recovery.raw`에 그대로 보존하고 사용자가 선택할
때까지 자동 저장을 멈춥니다. 기존 문서 형식의 복구 원본은
`siteboard.document.recovery.raw`에 남깁니다.

Cloudflare 배포와 복구의 원본 운영 이력은 companion이 다음
append-only JSONL 파일에 추가합니다.

```text
~/.siteboard/deployment-history.jsonl
```

테스트나 별도 작업 공간에서는 `SITEBOARD_HOME`으로 위치를 바꿀 수
있습니다. 기존 이력 행은 수정하거나 덮어쓰지 않습니다.

이미지는 프로젝트 안의 Data URL로 저장됩니다. 이미지 한 장은 800KB,
문서 전체 이미지는 1.5MB, 프로젝트 파일은 20MB까지 허용합니다.

## 보안 경계

- companion은 `127.0.0.1`에만 바인딩합니다.
- 정확한 `Host`, same-origin `Origin`, JSON Content-Type과 무작위 CSRF
  헤더를 확인합니다.
- cross-site 요청을 거절하고 API 응답에 CORS 허용 헤더를 추가하지
  않습니다.
- ZIP의 절대 경로, 역슬래시, 빈 경로 조각과 `..` 이동을 거절합니다.
- 압축 크기, 해제 후 크기와 파일 수를 제한하고 임시 폴더 밖에는 쓰지
  않습니다.
- 공개 주소 검증은 HTTPS와 공인 네트워크 주소만 허용하고 모든
  리디렉션 단계의 주소를 다시 검사합니다.
- 공개 중인 파일은 정확한 64자리 리비전 표식이 API production과
  연결될 때만 정상으로 기록합니다.
- 시작 인자로 전달한 작업 파일 내용은 브라우저에 한 번만 제공합니다.
- Wrangler 로그 정화를 켜고 오류 보고와 측정 전송을 끕니다.
- 토큰과 인증 헤더는 콘솔, 브라우저, 이력에 기록하지 않습니다.

## 웹 데모 위치

웹 데모의 기준 주소는 다음 독립 루트입니다.

```text
https://siteboard.whago.net/
```

Vite, 매니페스트, 아이콘과 서비스 워커는 `/`를 기준으로 합니다.
데스크톱 본체는 이 주소를 불러오지 않으며 번들된 로컬 화면을 사용합니다.

## ZIP 내보내기

ZIP에는 다음 파일이 들어갑니다.

- `index.html`: 반응형 CSS, 시맨틱 마크업, 검색·공유 메타데이터,
  구조화 데이터
- `assets/`: 사용자가 추가한 이미지와 Open Graph 이미지
- `favicon.*`: 로고를 추가한 경우
- `robots.txt`
- `sitemap.xml`: 공개 주소를 입력한 경우
- `README.txt`: Studio, Cloudflare Pages Direct Upload와 일반 정적
  호스팅 안내

생성된 홈페이지는 외부 JavaScript, 웹 폰트나 Siteboard 실행 코드를
불러오지 않습니다. 텍스트는 HTML 이스케이프하고 링크는 HTTP(S),
이메일, 전화, 페이지 안 앵커와 상대 경로만 허용합니다.

## 검증

```bash
npm test
npm run lint
npm run build:web
npm run desktop:check
npm run desktop:test
```

테스트는 기존 편집·복구·ZIP 기능과 함께 command runner, Cloudflare
canonical production 수렴, rollback API, 고정 배포 사전검증,
append-only 이력, ZIP 경로 traversal, localhost Host/Origin/CSRF
경계, 예약 주소와 리디렉션 차단, 브라우저 토큰 비노출,
publish→verify→history와 rollback→verify→recovery 흐름을 확인합니다.

## License

[MIT](./LICENSE)
