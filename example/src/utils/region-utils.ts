export function getRegionTopCenter(coordinates: [number, number][]): [number, number] | null {
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
