import { type PreparedRoiPolygon, prepareRoiPolygons, toRoiGeometry } from "../wsi/roi-geometry";
import type { WsiRegion } from "../wsi/types";
import { clamp } from "../wsi/utils";
import type { WsiTileRenderer } from "../wsi/wsi-tile-renderer";
import type { DrawCoordinate, RegionLabelStyle, RegionLabelStyleResolver } from "./draw-layer";
import { mergeRegionLabelStyle } from "./draw-layer";

const TOP_ANCHOR_Y_TOLERANCE = 0.5;
const LABEL_MEASURE_FALLBACK_EM = 0.58;
const LABEL_MEASURE_CACHE_LIMIT = 4096;
const REGION_CONTOUR_HIT_DISTANCE_PX = 6;

let sharedLabelMeasureContext: CanvasRenderingContext2D | null = null;
const labelTextWidthCache = new Map<string, number>();

export interface PreparedRegionHit {
  region: WsiRegion;
  regionIndex: number;
  regionId: string | number;
  polygons: PreparedRoiPolygon[];
  label: string;
  labelAnchor: DrawCoordinate | null;
}

export function measureLabelTextWidth(label: string, labelStyle: RegionLabelStyle): number {
  const key = `${labelStyle.fontWeight}|${labelStyle.fontSize}|${labelStyle.fontFamily}|${label}`;
  const cached = labelTextWidthCache.get(key);
  if (cached !== undefined) return cached;

  const fallback = label.length * labelStyle.fontSize * LABEL_MEASURE_FALLBACK_EM;
  const ctx = getLabelMeasureContext();
  let width = fallback;
  if (ctx) {
    ctx.font = `${labelStyle.fontWeight} ${labelStyle.fontSize}px ${labelStyle.fontFamily}`;
    const measured = ctx.measureText(label).width;
    if (Number.isFinite(measured) && measured >= 0) {
      width = measured;
    }
  }

  if (labelTextWidthCache.size > LABEL_MEASURE_CACHE_LIMIT) {
    labelTextWidthCache.clear();
  }
  labelTextWidthCache.set(key, width);
  return width;
}

function getLabelMeasureContext(): CanvasRenderingContext2D | null {
  if (sharedLabelMeasureContext) return sharedLabelMeasureContext;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  sharedLabelMeasureContext = ctx;
  return sharedLabelMeasureContext;
}

