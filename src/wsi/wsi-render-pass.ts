import type { OrthoCamera } from "../core/ortho-camera";
import type { ScheduledTile, TileScheduler } from "./tile-scheduler";
import type { WsiImageSource } from "./types";
import type { Bounds, CachedTile, NormalizedImageColorSettings, PointProgram, TileVertexProgram } from "./wsi-renderer-types";

export interface RenderPointLayer {
  pointProgram: PointProgram;
  pointCount: number;
  usePointIndices: boolean;
  pointPaletteSize: number;
  pointLineDash: [number, number];
  pointOpacity: number;
  pointStrokeScale: number;
  pointInnerFillOpacity: number;
  pointInnerFillColor: [number, number, number];
  pointCssSizePx: number;
  pointSizePx: number;
}

export interface RenderFrameOptions {
  gl: WebGL2RenderingContext;
  camera: OrthoCamera;
  source: WsiImageSource;
  cache: Map<string, CachedTile>;
  frameSerial: number;
  tileProgram: TileVertexProgram;
  imageColorSettings: NormalizedImageColorSettings;
  pointLayers: readonly RenderPointLayer[];
  tileScheduler: TileScheduler;
  getVisibleTiles: () => { tier: number; visible: ScheduledTile[] };
  getVisibleTilesForTier: (tier: number) => ScheduledTile[];
  getViewBounds: () => Bounds;
  intersectsBounds: (a: Bounds, b: Bounds) => boolean;
}

export interface RenderFrameResult {
  tier: number;
  visible: number;
  rendered: number;
  points: number;
  fallback: number;
  cacheHits: number;
  cacheMisses: number;
  drawCalls: number;
}

export function renderFrame(options: RenderFrameOptions): RenderFrameResult {
  const {
    gl,
    camera,
    source,
    cache,
    frameSerial,
    tileProgram,
    imageColorSettings,
    pointLayers,
    tileScheduler,
    getVisibleTiles,
    getVisibleTilesForTier,
    getViewBounds,
    intersectsBounds,
  } = options;

  gl.clearColor(0.03, 0.06, 0.1, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const { tier, visible } = getVisibleTiles();
  const viewBounds = getViewBounds();
  const visibleKeys = new Set(visible.map(tile => tile.key));

  gl.useProgram(tileProgram.program);
  gl.bindVertexArray(tileProgram.vao);
  gl.uniformMatrix3fv(tileProgram.uCamera, false, camera.getMatrix());
  gl.uniform1i(tileProgram.uTexture, 0);
  gl.uniform1f(tileProgram.uBrightness, imageColorSettings.brightness);
  gl.uniform1f(tileProgram.uContrast, imageColorSettings.contrast);
  gl.uniform1f(tileProgram.uSaturation, imageColorSettings.saturation);

  const fallbackTiles: CachedTile[] = [];
  for (const [, cached] of cache) {
    if (visibleKeys.has(cached.key)) continue;
    if (!intersectsBounds(cached.bounds, viewBounds)) continue;
    fallbackTiles.push(cached);
  }
  fallbackTiles.sort((a, b) => a.tier - b.tier);

  for (const cached of fallbackTiles) {
    cached.lastUsed = frameSerial;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, cached.texture);
    gl.uniform4f(tileProgram.uBounds, cached.bounds[0], cached.bounds[1], cached.bounds[2], cached.bounds[3]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  let renderedTiles = 0;
  const missingTiles: ScheduledTile[] = [];
  for (const tile of visible) {
    const cached = cache.get(tile.key);
    if (!cached) {
      missingTiles.push(tile);
      continue;
    }
    cached.lastUsed = frameSerial;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, cached.texture);
    gl.uniform4f(tileProgram.uBounds, cached.bounds[0], cached.bounds[1], cached.bounds[2], cached.bounds[3]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    renderedTiles += 1;
  }

  const tilesToSchedule: ScheduledTile[] = missingTiles.slice();
  const PREFETCH_DISTANCE_PENALTY = 1e6;
  const prefetchTiers: number[] = [];
  if (tier > 0) prefetchTiers.push(tier - 1);
  if (tier < source.maxTierZoom) prefetchTiers.push(tier + 1);
  for (const prefetchTier of prefetchTiers) {
    const prefetchCandidates = getVisibleTilesForTier(prefetchTier);
    for (const tile of prefetchCandidates) {
      if (cache.has(tile.key)) continue;
      tile.distance2 += PREFETCH_DISTANCE_PENALTY;
      tilesToSchedule.push(tile);
    }
  }
  tileScheduler.schedule(tilesToSchedule);

  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.bindVertexArray(null);

  let renderedPoints = 0;
  let pointDrawCalls = 0;
  if (pointLayers.length > 0) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    for (let i = 0; i < pointLayers.length; i += 1) {
      const layer = pointLayers[i];
      if (layer.pointCount <= 0) continue;

      gl.useProgram(layer.pointProgram.program);
      gl.bindVertexArray(layer.pointProgram.vao);
      gl.uniformMatrix3fv(layer.pointProgram.uCamera, false, camera.getMatrix());
      gl.uniform1f(layer.pointProgram.uPointSize, layer.pointSizePx);
      gl.uniform1f(layer.pointProgram.uPointCssSize, layer.pointCssSizePx);
      gl.uniform2f(layer.pointProgram.uPointLineDash, layer.pointLineDash[0], layer.pointLineDash[1]);
      gl.uniform1f(layer.pointProgram.uPointOpacity, layer.pointOpacity);
      gl.uniform1f(layer.pointProgram.uPointStrokeScale, layer.pointStrokeScale);
      gl.uniform1f(layer.pointProgram.uPointInnerFillAlpha, layer.pointInnerFillOpacity);
      gl.uniform3f(layer.pointProgram.uPointInnerFillColor, layer.pointInnerFillColor[0], layer.pointInnerFillColor[1], layer.pointInnerFillColor[2]);
      gl.uniform1f(layer.pointProgram.uPaletteSize, layer.pointPaletteSize);
      gl.uniform1i(layer.pointProgram.uPalette, 1);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, layer.pointProgram.paletteTexture);
      if (layer.usePointIndices) {
        gl.drawElements(gl.POINTS, layer.pointCount, gl.UNSIGNED_INT, 0);
      } else {
        gl.drawArrays(gl.POINTS, 0, layer.pointCount);
      }
      renderedPoints += layer.pointCount;
      pointDrawCalls += 1;
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindVertexArray(null);
  }

  return {
    tier,
    visible: visible.length,
    rendered: renderedTiles,
    points: renderedPoints,
    fallback: fallbackTiles.length,
    cacheHits: renderedTiles,
    cacheMisses: missingTiles.length,
    drawCalls: fallbackTiles.length + renderedTiles + pointDrawCalls,
  };
}
