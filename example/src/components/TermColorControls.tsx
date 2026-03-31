import type { WsiTerm } from "../../../src";

interface TermColorControlsProps {
	terms: WsiTerm[];
	disabled?: boolean;
	onTermColorChange: (termId: string, color: string) => void;
}

function toColorInputValue(color: string): string {
	return /^#([0-9a-f]{6})$/i.test(color) ? color : "#808080";
}

export function TermColorControls({ terms, disabled = false, onTermColorChange }: TermColorControlsProps) {
	if (!terms.length) return null;

	return (
		<div className="subpanel term-color-panel">
			<span className="subpanel-title">Term Colors</span>
			<div className="term-color-grid">
				{terms.map(term => (
					<label key={term.termId || term.termName} className="term-color-row">
						<span className="term-color-swatch" style={{ backgroundColor: term.termColor || "#808080" }} />
						<span className="term-color-label">
							<strong>{term.termName || "(unnamed)"}</strong>
							<small>{term.termId || "-"}</small>
						</span>
						<input
							className="term-color-input"
							type="color"
							value={toColorInputValue(term.termColor)}
							disabled={disabled}
							onChange={event => onTermColorChange(term.termId, event.target.value)}
						/>
					</label>
				))}
			</div>
		</div>
	);
}
