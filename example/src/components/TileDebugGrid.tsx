import { useCallback, useEffect, useRef } from "react";
import { useViewerContext } from "../../../src/react/viewer-context";
import { getVisibleTiles } from "../../../src/wsi/wsi-tile-visibility";

const DRAW_ID = "__tile_debug_grid__";

export function TileDebugGrid(): React.ReactElement | null {
  const { rendererRef, rendererSerial, source, registerDrawCallback, unregisterDrawCallback, requestOverlayRedraw } = useViewerContext();

  const sourceRef = useRef(source);
  sourceRef.current = source;

  const draw = useCallback((ctx: CanvasRenderingContext2D) => {
    const renderer = rendererRef.current;
    const src = sourceRef.current;
    if (!renderer || !src) return;

    const { tier, visible } = getVisibleTiles(
      {
        getViewCorners: () => renderer.getViewCorners(),
        getViewState: () => renderer.getViewState(),
        getCenter: () => {
          const vs = renderer.getViewState();
          return [vs.offsetX, vs.offsetY];
        },
        setCenter: () => {},
      },
      src,
    );

    const blacklisted = renderer.getBlacklistedTileKeys();

    ctx.save();

    for (const tile of visible) {
      const [left, top, right, bottom] = tile.bounds;

      const tl = renderer.worldToScreen(left, top);
      const br = renderer.worldToScreen(right, bottom);
      if (!tl || !br) continue;

      const x = tl[0];
      const y = tl[1];
      const w = br[0] - tl[0];
      const h = br[1] - tl[1];

      const isBlacklisted = blacklisted.has(tile.key);

      // grid border
      ctx.strokeStyle = isBlacklisted ? "rgba(255, 50, 50, 0.8)" : "rgba(0, 255, 100, 0.5)";
      ctx.lineWidth = isBlacklisted ? 2 : 1;
      ctx.strokeRect(x, y, w, h);

      if (isBlacklisted) {
        // red tint fill
        ctx.fillStyle = "rgba(255, 0, 0, 0.15)";
        ctx.fillRect(x, y, w, h);
      }

      // label background
      const label = `${tier}/${tile.x}/${tile.y}${isBlacklisted ? " BLOCKED" : ""}`;
      ctx.font = "11px monospace";
      const metrics = ctx.measureText(label);
      const labelW = metrics.width + 8;
      const labelH = 18;
      ctx.fillStyle = isBlacklisted ? "rgba(120, 0, 0, 0.8)" : "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(x + 2, y + 2, labelW, labelH);

      // label text
      ctx.fillStyle = isBlacklisted ? "#ff4444" : "#0f0";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(label, x + 6, y + 5);
    }

    ctx.restore();
  }, [rendererRef]);

  useEffect(() => {
    registerDrawCallback(DRAW_ID, 100, draw);
    return () => unregisterDrawCallback(DRAW_ID);
  }, [registerDrawCallback, unregisterDrawCallback, draw]);

  useEffect(() => {
    requestOverlayRedraw();
  }, [rendererSerial, source, requestOverlayRedraw]);

  return null;
}
