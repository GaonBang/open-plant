# open-plant 리팩토링 검토 (2026-03-03 기준)

## 0. 요약

- `wsi-tile-renderer.ts` 분해는 완료됐다. 기존 1536줄에서 현재 568줄 오케스트레이터로 축소됐다.
- 중복 11건 통합은 현재 코드 기준으로 완료 상태다.
- `currentTier` 관련 미사용 변수 경고는 `src` 기준 검색에서 더 이상 나오지 않는다.
- 현재 상태 검증: `npm run -s typecheck`, `npm run -s release:gate` 모두 통과.

---

## 1. 거대 파일 현황 (현재)

| 파일 | 줄 수 | 상태 |
|------|------:|------|
| `src/react/wsi-viewer-canvas.tsx` | **1218** | 다음 분해 1순위 |
| `src/react/draw-layer.tsx` | **958** | 다음 분해 1순위 |
| `src/react/overview-map.tsx` | **712** | 분해 필요 |
| `src/wsi/brush-stroke.ts` | **572** | 중간 규모, 책임은 비교적 명확 |
| `src/wsi/wsi-tile-renderer.ts` | **568** | 분해 1차 완료 |

`wsi-tile-renderer` 관련 분해 결과:

| 모듈 | 줄 수 |
|------|------:|
| `src/wsi/wsi-renderer-types.ts` | 147 |
| `src/wsi/wsi-normalize.ts` | 133 |
| `src/wsi/wsi-shaders.ts` | 227 |
| `src/wsi/wsi-interaction.ts` | 155 |
| `src/wsi/wsi-tile-cache.ts` | 70 |
| `src/wsi/wsi-view-animation.ts` | 60 |
| `src/wsi/wsi-point-data.ts` | 157 |
| `src/wsi/wsi-render-pass.ts` | 158 |
| `src/wsi/wsi-tile-visibility.ts` | 120 |
| `src/wsi/wsi-view-ops.ts` | 102 |
| `src/wsi/wsi-input-handlers.ts` | 187 |
| `src/wsi/wsi-canvas-lifecycle.ts` | 54 |

---

## 2. 코드 중복 11건 상태 (현재)

| 항목 | 상태 | Canonical |
|------|:----:|-----------|
| `nowMs()` | 완료 | `src/wsi/utils.ts` |
| `sanitizePointCount()` | 완료 | `src/wsi/utils.ts` |
| `closeRing()` / `closeRoiRing()` | 완료 | `src/wsi/roi-geometry.ts` |
| `polygonSignedArea()` | 완료 | `src/wsi/roi-geometry.ts` |
| `createProgram()` (WebGL) | 완료 | `src/core/gl-utils.ts` |
| `requireUniformLocation()` | 완료 | `src/core/gl-utils.ts` |
| `isSameViewState()` | 완료 | `src/wsi/utils.ts` |
| `cellHash()` | 완료 | `src/wsi/point-hit-index-shared.ts` |
| `toDrawCoordinate()` / `toCoord()` | 완료 | `src/react/draw-layer-utils.ts` |
| Worker 라이프사이클 패턴 | 완료 | `src/wsi/worker-client.ts` |
| 공간 인덱스 빌드 로직 | 완료 | `src/wsi/point-hit-index-shared.ts` |

---

## 3. 다음에 할 일 (권장 순서)

### P0. `wsi-viewer-canvas.tsx` 훅 분리

현재 1218줄, props도 매우 많아 변경 충돌 위험이 가장 높다. 아래 4개를 우선 추출:

- `usePointClip` (sync/worker/hybrid + stats)
- `usePointHitTest` (spatial index build/lookup + hover/click bridge)
- `useRegionInteraction` (hover/click/active region + label anchor hit)
- `useAutoLiftAnimation` (max zoom 라벨 offset 애니메이션)

완료 기준:

- `wsi-viewer-canvas.tsx`를 800줄 이하로 축소
- 위 4개 관심사가 각각 독립 파일로 분리
- 기존 public prop API 동작 변화 없음

### P0. `draw-layer.tsx` 타입/렌더/입력 책임 분리

- `import("./draw-layer-types").DrawCoordinate` 인라인 타입 참조 제거
- `drawOverlay`를 렌더 패스 단위 함수로 분해
- 포인터 상태 머신(`handlePointerDown/Move/Up`, `finishSession`, `appendBrushPoint`)을 `useDrawInteraction` 훅으로 이동

완료 기준:

- `draw-layer.tsx`에서 인라인 `import("./draw-layer-types")` 0건
- 드로잉 인터랙션 로직이 훅 파일로 분리

### P1. `overview-map.tsx` 3-way 분리

- 썸네일 fetch/normalize
- viewport box 렌더링
- pointer interaction(pan/jump)

완료 기준:

- fetch 실패 재시도/취소 로직이 뷰 렌더 코드와 분리
- pointer 계산 유닛 테스트 추가 가능 구조 확보

### P2. `wsi/utils.ts` 도메인 정리

현재는 범용/뷰/색상/인증 유틸이 한 파일에 공존한다. 기능별 파일로 재배치:

- `wsi/time-utils.ts` (`nowMs`)
- `wsi/view-utils.ts` (`isSameViewState`, scale 관련)
- `wsi/color-utils.ts` (`hexToRgba`, `buildTermPalette`)
- `wsi/auth-utils.ts` (`toBearerToken`)

완료 기준:

- import 경로가 관심사별로 명확하게 분리
- 기존 API 호환을 위해 필요하면 `wsi/utils.ts`에서 re-export만 유지

---

## 4. 사이드이펙트 검증 기준

자동 검증은 통과했지만, 아래 수동 시나리오를 리팩토링 배치마다 반복해야 한다.

1. WSI 뷰: pan/zoom/rotate + 더블클릭 줌 + wheel 줌
2. 포인트 히트테스트: hover/click id 매핑 정확성
3. ROI 클립: `sync`, `worker`, `hybrid` 모드 결과 일치
4. Draw 레이어: freehand/rectangle/circular/brush/stamp 완료 콜백 payload 동일성
5. OverviewMap: 썸네일 로드 실패 시 fallback 및 인터랙션 정상 동작

권장 게이트:

- 기본: `npm run -s typecheck`
- 회귀 전: `npm run -s release:gate`
