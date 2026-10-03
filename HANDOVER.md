> 当前状态（2026-10-03）：下文含历史实现与历史验收描述，不能作为本次能力保证。以 CLAUDE.md 固定规则、PROGRESS.md 最新验收、public/verification/results.json 真实响应为准；禁止未经核实的自动模型/端点替换。

# 模块交接与架构说明文档 (HANDOVER.md)

## 一、系统核心设计准则 (最高原则)

1. **绝对禁止静默容灾与黑盒虚假成功 (Anti-Black-Box Rule)**：
   - 当 API 请求、模型抽取、云端服务商接口调用失败时，系统**必须**立即透明透传上游返回的真实错误信息与 HTTP 状态码。
   - 严禁硬编码默认提示词、禁止隐蔽容灾降级、严禁在后端偷偷更换模型或 Provider。
2. **零硬编码与动态 API Schema 驱动 (Zero-Hardcoding)**：
   - 彻底杜绝硬编码 Key。所有模型 ID、端点 URL、API Key 均支持动态配置与自定义扩展，支持任意第三方兼容端点。
   - 前端节点与属性面板支持自定义输入任意合法模型路径或 URN。
3. **多 Key 轮询与负载均衡架构 (Multi-Key Load Balancing)**：
   - 后端 `KeyPoolManager` 支持 `round_robin`（顺序轮询）、`failover`（主备故障切换）与 `latency_best`（最优低延迟）三种调度模式。
   - 遭遇 429/503/Quota 限流时自动进入 60 秒冷却解冻队列，遭遇 401/403 鉴权失败时标记为 `invalid`。
4. **ComfyUI 纯正潜空间拓扑生态**：
   - 核心参数面板 (`ParameterInspector`) 与画布节点 (`KSampler`, `CheckpointLoaderSimple`, `LoRALoader`, `EmptyLatentImage`, `CLIPTextEncode`) 严格双向数据同步。
   - 全链路支持图生图 (Img2Img: `LoadImage -> VAEEncode -> KSampler`) 与 图生视频 (I2V: `LoadImage -> AIVideoNode`) 拓扑逆向溯源。

---

## 二、核心模块拓扑与职责划分

| 模块路径 | 职责描述 |
| :--- | :--- |
| `server.ts` | 全栈服务端入口，集成多服务商代理、`KeyPoolManager` 多 Key 调度、余额探测与端点审计 |
| `src/engines/` | 模块化引擎驱动层，包含 `FalDriver`, `GeminiDriver`, `AgnesDriver`, `SenseNovaDriver`, `TensorArtDriver`, `ModelScopeDriver`, `HuggingFaceDriver`, `NanoGPTDriver`, `VideoDriver` |
| `src/utils/graphEngine.ts` | 拓扑图逆向追踪器与参数解析执行器，支持图生图 (Img2Img) / 图生视频 (Img2Video) 溯源 |
| `src/components/ParameterInspector.tsx` | ComfyUI 核心参数总控台，支持 Prompt 实时编辑、KSampler 参数、Seed 控制模式、LoRA 堆叠 |
| `src/components/BackendSettingsModal.tsx` | 云端 API 接入管理、多 Key 录入与单项测速、轮询策略选择、负载监控与余额查询 |
| `src/components/ModelHubModal.tsx` | 全生态模型中心，严格分流 Checkpoint 底模、LoRA 微调模型与 AI 视频大模型 |
| `src/components/CivitaiModal.tsx` | 社区 LoRA 枢纽，支持 18 位雪花 ID 自动解析与触发词一键挂载 |
| `src/components/AssetManagerModal.tsx` | 资产管理器，支持本地图片/视频持久化上传、历史记录检索、一键引入为画布空间框 |

---

## 三、环境配置与密钥注入

所有密钥支持两种配置方式：
1. **系统环境变量（服务端推荐）**：在 `.env` 或部署环境中注入 `GEMINI_API_KEY`, `FAL_KEY`, `SENSENOVA_KEY`, `AGNES_KEY`, `TENSORART_API_KEY`, `CIVITAI_API_KEY`, `HF_TOKEN`, `MODELSCOPE_TOKEN`, `NANOGPT_KEY`。
2. **客户端 LocalStorage（用户自定义）**：用户在「后台设置」中填写的 Key 会通过 HTTP Header (`x-*-key`) 实时透传并与服务端多 Key 池合并调度。

---

*最新更新日期：2026-09-28*
