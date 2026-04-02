# Examples Docs Plan

## 목표

`docs/` 아래에 **"examples" 페이지**를 추가해서, `src/index.ts` 기준 공개 API를 사용자가 빠르게 이해할 수 있게 만든다.

핵심 목표는 아래 3가지다.

1. `open-plant`를 처음 쓰는 사람이 `WsiViewer` 조합 방식을 바로 복붙해서 시작할 수 있어야 한다.
2. 공개 API를 "기능별로" 찾을 수 있어야 하고, 각 API마다 **무엇을 하는지 / 언제 쓰는지 / 최소 코드 예제**가 보여야 한다.
3. API가 많아도 문서가 난잡해지지 않도록, **실행 가능한 예제 중심** + **타입/보조 export 연결 방식**으로 정리한다.

## 현재 확인한 전제

- 문서 사이트는 정적 HTML이며 `docs/`를 GitHub Pages로 직접 배포한다.
- 문서 구조는 `docs/en/*.html`, `docs/ko/*.html`, 그리고 루트 redirect 페이지로 구성되어 있다.
- 네비게이션은 각 HTML 파일에 하드코딩되어 있으므로, 새 페이지를 넣으면 **기존 페이지들의 topnav/sidebar도 같이 수정**해야 한다.
- 공개 API 기준점은 `src/index.ts` 이다.
- 현재 `src/index.ts` export는 총 **151개**이며, 컴포넌트/유틸/타입/worker protocol까지 포함한다.
- 기존 샘플 코드는 `example/src/App.tsx`, `example/src/hooks/useImageLoader.ts`, `example/src/hooks/usePointLoader.ts`, `README.md`, `docs/migration-1.4.0.md` 에 이미 일부 존재한다.

## 결과물 범위

이번 작업의 결과물은 아래로 잡는다.

- `docs/examples.html`
  - `ko/examples.html`로 redirect
- `docs/ko/examples.html`
- `docs/en/examples.html`
- 기존 docs 페이지의 navigation 갱신
  - `index`
  - `getting-started`
  - `draw-and-roi`
  - `api-reference`
  - `migration-guide`
  - `contributing`
  - `architecture`
  - `deploy-github-pages`
- `docs/README.md` sync checklist 업데이트

필요하면 landing 페이지의 "추천 문서 흐름"에도 examples 링크를 추가한다.

## 문서 구조 원칙

이 페이지는 단순 API reference 복제가 아니라 **"어떻게 쓰는지 보여주는 사용 가이드"**로 구성한다.

각 섹션의 기본 포맷:

1. `What it does`
2. `When to use it`
3. `Minimal example`
4. `Related exports`
5. `Common pitfalls` 또는 `Notes`

각 예제는 가능하면 아래 기준을 지킨다.

- 복붙 가능한 짧은 TypeScript/React 예제
- 실제 export 이름을 그대로 사용
- 가능하면 예제 앱 코드와 동일한 패턴 사용
- 타입만 export되는 항목도 예제 객체/함수 시그니처 안에서 등장시키기

## API 커버리지 전략

`src/index.ts` export 151개를 모두 동일한 깊이로 설명하면 문서가 무거워진다. 그래서 아래처럼 나눈다.

### 1. Primary Example

사용자가 직접 호출하거나 JSX에 바로 쓰는 런타임 API.

예:

- `WsiViewer`
- `PointLayer`
- `HeatmapLayer`
- `RegionLayer`
- `DrawingLayer`
- `PatchLayer`
- `OverlayLayer`
- `OverviewMap`
- `useViewerContext`
- `normalizeImageInfo`
- `normalizeImageClasses`
- `buildClassPalette`
- `filterPointDataByPolygons`
- `filterPointDataByPolygonsInWorker`
- `filterPointDataByPolygonsHybrid`
- `buildPointSpatialIndexAsync`
- `computeRoiPointGroups`
- `createSpatialIndex`
- `parseWkt`
- `toRoiGeometry`
- `getWebGpuCapabilities`
- `WsiTileRenderer`
- `TileScheduler`
- `TileViewerCanvas`
- `DrawLayer`
- `createRectangle`
- `createCircle`
- `closeRing`

이 그룹은 각각 최소 1개 이상의 코드 블록을 가진다.

### 2. Companion Export

주요 예제를 이해할 때 같이 봐야 하는 타입/이벤트/설정 객체.

예:

- `WsiViewerProps`
- `WsiImageSource`
- `WsiViewState`
- `WsiImageColorSettings`
- `PointLayerProps`
- `PointSizeByZoom`
- `PointHoverEvent`
- `PointClickEvent`
- `RegionLayerProps`
- `DrawResult`
- `PatchDrawResult`
- `StampOptions`
- `BrushOptions`
- `OverviewMapOptions`
- `TileSchedulerOptions`
- `WsiTileRendererOptions`

