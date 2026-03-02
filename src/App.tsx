import { useMemo, useState } from "react";
import type { TileDefinition } from "./core/types";
import { TileViewerCanvas } from "./react/tile-viewer-canvas";
import { clamp } from "./wsi/utils";
import "./app.css";

const TILE_SIZE = 256;
const GRID_SIZE = 8;
const IMAGE_WIDTH = TILE_SIZE * GRID_SIZE;
const IMAGE_HEIGHT = TILE_SIZE * GRID_SIZE;

export default function App(): React.ReactElement {
	const [zoom, setZoom] = useState(0.5);
	const [offsetX, setOffsetX] = useState(0);
	const [offsetY, setOffsetY] = useState(0);

	const tiles = useMemo<TileDefinition[]>(() => {
		const nextTiles: TileDefinition[] = [];

		for (let y = 0; y < GRID_SIZE; y += 1) {
			for (let x = 0; x < GRID_SIZE; x += 1) {
				nextTiles.push({
					id: `tile-${x}-${y}`,
					url: "/mock-tile.svg",
					bounds: [
						x * TILE_SIZE,
						y * TILE_SIZE,
						(x + 1) * TILE_SIZE,
						(y + 1) * TILE_SIZE,
					],
				});
			}
		}

		return nextTiles;
	}, []);

	const panBy = (dx: number, dy: number): void => {
		setOffsetX((prev) => prev + dx);
		setOffsetY((prev) => prev + dy);
	};

	const zoomBy = (factor: number): void => {
		setZoom((prev) => clamp(prev * factor, 0.1, 8));
	};

	return (
		<div className="app">
			<div className="toolbar">
				<button type="button" onClick={() => zoomBy(1.25)}>
					Zoom In
				</button>
				<button type="button" onClick={() => zoomBy(0.8)}>
					Zoom Out
				</button>
				<button type="button" onClick={() => panBy(-100, 0)}>
					Left
				</button>
				<button type="button" onClick={() => panBy(100, 0)}>
					Right
				</button>
				<button type="button" onClick={() => panBy(0, -100)}>
					Up
				</button>
				<button type="button" onClick={() => panBy(0, 100)}>
					Down
				</button>
				<div className="stats">
					zoom: {zoom.toFixed(2)} | offset: ({Math.round(offsetX)},{" "}
					{Math.round(offsetY)})
				</div>
			</div>
			<div className="viewer-frame">
				<TileViewerCanvas
					imageWidth={IMAGE_WIDTH}
					imageHeight={IMAGE_HEIGHT}
					tiles={tiles}
					viewState={{ zoom, offsetX, offsetY }}
				/>
			</div>
		</div>
	);
}
