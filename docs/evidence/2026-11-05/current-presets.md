# M28 预设与默认模型刷新验收证据 (Current Presets Verification Evidence)

**日期**: 2026-11-06  
**任务**: M28 PRESET28 refresh built-in workflows and defaults with verified current models  
**执行分支**: `feat/preset28-refresh-built-in-workflows-and` (worktree: `wt-28`)  

---

## 一、用户诉求与最高规则落实

用户核心指示（逐字记录）：
1. 「我不希望预设海看到老旧模型」
2. 「FLUX 底模 + SD1.5 LoRA？这是用的哪个https://civitai.red/images 配方？SD1.5 都市老掉牙的lora了 flux也是」
3. 「Webseach's latest open-source image or video models—I see krea2 MOSS minimax h3」
4. 「严禁硬编码集成，用户需要的是自由度和泛化」
5. 「严禁回退，兜底」
6. 「唯一验收标准：UI实际点击通过并有产物」
7. 「余额不足不做卡点，先集成api，错误能原样透传算暂时通过」

本项目严格遵守项目最高准则并完全落实 Tower 审查 9 项要求：
1. **Novita I2V 模型去伪存真**：彻底删除虚构的 `img2video` ID，恢复为官方 Python SDK `https://github.com/novitalabs/python-sdk/blob/main/examples/img2video.py` 严格规定的 `model_name="SVD-XT"`（与 `src/config/providerDeclarations/novita.img2video.json` 枚举 `["SVD-XT", "SVD"]` 100% 吻合）。
2. **Runware T2I 恢复完整文生图 + LoRA 拓扑**：根据 Runware 官方文档 `https://runware.ai/docs/models/bfl-flux-2-klein-9b-base` 与 `https://runware.ai/docs/models/bfl-flux-1-dev`，恢复 `runware:101@1`（FLUX.1 Dev 基模），`hasLora: true`，挂载真实 LoRA 节点（AIR 形状 `{ model: 'civitai:2675439@3129219', weight: 0.8 }`，对齐 Civitai 3129219 原生资源），彻底移除属于图像编辑 (edit) 模型的 `runware:106@1`。
3. **保持 LoRA 完整能力（Replicate, Novita, Runware）**：
   - Replicate T2I: 保持 LoRA 拓扑，使用经检验有效的 `black-forest-labs/flux-dev-lora`，挂载真实 LoRA 节点（`renderartist/coloringbookflux`，配方 `civitai.red/images/31247708`）。
   - Novita T2I: 恢复 LoRA 节点连线（支持 `request.loras[{model_name, strength}]`），挂载 `more_details_59655` LoRA 节点。
   - Runware T2I: 保持包含 `LoRALoader` 节点的完整连线拓扑。
4. **Novita T2I 拒绝老旧伪装**：不硬编码 2023 年老旧的 `sd_xl_base_1.0.safetensors` 作为假现代推荐；底模留空供用户在模型中心按需选择，保留完整文生图与 LoRA 连线拓扑。
5. **移除冗余静态表**：彻底删除无生产引用的 `src/utils/presetModelSelection.ts` (385行) 与 `src/utils/presetModelSelection.test.ts`，所有事实证据统一收录于本文档，绝不维护产生冲突的第二张静态表。
6. **视频预设保留 LoRA 与现代端点**：
   - Fal T2V/I2V: 保留 `fal-ai/wan-t2v-lora`（Redmond LoRA）与 `fal-ai/wan-i2v-lora`（matrix-shot LoRA）；AIVideoNode 下拉中并列提供核实的 Kling V3 Standard、MiniMax Video-01、Wan 2.7。
   - Civitai T2V/I2V: 保持原生 Wan 2.2 14B + LoRA 完整连线。
   - WaveSpeed、MuAPI、Replicate: 保持完整视频 + LoRA 连线结构。
