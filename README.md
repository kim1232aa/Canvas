> **接手开发先读：[完整交接文档 HANDOFF.md](HANDOFF.md)。铁律、16 个产品板块、各家缺口、前端验收等级和真实证据均以该文档及最新实测为准。下文包含历史宣传与旧实现说明，不能当作当前全量能力或验收完成承诺。**

# ComfyUI Web Studio (AI 节点式工作流全栈生成平台)

## Sites 在线部署

本部署副本保留原始 `server.ts` 和 React 界面，通过 `hosting/build.mjs` 将 Express 接口适配为 Cloudflare Worker。运行 `npm run build` 生成前端及 Worker；`npm run dev` 仍可运行原始本地服务。

- 网站保持仅所有者可访问；在线管理使用 ChatGPT 登录身份，无需另填管理令牌。生产认证邮箱与原生网站所有者匹配，固定所有者账号；旧部署才使用首次绑定。
- 云端项目与生成历史接口使用 D1 保存索引、R2 保存项目和媒体文件；多画布浏览器缓存保留，并提供真实云端保存 / 加载按钮。
- 云端服务商设置通过 `CANVAS_SETTINGS_SECRET` 加密保存。该值只能配置为运行环境密钥，不得写入源码。
- AI 服务商模型、端点与参数处理逻辑沿用仓库。提供的测试 key 保存在 Sites 加密运行环境；可在设置中覆盖。实际生成验证见网站「真实生成验收」，未验证的模型和视频不代表已通过。
- `node hosting/check-hosting.mjs` 使用本地 Worker 验证数据保存、重启恢复及访问限制，禁止测试时调用外部服务商。


基于 React 19 + TypeScript + Tailwind CSS 构建的下一代 Web 版 ComfyUI 节点式 AI 图像/视频/推理生成工作流平台。支持专业级可视化节点连线、ComfyUI 原生拓扑调度、多渠道后端统一引擎驱动（Google Imagen 3 / Gemini、Fal.ai FLUX / SDXL、Tensor.Art OpenWorks、Agnes AI 极速生图、SenseNova 商汤日日新深度思考、Wan 2.1 电影级视频、Civitai 权重、ModelScope 魔搭社区、Hugging Face、NanoGPT）以及丰富的社区经典预设工作流一键载入与全透明执行。

---

## 🌟 核心特性与架构亮点

### 1. 🎨 专业级可视化节点画布 (Graph Canvas)
- **无限平移缩放与网格吸附**：支持超大无边潜空间画布、智能框选、多选移动与拓扑自动重排。
- **强类型端口安全连接**：贝塞尔曲线连接端口（支持 `MODEL`、`CLIP`、`LATENT`、`IMAGE`、`CONDITIONING`、`STRING`、`VIDEO` 等强类型检测与拓扑兼容转换）。
- **节点状态与操作**：支持节点折叠、跳过 (Bypass)、克隆、快速重命名、实时执行进度条与状态光晕。

### 2. ⚡ 多 Key 轮询与负载均衡总控 (Multi-Key Pool & Rotation)
- **多 Key 密钥池管理**：各服务商支持一次性配置多个 API Key（换行/逗号/分号批量录入），提供独立 Key 卡片与单项连通测速。
- **三种高可用轮询策略**：
  - **🔄 顺序轮询 (Round-Robin)**：在可用 Key 之间均匀循环分发，最大化并发吞吐与配额利用。
  - **🛡️ 主备故障切换 (Failover)**：优先使用首个主 Key，遭遇 429 限流或异常时自动平滑切换至备用 Key。
  - **⚡ 最优低延迟 (Best Latency)**：自动统计近期网络响应耗时，优先调用延迟最低的高速 Key。
- **实时限流冷却与自愈**：遇到 429 或配额耗尽错误时自动标记 `rate_limited` 并进入 60 秒冷却，冷却结束后自动恢复。
- **多 Key 负载监控面板 (Pool Monitor)**：可视化展示全平台各服务商 Key 总数、活跃数、限流数、鉴权异常数、调用频次与平均耗时。

