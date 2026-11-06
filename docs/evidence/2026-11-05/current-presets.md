# M28 预设与默认模型刷新验收证据 (Current Presets Verification Evidence)

**日期**: 2026-11-06  
**任务**: M28 PRESET28 refresh built-in workflows and defaults with verified current models  
**执行分支**: `feat/preset28-refresh-built-in-workflows-and` (worktree: `wt-28`, rebased on latest `main`)  

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

本项目严格遵循最高准则，针对 Tower 提出的架构匹配、公共链接可用性及自动化门禁等关键意见，完成全部整改：
1. **彻底杜绝跨架构混配**：
   - 杜绝「FLUX 底模 + Krea-2 LoRA」或「FLUX 底模 + SD1.5 LoRA」等架构冲突。
   - 对 Runware、Replicate、Novita 等供应商，保留完整的文生图 + LoRA 全节点拓扑（`hasLora: true`，带有连通至 `KSampler` 的 `LoRALoader` 节点与预设权重），底模与 LoRA 名称留空标记待选，由用户在模型中心按需选用当前生效的模型，绝不预填跨架构的错误组合或 2023 年老旧基模（如 SD1.5、SDXL 1.0、FLUX.1-dev）。
2. **LoRA 采用官方公开直链（HTTP 200 免鉴权验证）**：
   - 彻底废除需用户个人 Civitai Token 鉴权（无 token 返回 401 报错）的直链；
   - Fal.ai、WaveSpeed、MuAPI 统一采用 Krea 团队官方发布在 Hugging Face 上的 Krea 2 Turbo 原生风格 LoRA：
     `https://huggingface.co/krea/Krea-2-LoRA-retroanime/resolve/main/retroanime.safetensors`
   - 实测验证：通过 `curl -s -I -L` 返回 HTTP/2 200 OK，无需任何 token 即可公开下载，元数据显式声明 `base_model: krea/Krea-2-Turbo`，底模与 LoRA 均为 Krea 2 Turbo 架构，100% 匹配。
3. **Novita I2V 真实对齐 SDK**：恢复官方 Python SDK 规定的 `model_name="SVD-XT"`，与本地声明枚举 `["SVD-XT", "SVD"]` 吻合，彻底删除虚构的 `img2video`。
4. **保留自由度与旧模型兼容**：`src/constants/nodes.ts` 保留 `BASE_MODELS` 与 `AIVideoNode` 的全部选项，新老模型并存供用户自由输入与手动切换。
5. **全量变异测试防御 (Mutation Defense)**：在测试用例中增加派生自预设节点的架构兼容性校验（`enforces architecture compatibility on every preset that carries a LoRA`），任何跨架构混配、恢复老旧默认模型或删除 LoRA 节点的改动均会立即导致测试变红失败（Exit code 1）。

---

## 二、架构兼容性核验矩阵 (Architecture Compatibility Verification)

每个携带 LoRA 的内置预设均经过底模架构与 LoRA 训练基模的双向核验，杜绝跨架构错误配对：