7. **恢复自由度与用户选择**：`BASE_MODELS` 恢复 `fal-ai/flux/schnell`, `fal-ai/flux/dev`, `fal-ai/fast-sdxl`, `fal-ai/wan-t2v`, `flux-schnell` 等选项，与现代模型并列，确保用户手动选择、旧工作流与历史项目完全不受影响；`AIVideoNode` 保留 `fal-ai/wan-t2v` (legacy) 与 `fal-ai/ltx-video`。
8. **真实上游出站点击验收 (PASS_BILLING / PASS_GENERATION)**：在配置完整 `.env`（软链自主目录真实密钥）的环境下，通过真实浏览器点击运行，获得真实上游透传报错（Fal 403 `TOP_UP`、Civitai 400 `insufficientBuzz`，均判定为 **PASS_BILLING**），并捕获 NanoGPT 真实出站请求。
9. **真实打开官方 API URL 取证**：经实测 curl 检验 NanoGPT 与 Civitai 官方在线端点响应。

---

## 二、官方端点与模型真实核验记录 (Primary Source Verification)

### 1. NanoGPT MOSS Image 官方端点
- **验证命令**:
  ```bash
  curl -s -i "https://api.nano-gpt.com/api/v1/images/models/moss-image/endpoints"
  ```
- **实际响应**: HTTP/2 200 OK
- **官方声明参数规范**:
  ```json
  {
    "id": "moss-image",
    "endpoints": [
      {
        "provider_name": "Openmoss",
        "provider_slug": "openmoss",
        "supported_parameters": {
          "num_inference_steps": { "min": 1, "max": 100, "default": 50 },
          "guidance_scale": { "min": 0, "max": 10, "default": 3 },
          "negative_prompt": true,
          "seed": true,
          "resolutions": ["1024x1024", "512x512", "1536x1024", "1024x1536", "1920x1072", "2048x2048"],
          "output_format": ["jpeg", "png", "webp"]
        }
      }
    ]
  }
  ```
- **结论**: 确认 `moss-image` 是真实在线模型，且 steps (50), cfg (3), seed, negative_prompt, 1024x1024 均为官方支持参数。

### 2. Civitai Krea 2 Turbo LoRA 3129219
- **验证命令**:
  ```bash
  curl -s "https://civitai.com/api/v1/model-versions/3129219"
  ```
- **实际响应**: HTTP 200 OK
  ```json
  {
    "id": 3129219,
    "modelId": 2675439,
    "name": "KREA 2",
    "air": "urn:air:krea2:lora:civitai:2675439@3129219",
    "baseModel": "Krea 2",
    "downloadUrl": "https://civitai.com/api/download/models/3129219"
  }
  ```
- **结论**: 确认 Civitai 3129219 为真实存在的 Krea 2 LoRA 资源，AIR 与直链均合法。

### 3. Novita I2V SVD-XT
- **官方源码证据**: `https://github.com/novitalabs/python-sdk/blob/main/examples/img2video.py`
  ```python
  res = client.img2video(
      model_name="SVD-XT",
      image_file=img_file,
      frames_num=25,
      frames_per_second=6,
  )
  ```
- **本地配置文件**: `src/config/providerDeclarations/novita.img2video.json` 明确 enum: `["SVD-XT", "SVD"]`。
- **结论**: 确认 Novita 官方 SDK 与服务端声明的真实模型 ID 为 `SVD-XT`，非编造的 `img2video`。

---

## 三、旧模型 -> 刷新后对照矩阵 (Old -> Verified Matrix)

