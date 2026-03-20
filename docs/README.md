# Open Plant WSI Docs

정적 문서 사이트입니다. GitHub Pages에서 `docs/` 디렉토리를 직접 배포합니다.

문서 기준 패키지 버전: **open-plant 1.4.4** (`WsiViewer` + 레이어 API, `WsiViewerCanvas` 미포함).

## Language Structure

- `index.html`: 언어 선택 랜딩 (`/en`, `/ko`)
- `en/`: English documentation
- `ko/`: 한국어 문서
- `en/migration-guide.html`, `ko/migration-guide.html`: API 수명주기/마이그레이션 기준
- `en/contributing.html`, `ko/contributing.html`: 오픈소스 기여 워크플로우/품질 게이트
- `assets/site.css`: 공통 스타일
- `assets/site.js`: 공통 스크립트

## Local Preview

```bash
cd docs
python3 -m http.server 4173
```

브라우저에서 `http://localhost:4173` 접속.

## Deploy

- 워크플로우: `.github/workflows/docs-pages.yml`
- GitHub Settings > Pages > Source를 `GitHub Actions`로 설정

## Release Gate

- 워크플로우: `.github/workflows/release-gate.yml`
- 로컬 검증: `npm run release:gate` (`typecheck` + `test:ws9` + `build:lib`)
- publish 훅: `prepublishOnly`에서 release gate 강제 실행

## Documentation Sync Checklist

- `src/index.ts` export 추가/변경 시:
  - `README.md`
  - `docs/en/api-reference.html`
  - `docs/ko/api-reference.html`
- 상호작용 동작 변경(ROI hit-test, draw intent, brush/cursor UX 등) 시:
  - `docs/en/draw-and-roi.html`
  - `docs/ko/draw-and-roi.html`
  - 필요 시 `docs/en/architecture.html`, `docs/ko/architecture.html`
- 카메라/줌 동작 변경(`min/maxZoom`, `viewTransition`, `zoomSnaps` 등) 시:
  - `docs/en/api-reference.html`
  - `docs/ko/api-reference.html`
  - `docs/en/getting-started.html`
  - `docs/ko/getting-started.html`
- 뷰어 기본 설정/빠른 시작 흐름 변경 시:
  - `docs/en/getting-started.html`
  - `docs/ko/getting-started.html`
- 릴리스 노트 동기화:
  - `CHANGELOG.md` (`Unreleased` 포함)
  - `README.md` (Features / API 섹션)
- EN/KO 페이지는 기능 단위로 동등한 정보가 유지되어야 합니다.
