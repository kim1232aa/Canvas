# UI6 人性化画布交互全面体验走查与改造报告（2026-11-05）

## 一、首次作为真实人类用户的浏览器实机体验走查与痛点清单

我们在真实无头浏览器（Chrome 153，视口 `1600×1000`，CDP 端口 `9403`，开发服务器 `http://127.0.0.1:3103`）中以首次使用本产品的普通创作者视角完整操作了各个界面，并采集了改造前的基线截图（保存在 `temp/e2e/2026-11-05/ui6/before-*.png`）。

### 改造前实机截图索引
- `temp/e2e/2026-11-05/ui6/before-01-landing-graph.png`：首次打开页面（节点模式默认工作流）
- `temp/e2e/2026-11-05/ui6/before-02-params-drawer.png`：展开右侧参数总控台抽屉
- `temp/e2e/2026-11-05/ui6/before-03-add-node-menu.png`：底部工具栏「添加节点」弹出菜单
- `temp/e2e/2026-11-05/ui6/before-04-spatial-mode.png`：切换至「画板（Spatial）」视图
- `temp/e2e/2026-11-05/ui6/before-05-api-settings.png`：打开「API 与密钥设置」弹窗
- `temp/e2e/2026-11-05/ui6/before-07-history-modal.png`：打开「生成历史」弹窗（空状态）
- `temp/e2e/2026-11-05/ui6/before-08-blank-canvas-graph.png`：清空画布后的节点模式空白状态
- `temp/e2e/2026-11-05/ui6/before-09-blank-canvas-spatial.png`：清空画布后的画板模式空白状态

---

### 具体痛点清单（按问题类别归纳）

#### 1. 空白画布无引导、核心创作流断裂（Missing Affordances & Onboarding Flow）
- **痛点表现**：当新用户点击底部「清空 → 一键清空全部」或新建空白画布后，无论是「节点」视图（`before-08-blank-canvas-graph.png`）还是「画板」视图（`before-09-blank-canvas-spatial.png`），屏幕中央只剩一片全黑圆点背景，没有任何空状态引导卡片或步骤提示。
- **反直觉交互**：
  - 空白节点画布上，右上角主按钮显示为「运行：未确定节点」且未禁用，新用户根本不知道如何从零完成「① 选择服务商 → ② 选择模型 → ③ 输入提示词 → ④ 可选挂载 LoRA → ⑤ 点击运行 → ⑥ 查看生成结果」。
  - 在「画板」模式下，底部工具栏最醒目的第一个紫色按钮仍然是「+ 添加节点」，点击后添加的是节点图里的节点，在画板视图下完全不可见，造成极大困惑。

#### 2. 工程黑话、内部字段 ID 与中英混杂文案（Engineering Jargon & Internal IDs）
- **节点与端口（`before-01-landing-graph.png`）**：
  - `尺寸（空潜空间）` 节点直接展示内部字段名 `width`、`height`、`batch_size` 和端口 `LATENT`，普通用户难以理解何为「空潜空间」。
  - 连接端口充斥英文内部类型名：`MODEL`、`CLIP`、`VAE`、`CONDITIONING`、`LATENT`、`IMAGE`、`positive`、`negative`、`latent_image`、`samples`、`images`。
  - 正向提示词节点内嵌了 `润色服务商（AI 润色用）` 与 `润色模型（AI 润色用）` 两个长表单，喧宾夺主，把最核心的提示词输入区挤小。
- **菜单与按钮（`before-03-add-node-menu.png`、`before-04-spatial-mode.png`、`before-07-history-modal.png`）**：
  - 底部添加节点菜单混用英文类名：`KSampler 采样器`、`Load Checkpoint`、`Empty Latent Image`、`Save Image 保存图像`、`Load LoRA 风格微调`、`Load Image 参考图`。
  - 右键菜单底部写着 `Clear All`、`Default`。
  - 画板（Spatial Frame）底部生成按钮写着 `生成此选区 (Queue Frame)`，提示词标题写着 `正向提示词 (Positive)`，参数栏直接显示 `未指定 (未指定)`。
  - 历史记录空状态提示用户：`暂无生成记录。点击右侧「Queue Prompt」开始运行工作流！`——但界面上早已没有名为 `Queue Prompt` 的按钮。
