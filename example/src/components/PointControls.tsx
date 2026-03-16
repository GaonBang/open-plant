interface PointControlsProps {
	pointSizeStop1: number;
	pointSizeStop2: number;
	pointSizeStop5: number;
	pointSizeStop6: number;
	pointSizeStop8: number;
	onStop1Change: (v: number) => void;
	onStop2Change: (v: number) => void;
	onStop5Change: (v: number) => void;
	onStop6Change: (v: number) => void;
	onStop8Change: (v: number) => void;
	onResetStops: () => void;
	pointStrokeScale: number;
	onStrokeScaleChange: (v: number) => void;
	pointInnerBlackFill: boolean;
	onInnerBlackFillChange: (v: boolean) => void;
}

function StopInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
	return (
		<label className="point-stop">
			{label}
			<input
				className="stamp-input point-stop-input"
				type="number"
				min={0.1}
				step={0.1}
				value={value}
				onChange={e => {
					const next = Number(e.target.value);
					if (Number.isFinite(next) && next > 0) onChange(next);
				}}
			/>
		</label>
	);
}

export function PointControls({
	pointSizeStop1,
	pointSizeStop2,
	pointSizeStop5,
	pointSizeStop6,
	pointSizeStop8,
	onStop1Change,
	onStop2Change,
	onStop5Change,
	onStop6Change,
	onStop8Change,
	onResetStops,
	pointStrokeScale,
	onStrokeScaleChange,
	pointInnerBlackFill,
	onInnerBlackFillChange,
}: PointControlsProps) {
	return (
		<>
			<div className="subpanel point-size-panel">
				<span className="subpanel-title">Point Size Stops</span>
				<StopInput label="z1" value={pointSizeStop1} onChange={onStop1Change} />
				<StopInput label="z2" value={pointSizeStop2} onChange={onStop2Change} />
				<StopInput label="z5" value={pointSizeStop5} onChange={onStop5Change} />
				<StopInput label="z6" value={pointSizeStop6} onChange={onStop6Change} />
				<StopInput label="z8" value={pointSizeStop8} onChange={onStop8Change} />
				<button type="button" onClick={onResetStops}>
					Reset Stops
				</button>
			</div>

			<div className="subpanel point-stroke-panel">
				<span className="subpanel-title">Point Stroke</span>
				<label className="point-slider-wrap">
					thickness
					<input
						className="point-slider"
						type="range"
						min={0.1}
						max={3}
						step={0.05}
						value={pointStrokeScale}
						onChange={e => {
							const next = Number(e.target.value);
							if (Number.isFinite(next) && next > 0) onStrokeScaleChange(next);
						}}
					/>
				</label>
				<span className="point-slider-value">{pointStrokeScale.toFixed(2)}x</span>
				<label className="point-checkbox-wrap">
					<input type="checkbox" checked={pointInnerBlackFill} onChange={e => onInnerBlackFillChange(e.target.checked)} />
					inner black fill (opacity 0.1)
				</label>
			</div>
		</>
	);
}
