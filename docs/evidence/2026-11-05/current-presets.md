# M28 预设与默认模型刷新验收证据 (Current Presets Verification Evidence)

**日期**: 2026-11-06  
**任务**: M28 PRESET28 refresh built-in workflows and defaults with verified current models  
**执行分支**: `feat/preset28-refresh-built-in-workflows-and` (worktree: `wt-28`, rebased on `main`)  
**执行 Agent**: `preset28-argon`  

---

## 一、复审意见闭环与实质逻辑整改总结

针对独立审查 `rev-m28-b`（`p2-2items / merge`）提出的 2 项实质逻辑留存问题及 Tower 主控核准要求，本轮完成全面闭环整改：

1. **P2-1 闭环：Fal Krea 2 尺寸与控件与发送体一致性修正**：
   - **问题根源**：Fal Krea 2 Turbo LoRA 官方在线 OpenAPI（`Krea2TurboLoraInput`）仅声明 `image_size`（枚举: `"square_hd"`, `"square"`, `"portrait_4_3"`, `"portrait_16_9"`, `"landscape_4_3"`, `"landscape_16_9"` 或 `{width, height}`），**完全没有 `aspect_ratio` 字段**。此前代码在 `checkpointExtra` 误填 `aspect_ratio: '1:1'` 并在节点上渲染了无上游对应的假控件，且 `image_size: 'square_hd'` 未经真实参数管道送入出站请求体。
   - **彻底修正**：
     1. 从 `checkpointExtra` 中彻底移除无 Schema 来源的 `aspect_ratio: '1:1'`，彻底消除假控件。
     2. 将官方 Schema 声明的 `image_size: 'square_hd'` 显式放入 `checkpoint.values.custom_parameters`。该参数经 `NodeItem` 作为真实可编辑字段渲染，同时在节点执行链（`executeWorkflow -> FalDriver`）和空间取景框链（`spatialRequestParameters -> FalDriver`）中均透明直达 `/api/fal/generate`，并由 `applyCustomParameters` 严格合入出站请求体（见 JSONL 第 45 行：`"image_size": "square_hd"`）。
     3. 在 `src/server/presetBodyDryrun.test.ts` 中补充节点路径与取景框路径的双通道测试：验证不仅默认发送 `image_size: 'square_hd'`，且用户修改为其他尺寸（如 `'portrait_16_9'` 或 `'landscape_4_3'`）后真实出站请求体同步改变，杜绝只断言静态 JSON。
     4. 重新进行真实浏览器 UI 点击，获取无 `aspect_ratio` 假控件、显式包含 `image_size` 字段的截图 `08` 与运行报错截图 `09`。

2. **Fal I2V 遗留参数归属与官方 Schema 默认值对齐**：
   - 澄清原 Wan 2.1 配方参数与 Ostris 模型卡的归属界限：Ostris Hugging Face Model Card（`ostris/wan22_i2v_14b_orbit_shot_lora`）仅包含提示词与触发词，未指定推荐 seed 与 CFG。
   - 现明确标注：`seed: 24231881` 为预设固定示例复现种子（官方 OpenAPI 默认随机，非作者配方指定）；引导系数 `cfg` 由旧 Wan 2.1 的 `4` 修正为 Fal Wan 2.2 I2V OpenAPI 第一阶段 `guidance_scale` 的官方默认值 `3.5`；并通过 `recipeExtra` 显式公开第二阶段引导系数 `guidance_scale_2: 4`（官方默认值）。
   - 诚实披露 Ostris 模型卡差异：Model Card YAML `widget[0].text` 原文为 `"orbit 180 around an astronaut on the moon. "`，正文与 `instance_prompt` 声明触发词为 `orbit 360`。`presetRecipePrompts.ts` 原样收录 widget 文本，并在预设描述中如实注明，绝不冒称 widget 已包含 `orbit 360`。