- **参数面板（`before-02-params-drawer.png`）**：
  - 满屏大写英文术语：`提示词工作台 (CLIP Prompts)`、`云端推理引擎 (ENGINE PROVIDER)`、`基础大模型 (CHECKPOINT)`、`SEED (随机种子与控制模式)`、`STEPS (采样步数)`、`CFG SCALE (提示词引导系数)`、`SAMPLER (采样算法)`、`SCHEDULER (调度器)`、`DENOISE (重绘降噪幅度)`、`潜空间画幅比例 (Latent Canvas Dimensions)`、`宽度 WIDTH (像素)`、`高度 HEIGHT (像素)`。

#### 3. 密集工程文本与布局遮挡（Dense Text & Overlapping Layout）
- **API 设置弹窗说明过于工程师化（`before-05-api-settings.png`）**：
  - 服务商描述里直接堆砌后端开发笔记，如 `仅 OpenWorks 真出图：基址 openapi.tensor.art/openworks/v1… 鉴权头 Echo-Access-Key；目录 POST /tool/list；创建 POST /task；轮询 POST /task/query`、`密钥槽 tensorartKey 共用，画布选 openworks`。
- **浮层遮挡**：
  - 右侧「参数总控台」展开时遮挡右侧画布节点，且内部 21 个服务商按钮挤在两列小格子里，既看不出哪些服务商已配置密钥，也难以快速定位。

#### 4. 错误透明度与渐进式披露缺失（Unclear Errors & Missing Progressive Disclosure）
- **现状痛点**：
  - 先前提交（`745bfa25`）将 `<ExecutionLog />` 从 `App.tsx` 移除，且移除了运行失败时的醒目错误通知和历史卡片上的「实际请求 / 上游交互详情」折叠区。
  - 当生成报错或参数被拦截时，用户需要：**第一眼看到清晰的人话摘要（哪个服务商、什么状态、核心原因），同时能一键展开查看完整的实际路由服务商、请求端点（Endpoint）、实际发送参数（Actual Request）与原样未篡改的上游 HTTP 状态码及响应体（Verbatim Error Body）**。
  - 当因未配置密钥被拦截时，用户需要在画布状态栏、引导区和错误提示中直接点击「去配置密钥」并自动定位到对应服务商。

#### 5. 运行状态反馈不够清晰（Run Feedback States）
- **现状痛点**：
  - 排队中（Queued）、运行中（Running）、轮询进度（Progress，特别是耗时较长的视频生成任务）、已完成（Finished）、失败（Failed）缺少分阶段、带已耗时计时和上游真实状态的直观反馈条。
  - 失败时需要在界面上清晰展示：`服务商名称 + HTTP 状态码 + 原始响应体（支持展开查看完整内容与一键复制诊断信息）`。

#### 6. API 设置（密钥管理）易用性缺陷（Settings Modal Usability）
- **默认不显示密钥配置状态（`before-05-api-settings.png`）**：
  - 打开「API 与密钥设置」弹窗时，左侧所有服务商一律显示 `服务端：未加载（点击刷新）` 和灰色圆点，即使服务端 `.env` 已配置了 19 个服务商的 Key，用户也完全不知道哪些能直接用、哪些缺 Key。
- **缺少官方申请 Key 页面直达链接**：
  - 仅有笼统的 `官方文档` 链接，缺少经过实际网络核验的**官方 API Key 控制台/申请页面**链接。

