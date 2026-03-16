import type { CSSProperties, MutableRefObject, ReactNode } from "react";
import type { PointClipMode } from "../wsi/point-clip-worker-client";
import type { RoiPointGroupStats } from "../wsi/roi-term-stats";
import type { WsiImageColorSettings, WsiImageSource, WsiPointData, WsiRegion, WsiRenderStats, WsiViewState } from "../wsi/types";
import type { PointSizeByZoom, WsiTileErrorEvent, WsiViewTransitionOptions } from "../wsi/wsi-tile-renderer";
import type {
  BrushOptions,
  DrawAreaTooltipOptions,
  DrawCoordinate,
  DrawOverlayShape,
  DrawRegionCoordinates,
  DrawResult,
  DrawTool,
  PatchDrawResult,
  RegionLabelAnchorMode,
  RegionLabelStyle,
  RegionLabelStyleResolver,
  RegionStrokeStyle,
  RegionStrokeStyleResolver,
  StampOptions,
} from "./draw-layer";
import type { OverviewMapOptions } from "./overview-map";

export interface RegionHoverEvent {
  region: WsiRegion | null;
  regionId: string | number | null;
  regionIndex: number;
  coordinate: DrawCoordinate | null;
}

export interface RegionClickEvent {
  region: WsiRegion;
  regionId: string | number;
  regionIndex: number;
  coordinate: DrawCoordinate;
}

export interface PointHitEvent {
  index: number;
  id: number | null;
  coordinate: DrawCoordinate;
  pointCoordinate: DrawCoordinate;
}

export interface PointClickEvent extends PointHitEvent {
  button: number;
}

export interface PointHoverEvent {
  index: number | null;
  id: number | null;
  coordinate: DrawCoordinate | null;
  pointCoordinate: DrawCoordinate | null;
}

export interface PointClipStatsEvent {
  mode: PointClipMode;
  durationMs: number;
  inputCount: number;
  outputCount: number;
  polygonCount: number;
  usedWebGpu?: boolean;
  candidateCount?: number;
  bridgedToDraw?: boolean;
}

export interface PointerWorldMoveEvent {
  coordinate: DrawCoordinate | null;
  clientX: number;
  clientY: number;
  insideImage: boolean;
}

export interface WsiCustomLayerContext {
  source: WsiImageSource;
  viewState: WsiViewState;
  drawTool: DrawTool;
  interactionLock: boolean;
  worldToScreen: (worldX: number, worldY: number) => DrawCoordinate | null;
  screenToWorld: (clientX: number, clientY: number) => DrawCoordinate | null;
  requestRedraw: () => void;
}

export interface WsiCustomLayer {
  id?: string | number;
  zIndex?: number;
  pointerEvents?: CSSProperties["pointerEvents"];
  className?: string;
  style?: CSSProperties;
  render: (context: WsiCustomLayerContext) => ReactNode;
}

export interface OverviewMapConfig {
  show?: boolean;
  options?: Partial<OverviewMapOptions>;
  className?: string;
  style?: CSSProperties;
}

/**
 * @deprecated Use `<WsiViewer>` with layer composition (`<PointLayer>`, `<RegionLayer>`, `<DrawingLayer>`, etc.) instead.
 * This monolithic interface will be removed in a future major version.
 */
export interface WsiViewerCanvasProps {
  source: WsiImageSource | null;
  viewState?: Partial<WsiViewState> | null;
  imageColorSettings?: WsiImageColorSettings | null;
  onViewStateChange?: (next: WsiViewState) => void;
  onStats?: (stats: WsiRenderStats) => void;
  onTileError?: (event: WsiTileErrorEvent) => void;
  onContextLost?: () => void;
  onContextRestored?: () => void;
  debugOverlay?: boolean;
  debugOverlayStyle?: CSSProperties;
  fitNonce?: number;
  rotationResetNonce?: number;
  authToken?: string;
  ctrlDragRotate?: boolean;
  pointData?: WsiPointData | null;
  pointPalette?: Uint8Array | null;
  pointSizeByZoom?: PointSizeByZoom;
  pointStrokeScale?: number;
  pointInnerFillOpacity?: number;
  minZoom?: number;
  maxZoom?: number;
  viewTransition?: WsiViewTransitionOptions;
  roiRegions?: WsiRegion[];
  roiPolygons?: DrawRegionCoordinates[];
  clipPointsToRois?: boolean;
  clipMode?: PointClipMode;
  onClipStats?: (event: PointClipStatsEvent) => void;
  onRoiPointGroups?: (stats: RoiPointGroupStats) => void;
  roiPaletteIndexToTermId?: ReadonlyMap<number, string> | readonly string[];
  interactionLock?: boolean;
  drawTool?: DrawTool;
  stampOptions?: StampOptions;
  brushOptions?: BrushOptions;
  drawFillColor?: string;
  regionStrokeStyle?: Partial<RegionStrokeStyle>;
  regionStrokeHoverStyle?: Partial<RegionStrokeStyle>;
  regionStrokeActiveStyle?: Partial<RegionStrokeStyle>;
  patchStrokeStyle?: Partial<RegionStrokeStyle>;
  resolveRegionStrokeStyle?: RegionStrokeStyleResolver;
  resolveRegionLabelStyle?: RegionLabelStyleResolver;
  overlayShapes?: DrawOverlayShape[];
  customLayers?: WsiCustomLayer[];
  patchRegions?: WsiRegion[];
  regionLabelStyle?: Partial<RegionLabelStyle>;
  regionLabelAnchor?: RegionLabelAnchorMode;
  drawAreaTooltip?: DrawAreaTooltipOptions;
  autoLiftRegionLabelAtMaxZoom?: boolean;
  clampRegionLabelToViewport?: boolean;
  onPointerWorldMove?: (event: PointerWorldMoveEvent) => void;
  onPointHover?: (event: PointHoverEvent) => void;
  onPointClick?: (event: PointClickEvent) => void;
  onRegionHover?: (event: RegionHoverEvent) => void;
  onRegionClick?: (event: RegionClickEvent) => void;
  activeRegionId?: string | number | null;
  onActiveRegionChange?: (regionId: string | number | null) => void;
  getCellByCoordinatesRef?: MutableRefObject<((coordinate: DrawCoordinate) => PointHitEvent | null) | null>;
  onDrawComplete?: (result: DrawResult) => void;
  onPatchComplete?: (result: PatchDrawResult) => void;
  zoomSnaps?: number[];
  zoomSnapFitAsMin?: boolean;
  overviewMapConfig?: OverviewMapConfig;
  className?: string;
  style?: CSSProperties;
}
