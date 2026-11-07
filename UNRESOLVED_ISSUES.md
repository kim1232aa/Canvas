# 项目已知与待复测问题跟踪表 (UNRESOLVED_ISSUES.md)

> ⚠️ **基准说明（2026-11-07 M25 终结审计）**：
> 本文档记录 2026-11-07 经真实 Chrome CDP 自动化 UI 回归测试（见 [docs/evidence/2026-11-05/final.md](docs/evidence/2026-11-05/final.md)）实测核验后的全部未决项、待充值复测清单、未验证功能场景与代码架构审计风险。
> 历史阶段性记录保留于文末作为审计存证，但不得作为当前能力的凭据。

---

## 一、用户余额不足准则与 7 类标签定义 (User Balance Policy)

项目严格执行用户最高准则（原文逐字）：
> **「余额不足不做卡点，先集成api，错误能原样透传算暂时通过」**

所有问题分类严格采用项目规定的 7 类判定标签：
- `PASS_GENERATION`: 界面可见真实生成产物。
- `PASS_BILLING`: 全参数请求抵达上游，上游欠费/额度不足报错原样透传。
- `BLOCKED_AUTH`: 401 鉴权失效。
- `BLOCKED_CONFIG`: 本地未配置对应 API Key。
- `NOT_SENT`: 请求未出站（如未接入端点本地明确报错）。
- `CONTRACT_REJECT`: 非计费类 400/422/404 契约异常。
- `WIRING_BUG`: 接线故障。

---

## 二、待充值出图复测服务商清单 (Awaiting Funded Generation Re-check)

根据 2026-11-07 全量 UI 回归实测，以下 9 家服务商的前后端参数构建、动态 OpenAPI 映射与错误透传链路均已完全跑通，因上游账户余额耗尽或未开通付费包，暂时评定为 `PASS_BILLING`，待后续账号充值后安排真实出图/视频产物验收：

| 序号 | 服务商 (Provider) | 涉及预设与模型 | 上游真实报错 (Verbatim Response) | 判定标签 | 充值与复测说明 |
|:---:|---|---|---|:---:|---|
| 1 | **Fal.ai** | `fal-ai/krea-2/turbo/lora`, `fal-ai/wan/v2.2-a14b/text-to-video/lora` | `HTTP 403: {"detail":"User is locked. Reason: Exhausted balance..."}` | `PASS_BILLING` | 需在 Fal.ai 控制台为绑定 API Key 充值计算额度 |
| 2 | **Hugging Face** | `renderartist/Technically-Color-Z-Image-Turbo` (via HF Router) | `HTTP 402: {"error":"Purchase pre-paid credits to continue using Inference Providers. Alternatively, subscribe to PRO to get monthly included credits."}` | `PASS_BILLING` | 需在 Hugging Face 账号购买预付费计算额度或订阅 PRO |
| 3 | **WaveSpeed** | `wavespeed-ai/wan-2.2/i2v-480p-lora` | `HTTP 400: {"message":"Insufficient credits"}` | `PASS_BILLING` | 需在 WaveSpeed 平台为对应 Token 充值算力点数 |
| 4 | **Sogni** | `krea-2-turbo` + `krea2-fever-dream-mood`, `animate_photo` | `HTTP 200 (task status): waiting_for_user - insufficient_credit` (`Debit Error: Insufficient funds`) | `PASS_BILLING` | 需在 Sogni 账号充值 Spark/Token 算力 |
| 5 | **AIMLAPI** | `alibaba/z-image-turbo-lora` | `HTTP 403: {"error":{"message":"Out of funds","code":403}}` | `PASS_BILLING` | 需在 AIMLAPI 平台充值账户余额 |
| 6 | **DeepInfra** | `black-forest-labs/FLUX-2-klein-9b` | `HTTP 402: {"error":"Payment required"}` | `PASS_BILLING` | 需在 DeepInfra 控制台添加结算方式充值 |
| 7 | **Mage.space** | `mango-v3` | `HTTP 402: {"error":"Payment required"}` | `PASS_BILLING` | 需在 Mage 账户开通 API 点数包 |
| 8 | **ModelsLab** | `modelslab-t2i` (Realtime v6) | `HTTP 400/402: {"status":"error","message":"Out of credits"}` | `PASS_BILLING` | 需在 ModelsLab 平台补充生成点数 |
| 9 | **Civitai** | Civitai Wan 2.2 工作流 / Krea 2 Turbo | `HTTP 400: {"code":"insufficientBuzz","message":"User has insufficient buzz to run workflow."}` | `PASS_BILLING` | 需为 Civitai 账号充值 Buzz 积分以执行云端工作流 |

---

## 三、未验证功能场景清单 (Unverified Functional Scenarios)

受限于上游计费与媒体产物生成前提，以下功能场景当前处于**未验证 (Unverified)** 状态，严禁在未亲眼见证产物前宣称闭环：

1. **浏览器内真实视频播放 (Playable Video in UI)**：
   - 现状：由于 Fal、WaveSpeed、Civitai 视频端点均在提交阶段因余额不足拒绝，未能获取上游最终生成的 MP4/WebM 视频 URL。
   - 影响：前端 `SaveVideo` 节点与画板中的视频播放器控件（HTML5 `<video>`、自动播放、静音循环、控制条）尚未在真机 UI 中验证真实视频流渲染表现。
