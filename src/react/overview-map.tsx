import { type CSSProperties, type MutableRefObject, type ReactNode, type PointerEvent as ReactPointerEvent, type RefObject, useCallback, useEffect, useMemo, useRef } from "react";
import { observeDevicePixelRatioChanges } from "../wsi/device-pixel-ratio";
import { toTileUrl } from "../wsi/image-info";
import type { WsiImageSource, WsiViewState } from "../wsi/types";
import { clamp } from "../wsi/utils";

type Bounds = [number, number, number, number];

interface RotatedImageMetrics {
  cos: number;
  sin: number;
  minX: number;
  minY: number;
  width: number;
  height: number;
  translateX: number;
  translateY: number;
}

interface OverviewImageLayout {
  contentX: number;
  contentY: number;
  contentWidth: number;
  contentHeight: number;
  metrics: RotatedImageMetrics;
}

function shouldAttachAuthHeaderToOverviewTile(url: string, authToken: string): boolean {
  if (!authToken) return false;
  const host = new URL(url, typeof window !== "undefined" ? window.location.href : undefined).hostname.toLowerCase();
  if (host.includes("amazonaws.com") || host.startsWith("s3.") || host.includes(".s3.")) return false;
  return true;
}

export interface OverviewMapProjector {
  getViewState: () => WsiViewState;
  setViewState: (next: Partial<WsiViewState>) => void;
  setViewCenter?: (worldX: number, worldY: number) => void;
  getViewBounds?: () => number[];
  getViewCorners?: () => Array<[number, number]>;
  getInitialRotationDeg?: () => number;
}

export type OverviewMapPosition = "bottom-right" | "bottom-left" | "top-right" | "top-left";

export type ViewportBorderStyle = "stroke" | "dash";

export interface OverviewMapOptions {
  width: number;
  height: number;
  margin: number;
  position: OverviewMapPosition;
  borderRadius: number;
  borderWidth: number;
  backgroundColor: string;
  borderColor: string;
  viewportBorderColor: string;
  viewportBorderStyle: ViewportBorderStyle;
  viewportFillColor: string;
  interactive: boolean;
  showThumbnail: boolean;
  maxThumbnailTiles: number;
  onClose?: () => void;
  closeIcon?: ReactNode;
  closeButtonStyle?: CSSProperties;
}

export interface OverviewMapProps {
  source: WsiImageSource;
  projectorRef: RefObject<OverviewMapProjector | null>;
  authToken?: string;
  options?: Partial<OverviewMapOptions>;
  invalidateRef?: MutableRefObject<(() => void) | null>;
  className?: string;
  style?: CSSProperties;
}

const DEFAULT_OVERVIEW_MAP_OPTIONS: OverviewMapOptions = {
  width: 200,
  height: 125,
  margin: 16,
  position: "bottom-right",
  borderRadius: 6,
  borderWidth: 0,
  backgroundColor: "rgba(4, 10, 18, 0.88)",
  borderColor: "rgba(230, 244, 255, 0.35)",
  viewportBorderColor: "rgba(255, 106, 61, 0.95)",
  viewportBorderStyle: "dash",
  viewportFillColor: "transparent",
  interactive: true,
  showThumbnail: true,
  maxThumbnailTiles: 16,
};

function strokeSymmetricDashedPolygon(ctx: CanvasRenderingContext2D, points: Array<[number, number]>, dashLen: number, gapLen: number): void {
  const len = points.length;
  if (len < 3) return;
  if (dashLen <= 0 || gapLen <= 0) return;

  for (let i = 0; i < len; i += 1) {
    const from = points[i];
    const to = points[(i + 1) % len];
    const sideLen = Math.hypot(to[0] - from[0], to[1] - from[1]);
    if (sideLen < 1e-6) continue;

    const n = Math.max(1, Math.round((sideLen + gapLen) / (dashLen + gapLen)));
    const fittedLen = n * dashLen + (n - 1) * gapLen;
    const scale = sideLen / Math.max(1e-6, fittedLen);
    const adjDash = dashLen * scale;
    const adjGap = gapLen * scale;

    ctx.beginPath();
    ctx.moveTo(from[0], from[1]);
    ctx.lineTo(to[0], to[1]);
    ctx.setLineDash([adjDash, adjGap]);
    ctx.lineDashOffset = 0;
    ctx.stroke();
  }

  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
}

