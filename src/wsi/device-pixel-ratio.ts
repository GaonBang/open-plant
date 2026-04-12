function readDevicePixelRatio(): number {
  if (typeof window === "undefined") return 1;
  const raw = window.devicePixelRatio || 1;
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

export interface DevicePixelRatioChangeEvent {
  previousDpr: number;
  nextDpr: number;
  trigger: "match-media" | "window-resize" | "visual-viewport-resize";
}

export function observeDevicePixelRatioChanges(onChange: (event: DevicePixelRatioChangeEvent) => void): () => void {
  if (typeof window === "undefined") {
    return () => {
      // noop
    };
  }

  let active = true;
  let lastDpr = readDevicePixelRatio();
  let mediaQuery: MediaQueryList | null = null;
  let removeMediaQueryListener: (() => void) | null = null;

  const unbindMediaQuery = () => {
    removeMediaQueryListener?.();
    removeMediaQueryListener = null;
    mediaQuery = null;
  };

  const bindMediaQuery = () => {
    unbindMediaQuery();
    mediaQuery = window.matchMedia(`(resolution: ${lastDpr}dppx)`);
    const handleMediaQueryChange = () => {
      emitIfChanged("match-media");
    };
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleMediaQueryChange);
      removeMediaQueryListener = () => mediaQuery?.removeEventListener("change", handleMediaQueryChange);
      return;
    }
    mediaQuery.addListener(handleMediaQueryChange);
    removeMediaQueryListener = () => mediaQuery?.removeListener(handleMediaQueryChange);
  };

  const emitIfChanged = (trigger: DevicePixelRatioChangeEvent["trigger"]) => {
    if (!active) return;
    const nextDpr = readDevicePixelRatio();
    if (Math.abs(nextDpr - lastDpr) <= 1e-4) return;
    const previousDpr = lastDpr;
    lastDpr = nextDpr;
    bindMediaQuery();
    onChange({ previousDpr, nextDpr, trigger });
  };

  const handleWindowResize = () => emitIfChanged("window-resize");
  const handleVisualViewportResize = () => emitIfChanged("visual-viewport-resize");

  bindMediaQuery();
  window.addEventListener("resize", handleWindowResize);
  window.visualViewport?.addEventListener("resize", handleVisualViewportResize);

  return () => {
    active = false;
    unbindMediaQuery();
    window.removeEventListener("resize", handleWindowResize);
    window.visualViewport?.removeEventListener("resize", handleVisualViewportResize);
  };
}
