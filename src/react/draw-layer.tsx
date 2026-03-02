import { type CSSProperties, type MutableRefObject, type PointerEvent as ReactPointerEvent, type RefObject, useCallback, useEffect, useMemo, useRef } from "react";
import { buildBrushStrokePolygon } from "../wsi/brush-stroke";
import { normalizeRoiGeometry, toRoiGeometry } from "../wsi/roi-geometry";
import { calcScaleResolution, clamp } from "../wsi/utils";

export type StampDrawTool = "stamp-rectangle" | "stamp-circle" | "stamp-rectangle-4096px" | "stamp-rectangle-2mm2" | "stamp-circle-2mm2" | "stamp-circle-hpf-0.2mm2";

export type DrawTool = "cursor" | "freehand" | "rectangle" | "circular" | "brush" | StampDrawTool;

export type DrawCoordinate = [number, number];

export type DrawBounds = [number, number, number, number];
export type DrawRegionCoordinates = DrawCoordinate[] | DrawCoordinate[][] | DrawCoordinate[][][];

export type DrawIntent = "roi" | "patch" | "brush";

export interface DrawResult {
  tool: Exclude<DrawTool, "cursor">;
  intent: DrawIntent;
  coordinates: DrawCoordinate[];
  bbox: DrawBounds;
  areaPx: number;
}

export type PatchDrawResult = DrawResult & {
  tool: "stamp-rectangle-4096px";
  intent: "patch";
};

export interface DrawRegion {
  id?: string | number;
  coordinates: DrawRegionCoordinates;
  label?: string;
}

export interface RegionStyleContext {
  region: DrawRegion;
  regionId: string | number;
  regionIndex: number;
  state: "default" | "hover" | "active";
}

export type RegionStrokeStyleResolver = (context: RegionStyleContext) => Partial<RegionStrokeStyle> | null | undefined;

export interface RegionLabelStyleContext {
  region: DrawRegion;
  regionId: string | number;
  regionIndex: number;
  zoom: number;
}

export type RegionLabelStyleResolver = (context: RegionLabelStyleContext) => Partial<RegionLabelStyle> | null | undefined;

export type DrawOverlayCoordinates = DrawCoordinate[] | DrawCoordinate[][] | DrawCoordinate[][][];

export interface DrawOverlayShape {
  id?: string | number;
  coordinates: DrawOverlayCoordinates;
  closed?: boolean;
  fill?: boolean;
  stroke?: Partial<RegionStrokeStyle>;
  strokeStyle?: Partial<RegionStrokeStyle>;
  invertedFill?: DrawOverlayInvertedFillStyle;
  visible?: boolean;
}

export interface DrawOverlayInvertedFillStyle {
  fillColor: string;
}

export interface RegionStrokeStyle {
  color: string;
  width: number;
  lineDash: number[];
  lineJoin: CanvasLineJoin;
  lineCap: CanvasLineCap;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
}

export interface RegionLabelStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: string | number;
  textColor: string;
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  paddingX: number;
  paddingY: number;
  offsetY: number;
  borderRadius: number;
}

export interface DrawAreaTooltipStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: string | number;
  textColor: string;
  backgroundColor: string;
  borderRadius: number;
  paddingX: number;
  paddingY: number;
}

export interface DrawAreaTooltipOptions {
  enabled?: boolean;
  format?: (areaMm2: number) => string;
  style?: Partial<DrawAreaTooltipStyle>;
  cursorOffset?: {
    x: number;
    y: number;
  };
}

export interface DrawProjector {
  screenToWorld(clientX: number, clientY: number): DrawCoordinate | number[];
  worldToScreen(worldX: number, worldY: number): DrawCoordinate | number[];
  getViewState?: () => { zoom: number; rotationDeg?: number };
  getZoomRange?: () => { minZoom: number; maxZoom: number };
  zoomBy?: (factor: number, screenX: number, screenY: number) => void;
}

export interface StampOptions {
  rectangleAreaMm2?: number;
  circleAreaMm2?: number;
  rectanglePixelSize?: number;
}

export interface BrushOptions {
  /**
   * Brush radius in HTML/CSS pixels (px).
   * This value is zoom-invariant: the on-screen brush size stays fixed.
   */
  radius: number;
  /**
   * Brush edge detail factor. Higher values create rounder/finer edges.
   * Range: 0.25 ~ 4. Default: 1.
   */
  edgeDetail?: number;
  /**
   * Post-smoothing passes for brush outline to reduce stair-stepping.
   * Range: 0 ~ 4. Default: 1.
   */
  edgeSmoothing?: number;
  /**
   * When true, a brush "tap" (click without drag) on ROI selects that ROI
   * instead of creating a brush stroke.
   */
  clickSelectRoi?: boolean;
  fillColor?: string;
  fillOpacity?: number;
  cursorColor?: string;
  cursorActiveColor?: string;
  cursorLineWidth?: number;
  cursorLineDash?: number[];
}

export interface DrawLayerProps {
  tool: DrawTool;
  imageWidth: number;
  imageHeight: number;
  imageMpp?: number;
  imageZoom?: number;
  stampOptions?: StampOptions;
  brushOptions?: BrushOptions;
  projectorRef: RefObject<DrawProjector | null>;
  onBrushTap?: (coordinate: DrawCoordinate) => boolean;
  onDrawComplete?: (result: DrawResult) => void;
  onPatchComplete?: (result: PatchDrawResult) => void;
  enabled?: boolean;
  viewStateSignal?: unknown;
  persistedRegions?: DrawRegion[];
  patchRegions?: DrawRegion[];
  persistedPolygons?: DrawRegionCoordinates[];
  drawFillColor?: string;
  regionStrokeStyle?: Partial<RegionStrokeStyle>;
  regionStrokeHoverStyle?: Partial<RegionStrokeStyle>;
  regionStrokeActiveStyle?: Partial<RegionStrokeStyle>;
  patchStrokeStyle?: Partial<RegionStrokeStyle>;
  resolveRegionStrokeStyle?: RegionStrokeStyleResolver;
  resolveRegionLabelStyle?: RegionLabelStyleResolver;
  overlayShapes?: DrawOverlayShape[];
  hoveredRegionId?: string | number | null;
  activeRegionId?: string | number | null;
  regionLabelStyle?: Partial<RegionLabelStyle>;
  drawAreaTooltip?: DrawAreaTooltipOptions;
  autoLiftRegionLabelAtMaxZoom?: boolean;
  regionLabelAutoLiftOffsetPx?: number;
  invalidateRef?: MutableRefObject<(() => void) | null>;
  className?: string;
  style?: CSSProperties;
}

interface DrawSession {
  isDrawing: boolean;
  pointerId: number | null;
  start: DrawCoordinate | null;
  current: DrawCoordinate | null;
  cursor: DrawCoordinate | null;
  cursorScreen: DrawCoordinate | null;
  points: DrawCoordinate[];
  screenPoints: DrawCoordinate[];
  stampCenter: DrawCoordinate | null;
}

interface NormalizedDrawRegionPolygon {
  outer: DrawCoordinate[];
  holes: DrawCoordinate[][];
}

interface PreparedRenderedRegion {
  region: DrawRegion;
  regionIndex: number;
  regionKey: string | number;
  polygons: NormalizedDrawRegionPolygon[];
}

interface ResolvedBrushOptions {
  radius: number;
  edgeDetail: number;
  edgeSmoothing: number;
  clickSelectRoi: boolean;
  fillColor: string;
  fillOpacity: number;
  cursorColor: string;
  cursorActiveColor: string;
  cursorLineWidth: number;
  cursorLineDash: number[];
}

interface ResolvedDrawAreaTooltipOptions {
  enabled: boolean;
  format: (areaMm2: number) => string;
  style: DrawAreaTooltipStyle;
  cursorOffsetX: number;
  cursorOffsetY: number;
}

const DRAW_FILL = "rgba(255, 77, 79, 0.16)";
const DEFAULT_DRAW_PREVIEW_FILL = "transparent";
const FREEHAND_MIN_POINTS = 3;
const FREEHAND_SCREEN_STEP = 2;
const CIRCLE_SIDES = 96;
const MIN_AREA_PX = 1;
const EMPTY_REGIONS: DrawRegion[] = [];
const EMPTY_DASH: number[] = [];
const MICRONS_PER_MM = 1000;
const DEFAULT_STAMP_RECTANGLE_AREA_MM2 = 2;
const DEFAULT_STAMP_CIRCLE_AREA_MM2 = 2;
const DEFAULT_STAMP_RECTANGLE_PIXEL_SIZE = 4096;
const LEGACY_HPF_CIRCLE_AREA_MM2 = 0.2;
const WHEEL_ZOOM_IN_FACTOR = 1.12;
const WHEEL_ZOOM_OUT_FACTOR = 0.89;
const DEFAULT_BRUSH_RADIUS = 32;
const DEFAULT_BRUSH_FILL_COLOR = "#000000";
const DEFAULT_BRUSH_FILL_OPACITY = 0.1;
const DEFAULT_BRUSH_CURSOR_COLOR = "#FFCF00";
const DEFAULT_BRUSH_CURSOR_ACTIVE_COLOR = "#FF0000";
const DEFAULT_BRUSH_CURSOR_LINE_WIDTH = 1.5;
const DEFAULT_BRUSH_CURSOR_DASH = [2, 2];
const DEFAULT_BRUSH_EDGE_DETAIL = 1;
const MIN_BRUSH_EDGE_DETAIL = 0.25;
const MAX_BRUSH_EDGE_DETAIL = 4;
const DEFAULT_BRUSH_EDGE_SMOOTHING = 1;
const MIN_BRUSH_EDGE_SMOOTHING = 0;
const MAX_BRUSH_EDGE_SMOOTHING = 4;
const MIN_BRUSH_RASTER_STEP = 0.05;
const BRUSH_RASTER_DIAMETER_SAMPLES = 256;
const BRUSH_SCREEN_STEP = 1.5; // CSS px