이 그룹은 단독 장문 설명 대신, **관련 Primary Example 바로 아래에서 함께 설명**한다.

### 3. Appendix / Advanced Index

직접 호출 빈도는 낮지만 공개 API인 항목.

예:

- worker protocol 타입들
- spatial index 타입들
- WKT result 타입들
- raw payload 타입들
- `lookupCellIndex`
- `terminateRoiClipWorker`
- `terminatePointHitIndexWorker`
- `prefilterPointsByBoundsWebGpu`
- `M1TileRenderer`
- `DEFAULT_POINT_COLOR`
- `__heatmapLayerInternals`

이 그룹은 페이지 하단에 **"Advanced exports"** 또는 **"Export coverage index"**로 모아 둔다.

`__heatmapLayerInternals`는 내부 성격이 강하므로, examples 본문에서는 적극 권장하지 않고 "internal/debug only"로 표시한다.

## 페이지 IA 제안

examples 페이지는 아래 순서가 적절하다.

### 1. Quick Start Composition

가장 먼저 보여줄 복붙용 예제.

- `WsiViewer`
- `PointLayer`
- `RegionLayer`
- `DrawingLayer`
- `OverlayLayer`
- `PatchLayer`

목표:

- 사용자가 라이브러리의 기본 composition 모델을 30초 안에 이해하게 한다.

### 2. Image Source Setup

이미지 메타데이터와 인증 처리.

- `normalizeImageInfo`
- `normalizeImageClasses`
- `toTileUrl`
- `toBearerToken`
- 관련 타입: `RawImagePayload`, `RawImsInfo`, `RawWsiClass`, `WsiImageSource`, `WsiClass`

### 3. Point Rendering

포인트 로딩과 렌더링.

- `PointLayer`
- `buildClassPalette`
- `DEFAULT_POINT_COLOR`
- `PointQueryHandle`
- 이벤트 타입들
- `PointSizeByZoom`
- `WsiPointData`

### 4. ROI / Region Rendering

- `RegionLayer`
- `WsiRegion`
- `WsiRegionCoordinates`
- `RegionStrokeStyle`
- `RegionLabelStyle`
- `RegionHoverEvent`
- `RegionClickEvent`

### 5. Drawing / Brush / Stamp

- `DrawingLayer`
- `DrawLayer`
- `createRectangle`
- `createCircle`
- `closeRing`
- `BrushOptions`
- `StampOptions`
- `DrawTool`
- `DrawIntent`
- `DrawResult`
- `PatchDrawResult`

### 6. Heatmap

- `HeatmapLayer`
- `HeatmapPointData`
- `HeatmapLayerStats`
- `HeatmapKernelScaleMode`

### 7. Overlay / Viewer Context / Overview Map

- `OverlayLayer`
- `useViewerContext`
- `ViewerContextValue`
- `OverviewMap`
- `OverviewMapOptions`
- `OverviewMapPosition`
- `ViewportBorderStyle`

### 8. Point Clipping Modes

- `filterPointDataByPolygons`
- `filterPointIndicesByPolygons`
- `filterPointDataByPolygonsInWorker`
- `filterPointIndicesByPolygonsInWorker`
- `filterPointDataByPolygonsHybrid`
- `terminateRoiClipWorker`
- `PointClipMode`
- 결과/메타 타입들
- worker protocol 타입들

이 섹션은 `sync` / `worker` / `hybrid-webgpu` 차이를 표로 같이 정리한다.

### 9. Point Hit Index

- `buildPointSpatialIndexAsync`
- `lookupCellIndex`
- `terminatePointHitIndexWorker`
- `FlatPointSpatialIndex`
- worker protocol 타입들

### 10. ROI Geometry / Stats / Parsing

- `toRoiGeometry`
- `computeRoiPointGroups`
- `parseWkt`
- `createSpatialIndex`
- 관련 타입들

### 11. Low-Level Runtime

상위 React API가 아니라 직접 엔진 레벨로 붙고 싶은 사용자를 위한 섹션.

- `WsiTileRenderer`
- `TileScheduler`
- `TileViewerCanvas`
- `M1TileRenderer`
- `getWebGpuCapabilities`
- `prefilterPointsByBoundsWebGpu`

### 12. Export Coverage Index

`src/index.ts` export 이름을 전부 표로 나열하고, 각각 아래를 붙인다.

- category
- 문서 섹션 anchor
- status: `example`, `companion`, `advanced`

이 표가 있어야 "하나하나 다 적혀 있냐?"에 대해 문서 수준에서 명확히 답할 수 있다.

## 구현 단계

### Phase 1. Export Inventory 확정

- `src/index.ts` export 전체 목록을 기준으로 문서 대상 표를 만든다.
- export를 `component / function / hook / type / internal / advanced`로 분류한다.
- 각 export가 어느 examples 섹션에 들어갈지 매핑한다.

산출물:

- examples 페이지 작성용 내부 checklist
- 최종 문서 하단의 export coverage index

