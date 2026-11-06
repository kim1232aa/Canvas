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
| **Civitai** | `POST https://orchestration.civitai.com/v2/consumer/workflows` | `steps[0].input.loras` (`$type: 'imageGen'`) | AIR 字典 `{ [air]: strength }` 或对象数组 `[{ air, strength }]` | dict value / `strength` | **已核实 (官方 Flux.1 工作流配方及生态约定一手证据；官方基础 submitting-work.md 未细化 LoRA 字典字段)** |
| **Together** | `POST https://api.together.ai/v1/images/generations` | `image_loras` (deprecated serverless) | 无 (FLUX.2 等原生无 `image_loras` 接入点) | N/A | **已核实 (官方参数指南一手证据: `https://docs.together.ai/docs/inference/images/parameters`)** |
| **Fal.ai** | `POST https://queue.fal.run/{model_id}` | `loras` 数组 | `path`: HTTP(S) 直链下载 URL | `scale`: float | **已核实 (官方 OpenAPI 一手证据: `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/lora`)** |
| **Runware** | `POST https://api.runware.ai/v1` | `[0].lora` (taskType: `imageInference`) | `model`: `civitai:{modelId}@{versionId}` (AIR) 或 Runware 内部模型 ID | `weight`: number | **已核实 (官方模型文档一手证据: `https://runware.ai/docs/models/bfl-flux-1-kontext-dev.md`，包含 lora[].model AIR 及 weight 字段)** |
| **Replicate** | `POST https://api.replicate.com/v1/predictions` | 动态版本 Schema 字段 (`lora_weights` / `extra_lora`) | `.safetensors` 直链下载 URL (严禁使用网页 URL) | `lora_scale` 或 `scale` | **已核实 (官方模型页一手证据: `https://replicate.com/black-forest-labs/flux-dev-lora`)** |
| **Sogni** | `POST https://api.sogni.ai/v1/creative-agent/workflows` | `input.steps[0].arguments.loras` | Sogni catalog LoRA ID 数组 (`string[]`) | `arguments.loraStrengths: number[]` | **未验证 (仅限代码实现/待外部核实)** |
| **Novita** | `POST https://api.novita.ai/v3/async/txt2img` | `request.loras` | `model_name`: Novita catalog `sd_name_in_api` | `strength`: number `[0, 1]` | **未验证 (仅限代码实现/待外部核实)** |
| **ModelsLab** | `POST https://modelslab.com/api/v6/images/text2img` | `lora_model` & `lora_strength` | `lora_model`: 逗号分隔 catalog 字符串 | `lora_strength`: string 或 number | **未验证 (仅限代码实现/待外部核实)** |
| **Venice** | `POST https://api.venice.ai/api/v1/image/generate` | 无 (官方 GenerateImageRequest 无自定义 LoRA 入口) | 无 | `lora_strength` (仅限系统捆绑模型) | **未验证 (仅限代码实现/待外部核实)** |
| **WaveSpeed** | `POST https://api.wavespeed.ai/api/v3/{model_id}` | `loras` 数组 | `path`: HTTP(S) 下载 URL | `scale`: float | **未验证 (仅限代码实现/待外部核实)** |
| **AIMLAPI** | `POST https://api.aimlapi.com/v1/images/generations` | `loras` 数组 | `path`: HTTP(S) 下载 URL 或 HF repo | `scale`: float | **未验证 (仅限代码实现/待外部核实)** |
| **Krea** | `POST https://api.krea.ai/generate/image/...` | `styles` 数组 | `id`: Krea Style ID (来自 `GET /styles`) | `strength`: number | **未验证 (仅限代码实现/待外部核实)** |
| **DeepInfra** | `POST https://api.deepinfra.com/v1/inference/{model_id}` | endpoint 属性驱动 | 待动态 schema 校验 | 待动态 schema 校验 | **未验证 (仅限代码实现/待外部核实)** |
| **ModelScope**| `POST https://api-inference.modelscope.cn/v1/images/generations` | endpoint 属性驱动 | 待动态 schema 校验 | 待动态 schema 校验 | **未验证 (仅限代码实现/待外部核实)** |
| **TensorArt** | `POST https://ap-east-1.tensorart.cloud/v1/jobs` | endpoint 属性驱动 | 待动态 schema 校验 | 待动态 schema 校验 | **未验证 (仅限代码实现/待外部核实)** |

