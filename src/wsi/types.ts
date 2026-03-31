export interface WsiTerm {
  termId: string;
  termName: string;
  termColor: string;
}

export interface WsiImageSource {
  id: string;
  name: string;
  width: number;
  height: number;
  mpp?: number;
  tileSize: number;
  maxTierZoom: number;
  tilePath: string;
  tileBaseUrl: string;
  tileUrlBuilder?: (tier: number, x: number, y: number, tilePath: string, tileBaseUrl: string) => string;
}

export interface WsiViewState {
  zoom: number;
  offsetX: number;
  offsetY: number;
  rotationDeg: number;
}

export interface WsiImageColorSettings {
  brightness?: number;
  contrast?: number;
  saturation?: number;
}

export interface WsiRenderStats {
  tier: number;
  visible: number;
  rendered: number;
  points: number;
  fallback: number;
  cache: number;
  inflight: number;
  queued?: number;
  retries?: number;
  failed?: number;
  aborted?: number;
  cacheHits?: number;
  cacheMisses?: number;
  drawCalls?: number;
  frameMs?: number;
}

export interface WsiPointData {
  count: number;
  positions: Float32Array;
  paletteIndices: Uint16Array;
  fillModes?: Uint8Array;
  ids?: Uint32Array;
  drawIndices?: Uint32Array;
}

export type WsiCoordinate = [number, number];
export type WsiRingCoordinates = WsiCoordinate[];
export type WsiPolygonCoordinates = WsiRingCoordinates[];
export type WsiMultiPolygonCoordinates = WsiPolygonCoordinates[];
export type WsiRegionCoordinates = WsiRingCoordinates | WsiPolygonCoordinates | WsiMultiPolygonCoordinates;

export interface WsiRegion {
  id?: string | number;
  coordinates: WsiRegionCoordinates;
  label?: string;
}

export interface TermPalette {
  colors: Uint8Array;
  termToPaletteIndex: Map<string, number>;
}
