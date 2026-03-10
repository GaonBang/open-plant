import polygonClipping from "polygon-clipping"
import { closeRoiRing as closeRing, polygonSignedArea } from "./roi-geometry"
import { clamp } from "./utils"

export type BrushStrokeCoordinate = [number, number]
export type BrushStrokeBounds = [number, number, number, number]

export interface BrushStrokePolygonOptions {
	radius: number
	clipBounds?: BrushStrokeBounds
	minRasterStep?: number
	maxRasterPixels?: number
	maxRasterSize?: number
	simplifyTolerance?: number
	circleSides?: number
	smoothingPasses?: number
}

const ROUND_PRECISIONS = [6, 4, 2] as const
const DEFAULT_CIRCLE_SIDES = 64
const DEFAULT_SIMPLIFY_FACTOR = 0.04
const DEFAULT_SMOOTHING_PASSES = 1
const MAX_SMOOTHING_PASSES = 4
const MIN_RADIUS = 1e-6
const MIN_TUNNEL_LENGTH_FACTOR = 0.1

function sanitizePath(points: BrushStrokeCoordinate[]): BrushStrokeCoordinate[] {
	if (!Array.isArray(points) || points.length === 0) return []
	const out: BrushStrokeCoordinate[] = []
	for (const point of points) {
		if (!Array.isArray(point) || point.length < 2) continue
		const x = Number(point[0])
		const y = Number(point[1])
		if (!Number.isFinite(x) || !Number.isFinite(y)) continue
		const prev = out[out.length - 1]
		if (prev && Math.abs(prev[0] - x) < 1e-9 && Math.abs(prev[1] - y) < 1e-9) {
			continue
		}
		out.push([x, y])
	}
	return out
}

function createCircleRing(center: BrushStrokeCoordinate, radius: number, sides: number): BrushStrokeCoordinate[] {
	if (radius <= MIN_RADIUS || sides < 8) return []
	const ring: BrushStrokeCoordinate[] = []
	for (let i = 0; i <= sides; i += 1) {
		const t = (i / sides) * Math.PI * 2
		ring.push([center[0] + Math.cos(t) * radius, center[1] + Math.sin(t) * radius])
	}
	return closeRing(ring)
}

function createTunnelRing(
	start: BrushStrokeCoordinate,
	end: BrushStrokeCoordinate,
	radius: number,
	minLength: number,
): BrushStrokeCoordinate[] {
	const dx = end[0] - start[0]
	const dy = end[1] - start[1]
	const length = Math.sqrt(dx * dx + dy * dy)
	if (!Number.isFinite(length) || length <= minLength) return []

	const ux = dx / length
	const uy = dy / length
	const perpX = -uy
	const perpY = ux
	const r = Math.max(MIN_RADIUS, radius)
	return closeRing([
		[start[0] + perpX * r, start[1] + perpY * r],
		[end[0] + perpX * r, end[1] + perpY * r],
		[end[0] - perpX * r, end[1] - perpY * r],
		[start[0] - perpX * r, start[1] - perpY * r],
	])
}

function createBoundsFallback(points: BrushStrokeCoordinate[], radius: number): BrushStrokeCoordinate[] {
	if (!points.length) return []
	let minX = Infinity
	let minY = Infinity
	let maxX = -Infinity
	let maxY = -Infinity
	for (const [x, y] of points) {
		if (x < minX) minX = x
		if (x > maxX) maxX = x
		if (y < minY) minY = y
		if (y > maxY) maxY = y
	}
	if (!Number.isFinite(minX) || !Number.isFinite(minY)) return []
	const pad = Math.max(radius, 1)
	return closeRing([
		[minX - pad, minY - pad],
		[maxX + pad, minY - pad],
		[maxX + pad, maxY + pad],
		[minX - pad, maxY + pad],
	])
}

function clampRingToBounds(
	ring: BrushStrokeCoordinate[],
	bounds: BrushStrokeBounds | undefined,
): BrushStrokeCoordinate[] {
	if (!bounds) return closeRing(ring)
	return closeRing(
		ring.map(([x, y]) => [
			clamp(x, bounds[0], bounds[2]),
			clamp(y, bounds[1], bounds[3]),
		] as BrushStrokeCoordinate),
	)
}

function round(value: number, precision: number): number {
	if (!Number.isFinite(value)) return value
	return Number(value.toFixed(precision))
}