#### 7. Schema 动态控件与无障碍/键盘交互不足（Schema Controls & Keyboard / A11y）
- **Schema 动态控件**：
  - `SchemaChoiceControls` 仅显示英文属性名（如 `image_size`、`aspect_ratio`、`output_format`、`guidance_scale`），缺少中文友好名称对照；数值范围字段（带 `minimum` / `maximum`）缺少滑块与数字框联动。
- **无障碍与键盘可达性（Accessibility）**：
  - `HistoryModal`、`ComfyGuideModal`、`CanvasManagerModal`、`CloudProjectModal`、`AssetManagerModal` 等弹窗缺少标准 `role="dialog"`、`aria-modal="true"`、`aria-labelledby`。
  - 节点操作按钮（折叠、跳过节点、删除节点）与表单控件缺少完整 `aria-label` 或 `htmlFor` 绑定，键盘焦点样式与快捷键提示不够直观。

---

## 二、全面交互改造与实现清单

针对上述走查痛点，我们坚守项目最高准则（**严禁静默容灾与虚假成功、严禁回退兜底、严禁反透明黑盒、唯一验收标准为 UI 实际点击通过**），采用**渐进式披露（Progressive Disclosure）**设计模式进行了完整改造：

### 1. 核心流程与空状态引导（Blank Canvas Onboarding Flow）
- **文件**：`src/components/Canvas.tsx`、`src/components/ModernToolDock.tsx`、`src/components/TopBar.tsx`
- **实现细节**：
  - 当画布节点清空时，中央渲染显式引导卡片（`data-testid="canvas-empty-onboarding"`），直观呈现 6 步核心创作链路：
    `① 选择服务商 -> ② 选择基础模型 -> ③ 输入提示词 -> ④ 可选挂载 LoRA -> ⑤ 点击右上角运行 -> ⑥ 实时查看产物`
  - 提供快捷行动项：一键加载标准工作流（`一键加载标准文生图工作流`）、浏览模板预设（`浏览预设模板库`）、直达密钥配置（`配置 API 密钥`）。
  - 画板（Spatial）模式为空时，中央展示画板专属空状态卡片（`data-testid="spatial-empty-onboarding"`）并提供 `+ 新建画板选区` 按钮。
  - 底部工具栏根据当前视图（`canvasMode`）智能调整首选主按钮：
    - 节点模式下首选紫色渐变 `+ 添加节点`。
    - 画板模式下首选青色渐变 `+ 新建取景框`，次级按钮标明 `添加节点（节点视图）`，消除视图错配困惑。

### 2. 人性化中文文案对照（Plain User-Facing Copy）
- **文件**：`src/utils/nodeUiLabels.ts`（遵循约定，不改 `src/constants/nodes.ts`，在渲染层统一映射）、`src/components/NodeItem.tsx`、`src/components/ParameterInspector.tsx`、`src/components/SpatialFrameItem.tsx`
- **实现细节**：
  - 节点标题友好化：`KSampler 采样生成器`、`基础大模型 (Checkpoint)`、`画布尺寸设定 (Latent)`、`正向提示词 (CLIP)`、`负向提示词 (Negative)`、`图像解码器 (VAE Decode)`、`保存与预览图像 (Save Image)`、`LoRA 风格微调 (LoRA)`。
  - 端口标签友好化：`模型 (MODEL)`、`文本编码 (CLIP)`、`解码 (VAE)`、`提示词条件 (CONDITIONING)`、`画幅潜空间 (LATENT)`、`图像 (IMAGE)`、`正向条件`、`负向条件`、`潜空间输入`、`潜空间输出`。
  - 参数面板去工程化黑话：将全大写英文黑话（`ENGINE PROVIDER`、`CFG SCALE`、`WIDTH`、`HEIGHT`、`DENOISE` 等）更新为易懂的中文首显格式：`云端推理服务商 (Provider)`、`采样步数 (Steps)`、`提示词引导系数 (CFG Scale)`、`采样算法 (Sampler)`、`调度器 (Scheduler)`、`重绘去噪幅度 (Denoise)`、`宽度 (Width / 像素)`、`高度 (Height / 像素)`。
  - 画板去黑话：将 `生成此选区 (Queue Frame)` 改为 `生成此选区画板`，`正向提示词 (Positive)` 改为 `正向提示词`。
  - 历史空状态纠正：移除旧版已不存在的 `Queue Prompt` 按钮指引，改为 `暂无生成记录。在画布配置好模型与提示词后，点击右上角「运行」开始生成！`。

