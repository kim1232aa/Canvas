# M25 全量集成 UI 回归与终结验收证据报告 (FINAL25 Integrated UI Regression Evidence)

**执行日期**: 2026-11-07  
**基准分支与提交**: `main` @ `4ab0948` (包含 M1~M12, M14~M18, M23, M24, M26, M27, M28 全量修复与本分支 UI 文案/路由修正)  
**工作树**: `<repo-root>/.tower/worktrees/wt-25`  
**执行 Agent**: `final25-argon` (Tower Worker)  
**测试环境**:
- Node.js: `v22.23.2`
- 浏览器: Headless Google Chrome `153.0.8010.52` (CDP 控制，视口 `2560×1440`)
- 本地服务端口: `3325` (Express + Vite 8 SPA 中间件模式)
- 实机截图归档:
  - `docs/evidence/2026-11-05/final/*.png` (41 张独立唯一 MD5 全量高保真截图，0 重复 MD5，经 `ReadMediaFile` + `region` 逐张眼核)
  - `docs/evidence/2026-11-05/recipe-shapes/01..07.png` (Civitai 现代真实配方 `#148140013` / `#148135866` / `#148004351` 逆向解析、Schema 校验与出站运行实测截图)
  - `docs/evidence/2026-11-05/current-presets/01..16.png` (现代预设 Fal Krea 2、Fal Wan 2.2 T2V + LoRA、WaveSpeed Wan 2.2 I2V、Civitai Wan 2.2 T2V、NanoGPT MOSS-Image 实测截图)

---

## 一、用户原则与最高准则 (Verbatim User Acceptance Policy)

根据项目最高工程规范 `AGENTS.md` 及用户逐字指示：
1. **唯一验收标准**：「我的验收标准只有一个，UI实际点击通过并有产物，你之前绕过前端直接请求api的是违规，是绕过，你请求api通过，和我前端点击通过根本不是一回事」。
2. **余额不足政策**：「余额不足不做卡点，先集成api，错误能原样透传算暂时通过」。
3. **单元测试与实际问题**：「最后：单元测试通过绝不等于实际问题解决」。
4. **透明透传与反黑盒**：「不要美化报错，原样放回」「严禁静默容灾与虚假成功」「禁止多余的拦截」。
5. **NSFW 放开策略**：「我们不反对nsfw，有nsfw开关的都默认开启」。

---

## 二、全量 7 类判定标签规范 (Strict 7-Label Classification)

所有运行判定严格且仅使用以下 7 个标准标签：
- `PASS_GENERATION`: 界面可见真实生成产物（图像、流媒体、视频等）。
- `PASS_BILLING`: 全参数请求成功抵达真实上游供应商，上游返回欠费/余额不足/额度用尽/免费层耗尽报错，界面原样无损展示 HTTP 状态码与原始响应体。
- `BLOCKED_AUTH`: 上游返回 HTTP 401 鉴权失败或 Token 无效。
- `BLOCKED_CONFIG`: 用户未配置该服务商 API Key，且界面正确提示配置密钥。
- `NOT_SENT`: 请求未出站（如未接入端点在前端或本地路由被拦截返回说明）。
- `CONTRACT_REJECT`: 非计费类 400/422/404 错误（如枚举不匹配、参数缺失、上游端点未启用），属契约异常失败。
- `WIRING_BUG`: 前后端连线、路由分发或驱动映射缺陷，属接线故障。

---

## 三、UI 回归实测结果总表 (`final/` 41 张独立截图 + 跨集联合核验)

### 3.1 `docs/evidence/2026-11-05/final/` 41 张截图逐项核验表（MD5 唯一性验证：41 文件 = 41 唯一哈希）

