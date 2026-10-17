# TAMS LoRA type-check fix — 2026-10-17

## Bug
`GET /api/tensorart/model-info?modelId=…` returns the upstream nested shape:

```json
{ "model": { "id": "…", "baseModel": "SD 1.5", "modelType": "LORA", … }, "executionTrace": […] }
```

`CivitaiModal.handleCustomUniversalLoraSubmit` tested only `info.type || info.category`, both missing on that payload → threw「查询返回的资源不是 LoRA」.
`ModelHubModal` custom-ID path had the same gap (`category || type` only; nested `id` also missing so checkpoint import would fail too).

## Fix (FE only — OpenWorks untouched, no endpoint swap)
| File | Change |
| --- | --- |
| `src/utils/tensorArtModelInfo.ts` | `normalizeTensorArtModelInfo` unwraps `model`, maps `modelType` → `type`/`category` (case-insensitive LORA/LOCON/LYCORIS/DORA → LoRA; CHECKPOINT → Checkpoint). `isTensorArtLoraType` helper. |
| `src/utils/tensorArtModelInfo.test.ts` | 4 unit cases (nested LORA, mixed case, CHECKPOINT, flat passthrough). |
| `src/services/api.ts` | `fetchTensorArtModelInfo` returns normalized payload. |
| `src/components/CivitaiModal.tsx` | LoRA gate uses `isTensorArtLoraType(info)`. |
| `src/components/ModelHubModal.tsx` | `verifiedType` also reads `info.modelType`. |
| `src/utils/resourceSelection.ts` | `rawKind` also reads `modelType` / `model.modelType`. |

## Prove
- curl LoRA `661652545330040294` → still `{ model: { modelType: "LORA", baseModel: "SD 1.5" }, executionTrace }` (HTTP 200).
- curl checkpoint `613045163490732233` → `{ model: { modelType: "CHECKPOINT", baseModel: "SD 1.5" } }` (HTTP 200).
- `node --import tsx` running the same normalize helper on those curl bodies → LoRA `{ type:LORA, category:LoRA, isLora:true }`, checkpoint `{ type:CHECKPOINT, category:Checkpoint, isLora:false }`.
- `npx vitest run src/utils/tensorArtModelInfo.test.ts` → 4 passed.

## Server / HMR
No server restart. Canvas Vite middleware Mode on PID **106904** (`tsx server.ts`, port 3000) still serves `/src/utils/tensorArtModelInfo.ts` live.

## How FE should remount
1. Open Tensor.Art / 吐司 checkpoint picker → custom ID `613045163490732233` (SD 1.5 CHECKPOINT).
2. Open LoRA mount (CivitaiModal or Model Hub LoRA tab, provider=tensorart) → custom ID `661652545330040294`.
3. Expect mount success (baseModel SD 1.5 matches); no「查询返回的资源不是 LoRA」/「资源元数据未标明为 LoRA」.
4. Run TAMS generate; billing/upstream text unchanged. OpenWorks path unchanged.
