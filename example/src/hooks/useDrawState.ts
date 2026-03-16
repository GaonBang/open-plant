import { type ChangeEvent, useCallback, useMemo, useState } from "react";
import {
	type BrushOptions,
	type DrawResult,
	type DrawTool,
	filterPointIndicesByPolygons,
	type PatchDrawResult,
	type WsiPointData,
	type WsiRegion,
} from "../../../src";

export function useDrawState(
	source: { id: string; name: string; width: number; height: number; terms: { termId: string; termName: string; termColor: string }[] } | null,
	pointPayload: WsiPointData | null,
) {
	const [drawTool, setDrawTool] = useState<DrawTool>("cursor");
	const [labelInput, setLabelInput] = useState("");
	const [lastDraw, setLastDraw] = useState<DrawResult | null>(null);
	const [roiRegions, setRoiRegions] = useState<WsiRegion[]>([]);
	const [patchRegions, setPatchRegions] = useState<WsiRegion[]>([]);
	const [lastPatch, setLastPatch] = useState<PatchDrawResult | null>(null);
	const [lastPatchIndices, setLastPatchIndices] = useState<Uint32Array>(new Uint32Array(0));

	const [stampRectangleAreaMm2, setStampRectangleAreaMm2] = useState(2);
	const [stampCircleAreaMm2, setStampCircleAreaMm2] = useState(2);
	const [stampRectanglePixelSize, setStampRectanglePixelSize] = useState(4096);

	const [brushRadius, setBrushRadius] = useState(480);
	const [brushOpacity, setBrushOpacity] = useState(0.1);
	const [brushEraserPreview, setBrushEraserPreview] = useState(false);

	const [autoLiftRegionLabelAtMaxZoom, setAutoLiftRegionLabelAtMaxZoom] = useState(true);

	const stampOptions = useMemo(
		() => ({
			rectangleAreaMm2: stampRectangleAreaMm2,
			circleAreaMm2: stampCircleAreaMm2,
			rectanglePixelSize: stampRectanglePixelSize,
		}),
		[stampRectangleAreaMm2, stampCircleAreaMm2, stampRectanglePixelSize],
	);

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
		[brushRadius, brushOpacity, brushEraserPreview],
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
		[pointPayload],
	);

	const handleDrawComplete = useCallback(
		(payload: DrawResult) => {
			setLastDraw(payload || null);
			if (payload?.intent === "patch") {
				setDrawTool("cursor");
				return;
			}
			if (payload?.intent === "brush" || payload?.tool === "brush") {
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
		[labelInput],
	);

	const handleClearRoi = useCallback(() => {
		setRoiRegions([]);
		setPatchRegions([]);
		setLastPatch(null);
		setLastPatchIndices(new Uint32Array(0));
	}, []);

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
			images: [{ id: source.id, name: source.name, width: source.width, height: source.height }],
			categories: source.terms.map(term => ({
				id: term.termId,
				name: term.termName,
				color: term.termColor,
			})),
			annotations,
		};

		const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `patch-${source.id}-${Date.now()}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}, [source, pointPayload, lastPatch, lastPatchIndices]);

	const handleStampRectChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
		const next = Number(e.target.value);
		if (Number.isFinite(next) && next > 0) setStampRectangleAreaMm2(next);
	}, []);

	const handleStampCircleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
		const next = Number(e.target.value);
		if (Number.isFinite(next) && next > 0) setStampCircleAreaMm2(next);
	}, []);

	const reset = useCallback(() => {
		setDrawTool("cursor");
		setLastDraw(null);
		setRoiRegions([]);
		setPatchRegions([]);
		setLastPatch(null);
		setLastPatchIndices(new Uint32Array(0));
	}, []);

	return {
		drawTool,
		setDrawTool,
		labelInput,
		setLabelInput,
		lastDraw,
		roiRegions,
		patchRegions,
		lastPatch,
		lastPatchIndices,

		stampRectangleAreaMm2,
		stampCircleAreaMm2,
		stampRectanglePixelSize,
		setStampRectanglePixelSize,
		stampOptions,
		handleStampRectChange,
		handleStampCircleChange,

		brushRadius,
		setBrushRadius,
		brushOpacity,
		setBrushOpacity,
		brushEraserPreview,
		setBrushEraserPreview,
		brushOptions,

		autoLiftRegionLabelAtMaxZoom,
		setAutoLiftRegionLabelAtMaxZoom,

		handleDrawComplete,
		handlePatchComplete,
		handleClearRoi,
		handleDownloadPatchJson,
		reset,
	};
}