const DEFAULT_REGION_STROKE_STYLE: RegionStrokeStyle = {
  color: "#ff4d4f",
  width: 2,
  lineDash: EMPTY_DASH,
  lineJoin: "round",
  lineCap: "round",
  shadowColor: "rgba(0, 0, 0, 0)",
  shadowBlur: 0,
  shadowOffsetX: 0,
  shadowOffsetY: 0,
};

const DEFAULT_PATCH_STROKE_STYLE: RegionStrokeStyle = {
  color: "#4cc9f0",
  width: 2,
  lineDash: [10, 8],
  lineJoin: "round",
  lineCap: "round",
  shadowColor: "rgba(0, 0, 0, 0)",
  shadowBlur: 0,
  shadowOffsetX: 0,
  shadowOffsetY: 0,
};

const REGION_INTERACTION_SHADOW_COLOR = "rgba(23, 23, 25, 0.1)";
const REGION_INTERACTION_SHADOW_WIDTH = 6;

const DEFAULT_REGION_LABEL_STYLE: RegionLabelStyle = {
  fontFamily: "Pretendard, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontSize: 11,
  fontWeight: 600,
  textColor: "#171719",
  backgroundColor: "#FFCC00",
  borderColor: "rgba(0, 0, 0, 0)",
  borderWidth: 0,
  paddingX: 8,
  paddingY: 4,
  offsetY: 10,
  borderRadius: 4,
};

const DEFAULT_DRAW_AREA_TOOLTIP_STYLE: DrawAreaTooltipStyle = {
  fontFamily: "Pretendard, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontSize: 13,
  fontWeight: 500,
  textColor: "#FFFFFF",
  backgroundColor: "rgba(23, 23, 25, 0.5)",
  borderRadius: 4,
  paddingX: 6,
  paddingY: 3,
};

const DEFAULT_DRAW_AREA_TOOLTIP_OFFSET = {
  x: 16,
  y: -24,
} as const;
const REGION_LABEL_AUTO_LIFT_MAX_OFFSET_PX = 20;
const REGION_LABEL_AUTO_LIFT_MAX_EPSILON = 1e-6;

export function resolveRegionLabelAutoLiftOffsetPx(
  enabled: boolean | undefined,
  zoom: number,
  zoomRange: { minZoom: number; maxZoom: number } | null | undefined
): number {
  if (!enabled) return 0;
  if (!zoomRange) return 0;

  const minZoom = Number(zoomRange.minZoom);
  const maxZoom = Number(zoomRange.maxZoom);
  if (!Number.isFinite(minZoom) || !Number.isFinite(maxZoom)) return 0;

  if (maxZoom - minZoom <= REGION_LABEL_AUTO_LIFT_MAX_EPSILON) return 0;
  if (!Number.isFinite(zoom)) return 0;
  return zoom >= maxZoom - REGION_LABEL_AUTO_LIFT_MAX_EPSILON ? REGION_LABEL_AUTO_LIFT_MAX_OFFSET_PX : 0;
}

function isStampTool(tool: DrawTool): tool is StampDrawTool {
  return (
    tool === "stamp-rectangle" || tool === "stamp-circle" || tool === "stamp-rectangle-4096px" || tool === "stamp-rectangle-2mm2" || tool === "stamp-circle-2mm2" || tool === "stamp-circle-hpf-0.2mm2"
  );
}

function clampPositiveOrFallback(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

function resolveStampOptions(options: StampOptions | undefined): Required<StampOptions> {
  return {
    rectangleAreaMm2: clampPositiveOrFallback(options?.rectangleAreaMm2, DEFAULT_STAMP_RECTANGLE_AREA_MM2),
    circleAreaMm2: clampPositiveOrFallback(options?.circleAreaMm2, DEFAULT_STAMP_CIRCLE_AREA_MM2),
    rectanglePixelSize: clampPositiveOrFallback(options?.rectanglePixelSize, DEFAULT_STAMP_RECTANGLE_PIXEL_SIZE),
  };
}

function clampUnitOpacity(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return clamp(value, 0, 1);
}

function sanitizeBrushLineDash(value: number[] | undefined): number[] {
  if (!Array.isArray(value)) return DEFAULT_BRUSH_CURSOR_DASH;
  const out = value.filter(item => Number.isFinite(item) && item >= 0);
  return out.length > 0 ? out : DEFAULT_BRUSH_CURSOR_DASH;
}

function resolveBrushEdgeDetail(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_BRUSH_EDGE_DETAIL;
  return clamp(value, MIN_BRUSH_EDGE_DETAIL, MAX_BRUSH_EDGE_DETAIL);
}

function resolveBrushEdgeSmoothing(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_BRUSH_EDGE_SMOOTHING;
  return Math.round(clamp(value, MIN_BRUSH_EDGE_SMOOTHING, MAX_BRUSH_EDGE_SMOOTHING));
}

function resolveBrushOptions(options: BrushOptions | undefined): ResolvedBrushOptions {
  const radius = clampPositiveOrFallback(options?.radius, DEFAULT_BRUSH_RADIUS);
  const cursorLineWidth = clampPositiveOrFallback(options?.cursorLineWidth, DEFAULT_BRUSH_CURSOR_LINE_WIDTH);
  const edgeDetail = resolveBrushEdgeDetail(options?.edgeDetail);
  const edgeSmoothing = resolveBrushEdgeSmoothing(options?.edgeSmoothing);
  return {
    radius,
    edgeDetail,
    edgeSmoothing,
    clickSelectRoi: options?.clickSelectRoi === true,
    fillColor: options?.fillColor || DEFAULT_BRUSH_FILL_COLOR,
    fillOpacity: clampUnitOpacity(options?.fillOpacity, DEFAULT_BRUSH_FILL_OPACITY),
    cursorColor: options?.cursorColor || DEFAULT_BRUSH_CURSOR_COLOR,
    cursorActiveColor: options?.cursorActiveColor || DEFAULT_BRUSH_CURSOR_ACTIVE_COLOR,
    cursorLineWidth,
    cursorLineDash: sanitizeBrushLineDash(options?.cursorLineDash),
  };
}

function mm2ToUm2(areaMm2: number): number {
  return areaMm2 * MICRONS_PER_MM * MICRONS_PER_MM;
}

function createSquareFromCenter(
  center: DrawCoordinate | null,
  halfLength: number,
  projection?: {
    worldToScreen: (x: number, y: number) => DrawCoordinate | null;
    screenToWorld: (screen: DrawCoordinate) => DrawCoordinate | null;
  },
): DrawCoordinate[] {
  if (!center || !Number.isFinite(halfLength) || halfLength <= 0) return [];

  if (projection) {
    const screenCenter = projection.worldToScreen(center[0], center[1]);
    const screenEdge = projection.worldToScreen(center[0] + halfLength, center[1]);
    if (screenCenter && screenEdge) {
      const screenHL = Math.hypot(screenEdge[0] - screenCenter[0], screenEdge[1] - screenCenter[1]);
      const screenCorners: DrawCoordinate[] = [
        [screenCenter[0] - screenHL, screenCenter[1] - screenHL],
        [screenCenter[0] + screenHL, screenCenter[1] - screenHL],
        [screenCenter[0] + screenHL, screenCenter[1] + screenHL],
        [screenCenter[0] - screenHL, screenCenter[1] + screenHL],
      ];
      const worldCorners: DrawCoordinate[] = [];
      for (const corner of screenCorners) {
        const world = projection.screenToWorld(corner);
        if (!world) throw new Error("Failed to create rectangle");
        worldCorners.push(world);
      }
      return closeRing(worldCorners);
    }
  }

  return closeRing([
    [center[0] - halfLength, center[1] - halfLength],
    [center[0] + halfLength, center[1] - halfLength],
    [center[0] + halfLength, center[1] + halfLength],
    [center[0] - halfLength, center[1] + halfLength],
  ]);
}

function createCircleFromCenter(center: DrawCoordinate | null, radius: number, sides = CIRCLE_SIDES): DrawCoordinate[] {
  if (!center || !Number.isFinite(radius) || radius <= 0) return [];

  const coords: DrawCoordinate[] = [];
  for (let i = 0; i <= sides; i += 1) {
    const t = (i / sides) * Math.PI * 2;
    coords.push([center[0] + Math.cos(t) * radius, center[1] + Math.sin(t) * radius]);
  }

  return closeRing(coords);
}

export function closeRing(coords: DrawCoordinate[]): DrawCoordinate[] {
  if (!Array.isArray(coords) || coords.length < 3) return [];

  const out = coords.map(([x, y]) => [x, y] as DrawCoordinate);
  const first = out[0];
  const last = out[out.length - 1];
  if (!first || !last) return [];

  if (first[0] !== last[0] || first[1] !== last[1]) {
    out.push([first[0], first[1]]);
  }

  return out;
}

export function createRectangle(
  start: DrawCoordinate | null,
  end: DrawCoordinate | null,
  projection?: {
    worldToScreen: (x: number, y: number) => DrawCoordinate | null;
    screenToWorld: (screen: DrawCoordinate) => DrawCoordinate | null;
  },
): DrawCoordinate[] {
  if (!start || !end) return [];

  if (projection) {
    const startScreen = projection.worldToScreen(start[0], start[1]);
    const endScreen = projection.worldToScreen(end[0], end[1]);

    if (startScreen && endScreen) {
      const screenCorners: DrawCoordinate[] = [
        [startScreen[0], startScreen[1]],
        [endScreen[0], startScreen[1]],
        [endScreen[0], endScreen[1]],
        [startScreen[0], endScreen[1]],
      ];
      const worldCorners: DrawCoordinate[] = [];
      for (const corner of screenCorners) {
        const world = projection.screenToWorld(corner);
        if (!world) return createRectangle(start, end);
        worldCorners.push(world);
      }
      return closeRing(worldCorners);
    }
  }

  return closeRing([
    [start[0], start[1]],
    [end[0], start[1]],
    [end[0], end[1]],
    [start[0], end[1]],
  ]);
}

export function createCircle(start: DrawCoordinate | null, end: DrawCoordinate | null, sides = CIRCLE_SIDES): DrawCoordinate[] {
  if (!start || !end) return [];

  const centerX = (start[0] + end[0]) * 0.5;
  const centerY = (start[1] + end[1]) * 0.5;
  const radius = Math.hypot(end[0] - start[0], end[1] - start[1]) * 0.5;
  if (radius < 1) return [];

  const coords: DrawCoordinate[] = [];
  for (let i = 0; i <= sides; i += 1) {
    const t = (i / sides) * Math.PI * 2;
    coords.push([centerX + Math.cos(t) * radius, centerY + Math.sin(t) * radius]);
  }

  return closeRing(coords);
}

function polygonArea(coords: DrawCoordinate[]): number {
  if (!Array.isArray(coords) || coords.length < 4) return 0;

  let sum = 0;
  for (let i = 0; i < coords.length - 1; i += 1) {
    const a = coords[i];
    const b = coords[i + 1];
    sum += a[0] * b[1] - b[0] * a[1];
  }

  return Math.abs(sum * 0.5);
}

function computeBounds(coords: DrawCoordinate[]): DrawBounds {
  if (!Array.isArray(coords) || coords.length === 0) return [0, 0, 0, 0];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [x, y] of coords) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  return [minX, minY, maxX, maxY];
}

