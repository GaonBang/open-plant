# v1.3.x → v1.4.x 마이그레이션 가이드 (현재 패키지: **1.4.10**)

## v1.4.4 — Breaking: `WsiViewerCanvas` 제거

**`WsiViewerCanvas`와 `WsiViewerCanvasProps`는 npm 패키지 `open-plant@1.4.4`부터 더 이상 export되지 않습니다.**

현재 패키지 `open-plant@1.4.10`도 동일하게 `WsiViewerCanvas`를 포함하지 않습니다.

- 신규/업그레이드 프로젝트: 아래 **`WsiViewer` + 레이어** 조합으로 이전하세요.
- 당분간 단일 컴포넌트 API가 필요하면: `package.json`에서 `open-plant`를 **`1.4.3` 이하**로 고정하거나, 저장소 히스토리에서 컴포넌트를 벤더링합니다.

## v1.4.0 요약 (히스토리)

v1.4.0에서 컴포지션 API가 도입되었고, 당시에는 `WsiViewerCanvas`가 deprecated 상태로 **동시에 제공**되었습니다.

핵심 변경 (v1.4.0):
- 새 API: `WsiViewer` + 레이어 (`PointLayer`, `RegionLayer`, `DrawingLayer`, `PatchLayer`, `OverlayLayer`)
- `DrawTool` 타입 확장: `"eraser"`, `"region-brush"`, `"region-eraser"`, `{ stamp: StampToolConfig }` 등

---

## Props 매핑표

`WsiViewerCanvasProps`의 모든 props가 어떤 컴포넌트의 어떤 prop으로 이동하는지 정리합니다.

### WsiViewer

| 기존 (WsiViewerCanvas) | 신규 (WsiViewer) | 비고 |
|---|---|---|
| `source` | `source` | |
| `viewState` | `viewState` | |
| `onViewStateChange` | `onViewStateChange` | |
| `onStats` | `onStats` | |
| `onTileError` | `onTileError` | |
| `onContextLost` | `onContextLost` | |
| `onContextRestored` | `onContextRestored` | |
| `imageColorSettings` | `imageColorSettings` | |
| `fitNonce` | `fitNonce` | |
| `rotationResetNonce` | `rotationResetNonce` | |
| `authToken` | `authToken` | |
| `ctrlDragRotate` | `ctrlDragRotate` | |
| `minZoom` | `minZoom` | |
| `maxZoom` | `maxZoom` | |
| `viewTransition` | `viewTransition` | |
| `zoomSnaps` | `zoomSnaps` | |
| `zoomSnapFitAsMin` | `zoomSnapFitAsMin` | |
| — | `panExtent` | 현재 1.4.x에서 이미지 바깥 drag 허용 범위를 제어하는 신규 prop |
| `onPointerWorldMove` | `onPointerWorldMove` | |
| `debugOverlay` | `debugOverlay` | |
| `debugOverlayStyle` | `debugOverlayStyle` | |
| `className` | `className` | |
| `style` | `style` | |

### PointLayer

| 기존 (WsiViewerCanvas) | 신규 (PointLayer) | 비고 |
|---|---|---|
| `pointData` | `data` | |
| `pointPalette` | `palette` | |
| `pointSizeByZoom` | `sizeByZoom` | 런타임 변경용 |
| `pointStrokeScale` | `strokeScale` | |
| `pointInnerFillOpacity` | `innerFillOpacity` | |
| `clipPointsToRois` | `clipEnabled` | |
| `clipMode` | `clipMode` | |
| `onClipStats` | `onClipStats` | |
| `onPointHover` | `onHover` | |
| `onPointClick` | `onClick` | |
| `roiRegions` (클리핑용) | `clipToRegions` | 신규 prop. 클리핑 대상 리전을 명시적으로 전달 |

### RegionLayer

