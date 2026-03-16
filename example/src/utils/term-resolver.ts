import type { WsiTerm } from "../../../src";

function normalizeKey(value: string | null | undefined): string {
	return String(value || "")
		.trim()
		.toLowerCase();
}

export function createTermAliasResolver(
	terms: WsiTerm[],
	termToPaletteIndex: Map<string, number>,
): (rawValue: string | number | null | undefined) => number {
	const direct = termToPaletteIndex;
	const alias = new Map<string, number>();

	let positivePaletteIndex = 0;
	let negativePaletteIndex = 0;

	for (const term of terms) {
		const termId = String(term.termId ?? "");
		const paletteIndex = direct.get(termId) ?? 0;
		if (!paletteIndex) continue;

		const termName = normalizeKey(term.termName);
		if (termName) {
			alias.set(termName, paletteIndex);
		}

		if (!positivePaletteIndex && termName.includes("positive")) {
			positivePaletteIndex = paletteIndex;
		}
		if (!negativePaletteIndex && termName.includes("negative")) {
			negativePaletteIndex = paletteIndex;
		}
	}

	if (positivePaletteIndex) {
		for (const key of ["positive", "pos", "4", "p"]) {
			alias.set(key, positivePaletteIndex);
		}
	}
	if (negativePaletteIndex) {
		for (const key of ["negative", "neg", "1", "n"]) {
			alias.set(key, negativePaletteIndex);
		}
	}

	return (rawValue): number => {
		const raw = String(rawValue ?? "");
		const directHit = direct.get(raw);
		if (directHit !== undefined) return directHit;
		const normalized = normalizeKey(raw);
		if (!normalized) return 0;
		return alias.get(normalized) ?? 0;
	};
}
