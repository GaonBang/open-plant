import { type PreparedRoiPolygon, pointInPreparedPolygon, prepareRoiPolygons, toRoiGeometry } from "./roi-geometry";
import type { WsiPointData, WsiRegion } from "./types";

export interface RoiTermCount {
  termId: string;
  paletteIndex: number;
  count: number;
}

export interface RoiPointGroup {
  regionId: string | number;
  regionIndex: number;
  totalCount: number;
  termCounts: RoiTermCount[];
}

export interface RoiPointGroupOptions {
  paletteIndexToTermId?: ReadonlyMap<number, string> | readonly string[];
  includeEmptyRegions?: boolean;
}

export interface RoiPointGroupStats {
  groups: RoiPointGroup[];
  inputPointCount: number;
  pointsInsideAnyRegion: number;
  unmatchedPointCount: number;
}

interface PreparedRegion {
  regionId: string | number;
  regionIndex: number;
  polygons: PreparedRoiPolygon[];
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function prepareRegions(regions: readonly WsiRegion[]): PreparedRegion[] {
  const prepared: PreparedRegion[] = [];
  for (let i = 0; i < regions.length; i += 1) {
    const region = regions[i];
    const polygons = prepareRoiPolygons([toRoiGeometry(region?.coordinates)]);
    if (polygons.length === 0) continue;

    let area = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const polygon of polygons) {
      area += polygon.area;
      if (polygon.minX < minX) minX = polygon.minX;
      if (polygon.minY < minY) minY = polygon.minY;
      if (polygon.maxX > maxX) maxX = polygon.maxX;
      if (polygon.maxY > maxY) maxY = polygon.maxY;
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) continue;

    prepared.push({
      regionId: region.id ?? i,
      regionIndex: i,
      polygons,
      area: Math.max(1e-6, area),
      minX,
      minY,
      maxX,
      maxY,
    });
  }
  return prepared;
}

interface PreparedRegionGridIndex {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  gridSize: number;
  cellWidth: number;
  cellHeight: number;
  buckets: number[][];
}

const MAX_REGION_GRID_SIZE = 128;
const EMPTY_CANDIDATE_REGION_INDICES: number[] = [];

function toGridCell(value: number, min: number, max: number, cellSize: number, gridSize: number): number {
  if (gridSize <= 1 || max <= min) return 0;
  const ratio = (value - min) / cellSize;
  if (!Number.isFinite(ratio) || ratio <= 0) return 0;
  if (ratio >= gridSize - 1) return gridSize - 1;
  return Math.floor(ratio);
}

function buildPreparedRegionGridIndex(regions: readonly PreparedRegion[]): PreparedRegionGridIndex | null {
  if (regions.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const region of regions) {
    if (region.minX < minX) minX = region.minX;
    if (region.minY < minY) minY = region.minY;
    if (region.maxX > maxX) maxX = region.maxX;
    if (region.maxY > maxY) maxY = region.maxY;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  const estimated = Math.ceil(Math.sqrt(regions.length * 2));
  const gridSize = Math.max(1, Math.min(MAX_REGION_GRID_SIZE, estimated));
  const cellWidth = maxX > minX ? (maxX - minX) / gridSize : 1;
  const cellHeight = maxY > minY ? (maxY - minY) / gridSize : 1;
  const buckets = Array.from({ length: gridSize * gridSize }, () => [] as number[]);

  for (let regionArrayIndex = 0; regionArrayIndex < regions.length; regionArrayIndex += 1) {
    const region = regions[regionArrayIndex];
    const minCellX = toGridCell(region.minX, minX, maxX, cellWidth, gridSize);
    const maxCellX = toGridCell(region.maxX, minX, maxX, cellWidth, gridSize);
    const minCellY = toGridCell(region.minY, minY, maxY, cellHeight, gridSize);
    const maxCellY = toGridCell(region.maxY, minY, maxY, cellHeight, gridSize);
    for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        buckets[cellY * gridSize + cellX].push(regionArrayIndex);
      }
    }
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    gridSize,
    cellWidth,
    cellHeight,
    buckets,
  };
}

function getCandidateRegionIndices(
  index: PreparedRegionGridIndex | null,
  x: number,
  y: number,
): readonly number[] {
  if (!index) return EMPTY_CANDIDATE_REGION_INDICES;
  if (x < index.minX || x > index.maxX || y < index.minY || y > index.maxY) {
    return EMPTY_CANDIDATE_REGION_INDICES;
  }
  const cellX = toGridCell(x, index.minX, index.maxX, index.cellWidth, index.gridSize);
  const cellY = toGridCell(y, index.minY, index.maxY, index.cellHeight, index.gridSize);
  return index.buckets[cellY * index.gridSize + cellX] ?? EMPTY_CANDIDATE_REGION_INDICES;
}