2. **视频生成产物下载与持久化 (SaveVideo & Local Media Store)**：
   - 现状：尚未验证 `server.ts` 对真实上游 MP4 视频的 `requireDurableHistoryMediaUrl` 数据 URL / 本地媒体缓存下载与持久化写入。
3. **视频历史记录一键重提与复用 (Video History Reuse)**：
   - 现状：历史记录卡片重提视频任务并恢复参数至 `AIVideoNode` 的完整交互尚未经真实生成记录复测。
4. **Civitai Comfy SDXL / SD1 真实云端扣费出图**:
   - 现状：当前仅验证到 Buzz 余额不足拦截；真实扣费后云端节点执行、WebSocket 进度推送与结果图像拉取仍待验证。
5. **Venice 默认预设提示词缺失**:
   - 现状：`std-venice-t2i` 预设载入后默认提示词为空，直接运行触发上游 `400 Bad Request: prompt cannot be empty`。用户需先手动填入提示词方可触发正常出图/计费拒绝。

---

## 四、代码与架构审计遗留风险 (Code & Architecture Audit Risks)

结合 M19~M22 前期专项审计调查结果与 M25 终结代码核查，记录以下已知代码缺陷与审计风险：

### 1. [LOW] Civitai 导入预览采样器与调度器文档链接硬编码 (`Finding 20261107-final25-bug-civitai-import-preview-hardcodes-recipes-sdxl-md-source-for`)
- **文件与行号**: `src/utils/civitaiImportMap.ts:1201, 1214`
- **问题描述**: 当导入 Civitai SD1.5 或 FLUX 配方时，预览字段表中的 Sampler 与 Scheduler 来源链接硬编码为 `'https://developer.civitai.com/orchestration/recipes/sdxl.md'`，未根据实际 ecosystem 动态指向 `sd1.md` 或 `flux.md`。
- **影响**: 仅影响导入预览弹窗中的参考文档链接展示，真实出站参数映射已完全准确。

### 2. [HIGH] 存在未被图引擎接入的空壳节点 `ImageUpscaleWithModel` (SHELLUI21 Audit)
- **文件与行号**: `src/constants/nodes.ts:1093`
- **问题描述**: 节点定义了 `ImageUpscaleWithModel` 及其控件 `model_name` 和 `scale_by`，但 `src/utils/graphEngine.ts` 中完全没有该节点的执行逻辑或拓扑分发。用户若在画布添加该节点，无法产生任何放大产物。

### 3. [MEDIUM] 参数状态徽章组件被静默注销 (SHELLUI21 Audit)
- **文件与行号**: `src/components/FieldStatusBadge.tsx:33, 43`
- **问题描述**: `FieldStatusBadge` 与 `SchemaSendBadge` 当前直接返回 `null`，导致节点与参数面板中部分微观字段的「会发送/不会发送」状态标签无法显示，仅保留了 `SchemaChoiceControls` 中的显式徽章。

### 4. [MEDIUM] `CivitaiLoRABrowserNode` 包含死控件 `search_keyword` (SHELLUI21 Audit)
- **文件与行号**: `src/constants/nodes.ts:628`
- **问题描述**: 节点声明了 `search_keyword` 字段，用户输入后写入 `node.values.search_keyword`，但后续无论是 Civitai 弹窗还是图引擎均未读取该字段，属于无效控件。

### 5. [MEDIUM] 孤立未挂载组件 `ControlPanel.tsx` (SHELLUI21 Audit)
- **文件与行号**: `src/components/ControlPanel.tsx`
- **问题描述**: 该组件有 44 行实现，但在全仓 `src/` 中没有任何父级组件引入或挂载，属于早期遗留死代码。

### 6. [MEDIUM] Together AI 官方参数指南与 OpenAPI 契约分歧 (D4 Audit)
- **官方来源**: `https://docs.together.ai/docs/inference/images/parameters.md` vs `https://docs.together.ai/reference/post-images-generations.md`
- **核查结论**: 官方 OpenAPI 仍声明了 `image_loras[{path, scale}]` 结构，但官方一手参数指南（`parameters.md`）明文标注：「`image_loras: No longer available. The FLUX models that accepted LoRA adapters have been deprecated, and the current FLUX.2 models reject this parameter.`」。`src/server/schemaProviders.ts:39` 通过 `officialUnavailableParams` 正确阻断该失效字段，不向用户虚假承诺 LoRA 已在服务端生效。

### 7. [HIGH] 单测套件包含约 108 个源码字符串静态匹配用例 (SHELLTEST22 Audit)
- **审计发现**: 全仓 262 个测试文件中，有 42 个文件包含约 108 个使用 `fs.readFileSync` 检索未执行源码文本的用例（如 `expect(source).toContain(...)`）。这些用例在生产代码崩溃或返回 `null` 时依然保持全绿，属于伪绿测试。已在项目规则中明确「单元测试通过绝不等于实际问题解决」。

---

## 五、未验证历史记录归档 (Unverified Historical Records)

> 下文为早期 Agent 留存的历史未决项快照，部分已被后续修复取代，仅供追溯：

- **历史 fix10.1 / fix11.2 / fix12**: 针对画布防抖、视口遮挡与执行日志的修复，已随 M15/M17/M18 重构被全新架构取代。
- **历史 ModelScope 国际站 LoRA**: 2026-11-03 记录出图历史 `hist_1793706156544_8obck`。
- **历史 WaveSpeed 出图**: 2026-10-17 记录出图历史 `hist_1792224305224_meynb`。
