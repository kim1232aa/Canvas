# M27: LoRA Resource Identity, Recipe Shape, and Target Schema Alignment Evidence

## 1. Divergence Analysis and Defect Reproduction

Prior to remediation, the importer, preview, and wire dispatch diverged from actual provider contracts in several key ways:

1. **Target Field ID vs URL/AIR/Style Reference Namespace Confusion**:
   - `schemaProviders.ts:86-104` (`mapSchemaLoraItems`): Indiscriminately used `resource(l) = l.path || l.url || l.civitaiId || l.name` regardless of whether the target property was `id`, `url`, `path`, or `model_name`. Passing an external URL or Civitai version ID into a catalog `id` field caused namespace corruption.
   - `schemaProviders.ts:933-940` (`kreaStyles`): Selected `l.path || l.civitaiId || l.name` before checking native `styleId`/`id`, disguising external URLs or Civitai IDs as Krea style IDs.
   - Fixed by checking property semantics: `id` / `styleId` must be native catalog identifiers; `path` / `url` must be valid download URLs or HuggingFace `owner/repo`; `model_name` must be native catalog model names.
   - Sogni (`sogniLoras`): Strictly isolates Sogni catalog IDs (`string[]`); rejects external HTTP(S) download URLs, Civitai AIRs, and `.safetensors` filenames. Allows canvas nodes non-Civitai `l.name` (e.g. `krea2-fever-dream-mood`) as catalogId. When all LoRAs omit strength, omits `loraStrengths` per Sogni schema; when strengths are mixed (some explicit 0 / 0.3, others empty), keeps explicit values and marks empty items as unmapped without fabricating 1 or swallowing filled strengths.
   - Novita (`novitaLoras`): Distinguishes foreign Civitai imports from user-chosen Novita `sd_name_in_api` (which legitimately end in `.safetensors`, e.g. `add_detail.safetensors`), while continuing to reject external URLs, Civitai AIRs, and pure numeric Civitai IDs.

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

7. **Loss of Declared Custom LoRA Item Fields and Model Identity on Canvas**:
   - `mapSchemaLoraItems`: Previously only handled 5 hardcoded fields and dropped extra schema-declared properties. Now preserves any schema-declared extra properties (such as `trigger_word`, `transformer`, `weight_name`) present on the LoRA item.
   - Canvas pipeline (`graphEngine.ts`, `frontendParameters.ts`, `workflowFrame.ts`): Preserves `air`, `modelId`, `versionId`, `catalogId`, `styleId`, `sd_name_in_api`, and all custom properties through graph collection and frame serialization.
   - `SchemaProviderDriver.ts`: Surfaces `unmappedLoras` (names, source locators, and verbatim reasons) via `historyWarning` and error notifications so omitted LoRAs are never hidden.

8. **Civitai Native Nested OpenAPI `model` Discriminator & Compound AIR Ecosystem Resolution**:
   - `civitaiImageContract.ts`: Previously checked a hardcoded `builtin = (body.ecosystem === 'zImage' || body.ecosystem === 'krea2') && provided(body.comfyModel)` and did not match lowercase/compound AIR ecosystems (`zimageturbo`, `zimagebase`, `mossimage`, `ponyv7`) against the live OpenAPI `ImageGenInput` discriminator keys (`zImage`, `mossImage`, `ponyV7`) or inspect nested `discriminator.propertyName === 'model'` branches (`ComfyKrea2TurboCreateImageGenInput`, `ComfyZImageTurboCreateImageGenInput`, `ComfyMossImageSftCreateImageInput`, `ComfyHiDreamO1CreateImageGenInput`). Without `comfyModel` populated, Krea 2 Turbo skipped its nested `model` discriminator and sent unmapped canvas fields (`cfg`, `negative_prompt`, `sampler_name`, array `loras`), while `zimageturbo` and `mossimage` threw local `ecosystem` lookup errors.
   - Fixed generically by resolving `(engine, ecosystem, inferredModelSelector)` against the live OpenAPI `ImageGenInput` discriminator mappings (case-insensitive + compound `ecoKey + modelKey`), inspecting the live ecosystem schema's nested `model` discriminator, resolving unambiguous variant tokens from `comfyModel` / checkpoint metadata / live schema defaults, and mapping the source AIR checkpoint into the branch's declared `diffusionModel` / `checkpointModel` / `diffuserModel` field.
   - `civitaiWorkflowRoute.ts` and `CivitaiModal.tsx`: Populate `base_model`, `civitai_engine`, `civitai_ecosystem`, and `civitai_model` on `CheckpointLoaderSimple` (and `spatialFrames`) when unambiguously known from the extracted Civitai checkpoint, while preserving user edits.