| 기존 (WsiViewerCanvas) | 신규 (RegionLayer) | 비고 |
|---|---|---|
| `roiRegions` | `regions` | |
| `roiPolygons` | `polygons` | |
| `regionStrokeStyle` | `strokeStyle` | |
| `regionStrokeHoverStyle` | `hoverStrokeStyle` | |
| `regionStrokeActiveStyle` | `activeStrokeStyle` | |
| `resolveRegionStrokeStyle` | `resolveStrokeStyle` | |
| `regionLabelStyle` | `labelStyle` | `Partial<RegionLabelStyle>` 또는 `RegionLabelStyleResolver` 통합 |
| `resolveRegionLabelStyle` | `labelStyle` | 함수를 전달하면 resolver로 동작 |
| `regionLabelAnchor` | `labelAnchor` | |
| `autoLiftRegionLabelAtMaxZoom` | `autoLiftLabelAtMaxZoom` | |
| `clampRegionLabelToViewport` | `clampLabelToViewport` | |
| `activeRegionId` | `activeRegionId` | |
| `onActiveRegionChange` | `onActiveChange` | |
| `onRegionHover` | `onHover` | |
| `onRegionClick` | `onClick` | |

### DrawingLayer

| 기존 (WsiViewerCanvas) | 신규 (DrawingLayer) | 비고 |
|---|---|---|
| `drawTool` | `tool` | |
| `stampOptions` | `stampOptions` | |
| `brushOptions` | `brushOptions` | |
| `drawFillColor` | `fillColor` | |
| `drawAreaTooltip` | `areaTooltip` | |
| `onDrawComplete` | `onComplete` | |
| `onPatchComplete` | `onPatchComplete` | |

### PatchLayer

| 기존 (WsiViewerCanvas) | 신규 (PatchLayer) | 비고 |
|---|---|---|
| `patchRegions` | `regions` | |
| `patchStrokeStyle` | `strokeStyle` | |

### OverlayLayer

| 기존 (WsiViewerCanvas) | 신규 (OverlayLayer) | 비고 |
|---|---|---|
| `overlayShapes` | `shapes` | |

### 제거된 Props

| 기존 prop | 대체 방법 |
|---|---|
| `interactionLock` | `DrawingLayer`가 `tool !== "cursor"`일 때 자동 관리 |
| `getCellByCoordinatesRef` | `PointLayer`에 `ref` 전달 → `ref.current.queryAt(coordinate)` |

### 현재도 1:1 대체 없음 (앱 쪽에서 조합)

| 기존 prop | 대안 (current 1.4.x) |
|---|---|
| `customLayers` | `useViewerContext()` + 호스트 React 오버레이 (`worldToScreen` 등) |
| `onRoiPointGroups` / `roiPaletteIndexToClassId` | `computeRoiPointGroups(pointData, regions, options)` 를 뷰어 밖에서 호출 |

`WsiViewerCanvas`는 패키지에서 제거되었으므로, 위 기능은 **반드시** 새 API 또는 유틸로 이전해야 합니다.

---

## Before / After 코드 예시

### 1. 기본 뷰어

**Before (v1.3.x)**

```tsx
import { WsiViewerCanvas } from "open-plant";

function Viewer({ source, viewState, onViewStateChange }) {
  return (
    <WsiViewerCanvas
      source={source}
      viewState={viewState}
      onViewStateChange={onViewStateChange}
      className="viewer"
    />
  );
}
```

**After (v1.4.0)**

```tsx
import { WsiViewer } from "open-plant";

function Viewer({ source, viewState, onViewStateChange }) {
  return (
    <WsiViewer
      source={source}
      viewState={viewState}
      onViewStateChange={onViewStateChange}
      className="viewer"
    />
  );
}
```

### 2. 포인트 렌더링 + 클리핑

**Before**

```tsx
<WsiViewerCanvas
  source={source}
  viewState={viewState}
  onViewStateChange={onViewStateChange}
  pointData={pointData}
  pointPalette={palette}
  pointSizeByZoom={sizeByZoom}
  pointStrokeScale={0.3}
  pointInnerFillOpacity={0.6}
  roiRegions={regions}
  clipPointsToRois={true}
  clipMode="worker"
  onClipStats={handleClipStats}
  onPointHover={handlePointHover}
  onPointClick={handlePointClick}
/>
```

