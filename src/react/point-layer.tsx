import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { PointClipMode } from "../wsi/point-clip-worker-client";
import type { WsiPointData, WsiRegion } from "../wsi/types";
import type { PointSizeByZoom } from "../wsi/wsi-tile-renderer";
import type { DrawCoordinate } from "./draw-layer-types";
import { usePointClipping } from "./use-point-clipping";
import { usePointHitTest } from "./use-point-hit-test";
import { useViewerContext } from "./viewer-context";
import type { PointClickEvent, PointClipStatsEvent, PointHitEvent, PointHoverEvent } from "./wsi-viewer-canvas-types";

export interface PointLayerProps {
  data?: WsiPointData | null;
  palette?: Uint8Array | null;
  sizeByZoom?: PointSizeByZoom;
  strokeScale?: number;
  innerFillOpacity?: number;
  clipEnabled?: boolean;
  clipToRegions?: WsiRegion[];
  clipMode?: PointClipMode;
  onClipStats?: (event: PointClipStatsEvent) => void;
  onHover?: (event: PointHoverEvent) => void;
  onClick?: (event: PointClickEvent) => void;
}

export interface PointQueryHandle {
  queryAt: (coordinate: DrawCoordinate) => PointHitEvent | null;
}

export const PointLayer = forwardRef<PointQueryHandle, PointLayerProps>(function PointLayer(
  {
    data = null,
    palette = null,
    sizeByZoom,
    strokeScale,
    innerFillOpacity,
    clipEnabled = false,
    clipToRegions,
    clipMode = "worker",
    onClipStats,
    onHover,
    onClick,
  },
  ref,
) {
  const { rendererRef, source } = useViewerContext();
  const getCellByCoordinatesRef = useRef<((coordinate: DrawCoordinate) => PointHitEvent | null) | null>(null);

  const effectiveClipRegions = clipToRegions ?? EMPTY_REGIONS;

  const renderPointData = usePointClipping(clipEnabled, clipMode, data, effectiveClipRegions, onClipStats);

  const { getCellByCoordinates } = usePointHitTest(
    renderPointData,
    source,
    onHover,
    onClick,
    getCellByCoordinatesRef,
    "cursor",
    rendererRef,
  );

  useImperativeHandle(ref, () => ({ queryAt: getCellByCoordinates }), [getCellByCoordinates]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !palette) return;
    renderer.setPointPalette(palette);
  }, [rendererRef, palette]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || sizeByZoom === undefined) return;
    renderer.setPointSizeByZoom(sizeByZoom);
  }, [rendererRef, sizeByZoom]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || strokeScale === undefined) return;
    renderer.setPointStrokeScale(strokeScale);
  }, [rendererRef, strokeScale]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || innerFillOpacity === undefined) return;
    renderer.setPointInnerFillOpacity(innerFillOpacity);
  }, [rendererRef, innerFillOpacity]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setPointData(renderPointData);
  }, [rendererRef, renderPointData]);

  return null;
});

const EMPTY_REGIONS: WsiRegion[] = [];
