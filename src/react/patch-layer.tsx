import { useCallback, useEffect, useMemo, useRef } from "react";
import type { WsiRegion } from "../wsi/types";
import type {
  DrawCoordinate,
  PreparedRenderedRegion,
  RegionStrokeStyle,
} from "./draw-layer-types";
import { DEFAULT_PATCH_STROKE_STYLE } from "./draw-layer-types";
import { drawPath, mergeStrokeStyle, normalizeDrawRegionPolygons, toCoord } from "./draw-layer-utils";
import { useViewerContext } from "./viewer-context";

export interface PatchLayerProps {
  regions?: WsiRegion[];
  strokeStyle?: Partial<RegionStrokeStyle>;
}

const PATCH_DRAW_ID = "__patch_layer__";
const EMPTY_REGIONS: WsiRegion[] = [];

export function PatchLayer({ regions, strokeStyle }: PatchLayerProps): React.ReactElement | null {
  const { rendererRef, registerDrawCallback, unregisterDrawCallback, requestOverlayRedraw } = useViewerContext();

  const safeRegions = regions ?? EMPTY_REGIONS;

  const resolvedStrokeStyle = useMemo(() => mergeStrokeStyle(DEFAULT_PATCH_STROKE_STYLE, strokeStyle), [strokeStyle]);

  const prepared = useMemo<PreparedRenderedRegion[]>(() => {
    const out: PreparedRenderedRegion[] = [];
    for (let i = 0; i < safeRegions.length; i += 1) {
      const region = safeRegions[i];
      const polys = normalizeDrawRegionPolygons(region.coordinates);
      if (polys.length === 0) continue;
      out.push({ region, regionIndex: i, regionKey: region.id ?? i, polygons: polys });
    }
    return out;
  }, [safeRegions]);

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
    [rendererRef],
  );

  const drawRef = useRef({ prepared, resolvedStrokeStyle, worldToScreenPoints });
  drawRef.current = { prepared, resolvedStrokeStyle, worldToScreenPoints };

  useEffect(() => {
    const draw = (ctx: CanvasRenderingContext2D) => {
      const { prepared: prep, resolvedStrokeStyle: style, worldToScreenPoints: w2s } = drawRef.current;
      for (const entry of prep) {
        for (const polygon of entry.polygons) {
          const screenOuter = w2s(polygon.outer);
          if (screenOuter.length >= 4) drawPath(ctx, screenOuter, style, true, false);
          for (const hole of polygon.holes) {
            const screenHole = w2s(hole);
            if (screenHole.length >= 4) drawPath(ctx, screenHole, style, true, false);
          }
        }
      }
    };
    registerDrawCallback(PATCH_DRAW_ID, 20, draw);
    return () => unregisterDrawCallback(PATCH_DRAW_ID);
  }, [registerDrawCallback, unregisterDrawCallback]);

  useEffect(() => { requestOverlayRedraw(); }, [prepared, resolvedStrokeStyle, requestOverlayRedraw]);

  return null;
}
