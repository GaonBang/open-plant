import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type BrushOptions,
  buildTermPalette,
  calcScaleLength,
  clamp,
  type DrawOverlayShape,
  type DrawResult,
  type DrawTool,
  filterPointIndicesByPolygons,
  getWebGpuCapabilities,
  isSameViewState,
  normalizeImageInfo,
  type PatchDrawResult,
  type PointClickEvent,
  type PointClipMode,
  type PointClipStatsEvent,
  type PointHoverEvent,
  type RegionClickEvent,
  type RegionHoverEvent,
  type RegionLabelStyle,
  type RegionStrokeStyle,
  type RegionStyleContext,
  toBearerToken,
  type WebGpuCapabilities,
  type WsiCustomLayer,
  type WsiImageSource,
  type WsiPointData,
  type WsiRegion,
  type WsiRenderStats,
  type WsiTerm,
  WsiViewerCanvas,
  type WsiViewState,
} from "../../src";
import { type LoadedPointData, loadPointsFromZst } from "./point-loader";

const DEFAULT_INFO_URL = (import.meta.env.VITE_IMAGE_INFO_URL as string | undefined) ?? "";
const S3_BASE_URL = (import.meta.env.VITE_S3_BASE_URL as string | undefined) ?? "";

const DEMO_ZST_URL = "/sample/10000000cells.zst";

const _demoTileCache = new Map<string, string>();
let _demoCanvas: HTMLCanvasElement | null = null;
let _demoCtx: CanvasRenderingContext2D | null = null;

function buildDemoTileUrl(tier: number, x: number, y: number): string {
  const key = `${tier}/${x}/${y}`;
  const cached = _demoTileCache.get(key);
  if (cached) return cached;

  if (!_demoCanvas) {
    _demoCanvas = document.createElement("canvas");
    _demoCanvas.width = 256;
    _demoCanvas.height = 256;
    _demoCtx = _demoCanvas.getContext("2d")!;
  }
  const ctx = _demoCtx!;

  const hue = (tier * 37 + (x * 7 + y * 13) * 11) % 360;
  const l = 86 + (tier % 3) * 3;
  ctx.fillStyle = `hsl(${hue},30%,${l}%)`;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "rgba(0,0,0,0.08)";
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, 256, 256);
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.font = "11px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${tier}/${x},${y}`, 128, 128);

  const url = _demoCanvas.toDataURL("image/png");
  _demoTileCache.set(key, url);
  return url;
}

function createDemoSource(): WsiImageSource {
  return {
    id: "demo",
    name: "Demo (SS23-85517 C-erb_B2)",
    width: 160000,
    height: 80000,
    mpp: 0.22,
    tileSize: 256,
    maxTierZoom: 10,
    tilePath: "",
    tileBaseUrl: "",
    tileUrlBuilder: buildDemoTileUrl,
    terms: [
      { termId: "0", termName: "Background", termColor: "#888888" },
      { termId: "1", termName: "Negative", termColor: "#4a90d9" },
      { termId: "2", termName: "Positive", termColor: "#e74c3c" },
      { termId: "3", termName: "Other", termColor: "#2ecc71" },
    ],
  };
}

interface PointStatus {
  loading: boolean;
  error: string;
  count: number;
  terms: number;
  hasNt: boolean;
  hasPositivityRank: boolean;
}

const INITIAL_POINT_STATUS: PointStatus = {
  loading: false,
  error: "",
  count: 0,
  terms: 0,
  hasNt: false,
  hasPositivityRank: false,
};

const DEFAULT_POINT_SIZE_STOPS = {
  1: 1,
  2: 2,
  5: 5,
  6: 5,
  8: 8,
} as const;

