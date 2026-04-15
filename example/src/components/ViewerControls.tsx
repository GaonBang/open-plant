import type { PointClipMode } from "../../../src";

interface ViewerControlsProps {
	disabled: boolean;
	ctrlDragRotate: boolean;
	showOverviewMap: boolean;
	showDebugGrid: boolean;
	enableBlacklist: boolean;
	onFit: () => void;
	onResetRotation: () => void;
	onToggleCtrlDragRotate: () => void;
	onToggleOverviewMap: () => void;
	onToggleDebugGrid: () => void;
	onToggleBlacklist: () => void;
	onZoomIn: () => void;
	onZoomOut: () => void;
	clipMode: PointClipMode;
	onClipModeChange: (mode: PointClipMode) => void;
}

export function ViewerControls({
	disabled,
	ctrlDragRotate,
	showOverviewMap,
	showDebugGrid,
	enableBlacklist,
	onFit,
	onResetRotation,
	onToggleCtrlDragRotate,
	onToggleOverviewMap,
	onToggleDebugGrid,
	onToggleBlacklist,
	onZoomIn,
	onZoomOut,
	clipMode,
	onClipModeChange,
}: ViewerControlsProps) {
	return (
		<>
			<button type="button" disabled={disabled} onClick={onFit}>
				Fit
			</button>
			<button type="button" disabled={disabled} onClick={onResetRotation}>
				Reset Rotate
			</button>
			<button type="button" className={ctrlDragRotate ? "active" : ""} disabled={disabled} onClick={onToggleCtrlDragRotate}>
				Ctrl+Drag Rotate
			</button>
			<button type="button" disabled={disabled} className={showOverviewMap ? "active" : ""} onClick={onToggleOverviewMap}>
				Overview
			</button>
			<button type="button" disabled={disabled} className={showDebugGrid ? "active" : ""} onClick={onToggleDebugGrid}>
				Tile Grid
			</button>
			<button type="button" disabled={disabled} className={enableBlacklist ? "active" : ""} onClick={onToggleBlacklist}>
				Blacklist
			</button>
			<button type="button" disabled={disabled} onClick={onZoomIn}>
				Zoom In
			</button>
			<button type="button" disabled={disabled} onClick={onZoomOut}>
				Zoom Out
			</button>

			<button type="button" className={clipMode === "worker" ? "active" : ""} onClick={() => onClipModeChange("worker")}>
				Clip Worker
			</button>
			<button type="button" className={clipMode === "hybrid-webgpu" ? "active" : ""} onClick={() => onClipModeChange("hybrid-webgpu")}>
				Clip Hybrid GPU
			</button>
			<button type="button" className={clipMode === "sync" ? "active" : ""} onClick={() => onClipModeChange("sync")}>
				Clip Sync
			</button>
		</>
	);
}
