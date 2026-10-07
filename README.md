> **接手开发先读：[完整交接文档 HANDOFF.md](HANDOFF.md)。铁律、16 个产品板块、各家缺口、前端验收等级和真实证据均以该文档及最新实测为准。下文包含历史宣传与旧实现说明，不能当作当前全量能力或验收完成承诺。**

# ComfyUI Web Studio (AI 节点式工作流全栈生成平台)

## Sites 在线部署

本部署副本保留原始 `server.ts` 和 React 界面，通过 `hosting/build.mjs` 将 Express 接口适配为 Cloudflare Worker。运行 `npm run build` 生成前端及 Worker；`npm run dev` 仍可运行原始本地服务。

- 网站保持仅所有者可访问；在线管理使用 ChatGPT 登录身份，无需另填管理令牌。生产认证邮箱与原生网站所有者匹配，固定所有者账号；旧部署才使用首次绑定。
- 云端项目与生成历史接口使用 D1 保存索引、R2 保存项目和媒体文件；多画布浏览器缓存保留，并提供真实云端保存 / 加载按钮。
- 云端服务商设置通过 `CANVAS_SETTINGS_SECRET` 加密保存。该值只能配置为运行环境密钥，不得写入源码。
- AI 服务商模型、端点与参数处理逻辑沿用仓库。提供的测试 key 保存在 Sites 加密运行环境；可在设置中覆盖。实际生成验证见网站「真实生成验收」，未验证的模型和视频不代表已通过。
- `node hosting/check-hosting.mjs` 使用本地 Worker 验证数据保存、重启恢复及访问限制，禁止测试时调用外部服务商。


基于 React 19 + TypeScript + Tailwind CSS 构建的 Web 版 ComfyUI 节点式图像/视频/推理工作流平台。项目包含多供应商模型中心、LoRA、参数面板、工作流导入导出、执行记录与持久化。**具体供应商、模型和参数是否可用，以 HANDOFF.md、PROGRESS.md 及当前上游真实响应为准；目录可见、代码已接线或历史成功都不等于当前已经通过前端验收。**

---

## 🌟 核心特性与架构亮点

### 1. 🎨 专业级可视化节点画布 (Graph Canvas)
- **无限平移缩放与网格吸附**：支持超大无边潜空间画布、智能框选、多选移动与拓扑自动重排。
- **强类型端口安全连接**：贝塞尔曲线连接端口（支持 `MODEL`、`CLIP`、`LATENT`、`IMAGE`、`CONDITIONING`、`STRING`、`VIDEO` 等强类型检测与拓扑兼容转换）。
- **节点状态与操作**：支持节点折叠、跳过 (Bypass)、克隆、快速重命名、实时执行进度条与状态光晕。

### 2. 🔐 多 Key 配置与任务凭据一致性
- **多 Key 密钥池管理**：设置页可保存多个凭据；是否支持余额/健康查询取决于该供应商当前真实接口，不能把“有 Key”写成“账户可用”。
- **禁止失败后静默换 Key 重提生成**：一次生成任务使用已选定的凭据；Schema → 提交 → 轮询需要保持同一账户语义。引用失效时直接报错，不自动换另一把 Key。
- **不按状态码猜业务原因**：只有上游响应体明确给出鉴权、账户绑定、额度/余额信息时才做对应分类；网络无响应单独记为网络问题。

### 3. 💰 账户状态与错误透明度
- **余额能力按供应商实际接口核实**：只有已经核实存在余额/额度接口或上游明确返回额度信息的供应商才展示对应事实；没有接口就不虚构“实时余额”。
- **透明错误记录**：执行记录保留真实 endpoint、网站 HTTP、上游 HTTP、响应体和错误来源；欠费、鉴权、参数错误和网络失败分开记录。

### 4. 💎 Google Gemini 图像路线
- 模型列表与图像能力以当前 Gemini 官方接口和项目模型选择器为准，不在 README 固定承诺某个历史模型仍在线。
- Gemini 图像生成使用其原生自然语言 / 图像配置能力；**不要把 ComfyUI 的 Sampler、Steps、CFG、LoRA 等扩散参数假装成 Gemini 已接收字段**。未经过真实前端请求验证的能力不标记为通过。

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
前台为 Vite 驱动的 React SPA，后台由 `server.ts` 提供供应商路由、任务凭据、已核实的账户状态查询与端点审计服务。

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

| 服务商 / 路由 | 当前前端验收状态 | 边界 |
| :--- | :--- | :--- |
| **Civitai** | `PASS_GENERATION` | 当前网页已真实基础图 + LoRA 出图；不外推所有资源 |
| **WaveSpeed** | `PASS_GENERATION` | 已有带 LoRA 的真实前端生成证据 |
| **MuAPI** | `PASS_BILLING` | 普通 + LoRA 专用路由均真实到上游，当前 `INSUFFICIENT_CREDITS` |
| **Sogni** | `PASS_BILLING` | task created 后上游明确 `insufficient_credit` |
| **Fal.ai** | `PASS_BILLING` | `fal-ai/flux-lora` 已到达上游，当前 `TOP_UP` |
| **ModelScope CN** | `PASS_BILLING` | 当前图像路由明确 `insufficient balance` |
| **ModelScope AI** | `BLOCKED_AUTH` | 国际站账户要求绑定 Alibaba Cloud |
| **NanoGPT** | `BLOCKED_AUTH` | 当前真实前端请求 `Invalid session / invalid_api_key` |
| **Tensor.Art / TAMS** | `BLOCKED_AUTH` | 真实模型 ID 查询为 `unauthorized / app not found` |
| **Hugging Face** | `PASS_BILLING` | HF→fal-ai + FLUX.1-dev + HF LoRA 已到真实 HF Router，当前账户 HTTP 402 no remaining credits；旧 Space 结论不外推 |\n| **Gemini / Agnes / SenseNova / 兼容中转 / Video** | 见 HANDOFF / PROGRESS | 必须按具体路由与当前凭据逐项验收 |

---

## 📄 许可证

MIT License