| 截图编号与路径 | 测试流与操作对象 | 核心节点与控件状态 | 上游 HTTP / 状态码 | 判定分类 | 证据要点与实机描述 (`ReadMediaFile` 亲验) |
|---|---|---|---|---|---|
| `final/01-blank-canvas-empty-onboarding.png` | (a) 空白画布引导 | 中央渲染 `canvas-empty-onboarding` 引导卡，步骤 2 显示「支持 Z-Image Turbo、Krea 2、MOSS-Image、Wan 2.2 等文生图/文生视频大模型」，运行按钮显示「运行：未确定节点」且禁用 | N/A | UI_SURFACE | 6 步新手入门引导清晰无遮挡，已彻底清除旧模型文案 |
| `final/02-blank-canvas-assembled.png` | (a) 空白画布一键装配 | 一键加载标准文生图工作流，装配 7 节点 9 连线 (Hugging Face + Z-Image Turbo + LoRA 0.9 + CLIP + KSampler 12步 + VAE + SaveImage) | N/A | UI_SURFACE | 运行按钮激活为「运行：保存与预览图像 (Save Image)」 |
| `final/03-blank-canvas-run-result.png` | (a) 空白画布运行结果 | 采样器节点与顶栏红框浮层实时展示透传报错 | 402 Payment Required | `PASS_BILLING` | 上游真实返回 `Purchase pre-paid credits to continue using Inference Providers...` 原样透传 |
| `final/04-preset-gallery-modal.png` | (b) 预设模板库总览 | 打开 `WorkflowPresetsModal`，34 个预设 (23 T2I, 5 T2V, 6 I2V)，22 家服务商标签 | N/A | UI_SURFACE | 经审查无任何已退役旧模型（SD 1.5, FLUX.1-schnell, Wan 2.1, SVD-XT）作为主力推荐 |
| `final/05-hf-zimage-loaded.png` | (b) Hugging Face 预设载入 | 载入 `std-huggingface-t2i` (Z-Image Turbo @ 0.9) | N/A | UI_SURFACE | 节点参数完整就绪 |
| `final/06-hf-zimage-run.png` | (b) Hugging Face 预设运行 | 点击运行，出站至 `router.huggingface.co` 队列 | 402 Payment Required | `PASS_BILLING` | 真实透传充值提示与配额限制 |
| `final/07-together-flux2-loaded.png` | (b) Together 预设载入 | 载入 `std-together-t2i` (FLUX.2 Dev, 1024x1024, steps 20, CFG 1) | N/A | UI_SURFACE | 拓扑连线正确，底模指向 Together |
| `final/08-together-flux2-run.png` | (b) Together 预设运行 | 出站 `POST https://api.together.ai/v1/images/generations` | 401 Unauthorized | `BLOCKED_AUTH` | 上游返回 `{"error":{"message":"Invalid API key provided..."}}` 原样上屏 |
| `final/09-aimlapi-loaded.png` | (b) AIMLAPI 预设载入 | 载入 `std-aimlapi-t2i` (alibaba/z-image-turbo-lora) | N/A | UI_SURFACE | 拓扑完整 |
| `final/10-aimlapi-run.png` | (b) AIMLAPI 预设运行 | 出站 `POST https://api.aimlapi.com/v1/images/generations` | 403 Forbidden | `PASS_BILLING` | 上游返回账户额度耗尽报错，原样展示 |
| `final/11-deepinfra-loaded.png` | (b) DeepInfra 预设载入 | 载入 `std-deepinfra-t2i` (FLUX-2-klein-9b) | N/A | UI_SURFACE | 拓扑完整 |
| `final/12-deepinfra-run.png` | (b) DeepInfra 预设运行 | 出站 `POST https://api.deepinfra.com/v1/openai/images/generations` | 402 Payment Required | `PASS_BILLING` | 上游返回欠费提示，原样透传展示 |
| `final/13-venice-loaded.png` | (b) Venice 预设载入 | 载入 `std-venice-t2i` (venice-sd35) | N/A | UI_SURFACE | 拓扑完整 |
| `final/14-venice-run.png` | (b) Venice 预设空提示词运行 | 出站 `POST https://api.venice.ai/api/v1/image/generate` | 400 Bad Request | `CONTRACT_REJECT` | 预设默认提示词为空触发上游 `prompt cannot be empty`，原样呈现（填写提示词后为 402 `PASS_BILLING`，见 `nsfw-audit.md`） |
| `final/15-sogni-loaded.png` | (b) Sogni 预设载入 | 载入 `std-sogni-t2i` (krea-2-turbo + LoRA krea2-fever-dream-mood @ 1) | N/A | UI_SURFACE | 拓扑完整，768x1376，步数 10，CFG 1，Euler |
| `final/16-sogni-run.png` | (b) Sogni 预设运行 | 出站 `POST https://api.sogni.ai/v1/creative-agent/workflows` | 200 OK (Task waiting) | `PASS_BILLING` | 轮询返回 `waiting_for_user: insufficient_credit`（`Debit Error: Insufficient funds`），弹窗原样披露 |
| `final/17-modelslab-loaded.png` | (b) ModelsLab 预设载入 | 载入 `std-modelslab-t2i` | N/A | UI_SURFACE | 拓扑完整 |
| `final/18-modelslab-run.png` | (b) ModelsLab 预设运行 | 出站 `POST https://modelslab.com/api/v6/realtime/text2img` | 400 / 402 | `PASS_BILLING` | 上游返回账户点数不足报错，原样透传展示 |
| `final/19-mage-loaded.png` | (b) Mage 预设载入 | 载入 `std-mage-t2i` (mango-v3) | N/A | UI_SURFACE | 包含 4:5 比例与 2K 分辨率配置 |
| `final/20-mage-run.png` | (b) Mage 预设运行 | 出站 `POST https://api.mage.space/v1/models/mango-v3/predict` | 402 Payment Required | `PASS_BILLING` | 上游返回配额不足提示，原样透传展示 |
| `final/21-sensenova-loaded.png` | (b) SenseNova 预设载入 | 载入 `std-sensenova-t2i` (sensenova-u1.5-lite) | N/A | UI_SURFACE | 预设卡片标记「SenseNova 尚未配置 API Key」 |
| `final/22-sensenova-run.png` | (b) SenseNova 预设运行 | 点击运行，前端状态栏提示未配置密钥 | Local Guard | `BLOCKED_CONFIG` | 本地拦截未配置密钥，引导用户去设置页填写 |
| `final/23-agnes-loaded.png` | (b) Agnes 预设载入 | 载入 `std-agnes-t2i` (agnes-image-2.5-flash) | N/A | UI_SURFACE | 预设卡片标记「待配置密钥」 |
| `final/24-agnes-run.png` | (b) Agnes 预设运行 | 点击运行，状态栏提示未配置密钥 | Local Guard | `BLOCKED_CONFIG` | 引导用户去设置页配置 API Key |
| `final/25-gemini-loaded.png` | (b) Gemini 预设载入 | 载入 `std-gemini-t2i` (gemini-3.1-flash-image) | N/A | UI_SURFACE | 预设卡片标记「待配置密钥」 |
| `final/26-gemini-run.png` | (b) Gemini 预设运行 | 点击运行，状态栏提示未配置密钥 | Local Guard | `BLOCKED_CONFIG` | 引导用户去设置页配置 API Key |
| `final/27-civitai-import-modal.png` | (c) Civitai 导入弹窗 (旧版对照) | 打开 Civitai 导入界面 | N/A | UI_SURFACE | 展示导入面板与目标服务商选择网格 |
| `final/28-civitai-sd15-preview.png` | (c) Civitai SD1.5 导入预览 | 输入 SD1.5 原始提示词（含 `Clip skip: 2`, `Sampler: DPM++ 2M Karras`）点击解析 | N/A | UI_SURFACE | 解析识别 `clipSkip: 2`（采样器链接指向 `sdxl.md` 已记录 Finding） |
| `final/29-civitai-flux-preview.png` | (c) Civitai FLUX 导入预览 | 输入 FLUX 原始参数（`Sampler: Euler`, `Schedule: Simple`）点击解析 | N/A | UI_SURFACE | 识别模型与采样调度器 |
| `final/30-workflow-modal-civitai-tab.png` | (c) 工作流弹窗 Civitai Tab (现代配方刷新) | 打开 `WorkflowPresetsModal` 第 2 个标签「✨ Civitai 一键生成工作流」 | N/A | UI_SURFACE | 清晰展示已更新的 4 个现代快捷胶囊（`#148140013` Krea 2 Turbo、`#148135866` Z-Image Turbo、`#148004351` MOSS-Image SFT、Krea 2 Turbo 文本样例）、`148140013` 占位符及底部「重新加载 Z-Image Turbo 初始默认工作流模板」，无任何弹窗遮挡 |
| `final/32-model-hub-modal.png` | (d) 模型中心总览 | 打开 `ModelHubModal`，展示各服务商目录 | N/A | UI_SURFACE | 显式呈现粉色标签 `NSFW: 已开启 (默认)`，支持一键切换 |
| `final/33-hf-lora-attached.png` | (d) HF 挂载 LoRA 画布 | Checkpoint + LoRALoader 挂载 `Technically-Color-Z-Image-Turbo` @ 0.9 | N/A | UI_SURFACE | 连线完整，无弹窗遮挡 |
| `final/34-hf-lora-run.png` | (d) HF 挂载 LoRA 运行 | 出站出图请求 | 402 Payment Required | `PASS_BILLING` | 上游 402 原样透传展示 |
| `final/35-novita-lora-attached-and-run.png` | (d) Novita 挂载 LoRA 并运行 | 载入 `std-novita-t2i`，从模型库选入 `realisticVisionV40_v40VAE-inpainting_81543.safetensors` 底模与 `weight_slider_v2_91681` LoRA (强度 0.8)，关闭所有弹窗后点击运行 | 403 Forbidden | `PASS_BILLING` | 画布清晰展示 Novita 底模节点 + 已挂载 LoRA 节点 + 采样器与底部红框原样展示 `【novita】HTTP 403 Forbidden: {"code":403,"reason":"NOT_ENOUGH_BALANCE","message":"insufficient balance","metadata":{}}`，无任何无关弹窗遮挡 |
| `final/40-i2v-banner-animate-photo.png` | (e) Sogni I2V 图生视频横幅 | Sogni 视频节点载入参考图与模型 | N/A | UI_SURFACE | **R1 核心闭环**：节点显式呈现青绿色横幅：`schemaStatus hosted-tool:generate_video · toolName generate_video · videoModel · 有参考图时提交走 animate_photo（实时 Schema）；Seedance 参考图字段未接通` |
| `final/42-nanogpt-video-run.png` | (e) NanoGPT 独立视频路由运行 | 在 `AIVideoNode` 选择 `NanoGPT` 服务商并填入视频模型 `kling-v21-std`，点击运行 | 401 Unauthorized | `BLOCKED_AUTH` | **R8 核心闭环**：`AIVideoNode` 出站至 `/api/generate-video`，原样展示 `【nanogpt】HTTP 401 Unauthorized: {"error":{"message":"Incorrect API key...","type":"invalid_request_error","code":"invalid_api_key"}}` |
| `final/43-tams-video-not-sent.png` | (e) Tensor.Art (TAMS) 视频本地透明拒绝 | 在 `AIVideoNode` 选择 `Tensor.Art (TAMS)` 并输入纯数字模型 ID `672797109289765558`，点击运行 | 400 (Local NOT_SENT) | `NOT_SENT` | **R2 核心闭环**：修正 `TensorArtDriver.ts` 视频路由后，节点与横幅清晰展示 `没有发出去: Tensor.Art TAMS 模型 672797109289765558：本应用尚未接入 TAMS 视频（官方接口参见 https://tams-docs.tensor.art/docs/api/guide/workspace-api-example/ ）；未发送请求，也不会改用 OpenWorks 接口。` |
| `final/44-fal-nsfw-default-false.png` | (f) Fal Wan 2.2 T2V NSFW 默认值 | 干净画布载入 `std-fal-t2v`，打开右侧「参数总控台」检查 `enable_output_safety_checker` 与 `enable_safety_checker` | N/A | UI_SURFACE | 无任何报错弹窗遮挡；`enable_output_safety_checker` 显示 `会发送 false`，`enable_safety_checker` 显示 `会发送 false（默认开启 NSFW）`、下拉选中 `false (关闭安全检查（默认）)` 及干净产品提示 `默认允许成人内容 (NSFW)` |
| `final/45-fal-nsfw-toggled-true.png` | (f) Fal Wan 2.2 T2V NSFW 手动切回 | 在 UI 中将 `enable_safety_checker` 切换为 `true (开启安全检查)` | N/A | UI_SURFACE | 徽章实时更新为 `会发送 true（已开启安全过滤）`，节点上 `enable_safety_checker` 同步变为 `true`，并出现「恢复默认」按钮 |
| `final/46-venice-nsfw-default-false.png` | (f) Venice T2I NSFW 默认值 | 干净画布载入 `std-venice-t2i` (`venice-sd35`)，打开右侧「参数总控台」并滚动至 `safe_mode` | N/A | UI_SURFACE | 无任何旧弹窗遮挡；`safe_mode` 显式显示 `会发送 false（默认开启 NSFW）`、下拉选中 `false (关闭安全模式（默认未打码）)` 及干净产品提示 `默认允许成人内容 (NSFW)` |
| `final/47-venice-nsfw-toggled-true.png` | (f) Venice T2I NSFW 手动切回 | 在 UI 中将 `safe_mode` 切换为 `true (开启安全模式（打码）)` | N/A | UI_SURFACE | 徽章实时更新为 `会发送 true（已开启安全过滤）`，并出现「恢复默认」按钮 |