**After**

```tsx
<WsiViewer source={source} viewState={viewState} onViewStateChange={onViewStateChange}>
  <PointLayer
    data={pointData}
    palette={palette}
    sizeByZoom={sizeByZoom}
    strokeScale={0.3}
    innerFillOpacity={0.6}
    clipEnabled={true}
    clipToRegions={regions}
    clipMode="worker"
    onClipStats={handleClipStats}
    onHover={handlePointHover}
    onClick={handlePointClick}
  />
</WsiViewer>
```

### 3. ROI 드로잉 + 리전 라벨

**Before**

```tsx
<WsiViewerCanvas
  source={source}
  viewState={viewState}
  onViewStateChange={onViewStateChange}
  roiRegions={regions}
  regionStrokeStyle={{ color: "#ff4d4f", width: 2 }}
  regionStrokeHoverStyle={{ color: "#ff7875" }}
  regionStrokeActiveStyle={{ color: "#f5222d", width: 3 }}
  regionLabelStyle={{ fontSize: 12, backgroundColor: "#FFCC00" }}
  regionLabelAnchor="top-center"
  autoLiftRegionLabelAtMaxZoom={true}
  clampRegionLabelToViewport={true}
  activeRegionId={activeId}
  onActiveRegionChange={setActiveId}
  onRegionHover={handleRegionHover}
  drawTool={drawTool}
  interactionLock={drawTool !== "cursor"}
  drawFillColor="rgba(255, 77, 79, 0.16)"
  onDrawComplete={handleDraw}
/>
```

**After**

```tsx
<WsiViewer source={source} viewState={viewState} onViewStateChange={onViewStateChange}>
  <RegionLayer
    regions={regions}
    strokeStyle={{ color: "#ff4d4f", width: 2 }}
    hoverStrokeStyle={{ color: "#ff7875" }}
    activeStrokeStyle={{ color: "#f5222d", width: 3 }}
    labelStyle={{ fontSize: 12, backgroundColor: "#FFCC00" }}
    labelAnchor="top-center"
    autoLiftLabelAtMaxZoom={true}
    clampLabelToViewport={true}
    activeRegionId={activeId}
    onActiveChange={setActiveId}
    onHover={handleRegionHover}
  />
  {drawTool !== "cursor" && (
    <DrawingLayer
      tool={drawTool}
      fillColor="rgba(255, 77, 79, 0.16)"
      onComplete={handleDraw}
    />
  )}
</WsiViewer>
```

`interactionLock`을 직접 관리할 필요 없음 — `DrawingLayer`가 `tool !== "cursor"`일 때 자동으로 interaction lock을 설정합니다.

### 4. 전체 구성 (overview map 포함)

**Before**

```tsx
<WsiViewerCanvas
  source={source}
  viewState={viewState}
  onViewStateChange={onViewStateChange}
  authToken={authToken}
  imageColorSettings={colorSettings}
  pointData={pointData}
  pointPalette={palette}
  pointSizeByZoom={sizeByZoom}
  roiRegions={regions}
  clipPointsToRois={true}
  onPointHover={handlePointHover}
  regionStrokeStyle={strokeStyle}
  regionLabelStyle={labelStyle}
  activeRegionId={activeId}
  onActiveRegionChange={setActiveId}
  patchRegions={patches}
  patchStrokeStyle={patchStroke}
  overlayShapes={overlays}
  drawTool={drawTool}
  interactionLock={drawTool !== "cursor"}
  brushOptions={brushOpts}
  onDrawComplete={handleDraw}
  overviewMapConfig={{
    show: showOverview,
    options: { width: 200, height: 125, position: "top-right", onClose: () => setShowOverview(false) },
    style: { top: 20, right: 20 },
  }}
/>
```

**After**

