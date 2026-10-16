# Tensor.Art official TAMS — 2026-10-15 (Asia/Tokyo)

Project: `/workspace/canvas/Canvas-main`  
Service: `http://127.0.0.1:3000` (tsx watch)  
Method: official docs fetch + server-side smoke (no browser / no computerUse)  
Credentials: `.env` `TENSORART_API_KEY` / `TENSORART_KEY` — **2 keys, both `ak_tensor_…` (OpenWorks only)**. No TAMS Bearer present. Secrets never printed.

**Outcome: `BLOCKED_AUTH` (local gate) — not PASS_GENERATION / not PASS_BILLING.**  
Same class as historical `unauthorized` / `app not found`, but now refused **before** pretending OpenWorks keys are TAMS Bearer.

---

## 1. Official TAMS docs verified (live fetch)

| Topic | Official URL | Fact used |
|---|---|---|
| Host / SDK default | [tams-sdk.js README](https://github.com/Tensor-Art/tams-sdk.js) / FAQ | Host `tams-api.tensor.art`; Token auth = `Authorization: Bearer …` (no appId header for Bearer strategy) |
| No list API | https://tams-docs.tensor.art/docs/api/guide/integration-faq/ | *“Can you provide an interface for listing models? Currently not available.”* |
| Get model by id | https://tams-docs.tensor.art/docs/api/apis/tams-api-v-1-service-get-model/ | `GET /v1/models/:modelId` → `model.id/baseModel/modelType` (CHECKPOINT / LORA / LOCON / LYCORIS / DORA / …) |
| Create job | https://tams-docs.tensor.art/docs/api/apis/tams-api-v-1-service-create-job/ | `POST /v1/jobs` with `requestId` + `stages` (`INPUT_INITIALIZE`, `DIFFUSION`) |
| LoRA on basic job | https://tams-docs.tensor.art/docs/use-cases/basic/component/lora/ | `diffusion.lora.items[].loraModel` + `weight` (+ optional `loraAccessKey`) |
| Poll job | https://tams-docs.tensor.art/docs/api/apis/tams-api-v-1-service-get-job/ | `GET /v1/jobs/:jobId`; status `SUCCESS` → `successInfo.images` |
| Model ID source | https://tams-docs.tensor.art/docs/api/guide/how-to-get-the-model-id/ | Copy numeric ID from `https://tensor.art/models/{id}` |
| Constants | https://tams-docs.tensor.art/docs/api/guide/list-of-constants/ | Sampler / VAE lists |

**Not TAMS (walled off as Checkpoint):** OpenWorks `https://openapi.tensor.art/openworks/v1` (`tool/list`, `task`, `Echo-Access-Key: ak_tensor_…`). Tools must not stand in for TAMS base models.

Code constants: `TENSOR_MODEL_API = https://tams-api.tensor.art` in `src/schemas/tensorModelApi.ts`.

---

## 2. Wiring alignment (TAMS only for Checkpoint / LoRA)

Already present / confirmed this round:

- Job builder maps canvas fields → official stages: `sdModel`, `cfgScale`, `sampler`, `scheduleName`, `lora.items[{loraModel,weight,loraAccessKey?}]` (`buildTensorModelJob`).
- Generate route numeric model ID → TAMS `GET /v1/models/{id}` then `POST /v1/jobs` then poll `GET /v1/jobs/{id}`.
- Catalog: lookup-only (no list API); OpenWorks tool names **not** injected as Checkpoint rows.
- `isInvalidTensorModel` / `generationReadiness` reject non-numeric / non-URL tool names as底模.
- Static `BASE_MODELS` for tensorart are numeric IDs only.

**This round code changes:**

| File | Change |
|---|---|
| `src/schemas/tensorArtCredentials.ts` | **new** — parse pool, `isOpenWorksAccessKey`, `pickTamsBearerKey`, hint text |
| `src/schemas/tensorArtCredentials.test.ts` | **new** — credential pick + LoRA `loraModel`/`weight` mapping tests |
| `server.ts` | load `TENSORART_API_KEY` \| `TENSORART_KEY` \| `TENSORART`; TAMS paths use `resolveTamsBearerKey` / prefer non-`ak_` |
| `src/server/routes/civitaiModelRoutes.ts` | `/api/tensorart/model-info` local-gates OpenWorks keys (no more sending `ak_…` or comma-glued pool as Bearer) |
| `src/components/BackendSettingsModal.tsx` | docs → `tams-docs.tensor.art`; copy clarifies TAMS vs OpenWorks |

Vitest: `npx vitest run src/schemas/tensorArtCredentials.test.ts src/schemas/modelApiWiring.test.ts src/engines/drivers/TensorArtDriver.test.ts src/utils/modelCatalog.test.ts src/server/modelHubCatalog.test.ts` → **5 files / 35 tests passed**.

---

## 3. Live smoke (status codes only)

| Probe | Status | Notes |
|---|---|---|
| `GET /api/tensorart/model-info?modelId=990778216270553015` | **400** local | OpenWorks-only pool → refuse; does **not** call upstream with `ak_` |
| `GET /api/models?provider=tensorart&query=990778216270553015` | **200** body.error | Same OpenWorks-key message via `fetchTensorArtModelInfo` |
| `GET /api/models?provider=tensorart` | **200** `tensorart: []` | `paging: lookup-only`; **no** OpenWorks tool names as Checkpoint |
| `POST /api/tensorart/generate` numeric model + LoRA | **400** local | Gate: OpenWorks key cannot run TAMS job |
| `POST /api/tensorart/tools` (OpenWorks) | **500** upstream | CDN `config-cdn.qiandaoapp.com/.../mapping.json` timeout (`code:13`) — transient; not treated as TAMS PASS |
| Direct box curl → `tams-api.tensor.art` / `openapi.tensor.art` | **403** CF 1010 | Browser-signature block on raw urllib; server `upstreamFetch` path is the authoritative probe |

**Historical note:** Prior evidence recorded TAMS upstream `404` with body `{"code":100001,"message":"unauthorized","tips":"app not found"}` when an OpenWorks key was sent as Bearer. Re-verify with a real TAMS Bearer (from https://tams.tensor.art/app) is still required for `PASS_GENERATION` / billing classification.

---

## 4. OpenWorks as Checkpoint?

**No — not selectable as Checkpoint in Model Hub catalog.** Empty lookup-only list; tool names filtered by `isInvalidTensorModel` / category wall. OpenWorks remains a separate tool route (`/api/tensorart/tools`, generate with tool `name`) and must not be used as底模.

---

## 5. What is still blocked for PASS

1. **Need a TAMS Bearer Key** in settings / `.env` (not `ak_tensor_…`). Comma pools may mix; TAMS routes now prefer non-`ak_` entries.
2. After Bearer works: ID lookup → job with real LoRA id+strength → poll → durable media → frontend E2E (画布 owns browser).
3. Optional later: TAMS two-step image upload → `imageResourceId` img2img (official FAQ); current route still rejects raw `image_url` for model jobs.

**Label: `BLOCKED_AUTH` / CODE wiring ready for TAMS.**
