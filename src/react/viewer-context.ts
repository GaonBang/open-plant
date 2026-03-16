import { createContext, type MutableRefObject, type RefObject, useContext } from "react";
import type { WsiImageSource } from "../wsi/types";
import type { WsiTileRenderer } from "../wsi/wsi-tile-renderer";
import type { DrawCoordinate } from "./draw-layer-types";

export type OverlayDrawFn = (ctx: CanvasRenderingContext2D, width: number, height: number) => void;

export interface ViewerContextValue {
  source: WsiImageSource | null;
  rendererRef: RefObject<WsiTileRenderer | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  drawInvalidateRef: MutableRefObject<(() => void) | null>;
  overviewInvalidateRef: MutableRefObject<(() => void) | null>;

  worldToScreen: (worldX: number, worldY: number) => DrawCoordinate | null;
  screenToWorld: (clientX: number, clientY: number) => DrawCoordinate | null;

  registerDrawCallback: (id: string, priority: number, draw: OverlayDrawFn) => void;
  unregisterDrawCallback: (id: string) => void;
  requestOverlayRedraw: () => void;

  setInteractionLock: (id: string, locked: boolean) => void;
  isInteractionLocked: () => boolean;
}

const ViewerContext = createContext<ViewerContextValue | null>(null);

export const ViewerContextProvider = ViewerContext.Provider;

export function useViewerContext(): ViewerContextValue {
  const ctx = useContext(ViewerContext);
  if (!ctx) {
    throw new Error("useViewerContext must be used within a <WsiViewer>");
  }
  return ctx;
}

export function useOptionalViewerContext(): ViewerContextValue | null {
  return useContext(ViewerContext);
}
