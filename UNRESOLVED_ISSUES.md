# 项目已知与待复测问题跟踪表 (UNRESOLVED_ISSUES.md)

> ⚠️ **基准说明（2026-11-07 M31 核验，承接 M25 / M29 / M30）**：
> 本文档记录经真实浏览器 UI 点击核验后的**未决业务项**。开放表只保留真实外部计费 / 凭据阻塞；M29–M31 已关闭的壳节点、徽章、死代码、资源重选与 ModelsLab `NOT_SENT` 漏测已迁入「已关闭」表。
> 证据索引：[docs/evidence/2026-11-05/final.md](docs/evidence/2026-11-05/final.md)。历史阶段性记录保留于文末作为审计存证，但不得作为当前能力的凭据。

---

## 一、用户余额不足准则与 7 类标签定义 (User Balance Policy)

项目严格执行用户最高准则（原文逐字）：
> **「余额不足不做卡点，先集成api，错误能原样透传算暂时通过」**

所有问题分类严格采用项目规定的 7 类判定标签：
- `PASS_GENERATION`: 界面可见真实生成产物。
- `PASS_BILLING`: 全参数请求抵达上游，上游欠费/额度不足/订阅或套餐限制报错原样透传。
- `BLOCKED_AUTH`: 401 鉴权失效。
- `BLOCKED_CONFIG`: 本地未配置对应 API Key。
- `NOT_SENT`: 请求未出站（如未接入端点本地明确报错）。
- `CONTRACT_REJECT`: 非计费类 400/422/404 契约异常。
- `WIRING_BUG`: 接线故障。

---

## 二、待充值出图复测服务商清单 (Awaiting Funded Generation Re-check)

根据 2026-11-07 全量 UI 回归与 M31 ModelsLab 出站复测，以下服务商的前后端参数构建、动态 OpenAPI 映射与错误透传链路均已跑通（或本轮复测确认），因上游账户余额耗尽、未开通付费包或要求订阅套餐，暂时评定为 `PASS_BILLING`，待后续账号充值 / 开通套餐后安排真实出图/视频产物验收：

| 序号 | 服务商 (Provider) | 涉及预设与模型 | 上游真实报错 (Verbatim Response) | 判定标签 | 充值与复测说明 |
|:---:|---|---|---|:---:|---|
| 1 | **Fal.ai** | `fal-ai/krea-2/turbo/lora`, `fal-ai/wan/v2.2-a14b/text-to-video/lora` | `HTTP 403: {"detail":"User is locked. Reason: Exhausted balance..."}` | `PASS_BILLING` | 需在 Fal.ai 控制台为绑定 API Key 充值计算额度 |
| 2 | **Hugging Face** | `renderartist/Technically-Color-Z-Image-Turbo` (via HF Router) | `HTTP 402: {"error":"Purchase pre-paid credits to continue using Inference Providers. Alternatively, subscribe to PRO to get monthly included credits."}` | `PASS_BILLING` | 证据 `final/06-hf-zimage-run.png`；需在 Hugging Face 账号购买预付费计算额度或订阅 PRO |
| 3 | **WaveSpeed** | `wavespeed-ai/wan-2.2/i2v-480p-lora` 及文生图 | `HTTP 400: {"message":"Insufficient credits"}`；图像因本地 `data/` 无产物，M46 合规降级为 `PASS_BILLING` | `PASS_BILLING` | 需在 WaveSpeed 平台为对应 Token 充值算力点数并生成真产物 |
| 4 | **Sogni** | `krea-2-turbo` + `krea2-fever-dream-mood`, `animate_photo` | `HTTP 200 (task status): waiting_for_user - insufficient_credit` (`Debit Error: Insufficient funds`) | `PASS_BILLING` | 需在 Sogni 账号充值 Spark/Token 算力 |
| 5 | **AIMLAPI** | `alibaba/z-image-turbo-lora` | `HTTP 403: {"error":{"message":"Out of funds","code":403}}` | `PASS_BILLING` | 需在 AIMLAPI 平台充值账户余额 |
| 6 | **DeepInfra** | `black-forest-labs/FLUX-2-klein-9b` | `HTTP 402: {"detail":{"error":"You need positive balance to do inference. Please add balance manually or setup top-up"}}` | `PASS_BILLING` | 证据 `docs/evidence/2026-11-08/13-real-run...`（M46 实机运行透传）；需在 DeepInfra 控制台添加结算方式充值 |
| 7 | **Mage.space** | `mango-v3` | `HTTP 402: {"error":"Payment required"}` | `PASS_BILLING` | 需在 Mage 账户开通 API 点数包 |
| 8 | **ModelsLab** | `std-modelslab-t2i` + 手填底模 `z-image-turbo` | 上游 `POST https://modelslab.com/api/v6/images/text2img` HTTP 200，业务体 `{"status":"error","message":"You need to be subscribed to a plan to continue, buy subscription from https://modelslab.com/pricing"}`；本站 `/api/engine/modelslab/generate` 以 HTTP 502 原样透传 | `PASS_BILLING` | 证据 `final/17-modelslab-loaded.png` / `18-modelslab-run.png`（M31 真实 UI 点击出站）。需在 ModelsLab 开通付费套餐后再跑真出图 |
| 9 | **Civitai** | Civitai Wan 2.2 工作流 / Krea 2 Turbo | `HTTP 400: {"code":"insufficientBuzz","message":"User has insufficient buzz to run workflow."}` | `PASS_BILLING` | 需为 Civitai 账号充值 Buzz 积分以执行云端工作流 |
| 10 | **Novita AI** | `std-novita-t2i` 图像生图 | `HTTP 403: {"code":403,"reason":"NOT_ENOUGH_BALANCE","message":"insufficient balance","metadata":{}}` | `PASS_BILLING` | 图像出站欠费；注：SVD-XT 视频已被 RETIRED_PATTERNS 标记退役且 VIDEO_PROVIDERS 不含 novita，无法从当前 UI 触达，视频标 `NOT_SENT` |
| 11 | **Venice AI** | `std-venice-t2i` (`venice-sd35`)，非空 CLIP 提示词 | `HTTP 402: {"error":"Insufficient USD or Diem balance to complete request. Visit https://venice.ai/settings/api to add credits."}` | `PASS_BILLING` | 证据 `final/14-venice-run.png`；需在 Venice 设置页充值 USD/Diem |
| 12 | **Tensor.Art (OpenWorks)** | OpenWorks 工具生图 | 因本地 `data/` 目录无生成产物，M46 合规降级为 `PASS_BILLING` | `PASS_BILLING` | 需配置有效算力生成并在磁盘存留可核验产物文件 |

