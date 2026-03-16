import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WsiImageColorSettings, WsiImageSource, WsiRenderStats, WsiViewState } from "../wsi/types";
import type { PointSizeByZoom, WsiTileErrorEvent, WsiViewTransitionOptions } from "../wsi/wsi-tile-renderer";
import { WsiTileRenderer } from "../wsi/wsi-tile-renderer";
import type { DrawCoordinate } from "./draw-layer-types";
import { toDrawCoordinate } from "./draw-layer-utils";
import type { OverlayDrawFn, ViewerContextValue } from "./viewer-context";
import { ViewerContextProvider } from "./viewer-context";

export interface WsiViewerProps {
  source: WsiImageSource | null;
  viewState?: Partial<WsiViewState> | null;
  onViewStateChange?: (next: WsiViewState) => void;
  onStats?: (stats: WsiRenderStats) => void;
  onTileError?: (event: WsiTileErrorEvent) => void;
  onContextLost?: () => void;
  onContextRestored?: () => void;
  imageColorSettings?: WsiImageColorSettings | null;
  fitNonce?: number;
  rotationResetNonce?: number;
  authToken?: string;
  ctrlDragRotate?: boolean;
  minZoom?: number;
  maxZoom?: number;
  viewTransition?: WsiViewTransitionOptions;
  zoomSnaps?: number[];
  zoomSnapFitAsMin?: boolean;
  pointSizeByZoom?: PointSizeByZoom;
  pointStrokeScale?: number;
  pointInnerFillOpacity?: number;
  debugOverlay?: boolean;
  debugOverlayStyle?: CSSProperties;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

interface DrawCallbackEntry {
  id: string;
  priority: number;
  draw: OverlayDrawFn;
}

const EMPTY_DRAW_CALLBACKS: DrawCallbackEntry[] = [];

export function WsiViewer({
  source,
  viewState,
  onViewStateChange,
  onStats,
  onTileError,
  onContextLost,
  onContextRestored,
  imageColorSettings = null,
  fitNonce = 0,
  rotationResetNonce = 0,
  authToken = "",
  ctrlDragRotate = true,
  minZoom,
  maxZoom,
  viewTransition,
  zoomSnaps,
  zoomSnapFitAsMin,
  pointSizeByZoom,
  pointStrokeScale,
  pointInnerFillOpacity,
  debugOverlay = false,
  debugOverlayStyle,
  className,
  style,
  children,
}: WsiViewerProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<WsiTileRenderer | null>(null);
  const drawInvalidateRef = useRef<(() => void) | null>(null);
  const overviewInvalidateRef = useRef<(() => void) | null>(null);
  const drawCallbacksRef = useRef<DrawCallbackEntry[]>(EMPTY_DRAW_CALLBACKS);
  const overlayPendingRef = useRef(false);
  const interactionLocksRef = useRef<Set<string>>(new Set());

  const onViewStateChangeRef = useRef(onViewStateChange);
  const onStatsRef = useRef(onStats);
  const onTileErrorRef = useRef(onTileError);
  const onContextLostRef = useRef(onContextLost);
  const onContextRestoredRef = useRef(onContextRestored);

  const [debugStats, setDebugStats] = useState<WsiRenderStats | null>(null);
  const debugOverlayRef = useRef(debugOverlay);

  useEffect(() => {
    onViewStateChangeRef.current = onViewStateChange;
  }, [onViewStateChange]);
  useEffect(() => {
    onStatsRef.current = onStats;
  }, [onStats]);
  useEffect(() => {
    onTileErrorRef.current = onTileError;
  }, [onTileError]);
  useEffect(() => {
    onContextLostRef.current = onContextLost;
  }, [onContextLost]);
  useEffect(() => {
    onContextRestoredRef.current = onContextRestored;
  }, [onContextRestored]);
  useEffect(() => {
    debugOverlayRef.current = debugOverlay;
    if (!debugOverlay) setDebugStats(null);
  }, [debugOverlay]);

  const mergedStyle = useMemo<CSSProperties>(() => ({ position: "relative", width: "100%", height: "100%", ...style }), [style]);

  const mergedDebugOverlayStyle = useMemo<CSSProperties>(
    () => ({
      position: "absolute",
      top: 8,
      left: 8,
      zIndex: 7,
      margin: 0,
      padding: "8px 10px",
      maxWidth: "min(420px, 80%)",
      pointerEvents: "none",
      whiteSpace: "pre-wrap",
      lineHeight: 1.35,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 11,
      color: "#cde6ff",
      background: "rgba(6, 12, 20, 0.82)",
      border: "1px solid rgba(173, 216, 255, 0.28)",
      borderRadius: 8,
      boxShadow: "0 8px 22px rgba(0,0,0,0.35)",
      ...debugOverlayStyle,
    }),
    [debugOverlayStyle]
  );

  const handleRendererStats = useCallback((stats: WsiRenderStats): void => {
    onStatsRef.current?.(stats);
    if (debugOverlayRef.current) setDebugStats(stats);
  }, []);

  const debugOverlayText = useMemo(() => {
    if (!debugStats) return "stats: waiting for first frame...";
    return [
      `tier ${debugStats.tier} | frame ${debugStats.frameMs?.toFixed(2) ?? "-"} ms | drawCalls ${debugStats.drawCalls ?? "-"}`,
      `tiles visible ${debugStats.visible} | rendered ${debugStats.rendered} | fallback ${debugStats.fallback}`,
      `cache size ${debugStats.cache} | hit ${debugStats.cacheHits ?? "-"} | miss ${debugStats.cacheMisses ?? "-"}`,
      `queue inflight ${debugStats.inflight} | queued ${debugStats.queued ?? "-"} | retries ${debugStats.retries ?? "-"} | failed ${debugStats.failed ?? "-"} | aborted ${debugStats.aborted ?? "-"}`,
      `points ${debugStats.points}`,
    ].join("\n");
  }, [debugStats]);

  // --- overlay draw registry ---

  const drawOverlayFrame = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const logicalWidth = rect.width;
    const logicalHeight = rect.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const entries = drawCallbacksRef.current;
    for (let i = 0; i < entries.length; i += 1) {
      ctx.save();
      entries[i].draw(ctx, logicalWidth, logicalHeight);
      ctx.restore();
    }
  }, []);

  const requestOverlayRedraw = useCallback(() => {
    if (overlayPendingRef.current) return;
    overlayPendingRef.current = true;
    requestAnimationFrame(() => {
      overlayPendingRef.current = false;
      drawOverlayFrame();
    });
  }, [drawOverlayFrame]);

  const registerDrawCallback = useCallback(
    (id: string, priority: number, draw: OverlayDrawFn) => {
      const entries = drawCallbacksRef.current.filter(e => e.id !== id);
      entries.push({ id, priority, draw });
      entries.sort((a, b) => a.priority - b.priority);
      drawCallbacksRef.current = entries;
      requestOverlayRedraw();
    },
    [requestOverlayRedraw]
  );

  const unregisterDrawCallback = useCallback(
    (id: string) => {
      drawCallbacksRef.current = drawCallbacksRef.current.filter(e => e.id !== id);
      requestOverlayRedraw();
    },
    [requestOverlayRedraw]
  );

  const setInteractionLock = useCallback((id: string, locked: boolean) => {
    if (locked) {
      interactionLocksRef.current.add(id);
    } else {
      interactionLocksRef.current.delete(id);
    }
    rendererRef.current?.setInteractionLock(interactionLocksRef.current.size > 0);
  }, []);

  const isInteractionLocked = useCallback(() => interactionLocksRef.current.size > 0, []);

  // --- coordinate transforms ---

  const worldToScreen = useCallback((worldX: number, worldY: number): DrawCoordinate | null => {
    const renderer = rendererRef.current;
    if (!renderer) return null;
    return toDrawCoordinate(renderer.worldToScreen(worldX, worldY));
  }, []);

  const screenToWorld = useCallback((clientX: number, clientY: number): DrawCoordinate | null => {
    const renderer = rendererRef.current;
    if (!renderer) return null;
    const raw = renderer.screenToWorld(clientX, clientY);
    if (!Array.isArray(raw) || raw.length < 2) return null;
    const x = Number(raw[0]);
    const y = Number(raw[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return [x, y];
  }, []);

  // --- viewState change propagation ---

  const emitViewStateChange = useCallback(
    (next: WsiViewState): void => {
      onViewStateChangeRef.current?.(next);
      drawInvalidateRef.current?.();
      overviewInvalidateRef.current?.();
      requestOverlayRedraw();
    },
    [requestOverlayRedraw]
  );

  // --- renderer lifecycle ---

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;

    const renderer = new WsiTileRenderer(canvas, source, {
      onViewStateChange: emitViewStateChange,
      onStats: handleRendererStats,
      onTileError: event => {
        onTileErrorRef.current?.(event);
      },
      onContextLost: () => {
        onContextLostRef.current?.();
      },
      onContextRestored: () => {
        onContextRestoredRef.current?.();
      },
      authToken,
      imageColorSettings,
      ctrlDragRotate,
      pointSizeByZoom,
      pointStrokeScale,
      pointInnerFillOpacity,
      minZoom,
      maxZoom,
      viewTransition,
      zoomSnaps,
      zoomSnapFitAsMin,
    });

    rendererRef.current = renderer;
    if (viewState) renderer.setViewState(viewState);
    renderer.setInteractionLock(interactionLocksRef.current.size > 0);

    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [source, handleRendererStats, authToken, ctrlDragRotate, emitViewStateChange]);

  // --- core renderer sync effects ---

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !viewState) return;
    if (renderer.isViewAnimating()) return;
    renderer.setViewState(viewState);
  }, [viewState]);

  useEffect(() => {
    rendererRef.current?.fitToImage();
  }, [fitNonce]);
  useEffect(() => {
    rendererRef.current?.resetRotation();
  }, [rotationResetNonce]);

  useEffect(() => {
    rendererRef.current?.setZoomRange(minZoom, maxZoom);
  }, [minZoom, maxZoom]);
  useEffect(() => {
    rendererRef.current?.setViewTransition(viewTransition);
  }, [viewTransition]);
  useEffect(() => {
    rendererRef.current?.setZoomSnaps(zoomSnaps, zoomSnapFitAsMin);
  }, [zoomSnaps, zoomSnapFitAsMin]);
  useEffect(() => {
    rendererRef.current?.setImageColorSettings(imageColorSettings);
  }, [imageColorSettings]);

  // --- overlay canvas setup ---

  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    drawInvalidateRef.current = requestOverlayRedraw;
    requestOverlayRedraw();

    const observer = new ResizeObserver(() => requestOverlayRedraw());
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      if (drawInvalidateRef.current === requestOverlayRedraw) {
        drawInvalidateRef.current = null;
      }
    };
  }, [requestOverlayRedraw]);

  // --- context value ---

  const contextValue = useMemo<ViewerContextValue>(
    () => ({
      source,
      rendererRef,
      canvasRef,
      drawInvalidateRef,
      overviewInvalidateRef,
      worldToScreen,
      screenToWorld,
      registerDrawCallback,
      unregisterDrawCallback,
      requestOverlayRedraw,
      setInteractionLock,
      isInteractionLocked,
    }),
    [source, worldToScreen, screenToWorld, registerDrawCallback, unregisterDrawCallback, requestOverlayRedraw, setInteractionLock, isInteractionLocked]
  );

  const cursorStyle = isInteractionLocked() ? "crosshair" : "grab";

  return (
    <ViewerContextProvider value={contextValue}>
      <div className={className} style={mergedStyle}>
        <canvas
          ref={canvasRef}
          className="wsi-render-canvas"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            width: "100%",
            height: "100%",
            display: "block",
            touchAction: "none",
            cursor: cursorStyle,
          }}
        />
        <canvas
          ref={overlayCanvasRef}
          className="wsi-overlay-canvas"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            width: "100%",
            height: "100%",
            display: "block",
            pointerEvents: "none",
            touchAction: "none",
          }}
        />
        {children}
        {debugOverlay && (
          <pre data-open-plant-debug-overlay style={mergedDebugOverlayStyle}>
            {debugOverlayText}
          </pre>
        )}
      </div>
    </ViewerContextProvider>
  );
}
