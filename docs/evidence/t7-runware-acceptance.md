# T7 Runware 验收报告 — 历史精确组合 PASS_GENERATION；2026-10-12 契约复核有待修项

## 2026-10-12 官方正文与当前源码复核（优先于历史概括）

本轮只读代码/旧 agent-114 日志与官方正文，不调用生成/上传。旧日志确有成功读取 Runware schema、LoRA、图生图、鉴权、modelSearch 正文的结果；没有 Edit/Write 调用、没有测试完成或最终交付消息，不能继承为已修代码。下方 10-11 请求/响应原样保留；历史 PASS 只限 runware:100@1 无 LoRA 文生图，不扩展为 LoRA、图生图、Qwen 全通过。

实际通过 You Contents 打开的官方正文：
- https://runware.ai/docs/models-api/authentication.md ：“Authorization header with Bearer”；HTTP 任务数组与 `https://api.runware.ai/v1` 匹配 `server.ts:5113-5123`。
- https://runware.ai/docs/models/bfl-flux-1-dev/schema.json ：`x-air-id: runware:101@1`；RequestBody `additionalProperties:false`；LoRA 属性是 `lora`，数组项 `model` / `weight`；输入是 `inputs.seedImage`，说明“Image used as a starting point … (UUID, URL, Data URI, or Base64)”。
- https://runware.ai/docs/models/bfl-flux-1-schnell/schema.json ：`x-air-id: runware:100@1`；width/height 128–2048，steps 1–100，CFGScale 0–20。
- https://runware.ai/docs/models/alibaba-qwen-image-3-0/schema.json ：`x-air-id: alibaba:qwen-image@3.0`，闭合请求属性包含 `settings` / `inputs`，不含 steps / CFGScale / lora；不能套用其他模型通用参数表。
- https://runware.ai/docs/learn/loras.md ：示例 `"lora": [{"model":"civitai:120096@135931","weight":0.7}]`，与当前 wire `loras` 不同。
- https://runware.ai/docs/learn/image-to-image.md ：curl 示例仍写顶层 `seedImage`，与当前 FLUX 模型 schema 的 `inputs.seedImage` 冲突。不能宣称顶层必被在线拒绝；建议新请求以目标模型 OpenAPI 为依据，同时保留官方冲突、待实际验收，不静默改模型或重试。
- https://runware.ai/docs/models-api/model-search.md ：任务 `modelSearch`，返回 `data[].results` / `totalResults`，匹配 `server.ts:3350-3408` 的基本形状。
- https://runware.ai/docs/models-api/task-polling.md ：“deliveryMethod: async” 后用 `getResponse` 轮询；当前 builder 固定同步 URL 输出，不能据此单独判缺轮询为错误，但自定义异步模式尚未接通。

需主 agent 串行修（本轮未改生产代码）：
1. **HIGH** `src/server/runwareImageContract.ts:24,97-114` 发出 `loras` 而非官方 `lora`。建议保留站内 params.loras，wire 改为 task.lora；同步修 `server.ts:5182` 历史读取，新增官方形状断言，不以旧测试预期为依据。
2. **HIGH** `RunwareDriver.ts:69-82` 不传 scheduler/custom_parameters/数量等；builder 固定 numberResults=1 且只映射白名单。`providerSchema.ts:653` 将 scheduler/denoise/num_images/output_format 一概 unsupported，官方 FLUX schema 实有 scheduler/strength/numberResults/outputFormat；Qwen 的 steps/CFGScale 被通用 schema 声称支持且 driver 默认 25/5。建议目标模型 schema 精确映射与公开 omissions/overrides，不删除用户意图，不自动换模型。
3. **HIGH 资源身份** `server.ts:3334` 将空搜索的四个底模在 LoRA 分类标为 lora；`:3389` 同样以搜索分类覆盖上游资源类型。建议分类来自资源元数据，底模快捷推荐不能挂成 LoRA。
4. **MEDIUM** builder 的 strength clamp、CFGScale>0 过滤、numberResults 固定值未公开遗漏/变换；合法 CFGScale=0 被丢弃。`server.ts:5145-5150` HTTP 200 业务错误缺真实 upstreamStatus；网络/JSON 协议错误在 `:5209-5215` 混标 network。建议保留真实状态/原文及 errorSource，不把本地 502 当上游状态。

验收边界：本轮定向三家 6 files / 44 tests PASS，随后 `npm test` 74 files / 633 tests PASS，仅本地现有断言；`npx tsc --noEmit` 失败（ModelHubModal 隐式 any 与 temp/tams-sdk 缺依赖等既有/并行工作树问题），未修越界文件。SDXL 精确 AIR 的本轮官方正文证据、LoRA 上游推理、图生图、Qwen、新图历史与异步模式仍待验。

