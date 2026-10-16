
## History UI polish follow-ups (2026-10-15 04:45 JST) — CODE_ONLY, FE screenshots pending

Restore tar: `/workspace/canvas-restore/pre-histpolish-0441.tgz`

### 1) Provider label — single source
- Source: `PROVIDER_TITLE_LABEL` in `src/utils/providerLabels.ts` (`openworks: 'Tensor.Art OpenWorks'`, already correct).
- New `canonicalProviderLabel(raw)`: legacy recorded values (`Tensor.Art (openworks)`, `Tensor.Art (OpenWorks)`, `ModelScope CN (魔搭社区)`…) → `explicitProvider` id → config label; unknown values are passed through unchanged.
- Used in: `AssetManagerModal.tsx` (card chip, filter options, detail panel), `HistoryModal.tsx` (list/grid/detail), `BackendSettingsModal.tsx` (all 23 `name:` → `friendlyProviderLabel('<id>')`).
- Asset card chip: `truncate max-w-[140px]` removed → `whitespace-normal break-words` + `title` with the full name.

### 2) 该端点不支持 vs 未发送 (Schema-driven, every provider)
- `resolveHistoryParameters` (`src/utils/historyParameters.ts`) already uses `actualRequest.schemaFields`: not in Schema → `unsupported` → 「该端点不支持」; in Schema but not in actualRequest → `not-sent` → 「未发送」.
- Gap: failed-attempt history (`src/server/failedAttemptHistory.ts`) stored only `{endpoint, parameters}` and dropped the route's `schemaFields`, so every failed card fell back to 「未发送」. Fixed: the route's `responseBody.actualRequest.schemaFields` is now copied.
- Existing history records are NOT backfilled; their cards keep showing 「未发送」 until a new run.
- AIMLAPI `alibaba/z-image-turbo-lora`, live `https://api.aimlapi.com/docs-json?model=alibaba%2Fz-image-turbo-lora` (HTTP 200, 2026-10-15): properties = acceleration, enable_prompt_expansion, enable_safety_checker, image_size, loras, model, num_images, num_inference_steps, output_format, prompt, provider, seed.
  - cfg/guidance_scale: 该端点不支持 · sampler: 该端点不支持 · scheduler: 该端点不支持 · negative_prompt: 该端点不支持
  - Supported-but-unsent: none of the four.
  - Cross-check with the draft `docs/provider-schema-drafts/aimlapi.json`: no mismatch. The draft has no `parametersByModel` entry for this model; its contractTestHint says "cfg/negative 标不会发送".

### 3) Badges
- `history-output-count` 「N 张图片」: `data-badge-level="primary"`, text-sm semibold, purple fill and border.
- `history-non-output-count` 「N 条未出图记录」: `data-badge-level="secondary"`, 10px, slate-500, no fill.

### Tests
- `src/utils/historyUiPolish.test.ts`: 10 passing. Covers label mapping, unsupported vs unsent, and failed-attempt schemaFields.
- Full vitest: 1034 pass, 2 fail. Both failures are in `mediaHostedReview.test.ts`, which imports the missing `hosting/server.generated`; this predates the change.
- tsc: 6 errors, all in files this change didn't touch.
- FE E2E: not run. Still needed: one screenshot of the full history list showing failed and successful cards together, plus a new AIMLAPI failed run, to confirm 「该端点不支持」.
