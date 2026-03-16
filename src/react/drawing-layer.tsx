import { useEffect, useMemo } from "react";
import { DrawLayer } from "./draw-layer";
import type { BrushOptions, DrawAreaTooltipOptions, DrawCoordinate, DrawResult, DrawTool, PatchDrawResult, StampOptions } from "./draw-layer-types";
import { useViewerContext } from "./viewer-context";

export interface DrawingLayerProps {
  tool?: DrawTool;
  stampOptions?: StampOptions;
  brushOptions?: BrushOptions;
  fillColor?: string;
  areaTooltip?: DrawAreaTooltipOptions;
  onComplete?: (result: DrawResult) => void;
  onPatchComplete?: (result: PatchDrawResult) => void;
  onBrushTap?: (coordinate: DrawCoordinate) => boolean;
}

export function DrawingLayer({ tool = "cursor", stampOptions, brushOptions, fillColor, areaTooltip, onComplete, onPatchComplete, onBrushTap }: DrawingLayerProps): React.ReactElement | null {
  const { source, rendererRef, setInteractionLock } = useViewerContext();

  const active = tool !== "cursor";

  useEffect(() => {
    setInteractionLock("drawing-layer", active);
    return () => setInteractionLock("drawing-layer", false);
  }, [active, setInteractionLock]);

  const viewStateSignal = useMemo(() => rendererRef.current?.getViewState(), [rendererRef]);

  if (!source) return null;

  return (
    <DrawLayer
      tool={tool}
      enabled={active}
      imageWidth={source.width}
      imageHeight={source.height}
      imageMpp={source.mpp}
      imageZoom={source.maxTierZoom}
      stampOptions={stampOptions}
      brushOptions={brushOptions}
      drawFillColor={fillColor}
      projectorRef={rendererRef}
      onBrushTap={onBrushTap}
      viewStateSignal={viewStateSignal}
      drawAreaTooltip={areaTooltip}
      onDrawComplete={onComplete}
      onPatchComplete={onPatchComplete}
    />
  );
}
