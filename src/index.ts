export { M1TileRenderer } from "./core/m1-tile-renderer";
export type { ViewState } from "./core/ortho-camera";
export type { Bounds, TileDefinition } from "./core/types";
export type {
  BrushOptions,
  DrawAreaTooltipOptions,
  DrawAreaTooltipStyle,
  DrawBounds,
  DrawCoordinate,
  DrawIntent,
  DrawOverlayCoordinates,
  DrawOverlayInvertedFillStyle,
  DrawOverlayShape,
  DrawProjector,
  DrawRegion,
  DrawRegionCoordinates,
  DrawResult,
  DrawTool,
  PatchDrawResult,
  RegionLabelAnchorMode,
  RegionLabelStyle,
  RegionLabelStyleContext,
  RegionLabelStyleResolver,
  RegionStrokeStyle,
  RegionStrokeStyleResolver,
  RegionStyleContext,
  StampDrawTool,
  StampOptions,
  StampShape,
  StampToolConfig,
} from "./react/draw-layer";
export {
  closeRing,
  createCircle,
  createRectangle,
  DrawLayer,
} from "./react/draw-layer";
export type { DrawingLayerProps } from "./react/drawing-layer";
export { DrawingLayer } from "./react/drawing-layer";
export type { HeatmapKernelScaleMode, HeatmapLayerProps, HeatmapLayerStats, HeatmapPointData } from "./react/heatmap-layer";
export { HeatmapLayer } from "./react/heatmap-layer";
export { __heatmapLayerInternals } from "./react/heatmap-layer";
export type { OverlayLayerProps } from "./react/overlay-layer";
export { OverlayLayer } from "./react/overlay-layer";
export type { OverviewMapOptions, OverviewMapPosition, ViewportBorderStyle } from "./react/overview-map";
export { OverviewMap } from "./react/overview-map";
export type { PatchLayerProps } from "./react/patch-layer";
export { PatchLayer } from "./react/patch-layer";
export type { PointLayerProps, PointQueryHandle } from "./react/point-layer";
export { PointLayer } from "./react/point-layer";
export type { RegionLayerProps } from "./react/region-layer";
export { RegionLayer } from "./react/region-layer";
export { TileViewerCanvas } from "./react/tile-viewer-canvas";
export type { ViewerContextValue } from "./react/viewer-context";
export { useViewerContext } from "./react/viewer-context";
export type { WsiViewerProps } from "./react/wsi-viewer";
// --- v1.4.0 Composition API ---
export { WsiViewer } from "./react/wsi-viewer";
export type {
  PointClickEvent,
  PointClipStatsEvent,
  PointerWorldMoveEvent,
  PointHitEvent,
  PointHoverEvent,
  RegionClickEvent,
  RegionHoverEvent,
} from "./react/wsi-viewer-canvas-types";
export { DEFAULT_POINT_COLOR } from "./wsi/constants";
export type { RawImagePayload, RawImsInfo, RawWsiClass } from "./wsi/image-info";
export { normalizeImageInfo, normalizeImageClasses, toTileUrl } from "./wsi/image-info";
export type { RoiCoordinate, RoiPolygon } from "./wsi/point-clip";
export { filterPointDataByPolygons, filterPointIndicesByPolygons } from "./wsi/point-clip";
export type {
  HybridPointClipOptions,
  HybridPointClipResult,
} from "./wsi/point-clip-hybrid";
export { filterPointDataByPolygonsHybrid } from "./wsi/point-clip-hybrid";
export type {
  PointClipIndexResult,
  PointClipMode,
  PointClipResult,
  PointClipResultMeta,
} from "./wsi/point-clip-worker-client";
export {
  filterPointDataByPolygonsInWorker,
  filterPointIndicesByPolygonsInWorker,
  terminateRoiClipWorker,
} from "./wsi/point-clip-worker-client";
export type {
  RoiClipWorkerDataRequest,
  RoiClipWorkerFailure,
  RoiClipWorkerIndexRequest,
  RoiClipWorkerIndexSuccess,
  RoiClipWorkerRequest,
  RoiClipWorkerResponse,
  RoiClipWorkerSuccess,
} from "./wsi/point-clip-worker-protocol";
export type { FlatPointSpatialIndex } from "./wsi/point-hit-index-worker-client";
export {
  buildPointSpatialIndexAsync,
  lookupCellIndex,
  terminatePointHitIndexWorker,
} from "./wsi/point-hit-index-worker-client";
export type {
  PointHitIndexWorkerFailure,
  PointHitIndexWorkerRequest,
  PointHitIndexWorkerResponse,
  PointHitIndexWorkerSuccess,
} from "./wsi/point-hit-index-worker-protocol";
export { toRoiGeometry } from "./wsi/roi-geometry";
export type {
  RoiPointGroup,
  RoiPointGroupOptions,
  RoiPointGroupStats,
  RoiClassCount,
} from "./wsi/roi-class-stats";
export { computeRoiPointGroups } from "./wsi/roi-class-stats";
export type { SpatialExtent, SpatialIndex, SpatialIndexItem } from "./wsi/spatial-index";
export { createSpatialIndex } from "./wsi/spatial-index";
export type {
  ScheduledTile,
  TileBounds,
  TileSchedulerOptions,
  TileSchedulerSnapshot,
} from "./wsi/tile-scheduler";
export { TileScheduler } from "./wsi/tile-scheduler";
export type {
  ClassPalette,
  WsiCoordinate,
  WsiImageColorSettings,
  WsiImageSource,
  WsiMultiPolygonCoordinates,
  WsiPointData,
  WsiPolygonCoordinates,
  WsiRegion,
  WsiRegionCoordinates,
  WsiRenderStats,
  WsiRingCoordinates,
  WsiClass,
  WsiViewState,
} from "./wsi/types";
export {
  buildClassPalette,
  calcScaleLength,
  calcScaleResolution,
  calcViewingMagnification,
  clamp,
  hexToRgba,
  isSameViewState,
  toBearerToken,
} from "./wsi/utils";
export type { WebGpuCapabilities } from "./wsi/webgpu";
export { getWebGpuCapabilities, prefilterPointsByBoundsWebGpu } from "./wsi/webgpu";
export type { ParsedWktGeometry, ParsedWktMultiPolygon, ParsedWktPolygon } from "./wsi/wkt";
export { parseWkt } from "./wsi/wkt";
export type {
  PointSizeByMagnification,
  PointSizeByZoom,
  PointWeightByMagnification,
  WsiTileErrorEvent,
  WsiTileRendererOptions,
  WsiTileSchedulerConfig,
  WsiViewTransitionOptions,
} from "./wsi/wsi-tile-renderer";
export { WsiTileRenderer } from "./wsi/wsi-tile-renderer";
