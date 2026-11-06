# M27: LoRA Resource Identity, Recipe Shape, and Target Schema Alignment Evidence

## 1. Divergence Analysis and Defect Reproduction

Prior to remediation, the importer, preview, and wire dispatch diverged from actual provider contracts in several key ways:

1. **Target Field ID vs URL/AIR/Style Reference Namespace Confusion**:
   - `schemaProviders.ts:86-104` (`mapSchemaLoraItems`): Indiscriminately used `resource(l) = l.path || l.url || l.civitaiId || l.name` regardless of whether the target property was `id`, `url`, `path`, or `model_name`. Passing an external URL or Civitai version ID into a catalog `id` field caused namespace corruption.
   - `schemaProviders.ts:933-940` (`kreaStyles`): Selected `l.path || l.civitaiId || l.name` before checking native `styleId`/`id`, disguising external URLs or Civitai IDs as Krea style IDs.
   - Fixed by checking property semantics: `id` / `styleId` must be native catalog identifiers; `path` / `url` must be valid download URLs; `model_name` must be native catalog model names.

2. **Provider-Wide Blanket Caps Independent of Endpoint**:
   - `civitaiImportMap.ts:289-296` (`PROVIDER_LORA_CAPS`): Imposed static provider-wide caps (Replicate 2, Fal 3, WaveSpeed 3, AIMLAPI 3, ModelScope 6) regardless of the selected model's live schema.
   - Replaced with schema-derived `maxItems` from the target endpoint's live schema or explicit options; unconstrained schemas are no longer artificially restricted.

3. **Guessed Ecosystem Conflation & Fallback**:
   - `civitaiImportMap.ts:319-329` (`normalizeEcosystem`): Grouped `krea` with `zimage`, conflated FLUX.1 and FLUX.2, and Wan 2.1 with Wan.
   - `civitaiImportMap.ts:573-575`: Unknown ecosystems silently defaulted to `'sdxl'` when building canonical AIR.
   - Separated Krea, Z-Image, FLUX.1, FLUX.2, Wan 2.1, and Wan. Unknown ecosystems remain explicit `'unknown'` and never default to `'sdxl'`.

4. **Unversioned Replicate Reference Over Authentic Download URL**:
   - `civitaiImportMap.ts:765-767`: Overrode authentic `.safetensors` download URLs with unversioned HTML page URLs (`civitai.com/models/${modelId}`).
   - Fixed to prioritize authentic direct download URLs with secure token handling via URL query parameters, never using HTML page URLs as model weights.

5. **Blanket Unsupported Claims for Unlisted Providers**:
   - `civitaiImportMap.ts:850-863`: Claimed any unlisted provider (including Runware, ModelsLab, Krea) lacked LoRA support.
   - Integrated Runware (`air` / `model`), Krea (`styles`), and ModelsLab (`catalog_id` / `lora_model`). Unknown endpoints report nonblocking `'unverified'` status rather than false unsupported claims.

6. **Loss of CFG 0, Seed 0, and Strength 0**:
   - `runwareImageContract.ts:101-104` restricted CFG=0 to a single hardcoded model.
   - `modelsLabImageContract.ts:98-101` checked `cfg > 0`, silently dropping CFG=0.
   - Fixed to preserve numeric 0 for CFG, seed, and LoRA strengths.
   - Retained M18 coordination removing empty-prompt gates in both contracts.

---

## 2. Target Provider Wire Contract Matrix

| Provider | Endpoint | Payload Hierarchy | LoRA / Style Field | Strength Field | Evidence & Verification Level |
|---|---|---|---|---|---|
| **Civitai** | `POST https://orchestration.civitai.com/v2/consumer/workflows` | `steps[0].input.loras` (`$type: 'imageGen'`) | AIR dictionary `{ [air]: strength }` or array `[{ air, strength }]` | dict value / `strength` | Verified (Production codebase & official guide `submitting-work.md`) |
| **Sogni** | `POST https://api.sogni.ai/v1/creative-agent/workflows` | `input.steps[0].arguments.loras` | Sogni catalog LoRA ID array (`string[]`) | `arguments.loraStrengths: number[]` | Verified (Production codebase & protocol `generate_image.schema.json`) |
| **Novita** | `POST https://api.novita.ai/v3/async/txt2img` | `request.loras` | `model_name`: Novita catalog `sd_name_in_api` | `strength`: number `[0, 1]` | Verified (Official declaration `novita.txt2img.json`) |
| **Runware** | `POST https://api.runware.ai/v1` | `[0].lora` (taskType: `imageInference`) | `model`: `civitai:{modelId}@{versionId}` (AIR) or Runware model ID | `weight`: number | Verified (Production contract `runwareImageContract.ts`) |
| **ModelsLab** | `POST https://modelslab.com/api/v6/images/text2img` | `lora_model` & `lora_strength` | `lora_model`: comma-separated catalog string | `lora_strength`: string or number | Verified (Production contract `modelsLabImageContract.ts`) |
| **Together** | `POST https://api.together.ai/v1/images/generations` | `image_loras` (deprecated serverless) | None (FLUX.2 rejects `image_loras`) | N/A | Verified (Official guide `parameters.md`, 2026-10-16) |
| **Venice** | `POST https://api.venice.ai/api/v1/image/generate` | None (official GenerateImageRequest has no custom loras) | None | `lora_strength` (bundled models only) | Verified (Official Swagger & live probe 400) |
| **Fal.ai** | `POST https://queue.fal.run/{model_id}` | `loras` array | `path`: HTTP(S) download URL | `scale`: float | Code status / live endpoint schema driven |
| **WaveSpeed** | `POST https://api.wavespeed.ai/api/v3/{model_id}` | `loras` array | `path`: HTTP(S) download URL | `scale`: float | Code status / OpenAPI schema driven |
| **AIMLAPI** | `POST https://api.aimlapi.com/v1/images/generations` | `loras` array | `path`: HTTP(S) download URL or HF repo | `scale`: float | Code status / endpoint schema driven |
| **Krea** | `POST https://api.krea.ai/generate/image/...` | `styles` array | `id`: Krea Style ID (from `GET /styles`) | `strength`: number | Code status / OpenAPI snapshot driven |
| **Replicate** | `POST https://api.replicate.com/v1/predictions` | Version schema field (e.g. `lora_weights`) | Authentic download URL to .safetensors | `lora_scale` or `scale` | Code status / version schema driven |