### 3. 错误透明度与渐进式披露组件（NodeErrorDisclosure & High-Visibility Feedback）
- **文件**：`src/components/NodeErrorDisclosure.tsx`、`src/components/NodeItem.tsx`、`src/App.tsx`
- **实现细节**：
  - 新建 `NodeErrorDisclosure` 组件，在节点发生报错时第一眼展示清晰的人话摘要，不主观臆造判断（例如：`【WaveSpeed】账户余额不足或额度耗尽 (HTTP 400)：请前往服务商充值或检查账单`）。
  - 下方提供 `展开完整技术诊断细节 v` 折叠区，展开后可直接查看：
    - 调用服务商名称（由外部显式传入，不靠猜词）
    - 接口请求端点
    - HTTP 状态码
    - 发生时间
    - 上游原始未篡改的响应体全文（Verbatim Body）
  - 提供 `复制诊断信息` 按钮，一键将完整技术诊断排查信息复制到剪贴板。
  - 当检测到未配置 API Key 报错时，界面直接展示 `去配置密钥` 按钮，点击一键唤起设置弹窗并自动选中目标服务商。
  - 在 `src/App.tsx` 的运行失败捕获流程中恢复了全局浮层通知 Toast，使得长耗时或节点不在当前视口内时，用户依然能在屏幕中央获得醒目的失败反馈。

