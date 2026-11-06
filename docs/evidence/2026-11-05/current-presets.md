# M28 预设与默认模型刷新验收证据 (Current Presets Verification Evidence)

**日期**: 2026-11-06  
**任务**: M28 PRESET28 refresh built-in workflows and defaults with verified current models  
**执行分支**: `feat/preset28-refresh-built-in-workflows-and` (worktree: `wt-28`, rebased on `main`)  
**执行 Agent**: `preset28-argon`  

---

## 一、复审问题（P1-1 / P1-2 / P2）与用户最新指示逐项落实闭环

针对独立审查 `rev-m28-a` 提出的 **P1-1**、**P1-2**、**P2** 以及用户与 Tower 的补充指示，本轮完成如下整改与实测验证：

1. **P1-1 彻底清理遗留视频与图像默认推荐模型（Wan 2.1 / SVD-XT / SDXL 1.0 / SD1.5 / FLUX.1）**：
   - **`std-fal-t2v`**：由 `fal-ai/wan-t2v-lora`（Wan 2.1）升级为 Fal 官方在线端点 `fal-ai/wan/v2.2-a14b/text-to-video/lora`（Wan 2.2 A14B）。
   - **`std-fal-i2v`**：由 `fal-ai/wan-i2v-lora`（Wan 2.1）升级为 Fal 官方在线端点 `fal-ai/wan/v2.2-a14b/image-to-video/lora`（Wan 2.2 A14B）。
   - **`std-wavespeed-t2v`**：由 `wavespeed-ai/wan-2.1/t2v-480p-lora` 升级为 WaveSpeed 官方在线端点 `wavespeed-ai/wan-2.2/t2v-480p-lora`，`schemaProperties` 严格对齐实时 `request_schema`（`['prompt', 'negative_prompt', 'size', 'duration', 'loras', 'high_noise_loras', 'low_noise_loras', 'seed']`）。
   - **`std-wavespeed-i2v`**：由 `wavespeed-ai/wan-2.1/i2v-480p-lora` 升级为 WaveSpeed 官方在线端点 `wavespeed-ai/wan-2.2/i2v-480p-lora`，`schemaProperties` 严格对齐实时 `request_schema`（`['prompt', 'image', 'negative_prompt', 'last_image', 'duration', 'loras', 'high_noise_loras', 'low_noise_loras', 'seed']`，移除该端点 Schema 未声明的 `size` 与 `cfg`）。
   - **`std-novita-i2v`**：彻底移除遗留推荐 `SVD-XT`，将 `model` 设为 `""`（卡片显式展示 `底模: 待选` 与 `待配置：请先载入并选择模型。`），完整保留 `LoadImage -> AIVideoNode -> SaveVideo` 节点拓扑。
   - **`std-muapi-t2v` / `std-muapi-i2v` / `std-replicate-t2v` / `std-replicate-i2v`**：因供应商未提供经官方 Schema 核实的现代 Wan 2.2 LoRA 端点，移除旧 `wan2.1-lora-*` / `wan-video/wan2.1-with-lora` 默认推荐，将 `model` 与 `lora_name` 设为 `""`（卡片显式展示 `待选`），完整保留 `LoRALoader -> AIVideoNode -> SaveVideo`（及 I2V `LoadImage`）节点与连线拓扑，并移除 `presetRecipePrompts.ts` 中残留的 Wan 2.1 配方提示词（`84050423`）。
   - **`std-modelslab-t2i`（P2-2）**：移除旧 SDXL 1.0 默认模型 `tamarin-xl-v1`，与 `std-novita-t2i`、`std-replicate-t2i`、`std-runware-t2i` 一致设为 `ckpt: ""` + `lora_name: ""`（卡片显式展示 `待选`），完整保留 7 节点文生图 + `LoRALoader` 连线拓扑。
   - **`src/constants/nodes.ts`（P2-4）**：将 `AIVideoNode` 下拉中的 `[Fal] Wan 2.1 T2V LoRA` 明确标注为 `[Fal] Wan 2.1 T2V LoRA (legacy)`，并新增 `[Fal] Wan 2.2 A14B Text-to-Video LoRA`（`fal-ai/wan/v2.2-a14b/text-to-video/lora`）与 `[Fal] Wan 2.2 A14B Image-to-Video LoRA`（`fal-ai/wan/v2.2-a14b/image-to-video/lora`）；保留手动选择或输入任意新旧模型的能力，不设全局封禁。