function isSamePoint(a: readonly [number, number], b: readonly [number, number], epsilon = 1e-4): boolean {
  return Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon;
}

function compactPolygonPoints(points: Array<[number, number]>): Array<[number, number]> {
  const compact: Array<[number, number]> = [];
  for (const point of points) {
    const prev = compact[compact.length - 1];
    if (!prev || !isSamePoint(prev, point)) {
      compact.push(point);
    }
  }
  if (compact.length > 1 && isSamePoint(compact[0], compact[compact.length - 1])) {
    compact.pop();
  }
  return compact;
}

function intersectAtX(from: readonly [number, number], to: readonly [number, number], x: number): [number, number] {
  const dx = to[0] - from[0];
  if (Math.abs(dx) < 1e-6) return [x, from[1]];
  const t = (x - from[0]) / dx;
  return [x, from[1] + (to[1] - from[1]) * t];
}

function intersectAtY(from: readonly [number, number], to: readonly [number, number], y: number): [number, number] {
  const dy = to[1] - from[1];
  if (Math.abs(dy) < 1e-6) return [from[0], y];
  const t = (y - from[1]) / dy;
  return [from[0] + (to[0] - from[0]) * t, y];
}

function clipPolygonToRect(points: Array<[number, number]>, minX: number, minY: number, maxX: number, maxY: number): Array<[number, number]> {
  let output = compactPolygonPoints(points);
  if (output.length < 3) return [];

  const edges: Array<{
    inside: (point: readonly [number, number]) => boolean;
    intersect: (from: readonly [number, number], to: readonly [number, number]) => [number, number];
  }> = [
    {
      inside: point => point[0] >= minX,
      intersect: (from, to) => intersectAtX(from, to, minX),
    },
    {
      inside: point => point[0] <= maxX,
      intersect: (from, to) => intersectAtX(from, to, maxX),
    },
    {
      inside: point => point[1] >= minY,
      intersect: (from, to) => intersectAtY(from, to, minY),
    },
    {
      inside: point => point[1] <= maxY,
      intersect: (from, to) => intersectAtY(from, to, maxY),
    },
  ];

  for (const edge of edges) {
    if (output.length === 0) return [];
    const input = output;
    output = [];
    let prev = input[input.length - 1];
    let prevInside = edge.inside(prev);
    for (const curr of input) {
      const currInside = edge.inside(curr);
      if (currInside) {
        if (!prevInside) {
          output.push(edge.intersect(prev, curr));
        }
        output.push(curr);
      } else if (prevInside) {
        output.push(edge.intersect(prev, curr));
      }
      prev = curr;
      prevInside = currInside;
    }
    output = compactPolygonPoints(output);
  }

  return output.length >= 3 ? output : [];
}

function toPositiveNumber(value: number | undefined, fallback: number, min = 1): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, value);
}

function toFiniteRotation(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function getRotatedImageMetrics(imageWidth: number, imageHeight: number, rotationDeg: number): RotatedImageMetrics {
  const safeRotation = toFiniteRotation(rotationDeg);
  const rad = toRadians(safeRotation);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const centerX = imageWidth * 0.5;
  const centerY = imageHeight * 0.5;
  const translateX = -cos * centerX - sin * centerY;
  const translateY = sin * centerX - cos * centerY;

  const corners: Array<[number, number]> = [
    [0, 0],
    [imageWidth, 0],
    [imageWidth, imageHeight],
    [0, imageHeight],
  ].map(([x, y]) => [cos * x + sin * y + translateX, -sin * x + cos * y + translateY]);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [x, y] of corners) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  return {
    cos,
    sin,
    minX,
    minY,
    width: Math.max(1e-6, maxX - minX),
    height: Math.max(1e-6, maxY - minY),
    translateX,
    translateY,
  };
}

function getOverviewImageLayout(imageWidth: number, imageHeight: number, boxWidth: number, boxHeight: number, rotationDeg: number): OverviewImageLayout {
  const metrics = getRotatedImageMetrics(imageWidth, imageHeight, rotationDeg);
  const imageAspect = metrics.width / metrics.height;
  const boxAspect = boxWidth / boxHeight;

  let contentWidth: number;
  let contentHeight: number;
  if (imageAspect > boxAspect) {
    contentWidth = boxWidth;
    contentHeight = boxWidth / imageAspect;
  } else {
    contentHeight = boxHeight;
    contentWidth = boxHeight * imageAspect;
  }

  return {
    contentX: (boxWidth - contentWidth) / 2,
    contentY: (boxHeight - contentHeight) / 2,
    contentWidth,
    contentHeight,
    metrics,
  };
}

