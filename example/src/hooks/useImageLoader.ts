import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeImageInfo, type WsiImageSource } from "../../../src";
import { DEFAULT_INFO_URL, S3_BASE_URL } from "../utils/constants";
import { createDemoSource } from "../utils/demo-source";

export interface ImageLoaderState {
	loading: boolean;
	error: string;
	source: WsiImageSource | null;
	pointZstUrl: string;
	fitNonce: number;
}

export interface ImageLoaderActions {
	loadImageInfo: (url: string) => void;
	loadDemo: () => void;
	setFitNonce: React.Dispatch<React.SetStateAction<number>>;
}

export function useImageLoader(
	bearerToken: string,
	onReset: () => void,
): ImageLoaderState & ImageLoaderActions {
	const initialLoadDoneRef = useRef(false);

	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [source, setSource] = useState<WsiImageSource | null>(null);
	const [pointZstUrl, setPointZstUrl] = useState("");
	const [fitNonce, setFitNonce] = useState(0);

	const loadDemo = useCallback((): void => {
		setLoading(true);
		setError("");
		const demoSource = createDemoSource();
		setSource(demoSource);
		setPointZstUrl("/sample/10000000cells.zst");
		setFitNonce(prev => prev + 1);
		onReset();
		setLoading(false);
	}, [onReset]);

	const loadImageInfo = useCallback(
		(url: string): void => {
			const trimmedUrl = String(url || "").trim();
			if (!trimmedUrl) {
				setError("image info URL이 비어 있습니다.");
				setSource(null);
				return;
			}

			setLoading(true);
			setError("");

			const headers: HeadersInit | undefined = bearerToken ? { Authorization: bearerToken } : undefined;

			fetch(trimmedUrl, { headers })
				.then(response => {
					if (!response.ok) {
						return Promise.reject(new Error(`이미지 정보 요청 실패: HTTP ${response.status}`));
					}
					return response.json() as Promise<Record<string, unknown>>;
				})
				.then(raw => {
					const nextSource = normalizeImageInfo(raw, `${S3_BASE_URL}/ims`);
					setSource(nextSource);
					setPointZstUrl(raw?.mvtPath ? String(raw.mvtPath) : "");
					setFitNonce(prev => prev + 1);
					onReset();
				})
				.catch((err: Error) => {
					setSource(null);
					setPointZstUrl("");
					setError(err.message || "알 수 없는 오류");
					onReset();
				})
				.finally(() => {
					setLoading(false);
				});
		},
		[bearerToken, onReset],
	);

	useEffect(() => {
		if (initialLoadDoneRef.current) return;
		initialLoadDoneRef.current = true;
		if (DEFAULT_INFO_URL) {
			loadImageInfo(DEFAULT_INFO_URL);
		} else {
			loadDemo();
		}
	}, [loadImageInfo, loadDemo]);

	return { loading, error, source, pointZstUrl, fitNonce, loadImageInfo, loadDemo, setFitNonce };
}