function normalizeKey(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function createTermAliasResolver(terms: WsiTerm[], termToPaletteIndex: Map<string, number>): (rawValue: string | number | null | undefined) => number {
  const direct = termToPaletteIndex;
  const alias = new Map<string, number>();

  let positivePaletteIndex = 0;
  let negativePaletteIndex = 0;

  for (const term of terms) {
    const termId = String(term.termId ?? "");
    const paletteIndex = direct.get(termId) ?? 0;
    if (!paletteIndex) continue;

    const termName = normalizeKey(term.termName);
    if (termName) {
      alias.set(termName, paletteIndex);
    }

    if (!positivePaletteIndex && termName.includes("positive")) {
      positivePaletteIndex = paletteIndex;
    }
    if (!negativePaletteIndex && termName.includes("negative")) {
      negativePaletteIndex = paletteIndex;
    }
  }

  if (positivePaletteIndex) {
    for (const key of ["positive", "pos", "4", "p"]) {
      alias.set(key, positivePaletteIndex);
    }
  }
  if (negativePaletteIndex) {
    for (const key of ["negative", "neg", "1", "n"]) {
      alias.set(key, negativePaletteIndex);
    }
  }

  return (rawValue): number => {
    const raw = String(rawValue ?? "");
    const directHit = direct.get(raw);
    if (directHit !== undefined) return directHit;
    const normalized = normalizeKey(raw);
    if (!normalized) return 0;
    return alias.get(normalized) ?? 0;
  };
}

function getRegionTopCenter(coordinates: [number, number][]): [number, number] | null {
  if (!Array.isArray(coordinates) || coordinates.length === 0) return null;
  let minY = Infinity;
  for (const [, y] of coordinates) {
    if (y < minY) minY = y;
  }
  if (!Number.isFinite(minY)) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  for (const [x, y] of coordinates) {
    if (Math.abs(y - minY) > 0.5) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return null;
  return [(minX + maxX) * 0.5, minY];
}

export default function App() {
  const initialLoadDoneRef = useRef(false);

  const [infoUrlInput, setInfoUrlInput] = useState(DEFAULT_INFO_URL);
  const [tokenInput, setTokenInput] = useState(() => localStorage.getItem("open-plant-token") ?? "");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState<WsiImageSource | null>(null);
  const [pointZstUrl, setPointZstUrl] = useState("");
  const [viewState, setViewState] = useState<Partial<WsiViewState> | null>(null);
  const [fitNonce, setFitNonce] = useState(0);

  const [stats, setStats] = useState<WsiRenderStats>({
    tier: 0,
    visible: 0,
    rendered: 0,
    points: 0,
    fallback: 0,
    cache: 0,
    inflight: 0,
  });

  const [pointStatus, setPointStatus] = useState<PointStatus>(INITIAL_POINT_STATUS);
  const [pointPayload, setPointPayload] = useState<WsiPointData | null>(null);
  const [pointSizeStop1, setPointSizeStop1] = useState<number>(DEFAULT_POINT_SIZE_STOPS[1]);
  const [pointSizeStop2, setPointSizeStop2] = useState<number>(DEFAULT_POINT_SIZE_STOPS[2]);
  const [pointSizeStop5, setPointSizeStop5] = useState<number>(DEFAULT_POINT_SIZE_STOPS[5]);
  const [pointSizeStop6, setPointSizeStop6] = useState<number>(DEFAULT_POINT_SIZE_STOPS[6]);
  const [pointSizeStop8, setPointSizeStop8] = useState<number>(DEFAULT_POINT_SIZE_STOPS[8]);
  const [pointStrokeScale, setPointStrokeScale] = useState(1);
  const [pointInnerBlackFill, setPointInnerBlackFill] = useState(false);
  const [drawTool, setDrawTool] = useState<DrawTool>("cursor");
  const [brushRadius, setBrushRadius] = useState(480);
  const [brushOpacity, setBrushOpacity] = useState(0.1);
  const [brushEraserPreview, setBrushEraserPreview] = useState(false);
  const [stampRectangleAreaMm2, setStampRectangleAreaMm2] = useState(2);
  const [stampCircleAreaMm2, setStampCircleAreaMm2] = useState(2);
  const [stampRectanglePixelSize, setStampRectanglePixelSize] = useState(4096);
  const [showOverviewMap, setShowOverviewMap] = useState(true);
  const [ctrlDragRotate, setCtrlDragRotate] = useState(true);
  const [rotationResetNonce, setRotationResetNonce] = useState(0);
  const [clipMode, setClipMode] = useState<PointClipMode>("worker");
  const [clipStats, setClipStats] = useState<PointClipStatsEvent | null>(null);
  const [autoLiftRegionLabelAtMaxZoom, setAutoLiftRegionLabelAtMaxZoom] = useState(true);
  const [enableZoomSnaps, setEnableZoomSnaps] = useState(true);
  const [webGpuCaps, setWebGpuCaps] = useState<WebGpuCapabilities | null>(null);
  const [lastDraw, setLastDraw] = useState<DrawResult | null>(null);
  const [roiRegions, setRoiRegions] = useState<WsiRegion[]>([]);
  const [patchRegions, setPatchRegions] = useState<WsiRegion[]>([]);
  const [lastPatch, setLastPatch] = useState<PatchDrawResult | null>(null);
  const [lastPatchIndices, setLastPatchIndices] = useState<Uint32Array>(new Uint32Array(0));
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
  const [labelInput, setLabelInput] = useState("");

  const bearerToken = useMemo(() => toBearerToken(tokenInput), [tokenInput]);

  const termPalette = useMemo(() => {
    if (!source?.terms?.length) return buildTermPalette([]);
    return buildTermPalette(source.terms);
  }, [source]);

  const pointSizeByZoom = useMemo(
    () =>
      ({
        1: pointSizeStop1,
        2: pointSizeStop2,
        5: pointSizeStop5,
        6: pointSizeStop6,
        8: pointSizeStop8,
      }) as const,
    [pointSizeStop1, pointSizeStop2, pointSizeStop5, pointSizeStop6, pointSizeStop8]
  );

  const handleViewStateChange = useCallback((next: WsiViewState) => {
    setViewState(prev => (isSameViewState(prev, next) ? prev : next));
  }, []);

  useEffect(() => {
    localStorage.setItem("open-plant-token", tokenInput);
  }, [tokenInput]);

  useEffect(() => {
    let cancelled = false;
    getWebGpuCapabilities()
      .then(caps => {
        if (cancelled) return;
        setWebGpuCaps(caps);
      })
      .catch(() => {
        if (cancelled) return;
        setWebGpuCaps({ supported: false, features: [] });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const resetFormState = useCallback((): void => {
    setDrawTool("cursor");
    setLastDraw(null);
    setRoiRegions([]);
    setPatchRegions([]);
    setLastPatch(null);
    setLastPatchIndices(new Uint32Array(0));
    setHoveredRegionId(null);
    setActiveRegionId(null);
    setClickedRegionId(null);
    setPointerWorld(null);
    setHoveredPoint({
      index: null,
      id: null,
      pointCoordinate: null,
    });
    setLastPointClick(null);
    setPointPayload(null);
    setPointStatus(INITIAL_POINT_STATUS);
  }, []);

  const loadDemo = useCallback((): void => {
    setLoading(true);
    setError("");
    const demoSource = createDemoSource();
    setSource(demoSource);
    setPointZstUrl(DEMO_ZST_URL);
    setViewState(null);
    setFitNonce(prev => prev + 1);
    resetFormState();
    setLoading(false);
  }, [resetFormState]);

  const loadImageInfo = useCallback(
    (url: string): void => {
      const trimmedUrl = String(url || "").trim();
      if (!trimmedUrl) {
        setError("image info URL이 비어 있습니다.");
        setSource(null);
        return;
      }

      setLoading(true);
      setError("");

      const headers: HeadersInit | undefined = bearerToken ? { Authorization: bearerToken } : undefined;

      fetch(trimmedUrl, { headers })
        .then(response => {
          if (!response.ok) {
            return Promise.reject(new Error(`이미지 정보 요청 실패: HTTP ${response.status}`));
          }
          return response.json() as Promise<Record<string, unknown>>;
        })
        .then(raw => {
          const nextSource = normalizeImageInfo(raw, `${S3_BASE_URL}/ims`);
          setSource(nextSource);
          setPointZstUrl(raw?.mvtPath ? String(raw.mvtPath) : "");
          setViewState(null);
          setFitNonce(prev => prev + 1);
          resetFormState();
        })
        .catch((err: Error) => {
          setSource(null);
          setPointZstUrl("");
          setError(err.message || "알 수 없는 오류");
          resetFormState();
        })
        .finally(() => {
          setLoading(false);
        });
    },
    [bearerToken, resetFormState]
  );

  useEffect(() => {
    if (initialLoadDoneRef.current) return;
    initialLoadDoneRef.current = true;
    if (DEFAULT_INFO_URL) {
      loadImageInfo(DEFAULT_INFO_URL);
    } else {
      loadDemo();
    }
  }, [loadImageInfo, loadDemo]);

  useEffect(() => {
    if (!pointZstUrl || !source) {
      setPointPayload(null);
      setPointStatus(prev => ({
        ...prev,
        loading: false,
        count: 0,
        terms: source?.terms?.length || 0,
      }));
      return;
    }

    let cancelled = false;
    const currentSource = source;

    setPointStatus({
      loading: true,
      error: "",
      count: 0,
      terms: currentSource.terms.length,
      hasNt: false,
      hasPositivityRank: false,
    });

    const pointAuthToken = S3_BASE_URL && pointZstUrl.startsWith(S3_BASE_URL) ? "" : bearerToken;

    loadPointsFromZst({
      url: pointZstUrl,
      imageHeight: currentSource.height,
      authToken: pointAuthToken,
    })
      .then((result: LoadedPointData) => {
        if (cancelled) return;

        const localTermIndex = result.localTermIndex || new Uint16Array(0);
        const termTable = Array.isArray(result.termTable) ? result.termTable : [""];
        const resolveTermPaletteIndex = createTermAliasResolver(currentSource.terms, termPalette.termToPaletteIndex);

        const lut = new Uint16Array(Math.max(1, termTable.length));
        const unmatchedTerms: string[] = [];
        for (let i = 0; i < termTable.length; i += 1) {
          const key = String(termTable[i] ?? "");
          const mapped = resolveTermPaletteIndex(key);
          lut[i] = mapped;
          if (mapped === 0 && key && key !== "0") {
            unmatchedTerms.push(key);
          }
        }

        const paletteIndices = new Uint16Array(localTermIndex.length);
        for (let i = 0; i < localTermIndex.length; i += 1) {
          paletteIndices[i] = lut[localTermIndex[i]] ?? 0;
        }
        const ids = new Uint32Array(result.count);
        for (let i = 0; i < ids.length; i += 1) {
          ids[i] = i;
        }

        setPointPayload({
          count: result.count,
          positions: result.positions,
          paletteIndices,
          ids,
        });

        setPointStatus({
          loading: false,
          error: unmatchedTerms.length ? `term unmatched: ${unmatchedTerms.slice(0, 5).join(", ")}${unmatchedTerms.length > 5 ? " ..." : ""}` : "",
          count: result.count || 0,
          terms: termTable.length,
          hasNt: Boolean(result.hasNt),
          hasPositivityRank: Boolean(result.hasPositivityRank),
        });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setPointPayload(null);
        setPointStatus({
          loading: false,
          error: err.message || "point load failed",
          count: 0,
          terms: 0,
          hasNt: false,
          hasPositivityRank: false,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [pointZstUrl, source, bearerToken, termPalette]);

  const imageSummary = useMemo((): string => {
    if (!source) return "이미지 없음";
    return `${source.name} | ${source.width} x ${source.height} | tile ${source.tileSize} | max tier ${source.maxTierZoom}`;
  }, [source]);

  const scaleSummary = useMemo((): string => {
    if (!source) return "-";
    const zoom = Math.max(1e-6, viewState?.zoom || 1);
    const currentZoom = source.maxTierZoom + Math.log2(zoom);
    return calcScaleLength(source.mpp || 0, source.maxTierZoom, currentZoom);
  }, [source, viewState?.zoom]);

  const regionStrokeStyle = useMemo<Partial<RegionStrokeStyle>>(
    () => ({
      color: "#ffd166",
      width: 2.5,
    }),
    []
  );

  const regionStrokeHoverStyle = useMemo<Partial<RegionStrokeStyle>>(
    () => ({
      color: "#ff2f2f",
      width: 3,
    }),
    []
  );

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
      return {
        color: "#ff2f2f",
        width: 3.2,
        shadowColor: "rgba(255, 47, 47, 0.95)",
        shadowBlur: 12,
        shadowOffsetX: 0,
        shadowOffsetY: 0,
      };
    }
    if (context.state === "hover") {
      return { color: "#ff2f2f", width: 3 };
    }
    if (context.regionIndex % 2 === 1) {
      return { color: "#ffe08a", width: 2.25 };
    }
    return undefined;
  }, []);

  const regionLabelStyle = useMemo<Partial<RegionLabelStyle>>(
    () => ({
      backgroundColor: "rgba(8, 14, 22, 0.9)",
      borderColor: "#ffd166",
      textColor: "#fff4cc",
      borderRadius: 4,
      fontSize: 12,
    }),
    []
  );

  const handlePatchComplete = useCallback(
    (payload: PatchDrawResult) => {
      setLastPatch(payload);
      setPatchRegions(prev => [
        ...prev,
        {
          id: `patch-${Date.now()}-${prev.length}`,
          coordinates: payload.coordinates,
        },
      ]);

      if (pointPayload) {
        setLastPatchIndices(filterPointIndicesByPolygons(pointPayload, [payload.coordinates]));
      } else {
        setLastPatchIndices(new Uint32Array(0));
      }
      setDrawTool("cursor");
    },
    [pointPayload]
  );

  const handleDrawComplete = useCallback(
    (payload: DrawResult) => {
      setLastDraw(payload || null);
      if (payload?.intent === "patch") {
        setDrawTool("cursor");
        return;
      }
      if (payload?.intent === "brush" || payload?.tool === "brush") {
        // Brush is an interaction-only tool: app decides union/subtract/cell edits externally.
        return;
      }
      if (payload?.coordinates?.length) {
        const label = labelInput.trim();
        setRoiRegions(prev => [
          ...prev,
          {
            id: `${Date.now()}-${prev.length}`,
            coordinates: payload.coordinates,
            label,
          },
        ]);
      }
      setDrawTool("cursor");
    },
    [labelInput]
  );

  const handleDownloadPatchJson = useCallback(() => {
    if (!source || !pointPayload || !lastPatch || lastPatchIndices.length === 0) return;

    const annotations = Array.from(lastPatchIndices).map(index => ({
      pointIndex: index,
      x: pointPayload.positions[index * 2],
      y: pointPayload.positions[index * 2 + 1],
      paletteIndex: pointPayload.paletteIndices[index],
    }));

    const payload = {
      patch: {
        tool: lastPatch.tool,
        coordinates: lastPatch.coordinates,
        bbox: lastPatch.bbox,
        areaPx: lastPatch.areaPx,
      },
      images: [
        {
          id: source.id,
          name: source.name,
          width: source.width,
          height: source.height,
        },
      ],
      categories: source.terms.map(term => ({
        id: term.termId,
        name: term.termName,
        color: term.termColor,
      })),
      annotations,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `patch-${source.id}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [source, pointPayload, lastPatch, lastPatchIndices]);

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

  const maxZoom = source ? Math.max(1, Math.min(32, source.maxTierZoom + 4)) : 1;

  const zoomSnaps = useMemo(() => {
    if (!enableZoomSnaps || !source?.mpp || source.mpp <= 0) return undefined;
    const scanMag = 10 / source.mpp;
    const STANDARD_STEPS = [1.25, 2.5, 5, 10, 20, 40, 80, 100];
    return STANDARD_STEPS.filter(m => m <= scanMag);
  }, [enableZoomSnaps, source?.mpp]);

  const handleZoomIn = useCallback(() => {
    setViewState(prev => ({
      ...(prev || {}),
      zoom: clamp((prev?.zoom || 1) * 1.25, 1e-6, maxZoom),
    }));
  }, [maxZoom]);

  const handleZoomOut = useCallback(() => {
    setViewState(prev => ({
      ...(prev || {}),
      zoom: clamp((prev?.zoom || 1) * 0.8, 1e-6, maxZoom),
    }));
  }, [maxZoom]);

  const handleStampRectChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const next = Number(e.target.value);
    if (Number.isFinite(next) && next > 0) setStampRectangleAreaMm2(next);
  }, []);

  const handleStampCircleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const next = Number(e.target.value);
    if (Number.isFinite(next) && next > 0) setStampCircleAreaMm2(next);
  }, []);

  const resetPointSizeStops = useCallback(() => {
    setPointSizeStop1(DEFAULT_POINT_SIZE_STOPS[1]);
    setPointSizeStop2(DEFAULT_POINT_SIZE_STOPS[2]);
    setPointSizeStop5(DEFAULT_POINT_SIZE_STOPS[5]);
    setPointSizeStop6(DEFAULT_POINT_SIZE_STOPS[6]);
    setPointSizeStop8(DEFAULT_POINT_SIZE_STOPS[8]);
  }, []);

  const brushOptions = useMemo<BrushOptions>(
    () => ({
      radius: Math.max(1, brushRadius),
      fillColor: brushEraserPreview ? "#e03131" : "#0b0b0b",
      fillOpacity: Math.max(0, Math.min(1, brushOpacity)),
      cursorColor: brushEraserPreview ? "#ffa8a8" : "#FFCF00",
      cursorActiveColor: brushEraserPreview ? "#ff4d4f" : "#FF0000",
      cursorLineWidth: 1.5,
      cursorLineDash: [2, 2],
    }),
    [brushRadius, brushOpacity, brushEraserPreview]
  );

  const handleClearRoi = useCallback(() => {
    setRoiRegions([]);
    setPatchRegions([]);
    setLastPatch(null);
    setLastPatchIndices(new Uint32Array(0));
    setHoveredRegionId(null);
    setActiveRegionId(null);
    setClickedRegionId(null);
    setHoveredPoint({
      index: null,
      id: null,
      pointCoordinate: null,
    });
    setLastPointClick(null);
  }, []);

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
        stroke: {
          color: "#CB59FF",
          width: 3,
          lineDash: [5, 5],
        },
        invertedFill: {
          fillColor: "rgba(0, 0, 0, 0.15)",
        },
        visible: true,
      },
    ];
  }, [source]);

  const patchStrokeStyle = useMemo<Partial<RegionStrokeStyle>>(
    () => ({
      color: "#8ad8ff",
      width: 2,
      lineDash: [10, 8],
    }),
    []
  );

  const customLayers = useMemo<WsiCustomLayer[]>(() => {
    if (!patchRegions.length) return [];
    return [
      {
        id: "patch-label-layer",
        zIndex: 4,
        pointerEvents: "none",
        render: ({ worldToScreen }) => {
          return (
            <>
              {patchRegions.map((region, index) => {
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
          );
        },
      },
    ];
  }, [patchRegions]);

  return (
    <div className="app">
      <div className="topbar">
        <div className="url-row">
          <input type="text" value={infoUrlInput} onChange={e => setInfoUrlInput(e.target.value)} placeholder="image info API URL" />
          <button type="button" disabled={loading} onClick={() => loadImageInfo(infoUrlInput)}>
            {loading ? "Loading..." : "Load"}
          </button>
          <button type="button" disabled={loading} onClick={loadDemo}>
            Demo
          </button>
        </div>

        <div className="auth-row">
          <input type="text" value={tokenInput} onChange={e => setTokenInput(e.target.value)} placeholder="Bearer 토큰 또는 raw 토큰" />
        </div>

        <div className="ctl-row">
          <button type="button" disabled={!source} onClick={() => setFitNonce(prev => prev + 1)}>
            Fit
          </button>
          <button type="button" disabled={!source} onClick={() => setRotationResetNonce(prev => prev + 1)}>
            Reset Rotate
          </button>
          <button type="button" className={ctrlDragRotate ? "active" : ""} disabled={!source} onClick={() => setCtrlDragRotate(prev => !prev)}>
            Ctrl+Drag Rotate
          </button>
          <button type="button" disabled={!source} className={showOverviewMap ? "active" : ""} onClick={() => setShowOverviewMap(prev => !prev)}>
            Overview
          </button>
          <button type="button" disabled={!source} onClick={handleZoomIn}>
            Zoom In
          </button>
          <button type="button" disabled={!source} onClick={handleZoomOut}>
            Zoom Out
          </button>

          <div className="tool-group">
            <button type="button" className={drawTool === "cursor" ? "active" : ""} disabled={!source} onClick={() => setDrawTool("cursor")}>
              Cursor
            </button>
            <button type="button" className={drawTool === "freehand" ? "active" : ""} disabled={!source} onClick={() => setDrawTool("freehand")}>
              Freehand
            </button>
            <button type="button" className={drawTool === "rectangle" ? "active" : ""} disabled={!source} onClick={() => setDrawTool("rectangle")}>
              Rectangle
            </button>
            <button type="button" className={drawTool === "circular" ? "active" : ""} disabled={!source} onClick={() => setDrawTool("circular")}>
              Circular
            </button>
            <button type="button" className={drawTool === "brush" ? "active" : ""} disabled={!source} onClick={() => setDrawTool("brush")}>
              Brush
            </button>
            <button type="button" className={drawTool === "stamp-rectangle" ? "active" : ""} disabled={!source} onClick={() => setDrawTool("stamp-rectangle")}>
              Stamp □
            </button>
            <button type="button" className={drawTool === "stamp-circle" ? "active" : ""} disabled={!source} onClick={() => setDrawTool("stamp-circle")}>
              Stamp ○
            </button>
            <button type="button" className={drawTool === "stamp-rectangle-4096px" ? "active" : ""} disabled={!source} onClick={() => setDrawTool("stamp-rectangle-4096px")}>
              Stamp 4096px
            </button>
            <input
              className="stamp-input"
              type="number"
              min={0.001}
              step={0.1}
              value={stampRectangleAreaMm2}
              onChange={handleStampRectChange}
              aria-label="Rectangle stamp area mm2"
              title="Rectangle stamp area (mm²)"
            />
            <span className="stamp-unit">Rect mm²</span>
            <input
              className="stamp-input"
              type="number"
              min={0.001}
              step={0.1}
              value={stampCircleAreaMm2}
              onChange={handleStampCircleChange}
              aria-label="Circle stamp area mm2"
              title="Circle stamp area (mm²)"
            />
            <span className="stamp-unit">Circle mm²</span>
            <input
              className="stamp-input"
              type="number"
              min={1}
              step={1}
              value={stampRectanglePixelSize}
              onChange={e => {
                const next = Number(e.target.value);
                if (Number.isFinite(next) && next > 0) setStampRectanglePixelSize(Math.round(next));
              }}
              aria-label="Rectangle stamp pixel size"
              title="Rectangle stamp pixel size"
            />
            <span className="stamp-unit">Rect px</span>
            <input
              className="stamp-input"
              type="number"
              min={1}
              step={1}
              value={brushRadius}
              onChange={e => {
                const next = Number(e.target.value);
                if (Number.isFinite(next) && next > 0) setBrushRadius(Math.round(next));
              }}
              aria-label="Brush radius"
              title="Brush radius (world px)"
            />
            <span className="stamp-unit">Brush r(px)</span>
            <input
              className="stamp-input"
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={brushOpacity}
              onChange={e => {
                const next = Number(e.target.value);
                if (!Number.isFinite(next)) return;
                setBrushOpacity(Math.max(0, Math.min(1, next)));
              }}
              aria-label="Brush opacity"
              title="Brush preview opacity"
            />
            <span className="stamp-unit">Brush α</span>
            <button type="button" className={brushEraserPreview ? "active" : ""} onClick={() => setBrushEraserPreview(prev => !prev)}>
              {brushEraserPreview ? "Preview: Eraser" : "Preview: Brush"}
            </button>
            <button
              type="button"
              className={drawTool === "stamp-circle" && Math.abs(stampCircleAreaMm2 - 0.2) < 1e-9 ? "active" : ""}
              disabled={!source}
              onClick={() => {
                setStampCircleAreaMm2(0.2);
                setDrawTool("stamp-circle");
              }}
            >
              HPF 0.2mm²
            </button>
            <button type="button" className={autoLiftRegionLabelAtMaxZoom ? "active" : ""} disabled={!source} onClick={() => setAutoLiftRegionLabelAtMaxZoom(prev => !prev)}>
              Label Auto Lift
            </button>
            <button type="button" className={enableZoomSnaps ? "active" : ""} disabled={!source} onClick={() => setEnableZoomSnaps(prev => !prev)}>
              Zoom Snap {enableZoomSnaps && zoomSnaps ? `(${zoomSnaps[0]}→${zoomSnaps[zoomSnaps.length - 1]}x)` : "Off"}
            </button>
            <input className="label-input" type="text" value={labelInput} onChange={e => setLabelInput(e.target.value)} placeholder="Region label (optional)" />
            <button type="button" disabled={!source || (roiRegions.length === 0 && patchRegions.length === 0)} onClick={handleClearRoi}>
              Clear Regions
            </button>
            <button type="button" disabled={!source || !lastPatch || lastPatchIndices.length === 0} onClick={handleDownloadPatchJson}>
              Export Patch JSON
            </button>
            <button type="button" className={clipMode === "worker" ? "active" : ""} onClick={() => setClipMode("worker")}>
              Clip Worker
            </button>
            <button type="button" className={clipMode === "hybrid-webgpu" ? "active" : ""} onClick={() => setClipMode("hybrid-webgpu")}>
              Clip Hybrid GPU
            </button>
            <button type="button" className={clipMode === "sync" ? "active" : ""} onClick={() => setClipMode("sync")}>
              Clip Sync
            </button>
          </div>

          <div className="subpanel point-size-panel">
            <span className="subpanel-title">Point Size Stops</span>
            <label className="point-stop">
              z1
              <input
                className="stamp-input point-stop-input"
                type="number"
                min={0.1}
                step={0.1}
                value={pointSizeStop1}
                onChange={e => {
                  const next = Number(e.target.value);
                  if (Number.isFinite(next) && next > 0) setPointSizeStop1(next);
                }}
              />
            </label>
            <label className="point-stop">
              z2
              <input
                className="stamp-input point-stop-input"
                type="number"
                min={0.1}
                step={0.1}
                value={pointSizeStop2}
                onChange={e => {
                  const next = Number(e.target.value);
                  if (Number.isFinite(next) && next > 0) setPointSizeStop2(next);
                }}
              />
            </label>
            <label className="point-stop">
              z5
              <input
                className="stamp-input point-stop-input"
                type="number"
                min={0.1}
                step={0.1}
                value={pointSizeStop5}
                onChange={e => {
                  const next = Number(e.target.value);
                  if (Number.isFinite(next) && next > 0) setPointSizeStop5(next);
                }}
              />
            </label>
            <label className="point-stop">
              z6
              <input
                className="stamp-input point-stop-input"
                type="number"
                min={0.1}
                step={0.1}
                value={pointSizeStop6}
                onChange={e => {
                  const next = Number(e.target.value);
                  if (Number.isFinite(next) && next > 0) setPointSizeStop6(next);
                }}
              />
            </label>
            <label className="point-stop">
              z8
              <input
                className="stamp-input point-stop-input"
                type="number"
                min={0.1}
                step={0.1}
                value={pointSizeStop8}
                onChange={e => {
                  const next = Number(e.target.value);
                  if (Number.isFinite(next) && next > 0) setPointSizeStop8(next);
                }}
              />
            </label>
            <button type="button" onClick={resetPointSizeStops}>
              Reset Stops
            </button>
          </div>

          <div className="subpanel point-stroke-panel">
            <span className="subpanel-title">Point Stroke</span>
            <label className="point-slider-wrap">
              thickness
              <input
                className="point-slider"
                type="range"
                min={0.1}
                max={3}
                step={0.05}
                value={pointStrokeScale}
                onChange={e => {
                  const next = Number(e.target.value);
                  if (Number.isFinite(next) && next > 0) setPointStrokeScale(next);
                }}
              />
            </label>
            <span className="point-slider-value">{pointStrokeScale.toFixed(2)}x</span>
            <label className="point-checkbox-wrap">
              <input type="checkbox" checked={pointInnerBlackFill} onChange={e => setPointInnerBlackFill(e.target.checked)} />
              inner black fill (opacity 0.1)
            </label>
          </div>

          <div className={`status ${error ? "error" : ""}`}>{error || `${imageSummary} | scale ${scaleSummary}`}</div>

          <div className={`status ${pointStatus.error ? "error" : ""}`}>
            {pointStatus.error
              ? `points warn: ${pointStatus.error}`
              : pointStatus.loading
                ? "points loading..."
                : `points ${pointStatus.count.toLocaleString()} | terms ${pointStatus.terms} | nt ${pointStatus.hasNt ? "yes" : "no"} | stain ${pointStatus.hasPositivityRank ? "yes" : "no"}`}
          </div>

          <div className="status">
            webgpu {webGpuCaps?.supported ? "on" : "off"} | clip mode {clipMode}
            {webGpuCaps?.supported && webGpuCaps.adapterName ? ` | adapter ${webGpuCaps.adapterName}` : ""}
          </div>
        </div>
      </div>

      <div className="viewer-wrap">
        {source ? (
          <WsiViewerCanvas
            className="viewer-canvas"
            source={source}
            viewState={viewState}
            fitNonce={fitNonce}
            rotationResetNonce={rotationResetNonce}
            authToken={bearerToken}
            ctrlDragRotate={ctrlDragRotate}
            pointData={pointPayload}
            pointPalette={termPalette.colors}
            pointSizeByZoom={pointSizeByZoom}
            pointStrokeScale={pointStrokeScale}
            pointInnerFillOpacity={pointInnerBlackFill ? 0.2 : 0}
            roiRegions={roiRegions}
            patchRegions={patchRegions}
            clipPointsToRois
            clipMode={clipMode}
            onClipStats={setClipStats}
            interactionLock={drawTool !== "cursor"}
            drawTool={drawTool}
            stampOptions={{
              rectangleAreaMm2: stampRectangleAreaMm2,
              circleAreaMm2: stampCircleAreaMm2,
              rectanglePixelSize: stampRectanglePixelSize,
            }}
            brushOptions={brushOptions}
            regionStrokeStyle={regionStrokeStyle}
            regionStrokeHoverStyle={regionStrokeHoverStyle}
            regionStrokeActiveStyle={regionStrokeActiveStyle}
            patchStrokeStyle={patchStrokeStyle}
            resolveRegionStrokeStyle={resolveRegionStrokeStyle}
            overlayShapes={overlayShapes}
            customLayers={customLayers}
            regionLabelStyle={regionLabelStyle}
            autoLiftRegionLabelAtMaxZoom={autoLiftRegionLabelAtMaxZoom}
            zoomSnaps={zoomSnaps}
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
            onDrawComplete={handleDrawComplete}
            onPatchComplete={handlePatchComplete}
            onViewStateChange={handleViewStateChange}
            onStats={setStats}
            overviewMapConfig={{
              show: showOverviewMap,
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

        <div className="overlay">
          Drag: Pan | Wheel: Zoom | Ctrl/Cmd+Drag: Rotate | Double Click: Zoom In | Shift+Double Click: Zoom Out | Draw Tool: {String(drawTool)}
          <br />
          tier {stats.tier} | visible {stats.visible} | rendered {stats.rendered} | points {stats.points} | fallback {stats.fallback} | cache {stats.cache} | inflight {stats.inflight}
          <br />
          zoom {viewState?.zoom ? viewState.zoom.toFixed(4) : "fit"} | rotation {viewState?.rotationDeg ? viewState.rotationDeg.toFixed(2) : "0.00"}° | offset ({Math.round(viewState?.offsetX || 0)},{" "}
          {Math.round(viewState?.offsetY || 0)}) | rois {roiRegions.length} | patches {patchRegions.length}
          <br />
          hover {hoveredRegionId ?? "-"} | active {activeRegionId ?? "-"} | click {clickedRegionId ?? "-"} | pointer{" "}
          {pointerWorld ? `${Math.round(pointerWorld[0])}, ${Math.round(pointerWorld[1])}` : "-"}
          <br />
          point hover id {hoveredPoint.id ?? "-"} | index {hoveredPoint.index ?? "-"} | point{" "}
          {hoveredPoint.pointCoordinate ? `${Math.round(hoveredPoint.pointCoordinate[0])}, ${Math.round(hoveredPoint.pointCoordinate[1])}` : "-"} | last click{" "}
          {lastPointClick ? `${lastPointClick.button === 2 ? "right" : "left"}:${lastPointClick.id ?? "-"}@${lastPointClick.index}` : "-"}
          <br />
          stamp rect {stampRectangleAreaMm2}mm² | stamp circle {stampCircleAreaMm2}
          mm² | stamp rect px {stampRectanglePixelSize} | brush r {brushRadius}px | brush α {brushOpacity.toFixed(2)} | preview {brushEraserPreview ? "eraser" : "brush"} | label auto-lift{" "}
          {autoLiftRegionLabelAtMaxZoom ? "on" : "off"} | zoom snap {enableZoomSnaps ? "on" : "off"}
          {source?.mpp ? ` | mag ${(((viewState?.zoom || 0) * 10) / source.mpp).toFixed(1)}x` : ""}
          <br />
          pointSizeByZoom z1:{pointSizeByZoom[1].toFixed(2)} z2:{pointSizeByZoom[2].toFixed(2)} z5:{pointSizeByZoom[5].toFixed(2)} z6:{pointSizeByZoom[6].toFixed(2)} z8:{pointSizeByZoom[8].toFixed(2)}
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
      </div>
    </div>
  );
}