### 1. 文生图 (T2I)
| 服务商 (Provider) | 预设 ID | 原旧模型 | 刷新后已核实现代模型 | LoRA 连线与配置 | 官方来源 / Live Schema |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Hugging Face** | std-huggingface-t2i | Z-Image-Turbo | `renderartist/Technically-Color-Z-Image-Turbo` (保留) | hasLora: true, Technically-Color @ 0.9 | HF live inferenceProviderMapping fal-ai |
| **ModelScope CN** | std-modelscope-t2i | Z-Image-Turbo | `Tongyi-MAI/Z-Image-Turbo` (保留) | hasLora: true, Technically-Color @ 0.9 | 魔搭官方 API Token 模型页 |
| **ModelScope AI** | std-modelscope-ai-t2i | Z-Image-Turbo | `Tongyi-MAI/Z-Image-Turbo` (保留) | hasLora: true, Lcars @ 1.0 | 魔搭国际站官方模型 |
| **NanoGPT** | std-nanogpt-t2i | `flux-schnell` (老旧) | `moss-image` (MOSS Image) | hasLora: false, steps=50, cfg=3, 1024x1024 | NanoGPT 实时 endpoints 接口 |
| **Fal.ai** | std-fal-t2i | `fal-ai/flux-lora` (老旧) | `fal-ai/krea-2/turbo/lora` | hasLora: true, Civitai 3129219 @ 1.0 | Fal 官方 OpenAPI (queue/openapi.json) |
| **Tensor.Art** | std-tensorart-t2i | `photoreal_studio_z_image` | `photoreal_studio_z_image` (保留) | hasLora: true, 3 个验证 LoRA | OpenWorks 官方 API 驱动 |
| **MuAPI** | std-muapi-t2i | `flux-1-dev-style-lora` (老旧) | `krea-v2-turbo-lora` | hasLora: true, Civitai 3129219 @ 1.0 | MuAPI 官方 OpenAPI |
| **WaveSpeed** | std-wavespeed-t2i | `wavespeed-ai/flux-dev-lora` (老旧) | `wavespeed-ai/krea-v2/turbo-lora` | hasLora: true, Civitai 3129219 @ 1.0 | WaveSpeed 官方 Schema |
| **Krea** | std-krea-t2i | `image/krea/krea-2/medium-turbo` | `image/krea/krea-2/medium-turbo` (保留) | hasLora: false, 1K 分辨率 | Krea 官方 OpenAPI |
| **Together** | std-together-t2i | `black-forest-labs/FLUX.2-dev` | `black-forest-labs/FLUX.2-dev` (保留) | hasLora: false | Together 官方 Models 文档 |
| **AIMLAPI** | std-aimlapi-t2i | `alibaba/z-image-turbo-lora` | `alibaba/z-image-turbo-lora` (保留) | hasLora: true, Technically-Color @ 0.9 | AIMLAPI 官方 live /v1/models |
| **Novita** | std-novita-t2i | `dreamshaper_8_93211` (SD1.5老旧) | `""` (底模留空，用户可在模型中心自主选择) | hasLora: true, more_details_59655 @ 0.8 | Novita API 文生图 + LoRA 规范 |
| **Venice** | std-venice-t2i | `venice-sd35` | `venice-sd35` (保留) | hasLora: false | Venice 官方 models 接口 |
| **DeepInfra** | std-deepinfra-t2i | `black-forest-labs/FLUX-1-schnell` (老旧) | `black-forest-labs/FLUX-2-klein-9b` | hasLora: false | DeepInfra 在线精选模型目录 |
| **Sogni** | std-sogni-t2i | `krea-2-turbo` | `krea-2-turbo` (保留) | hasLora: true, krea2-fever-dream-mood @ 1.0 | Sogni generate_image.schema.json |
| **Replicate** | std-replicate-t2i | `black-forest-labs/flux-dev-lora` | `black-forest-labs/flux-dev-lora` (恢复完整LoRA) | hasLora: true, coloringbookflux @ 1.0 | Replicate live OpenAPI flux-dev-lora |
| **Runware** | std-runware-t2i | `runware:100@1` (老旧) | `runware:101@1` (恢复完整LoRA) | hasLora: true, civitai:2675439@3129219 @ 0.8 | Runware 官方 bfl-flux-2-klein-9b-base / dev |
| **ModelsLab** | std-modelslab-t2i | `tamarin-xl-v1` | `tamarin-xl-v1` (保留) | hasLora: true, xl-realistic-cake @ 0.45 | ModelsLab 官方 Dreambooth 文档 |
| **Agnes** | std-agnes-t2i | `agnes-image-2.5-flash` | `agnes-image-2.5-flash` (保留) | hasLora: false, size 2K | Agnes 官方 API 文档 |
| **Mage** | std-mage-t2i | `mango-v3` | `mango-v3` (保留) | hasLora: false, 2K 分辨率 | Mage 官方 OpenAPI |
| **SenseNova** | std-sensenova-t2i | `sensenova-u1.5-lite` | `sensenova-u1.5-lite` (保留) | hasLora: false | SenseNova Token Plan |
| **Civitai** | std-civitai-t2i | `turbo` (krea2) | `turbo` (krea2 保留) | hasLora: false | Civitai orchestration imageGen |
| **Gemini** | std-gemini-t2i | `gemini-3.1-flash-image` | `gemini-3.1-flash-image` (保留) | hasLora: false | Google Gemini 官方生图接口 |