function sanitizeRing(ring: polygonClipping.Ring, precision: number): polygonClipping.Ring {
	if (!Array.isArray(ring) || ring.length === 0) return []
	const sanitized: polygonClipping.Ring = []
	for (const point of ring) {
		if (!Array.isArray(point) || point.length < 2) continue
		const x = round(Number(point[0]), precision)
		const y = round(Number(point[1]), precision)
		if (!Number.isFinite(x) || !Number.isFinite(y)) continue
		const prev = sanitized[sanitized.length - 1]
		if (!prev || prev[0] !== x || prev[1] !== y) {
			sanitized.push([x, y])
		}
	}

	if (sanitized.length >= 2) {
		const first = sanitized[0]
		const last = sanitized[sanitized.length - 1]
		if (!first || !last) return []
		if (first[0] !== last[0] || first[1] !== last[1]) {
			sanitized.push([first[0], first[1]])
		}
	}

	return sanitized.length >= 4 ? sanitized : []
}

function sanitizePolygon(polygon: polygonClipping.Polygon, precision: number): polygonClipping.Polygon {
	if (!Array.isArray(polygon) || polygon.length === 0) return []
	const rings = polygon
		.map(ring => sanitizeRing(ring, precision))
		.filter(ring => ring.length >= 4)
	return rings.length > 0 ? rings : []
}

function tryUnionWithPrecision(
	polygons: polygonClipping.Polygon[],
	precision: number,
): polygonClipping.MultiPolygon | null {
	const sanitized = polygons
		.map(polygon => sanitizePolygon(polygon, precision))
		.filter(polygon => polygon.length > 0)
	if (sanitized.length === 0) return null

	let current: polygonClipping.MultiPolygon = [sanitized[0]]
	try {
		for (let i = 1; i < sanitized.length; i += 1) {
			current = polygonClipping.union(current, [sanitized[i]])
			if (!Array.isArray(current) || current.length === 0) {
				return null
			}
		}
	} catch (error) {
		/* biome-ignore lint/suspicious/noConsole: fallback logging for polygon union */
		console.error("buildBrushStrokePolygon union failed", precision, error)
		return null
	}

	return current.length > 0 ? current : null
}

function unionPolygons(polygons: polygonClipping.Polygon[]): polygonClipping.MultiPolygon | null {
	if (polygons.length === 0) return null
	for (const precision of ROUND_PRECISIONS) {
		const result = tryUnionWithPrecision(polygons, precision)
		if (result) return result
	}
	return null
}

function toBrushRing(ring: polygonClipping.Ring): BrushStrokeCoordinate[] {
	if (!Array.isArray(ring) || ring.length === 0) return []
	const out: BrushStrokeCoordinate[] = []
	for (const point of ring) {
		if (!Array.isArray(point) || point.length < 2) continue
		const x = Number(point[0])
		const y = Number(point[1])
		if (!Number.isFinite(x) || !Number.isFinite(y)) continue
		out.push([x, y])
	}
	return closeRing(out)
}

function selectLargestOuterRing(multiPolygon: polygonClipping.MultiPolygon): BrushStrokeCoordinate[] {
	let best: BrushStrokeCoordinate[] = []
	let bestArea = 0
	for (const polygon of multiPolygon) {
		if (!Array.isArray(polygon) || polygon.length === 0) continue
		const outer = toBrushRing(polygon[0] ?? [])
		if (outer.length < 4) continue
		const area = Math.abs(polygonSignedArea(outer))
		if (area <= bestArea) continue
		bestArea = area
		best = outer
	}
	return best
}

function removeCollinearVertices(
	ring: BrushStrokeCoordinate[],
	epsilon = 1e-9,
): BrushStrokeCoordinate[] {
	const closed = closeRing(ring)
	if (closed.length < 5) return closed
	const out: BrushStrokeCoordinate[] = [closed[0]]
	for (let i = 1; i < closed.length - 1; i += 1) {
		const prev = out[out.length - 1]
		const curr = closed[i]
		const next = closed[i + 1]
		const cross =
			(curr[0] - prev[0]) * (next[1] - curr[1]) -
			(curr[1] - prev[1]) * (next[0] - curr[0])
		if (Math.abs(cross) <= epsilon) continue
		out.push(curr)
	}
	out.push(out[0])
	return closeRing(out)
}