2. **修正视频预设 LoRA 命名空间（Namespace）与高低噪专家（High/Low-Noise Expert）语义匹配**：
   - **修复前缺陷**：`ddb4033` 曾把 Civitai 专有的 `urn:air:wanvideo-22-...`（`2247725@2530788` 与 `1902817@2153813`）填入了 Fal 和 WaveSpeed 的 `loras` 中。经核查：
     1. Fal（`LoRAWeight.path`）与 WaveSpeed（`loras[].path`）均要求可访问的权重 URL 或 Hugging Face 路径，不接受 Civitai 专有 `urn:air:`。
     2. Civitai API `/api/v1/model-versions/2530788` 与 `2153813` 显示其下载链接 `https://civitai.com/api/download/models/...` 在无 Token 时返回 `HTTP/2 401`，且两个版本均为 **Low-Noise** expert 权重（`2530788` 版本名为 `"Low Noise (v1.0)"`，`2153813` 版本名为 `"low"`）。
   - **Fal Wan 2.2 专家映射与修正**：
     - Fal 官方 OpenAPI（`https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/wan/v2.2-a14b/text-to-video/lora` 及 `image-to-video/lora`）定义 `LoRAWeight.transformer` 枚举为 `["high", "low", "both"]`，**默认值为 `"high"`**（仅加载至高噪专家）。当前 `FalDriver` 未暴露 `transformer` 选择器（已提交 Finding：`20261106-preset28-improve-faldriver-wan-2-2-lora-transformer-target-defaults-to-upstre.md`）。
     - 因此，`std-fal-t2v` 改用 Hugging Face 公开免鉴权（`HEAD` HTTP 200，`306,807,976` bytes）、明确声明 `base_model: Wan-AI/Wan2.2-T2V-A14B` 且模型卡注明 **`NOTE: Use it only on your high noise sampler`**（推荐强度 `0.8-1.0`）的 `https://huggingface.co/Cseti/wan2.2-14B-Kinestasis_concept-lora-v1/resolve/main/246839-wan22_14B-high-banostasis_concept-e459.safetensors`（strength `1`）。
     - `std-fal-i2v` 改用 Hugging Face 公开免鉴权（`HEAD` HTTP 200，`153,453,568` bytes，Apache-2.0）、Ostris 发布的 `base_model: Wan-AI/Wan2.2-I2V-A14B` **高噪权重** `https://huggingface.co/ostris/wan22_i2v_14b_orbit_shot_lora/resolve/main/wan22_14b_i2v_orbit_high_noise.safetensors`（strength `1` 取自 Fal OpenAPI `LoRAWeight.scale` 默认值 `default: 1`，模型卡本身未规定强度）。
     - **诚实区分 Ostris 模型卡 widget 与 trigger 词**：Ostris 模型卡（`https://huggingface.co/ostris/wan22_i2v_14b_orbit_shot_lora`）YAML `widget[0].text` 原文为 `"orbit 180 around an astronaut on the moon. "`，而 YAML `instance_prompt` 及正文 Trigger words 写明为 `orbit 360`。`presetRecipePrompts.ts` 原样收录 widget 文本 `"orbit 180 around an astronaut on the moon."`，并在预设 `description` 与本文档中明确说明该差异，绝不冒称 widget 已包含 `orbit 360`。
   - **WaveSpeed Wan 2.2 专家映射与修正**：
     - WaveSpeed 官方文档（`https://wavespeed.ai/docs/docs-api/wavespeed-ai/wan-2.2-t2v-480p-lora` 与 `wan-2.2-i2v-480p-lora`）及页面内嵌 `request_schema` 声明了三个独立的 LoRA 数组字段：
       - `loras`：`Throughout generation`（全程高低噪阶段均应用，最多 3 个）
       - `high_noise_loras`：`Early denoising (high noise)`（仅高噪阶段应用，最多 3 个）
       - `low_noise_loras`：`Late denoising (low noise)`（仅低噪阶段应用，最多 3 个）
     - 当前 `src/server/schemaProviders.ts:1456` 将画布上的 `LoRALoader` 节点统一映射至 `payload.loras`（全程高低噪阶段），尚未支持将 `LoRALoader` 单独路由至 `high_noise_loras` 或 `low_noise_loras`（已提交 Finding：`20261106-preset28-argon-improve-schemaproviders-maps-wavespeed-wan-2-2-loraloader-only-to-ge.md`）。
     - 为避免将仅限高噪或仅限低噪的单阶段权重错误注入全程 `loras`，`std-wavespeed-t2v` 与 `std-wavespeed-i2v` 选用专为 **Wavespeed API** 导出的 Diffusers 格式双阶段角色一致性权重（模型卡声明高低噪阶段均使用同一 `.safetensors` 文件，`scale: 1.0`，`duration: 5`，`seed: 42`，触发词 `lexy_vox`，实测 `HEAD` HTTP 200，`306,809,552` bytes）：
       - T2V：`https://huggingface.co/dustin2050/lexy-vox-t2v-lora-training-wan2.2/resolve/main/lexy_vox_t2v_v2_diffusers.safetensors`
       - I2V：`https://huggingface.co/dustin2050/lexy-vox-i2v-lora-training-wan2.2/resolve/main/lexy_vox_i2v_v2_diffusers.safetensors`（配模型卡 Wavespeed API Quick Start 原文提示词 `"lexy_vox, gentle head turn, warm smile, natural movement"`）。

3. **P1-2 真实浏览器截图重采与 `ReadMediaFile` 逐像素核验**：
   - 在隔离端口（Dev Server `PORT=3128`，Headless Chrome CDP `9428`，视口 `1600x1000` @ `deviceScaleFactor: 2` 即 `3200x2000` 像素）下重采全部 12 张基础截图（`01`–`12`）并新增 4 张视频 LoRA T2V/I2V 特写与运行结果截图（`13`–`16`），共计 **16 张高清截图**。
   - 每次运行后均刷新清理前序错误状态，确保 `01` 为真实初始 Z-Image Turbo 画布、`08` 为干净的 Fal Krea 2 Turbo + Retroanime LoRA 画布、`10`/`11` 为无任何残留遮挡的 Civitai Wan 2.2 T2V 卡片与画布，`13`–`16` 清晰展示 Fal Wan 2.2 T2V 与 WaveSpeed Wan 2.2 I2V 的 `LoRALoader -> AIVideoNode -> SaveVideo`（含 `LoadImage` 真实预览图）完整链路。所有 16 张 PNG 均经 `ReadMediaFile` 亲眼核对像素与文字可读性。

---

## 二、全量 34 个内置预设核验矩阵 (Complete 34-Preset Verification Matrix)

> **说明**：表中「待选（`""`）」预设表示该供应商当前无经官方 Schema 与公开免鉴权权重双重核实的现代默认推荐，系统保留完整的节点拓扑（含 `LoRALoader` 挂载节点与连线），在卡片上诚实标注「待选 / 待配置」，需用户在模型中心显式选择模型后方可运行，**绝不声称开箱即用**。

### 1. 标准文生图预设（23 项）

