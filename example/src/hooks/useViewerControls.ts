import { useCallback, useMemo, useState } from "react";
import {
	calcScaleLength,
	clamp,
	isSameViewState,
	type PointClipMode,
	type PointClipStatsEvent,
	type WsiImageSource,
	type WsiViewState,
} from "../../../src";

export function useViewerControls(source: WsiImageSource | null) {
	const [viewState, setViewState] = useState<Partial<WsiViewState> | null>(null);
	const [ctrlDragRotate, setCtrlDragRotate] = useState(true);
	const [rotationResetNonce, setRotationResetNonce] = useState(0);
	const [showOverviewMap, setShowOverviewMap] = useState(true);
	const [enableZoomSnaps, setEnableZoomSnaps] = useState(true);
	const [clipMode, setClipMode] = useState<PointClipMode>("worker");
	const [clipStats, setClipStats] = useState<PointClipStatsEvent | null>(null);

	const maxZoom = source ? Math.max(1, Math.min(32, source.maxTierZoom + 4)) : 1;

	const zoomSnaps = useMemo(() => {
		if (!enableZoomSnaps || !source?.mpp || source.mpp <= 0) return undefined;
		const scanMag = 10 / source.mpp;
		const STANDARD_STEPS = [1.25, 2.5, 5, 10, 20, 40, 80, 100];
		return STANDARD_STEPS.filter(m => m <= scanMag);
	}, [enableZoomSnaps, source?.mpp]);

	const scaleSummary = useMemo((): string => {
		if (!source) return "-";
		const zoom = Math.max(1e-6, viewState?.zoom || 1);
		const currentZoom = source.maxTierZoom + Math.log2(zoom);
		return calcScaleLength(source.mpp || 0, source.maxTierZoom, currentZoom);
	}, [source, viewState?.zoom]);

	const handleViewStateChange = useCallback((next: WsiViewState) => {
		setViewState(prev => (isSameViewState(prev, next) ? prev : next));
	}, []);

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

	return {
		viewState,
		setViewState,
		ctrlDragRotate,
		setCtrlDragRotate,
		rotationResetNonce,
		setRotationResetNonce,
		showOverviewMap,
		setShowOverviewMap,
		enableZoomSnaps,
		setEnableZoomSnaps,
		clipMode,
		setClipMode,
		clipStats,
		setClipStats,
		maxZoom,
		zoomSnaps,
		scaleSummary,
		handleViewStateChange,
		handleZoomIn,
		handleZoomOut,
	};
}