```tsx
<WsiViewer
  source={source}
  viewState={viewState}
  onViewStateChange={onViewStateChange}
  authToken={authToken}
  imageColorSettings={colorSettings}
>
  <PointLayer
    data={pointData}
    palette={palette}
    sizeByZoom={sizeByZoom}
    clipEnabled={true}
    clipToRegions={regions}
    onHover={handlePointHover}
  />
  <RegionLayer
    regions={regions}
    strokeStyle={strokeStyle}
    labelStyle={labelStyle}
    activeRegionId={activeId}
    onActiveChange={setActiveId}
  />
  <PatchLayer regions={patches} strokeStyle={patchStroke} />
  <OverlayLayer shapes={overlays} />
  {drawTool !== "cursor" && (
    <DrawingLayer tool={drawTool} brushOptions={brushOpts} onComplete={handleDraw} />
  )}
  {showOverview && (
    <OverviewMap
      source={source}
      projectorRef={rendererRef}
      authToken={authToken}
      width={200}
      height={125}
      position="top-right"
      onClose={() => setShowOverview(false)}
      style={{ top: 20, right: 20 }}
    />
  )}
</WsiViewer>
```

`overviewMapConfig`의 3단 중첩 객체 → `OverviewMap` 컴포넌트의 flat props로 변환됩니다.
`OverviewMap`에 `source`, `projectorRef`, `authToken`을 직접 전달해야 합니다. `projectorRef`는 `useViewerContext()`에서 `rendererRef`를 가져와 사용합니다.

### 5. getCellByCoordinatesRef → PointQueryHandle

**Before**

```tsx
import { useRef } from "react";
import type { PointHitEvent, DrawCoordinate } from "open-plant";

const getCellByCoordinatesRef = useRef<((coord: DrawCoordinate) => PointHitEvent | null) | null>(null);

<WsiViewerCanvas
  source={source}
  pointData={pointData}
  pointPalette={palette}
  getCellByCoordinatesRef={getCellByCoordinatesRef}
/>

// 사용
const hit = getCellByCoordinatesRef.current?.([worldX, worldY]);
```

**After**

```tsx
import { useRef } from "react";
import type { PointQueryHandle } from "open-plant";

const pointLayerRef = useRef<PointQueryHandle>(null);

<WsiViewer source={source}>
  <PointLayer ref={pointLayerRef} data={pointData} palette={palette} />
</WsiViewer>

// 사용
const hit = pointLayerRef.current?.queryAt([worldX, worldY]);
```

---

## DrawTool 타입 변경

### 기존 타입 (v1.3.x, 하위호환 유지)

```ts
type DrawTool = "cursor" | "freehand" | "rectangle" | "circular" | "brush" | StampDrawTool;
```

### 신규 타입 (v1.4.0)

```ts
type StampShape = "rectangle" | "circle";

interface StampToolConfig {
  shape: StampShape;
  areaMm2?: number;
  pixelSize?: number;
}

type DrawTool =
  | "cursor"
  | "freehand"
  | "rectangle"
  | "circular"
  | "brush"
  | "eraser"          // 신규
  | "region-brush"    // 신규
  | "region-eraser"   // 신규
  | StampDrawTool
  | { stamp: StampToolConfig };  // 신규 구조화 stamp
```

### 매직 스트링 stamp → 구조화 stamp 전환

기존 매직 스트링은 하위호환을 위해 유지되지만, 신규 코드에서는 구조화 타입을 권장합니다.

| 기존 (매직 스트링) | 신규 (구조화) |
|---|---|
| `"stamp-circle"` | `{ stamp: { shape: "circle" } }` |
| `"stamp-rectangle"` | `{ stamp: { shape: "rectangle" } }` |
| `"stamp-circle-hpf-0.2mm2"` | `{ stamp: { shape: "circle", areaMm2: 0.2 } }` |
| `"stamp-circle-2mm2"` | `{ stamp: { shape: "circle", areaMm2: 2 } }` |
| `"stamp-rectangle-2mm2"` | `{ stamp: { shape: "rectangle", areaMm2: 2 } }` |
| `"stamp-rectangle-4096px"` | `{ stamp: { shape: "rectangle", pixelSize: 4096 } }` |

