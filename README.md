# ComfyUI Web Studio (AI 节点式工作流全栈生成平台)

> ⚠️ **项目基准与首要阅读指引**：
> 接手开发请务必先查阅 [完整交接基准 HANDOFF.md](HANDOFF.md)、[未闭环与审计跟踪 UNRESOLVED_ISSUES.md](UNRESOLVED_ISSUES.md) 以及 [最新端到端 UI 实测证据 docs/evidence/2026-11-05/final.md](docs/evidence/2026-11-05/final.md)。
> 历史交接文档（如 `ENGINE_LORA_SPECIFICATION.md`、`PITFALLS.md`、`HANDOVER.md`、`docs/HANDOVER-2026-10-05.md` 等）均为早期 Agent 编写的**未验证历史文档（Unverified History）**，包含已过期的推断与历史描述，**不得作为当前事实依据**。

---

## 一、项目核心最高规则与验收准则 (Project Rules)

本项目严格遵守最高工程规范与用户逐字指示：

1. **唯一验收标准**（用户原文逐字）：
   > **「我的验收标准只有一个，UI实际点击通过并有产物，你之前绕过前端直接请求api的是违规，是绕过，你请求api通过，和我前端点击通过根本不是一回事」**
   - 严禁绕过前端直接打 API、跑 curl 或用脚本请求代替验收。任何没有前端真实点击运行证据的交付一律视为未通过。
2. **单元测试与实际问题解决**（用户原文逐字）：
   > **「最后：单元测试通过绝不等于实际问题解决」**
   - 单元测试覆盖只作为代码回归安全网，绝不代表实际业务问题已解决。
3. **余额不足政策**（用户原文逐字）：
   > **「余额不足不做卡点，先集成api，错误能原样透传算暂时通过」**
   - 全参数请求成功抵达真实上游服务商，上游返回的欠费/余额不足错误原样透传展示时，按 `PASS_BILLING` 暂定通过。
4. **透明错误与反黑盒准则**：
   > **「不要美化报错，原样放回」「严禁静默容灾与虚假成功」「禁止多余的拦截」**
   - 严禁在底层偷换 provider、端点、模型或使用 fake 数据伪造成功。
   - 请求失败必须原样、完整展示真实 HTTP 状态码与响应体，绝不使用 fallback 兜底掩盖错误。
5. **NSFW 与安全开关策略**（用户原文逐字）：
   > **「我们不反对nsfw，有nsfw开关的都默认开启」**
   - 凡服务商官方 API / live schema 中真实存在的安全开关（如 `enable_safety_checker`、`disable_safety_checker`、`safe_mode`、`allowMatureContent` 等），一律默认取放开方向（如 `enable_safety_checker=false`、`disable_safety_checker=true`、`safe_mode=false`、`allowMatureContent=true`）。
   - 默认值在前端节点与参数检查器中完全公开可见、可由用户按节点一键切回，实际发送的请求体与历史记录中如实记录；严禁隐式暗中注入。

---

## 二、全量服务商前端 UI 验收矩阵 (Provider Acceptance Matrix)

所有服务商在节点画布与参数总控台中均严格按照实际端点分类。状态严格采用 7 类标准标签：
- `PASS_GENERATION`: 界面可见真实生成产物。
- `PASS_BILLING`: 全参数请求抵达上游，上游欠费/额度不足报错原样透传。
- `BLOCKED_AUTH`: 401 鉴权失效。
- `BLOCKED_CONFIG`: 本地未配置对应 API Key。
- `NOT_SENT`: 请求未出站（如未接入端点本地明确报错）。
- `CONTRACT_REJECT`: 非计费类 400/422/404 契约异常。
- `WIRING_BUG`: 接线故障。

