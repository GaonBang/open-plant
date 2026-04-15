import assert from "node:assert/strict";
import test from "node:test";
import { WsiTileRenderer, buildClassPalette, calcScaleLength, calcScaleResolution, calcViewingMagnification, isSameViewState, toBearerToken } from "../../dist/index.js";

test("toBearerToken: normalizes token format", () => {
  assert.equal(toBearerToken("abc"), "Bearer abc");
  assert.equal(toBearerToken("Bearer xyz"), "Bearer xyz");
  assert.equal(toBearerToken("  bearer   qwe  "), "Bearer qwe");
  assert.equal(toBearerToken(""), "");
});

test("calcScaleResolution and calcScaleLength", () => {
  assert.equal(calcScaleResolution(0, 8, 8), 1);
  assert.ok(Math.abs(calcScaleResolution(0.25, 8, 8) - 0.25) < 1e-9);
  assert.ok(Math.abs(calcScaleResolution(0.25, 8, 7) - 0.5) < 1e-9);
  assert.match(calcScaleLength(0.25, 8, 8), /(μm|mm)/);
});

test("calcViewingMagnification: derives viewing magnification from mpp and view zoom", () => {
  assert.equal(calcViewingMagnification(0.25, 1), 40);
  assert.equal(calcViewingMagnification(0.25, 0.5), 20);
  assert.equal(calcViewingMagnification(0, 1), 0);
});

test("isSameViewState: compares with epsilon tolerance", () => {
  assert.equal(isSameViewState({ zoom: 1, offsetX: 10, offsetY: 20, rotationDeg: 1.5 }, { zoom: 1 + 1e-7, offsetX: 10, offsetY: 20, rotationDeg: 1.5 }), true);
  assert.equal(isSameViewState({ zoom: 1, offsetX: 10, offsetY: 20, rotationDeg: 1.5 }, { zoom: 1.2, offsetX: 10, offsetY: 20, rotationDeg: 1.5 }), false);
});

test("buildClassPalette: keeps index 0 as default and deduplicates class ids", () => {
  const palette = buildClassPalette([
    { classId: "p", classColor: "#ff0000" },
    { classId: "n", classColor: "#0000ff" },
    { classId: "p", classColor: "#ffffff" },
  ]);

  assert.equal(palette.colors.length, 12);
  assert.equal(palette.classToPaletteIndex.get("p"), 1);
  assert.equal(palette.classToPaletteIndex.get("n"), 2);
});

test("buildClassPalette: falls back to className when classId is empty", () => {
  const palette = buildClassPalette([
    { classId: "", className: "Positive", classColor: "#ff0000" },
  ]);

  assert.equal(palette.classToPaletteIndex.get("Positive"), 1);
});

test("WsiTileRenderer.getPointSize: magnification stops stay stable across pyramid depths", () => {
  const stops = [
    { magnification: 5, size: 5 },
    { magnification: 10, size: 5 },
    { magnification: 20, size: 8 },
    { magnification: 40, size: 8 },
  ];

  const layerId = "layer";
  const renderers = [
    {
      camera: { getViewState: () => ({ zoom: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 }) },
      source: { mpp: 0.25, maxTierZoom: 8 },
      pointLayers: new Map([[layerId, { pointSizeMagnificationStops: stops, pointSizeZoomStops: [{ zoom: 8, size: 12 }] }]]),
      defaultPointSizeMagnificationStops: null,
      defaultPointSizeZoomStops: [{ zoom: 1, size: 1 }],
    },
    {
      camera: { getViewState: () => ({ zoom: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 }) },
      source: { mpp: 0.25, maxTierZoom: 6 },
      pointLayers: new Map([[layerId, { pointSizeMagnificationStops: stops, pointSizeZoomStops: [{ zoom: 6, size: 4 }] }]]),
      defaultPointSizeMagnificationStops: null,
      defaultPointSizeZoomStops: [{ zoom: 1, size: 1 }],
    },
  ];

  const sizeA = WsiTileRenderer.prototype.getPointSize.call(renderers[0], layerId);
  const sizeB = WsiTileRenderer.prototype.getPointSize.call(renderers[1], layerId);
  assert.equal(sizeA, 8);
  assert.equal(sizeB, 8);
});

test("WsiTileRenderer.getPointSize: zoom stops still depend on pyramid depth", () => {
  const layerId = "layer";
  const zoomStops = [{ zoom: 6, size: 6 }, { zoom: 8, size: 10 }];
  const renderer = {
    camera: { getViewState: () => ({ zoom: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 }) },
    source: { mpp: 0.25, maxTierZoom: 8 },
    pointLayers: new Map([[layerId, { pointSizeMagnificationStops: null, pointSizeZoomStops: zoomStops }]]),
    defaultPointSizeMagnificationStops: null,
    defaultPointSizeZoomStops: [{ zoom: 1, size: 1 }],
  };

  assert.equal(WsiTileRenderer.prototype.getPointSize.call(renderer, layerId), 10);
});

test("WsiTileRenderer.getPointStrokeScale: magnification stops stay stable across pyramid depths", () => {
  const stops = [
    { magnification: 5, weight: 0.8 },
    { magnification: 10, weight: 0.8 },
    { magnification: 20, weight: 1.5 },
    { magnification: 40, weight: 1.5 },
  ];

  const layerId = "layer";
  const renderers = [
    {
      camera: { getViewState: () => ({ zoom: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 }) },
      source: { mpp: 0.25, maxTierZoom: 8 },
      pointLayers: new Map([[layerId, { pointWeightMagnificationStops: stops, pointStrokeScale: 0.4 }]]),
      defaultPointWeightMagnificationStops: null,
      defaultPointStrokeScale: 1,
    },
    {
      camera: { getViewState: () => ({ zoom: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 }) },
      source: { mpp: 0.25, maxTierZoom: 6 },
      pointLayers: new Map([[layerId, { pointWeightMagnificationStops: stops, pointStrokeScale: 0.4 }]]),
      defaultPointWeightMagnificationStops: null,
      defaultPointStrokeScale: 1,
    },
  ];

  const weightA = WsiTileRenderer.prototype.getPointStrokeScale.call(renderers[0], layerId);
  const weightB = WsiTileRenderer.prototype.getPointStrokeScale.call(renderers[1], layerId);
  assert.equal(weightA, 1.5);
  assert.equal(weightB, 1.5);
});

test("WsiTileRenderer.getPointStrokeScale: falls back to static strokeScale when no magnification stops are set", () => {
  const layerId = "layer";
  const renderer = {
    camera: { getViewState: () => ({ zoom: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 }) },
    source: { mpp: 0.25, maxTierZoom: 8 },
    pointLayers: new Map([[layerId, { pointWeightMagnificationStops: null, pointStrokeScale: 1.7 }]]),
    defaultPointWeightMagnificationStops: null,
    defaultPointStrokeScale: 1,
  };

  assert.equal(WsiTileRenderer.prototype.getPointStrokeScale.call(renderer, layerId), 1.7);
});
