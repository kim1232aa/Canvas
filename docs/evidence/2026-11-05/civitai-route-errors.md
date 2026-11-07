# Civitai Official API Reference & Route Error Evidence

**Document Date:** 2026-11-05  
**Author:** civswallow24  
**Worktree:** `<repo-root>/.tower/worktrees/wt-24`  
**Mission:** M24 - Civitai workflow route stop swallowing errors and fabricating results  

---

## 1. Official Documentation Sources

All details below are sourced directly from the official Civitai developer documentation via `FetchURL`:

1. **Model Versions Reference:**  
   [https://developer.civitai.com/site/reference/model-versions.md](https://developer.civitai.com/site/reference/model-versions.md)  
   Covers `GET /api/v1/model-versions/{id}`, `GET /api/v1/model-versions/mini/{id}`, `GET /api/v1/model-versions/by-hash/{hash}`, `POST /api/v1/model-versions/by-hash`, and `POST /api/v1/model-versions/by-hash/ids`.

2. **Images Reference:**  
   [https://developer.civitai.com/site/reference/images.md](https://developer.civitai.com/site/reference/images.md)  
   Covers `GET /api/v1/images`, specifically parameter filtering such as `imageId` and `withMeta=true`.

3. **Errors Guide:**  
   [https://developer.civitai.com/site/guide/errors.md](https://developer.civitai.com/site/guide/errors.md)  
   Covers standard HTTP status codes, JSON error response shapes (`{ error: string }` and `{ code, message, issues }`), and rate-limit/retry behaviors.

---

## 2. Endpoint Analysis

### 2.1 `GET /api/v1/model-versions/{id}`

- **URL Reference:** [https://developer.civitai.com/site/reference/model-versions.md#get-a-model-version](https://developer.civitai.com/site/reference/model-versions.md#get-a-model-version)
- **Auth:** Mixed. Valid token exposes extra fields (such as early-access unlocked resources). Publicly readable for published models.
- **Path Parameter:** `id` (integer) - Model version ID.

#### Success Response (200 OK)
Returns full model version metadata:
```json
{
  "id": 2514310,
  "modelId": 827184,
  "name": "v16.0",
  "description": null,
  "baseModel": "Illustrious",
  "baseModelType": "Standard",
  "air": "urn:air:sdxl:checkpoint:civitai:827184@2514310",
  "status": "Published",
  "availability": "Public",
  "nsfwLevel": 3,
  "createdAt": "2025-12-18T08:55:00.000Z",
  "updatedAt": "2025-12-18T09:16:12.062Z",
  "publishedAt": "2025-12-18T09:16:12.062Z",
  "uploadType": "Created",
  "usageControl": "Download",
  "trainedWords": [],
  "earlyAccessConfig": null,
  "earlyAccessEndsAt": null,
  "trainingStatus": null,
  "trainingDetails": null,
  "stats": { "downloadCount": 215627, "thumbsUpCount": 13828 },
  "model": {
    "name": "WAI-illustrious-SDXL",
    "type": "Checkpoint",
    "nsfw": false,
    "poi": false
  },
  "files": [
    {
      "id": 2402203,
      "name": "waiIllustriousSDXL_v160.safetensors",
      "type": "Model",
      "sizeKB": 6775430.35,
      "metadata": { "format": "SafeTensor", "size": "pruned", "fp": "fp16" },
      "pickleScanResult": "Success",
      "virusScanResult": "Success",
      "hashes": {
        "AutoV1": "4748A7F6",
        "AutoV2": "A5F58EB1C3",
        "SHA256": "A5F58EB1C33616...",
        "CRC32": "DAEE95B7",
        "BLAKE3": "1A411D9B...",
        "AutoV3": "22D8CB95B807"
      },
      "downloadUrl": "https://civitai.com/api/download/models/2514310",
      "primary": true
    }
  ],
  "images": [ /* preview images */ ],
  "downloadUrl": "https://civitai.com/api/download/models/2514310"
}
```

#### Documented Error Shapes
- **404 Not Found**: When version does not exist or is not published. Shape: `{"error": "No model version with id ..."}` or `{"error": "..."}`.
- **400 Bad Request**: Invalid parameters. Shape: `{"error": "..."}` or `{ "code": "BAD_REQUEST", "message": "...", "issues": [...] }`.
- **401 Unauthorized / 403 Forbidden**: If resource requires authentication or is gated.
- **429 Too Many Requests**: Edge rate limiting.
- **500 Internal Server Error**: Server failure.

---

### 2.2 `GET /api/v1/model-versions/mini/{id}`

- **URL Reference:** [https://developer.civitai.com/site/reference/model-versions.md#get-a-minimal-model-version](https://developer.civitai.com/site/reference/model-versions.md#get-a-minimal-model-version)
- **Auth:** Mixed.
- **Purpose:** Trimmed-down version of model version metadata intended for clients to download files or check whether the caller can generate with it. Skips heavy fields (`images`, `description`, full `files` array).

#### Success Response (200 OK)
```json
{
  "air": "urn:air:sdxl:checkpoint:civitai:827184@2514310",
  "versionName": "v16.0",
  "modelName": "WAI-illustrious-SDXL",
  "baseModel": "Illustrious",
  "availability": "Public",
  "publishedAt": "2025-12-18T09:16:12.062Z",
  "size": 6775430.35,
  "fileType": "Model",
  "fileName": "waiIllustriousSDXL_v160.safetensors",
  "hashes": {
    "AutoV1": "4748A7F6",
    "AutoV2": "A5F58EB1C3",
    "SHA256": "A5F58EB1C33616...",
    "CRC32": "DAEE95B7",
    "BLAKE3": "1A411D9B...",
    "AutoV3": "22D8CB95B807"
  },
  "downloadUrls": ["https://civitai.com/api/download/models/2514310"],
  "format": "SafeTensor",
  "canGenerate": true,
  "isFeatured": false,
  "requireAuth": false,
  "checkPermission": false,
  "earlyAccessEndsAt": null,
  "freeTrialLimit": null,
  "additionalResourceCharge": false,
  "minor": false,
  "sfwOnly": false
}
```

#### Meaning of Download & Auth Fields
- `downloadUrls`: Array of actual download URLs provided by upstream Civitai for the primary model version file.
- `requireAuth`: Boolean. When `true`, downloading from `downloadUrls` requires a token (`Authorization: Bearer <token>` or `?token=<token>`).
- `canGenerate`: Boolean. Whether caller can use the resource in an orchestration workflow.
- `checkPermission`: Boolean. When `true`, the resource is gated (early access or private).

#### Documented Error Shapes
- **404 Not Found**: Returns 404 if the version doesn't exist, isn't published, primary file is missing, or requested private epoch is not found. Shape: `{"error": "..."}`.
- **400 / 401 / 403 / 429 / 500**: Same standard shapes described in Errors guide.

---

### 2.3 `GET /api/v1/model-versions/by-hash/{hash}`

- **URL Reference:** [https://developer.civitai.com/site/reference/model-versions.md#get-a-model-version-by-file-hash](https://developer.civitai.com/site/reference/model-versions.md#get-a-model-version-by-file-hash)
- **Auth:** Public.
- **Path Parameter:** `hash` (string) - Accepts AutoV1, AutoV2, AutoV3, SHA256, BLAKE3, or CRC32 (case-insensitive).

#### Success Response (200 OK)
Same schema and shape as `GET /api/v1/model-versions/{id}`.

#### Documented Error Shapes
- **404 Not Found**: If no matching file is found or file belongs to an unpublished version. Shape: `{"error": "..."}`.
- **400 / 429 / 500**: Standard errors as defined in Errors guide.

---

### 2.4 `GET /api/v1/images?imageId={id}&withMeta=true`

- **URL Reference:** [https://developer.civitai.com/site/reference/images.md#list-images](https://developer.civitai.com/site/reference/images.md#list-images)
- **Auth:** Public.
- **Query Parameters:**
  - `imageId` (integer): Single-image lookup.
  - `withMeta` (boolean): `true` to include full `meta` object (generation parameters, prompt, civitaiResources, etc.).

#### Success Response (200 OK)
```json
{
  "items": [
    {
      "id": 9173928,
      "url": "https://image.civitai.com/.../cc242d6c-f960-4274-aa1d-f22a71e705ef.jpeg",
      "hash": "UA8N5},:Ioni~C#laKxaoznNwvx]XmRkVstR",
      "width": 832,
      "height": 1216,
      "type": "image",
      "nsfw": true,
      "nsfwLevel": "Soft",
      "browsingLevel": 2,
      "createdAt": "2025-04-17T21:28:57.225Z",
      "postId": 1981754,
      "thumbnail": null,
      "username": "Ajuro",
      "baseModel": "SDXL 1.0",
      "modelVersionIds": [9208, 249861, 258687, 332071, 345685],
      "stats": { ... },
      "meta": {
        "Size": "832x1216",
        "seed": 1938345220,
        "steps": 45,
        "sampler": "DPM++ 2M",
        "cfgScale": 5,
        "clipSkip": 2,
        "prompt": "...",
        "negativePrompt": "...",
        "resources": [],
        "civitaiResources": [
          { "type": "checkpoint", "modelVersionId": 345685 },
          { "type": "lora", "weight": 0.65, "modelVersionId": 249861 }
        ]
      }
    }
  ],
  "metadata": {
    "nextCursor": "...",
    "nextPage": "..."
  }
}
```

#### Documented Error Shapes
- From [https://developer.civitai.com/site/guide/errors.md](https://developer.civitai.com/site/guide/errors.md) and [https://developer.civitai.com/site/reference/images.md#errors](https://developer.civitai.com/site/reference/images.md#errors):
  - Standard JSON shape: `{"error": "<message>"}`
  - tRPC / validation shape: `{"code": "<CODE>", "message": "<message>", "issues": [...]}`
  - **400 Bad Request**: Invalid parameters or invalidated cursor.
  - **404 Not Found**: Image not found / unknown image ID.
  - **429 Too Many Requests**: Edge rate limit.
  - **503 Service Unavailable**: `{"error": "Image search is temporarily overloaded — please retry."}`
  - **500 Internal Server Error**: Unexpected failure.

---

## 3. Unverified / Undocumented Behaviors Found in Current Code

The following behaviors implemented in `src/server/routes/civitaiWorkflowRoute.ts` have **NO support or mention** in the official Civitai developer documentation and are classified as **unverified** or **violations of project rules**:

1. **Fallback scraping of HTML `__NEXT_DATA__` (`https://civitai.com/images/{imageId}`)**:
   - Status: **unverified / undocumented as an official API**.
   - Civitai provides official REST endpoint `GET /api/v1/images?imageId=...&withMeta=true`.
   - HTML scraping is a web crawler mechanism that bypasses official API status codes and silently masks REST errors (such as 401, 403, 404, 429, 500).

2. **Invented `downloadUrl` (`https://civitai.com/api/download/models/${vid}`)**:
   - Status: **unverified / fabricated client fallback**.
   - Official docs state `downloadUrl` (in `/model-versions/{id}`) or `downloadUrls` (in `/model-versions/mini/{id}`) is returned directly by Civitai when the file exists and is downloadable.
   - When upstream returns 404 or fails, fabricating `https://civitai.com/api/download/models/${vid}` misleads users into believing a valid download endpoint exists and that the resource was verified.

3. **Invented `requireAuth: false`**:
   - Status: **unverified / fabricated client fallback**.
   - The official mini endpoint explicitly returns `requireAuth: true` for resources requiring a token. Defaulting to `false` when upstream resolution failed conceals whether authentication is required.

4. **Empty `catch {}` swallowing errors**:
   - Status: **violation of transparency and truthfulness rule**.
   - Completely conceals real upstream errors (status code, endpoint, response body, network timeouts).

---

## 4. Baseline Reproduction in Real UI (Before Code Changes)

- **Dev Server Port:** 3124
- **Headless Chrome Remote Debugging Port:** 9424
- **Chrome User Profile:** `/tmp/canvas-chrome-civswallow24`
- **Screenshots:**
  - Success baseline: `/tmp/civswallow24-baseline/baseline-success.png`
  - Failure baseline: `/tmp/civswallow24-baseline/baseline-failure-404.png`

### 4.1 Success Case (`https://civitai.com/images/64399178`)
- **Input:** Real Civitai image URL `https://civitai.com/images/64399178` (FLUX.1 D with Checkpoint #691639 and 2 LoRAs: #1527024, #1526912).
- **UI Behavior:**
  - Header: Civitai 配方导入与跨供应商适配 (Import & Adapt).
  - Architecture banner shows: `来源架构: Flux.1 D`, status: `架构兼容`.
  - LoRA list shows 2 LoRAs: `Cinematic 1940s` (weight 0.3) and `Cinematic Octane` (weight 0.2).
- **Upstream Log Lines (`logs/upstream.log`):**
  ```json
  {"timestamp":"2026-11-06T06:06:57.087Z","provider":"civitai","route":"image-metadata-api","upstream":"civitai.com/api/v1/images?imageId=64399178&withMeta=true","model":"64399178","maskedKey":null,"keyUsage":null,"status":200,"durationMs":105,"error":null}
  {"timestamp":"2026-11-06T06:06:57.186Z","provider":"civitai","route":"model-version-resolve","upstream":"civitai.com/api/v1/model-versions/691639","model":"691639","maskedKey":null,"keyUsage":null,"status":200,"durationMs":97,"error":null}
  {"timestamp":"2026-11-06T06:06:57.345Z","provider":"civitai","route":"model-version-mini","upstream":"civitai.com/api/v1/model-versions/mini/691639","model":"691639","maskedKey":null,"keyUsage":null,"status":200,"durationMs":158,"error":null}
  {"timestamp":"2026-11-06T06:06:57.415Z","provider":"civitai","route":"model-version-resolve","upstream":"civitai.com/api/v1/model-versions/1527024","model":"1527024","maskedKey":null,"keyUsage":null,"status":200,"durationMs":325,"error":null}
  {"timestamp":"2026-11-06T06:06:57.424Z","provider":"civitai","route":"model-version-resolve","upstream":"civitai.com/api/v1/model-versions/1526912","model":"1526912","maskedKey":null,"keyUsage":null,"status":200,"durationMs":332,"error":null}
  {"timestamp":"2026-11-06T06:06:57.529Z","provider":"civitai","route":"model-version-mini","upstream":"civitai.com/api/v1/model-versions/mini/1527024","model":"1527024","maskedKey":null,"keyUsage":null,"status":200,"durationMs":113,"error":null}
  {"timestamp":"2026-11-06T06:06:57.542Z","provider":"civitai","route":"model-version-mini","upstream":"civitai.com/api/v1/model-versions/mini/1526912","model":"1526912","maskedKey":null,"keyUsage":null,"status":200,"durationMs":117,"error":null}
  ```

### 4.2 Failure Case (`https://civitai.com/images/999999999`)
- **Input:** Non-existent image URL `https://civitai.com/images/999999999`.
- **What Actually Happened Upstream:**
  1. `civitai.com/api/v1/images?imageId=999999999&withMeta=true` returned HTTP 200 with empty items (`{"items":[]}`).
  2. Because `items` was empty, `fetchCivitaiRealImageMeta` executed `catch { // Fall through to HTML scrape }`.
  3. It initiated a web crawl to `https://civitai.com/images/999999999`.
  4. Cloudflare blocked the crawl with HTTP 403 and a Turnstile challenge page (`Just a moment...`).
- **What the User Sees in the UI Today:**
  - Red banner: `Civitai 上游响应 HTTP 403`.
  - Details: Full Cloudflare HTML challenge text.
  - Endpoint reported: `https://civitai.com/images/999999999` (the web crawl target, NOT the REST API endpoint!).
- **Why This Violates Project Rules:**
  - Swallows REST API result.
  - Automatically falls back to HTML web scraping without disclosure.
  - Reports an irrelevant Cloudflare 403 error on the web page instead of the real REST API failure (image does not exist).

---

## 5. Mutation Check Verification (Red -> Green)

A mutation test was conducted to prove that the regression tests strictly detect and fail on swallowed errors and fabricated values:

1. **Mutation Introduced:**
   - Swallowed `vUrl` and `mUrl` failures with empty `catch {}`.
   - Fabricated `downloadUrl = fullInfo?.downloadUrl || (miniInfo?.downloadUrls?.[0] ? ... : "https://civitai.com/api/download/models/${vid}")`.
   - Fabricated `requireAuth = miniInfo?.requireAuth ?? fullInfo?.requireAuth ?? false`.

2. **Mutation Run Result (RED):**
   ```
   FAIL src/server/routes/civitaiWorkflowRoute.test.ts (37 tests | 9 failed)
   × Endpoint 1: GET /api/v1/model-versions/{id} on 404: AssertionError: expected true to be false
   × Endpoint 1: GET /api/v1/model-versions/{id} on 500: AssertionError: expected true to be false
   × Endpoint 1: GET /api/v1/model-versions/{id} on 502 network: AssertionError: expected true to be false
   × Endpoint 2: GET /api/v1/model-versions/mini/{id} on 404: AssertionError: expected true to be false
   × Endpoint 2: GET /api/v1/model-versions/mini/{id} on 500: AssertionError: expected true to be false
   × Endpoint 2: GET /api/v1/model-versions/mini/{id} on 502 network: AssertionError: expected true to be false
   × End-to-end /api/civitai/extract-workflow: AssertionError: expected 'https://civitai.com/api/download/models/404040' to be undefined
   ```
   All 9 tests detecting swallowed errors and fabricated download URLs went RED.

3. **Restoration & Clean Result (GREEN):**
   - Reverted mutation.
   - Clean implementation verified with `git diff`.
   - Result: 37 passed out of 37 tests in `src/server/routes/civitaiWorkflowRoute.test.ts`.

---

## 6. Real Browser Acceptance After Fix

- **Dev Server Port:** 3124
- **Headless Chrome Port:** 9424
- **Chrome User Profile:** `/tmp/canvas-chrome-civswallow24`
- **Screenshots:**
  - Success after fix: `docs/evidence/2026-11-05/civitai-route-errors/fix-acceptance-success.png`
  - Failure after fix: `docs/evidence/2026-11-05/civitai-route-errors/fix-acceptance-failure.png`

### 6.1 Success Case (`https://civitai.com/images/64399178`)
- **Action:** Open Civitai modal -> switch to Import mode -> click FLUX quick fill button (`https://civitai.com/images/64399178`).
- **Screenshot Inspection (`fix-acceptance-success.png`):**
  - Textarea: `https://civitai.com/images/64399178`
  - Target provider: `Civitai (原生生成引擎)`
  - Architecture banner: `来源架构: Flux.1 D`, status: `架构兼容`
  - Message: `保留 Civitai 原始模型/版本引用 (urn:air:flux1:checkpoint:civitai:618692@691639)；是否具备在线生成权限以上游校验为准。`
  - LoRAs: `Cinematic 1940s` (weight 0.3) and `Cinematic Octane` (weight 0.2), with authentic upstream download URLs and metadata.
- **Request Log (`logs/upstream.log`):**
  ```json
  {"timestamp":"2026-11-06T06:33:47.158Z","provider":"civitai","route":"image-metadata-api","upstream":"civitai.com/api/v1/images?imageId=64399178&withMeta=true","model":"64399178","maskedKey":null,"keyUsage":null,"status":200,"durationMs":132,"error":null}
  {"timestamp":"2026-11-06T06:33:47.287Z","provider":"civitai","route":"model-version-resolve","upstream":"civitai.com/api/v1/model-versions/691639","model":"691639","maskedKey":null,"keyUsage":null,"status":200,"durationMs":127,"error":null}
  {"timestamp":"2026-11-06T06:33:47.398Z","provider":"civitai","route":"model-version-mini","upstream":"civitai.com/api/v1/model-versions/mini/691639","model":"691639","maskedKey":null,"keyUsage":null,"status":200,"durationMs":111,"error":null}
  {"timestamp":"2026-11-06T06:33:47.497Z","provider":"civitai","route":"model-version-resolve","upstream":"civitai.com/api/v1/model-versions/1527024","model":"1527024","maskedKey":null,"keyUsage":null,"status":200,"durationMs":336,"error":null}
  {"timestamp":"2026-11-06T06:33:47.512Z","provider":"civitai","route":"model-version-resolve","upstream":"civitai.com/api/v1/model-versions/1526912","model":"1526912","maskedKey":null,"keyUsage":null,"status":200,"durationMs":349,"error":null}
  {"timestamp":"2026-11-06T06:33:47.631Z","provider":"civitai","route":"model-version-mini","upstream":"civitai.com/api/v1/model-versions/mini/1526912","model":"1526912","maskedKey":null,"keyUsage":null,"status":200,"durationMs":119,"error":null}
  {"timestamp":"2026-11-06T06:33:47.632Z","provider":"civitai","route":"model-version-mini","upstream":"civitai.com/api/v1/model-versions/mini/1527024","model":"1527024","maskedKey":null,"keyUsage":null,"status":200,"durationMs":134,"error":null}
  ```
- **Acceptance Label:** `NOT_SENT` (Read-only workflow import and preset adaptation extraction; reaches Civitai public API, parses genuine metadata without initiating generation).

### 6.2 Failure Case (`https://civitai.com/images/999999999`)
- **Action:** Open Civitai modal -> switch to Import mode -> input `https://civitai.com/images/999999999` -> click submit button.
- **Screenshot Inspection (`fix-acceptance-failure.png`):**
  - Textarea: `https://civitai.com/images/999999999`
  - Error banner: Red box with warning triangle icon.
  - Error text displayed: `Civitai 图片 #999999999 未在官方图片库找到 (items 为空)`
  - No HTML scraper fallback executed.
  - No Cloudflare 403 challenge encountered.
- **Request Log (`logs/upstream.log`):**
  ```json
  {"timestamp":"2026-11-06T06:33:57.287Z","provider":"civitai","route":"image-metadata-api","upstream":"civitai.com/api/v1/images?imageId=999999999&withMeta=true","model":"999999999","maskedKey":null,"keyUsage":null,"status":200,"durationMs":191,"error":null}
  ```
- **Acceptance Label:** `CONTRACT_REJECT` (Upstream Civitai images REST API returned empty items for non-existent image ID 999999999; request properly rejected with honest error verbatim).

---

## 7. Verification Commands & Real Exit Codes

1. `npx tsc --noEmit`
   - Real exit code: `0`
   - Result: 0 TypeScript errors.

2. `npm run build`
   - Real exit code: `0`
   - Result: Frontend client bundle built in 3.29s, worker bundle built.

3. `npx vitest run --maxWorkers=2 --exclude '.tower/**' --exclude '**/node_modules/**' --exclude '**/dist/**'`
   - Real exit code: `0`
   - Result: 249 test files passed (100%), 1903 tests passed (100%).

---

## 8. Round 2 Review Remediation (rev-m24-a P1-1, P1-2, P2-1, P2-2, P2-3)

### 8.1 Mutation Check Matrix (All 7 Mutations Verified RED -> GREEN)

All mutations were executed in an isolated detached worktree at `/tmp/m24-mut-verify` to ensure tests lock against all swallowed errors and fabricated fields:

| Mutation | Description | Result When Mutated | Failed Tests / Reason | Exit Code |
|---|---|---|---|---|
| **Mut A** | Swallow `/model-versions/{id}` (`catch {}`) + invent `downloadUrl` | **RED** | 5 tests failed: Endpoint 1 404/500/502 + e2e | `1` |
| **Mut B** | Swallow `/model-versions/mini/{id}` (`catch {}`) + invent `downloadUrl` | **RED** | 4 tests failed: Endpoint 2 404/500/502 + 200 lock | `1` |
| **Mut C** | `requireAuth = ... ?? false` | **RED** | 1 test failed: `on 200 OK when upstream omits requireAuth and downloadUrl` (`AssertionError: expected false to be undefined`) | `1` |
| **Mut D** | Swallow `/model-versions/by-hash` (`catch {}`; return null) | **RED** | 4 tests failed: Endpoint 3 404/500/502 + P2-1/P2-2 | `1` |
| **Mut E** | Fall through to HTML scrape on REST failure / empty items | **RED** | 1 test failed: Endpoint 4 empty items (`Error: Unexpected url: https://civitai.com/images/999999`) | `1` |
| **Mut F** | `canGenerate: false` fabricated on version resolution failure | **RED** | 1 test failed: Endpoint 4 404 version (`AssertionError: expected false to be undefined`) | `1` |
| **Mut G** | `versionId ? \`https://civitai.com/api/download/models/${versionId}\` : ...` in `civitaiImportMap.ts` | **RED** | 1 test failed: `civitaiImportMap.test.ts` (`AssertionError: expected 'compatible' to be 'requires_reselection'`) | `1` |

When mutations were reverted, all test suites passed 100% GREEN.

---

### 8.2 Round 2 Real UI Acceptance (Dev Server 3124, Headless Chrome 9424, Profile `/tmp/canvas-chrome-civswallow24b`)

Three independent real browser acceptance scenarios were conducted and screenshotted:

1. **Scenario 1: Success Import (`https://civitai.com/images/64399178`)**
   - **Screenshot:** `docs/evidence/2026-11-05/civitai-route-errors/fix-acceptance-success-r2.png`
   - **MD5 Hash:** `dad3c9e48ee1ae2d9fbde3748a55d77a` (distinct from baseline `44f8131cd0bb6a382614e6a0d697445f`).
   - **Line-by-line observations:**
     - Header: "Civitai 配方导入与跨供应商适配 (Import & Adapt)" with active "配方导入与适配 (Import)" tab.
     - Provider Selector: "Civitai (原生生成引擎)" selected.
     - Architecture Banner: "底模架构与 LoRA 适配状态: 来源架构: Flux.1 D", status "架构兼容".
     - LoRA List: "提取的 LoRA 列表与目标供应商映射 (2 个)":
       - Card 1: `Cinematic 1940s`, weight `0.3`, badge `可直接发送`, target `urn:air:flux1:lora:civitai:1351798@1527024`.
       - Card 2: `Cinematic Octane`, weight `0.2`, badge `可直接发送`, target `urn:air:flux1:lora:civitai:1351798@1526912`.
   - **Acceptance Label & Observation:** `NOT_SENT` (Observed: read-only workflow import that reached Civitai official REST API; no generation request was submitted).

2. **Scenario 2: Failure Case 1 — Non-existent Model Version (`https://civitai.com/models/123?modelVersionId=999999999`)**
   - **Screenshot:** `docs/evidence/2026-11-05/civitai-route-errors/fix-acceptance-failure-404-version.png`
   - **Line-by-line observations:**
     - Input textarea: `https://civitai.com/models/123?modelVersionId=999999999`.
     - Alert banner: Red error alert with warning icon.
     - Verbatim error text: `Civitai model-version 上游响应 HTTP 404 [HTTP 404] (https://civitai.com/api/v1/model-versions/999999999) - 响应体: {"error":"Model not found"}`.
     - Stale preview is cleared.
   - **Acceptance Label & Observation:** `CONTRACT_REJECT` (Observed: Upstream Civitai model-versions API responded HTTP 404 with JSON body `{"error":"Model not found"}`; presented to user with endpoint, status, and raw response verbatim).

3. **Scenario 3: Failure Case 2 — Documented Empty Items HTTP 200 (`https://civitai.com/images/999999999`)**
   - **Screenshot:** `docs/evidence/2026-11-05/civitai-route-errors/fix-acceptance-failure-empty-items.png`
   - **Line-by-line observations:**
     - Input textarea: `https://civitai.com/images/999999999`.
     - Alert banner: Red error alert with warning icon.
     - Verbatim error text: `Civitai images 上游 HTTP 200，响应体包含空 items (未匹配到公开图片元数据) [HTTP 200] (https://civitai.com/api/v1/images?imageId=999999999&withMeta=true) - 响应体: {"items":[],"metadata":{}}`.
     - Status 200 is accurately presented; not rewritten as 404.
     - No HTML scrape fallback; no Cloudflare 403 challenge encountered.
   - **Acceptance Label & Observation:** Observed: Upstream Civitai images REST API returned HTTP 200 with empty items array `{"items":[],"metadata":{}}`; correctly presented as documented upstream response without falling back to web scraping.

---

### 8.3 Final Verification Commands & Real Exit Codes

1. `npx tsc --noEmit` -> **Exit Code: `0`**
2. `npm run build` -> **Exit Code: `0`**
3. `npx vitest run --maxWorkers=2 --exclude '.tower/**' --exclude '**/node_modules/**' --exclude '**/dist/**'` -> **Exit Code: `0`** (249 test files passed, 1910 tests passed).