| 预设 ID | 供应商 | 预设底模 (`ckpt_name` / `model`) | 底模家族 | 预设 LoRA (`lora_name` @ `strength`) | LoRA 命名空间与家族 | 核验状态与官方依据（核验日期: 2026-11-06） |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `std-huggingface-t2i` | Hugging Face (`fal-ai` 路由) | `renderartist/Technically-Color-Z-Image-Turbo` | `Z-Image-Turbo` | `renderartist/Technically-Color-Z-Image-Turbo` @ `0.9` | HF repo ID (`Z-Image-Turbo`) | 已核实：HF 模型卡 & 配方 `civitai.red/images/113739497` (`1216x832`, `steps=12`, `cfg=1`, `seed=1840591390`) |
| `std-modelscope-t2i` | ModelScope CN | `Tongyi-MAI/Z-Image-Turbo` | `Z-Image-Turbo` | `hf/renderartist-Technically-Color-Z-Image-Turbo` @ `0.9` | 魔搭 ID (`Z-Image-Turbo`) | 已核实：魔搭国内站目录 & 配方 `113739497` (`1216x832`, `steps=12`, `cfg=1`) |
| `std-modelscope-ai-t2i` | ModelScope AI | `Tongyi-MAI/Z-Image-Turbo` | `Z-Image-Turbo` | `LcarsPicturesDatabase/ST-TNG-Rooms-Z-Image-Turbo-v1` @ `1.0` | 魔搭国际站 ID (`Z-Image-Turbo`) | 已核实：魔搭国际站 E2E 验证 (`832x1216`, `steps=8`, `cfg=1`) |
| `std-aimlapi-t2i` | AIMLAPI | `alibaba/z-image-turbo-lora` | `Z-Image-Turbo` | `https://huggingface.co/renderartist/Technically-Color-Z-Image-Turbo/resolve/main/Technically_Color_Z_Image_Turbo_v1_renderartist_2000.safetensors` @ `0.9` | 公开直链 URL (`Z-Image-Turbo`) | 已核实：AIMLAPI schema `loras[{path,scale}]` & 配方 `113739497` |
| `std-fal-t2i` | Fal.ai | `fal-ai/krea-2/turbo/lora` | `Krea-2-Turbo` | `https://huggingface.co/krea/Krea-2-LoRA-retroanime/resolve/main/retroanime.safetensors` @ `1.0` | 公开直链 URL (`Krea-2-Turbo`) | 已核实：Fal OpenAPI `Krea2TurboLoraInput.loras[{path,scale}]` & HF `krea/Krea-2-LoRA-retroanime` (HTTP 200) |
| `std-wavespeed-t2i` | WaveSpeed | `wavespeed-ai/krea-v2/turbo-lora` | `Krea-2-Turbo` | `https://huggingface.co/krea/Krea-2-LoRA-retroanime/resolve/main/retroanime.safetensors` @ `1.0` | 公开直链 URL (`Krea-2-Turbo`) | 已核实：WaveSpeed Schema `loras[{path,scale}]` & HF `krea/Krea-2-LoRA-retroanime` (HTTP 200) |
| `std-muapi-t2i` | MuAPI | `krea-v2-turbo-lora` | `Krea-2-Turbo` | `https://huggingface.co/krea/Krea-2-LoRA-retroanime/resolve/main/retroanime.safetensors` @ `1.0` | 公开直链 URL (`Krea-2-Turbo`) | 已核实：MuAPI OpenAPI `/api/v1/krea-v2-turbo-lora` & HF `krea/Krea-2-LoRA-retroanime` (HTTP 200) |
| `std-sogni-t2i` | Sogni | `krea-2-turbo` | `Krea-2-Turbo` | `krea2-fever-dream-mood` @ `1.0` | Sogni catalog ID (`Krea-2-Turbo`) | 已核实：Sogni `generate_image.schema.json` & 配方 `civitai.red/images/142361732`（注：Sogni LoRA ID 本轮沿用既有目录记录，未重拉 Sogni 私有目录） |
| `std-krea-t2i` | Krea | `image/krea/krea-2/medium-turbo` | `Krea-2-Turbo` | 无 (`hasLora: false`) | 无 | 已核实：`https://api.krea.ai/openapi.json` (`aspect_ratio: "1:1"`, `resolution: "1K"`) |
| `std-civitai-t2i` | Civitai | `turbo` (`comfy` / `krea2`) | `Krea-2-Turbo` | 无 (`hasLora: false`) | 无 | 已核实：Civitai `comfy:krea2` schema（不支持自定义 loras/宽高像素） |
| `std-nanogpt-t2i` | NanoGPT | `moss-image` | `MOSS-Image` | 无 (`hasLora: false`) | 无 | 已核实：`GET https://api.nano-gpt.com/api/v1/images/models/moss-image/endpoints` HTTP 200 (`steps=50`, `cfg=3`, `1024x1024`) |
| `std-together-t2i` | Together | `black-forest-labs/FLUX.2-dev` | `FLUX.2` | 无 (`hasLora: false`) | 无 | 已核实：Together 官方图像文档（`image_loras` 官方已下线） |
| `std-deepinfra-t2i` | DeepInfra | `black-forest-labs/FLUX-2-klein-9b` | `FLUX.2` | 无 (`hasLora: false`) | 无 | 已核实：DeepInfra `text-to-image` 在线目录 |
| `std-tensorart-t2i` | OpenWorks (`tensorart`) | `photoreal_studio_z_image` | `OpenWorks` | `1015214543296590260`, `1029661490430387503`, `1015863436619315552` @ `1.0` | OpenWorks 数字 ID (`OpenWorks`) | 已核实：OpenWorks 配方 `tensor.art/images/1053306608244813366` |
| `std-gemini-t2i` | Google Gemini | `gemini-3.1-flash-image` | `Gemini` | 无 | 无 | 已核实：Gemini `generateContent` 官方模型表 |
| `std-agnes-t2i` | Agnes AI | `agnes-image-2.5-flash` | `Agnes` | 无 (`hasLora: false`) | 无 | 已核实：`wiki.agnes-ai.com` (`size: "2K"`, `aspect_ratio: "1:1"`) |
| `std-mage-t2i` | Mage | `mango-v3` | `Mango` | 无 (`hasLora: false`) | 无 | 已核实：`docs.mage.space/api/models/mango` (`aspect_ratio: "4:5"`, `resolution: "2K"`) |
| `std-sensenova-t2i` | SenseNova | `sensenova-u1.5-lite` | `SenseNova` | 无 (`hasLora: false`) | 无 | 已核实：`providerSchema.ts` |
| `std-venice-t2i` | Venice | `venice-sd35` | `SD 3.5` | 无 (`hasLora: false`) | 无 | 已核实：Venice `/models?type=all` 目录（不支持自定义 `loras[]`） |
| `std-novita-t2i` | Novita | `""`（**待选**） | 待用户选模 | `""` @ `0.8`（**待选**，保留 `LoRALoader`） | `request.loras[{model_name,strength}]` | **诚实待选**：移除旧 SD1.5 `dreamshaper_8`，保留 7 节点 + LoRA 完整拓扑 |
| `std-replicate-t2i` | Replicate | `""`（**待选**） | 待用户选模 | `""` @ `1.0`（**待选**，保留 `LoRALoader`） | Replicate LoRA 输入槽 | **诚实待选**：移除旧 `FLUX.1-dev`，保留完整文生图 + LoRA 拓扑 |
| `std-runware-t2i` | Runware | `""`（**待选**） | 待用户选模 | `""` @ `0.8`（**待选**，保留 `LoRALoader`） | `lora[{model,weight}]` | **诚实待选**：杜绝跨架构混配，保留完整文生图 + LoRA 拓扑 |
| `std-modelslab-t2i` | ModelsLab | `""`（**待选**） | 待用户选模 | `""` @ `0.8`（**待选**，保留 `LoRALoader`） | `lora_model` + `lora_strength` | **诚实待选**：移除旧 SDXL 1.0 `tamarin-xl-v1`，保留完整文生图 + LoRA 拓扑 |