9. **Imported Recipe `seed` Overwritten on First Run**:
   - `civitaiWorkflowRoute.ts`: Previously hardcoded `control_after_generate: 'randomize'` on imported `KSampler` nodes even when the recipe contained an explicit `seed` (including `0`), causing `graphEngine.ts` to overwrite the recipe seed with `Math.random()` on Run.
   - Fixed to set `control_after_generate: seed !== null && seed !== undefined ? 'fixed' : 'randomize'` on `KSampler` (and `seedControl` on `spatialFrames` / `AIVideoNode`), preserving exact recipe seeds (`689794262`, `552388375`, `2280565052`, and `0`).

---

## 2. Target Provider Wire Contract Matrix (Cross-Verified)

Cross-verified across multiple search engines and official primary sources (Tavily, 9Router, Google Grounding, official OpenAPI/JSON schemas, and SDK repositories):

| Provider | Endpoint | Payload Hierarchy | LoRA / Style Field | Strength Field | Evidence & Verification Level |
|---|---|---|---|---|---|
| **Civitai** | `POST https://orchestration.civitai.com/v2/consumer/workflows` | `steps[0].input.loras` (`$type: 'imageGen'`) | AIR 字典 `{ [air]: strength }` 或对象数组 `[{ air, strength }]` | dict value / `strength` | **已核实 (官方 Flux.1/Krea2 工作流配方及一手契约；`https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.json`)** |
| **Together** | `POST https://api.together.ai/v1/images/generations` | `image_loras` (deprecated serverless) | 无 (FLUX.2 等原生无 `image_loras` 接入点) | N/A | **已核实 (官方参数指南一手证据: `https://docs.together.ai/docs/inference/images/parameters`)** |
| **Fal.ai** | `POST https://queue.fal.run/{model_id}` | `loras` 数组 | `path`: HTTP(S) 直链下载 URL 或 HuggingFace `owner/repo`；Wan 2.2 支持 `transformer: 'high'\|'low'\|'both'`, `weight_name` | `scale`: float `[0, 4]` (default 1) | **已核实 (官方 OpenAPI 一手证据: `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/lora` 及 `.../fal-ai/wan/v2.2-a14b/text-to-video/lora`)** |
| **Runware** | `POST https://api.runware.ai/v1` | `[0].lora` (taskType: `imageInference`) | `model`: `civitai:{modelId}@{versionId}` (AIR) 或 Runware 内部模型 ID | `weight`: number | **已核实 (官方模型文档一手证据: `https://runware.ai/docs/models/bfl-flux-1-kontext-dev.md`，包含 lora[].model AIR 及 weight 字段)** |
| **Replicate** | `POST https://api.replicate.com/v1/predictions` | 动态版本 Schema 字段 (`lora_weights` / `extra_lora` 或 `loras` 数组) | `.safetensors` 直链下载 URL (严禁使用网页 URL) | `lora_scale` 或 `scale` | **已核实 (官方模型页一手证据: `https://replicate.com/black-forest-labs/flux-dev-lora`)** |
| **Sogni** | `POST https://api.sogni.ai/v1/creative-agent/workflows` | `input.steps[0].arguments.loras` | Sogni catalog LoRA ID 数组 (`string[]`，如 `krea2-detail-enhancer` 或 `personal-…`)；不支持外部 URL / AIR / 文件名 | `arguments.loraStrengths: number[]` (按位等长对齐) | **已核实 (官方 hosted-tool Schema 一手证据: `https://raw.githubusercontent.com/Sogni-AI/sogni-protocol/main/schemas/tools/generate_image.schema.json`)** |
| **Novita** | `POST https://api.novita.ai/v3/async/txt2img` | `request.loras` | `model_name`: Novita catalog `sd_name_in_api` (支持 `.safetensors`)；不支持外部 URL / 纯数字 Civitai ID | `strength`: number `[0, 1]` | **已核实 (官方 V3 迁移指南及模型管理一手证据: `https://docs.novita.ai/guides/model-apis-v2-to-v3-migration` 及 `model-apis-custom-model`)** |
| **ModelsLab** | `POST https://modelslab.com/api/v6/images/text2img` | `lora_model` & `lora_strength` | `lora_model`: 逗号分隔 catalog 字符串或单个模型名 | `lora_strength`: number 或 string (如 123 / 0.8) | **已核实 (官方 Dreambooth LoRA API 一手证据: `https://docs.modelslab.com/image-generation/community-models/dreambooth-lora`)** |
| **Venice** | `POST https://api.venice.ai/api/v1/image/generate` | 无 (官方 GenerateImageRequest 无自定义 LoRA 入口) | 无 | `lora_strength` (仅限系统捆绑模型) | **已核实 (官方 API Spec 一手证据: `https://docs.venice.ai/api-reference/endpoint/image/generate`)** |
| **WaveSpeed** | `POST https://api.wavespeed.ai/api/v3/{model_id}` | `loras` 数组 | `path`: HTTP(S) 下载 URL 或公开权重链接 | `scale`: float `[0.5, 1.5]` | **已核实 (官方文档一手证据: `https://wavespeed.ai/docs/submit-task` 及 `lora-training-usage`)** |
| **AIMLAPI** | `POST https://api.aimlapi.com/v1/images/generations` | `loras` 数组 | `path`: HTTP(S) 下载 URL 或 HuggingFace `owner/repo` 路径 | `scale`: float `[0, 4]` (typical 0.6-1.0) | **已核实 (官方 Z-Image Turbo LoRA 文档一手证据: `https://docs.aimlapi.com/api-references/image-models/alibaba-cloud/z-image-turbo-lora`)** |
| **Krea** | `POST https://api.krea.ai/generate/image/...` | `styles` 数组 | `id`: Krea Style ID (来自 `GET /styles`) | `strength`: number `[-2, 2]` | **已核实 (官方 OpenAPI 一手证据: `https://api.krea.ai/openapi.json`)** |
| **DeepInfra** | `POST https://api.deepinfra.com/v1/openai/images/generations` | 公共端点无 LoRA；私有部署 `lora_scale` | 需控制台预先部署 | `lora_scale`: float `[0, 1]` | **已核实 (官方私有模型文档一手证据: `https://docs.deepinfra.com/private-models/lora-image.md`)** |
| **ModelScope**| `POST https://api-inference.modelscope.cn/v1/images/generations` | endpoint 属性驱动 | 仅支持社区内部仓库 ID (`owner/model-lora`) | 待动态 schema 校验 | **未验证 (仅限代码实现/待外部核实)** |
| **TensorArt** | `POST https://ap-east-1.tensorart.cloud/v1/jobs` | TAMS 官方 `stages[].diffusion.*` | 内部纯数字模型 ID | 待动态 schema 校验 | **未验证 (仅限代码实现/待外部核实)** |