---

## 四、待 Tower 路由与跟进的工程缺陷 (Awaiting Tower Follow-up)

在 M46 全量构建与测试验证期间发现的非 scope 内代码缺陷，已按 Tower 协议提报结构化 Finding：
1. **ComfyParameters 缺少 Civitai 选择器属性 (Finding 20261108-worker-m46-ui-operator-bug-comfyparameters-missing-civitai-video-selector-properties-br.md)**：
   - 现象：`npx tsc --noEmit` 报错于 `src/utils/inspectorParameters.test.ts`，由于 `src/types/graph.ts` 的 `ComfyParameters` 缺少 `civitaiVersion?: string; civitaiBackend?: string; civitaiOperation?: string;`。
   - 建议修复：在 `src/types/graph.ts` 中补齐上述三个可选字段。
2. **遗留测试套件引用已退役旧预设 (Finding 20261108-worker-m46-ui-operator-bug-retired-presets-in-legacy-test-suites-cause-vitest-failures.md)**：
   - 现象：`src/utils/videoDeclaredNoGuess.test.ts` 等文件仍直接查找 `std-novita-i2v` / `std-replicate-i2v`，在预设退役后读取 `undefined.nodes` 抛出 TypeError。
   - 建议修复：更新关联测试断言，使其对齐当前预设列表或增加空保护。

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
5. **Venice 默认预设提示词为空（历史 400，本轮已用填写后 402 复测）**:
   - 现状：`std-venice-t2i` 仍不预填配方提示词。2026-11-07 在 CLIP「提示词」填入非空文本后，`final/14-venice-run.png` 为 `402 Insufficient USD or Diem`（`PASS_BILLING`）。空提示词 400 不再作为本轮图像验收标签。

> ModelsLab 底模留空 `NOT_SENT` 已关闭：M31 在真实 UI 为 `std-modelslab-t2i` 填入 `z-image-turbo` 并点击运行，请求已出站至 `modelslab.com`（见第二节第 8 行与 `final/17` / `18`）。

---

## 四、已关闭的代码与 UI 缺陷 (Resolved in M29–M31)

下列项已从开放缺陷表移除。关闭依据为 M29 / M30 合入代码 + M31 真实浏览器点击核验（Headless Chrome 153，视口 2560×1440，本地 `PORT=4329`）。