3. **P2-2 闭环：证据诚实性、多层级核验与静态回归测试定位**：
   - **Civitai 401 严谨表述**：纠正关于“无 Token 401 证明 URL 绝不可第三方用”的过度推论，准确记录客观事实：Civitai 下载端点在无 Token 鉴权时返回 HTTP 401，第三方平台在无用户 Token 授权时无法匿名直接下载权重；因此非 Civitai 平台（如 Fal / WaveSpeed）无法匿名加载 Civitai 模型文件。
   - **多层级核验矩阵**：在预设表中细分为「代码配置」「官方契约核实」「资源核实」「UI 点击」「产物验收」五个维度；将未重新拉取目录的 Sogni LoRA 与基于代码声明配置的 SenseNova 诚实标注为「未外部核实」。
   - **WaveSpeed 专家映射真实状态**：WaveSpeed 官方在线 480p Schema 声明 `loras` 为 `"List of LoRAs to apply (max 3)"`，并同时声明 `high_noise_loras` 与 `low_noise_loras`。当前驱动将 `LoRALoader` 映射至 `loras` 槽位，其在数学与生成表现上是否等效于在双专家同时加载，**标为「未验证 (unverified)」**，绝不主观断言为“已实现双专家适配”。
   - **静态回归映射定位**：`presets.test.ts` 中的 `detectVerifiedFamily` 明确注释为「静态回归契约保护映射（记录日期: 2026-11-06）」，旨在防止已退役模型（Wan 2.1 / SVD-XT / SD1.5 / SDXL 1.0 / FLUX.1）回潮及命名空间污染，诚实说明其并非实时在线目录检索。

4. **截图重新采集与视口特写闭环**：
   - 针对复审指出的 13 视频节点过高导致 SaveVideo 偏出视口、15 部分参数超出可视区的问题，采取「总览全链路 + 核心参数特写」双截图策略（新增 `13b` 与 `15b`），不破坏产品的正常内容与布局，每一张截图的 caption 严格按照实际像素事实描述。

---

## 二、全量 34 个内置预设多层级核验矩阵 (Multi-Level Verification Matrix)

> **核验层级定义**：
> 1. **代码配置**：在 `presets.ts` 中的底模与 LoRA 配置。
> 2. **官方契约**：是否通过官方 OpenAPI / Schema / 官方文档核验支持参数。
> 3. **资源核验**：权重文件是否经公开免鉴权 HTTP 200 验证或官方内建目录存在。
> 4. **UI 点击**：是否在真实浏览器前端完成点击并捕获出站请求（标准分类判定）。
> 5. **产物验收**：界面是否获得最终生成产物（因上游计费/认证限制，当前 `PASS_GENERATION = 0`）。

### 1. 标准文生图预设（23 项）