---

## 3. Behavior and Mutation Test Evidence

A comprehensive behavior test suite is maintained across targeted contract, route, and UI schema suites:
1. `src/server/recipeShape.test.ts` (50 tests):
   - Namespace isolation (`kreaStyles`, `mapSchemaLoraItems`, `novitaLoras`, `sogniLoras`).
   - Sogni real canvas LoRALoader node with `lora_name: 'krea2-fever-dream-mood'` preserved while HTTP URLs rejected.
   - Sogni mixed LoRAs (some explicit 0 / 0.3, others empty) preserves filled strengths and reports unset items without fabricating 1 or swallowing filled values.
   - Novita real canvas LoRALoader node with `add_detail.safetensors` preserved when not a foreign Civitai resource, while foreign Civitai filenames rejected.
   - `mapSchemaLoraItems` allows explicit non-Civitai numeric target IDs (`1015214543296590260`), HF owner/repo paths, and preserves extra schema-declared properties (`trigger_word`, `transformer`).
   - Runware imported canvas graph preserves `air`, `modelId`, `versionId` end-to-end to `buildRunwareImageRequest`, and `replaceSelectedResource` strips stale Civitai identity keys upon hub reselection.
   - `unmappedLorasNotice` surfaces omitted LoRA names, source values, and reasons for historyWarning / UI visibility.
   - Fal Wan 2.2 video graph preserves declared `transformer` (`high`/`low`/`both`) and `weight_name` through to `buildFalVideoRequest`.
   - End-to-end quick-fill recipes (`#148140013` Krea 2 Turbo + 4 LoRAs, `#148135866` Z-Image Turbo + LoRA, `#148004351` MOSS-Image SFT + 2 LoRAs) and `seed === 0` preservation (`control_after_generate === 'fixed'`) from `handleExtractCivitaiWorkflow` -> `extractWorkflowParameters` -> `buildCivitaiImageRequest`.