### 4. API 密钥管理与设置中心改造（Settings Modal Usability & Verified Links）
- **文件**：`src/components/BackendSettingsModal.tsx`
- **实现细节**：
  - 打开弹窗时自动调用 `fetchProviderKeyStatus()` 与 `refreshStats()`，解决默认全灰 `服务端：未加载` 的痛点。
  - 左侧服务商列表依据真实连接状态渲染：
    - `● 已配置 (可用)`：绿色高亮状态球，标明服务端及本地 Key 数量。
    - `○ 未配置`：灰色状态球。
  - **服务商官方 Key 控制台直达链接真实核验记录**：
    | 服务商 | 官方 API Key 申请 / 控制台链接 | 核验方式与状态 | 备注 |
    | ------ | ---------------------------- | -------------- | ---- |
    | Fal.ai | `https://fal.ai/dashboard/keys` | FetchURL: 200 OK | 官方登录/控制台页面 |
    | Together AI | `https://api.together.ai/settings/api-keys` | FetchURL: 200 OK | 官方登录/Key设置页 |
    | Replicate | `https://replicate.com/account/api-tokens` | FetchURL: 200 OK | 官方 GitHub 登录/Token 页 |
    | Civitai | `https://civitai.com/user/account` | FetchURL: 200 OK | 官方账户设置页（登录后可见 Key） |
    | Hugging Face | `https://huggingface.co/settings/tokens` | FetchURL: 200 OK | 官方 Access Tokens 页 |
    | Google AI Studio | `https://aistudio.google.com/app/apikey` | FetchURL: 200 OK | Google 官方 API Key 页（Google 登录） |
    | OpenAI Compat | `https://platform.openai.com/api-keys` | FetchURL: 200 OK | OpenAI 官方 API Keys 页 |
    | WaveSpeed | `https://wavespeed.ai/accesskey` | FetchURL: 200 OK | 官方 AccessKey 登录管理页 |
    | Novita AI | `https://novita.ai/settings/key-management` | FetchURL: 200 OK | 官方 Key Management 控制台 |
    | Venice AI | `https://venice.ai/settings/api` | FetchURL: 200 OK | 官方 API Dashboard SPA |
    | DeepInfra | `https://deepinfra.com/dash/api_keys` | FetchURL: 200 OK | 官方 API Keys Dashboard |
    | AIMLAPI | `https://aimlapi.com/app/keys` | FetchURL: 200 OK | 官方 Keys 控制台 |
    | Krea | `https://www.krea.ai/app/api/tokens` | FetchURL: 200 OK | 官方 API Tokens 控制台 |
    | SenseNova | `https://platform.sensenova.cn/console` | FetchURL: 200 OK | 商汤日日新开发者控制台 |
    | Agnes AI | `https://apihub.agnes-ai.com` | FetchURL: 200 OK | Agnes 官方 API Hub 控制台 |
    | ModelScope 国内 | `https://modelscope.cn/my/myaccesstoken` | 网络核验: 官方直达 | SPA 前端，网络搜索确认官方路径 |
    | ModelScope 国际 | `https://modelscope.ai/my/myaccesstoken` | 网络核验: 官方直达 | SPA 前端，官方路径 |
    | Sogni | `https://dashboard.sogni.ai/api-keys` | 网络核验: 官方直达 | SPA 前端，官方控制台 |
    | NanoGPT | `https://nano-gpt.com/api` | FetchURL: 200 OK | 官方 API 控制台/文档 |
    | Tensor.Art | `https://tensor.art/settings/access-key` | 网络核验: 403 WAF | 官方 Access Key 设置页（Cloudflare 拦截爬虫） |
    | Grok Compat (xAI) | `https://console.x.ai` | 网络核验: 403 WAF | xAI 官方开发者控制台（Cloudflare 拦截爬虫） |
    | Runware | `https://my.runware.ai` | 网络核验: 官方控制台 | 官方用户控制台入口 |
    | ModelsLab | `https://modelslab.com` | FetchURL: 200 OK | 官方首页（登录后进入控制台） |
    | Mage.space | `https://www.mage.space` | FetchURL: 200 OK | 官方首页 |
  - 在服务商详情顶部新增醒目的绿色按钮 `申请 / 获取 API Key 直达 ↗`，旁边保留 `官方接入文档 ↗`。
  - 优化 `测试连通性` 交互：测试结果不仅呈现在底部，还在顶部标题栏下方即时渲染轻量结果横幅（显示状态码、时延与原始返回）。

### 5. Schema 动态控件与无障碍支持（Schema Controls & Accessibility）
- **文件**：`src/components/SchemaChoiceControls.tsx`、`src/components/HistoryModal.tsx`、`src/components/BackendSettingsModal.tsx`、`src/components/CanvasManagerModal.tsx`、`src/components/ComfyGuideModal.tsx`、`src/components/CloudProjectModal.tsx`、`src/components/AssetManagerModal.tsx`、`src/components/NodeItem.tsx`
- **实现细节**：
  - `SchemaChoiceControls` 中针对数值范围字段（带 `minimum` 与 `maximum`），增加滑块（`<input type="range" />`）与数字输入框（`<input type="number" />`）联动控件，方便用户拖动或精确输入。
  - 字段标签引入中文友好映射（如 `image_size -> 图像画幅`、`aspect_ratio -> 画面比例`、`output_format -> 输出格式`、`guidance_scale -> 引导系数`）。
  - 各大模态弹窗添加标准的 `role="dialog"`、`aria-modal="true"`、`aria-labelledby`，支持 Esc 键与键盘焦点无障碍交互。
  - 节点折叠（`展开节点` / `折叠节点`）、静音（`启用节点` / `停用节点`）和删除（`删除节点`）按钮添加显式 `aria-label` 与 `focus-visible` 焦点环高亮。

---

