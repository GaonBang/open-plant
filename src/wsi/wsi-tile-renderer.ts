import { OrthoCamera } from "../core/ortho-camera";
import { observeDevicePixelRatioChanges } from "./device-pixel-ratio";
import { TileScheduler } from "./tile-scheduler";
import type { WsiImageColorSettings, WsiImageSource, WsiPointData, WsiRenderStats, WsiViewState } from "./types";
import { calcViewingMagnification, clamp, isSameViewState, nowMs } from "./utils";
import { addRendererCanvasEventListeners, type RendererCanvasHandlers, removeRendererCanvasEventListeners, resizeCanvasViewport } from "./wsi-canvas-lifecycle";
import { cancelDrag as cancelInputDrag, createRendererInputHandlers } from "./wsi-input-handlers";
import { applyWheelSnapDelta, applyWheelZoomDelta } from "./wsi-interaction";
import { destroyRenderer, handleContextLost } from "./wsi-lifecycle-ops";
import {
  arePointSizeMagnificationStopsEqual,
  arePointSizeStopsEqual,
  arePointWeightMagnificationStopsEqual,
  clonePointSizeMagnificationStops,
  clonePointSizeStops,
  clonePointWeightMagnificationStops,
  DEFAULT_POINT_INNER_FILL_COLOR,
  DEFAULT_POINT_SIZE_STOPS,
  DEFAULT_ROTATION_DRAG_SENSITIVITY,
  linearEasing,
  MAX_POINT_SIZE_PX,
  MIN_POINT_SIZE_PX,
  normalizePointInnerFillColor,
  normalizePointInnerFillOpacity,
  normalizePointLineDash,
  normalizePointOpacity,
  normalizePointSizeMagnificationStops,
  normalizePointSizeStops,
  normalizePointWeightMagnificationStops,
  normalizeStrokeScale,
  normalizeTransitionEasing,
  normalizeViewTransitionDuration,
  normalizeZoomOverride,
  resolvePointSizeByMagnificationStops,
  resolvePointSizeByZoomStops,
  resolvePointWeightByMagnificationStops,
  toNormalizedImageColorSettings,
} from "./wsi-normalize";
import type { PointBufferRuntime } from "./wsi-point-data";
import { setPointData as setManagedPointData, setPointPalette as setManagedPointPalette } from "./wsi-point-data";
import type { RenderPointLayer } from "./wsi-render-pass";
import { renderFrame } from "./wsi-render-pass";
import type {
  Bounds,
  CachedTile,
  InteractionState,
  NormalizedImageColorSettings,
  PointProgram,
  PointSizeByMagnification,
  PointSizeByZoom,
  PointSizeMagnificationStop,
  PointSizeStop,
  PointWeightByMagnification,
  PointWeightMagnificationStop,
  TileVertexProgram,
  ViewAnimationRuntimeState,
  WorldPoint,
  WsiTileErrorEvent,
  WsiTileRendererOptions,
  WsiViewTransitionOptions,
  ZoomSnapState,
} from "./wsi-renderer-types";
import { initPointProgram, initTileProgram } from "./wsi-shaders";
import { handleTileLoaded as cacheTileLoaded } from "./wsi-tile-cache";
import {
  clampViewState as clampManagedViewState,
  getViewBounds as getManagedViewBounds,
  getVisibleTiles as getManagedVisibleTiles,
  getVisibleTilesForTier as getManagedVisibleTilesForTier,
  intersectsBounds as intersectsManagedBounds,
} from "./wsi-tile-visibility";
import { cancelViewAnimation as cancelManagedViewAnimation, startViewAnimation } from "./wsi-view-animation";
import { computeFitToImageTarget, computeZoomByTarget, computeZoomToTarget, resolveTargetViewState as resolveManagedTargetViewState, resolveZoomBounds } from "./wsi-view-ops";
import { normalizeZoomSnaps, resolveSnapTarget, SNAP_ZOOM_DURATION_MS, startZoomPivotAnimation, type ZoomPivotAnimationContext } from "./wsi-zoom-snap";

export type {
  PointSizeByMagnification,
  PointSizeByZoom,
  PointWeightByMagnification,
  WsiTileErrorEvent,
  WsiTileRendererOptions,
  WsiTileSchedulerConfig,
  WsiViewTransitionOptions,
} from "./wsi-renderer-types";

const DEFAULT_POINT_LAYER_ID = "__default_point_layer__";

interface ManagedPointLayerState {
  id: string;
  program: PointProgram;
  runtime: PointBufferRuntime;
  pointSizeZoomStops: PointSizeStop[];
  pointSizeMagnificationStops: PointSizeMagnificationStop[] | null;
  pointWeightMagnificationStops: PointWeightMagnificationStop[] | null;
  pointOpacity: number;
  pointLineDash: [number, number];
  pointStrokeScale: number;
  pointInnerFillOpacity: number;
  pointInnerFillColor: [number, number, number];
}