> 注：依据项目最高规则，代码库本身的现有实现是待核实对象，严禁标注为「Verified (Production codebase)」。只有本轮实际核对过官方文档一手源的 5 家提供商列为「已核实」，其余未进行外部一手检索核实的服务商一律诚实标记为「未验证 (仅限代码实现/待外部核实)」。

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
- **Restoration**: Code restored clean, all 26 tests returned to green.

---

## 4. Real UI Acceptance Verification (BLOCKED_AUTH)

UI 真实操作状态：**BLOCKED_AUTH (真实上游鉴权 401，待有效凭据验收生图产物)**

1. **Recipe Provenance & civitai.red 获取说明**:
   - 目标配方来源：`https://civitai.red/images/64399178` (Civitai 真实社区图像 ID `64399178`)。
   - 获取方式验证：直接 HTTP GET `https://civitai.red/images/64399178` 返回的是 Next.js 客户端 SPA 外壳，页面中不包含 SSR 配方元数据；配方数据通过专用 API `https://civitai.red/api/v1/images?imageId=64399178&withMeta=true`（后端路由及提取器 `civitaiWorkflowRoute.ts:312` 均带 `withMeta=true` 参数以取得嵌套的生成参数及 LoRA 列表）真实查询、核实并提取：
     - Base Model: `Flux.1 D`
     - Checkpoint: `urn:air:flux1:checkpoint:civitai:618692@691639`
     - LoRA 1: `Cinematic 1940s` (weight: 0.3) -> `urn:air:flux1:lora:civitai:1351798@1527024`
     - LoRA 2: `Cinematic Octane` (weight: 0.2) -> `urn:air:flux1:lora:civitai:1351798@1526912`
     - Parameters: Steps: 30, CFG: 2.5, Seed: 588815599, Size: 832x1216

2. **UI Workflow Extraction & Live Target Schema Preview**:
   - 打开 Civitai Modal -> 切换至 `配方导入与适配 (Import)` 选项卡。
   - 解析目标配方，通过 `ProviderModelSelect` 选择目标提供商与具体模型（如 Runware `runware:100@1`）。
   - 预览组件实时从模型注册表获取 live schema `propertiesObj`，驱动 `adaptCivitaiRecipeToProvider` 自适应呈现：
     - 选择 Runware：LoRA 动态适配为 `civitai:1351798@1527024` 与 `civitai:1351798@1526912`，目标格式为 `air`（标明「可直接发送」）；Checkpoint 提示跨命名空间「需重选」；CFG 准确映射为 `CFGScale (2.5)`。
     - 若未选择具体目标模型或模型无 live schema，如实展示 `unverified`（未核实）提示，不再回退到假称 supported/unsupported 的硬编码静态表。

3. **Canvas Node Loading & Real Outbound Run (Authentic Upstream 401)**:
   - 点击「一键生成工作流并载入画布」-> 画布生成 9 个完整节点：
     - Checkpoint 节点：`[当前] urn:air:flux1:checkpoint:civitai:618692@691639`
     - LoRA 节点 1：`cinematic-1940s.safetensors`，模型权重 `0.3`，CLIP 权重 `0.3`，Civitai AIR `urn:air:flux1:lora:civitai:1351798@1527024`
     - LoRA 节点 2：`cinematic-octane.safetensors`，模型权重 `0.2`，CLIP 权重 `0.2`，Civitai AIR `urn:air:flux1:lora:civitai:1351798@1526912`
     - 正向 Prompt、负向 Prompt、Latent 分辨率 (832x1216)、KSampler (30 steps, CFG 2.5, seed 588815599)、VAE Decode、Save Image。
   - 点击 `run-button` (`运行：保存与预览图像 (Save Image)`):
     - 未配置 Key 时：前端 Toast 如实报错 `未配置密钥: 未配置 Civitai 的密钥`。
     - 配置测试 Key 时：发起真实网络请求至 Civitai Orchestration 官方端点 (`https://orchestration.civitai.com/v2/consumer/workflows`)，上游返回真实 HTTP 401 Unauthorized 响应体：
       `{"type":"https://tools.ietf.org/html/rfc9110#section-15.5.2","title":"Unauthorized","status":401,"traceId":"00-242b2f530d622191352db642d002ff24-a8f1e6e85c1841e3-02"}`
     - 前端原样完整显示上游报错，绝无 mock、伪造生图结果或静默容灾。
   - **验收状态结论**：依据项目最高规则第二条「唯一验收标准：UI 实际点击通过并产生真实产物」，因测试 Token 未通过 Civitai 官方鉴权，真实算力未接受 wire payload 生成图像产物，故本项验收诚实定级为 **BLOCKED_AUTH**，待具备有效官方 API Token 时可直接产生真实图像交付物。
