import type { WsiRegionCoordinates } from "./types";

export type RoiCoordinate = [number, number];
export type RoiLinearRing = RoiCoordinate[];
export type RoiPolygonRings = RoiLinearRing[];
export type RoiMultiPolygon = RoiPolygonRings[];
export type RoiGeometry = RoiLinearRing | RoiPolygonRings | RoiMultiPolygon;

export function toRoiGeometry(coords: WsiRegionCoordinates | null | undefined): RoiGeometry | null | undefined;
export function toRoiGeometry(coords: unknown): RoiGeometry | null | undefined;
export function toRoiGeometry(coords: unknown): RoiGeometry | null | undefined {
	if (coords == null) return null;
	return coords as RoiGeometry;
}

export interface PreparedRoiPolygon {
	outer: RoiLinearRing;
	holes: RoiLinearRing[];
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	area: number;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function isCoordinatePair(value: unknown): value is RoiCoordinate {
	return (
		Array.isArray(value) &&
		value.length >= 2 &&
		isFiniteNumber(value[0]) &&
		isFiniteNumber(value[1])
	);
}

function isLinearRing(value: unknown): value is RoiLinearRing {
	return Array.isArray(value) && value.length > 0 && value.every(point => isCoordinatePair(point));
}

function isPolygonRings(value: unknown): value is RoiPolygonRings {
	return Array.isArray(value) && value.length > 0 && value.every(ring => isLinearRing(ring));
}

function isMultiPolygon(value: unknown): value is RoiMultiPolygon {
	return Array.isArray(value) && value.length > 0 && value.every(polygon => isPolygonRings(polygon));
}

export function closeRoiRing(coordinates: readonly RoiCoordinate[]): RoiLinearRing {
	if (!Array.isArray(coordinates) || coordinates.length < 3) return [];
	const out: RoiLinearRing = [];
	for (const point of coordinates) {
		if (!Array.isArray(point) || point.length < 2) continue;
		const x = Number(point[0]);
		const y = Number(point[1]);
		if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
		const prev = out[out.length - 1];
		if (prev && prev[0] === x && prev[1] === y) continue;
		out.push([x, y]);
	}
	if (out.length < 3) return [];
	const first = out[0];
	const last = out[out.length - 1];
	if (first[0] !== last[0] || first[1] !== last[1]) {
		out.push([first[0], first[1]]);
	}
	return out.length >= 4 ? out : [];
}

export function polygonSignedArea(ring: RoiLinearRing): number {
	if (!Array.isArray(ring) || ring.length < 4) return 0;
	let sum = 0;
	for (let i = 0; i < ring.length - 1; i += 1) {
		const a = ring[i];
		const b = ring[i + 1];
		sum += a[0] * b[1] - b[0] * a[1];
	}
	return sum * 0.5;
}

function normalizePolygonRings(rings: RoiPolygonRings): RoiPolygonRings {
	if (!Array.isArray(rings) || rings.length === 0) return [];
	const normalized: RoiLinearRing[] = [];
	for (const ring of rings) {
		const closed = closeRoiRing(ring);
		if (closed.length >= 4) normalized.push(closed);
	}
	if (normalized.length === 0) return [];
	if (normalized.length === 1) return [normalized[0]];

	let outerIndex = 0;
	let outerArea = 0;
	for (let i = 0; i < normalized.length; i += 1) {
		const area = Math.abs(polygonSignedArea(normalized[i]));
		if (area <= outerArea) continue;
		outerArea = area;
		outerIndex = i;
	}

	const out: RoiPolygonRings = [normalized[outerIndex]];
	for (let i = 0; i < normalized.length; i += 1) {
		if (i === outerIndex) continue;
		out.push(normalized[i]);
	}
	return out;
}

export function normalizeRoiGeometry(geometry: RoiGeometry | null | undefined): RoiMultiPolygon {
	if (!geometry) return [];

	if (isLinearRing(geometry)) {
		const polygon = normalizePolygonRings([geometry]);
		return polygon.length > 0 ? [polygon] : [];
	}

	if (isPolygonRings(geometry)) {
		const polygon = normalizePolygonRings(geometry);
		return polygon.length > 0 ? [polygon] : [];
	}

	if (isMultiPolygon(geometry)) {
		const out: RoiMultiPolygon = [];
		for (const polygon of geometry) {
			const normalized = normalizePolygonRings(polygon);
			if (normalized.length > 0) out.push(normalized);
		}
		return out;
	}

	return [];
}

export function pointInRing(x: number, y: number, ring: RoiLinearRing): boolean {
	let inside = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
		const xi = ring[i][0];
		const yi = ring[i][1];
		const xj = ring[j][0];
		const yj = ring[j][1];
		const intersect =
			yi > y !== yj > y &&
			x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
		if (intersect) inside = !inside;
	}
	return inside;
}

export function pointInPolygonWithHoles(
	x: number,
	y: number,
	polygon: RoiPolygonRings,
): boolean {
	if (!Array.isArray(polygon) || polygon.length === 0) return false;
	const outer = polygon[0];
	if (!outer || outer.length < 4) return false;
	if (!pointInRing(x, y, outer)) return false;
	for (let i = 1; i < polygon.length; i += 1) {
		const hole = polygon[i];
		if (!hole || hole.length < 4) continue;
		if (pointInRing(x, y, hole)) return false;
	}
	return true;
}

export function prepareRoiPolygons(
	geometries: readonly (RoiGeometry | null | undefined)[] | null | undefined,
): PreparedRoiPolygon[] {
	const prepared: PreparedRoiPolygon[] = [];
	for (const geometry of geometries ?? []) {
		const multipolygon = normalizeRoiGeometry(geometry);
		for (const polygon of multipolygon) {
			const outer = polygon[0];
			if (!outer || outer.length < 4) continue;
			let minX = Infinity;
			let minY = Infinity;
			let maxX = -Infinity;
			let maxY = -Infinity;
			for (const [x, y] of outer) {
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
			}
			if (
				!Number.isFinite(minX) ||
				!Number.isFinite(minY) ||
				!Number.isFinite(maxX) ||
				!Number.isFinite(maxY)
			) {
				continue;
			}
			let area = Math.abs(polygonSignedArea(outer));
			for (let i = 1; i < polygon.length; i += 1) {
				area -= Math.abs(polygonSignedArea(polygon[i]));
			}
			prepared.push({
				outer,
				holes: polygon.slice(1),
				minX,
				minY,
				maxX,
				maxY,
				area: Math.max(1e-6, area),
			});
		}
	}
	return prepared;
}

export function pointInPreparedPolygon(
	x: number,
	y: number,
	polygon: PreparedRoiPolygon,
): boolean {
	if (x < polygon.minX || x > polygon.maxX || y < polygon.minY || y > polygon.maxY) {
		return false;
	}
	if (!pointInRing(x, y, polygon.outer)) return false;
	for (const hole of polygon.holes) {
		if (pointInRing(x, y, hole)) return false;
	}
	return true;
}

export function pointInAnyPreparedPolygon(
	x: number,
	y: number,
	polygons: readonly PreparedRoiPolygon[],
): boolean {
	for (const polygon of polygons) {
		if (!pointInPreparedPolygon(x, y, polygon)) continue;
		return true;
	}
	return false;
}