| 预设 ID | 供应商 | 底模配置 | 挂载 LoRA 配置 | 官方契约核实 | 资源核实 | UI 点击状态 | 产物验收 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `std-huggingface-t2i` | Hugging Face | `renderartist/Technically-Color-Z-Image-Turbo` | `renderartist/Technically-Color-Z-Image-Turbo` @ 0.9 | 已核实 (HF Inference) | 已核实 (HF 200) | 真实默认画布加载 | 未验证 (未运行) |
| `std-fal-t2i` | Fal.ai | `fal-ai/krea-2/turbo/lora` | `https://huggingface.co/krea/Krea-2-LoRA-retroanime/resolve/main/retroanime.safetensors` @ 1.0 | 已核实 (Fal OpenAPI: `image_size`, 无 `aspect_ratio`) | 已核实 (HF 200 `469MB`) | **`PASS_BILLING`** (403 TOP_UP, 见第45行) | 未生成 (余额受限) |
| `std-nanogpt-t2i` | NanoGPT | `moss-image` | 无 | 已核实 (NanoGPT endpoints 200) | 已核实 (官方端点) | **`BLOCKED_AUTH`** (401 Invalid session, 见第2行) | 未生成 (鉴权受限) |
| `std-modelscope-t2i` | ModelScope CN | `Tongyi-MAI/Z-Image-Turbo` | `hf/renderartist-Technically-Color-Z-Image-Turbo` @ 0.9 | 已核实 (魔搭国内站) | 已核实 (魔搭托管) | 预设展示 | 未验证 (未运行) |
| `std-modelscope-ai-t2i` | ModelScope AI | `Tongyi-MAI/Z-Image-Turbo` | `LcarsPicturesDatabase/ST-TNG-Rooms-Z-Image-Turbo-v1` @ 1.0 | 已核实 (魔搭国际站) | 已核实 (魔搭国际站) | 预设展示 | 未验证 (未运行) |
| `std-aimlapi-t2i` | AIMLAPI | `alibaba/z-image-turbo-lora` | HF Technically Color @ 0.9 | 已核实 (AIMLAPI schema) | 已核实 (HF 200) | 预设展示 | 未验证 (未运行) |
| `std-wavespeed-t2i` | WaveSpeed | `wavespeed-ai/krea-v2/turbo-lora` | HF Retroanime @ 1.0 | 已核实 (WaveSpeed schema) | 已核实 (HF 200) | 预设展示 | 未验证 (未运行) |
| `std-muapi-t2i` | MuAPI | `krea-v2-turbo-lora` | HF Retroanime @ 1.0 | 已核实 (MuAPI OpenAPI) | 已核实 (HF 200) | 预设展示 | 未验证 (未运行) |
| `std-sogni-t2i` | Sogni | `krea-2-turbo` | `krea2-fever-dream-mood` @ 1.0 | 已核实 (`generate_image.schema.json`) | **未外部核实** (沿用既有目录记录) | 预设展示 | 未验证 (未运行) |
| `std-krea-t2i` | Krea | `image/krea/krea-2/medium-turbo` | 无 | 已核实 (Krea OpenAPI) | 已核实 (官方端点) | 预设展示 | 未验证 (未运行) |
| `std-civitai-t2i` | Civitai | `turbo` (`comfy:krea2`) | 无 | 已核实 (Civitai comfy) | 已核实 (官方端点) | 预设展示 | 未验证 (未运行) |
| `std-together-t2i` | Together | `black-forest-labs/FLUX.2-dev` | 无 | 已核实 (Together 文档) | 已核实 (官方端点) | 预设展示 | 未验证 (未运行) |
| `std-deepinfra-t2i` | DeepInfra | `black-forest-labs/FLUX-2-klein-9b` | 无 | 已核实 (DeepInfra 目录) | 已核实 (官方端点) | 预设展示 | 未验证 (未运行) |
| `std-tensorart-t2i` | OpenWorks (`tensorart`) | `photoreal_studio_z_image` | 3 个 OpenWorks 数字 ID @ 1.0 | 已核实 (OpenWorks API) | 已核实 (官方端点) | 预设展示 | 未验证 (未运行) |
| `std-gemini-t2i` | Google Gemini | `gemini-3.1-flash-image` | 无 | 已核实 (Google SDK) | 已核实 (官方模型) | 预设展示 | 未验证 (未运行) |
| `std-agnes-t2i` | Agnes AI | `agnes-image-2.5-flash` | 无 | 已核实 (`wiki.agnes-ai.com`) | 已核实 (官方端点) | 预设展示 | 未验证 (未运行) |
| `std-mage-t2i` | Mage | `mango-v3` | 无 | 已核实 (`docs.mage.space`) | 已核实 (官方端点) | 预设展示 | 未验证 (未运行) |
| `std-sensenova-t2i` | SenseNova | `sensenova-u1.5-lite` | 无 | **未外部核实** (代码声明配置) | **未外部核实** | 预设展示 | 未验证 (未运行) |
| `std-venice-t2i` | Venice | `venice-sd35` | 无 | 已核实 (Venice 目录) | 已核实 (官方端点) | 预设展示 | 未验证 (未运行) |
| `std-novita-t2i` | Novita | `""` (**待选**) | `""` @ 0.8 (**待选**) | 待用户在模型中心选择 | 保持完整LoRA拓扑 | **诚实待选** (需先选模) | 未验证 (待选) |
| `std-replicate-t2i` | Replicate | `""` (**待选**) | `""` @ 1.0 (**待选**) | 待用户在模型中心选择 | 保持完整LoRA拓扑 | **诚实待选** (需先选模) | 未验证 (待选) |
| `std-runware-t2i` | Runware | `""` (**待选**) | `""` @ 0.8 (**待选**) | 待用户在模型中心选择 | 保持完整LoRA拓扑 | **诚实待选** (需先选模) | 未验证 (待选) |
| `std-modelslab-t2i` | ModelsLab | `""` (**待选**) | `""` @ 0.8 (**待选**) | 待用户在模型中心选择 | 保持完整LoRA拓扑 | **诚实待选** (需先选模) | 未验证 (待选) |