### 3.2 已验证现代配方与预设跨集引用（避免对已验证 `PASS_BILLING` 节点重复消耗付费请求）

1. **Civitai 现代真实配方逆向解析、Schema 校验与出站运行 (`docs/evidence/2026-11-05/recipe-shapes/01..07.png` & [recipe-shapes.md](recipe-shapes.md))**：
   - `recipe-shapes/01-civitai-native-clean-preview.png`: `#148140013` (Krea 2 Turbo + 4 LoRAs) Civitai 原生导入预览，识别完整 AIR 与 4 个 `.safetensors` 权重。
   - `recipe-shapes/02-sogni-unselected-honest-warning.png`: 切换至 Sogni 未选模型时诚实显示琥珀色 `待选择目标模型 / 未核实`。
   - `recipe-shapes/03-sogni-krea2-schema-ready.png`: 选定 Sogni `krea-2-turbo` 后加载实时 Schema（20 个官方参数定义）。
   - `recipe-shapes/04-canvas-loaded-civitai.png`: `#148140013` 载入画布，Checkpoint 填充 `comfy` / `krea2` / `turbo`，KSampler 种子 `689794262` (`固定`)。
   - `recipe-shapes/05-run-civitai-native-result.png`: `#148140013` 真实点击运行，出站 `POST https://orchestration.civitai.com/v2/consumer/workflows?wait=100` 返回 `HTTP 400 insufficientBuzz` (`PASS_BILLING`)。
   - `recipe-shapes/06-run-zimage-turbo-148135866.png`: `#148135866` (Z-Image Turbo + LoRA) 真实点击运行，出站返回 `HTTP 400 insufficientBuzz` (`PASS_BILLING`)。
   - `recipe-shapes/07-run-moss-image-sft-148004351.png`: `#148004351` (MOSS-Image SFT + 双 LoRA) 真实点击运行，出站返回 `HTTP 400 insufficientBuzz` (`PASS_BILLING`)。