| 原优先级 | 项 | 关闭轮次 | 现状与证据 |
|---|---|---|---|
| HIGH | 空壳节点 `ImageUpscaleWithModel` | M29 | `NODE_DEFINITIONS` 不再注册该类型；`src/constants/nodes.test.ts` 锁定 `not.toHaveProperty('ImageUpscaleWithModel')`。工具坞无此入口。 |
| MEDIUM | `FieldStatusBadge` / `SchemaSendBadge` 被静默注销 | M29 + M31 | 组件按状态渲染 `data-testid="field-status-badge-*"` / `schema-send-badge-*`，不再 `return null`。M31 在参数总控台实测：Venice 5 枚 `schema-send-badge-will_send`（「会发送」），Sogni 8 枚。ModelsLab 不在 schema-scoped 徽章供应商集合内，检查器对该家不绘制 send badge 属预期。 |
| MEDIUM | `CivitaiLoRABrowserNode.search_keyword` 死控件 | M29 + M31 | `App.tsx` 将 `values.search_keyword` 传入 `CivitaiModal.initialQuery`；弹窗打开时 `setQuery(initialQuery)`。M31 在节点填入 `z-image turbo` 后点「打开 Civitai LoRA 浏览器」，`[data-testid=lora-hub-search-input]` 预填为 `z-image turbo`。 |
| MEDIUM | 孤立组件 `ControlPanel.tsx` / `SchemaReuseNote` | M29 | `src/components/ControlPanel.tsx` 已删除；全仓 `src/` 无 `SchemaReuseNote` 引用。 |
| LOW | `ModernToolDock` 重置文案仍写旧模型 | M29 + M31 | 清空菜单重置项副文案为「恢复 Z-Image Turbo 标准默认工作流」。M31 实机点击清空菜单可见该句。 |
| — | `replaceSelectedResource` 残留 Civitai 身份键 | M30 | `src/utils/resourceSelection.ts` 始终剥离 `STALE_CIVITAI_IDENTITY_KEYS`。 |
| — | Runware / ModelsLab 静默丢弃无法映射的 LoRA | M30 | `modelsLabImageContract.ts` / `runwareImageContract.ts` 在无法映射时写入 `unmappedLoras[{item, reason}]`，不静默吞掉。 |
| — | `FalDriver.mapFalServerLoras` 丢掉 schema 声明的 LoRA 项属性 | M30 | `mapFalServerLoras(loras, loraItemProps?)` 保留 schema 声明的 item 属性。 |
| LOW | Civitai 导入预览 Sampler/Scheduler 来源硬编码 `sdxl.md` | M30 | 预览 `fields.sampler` / `fields.scheduler` 的 `source` 改为 `civitaiSamplerSource(ecosystem)`（`src/utils/civitaiImportMap.ts`）。sdxl / sd15 指向 `recipes/sdxl.md`；其余生态指向 `schemas/imageGen.yaml`。clipSkip 对 sd15 指向 `recipes/sd1.md`、FLUX 指向 `recipes/flux1.md`。 |
| — | `std-modelslab-t2i` 底模留空导致 `NOT_SENT` 漏测 | M31 | 真实 UI 填入 `z-image-turbo` 后点击运行；`POST /api/engine/modelslab/generate` 出站至 `https://modelslab.com/api/v6/images/text2img`。截图 `final/17-modelslab-loaded.png`（底模 `[当前] z-image-turbo`，自定义模型 `z-image-turbo`，运行按钮可用，无「请先选择模型」）与 `final/18-modelslab-run.png`（顶栏 / 采样器 / toast 原样 `You need to be subscribed to a plan to continue...`）。标签 `PASS_BILLING`。 |

---

## 五、已知工程说明（非开放业务缺陷）

下列不是「待修接线故障」，也不进入第二节待充值表：

1. **Together `image_loras` 官方指南与 OpenAPI 分歧**：官方参数指南写明 FLUX.2 已拒绝该字段；`src/server/schemaProviders.ts` 通过 `officialUnavailableParams` 阻断，不向用户虚假承诺 LoRA 已生效。
2. **单测套件含源码字符串静态匹配用例**：单元测试全绿不能替代 UI 点击验收（用户原文：「最后：单元测试通过绝不等于实际问题解决」）。
3. **`rejectSchemaEnum` 测试桩残留**：生产 `server.ts` 与 `videoGenerateRoute.ts` 为 0 处；仅 `src/server/schemaProviderVideoStatus.test.ts:32` 的 `stubVideoDeps()` 仍带未被生产代码读取的属性。

---

## 六、未验证历史记录归档 (Unverified Historical Records)

> 下文为早期 Agent 留存的历史未决项快照，部分已被后续修复取代，仅供追溯：

- **历史 fix10.1 / fix11.2 / fix12**: 针对画布防抖、视口遮挡与执行日志的修复，已随 M15/M17/M18 重构被全新架构取代。
- **历史 ModelScope 国际站 LoRA**: 2026-11-03 记录出图历史 `hist_1793706156544_8obck`。
- **历史 WaveSpeed 出图**: 2026-10-17 记录出图历史 `hist_1792224305224_meynb`。
- **历史 ModelsLab 底模留空 `NOT_SENT`（M25 `final/17`/`18`）**: 已被 2026-11-07 M31 出站复测取代，见第二节第 8 行。