2. `src/server/civitaiImageContract.test.ts` (25 tests):
   - Resolves nested OpenAPI `model` discriminators (`ComfyKrea2TurboCreateImageGenInput`, `ComfyZImageTurboCreateImageGenInput`, `ComfyMossImageSftCreateImageInput`) and compound/lowercase AIR ecosystems (`zimageturbo` -> `zImage` + `turbo`, `mossimage` -> `mossImage` + `sft`), emitting `model: 'turbo' | 'sft'`, `diffusionModel: 'urn:air:...'`, `cfgScale`, `sampler`, `seed`, and AIR-keyed `loras` dictionary.
3. `src/components/CivitaiModalImportLiveSchema.test.tsx` (5 tests):
   - Parent CivitaiModal async chain: parse -> select model -> loading (`unverified`) -> ready (`compatible`).
   - Causal mutation verification: removing `subscribeModelSchema` or `ensureModelSchema` turns tests RED (failed with Exit Code 1); restored clean.
   - Parent CivitaiModal discards delayed out-of-order extract responses when rapidly switching providers.
   - Unselected target model on non-civitai provider displays honest amber `待选择目标模型 / 未核实` banner, never false green `架构兼容`.
4. `src/server/routes/civitaiWorkflowRoute.test.ts` (45 tests):
   - `selectVerifiedCivitaiModelFile`: selects primary Model file over auxiliary Other/VAE files at index 0 (e.g. for version 3168308).
   - Reports `unverifiedReason` when only non-model files exist or multiple model files exist without a single primary.
   - Binds selected `targetModel` into `CheckpointLoaderSimple` (`ckpt_name`) and `spatialFrames` on non-civitai providers.

### Mutation Testing Verification
- **Mutation 1**: Mutated `normalizeEcosystem` to conflate Krea and Z-Image:
  `if (b.includes('krea') || b.includes('zimage')) return 'krea2';`
  -> **FAIL** `src/server/recipeShape.test.ts` (Exit Code 1). Restored clean.
- **Mutation 2**: Commented out `subscribeModelSchema` across both `CivitaiModal.tsx` and `CivitaiModalImportPreview.tsx`:
  -> **FAIL** `src/components/CivitaiModalImportLiveSchema.test.tsx` (3 failed, Exit Code 1). Note: removing `subscribeModelSchema` only in parent `CivitaiModal.tsx` while keeping `CivitaiModalImportPreview.tsx`'s own internal `subscribeModelSchema` + `effectiveAdaptation` recomputation stays green because the child preview component independently subscribes to the live schema store; simultaneously commenting out `subscribeModelSchema` in both parent and child components causes live schema updates to fail to propagate to preview, failing 3 tests with Exit Code 1. Restored clean.
- **Mutation 3**: Dropped explicit non-Civitai numeric target ID support in `mapSchemaLoraItems`:
  -> **FAIL** `src/server/recipeShape.test.ts > mapSchemaLoraItems allows explicit non-Civitai numeric target IDs` (Exit Code 1). Restored clean.