### 2. 标准文生视频（T2V，5 项）与标准图生视频（I2V，6 项）预设

| 预设 ID | 任务 | 供应商 | 预设模型 (`AIVideoNode.values.model`) | 底模家族 | 预设 LoRA (`lora_name` @ `strength`) | 命名空间与高低噪专家（Expert）语义 | 官方 Schema / 模型卡来源 URL（核验日期: 2026-11-06） |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `std-fal-t2v` | T2V | Fal.ai | `fal-ai/wan/v2.2-a14b/text-to-video/lora` | `Wan 2.2 T2V-A14B` | `https://huggingface.co/Cseti/wan2.2-14B-Kinestasis_concept-lora-v1/resolve/main/246839-wan22_14B-high-banostasis_concept-e459.safetensors` @ `1.0` | 公开 HF `.safetensors` 直链（HTTP 200）；Cseti 模型卡注明 **HIGH-noise only**（强度 `0.8-1.0`），与 Fal OpenAPI `LoRAWeight.transformer` 默认值 `"high"` 一致 | Schema: `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/wan/v2.2-a14b/text-to-video/lora`；LoRA: `https://huggingface.co/Cseti/wan2.2-14B-Kinestasis_concept-lora-v1` |
| `std-wavespeed-t2v` | T2V | WaveSpeed | `wavespeed-ai/wan-2.2/t2v-480p-lora` | `Wan 2.2 T2V-A14B` | `https://huggingface.co/dustin2050/lexy-vox-t2v-lora-training-wan2.2/resolve/main/lexy_vox_t2v_v2_diffusers.safetensors` @ `1.0` | 公开 HF `.safetensors` 直链（HTTP 200）；专为 Wavespeed API 导出的双阶段 Diffusers 权重（高低噪通用），映射至 WaveSpeed `loras`（Throughout generation） | Schema: `https://wavespeed.ai/docs/docs-api/wavespeed-ai/wan-2.2-t2v-480p-lora`；LoRA: `https://huggingface.co/dustin2050/lexy-vox-t2v-lora-training-wan2.2` |
| `std-civitai-t2v` | T2V | Civitai | `urn:air:wanvideo-22-t2v-a14b:checkpoint:civitai:1817671@2114154` | `Wan 2.2 T2V-A14B` | `urn:air:wanvideo-22-t2v-a14b:lora:civitai:2247725@2530788` @ `1.0` | Civitai Orchestration 原生 `urn:air:`（`loras[{air,strength}]`）；版本 `2530788` 为 `Low Noise (v1.0)`（同模型另有 High Noise 版本 `2530787`） | Schema: `https://developer.civitai.com/orchestration/recipes/wan.md`；API: `https://civitai.com/api/v1/model-versions/2530788` |
| `std-muapi-t2v` | T2V | MuAPI | `""`（**待选**） | 待用户选模 | `""` @ `1.0`（**待选**，保留 `LoRALoader`） | `lora_list`；无官方核实的现代 Wan 2.2 LoRA 端点，移除旧 `wan2.1-lora-t2v` | `https://api.muapi.ai/openapi.json` |
| `std-replicate-t2v` | T2V | Replicate | `""`（**待选**） | 待用户选模 | `""` @ `1.0`（**待选**，保留 `LoRALoader`） | `lora_url`；移除旧 `wan-video/wan2.1-with-lora`，保留完整拓扑待选 | `https://replicate.com/collections/wan-video` |
| `std-fal-i2v` | I2V | Fal.ai | `fal-ai/wan/v2.2-a14b/image-to-video/lora` | `Wan 2.2 I2V-A14B` | `https://huggingface.co/ostris/wan22_i2v_14b_orbit_shot_lora/resolve/main/wan22_14b_i2v_orbit_high_noise.safetensors` @ `1.0` | 公开 HF `.safetensors` 直链（HTTP 200）；Ostris **HIGH-noise** I2V 权重，匹配 Fal 默认 `transformer: "high"`；强度 `1` 取自 Fal OpenAPI `scale` 默认值；widget 原文为 `orbit 180...`，模型卡声明触发词 `orbit 360` | Schema: `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/wan/v2.2-a14b/image-to-video/lora`；LoRA: `https://huggingface.co/ostris/wan22_i2v_14b_orbit_shot_lora` |
| `std-wavespeed-i2v` | I2V | WaveSpeed | `wavespeed-ai/wan-2.2/i2v-480p-lora` | `Wan 2.2 I2V-A14B` | `https://huggingface.co/dustin2050/lexy-vox-i2v-lora-training-wan2.2/resolve/main/lexy_vox_i2v_v2_diffusers.safetensors` @ `1.0` | 公开 HF `.safetensors` 直链（HTTP 200）；专为 Wavespeed API 导出的双阶段 Diffusers 权重，映射至 WaveSpeed `loras`（Throughout generation）；提示词取自模型卡 Wavespeed Quick Start 原文 | Schema: `https://wavespeed.ai/docs/docs-api/wavespeed-ai/wan-2.2-i2v-480p-lora`；LoRA: `https://huggingface.co/dustin2050/lexy-vox-i2v-lora-training-wan2.2` |
| `std-civitai-i2v` | I2V | Civitai | `urn:air:wanvideo-22-i2v-a14b:checkpoint:civitai:1817671@2114157` | `Wan 2.2 I2V-A14B` | `urn:air:wanvideo-22-i2v-a14b:lora:civitai:1902817@2153813` @ `1.0` | Civitai Orchestration 原生 `urn:air:`；来自真实配方 `civitai.red/images/111400580`（版本 `2153813` 为 `low`） | Recipe: `https://civitai.red/images/111400580`；API: `https://civitai.com/api/v1/model-versions/2153813` |
| `std-novita-i2v` | I2V | Novita | `""`（**待选**） | 待用户选模 | 无 | 移除遗留 `SVD-XT`，模型留空待选，保留 `LoadImage -> AIVideoNode -> SaveVideo` 完整拓扑 | `https://github.com/novitalabs/python-sdk` |
| `std-muapi-i2v` | I2V | MuAPI | `""`（**待选**） | 待用户选模 | `""` @ `1.0`（**待选**，保留 `LoRALoader`） | 移除旧 `wan2.1-lora-i2v` 与旧 `84050423` 提示词，保留 4 节点 I2V + LoRA 完整拓扑待选 | `https://api.muapi.ai/openapi.json` |
| `std-replicate-i2v` | I2V | Replicate | `""`（**待选**） | 待用户选模 | `""` @ `1.0`（**待选**，保留 `LoRALoader`） | 移除旧 `wan-video/wan2.1-with-lora` 与旧 `84050423` 提示词，保留 4 节点 I2V + LoRA 完整拓扑待选 | `https://replicate.com/collections/wan-video` |

