import { useCallback, useEffect, useRef } from "react";
import { drawOverlayShapes } from "./draw-layer-overlay";
import type { DrawCoordinate, DrawOverlayShape } from "./draw-layer-types";
import { DEFAULT_REGION_STROKE_STYLE } from "./draw-layer-types";
import { closeRing, toCoord } from "./draw-layer-utils";
import { useViewerContext } from "./viewer-context";

export interface OverlayLayerProps {
  shapes?: DrawOverlayShape[];
}

const OVERLAY_DRAW_ID = "__overlay_layer__";

export function OverlayLayer({ shapes }: OverlayLayerProps): React.ReactElement | null {
  const { rendererRef, source, registerDrawCallback, unregisterDrawCallback, requestOverlayRedraw } = useViewerContext();

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

  const drawRef = useRef({ shapes, worldToScreenPoints, source });
  drawRef.current = { shapes, worldToScreenPoints, source };

  useEffect(() => {
    const draw = (ctx: CanvasRenderingContext2D) => {
      const { shapes: s, worldToScreenPoints: w2s, source: src } = drawRef.current;
      if (!Array.isArray(s) || s.length === 0 || !src) return;

      const imageOuterRing = w2s(
        closeRing([
          [0, 0],
          [src.width, 0],
          [src.width, src.height],
          [0, src.height],
        ]),
      );
      drawOverlayShapes({
        ctx,
        overlayShapes: s,
        imageOuterRing,
        worldToScreenPoints: w2s,
        baseStrokeStyle: DEFAULT_REGION_STROKE_STYLE,
      });
    };
    registerDrawCallback(OVERLAY_DRAW_ID, 30, draw);
    return () => unregisterDrawCallback(OVERLAY_DRAW_ID);
  }, [registerDrawCallback, unregisterDrawCallback]);

  useEffect(() => { requestOverlayRedraw(); }, [shapes, requestOverlayRedraw]);

  return null;
}
