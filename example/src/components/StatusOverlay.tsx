import type { DrawResult, DrawTool, PatchDrawResult, PointClickEvent, PointClipStatsEvent, WsiRegion, WsiRenderStats, WsiViewState } from "../../../src";

interface StatusOverlayProps {
  drawTool: DrawTool;
  stats: WsiRenderStats;
  viewState: Partial<WsiViewState> | null;
  roiRegions: WsiRegion[];
  patchRegions: WsiRegion[];
  hoveredRegionId: string | number | null;
  activeRegionId: string | number | null;
  clickedRegionId: string | number | null;
  pointerWorld: [number, number] | null;
  hoveredPoint: { index: number | null; id: number | null; pointCoordinate: [number, number] | null };
  lastPointClick: PointClickEvent | null;
  stampRectangleAreaMm2: number;
  stampCircleAreaMm2: number;
  stampRectanglePixelSize: number;
  brushRadius: number;
  brushOpacity: number;
  brushEraserPreview: boolean;
  autoLiftRegionLabelAtMaxZoom: boolean;
  enableZoomSnaps: boolean;
  sourceMpp: number | undefined;
  pointSizeByZoom: Record<number, number>;
  pointStrokeScale: number;
  pointInnerBlackFill: boolean;
  clipStats: PointClipStatsEvent | null;
  lastDraw: DrawResult | null;
  lastPatch: PatchDrawResult | null;
  lastPatchIndices: Uint32Array;
}

export function StatusOverlay({
  drawTool,
  stats,
  viewState,
  roiRegions,
  patchRegions,
  hoveredRegionId,
  activeRegionId,
  clickedRegionId,
  pointerWorld,
  hoveredPoint,
  lastPointClick,
  stampRectangleAreaMm2,
  stampCircleAreaMm2,
  stampRectanglePixelSize,
  brushRadius,
  brushOpacity,
  brushEraserPreview,
  autoLiftRegionLabelAtMaxZoom,
  enableZoomSnaps,
  sourceMpp,
  pointSizeByZoom,
  pointStrokeScale,
  pointInnerBlackFill,
  clipStats,
  lastDraw,
  lastPatch,
  lastPatchIndices,
}: StatusOverlayProps) {
  return (
    <div className="overlay">
      Drag: Pan | Wheel: Zoom | Ctrl/Cmd+Drag: Rotate | Double Click: Zoom In | Shift+Double Click: Zoom Out | Draw Tool: {String(drawTool)}
      <br />
      tier {stats.tier} | visible {stats.visible} | rendered {stats.rendered} | points {stats.points} | fallback {stats.fallback} | cache {stats.cache} | inflight {stats.inflight}
      <br />
      zoom {viewState?.zoom ? viewState.zoom.toFixed(4) : "fit"} | rotation {viewState?.rotationDeg ? viewState.rotationDeg.toFixed(2) : "0.00"}° | offset ({Math.round(viewState?.offsetX || 0)},{" "}
      {Math.round(viewState?.offsetY || 0)}) | rois {roiRegions.length} | patches {patchRegions.length}
      <br />
      hover {hoveredRegionId ?? "-"} | active {activeRegionId ?? "-"} | click {clickedRegionId ?? "-"} | pointer {pointerWorld ? `${Math.round(pointerWorld[0])}, ${Math.round(pointerWorld[1])}` : "-"}
      <br />
      point hover id {hoveredPoint.id ?? "-"} | index {hoveredPoint.index ?? "-"} | point{" "}
      {hoveredPoint.pointCoordinate ? `${Math.round(hoveredPoint.pointCoordinate[0])}, ${Math.round(hoveredPoint.pointCoordinate[1])}` : "-"} | last click{" "}
      {lastPointClick ? `${lastPointClick.button === 2 ? "right" : "left"}:${lastPointClick.id ?? "-"}@${lastPointClick.index}` : "-"}
      <br />
      stamp rect {stampRectangleAreaMm2}mm² | stamp circle {stampCircleAreaMm2}
      mm² | stamp rect px {stampRectanglePixelSize} | brush r {brushRadius}px | brush α {brushOpacity.toFixed(2)} | preview {brushEraserPreview ? "eraser" : "brush"} | label auto-lift{" "}
      {autoLiftRegionLabelAtMaxZoom ? "on" : "off"} | zoom snap {enableZoomSnaps ? "on" : "off"}
      {sourceMpp ? ` | mag ${(((viewState?.zoom || 0) * 10) / sourceMpp).toFixed(1)}x` : ""}
      <br />
      pointSizeByZoom z1:{pointSizeByZoom[1].toFixed(2)} z2:{pointSizeByZoom[2].toFixed(2)} z5:{pointSizeByZoom[5].toFixed(2)} z6:{pointSizeByZoom[6].toFixed(2)} z8:
      {pointSizeByZoom[8].toFixed(2)}
      {" | "}
      point stroke {pointStrokeScale.toFixed(2)}x{" | "}
      inner fill black {pointInnerBlackFill ? "on (0.1)" : "off"}
      {clipStats ? (
        <>
          <br />
          clip {clipStats.mode} | {clipStats.durationMs.toFixed(2)}ms | input {clipStats.inputCount.toLocaleString()} | output {clipStats.outputCount.toLocaleString()}
          {typeof clipStats.usedWebGpu === "boolean" ? ` | webgpu ${clipStats.usedWebGpu ? "yes" : "no"}` : ""}
          {typeof clipStats.candidateCount === "number" ? ` | candidates ${clipStats.candidateCount.toLocaleString()}` : ""}
        </>
      ) : null}
      {lastDraw ? (
        <>
          <br />
          last draw {lastDraw.tool} ({lastDraw.intent}) | points {lastDraw.coordinates?.length || 0} | area {Math.round(lastDraw.areaPx || 0)}
        </>
      ) : null}
      {lastPatch ? (
        <>
          <br />
          last patch points {lastPatchIndices.length.toLocaleString()} | bbox {lastPatch.bbox.map(v => Math.round(v)).join(", ")}
        </>
      ) : null}
    </div>
  );
}
