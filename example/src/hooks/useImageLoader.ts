import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeImageInfo, normalizeImageTerms, type WsiImageSource, type WsiTerm } from "../../../src";
import { DEFAULT_INFO_URL, S3_BASE_URL } from "../utils/constants";
import { createDemoSource, createDemoTerms } from "../utils/demo-source";

export interface ImageLoaderState {
	loading: boolean;
	error: string;
	source: WsiImageSource | null;
	terms: WsiTerm[];
	pointZstUrl: string;
	fitNonce: number;
}

export interface ImageLoaderActions {
	loadImageInfo: (url: string) => void;
	loadDemo: () => void;
	updateTermColor: (termId: string, color: string) => void;
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
	const [terms, setTerms] = useState<WsiTerm[]>([]);
	const [pointZstUrl, setPointZstUrl] = useState("");
	const [fitNonce, setFitNonce] = useState(0);

	const loadDemo = useCallback((): void => {
		setLoading(true);
		setError("");
		const demoSource = createDemoSource();
		const demoTerms = createDemoTerms();
		setSource(demoSource);
		setTerms(demoTerms);
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
				setTerms([]);
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
					const nextSource = normalizeImageInfo({
						...raw,
						tileUrlBuilder: (tier, x, y, tilePath, tileBaseUrl) => {
							const p = tilePath.startsWith("/") ? tilePath : `/${tilePath}`;
							return `${tileBaseUrl}${p}/${tier}/${y}_${x}.webp`;
						},
					}, `${S3_BASE_URL}/ims`);
					const nextTerms = normalizeImageTerms(raw);
					setSource(nextSource);
					setTerms(nextTerms);
					setPointZstUrl(raw?.mvtPath ? String(raw.mvtPath) : "");
					setFitNonce(prev => prev + 1);
					onReset();
				})
				.catch((err: Error) => {
					setSource(null);
					setTerms([]);
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

	const updateTermColor = useCallback((termId: string, color: string): void => {
		const nextColor = String(color || "").trim();
		if (!termId || !nextColor) return;
		setTerms(prev =>
			prev.map(term => (term.termId === termId ? { ...term, termColor: nextColor } : term))
		);
	}, []);

	useEffect(() => {
		if (initialLoadDoneRef.current) return;
		initialLoadDoneRef.current = true;
		if (DEFAULT_INFO_URL) {
			loadImageInfo(DEFAULT_INFO_URL);
		} else {
			loadDemo();
		}
	}, [loadImageInfo, loadDemo]);

	return { loading, error, source, terms, pointZstUrl, fitNonce, loadImageInfo, loadDemo, updateTermColor, setFitNonce };
}