### 2. 标准文生视频（T2V）与标准图生视频（I2V）预设（11 项）

| 预设 ID | 任务 | 供应商 | 底模配置 | 挂载 LoRA 配置 | 专家语义与核验状态 | UI 点击状态 | 产物验收 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `std-fal-t2v` | T2V | Fal.ai | `fal-ai/wan/v2.2-a14b/text-to-video/lora` | Cseti Kinestasis HIGH-noise @ 1.0 | 已核实：Fal OpenAPI 默认 `transformer="high"`；Cseti 模型卡明确注明 **HIGH-noise only**，HF HEAD 200 | **`PASS_BILLING`** (403 Exhausted balance, 见第56行) | 未生成 (余额受限) |
| `std-fal-i2v` | I2V | Fal.ai | `fal-ai/wan/v2.2-a14b/image-to-video/lora` | Ostris Orbit Shot HIGH-noise @ 1.0 | 已核实：Ostris 专为 HIGH noise 导出，HF HEAD 200；`cfg: 3.5` 为官方第一阶段默认值，`guidance_scale_2: 4`；seed 24231881 为固定示例种子 | 已核实配置与测试 | 未验证 (未重跑) |
| `std-wavespeed-t2v` | T2V | WaveSpeed | `wavespeed-ai/wan-2.2/t2v-480p-lora` | Dustin2050 Diffusers @ 1.0 | 契约已核实 (WaveSpeed request_schema)；Diffusers 权重 HF HEAD 200；**通用 `loras` 与双专家加载的等效性标为未验证** | 已核实配置与测试 | 未验证 (未重跑) |
| `std-wavespeed-i2v` | I2V | WaveSpeed | `wavespeed-ai/wan-2.2/i2v-480p-lora` | Dustin2050 Diffusers @ 1.0 | 契约已核实 (request_schema 移除 size/cfg)；参考图与权重 HF HEAD 200；**通用 `loras` 与双专家加载等效性标为未验证** | **`PASS_BILLING`** (400 Insufficient credits, 见第75行) | 未生成 (余额受限) |
| `std-civitai-t2v` | T2V | Civitai | Wan 2.2 T2V AIR `1817671@2114154` | Wan 2.2 T2V LoRA `2247725@2530788` @ 1.0 | 已核实：Civitai comfy 接收原生 AIR；API 证实版本 2530788 为 Low Noise (v1.0)，同模型另有 High Noise 版本 2530787 | **`PASS_BILLING`** (400 insufficientBuzz, 见第34行) | 未生成 (Buzz受限) |
| `std-civitai-i2v` | I2V | Civitai | Wan 2.2 I2V AIR `1817671@2114157` | Wan 2.2 I2V LoRA `1902817@2153813` @ 1.0 | 已核实：Civitai comfy 原生配方 `111400580`，API 证实版本 2153813 为 low | 历史出站证实 | 未生成 (未重跑) |
| `std-novita-i2v` | I2V | Novita | `""` (**待选**) | 无 | 彻底移除 SVD-XT，保留 3 节点拓扑待选 | **诚实待选** (需先选模) | 未验证 (待选) |
| `std-muapi-t2v` | T2V | MuAPI | `""` (**待选**) | `""` @ 1.0 (**待选**) | 移除旧 `wan2.1-lora-t2v`，保留完整节点拓扑待选 | **诚实待选** (需先选模) | 未验证 (待选) |
| `std-muapi-i2v` | I2V | MuAPI | `""` (**待选**) | `""` @ 1.0 (**待选**) | 移除旧 `wan2.1-lora-i2v` 与旧 84050423 提示词，保留完整节点拓扑待选 | **诚实待选** (需先选模) | 未验证 (待选) |
| `std-replicate-t2v` | T2V | Replicate | `""` (**待选**) | `""` @ 1.0 (**待选**) | 移除旧 `wan-video/wan2.1-with-lora`，保留完整拓扑待选 | **诚实待选** (需先选模) | 未验证 (待选) |
| `std-replicate-i2v` | I2V | Replicate | `""` (**待选**) | `""` @ 1.0 (**待选**) | 移除旧 `wan-video/wan2.1-with-lora` 与旧 84050423 提示词，保留完整拓扑待选 | **诚实待选** (需先选模) | 未验证 (待选) |