---

## 三、公开直链、官方 Schema 与 Civitai 元数据实测取证

### 1. 公开 Hugging Face 权重与参考图免鉴权 HTTP 200 验证
本轮实测 `HEAD`（`redirect: "follow"`，无任何 Token）：
```text
HEAD 200 469291992 https://huggingface.co/krea/Krea-2-LoRA-retroanime/resolve/main/retroanime.safetensors
HEAD 200 306807976 https://huggingface.co/Cseti/wan2.2-14B-Kinestasis_concept-lora-v1/resolve/main/246839-wan22_14B-high-banostasis_concept-e459.safetensors
HEAD 200 153453568 https://huggingface.co/ostris/wan22_i2v_14b_orbit_shot_lora/resolve/main/wan22_14b_i2v_orbit_high_noise.safetensors
HEAD 200 306809552 https://huggingface.co/dustin2050/lexy-vox-t2v-lora-training-wan2.2/resolve/main/lexy_vox_t2v_v2_diffusers.safetensors
HEAD 200 306809552 https://huggingface.co/dustin2050/lexy-vox-i2v-lora-training-wan2.2/resolve/main/lexy_vox_i2v_v2_diffusers.safetensors
HEAD 200 752166    https://huggingface.co/dustin2050/lexy-vox-i2v-lora-training-wan2.2/resolve/main/training_data/images_closeups/01_headshot_closeup.jpg
```

### 2. Civitai 视频模型版本元数据与无 Token 下载 401 取证（供独立复核）
- `GET https://civitai.com/api/v1/model-versions/2530788` 返回 HTTP 200：
  ```json
  {
    "id": 2530788,
    "modelId": 2247725,
    "name": "Low Noise (v1.0)",
    "baseModel": "Wan Video 2.2 T2V-A14B",
    "model": { "name": "Stylized PBR Animation [WAN 2.2 T2V]", "type": "LORA" },
    "trainedWords": ["PBRSty1e", "(PBRSty1e, 3d animation), shiny skin, realistic style"],
    "files": [{ "name": "wan2.2_t2v_pbrstyle_low.safetensors", "sizeKB": 149857.0546875, "downloadUrl": "https://civitai.com/api/download/models/2530788?fileId=2420733" }]
  }
  ```
  （同模型 `2247725` 下另有版本 `2530787`：`"name": "High Noise (v1.0)"`，`"wan2.2_t2v_pbrstyle_high.safetensors"`）。
