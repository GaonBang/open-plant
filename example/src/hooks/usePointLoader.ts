import { useEffect, useMemo, useState } from "react";
import { buildTermPalette, type WsiImageSource, type WsiPointData, type WsiTerm } from "../../../src";
import { S3_BASE_URL } from "../utils/constants";
import { createTermAliasResolver } from "../utils/term-resolver";
import { type LoadedPointData, loadPointsFromZst } from "../point-loader";

export interface PointStatus {
	loading: boolean;
	error: string;
	count: number;
	terms: number;
	hasNt: boolean;
	hasPositivityRank: boolean;
}

export const INITIAL_POINT_STATUS: PointStatus = {
	loading: false,
	error: "",
	count: 0,
	terms: 0,
	hasNt: false,
	hasPositivityRank: false,
};

export function usePointLoader(
	source: WsiImageSource | null,
	terms: WsiTerm[],
	pointZstUrl: string,
	bearerToken: string,
) {
	const [pointPayload, setPointPayload] = useState<WsiPointData | null>(null);
	const [pointStatus, setPointStatus] = useState<PointStatus>(INITIAL_POINT_STATUS);

	const termPalette = useMemo(() => {
		return buildTermPalette(terms);
	}, [terms]);

	useEffect(() => {
		if (!pointZstUrl || !source) {
			setPointPayload(null);
			setPointStatus(prev => ({
				...prev,
				loading: false,
				count: 0,
				terms: terms.length,
			}));
			return;
		}

		let cancelled = false;
		const currentSource = source;
		const currentTerms = terms;

		setPointStatus({
			loading: true,
			error: "",
			count: 0,
			terms: currentTerms.length,
			hasNt: false,
			hasPositivityRank: false,
		});

		const pointAuthToken = S3_BASE_URL && pointZstUrl.startsWith(S3_BASE_URL) ? "" : bearerToken;

		loadPointsFromZst({
			url: pointZstUrl,
			imageHeight: currentSource.height,
			authToken: pointAuthToken,
		})
			.then((result: LoadedPointData) => {
				if (cancelled) return;

				const localTermIndex = result.localTermIndex || new Uint16Array(0);
				const termTable = Array.isArray(result.termTable) ? result.termTable : [""];
				const resolveTermPaletteIndex = createTermAliasResolver(currentTerms, termPalette.termToPaletteIndex);

				const lut = new Uint16Array(Math.max(1, termTable.length));
				const unmatchedTerms: string[] = [];
				for (let i = 0; i < termTable.length; i += 1) {
					const key = String(termTable[i] ?? "");
					const mapped = resolveTermPaletteIndex(key);
					lut[i] = mapped;
					if (mapped === 0 && key && key !== "0") {
						unmatchedTerms.push(key);
					}
				}

				const paletteIndices = new Uint16Array(localTermIndex.length);
				for (let i = 0; i < localTermIndex.length; i += 1) {
					paletteIndices[i] = lut[localTermIndex[i]] ?? 0;
				}
				const ids = new Uint32Array(result.count);
				for (let i = 0; i < ids.length; i += 1) {
					ids[i] = i;
				}

				setPointPayload({
					count: result.count,
					positions: result.positions,
					paletteIndices,
					ids,
				});

				setPointStatus({
					loading: false,
					error: unmatchedTerms.length
						? `term unmatched: ${unmatchedTerms.slice(0, 5).join(", ")}${unmatchedTerms.length > 5 ? " ..." : ""}`
						: "",
					count: result.count || 0,
					terms: termTable.length,
					hasNt: Boolean(result.hasNt),
					hasPositivityRank: Boolean(result.hasPositivityRank),
				});
			})
			.catch((err: Error) => {
				if (cancelled) return;
				setPointPayload(null);
				setPointStatus({
					loading: false,
					error: err.message || "point load failed",
					count: 0,
					terms: 0,
					hasNt: false,
					hasPositivityRank: false,
				});
			});

		return () => {
			cancelled = true;
		};
	}, [pointZstUrl, source, terms, bearerToken, termPalette]);

	const reset = () => {
		setPointPayload(null);
		setPointStatus(INITIAL_POINT_STATUS);
	};

	return { pointPayload, pointStatus, termPalette, reset };
}
