> 当前状态（2026-10-13）：下文含历史实现与历史验收描述。以 CLAUDE.md 固定规则、PROGRESS.md 最新验收、public/verification/ 真实响应为准；禁止未经核实的自动模型/端点替换与静默丢弃。

# 项目已知与已解决问题跟踪表 (UNRESOLVED_ISSUES.md)

## 最新修复与全链路审计记录 (2026-10-13)

### 15. Tensor.Art 视频分类与真实 CDN 封面解析 (已修复)
- **现象描述**：在模型中心选择「AI 视频」并筛选 Tensor.Art 时，返回 0 个模型；且部分社区卡片未展示源站真实图片。
- **根因分析**：
  1. 吐司社区原生存在 `VIDEO` 架构类型（如 MiniMax、Wan），但之前在 `fetchTensorArtModelsList` 中仅识别 LoRA，且非 LoRA 默认硬编码为 `Checkpoint`。
  2. 属于视频微调的权重被标记为 `LoRA` 且未打上 `video` 标签，导致在 `matchCategory` 中被误杀过滤。
- **修复方案**：引入 `isVideo` 智能识别与分类标签注入，当 `cat === 'video'` 时赋予 `category: 'Video'` 与 `video` 标签；直接从 HTML 正则捕获 `https://images.tusiassets.com/...`（包含 `mp4!snapshot` 视频抽帧缩略图），实测 32 款社区视频大模型全量展示。

### 16. NanoGPT 视频大模型与生图大模型物理隔离 (已修复)
- **现象描述**：NanoGPT 视频专区模型数量与官方接口不符，且生图模型混入视频专区。
- **根因分析**：
  1. 后端未按分类做端点分流，同时请求了 `image-models` 与 `video-models`。
  2. `extractModelMetadata` 仅凭 `id.includes('minimax')` 将文本生图模型（如 `minimax-h3/text-to-image`）误归为视频。
- **修复方案**：`cat === 'video'` 时严格直连官方 `https://nano-gpt.com/api/v1/video-models`（175 款视频大模型）；生图时直连 `image-models`（239 款生图模型）；补全官方源站 SVG 品牌图标。

### 17. Google Gemini / 多引擎限流 (429 / Quota / Overloaded) 状态感知 (已修复)
- **现象描述**：Gemini 遇到 `generic::resource_exhausted` 或 `API is currently overloaded` 时，单 Key 测速池误将其标记为 `invalid`（永久废弃）。
- **根因分析**：`KeyPoolManager.recordResult` 之前对错误字符串做大小写敏感匹配，遗漏了全小写的 `resource_exhausted`、`overloaded` 与 `503`。
- **修复方案**：重构错误感知器，精准命中限流与负载过载状态，触发 60 秒冷却解冻队列；移除了提示词增强中静默替换为假提示词的 Fallback 行为。

### 18. Tensor.Art 社区模型与 OpenWorks 工具误接线彻底修正 (已修正)
- **错误现状核实**：此前曾试图建立 OpenWorks 工具名（`photoreal_studio`, `anime_lab` 等）与社区模型 ID 的“语义对齐”，这在 ComfyCanvas 扩散节点画布体系中属于错误接线（将工具 API 冒充扩散底模）。
- **根因与修复**：彻底废弃并移除任何将 OpenWorks 工具映射为 Checkpoint 模型的兜底逻辑。Tensor.Art 在画布中严格对应原生 TAMS API；当查询社区模型 ID 或端点失败时，原样暴露官方 HTTP 状态（如 404 unauthorized / app not found）与错误细节，禁止任何静默偷换工具或模型行为。

### 19. 文生图、图生图与图生视频全管线闭环审计 (已验证)
- **验证项**：
  1. 图生图：`LoadImage -> VAEEncode -> KSampler` 与 `LoadImage -> KSampler` 自动提取 `initImageUrl`，默认基准降噪比科学控制（0.65）。
  2. 图生视频：`LoadImage -> AIVideoNode` 与前序产物串联，根据 `image_url` 自动透明适配至官方 `image-to-video` 端点。
  3. 各引擎驱动（Fal, Gemini, NanoGPT, TensorArt, Agnes, ModelScope）全量支持 `image_url` 与 `strength` 透传。

### 20. 跨模型架构 LoRA 混用强校验与禁止静默丢弃 (已修复)
- **现象描述**：当用户在画布中将与底模架构不匹配的 LoRA（如在 FLUX.1 底模挂载 Krea2 Turbo / SDXL LoRA）连接到采样节点时，系统曾出现记录 warning 但静默剔除 LoRA 继续发送给上游、伪造“生成成功”的违规降级行为。
- **修复方案**：在 `graphEngine.ts` 与 `resolveCheckpoint.ts` 建立严格架构兼容性断言；架构不兼容时直接阻断执行并向用户明确报错，严禁静默丢弃 LoRA 发起虚假请求。

### 21. 云端一体化引擎节点孤立与双轨并存补全 (已修复)
- **现象描述**：`ReplicateEngineNode`、`ModelScopeNode`、`ModelScopeAiNode`、`NanoGPTNode`、`FalAIEngineNode`、`GoogleImagenNode` 曾在 `ModernToolDock` 缺少入口、在 `ModelHubModal` 无法直接添加，沦为孤立节点。
- **修复方案**：采用双轨并存方案（标准 ComfyUI Checkpoint 链与一体化引擎节点并存），在 `ModernToolDock` 正式设立「云端一体化加速引擎」分类，在 `ModelHubModal` 增设「添加一体化引擎节点」专属按钮，打通 `NodeItem` 高级参数白名单与节点级出图渲染，完成全链路贯通。

### 22. Replicate 官方推理引擎全链路接入 (已完成)
- **实现内容**：新增 `ReplicateDriver`、`replicateImageContract`、`replicateRoutes`，支持 FLUX.1、SDXL、Ideogram 等模型。后端 `/api/model-schema` 对接 Replicate 官方 OpenAPI Schema 提取 Input 字段规范。全链路支持任务轮询、参数校验与上游 402/401/422 错误透明回传。

---

*当前范围：所有上述项均已通过无头浏览器 E2E 走查与自动化单元测试验证。*