- **Mutation 4**: Swallowed explicit LoRA strengths in `sogniLoras` when an item is unset:
  -> **FAIL** `src/server/recipeShape.test.ts > Sogni mixed LoRAs` (Exit Code 1). Restored clean.
- **Mutation 5**: Reverted live nested OpenAPI `model` discriminator inspection in `src/server/civitaiImageContract.ts` back to hardcoded `(body.ecosystem === 'zImage' || body.ecosystem === 'krea2') && provided(body.comfyModel)`:
  -> **FAIL** `src/server/civitaiImageContract.test.ts` (1 failed / 24 passed) & `src/server/recipeShape.test.ts` (1 failed / 49 passed), Exit Code 1. Restored clean.
- **Mutation 6**: Reverted `control_after_generate` in `src/server/routes/civitaiWorkflowRoute.ts` back to hardcoded `'randomize'`:
  -> **FAIL** `src/server/recipeShape.test.ts > End-to-end quick-fill recipes ... and seed=0 preservation` (1 failed / 49 passed, Exit Code 1). Restored clean.

---

## 4. Real UI Acceptance Verification (PASS_BILLING)

UI 真实操作状态：**PASS_BILLING (真实上游 Civitai Orchestration 通过鉴权与 OpenAPI 契约校验，返回真实计费边界 `HTTP 400 insufficientBuzz` 并原样透传)**

### 4.1 Recipe Provenance & civitai.red 获取说明
- **目标配方来源**：用户指定的当前真实配方（均在弹窗提供一键填入并完成端到端真实点击运行）：
  1. `https://civitai.red/images/148140013` (Krea 2 Turbo 多 LoRA 作品，创作者: `Hairpin`)：
     - **Base Model**: `Krea 2 Turbo`
     - **Checkpoint**: `urn:air:krea2:diffusionmodel:civitai:2732656@3072332` (`Krea 2 Turbo / v1.0`, modelId: `2732656`, versionId: `3072332`)
     - **LoRA 1**: `Mrpopo's Krea2 Anime/Art enhanced (Full Potential v3.0)` (`versionId`: `3168308`, `modelId`: `2744585`, 权重: `1`), 主模型文件 `Mrpopo anime full potential.safetensors` (AutoV2: `257833C15C`), AIR `urn:air:krea2:lora:civitai:2744585@3168308`。
     - **LoRA 2**: `Aesthetic Quality Modifiers - Masterpiece (v5.1 [krea2])` (`versionId`: `3077110`, `modelId`: `929497`, 权重: `0.85`), 主模型文件 `krea2-masterpieces-v51.safetensors` (AutoV2: `43C97C9EBF`), AIR `urn:air:krea2:lora:civitai:929497@3077110`。
     - **LoRA 3**: `Notes of Nature by AK (Krea 2 v1)` (`versionId`: `3189191`, `modelId`: `2826739`, 权重: `1`), 主模型文件 `notesOfNatureByAK_krea2V1.safetensors` (AutoV2: `E43ECF23E8`), AIR `urn:air:krea2:lora:civitai:2826739@3189191`。
     - **LoRA 4**: `Ektachrome Fade Film (V1)` (`versionId`: `3284125`, `modelId`: `2904145`, 权重: `0.6`), 主模型文件 `ektachromeFadeFilm_v1.safetensors` (AutoV2: `B7C0E56E3D`), AIR `urn:air:krea2:lora:civitai:2904145@3284125`。
     - **Parameters**: Steps: `8`, CFG: `1`, Seed: `689794262`, Size: `832x1248`, Sampler: `euler`。
  2. `https://civitai.red/images/148135866` (Z-Image Turbo 配方，创作者: `mk68`)：
     - **Base Model**: `ZImageTurbo`
     - **Checkpoint**: `urn:air:zimageturbo:diffusionmodel:civitai:2218365@3331554` (`CyberRealistic Z-Image Turbo / v9.0`)
     - **LoRA 1**: `Tamara Von Vergin` (`MisterMR_Tamara_Von_Vergin_Zimageturbo.safetensors`, 权重: `1`), AIR `urn:air:zimageturbo:lora:civitai:3012414@3418941`。
     - **Parameters**: Steps: `9`, CFG: `1`, Seed: `552388375`, Size: `832x1216`, Sampler: `euler`。
  3. `https://civitai.red/images/148004351` (MOSS-Image SFT 双 LoRA 配方，创作者: `VelvetS`)：
     - **Base Model**: `MOSS Image`
     - **Checkpoint**: `urn:air:mossimage:diffusionmodel:civitai:3005406@3409867` (`MOSS Image / SFT`, hash `b4d1475bc7`)
     - **LoRA 1**: `MossMythD4rkL1nes.safetensors` (权重: `1`), AIR `urn:air:mossimage:lora:civitai:599757@3452384`。
     - **LoRA 2**: `MOSS_Image_SFT_8_steps_dmd_v0.1.safetensors` (权重: `1`), AIR `urn:air:mossimage:lora:civitai:3006599@3411385`。
     - **Parameters**: Steps: `10`, CFG: `1`, Seed: `2280565052`, Size: `1024x1536`, Sampler: `euler`。