- `GET https://civitai.com/api/v1/model-versions/2153813` 返回 HTTP 200：
  ```json
  {
    "id": 2153813,
    "modelId": 1902817,
    "name": "low",
    "baseModel": "Wan Video 2.2 I2V-A14B",
    "model": { "name": "wan2.2-i2v-Cinematic Flare", "type": "LORA" },
    "trainedWords": [],
    "files": [{ "name": "镜头光晕-low.safetensors", "sizeKB": 299617.1640625, "downloadUrl": "https://civitai.com/api/download/models/2153813?fileId=2047132" }]
  }
  ```
- `curl -sS -I https://civitai.com/api/download/models/2530788` 与 `2153813` 无 Token 响应头均为 `HTTP/2 401`（`vary: Authorization`），证明 Civitai 下载链接与 `urn:air:` 仅适用于 Civitai 自身编排接口（`std-civitai-t2v` / `std-civitai-i2v`），绝不可用于 Fal 或 WaveSpeed。

---

## 四、真实浏览器 UI 点击运行出站日志与 7 类标准判定 (Verbatim Outbound Logs)

本轮所有 UI 点击运行日志均实时写入 `temp/logs/requests-2026-11-07.jsonl`（东京时区日期文件名；本地美东日期为 `2026-11-06`）。
> **诚实性声明**：以下请求均因上游账户余额不足（`PASS_BILLING`）或密钥会话失效（`BLOCKED_AUTH`）在提交阶段被上游拒绝，`PASS_GENERATION = 0`。`PASS_BILLING` 仅证明前端节点、参数提取与服务端契约映射已真实送达上游计费门闸，**不作为上游已实际应用 LoRA 权重或产出媒体的证明**。

### 1. NanoGPT MOSS Image 文生图点击运行（对应截图 `06-nanogpt-run-result.png`）
- **日志文件与行号**: `temp/logs/requests-2026-11-07.jsonl` Line 2
```json
{
  "time": "2026-11-07T04:14:53+09:00",
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
  "durationMs": 472
}
```
- **判定**: **`BLOCKED_AUTH`**（密钥鉴权失败，不作模型托管或生成通过证明）。

### 2. Fal.ai Krea 2 Turbo + Retroanime LoRA 文生图点击运行（对应截图 `09-fal-krea-run-result.png`）
- **日志文件与行号**: `temp/logs/requests-2026-11-07.jsonl` Line 4
```json
{
  "time": "2026-11-07T04:15:09+09:00",
  "kind": "upstream",
  "route": "/api/fal/generate",
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
    "enable_safety_checker": false
  },
  "status": 403,
  "responseBody": "{\"detail\":\"User is locked. Reason: TOP_UP.\"}",
  "durationMs": 160
}
```
- **判定**: **`PASS_BILLING`**（计费门闸拒绝，非 `PASS_GENERATION`）。

### 3. Civitai Wan 2.2 T2V + LoRA 文生视频点击运行（对应截图 `12-civitai-t2v-run-result.png`）
- **日志文件与行号**: `temp/logs/requests-2026-11-07.jsonl` Line 34
```json
{
  "time": "2026-11-07T04:22:25+09:00",
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
  "responseBody": "{\"type\":\"https://tools.ietf.org/html/rfc9110#section-15.5.1\",\"title\":\"Bad Request\",\"status\":400,\"detail\":\"insufficientBuzz\",\"traceId\":\"00-30e6d9c7a7a3d4e8d0911d1e0b4ec17a-9aa707305d440772-02\"}",
  "durationMs": 301
}
```
- **判定**: **`PASS_BILLING`**（Buzz 余额不足，非 `PASS_GENERATION`）。

### 4. Fal.ai Wan 2.2 A14B T2V + Cseti HIGH-Noise LoRA 文生视频点击运行（对应截图 `14-fal-wan22-t2v-run-result.png`）
- **日志文件与行号**: `temp/logs/requests-2026-11-07.jsonl` Line 43
```json
{
  "time": "2026-11-07T04:22:43+09:00",
  "kind": "upstream",
  "route": "/api/video/generate",
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
  "responseBody": "{\"detail\":\"User is locked. Reason: Exhausted balance. Top up your balance at fal.ai/dashboard/billing.\"}",
  "durationMs": 126
}
```
- **判定**: **`PASS_BILLING`**（计费门闸拒绝，非 `PASS_GENERATION`）。

### 5. WaveSpeed Wan 2.2 480P I2V + Dustin2050 Diffusers LoRA 图生视频点击运行（对应截图 `16-wavespeed-wan22-i2v-run-result.png`）
- **日志文件与行号**: `temp/logs/requests-2026-11-07.jsonl` Line 28
```json
{
  "time": "2026-11-07T04:15:56+09:00",
  "kind": "upstream",
  "route": "/api/schema-provider/wavespeed/submit",
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
  "responseBody": "{\"code\":400,\"message\":\"Insufficient credits. Please top up your account to continue.\"}",
  "durationMs": 1365
}
```
- **判定**: **`PASS_BILLING`**（计费门闸拒绝，非 `PASS_GENERATION`）。

---

## 五、16 张真实浏览器 UI 截图逐张像素说明 (`ReadMediaFile` 亲眼核对)

所有截图均为 `3200x2000` 像素（视口 `1600x1000` @ 2x DPI），位于 `docs/evidence/2026-11-05/current-presets/`，每一张均经 `ReadMediaFile` 逐像素复核：