---

## 三、公开直链与 Civitai 401 鉴权事实澄清

1. **Hugging Face 公开权重免鉴权 HTTP 200 实测数据**：
   ```text
   HEAD 200 469291992 https://huggingface.co/krea/Krea-2-LoRA-retroanime/resolve/main/retroanime.safetensors
   HEAD 200 306807976 https://huggingface.co/Cseti/wan2.2-14B-Kinestasis_concept-lora-v1/resolve/main/246839-wan22_14B-high-banostasis_concept-e459.safetensors
   HEAD 200 153453568 https://huggingface.co/ostris/wan22_i2v_14b_orbit_shot_lora/resolve/main/wan22_14b_i2v_orbit_high_noise.safetensors
   HEAD 200 306809552 https://huggingface.co/dustin2050/lexy-vox-t2v-lora-training-wan2.2/resolve/main/lexy_vox_t2v_v2_diffusers.safetensors
   HEAD 200 306809552 https://huggingface.co/dustin2050/lexy-vox-i2v-lora-training-wan2.2/resolve/main/lexy_vox_i2v_v2_diffusers.safetensors
   HEAD 200 752166    https://huggingface.co/dustin2050/lexy-vox-i2v-lora-training-wan2.2/resolve/main/training_data/images_closeups/01_headshot_closeup.jpg
   ```

2. **Civitai 401 鉴权与安全事实澄清**：
   - 实测请求 `curl -sS -I https://civitai.com/api/download/models/2530788` 返回 `HTTP/2 401`（`vary: Authorization`）。
   - **事实说明**：此 HTTP 401 证明该下载端点要求用户携带授权 Token，不可匿名直接抓取；在用户未提供 Token 授权的情况下，外部第三方供应商（如 Fal.ai、WaveSpeed）无法直接匿名下载该权重文件；此外 `urn:air:...` 属于 Civitai 平台内部 Orchestration 专有 URN，第三方平台并不支持解析。因此非 Civitai 预设改用具有公开免鉴权直链的 Hugging Face 权重。

---

## 四、真实出站请求日志与 7 类标准判定 (Verbatim Logs)

以下出站日志均记录于 `temp/logs/requests-2026-11-07.jsonl`：

### 1. Fal.ai Krea 2 Turbo LoRA 点击运行（对应截图 `09-fal-krea-run-result.png`）
- **日志行号**: Line 45
```json
{
  "time": "2026-11-07T05:33:23+09:00",
  "provider": "fal",
  "model": "fal-ai/krea-2/turbo/lora",
  "method": "POST",
  "endpoint": "https://fal.run/fal-ai/krea-2/turbo/lora",
  "requestBody": {
    "prompt": "two samurais in flowing robes doing a muay thai fight, one throws a high kick while the other leans back. Purple retro anime style",
    "num_images": 1,
    "seed": 64107730,
    "loras": [
      {
        "path": "https://huggingface.co/krea/Krea-2-LoRA-retroanime/resolve/main/retroanime.safetensors",
        "scale": 1
      }
    ],
    "image_size": "square_hd",
    "enable_safety_checker": false
  },
  "status": 403,
  "responseBody": "{\"detail\":\"User is locked. Reason: TOP_UP.\"}"
}
```
- **判定**: **`PASS_BILLING`**（已成功送出包含官方 `image_size: "square_hd"` 的完整请求体；上游因账户未充值返回 403，非 `PASS_GENERATION`）。