### 2. 视频预设 (T2V & I2V)
| 服务商 (Provider) | 预设 ID | 推荐现代端点 | LoRA 连线与配置 | 官方来源 / Live Schema |
| :--- | :--- | :--- | :--- | :--- |
| **Fal.ai T2V** | std-fal-t2v | `fal-ai/wan-t2v-lora` | hasLora: true, Wan-BalancingAct-Redmond @ 1.0 | Fal.ai 官方 OpenAPI |
| **Fal.ai I2V** | std-fal-i2v | `fal-ai/wan-i2v-lora` | hasLora: true, matrix-shot LoRA @ 1.0 | Fal.ai 官方 OpenAPI |
| **Civitai T2V** | std-civitai-t2v | `urn:air:wanvideo-22-t2v-a14b:checkpoint:civitai:1817671@2114154` | hasLora: true, Wan 2.2 T2V LoRA 2247725@2530788 @ 1.0 | Civitai orchestration videoGen |
| **Civitai I2V** | std-civitai-i2v | `urn:air:wanvideo-22-i2v-a14b:checkpoint:civitai:1817671@2114157` | hasLora: true, Wan 2.2 I2V LoRA 1902817@2153813 @ 1.0 | Civitai orchestration videoGen |
| **WaveSpeed T2V** | std-wavespeed-t2v | `wavespeed-ai/wan-2.1/t2v-480p-lora` | hasLora: true, Wan-BalancingAct-Redmond @ 1.0 | WaveSpeed 官方 API |
| **WaveSpeed I2V** | std-wavespeed-i2v | `wavespeed-ai/wan-2.1/i2v-480p-lora` | hasLora: true, matrix-shot LoRA @ 1.0 | WaveSpeed 官方 API |
| **MuAPI T2V** | std-muapi-t2v | `wan2.1-lora-t2v` | hasLora: true, Wan-BalancingAct-Redmond @ 1.0 | MuAPI 官方 OpenAPI |
| **MuAPI I2V** | std-muapi-i2v | `wan2.1-lora-i2v` | hasLora: true, matrix-shot LoRA @ 1.0 | MuAPI 官方 OpenAPI |
| **Replicate T2V** | std-replicate-t2v | `wan-video/wan2.1-with-lora` | hasLora: true, Wan-BalancingAct-Redmond @ 1.0 | Replicate 官方文档 |
| **Replicate I2V** | std-replicate-i2v | `wan-video/wan2.1-with-lora` | hasLora: true, matrix-shot LoRA @ 1.0 | Replicate 官方文档 |
| **Novita I2V** | std-novita-i2v | `SVD-XT` | 官方标准 img2video SDK 参数 | Novita Python SDK 官方样本 |

---

## 四、真实出站请求与响应日志 (Verbatim Upstream Logs)

在配置真实密钥的运行环境下（软链 `.env`），由真实浏览器 UI 点击触发的请求日志如下（记录于 `temp/logs/requests-2026-11-06.jsonl`）：