function pointLineDistanceSquared(
	p: BrushStrokeCoordinate,
	a: BrushStrokeCoordinate,
	b: BrushStrokeCoordinate,
): number {
	const abx = b[0] - a[0]
	const aby = b[1] - a[1]
	const len2 = abx * abx + aby * aby
	if (len2 <= 1e-12) {
		const dx = p[0] - a[0]
		const dy = p[1] - a[1]
		return dx * dx + dy * dy
	}
	const t = clamp(
		((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / len2,
		0,
		1,
	)
	const x = a[0] + abx * t
	const y = a[1] + aby * t
	const dx = p[0] - x
	const dy = p[1] - y
	return dx * dx + dy * dy
}

function simplifyRdp(points: BrushStrokeCoordinate[], tolerance: number): BrushStrokeCoordinate[] {
	if (points.length <= 2 || tolerance <= 0) return points.slice()

	const keep = new Uint8Array(points.length)
	keep[0] = 1
	keep[points.length - 1] = 1
	const tolerance2 = tolerance * tolerance
	const stack: Array<[number, number]> = [[0, points.length - 1]]

	while (stack.length > 0) {
		const next = stack.pop()
		if (!next) break
		const [start, end] = next
		if (end - start <= 1) continue

		let maxDist2 = 0
		let split = -1
		for (let i = start + 1; i < end; i += 1) {
			const dist2 = pointLineDistanceSquared(points[i], points[start], points[end])
			if (dist2 > maxDist2) {
				maxDist2 = dist2
				split = i
			}
		}

		if (split >= 0 && maxDist2 > tolerance2) {
			keep[split] = 1
			stack.push([start, split], [split, end])
		}
	}

	const out: BrushStrokeCoordinate[] = []
	for (let i = 0; i < points.length; i += 1) {
		if (keep[i]) out.push(points[i])
	}
	return out
}

function simplifyClosedRing(ring: BrushStrokeCoordinate[], tolerance: number): BrushStrokeCoordinate[] {
	const closed = closeRing(ring)
	if (closed.length < 5 || tolerance <= 0) return closed
	const open = closed.slice(0, -1)
	const simplified = simplifyRdp(open, tolerance)
	if (simplified.length < 3) return closed
	return closeRing(simplified)
}

function smoothClosedRingChaikin(
	ring: BrushStrokeCoordinate[],
	iterations: number,
): BrushStrokeCoordinate[] {
	let out = closeRing(ring)
	if (iterations <= 0 || out.length < 5) return out

	for (let pass = 0; pass < iterations; pass += 1) {
		const open = out.slice(0, -1)
		if (open.length < 3) break
		const next: BrushStrokeCoordinate[] = []
		for (let i = 0; i < open.length; i += 1) {
			const a = open[i]
			const b = open[(i + 1) % open.length]
			next.push(
				[a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25],
				[a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75],
			)
		}
		out = closeRing(next)
	}
	return out
}

export function buildBrushStrokePolygon(
	path: BrushStrokeCoordinate[],
	options: BrushStrokePolygonOptions,
): BrushStrokeCoordinate[] {
	const points = sanitizePath(path)
	const radius = Math.max(MIN_RADIUS, Number(options.radius) || 0)
	if (points.length === 0 || !Number.isFinite(radius)) return []

	const circleSides = Math.max(12, Math.floor(options.circleSides || DEFAULT_CIRCLE_SIDES))
	if (points.length === 1) {
		return clampRingToBounds(createCircleRing(points[0], radius, circleSides), options.clipBounds)
	}

	const polygons: polygonClipping.Polygon[] = []
	const minTunnelLength = Math.max(MIN_RADIUS, radius * MIN_TUNNEL_LENGTH_FACTOR)
	for (let i = 0; i < points.length; i += 1) {
		const center = points[i]
		const circle = createCircleRing(center, radius, circleSides)
		if (circle.length >= 4) {
			polygons.push([circle])
		}
		if (i === 0) continue
		const tunnel = createTunnelRing(points[i - 1], center, radius, minTunnelLength)
		if (tunnel.length >= 4) {
			polygons.push([tunnel])
		}
	}

	const unioned = unionPolygons(polygons)
	const unionRing = unioned ? selectLargestOuterRing(unioned) : []
	if (!unionRing.length) {
		return clampRingToBounds(createBoundsFallback(points, radius), options.clipBounds)
	}

	const tolerance =
		typeof options.simplifyTolerance === "number" && Number.isFinite(options.simplifyTolerance)
			? Math.max(0, options.simplifyTolerance)
			: Math.max(0.25, radius * DEFAULT_SIMPLIFY_FACTOR)
	const smoothingPasses =
		typeof options.smoothingPasses === "number" && Number.isFinite(options.smoothingPasses)
			? Math.round(clamp(options.smoothingPasses, 0, MAX_SMOOTHING_PASSES))
			: DEFAULT_SMOOTHING_PASSES

	const optimized = simplifyClosedRing(
		smoothClosedRingChaikin(
			removeCollinearVertices(unionRing, 1e-9),
			smoothingPasses,
		),
		tolerance,
	)

	if (optimized.length < 4) {
		return clampRingToBounds(createBoundsFallback(points, radius), options.clipBounds)
	}
	return clampRingToBounds(optimized, options.clipBounds)
}