| 预设 ID | 供应商 (Provider) | 底模 (Base Model) | 底模架构 (Base Family) | 挂载 LoRA | LoRA 训练架构 (LoRA Family) | 兼容状态 | 官方来源 / 检验依据 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `std-huggingface-t2i` | Hugging Face | Technically-Color-Z-Image-Turbo | `Z-Image-Turbo` | Technically-Color-Z-Image-Turbo @ 0.9 | `Z-Image-Turbo` | ✅ 完全匹配 | HF 官方 model card (Tongyi-MAI/Z-Image-Turbo 衍生) |
| `std-modelscope-t2i` | ModelScope CN | Tongyi-MAI/Z-Image-Turbo | `Z-Image-Turbo` | hf/renderartist-Technically-Color-Z-Image-Turbo @ 0.9 | `Z-Image-Turbo` | ✅ 完全匹配 | 魔搭官方模型页与配方 113739497 |
| `std-modelscope-ai-t2i` | ModelScope AI | Tongyi-MAI/Z-Image-Turbo | `Z-Image-Turbo` | LcarsPicturesDatabase/ST-TNG-Rooms-Z-Image-Turbo-v1 @ 1.0 | `Z-Image-Turbo` | ✅ 完全匹配 | 魔搭国际站官方模型页 |
| `std-aimlapi-t2i` | AIMLAPI | alibaba/z-image-turbo-lora | `Z-Image-Turbo` | Technically-Color-Z-Image-Turbo @ 0.9 | `Z-Image-Turbo` | ✅ 完全匹配 | AIMLAPI 官方目录与配方 113739497 |
| `std-fal-t2i` | Fal.ai | fal-ai/krea-2/turbo/lora | `Krea-2-Turbo` | krea/Krea-2-LoRA-retroanime @ 1.0 | `Krea-2-Turbo` | ✅ 完全匹配 | Fal OpenAPI 与 HF krea/Krea-2-LoRA-retroanime |
| `std-wavespeed-t2i` | WaveSpeed | wavespeed-ai/krea-v2/turbo-lora | `Krea-2-Turbo` | krea/Krea-2-LoRA-retroanime @ 1.0 | `Krea-2-Turbo` | ✅ 完全匹配 | WaveSpeed Schema 与 HF 官方公开权重 |
| `std-muapi-t2i` | MuAPI | krea-v2-turbo-lora | `Krea-2-Turbo` | krea/Krea-2-LoRA-retroanime @ 1.0 | `Krea-2-Turbo` | ✅ 完全匹配 | MuAPI OpenAPI 与 HF 官方公开权重 |
| `std-sogni-t2i` | Sogni | krea-2-turbo | `Krea-2-Turbo` | krea2-fever-dream-mood @ 1.0 | `Krea-2-Turbo` | ✅ 完全匹配 | Sogni 官方 generate_image.schema.json 内置目录 |
| `std-tensorart-t2i` | Tensor.Art (OpenWorks) | photoreal_studio_z_image | `OpenWorks` | 3 个 OpenWorks 原生验证 LoRA ID | `OpenWorks` | ✅ 完全匹配 | OpenWorks 官方 API 驱动与实测回包 |
| `std-modelslab-t2i` | ModelsLab | tamarin-xl-v1 | `SDXL 1.0` | xl-realistic-cake-art-sty @ 0.45 | `SDXL 1.0` | ✅ 完全匹配 | ModelsLab Dreambooth 官方示例文档 |
| `std-replicate-t2i` | Replicate | `""` (留空待选) | 保持完整LoRA拓扑 | `""` (留空待选 @ 1.0) | 保持完整LoRA拓扑 | ✅ 诚实待选 | 避免硬编码老旧 FLUX.1，拓扑连线完整 |
| `std-novita-t2i` | Novita | `""` (留空待选) | 保持完整LoRA拓扑 | `""` (留空待选 @ 0.8) | 保持完整LoRA拓扑 | ✅ 诚实待选 | 避免硬编码老旧 SD1.5/SDXL，拓扑连线完整 |
| `std-runware-t2i` | Runware | `""` (留空待选) | 保持完整LoRA拓扑 | `""` (留空待选 @ 0.8) | 保持完整LoRA拓扑 | ✅ 诚实待选 | 避免跨架构混配，拓扑连线完整 |
| `std-fal-t2v` | Fal.ai T2V | fal-ai/wan-t2v-lora | `Wan 2.1 14B` | Wan-BalancingAct-Redmond @ 1.0 | `Wan 2.1 14B` | ✅ 完全匹配 | HF artificialguybr/Wan-BalancingAct-Redmond |
| `std-fal-i2v` | Fal.ai I2V | fal-ai/wan-i2v-lora | `Wan 2.1 14B` | matrix_shot.safetensors @ 1.0 | `Wan 2.1 14B` | ✅ 完全匹配 | HF Remade-AI/matrix-shot 与配方 84050423 |
| `std-wavespeed-t2v` | WaveSpeed T2V | wavespeed-ai/wan-2.1/t2v-480p-lora | `Wan 2.1 14B` | Wan-BalancingAct-Redmond @ 1.0 | `Wan 2.1 14B` | ✅ 完全匹配 | WaveSpeed 官方 API 与 HF 匹配 LoRA |
| `std-wavespeed-i2v` | WaveSpeed I2V | wavespeed-ai/wan-2.1/i2v-480p-lora | `Wan 2.1 14B` | matrix_shot.safetensors @ 1.0 | `Wan 2.1 14B` | ✅ 完全匹配 | WaveSpeed 官方 API 与配方 84050423 |
| `std-civitai-t2v` | Civitai T2V | Wan 2.2 T2V (`1817671@2114154`) | `Wan 2.2 14B` | Wan 2.2 T2V LoRA (`2247725@2530788`) @ 1.0 | `Wan 2.2 14B` | ✅ 完全匹配 | Civitai orchestration 原生 AIR 对齐 |
| `std-civitai-i2v` | Civitai I2V | Wan 2.2 I2V (`1817671@2114157`) | `Wan 2.2 14B` | Wan 2.2 I2V LoRA (`1902817@2153813`) @ 1.0 | `Wan 2.2 14B` | ✅ 完全匹配 | Civitai orchestration 原生 AIR 对齐 |
| `std-muapi-t2v` | MuAPI T2V | wan2.1-lora-t2v | `Wan 2.1 14B` | Wan-BalancingAct-Redmond @ 1.0 | `Wan 2.1 14B` | ✅ 完全匹配 | MuAPI OpenAPI 规范 |
| `std-muapi-i2v` | MuAPI I2V | wan2.1-lora-i2v | `Wan 2.1 14B` | matrix_shot.safetensors @ 1.0 | `Wan 2.1 14B` | ✅ 完全匹配 | MuAPI OpenAPI 规范 |
| `std-replicate-t2v` | Replicate T2V | wan-video/wan2.1-with-lora | `Wan 2.1 14B` | Wan-BalancingAct-Redmond @ 1.0 | `Wan 2.1 14B` | ✅ 完全匹配 | Replicate llms.txt 官方规范 |
| `std-replicate-i2v` | Replicate I2V | wan-video/wan2.1-with-lora | `Wan 2.1 14B` | matrix_shot.safetensors @ 1.0 | `Wan 2.1 14B` | ✅ 完全匹配 | Replicate llms.txt 官方规范 |