2. **现代内置工作流预设实机验证 (`docs/evidence/2026-11-05/current-presets/01..16.png` & [current-presets.md](current-presets.md))**：
   - `current-presets/05-loaded-nanogpt-moss.png` & `06-nanogpt-run-result.png`: NanoGPT `moss-image` 预设载入与运行 (`HTTP 401 Invalid session`, `BLOCKED_AUTH`)。
   - `current-presets/08-loaded-fal-krea-turbo.png` & `09-fal-krea-run-result.png`: Fal `fal-ai/krea-2/turbo/lora` 预设载入（含 `image_size: "square_hd"`，无假 `aspect_ratio`）与运行 (`HTTP 403 TOP_UP`, `PASS_BILLING`)。
   - `current-presets/11-civitai-t2v-loaded.png` & `12-civitai-t2v-run-result.png`: Civitai Wan 2.2 T2V + LoRA 预设载入与运行 (`HTTP 400 insufficientBuzz`, `PASS_BILLING`)。
   - `current-presets/13-fal-wan22-t2v-lora-loaded.png`, `13b-fal-wan22-t2v-lora-params.png` & `14-fal-wan22-t2v-run-result.png`: Fal Wan 2.2 A14B T2V + Cseti HIGH-noise LoRA 预设载入与运行 (`HTTP 403 Exhausted balance`, `PASS_BILLING`)。
   - `current-presets/15-wavespeed-wan22-i2v-lora-loaded.png`, `15b-wavespeed-wan22-i2v-lora-params.png` & `16-wavespeed-wan22-i2v-run-result.png`: WaveSpeed Wan 2.2 I2V + Dustin2050 Diffusers LoRA 预设载入与运行 (`HTTP 400 Insufficient credits`, `PASS_BILLING`)。

