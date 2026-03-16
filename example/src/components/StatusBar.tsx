import type { PointClipMode, WebGpuCapabilities } from "../../../src";
import type { PointStatus } from "../hooks/usePointLoader";

interface StatusBarProps {
  error: string;
  imageSummary: string;
  scaleSummary: string;
  pointStatus: PointStatus;
  webGpuCaps: WebGpuCapabilities | null;
  clipMode: PointClipMode;
}

export function StatusBar({ error, imageSummary, scaleSummary, pointStatus, webGpuCaps, clipMode }: StatusBarProps) {
  return (
    <>
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
    </>
  );
}