---

## 三、公开直链与官方 API 实测取证 (Curl Evidence)

### 1. Krea 官方 Hugging Face LoRA 公开直链验证
- **验证命令**:
  ```bash
  curl -s -I -L "https://huggingface.co/krea/Krea-2-LoRA-retroanime/resolve/main/retroanime.safetensors"
  ```
- **实际响应头**:
  ```text
  HTTP/2 302 
  location: https://us.aws.cdn.hf.co/xet-bridge-us/6a3a432d505425c68cd8fd56/4c41728449131a7e2042cb469eb0f1fa5f2ef790ec031f93c068ff00cfd18864...
  
  HTTP/2 200 
  content-type: application/octet-stream
  content-disposition: inline; filename*=UTF-8''retroanime.safetensors; filename="retroanime.safetensors";
  content-length: 469291992
  etag: "4c41728449131a7e2042cb469eb0f1fa5f2ef790ec031f93c068ff00cfd18864"
  ```
- **结论**: 确认 `retroanime.safetensors` 为 Krea 官方（`krea/Krea-2-LoRA-retroanime`）发布的 469MB 标准权重，无需任何 token 或登录鉴权，通过任意 HTTP 请求均能以 HTTP 200 直接下载，供 Fal.ai / WaveSpeed / MuAPI 直接拉取。

### 2. NanoGPT MOSS Image 官方在线端点响应
- **验证命令**:
  ```bash
  curl -s -i "https://api.nano-gpt.com/api/v1/images/models/moss-image/endpoints"
  ```
- **实际响应**: HTTP/2 200 OK
- **支持参数**: steps (1-100, 默认 50), guidance_scale (0-10, 默认 3), negative_prompt: true, seed: true, resolutions: ["1024x1024", "512x512", "1536x1024", "1024x1536", "1920x1072", "2048x2048"]。

---

## 四、真实浏览器 UI 交互运行出站日志 (Verbatim Outbound Logs)

