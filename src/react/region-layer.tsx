import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WsiRegion } from "../wsi/types";
import { drawRegionLabel, getTopAnchorFromPolygons, mergeRegionLabelStyle, resolveRegionLabelAutoLiftOffsetPx, resolveRegionLabelStyle } from "./draw-layer-label";
import type {
  DrawCoordinate,
  DrawRegionCoordinates,
  PreparedRenderedRegion,
  RegionLabelAnchorMode,
  RegionLabelStyle,
  RegionLabelStyleResolver,
  RegionStrokeStyle,
  RegionStrokeStyleResolver,
} from "./draw-layer-types";
import { EMPTY_DASH, REGION_INTERACTION_SHADOW_COLOR, REGION_INTERACTION_SHADOW_WIDTH } from "./draw-layer-types";
import { drawPath, isSameRegionId, mergeStrokeStyle, normalizeDrawRegionPolygons, resolveStrokeStyle, toCoord } from "./draw-layer-utils";
import { useRegionLabelAutoLift } from "./use-region-label-auto-lift";
import { useViewerContext } from "./viewer-context";
import { prepareRegionHits, resolveRegionId } from "./wsi-region-hit-utils";
import type { RegionClickEvent, RegionHoverEvent } from "./wsi-viewer-canvas-types";

export interface RegionLayerProps {
  regions?: WsiRegion[];
  polygons?: DrawRegionCoordinates[];
  strokeStyle?: Partial<RegionStrokeStyle>;
  hoverStrokeStyle?: Partial<RegionStrokeStyle>;
  activeStrokeStyle?: Partial<RegionStrokeStyle>;
  resolveStrokeStyle?: RegionStrokeStyleResolver;
  labelStyle?: Partial<RegionLabelStyle> | RegionLabelStyleResolver;
  labelAnchor?: RegionLabelAnchorMode;
  autoLiftLabelAtMaxZoom?: boolean;
  clampLabelToViewport?: boolean;
  activeRegionId?: string | number | null;
  onActiveChange?: (regionId: string | number | null) => void;
  onHover?: (event: RegionHoverEvent) => void;
  onClick?: (event: RegionClickEvent) => void;
}

const EMPTY_ROI_REGIONS: WsiRegion[] = [];
const EMPTY_ROI_POLYGONS: DrawRegionCoordinates[] = [];
const REGION_LAYER_DRAW_ID = "__region_layer__";
const REGION_LABEL_DRAW_ID = "__region_label__";

