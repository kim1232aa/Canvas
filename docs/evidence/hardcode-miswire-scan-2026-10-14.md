# Hardcode / 张冠李戴 scan — 2026-10-14

Iron rules: no silent LoRA strength invent; no mock success; OpenWorks ≠ TAMS; compat relays ≠ official OpenAI/xAI; retrieval before assertion.

## Summary

| Area | Status |
|------|--------|
| LoRA `??0.8` leftover in `workflowFrame.ts` | **fixed now** |
| ModelHubModal attach invent 0.8 | already fixed by 画布; copy template `:0.8` **fixed now** |
| `.env.example` / `provider=all` openai_compat/grok_compat/agnes | already done by 画布 (not overwritten) |
| `resolveSchemaModelId` → `listModels[0]` | **fixed now** |
| Tensor OpenWorks labeled Checkpoint | **fixed now** |
| CivitaiModal「海量 LoRA」vs Fal | **fixed now** |
| BackendSettingsModal `popularModels` hardcoded | **fixed now** (cleared) |
| NanoGPT hardcoded `api.nano-gpt.com` catalog/balance | **fixed now** |
| ProviderMatrix SenseNova outdated FAIL_INTEGRATION | **fixed now** |

## Evidence table

| file:line | issue | rule broken | suggested fix | status |
|-----------|-------|-------------|---------------|--------|
| `src/utils/workflowFrame.ts:24` (pre-fix) | `modelStrength/clipStrength: number(...)??0.8` | silent LoRA default | use `parseExplicitLoraStrength`; missing stays undefined | **fixed now** |
| `src/components/ModelHubModal.tsx:1255` | copy `<lora:${displayName}:0.8>` | silent LoRA default | copy `<lora:name>` without inventing strength | **fixed now** |
| `src/components/ModelHubModal.tsx` onAddLora | invent 0.8 on attach | silent LoRA default | omit strength | **already done** (画布) |
| `src/App.tsx` / `graphEngine.ts` / `nodes.ts` / `loraStrength.ts` | LoRA strength iron path | silent LoRA default | explicit parse + refuse | **already done** (画布) |
| `.env.example` | incomplete vs `process.env` | incomplete env docs | document real keys; OpenWorks≠TAMS; compat=relays | **already done** (画布) |
| `server.ts:2635–2648` | `provider=all` missing openai_compat/grok_compat/agnes | incomplete aggregation | lookup-only transparent stubs | **already done** (画布) |
| `src/schemas/providerSchema.ts:884` | empty/unknown → `listModels[0]` (e.g. empty openai→gpt-image-2) | silent model swap | return `undefined`; keep known ids/aliases only | **fixed now** |
| `src/schemas/providerSchema.test.ts:158–213` | asserted empty→first model | tests encoded silent fallback | assert `undefined` for empty/foreign | **fixed now** |
| `server.ts:extractModelMetadata` (~1210–1325) | Tensor non-LoRA typed Checkpoint / baseModel「Tensor.Art Cloud」 | 张冠李戴 OpenWorks↔TAMS | reclassify OpenWorks as Edit/Tools; badge OpenWorks; baseModel `OpenWorks Tool` | **fixed now** |
| `src/components/CivitaiModal.tsx:534` | 「Fal.ai…全网海量 LoRA」 | contradicts Fal no public LoRA catalog (~737) | copy: Fal needs manual URL | **fixed now** |
| `src/components/BackendSettingsModal.tsx:178+` | hardcoded `popularModels` lists presented as truth | hardcoded specialty lists | clear to `[]`; UI → 模型中心动态目录 | **fixed now** |
| `server.ts:2018–2175` (pre-fix) | NanoGPT catalog hardcoded `https://api.nano-gpt.com/...` | ignore configured Base URL | `getProviderBaseUrl('nanogpt')` + report actual endpoint | **fixed now** |
| `server.ts:6172` / `6628` (pre-fix) | balance probe hardcoded nano host | ignore configured Base URL | origin from configured base + `/api/check-balance` | **fixed now** |
| `src/components/ProviderMatrixModal.tsx:89` | SenseNova「只接入 chat、FAIL_INTEGRATION」 | outdated vs HANDOFF/evidence | U1.5 Lite PASS_GENERATION (exact samples); note 2K/4K caveat | **fixed now** |
| `src/constants/presets.ts` | preset LoRA strengths 0.8 etc. | N/A (explicit preset values, not silent fallback) | leave; not silent invent | **still open / out of scope** (explicit curated presets) |
| SenseNova Driver LoRA omissions / multi-image / chat maxTokens | wiring gaps in `t7-sensenova-acceptance.md` 续审 | separate from this scan | follow serial fix list | **still open** (E2E/wiring pass) |
| Tensor.Art model gen with only `ak_tensor` | OpenWorks key ≠ TAMS Bearer | credential miswire (already gated) | keep reject; never claim TAMS works | **open for E2E** (auth blocked; do not claim) |

## Notes for E2E / 画布

- Do not claim Tensor.Art TAMS model image gen works with only OpenWorks `ak_tensor`.
- SenseNova matrix now cites PASS_GENERATION for documented U1.5 samples only; size `2K`/`4K` literals remain unverified as accepted enum values.
- Frontend E2E generation not run in this pass.