function toDrawCoordinate(value: unknown): DrawCoordinate | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const x = Number(value[0]);
  const y = Number(value[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [x, y];
}

export function resolveRegionId(region: WsiRegion, index: number): string | number {
  return region.id ?? index;
}

function getTopAnchor(ring: DrawCoordinate[]): DrawCoordinate | null {
  if (ring.length === 0) return null;
  let minY = Infinity;
  for (const point of ring) {
    if (point[1] < minY) minY = point[1];
  }
  if (!Number.isFinite(minY)) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  for (const point of ring) {
    if (Math.abs(point[1] - minY) > TOP_ANCHOR_Y_TOLERANCE) continue;
    if (point[0] < minX) minX = point[0];
    if (point[0] > maxX) maxX = point[0];
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return null;
  return [(minX + maxX) * 0.5, minY];
}

function getTopAnchorFromPreparedPolygons(polygons: PreparedRoiPolygon[]): DrawCoordinate | null {
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

function pointSegmentDistanceSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const lengthSq = abx * abx + aby * aby;
  if (lengthSq <= 1e-12) {
    const dx = px - ax;
    const dy = py - ay;
    return dx * dx + dy * dy;
  }
  const t = clamp(((px - ax) * abx + (py - ay) * aby) / lengthSq, 0, 1);
  const nx = ax + abx * t;
  const ny = ay + aby * t;
  const dx = px - nx;
  const dy = py - ny;
  return dx * dx + dy * dy;
}

function isPointNearRing(x: number, y: number, ring: DrawCoordinate[], maxDistanceSq: number): boolean {
  for (let i = 1; i < ring.length; i += 1) {
    const prev = ring[i - 1];
    const next = ring[i];
    if (pointSegmentDistanceSq(x, y, prev[0], prev[1], next[0], next[1]) <= maxDistanceSq) {
      return true;
    }
  }
  return false;
}

function isPointNearPolygonContour(x: number, y: number, polygon: PreparedRoiPolygon, maxDistance: number): boolean {
  if (x < polygon.minX - maxDistance || x > polygon.maxX + maxDistance || y < polygon.minY - maxDistance || y > polygon.maxY + maxDistance) {
    return false;
  }
  const maxDistanceSq = maxDistance * maxDistance;
  if (isPointNearRing(x, y, polygon.outer, maxDistanceSq)) return true;
  for (const hole of polygon.holes) {
    if (isPointNearRing(x, y, hole, maxDistanceSq)) return true;
  }
  return false;
}

export function isScreenPointInsideLabel(
  region: PreparedRegionHit,
  screenCoord: DrawCoordinate,
  renderer: WsiTileRenderer,
  labelStyle: RegionLabelStyle,
  canvasWidth: number,
  canvasHeight: number
): boolean {
  if (!region.label || !region.labelAnchor) return false;

  const anchorScreen = toDrawCoordinate(renderer.worldToScreen(region.labelAnchor[0], region.labelAnchor[1]));
  if (!anchorScreen) return false;

  const textWidth = measureLabelTextWidth(region.label, labelStyle);
  const boxWidth = textWidth + labelStyle.paddingX * 2;
  const boxHeight = labelStyle.fontSize + labelStyle.paddingY * 2;

  const x = clamp(anchorScreen[0], boxWidth * 0.5 + 1, canvasWidth - boxWidth * 0.5 - 1);
  const y = clamp(anchorScreen[1] - labelStyle.offsetY, boxHeight * 0.5 + 1, canvasHeight - boxHeight * 0.5 - 1);
  const left = x - boxWidth * 0.5;
  const right = x + boxWidth * 0.5;
  const top = y - boxHeight * 0.5;
  const bottom = y + boxHeight * 0.5;

  return screenCoord[0] >= left && screenCoord[0] <= right && screenCoord[1] >= top && screenCoord[1] <= bottom;
}

export function prepareRegionHits(regions: WsiRegion[]): PreparedRegionHit[] {
  const out: PreparedRegionHit[] = [];
  for (let i = 0; i < regions.length; i += 1) {
    const region = regions[i];
    const polygons = prepareRoiPolygons([toRoiGeometry(region?.coordinates)]);
    if (polygons.length === 0) continue;
    const label = typeof region?.label === "string" ? region.label.trim() : "";
    out.push({
      region,
      regionIndex: i,
      regionId: resolveRegionId(region, i),
      polygons,
      label,
      labelAnchor: label ? getTopAnchorFromPreparedPolygons(polygons) : null,
    });
  }
  return out;
}

export function pickPreparedRegionAt(
  coord: DrawCoordinate,
  screenCoord: DrawCoordinate,
  regions: PreparedRegionHit[],
  renderer: WsiTileRenderer,
  labelStyle: RegionLabelStyle,
  labelStyleResolver: RegionLabelStyleResolver | undefined,
  labelAutoLiftOffsetPx: number,
  canvasWidth: number,
  canvasHeight: number
): {
  region: WsiRegion;
  regionIndex: number;
  regionId: string | number;
} | null {
  const x = coord[0];
  const y = coord[1];
  const zoom = Math.max(1e-6, renderer.getViewState().zoom);
  const labelAutoLiftOffset = Math.max(0, labelAutoLiftOffsetPx);
  const contourHitDistance = REGION_CONTOUR_HIT_DISTANCE_PX / zoom;
  for (let i = regions.length - 1; i >= 0; i -= 1) {
    const region = regions[i];
    for (const polygon of region.polygons) {
      if (!isPointNearPolygonContour(x, y, polygon, contourHitDistance)) continue;
      return {
        region: region.region,
        regionIndex: region.regionIndex,
        regionId: region.regionId,
      };
    }
    let dynamicLabelStyle = mergeRegionLabelStyle(
      labelStyle,
      labelStyleResolver?.({
        region: region.region,
        regionId: region.regionId,
        regionIndex: region.regionIndex,
        zoom,
      })
    );
    if (labelAutoLiftOffset > 0) {
      dynamicLabelStyle = {
        ...dynamicLabelStyle,
        offsetY: dynamicLabelStyle.offsetY + labelAutoLiftOffset,
      };
    }
    if (!isScreenPointInsideLabel(region, screenCoord, renderer, dynamicLabelStyle, canvasWidth, canvasHeight)) continue;
    return {
      region: region.region,
      regionIndex: region.regionIndex,
      regionId: region.regionId,
    };
  }
  return null;
}
