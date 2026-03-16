interface TopbarProps {
	infoUrlInput: string;
	setInfoUrlInput: (v: string) => void;
	tokenInput: string;
	setTokenInput: (v: string) => void;
	loading: boolean;
	onLoad: (url: string) => void;
	onDemo: () => void;
}

export function Topbar({ infoUrlInput, setInfoUrlInput, tokenInput, setTokenInput, loading, onLoad, onDemo }: TopbarProps) {
	return (
		<>
			<div className="url-row">
				<input type="text" value={infoUrlInput} onChange={e => setInfoUrlInput(e.target.value)} placeholder="image info API URL" />
				<button type="button" disabled={loading} onClick={() => onLoad(infoUrlInput)}>
					{loading ? "Loading..." : "Load"}
				</button>
				<button type="button" disabled={loading} onClick={onDemo}>
					Demo
				</button>
			</div>
			<div className="auth-row">
				<input type="text" value={tokenInput} onChange={e => setTokenInput(e.target.value)} placeholder="Bearer 토큰 또는 raw 토큰" />
			</div>
		</>
	);
}
