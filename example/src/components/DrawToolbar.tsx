import type { ChangeEvent } from "react";
import type { DrawTool } from "../../../src";

interface DrawToolbarProps {
	disabled: boolean;
	drawTool: DrawTool;
	setDrawTool: (tool: DrawTool) => void;

	stampRectangleAreaMm2: number;
	onStampRectChange: (e: ChangeEvent<HTMLInputElement>) => void;
	stampCircleAreaMm2: number;
	onStampCircleChange: (e: ChangeEvent<HTMLInputElement>) => void;
	stampRectanglePixelSize: number;
	onStampRectPixelSizeChange: (value: number) => void;

	brushRadius: number;
	onBrushRadiusChange: (value: number) => void;
	brushOpacity: number;
	onBrushOpacityChange: (value: number) => void;
	brushEraserPreview: boolean;
	onToggleBrushEraserPreview: () => void;

	autoLiftRegionLabelAtMaxZoom: boolean;
	onToggleAutoLift: () => void;
	enableZoomSnaps: boolean;
	onToggleZoomSnaps: () => void;
	zoomSnaps: number[] | undefined;

	labelInput: string;
	setLabelInput: (v: string) => void;
	canClearRegions: boolean;
	onClearRoi: () => void;
	canExportPatch: boolean;
	onExportPatch: () => void;
}

export function DrawToolbar({
	disabled,
	drawTool,
	setDrawTool,
	stampRectangleAreaMm2,
	onStampRectChange,
	stampCircleAreaMm2,
	onStampCircleChange,
	stampRectanglePixelSize,
	onStampRectPixelSizeChange,
	brushRadius,
	onBrushRadiusChange,
	brushOpacity,
	onBrushOpacityChange,
	brushEraserPreview,
	onToggleBrushEraserPreview,
	autoLiftRegionLabelAtMaxZoom,
	onToggleAutoLift,
	enableZoomSnaps,
	onToggleZoomSnaps,
	zoomSnaps,
	labelInput,
	setLabelInput,
	canClearRegions,
	onClearRoi,
	canExportPatch,
	onExportPatch,
}: DrawToolbarProps) {
	return (
		<div className="tool-group">
			<button type="button" className={drawTool === "cursor" ? "active" : ""} disabled={disabled} onClick={() => setDrawTool("cursor")}>
				Cursor
			</button>
			<button type="button" className={drawTool === "freehand" ? "active" : ""} disabled={disabled} onClick={() => setDrawTool("freehand")}>
				Freehand
			</button>
			<button type="button" className={drawTool === "rectangle" ? "active" : ""} disabled={disabled} onClick={() => setDrawTool("rectangle")}>
				Rectangle
			</button>
			<button type="button" className={drawTool === "circular" ? "active" : ""} disabled={disabled} onClick={() => setDrawTool("circular")}>
				Circular
			</button>
			<button type="button" className={drawTool === "brush" ? "active" : ""} disabled={disabled} onClick={() => setDrawTool("brush")}>
				Brush
			</button>
			<button type="button" className={drawTool === "stamp-rectangle" ? "active" : ""} disabled={disabled} onClick={() => setDrawTool("stamp-rectangle")}>
				Stamp □
			</button>
			<button type="button" className={drawTool === "stamp-circle" ? "active" : ""} disabled={disabled} onClick={() => setDrawTool("stamp-circle")}>
				Stamp ○
			</button>
			<button type="button" className={drawTool === "stamp-rectangle-4096px" ? "active" : ""} disabled={disabled} onClick={() => setDrawTool("stamp-rectangle-4096px")}>
				Stamp 4096px
			</button>
			<input
				className="stamp-input"
				type="number"
				min={0.001}
				step={0.1}
				value={stampRectangleAreaMm2}
				onChange={onStampRectChange}
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
				onChange={onStampCircleChange}
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
					if (Number.isFinite(next) && next > 0) onStampRectPixelSizeChange(Math.round(next));
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
					if (Number.isFinite(next) && next > 0) onBrushRadiusChange(Math.round(next));
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
					onBrushOpacityChange(Math.max(0, Math.min(1, next)));
				}}
				aria-label="Brush opacity"
				title="Brush preview opacity"
			/>
			<span className="stamp-unit">Brush α</span>
			<button type="button" className={brushEraserPreview ? "active" : ""} onClick={onToggleBrushEraserPreview}>
				{brushEraserPreview ? "Preview: Eraser" : "Preview: Brush"}
			</button>
			<button
				type="button"
				className={drawTool === "stamp-circle" && Math.abs(stampCircleAreaMm2 - 0.2) < 1e-9 ? "active" : ""}
				disabled={disabled}
				onClick={() => {
					onStampCircleChange({ target: { value: "0.2" } } as ChangeEvent<HTMLInputElement>);
					setDrawTool("stamp-circle");
				}}
			>
				HPF 0.2mm²
			</button>
			<button type="button" className={autoLiftRegionLabelAtMaxZoom ? "active" : ""} disabled={disabled} onClick={onToggleAutoLift}>
				Label Auto Lift
			</button>
			<button type="button" className={enableZoomSnaps ? "active" : ""} disabled={disabled} onClick={onToggleZoomSnaps}>
				Zoom Snap {enableZoomSnaps && zoomSnaps ? `(${zoomSnaps[0]}→${zoomSnaps[zoomSnaps.length - 1]}x)` : "Off"}
			</button>
			<input className="label-input" type="text" value={labelInput} onChange={e => setLabelInput(e.target.value)} placeholder="Region label (optional)" />
			<button type="button" disabled={disabled || !canClearRegions} onClick={onClearRoi}>
				Clear Regions
			</button>
			<button type="button" disabled={disabled || !canExportPatch} onClick={onExportPatch}>
				Export Patch JSON
			</button>
		</div>
	);
}
