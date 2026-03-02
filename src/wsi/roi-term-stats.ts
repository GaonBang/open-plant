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
}

function prepareRegions(regions: readonly WsiRegion[]): PreparedRegion[] {
  const prepared: PreparedRegion[] = [];
  for (let i = 0; i < regions.length; i += 1) {
    const region = regions[i];
    const polygons = prepareRoiPolygons([toRoiGeometry(region?.coordinates)]);
    if (polygons.length === 0) continue;

    let area = 0;
    for (const polygon of polygons) {
      area += polygon.area;
    }

    prepared.push({
      regionId: region.id ?? i,
      regionIndex: i,
      polygons,
      area: Math.max(1e-6, area),
    });
  }
  return prepared;
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
  let insideCount = 0;

  for (let i = 0; i < inputCount; i += 1) {
    const pointIndex = drawIndices ? drawIndices[i] : i;
    const x = pointData.positions[pointIndex * 2];
    const y = pointData.positions[pointIndex * 2 + 1];
    let bestRegion: PreparedRegion | null = null;

    for (const region of preparedRegions) {
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
