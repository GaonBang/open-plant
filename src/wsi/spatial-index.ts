export type SpatialExtent = [number, number, number, number];

export interface SpatialIndexItem<T> {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  value: T;
}

export interface SpatialIndex<T> {
  load(items: SpatialIndexItem<T>[]): void;
  search(extent: SpatialExtent): SpatialIndexItem<T>[];
}

function normalizeExtent(minX: number, minY: number, maxX: number, maxY: number): SpatialExtent {
  return [Math.min(minX, maxX), Math.min(minY, maxY), Math.max(minX, maxX), Math.max(minY, maxY)];
}

function intersects(a: SpatialExtent, b: SpatialExtent): boolean {
  return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
}

class GridSpatialIndex<T> implements SpatialIndex<T> {
  private readonly targetNodeSize: number;

  private items: SpatialIndexItem<T>[] = [];

  private globalBounds: SpatialExtent = [0, 0, 0, 0];

  private gridSize = 1;

  private cellWidth = 1;

  private cellHeight = 1;

  private buckets: number[][] = [];

  private visited = new Uint32Array(0);

  private querySerial = 1;

  constructor(nodeSize = 16) {
    const finite = Number.isFinite(nodeSize) ? Math.floor(nodeSize) : 16;
    this.targetNodeSize = Math.max(1, finite);
  }

  load(items: SpatialIndexItem<T>[]): void {
    if (!Array.isArray(items) || items.length === 0) {
      this.items = [];
      this.globalBounds = [0, 0, 0, 0];
      this.gridSize = 1;
      this.cellWidth = 1;
      this.cellHeight = 1;
      this.buckets = [];
      this.visited = new Uint32Array(0);
      this.querySerial = 1;
      return;
    }

    const normalized: SpatialIndexItem<T>[] = [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const item of items) {
      if (!item) continue;
      if (!Number.isFinite(item.minX) || !Number.isFinite(item.minY) || !Number.isFinite(item.maxX) || !Number.isFinite(item.maxY)) {
        continue;
      }
      const bounds = normalizeExtent(item.minX, item.minY, item.maxX, item.maxY);
      minX = Math.min(minX, bounds[0]);
      minY = Math.min(minY, bounds[1]);
      maxX = Math.max(maxX, bounds[2]);
      maxY = Math.max(maxY, bounds[3]);
      normalized.push({
        minX: bounds[0],
        minY: bounds[1],
        maxX: bounds[2],
        maxY: bounds[3],
        value: item.value,
      });
    }

    this.items = normalized;
    this.visited = new Uint32Array(normalized.length);
    this.querySerial = 1;

    if (normalized.length === 0 || !Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      this.globalBounds = [0, 0, 0, 0];
      this.gridSize = 1;
      this.cellWidth = 1;
      this.cellHeight = 1;
      this.buckets = [];
      return;
    }

    this.globalBounds = [minX, minY, maxX, maxY];
    this.gridSize = Math.max(1, Math.ceil(Math.sqrt(normalized.length / this.targetNodeSize)));

    const spanX = Math.max(0, maxX - minX);
    const spanY = Math.max(0, maxY - minY);
    this.cellWidth = spanX > 0 ? spanX / this.gridSize : 1;
    this.cellHeight = spanY > 0 ? spanY / this.gridSize : 1;

    const bucketCount = this.gridSize * this.gridSize;
    this.buckets = Array.from({ length: bucketCount }, () => []);

    for (let index = 0; index < normalized.length; index += 1) {
      const item = normalized[index];
      const minCellX = this.toCellX(item.minX);
      const maxCellX = this.toCellX(item.maxX);
      const minCellY = this.toCellY(item.minY);
      const maxCellY = this.toCellY(item.maxY);
      for (let y = minCellY; y <= maxCellY; y += 1) {
        for (let x = minCellX; x <= maxCellX; x += 1) {
          this.buckets[y * this.gridSize + x].push(index);
        }
      }
    }
  }

  search(extent: SpatialExtent): SpatialIndexItem<T>[] {
    if (this.items.length === 0) return [];
    if (!Array.isArray(extent) || extent.length < 4) return [];

    const query = normalizeExtent(extent[0], extent[1], extent[2], extent[3]);
    if (!intersects(query, this.globalBounds)) return [];

    const minCellX = this.toCellX(query[0]);
    const maxCellX = this.toCellX(query[2]);
    const minCellY = this.toCellY(query[1]);
    const maxCellY = this.toCellY(query[3]);

    const serial = this.nextSerial();
    const out: SpatialIndexItem<T>[] = [];

    for (let y = minCellY; y <= maxCellY; y += 1) {
      for (let x = minCellX; x <= maxCellX; x += 1) {
        const bucket = this.buckets[y * this.gridSize + x];
        if (!bucket || bucket.length === 0) continue;
        for (const itemIndex of bucket) {
          if (this.visited[itemIndex] === serial) continue;
          this.visited[itemIndex] = serial;
          const item = this.items[itemIndex];
          if (!intersects(query, [item.minX, item.minY, item.maxX, item.maxY])) continue;
          out.push(item);
        }
      }
    }

    return out;
  }

  private nextSerial(): number {
    this.querySerial += 1;
    if (this.querySerial === 0xffffffff) {
      this.visited.fill(0);
      this.querySerial = 1;
    }
    return this.querySerial;
  }

  private toCellX(x: number): number {
    const minX = this.globalBounds[0];
    const maxX = this.globalBounds[2];
    if (this.gridSize <= 1 || maxX <= minX) return 0;
    const ratio = (x - minX) / this.cellWidth;
    if (!Number.isFinite(ratio)) return 0;
    if (ratio <= 0) return 0;
    if (ratio >= this.gridSize - 1) return this.gridSize - 1;
    return Math.max(0, Math.min(this.gridSize - 1, Math.floor(ratio)));
  }

  private toCellY(y: number): number {
    const minY = this.globalBounds[1];
    const maxY = this.globalBounds[3];
    if (this.gridSize <= 1 || maxY <= minY) return 0;
    const ratio = (y - minY) / this.cellHeight;
    if (!Number.isFinite(ratio)) return 0;
    if (ratio <= 0) return 0;
    if (ratio >= this.gridSize - 1) return this.gridSize - 1;
    return Math.max(0, Math.min(this.gridSize - 1, Math.floor(ratio)));
  }
}

export function createSpatialIndex<T>(nodeSize?: number): SpatialIndex<T> {
  return new GridSpatialIndex<T>(nodeSize);
}