function resolveTermId(paletteIndex: number, paletteIndexToTermId: RoiPointGroupOptions["paletteIndexToTermId"]): string {
  if (Array.isArray(paletteIndexToTermId)) {
    const fromArray = paletteIndexToTermId[paletteIndex];
    if (typeof fromArray === "string" && fromArray.length > 0) return fromArray;
  }
  if (paletteIndexToTermId instanceof Map) {
    const fromMap = paletteIndexToTermId.get(paletteIndex);
    if (typeof fromMap === "string" && fromMap.length > 0) return fromMap;
  }
  return String(paletteIndex);
}

export function computeRoiPointGroups(pointData: WsiPointData | null | undefined, regions: readonly WsiRegion[] | null | undefined, options: RoiPointGroupOptions = {}): RoiPointGroupStats {
  const baseCount = Math.max(
    0,
    Math.min(
      Math.floor(pointData?.count ?? 0),
      Math.floor((pointData?.positions?.length ?? 0) / 2),
      pointData?.paletteIndices?.length ?? 0,
      pointData?.fillModes instanceof Uint8Array ? pointData.fillModes.length : Number.MAX_SAFE_INTEGER
    )
  );

  let drawIndices: Uint32Array | null = null;
  if (pointData?.drawIndices instanceof Uint32Array) {
    const source = pointData.drawIndices;
    let valid = source.length;
    for (let i = 0; i < source.length; i += 1) {
      const idx = source[i];
      if (idx < baseCount) continue;
      valid -= 1;
    }
    if (valid === source.length) {
      drawIndices = source;
    } else if (valid > 0) {
      const filtered = new Uint32Array(valid);
      let cursor = 0;
      for (let i = 0; i < source.length; i += 1) {
        const idx = source[i];
        if (idx >= baseCount) continue;
        filtered[cursor] = idx;
        cursor += 1;
      }
      drawIndices = filtered;
    } else {
      drawIndices = new Uint32Array(0);
    }
  }

  const inputCount = drawIndices ? drawIndices.length : baseCount;

  const preparedRegions = prepareRegions(regions ?? []);
  if (!pointData || inputCount === 0 || preparedRegions.length === 0) {
    return {
      groups: [],
      inputPointCount: inputCount,
      pointsInsideAnyRegion: 0,
      unmatchedPointCount: inputCount,
    };
  }

  const regionTermCounters = new Map<number, Map<number, number>>();
  const regionTotalCounters = new Map<number, number>();
  const preparedRegionIndex = buildPreparedRegionGridIndex(preparedRegions);
  let insideCount = 0;

  for (let i = 0; i < inputCount; i += 1) {
    const pointIndex = drawIndices ? drawIndices[i] : i;
    const x = pointData.positions[pointIndex * 2];
    const y = pointData.positions[pointIndex * 2 + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    let bestRegion: PreparedRegion | null = null;
    const candidateRegionIndices = getCandidateRegionIndices(preparedRegionIndex, x, y);
    if (candidateRegionIndices.length === 0) continue;

    for (const regionArrayIndex of candidateRegionIndices) {
      const region = preparedRegions[regionArrayIndex];
      let inside = false;
      for (const polygon of region.polygons) {
        if (!pointInPreparedPolygon(x, y, polygon)) continue;
        inside = true;
        break;
      }
      if (!inside) continue;
      if (!bestRegion || region.area < bestRegion.area) {
        bestRegion = region;
      }
    }

    if (!bestRegion) continue;
    insideCount += 1;

    const paletteIndex = pointData.paletteIndices[pointIndex] ?? 0;
    const regionTermMap = regionTermCounters.get(bestRegion.regionIndex) ?? new Map<number, number>();
    regionTermMap.set(paletteIndex, (regionTermMap.get(paletteIndex) ?? 0) + 1);
    regionTermCounters.set(bestRegion.regionIndex, regionTermMap);
    regionTotalCounters.set(bestRegion.regionIndex, (regionTotalCounters.get(bestRegion.regionIndex) ?? 0) + 1);
  }

  const includeEmptyRegions = options.includeEmptyRegions ?? false;
  const groups: RoiPointGroup[] = [];
  for (const region of preparedRegions) {
    const totalCount = regionTotalCounters.get(region.regionIndex) ?? 0;
    if (!includeEmptyRegions && totalCount <= 0) continue;
    const termMap = regionTermCounters.get(region.regionIndex) ?? new Map();
    const termCounts: RoiTermCount[] = Array.from(termMap.entries())
      .map(([paletteIndex, count]) => ({
        termId: resolveTermId(paletteIndex, options.paletteIndexToTermId),
        paletteIndex,
        count,
      }))
      .sort((a, b) => b.count - a.count || a.paletteIndex - b.paletteIndex);

    groups.push({
      regionId: region.regionId,
      regionIndex: region.regionIndex,
      totalCount,
      termCounts,
    });
  }

  return {
    groups,
    inputPointCount: inputCount,
    pointsInsideAnyRegion: insideCount,
    unmatchedPointCount: Math.max(0, inputCount - insideCount),
  };
}
