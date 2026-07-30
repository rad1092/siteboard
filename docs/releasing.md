# Siteboard 데스크톱 배포

Siteboard 데스크톱 배포물은 웹 데모의 ZIP이 아니라 Tauri가 만든 운영체제
앱과 설치기입니다. 서명되지 않은 로컬 빌드를 공식 다운로드로 올리지
않습니다.

## 로컬 검증

```bash
npm ci
npm test
npm run lint
npm run build:web
npm run desktop:test
npm run desktop:build:debug
```

`desktop:build:debug`은 앱 실행과 Rust·WebView 결합을 검사하며 설치기를
만들지 않습니다. 릴리스 후보는 깨끗한 체크아웃에서 다음으로 만듭니다.

```bash
npm run desktop:build
```

## 서명 경계

- macOS: Developer ID Application 인증서로 서명하고 Apple notary service에
  제출한 뒤 staple합니다.
- Windows: 조직의 코드 서명 인증서를 CI secret store에서 주입하고
  SHA-256 timestamp를 포함합니다.
- Linux: 배포 형식별 checksum과 릴리스 서명을 함께 게시합니다.
- `CLOUDFLARE_API_TOKEN`, Apple 계정 비밀, 인증서 개인키, Tauri updater
  개인키는 소스·프로젝트 파일·앱 리소스에 넣지 않습니다.

저장소에는 공개 설정과 권한만 둡니다. 자격 증명은 릴리스 CI의 보호된
환경에서 주입하고, fork pull request에서는 패키지 서명과 배포 단계를
실행하지 않습니다.

## 업데이트 정책

현재 버전은 GitHub Releases에서 서명된 설치기를 직접 갱신하는 수동
업데이트만 지원합니다. 검증 가능한 updater endpoint와 공개키를
준비하기 전에는 자동 업데이트를 켜지 않습니다.

자동 업데이트를 추가할 때 지켜야 할 순서는 다음과 같습니다.

1. 오프라인 보관한 updater 개인키와 앱에 포함할 공개키를 생성합니다.
2. 플랫폼별 서명·공증이 끝난 앱으로 updater artifact를 만듭니다.
3. HTTPS endpoint에 서명, 버전, 플랫폼 URL, SHA-256을 게시합니다.
4. 업데이트 전 현재 `.siteboard` 파일과 앱 데이터 자동 저장본을
   동기화하고 백업합니다.
5. 마이그레이션 실패 시 기존 프로젝트를 덮어쓰지 않고 복구 원본을
   남기는 통합 시험을 통과시킵니다.

키와 endpoint가 없는 상태에서 updater 버튼이나 성공 문구를 화면에
표시하지 않습니다.

## 릴리스 확인

- 앱은 네트워크 없이 열리고 새 프로젝트를 자동 저장한다.
- `.siteboard` 더블클릭, 열기, 다른 이름 저장이 같은 문서를 연다.
- 강제 종료 후 마지막 정상 프로젝트와 창 위치를 복원한다.
- 손상된 primary를 자동 덮어쓰지 않고 `recovery/`와 `*.backup`을 남긴다.
- ZIP 결과가 브라우저 웹 데모의 ZIP 결과와 바이트 단위로 동일하다.
- Cloudflare 토큰이나 인증 헤더가 앱 번들, 로그, 프로젝트에 없다.
- macOS Gatekeeper 또는 Windows SmartScreen 서명 확인을 통과한다.
