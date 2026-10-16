# Tensor.Art OpenWorks tools verify — 2026-10-14 (Asia/Tokyo)

Project: `/workspace/canvas/Canvas-main`  
Service: `http://127.0.0.1:3000`  
Method: API/curl only (no browser; avoid clobbering parallel WaveSpeed LoRA Hub UI E2E)  
Credentials: `.env` has OpenWorks `ak_tensor_…` only (prefix confirmed; secret not echoed). **No TAMS Bearer.**

Labels used below: `PASS` / `PASS_GENERATION` (OpenWorks tool only) / `BLOCKED_AUTH` / `BLOCKED_UPSTREAM_TRANSIENT`.  
**Never** upgrade TAMS Checkpoint+LoRA to `PASS_GENERATION`.

---

## Summary

| Surface | Result | Notes |
|---|---|---|
| OpenWorks `POST …/openworks/v1/tool/list` via `/api/tensorart/tools` | **PASS** | 23 tools; first call hit upstream CDN timeout then recovered |
| OpenWorks `POST …/openworks/v1/task` via `/api/tensorart/generate` (`anime_lab_wai_illustrious`) | **PASS_GENERATION** (OpenWorks tool) | taskId `1055340860448761705`; durable PNG media |
| TAMS `GET …/v1/models/{id}` via `/api/tensorart/model-info` | **BLOCKED_AUTH** | upstream `unauthorized` / `app not found` |
| TAMS-style generate with numeric model id + `ak_tensor` | **BLOCKED_AUTH** (local gate) | HTTP 400; refuses to pretend OpenWorks key is TAMS |
| Model Hub `/api/models?provider=tensorart` | lookup-only empty list | By design: TAMS FAQ has no list API; OpenWorks tools are **not** injected as checkpoints |

---

## 1. OpenWorks tool list

### Commands

```bash
curl -sS -X POST "http://127.0.0.1:3000/api/tensorart/tools" \
  -H "Content-Type: application/json" -d '{}'
```

Server helper: `fetchTensorArtToolsList` in `server.ts` (~4731–4763) →  
`https://openapi.tensor.art/openworks/v1/tool/list` with header `Echo-Access-Key` (value never logged here).

### Transient failure (attempt 0, earlier GET)

- Local HTTP **500**
- Exact upstream body (via server error string):

```text
Tensor.Art API Error [500]: {"code":13,"message":"failed to list tools: failed to fetch mapping: Get \"https://config-cdn.qiandaoapp.com/tusi_tensor_tools/mapping.json\": context deadline exceeded (Client.Timeout exceeded while awaiting headers)"}
```

Label: **BLOCKED_UPSTREAM_TRANSIENT** (CDN mapping timeout). Not an auth failure.

### Success (attempts 1–3 + post-patch)

- Local HTTP **200**, `code: "0"`, **23** tools
- Direct upstream (same key, same URL) also HTTP **200**, 23 tools

### Tool names (names only)

1. `oc_character_illustration`
2. `oc_garment_template`
3. `anime_lab_wai_illustrious`
4. `photoreal_studio_z_image`
5. `text2video_wan22`
6. `text2video_wan27`
7. `image2video_wan22`
8. `image2video_wan25`
9. `image2video_ltx23`
10. `text2video_ltx23`
11. `image2video_wan27`
12. `smart_edit_nano_banana2`
13. `smart_edit_wan27`
14. `smart_edit_wan27_pro`
15. `strong_text2image_wan27`
16. `strong_text2image_nano_banana2`
17. `background_remover`
18. `image_upscaler`
19. `extend_image_sd15`
20. `live_wallpaper`
21. `old_photo_restore`
22. `three_view_flux_kontext`
23. `watermark_remove`

Auth status: **OpenWorks OK** (tool/list).

---

## 2. One real OpenWorks tool invocation

### Request

```bash
curl -sS -X POST "http://127.0.0.1:3000/api/tensorart/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "toolName": "anime_lab_wai_illustrious",
    "prompt": "a small red apple on a white table, simple",
    "width": 512,
    "height": 512,
    "count": 1
  }'
```

### Result — **PASS_GENERATION** (OpenWorks tool path only)

| Field | Value |
|---|---|
| Local HTTP | 200 (~35s including poll) |
| `provider` / `actualProvider` | `Tensor.Art (OpenWorks)` |
| `toolName` / `actualModel` | `anime_lab_wai_illustrious` |
| `taskId` | `1055340860448761705` |
| `exactEndpointCalled` | `https://openapi.tensor.art/openworks/v1/task` |
| Poll | `POST …/openworks/v1/task/query` (multiple 200s → FINISH) |
| Durable media | `/api/media/b3d3783785bb9b74f2eaf07623ed5f017b177ed5753cb93bd1b28b191f72b013` |
| Media HEAD | HTTP 200, `image/png`, size **298294** bytes |