### 2. Fal.ai Wan 2.2 T2V 点击运行（对应截图 `14-fal-wan22-t2v-run-result.png`）
- **日志行号**: Line 56
```json
{
  "time": "2026-11-07T05:33:41+09:00",
  "provider": "fal",
  "model": "fal-ai/wan/v2.2-a14b/text-to-video/lora",
  "method": "POST",
  "endpoint": "https://queue.fal.run/fal-ai/wan/v2.2-a14b/text-to-video/lora",
  "requestBody": {
    "prompt": "Banostasis concept, a cinematic sequence of quick scene transitions of musical instruments dissolving into fragments of sound waves, which then condense into glowing orbs of light, the sequence of changes includes the transitions between a concert hall, a crowded subway tunnel, and an open desert plain, shot with rapid lens push-ins and kaleidoscopic lighting shifts, stylized in synesthetic neon abstract art.",
    "aspect_ratio": "16:9",
    "frames_per_second": 16,
    "num_frames": 81,
    "resolution": "480p",
    "guidance_scale": 3.5,
    "loras": [
      {
        "path": "https://huggingface.co/Cseti/wan2.2-14B-Kinestasis_concept-lora-v1/resolve/main/246839-wan22_14B-high-banostasis_concept-e459.safetensors",
        "scale": 1
      }
    ]
  },
  "status": 403,
  "responseBody": "{\"detail\":\"User is locked. Reason: Exhausted balance. Top up your balance at fal.ai/dashboard/billing.\"}"
}
```
- **判定**: **`PASS_BILLING`**（已成功送出完整 Banostasis 提示词、HIGH noise LoRA 及第一阶段引导系数 3.5；上游返回余额耗尽 403，非 `PASS_GENERATION`）。

### 3. WaveSpeed Wan 2.2 I2V 点击运行（对应截图 `16-wavespeed-wan22-i2v-run-result.png`）
- **日志行号**: Line 75
```json
{
  "time": "2026-11-07T05:34:03+09:00",
  "provider": "wavespeed",
  "model": "wavespeed-ai/wan-2.2/i2v-480p-lora",
  "method": "POST",
  "endpoint": "https://api.wavespeed.ai/api/v3/wavespeed-ai/wan-2.2/i2v-480p-lora",
  "requestBody": {
    "prompt": "lexy_vox, gentle head turn, warm smile, natural movement",
    "seed": 42,
    "image": "https://huggingface.co/dustin2050/lexy-vox-i2v-lora-training-wan2.2/resolve/main/training_data/images_closeups/01_headshot_closeup.jpg",
    "duration": 5,
    "loras": [
      {
        "path": "https://huggingface.co/dustin2050/lexy-vox-i2v-lora-training-wan2.2/resolve/main/lexy_vox_i2v_v2_diffusers.safetensors",
        "scale": 1
      }
    ]
  },
  "status": 400,
  "responseBody": "{\"code\":400,\"message\":\"Insufficient credits. Please top up your account to continue.\"}"
}
```
- **判定**: **`PASS_BILLING`**（已成功送出完整 lexy_vox 提示词、真实参考图 URL、种子 42、时长 5 及 Diffusers 格式 LoRA；上游返回点数不足 400，非 `PASS_GENERATION`）。