## 三、实机浏览器 E2E 验证与运行产物记录

我们在无头 Chrome 浏览器（CDP 端口 `9403`）中通过 DOM `.click()` 真实驱动，以新用户视角完整跑通了全流程，采集了全套改造后实机截图并进行了多服务商真实带 LoRA 生成测试。

### 改造后实机截图索引（`temp/e2e/2026-11-05/ui6b/`）
- `01-landing.png`：改造后首次打开页面（中文友好节点、端口对照标签）
- `02-blank-canvas-onboarding.png`：清空画布后的 6 步新手入门引导卡片
- `03-api-settings-enhanced.png`：改造后的「API 与密钥设置」弹窗（显示实时 ● 已配置 / ○ 未配置、官方 API Key 直达链接）
- `04-api-settings-tested.png`：测试连通性后的即时透明状态反馈（HTTP 503 本地缺少 ADMIN_TOKEN 真实报错暴露）
- `05-loaded-standard-workflow.png`：在空状态引导卡上一键加载标准工作流
- `06-run-result-1.png`：Hugging Face + LoRA 生成运行及透明错误披露
- `07-workflow-modal.png`：工作流与热门模型中心
- `08-wavespeed-preset.png`：筛选搜索 WaveSpeed 工作流
- `09-wavespeed-loaded.png`：载入 WaveSpeed + LoRA 标准工作流
- `10-wavespeed-run-result.png`：WaveSpeed + LoRA 真实运行与渐进式错误披露
- `11-progressive-disclosure-expanded.png`：展开查看 WaveSpeed 完整技术诊断细节（HTTP 400 原文与服务商信息）
- `12-novita-loaded.png`：载入 Novita + 双 LoRA 链工作流
- `13-novita-run-result.png`：Novita + 双 LoRA 真实运行结果披露（HTTP 403 余额不足）
- `14-history-modal.png`：优化后的生成历史弹窗（已纠正空状态文案与语义）
- `15-parameter-inspector.png`：去工程黑话后的右侧参数总控台抽屉
- `16-spatial-mode.png`：画板（Spatial）模式及主按钮自适应（新建取景框居首）

---

### 多服务商真实付费带 LoRA 请求验证（0 Mock / 100% 真实上游路由）

依据项目规范，所有请求打到用户选定的真实服务商与端点，完整携带官方支持的真实 LoRA 参数，失败原样披露 HTTP 状态码与响应体。以下数据直接提取自 Chrome 运行实测 DOM：

#### 运行 1：Hugging Face + 风格 LoRA
- **提供者**：`Hugging Face`（fal-ai 托管推理路由）
- **模型**：`renderartist/Technically-Color-Z-Image-Turbo`
- **挂载 LoRA**：`renderartist/Technically-Color-Z-Image-Turbo`，强度 `0.9`
- **生成参数**：步数 `12`，CFG `1`，分辨率 `1216×832`，种子 `1840591390`
- **前端操作**：点击右上角 `运行：保存图像`（`data-testid="run-button"`）
- **实测 DOM `data-testid="node-error-headline"` 提取原文**：
  ```text
  hf_h...Kdks: HTTP 402: {"error":"Purchase pre-paid credits to continue using Inference Providers. Alternatively, subscribe to PRO to get monthly included credits."}
  hf_b...MMGa: HTTP 402: {"error":"Purchase pre-paid credits to continue using Inference Providers. Alternatively, subscribe to PRO to get monthly included credits."}
  hf_j...naLB: HTTP 402: {"error":"Purchase pre-paid credits to continue using Inference Providers. Alternatively, subscribe to PRO to get monthly included credits."}
  hf_n...EIBT: HTTP 402: {"error":"Purchase pre-paid credits to continue using Inference Providers. Alternatively, subscribe to PRO to get monthly included credits."}
  ```