### 3. 💰 服务商额度与余额实时管理 (Balances & Quotas)
- **全平台余额一键探测**：支持一键查询并展示阿里魔搭社区（魔粒状态）、Fal.ai（算力余额与 TOP_UP 状态）、NanoGPT、Agnes AI、SenseNova 商汤日日新、Tensor.Art 算力点数、Hugging Face 与 Google Gemini 的实时账户健康状态。
- **透明额度警报**：额度耗尽或余额不足时以原状态码及详细信息直接提示，绝不隐瞒或静默失败。

### 4. 💎 Google Gemini & Imagen 3 官方直连引擎
- **全系前沿模型接入**：
  - **Google Imagen 3.0** (`imagen-3.0-generate-002`)：顶级光影折射与高写实高保真艺术生图。
  - **Gemini 3.1 Flash Image** (`gemini-3.1-flash-image`)：新一代 Nano Banana 2 高清图像生成大模型，支持 1:1、16:9、9:16、4:3 等自适应画幅。
  - **Gemini 3.1 Flash Lite Image** (`gemini-3.1-flash-lite-image`)：极低延迟快速生图。
  - **Gemini 3.8 Flash** (`gemini-3.8-flash`)：旗舰多模态视觉理解与深度思考推理。
  - **Gemini 3.1 Pro** (`gemini-3.1-pro-preview`)：复杂逻辑与长链提示词推演。
- **官方 GenAI SDK 深度集成**：严格遵循服务端调用规范，支持智能画幅比例换算、引导系数（CFG）与多模态 Prompt 扩写。

### 5. 🎛️ ComfyUI 核心参数总控台 (Parameter Inspector)
- **全要素参数双向绑定**：实时同步 CLIP 正向/负向提示词、基底大模型 (Checkpoint)、云端推理引擎 (Provider)、采样步数 (Steps)、引导系数 (CFG Scale)、采样算法 (Sampler)、调度器 (Scheduler)、重绘降噪幅度 (Denoise) 与潜空间画幅比例 (Latent Canvas Dimensions)。
- **种子控制模式 (Seed Control)**：支持 **每次随机 (Randomize)**、**锁定固定 (Fixed)**、**递增 +1 (Increment)** 与 **递减 -1 (Decrement)**。
- **LoRA 堆叠与架构兼容性校验**：实时监控 LoRA 与 Checkpoint 的架构匹配状态（如 FLUX.1、SDXL、Krea 2），支持一键切换兼容底模与双向同步画布 `LoRALoader` 节点。

### 6. 🛡️ 严格反黑盒与零硬编码准则 (Strict Transparency & No Fallbacks)
- **严禁静默容灾与虚假成功**：绝不在底层私自替换 provider、端点、模型或使用 fake 伪数据假装成功。
- **全链路错误公开透明**：请求失败原样输出真实 HTTP 状态码、上游响应体与详细堆栈。
- **动态通用 API Schema 驱动**：所有模型 ID、路径、端点 URL 均支持自由输入与动态配置，彻底消除写死特化规则。

---

## 🚀 快速启动

### 1. 环境准备
本项目基于 Node.js 18+ 环境构建。

### 2. 安装依赖
```bash
npm install
```

### 3. 配置环境变量 (可选)
复制 `.env.example` 并配置相关云端服务商 Key（亦可在 Web 界面「后台设置」中实时录入与管理）：
```bash
cp .env.example .env
```

### 4. 启动全栈开发服务器
```bash
npm run dev
```
开发服务器将运行在 `http://localhost:3000`。
前台为 Vite 驱动的 React SPA，后台由 `server.ts` 提供统一引擎分发、多 Key 轮询管理、余额探测与端点审计服务。

### 5. 代码质量检查与构建
```bash
# 验证 TypeScript 类型与语法规范
npm run lint

# 生产环境打包构建
npm run build
```

---

## 🛠️ 项目目录结构

