import { createProgram, requireUniformLocation, requireWebGL2 } from "./gl-utils";
import { OrthoCamera, type ViewState } from "./ortho-camera";
import type { Bounds, TileDefinition } from "./types";

interface LoadedTile {
  id: string;
  bounds: Bounds;
  texture: WebGLTexture;
}

export interface M1TileRendererOptions {
  canvas: HTMLCanvasElement;
  imageWidth: number;
  imageHeight: number;
  clearColor?: [number, number, number, number];
  initialViewState?: Partial<ViewState>;
  preserveDrawingBuffer?: boolean;
}

const VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 aUnit;
in vec2 aUv;

uniform mat3 uCamera;
uniform vec4 uBounds;

out vec2 vUv;

void main() {
  vec2 world = vec2(
    mix(uBounds.x, uBounds.z, aUnit.x),
    mix(uBounds.y, uBounds.w, aUnit.y)
  );
  vec3 clip = uCamera * vec3(world, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  vUv = aUv;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
uniform sampler2D uTexture;

out vec4 outColor;

void main() {
  outColor = texture(uTexture, vUv);
}
`;

export class M1TileRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly camera = new OrthoCamera();
  private readonly imageWidth: number;
  private readonly imageHeight: number;
  private readonly clearColor: [number, number, number, number];
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly quadBuffer: WebGLBuffer;
  private readonly uCameraLocation: WebGLUniformLocation;
  private readonly uBoundsLocation: WebGLUniformLocation;
  private readonly uTextureLocation: WebGLUniformLocation;
  private readonly resizeObserver: ResizeObserver;

  private tiles: LoadedTile[] = [];
  private frameId: number | null = null;
  private loadVersion = 0;
  private destroyed = false;
  private fitted = false;
  private controlledViewState = false;

  constructor(options: M1TileRendererOptions) {
    this.canvas = options.canvas;
    this.imageWidth = Math.max(1, options.imageWidth);
    this.imageHeight = Math.max(1, options.imageHeight);
    this.clearColor = options.clearColor ?? [0.03, 0.05, 0.08, 1];

    this.gl = requireWebGL2(this.canvas, { preserveDrawingBuffer: options.preserveDrawingBuffer });
    this.program = createProgram(this.gl, VERTEX_SHADER, FRAGMENT_SHADER);

    const vao = this.gl.createVertexArray();
    const quadBuffer = this.gl.createBuffer();
    if (!vao || !quadBuffer) {
      throw new Error("Failed to create WebGL buffers.");
    }

    this.vao = vao;
    this.quadBuffer = quadBuffer;

    this.gl.bindVertexArray(this.vao);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);

    const quadVertices = new Float32Array([0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 1, 1, 1, 1]);

    this.gl.bufferData(this.gl.ARRAY_BUFFER, quadVertices, this.gl.STATIC_DRAW);

    const unitLocation = this.gl.getAttribLocation(this.program, "aUnit");
    const uvLocation = this.gl.getAttribLocation(this.program, "aUv");
    if (unitLocation < 0 || uvLocation < 0) {
      throw new Error("Failed to get attribute locations.");
    }

    const stride = 4 * Float32Array.BYTES_PER_ELEMENT;
    this.gl.enableVertexAttribArray(unitLocation);
    this.gl.vertexAttribPointer(unitLocation, 2, this.gl.FLOAT, false, stride, 0);
    this.gl.enableVertexAttribArray(uvLocation);
    this.gl.vertexAttribPointer(uvLocation, 2, this.gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);

    this.gl.bindVertexArray(null);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);

    this.uCameraLocation = requireUniformLocation(this.gl, this.program, "uCamera");
    this.uBoundsLocation = requireUniformLocation(this.gl, this.program, "uBounds");
    this.uTextureLocation = requireUniformLocation(this.gl, this.program, "uTexture");

    if (options.initialViewState) {
      this.controlledViewState = true;
      this.camera.setViewState(options.initialViewState);
    }

    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
    });

    this.resizeObserver.observe(this.canvas);
    this.resize();
  }

  async setTiles(tiles: TileDefinition[]): Promise<void> {
    if (this.destroyed) {
      return;
    }

    const version = ++this.loadVersion;

    const loaded = await Promise.all(
      tiles.map(async tile => {
        const loadedTile = await this.loadTile(tile, version);
        return loadedTile;
      })
    );

    if (this.destroyed || version !== this.loadVersion) {
      for (const tile of loaded) {
        if (tile) {
          this.gl.deleteTexture(tile.texture);
        }
      }
      return;
    }

    this.disposeTiles(this.tiles);
    this.tiles = loaded.filter((tile): tile is LoadedTile => tile !== null);
    this.requestRender();
  }

  setViewState(viewState: Partial<ViewState>): void {
    this.controlledViewState = true;
    this.camera.setViewState(viewState);
    this.requestRender();
  }

  getViewState(): ViewState {
    return this.camera.getViewState();
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.loadVersion += 1;

    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }

    this.resizeObserver.disconnect();
    this.disposeTiles(this.tiles);
    this.tiles = [];

    this.gl.deleteBuffer(this.quadBuffer);
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.program);
  }

  private async loadTile(tile: TileDefinition, version: number): Promise<LoadedTile | null> {
    try {
      const response = await fetch(tile.url);
      if (!response.ok) {
        throw new Error(`Tile fetch failed: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);

      if (this.destroyed || version !== this.loadVersion) {
        bitmap.close();
        return null;
      }

      const texture = this.gl.createTexture();
      if (!texture) {
        bitmap.close();
        throw new Error("Failed to create tile texture.");
      }

      this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
      this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, 1);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
      this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, bitmap);
      this.gl.bindTexture(this.gl.TEXTURE_2D, null);
      bitmap.close();

      return {
        id: tile.id,
        bounds: tile.bounds,
        texture,
      };
    } catch (error) {
      console.error(`[M1TileRenderer] tile load failed: ${tile.id}`, error);
      return null;
    }
  }

  private resize(): void {
    if (this.destroyed) {
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, rect.width || this.canvas.clientWidth || 1);
    const cssHeight = Math.max(1, rect.height || this.canvas.clientHeight || 1);
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    const targetWidth = Math.max(1, Math.round(cssWidth * dpr));
    const targetHeight = Math.max(1, Math.round(cssHeight * dpr));

    if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
      this.canvas.width = targetWidth;
      this.canvas.height = targetHeight;
    }

    this.camera.setViewport(cssWidth, cssHeight);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    if (!this.fitted && !this.controlledViewState) {
      this.fitToImage();
      this.fitted = true;
    }

    this.requestRender();
  }

  private fitToImage(): void {
    const viewport = this.camera.getViewportSize();

    const zoom = Math.min(viewport.width / this.imageWidth, viewport.height / this.imageHeight);
    const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;

    const visibleWorldWidth = viewport.width / safeZoom;
    const visibleWorldHeight = viewport.height / safeZoom;

    const offsetX = (this.imageWidth - visibleWorldWidth) * 0.5;
    const offsetY = (this.imageHeight - visibleWorldHeight) * 0.5;

    this.camera.setViewState({
      zoom: safeZoom,
      offsetX,
      offsetY,
    });
  }

  private requestRender(): void {
    if (this.frameId !== null || this.destroyed) {
      return;
    }

    this.frameId = requestAnimationFrame(() => {
      this.frameId = null;
      this.render();
    });
  }

  private render(): void {
    if (this.destroyed) {
      return;
    }

    this.gl.clearColor(this.clearColor[0], this.clearColor[1], this.clearColor[2], this.clearColor[3]);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);

    this.gl.useProgram(this.program);
    this.gl.bindVertexArray(this.vao);
    this.gl.uniformMatrix3fv(this.uCameraLocation, false, this.camera.getMatrix());
    this.gl.uniform1i(this.uTextureLocation, 0);

    for (const tile of this.tiles) {
      this.gl.activeTexture(this.gl.TEXTURE0);
      this.gl.bindTexture(this.gl.TEXTURE_2D, tile.texture);
      this.gl.uniform4f(this.uBoundsLocation, tile.bounds[0], tile.bounds[1], tile.bounds[2], tile.bounds[3]);
      this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    }

    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    this.gl.bindVertexArray(null);
  }

  private disposeTiles(tiles: LoadedTile[]): void {
    for (const tile of tiles) {
      this.gl.deleteTexture(tile.texture);
    }
  }
}