1. `01-initial-canvas.png`: 清空 `localStorage` 后首次打开的真实初始默认画布（`Z-Image Turbo 创作画布`，`7 个节点 · 9 条连线`），清晰可读：`加载底模 (Hugging Face)`（`renderartist/Technically-Color-Z-Image-Turbo`，`HF Inference Providers -> fal-ai`）、`LoRA: renderartist/Technically-Color-Z-Image-Turbo`（强度 `0.9`）、`正向提示词 (CLIP)`（`t3chnic4lly A gritty documentary-style photograph...`）、`画布尺寸设定 (Latent)`（`1216` x `832`）、`采样器`（种子 `1840591390`，步数 `12`，CFG `1`）、`图像解码器 (VAE Decode)`，右上角按钮为 `运行：保存与预览图像 (Save Image)`。
2. `02-workflow-presets-modal.png`: 点击顶栏「工作流」打开工作流与热门模型中心，显示 `热门工作流预设 (34)`，任务过滤包含 `全部任务 (34)`、`文生图 (T2I) (23)`、`文生视频 (T2V) (5)`、`图生视频 (I2V) (6)`，首屏卡片 `Hugging Face · 标准文生图`、`Agnes · 标准文生图`、`AIMLAPI · 标准文生图` 的底模与 LoRA 文字清晰可读。
3. `03-t2v-filter.png`: 点击 `文生视频 (T2V) (5)` 过滤标签，清晰展示已升级为 Wan 2.2 的 `Civitai · 标准文生视频`（`urn:air:wanvideo-22-t2v-a14b:checkpoint:civitai:1817671@2114154`）、`Fal.ai · 标准文生视频`（`fal-ai/wan/v2.2-a14b/text-to-video/lora`，LoRA `246839-wan22_14B-high-b...`）、`MuAPI · 标准文生视频`（`底模: 待选`，标注 `待配置：请先载入并选择模型。`），下方可见 `Replicate` 与 `WaveSpeed` 卡片标签。
4. `04-search-moss.png`: 在搜索框输入 `moss`，精确过滤出 `NanoGPT · 标准文生图` 卡片（`底模: moss-image`，`1024x1024 · 50步 · CFG 3`）。
5. `05-loaded-nanogpt-moss.png`: 点击 `仅载入` 载入 `NanoGPT · 标准文生图` 并填入提示词 `a beautiful photorealistic landscape of mountain peaks during golden hour, 8k resolution`，画布清晰展示 `加载底模 (NanoGPT)`（`moss-image`，`1024x1024`）、`画布尺寸设定 (Latent)`（`1024` x `1024`）、`采样器`（种子 `42`，步数 `50`，CFG `3`）、`图像解码器`、`保存与预览图像 (std_nanogpt)`，无任何残留弹窗。
6. `06-nanogpt-run-result.png`: 点击 `运行：保存与预览图像 (Save Image)`，界面顶部状态栏、采样器节点内联错误框与底部红色横幅同步如实展示上游返回：`【nanogpt】 HTTP 401 Unauthorized: NanoGPT 生图失败 [401]: {"error":{"message":"Invalid session","type":"invalid_request_error","code":"invalid_api_key"}}`（`BLOCKED_AUTH`）。
7. `07-fal-krea-modal.png`: 刷新清除前序状态后打开预设中心，筛选 `文生图 (T2I)` 并搜索 `fal`，展示 `Fal.ai · 标准文生图` 卡片（`底模: fal-ai/krea-2/turbo/lora`，`LoRA: retroanime`）。
8. `08-loaded-fal-krea-turbo.png`: 点击 `仅载入` 后的干净 `Fal.ai · 标准文生图` 画布（无任何前序 Civitai/NanoGPT 报错残留），清晰可读：`加载底模 (Fal.ai)`（`fal-ai/krea-2/turbo/lora`，画幅比例 `1:1`）、`LoRA: retroanime`（`https://huggingface.co/krea/Krea-2-LoRA-retroanime/resolve/main/retroanime.safetensors`，强度 `1`）、`正向提示词 (CLIP)`（`two samurais in flowing robes doing a muay thai fight, one throws a high kick while the other leans back. Purple retro anime style`）、`采样器`（种子 `64107730`）。
9. `09-fal-krea-run-result.png`: 点击 `运行：保存与预览图像 (Save Image)`，界面如实展示 Fal 上游返回：`【fal】 HTTP 403 Forbidden: {"detail":"User is locked. Reason: TOP_UP."}`（`PASS_BILLING`）。
10. `10-loaded-civitai-t2v.png`: 刷新清除前序 Fal 报错弹窗后打开预设中心，筛选 `文生视频 (T2V)` 并搜索 `civitai`，干净无遮挡地展示 `Civitai · 标准文生视频` 卡片（`底模: urn:air:wanvideo-22-t2v-a14b:checkpoint:civitai:1817671@2114154`，`LoRA: urn:air:wanvideo-22-t2v...`）。
11. `11-civitai-t2v-loaded.png`: 点击 `仅载入` 并在 `视频描述 (Prompt)` 中填入 `a cinematic anime battle in the rain, hyper detailed, 4k`，画布干净无遮挡地展示 3 节点拓扑：`LoRA: urn:air:wanvideo-22-t2v-a14b:lora:civitai:2247725@2530788`（强度 `1`）连线至 `AI 视频 (Civitai)`（`cfg: 3`, `width: 832`, `height: 480`, `shift: 7`, `Wan Video 2.2 · 14B Text-to-Video · urn:air:wanvideo-22-t2v-a14b:checkpoint:civitai:1817671@2114154`, 提示词已填入）再连线至 `保存与预览视频 (std_civitai_t2v)`，右上角按钮联动为 `运行：AI 视频 (Civitai)`。
12. `12-civitai-t2v-run-result.png`: 点击 `运行：AI 视频 (Civitai)`，界面如实展示 Civitai Orchestration 上游返回：`【civitai】 HTTP 400 Bad Request: {"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"Bad Request","status":400,"detail":"insufficientBuzz","traceId":"00-30e6d9c7a7a3d4e8d0911d1e0b4ec17a-9aa707305d440772-02"}`（`PASS_BILLING`）。
13. `13-fal-wan22-t2v-lora-loaded.png`: 载入 `Fal.ai · 标准文生视频` 并填入 Cseti 模型卡提示词，同屏清晰展示左侧 `LoRA: 246839-wan22_14B-high-banostasis_concept-e459`（`https://huggingface.co/Cseti/wan2.2-14B-Kinestasis_concept-lora-v1/resolve/main/246839-wan22_14B-high-banostasis_concept-e459.safetensors`，强度 `1`）与右侧 `AI 视频 (Fal.ai)` 的 `视频服务商: Fal.ai`、`model: [Fal] Wan 2.2 A14B Text-to-Video LoRA`、`视频描述 (Prompt): Banostasis concept, a cinematic sequence of quick scene...`，右上角按钮为 `运行：AI 视频 (Fal.ai)`。
14. `14-fal-wan22-t2v-run-result.png`: 点击 `运行：AI 视频 (Fal.ai)`，界面如实展示 Fal 队列上游返回：`【fal】 HTTP 403 Forbidden: {"detail":"User is locked. Reason: Exhausted balance. Top up your balance at fal.ai/dashboard/billing."}`（`PASS_BILLING`）。
15. `15-wavespeed-wan22-i2v-lora-loaded.png`: 载入 `WaveSpeed · 标准图生视频` 并在 `参考底图加载 (Load Image)` 中填入 `dustin2050/lexy-vox-i2v-lora-training-wan2.2` 仓库内的真实人物参考图 URL，同屏清晰展示完整的 4 节点 I2V + LoRA 链路：左上 `参考底图加载 (Load Image)`（显示人物预览图）、左下 `LoRA: lexy_vox_i2v_v2_diffusers`（`https://huggingface.co/dustin2050/lexy-vox-i2v-lora-training-wan2.2/resolve/main/lexy_vox_i2v_v2_diffusers.safetensors`，强度 `1`）、中间 `AI 视频 (WaveSpeed)`（`schemaStatus catalog-model_run`、`high_noise_loras`、`last_image`、`low_noise_loras`、`WaveSpeed`、`wavespeed-ai/wan-2.2/i2v-480p-lora`、`lexy_vox, gentle head turn, warm smile, natural movement`）及右侧 `保存与预览视频 (std_wavespeed_i2v)`。
16. `16-wavespeed-wan22-i2v-run-result.png`: 点击 `运行：AI 视频 (WaveSpeed)`，界面如实展示 WaveSpeed 上游返回：`【wavespeed】 HTTP 400 Bad Request: {"code":400,"message":"Insufficient credits. Please top up your account to continue."}`（`PASS_BILLING`）。