### 4. Civitai Wan 2.2 T2V 点击运行（对应截图 `12-civitai-t2v-run-result.png`）
- **日志行号**: Line 34
```json
{
  "time": "2026-11-07T04:22:25+09:00",
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
          "loras": [{ "air": "urn:air:wanvideo-22-t2v-a14b:lora:civitai:2247725@2530788", "strength": 1 }],
          "width": 832,
          "height": 480,
          "shift": 7
        }
      }
    ]
  },
  "status": 400,
  "responseBody": "{\"type\":\"https://tools.ietf.org/html/rfc9110#section-15.5.1\",\"title\":\"Bad Request\",\"status\":400,\"detail\":\"insufficientBuzz\",\"traceId\":\"00-30e6d9c7a7a3d4e8d0911d1e0b4ec17a-9aa707305d440772-02\"}"
}
```
- **判定**: **`PASS_BILLING`**（Buzz 余额不足，非 `PASS_GENERATION`）。

### 5. NanoGPT MOSS Image 生图点击运行（对应截图 `06-nanogpt-run-result.png`）
- **日志行号**: Line 2
```json
{
  "time": "2026-11-07T04:14:53+09:00",
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
  "responseBody": "{\"error\":{\"message\":\"Invalid session\",\"type\":\"invalid_request_error\",\"code\":\"invalid_api_key\"}}"
}
```
- **判定**: **`BLOCKED_AUTH`**（密钥失效，非 `PASS_GENERATION`）。

---

## 五、18 张真实浏览器 UI 截图逐像素核查记录 (`ReadMediaFile` 亲验)

所有截图均存放于 `docs/evidence/2026-11-05/current-presets/`，均经 `ReadMediaFile` 逐张核验像素细节：

1. `01-initial-canvas.png`: 初始 Z-Image Turbo 创作画布（7 节点 · 9 连线），显示 `加载底模 (Hugging Face)`、`LoRA: renderartist/Technically-Color-Z-Image-Turbo`、`正向提示词`、`采样器`，右上角按钮为 `运行：保存与预览图像 (Save Image)`。
2. `02-workflow-presets-modal.png`: 预设中心首屏，展示 34 个预设与任务类型过滤标签。
3. `03-t2v-filter.png`: 过滤文生视频 (T2V) (5)，展示 Wan 2.2 及待选卡片。
4. `04-search-moss.png`: 搜索 `moss` 过滤出 NanoGPT MOSS Image 卡片。
5. `05-loaded-nanogpt-moss.png`: 载入 NanoGPT MOSS Image 流程并填入提示词的干净画布。
6. `06-nanogpt-run-result.png`: 点击运行后展示 NanoGPT 401 `Invalid session` 报错弹窗（`BLOCKED_AUTH`）。
7. `07-fal-krea-modal.png`: 筛选文生图并搜索 `fal`，展示 Fal Krea 2 Turbo LoRA 预设卡片。
8. `08-loaded-fal-krea-turbo.png`: **P2-1 修正后实测**：加载 Fal Krea 2 Turbo 画布，`加载底模 (Fal.ai)` 节点的无 Schema 来源假控件 `画幅比例 (aspect_ratio)` 已彻底清除，`LoRA: retroanime` 挂载强度 1，提示词与采样器（种子 64107730）整齐排列，无残留错误弹窗。
9. `09-fal-krea-run-result.png`: 点击运行后展示 Fal 403 `{"detail":"User is locked. Reason: TOP_UP."}` 报错弹窗（`PASS_BILLING`）。
10. `10-loaded-civitai-t2v.png`: 搜索 `civitai` 筛选文生视频，清晰展示卡片。
11. `11-civitai-t2v-loaded.png`: 载入 Civitai Wan 2.2 T2V 并在文本框填入 `a cinematic anime battle...` 提示词的干净画布，右上角按钮为 `运行：AI 视频 (Civitai)`。
12. `12-civitai-t2v-run-result.png`: 点击运行后展示 Civitai 400 `insufficientBuzz` 报错弹窗（`PASS_BILLING`）。
13. `13-fal-wan22-t2v-lora-loaded.png`: **P2-2 拓扑总览图**：同屏完整展示 `LoRA: 246839-wan22_14B-high-banostasis_concept-e459`、`AI 视频 (Fal.ai)` 与 `保存与预览视频 (Save Video)` 完整 3 节点连线链路。
14. `13b-fal-wan22-t2v-lora-params.png`: **P2-2 参数特写图**：视口聚焦于节点核心参数，清晰可读 `[Fal] Wan 2.2 A14B Text-to-Video LoRA`、分辨率 `480p`、`cfg: 3.5`、完整填入的 Banostasis 提示词及 LoRA 强度 1。
15. `14-fal-wan22-t2v-run-result.png`: 点击运行后展示 Fal 队列 403 `{"detail":"User is locked. Reason: Exhausted balance..."}` 报错弹窗（`PASS_BILLING`）。
16. `15-wavespeed-wan22-i2v-lora-loaded.png`: **P2-2 拓扑总览图**：同屏完整展示 `参考底图加载 (Load Image)`（含真实人物预览图）、`LoRA: lexy_vox_i2v_v2_diffusers`、`AI 视频 (WaveSpeed)` 与 `保存与预览视频 (Save Video)` 完整 4 节点连线链路。
17. `15b-wavespeed-wan22-i2v-lora-params.png`: **P2-2 参数特写图**：视口聚焦于参数详情，清晰可读人物参考图预览卡片、LoRA URL、`wavespeed-ai/wan-2.2/i2v-480p-lora`、提示词 `lexy_vox...`、种子 `42`、时长 `5 秒`。
18. `16-wavespeed-wan22-i2v-run-result.png`: 点击运行后展示 WaveSpeed 400 `{"code":400,"message":"Insufficient credits..."}` 报错弹窗（`PASS_BILLING`）。