---

## 3. Behavior and Mutation Test Evidence

A comprehensive behavior test suite was added in `src/server/recipeShape.test.ts` covering:
1. Namespace isolation (`kreaStyles`, `mapSchemaLoraItems`, `novitaLoras`).
2. Exact version download URLs, query parameter preservation, and token consent.
3. Live schema-driven `maxItems` (>3 LoRAs allowed when schema declares higher capacity).
4. Ecosystem distinctness (Krea != Z-Image, FLUX.1 != FLUX.2, Wan 2.1 != Wan, unknown != sdxl).
5. CFG 0, seed 0, and strength 0 preservation across Runware, ModelsLab, and importer mappings.
6. Transparent reporting for unverified/missing schemas.

### Mutation Testing Verification
- **Mutation applied**: Mutated `normalizeEcosystem` back to conflating Krea and Z-Image:
  `if (b.includes('krea') || b.includes('zimage')) return 'krea2';`
- **Result**: Vitest failed with Exit Code 1:
  `FAIL src/server/recipeShape.test.ts > Mission M27: Recipe Shape, LoRA Resource Identity, and Target Schema Alignment > 4. Ecosystem distinctness and no sdxl fallback > distinguishes Krea from Z-Image and never conflates them`
  `AssertionError: expected 'krea2' to be 'krea'`
- **Restoration**: Code restored clean, all 22 tests returned to green.

---

## 4. Real UI Acceptance Verification

End-to-end browser verification was executed against the active web studio (`http://127.0.0.1:3227`):

1. **Recipe Provenance**:
   - Source: `https://civitai.red/images/64399178` (Civitai official image ID `64399178`).
   - Base Model: `Flux.1 D`.
   - Checkpoint: `urn:air:flux1:checkpoint:civitai:618692@691639`.
   - LoRAs:
     - LoRA 1: `Cinematic 1940s` (weight: 0.3) -> `urn:air:flux1:lora:civitai:1351798@1527024`
     - LoRA 2: `Cinematic Octane` (weight: 0.2) -> `urn:air:flux1:lora:civitai:1351798@1526912`
   - Parameters: Steps: 30, CFG: 2.5, Seed: 588815599, Size: 832x1216.

2. **UI Workflow Extraction & Preview**:
   - Civitai Modal -> `配方导入与适配 (Import)` -> Extracted recipe parsed successfully.
   - Target Provider Pill Selector displays all supported providers including `Runware`, `Krea`, and `ModelsLab`.
   - Switching to `Runware`: LoRAs dynamically adapt to `civitai:1351798@1527024` and `civitai:1351798@1526912` with target format `air` ("可直接发送"); Checkpoint honestly warns "需重选" (Civitai reference cannot cross namespaces); CFG maps to `CFGScale (2.5)`.

3. **Canvas Node Loading & Real Outbound Run**:
   - Clicked "一键生成工作流并载入画布" -> 9 canvas nodes generated:
     - Checkpoint node: `[当前] urn:air:flux1:checkpoint:civitai:618692@691639`
     - LoRA node 1: `cinematic-1940s.safetensors`, model strength `0.3`, clip strength `0.3`, Civitai AIR `urn:air:flux1:lora:civitai:1351798@1527024`
     - LoRA node 2: `cinematic-octane.safetensors`, model strength `0.2`, clip strength `0.2`, Civitai AIR `urn:air:flux1:lora:civitai:1351798@1526912`
     - Positive prompt, Negative prompt, Latent size (832x1216), KSampler (30 steps, CFG 2.5, seed 588815599), VAE Decode, Save Image.
   - Clicked `run-button` (`运行：保存与预览图像 (Save Image)`):
     - Without key: Toast reported `未配置密钥: 未配置 Civitai 的密钥`.
     - With test key: Real outbound request reached Civitai Orchestration endpoint (`https://orchestration.civitai.com/v2/consumer/workflows`), returned authentic upstream HTTP 401 Unauthorized:
       `{"type":"https://tools.ietf.org/html/rfc9110#section-15.5.2","title":"Unauthorized","status":401,"traceId":"00-242b2f530d622191352db642d002ff24-a8f1e6e85c1841e3-02"}`
     - Displayed verbatim on the frontend interface without mock or silent fallback.