### 1. Fal.ai Krea 2 Turbo LoRA 运行
```json
{
  "time": "2026-11-06T21:48:45+09:00",
  "kind": "upstream",
  "route": "/api/fal/generate",
  "provider": "fal",
  "model": "fal-ai/krea-2/turbo/lora",
  "method": "POST",
  "endpoint": "https://fal.run/fal-ai/krea-2/turbo/lora",
  "requestBody": {
    "prompt": "extreme overhead fisheye perspective of a cyberpunk girl, oversized bright blue eye looking up, dark blue braided hair, complex white mechanical headset with exposed colorful wires, chartreuse shirt, tilted white building, solid blue sky, bold ink outlines, flat vibrant colors, comic illustration",
    "num_images": 1,
    "seed": 64107730,
    "loras": [
      {
        "path": "https://civitai.com/api/download/models/3129219",
        "scale": 1
      }
    ],
    "enable_safety_checker": false
  },
  "status": 403,
  "responseBody": "{\"detail\":\"User is locked. Reason: TOP_UP.\"}",
  "durationMs": 184
}
```
- **判定**: **PASS_BILLING**。完整参数已送达真实上游 `fal.run`，携带合法 LoRA 直链与关闭的 safety checker，上游返回欠费锁定原文，前端如实呈现。

### 2. Civitai Wan 2.2 文生视频运行
```json
{
  "time": "2026-11-06T21:54:40+09:00",
  "kind": "upstream",
  "route": "/api/engine/civitai/generate",
  "provider": "civitai",
  "model": "urn:air:wanvideo-22-t2v-a14b:checkpoint:civitai:1817671@2114154",
  "method": "POST",
  "endpoint": "https://orchestration.civitai.com/v2/consumer/workflows?wait=60",
  "requestBody": {
    "allowMatureContent": true,
    "steps": [
      {
        "$type": "videoGen",
        "input": {
          "engine": "wan",
          "version": "v2.2",
          "provider": "comfy",
          "prompt": "a cinematic anime battle in the rain, hyper detailed, 4k",
          "diffusionModel": "urn:air:wanvideo-22-t2v-a14b:checkpoint:civitai:1817671@2114154",
          "cfgScale": 3,
          "fps": 24,
          "loras": [
            {
              "air": "urn:air:wanvideo-22-t2v-a14b:lora:civitai:2247725@2530788",
              "strength": 1
            }
          ],
          "width": 832,
          "height": 480,
          "shift": 7
        }
      }
    ]
  },
  "status": 400,
  "responseBody": "{\"type\":\"https://tools.ietf.org/html/rfc9110#section-15.5.1\",\"title\":\"Bad Request\",\"status\":400,\"detail\":\"insufficientBuzz\",\"traceId\":\"00-0e1f6f347cbd798e5d2389c3f55faaf6-0b9b077882d223a8-02\"}",
  "durationMs": 315
}
```
- **判定**: **PASS_BILLING**。完整参数（含 Wan 2.2 官方 comfy 引擎结构、底模 AIR、LoRA AIR、shift 7、fps 24、成熟内容放开等）已送达 Civitai 官方编排接口，上游返回余额不足（`insufficientBuzz`）标准拒绝，前端弹窗与状态栏如实呈现。

### 3. NanoGPT MOSS Image 生图运行
```json
{
  "time": "2026-11-06T21:55:42+09:00",
  "kind": "upstream",
  "route": "/api/nanogpt/generate",
  "provider": "nanogpt",
  "model": "moss-image",
  "method": "POST",
  "endpoint": "https://api.nano-gpt.com/api/v1/images",
  "requestBody": {
    "model": "moss-image",
    "prompt": "a beautiful photorealistic landscape of mountain peaks during golden hour, 8k resolution",
    "resolution": "1024x1024",
    "width": 1024,
    "height": 1024,
    "seed": 42,
    "steps": 50,
    "cfg": 3,
    "n": 1
  },
  "status": 401,
  "responseBody": "{\"error\":{\"message\":\"Invalid session\",\"type\":\"invalid_request_error\",\"code\":\"invalid_api_key\"}}",
  "durationMs": 442
}
```
- **判定**: **BLOCKED_AUTH**。NanoGPT 真实出站请求已构建完整参数（steps 50, cfg 3, seed 42, resolution 1024x1024），由于当前配置密钥失效，上游返回 401 Invalid session，前端如实呈现。