This does **not** prove TAMS Checkpoint + LoRA canvas workflows.

---

## 3. TAMS auth status (expected blocked)

### 3a. Model info

```bash
curl -sS "http://127.0.0.1:3000/api/tensorart/model-info?modelId=672797109289765558"
```

- Local HTTP **404**
- Upstream endpoint: `https://tams-api.tensor.art/v1/models/672797109289765558`
- Exact upstream body:

```json
{"code":100001,"message":"unauthorized","tips":"app not found"}
```

Label: **BLOCKED_AUTH**. Key used is OpenWorks `ak_tensor_…` (masked in server trace as `ak_t…`); not a missing-model case.

### 3b. Generate with numeric model id (TAMS job path)

```bash
curl -sS -X POST "http://127.0.0.1:3000/api/tensorart/generate" \
  -H "Content-Type: application/json" \
  -d '{"model":"672797109289765558","prompt":"test","width":512,"height":512}'
```

- Local HTTP **400** (server gate before pretending success)
- Exact local error:

```text
当前配置的是 Tensor.Art OpenWorks Access Key (ak_tensor_...)，不能用于 TAMS 模型 API。
```

- `credentialHint`: 模型 API 使用 TAMS Bearer Key；OpenWorks ak_tensor 工具 key 不代表模型 API 授权
- `exactEndpointCalled`: `https://tams-api.tensor.art/v1/models/672797109289765558`

Label: **BLOCKED_AUTH** (correct refusal). No silent fallback to OpenWorks for numeric IDs.

---

## 4. Catalog / Hub behavior

`/api/models?provider=tensorart` returns empty `tensorart: []` with pagination `paging: 'lookup-only'`, `catalogAvailable: false`, message citing TAMS FAQ (no list API). Evidence matches `server.ts` ~2274–2293.

OpenWorks tools remain available via **`/api/tensorart/tools`** and generate via **`toolName`**, not as Hub “checkpoints”.

---

## 5. UI 张冠李戴 notes + small fix applied

### Found (pre-fix)

In `server.ts` `extractModelMetadata` (~1187–1316):

- Heuristic forced `anime_lab_wai*`, `oc_character*`, `three_view*` → **category/type LoRA**
- Hardcoded display names called them “……LoRA”
- Badge became `Tensor.Art LoRA / 微调工具`

These are **OpenWorks fixed tools**, not TAMS LoRA adapters. Calling them LoRA/checkpoints is 张冠李戴.

(Checkpoint→Edit remap for Tensor.Art already existed for pure Checkpoint fall-through; it did **not** catch the LoRA heuristic path.)

### Fix applied (small, OpenWorks-label only; no provider swap)

File: `server.ts` `extractModelMetadata`

1. Removed OpenWorks tool-id heuristics from `isLora` (`three_view` / `anime_lab_wai` / `oc_character`).
2. Renamed display strings to “（OpenWorks 工具）” instead of “LoRA”.
3. Remap: for Tensor.Art **non-numeric** ids, if category is Checkpoint or LoRA → `Edit` / `Tools` (numeric TAMS IDs unchanged so real CHECKPOINT lookups stay Checkpoint).

Server still serves `/api/tensorart/tools` (23) after reload.

### Follow-up (not fixed this pass)

- OpenWorks tools are not surfaced in Model Hub catalog (by design today). If product wants tool browsing in Hub, add an explicit **Tools** lane fed by `/tool/list`, never as Checkpoint.
- `getTensorArtBaseUrl` still switches Tusi vs Tensor by `ak_tusi` prefix (known prior note); not exercised this run.
- First `tool/list` CDN timeout: consider clearer `BLOCKED_UPSTREAM` status (not 500-as-auth) — optional UX.

---

## 6. What this verify does **not** claim

- No TAMS Bearer → **no** TAMS Checkpoint + KSampler + LoRA `PASS_GENERATION`
- No frontend canvas E2E for Tensor (API-only by design this run)
- Historical OpenWorks images from older acceptance docs are not re-used as current TAMS proof

---

## Artifact paths (local scratch; secrets redacted where saved)

- `/tmp/tensor-ow-verify/tools-a1.json` — successful tool list
- `/tmp/tensor-ow-verify/generate-anime-redacted.json` — generate response (keys redacted)
- Durable media: `/api/media/b3d3783785bb9b74f2eaf07623ed5f017b177ed5753cb93bd1b28b191f72b013`
- This evidence: `docs/evidence/tensor-openworks-verify-2026-10-14.md`
