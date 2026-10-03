> 当前状态（2026-10-03）：下文含历史实现与历史验收描述，不能作为本次能力保证。以 CLAUDE.md 固定规则、PROGRESS.md 最新验收、public/verification/results.json 真实响应为准；禁止未经核实的自动模型/端点替换。

# 防踩坑与排错指南 (PITFALLS.md)

## 核心防坑与反毒化准则 (最高优先级)

1. **严禁静默容灾与假成功 (Anti-Fake-Success Rule)**：
   - 严禁在 Catch 块、空值判定或 API 报错时返回硬编码的 Prompt（如 `asian woman`、`masterpiece`）或静态图片。
   - 严禁在用户不知情的情况下私自切换 Provider、端点或模型。若上游报错，必须原样暴露真实 HTTP 状态码、响应体与错误堆栈。

2. **零硬编码密钥与动态配置原则 (Zero-Hardcoding)**：
   - 严禁在 `server.ts`、`src/services/api.ts` 或任何前端代码中硬编码真实/测试 API Key（如 `ak_tensor_...`、`fal_...`）。
   - 所有密钥必须严格通过环境变量 (`process.env.*`) 或客户端 Header (`x-*-key`) 动态传入，并交由 `KeyPoolManager` 统一调度。

3. **Tensor.Art OpenWorks 工具链与社区模型映射**：
   - 用户选用 18 位数字雪花 ID（如 `958694016000505570`）的社区 Checkpoint 时，若通过 OpenWorks 算力驱动，必须执行**语义对齐透明映射**（写实->`photoreal_studio`，二次元->`anime_lab`，视频->`wan27`，通用->`strong_text2image`）。
   - **绝对禁止 `tools.find() || tools[0]` 盲目回退**，且必须返回 `wasAdapted: true` 与 `adaptationNotice` 告知用户。

4. **NanoGPT 视频模型与生图模型端点物理隔离**：
   - `cat === 'video'` 必须严格调用官方 `https://nano-gpt.com/api/v1/video-models` (175 款视频大模型)，严禁与 `image-models` 混流。
   - `extractModelMetadata` 严禁仅凭 `id.includes('minimax')` 将文本生图模型（如 `minimax-h3/text-to-image`）误判为视频模型。

5. **服务商限流 (429 / Quota / Overloaded) 与失效 Key 的严谨界定**：
   - 上游报 `429`、`503`、`resource_exhausted`、`overloaded` 或 `rate limit` 时，属于临时配额/容量限制，必须标记为 `rate_limited` 并进入 60 秒冷却，绝不能误标记为 `invalid`（永久废弃）。
   - 仅当上游报 `401`、`403`、`invalid_api_key` 时，才标记为 `invalid`。

6. **ComfyUI 拓扑逆向溯源规范 (Img2Img & Img2Video)**：
   - 图生图 (Img2Img)：支持标准拓扑 `LoadImage -> VAEEncode -> KSampler` 与直连拓扑 `LoadImage -> KSampler`，有输入图时基准降噪比必须科学控制（默认 0.65）。
   - 图生视频 (I2V)：支持 `LoadImage -> AIVideoNode` 与 `SaveImage (前序产物) -> AIVideoNode`，引擎驱动必须根据 `image_url` 自动且透明地将 `text-to-video` 切换为 `image-to-video` 官方端点。

7. **Civitai 镜像域名处理**：
   - 用户输入的 `civitai.red` 或 `civitai.work` 链接需统一代理至 `https://civitai.com/images/:id` 抓取 HTML 内的 `__NEXT_DATA__` JSON，以规避镜像站 Cloudflare 拦截。

---
*更新时间：2026-09-28*
