export interface ViewState {
  offsetX: number;
  offsetY: number;
  zoom: number;
  rotationDeg: number;
}

export type WorldPoint = [number, number];

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export class OrthoCamera {
  private viewportWidth = 1;
  private viewportHeight = 1;

  private viewState: ViewState = {
    offsetX: 0,
    offsetY: 0,
    zoom: 1,
    rotationDeg: 0,
  };

  setViewport(width: number, height: number): void {
    this.viewportWidth = Math.max(1, width);
    this.viewportHeight = Math.max(1, height);
  }

  getViewportSize(): { width: number; height: number } {
    return {
      width: this.viewportWidth,
      height: this.viewportHeight,
    };
  }

  setViewState(next: Partial<ViewState>): void {
    if (next.offsetX !== undefined) {
      this.viewState.offsetX = next.offsetX;
    }

    if (next.offsetY !== undefined) {
      this.viewState.offsetY = next.offsetY;
    }

    if (next.zoom !== undefined) {
      this.viewState.zoom = Math.max(0.0001, next.zoom);
    }

    if (typeof next.rotationDeg === "number" && Number.isFinite(next.rotationDeg)) {
      this.viewState.rotationDeg = next.rotationDeg;
    }
  }

  getViewState(): ViewState {
    return { ...this.viewState };
  }

  getCenter(): WorldPoint {
    const zoom = Math.max(1e-6, this.viewState.zoom);
    return [
      this.viewState.offsetX + this.viewportWidth / (2 * zoom),
      this.viewState.offsetY + this.viewportHeight / (2 * zoom),
    ];
  }

  setCenter(centerX: number, centerY: number): void {
    const zoom = Math.max(1e-6, this.viewState.zoom);
    this.viewState.offsetX = centerX - this.viewportWidth / (2 * zoom);
    this.viewState.offsetY = centerY - this.viewportHeight / (2 * zoom);
  }

  screenToWorld(screenX: number, screenY: number): WorldPoint {
    const zoom = Math.max(1e-6, this.viewState.zoom);
    const [centerX, centerY] = this.getCenter();
    const rotationDeg = this.viewState.rotationDeg ?? 0;
    const dx = (screenX - this.viewportWidth * 0.5) / zoom;
    const dy = (screenY - this.viewportHeight * 0.5) / zoom;
    const rad = toRadians(rotationDeg);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return [centerX + dx * cos - dy * sin, centerY + dx * sin + dy * cos];
  }

  worldToScreen(worldX: number, worldY: number): WorldPoint {
    const zoom = Math.max(1e-6, this.viewState.zoom);
    const [centerX, centerY] = this.getCenter();
    const rotationDeg = this.viewState.rotationDeg ?? 0;
    const dx = worldX - centerX;
    const dy = worldY - centerY;
    const rad = toRadians(rotationDeg);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const rx = dx * cos + dy * sin;
    const ry = -dx * sin + dy * cos;
    return [
      this.viewportWidth * 0.5 + rx * zoom,
      this.viewportHeight * 0.5 + ry * zoom,
    ];
  }

  getViewCorners(): [WorldPoint, WorldPoint, WorldPoint, WorldPoint] {
    const w = this.viewportWidth;
    const h = this.viewportHeight;
    return [
      this.screenToWorld(0, 0),
      this.screenToWorld(w, 0),
      this.screenToWorld(w, h),
      this.screenToWorld(0, h),
    ];
  }

  getMatrix(): Float32Array {
    const zoom = Math.max(1e-6, this.viewState.zoom);
    const rotationDeg = this.viewState.rotationDeg ?? 0;

    if (rotationDeg === 0) {
      const viewWidth = this.viewportWidth / zoom;
      const viewHeight = this.viewportHeight / zoom;
      const sx = 2 / viewWidth;
      const sy = -2 / viewHeight;
      const tx = -1 - this.viewState.offsetX * sx;
      const ty = 1 - this.viewState.offsetY * sy;
      return new Float32Array([sx, 0, 0, 0, sy, 0, tx, ty, 1]);
    }

    const [centerX, centerY] = this.getCenter();
    const rad = toRadians(rotationDeg);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const ax = (2 * zoom * cos) / this.viewportWidth;
    const bx = (2 * zoom * sin) / this.viewportWidth;
    const ay = (2 * zoom * sin) / this.viewportHeight;
    const by = (-2 * zoom * cos) / this.viewportHeight;
    const tx = -(ax * centerX + bx * centerY);
    const ty = -(ay * centerX + by * centerY);
    return new Float32Array([ax, ay, 0, bx, by, 0, tx, ty, 1]);
  }
}
