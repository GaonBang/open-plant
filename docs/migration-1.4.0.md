# v1.3.x → v1.4.0 마이그레이션 가이드

## 요약

v1.4.0은 **breaking change가 없는 minor 릴리스**입니다. 기존 `WsiViewerCanvas` 코드는 수정 없이 동작합니다.

핵심 변경:
- `WsiViewerCanvas`에 `@deprecated` 마킹 (향후 major에서 제거 예정)
- 새 API: `WsiViewer` + 레이어 컴포넌트 (`PointLayer`, `RegionLayer`, `DrawingLayer`, `PatchLayer`, `OverlayLayer`)
- `DrawTool` 타입 확장: `"eraser"`, `"region-brush"`, `"region-eraser"`, `{ stamp: StampToolConfig }`

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
| `pointSizeByZoom` | `pointSizeByZoom` | 초기값으로 사용됨. PointLayer에서도 설정 가능 |
| `pointStrokeScale` | `pointStrokeScale` | 〃 |
| `pointInnerFillOpacity` | `pointInnerFillOpacity` | 〃 |
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

### 아직 미지원 (WsiViewerCanvas 유지 필요)

| 기존 prop | 상태 |
|---|---|
| `onPointerWorldMove` | WsiViewer에 미구현 |
| `customLayers` | WsiViewer에 미구현 |
| `onRoiPointGroups` | 대응 레이어 없음 |
| `roiPaletteIndexToTermId` | 대응 레이어 없음 |

이 props를 사용하는 경우 해당 부분은 `WsiViewerCanvas`를 유지하거나, 향후 릴리스를 기다려야 합니다.

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

- [ ] `open-plant` 버전을 `1.4.0`으로 업데이트
- [ ] (선택) `WsiViewerCanvas`를 `WsiViewer` + 레이어 컴포넌트로 교체
- [ ] props 이름 변경 적용 (위 매핑표 참조)
- [ ] `interactionLock` prop 제거 — `DrawingLayer`가 자동 관리
- [ ] `getCellByCoordinatesRef` → `PointLayer` ref + `queryAt()` 패턴으로 변경
- [ ] `regionLabelStyle` + `resolveRegionLabelStyle` → 통합 `labelStyle` prop으로 변경
- [ ] `overviewMapConfig` 3단 중첩 → `OverviewMap` 컴포넌트 flat props로 변경
- [ ] (선택) `DrawTool` 매직 스트링 stamp → 구조화 `{ stamp: StampToolConfig }` 전환
- [ ] (선택) `DrawTool` 매핑에서 `"eraser"`, `"region-brush"`, `"region-eraser"` 활용
- [ ] `onPointerWorldMove`, `customLayers`, `onRoiPointGroups`, `roiPaletteIndexToTermId` 사용 시 `WsiViewerCanvas` 유지 확인