---

## 四、历史遗留检查项 (R1~R10) 与 D5 代码门禁真相核查

| 检查项 ID | 检查项内容 | 代码与 UI 实测现状 | 结论 | 核销依据与证据引用 |
|---|---|---|---|---|
| **R1** | 图生视频 I2V 节点横幅 `animate_photo` | `src/components/NodeItem.tsx:638` 显式判断 `targetProvider === 'sogni'` 并在检测到参考图时输出横幅 | **CLOSED** | 截图 `final/40-i2v-banner-animate-photo.png`，呈现 `schemaStatus hosted-tool:generate_video · toolName generate_video · videoModel · 有参考图时提交走 animate_photo（实时 Schema）；Seedance 参考图字段未接通` |
| **R2** | TAMS 视频报错文案与路由接线 | `src/schemas/tensorModelApi.ts:77` 声明文案；本轮修复 `src/engines/drivers/TensorArtDriver.ts:49` 将 `params.isVideo` 转发至 `/api/video/generate` (`provider: 'tensorart'`) | **CLOSED** | 截图 `final/43-tams-video-not-sent.png`，完全匹配官方文档链接与「未发送请求，也不会改用 OpenWorks 接口」要求 |
| **R3** | Novita I2V 403 证据状态 | 上游异步接口返回 403 `NOT_ENOUGH_BALANCE` | **CLOSED** | 属于典型的 `PASS_BILLING`，见 `final/35-novita-lora-attached-and-run.png` 与 `video/novita-i2v-403.json` |
| **R4** | `ui.md` 截图 18 计时与截图 05 中文标签 | 采样器节点分阶段计时反馈；Latent 节点字段中文化标签 | **CLOSED** | 截图 `final/02-blank-canvas-assembled.png` 中可见「图像宽度」、「图像高度」、「生成张数」完全中文化 |
| **R5** | `App.tsx` 中 `currentCheckpointBaseModel` 的 `as any` 清理 | `src/App.tsx:2856-2862` 严格使用类型安全的可选链属性获取 | **CLOSED** | 代码检查确认 0 处 `as any`，完全由类型系统推导 |
| **R6** | `civitai-import.md` 测试计数核验 | 5 个关联测试文件实际执行通过计数 | **CLOSED** | 实测 `5 passed / 106 tests` 全绿通过（原记录 82 个，后续增加用例） |
| **R7** | Civitai 预览中采样器/调度器来源链接 | SD1.5 与 FLUX 导入时 Sampler/Scheduler 来源硬编码为 `sdxl.md` | **REPORTED (FINDING)** | 代码 `src/utils/civitaiImportMap.ts:1201, 1214` 硬编码 `sdxl.md`，已提交结构化 `TowerFinding` 并记入 `UNRESOLVED_ISSUES.md` |
| **R8** | NanoGPT 视频独立路由 | `src/server/routes/videoGenerateRoute.ts:161-345` 独立接入 `/api/generate-video` | **CLOSED** | 截图 `final/42-nanogpt-video-run.png`，`AIVideoNode` 出站返回 401 `invalid_api_key`，出站路径完全独立于图像生成 |
| **R9** | 原始错误文本与 JSONL 响应体比对 | 前端错误弹窗与卡片完整呈现状态码与 JSON 体 | **CLOSED** | 比对全量截图与 JSONL，所有报错信息原样透传，无任何本地美化或降级吞错 |
| **R10 / D5** | `rejectSchemaEnum` 与 `rejectUnsupported` 真实状态 (File:Line Truth) | `Grep` 全仓核查：<br>1. `server.ts`: **0 处**（原 `server.ts:1080` 的 `rejectSchemaEnum` 与 `rejectUnsupported` 已在 M18 彻底移除）。<br>2. `src/server/routes/videoGenerateRoute.ts`: **0 处**（`VideoGenerateRouteDeps` 接口与路由实现中均已移除）。<br>3. `src/server/schemaProviderVideoStatus.test.ts:32`: **仅剩 1 处测试桩残留属性** `rejectSchemaEnum: () => false`（位于 `stubVideoDeps()` 测试辅助函数中，生产代码不再读取）。 | **CLOSED** | 生产代码 `server.ts` 与 `src/server/routes/videoGenerateRoute.ts` 中 `rejectSchemaEnum` / `rejectUnsupported` 均为 0 处；唯一残留位于测试文件 `src/server/schemaProviderVideoStatus.test.ts:32`，已如实记录于本报告与 `UNRESOLVED_ISSUES.md` |