| 服务商 (Provider) | 图像生成状态 (Image) | 视频生成状态 (Video) | 最近实测日期 | 证据文档索引 | 状态说明与边界 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Civitai** | `PASS_BILLING` | `PASS_BILLING` | 2026-11-07 | [final.md](docs/evidence/2026-11-05/final.md) | 图像与视频工作流请求直达上游，返回 `400 insufficientBuzz` 原样透传；历史出图样本见 `public/verification/` |
| **Fal.ai** | `PASS_BILLING` | `PASS_BILLING` | 2026-11-07 | [final.md](docs/evidence/2026-11-05/final.md) | Krea-2 / Wan 2.2 T2V/I2V LoRA 达真实 Fal 队列，返回 `403 Exhausted balance` |
| **WaveSpeed** | `PASS_BILLING` | `PASS_BILLING` | 2026-11-08 | [acceptance.md](docs/evidence/2026-11-08/acceptance.md) | 图像与视频请求真实出站至上游，返回 `400 Insufficient credits` 原样透传；因磁盘 `data/` 无产物文件，图像原 PASS_GENERATION 声明已按产物诚实原则降级为 `PASS_BILLING` |
| **Hugging Face** | `PASS_BILLING` | `NOT_SENT` | 2026-11-07 | [final.md](docs/evidence/2026-11-05/final.md) | Z-Image Turbo 达 HF Inference Router，无多余路由下拉；返回 `402 Purchase pre-paid credits` (`final/06-hf-zimage-run.png`)；视频路由未接通 |
| **ModelScope 魔搭 CN** | `PASS_BILLING` | `NOT_SENT` | 2026-11-07 | [final.md](docs/evidence/2026-11-05/final.md) | 图像直达魔搭国内站，返回 `insufficient balance`；视频未声明构建路径 |
| **ModelScope 魔搭 AI** | `PASS_BILLING` | `NOT_SENT` | 2026-11-07 | [final.md](docs/evidence/2026-11-05/final.md) | 国际站独立账户接入，返回欠费/余额不足；视频未构建 |
| **Sogni** | `PASS_BILLING` | `PASS_BILLING` | 2026-11-08 | [acceptance.md](docs/evidence/2026-11-08/acceptance.md) | 任务创建成功 (201/200)，轮询返回 `waiting_for_user: insufficient_credit`；I2V 动态切入 `animate_photo`；导入时明确区分来源 URL 与 personal-LoRA ID |
| **AIMLAPI** | `PASS_BILLING` | `NOT_SENT` | 2026-11-07 | [final.md](docs/evidence/2026-11-05/final.md) | 图像 `std-aimlapi-t2i` 直达 `/v1/images/generations`，返回 `403 Out of funds`（`final/10-aimlapi-run.png`）。`VIDEO_PROVIDERS`（`src/server/routes/videoGenerateRoute.ts:130`）不含 aimlapi，本轮无 AIMLAPI 视频截图，视频标 `NOT_SENT` |
| **DeepInfra** | `PASS_BILLING` | `NOT_SENT` | 2026-11-08 | [acceptance.md](docs/evidence/2026-11-08/acceptance.md) | FLUX-2-klein-9b 直达端点，M46 实机运行返回 `402 Payment Required`，`actualRequest` 与原始响应透传展示 (`docs/evidence/2026-11-08/13-real-run...` / `14-real-run...`)；未构建视频 |
| **Venice AI** | `PASS_BILLING` | `NOT_SENT` | 2026-11-07 | [final.md](docs/evidence/2026-11-05/final.md) | 图像 `std-venice-t2i` 填写非空 CLIP 提示词后出站，`final/14-venice-run.png` 原样展示 `【venice】HTTP 402 Payment Required: {"error":"Insufficient USD or Diem balance to complete request. Visit https://venice.ai/settings/api to add credits."}`。`VIDEO_PROVIDERS` 不含 venice，无 Venice 视频截图，视频标 `NOT_SENT` |
| **Krea** | `BLOCKED_CONFIG` | `NOT_SENT` | 2026-11-07 | [final.md](docs/evidence/2026-11-05/final.md) | 预设 `std-krea-t2i`（`image/krea/krea-2/medium-turbo`）与 Civitai 导入目标芯片存在于 UI；本轮未配置 `KREA_API_KEY` 的出站复测，图像标 `BLOCKED_CONFIG`。`VIDEO_PROVIDERS` 不含 krea，视频标 `NOT_SENT` |
| **ModelsLab** | `PASS_BILLING` | `NOT_SENT` | 2026-11-07 | [final.md](docs/evidence/2026-11-05/final.md) | M31：`std-modelslab-t2i` 填入 `z-image-turbo` 后真实出站 `POST https://modelslab.com/api/v6/images/text2img`；`final/17-modelslab-loaded.png` / `18-modelslab-run.png` 原样展示订阅套餐限制。未接入视频 |
| **Mage.space** | `PASS_BILLING` | `NOT_SENT` | 2026-11-07 | [final.md](docs/evidence/2026-11-05/final.md) | mango-v3 直达端点，返回 `402 Payment Required`；未接入视频 |
| **Novita AI** | `PASS_BILLING` | `NOT_SENT` | 2026-11-08 | [acceptance.md](docs/evidence/2026-11-08/acceptance.md) | SD 异步生图返回 `403 NOT_ENOUGH_BALANCE`；SVD-XT 视频已被 RETIRED_PATTERNS 标记退役且 VIDEO_PROVIDERS 不含 novita，无法从当前 UI 触达，视频诚实标注为 `NOT_SENT` |
| **MuAPI** | `PASS_BILLING` | `NOT_SENT` | 2026-11-07 | [final.md](docs/evidence/2026-11-05/final.md) | 图像直达端点，返回 `402 INSUFFICIENT_CREDITS`；视频路径尚未打通 |
| **NanoGPT** | `BLOCKED_AUTH` | `BLOCKED_AUTH` | 2026-11-08 | [acceptance.md](docs/evidence/2026-11-08/acceptance.md) | 图像与视频路由均返回 `401 Invalid session / invalid_api_key`；视频独立接入 `/api/generate-video` |
| **Together AI** | `BLOCKED_AUTH` | `NOT_SENT` | 2026-11-07 | [final.md](docs/evidence/2026-11-05/final.md) | 图像 `final/08-together-flux2-run.png` 原样 `401 Invalid API key`。`VIDEO_PROVIDERS` 不含 together，本轮无 Together 视频截图，视频标 `NOT_SENT` |
| **Tensor.Art (TAMS)** | `BLOCKED_CONFIG` | `NOT_SENT` | 2026-11-08 | [acceptance.md](docs/evidence/2026-11-08/acceptance.md) | 模型查询返回鉴权拒绝；视频输入纯数字模型 ID 明确返回「尚未接入 TAMS 视频」本地拒绝，不偷换路由 |
| **Tensor.Art (OpenWorks)** | `PASS_BILLING` | `NOT_SENT` | 2026-11-08 | [acceptance.md](docs/evidence/2026-11-08/acceptance.md) | 按 SchemaProvider 运行；因本地 `data/` 无对应产物文件，原 PASS_GENERATION 声明已按产物诚实原则降级为 `PASS_BILLING`；未接入视频 |
| **SenseNova (商汤)** | `BLOCKED_CONFIG` | `NOT_SENT` | 2026-11-07 | [final.md](docs/evidence/2026-11-05/final.md) | 图像驱动已构建并支持 `sensenova-u1.5-lite`，未配置 Key 时提示配置；非 FAIL_INTEGRATION |
| **Agnes AI** | `BLOCKED_CONFIG` | `BLOCKED_CONFIG` | 2026-11-07 | [final.md](docs/evidence/2026-11-05/final.md) | 图像与视频驱动均已接入，当前本地未配置 `AGNES_KEY` |
| **Google Gemini** | `BLOCKED_CONFIG` | `NOT_SENT` | 2026-11-08 | [acceptance.md](docs/evidence/2026-11-08/acceptance.md) | M83 已全面校准全景矩阵：Google Gemini 原生图像 (gemini-3.1-flash-image) 驱动已接通，提示词原样透传，无免 Key 兜底；当前未配置 `GEMINI_API_KEY` |
| **Replicate** | `BLOCKED_CONFIG` | `NOT_SENT` | 2026-11-07 | [final.md](docs/evidence/2026-11-05/final.md) | 动态模型 Schema 驱动已接通，预设模型留空待用户在模型中心自主选用 |
| **Runware** | `BLOCKED_CONFIG` | `NOT_SENT` | 2026-11-08 | [acceptance.md](docs/evidence/2026-11-08/acceptance.md) | 官方 AIR / Model 动态驱动已接通，Civitai 导入支持 AIR 规范解析与要求明确呈现 |