구조화 stamp의 장점:
- 오타가 컴파일 타임에 잡힘
- `areaMm2`, `pixelSize`를 자유롭게 지정 가능 (사전 정의된 값에 제한 없음)
- IDE 자동완성 지원

### 소비자 앱의 DrawTool 매핑 개선 예시

**Before (v1.3.x)** — brush 하나에 여러 의미 매핑

```ts
function drawTypeToOpenPlantTool(drawType: DrawType): DrawTool {
  switch (drawType) {
    case DrawType.Eraser:
    case DrawType.Brush:
    case DrawType.RegionBrush:
    case DrawType.RegionEraser:
      return "brush";
    case DrawType.Point:
      return "cursor";
    default:
      return "cursor";
  }
}
```

**After (v1.4.0)** — 1:1 매핑

```ts
function drawTypeToOpenPlantTool(drawType: DrawType): DrawTool {
  switch (drawType) {
    case DrawType.Eraser:
      return "eraser";
    case DrawType.Brush:
      return "brush";
    case DrawType.RegionBrush:
      return "region-brush";
    case DrawType.RegionEraser:
      return "region-eraser";
    case DrawType.Point:
      return "cursor";
    default:
      return "cursor";
  }
}
```

---

## regionLabelStyle 통합

v1.3.x에서는 정적 스타일과 동적 resolver를 별도 prop으로 전달해야 했습니다.

**Before**

```tsx
<WsiViewerCanvas
  regionLabelStyle={{ fontSize: 12 }}
  resolveRegionLabelStyle={({ region, zoom }) => ({
    backgroundColor: region.label?.includes("tumor") ? "#ff4d4f" : "#FFCC00",
  })}
/>
```

**After** — `labelStyle` 하나로 통합

정적 스타일 객체를 전달하면 정적 스타일로 동작하고, 함수를 전달하면 resolver로 동작합니다.

```tsx
// 정적 스타일만 사용
<RegionLayer labelStyle={{ fontSize: 12 }} />

// 동적 resolver 사용
<RegionLayer
  labelStyle={({ region, zoom }) => ({
    fontSize: 12,
    backgroundColor: region.label?.includes("tumor") ? "#ff4d4f" : "#FFCC00",
  })}
/>
```

---

## useViewerContext

레이어 컴포넌트 외부에서 렌더러에 접근해야 하는 경우 `useViewerContext()` 훅을 사용합니다.

```tsx
import { useViewerContext } from "open-plant";

function MyCustomOverlay() {
  const { rendererRef, worldToScreen, screenToWorld } = useViewerContext();

  // rendererRef.current로 WsiTileRenderer에 직접 접근
  // worldToScreen / screenToWorld로 좌표 변환
  return <div>...</div>;
}
```

`useViewerContext()`는 반드시 `<WsiViewer>` 내부에서 호출해야 합니다. 그렇지 않으면 에러를 throw합니다.

---

## 마이그레이션 체크리스트

- [ ] `open-plant`를 **`1.4.10`**(또는 원하는 최신)로 업데이트
- [ ] **`WsiViewerCanvas` import 제거** → `WsiViewer` + `PointLayer` / `RegionLayer` / `DrawingLayer` 등으로 교체
- [ ] props 이름 변경 적용 (위 매핑표 참조)
- [ ] `interactionLock` 제거 — `DrawingLayer`가 `tool !== "cursor"`일 때 자동 처리
- [ ] `getCellByCoordinatesRef` → `PointLayer` ref + `queryAt()` 로 변경
- [ ] `regionLabelStyle` + `resolveRegionLabelStyle` → `RegionLayer`의 통합 `labelStyle` 로 변경
- [ ] `overviewMapConfig` → 별도 `<OverviewMap projectorRef={...} invalidateRef={...} />` 패턴
- [ ] (선택) `DrawTool` stamp 문자열 → `{ stamp: StampToolConfig }`
- [ ] `customLayers` → `useViewerContext` 기반 호스트 오버레이
- [ ] `onRoiPointGroups` → `computeRoiPointGroups()` 호출로 대체