---

## 五、公开文档卫生脱敏审计 (D6 Public-Doc Hygiene Audit)

全仓针对 `*.md`、`docs/**/*.md`、`docs/**/*.json`、`docs/**/*.jsonl` 执行严格正则替换与复核：
- 本地绝对路径脱敏为 `<repo-root>`
- 本地代理进程名脱敏为 `<local-proxy>`
- 账户/钱包数字 ID 脱敏为 `<redacted-user-id>`
- 对象存储签名 URL 脱敏为 `https://<redacted-signed-url>`
- 私有兼容中转域名与标识脱敏为 `https://<user-configured-relay>/v1`
- 私有部署域名与项目/部署 ID 脱敏为 `https://<private-deployment-host>`、`<redacted-project-id>`、`<redacted-deployment-id>`
- **复核命令验证**：执行 `git grep -n -E` 检查上述全部敏感模式，匹配行数为 **0 行**。

---

## 六、构建、类型检查与全量单元测试真实结果

在最终交付物上无管道执行标准验证命令：
1. **`npm run build`**: **Exit code 0**
2. **`npx tsc --noEmit`**: **Exit code 0** (0 errors)
3. **`npx vitest run --maxWorkers=2 --exclude '.tower/**' --exclude '**/node_modules/**' --exclude '**/dist/**'`**:
   - **Exit code 0**
   - **264 test files passed (264 total)**
   - **2128 tests passed (2128 total)**
   - **Duration: 166.86s**