function worldToOverviewPoint(worldX: number, worldY: number, layout: OverviewImageLayout): [number, number] {
  const { contentX, contentY, contentWidth, contentHeight, metrics } = layout;
  const rotatedX = metrics.cos * worldX + metrics.sin * worldY + metrics.translateX - metrics.minX;
  const rotatedY = -metrics.sin * worldX + metrics.cos * worldY + metrics.translateY - metrics.minY;
  return [contentX + (rotatedX / metrics.width) * contentWidth, contentY + (rotatedY / metrics.height) * contentHeight];
}

function overviewPointToWorld(pointX: number, pointY: number, layout: OverviewImageLayout, imageWidth: number, imageHeight: number): [number, number] {
  const { metrics } = layout;
  const rotatedX = pointX + metrics.minX - metrics.translateX;
  const rotatedY = pointY + metrics.minY - metrics.translateY;
  const worldX = rotatedX * metrics.cos - rotatedY * metrics.sin;
  const worldY = rotatedX * metrics.sin + rotatedY * metrics.cos;
  return [clamp(worldX, 0, imageWidth), clamp(worldY, 0, imageHeight)];
}

function boundsToCorners(bounds: Bounds): Array<[number, number]> {
  return [
    [bounds[0], bounds[1]],
    [bounds[2], bounds[1]],
    [bounds[2], bounds[3]],
    [bounds[0], bounds[3]],
  ];
}

function isFiniteBounds(bounds: number[] | null | undefined): bounds is Bounds {
  return Array.isArray(bounds) && bounds.length === 4 && Number.isFinite(bounds[0]) && Number.isFinite(bounds[1]) && Number.isFinite(bounds[2]) && Number.isFinite(bounds[3]);
}

const DEFAULT_CLOSE_BUTTON_STYLE: CSSProperties = {
  position: "absolute",
  top: 4,
  right: 4,
  zIndex: 1,
  width: 18,
  height: 18,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.4)",
  background: "rgba(16, 17, 19, 0.85)",
  color: "#fff",
  fontSize: 12,
  lineHeight: 1,
  cursor: "pointer",
  padding: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

