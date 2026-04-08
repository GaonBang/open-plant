import { type MutableRefObject, useCallback, useEffect, useRef, useState } from "react";
import { buildPointSpatialIndexAsync, type FlatPointSpatialIndex, lookupCellIndex } from "../wsi/point-hit-index-worker-client";
import type { WsiImageSource, WsiPointData } from "../wsi/types";
import type { WsiTileRenderer } from "../wsi/wsi-tile-renderer";
import type { DrawCoordinate, DrawTool } from "./draw-layer";
import type { PointClickEvent, PointHitEvent, PointHoverEvent } from "./wsi-viewer-canvas-types";

const POINT_HIT_RADIUS_SCALE = 0.65;
const MIN_POINT_HIT_RADIUS_PX = 4;

export interface UsePointHitTestResult {
  getCellByCoordinates: (coordinate: DrawCoordinate) => PointHitEvent | null;
  emitPointHover: (hit: PointHitEvent | null, coordinate: DrawCoordinate | null) => void;
  emitPointClick: (coordinate: DrawCoordinate, button: number) => void;
}

export function usePointHitTest(
  renderPointData: WsiPointData | null,
  source: WsiImageSource | null,
  onPointHover: ((event: PointHoverEvent) => void) | undefined,
  onPointClick: ((event: PointClickEvent) => void) | undefined,
  getCellByCoordinatesRef: MutableRefObject<((coordinate: DrawCoordinate) => PointHitEvent | null) | null> | undefined,
  drawTool: DrawTool,
  rendererRef: MutableRefObject<WsiTileRenderer | null>,
  pointLayerId?: string,
): UsePointHitTestResult {
  const shouldEnablePointHitTest = Boolean(onPointHover || onPointClick || getCellByCoordinatesRef);
  const [pointSpatialIndex, setPointSpatialIndex] = useState<FlatPointSpatialIndex | null>(null);
  const hoveredPointIndexRef = useRef<number | null>(null);
  const hoveredPointIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!shouldEnablePointHitTest || !renderPointData) {
      setPointSpatialIndex(null);
      return;
    }
    let cancelled = false;

    buildPointSpatialIndexAsync(renderPointData, source).then(nextIndex => {
      if (!cancelled) setPointSpatialIndex(nextIndex);
    });

    return () => {
      cancelled = true;
    };
  }, [shouldEnablePointHitTest, renderPointData, source]);

  const getCellByCoordinates = useCallback(
    (coordinate: DrawCoordinate): PointHitEvent | null => {
      const renderer = rendererRef.current;
      if (!renderer || !pointSpatialIndex) return null;

      const x = Number(coordinate[0]);
      const y = Number(coordinate[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

      const zoom = Math.max(1e-6, renderer.getViewState().zoom);
      const pointSizePx = renderer.getPointSizeByZoom(pointLayerId);
      const hitRadiusPx = Math.max(MIN_POINT_HIT_RADIUS_PX, pointSizePx * POINT_HIT_RADIUS_SCALE);
      const hitRadiusWorld = hitRadiusPx / zoom;
      if (!Number.isFinite(hitRadiusWorld) || hitRadiusWorld <= 0) return null;

      const { cellSize, cellOffsets, cellLengths, pointIndices: idxBuf, positions: posBuf, safeCount } = pointSpatialIndex;
      const baseCellX = Math.floor(x / cellSize);
      const baseCellY = Math.floor(y / cellSize);
      const cellRadius = Math.max(1, Math.ceil(hitRadiusWorld / cellSize));
      const maxDist2 = hitRadiusWorld * hitRadiusWorld;

      let nearestIndex = -1;
      let nearestDist2 = maxDist2;
      let nearestX = 0;
      let nearestY = 0;

      for (let cx = baseCellX - cellRadius; cx <= baseCellX + cellRadius; cx += 1) {
        for (let cy = baseCellY - cellRadius; cy <= baseCellY + cellRadius; cy += 1) {
          const ci = lookupCellIndex(pointSpatialIndex, cx, cy);
          if (ci < 0) continue;

          const off = cellOffsets[ci];
          const end = off + cellLengths[ci];
          for (let i = off; i < end; i += 1) {
            const pointIndex = idxBuf[i];
            if (pointIndex >= safeCount) continue;

            const px = posBuf[pointIndex * 2];
            const py = posBuf[pointIndex * 2 + 1];
            const dx = px - x;
            const dy = py - y;
            const dist2 = dx * dx + dy * dy;
            if (dist2 > nearestDist2) continue;

            nearestDist2 = dist2;
            nearestIndex = pointIndex;
            nearestX = px;
            nearestY = py;
          }
        }
      }

      if (nearestIndex < 0) return null;
      const pointId = pointSpatialIndex.ids ? Number(pointSpatialIndex.ids[nearestIndex]) : null;
      return {
        index: nearestIndex,
        id: pointId,
        coordinate: [x, y],
        pointCoordinate: [nearestX, nearestY],
      };
    },
    [pointLayerId, pointSpatialIndex],
  );

  const emitPointHover = useCallback(
    (hit: PointHitEvent | null, coordinate: DrawCoordinate | null) => {
      if (!onPointHover) return;
      const nextIndex = hit?.index ?? null;
      const nextId = hit?.id ?? null;
      if (hoveredPointIndexRef.current === nextIndex && hoveredPointIdRef.current === nextId) return;
      hoveredPointIndexRef.current = nextIndex;
      hoveredPointIdRef.current = nextId;
      onPointHover({
        index: nextIndex,
        id: nextId,
        coordinate,
        pointCoordinate: hit?.pointCoordinate ?? null,
      });
    },
    [onPointHover],
  );

  const emitPointClick = useCallback(
    (coordinate: DrawCoordinate, button: number) => {
      if (!onPointClick) return;
      const hit = getCellByCoordinates(coordinate);
      if (!hit) return;
      onPointClick({
        ...hit,
        button,
      });
    },
    [onPointClick, getCellByCoordinates],
  );

  useEffect(() => {
    if (!getCellByCoordinatesRef) return;
    getCellByCoordinatesRef.current = getCellByCoordinates;
    return () => {
      if (getCellByCoordinatesRef.current === getCellByCoordinates) {
        getCellByCoordinatesRef.current = null;
      }
    };
  }, [getCellByCoordinatesRef, getCellByCoordinates]);

  useEffect(() => {
    const hoveredPointIndex = hoveredPointIndexRef.current;
    if (hoveredPointIndex === null) return;
    if (pointSpatialIndex && hoveredPointIndex < pointSpatialIndex.safeCount) return;
    hoveredPointIndexRef.current = null;
    hoveredPointIdRef.current = null;
    onPointHover?.({
      index: null,
      id: null,
      coordinate: null,
      pointCoordinate: null,
    });
  }, [pointSpatialIndex, onPointHover]);

  useEffect(() => {
    if (drawTool === "cursor") return;
    if (hoveredPointIndexRef.current === null) return;
    hoveredPointIndexRef.current = null;
    hoveredPointIdRef.current = null;
    onPointHover?.({
      index: null,
      id: null,
      coordinate: null,
      pointCoordinate: null,
    });
  }, [drawTool, onPointHover]);

  return { getCellByCoordinates, emitPointHover, emitPointClick };
}