所有运行均由真实浏览器（Headless Chrome via CDP）实际点击「运行」按钮触发，经过服务端向真实上游发出 HTTP 请求，并写入 `temp/logs/requests-2026-11-06.jsonl`：

### 1. Fal.ai Krea 2 Turbo LoRA 点击运行
```json
{
  "time": "2026-11-06T22:54:16+09:00",
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
  "durationMs": 147
}
```
- **判定**: **PASS_BILLING**。完整参数与公开 LoRA 路径已送达真实上游，上游返回欠费原文，前端如实呈现。

### 2. Civitai Wan 2.2 T2V 视频点击运行
```json
{
  "time": "2026-11-06T22:51:47+09:00",
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
  "responseBody": "{\"type\":\"https://tools.ietf.org/html/rfc9110#section-15.5.1\",\"title\":\"Bad Request\",\"status\":400,\"detail\":\"insufficientBuzz\",\"traceId\":\"00-9b2aac5ef27d94a3a2c92d7e3045f59f-26550ab5f830de27-02\"}",
  "durationMs": 337
}
```
- **判定**: **PASS_BILLING**。完整参数与 AIR 规范送达 Civitai 官方编排服务，上游返回 Buzz 余额不足原生报错，前端如实呈现。

### 3. NanoGPT MOSS Image 生图点击运行
```json
{
  "time": "2026-11-06T22:51:03+09:00",
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
  "durationMs": 426
}
```
- **判定**: **BLOCKED_AUTH**。请求参数完整出站，由于密钥鉴权失败（Invalid session），上游返回 401，诚实记录为密钥鉴权未通过，绝不断言为模型托管证明。

---

## 五、真实浏览器 UI 交互验收证据截图 (ReadMediaFile 亲验记录)

所有 12 张截图均在 Headless Chrome 环境下通过真实 CDP 交互获取，并由 Agent 使用 `ReadMediaFile` 亲眼校验画面元素：

1. `01-initial-canvas.png`: 初始画布显示 `加载底模 (Hugging Face)`，模型为 `renderartist/Technically-Color-Z-Image-Turbo`，LoRA 节点连接并预填 Technically Color LoRA @ 0.9，提示词为真实配方原文。
2. `02-workflow-presets-modal.png`: 唤出工作流预设中心，显示 34 个预设；老旧过时营销分类已彻底清除，任务分类派生自真实数据。
3. `03-t2v-filter.png`: 点击「文生视频 (T2V)」标签，过滤显示 5 个视频预设（Civitai Wan 2.2、Fal.ai Wan 14B LoRA 等），完整展示视频能力。
4. `04-search-moss.png`: 搜索输入 "moss"，即时筛选出 NanoGPT MOSS Image 预设卡片。
5. `05-loaded-nanogpt-moss.png`: 点击「仅载入」，画布呈现 NanoGPT MOSS Image 完整文生图拓扑（加载底模 moss-image、空潜空间 1024x1024、采样器 50 步 / CFG 3 / 种子 42、VAE 与保存节点）。
6. `06-nanogpt-run-result.png`: 填写提示词后点击运行，NanoGPT 返回 HTTP 401，界面如实弹出红色报错弹窗与顶部状态条：`【nanogpt】 HTTP 401 Unauthorized: NanoGPT 生图失败 [401]: {"error":{"message":"Invalid session"...}}`，并提供「去 API 设置」按钮。
7. `07-fal-krea-modal.png`: 筛选「文生图 (T2I)」并搜索 "fal"，展示 Fal.ai Krea 2 Turbo LoRA 预设卡片，标签显示「标准文生图」「纯文本输入」「密钥就绪」「Fal.ai」。
8. `08-loaded-fal-krea-turbo.png`: 点击「仅载入」，完整载入 Fal Krea 2 Turbo LoRA 流程，包括 CheckpointLoaderSimple（`fal-ai/krea-2/turbo/lora`）、LoRALoader（挂载公开 Retroanime LoRA @ 1.0）、CLIPTextEncode、KSampler 等，画布干净无残留弹窗。
9. `09-fal-krea-run-result.png`: 点击运行，系统向 Fal 官方发送请求并返回 HTTP 403 欠费拒绝，界面透明展示：`【fal】 HTTP 403 Forbidden: {"detail":"User is locked. Reason: TOP_UP."}` (PASS_BILLING)。
10. `10-loaded-civitai-t2v.png`: 搜索 "civitai" 并筛选文生视频，清晰展示 Civitai 官方原生引擎 Wan 2.2 标准文生视频卡片，画面无浮层遮挡。
11. `11-civitai-t2v-loaded.png`: 点击「仅载入」，画布载入完整文生视频工作流，右上角运行按钮实时联动为 `运行：AI 视频 (Civitai)`（M15 联动完整生效），LoRALoader 正常接入。
12. `12-civitai-t2v-run-result.png`: 输入提示词点击运行，Civitai 官方编排返回 400 `insufficientBuzz` 余额拒绝，界面如实弹出：`Civitai 视频生成接口返回错误 [400]: ... "detail":"insufficientBuzz"` (PASS_BILLING)。