export function OverviewMap({ source, projectorRef, authToken = "", options, invalidateRef, className, style }: OverviewMapProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const thumbnailRef = useRef<HTMLCanvasElement | null>(null);
  const lastBoundsRef = useRef<Bounds | null>(null);
  const draggingRef = useRef<{ active: boolean; pointerId: number | null }>({
    active: false,
    pointerId: null,
  });
  const rafRef = useRef<number | null>(null);
  const drawPendingRef = useRef(false);

  const width = toPositiveNumber(options?.width, DEFAULT_OVERVIEW_MAP_OPTIONS.width, 64);
  const height = toPositiveNumber(options?.height, DEFAULT_OVERVIEW_MAP_OPTIONS.height, 48);

  const margin = toPositiveNumber(options?.margin, DEFAULT_OVERVIEW_MAP_OPTIONS.margin, 0);
  const borderRadius = toPositiveNumber(options?.borderRadius, DEFAULT_OVERVIEW_MAP_OPTIONS.borderRadius, 0);
  const borderWidth = toPositiveNumber(options?.borderWidth, DEFAULT_OVERVIEW_MAP_OPTIONS.borderWidth, 0);
  const maxThumbnailTiles = Math.max(1, Math.round(toPositiveNumber(options?.maxThumbnailTiles, DEFAULT_OVERVIEW_MAP_OPTIONS.maxThumbnailTiles, 1)));

  const backgroundColor = options?.backgroundColor || DEFAULT_OVERVIEW_MAP_OPTIONS.backgroundColor;
  const borderColor = options?.borderColor || DEFAULT_OVERVIEW_MAP_OPTIONS.borderColor;
  const viewportBorderColor = options?.viewportBorderColor || DEFAULT_OVERVIEW_MAP_OPTIONS.viewportBorderColor;
  const viewportBorderStyle = options?.viewportBorderStyle === "stroke" || options?.viewportBorderStyle === "dash" ? options.viewportBorderStyle : DEFAULT_OVERVIEW_MAP_OPTIONS.viewportBorderStyle;
  const viewportFillColor = options?.viewportFillColor ?? DEFAULT_OVERVIEW_MAP_OPTIONS.viewportFillColor;
  const interactive = options?.interactive ?? DEFAULT_OVERVIEW_MAP_OPTIONS.interactive;
  const showThumbnail = options?.showThumbnail ?? DEFAULT_OVERVIEW_MAP_OPTIONS.showThumbnail;
  const position = options?.position || DEFAULT_OVERVIEW_MAP_OPTIONS.position;
  const onClose = options?.onClose;
  const closeIcon = options?.closeIcon;
  const closeButtonStyle = options?.closeButtonStyle;

  const mergedStyle = useMemo<CSSProperties>(() => {
    const pos: CSSProperties = {};
    if (position === "top-left" || position === "bottom-left") pos.left = margin;
    else pos.right = margin;
    if (position === "top-left" || position === "top-right") pos.top = margin;
    else pos.bottom = margin;

    return {
      position: "absolute",
      ...pos,
      width,
      height,
      borderRadius,
      overflow: "hidden",
      zIndex: 4,
      pointerEvents: interactive ? "auto" : "none",
      touchAction: "none",
      boxShadow: "0 10px 22px rgba(0, 0, 0, 0.3)",
      ...style,
    };
  }, [margin, position, width, height, borderRadius, interactive, style]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cssW = width;
    const cssH = height;
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    const pixelW = Math.max(1, Math.round(cssW * dpr));
    const pixelH = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== pixelW || canvas.height !== pixelH) {
      canvas.width = pixelW;
      canvas.height = pixelH;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, cssW, cssH);

    const projector = projectorRef.current;
    const initialRotationDeg = toFiniteRotation(projector?.getInitialRotationDeg?.());
    const layout = getOverviewImageLayout(source.width, source.height, cssW, cssH, initialRotationDeg);
    const { contentX: cx, contentY: cy, contentWidth: cw, contentHeight: ch, metrics } = layout;

    const preview = thumbnailRef.current;
    if (preview) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx, cy, cw, ch);
      ctx.clip();
      ctx.translate(cx, cy);
      ctx.scale(cw / metrics.width, ch / metrics.height);
      ctx.transform(metrics.cos, -metrics.sin, metrics.sin, metrics.cos, metrics.translateX - metrics.minX, metrics.translateY - metrics.minY);
      ctx.drawImage(preview, 0, 0, source.width, source.height);
      ctx.restore();
    }

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = borderWidth;
    ctx.strokeRect(borderWidth * 0.5, borderWidth * 0.5, cssW - borderWidth, cssH - borderWidth);

    const bounds = projector?.getViewBounds?.();
    const corners = projector?.getViewCorners?.();
    const safeCorners =
      Array.isArray(corners) && corners.length >= 4 && corners.every(point => Array.isArray(point) && point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]))
        ? (corners as Array<[number, number]>)
        : null;
    const safeBounds = isFiniteBounds(bounds) ? bounds : isFiniteBounds(lastBoundsRef.current) ? lastBoundsRef.current : null;
    if (isFiniteBounds(bounds)) {
      lastBoundsRef.current = bounds;
    }

    const isDash = viewportBorderStyle === "dash";

    if (safeCorners) {
      const screenCorners: Array<[number, number]> = safeCorners.map(point => worldToOverviewPoint(point[0], point[1], layout));
      const clippedCorners = clipPolygonToRect(screenCorners, cx, cy, cx + cw, cy + ch);

      if (clippedCorners.length >= 3) {
        ctx.beginPath();
        for (let i = 0; i < clippedCorners.length; i += 1) {
          if (i === 0) ctx.moveTo(clippedCorners[i][0], clippedCorners[i][1]);
          else ctx.lineTo(clippedCorners[i][0], clippedCorners[i][1]);
        }
        ctx.closePath();
        ctx.fillStyle = viewportFillColor;
        ctx.fill();
        ctx.strokeStyle = viewportBorderColor;
        ctx.lineWidth = 2.25;
        if (isDash) {
          strokeSymmetricDashedPolygon(ctx, clippedCorners, 4, 3);
        } else {
          ctx.stroke();
        }
        return;
      }
    }

    if (!safeBounds) {
      return;
    }

    const fallbackCorners = boundsToCorners(safeBounds).map(point => worldToOverviewPoint(point[0], point[1], layout));
    const clippedCorners = clipPolygonToRect(fallbackCorners, cx, cy, cx + cw, cy + ch);
    if (clippedCorners.length < 3) {
      return;
    }

    ctx.beginPath();
    for (let i = 0; i < clippedCorners.length; i += 1) {
      if (i === 0) ctx.moveTo(clippedCorners[i][0], clippedCorners[i][1]);
      else ctx.lineTo(clippedCorners[i][0], clippedCorners[i][1]);
    }
    ctx.closePath();
    ctx.fillStyle = viewportFillColor;
    ctx.fill();
    ctx.strokeStyle = viewportBorderColor;
    ctx.lineWidth = 2.25;
    if (isDash) {
      strokeSymmetricDashedPolygon(ctx, clippedCorners, 4, 3);
    } else {
      ctx.stroke();
    }
  }, [width, height, backgroundColor, borderColor, borderWidth, projectorRef, source.width, source.height, viewportFillColor, viewportBorderColor, viewportBorderStyle]);

  const requestDraw = useCallback(() => {
    if (drawPendingRef.current) return;
    drawPendingRef.current = true;
    rafRef.current = requestAnimationFrame(() => {
      drawPendingRef.current = false;
      rafRef.current = null;
      draw();
    });
  }, [draw]);

  const toWorldFromClient = useCallback(
    (clientX: number, clientY: number): [number, number] | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;

      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;

      const projector = projectorRef.current;
      const initialRotationDeg = toFiniteRotation(projector?.getInitialRotationDeg?.());
      const layout = getOverviewImageLayout(source.width, source.height, width, height, initialRotationDeg);
      const scaleX = rect.width / width;
      const scaleY = rect.height / height;
      const cxPx = layout.contentX * scaleX;
      const cyPx = layout.contentY * scaleY;
      const cwPx = layout.contentWidth * scaleX;
      const chPx = layout.contentHeight * scaleY;

      const nx = clamp((clientX - rect.left - cxPx) / cwPx, 0, 1);
      const ny = clamp((clientY - rect.top - cyPx) / chPx, 0, 1);
      return overviewPointToWorld(nx * layout.metrics.width, ny * layout.metrics.height, layout, source.width, source.height);
    },
    [projectorRef, source.width, source.height, width, height]
  );

  const recenterTo = useCallback(
    (worldX: number, worldY: number) => {
      const projector = projectorRef.current;
      if (!projector) return;

      if (projector.setViewCenter) {
        projector.setViewCenter(worldX, worldY);
        requestDraw();
        return;
      }

      const bounds = projector.getViewBounds?.();
      const safeBounds = isFiniteBounds(bounds) ? bounds : isFiniteBounds(lastBoundsRef.current) ? lastBoundsRef.current : null;
      if (!safeBounds) return;

      const visibleW = Math.max(1e-6, safeBounds[2] - safeBounds[0]);
      const visibleH = Math.max(1e-6, safeBounds[3] - safeBounds[1]);

      projector.setViewState({
        offsetX: worldX - visibleW * 0.5,
        offsetY: worldY - visibleH * 0.5,
      });
      requestDraw();
    },
    [projectorRef, requestDraw]
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!interactive) return;
      if (event.button !== 0) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const world = toWorldFromClient(event.clientX, event.clientY);
      if (!world) return;

      event.preventDefault();
      event.stopPropagation();

      canvas.setPointerCapture(event.pointerId);
      draggingRef.current = { active: true, pointerId: event.pointerId };
      recenterTo(world[0], world[1]);
    },
    [interactive, toWorldFromClient, recenterTo]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const drag = draggingRef.current;
      if (!drag.active || drag.pointerId !== event.pointerId) return;

      const world = toWorldFromClient(event.clientX, event.clientY);
      if (!world) return;

      event.preventDefault();
      event.stopPropagation();
      recenterTo(world[0], world[1]);
    },
    [toWorldFromClient, recenterTo]
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const drag = draggingRef.current;
      if (!drag.active || drag.pointerId !== event.pointerId) return;

      const canvas = canvasRef.current;
      if (canvas && canvas.hasPointerCapture(event.pointerId)) {
        try {
          canvas.releasePointerCapture(event.pointerId);
        } catch {
          // noop
        }
      }

      draggingRef.current = { active: false, pointerId: null };
      requestDraw();
    },
    [requestDraw]
  );

  useEffect(() => {
    let cancelled = false;
    thumbnailRef.current = null;
    requestDraw();

    const tier = 0;
    const levelScale = 2 ** (source.maxTierZoom - tier);
    const levelWidth = Math.ceil(source.width / levelScale);
    const levelHeight = Math.ceil(source.height / levelScale);
    const tilesX = Math.max(1, Math.ceil(levelWidth / source.tileSize));
    const tilesY = Math.max(1, Math.ceil(levelHeight / source.tileSize));
    const tileCount = tilesX * tilesY;

    if (!showThumbnail || tileCount > maxThumbnailTiles) {
      return undefined;
    }

    const previewScale = Math.min(width / Math.max(1, source.width), height / Math.max(1, source.height));
    const preview = document.createElement("canvas");
    preview.width = Math.max(1, Math.round(source.width * previewScale));
    preview.height = Math.max(1, Math.round(source.height * previewScale));
    const ctx = preview.getContext("2d");
    if (!ctx) {
      return undefined;
    }

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, preview.width, preview.height);

    const requests: Array<{
      url: string;
      bounds: Bounds;
    }> = [];

    for (let y = 0; y < tilesY; y += 1) {
      for (let x = 0; x < tilesX; x += 1) {
        const left = x * source.tileSize * levelScale;
        const top = y * source.tileSize * levelScale;
        const right = Math.min((x + 1) * source.tileSize, levelWidth) * levelScale;
        const bottom = Math.min((y + 1) * source.tileSize, levelHeight) * levelScale;
        requests.push({
          url: toTileUrl(source, tier, x, y),
          bounds: [left, top, right, bottom],
        });
      }
    }

    void Promise.allSettled(
      requests.map(async tile => {
        const useAuthHeader = shouldAttachAuthHeaderToOverviewTile(tile.url, authToken);
        const response = await fetch(tile.url, {
          headers: useAuthHeader ? { Authorization: authToken } : undefined,
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const bitmap = await createImageBitmap(await response.blob());
        return { tile, bitmap };
      })
    ).then(results => {
      if (cancelled) {
        for (const result of results) {
          if (result.status === "fulfilled") {
            result.value.bitmap.close();
          }
        }
        return;
      }

      const sx = preview.width / Math.max(1, source.width);
      const sy = preview.height / Math.max(1, source.height);
      for (const result of results) {
        if (result.status !== "fulfilled") continue;
        const {
          tile: { bounds },
          bitmap,
        } = result.value;
        const dx = bounds[0] * sx;
        const dy = bounds[1] * sy;
        const dw = Math.max(1, (bounds[2] - bounds[0]) * sx);
        const dh = Math.max(1, (bounds[3] - bounds[1]) * sy);
        ctx.drawImage(bitmap, dx, dy, dw, dh);
        bitmap.close();
      }

      thumbnailRef.current = preview;
      requestDraw();
    });

    return () => {
      cancelled = true;
    };
  }, [source, authToken, backgroundColor, width, height, showThumbnail, maxThumbnailTiles, requestDraw]);

  useEffect(() => {
    requestDraw();
  }, [requestDraw]);

  useEffect(() => {
    if (projectorRef.current) return undefined;
    let rafId = 0;
    const tick = () => {
      if (projectorRef.current) {
        requestDraw();
        return;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [projectorRef, requestDraw]);

  useEffect(() => observeDevicePixelRatioChanges(() => requestDraw()), [requestDraw]);

  useEffect(() => {
    if (!invalidateRef) return undefined;
    invalidateRef.current = requestDraw;
    return () => {
      if (invalidateRef.current === requestDraw) {
        invalidateRef.current = null;
      }
    };
  }, [invalidateRef, requestDraw]);

  useEffect(
    () => () => {
      draggingRef.current = { active: false, pointerId: null };
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      drawPendingRef.current = false;
    },
    []
  );

  return (
    <div className={className} style={mergedStyle}>
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          borderRadius: "inherit",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onContextMenu={event => {
          event.preventDefault();
        }}
        onWheel={event => {
          event.preventDefault();
          event.stopPropagation();
        }}
      />
      {onClose && (
        <button
          type="button"
          aria-label="Hide overview map"
          onClick={event => {
            event.stopPropagation();
            onClose();
          }}
          style={closeButtonStyle ? { ...(closeButtonStyle as CSSProperties) } : { ...(DEFAULT_CLOSE_BUTTON_STYLE as CSSProperties) }}
        >
          {closeIcon ?? "×"}
        </button>
      )}
    </div>
  );
}
