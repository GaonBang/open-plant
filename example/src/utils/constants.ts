export const DEFAULT_INFO_URL = (import.meta.env.VITE_IMAGE_INFO_URL as string | undefined) ?? "";
export const S3_BASE_URL = (import.meta.env.VITE_S3_BASE_URL as string | undefined) ?? "";
export const DEMO_ZST_URL = "/sample/10000000cells.zst";

export const DEFAULT_POINT_SIZE_STOPS = {
	1: 1,
	2: 2,
	5: 5,
	6: 5,
	8: 8,
} as const;