日期：2026-10-11 (UTC+8)。真实 Runware API，端点为 `POST https://api.runware.ai/v1`。

## 结论

**PASS_GENERATION** — 官方一手文档核实模型体系（FLUX.1 schnell、FLUX.1 dev、SDXL 1.0、Qwen），代码规范化对齐后，通过独立无头 Chrome（端口 9414）访问网页端 http://127.0.0.1:3000 载入 Runware FLUX.1 Schnell 预设并点击“运行工作流”。真实调用 Runware 官方统一推理端点，上游返回 HTTP 200，成功生成真实图像，图片经 `mediaStore` 持久化至本地 `/api/media/<sha256>`，无静默降级，无端点偷换，无虚假数据。

## 1. 官方文档与模型体系核实

依据 Runware 官方文档（https://runware.ai/docs/ ）：
- **FLUX.1 Schnell**：AIR 标识为 `runware:100@1`，官方 4 步极速蒸馏模型。
- **FLUX.1 Dev**：AIR 标识为 `runware:101@1`，官方开权重旗舰生图模型。
- **SDXL 1.0 Base**：AIR 标识为 `civitai:101055@128078`（Stability AI SDXL 1.0 VAE Fix on Civitai via Runware）。
- **Qwen-Image-3.0**：AIR 标识为 `alibaba:qwen-image@3.0`（阿里通义图像生成模型）。
- **接口协议**：统一端点 `POST https://api.runware.ai/v1`，载荷为任务数组 `[ { taskType: "imageInference", ... } ]`，认证头为 `Authorization: Bearer <API_KEY>`。

对齐修改文件：
- `src/engines/drivers/RunwareDriver.ts`：更新 `supportedModels`，包含 `runware:100@1` (FLUX.1 Schnell)、`runware:101@1` (FLUX.1 Dev)、`civitai:101055@128078` (SDXL 1.0 Base)、`alibaba:qwen-image@3.0` (Qwen-Image-3.0)，配置对应 defaultSteps 与 defaultCfg。
- `src/schemas/providerSchema.ts`：更新 `RUNWARE_MODELS` 映射表，矫正此前将 `runware:100@1` 误写为 SDXL 的问题，完整对齐 4 个模型及其支持字段。
- `src/constants/presets.ts`：提供 `runware-flux-schnell`（4 步极速出图）与 `runware-sdxl-native`（经典 SDXL）两套官方预设工作流。

## 2. 真实网页端验收证据链

- **测试环境**：
  - 专用独立 Headless Chrome（二进制：`/home/ubuntu/.agent-browser/browsers/chrome-152.0.7977.75/chrome`）
  - CDP 调试端口：`http://127.0.0.1:9414`（完全隔离用户 Windows Chrome 9224/9333 端口）
  - 访问页面：`http://127.0.0.1:3000`
- **操作流程**：
  1. 点击打开“工作流”预设弹窗，检索 `Runware`。
  2. 载入预设“Runware FLUX.1 Schnell 极速生图”，底模节点配置为 `ckpt_name: 'runware:100@1', targetProvider: 'runware'`。
  3. 点击顶部“运行工作流”按钮触发真实生成。
- **请求格式与端点**：
  - 网页发往后端路由：`POST /api/engine/runware/generate`
  - 实际发往 Runware 上游端点：`POST https://api.runware.ai/v1`
  - 认证凭据：`Authorization: Bearer FW3S...bVH3`（掩码展示）
  - 转换后实际上游载荷：
    ```json
    [
      {
        "taskType": "imageInference",
        "taskUUID": "cd1bfac8-4d7a-46cc-9c16-b008ad5991ab",
        "model": "runware:100@1",
        "positivePrompt": "a minimalist coffee cup on a wooden table, soft morning light, hyperdetailed, 8k masterpiece",
        "width": 512,
        "height": 512,
        "steps": 4,
        "CFGScale": 3.5,
        "seed": 42,
        "numberResults": 1,
        "outputFormat": "PNG",
        "outputType": "URL"
      }
    ]
    ```
- **上游真实响应**：
  - HTTP 状态码：**HTTP 200 OK**
  - 媒体持久化路径：`/api/media/1522815526cf8b1ea7a465d1184be63dfedb8bf4f8e71b78148dc9328d227956`
  - 图像分辨率：512 × 512
  - 执行记录抽屉：请求与上游响应完整记录在执行面板中（HTTP 200）。
- **截图凭证**：
  - 画布渲染与 SaveImage 节点出图：`temp/acceptance-20261011/runware-canvas-result.png`
  - 执行记录抽屉面板详情：`temp/acceptance-20261011/runware-execution-drawer.png`
