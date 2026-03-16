import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type DrawOverlayShape,
  getWebGpuCapabilities,
  type PointClickEvent,
  type PointHoverEvent,
  type RegionClickEvent,
  type RegionHoverEvent,
  type RegionLabelStyle,
  type RegionStrokeStyle,
  type RegionStyleContext,
  toBearerToken,
  type WebGpuCapabilities,
  type WsiCustomLayer,
  type WsiRenderStats,
  WsiViewerCanvas,
} from "../../src";
import { DrawToolbar } from "./components/DrawToolbar";
import { PointControls } from "./components/PointControls";
import { StatusBar } from "./components/StatusBar";
import { StatusOverlay } from "./components/StatusOverlay";
import { Topbar } from "./components/Topbar";
import { ViewerControls } from "./components/ViewerControls";
import { useDrawState } from "./hooks/useDrawState";
import { useImageLoader } from "./hooks/useImageLoader";
import { usePointLoader } from "./hooks/usePointLoader";
import { useViewerControls } from "./hooks/useViewerControls";
import { DEFAULT_INFO_URL, DEFAULT_POINT_SIZE_STOPS } from "./utils/constants";
import { getRegionTopCenter } from "./utils/region-utils";

export default function App() {
  const [infoUrlInput, setInfoUrlInput] = useState(DEFAULT_INFO_URL);
  const [tokenInput, setTokenInput] = useState(() => localStorage.getItem("open-plant-token") ?? "");
  const bearerToken = useMemo(() => toBearerToken(tokenInput), [tokenInput]);

  useEffect(() => {
    localStorage.setItem("open-plant-token", tokenInput);
  }, [tokenInput]);

  const [stats, setStats] = useState<WsiRenderStats>({
    tier: 0,
    visible: 0,
    rendered: 0,
    points: 0,
    fallback: 0,
    cache: 0,
    inflight: 0,
  });

  const [webGpuCaps, setWebGpuCaps] = useState<WebGpuCapabilities | null>(null);
  useEffect(() => {
    let cancelled = false;
    getWebGpuCapabilities()
      .then(caps => {
        if (!cancelled) setWebGpuCaps(caps);
      })
      .catch(() => {
        if (!cancelled) setWebGpuCaps({ supported: false, features: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [pointSizeStop1, setPointSizeStop1] = useState<number>(DEFAULT_POINT_SIZE_STOPS[1]);
  const [pointSizeStop2, setPointSizeStop2] = useState<number>(DEFAULT_POINT_SIZE_STOPS[2]);
  const [pointSizeStop5, setPointSizeStop5] = useState<number>(DEFAULT_POINT_SIZE_STOPS[5]);
  const [pointSizeStop6, setPointSizeStop6] = useState<number>(DEFAULT_POINT_SIZE_STOPS[6]);
  const [pointSizeStop8, setPointSizeStop8] = useState<number>(DEFAULT_POINT_SIZE_STOPS[8]);
  const [pointStrokeScale, setPointStrokeScale] = useState(1);
  const [pointInnerBlackFill, setPointInnerBlackFill] = useState(false);

  const pointSizeByZoom = useMemo(
    () => ({ 1: pointSizeStop1, 2: pointSizeStop2, 5: pointSizeStop5, 6: pointSizeStop6, 8: pointSizeStop8 }) as const,
    [pointSizeStop1, pointSizeStop2, pointSizeStop5, pointSizeStop6, pointSizeStop8]
  );

  const resetPointSizeStops = useCallback(() => {
    setPointSizeStop1(DEFAULT_POINT_SIZE_STOPS[1]);
    setPointSizeStop2(DEFAULT_POINT_SIZE_STOPS[2]);
    setPointSizeStop5(DEFAULT_POINT_SIZE_STOPS[5]);
    setPointSizeStop6(DEFAULT_POINT_SIZE_STOPS[6]);
    setPointSizeStop8(DEFAULT_POINT_SIZE_STOPS[8]);
  }, []);

  const [hoveredRegionId, setHoveredRegionId] = useState<string | number | null>(null);
  const [activeRegionId, setActiveRegionId] = useState<string | number | null>(null);
  const [clickedRegionId, setClickedRegionId] = useState<string | number | null>(null);
  const [pointerWorld, setPointerWorld] = useState<[number, number] | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<{ index: number | null; id: number | null; pointCoordinate: [number, number] | null }>({
    index: null,
    id: null,
    pointCoordinate: null,
  });
  const [lastPointClick, setLastPointClick] = useState<PointClickEvent | null>(null);

  const resetInteraction = useCallback(() => {
    setHoveredRegionId(null);
    setActiveRegionId(null);
    setClickedRegionId(null);
    setPointerWorld(null);
    setHoveredPoint({ index: null, id: null, pointCoordinate: null });
    setLastPointClick(null);
  }, []);

	const drawResetRef = useRef<() => void>(Function.prototype as () => void);
	const pointResetRef = useRef<() => void>(Function.prototype as () => void);

  const onResetAll = useCallback(() => {
    drawResetRef.current();
    pointResetRef.current();
    resetInteraction();
  }, [resetInteraction]);

  const imageLoader = useImageLoader(bearerToken, onResetAll);
  const { source } = imageLoader;

  const pointData = usePointLoader(source, imageLoader.pointZstUrl, bearerToken);
  const draw = useDrawState(source, pointData.pointPayload);
  const viewer = useViewerControls(source);

  drawResetRef.current = draw.reset;
  pointResetRef.current = pointData.reset;

  const handleRegionHover = useCallback((event: RegionHoverEvent) => {
    setHoveredRegionId(event?.regionId ?? null);
  }, []);

  const handleActiveRegionChange = useCallback((regionId: string | number | null) => {
    setActiveRegionId(regionId ?? null);
  }, []);

  const handleRegionClick = useCallback((event: RegionClickEvent) => {
    setClickedRegionId(event?.regionId ?? null);
  }, []);

  const handlePointHover = useCallback((event: PointHoverEvent) => {
    setHoveredPoint({
      index: event.index ?? null,
      id: event.id ?? null,
      pointCoordinate: event.pointCoordinate ? [event.pointCoordinate[0], event.pointCoordinate[1]] : null,
    });
  }, []);

  const handlePointClick = useCallback((event: PointClickEvent) => {
    setLastPointClick(event);
    if (event.button !== 2) return;
    window.alert(["Cell Context", `id: ${event.id ?? "-"}`, `index: ${event.index}`, `world: ${Math.round(event.pointCoordinate[0])}, ${Math.round(event.pointCoordinate[1])}`].join("\n"));
  }, []);

  const imageSummary = useMemo((): string => {
    if (!source) return "이미지 없음";
    return `${source.name} | ${source.width} x ${source.height} | tile ${source.tileSize} | max tier ${source.maxTierZoom}`;
  }, [source]);

  const regionStrokeStyle = useMemo<Partial<RegionStrokeStyle>>(() => ({ color: "#ffd166", width: 2.5 }), []);
  const regionStrokeHoverStyle = useMemo<Partial<RegionStrokeStyle>>(() => ({ color: "#ff2f2f", width: 3 }), []);
  const regionStrokeActiveStyle = useMemo<Partial<RegionStrokeStyle>>(
    () => ({
      color: "#ff2f2f",
      width: 3,
      shadowColor: "rgba(255, 47, 47, 0.95)",
      shadowBlur: 12,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
    }),
    []
  );

  const resolveRegionStrokeStyle = useCallback((context: RegionStyleContext): Partial<RegionStrokeStyle> | undefined => {
    if (context.state === "active") {
      return { color: "#ff2f2f", width: 3.2, shadowColor: "rgba(255, 47, 47, 0.95)", shadowBlur: 12, shadowOffsetX: 0, shadowOffsetY: 0 };
    }
    if (context.state === "hover") {
      return { color: "#ff2f2f", width: 3 };
    }
    if (context.regionIndex % 2 === 1) {
      return { color: "#ffe08a", width: 2.25 };
    }
    return undefined;
  }, []);

  const regionLabelStyle = useMemo<Partial<RegionLabelStyle>>(() => ({ backgroundColor: "rgba(8, 14, 22, 0.9)", borderColor: "#ffd166", textColor: "#fff4cc", borderRadius: 4, fontSize: 12 }), []);

  const patchStrokeStyle = useMemo<Partial<RegionStrokeStyle>>(() => ({ color: "#8ad8ff", width: 2, lineDash: [10, 8] }), []);

  const overlayShapes = useMemo<DrawOverlayShape[]>(() => {
    if (!source) return [];
    const left = source.width * 0.08;
    const top = source.height * 0.08;
    const right = source.width * 0.2;
    const bottom = source.height * 0.2;
    const left2 = source.width * 0.24;
    const top2 = source.height * 0.12;
    const right2 = source.width * 0.34;
    const bottom2 = source.height * 0.22;
    return [
      {
        id: "weak-positive-area",
        coordinates: [
          [
            [left, top],
            [right, top],
            [right, bottom],
            [left, bottom],
          ],
          [
            [left2, top2],
            [right2, top2],
            [right2, bottom2],
            [left2, bottom2],
          ],
        ],
        closed: true,
        stroke: { color: "#CB59FF", width: 3, lineDash: [5, 5] },
        invertedFill: { fillColor: "rgba(0, 0, 0, 0.15)" },
        visible: true,
      },
    ];
  }, [source]);

  const customLayers = useMemo<WsiCustomLayer[]>(() => {
    if (!draw.patchRegions.length) return [];
    return [
      {
        id: "patch-label-layer",
        zIndex: 4,
        pointerEvents: "none",
        render: ({ worldToScreen }) => (
          <>
            {draw.patchRegions.map((region, index) => {
              const anchor = getRegionTopCenter(region.coordinates as [number, number][]);
              if (!anchor) return null;
              const screen = worldToScreen(anchor[0], anchor[1]);
              if (!screen) return null;
              return (
                <div
                  key={region.id ?? index}
                  style={{
                    position: "absolute",
                    transform: "translate(-50%, calc(-100% - 6px))",
                    left: `${screen[0]}px`,
                    top: `${screen[1]}px`,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: "rgba(0, 16, 28, 0.9)",
                    color: "#8ad8ff",
                    border: "1px solid rgba(138, 216, 255, 0.85)",
                    fontSize: 11,
                    fontWeight: 700,
                    lineHeight: 1.2,
                    whiteSpace: "nowrap",
                  }}
                >
                  PATCH {index + 1}
                </div>
              );
            })}
          </>
        ),
      },
    ];
  }, [draw.patchRegions]);

  return (
    <div className="app">
      <div className="topbar">
        <Topbar
          infoUrlInput={infoUrlInput}
          setInfoUrlInput={setInfoUrlInput}
          tokenInput={tokenInput}
          setTokenInput={setTokenInput}
          loading={imageLoader.loading}
          onLoad={imageLoader.loadImageInfo}
          onDemo={imageLoader.loadDemo}
        />

        <div className="ctl-row">
          <ViewerControls
            disabled={!source}
            ctrlDragRotate={viewer.ctrlDragRotate}
            showOverviewMap={viewer.showOverviewMap}
            onFit={() => imageLoader.setFitNonce(prev => prev + 1)}
            onResetRotation={() => viewer.setRotationResetNonce(prev => prev + 1)}
            onToggleCtrlDragRotate={() => viewer.setCtrlDragRotate(prev => !prev)}
            onToggleOverviewMap={() => viewer.setShowOverviewMap(prev => !prev)}
            onZoomIn={viewer.handleZoomIn}
            onZoomOut={viewer.handleZoomOut}
            clipMode={viewer.clipMode}
            onClipModeChange={viewer.setClipMode}
          />

          <DrawToolbar
            disabled={!source}
            drawTool={draw.drawTool}
            setDrawTool={draw.setDrawTool}
            stampRectangleAreaMm2={draw.stampRectangleAreaMm2}
            onStampRectChange={draw.handleStampRectChange}
            stampCircleAreaMm2={draw.stampCircleAreaMm2}
            onStampCircleChange={draw.handleStampCircleChange}
            stampRectanglePixelSize={draw.stampRectanglePixelSize}
            onStampRectPixelSizeChange={draw.setStampRectanglePixelSize}
            brushRadius={draw.brushRadius}
            onBrushRadiusChange={draw.setBrushRadius}
            brushOpacity={draw.brushOpacity}
            onBrushOpacityChange={draw.setBrushOpacity}
            brushEraserPreview={draw.brushEraserPreview}
            onToggleBrushEraserPreview={() => draw.setBrushEraserPreview(prev => !prev)}
            autoLiftRegionLabelAtMaxZoom={draw.autoLiftRegionLabelAtMaxZoom}
            onToggleAutoLift={() => draw.setAutoLiftRegionLabelAtMaxZoom(prev => !prev)}
            enableZoomSnaps={viewer.enableZoomSnaps}
            onToggleZoomSnaps={() => viewer.setEnableZoomSnaps(prev => !prev)}
            zoomSnaps={viewer.zoomSnaps}
            labelInput={draw.labelInput}
            setLabelInput={draw.setLabelInput}
            canClearRegions={draw.roiRegions.length > 0 || draw.patchRegions.length > 0}
            onClearRoi={() => {
              draw.handleClearRoi();
              resetInteraction();
            }}
            canExportPatch={!!(source && pointData.pointPayload && draw.lastPatch && draw.lastPatchIndices.length > 0)}
            onExportPatch={draw.handleDownloadPatchJson}
          />

          <PointControls
            pointSizeStop1={pointSizeStop1}
            pointSizeStop2={pointSizeStop2}
            pointSizeStop5={pointSizeStop5}
            pointSizeStop6={pointSizeStop6}
            pointSizeStop8={pointSizeStop8}
            onStop1Change={setPointSizeStop1}
            onStop2Change={setPointSizeStop2}
            onStop5Change={setPointSizeStop5}
            onStop6Change={setPointSizeStop6}
            onStop8Change={setPointSizeStop8}
            onResetStops={resetPointSizeStops}
            pointStrokeScale={pointStrokeScale}
            onStrokeScaleChange={setPointStrokeScale}
            pointInnerBlackFill={pointInnerBlackFill}
            onInnerBlackFillChange={setPointInnerBlackFill}
          />

          <StatusBar error={imageLoader.error} imageSummary={imageSummary} scaleSummary={viewer.scaleSummary} pointStatus={pointData.pointStatus} webGpuCaps={webGpuCaps} clipMode={viewer.clipMode} />
        </div>
      </div>

      <div className="viewer-wrap">
        {source ? (
          <WsiViewerCanvas
            className="viewer-canvas"
            source={source}
            viewState={viewer.viewState}
            fitNonce={imageLoader.fitNonce}
            rotationResetNonce={viewer.rotationResetNonce}
            authToken={bearerToken}
            ctrlDragRotate={viewer.ctrlDragRotate}
            pointData={pointData.pointPayload}
            pointPalette={pointData.termPalette.colors}
            pointSizeByZoom={pointSizeByZoom}
            pointStrokeScale={pointStrokeScale}
            pointInnerFillOpacity={pointInnerBlackFill ? 0.2 : 0}
            roiRegions={draw.roiRegions}
            patchRegions={draw.patchRegions}
            clipPointsToRois
            clipMode={viewer.clipMode}
            onClipStats={viewer.setClipStats}
            interactionLock={draw.drawTool !== "cursor"}
            drawTool={draw.drawTool}
            stampOptions={draw.stampOptions}
            brushOptions={draw.brushOptions}
            regionStrokeStyle={regionStrokeStyle}
            regionStrokeHoverStyle={regionStrokeHoverStyle}
            regionStrokeActiveStyle={regionStrokeActiveStyle}
            patchStrokeStyle={patchStrokeStyle}
            resolveRegionStrokeStyle={resolveRegionStrokeStyle}
            overlayShapes={overlayShapes}
            customLayers={customLayers}
            regionLabelStyle={regionLabelStyle}
            autoLiftRegionLabelAtMaxZoom={draw.autoLiftRegionLabelAtMaxZoom}
            zoomSnaps={viewer.zoomSnaps}
            zoomSnapFitAsMin
            onPointerWorldMove={event => {
              if (event.coordinate) {
                setPointerWorld([event.coordinate[0], event.coordinate[1]]);
              } else {
                setPointerWorld(null);
              }
            }}
            onRegionHover={handleRegionHover}
            onRegionClick={handleRegionClick}
            onPointHover={handlePointHover}
            onPointClick={handlePointClick}
            onActiveRegionChange={handleActiveRegionChange}
            onDrawComplete={draw.handleDrawComplete}
            onPatchComplete={draw.handlePatchComplete}
            onViewStateChange={viewer.handleViewStateChange}
            onStats={setStats}
            overviewMapConfig={{
              show: viewer.showOverviewMap,
              options: {
                width: 220,
                height: 140,
                margin: 24,
                viewportBorderStyle: "dash",
                viewportBorderColor: "rgba(255, 106, 61, 0.95)",
                viewportFillColor: "rgba(255, 106, 61, 0.08)",
              },
            }}
          />
        ) : (
          <div className="empty">토큰 입력 후 Load를 누르면 뷰어가 표시됩니다.</div>
        )}

        <StatusOverlay
          drawTool={draw.drawTool}
          stats={stats}
          viewState={viewer.viewState}
          roiRegions={draw.roiRegions}
          patchRegions={draw.patchRegions}
          hoveredRegionId={hoveredRegionId}
          activeRegionId={activeRegionId}
          clickedRegionId={clickedRegionId}
          pointerWorld={pointerWorld}
          hoveredPoint={hoveredPoint}
          lastPointClick={lastPointClick}
          stampRectangleAreaMm2={draw.stampRectangleAreaMm2}
          stampCircleAreaMm2={draw.stampCircleAreaMm2}
          stampRectanglePixelSize={draw.stampRectanglePixelSize}
          brushRadius={draw.brushRadius}
          brushOpacity={draw.brushOpacity}
          brushEraserPreview={draw.brushEraserPreview}
          autoLiftRegionLabelAtMaxZoom={draw.autoLiftRegionLabelAtMaxZoom}
          enableZoomSnaps={viewer.enableZoomSnaps}
          sourceMpp={source?.mpp}
          pointSizeByZoom={pointSizeByZoom}
          pointStrokeScale={pointStrokeScale}
          pointInnerBlackFill={pointInnerBlackFill}
          clipStats={viewer.clipStats}
          lastDraw={draw.lastDraw}
          lastPatch={draw.lastPatch}
          lastPatchIndices={draw.lastPatchIndices}
        />
      </div>
    </div>
  );
}