---

## 七、待充值复测与未验证场景清单 (Funded Recheck & Unverified Scenarios)

受限于上游供应商账户余额与网络鉴权，以下场景按用户准则「余额不足不做卡点，先集成api，错误能原样透传算暂时通过」视为**阶段性通过 (`PASS_BILLING`)**，待后续具备充值条件时安排复测：

1. **待充值出图复测服务商 (Awaiting Funded Generation Re-check)**：
   - **Fal.ai**: 403 `Exhausted balance` / `TOP_UP`
   - **Hugging Face**: 402 `Purchase pre-paid credits`
   - **WaveSpeed**: 400 `Insufficient credits`
   - **Sogni**: 200 `insufficient_credit`
   - **AIMLAPI**: 403 `Out of funds`
   - **DeepInfra**: 402 `Payment required`
   - **Mage.space**: 402 `Payment required`
   - **ModelsLab**: 400 / 402 `Out of credits`
   - **Civitai**: 400 `insufficientBuzz`
   - **Novita**: 403 `NOT_ENOUGH_BALANCE`
   - **Venice**: 402 `Insufficient USD or Diem balance`

2. **未验证交互场景 (Unverified Functional Scenarios)**：
   - **Playable Video**: 浏览器内真实播放生成的 MP4/WebM 视频画面（因所有视频服务商均欠费或鉴权拒绝，未能获取可播放视频流）。
   - **SaveVideo**: 视频生成产物下载与保存至本地资产库。
   - **Video History Reuse**: 从历史记录中一键将视频重提载入画布与参数复用。
   - **Civitai Comfy 真实扣费生成**: 实际 Buzz 扣费并在云端 ComfyUI 执行完整出图。
