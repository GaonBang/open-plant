import type { WsiImageSource, WsiTerm } from "./types";

export interface RawImsInfo {
  width?: number | null;
  height?: number | null;
  tileSize?: number | null;
  zoom?: number | null;
  path?: string | null;
  mpp?: number | null;
}

export interface RawWsiTerm {
  termId?: string | null;
  termName?: string | null;
  termColor?: string | null;
}

export interface RawImagePayload {
  _id?: string | null;
  name?: string | null;
  width?: number | null;
  height?: number | null;
  tileSize?: number | null;
  zoom?: number | null;
  path?: string | null;
  mpp?: number | null;
  imsInfo?: RawImsInfo | null;
  terms?: RawWsiTerm[] | null;
}

function trimTrailingSlash(value: string): string {
  return String(value ?? "").replace(/\/+$/, "");
}

function ensureLeadingSlash(value: string): string {
  const raw = String(value ?? "");
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function joinImsTileRoot(tileBaseUrl: string): string {
  const base = trimTrailingSlash(tileBaseUrl);
  if (!base) return "";

  // Explicit TileGroup path already provided.
  if (/\/TileGroup\d+$/i.test(base)) return base;

  let parsed: URL | null = null;
  try {
    parsed = new URL(base);
  } catch {
    parsed = null;
  }

  if (parsed) {
    const origin = `${parsed.protocol}//${parsed.host}`;
    const path = trimTrailingSlash(parsed.pathname || "");

    // If caller passes /ims, keep /ims and append image path directly:
    // /ims + /tiles/<hash> + /tier/y_x.webp
    if (/\/ims$/i.test(path)) return `${origin}${path}`;
    if (/\/tiles$/i.test(path)) return `${origin}${path}`;
    return `${origin}${path}/tiles`;
  }

  // Relative path mode
  if (/\/ims$/i.test(base)) return `/ims`;
  if (/\/tiles$/i.test(base)) return `${base}`;
  return `${base}/tiles`;
}

export function normalizeImageInfo(raw: RawImagePayload, tileBaseUrl: string): WsiImageSource {
  const ims = raw?.imsInfo ?? {};
  const isIms = !!raw?.imsInfo;

  const width = Number(ims.width ?? raw?.width ?? 0);
  const height = Number(ims.height ?? raw?.height ?? 0);
  const tileSize = Number(ims.tileSize ?? raw?.tileSize ?? 0);
  const maxTierZoom = Number(ims.zoom ?? raw?.zoom ?? 0);
  const tilePath = String(ims.path ?? raw?.path ?? "");
  const mpp = Number(ims.mpp ?? raw?.mpp ?? 0);

  if (!width || !height || !tileSize || !tilePath) {
    throw new Error("Incomplete image metadata: width/height/tileSize/path required");
  }

  const terms: WsiTerm[] = Array.isArray(raw?.terms)
    ? raw.terms.map((term: RawWsiTerm) => ({
        termId: String(term?.termId ?? ""),
        termName: String(term?.termName ?? ""),
        termColor: String(term?.termColor ?? ""),
      }))
    : [];

  const normalizedPath = ensureLeadingSlash(tilePath);
  const imsTileRoot = joinImsTileRoot(tileBaseUrl);
  const tileUrlBuilder = isIms ? (tier: number, x: number, y: number): string => `${imsTileRoot}${normalizedPath}/${tier}/${y}_${x}.webp` : undefined;

  return {
    id: raw?._id || "unknown",
    name: raw?.name || "unknown",
    width,
    height,
    mpp: Number.isFinite(mpp) && mpp > 0 ? mpp : undefined,
    tileSize,
    maxTierZoom: Number.isFinite(maxTierZoom) ? Math.max(0, Math.floor(maxTierZoom)) : 0,
    tilePath,
    tileBaseUrl,
    terms,
    tileUrlBuilder,
  };
}

export function toTileUrl(source: Pick<WsiImageSource, "tilePath" | "tileBaseUrl" | "tileUrlBuilder">, tier: number, x: number, y: number): string {
  if (source.tileUrlBuilder) {
    return source.tileUrlBuilder(tier, x, y);
  }
  const normalizedPath = ensureLeadingSlash(source.tilePath);
  return `${source.tileBaseUrl}${normalizedPath}/${tier}/${y}_${x}.webp`;
}