function resolveRegionInteractionShadow(strokeStyle: RegionStrokeStyle): RegionStrokeStyle {
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

export function RegionLayer({
  regions,
  polygons,
  strokeStyle: strokeStyleProp,
  hoverStrokeStyle: hoverStrokeStyleProp,
  activeStrokeStyle: activeStrokeStyleProp,
  resolveStrokeStyle: resolveStrokeStyleProp,
  labelStyle: labelStyleProp,
  labelAnchor = "top-center",
  autoLiftLabelAtMaxZoom = false,
  clampLabelToViewport = true,
  activeRegionId: controlledActiveRegionId,
  onActiveChange,
  onHover,
  onClick,
}: RegionLayerProps): React.ReactElement | null {
  const { rendererRef, registerDrawCallback, unregisterDrawCallback, requestOverlayRedraw, drawInvalidateRef } = useViewerContext();

  const safeRegions = regions ?? EMPTY_ROI_REGIONS;
  const safePolygons = polygons ?? EMPTY_ROI_POLYGONS;

  const effectiveRegions = useMemo<WsiRegion[]>(() => {
    if (safeRegions.length > 0) return safeRegions;
    if (safePolygons.length === 0) return EMPTY_ROI_REGIONS;
    return safePolygons.map((coordinates, index) => ({ id: index, coordinates }));
  }, [safeRegions, safePolygons]);

  const [hoveredRegionId, setHoveredRegionId] = useState<string | number | null>(null);
  const [uncontrolledActiveRegionId, setUncontrolledActiveRegionId] = useState<string | number | null>(() => controlledActiveRegionId ?? null);
  const isControlled = controlledActiveRegionId !== undefined;
  const activeRegionId = isControlled ? (controlledActiveRegionId ?? null) : uncontrolledActiveRegionId;
  const hoveredRegionIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    if (!isControlled) return;
    setUncontrolledActiveRegionId(controlledActiveRegionId ?? null);
  }, [isControlled, controlledActiveRegionId]);

  const commitActive = useCallback(
    (next: string | number | null) => {
      if (String(activeRegionId) === String(next)) return;
      if (!isControlled) setUncontrolledActiveRegionId(next);
      onActiveChange?.(next);
    },
    [activeRegionId, isControlled, onActiveChange]
  );

  const { regionLabelAutoLiftOffsetPx, syncRegionLabelAutoLiftTarget } = useRegionLabelAutoLift(autoLiftLabelAtMaxZoom, rendererRef, drawInvalidateRef);

  const resolvedStrokeStyle = useMemo(() => resolveStrokeStyle(strokeStyleProp), [strokeStyleProp]);
  const resolvedHoverStrokeStyle = useMemo(() => mergeStrokeStyle(resolvedStrokeStyle, hoverStrokeStyleProp), [resolvedStrokeStyle, hoverStrokeStyleProp]);
  const resolvedActiveStrokeStyle = useMemo(() => mergeStrokeStyle(resolvedStrokeStyle, activeStrokeStyleProp), [resolvedStrokeStyle, activeStrokeStyleProp]);

  const { staticLabelStyle, labelStyleResolver } = useMemo(() => {
    if (typeof labelStyleProp === "function") {
      return { staticLabelStyle: undefined, labelStyleResolver: labelStyleProp };
    }
    return { staticLabelStyle: labelStyleProp, labelStyleResolver: undefined };
  }, [labelStyleProp]);

  const resolvedLabelStyle = useMemo(() => resolveRegionLabelStyle(staticLabelStyle), [staticLabelStyle]);

  const preparedRegions = useMemo<PreparedRenderedRegion[]>(() => {
    const out: PreparedRenderedRegion[] = [];
    for (let i = 0; i < effectiveRegions.length; i += 1) {
      const region = effectiveRegions[i];
      const polys = normalizeDrawRegionPolygons(region.coordinates);
      if (polys.length === 0) continue;
      out.push({ region, regionIndex: i, regionKey: region.id ?? i, polygons: polys });
    }
    return out;
  }, [effectiveRegions]);

  const preparedRegionHits = useMemo(() => prepareRegionHits(effectiveRegions, labelAnchor), [effectiveRegions, labelAnchor]);

  // sync min/max zoom for label auto-lift
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    syncRegionLabelAutoLiftTarget(renderer.getViewState().zoom);
  }, [rendererRef, syncRegionLabelAutoLiftTarget]);

  // clean up stale hover/active on regions change
  useEffect(() => {
    const hasActive = activeRegionId === null ? true : effectiveRegions.some((r, i) => String(resolveRegionId(r, i)) === String(activeRegionId));
    if (!hasActive && activeRegionId !== null) commitActive(null);

    const currentHover = hoveredRegionIdRef.current;
    const hasHover = currentHover === null ? true : effectiveRegions.some((r, i) => String(resolveRegionId(r, i)) === String(currentHover));
    if (!hasHover && currentHover !== null) {
      hoveredRegionIdRef.current = null;
      setHoveredRegionId(null);
      onHover?.({ region: null, regionId: null, regionIndex: -1, coordinate: null });
    }
  }, [effectiveRegions, activeRegionId, onHover, commitActive]);

  // worldToScreenPoints helper
  const worldToScreenPoints = useCallback(
    (points: DrawCoordinate[]): DrawCoordinate[] => {
      const projector = rendererRef.current;
      if (!projector || points.length === 0) return [];
      const out = new Array<DrawCoordinate>(points.length);
      for (let i = 0; i < points.length; i += 1) {
        const coord = toCoord(projector.worldToScreen(points[i][0], points[i][1]));
        if (!coord) return [];
        out[i] = coord;
      }
      return out;
    },
    [rendererRef]
  );

  // --- register region polygon draw callback ---

  const regionDrawRef = useRef({
    preparedRegions,
    hoveredRegionId,
    activeRegionId,
    resolvedStrokeStyle,
    resolvedHoverStrokeStyle,
    resolvedActiveStrokeStyle,
    resolveStrokeStyleProp,
    worldToScreenPoints,
  });
  regionDrawRef.current = {
    preparedRegions,
    hoveredRegionId,
    activeRegionId,
    resolvedStrokeStyle,
    resolvedHoverStrokeStyle,
    resolvedActiveStrokeStyle,
    resolveStrokeStyleProp,
    worldToScreenPoints,
  };

  useEffect(() => {
    const drawRegions = (_ctx: CanvasRenderingContext2D) => {
      const {
        preparedRegions: prep,
        hoveredRegionId: hovered,
        activeRegionId: active,
        resolvedStrokeStyle: base,
        resolvedHoverStrokeStyle: hover,
        resolvedActiveStrokeStyle: activeS,
        resolveStrokeStyleProp: resolver,
        worldToScreenPoints: w2s,
      } = regionDrawRef.current;

      for (const entry of prep) {
        const { region, polygons: polys, regionIndex, regionKey } = entry;
        const state: "default" | "hover" | "active" = isSameRegionId(active, regionKey) ? "active" : isSameRegionId(hovered, regionKey) ? "hover" : "default";
        let style = state === "active" ? activeS : state === "hover" ? hover : base;

        if (resolver) {
          const resolved = resolver({ region, regionId: regionKey, regionIndex, state });
          style = mergeStrokeStyle(style, resolved || undefined);
        }
        const shadow = state === "default" ? null : resolveRegionInteractionShadow(style);

        for (const polygon of polys) {
          const screenOuter = w2s(polygon.outer);
          if (screenOuter.length >= 4) {
            if (shadow) drawPath(_ctx, screenOuter, shadow, true, false);
            drawPath(_ctx, screenOuter, style, true, false);
          }
          for (const hole of polygon.holes) {
            const screenHole = w2s(hole);
            if (screenHole.length >= 4) {
              if (shadow) drawPath(_ctx, screenHole, shadow, true, false);
              drawPath(_ctx, screenHole, style, true, false);
            }
          }
        }
      }
    };

    registerDrawCallback(REGION_LAYER_DRAW_ID, 10, drawRegions);
    return () => unregisterDrawCallback(REGION_LAYER_DRAW_ID);
  }, [registerDrawCallback, unregisterDrawCallback]);

  // --- register region label draw callback ---

  const labelDrawRef = useRef({
    preparedRegions,
    resolvedLabelStyle,
    labelStyleResolver,
    labelAnchor,
    autoLiftLabelAtMaxZoom,
    clampLabelToViewport,
    regionLabelAutoLiftOffsetPx,
    rendererRef,
  });
  labelDrawRef.current = {
    preparedRegions,
    resolvedLabelStyle,
    labelStyleResolver,
    labelAnchor,
    autoLiftLabelAtMaxZoom,
    clampLabelToViewport,
    regionLabelAutoLiftOffsetPx,
    rendererRef,
  };

  useEffect(() => {
    const drawLabels = (ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number) => {
      const {
        preparedRegions: prep,
        resolvedLabelStyle: labelS,
        labelStyleResolver: resolver,
        labelAnchor: anchor,
        autoLiftLabelAtMaxZoom: autoLift,
        clampLabelToViewport: clampVp,
        regionLabelAutoLiftOffsetPx: autoLiftPx,
        rendererRef: rRef,
      } = labelDrawRef.current;

      if (prep.length === 0) return;

      const zoom = Math.max(1e-6, rRef.current?.getViewState?.().zoom ?? 1);
      const labelAutoLiftOffset =
        typeof autoLiftPx === "number" && Number.isFinite(autoLiftPx) ? Math.max(0, autoLiftPx) : resolveRegionLabelAutoLiftOffsetPx(autoLift, zoom, rRef.current?.getZoomRange?.());

      for (const entry of prep) {
        if (!entry.region.label) continue;
        const anchorWorld = getTopAnchorFromPolygons(entry.polygons, anchor);
        if (!anchorWorld) continue;
        const anchorScreen = toCoord(rRef.current?.worldToScreen(anchorWorld[0], anchorWorld[1]) ?? []);
        if (!anchorScreen) continue;

        let style = mergeRegionLabelStyle(labelS, resolver?.({ region: entry.region, regionId: entry.regionKey, regionIndex: entry.regionIndex, zoom }));
        if (labelAutoLiftOffset > 0) {
          style = { ...style, offsetY: style.offsetY + labelAutoLiftOffset };
        }
        drawRegionLabel(ctx, entry.region.label, anchorScreen, canvasWidth, canvasHeight, style, clampVp);
      }
    };

    registerDrawCallback(REGION_LABEL_DRAW_ID, 50, drawLabels);
    return () => unregisterDrawCallback(REGION_LABEL_DRAW_ID);
  }, [registerDrawCallback, unregisterDrawCallback]);

  // redraw when deps change
  useEffect(() => {
    requestOverlayRedraw();
  }, [preparedRegions, hoveredRegionId, activeRegionId, resolvedStrokeStyle, resolvedLabelStyle, regionLabelAutoLiftOffsetPx, requestOverlayRedraw]);

  return null;
}