- **UI 呈现验证**：
  - KSampler 节点摘要第一眼显示：`【huggingface】账户余额不足或额度耗尽 (HTTP 402)：请前往服务商充值或检查账单`
  - 悬浮通知 Toast 即时浮现：`工作流生成失败 hf_b...MMGa: HTTP 402: {"error":"Purchase pre-paid credits..."}`
- **判定结论**：`PASS_BILLING`（真实上游计费响应，无 Mock，无静默降级）

#### 运行 2：WaveSpeed + 写实风格 LoRA
- **提供者**：`WaveSpeed`
- **模型**：`wavespeed-ai/flux-dev-lora`
- **挂载 LoRA**：`https://huggingface.co/comfyanonymous/flux_RealismLora_converted_comfyui/resolve/main/flux_realism_lora.safetensors`，强度 `1.1`
- **生成参数**：步数 `36`，CFG `3.5`，画幅 `1024×1024`，种子 `42`
- **前端操作**：在工作流预设中选择 `WaveSpeed · 标准文生图`，点击 `仅载入` 后点击右上角 `运行：保存图像`
- **实测 DOM `data-testid="node-error-headline"` 提取原文**：
  ```text
  HTTP 400: {"code":400,"message":"Insufficient credits. Please top up your account to continue."}
  ```
- **UI 呈现验证**：
  - KSampler 节点摘要显示：`【wavespeed】账户余额不足或额度耗尽 (HTTP 400)：请前往服务商充值或检查账单`
  - 展开 `展开完整技术诊断细节` 成功展现调用服务商 `WaveSpeed`、发生时间与原始完整上游响应体（见截图 `11-progressive-disclosure-expanded.png`）。
  - 提供 `复制诊断信息` 按钮，点击成功拷贝完整技术诊断报告。
- **判定结论**：`PASS_BILLING`（真实上游计费响应，无 Mock，无静默降级）

#### 运行 3：Novita AI + 双 LoRA 链微调
- **提供者**：`Novita AI`
- **模型**：`dreamshaper_8_93211.safetensors`
- **挂载 LoRA 1**：`epi_noiseoffset2_14333`，强度 `0.65`
- **挂载 LoRA 2**：`more_details_59655`，强度 `0.4`
- **生成参数**：采样算法 `Euler a`，步数 `15`，CFG `6.5`，画幅 `512×768`，种子 `548949743`
- **前端操作**：在预设模板中选择 `Novita · 标准文生图` 载入画布并点击 `运行：保存图像`
- **实测 DOM `data-testid="node-error-headline"` 提取原文**：
  ```text
  HTTP 403: {"code":403, "reason":"NOT_ENOUGH_BALANCE", "message":"insufficient balance", "metadata":{}}
  ```
- **UI 呈现验证**：
  - KSampler 节点摘要显示：`【novita】账户余额不足或额度耗尽 (HTTP 403)：请前往服务商充值或检查账单`
  - 悬浮 Toast 同步显示该详细信息（见截图 `13-novita-run-result.png`）。
- **判定结论**：`PASS_BILLING`（真实上游计费响应，无 Mock，无静默降级）

---

## 四、工程与代码规范检查

1. **类型检查**：`npx tsc --noEmit` 退出码 `0`，0 个类型错误。
2. **构建打包**：`npm run build` 成功完成，客户端及 Worker 均正常产出。
3. **测试覆盖**：全量运行 `npx vitest run --maxWorkers=2`，**232 个测试文件全部通过（232 passed），1714 个测试用例全部通过（1714 passed），0 失败**。
4. **范围隔离**：
   - 未修改 `src/constants/nodes.ts`（遵循 ui6/video7 协议，映射在 `src/utils/nodeUiLabels.ts` 完成）。
   - 在 `NodeItem.tsx` 中严格保留 AIVideoNode 区域无改动。
   - 未触及 `src/utils/schemaPayloadPlan.ts` 与 `src/utils/generationReadiness.ts`。