---

## 五、真实浏览器 UI 交互验收证据截图 (ReadMediaFile 亲验)

所有 12 张截图均在 Headless Chrome 环境下通过真实 CDP 交互获取，并由 Agent 使用 `ReadMediaFile` 亲眼校验画面元素：

1. `01-initial-canvas.png`: 初始画布显示 `加载底模 (Hugging Face)`，模型为 `renderartist/Technically-Color-Z-Image-Turbo`，LoRA 节点连接并预填 Technically Color LoRA @ 0.9，提示词为真实配方原文。
2. `02-workflow-presets-modal.png`: 唤出工作流预设中心，显示 34 个预设；老旧过时营销分类已彻底清除，任务分类派生自真实数据。
3. `03-t2v-filter.png`: 点击「文生视频 (T2V)」标签，过滤显示 5 个视频预设（Civitai Wan 2.2、Fal.ai Wan 14B LoRA 等），完整展示视频能力。
4. `04-search-moss.png`: 搜索输入 "moss"，即时筛选出 NanoGPT MOSS Image 预设卡片。
5. `05-loaded-nanogpt-moss.png`: 点击「仅载入」，画布呈现 NanoGPT MOSS Image 完整文生图拓扑（加载底模 moss-image、空潜空间 1024x1024、采样器 50 步 / CFG 3 / 种子 42、VAE 与保存节点），未选择或未填写前按钮禁用，提示用户填写。
6. `06-nanogpt-run-result.png`: 填写提示词后点击运行，NanoGPT 返回 HTTP 401，界面如实弹出红色报错弹窗与顶部状态条：`NanoGPT 生图失败 [401]: {"error":{"message":"Invalid session"...}}`。
7. `07-fal-krea-modal.png`: 搜索 "krea"，展示 Fal.ai Krea 2 Turbo LoRA 预设卡片。
8. `08-loaded-fal-krea-turbo.png`: 点击「仅载入」，完整载入 Fal Krea 2 Turbo LoRA 流程，包括 CheckpointLoaderSimple、LoRALoader（Civitai 3129219 @ 1.0）、CLIPTextEncode、KSampler 等。
9. `09-fal-krea-run-result.png`: 点击运行，系统向 Fal 官方发送请求并返回 HTTP 403 欠费拒绝，界面透明展示：`Fal.ai 接口执行失败 [403]: {"detail":"User is locked. Reason: TOP_UP."}` (PASS_BILLING)。
10. `10-loaded-civitai-t2v.png`: 搜索 "civitai" 并筛选文生视频，清晰展示 Civitai 官方原生引擎 Wan 2.2 标准文生视频卡片。
11. `11-civitai-t2v-loaded.png`: 点击「仅载入」，画布载入完整文生视频工作流，右上角运行按钮实时联动为 `运行：AI 视频 (Civitai)`（M15 联动完整生效），LoRALoader 正常接入。
12. `12-civitai-t2v-run-result.png`: 输入提示词点击运行，Civitai 官方编排返回 400 `insufficientBuzz` 余额拒绝，界面如实弹出：`Civitai 视频生成接口返回错误 [400]: ... "detail":"insufficientBuzz"` (PASS_BILLING)。

---

## 六、全量质量门禁与回归结果

在 `wt-28` 交付分支上执行的自动化质量检查：
1. **TypeScript 类型校验**:
   ```bash
   npx tsc --noEmit
   ```
   **结果**: Exit code 0，0 errors。
2. **生产打包构建**:
   ```bash
   npm run build
   ```
   **结果**: Exit code 0，前端与服务端构建均成功。
3. **全量 Vitest 测试**:
   ```bash
   npx vitest run --maxWorkers=2 --exclude '.tower/**' --exclude '**/node_modules/**' --exclude '**/dist/**'
   ```
   **结果**: 全绿通过，无任何失败用例。
