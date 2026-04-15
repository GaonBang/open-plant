import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { PointClipMode } from "../wsi/point-clip-worker-client";
import type { WsiPointData, WsiRegion } from "../wsi/types";
import type { PointSizeByMagnification, PointSizeByZoom } from "../wsi/wsi-tile-renderer";
import type { DrawCoordinate } from "./draw-layer-types";
import { usePointClipping } from "./use-point-clipping";
import { usePointHitTest } from "./use-point-hit-test";
import { useViewerContext } from "./viewer-context";
import type { PointClickEvent, PointClipStatsEvent, PointHitEvent, PointHoverEvent } from "./wsi-viewer-canvas-types";

export interface PointLayerProps {
  data?: WsiPointData | null;
  palette?: Uint8Array | null;
  sizeByZoom?: PointSizeByZoom;
  sizeByMagnification?: PointSizeByMagnification;
  opacity?: number;
  strokeScale?: number;
  innerFillOpacity?: number;
  clipEnabled?: boolean;
  clipToRegions?: WsiRegion[];
  clipMode?: PointClipMode;
  onClipStats?: (event: PointClipStatsEvent) => void;
  onHover?: (event: PointHoverEvent) => void;
  onClick?: (event: PointClickEvent) => void;
  dashed?: [number, number];
}

export interface PointQueryHandle {
  queryAt: (coordinate: DrawCoordinate) => PointHitEvent | null;
}

let nextPointLayerId = 0;

export const PointLayer = forwardRef<PointQueryHandle, PointLayerProps>(function PointLayer(
  { data = null, palette = null, sizeByZoom, sizeByMagnification, opacity, strokeScale, innerFillOpacity, clipEnabled = false, clipToRegions, clipMode = "worker", onClipStats, onHover, onClick, dashed },
  ref
) {
  const { rendererRef, rendererSerial, source } = useViewerContext();
  const getCellByCoordinatesRef = useRef<((coordinate: DrawCoordinate) => PointHitEvent | null) | null>(null);
  const layerIdRef = useRef(`__point_layer__${nextPointLayerId++}`);

  const effectiveClipRegions = clipToRegions ?? EMPTY_REGIONS;

  const renderPointData = usePointClipping(clipEnabled, clipMode, data, effectiveClipRegions, onClipStats);

  const { getCellByCoordinates } = usePointHitTest(renderPointData, source, onHover, onClick, getCellByCoordinatesRef, "cursor", rendererRef, layerIdRef.current);

  useImperativeHandle(ref, () => ({ queryAt: getCellByCoordinates }), [getCellByCoordinates]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const layerId = layerIdRef.current;
    renderer.registerPointLayer(layerId);
    return () => {
      renderer.unregisterPointLayer(layerId);
    };
  }, [rendererRef, rendererSerial]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setPointPalette(palette, layerIdRef.current);
  }, [rendererSerial, palette, rendererRef]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setPointLineDash(dashed, layerIdRef.current);
  }, [rendererSerial, dashed, rendererRef]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setPointSizeByZoom(sizeByZoom, layerIdRef.current);
  }, [rendererSerial, sizeByZoom, rendererRef]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setPointSizeByMagnification(sizeByMagnification, layerIdRef.current);
  }, [rendererSerial, sizeByMagnification, rendererRef]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || opacity === undefined) return;
    renderer.setPointOpacity(opacity, layerIdRef.current);
  }, [rendererSerial, opacity, rendererRef]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || strokeScale === undefined) return;
    renderer.setPointStrokeScale(strokeScale, layerIdRef.current);
  }, [rendererSerial, strokeScale, rendererRef]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || innerFillOpacity === undefined) return;
    renderer.setPointInnerFillOpacity(innerFillOpacity, layerIdRef.current);
  }, [rendererSerial, innerFillOpacity, rendererRef]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setPointData(renderPointData, layerIdRef.current);
  }, [rendererSerial, renderPointData, rendererRef]);

  return null;
});

const EMPTY_REGIONS: WsiRegion[] = [];
