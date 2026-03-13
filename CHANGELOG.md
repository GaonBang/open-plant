# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Web Worker 기반 포인트 공간 인덱스 빌드 (`point-hit-index-worker`). 메인 스레드 ~175ms 블로킹 제거.
- `FlatPointSpatialIndex` flat typed array 자료구조 + open-addressing hash table lookup.
- `buildPointSpatialIndexAsync()`, `lookupCellIndex()`, `terminatePointHitIndexWorker()` public API.
- 인접 tier (T±1) 타일 prefetch: 빠른 줌 시 blank frame 감소.
- `getVisibleTilesForTier(tier)` public method on `WsiTileRenderer`.
- 배율 스냅 줌 API: `zoomSnaps`, `zoomSnapFitAsMin` (`WsiViewerCanvas`/`WsiTileRenderer`).
- `WsiTileRenderer.getViewBounds()` public method.
- 최적화 리포트: `perf-optimization-report.md`.

### Changed
- `pointHitIndex` 빌드가 `useMemo` (동기) → `useEffect` + `useState` (비동기 워커)로 전환.
- 워커 인덱스 알고리즘: nested `Map` → 4-pass counting sort (GC-free, typed arrays only).
- 워커 프로토콜: positions/ids를 워커가 반환하지 않음 — 메인 스레드가 원본 참조 (전송량 ~120MB → ~48MB).
- `getCellByCoordinates` 내부 lookup: nested `Map.get()` → `Int32Array` hash table O(1).
- 타일 스케줄링: 현재 tier 외 인접 tier 타일을 `distance2` 페널티 기반 낮은 우선순위로 포함.
- 내부 perf logging (`logPerf`, `shouldLogPerf`, `PERF_LOG_*`) 제거.
- Overview map viewport 인디케이터 렌더 경로 개선: `getViewBounds`가 없어도 `getViewCorners`만으로 현재 뷰포트 표시 가능.
- Overview map 기본 viewport border 색상을 고대비 주황 계열로 조정.

### Docs
- `performance-optimization.md` 업데이트: 워커 인덱스, prefetch, flat hash 내용 추가.
- `README.md` 프로젝트 구조: 워커/클라이언트 파일 반영.
- `README.md` API/props 섹션을 현재 export/동작 기준으로 정리(중복 제거 포함).
- EN/KO API reference와 Getting Started에 `zoomSnaps`, `zoomSnapFitAsMin`, `pointInnerFillOpacity`, `regionLabelAnchor`, `clampRegionLabelToViewport` 반영.

## [1.2.4] - 2026-02-25

### Added
- Point hit-test API on `WsiViewerCanvas`: `onPointHover`, `onPointClick`, and `getCellByCoordinatesRef`.
- Point hit event payload types: `PointHitEvent`, `PointHoverEvent`, `PointClickEvent` (including mouse button for context-menu flows).
- Optional point id channel on `WsiPointData` via `ids?: Uint32Array`.
- `pointSizeByZoom` customization for zoom-based point-size stops with linear interpolation.
- `PointSizeByZoom` and `BrushOptions` public type exports.
- Brush ROI draw tool (`drawTool: "brush"`) with configurable preview/cursor styling and polygon generation.
- New brush geometry builder utility: `src/wsi/brush-stroke.ts`.

### Changed
- Default high-zoom point-size profile is larger (improved readability at max zoom).
- Point clipping pipelines (`sync`, `worker`, `hybrid-webgpu`) now preserve `ids` through filtered outputs.
- Worker protocol/client now transfer `ids` buffers alongside point position/palette buffers when provided.
- Viewer point pick path now uses a spatial grid index and zoom-aware hit radius derived from rendered point size.
- Example app now demonstrates:
  - Right-click cell context alert via `onPointClick`.
  - Hover/click point debug state rendering.
  - Brush tool controls (`radius`, `opacity`, preview mode).
  - External point-size tuning via `pointSizeByZoom`.

### Docs
- Updated `README.md` feature table and usage example for `pointSizeByZoom` and point hit-test APIs.
- Updated EN/KO API reference docs for:
  - `pointSizeByZoom`
  - `onPointHover`, `onPointClick`, `getCellByCoordinatesRef`
  - `WsiPointData.ids`

### Tests
- Added unit test coverage for `filterPointDataByPolygons` to verify `ids` are preserved for surviving points.

## [1.2.2] - 2026-02-25

### Added
- Camera rotation support in `WsiViewState` via `rotationDeg`.
- `Ctrl/Cmd + drag` rotation input path with configurable renderer option.
- `rotationResetNonce` and `ctrlDragRotate` props on `WsiViewerCanvas`.
- World-coordinate pointer stream callback: `onPointerWorldMove`.
- Region style resolver API: `resolveRegionStrokeStyle`.
- Custom overlay shape API for patch/dashed guides: `overlayShapes`.
- Fixed-pixel stamp tool: `stamp-rectangle-4096px` and `stampOptions.rectanglePixelSize`.
- ROI term-group utility and callback path: `computeRoiPointGroups`, `onRoiPointGroups`.
- Release gate workflow: `.github/workflows/release-gate.yml`.
- PR template: `.github/pull_request_template.md`.
- Contribution guides: root `CONTRIBUTING.md`, docs EN/KO `contributing.html`.
- Hybrid WebGPU draw bridge payload support via `WsiPointData.drawIndices`.
- Hybrid clip option `bridgeToDraw` and clip stat flag `bridgedToDraw`.
- Unit test coverage for ROI term stats with draw-index bridge input.
- Patch-intent draw path for `stamp-rectangle-4096px` with dedicated `onPatchComplete` callback.
- Patch overlay channel on viewer (`patchRegions`, `patchStrokeStyle`) separated from ROI hover/active interaction.
- Custom React overlay layer slots via `customLayers` for host-owned rendering pipelines.
- Point-index clipping primitives for export workflows: `filterPointIndicesByPolygons` and worker variant.

### Changed
- `WsiTileRenderer` projection, bounds, and zoom anchoring now account for rotation.
- Overview map viewport indicator now supports rotated viewport polygon rendering.
- Region active selection now toggles on same-region click and switches on different region click.
- `WsiTileRenderer` point pass now supports indexed point rendering (`gl.drawElements`) when `drawIndices` are provided.
- Hybrid WebGPU path now reuses original point buffers and passes subset indices to draw pipeline.
- `computeRoiPointGroups` now respects `drawIndices` when present.
- Publish gate now enforces `npm run release:gate` via `prepublishOnly`.

### Docs
- Updated EN/KO API and guides for rotation, pointer world callbacks, overlay shapes, 4096px patch intent flow, custom layers, and ROI term stats.
- Updated `todo.md` gap table with current support status and code-path references.
- Added EN/KO migration guides with API stability/deprecation policy and release-gate contract.
- Added EN/KO contributing pages and linked them across docs navigation.

## [0.1.0] - 2026-02-24

### Added
- WebGL2-based React WSI viewer core with tile rendering, drag pan, and zoom interactions.
- High-volume cell point rendering pipeline with Zstd MVT parsing support.
- Draw/region tools: freehand, rectangle, and circular region creation.
- Stamp tools for circle and rectangle with externally configurable size options.
- Region label rendering with top placement and customizable style options.
- Example app and bilingual (`docs/en`, `docs/ko`) documentation structure.

### Changed
- Region styling API expanded with `hover` and `active` stroke states.
- Region interaction API expanded with `onHover` and `onClick` listeners.
- npm package build/publish setup finalized for ESM/CJS/types outputs.

### Docs
- Added engine roadmap documentation for moving from viewer library to render engine.
