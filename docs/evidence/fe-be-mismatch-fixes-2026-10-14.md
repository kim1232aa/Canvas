# FE/BE mismatch HIGH fixes (2026-10-14)

Scope: `/workspace/canvas/Canvas-main`. Inventory: `docs/evidence/fe-be-mismatch-2026-10-14.md` HIGH 1–4.
No secrets printed. No browser. No commit/push.

## HIGH-1 Video driver ModelScope CN vs AI tokens

**Problem:** `VideoDriver.ts` only set `x-modelscope-token` from CN key; no `x-modelscope-ai-token` / `x-modelscope-site`. Image drivers already send site-specific headers.

**Change:**
- `src/engines/drivers/VideoDriver.ts` (~148–175): after `videoProvider` is resolved, if provider is `modelscope_ai` → require `modelscopeAiToken`, send `x-modelscope-ai-token` + `x-modelscope-site: ai` (never CN token). If `modelscope` / `modelscope_cn` → require `modelscopeToken`, send `x-modelscope-token` + `x-modelscope-site: cn`. Missing required token → local throw naming the missing header/site; no site swap.
- Note: BE `/api/video/generate` still returns 400 for ModelScope (no video endpoint). Headers are correct for that branch and for future wiring; FE no longer relies on BE’s AI→CN token fallback.

**Tests:** `VideoDriver.test.ts` — `modelscope_ai sends x-modelscope-ai-token + site=ai and refuses CN token substitute`; `modelscope CN sends x-modelscope-token + site=cn and refuses AI token substitute`.

## HIGH-2 provider=all `*Notice` strings inside `results`

**Problem:** `server.ts` wrote `results.openai_compatNotice` (etc.) as strings beside arrays; ModelHub treated non-array non-error values poorly.

**Change:**
- `server.ts` ~1427: `catalogNoticesAccum`.
- All former `(results as any).*Notice = …` and schema-provider `results[${sp}Notice]` now write `catalogNoticesAccum[provider]`.
- Return path ~2705–2725: seed `catalogNotices` from `catalogNoticesAccum`; delete any leftover `*Notice` keys from `results` so `results[provider]` is only array or `{error}`.
- `ModelHubModal.tsx` ~286–288: skip keys ending in `Notice` / `catalogNotices` when mapping `sourceMap`.

**Tests:** `modelHubCatalog.test.ts` — `provider=all results keys stay provider ids only (no *Notice siblings)`; `ModelHubModal ignores keys ending in Notice…`; updated Runware/ModelsLab/compat notice source assertions to `catalogNoticesAccum.*`.

## HIGH-3 Gemini catalog ignores request header key

**Problem:** `fetchLiveModels` did not attach `x-gemini-key`; catalog only read env/settings.

**Change:**
- `src/services/api.ts` ~458: attach `x-gemini-key` when `keys.geminiKey` present (same as generation helpers).
- `server.ts` Gemini catalog block (~2214–2220): `keyPoolManager.getNextKey('gemini', req.headers['x-gemini-key'])` first (header overrides pool), then env / cloudSettings / defaultKeys — matches generation precedence via `getNextKey`.

**Tests:** `src/services/fetchLiveModels.gemini.test.ts` — header attach; server source order asserts header before `process.env.GEMINI_API_KEY`.

## HIGH-4 ModelScope LoRA contract vs generic canvas LoRA

**Official constraint (kept):** ModelScope API-Inference AIGC / Z-Image-Turbo sample comments require LoRA IDs as ModelScope repository IDs (`owner/model`) and, for weighted maps, weights summing to **1.0** (up to 6). Do **not** auto-rescale (e.g. 0.75 → 1.0).

**Doc URLs cited this run:**
- https://www.modelscope.cn/docs/model-service/API-Inference/intro (official intro; same page quoted in `t7-modelscope-cn-acceptance.md` / `t7-modelscope-ai-acceptance.md`: “Total weight of multiple LoRAs must sum to 1.0, up to 6 LoRAs”; LoRA IDs are repo IDs).
- Cross-check narrative of the same API comment block: https://lilting.ch/en/articles/modelscope-api-inference-magicube-probe (docs describe separate `loras` with weights summing to 1.0).

**Change:** `src/schemas/modelScopeLoras.ts` — keep sum=1.0 and `owner/model` rules; clearer errors quoting failing path/name/URL and weight sum (`不会自动改权重；当前合计=…`).

**Tests:** `modelScopeLoras.test.ts` — HTTPS URL rejected; weights not summing to 1 rejected without rescale.

## Verify

```
npx vitest run src/engines/drivers/VideoDriver.test.ts src/schemas/modelScopeLoras.test.ts src/server/modelHubCatalog.test.ts src/services/fetchLiveModels.gemini.test.ts
npx tsc --noEmit
```

## Out of scope

MEDIUM items 5–14 untouched (except ModelHub `*Notice` ignore required for HIGH-2).