```
├── README.md                      # 项目主说明与功能全景
├── HANDOVER.md                    # 核心交接指南、数据流与维护准则
├── UNRESOLVED_ISSUES.md           # 技术审计报告、攻坚历程与已解决清单
├── ENGINE_LORA_SPECIFICATION.md   # 各引擎 LoRA 原生形状规范与反黑盒准则
├── server.ts                      # 全栈后端代理服务 (Fal, Gemini, Agnes, SenseNova, TensorArt, etc.)
├── package.json                   # 项目依赖与启动脚本
├── vite.config.ts                 # Vite 配置文件
├── src/
│   ├── App.tsx                    # 主视图编排、全局状态、快捷工具栏与历史抽屉
│   ├── index.css                  # 全局样式与 Tailwind 指令
│   ├── components/                # 业务 UI 组件
│   │   ├── Canvas.tsx             # 节点画布缩放、平移与连线渲染
│   │   ├── NodeItem.tsx           # 单个节点渲染 (KSampler, LoRA, VAE, LLM 推理等)
│   │   ├── TopBar.tsx             # 顶部工具栏与模型中心快速入口
│   │   ├── ParameterInspector.tsx # ComfyUI 核心参数总控台 (Prompt, Checkpoint, KSampler, LoRA)
│   │   ├── BackendSettingsModal.tsx # API 接入管理、多 Key 轮询总控与余额查询弹窗
│   │   ├── ModelHubModal.tsx      # 全生态模型中心 (Checkpoints, LoRAs, Video Models)
│   │   ├── AssetManagerModal.tsx  # 资产库与生成历史管理弹窗
│   │   ├── WorkflowPresetsModal.tsx # 官方预设与 Civitai 逆向一键生成工作流弹窗
│   │   └── ResultGalleryModal.tsx # 生成结果大图画廊与参数回溯面板
│   ├── constants/
│   │   ├── nodes.ts               # 节点定义字典 (LLMReasoning, VAEEncode, KSampler, etc.)
│   │   └── presets.ts             # 官方工作流预设库
│   ├── engines/                   # 模块化引擎驱动 (Drivers)
│   │   ├── BaseEngineDriver.ts    # 引擎抽象基类
│   │   ├── EngineRegistry.ts      # 引擎注册与调度中心
│   │   └── drivers/               # 各引擎具体实现 (Fal, Gemini, Agnes, SenseNova, etc.)
│   ├── services/
│   │   └── api.ts                 # 前端 API 统一封装与多 Key 请求交互
│   ├── types/
│   │   ├── graph.ts               # 节点、连线与 ComfyParameters 类型定义
│   │   └── providers.ts           # 服务商、多 Key 轮询与余额数据结构
│   └── utils/
│       ├── graphEngine.ts         # 工作流参数反向拓扑解析与执行引擎
│       ├── baseModelMatcher.ts    # 底模与 LoRA 架构兼容性智能校验器
│       └── engineParameterNormalizer.ts # 参数归一化与 ComfyUI JSON 导出工具
```

---

## 📡 支持的云端算力与大模型生态

| 服务商 (Provider) | 核心模型与能力 | 典型应用场景 |
| :--- | :--- | :--- |
| **Google Gemini** | `imagen-3.0-generate-002`, `gemini-3.1-flash-image`, `gemini-3.8-flash` | 高保真光影生图、多模态视觉推理与提示词重构扩写 |
| **Fal.ai** | `fal-ai/flux/dev`, `fal-ai/flux/schnell`, `fal-ai/fast-sdxl` | FLUX.1 与 SDXL 极速 GPU 扩散生成与多 LoRA 栈式推理 |
| **Tensor.Art** | FLUX.1, SDXL 1.0, Pony V6, Illustrious-XL, Wan 2.1 | OpenWorks OpenAPI 海量开源模型与二次元/写实微调 |
| **Agnes AI** | `agnes-image-2.5-flash`, `agnes-3.0-flash` | 秒级极速生成、动态运镜视频与思维链大模型推演 |
| **SenseNova (商汤)** | `deepseek-v4-flash`, `deepseek-v4-pro`, `glm-5.2` | 百万上下文深度思维链 (CoT) 构图与提示词工程 |
| **ModelScope (魔搭)** | `Tongyi-MAI/Z-Image-Turbo`, `damo/wan2.1-t2i`, 国潮 LoRA | 阿里开源前沿生图与视频模型 (支持国内站与国际站) |
| **Hugging Face** | `FLUX.1-schnell`, `stable-diffusion-xl-base-1.0` | 开源 Diffusers 与 Serverless 社区扩散生态 |
| **NanoGPT** | `flux-schnell`, `sdxl-turbo` | 按张计费轻量化极速通道 |
| **Civitai** | 100,000+ 社区 LoRA、Checkpoints 与微调模型 | 社区模型检索与一键逆向提取工作流 |

---

## 📄 许可证

MIT License