### Phase 2. Examples Page 골격 추가

- `docs/examples.html` redirect 생성
- `docs/ko/examples.html` 작성
- `docs/en/examples.html` 작성
- `data-page="examples"` 기준 active nav 동작 확인

참고:

- `docs/assets/site.js`는 `data-page` 값만 맞으면 active nav 처리가 가능하다.

### Phase 3. 공통 네비게이션 반영

- 모든 EN/KO 문서 상단 nav에 `Examples` 추가
- sidebar에도 examples 링크 추가
- landing 페이지 추천 문서 흐름에 examples 삽입

목표:

- examples 페이지가 문서 흐름 안에 자연스럽게 들어가게 한다.

### Phase 4. 핵심 예제 작성

우선순위는 아래 순서.

1. `WsiViewer` composition
2. image source normalization
3. point rendering + palette
4. region + drawing
5. heatmap
6. overlay/context/overview map
7. clipping / worker / webgpu
8. low-level runtime

각 예제는 가능한 한 기존 샘플 앱에서 검증된 패턴을 재사용한다.

### Phase 5. Appendix / Coverage 정리

- 모든 타입 export를 관련 섹션에 연결
- low-level/internal export는 하단 appendix에 명시
- 누락 export가 없도록 `src/index.ts`와 대조

### Phase 6. 문서 동기화 및 검수

- `docs/README.md` checklist에 examples 페이지 추가
- EN/KO 정보량 동등성 확인
- 로컬 preview로 링크/복사 버튼/anchor 확인

## 예제 작성 기준

예제는 아래 스타일을 유지한다.

- "작동 개념"보다 "바로 쓸 수 있는 코드"를 우선한다.
- 긴 예제 1개보다, 짧은 예제 여러 개로 나눈다.
- props 나열만 하지 말고, 왜 그 값을 쓰는지 한 줄로 설명한다.
- 이벤트 payload는 실제 타입 이름을 같이 써 준다.
- advanced 기능은 "언제 쓰지 말아야 하는지"도 적는다.

## 재사용할 기존 소스

우선 재사용 후보:

- `example/src/App.tsx`
  - `WsiViewer` composition
  - `PointLayer`, `HeatmapLayer`, `RegionLayer`, `DrawingLayer`, `OverlayLayer`, `PatchLayer`, `OverviewMap`
- `example/src/hooks/useImageLoader.ts`
  - `normalizeImageInfo`, `normalizeImageClasses`
- `example/src/hooks/usePointLoader.ts`
  - `buildClassPalette`, `WsiPointData`
- `README.md`
  - 빠른 시작 코드와 기능 설명
- `docs/migration-1.4.0.md`
  - 레거시 → composition API 변환 예제

## 리스크와 대응

### 리스크 1. 문서가 너무 길어질 수 있음

대응:

- examples 본문은 workflow 중심으로 유지
- 타입 상세는 companion 방식으로 접기
- 하단 coverage index로 completeness를 확보

### 리스크 2. API 변경 시 examples 페이지가 쉽게 낡음

대응:

- `src/index.ts` 기준으로 checklist 유지
- `docs/README.md` sync checklist에 examples 추가
- 가능하면 export coverage index를 마지막 검수 기준으로 사용

### 리스크 3. internal 성격 export 노출이 혼란을 줄 수 있음

대응:

- `__heatmapLayerInternals` 같은 항목은 `internal/debug only` 라벨 명시
- 추천 경로와 비추천 경로를 구분

## 완료 기준

아래 조건을 만족하면 examples 문서 작업 완료로 본다.

1. `docs/examples.html`, `docs/ko/examples.html`, `docs/en/examples.html`가 존재한다.
2. 기존 문서 네비게이션에서 examples 페이지로 이동할 수 있다.
3. `src/index.ts` export 전체가 examples 본문 또는 coverage index에서 최소 1회 이상 언급된다.
4. 핵심 런타임 API는 모두 최소 코드 예제를 가진다.
5. EN/KO 페이지가 같은 구조와 같은 의미를 유지한다.
6. `docs/README.md`에 examples 동기화 규칙이 반영된다.

## 구현 순서 제안

실제 작업은 아래 순서로 진행하는 것이 가장 안전하다.

1. export coverage 표 초안 생성
2. KO examples 페이지 먼저 작성
3. EN examples 페이지 동등 변환
4. redirect + nav 반영
5. checklist 업데이트
6. 링크/anchor/문구 검수

## 비고

이 문서의 기준점은 "예제 페이지 1개로 공개 API 전체를 직관적으로 이해시키는 것"이다.

즉, 단순히 API reference를 더 길게 쓰는 게 아니라:

- 먼저 복붙 가능한 사용 예제를 보여 주고
- 그 예제 아래에서 관련 타입과 보조 함수를 묶어서 설명하고
- 마지막에 export coverage index로 완전성을 보장하는 방향으로 간다.
