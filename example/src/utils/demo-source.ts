import type { WsiImageSource } from "../../../src";

const _cache = new Map<string, string>();
let _canvas: HTMLCanvasElement | null = null;
let _ctx: CanvasRenderingContext2D | null = null;

export function buildDemoTileUrl(tier: number, x: number, y: number): string {
	const key = `${tier}/${x}/${y}`;
	const cached = _cache.get(key);
	if (cached) return cached;

	if (!_canvas) {
		_canvas = document.createElement("canvas");
		_canvas.width = 256;
		_canvas.height = 256;
		_ctx = _canvas.getContext("2d")!;
	}
	const ctx = _ctx!;

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

	const url = _canvas.toDataURL("image/png");
	_cache.set(key, url);
	return url;
}

export function createDemoSource(): WsiImageSource {
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