### 4.2 UI 操作与逐阶段截图核查（已由 ReadMediaFile 原图与节点区域裁切逐框核实）

1. **Step 1: Civitai Native 导入预览 (`#148140013`)**
   - **截图**: `docs/evidence/2026-11-05/recipe-shapes/01-civitai-native-clean-preview.png`
   - **界面实测呈现**:
     - 底模架构与 LoRA 适配状态显示绿色 `架构兼容`（来源架构 `Krea 2 Turbo`，保留原始引用 `urn:air:krea2:diffusionmodel:civitai:2732656@3072332`）。
     - 4 个 LoRA 卡片完整显示真实模型标题、主模型权重文件名（`Mrpopo anime full potential.safetensors`, `krea2-masterpieces-v51.safetensors`, `notesOfNatureByAK_krea2V1.safetensors`, `ektachromeFadeFilm_v1.safetensors`）、来源版本、AutoV2 哈希与配方原始权重（`1`, `0.85`, `1`, `0.6`），全部标明 `可直接发送` 与规范 Civitai AIR。

2. **Step 2: 切换至 Sogni 但未选择目标模型**
   - **截图**: `docs/evidence/2026-11-05/recipe-shapes/02-sogni-unselected-honest-warning.png`
   - **界面实测呈现**:
     - 目标模型显示 `待选择` / 下拉框显示 `请选择模型`。
     - 适配状态横幅诚实显示琥珀色 `待选择目标模型 / 未核实`，LoRA 状态显示为 `未核实`（`未选择目标模型；请在上方选用目标模型以加载其实时 Schema 规范。`）。

3. **Step 3: 选定 Sogni 目标模型 `krea-2-turbo`**
   - **截图**: `docs/evidence/2026-11-05/recipe-shapes/03-sogni-krea2-schema-ready.png`
   - **界面实测呈现**:
     - 点击 `刷新目录` 加载实时目录（32 个模型）并选定 `krea-2-turbo`，显示 `✔ 实时 Schema 已就绪（包含 20 个官方参数定义，LoRA 与生图契约直接由该 Schema 约束）`。
     - 状态横幅显示琥珀色 `待核实 / 需选用目标资源`，LoRA 状态更新为 `需在目标库选用`（`Sogni 仅支持其官方目录公布的 LoRA ID (如 krea2-detail-enhancer)，不支持外部 URL 或 Civitai AIR。`）。

4. **Step 4: 载入画布 (`#148140013` Civitai Native)**
   - **截图**: `docs/evidence/2026-11-05/recipe-shapes/04-canvas-loaded-civitai.png`
   - **节点级原图裁切核实**:
     - `CheckpointLoaderSimple` 节点：可见输入框准确显示 `Civitai engine: comfy`、`Civitai ecosystem: krea2`、`Civitai model: turbo`、`目标执行引擎: Civitai 官方原生引擎`、`已选底模`、以及 `自定义模型 (model): urn:air:krea2:diffusionmodel:civitai:2732656@3072332`（绝非 `请选择引擎` 或空白）。
     - 4 个 `LoRALoader` 节点依次串联，分别显示真实 `.safetensors` 权重文件名、原始权重（`1`, `0.85`, `1`, `0.6`）与完整 Civitai AIR。
     - `KSampler 核心降噪采样` 节点：`随机种子: 689794262`、`运行后控制: 固定`（绝非 `随机`）、`步数: 8`、`CFG: 1`、`采样器: euler`、`调度器: 未指定`。

