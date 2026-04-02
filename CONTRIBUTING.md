# Contributing to Open Plant WSI

한국어 가이드는 `docs/ko/contributing.html`을 참고하세요.  
English HTML guide: `docs/en/contributing.html`

## 1. Scope

Open Plant WSI is a performance-focused rendering engine for pathology WSI.
Contributions are welcome in:

- Rendering/runtime performance
- ROI/draw pipeline correctness
- Type safety and API stability
- Tests/benchmarks and docs quality

## 2. Before You Start

1. Check `engine-build-process.md`, `performance-optimization.md`, and `docs/README.md` before larger changes.
2. Open an issue first for non-trivial behavior changes.
3. Keep changes small and reviewable.

## 3. Local Setup

```bash
npm install
npm run dev:example
```

Open `http://localhost:5174`.

## 4. Branch and PR Flow

1. Create a feature branch from `main`.
2. Implement with focused commits.
3. Run release gate locally:

```bash
npm run release:gate
```

4. Update docs when API/runtime behavior changes.
5. Open PR with:
- problem statement
- design/approach
- before/after behavior
- perf impact

## 5. Quality Rules

- Keep strict TypeScript; do not add `@ts-nocheck`.
- Preserve backward compatibility in minor versions.
- If behavior changes, update:
  - `docs/en/*`
  - `docs/ko/*`
  - `CHANGELOG.md` (when release-facing)
- Avoid unnecessary dependencies in runtime path.

## 6. Performance Guardrails

- Prefer typed arrays and buffer reuse.
- Measure impact for hot-path changes.
- For ROI/clip/render changes, include:
  - timing numbers (`onStats` / `onClipStats` or perf script)
  - dataset assumptions

Perf script:

```bash
npm run test:perf
```

## 7. Testing and Release Gate

Release is blocked unless all checks pass:

```bash
npm run typecheck
npm run test:ws9
npm run build:lib
```

Unified command:

```bash
npm run release:gate
```

CI workflow: `.github/workflows/release-gate.yml`

## 8. Docs Contribution

- Keep EN/KO docs in sync for public API and behavior.
- Use concrete defaults and constraints.
- Include migration notes for breaking changes.

## 9. PR Checklist

- [ ] Scope is clear and minimal
- [ ] Typecheck passes
- [ ] Tests pass (`test:ws9`)
- [ ] Build passes (`build:lib`)
- [ ] EN/KO docs updated (if needed)
- [ ] Migration notes added (if breaking)

## 10. Security

Do not open a public issue for sensitive vulnerabilities.
Use a private disclosure channel with maintainers.