function isValidPolygon(coords: DrawCoordinate[]): boolean {
  return Array.isArray(coords) && coords.length >= 4 && polygonArea(coords) > MIN_AREA_PX;
}

function tracePath(ctx: CanvasRenderingContext2D, points: DrawCoordinate[], close = false): void {
  if (points.length === 0) return;

  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i][0], points[i][1]);
  }

  if (close) {
    ctx.closePath();
  }
}

function drawPath(
  ctx: CanvasRenderingContext2D,
  points: DrawCoordinate[],
  strokeStyle: RegionStrokeStyle,
  close = false,
  fill = false,
  fillColor = DRAW_FILL
): void {
  if (points.length === 0) return;

  ctx.beginPath();
  tracePath(ctx, points, close);
  if (fill && close) {
    ctx.fillStyle = fillColor;
    ctx.fill();
  }

  ctx.strokeStyle = strokeStyle.color;
  ctx.lineWidth = strokeStyle.width;
  ctx.lineJoin = strokeStyle.lineJoin;
  ctx.lineCap = strokeStyle.lineCap;
  ctx.shadowColor = strokeStyle.shadowColor;
  ctx.shadowBlur = strokeStyle.shadowBlur;
  ctx.shadowOffsetX = strokeStyle.shadowOffsetX;
  ctx.shadowOffsetY = strokeStyle.shadowOffsetY;
  ctx.setLineDash(strokeStyle.lineDash);
  ctx.stroke();
  ctx.setLineDash(EMPTY_DASH);
  ctx.shadowColor = "rgba(0, 0, 0, 0)";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

function resolveDrawPreviewFillColor(value: string | undefined): string {
  if (typeof value !== "string") return DEFAULT_DRAW_PREVIEW_FILL;
  const next = value.trim();
  return next.length > 0 ? next : DEFAULT_DRAW_PREVIEW_FILL;
}

function resolveStrokeStyle(style: Partial<RegionStrokeStyle> | undefined): RegionStrokeStyle {
  const dash = Array.isArray(style?.lineDash) ? style.lineDash.filter(value => Number.isFinite(value) && value >= 0) : EMPTY_DASH;
  const width = typeof style?.width === "number" && Number.isFinite(style.width) ? Math.max(0, style.width) : DEFAULT_REGION_STROKE_STYLE.width;
  const shadowBlur = typeof style?.shadowBlur === "number" && Number.isFinite(style.shadowBlur) ? Math.max(0, style.shadowBlur) : DEFAULT_REGION_STROKE_STYLE.shadowBlur;
  const shadowOffsetX = typeof style?.shadowOffsetX === "number" && Number.isFinite(style.shadowOffsetX) ? style.shadowOffsetX : DEFAULT_REGION_STROKE_STYLE.shadowOffsetX;
  const shadowOffsetY = typeof style?.shadowOffsetY === "number" && Number.isFinite(style.shadowOffsetY) ? style.shadowOffsetY : DEFAULT_REGION_STROKE_STYLE.shadowOffsetY;
  return {
    color: style?.color || DEFAULT_REGION_STROKE_STYLE.color,
    width,
    lineDash: dash.length ? dash : EMPTY_DASH,
    lineJoin: style?.lineJoin || DEFAULT_REGION_STROKE_STYLE.lineJoin,
    lineCap: style?.lineCap || DEFAULT_REGION_STROKE_STYLE.lineCap,
    shadowColor: style?.shadowColor || DEFAULT_REGION_STROKE_STYLE.shadowColor,
    shadowBlur,
    shadowOffsetX,
    shadowOffsetY,
  };
}

function mergeStrokeStyle(base: RegionStrokeStyle, override: Partial<RegionStrokeStyle> | undefined): RegionStrokeStyle {
  if (!override) return base;
  return resolveStrokeStyle({
    color: override.color ?? base.color,
    width: override.width ?? base.width,
    lineDash: override.lineDash ?? base.lineDash,
    lineJoin: override.lineJoin ?? base.lineJoin,
    lineCap: override.lineCap ?? base.lineCap,
    shadowColor: override.shadowColor ?? base.shadowColor,
    shadowBlur: override.shadowBlur ?? base.shadowBlur,
    shadowOffsetX: override.shadowOffsetX ?? base.shadowOffsetX,
    shadowOffsetY: override.shadowOffsetY ?? base.shadowOffsetY,
  });
}

function isSameRegionId(a: string | number | null | undefined, b: string | number | null | undefined): boolean {
  if (a === null || a === undefined || b === null || b === undefined) {
    return false;
  }
  return String(a) === String(b);
}

function isNestedRingCoordinates(coordinates: DrawOverlayCoordinates): boolean {
  const first = coordinates[0];
  return Array.isArray(first) && Array.isArray(first[0]);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCoordinatePair(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length >= 2 && isFiniteNumber(value[0]) && isFiniteNumber(value[1]);
}

function isCoordinateRing(value: unknown): value is DrawCoordinate[] {
  return Array.isArray(value) && value.length >= 2 && value.every(point => isCoordinatePair(point));
}

function collectOverlayRings(value: unknown, out: DrawCoordinate[][]): void {
  if (!Array.isArray(value) || value.length === 0) return;
  if (isCoordinateRing(value)) {
    out.push(value.map(([x, y]) => [x, y] as DrawCoordinate));
    return;
  }
  for (const item of value) {
    collectOverlayRings(item, out);
  }
}

function normalizeOverlayRings(coordinates: DrawOverlayCoordinates, close: boolean): DrawCoordinate[][] {
  const sourceRings: DrawCoordinate[][] = [];
  collectOverlayRings(coordinates, sourceRings);
  const out: DrawCoordinate[][] = [];
  for (const ring of sourceRings) {
    if (ring.length < 2) continue;
    const normalized = close ? closeRing(ring) : ring;
    if (normalized.length >= (close ? 4 : 2)) {
      out.push(normalized);
    }
  }
  return out;
}

function drawInvertedFillMask(ctx: CanvasRenderingContext2D, outerRing: DrawCoordinate[], holeRings: DrawCoordinate[][], fillColor: string): void {
  if (outerRing.length < 4 || holeRings.length === 0) return;
  ctx.save();
  ctx.beginPath();
  tracePath(ctx, outerRing, true);
  for (const ring of holeRings) {
    if (ring.length < 4) continue;
    tracePath(ctx, ring, true);
  }
  ctx.fillStyle = fillColor;
  ctx.fill("evenodd");
  ctx.restore();
}

export function resolveRegionLabelStyle(style: Partial<RegionLabelStyle> | undefined): RegionLabelStyle {
  const px = typeof style?.paddingX === "number" && Number.isFinite(style.paddingX) ? Math.max(0, style.paddingX) : DEFAULT_REGION_LABEL_STYLE.paddingX;
  const py = typeof style?.paddingY === "number" && Number.isFinite(style.paddingY) ? Math.max(0, style.paddingY) : DEFAULT_REGION_LABEL_STYLE.paddingY;
  const fs = typeof style?.fontSize === "number" && Number.isFinite(style.fontSize) ? Math.max(8, style.fontSize) : DEFAULT_REGION_LABEL_STYLE.fontSize;
  const bw = typeof style?.borderWidth === "number" && Number.isFinite(style.borderWidth) ? Math.max(0, style.borderWidth) : DEFAULT_REGION_LABEL_STYLE.borderWidth;
  const oy = typeof style?.offsetY === "number" && Number.isFinite(style.offsetY) ? style.offsetY : DEFAULT_REGION_LABEL_STYLE.offsetY;
  const br = typeof style?.borderRadius === "number" && Number.isFinite(style.borderRadius) ? Math.max(0, style.borderRadius) : DEFAULT_REGION_LABEL_STYLE.borderRadius;
  return {
    fontFamily: style?.fontFamily || DEFAULT_REGION_LABEL_STYLE.fontFamily,
    fontSize: fs,
    fontWeight: style?.fontWeight || DEFAULT_REGION_LABEL_STYLE.fontWeight,
    textColor: style?.textColor || DEFAULT_REGION_LABEL_STYLE.textColor,
    backgroundColor: style?.backgroundColor || DEFAULT_REGION_LABEL_STYLE.backgroundColor,
    borderColor: style?.borderColor || DEFAULT_REGION_LABEL_STYLE.borderColor,
    borderWidth: bw,
    paddingX: px,
    paddingY: py,
    offsetY: oy,
    borderRadius: br,
  };
}

export function mergeRegionLabelStyle(base: RegionLabelStyle, override: Partial<RegionLabelStyle> | null | undefined): RegionLabelStyle {
  if (!override) return base;
  return resolveRegionLabelStyle({
    fontFamily: override.fontFamily ?? base.fontFamily,
    fontSize: override.fontSize ?? base.fontSize,
    fontWeight: override.fontWeight ?? base.fontWeight,
    textColor: override.textColor ?? base.textColor,
    backgroundColor: override.backgroundColor ?? base.backgroundColor,
    borderColor: override.borderColor ?? base.borderColor,
    borderWidth: override.borderWidth ?? base.borderWidth,
    paddingX: override.paddingX ?? base.paddingX,
    paddingY: override.paddingY ?? base.paddingY,
    offsetY: override.offsetY ?? base.offsetY,
    borderRadius: override.borderRadius ?? base.borderRadius,
  });
}

function resolveDrawAreaTooltipStyle(style: Partial<DrawAreaTooltipStyle> | undefined): DrawAreaTooltipStyle {
  const fontSize = typeof style?.fontSize === "number" && Number.isFinite(style.fontSize) ? Math.max(8, style.fontSize) : DEFAULT_DRAW_AREA_TOOLTIP_STYLE.fontSize;
  const borderRadius = typeof style?.borderRadius === "number" && Number.isFinite(style.borderRadius) ? Math.max(0, style.borderRadius) : DEFAULT_DRAW_AREA_TOOLTIP_STYLE.borderRadius;
  const paddingX = typeof style?.paddingX === "number" && Number.isFinite(style.paddingX) ? Math.max(0, style.paddingX) : DEFAULT_DRAW_AREA_TOOLTIP_STYLE.paddingX;
  const paddingY = typeof style?.paddingY === "number" && Number.isFinite(style.paddingY) ? Math.max(0, style.paddingY) : DEFAULT_DRAW_AREA_TOOLTIP_STYLE.paddingY;
  return {
    fontFamily: style?.fontFamily || DEFAULT_DRAW_AREA_TOOLTIP_STYLE.fontFamily,
    fontSize,
    fontWeight: style?.fontWeight || DEFAULT_DRAW_AREA_TOOLTIP_STYLE.fontWeight,
    textColor: style?.textColor || DEFAULT_DRAW_AREA_TOOLTIP_STYLE.textColor,
    backgroundColor: style?.backgroundColor || DEFAULT_DRAW_AREA_TOOLTIP_STYLE.backgroundColor,
    borderRadius,
    paddingX,
    paddingY,
  };
}

function resolveTooltipCursorOffset(value: DrawAreaTooltipOptions["cursorOffset"]): { x: number; y: number } {
  const x = typeof value?.x === "number" && Number.isFinite(value.x) ? value.x : DEFAULT_DRAW_AREA_TOOLTIP_OFFSET.x;
  const y = typeof value?.y === "number" && Number.isFinite(value.y) ? value.y : DEFAULT_DRAW_AREA_TOOLTIP_OFFSET.y;
  return { x, y };
}

function defaultDrawAreaTooltipFormatter(areaMm2: number): string {
  if (!Number.isFinite(areaMm2)) return "0.000 mm²";
  return `${Math.max(0, areaMm2).toFixed(3)} mm²`;
}

function resolveDrawAreaTooltipOptions(options: DrawAreaTooltipOptions | undefined): ResolvedDrawAreaTooltipOptions {
  const format = typeof options?.format === "function" ? options.format : defaultDrawAreaTooltipFormatter;
  const cursorOffset = resolveTooltipCursorOffset(options?.cursorOffset);
  return {
    enabled: options?.enabled === true,
    format,
    style: resolveDrawAreaTooltipStyle(options?.style),
    cursorOffsetX: cursorOffset.x,
    cursorOffsetY: cursorOffset.y,
  };
}

function resolveRegionInteractionShadowStyle(strokeStyle: RegionStrokeStyle): RegionStrokeStyle {
  return {
    color: REGION_INTERACTION_SHADOW_COLOR,
    width: REGION_INTERACTION_SHADOW_WIDTH,
    lineDash: EMPTY_DASH,
    lineJoin: strokeStyle.lineJoin,
    lineCap: strokeStyle.lineCap,
    shadowColor: "rgba(0, 0, 0, 0)",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
  };
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.max(0, Math.min(radius, width * 0.5, height * 0.5));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function getTopAnchor(coords: DrawCoordinate[]): DrawCoordinate | null {
  if (!coords.length) return null;

  let minY = Infinity;
  for (const point of coords) {
    if (point[1] < minY) minY = point[1];
  }
  if (!Number.isFinite(minY)) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  for (const point of coords) {
    if (Math.abs(point[1] - minY) > 0.5) continue;
    if (point[0] < minX) minX = point[0];
    if (point[0] > maxX) maxX = point[0];
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return null;
  return [(minX + maxX) * 0.5, minY];
}

function getTopAnchorFromPolygons(polygons: NormalizedDrawRegionPolygon[]): DrawCoordinate | null {
  let best: DrawCoordinate | null = null;
  for (const polygon of polygons) {
    const anchor = getTopAnchor(polygon.outer);
    if (!anchor) continue;
    if (!best || anchor[1] < best[1] || (anchor[1] === best[1] && anchor[0] < best[0])) {
      best = anchor;
    }
  }
  return best;
}

function normalizeDrawRegionPolygons(coordinates: DrawRegionCoordinates): NormalizedDrawRegionPolygon[] {
  const multipolygon = normalizeRoiGeometry(toRoiGeometry(coordinates));
  if (multipolygon.length === 0) return [];

  const out: NormalizedDrawRegionPolygon[] = [];
  for (const polygon of multipolygon) {
    const outer = polygon[0];
    if (!outer || outer.length < 4) continue;
    const normalizedOuter = outer.map(([x, y]) => [x, y] as DrawCoordinate);
    const holes: DrawCoordinate[][] = [];
    for (let i = 1; i < polygon.length; i += 1) {
      const hole = polygon[i];
      if (!hole || hole.length < 4) continue;
      holes.push(hole.map(([x, y]) => [x, y] as DrawCoordinate));
    }
    out.push({
      outer: normalizedOuter,
      holes,
    });
  }
  return out;
}

function drawRegionLabel(ctx: CanvasRenderingContext2D, text: string, anchor: DrawCoordinate, canvasWidth: number, canvasHeight: number, labelStyle: RegionLabelStyle): void {
  const label = text.trim();
  if (!label) return;

  ctx.save();
  ctx.font = `${labelStyle.fontWeight} ${labelStyle.fontSize}px ${labelStyle.fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const textWidth = ctx.measureText(label).width;
  const boxWidth = textWidth + labelStyle.paddingX * 2;
  const boxHeight = labelStyle.fontSize + labelStyle.paddingY * 2;

  const x = clamp(anchor[0], boxWidth * 0.5 + 1, canvasWidth - boxWidth * 0.5 - 1);
  const y = clamp(anchor[1] - labelStyle.offsetY, boxHeight * 0.5 + 1, canvasHeight - boxHeight * 0.5 - 1);
  const left = x - boxWidth * 0.5;
  const top = y - boxHeight * 0.5;

  ctx.fillStyle = labelStyle.backgroundColor;
  ctx.strokeStyle = labelStyle.borderColor;
  ctx.lineWidth = labelStyle.borderWidth;
  drawRoundedRect(ctx, left, top, boxWidth, boxHeight, labelStyle.borderRadius);
  ctx.fill();
  if (labelStyle.borderWidth > 0) {
    ctx.stroke();
  }

  ctx.fillStyle = labelStyle.textColor;
  ctx.fillText(label, x, y + 0.5);
  ctx.restore();
}

function drawAreaTooltipBox(
  ctx: CanvasRenderingContext2D,
  text: string,
  cursorScreen: DrawCoordinate,
  canvasWidth: number,
  canvasHeight: number,
  style: DrawAreaTooltipStyle,
  offsetX: number,
  offsetY: number
): void {
  const label = text.trim();
  if (!label) return;

  ctx.save();
  ctx.font = `${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const textWidth = ctx.measureText(label).width;
  const boxWidth = textWidth + style.paddingX * 2;
  const boxHeight = style.fontSize + style.paddingY * 2;

  const x = clamp(cursorScreen[0] + offsetX, boxWidth * 0.5 + 1, canvasWidth - boxWidth * 0.5 - 1);
  const y = clamp(cursorScreen[1] + offsetY, boxHeight * 0.5 + 1, canvasHeight - boxHeight * 0.5 - 1);
  const left = x - boxWidth * 0.5;
  const top = y - boxHeight * 0.5;

  ctx.fillStyle = style.backgroundColor;
  drawRoundedRect(ctx, left, top, boxWidth, boxHeight, style.borderRadius);
  ctx.fill();

  ctx.fillStyle = style.textColor;
  ctx.fillText(label, x, y + 0.5);
  ctx.restore();
}

function clampWorld(coord: DrawCoordinate, imageWidth: number, imageHeight: number): DrawCoordinate {
  return [clamp(coord[0], 0, imageWidth), clamp(coord[1], 0, imageHeight)];
}

function toCoord(value: DrawCoordinate | number[]): DrawCoordinate | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const x = Number(value[0]);
  const y = Number(value[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [x, y];
}

export function DrawLayer({
  tool,
  imageWidth,
  imageHeight,
  imageMpp,
  imageZoom,
  stampOptions,
  brushOptions,
  projectorRef,
  onBrushTap,
  onDrawComplete,
  onPatchComplete,
  enabled,
  viewStateSignal,
  persistedRegions,
  patchRegions,
  persistedPolygons,
  drawFillColor,
  regionStrokeStyle,
  regionStrokeHoverStyle,
  regionStrokeActiveStyle,
  patchStrokeStyle,
  resolveRegionStrokeStyle,
  resolveRegionLabelStyle: resolveRegionLabelStyleProp,
  overlayShapes,
  hoveredRegionId = null,
  activeRegionId = null,
  regionLabelStyle,
  drawAreaTooltip,
  autoLiftRegionLabelAtMaxZoom = false,
  regionLabelAutoLiftOffsetPx,
  invalidateRef,
  className,
  style,
}: DrawLayerProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawPendingRef = useRef(false);
  const overlayDebugSnapshotRef = useRef<Map<string, string>>(new Map());
  const lastToolRef = useRef<DrawTool>(tool);
  const sessionRef = useRef<DrawSession>({
    isDrawing: false,
    pointerId: null,
    start: null,
    current: null,
    cursor: null,
    cursorScreen: null,
    points: [],
    screenPoints: [],
    stampCenter: null,
  });

  const active = enabled ?? tool !== "cursor";
  const mergedPersistedRegions = useMemo<DrawRegion[]>(() => {
    if (persistedRegions && persistedRegions.length > 0) {
      return persistedRegions;
    }
    if (!persistedPolygons || persistedPolygons.length === 0) {
      return EMPTY_REGIONS;
    }
    return persistedPolygons.map((coordinates, index) => ({
      id: index,
      coordinates,
    }));
  }, [persistedRegions, persistedPolygons]);
  const mergedPatchRegions = useMemo<DrawRegion[]>(() => patchRegions ?? EMPTY_REGIONS, [patchRegions]);
  const preparedPersistedRegions = useMemo<PreparedRenderedRegion[]>(() => {
    const out: PreparedRenderedRegion[] = [];
    for (let i = 0; i < mergedPersistedRegions.length; i += 1) {
      const region = mergedPersistedRegions[i];
      const polygons = normalizeDrawRegionPolygons(region.coordinates);
      if (polygons.length === 0) continue;
      out.push({
        region,
        regionIndex: i,
        regionKey: region.id ?? i,
        polygons,
      });
    }
    return out;
  }, [mergedPersistedRegions]);
  const preparedPatchRegions = useMemo<PreparedRenderedRegion[]>(() => {
    const out: PreparedRenderedRegion[] = [];
    for (let i = 0; i < mergedPatchRegions.length; i += 1) {
      const region = mergedPatchRegions[i];
      const polygons = normalizeDrawRegionPolygons(region.coordinates);
      if (polygons.length === 0) continue;
      out.push({
        region,
        regionIndex: i,
        regionKey: region.id ?? i,
        polygons,
      });
    }
    return out;
  }, [mergedPatchRegions]);

  const resolvedStrokeStyle = useMemo(() => resolveStrokeStyle(regionStrokeStyle), [regionStrokeStyle]);
  const resolvedHoverStrokeStyle = useMemo(() => mergeStrokeStyle(resolvedStrokeStyle, regionStrokeHoverStyle), [resolvedStrokeStyle, regionStrokeHoverStyle]);
  const resolvedActiveStrokeStyle = useMemo(() => mergeStrokeStyle(resolvedStrokeStyle, regionStrokeActiveStyle), [resolvedStrokeStyle, regionStrokeActiveStyle]);
  const resolvedPatchStrokeStyle = useMemo(() => mergeStrokeStyle(DEFAULT_PATCH_STROKE_STYLE, patchStrokeStyle), [patchStrokeStyle]);
  const resolvedDrawPreviewFillColor = useMemo(() => resolveDrawPreviewFillColor(drawFillColor), [drawFillColor]);

  const resolvedLabelStyle = useMemo(() => resolveRegionLabelStyle(regionLabelStyle), [regionLabelStyle]);
  const resolvedDrawAreaTooltipOptions = useMemo(() => resolveDrawAreaTooltipOptions(drawAreaTooltip), [drawAreaTooltip]);
  const resolvedStampOptions = useMemo(() => resolveStampOptions(stampOptions), [stampOptions]);
  const resolvedBrushOptions = useMemo(() => resolveBrushOptions(brushOptions), [brushOptions]);

  const mergedStyle = useMemo<CSSProperties>(
    () => ({
      position: "absolute",
      inset: 0,
      zIndex: 2,
      width: "100%",
      height: "100%",
      display: "block",
      touchAction: "none",
      pointerEvents: active ? "auto" : "none",
      cursor: active ? (tool === "brush" ? "none" : "crosshair") : "default",
      ...style,
    }),
    [active, tool, style]
  );

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }, []);

  const worldToScreenPoints = useCallback(
    (points: DrawCoordinate[]): DrawCoordinate[] => {
      const projector = projectorRef.current;
      if (!projector || points.length === 0) return [];

      const out = new Array<DrawCoordinate>(points.length);
      for (let i = 0; i < points.length; i += 1) {
        const coord = toCoord(projector.worldToScreen(points[i][0], points[i][1]));
        if (!coord) return [];
        out[i] = coord;
      }
      return out;
    },
    [projectorRef]
  );

  const localScreenToWorld = useCallback(
    (screen: DrawCoordinate): DrawCoordinate | null => {
      const projector = projectorRef.current;
      const canvas = canvasRef.current;
      if (!projector || !canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const raw = toCoord(projector.screenToWorld(rect.left + screen[0], rect.top + screen[1]));
      if (!raw) return null;
      return clampWorld(raw, imageWidth, imageHeight);
    },
    [projectorRef, imageWidth, imageHeight]
  );

  const getRectangleProjection = useCallback(() => {
    const projector = projectorRef.current;
    const rotationDeg = projector?.getViewState?.().rotationDeg ?? 0;
    if (Math.abs(rotationDeg % 360) < 0.01 || !projector) return undefined;

    return {
      worldToScreen: (x: number, y: number): DrawCoordinate | null =>
        toCoord(projector.worldToScreen(x, y)),
      screenToWorld: localScreenToWorld,
    };
  }, [projectorRef, localScreenToWorld]);

  const micronsToWorldPixels = useCallback(
    (lengthUm: number): number => {
      if (!Number.isFinite(lengthUm) || lengthUm <= 0) return 0;

      // If mpp is missing, fall back to 1um/px assumption.
      const mppValue = typeof imageMpp === "number" && Number.isFinite(imageMpp) && imageMpp > 0 ? imageMpp : 1;
      const imageZoomValue = typeof imageZoom === "number" && Number.isFinite(imageZoom) ? imageZoom : 0;
      const viewZoomRaw = projectorRef.current?.getViewState?.().zoom;
      const viewZoom = typeof viewZoomRaw === "number" && Number.isFinite(viewZoomRaw) && viewZoomRaw > 0 ? viewZoomRaw : 1;
      const continuousZoom = imageZoomValue + Math.log2(viewZoom);
      const umPerScreenPixel = Math.max(1e-9, calcScaleResolution(mppValue, imageZoomValue, continuousZoom));
      const screenPixels = lengthUm / umPerScreenPixel;
      return screenPixels / viewZoom;
    },
    [imageMpp, imageZoom, projectorRef]
  );

  const buildStampCoords = useCallback(
    (stampTool: StampDrawTool, center: DrawCoordinate | null): DrawCoordinate[] => {
      if (!center) return [];

      let areaMm2 = 0;
      if (stampTool === "stamp-rectangle-4096px") {
        const halfLength = resolvedStampOptions.rectanglePixelSize * 0.5;
        return createSquareFromCenter(center, halfLength, getRectangleProjection()).map(point => clampWorld(point, imageWidth, imageHeight));
      }

      if (stampTool === "stamp-rectangle" || stampTool === "stamp-rectangle-2mm2") {
        areaMm2 = stampTool === "stamp-rectangle-2mm2" ? DEFAULT_STAMP_RECTANGLE_AREA_MM2 : resolvedStampOptions.rectangleAreaMm2;
      } else if (stampTool === "stamp-circle" || stampTool === "stamp-circle-2mm2" || stampTool === "stamp-circle-hpf-0.2mm2") {
        areaMm2 = stampTool === "stamp-circle-hpf-0.2mm2" ? LEGACY_HPF_CIRCLE_AREA_MM2 : stampTool === "stamp-circle-2mm2" ? DEFAULT_STAMP_CIRCLE_AREA_MM2 : resolvedStampOptions.circleAreaMm2;
      }
      if (!Number.isFinite(areaMm2) || areaMm2 <= 0) return [];

      const areaUm2 = mm2ToUm2(areaMm2);
      let coords: DrawCoordinate[] = [];
      if (stampTool === "stamp-rectangle" || stampTool === "stamp-rectangle-2mm2") {
        const halfLength = micronsToWorldPixels(Math.sqrt(areaUm2) * 0.5);
        coords = createSquareFromCenter(center, halfLength, getRectangleProjection());
      } else if (stampTool === "stamp-circle" || stampTool === "stamp-circle-2mm2" || stampTool === "stamp-circle-hpf-0.2mm2") {
        const radius = micronsToWorldPixels(Math.sqrt(areaUm2 / Math.PI));
        coords = createCircleFromCenter(center, radius);
      }

      if (!coords.length) return [];
      return coords.map(point => clampWorld(point, imageWidth, imageHeight));
    },
    [micronsToWorldPixels, imageWidth, imageHeight, resolvedStampOptions, getRectangleProjection]
  );

  const buildPreviewCoords = useCallback((): DrawCoordinate[] => {
    const session = sessionRef.current;
    if (isStampTool(tool)) {
      return buildStampCoords(tool, session.stampCenter);
    }
    if (tool === "brush") {
      return [];
    }
    if (!session.isDrawing) return [];

    if (tool === "freehand") {
      return session.points;
    }
    if (tool === "rectangle") {
      return createRectangle(session.start, session.current, getRectangleProjection());
    }
    if (tool === "circular") {
      return createCircle(session.start, session.current);
    }

    return [];
  }, [tool, buildStampCoords, getRectangleProjection]);

  const drawBrushStrokePreview = useCallback(
    (ctx: CanvasRenderingContext2D): void => {
      const session = sessionRef.current;
      if (!session.isDrawing || session.screenPoints.length === 0) return;
      const screenPoints = session.screenPoints;
      if (screenPoints.length === 0) return;
      const radiusPx = resolvedBrushOptions.radius;
      if (!Number.isFinite(radiusPx) || radiusPx <= 0) return;

      ctx.save();
      ctx.globalAlpha = resolvedBrushOptions.fillOpacity;
      ctx.fillStyle = resolvedBrushOptions.fillColor;
      ctx.strokeStyle = resolvedBrushOptions.fillColor;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = radiusPx * 2;
      if (screenPoints.length === 1) {
        ctx.beginPath();
        ctx.arc(screenPoints[0][0], screenPoints[0][1], radiusPx, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(screenPoints[0][0], screenPoints[0][1]);
        for (let i = 1; i < screenPoints.length; i += 1) {
          ctx.lineTo(screenPoints[i][0], screenPoints[i][1]);
        }
        ctx.stroke();
      }
      ctx.restore();
    },
    [resolvedBrushOptions]
  );

  const drawBrushCursor = useCallback(
    (ctx: CanvasRenderingContext2D): void => {
      const session = sessionRef.current;
      const cursor = session.cursor;
      if (!cursor) return;
      const screen =
        session.cursorScreen ??
        toCoord(projectorRef.current?.worldToScreen(cursor[0], cursor[1]) ?? []);
      if (!screen) return;
      const radiusPx = resolvedBrushOptions.radius;
      if (!Number.isFinite(radiusPx) || radiusPx <= 0) return;

      ctx.save();
      ctx.beginPath();
      ctx.arc(screen[0], screen[1], radiusPx, 0, Math.PI * 2);
      ctx.strokeStyle = session.isDrawing ? resolvedBrushOptions.cursorActiveColor : resolvedBrushOptions.cursorColor;
      ctx.lineWidth = resolvedBrushOptions.cursorLineWidth;
      ctx.setLineDash(resolvedBrushOptions.cursorLineDash);
      ctx.stroke();
      ctx.setLineDash(EMPTY_DASH);
      ctx.restore();
    },
    [projectorRef, resolvedBrushOptions]
  );

  const drawOverlay = useCallback(() => {
    resizeCanvas();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const canvasWidth = canvas.width / dpr;
    const canvasHeight = canvas.height / dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Persisted ROI outlines always remain visible.
    if (preparedPersistedRegions.length > 0) {
      for (const entry of preparedPersistedRegions) {
        const { region, polygons, regionIndex, regionKey } = entry;
        const state: RegionStyleContext["state"] = isSameRegionId(activeRegionId, regionKey) ? "active" : isSameRegionId(hoveredRegionId, regionKey) ? "hover" : "default";
        let strokeStyle = state === "active" ? resolvedActiveStrokeStyle : state === "hover" ? resolvedHoverStrokeStyle : resolvedStrokeStyle;

        if (resolveRegionStrokeStyle) {
          const resolved = resolveRegionStrokeStyle({
            region,
            regionId: regionKey,
            regionIndex,
            state,
          });
          strokeStyle = mergeStrokeStyle(strokeStyle, resolved || undefined);
        }
        const interactionShadowStyle = state === "default" ? null : resolveRegionInteractionShadowStyle(strokeStyle);

        for (const polygon of polygons) {
          const screenOuter = worldToScreenPoints(polygon.outer);
          if (screenOuter.length >= 4) {
            if (interactionShadowStyle) {
              drawPath(ctx, screenOuter, interactionShadowStyle, true, false);
            }
            drawPath(ctx, screenOuter, strokeStyle, true, false);
          }
          for (const hole of polygon.holes) {
            const screenHole = worldToScreenPoints(hole);
            if (screenHole.length >= 4) {
              if (interactionShadowStyle) {
                drawPath(ctx, screenHole, interactionShadowStyle, true, false);
              }
              drawPath(ctx, screenHole, strokeStyle, true, false);
            }
          }
        }
      }
    }

    if (preparedPatchRegions.length > 0) {
      for (const entry of preparedPatchRegions) {
        for (const polygon of entry.polygons) {
          const screenOuter = worldToScreenPoints(polygon.outer);
          if (screenOuter.length >= 4) {
            drawPath(ctx, screenOuter, resolvedPatchStrokeStyle, true, false);
          }
          for (const hole of polygon.holes) {
            const screenHole = worldToScreenPoints(hole);
            if (screenHole.length >= 4) {
              drawPath(ctx, screenHole, resolvedPatchStrokeStyle, true, false);
            }
          }
        }
      }
    }

    if (Array.isArray(overlayShapes) && overlayShapes.length > 0) {
      const debugOverlay = Boolean((globalThis as { __OPEN_PLANT_DEBUG_OVERLAY__?: boolean }).__OPEN_PLANT_DEBUG_OVERLAY__);
      const imageOuterRing = worldToScreenPoints(
        closeRing([
          [0, 0],
          [imageWidth, 0],
          [imageWidth, imageHeight],
          [0, imageHeight],
        ])
      );
      for (let i = 0; i < overlayShapes.length; i += 1) {
        const shape = overlayShapes[i];
        if (!shape?.coordinates?.length || shape.visible === false) continue;

        const closed = shape.closed ?? isNestedRingCoordinates(shape.coordinates);
        const renderRings = normalizeOverlayRings(shape.coordinates, closed);

        if (shape.invertedFill?.fillColor) {
          const holeRings: DrawCoordinate[][] = [];
          const closedRings = normalizeOverlayRings(shape.coordinates, true);
          for (const ring of closedRings) {
            const screen = worldToScreenPoints(ring);
            if (screen.length >= 4) {
              holeRings.push(screen);
            }
          }
          if (debugOverlay) {
            const debugKey = String(shape.id ?? i);
            const debugSignature = `${imageOuterRing.length}|${closedRings.length}|${holeRings.length}|${shape.invertedFill.fillColor}`;
            if (overlayDebugSnapshotRef.current.get(debugKey) !== debugSignature) {
              overlayDebugSnapshotRef.current.set(debugKey, debugSignature);
              console.debug("[open-plant] invertedFill", {
                id: shape.id ?? i,
                outerRingPoints: imageOuterRing.length,
                sourceRingCount: closedRings.length,
                holeRingCount: holeRings.length,
                fillColor: shape.invertedFill.fillColor,
              });
            }
          }
          drawInvertedFillMask(ctx, imageOuterRing, holeRings, shape.invertedFill.fillColor);
        }

        if (renderRings.length === 0) continue;
        const strokeStyle = mergeStrokeStyle(resolvedStrokeStyle, shape.stroke ?? shape.strokeStyle);
        for (const ring of renderRings) {
          const screen = worldToScreenPoints(ring);
          if (screen.length < 2) continue;
          drawPath(ctx, screen, strokeStyle, closed, shape.fill ?? false);
        }
      }
    }

    const preview = buildPreviewCoords();

    if (active) {
      if (tool === "brush") {
        drawBrushStrokePreview(ctx);
        drawBrushCursor(ctx);
      } else if (preview.length > 0) {
        if (tool === "freehand") {
          const line = worldToScreenPoints(preview);
          if (line.length >= 2) {
            drawPath(ctx, line, resolvedStrokeStyle, false, false);
          }
          if (line.length >= 3) {
            drawPath(ctx, worldToScreenPoints(closeRing(preview)), resolvedStrokeStyle, true, true, resolvedDrawPreviewFillColor);
          }
        } else {
          const polygon = worldToScreenPoints(preview);
          if (polygon.length >= 4) {
            drawPath(ctx, polygon, resolvedStrokeStyle, true, true, resolvedDrawPreviewFillColor);
          }
        }
      }
    }

    // Draw labels last so they stay visually on top.
    if (preparedPersistedRegions.length > 0) {
      const zoom = Math.max(1e-6, projectorRef.current?.getViewState?.().zoom ?? 1);
      const labelAutoLiftOffset =
        typeof regionLabelAutoLiftOffsetPx === "number" && Number.isFinite(regionLabelAutoLiftOffsetPx)
          ? Math.max(0, regionLabelAutoLiftOffsetPx)
          : resolveRegionLabelAutoLiftOffsetPx(autoLiftRegionLabelAtMaxZoom, zoom, projectorRef.current?.getZoomRange?.());
      for (const entry of preparedPersistedRegions) {
        if (!entry.region.label) continue;
        const anchorWorld = getTopAnchorFromPolygons(entry.polygons);
        if (!anchorWorld) continue;
        const anchorScreen = toCoord(projectorRef.current?.worldToScreen(anchorWorld[0], anchorWorld[1]) ?? []);
        if (!anchorScreen) continue;
        let dynamicLabelStyle = mergeRegionLabelStyle(
          resolvedLabelStyle,
          resolveRegionLabelStyleProp?.({
            region: entry.region,
            regionId: entry.regionKey,
            regionIndex: entry.regionIndex,
            zoom,
          })
        );
        if (labelAutoLiftOffset > 0) {
          dynamicLabelStyle = {
            ...dynamicLabelStyle,
            offsetY: dynamicLabelStyle.offsetY + labelAutoLiftOffset,
          };
        }
        drawRegionLabel(ctx, entry.region.label, anchorScreen, canvasWidth, canvasHeight, dynamicLabelStyle);
      }
    }

    if (resolvedDrawAreaTooltipOptions.enabled && active && (tool === "freehand" || tool === "rectangle" || tool === "circular")) {
      const session = sessionRef.current;
      if (session.isDrawing) {
        const areaCoords = tool === "freehand" ? closeRing(preview) : preview;
        if (areaCoords.length >= 4) {
          const areaPx = polygonArea(areaCoords);
          const mpp = typeof imageMpp === "number" && Number.isFinite(imageMpp) && imageMpp > 0 ? imageMpp : 0;
          const areaMm2 = mpp > 0 ? (areaPx * mpp * mpp) / (MICRONS_PER_MM * MICRONS_PER_MM) : 0;
          let text = defaultDrawAreaTooltipFormatter(areaMm2);
          try {
            text = resolvedDrawAreaTooltipOptions.format(areaMm2);
          } catch {
            text = defaultDrawAreaTooltipFormatter(areaMm2);
          }

          const cursor =
            session.cursorScreen ??
            (session.current ? toCoord(projectorRef.current?.worldToScreen(session.current[0], session.current[1]) ?? []) : null);
          if (cursor) {
            drawAreaTooltipBox(
              ctx,
              text,
              cursor,
              canvasWidth,
              canvasHeight,
              resolvedDrawAreaTooltipOptions.style,
              resolvedDrawAreaTooltipOptions.cursorOffsetX,
              resolvedDrawAreaTooltipOptions.cursorOffsetY
            );
          }
        }
      }
    }
  }, [
    active,
    tool,
    buildPreviewCoords,
    drawBrushStrokePreview,
    drawBrushCursor,
    resizeCanvas,
    worldToScreenPoints,
    imageWidth,
    imageHeight,
    projectorRef,
    preparedPersistedRegions,
    overlayShapes,
    hoveredRegionId,
    activeRegionId,
    resolvedStrokeStyle,
    resolvedHoverStrokeStyle,
    resolvedActiveStrokeStyle,
    resolvedDrawPreviewFillColor,
    preparedPatchRegions,
    resolvedPatchStrokeStyle,
    resolveRegionStrokeStyle,
    resolveRegionLabelStyleProp,
    resolvedLabelStyle,
    resolvedDrawAreaTooltipOptions,
    autoLiftRegionLabelAtMaxZoom,
    regionLabelAutoLiftOffsetPx,
    imageMpp,
  ]);

  const requestDraw = useCallback(() => {
    if (drawPendingRef.current) return;
    drawPendingRef.current = true;
    requestAnimationFrame(() => {
      drawPendingRef.current = false;
      drawOverlay();
    });
  }, [drawOverlay]);

  const resetSession = useCallback((preserveCursor = false) => {
    const session = sessionRef.current;
    const canvas = canvasRef.current;

    if (canvas && session.pointerId !== null && canvas.hasPointerCapture(session.pointerId)) {
      try {
        canvas.releasePointerCapture(session.pointerId);
      } catch {
        // noop
      }
    }

    session.isDrawing = false;
    session.pointerId = null;
    session.start = null;
    session.current = null;
    session.points = [];
    session.screenPoints = [];
    session.stampCenter = null;
    if (!preserveCursor) {
      session.cursor = null;
      session.cursorScreen = null;
    }
  }, []);

  const toWorld = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>): DrawCoordinate | null => {
      const projector = projectorRef.current;
      if (!projector || imageWidth <= 0 || imageHeight <= 0) return null;

      const raw = toCoord(projector.screenToWorld(event.clientX, event.clientY));
      if (!raw) return null;
      return clampWorld(raw, imageWidth, imageHeight);
    },
    [projectorRef, imageWidth, imageHeight]
  );

  const toLocalScreen = useCallback((event: ReactPointerEvent<HTMLCanvasElement>): DrawCoordinate | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, 0, rect.width);
    const y = clamp(event.clientY - rect.top, 0, rect.height);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return [x, y];
  }, []);

  const finishSession = useCallback(() => {
    const session = sessionRef.current;
    if (!session.isDrawing) {
      resetSession(true);
      requestDraw();
      return;
    }

    let coordinates: DrawCoordinate[] = [];
    if (tool === "freehand") {
      if (session.points.length >= FREEHAND_MIN_POINTS) {
        coordinates = closeRing(session.points);
      }
    } else if (tool === "rectangle") {
      coordinates = createRectangle(session.start, session.current, getRectangleProjection());
    } else if (tool === "circular") {
      coordinates = createCircle(session.start, session.current);
    } else if (tool === "brush") {
      const tapPoint = session.points[session.points.length - 1] ?? session.current ?? session.start;
      if (resolvedBrushOptions.clickSelectRoi && tapPoint && session.points.length <= 1 && onBrushTap?.(tapPoint)) {
        resetSession(true);
        requestDraw();
        return;
      }
      const edgeDetail = resolvedBrushOptions.edgeDetail;
      const minRasterStep = Math.max(
        MIN_BRUSH_RASTER_STEP,
        (resolvedBrushOptions.radius * 2) / (BRUSH_RASTER_DIAMETER_SAMPLES * edgeDetail),
      );
      const screenPath =
        session.screenPoints.length > 0
          ? session.screenPoints
          : worldToScreenPoints(session.points);
      const screenPolygon = buildBrushStrokePolygon(screenPath, {
        radius: resolvedBrushOptions.radius,
        minRasterStep,
        circleSides: Math.max(24, Math.round(64 * edgeDetail)),
        simplifyTolerance: minRasterStep * 0.25,
        smoothingPasses: resolvedBrushOptions.edgeSmoothing,
      }) as DrawCoordinate[];
      const worldPolygon: DrawCoordinate[] = [];
      for (const point of screenPolygon) {
        const world = localScreenToWorld(point);
        if (!world) continue;
        worldPolygon.push(world);
      }
      coordinates = closeRing(worldPolygon);
    }

    if ((tool === "freehand" || tool === "rectangle" || tool === "circular" || tool === "brush") && isValidPolygon(coordinates) && onDrawComplete) {
      const intent: DrawIntent = tool === "brush" ? "brush" : "roi";
      onDrawComplete({
        tool,
        intent,
        coordinates,
        bbox: computeBounds(coordinates),
        areaPx: polygonArea(coordinates),
      });
    }

    resetSession(true);
    requestDraw();
  }, [tool, onDrawComplete, resetSession, requestDraw, worldToScreenPoints, localScreenToWorld, getRectangleProjection, resolvedBrushOptions.radius, resolvedBrushOptions.edgeDetail, resolvedBrushOptions.edgeSmoothing, resolvedBrushOptions.clickSelectRoi, onBrushTap]);

  const handleStampAt = useCallback(
    (stampTool: StampDrawTool, center: DrawCoordinate): void => {
      const coordinates = buildStampCoords(stampTool, center);
      if (!isValidPolygon(coordinates)) return;
      const intent: DrawIntent = stampTool === "stamp-rectangle-4096px" ? "patch" : "roi";
      const result: DrawResult = {
        tool: stampTool,
        intent,
        coordinates,
        bbox: computeBounds(coordinates),
        areaPx: polygonArea(coordinates),
      };
      onDrawComplete?.(result);
      if (intent === "patch" && onPatchComplete) {
        onPatchComplete(result as PatchDrawResult);
      }
    },
    [buildStampCoords, onDrawComplete, onPatchComplete]
  );

  const appendBrushPoint = useCallback(
    (session: DrawSession, world: DrawCoordinate, screen: DrawCoordinate): void => {
      const minScreenStep2 = BRUSH_SCREEN_STEP * BRUSH_SCREEN_STEP;
      const prevScreen = session.screenPoints[session.screenPoints.length - 1];
      if (!prevScreen) {
        session.points.push(world);
        session.screenPoints.push(screen);
        session.current = world;
        return;
      }
      const dx = screen[0] - prevScreen[0];
      const dy = screen[1] - prevScreen[1];
      if (dx * dx + dy * dy >= minScreenStep2) {
        session.points.push(world);
        session.screenPoints.push(screen);
      } else {
        session.points[session.points.length - 1] = world;
        session.screenPoints[session.screenPoints.length - 1] = screen;
      }
      session.current = world;
    },
    []
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!active) return;
      if (tool === "cursor") return;
      if (event.button !== 0) return;

      const world = toWorld(event);
      if (!world) return;
      const screen = toLocalScreen(event);
      if (!screen) return;

      event.preventDefault();
      event.stopPropagation();

      if (isStampTool(tool)) {
        const session = sessionRef.current;
        session.stampCenter = world;
        handleStampAt(tool, world);
        requestDraw();
        return;
      }

      const canvas = canvasRef.current;
      if (canvas) {
        canvas.setPointerCapture(event.pointerId);
      }

      const session = sessionRef.current;
      session.isDrawing = true;
      session.pointerId = event.pointerId;
      session.start = world;
      session.current = world;
      session.cursor = world;
      session.cursorScreen = screen;
      session.points = tool === "freehand" || tool === "brush" ? [world] : [];
      session.screenPoints = tool === "brush" ? [screen] : [];
      requestDraw();
    },
    [active, tool, toWorld, toLocalScreen, handleStampAt, requestDraw]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!active) return;
      if (tool === "cursor") return;

      const world = toWorld(event);
      if (!world) return;
      const screen = toLocalScreen(event);
      if (!screen) return;

      const session = sessionRef.current;
      session.cursor = world;
      session.cursorScreen = screen;

      if (isStampTool(tool)) {
        session.stampCenter = world;
        event.preventDefault();
        event.stopPropagation();
        requestDraw();
        return;
      }

      if (tool === "brush") {
        if (!session.isDrawing || session.pointerId !== event.pointerId) {
          requestDraw();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        appendBrushPoint(session, world, screen);
        requestDraw();
        return;
      }

      if (!session.isDrawing || session.pointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();

      if (tool === "freehand") {
        const projector = projectorRef.current;
        const zoom = Math.max(1e-6, projector?.getViewState?.().zoom ?? 1);
        const minWorldStep = FREEHAND_SCREEN_STEP / zoom;
        const minWorldStep2 = minWorldStep * minWorldStep;
        const prev = session.points[session.points.length - 1];

        if (!prev) {
          session.points.push(world);
        } else {
          const dx = world[0] - prev[0];
          const dy = world[1] - prev[1];
          if (dx * dx + dy * dy >= minWorldStep2) {
            session.points.push(world);
          }
        }
      } else {
        session.current = world;
      }

      requestDraw();
    },
    [active, tool, toWorld, toLocalScreen, requestDraw, projectorRef, appendBrushPoint]
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const session = sessionRef.current;
      if (!session.isDrawing || session.pointerId !== event.pointerId) return;

      event.preventDefault();
      event.stopPropagation();
      const world = toWorld(event);
      const screen = toLocalScreen(event);
      if (world) {
        session.cursor = world;
        if (screen) {
          session.cursorScreen = screen;
        }
        if (tool === "brush") {
          if (screen) {
            appendBrushPoint(session, world, screen);
          }
        } else {
          session.current = world;
        }
      }
      const canvas = canvasRef.current;
      if (canvas && canvas.hasPointerCapture(event.pointerId)) {
        try {
          canvas.releasePointerCapture(event.pointerId);
        } catch {
          // noop
        }
      }

      finishSession();
    },
    [finishSession, toWorld, toLocalScreen, tool, appendBrushPoint]
  );

  const handlePointerLeave = useCallback(() => {
    const session = sessionRef.current;
    let changed = false;
    if (tool === "brush" && !session.isDrawing && session.cursor) {
      session.cursor = null;
      session.cursorScreen = null;
      changed = true;
    }
    if (isStampTool(tool) && session.stampCenter) {
      session.stampCenter = null;
      changed = true;
    }
    if (changed) {
      requestDraw();
    }
  }, [tool, requestDraw]);

  useEffect(() => {
    resizeCanvas();
    requestDraw();

    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const observer = new ResizeObserver(() => {
      resizeCanvas();
      requestDraw();
    });
    observer.observe(canvas);

    return () => {
      observer.disconnect();
    };
  }, [resizeCanvas, requestDraw]);

  useEffect(() => {
    if (!active) {
      resetSession();
    }
    requestDraw();
  }, [active, requestDraw, resetSession]);

  useEffect(() => {
    if (lastToolRef.current === tool) {
      return;
    }
    lastToolRef.current = tool;
    resetSession();
    requestDraw();
  }, [tool, resetSession, requestDraw]);

  useEffect(() => {
    requestDraw();
  }, [viewStateSignal, mergedPersistedRegions, overlayShapes, requestDraw]);

  useEffect(() => {
    if (!invalidateRef) return undefined;
    invalidateRef.current = requestDraw;
    return () => {
      if (invalidateRef.current === requestDraw) {
        invalidateRef.current = null;
      }
    };
  }, [invalidateRef, requestDraw]);

  useEffect(() => {
    if (!active) return undefined;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      resetSession();
      requestDraw();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [active, resetSession, requestDraw]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={mergedStyle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onContextMenu={event => {
        if (active) event.preventDefault();
      }}
      onWheel={event => {
        if (!active) return;
        const canvas = canvasRef.current;
        const projector = projectorRef.current;
        if (!canvas || typeof projector?.zoomBy !== "function") return;
        event.preventDefault();
        event.stopPropagation();
        const rect = canvas.getBoundingClientRect();
        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;
        projector.zoomBy(event.deltaY < 0 ? WHEEL_ZOOM_IN_FACTOR : WHEEL_ZOOM_OUT_FACTOR, screenX, screenY);
        requestDraw();
      }}
    />
  );
}