---

## 三、快速启动与开发环境 (Quick Start)

### 1. 运行环境要求
- **Node.js**: `Node.js 22+`（实测采用 `v22.23.2`）。
- **浏览器环境**: Google Chrome / Chromium（支持最新 Web 标准与 CDP 自动化交互）。

### 2. 依赖安装与启动
```bash
# 安装生产与开发依赖
npm install

# 启动全栈开发服务器 (Express 后端 + Vite SPA 中间件)
npm run dev

# 或指定端口启动后端
npx tsx server.ts --port 3000
```
本地服务启动后，访问 `http://127.0.0.1:3000` 即可开始创作。

### 3. 代码质量与全量测试
```bash
# TypeScript 类型检查 (package.json: "lint": "tsc --noEmit")
npm run lint

# 生产环境打包构建 (生成 hosting/server.generated.ts 与 dist/)
npm run build

# 运行全量 Vitest 单元与契约测试 (排除 .tower 与 node_modules)
npx vitest run --maxWorkers=2 --exclude '.tower/**' --exclude '**/node_modules/**' --exclude '**/dist/**'
```

---

## 四、项目真实目录结构 (Filesystem Verified Architecture)

本目录树由真实文件系统命令验证生成，剔除任何虚构文件：

```text
├── README.md                      # 项目说明、核心规则、服务商矩阵与架构全景
├── HANDOFF.md                    # 唯一交接基准文档（真实提交、全量测试计数与闭环说明）
├── UNRESOLVED_ISSUES.md           # 待充值复测清单、未验证交互场景与技术审计追踪
├── PROGRESS.md                    # 历史进度记录与最新验收基线
├── PITFALLS.md                    # 历史防踩坑说明（未验证历史）
├── HANDOVER.md                    # 历史架构交接说明（未验证历史）
├── ENGINE_LORA_SPECIFICATION.md   # 历史引擎规范说明（未验证历史）
├── server.ts                      # 全栈后端代理服务、鉴权调度与通用 OpenAPI 路由
├── package.json                   # 项目依赖与执行脚本
├── tsconfig.json                  # TypeScript 编译器配置
├── vite.config.ts                 # Vite 打包与开发服务配置
├── .env.example                   # 真实代码读取的环境变量模板
├── hosting/                       # Cloudflare Workers / Sites 适配层
│   ├── build.mjs                  # 生产构建与代码生成脚本
│   ├── check-hosting.mjs          # 本地 Worker 环境持久化与恢复测试脚本
│   ├── worker.ts                  # Cloudflare Worker 入口与 D1/R2 存储绑定
│   └── routes.ts                  # Worker 端轻量路由分发
├── docs/                          # 架构、审计与一手证据归档
│   ├── evidence/                  # 真实浏览器点击录屏、截图与请求日志
│   │   └── 2026-11-05/            # 2026-11-05 / 11-07 阶段性全量实测证据
│   │       ├── final.md           # M25 全量回归终结报告与实机截图索引
│   │       └── final/             # 41 张独立唯一 MD5 全量高保真实机截图 (*.png)
│   └── providers/                 # 供应商协议规格与在线 Schema 说明
└── src/                           # 前端核心业务源码
    ├── App.tsx                    # 主视图编排、全局状态流、顶栏与弹窗交互
    ├── main.tsx                   # React 19 应用启动入口
    ├── index.css                  # 全局样式与 Tailwind CSS 声明
    ├── components/                # 业务 UI 组件库
    │   ├── Canvas.tsx             # 节点画布缩放、平移与连线渲染
    │   ├── NodeItem.tsx           # 单个节点渲染 (KSampler, LoRA, VAE, AIVideoNode 等)
    │   ├── TopBar.tsx             # 顶部工具栏 (运行按钮、模型、LoRA、工作流入口)
    │   ├── ParameterInspector.tsx # ComfyUI 核心参数总控台 (NSFW 控件、Prompt、Sampler)
    │   ├── WorkflowPresetsModal.tsx # 工作流预设模板中心与 Civitai 逆向解析弹窗
    │   ├── ModelHubModal.tsx      # 全生态模型与 LoRA 枢纽中心
    │   ├── CivitaiModal.tsx       # Civitai 模型浏览与导入弹窗
    │   ├── SchemaChoiceControls.tsx # 动态 Schema 参数渲染与 NSFW 安全开关控制器
    │   ├── VideoJobStatus.tsx     # 视频任务阶段性进度反馈条
    │   └── ProviderModelSelect.tsx # 动态模型选择器
    ├── constants/                 # 常量定义与预设库
    │   ├── nodes.ts               # 节点定义字典与端口规格声明
    │   ├── presets.ts             # 34 项现代工作流预设库
    │   └── presetRecipePrompts.ts # 预设配方真实提示词字典
    ├── engines/                   # 模块化引擎驱动 (Drivers)
    │   └── drivers/               # 各引擎具体实现 (Fal, Sogni, Venice, SenseNova 等)
    ├── hooks/                     # 自定义 React Hooks
    │   └── useLiveVideoModelMatch.ts # 实时视频模型匹配与 Schema 获取
    ├── schemas/                   # 供应商参数模式声明与契约
    ├── server/                    # 服务端模块化路由、适配器与目录查询
    ├── services/                  # 前端统一 API 调用封装
    ├── types/                     # TypeScript 类型定义
    └── utils/                     # 拓扑解析、参数归一化与 NSFW 政策工具
```

---

## 五、Cloudflare Worker 与托管部署声明 (Hosting Integration)

本项目在 `hosting/` 目录中维护了云端 Worker 部署适配层：
- **无状态服务适配**: 通过 `hosting/build.mjs` 将 Express 接口与静态前端整合打包。
- **持久化存储抽象**: 云端项目索引与生成历史通过 Cloudflare D1 存储，媒体产物由 Cloudflare R2 存储；本地开发环境下通过 Express 本地存储 (`data/`) 维持一致交互。
- **环境安全准则**: 服务端密钥统一通过环境变量或加密设置存储注入，本公开仓库严格禁止包含任何私有端点、个人凭据、钱包地址或内部代理配置。

---

## 六、许可证

MIT License