---

## 六、负向变异实测证据 (Mutation Testing Proofs)

在 `/tmp/m28-mut-argon` 独立副本中实测 4 组变异实验，全部精准拦截：
1. **变异 1（非 Civitai 预设混用 Civitai 专有 `urn:air:` 命名空间）**: 将 `std-fal-t2v` 的 LoRA 改为 `urn:air:wanvideo-22-t2v-a14b:lora:civitai:2247725@2530788` -> `presets.test.ts` 报错红屏（`Exit code: 1`）。
2. **变异 2（恢复遗留视频默认模型 `fal-ai/wan-t2v-lora` 与 `SVD-XT`）**: 将 `std-fal-t2v` 改回 `fal-ai/wan-t2v-lora`，将 `std-novita-i2v` 改回 `SVD-XT` -> `WorkflowPresetsModal.events.test.tsx` 与 `presets.test.ts` 报错红屏（`Exit code: 1`）。
3. **变异 3（恢复遗留图像默认模型 `tamarin-xl-v1` SDXL 1.0）**: 将 `std-modelslab-t2i` 改回 `tamarin-xl-v1` -> 2 个测试文件报错红屏（`Exit code: 1`）。
4. **变异 4（移除待选预设 `std-runware-t2i` 的 LoRA 节点拓扑 `hasLora: false`）**: 将 `std-runware-t2i` 的 `hasLora` 改为 `false` -> `presets.test.ts` 报错红屏（`Exit code: 1`）。
5. **复原验证**: 恢复代码后运行全部通过（`Exit code: 0`）。

---

## 七、全量质量门禁与回归结果

在当前工作树 `wt-28` 上依次执行生产构建、TypeScript 类型检查与全量 Vitest 测试：
1. **`npm run build`**: **Exit code 0**
2. **`npx tsc --noEmit`**: **Exit code 0**（0 errors）
3. **`npx vitest run --maxWorkers=2 --exclude '.tower/**' --exclude '**/node_modules/**' --exclude '**/dist/**'`**: **262 个测试文件全部通过，2057 个测试用例全绿，0 failures，耗时 119.42s，Exit code 0**。
4. **工作区状态**: 提交后 `git status --porcelain` 为空。