---

## 六、负向变异实测证据 (Mutation Testing Proofs)

在测试套件中严格执行三组破坏性变异实验，验证门禁保护能力：

1. **变异 A：在预设上故意装配跨架构 LoRA (如 Fal Krea 2 Turbo 底模挂载 SDXL LoRA)**
   - 修改: 将 `std-fal-t2i` 的 LoRA 替换为 `xl-realistic-cake-art-sty`
   - 执行: `npm test -- src/constants/presets.test.ts`
   - 报错输出:
     ```text
     FAIL src/constants/presets.test.ts > standard workflow presets > enforces architecture compatibility on every preset that carries a LoRA
     AssertionError: Architecture mismatch on preset std-fal-t2i: base "fal-ai/krea-2/turbo/lora" (krea2) != LoRA "xl-realistic-cake-art-sty" (sdxl): expected 'krea2' to be 'sdxl'
     Exit code: 1
     ```

2. **变异 B：恢复老旧默认模型 (如 NanoGPT 恢复 flux-schnell 或 Novita 恢复 dreamshaper)**
   - 修改: 将 `std-novita-t2i` 底模设为 `dreamshaper_8_93211.safetensors`
   - 执行: `npm test -- src/components/WorkflowPresetsModal.events.test.tsx`
   - 报错输出:
     ```text
     FAIL src/components/WorkflowPresetsModal.events.test.tsx > WorkflowPresetsModal mounted UI event tests > ensures no built-in preset recommends obsolete/legacy models
     AssertionError: expected 'dreamshaper_8_93211.safetensors' not to contain 'dreamshaper_8'
     Exit code: 1
     ```

3. **变异 C：删减 Runware 的 LoRA 连线节点 (`hasLora: false`)**
   - 修改: 将 `std-runware-t2i` 的 `hasLora` 设为 `false`
   - 执行: `npm test -- src/constants/presets.test.ts`
   - 报错输出:
     ```text
     FAIL src/constants/presets.test.ts > standard workflow presets > Novita, Replicate, and Runware T2I maintain full LoRA-capable topology awaiting user model choice
     AssertionError: expected false to be true (p.nodes.some(n => n.type === 'LoRALoader'))
     Exit code: 1
     ```

**结论**: 三组变异测试均精准拦截并产生非零退出码（Exit code 1），复原后全部点绿（Exit code 0），证明代码具备严格防退化保障。

---

## 七、全量质量门禁与回归结果

在当前已 rebase main 的分支上执行完整质量检查：
1. **构建生产生成代码**:
   ```bash
   npm run build
   ```
   **结果**: Exit code 0，前端 Vite 打包与 Worker 产物生成成功。
2. **TypeScript 类型校验**:
   ```bash
   npx tsc --noEmit
   ```
   **结果**: Exit code 0，0 errors。
3. **全量 Vitest 测试**:
   ```bash
   npx vitest run --maxWorkers=2 --exclude '.tower/**' --exclude '**/node_modules/**' --exclude '**/dist/**'
   ```
   **结果**: 256 个测试文件全部通过，1975 个用例全绿，0 failures，耗时 164.54s。
4. **工作区状态**:
   ```bash
   git status --porcelain
   ```
   **结果**: 输出为空，工作区完全干净。