export class WsiTileRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly source: WsiImageSource;
  private readonly gl: WebGL2RenderingContext;
  private readonly camera = new OrthoCamera();
  private readonly onViewStateChange?: (next: WsiViewState) => void;
  private readonly onStats?: (stats: WsiRenderStats) => void;
  private readonly onTileError?: (event: WsiTileErrorEvent) => void;
  private readonly onContextLost?: () => void;
  private readonly onContextRestored?: () => void;
  private readonly resizeObserver: ResizeObserver;
  private readonly removeDprListener: () => void;
  private tileProgram: TileVertexProgram;
  private readonly tileScheduler: TileScheduler;

  private authToken: string;
  private destroyed = false;
  private contextLost = false;
  private frame: number | null = null;
  private frameSerial = 0;
  private interactionState: InteractionState = {
    dragging: false,
    mode: "none",
    rotateLastAngleRad: null,
    pointerId: null,
    lastPointerX: 0,
    lastPointerY: 0,
  };
  private interactionLocked = false;
  private ctrlDragRotate = true;
  private rotationDragSensitivityDegPerPixel = DEFAULT_ROTATION_DRAG_SENSITIVITY;
  private maxCacheTiles: number;
  private fitZoom = 1;
  private initialRotationDeg = 0;
  private minZoom = 1e-6;
  private maxZoom = 1;
  private minZoomOverride: number | null = null;
  private maxZoomOverride: number | null = null;
  private viewTransitionDurationMs = 0;
  private viewTransitionEasing: (t: number) => number = linearEasing;
  private viewAnimationState: ViewAnimationRuntimeState = {
    animation: null,
    frame: null,
  };
  private readonly pointLayers = new Map<string, ManagedPointLayerState>();
  private defaultPointSizeZoomStops: PointSizeStop[] = clonePointSizeStops(DEFAULT_POINT_SIZE_STOPS);
  private defaultPointSizeMagnificationStops: PointSizeMagnificationStop[] | null = null;
  private defaultPointWeightMagnificationStops: PointWeightMagnificationStop[] | null = null;
  private defaultPointOpacity = 1.0;
  private defaultPointLineDash: [number, number] = [1, 0];
  private defaultPointStrokeScale = 1.0;
  private defaultPointInnerFillOpacity = 0;
  private defaultPointInnerFillColor: [number, number, number] = [...DEFAULT_POINT_INNER_FILL_COLOR];
  private imageColorSettings: NormalizedImageColorSettings = {
    brightness: 0,
    contrast: 0,
    saturation: 0,
  };
  private cache = new Map<string, CachedTile>();
  private zoomSnaps: number[] = [];
  private zoomSnapFitAsMin = false;
  private zoomSnapState: ZoomSnapState = { accumulatedDelta: 0, lastSnapTimeMs: 0, blockedDirection: null };
  private panExtentX = 0.2;
  private panExtentY = 0.2;

  private readonly boundPointerDown: (event: PointerEvent) => void;
  private readonly boundPointerMove: (event: PointerEvent) => void;
  private readonly boundPointerUp: (event: PointerEvent) => void;
  private readonly boundWheel: (event: WheelEvent) => void;
  private readonly boundDoubleClick: (event: MouseEvent) => void;
  private readonly boundContextMenu: (event: MouseEvent) => void;
  private readonly boundContextLost: (event: Event) => void;
  private readonly boundContextRestored: (event: Event) => void;

  private getCanvasHandlers(): RendererCanvasHandlers {
    return {
      pointerDown: this.boundPointerDown,
      pointerMove: this.boundPointerMove,
      pointerUp: this.boundPointerUp,
      wheel: this.boundWheel,
      doubleClick: this.boundDoubleClick,
      contextMenu: this.boundContextMenu,
      contextLost: this.boundContextLost,
      contextRestored: this.boundContextRestored,
    };
  }

  constructor(canvas: HTMLCanvasElement, source: WsiImageSource, options: WsiTileRendererOptions = {}) {
    this.canvas = canvas;
    this.source = source;
    this.onViewStateChange = options.onViewStateChange;
    this.onStats = options.onStats;
    this.onTileError = options.onTileError;
    this.onContextLost = options.onContextLost;
    this.onContextRestored = options.onContextRestored;
    this.authToken = options.authToken ?? "";
    this.maxCacheTiles = Math.max(32, Math.floor(options.maxCacheTiles ?? 320));
    this.initialRotationDeg = typeof options.initialRotationDeg === "number" && Number.isFinite(options.initialRotationDeg) ? options.initialRotationDeg : 0;
    this.ctrlDragRotate = options.ctrlDragRotate ?? true;
    this.rotationDragSensitivityDegPerPixel =
      typeof options.rotationDragSensitivityDegPerPixel === "number" && Number.isFinite(options.rotationDragSensitivityDegPerPixel)
        ? Math.max(0, options.rotationDragSensitivityDegPerPixel)
        : DEFAULT_ROTATION_DRAG_SENSITIVITY;
    this.defaultPointSizeZoomStops = normalizePointSizeStops(options.pointSizeByZoom);
    this.defaultPointSizeMagnificationStops = normalizePointSizeMagnificationStops(options.pointSizeByMagnification);
    this.defaultPointWeightMagnificationStops = normalizePointWeightMagnificationStops(options.pointWeightByMagnification);
    this.defaultPointOpacity = normalizePointOpacity(options.pointOpacity);
    this.defaultPointStrokeScale = normalizeStrokeScale(options.pointStrokeScale);
    this.defaultPointInnerFillOpacity = normalizePointInnerFillOpacity(options.pointInnerFillOpacity);
    this.defaultPointInnerFillColor = normalizePointInnerFillColor(options.pointInnerFillColor);
    this.imageColorSettings = toNormalizedImageColorSettings(options.imageColorSettings);
    this.minZoomOverride = normalizeZoomOverride(options.minZoom);
    this.maxZoomOverride = normalizeZoomOverride(options.maxZoom);
    this.viewTransitionDurationMs = normalizeViewTransitionDuration(options.viewTransition?.duration);
    this.viewTransitionEasing = normalizeTransitionEasing(options.viewTransition?.easing);
    this.zoomSnaps = normalizeZoomSnaps(options.zoomSnaps, this.source.mpp);
    this.zoomSnapFitAsMin = Boolean(options.zoomSnapFitAsMin);
    this.applyPanExtent(options.panExtent);

    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
    });
    if (!gl) {
      throw new Error("WebGL2 not supported");
    }
    this.gl = gl;

    this.tileProgram = initTileProgram(this.gl);
    this.tileScheduler = new TileScheduler({
      authToken: this.authToken,
      maxConcurrency: options.tileScheduler?.maxConcurrency ?? 12,
      maxRetries: options.tileScheduler?.maxRetries ?? 2,
      retryBaseDelayMs: options.tileScheduler?.retryBaseDelayMs ?? 120,
      retryMaxDelayMs: options.tileScheduler?.retryMaxDelayMs ?? 1200,
      onTileLoad: (tile, bitmap) =>
        cacheTileLoaded({
          gl: this.gl,
          cache: this.cache,
          tile,
          bitmap,
          frameSerial: this.frameSerial,
          maxCacheTiles: this.maxCacheTiles,
          destroyed: this.destroyed,
          contextLost: this.contextLost,
          requestRender: () => this.requestRender(),
        }),
      onTileError: (tile, error, attemptCount) => {
        this.onTileError?.({ tile, error, attemptCount });
        console.warn("tile load failed", tile.url, error);
      },
    });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.removeDprListener = observeDevicePixelRatioChanges(() => this.resize());

    const inputHandlers = createRendererInputHandlers({
      canvas: this.canvas,
      state: this.interactionState,
      getInteractionLocked: () => this.interactionLocked,
      getCtrlDragRotate: () => this.ctrlDragRotate,
      getRotationDragSensitivityDegPerPixel: () => this.rotationDragSensitivityDegPerPixel,
      cancelViewAnimation: () => this.cancelViewAnimation(),
      camera: this.camera,
      source: this.source,
      emitViewState: () => this.onViewStateChange?.(this.camera.getViewState()),
      requestRender: () => this.requestRender(),
      getPanExtentX: () => this.panExtentX,
      getPanExtentY: () => this.panExtentY,
      zoomBy: (factor, x, y) => this.zoomBy(factor, x, y),
      getUseZoomSnaps: () => this.zoomSnaps.length > 0,
      onSnapZoom: (direction, x, y) => this.handleSnapZoom(direction, x, y),
      zoomSnapState: this.zoomSnapState,
    });
    this.boundPointerDown = inputHandlers.pointerDown;
    this.boundPointerMove = inputHandlers.pointerMove;
    this.boundPointerUp = inputHandlers.pointerUp;
    this.boundWheel = inputHandlers.wheel;
    this.boundDoubleClick = inputHandlers.doubleClick;
    this.boundContextMenu = inputHandlers.contextMenu;
    this.boundContextLost = (event: Event) => this.onWebGlContextLost(event);
    this.boundContextRestored = (event: Event) => this.onWebGlContextRestored(event);

    addRendererCanvasEventListeners(canvas, this.getCanvasHandlers());

    this.fitToImage({ duration: 0 });
    this.resize();
  }

  private applyZoomBounds(): void {
    const bounds = resolveZoomBounds(this.fitZoom, this.minZoomOverride, this.maxZoomOverride);
    this.minZoom = bounds.minZoom;
    this.maxZoom = bounds.maxZoom;
  }

  private resolveTargetViewState(next: Partial<WsiViewState>): WsiViewState {
    return resolveManagedTargetViewState(this.camera, this.minZoom, this.maxZoom, next, () => clampManagedViewState(this.camera, this.source, this.panExtentX, this.panExtentY));
  }

  private cancelViewAnimation(): void {
    cancelManagedViewAnimation(this.viewAnimationState);
  }

  private startViewAnimation(target: WsiViewState, durationMs: number, easing: (t: number) => number): void {
    this.resetZoomSnapStateForZoomChange(this.camera.getViewState().zoom, target.zoom);
    startViewAnimation({
      state: this.viewAnimationState,
      camera: this.camera,
      target,
      durationMs,
      easing,
      onUpdate: () => {
        clampManagedViewState(this.camera, this.source, this.panExtentX, this.panExtentY);
        this.onViewStateChange?.(this.camera.getViewState());
        this.requestRender();
      },
    });
  }

  private createPointBufferRuntime(): PointBufferRuntime {
    return {
      pointCount: 0,
      usePointIndices: false,
      pointBuffersDirty: true,
      lastPointData: null,
      zeroFillModes: new Uint8Array(0),
      lastPointPalette: null,
      pointPaletteSize: 1,
    };
  }

  private createPointLayerState(id: string): ManagedPointLayerState {
    return {
      id,
      program: initPointProgram(this.gl),
      runtime: this.createPointBufferRuntime(),
      pointSizeZoomStops: clonePointSizeStops(this.defaultPointSizeZoomStops),
      pointSizeMagnificationStops: clonePointSizeMagnificationStops(this.defaultPointSizeMagnificationStops),
      pointWeightMagnificationStops: clonePointWeightMagnificationStops(this.defaultPointWeightMagnificationStops),
      pointOpacity: this.defaultPointOpacity,
      pointLineDash: [...this.defaultPointLineDash] as [number, number],
      pointStrokeScale: this.defaultPointStrokeScale,
      pointInnerFillOpacity: this.defaultPointInnerFillOpacity,
      pointInnerFillColor: [...this.defaultPointInnerFillColor],
    };
  }

  private ensurePointLayer(layerId: string = DEFAULT_POINT_LAYER_ID): ManagedPointLayerState {
    const nextId = String(layerId || DEFAULT_POINT_LAYER_ID);
    const existing = this.pointLayers.get(nextId);
    if (existing) return existing;

    const created = this.createPointLayerState(nextId);
    this.pointLayers.set(nextId, created);
    return created;
  }

  private deletePointProgram(program: PointProgram): void {
    if (this.contextLost || this.gl.isContextLost()) return;
    this.gl.deleteBuffer(program.posBuffer);
    this.gl.deleteBuffer(program.classBuffer);
    this.gl.deleteBuffer(program.fillModeBuffer);
    this.gl.deleteBuffer(program.indexBuffer);
    this.gl.deleteTexture(program.paletteTexture);
    this.gl.deleteVertexArray(program.vao);
    this.gl.deleteProgram(program.program);
  }

  private getPointRenderLayers(): RenderPointLayer[] {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const out: RenderPointLayer[] = [];
    for (const layer of this.pointLayers.values()) {
      const pointCssSizePx = this.getPointSize(layer.id);
      out.push({
        pointProgram: layer.program,
        pointCount: layer.runtime.pointCount,
        usePointIndices: layer.runtime.usePointIndices,
        pointPaletteSize: layer.runtime.pointPaletteSize,
        pointLineDash: layer.pointLineDash,
        pointOpacity: layer.pointOpacity,
        pointStrokeScale: this.getPointStrokeScale(layer.id),
        pointInnerFillOpacity: layer.pointInnerFillOpacity,
        pointInnerFillColor: layer.pointInnerFillColor,
        pointCssSizePx,
        pointSizePx: pointCssSizePx * dpr,
      });
    }
    return out;
  }

  private resetZoomSnapState(): void {
    this.zoomSnapState.accumulatedDelta = 0;
    this.zoomSnapState.lastSnapTimeMs = 0;
    this.zoomSnapState.blockedDirection = null;
  }

  private resetZoomSnapStateForZoomChange(currentZoom: number, targetZoom: number): void {
    if (Math.abs(currentZoom - targetZoom) < 1e-6) return;
    this.resetZoomSnapState();
  }

  private applyViewStateAndRender(next: WsiViewState, cancelAnimation = true): void {
    const current = this.camera.getViewState();
    if (cancelAnimation) {
      this.cancelViewAnimation();
    }
    this.resetZoomSnapStateForZoomChange(current.zoom, next.zoom);
    this.camera.setViewState(next);
    this.onViewStateChange?.(this.camera.getViewState());
    this.requestRender();
  }

  setAuthToken(token: string): void {
    this.authToken = String(token ?? "");
    this.tileScheduler.setAuthToken(this.authToken);
  }

  setZoomRange(minZoom: number | null | undefined, maxZoom: number | null | undefined): void {
    const nextMinOverride = normalizeZoomOverride(minZoom);
    const nextMaxOverride = normalizeZoomOverride(maxZoom);
    if (this.minZoomOverride === nextMinOverride && this.maxZoomOverride === nextMaxOverride) {
      return;
    }

    this.minZoomOverride = nextMinOverride;
    this.maxZoomOverride = nextMaxOverride;
    this.applyZoomBounds();
    this.resetZoomSnapState();

    const target = this.resolveTargetViewState({});
    const current = this.camera.getViewState();
    if (isSameViewState(current, target)) {
      return;
    }
    this.applyViewStateAndRender(target);
  }

  setViewTransition(options: WsiViewTransitionOptions | null | undefined): void {
    this.viewTransitionDurationMs = normalizeViewTransitionDuration(options?.duration);
    this.viewTransitionEasing = normalizeTransitionEasing(options?.easing);
  }

  setViewState(next: Partial<WsiViewState>, transition?: WsiViewTransitionOptions): void {
    const target = this.resolveTargetViewState(next);
    const current = this.camera.getViewState();
    if (isSameViewState(current, target)) return;

    const durationMs = normalizeViewTransitionDuration(transition?.duration ?? this.viewTransitionDurationMs);
    const easing = normalizeTransitionEasing(transition?.easing ?? this.viewTransitionEasing);
    if (durationMs <= 0) {
      this.applyViewStateAndRender(target);
      return;
    }

    this.startViewAnimation(target, durationMs, easing);
  }

  getViewState(): WsiViewState {
    return this.camera.getViewState();
  }

  getZoomRange(): { minZoom: number; maxZoom: number } {
    return { minZoom: this.minZoom, maxZoom: this.maxZoom };
  }

  getRegionLabelAutoLiftCapZoom(): number {
    const valid = this.zoomSnaps.filter(z => z >= this.minZoom && z <= this.maxZoom);
    if (valid.length > 0) {
      return valid[valid.length - 1];
    }
    return this.maxZoom;
  }

  isViewAnimating(): boolean {
    return this.viewAnimationState.animation !== null;
  }

  registerPointLayer(layerId: string): void {
    this.ensurePointLayer(layerId);
  }

  unregisterPointLayer(layerId: string): void {
    const nextId = String(layerId || DEFAULT_POINT_LAYER_ID);
    const layer = this.pointLayers.get(nextId);
    if (!layer) return;
    this.pointLayers.delete(nextId);
    this.deletePointProgram(layer.program);
    this.requestRender();
  }

  setPointPalette(colors: Uint8Array | null | undefined, layerId: string = DEFAULT_POINT_LAYER_ID): void {
    const layer = this.ensurePointLayer(layerId);
    layer.runtime = setManagedPointPalette(layer.runtime, this.gl, layer.program, this.contextLost, colors);
    if (!colors || colors.length === 0) {
      return;
    }
    this.requestRender();
  }

  setPointLineDash(dashed: [number, number] | null | undefined, layerId: string = DEFAULT_POINT_LAYER_ID): void {
    const layer = this.ensurePointLayer(layerId);
    const next = normalizePointLineDash(dashed);
    if (layer.pointLineDash[0] === next[0] && layer.pointLineDash[1] === next[1]) return;
    layer.pointLineDash = next;
    this.requestRender();
  }

  setPointData(points: WsiPointData | null | undefined, layerId: string = DEFAULT_POINT_LAYER_ID): void {
    const layer = this.ensurePointLayer(layerId);
    layer.runtime = setManagedPointData(layer.runtime, this.gl, layer.program, this.contextLost, points);
    this.requestRender();
  }

  setInteractionLock(locked: boolean): void {
    const next = Boolean(locked);
    if (this.interactionLocked === next) return;
    this.interactionLocked = next;
    if (next) this.cancelDrag();
  }

  setPointSizeByZoom(pointSizeByZoom: PointSizeByZoom | null | undefined, layerId: string = DEFAULT_POINT_LAYER_ID): void {
    const layer = this.ensurePointLayer(layerId);
    const nextStops = normalizePointSizeStops(pointSizeByZoom);
    if (arePointSizeStopsEqual(layer.pointSizeZoomStops, nextStops)) return;
    layer.pointSizeZoomStops = nextStops;
    this.requestRender();
  }

  setPointSizeByMagnification(pointSizeByMagnification: PointSizeByMagnification | null | undefined, layerId: string = DEFAULT_POINT_LAYER_ID): void {
    const layer = this.ensurePointLayer(layerId);
    const nextStops = normalizePointSizeMagnificationStops(pointSizeByMagnification);
    if (arePointSizeMagnificationStopsEqual(layer.pointSizeMagnificationStops, nextStops)) return;
    layer.pointSizeMagnificationStops = nextStops;
    this.requestRender();
  }

  setPointWeightByMagnification(pointWeightByMagnification: PointWeightByMagnification | null | undefined, layerId: string = DEFAULT_POINT_LAYER_ID): void {
    const layer = this.ensurePointLayer(layerId);
    const nextStops = normalizePointWeightMagnificationStops(pointWeightByMagnification);
    if (arePointWeightMagnificationStopsEqual(layer.pointWeightMagnificationStops, nextStops)) return;
    layer.pointWeightMagnificationStops = nextStops;
    this.requestRender();
  }

  setPointOpacity(opacity: number | null | undefined, layerId: string = DEFAULT_POINT_LAYER_ID): void {
    const layer = this.ensurePointLayer(layerId);
    const next = normalizePointOpacity(opacity);
    if (layer.pointOpacity === next) return;
    layer.pointOpacity = next;
    this.requestRender();
  }

  setPointStrokeScale(scale: number | null | undefined, layerId: string = DEFAULT_POINT_LAYER_ID): void {
    const layer = this.ensurePointLayer(layerId);
    const next = normalizeStrokeScale(scale);
    if (layer.pointStrokeScale === next) return;
    layer.pointStrokeScale = next;
    this.requestRender();
  }

  setPointInnerFillOpacity(opacity: number | null | undefined, layerId: string = DEFAULT_POINT_LAYER_ID): void {
    const layer = this.ensurePointLayer(layerId);
    const next = normalizePointInnerFillOpacity(opacity);
    if (layer.pointInnerFillOpacity === next) return;
    layer.pointInnerFillOpacity = next;
    this.requestRender();
  }

  setPointInnerFillColor(color: string | null | undefined, layerId: string = DEFAULT_POINT_LAYER_ID): void {
    const layer = this.ensurePointLayer(layerId);
    const next = normalizePointInnerFillColor(color);
    if (layer.pointInnerFillColor[0] === next[0] && layer.pointInnerFillColor[1] === next[1] && layer.pointInnerFillColor[2] === next[2]) {
      return;
    }
    layer.pointInnerFillColor = next;
    this.requestRender();
  }

  setImageColorSettings(settings: WsiImageColorSettings | null | undefined): void {
    const next = toNormalizedImageColorSettings(settings);
    const prev = this.imageColorSettings;
    if (prev.brightness === next.brightness && prev.contrast === next.contrast && prev.saturation === next.saturation) {
      return;
    }
    this.imageColorSettings = next;
    this.requestRender();
  }

  cancelDrag(): void {
    cancelInputDrag(this.canvas, this.interactionState);
  }

  screenToWorld(clientX: number, clientY: number): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return this.camera.screenToWorld(sx, sy);
  }

  worldToScreen(worldX: number, worldY: number): [number, number] {
    return this.camera.worldToScreen(worldX, worldY);
  }

  setViewCenter(worldX: number, worldY: number, transition?: WsiViewTransitionOptions): void {
    if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return;
    const state = this.camera.getViewState();
    const zoom = Math.max(1e-6, state.zoom);
    const vp = this.camera.getViewportSize();
    this.setViewState(
      {
        offsetX: worldX - vp.width / (2 * zoom),
        offsetY: worldY - vp.height / (2 * zoom),
      },
      transition
    );
  }

  getViewCorners(): [WorldPoint, WorldPoint, WorldPoint, WorldPoint] {
    return this.camera.getViewCorners();
  }

  getInitialRotationDeg(): number {
    return this.initialRotationDeg;
  }

  getViewBounds(): Bounds {
    return getManagedViewBounds(this.camera);
  }

  resetRotation(transition?: WsiViewTransitionOptions): void {
    const state = this.camera.getViewState();
    if (Math.abs(state.rotationDeg - this.initialRotationDeg) < 1e-6) return;
    this.setViewState({ rotationDeg: this.initialRotationDeg }, transition);
  }

  getPointSize(layerId: string = DEFAULT_POINT_LAYER_ID): number {
    const layer = this.pointLayers.get(String(layerId || DEFAULT_POINT_LAYER_ID));
    const magnificationStops = layer?.pointSizeMagnificationStops ?? this.defaultPointSizeMagnificationStops;
    if (magnificationStops && magnificationStops.length > 0) {
      const zoom = Math.max(1e-6, this.camera.getViewState().zoom);
      const magnification = calcViewingMagnification(this.source.mpp ?? 0, zoom);
      if (magnification > 0) {
        const size = resolvePointSizeByMagnificationStops(magnification, magnificationStops);
        return clamp(size, MIN_POINT_SIZE_PX, MAX_POINT_SIZE_PX);
      }
    }

    const zoom = Math.max(1e-6, this.camera.getViewState().zoom);
    const continuousZoom = this.source.maxTierZoom + Math.log2(zoom);
    const stops = layer?.pointSizeZoomStops ?? this.defaultPointSizeZoomStops;
    const size = resolvePointSizeByZoomStops(continuousZoom, stops);
    return clamp(size, MIN_POINT_SIZE_PX, MAX_POINT_SIZE_PX);
  }

  getPointSizeByZoom(layerId: string = DEFAULT_POINT_LAYER_ID): number {
    return this.getPointSize(layerId);
  }

  getPointStrokeScale(layerId: string = DEFAULT_POINT_LAYER_ID): number {
    const layer = this.pointLayers.get(String(layerId || DEFAULT_POINT_LAYER_ID));
    const magnificationStops = layer?.pointWeightMagnificationStops ?? this.defaultPointWeightMagnificationStops;
    if (magnificationStops && magnificationStops.length > 0) {
      const zoom = Math.max(1e-6, this.camera.getViewState().zoom);
      const magnification = calcViewingMagnification(this.source.mpp ?? 0, zoom);
      if (magnification > 0) {
        return normalizeStrokeScale(resolvePointWeightByMagnificationStops(magnification, magnificationStops));
      }
    }
    return layer?.pointStrokeScale ?? this.defaultPointStrokeScale;
  }

  fitToImage(transition?: WsiViewTransitionOptions): void {
    const rect = this.canvas.getBoundingClientRect();
    const vw = Math.max(1, rect.width || 1);
    const vh = Math.max(1, rect.height || 1);
    const fitTarget = computeFitToImageTarget(this.source, vw, vh, this.minZoom, this.maxZoom, this.initialRotationDeg);
    this.fitZoom = fitTarget.fitZoom;
    this.applyZoomBounds();
    this.setViewState(fitTarget.target, transition);
  }

  zoomBy(factor: number, screenX: number, screenY: number, transition?: WsiViewTransitionOptions): void {
    const target = computeZoomByTarget(this.camera, this.minZoom, this.maxZoom, factor, screenX, screenY);
    if (!target) return;
    this.setViewState(target, transition);
  }

  handleWheelZoom(deltaY: number, screenX: number, screenY: number): void {
    if (this.zoomSnaps.length > 0) {
      applyWheelSnapDelta(deltaY, screenX, screenY, this.zoomSnapState, (direction, x, y) => this.handleSnapZoom(direction, x, y));
      return;
    }
    applyWheelZoomDelta(deltaY, screenX, screenY, (factor, x, y) => this.zoomBy(factor, x, y));
  }

  zoomTo(zoom: number, screenX: number, screenY: number, transition?: WsiViewTransitionOptions): void {
    const target = computeZoomToTarget(this.camera, this.minZoom, this.maxZoom, zoom, screenX, screenY);
    if (!target) return;
    this.setViewState(target, transition);
  }

  setZoomSnaps(magnifications: number[] | null | undefined, fitAsMin?: boolean): void {
    this.zoomSnaps = normalizeZoomSnaps(magnifications, this.source.mpp);
    this.zoomSnapFitAsMin = Boolean(fitAsMin);
    this.resetZoomSnapState();
  }

  setPanExtent(extent: number | { x: number; y: number } | null | undefined): void {
    this.applyPanExtent(extent);
  }

  private applyPanExtent(extent: number | { x: number; y: number } | null | undefined): void {
    if (typeof extent === "number" && Number.isFinite(extent)) {
      this.panExtentX = Math.max(0, extent);
      this.panExtentY = Math.max(0, extent);
    } else if (extent != null && typeof extent === "object") {
      this.panExtentX = typeof extent.x === "number" && Number.isFinite(extent.x) ? Math.max(0, extent.x) : 0.2;
      this.panExtentY = typeof extent.y === "number" && Number.isFinite(extent.y) ? Math.max(0, extent.y) : 0.2;
    } else {
      this.panExtentX = 0.2;
      this.panExtentY = 0.2;
    }
  }

  private getZoomPivotAnimationContext(): ZoomPivotAnimationContext {
    return {
      camera: this.camera,
      viewAnimationState: this.viewAnimationState,
      minZoom: this.minZoom,
      maxZoom: this.maxZoom,
      cancelViewAnimation: () => this.cancelViewAnimation(),
      clampViewState: () => clampManagedViewState(this.camera, this.source, this.panExtentX, this.panExtentY),
      onViewStateChange: state => this.onViewStateChange?.(state),
      requestRender: () => this.requestRender(),
    };
  }

  private handleSnapZoom(direction: "in" | "out", screenX: number, screenY: number): boolean {
    const ongoing = this.viewAnimationState.animation;
    const baseZoom = ongoing ? ongoing.to.zoom : this.camera.getViewState().zoom;
    const validSnaps = this.zoomSnaps.filter(z => z >= this.minZoom && z <= this.maxZoom);
    const result = resolveSnapTarget(validSnaps, baseZoom, direction, this.zoomSnapFitAsMin);
    if (!result) return false;

    let targetZoom: number;

    if (result.type === "fit") {
      const rect = this.canvas.getBoundingClientRect();
      const vw = Math.max(1, rect.width || 1);
      const vh = Math.max(1, rect.height || 1);
      const fitTarget = computeFitToImageTarget(this.source, vw, vh, this.minZoom, this.maxZoom, this.initialRotationDeg);
      this.fitZoom = fitTarget.fitZoom;
      this.applyZoomBounds();
      targetZoom = fitTarget.target.zoom;
    } else {
      targetZoom = result.zoom;
    }

    const epsilon = Math.max(Math.abs(targetZoom) * 0.005, 1e-8);

    if (ongoing) {
      const ongoingDirection: "in" | "out" | null = ongoing.to.zoom > ongoing.from.zoom + epsilon ? "in" : ongoing.to.zoom < ongoing.from.zoom - epsilon ? "out" : null;
      if (ongoingDirection === direction && Math.abs(ongoing.to.zoom - targetZoom) <= epsilon) {
        return false;
      }
    } else if (Math.abs(baseZoom - targetZoom) <= epsilon) {
      return false;
    }

    startZoomPivotAnimation(this.getZoomPivotAnimationContext(), targetZoom, screenX, screenY, SNAP_ZOOM_DURATION_MS);
    return true;
  }

  render(): void {
    if (this.destroyed || this.contextLost || this.gl.isContextLost()) return;
    const frameStartMs = this.onStats ? nowMs() : 0;
    this.frameSerial += 1;

    const result = renderFrame({
      gl: this.gl,
      camera: this.camera,
      source: this.source,
      cache: this.cache,
      frameSerial: this.frameSerial,
      tileProgram: this.tileProgram,
      imageColorSettings: this.imageColorSettings,
      pointLayers: this.getPointRenderLayers(),
      tileScheduler: this.tileScheduler,
      getVisibleTiles: () => getManagedVisibleTiles(this.camera, this.source),
      getVisibleTilesForTier: tier => getManagedVisibleTilesForTier(this.camera, this.source, tier),
      getViewBounds: () => getManagedViewBounds(this.camera),
      intersectsBounds: intersectsManagedBounds,
    });
    if (this.onStats) {
      const schedulerStats = this.tileScheduler.getSnapshot();
      this.onStats({
        tier: result.tier,
        visible: result.visible,
        rendered: result.rendered,
        points: result.points,
        fallback: result.fallback,
        cache: this.cache.size,
        inflight: schedulerStats.inflight,
        queued: schedulerStats.queued,
        retries: schedulerStats.retries,
        failed: schedulerStats.failed,
        aborted: schedulerStats.aborted,
        cacheHits: result.cacheHits,
        cacheMisses: result.cacheMisses,
        drawCalls: result.drawCalls,
        frameMs: nowMs() - frameStartMs,
      });
    }
  }

  requestRender(): void {
    if (this.frame !== null || this.destroyed || this.contextLost || this.gl.isContextLost()) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.render();
    });
  }

  resize(): void {
    resizeCanvasViewport(this.canvas, this.gl, this.camera);
    this.requestRender();
  }

  private onWebGlContextLost(event: Event): void {
    const result = handleContextLost({
      event,
      destroyed: this.destroyed,
      contextLost: this.contextLost,
      frame: this.frame,
      cancelViewAnimation: () => this.cancelViewAnimation(),
      cancelDrag: () => this.cancelDrag(),
      tileScheduler: this.tileScheduler,
      cache: this.cache,
      onContextLost: this.onContextLost,
    });
    if (!result.handled) return;
    this.frame = result.frame;
    this.contextLost = true;
    for (const layer of this.pointLayers.values()) {
      layer.runtime = {
        ...layer.runtime,
        pointBuffersDirty: true,
      };
    }
  }

  private onWebGlContextRestored(_event: Event): void {
    if (this.destroyed) return;
    this.contextLost = false;
    this.cache.clear();

    this.tileProgram = initTileProgram(this.gl);
    for (const layer of this.pointLayers.values()) {
      layer.program = initPointProgram(this.gl);
      layer.runtime = {
        ...layer.runtime,
        pointBuffersDirty: true,
      };
      if (layer.runtime.lastPointPalette && layer.runtime.lastPointPalette.length > 0) {
        layer.runtime = setManagedPointPalette(layer.runtime, this.gl, layer.program, this.contextLost, layer.runtime.lastPointPalette);
      }
      if (layer.runtime.lastPointData) {
        layer.runtime = setManagedPointData(layer.runtime, this.gl, layer.program, this.contextLost, layer.runtime.lastPointData);
      }
    }

    this.resize();
    this.onContextRestored?.();
  }

  destroy(): void {
    const result = destroyRenderer({
      destroyed: this.destroyed,
      frame: this.frame,
      cancelViewAnimation: () => this.cancelViewAnimation(),
      resizeObserver: this.resizeObserver,
      removeDprListener: this.removeDprListener,
      removeCanvasEventListeners: () => removeRendererCanvasEventListeners(this.canvas, this.getCanvasHandlers()),
      cancelDrag: () => this.cancelDrag(),
      tileScheduler: this.tileScheduler,
      contextLost: this.contextLost,
      gl: this.gl,
      cache: this.cache,
      tileProgram: this.tileProgram,
      pointPrograms: Array.from(this.pointLayers.values(), layer => layer.program),
    });
    if (!result.didDestroy) return;
    this.destroyed = true;
    this.frame = result.frame;
  }
}