---

## 六、负向变异实测证据 (Isolated Negative Mutation Proofs)

在独立临时副本 `/tmp/m28-mut-argon`（测后已删除）中执行 4 组负向变异实验，验证测试门禁的真实拦截能力：

1. **变异 1（非 Civitai 预设混用 Civitai 专有 `urn:air:` 命名空间）**：
   - 操作：将 `std-fal-t2v` 的 LoRA 改为 `urn:air:wanvideo-22-t2v-a14b:lora:civitai:2247725@2530788`。
   - 命令：`npx vitest run src/constants/presets.test.ts`
   - 结果：**`Exit code: 1`**（`AssertionError: Non-Civitai preset std-fal-t2v must not use Civitai-only AIR "urn:air:wanvideo-22-t2v-a14b:lora:civitai:2247725@2530788"`）。
2. **变异 2（恢复遗留视频默认模型 `fal-ai/wan-t2v-lora` 与 `SVD-XT` — 对应复审 Mutation D）**：
   - 操作：将 `std-fal-t2v` 改回 `fal-ai/wan-t2v-lora`，将 `std-novita-i2v` 改回 `SVD-XT`。
   - 命令：`npx vitest run src/components/WorkflowPresetsModal.events.test.tsx src/constants/presets.test.ts`
   - 结果：**`Exit code: 1`**（2 个测试文件共 4 处断言失败拦截）。
3. **变异 3（恢复遗留图像默认模型 `tamarin-xl-v1` SDXL 1.0）**：
   - 操作：将 `std-modelslab-t2i` 的 `ckpt` 改回 `tamarin-xl-v1`。
   - 命令：`npx vitest run src/components/WorkflowPresetsModal.events.test.tsx src/constants/presets.test.ts`
   - 结果：**`Exit code: 1`**（2 个测试文件共 4 处断言失败拦截）。
4. **变异 4（移除待选预设 `std-runware-t2i` 的 LoRA 节点拓扑 `hasLora: false`）**：
   - 操作：将 `std-runware-t2i` 的 `hasLora` 改为 `false`。
   - 命令：`npx vitest run src/constants/presets.test.ts`
   - 结果：**`Exit code: 1`**（`Novita, Replicate, Runware, and ModelsLab T2I maintain full LoRA-capable topology awaiting user model choice` 断言失败拦截）。
5. **复原验证**：
   - 恢复 `src/constants/presets.ts` 后再次运行，**`Exit code: 0`**。

---

## 七、全量质量门禁与回归结果

在当前工作树 `wt-28` 上依次执行生产构建、TypeScript 类型检查与无管道全量 Vitest 测试：
1. **`npm run build`**: **Exit code 0**（前端 Vite 与 Worker 构建成功）。
2. **`npx tsc --noEmit`**: **Exit code 0**（0 errors）。
3. **`npx vitest run --maxWorkers=2 --exclude '.tower/**' --exclude '**/node_modules/**' --exclude '**/dist/**'`**: **262 个测试文件全部通过，2054 个测试用例全绿，0 failures，耗时 120.00s，Exit code 0**。
4. **`git status --porcelain`**: 提交后输出为空，工作树完全干净。