5. **Step 5: `#148140013` (Krea 2 Turbo) 真实点击运行与逐字出站 JSONL 记录**
   - **截图**: `docs/evidence/2026-11-05/recipe-shapes/05-run-civitai-native-result.png`
   - **真实出站请求体（原样摘自本次运行 `requests-2026-11-07.jsonl` 第 60 行 `requestBody`，零手工改动）**:
     `POST https://orchestration.civitai.com/v2/consumer/workflows?wait=100`
     ```json
     {
       "allowMatureContent": true,
       "steps": [
         {
           "$type": "imageGen",
           "input": {
             "engine": "comfy",
             "ecosystem": "krea2",
             "operation": "createImage",
             "model": "turbo",
             "diffusionModel": "urn:air:krea2:diffusionmodel:civitai:2732656@3072332",
             "prompt": "masterpiece, best quality, very aesthetic, ektachrome fade film, nature,\nA painterly illustration of a tall, elegant woman in her late twenties with short, dark curly hair standing confidently in a narrow, gritty sci-fi corridor. She wears a fitted teal button-up shirt and a cream pencil skirt with a brown leather belt and a satchel. She holds a leash attached to a large, alert Doberman Pinscher sitting loyally beside her. The corridor walls are lined with industrial pipes, metal panels, and worn textures, creating a claustrophobic yet detailed environment. The art style is painterly with strong ink outlines, high contrast, dynamic movement, and a gritty, atmospheric mood, with dynamic composition with high detail. The lighting is dramatic, highlighting the woman's figure against the dark, mechanical background.",
             "negativePrompt": "(2d ,Illustration, drawing, cartoon, animation, anima, painting:1.4)",
             "width": 832,
             "height": 1248,
             "steps": 8,
             "cfgScale": 1,
             "seed": 689794262,
             "quantity": 1,
             "sampler": "euler",
             "loras": {
               "urn:air:krea2:lora:civitai:2904145@3284125": 0.6,
               "urn:air:krea2:lora:civitai:2826739@3189191": 1,
               "urn:air:krea2:lora:civitai:929497@3077110": 0.85,
               "urn:air:krea2:lora:civitai:2744585@3168308": 1
             }
           }
         }
       ]
     }
     ```
   - **真实上游响应（`status: 400`，原样摘自同一 JSONL 行 `responseBody`，与截图 Toast 及 KSampler 节点报错面板逐字一致）**:
     ```json
     {"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"Bad Request","status":400,"detail":"insufficientBuzz","traceId":"00-735a2c8e9d5e932aafd792a10a58634c-92a0764ee00c4dd9-02"}
     ```

6. **Step 6: `#148135866` (Z-Image Turbo) 与 `#148004351` (MOSS-Image SFT) 真实点击运行与逐字 JSONL 记录**
   - **`#148135866` 截图**: `docs/evidence/2026-11-05/recipe-shapes/06-run-zimage-turbo-148135866.png`
     - 画布底模节点可见显示 `comfy` / `zImage` / `turbo` 与 `urn:air:zimageturbo:diffusionmodel:civitai:2218365@3331554`，KSampler 显示 `552388375` + `固定`。
     - 真实出站请求体（`requests-2026-11-07.jsonl` 第 68 行 `requestBody` 原样）：
       ```json
       {
         "allowMatureContent": true,
         "steps": [
           {
             "$type": "imageGen",
             "input": {
               "engine": "comfy",
               "ecosystem": "zImage",
               "operation": "createImage",
               "model": "turbo",
               "diffusionModel": "urn:air:zimageturbo:diffusionmodel:civitai:2218365@3331554",
               "prompt": "Ultra-photorealistic cinematic photograph, 85mm lens look, true 8K micro-detail, shallow depth of field, subtle natural film grain, crisp micro-contrast, realistic skin texture, soft outdoor lighting, realistic fabric and material textures, portrait realism, very slim body, 24 yo, \nvery beautiful sexy woman slender, skinny , wearing Crimson Peekaboo keyhole dress , smiling to the viewer Tracing jawline with fingertip , sexy pose, in Hong Kong camera view peeking from behind a corner long exposure light trails from cars stars or sparklers",
               "width": 832,
               "height": 1216,
               "steps": 9,
               "cfgScale": 1,
               "seed": 552388375,
               "quantity": 1,
               "sampler": "euler",
               "loras": {
                 "urn:air:zimageturbo:lora:civitai:3012414@3418941": 1
               }
             }
           }
         ]
       }
       ```
     - 真实上游响应（`status: 400`）：
       ```json
       {"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"Bad Request","status":400,"detail":"insufficientBuzz","traceId":"00-b2c94fdbaadad2e5af029ee3c7dbef11-7af2e65c4f27e337-02"}
       ```
   - **`#148004351` 截图**: `docs/evidence/2026-11-05/recipe-shapes/07-run-moss-image-sft-148004351.png`
     - 画布底模节点可见显示 `comfy` / `mossImage` / `sft` 与 `urn:air:mossimage:diffusionmodel:civitai:3005406@3409867`，KSampler 显示 `2280565052` + `固定`。
     - 真实出站请求体（`requests-2026-11-07.jsonl` 第 100 行 `requestBody` 原样）：
       ```json
       {
         "allowMatureContent": true,
         "steps": [
           {
             "$type": "imageGen",
             "input": {
               "engine": "comfy",
               "ecosystem": "mossImage",
               "operation": "createImage",
               "model": "sft",
               "diffusionModel": "urn:air:mossimage:diffusionmodel:civitai:3005406@3409867",
               "prompt": "Image is a digital painting depicting a medieval knight in full armor, standing prominently in the foreground. The knight is clad in intricately detailed, dark metallic armor with gold accents, exuding a sense of strength and valor. He holds a large, tattered red flag adorned with a golden emblem, possibly a lion, which flutters dramatically in the wind. The background is filled with a chaotic battlefield scene, with other knights and flags visible, suggesting a large-scale conflict. The sky is a tumultuous mix of clouds and smoke, adding to the intense atmosphere. The overall color palette is dominated by earthy tones, reds, and golds, enhancing the epic and historical feel of the artwork. The composition is dynamic, with a sense of movement and energy, capturing the essence of a fierce battle scene. <lora:MossMythD4rkL1nes:1> <lora:MOSS_Image_SFT_8_steps_dmd_v0.1:1>",
               "negativePrompt": "bad quality, bad eyes, worst quality, bad anatomy, watermark, jpeg artifact,",
               "width": 1024,
               "height": 1536,
               "steps": 10,
               "cfgScale": 1,
               "seed": 2280565052,
               "quantity": 1,
               "sampler": "euler",
               "loras": {
                 "urn:air:mossimage:lora:civitai:3006599@3411385": 1,
                 "urn:air:mossimage:lora:civitai:599757@3452384": 1
               }
             }
           }
         ]
       }
       ```
     - 真实上游响应（`status: 400`）：
       ```json
       {"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"Bad Request","status":400,"detail":"insufficientBuzz","traceId":"00-21b6ee57fb020edd29c5bf55f8fdb07a-0dce48411d1b2a89-02"}
       ```

- **验收结论**：依据项目最高规则第二条「唯一验收标准：UI 实际点击通过并产生真实产物」及用户政策「余额不足不做卡点，先集成api，错误能原样透传算暂时通过」，三次真实 UI 点击运行（Krea 2 Turbo `#148140013`、Z-Image Turbo `#148135866`、MOSS-Image SFT `#148004351`）均完整通过 Civitai Orchestration 官方鉴权与实时 OpenAPI 判别器契约校验，直达算力扣费环节并原样透传 `HTTP 400 insufficientBuzz` 及真实 `traceId`（无美化、无吞错、无静默 fallback），诚实定级为 **PASS_BILLING**（注：计费拒绝仅代表真实服务商算力余额边界与线上 Schema 契约通过，不等同于最终图像生成产物验收）。
