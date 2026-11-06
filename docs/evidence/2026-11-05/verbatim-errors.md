# M17: 上游报错原样透传验收与改造报告（VERBATIM17）

> 用户最高指示：「不要美化报错，原样放回」。  
> 项目最高规则：「请求失败必须原样、完整报出，包含真实的 HTTP 状态码、响应体、报错堆栈」「严禁回退，兜底，这会让用户感到欺骗，如果 api 错误，用户需要知道那里错误，而不是用回退兜底掩盖错误」「严禁反透明的黑盒行为与虚假自愈」「最后：单元测试通过绝不等于实际问题解决」。  
> 余额策略原话：「余额不足不做卡点，先集成 api，错误能原样透传算暂时通过」。

---

## 一、改造前基线复现（Task 1）

在 main 基线分支（`cc3646c`）上，我们启动真实开发服务器（端口 3119）与无头 Chrome 浏览器（视口 `1600×1000`，CDP 端口 9419，数据目录 `/tmp/canvas-chrome-verbatim17`），通过真实用户界面操作（加载对应预设工作流 → 填写提示词 → 点击运行）触发了 5 种不同的真实上游失败（全部使用仓库 `.env` 既有配置，不产生费用）。

### 1. 基线实机截图索引
- [`baseline-01-mage-402.png`](./verbatim-errors/baseline/baseline-01-mage-402.png)：Mage 402 payment_required
- [`baseline-02-civitai-400.png`](./verbatim-errors/baseline/baseline-02-civitai-400.png)：Civitai 400 insufficientBuzz
- [`baseline-03-fal-403-topup.png`](./verbatim-errors/baseline/baseline-03-fal-403-topup.png)：Fal 403 User is locked. Reason: TOP_UP.
- [`baseline-04-together-401.png`](./verbatim-errors/baseline/baseline-04-together-401.png)：Together 401 Invalid API key
- [`baseline-05-modelscope-400.png`](./verbatim-errors/baseline/baseline-05-modelscope-400.png)：ModelScope 400 Invalid model id

### 2. 通过 ReadMediaFile 逐图逐行视觉审查结果（基线）
1. **`baseline-01-mage-402.png`**：
   - 顶栏状态：`HTTP 402 Payment Required · The Mage API and MCP server need a successful payment on this account first: buy any Gem pack or start a plan at https://www.mage.space/gems, then retry. Signup bonus Gems work in the Mage app only.` —— 顶栏丢弃了上游 JSON 外壳 `{"error":{"code":"payment_required",...}}` 中的 `code` 等字段，仅拼回被剥离的句子。
   - 浮动 Toast：标题为应用硬编码文案 `工作流生成失败`，未展示真实 HTTP 状态码与服务商；内容第一行被截断展示。
   - 节点红条（采样器）：标题硬编码拼装 `【mage】Mage 图像接口上游 HTTP 402: ...`，与正文产生双重包装。
2. **`baseline-02-civitai-400.png`**：
   - 顶栏状态：`HTTP 400 Bad Request Civitai Orchestration 官方算力返回错误` —— **上游返回的完整 JSON 响应体被 `shortUpstreamSummary()` 彻底丢弃**！核心原因 `insufficientBuzz` 以及 `title`, `traceId` 在顶栏中完全不可见！
   - 浮动 Toast：标题为通用硬编码文案 `工作流生成失败`。
   - 节点红条（采样器）：标题硬编码拼装 `【civitai】HTTP 400: Civitai Orchestration 官方算力返回错误 [400]: ...`，产生 `HTTP 400` 和 `[400]` 重复。
3. **`baseline-03-fal-403-topup.png`**：
   - 顶栏状态：`HTTP 403 Forbidden Fal.ai 接口执行失败` —— **上游返回的核心原因 `{"detail":"User is locked. Reason: TOP_UP."}` 在顶栏中被彻底丢弃**！用户根本不知道是因为需要 TOP_UP 还是权限问题！
   - 浮动 Toast：标题硬编码为 `工作流生成失败`。
   - 节点红条（采样器）：标题显示本地包装文本 `Fal.ai 接口执行失败 [403]: ...`。
4. **`baseline-04-together-401.png`**：
   - 顶栏状态：`HTTP 401 Unauthorized · Invalid API key provided. You can find your API key at https://api.together.ai/settings/api-keys.` —— 丢弃了上游原始 JSON 中的 `id` 以及 `code: "invalid_api_key"`。
   - 浮动 Toast：标题硬编码为 `工作流生成失败`。
   - 节点红条（采样器）：渲染了「去配置密钥」按钮。
5. **`baseline-05-modelscope-400.png`**：
   - 顶栏状态：`HTTP 400 · Invalid model id: nonexistent-model-xyz-12345` —— 丢弃了上游返回的 `request_id` 与 JSON 结构。
   - 浮动 Toast：标题硬编码为 `工作流生成失败`。
   - 节点红条（采样器）：显示本地包装的文本。

### 3. 基线对比表（UI 显示 vs 上游原始响应）

| 失败用例 | 上游原始 JSON 响应体（jsonl 请求日志脱敏） | 基线 UI 节点红条展示 | 基线 UI 顶栏展示 | 基线 UI Toast 展示 | 存在的主要问题 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Mage 402** | `{"error":{"code":"payment_required","message":"The Mage API and MCP server need a successful payment on this account first: buy any Gem pack or start a plan at https://www.mage.space/gems, then retry. Signup bonus Gems work in the Mage app only."}}` | `【mage】Mage 图像接口上游 HTTP 402: {"error":...}` | `HTTP 402 Payment Required · The Mage API...` | 标题：`工作流生成失败`<br/>内容：本地拼接文本 | 顶栏丢弃 JSON 结构与 `code` 字段；Toast 标题为硬编码文案。 |
| **Civitai 400** | `{"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"Bad Request","status":400,"detail":"insufficientBuzz","traceId":"00-3fcab5cbc7eb9a45dec553c121621979-a7080901a1cfba97-02"}` | `【civitai】HTTP 400: Civitai Orchestration 官方算力返回错误 [400]: ...` | `HTTP 400 Bad Request Civitai Orchestration 官方算力返回错误` | 标题：`工作流生成失败`<br/>内容：本地拼接文本 | **严重**：顶栏彻底丢弃响应体，`insufficientBuzz` 丢失！标题双重状态码。 |
| **Fal 403** | `{"detail":"User is locked. Reason: TOP_UP."}` | `【fal】HTTP 403: Fal.ai 接口执行失败 [403]: ...` | `HTTP 403 Forbidden Fal.ai 接口执行失败` | 标题：`工作流生成失败`<br/>内容：本地拼接文本 | **严重**：顶栏彻底丢弃响应体，`TOP_UP` 原因丢失！Toast 标题硬编码。 |
| **Together 401** | `{"id":"95234f6a-aws_ue2","error":{"message":"Invalid API key provided. You can find your API key at https://api.together.ai/settings/api-keys.","type":"invalid_request_error","param":null,"code":"invalid_api_key"}}` | `【together】HTTP 401: {"id":...}` | `HTTP 401 Unauthorized · Invalid API key provided...` | 标题：`工作流生成失败`<br/>内容：本地拼接文本 | 顶栏丢弃 `id`、`code` 等 JSON 字段；Toast 标题硬编码。 |
| **ModelScope 400** | `{"errors":{"message":"Invalid model id: nonexistent-model-xyz-12345"},"request_id":"a12ad933-ae78-45db-8353-3a8eac418c5a"}` | `【modelscope】HTTP 400: 魔搭国内站 (modelscope.cn) API 提交失败 [400]: ...` | `HTTP 400 · Invalid model id: nonexistent-model-xyz-12345` | 标题：`工作流生成失败`<br/>内容：本地拼接文本 | 顶栏丢弃 `request_id` 与 JSON 结构；Toast 标题硬编码。 |

---

## 二、全面排查与删除应用自编中文改写（Task 2 & P1-2）

我们对 `src` 进行了全局搜索，彻底排查将错误代码或报错文本转换为应用自编中文固定文案的位置，并清除了所有向后兼容空壳与遗留常量：

1. **彻底删除 `plainFailureConclusion` 函数及所有调用点**：
   - 从 `src/utils/apiFailure.ts` 中完全移除 `plainFailureConclusion` 导出。
   - `src/App.tsx:441-448`：删除 `return plainFailureConclusion(error2?.message) || EXEC_NODE_MISSING`，本地未找到执行节点错误直接返回 `error2?.message || String(error2)`，绝不再被 `EXEC_NODE_MISSING` 替换；主路径 `const msg = error?.message || '工作流连接不完整'` 直接取原生文本。
   - `src/components/ExecutionLog.tsx:298-306`：删除调用 `plainFailureConclusion` 的死分支，直接由 `upstreamHttpFirstLine` 或 `userFacingApiFailure` 格式化真实上游报错。
2. **彻底删除遗留常量**：
   - 删除 `MODELSCOPE_MODEL_MISSING_CN`（「魔搭国内站找不到这个模型或 LoRA」）。
   - 删除 `MODELSCOPE_MODEL_MISSING_AI`（「魔搭国际站找不到这个模型或 LoRA」）。
   - 删除 `EXEC_NODE_MISSING`（「请重新选择要运行的节点」）。
   - 删除仅有定义而零引用的 `HTTP_STATUS_TEXTS` 常量。
   - 删除 `src/App.tsx` 中无用的 `unicodeSafeSlice` 导入。
3. **彻底删除截断与剥离函数**：
   - `shortUpstreamSummary()`：彻底删除 HTTP 头部截断、trailing JSON 剥离和 `unicodeSafeSlice` 截断，整行原样返回。
   - `plainErrorMessage()`：删除截断与简写逻辑，原样返回完整报错文本。
   - `errorBannerText()`：删除截断与简写逻辑，原样返回完整报错文本。
4. **本地拦截（Local Block）保留决策**：
   - 规则要求：「保留描述 LOCAL 拦截（未离开本机，前缀『没有发出去』）的消息，因为它们诚实说明是本机拦截，且必须与上游错误保持清晰区分」。
   - **决策**：保留 `isLocalNotOutbound`、`localNotOutboundText` 与 `LOCAL_BLOCK_TOAST_TITLE`（前缀「没有发出去」）。未发出的本地校验错误明确标记为「没有发出去：...」，不伪装成上游 HTTP 错误。

---

## 三、主显示位置（节点红条、顶栏、Toast）彻底原样透传改造（Task 3 & P1-1）

针对第 1 轮审查指出的「Toast 仍做摘要、追加自编标签、标题无服务商」等问题，进行了彻底重构：

1. **彻底删除中间摘要与应用自编标签**：
   - `upstreamFailureToast()` 完全删除了 `extractUpstreamMessage`、删除了 120 字符截断、删除了应用自编的 `完整上游响应原文：`、删除了 `（上游响应体见展开）` 与 `（上游响应体为空）` 替代文案。
   - 返回对象的 `message` 就是 100% 纯粹的上游原始响应体字符串。
   - **关于 `schemaFailure.ts:83` 的重要澄清与勘误**：第 1 轮报告中曾有「全库已无自编标签」的绝对化表述，经主控代码排查更正为：**M17 职责范围内的生成（Generation）、轮询（Poll）及主报错链路（`src/utils/apiFailure.ts`、`App.tsx`、`NodeErrorDisclosure.tsx` 等）已 100% 彻底消除了自编标签与改写**。而 `src/utils/schemaFailure.ts:83`（`if (raw) parts.push('完整上游响应原文：\n' + raw)`）属于非 M17 scope 的模型下拉选用时参数表预读（Catalog/Schema Prefetch）遗留逻辑，未包含在 M17 的 scope 内。特此澄清。
2. **顶栏状态栏（`App.tsx` 中的 `executionStatusText` 与 `studio-run-status`）**：
   - 格式化为标准规范：`【服务商】HTTP 状态码 状态描述: 完整上游原始响应体`。
   - 绝不抽取单个 message 字段，绝不丢弃任何 JSON 结构（如 `code`, `id`, `detail`, `traceId` 均完整呈现）。
3. **浮动通知 Toast（`App.tsx` 中的 `toast-container`）**：
   - 标题：标准化为 `【服务商】HTTP 状态码 状态描述`（如 `【mage】HTTP 402 Payment Required`、`【civitai】HTTP 400 Bad Request`、`【together】HTTP 401 Unauthorized`）。
   - 正文：直接在等宽可滚动区域展示未改写的纯粹上游响应体（`<pre data-testid="toast-first-line" className="... max-h-48 overflow-y-auto whitespace-pre-wrap font-mono text-xs break-all bg-black/40 p-2 rounded-lg border border-rose-900/40 select-text">`），彻底废除 `<details>展开全文</details>` 折叠。
   - 本地包装分离：`localWrapper` 独立放入结构化字段，并在独立的 `<div data-testid="toast-local-wrapper">` 中展示，绝不污染上游 raw body。
   - 操作按钮：**严格限制仅在 HTTP 状态码为真实的 401 时才允许展示「去 API 设置」按钮**，400/402/403 等状态下一律不出现。
4. **节点错误红条（`NodeErrorDisclosure.tsx` 与 `NodeItem.tsx`）**：
   - 标题栏：展示真实的 `【服务商】HTTP 状态码 状态描述`，消除任何自编总结或状态码重复。
   - 详情面板：`node-error-headline` 采用等宽可滚动代码块完整呈现响应体，无任何字符截断。
   - 「去配置密钥」按钮：**严格限定仅在 `statusCode === 401` 时展示**。

---

## 四、服务端切片截断全面审查（Task 4）

我们全面审查了 `server.ts` 与 `src/server/**` 中所有的 `.slice(0, N)` / `.substring(0, N)` 调用：
1. `server.ts:105-106, 694-695`: 密钥掩码脱敏函数（`maskSecret`），保留。
2. `server.ts:2219, 2270`: NanoGPT 模型目录查询（`/api/models` catalog probe），非生成/轮询路由。
3. `server.ts:2562`: 视频模型目录聚合探测（catalog probe），非生成/轮询路由。
4. `server.ts:3026, 3029`: Fal.ai 密钥余额探测接口（balance probe），非生成/轮询路由。
5. `server.ts:5814-6022`: 各服务商密钥测试接口（`/api/cloud-keys/test` key probe），非生成/轮询路由。
6. `server.ts:6273-6397`: 各服务商余额轮询查询接口（`/api/cloud-keys/balances` balance probe），非生成/轮询路由。
7. `src/server/schemaProviders.ts:1192`: 模型目录/OpenAPI 抓取失败记录（catalog probe）。
8. **生成与轮询路由结论**：`server.ts` 及各路由文件（`mageRoutes.ts`、`civitaiWorkflowRoute.ts`、`schemaProviders.ts` 等）在生成（Generation）与轮询（Poll）主链路上，均已通过 `rawResponse`、`upstreamResponseBody` 与 `trace.traces.responseBody` 完整透传响应体，不存在截断切割用户生成报错的行为。第 1 轮审查者已核准「no server.ts edit needed」。

---

## 五、回归测试迁移与突变敏感性验证（Task 5 & P1-3）

### 1. 规避 M15 合并冲突：独立回归测试置于 `src/components/verbatimErrors.test.tsx`
为彻底避免与 M15 分支新增的 `src/components/NodeItem.test.tsx` 产生 add/add 冲突，我们已将 M17 的专属回归测试置于 `src/components/verbatimErrors.test.tsx` 中。在 rebase 到最新 main（已包含 M15 成果）后，工作区完整保留并正常运行 M15 的 `src/components/NodeItem.test.tsx`，同时 `verbatimErrors.test.tsx` 独立验证透传逻辑与 DOM 行为。

### 2. 测试用例全量覆盖 after 阶段真实响应体与追溯基线
测试夹具全部严格对齐 Task 6 最新真实录制的响应体：
- `Mage 402`: `{"error":{"code":"payment_required","message":"The Mage API and MCP server need a successful payment on this account first: buy any Gem pack or start a plan at https://www.mage.space/gems, then retry. Signup bonus Gems work in the Mage app only."}}`
- `Civitai 400`: `{"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"Bad Request","status":400,"detail":"insufficientBuzz","traceId":"00-089db51091f4345a3219237a503afea7-a5602b6b0e42f089-02"}`
- `Fal 403`: `{"detail":"User is locked. Reason: TOP_UP."}`
- `Together 401`: `{"id":"f0872edf-aws_ue2","error":{"message":"Invalid API key provided. You can find your API key at https://api.together.ai/settings/api-keys.","type":"invalid_request_error","param":null,"code":"invalid_api_key"}}`
- `ModelScope 400`: `{"errors":{"message":"Invalid model id: nonexistent-model-xyz-12345"},"request_id":"167c3ea8-1280-4dd6-8f17-4d514d16b419"}`（最新实机录制）及 `{"request_id":"13ff7f2a-bf94-4290-abb6-0248a7c80caf"}`
- `ModelScope 500`: `{"errors":{"message":"apiInferModelDownload call failed: callApiInferModelDownload failed: [Model Exception] 模型不存在"},"request_id":"4c0b7caa-7f63-497c-972e-2f4e0e65a677"}`
- 追溯基线夹具：`BASELINE_CIVITAI_400_BODY`（`3fcab5cbc...`）、`BASELINE_TOGETHER_401_BODY`（`95234f6a...`）、`BASELINE_MODELSCOPE_400_BODY`（`a12ad933...`）作为追溯基线常量同步验证。

### 3. 五个突变（Mutations a-e）实测验证报告

按审查者指令对 5 个突变逐一验证，所有 5 个突变全部变红（Exit Code 1）：

| 突变项 | 突变修改内容 | 实测结果 | 触发失败的测试用例 |
| :--- | :--- | :--- | :--- |
| **Mutation (a)** | `shortUpstreamSummary` 改回 120 字符截断 (`unicodeSafeSlice(first, 120)`) | **RED (Exit 1)** | 1. `fix4-2026-10-16.test.tsx` > `shortUpstreamSummary keeps trailing JSON verbatim`<br/>2. `fix5-2026-10-16.test.tsx` > `KSampler/红条 shortUpstreamSummary 保留 MuAPI 402 完整原文` |
| **Mutation (b)** | `errorBannerText` 改回只取 message/error (`extractUpstreamMessage(detail) \|\| detail`) | **RED (Exit 1)** | 1. `apiFailure.test.ts` > `透传 AIMLAPI HTTP 403 run-out-of-funds message`<br/>2. `fix5-2026-10-16.test.tsx` > `errorBannerText(long) 保留 topup_url` |
| **Mutation (c)** | 在 `plainErrorMessage` 里恢复魔搭「模型不存在」中文改写 (`if (/模型不存在/.test(raw)) return '魔搭国内站找不到这个模型或 LoRA'`) | **RED (Exit 1)** | `verbatimErrors.test.tsx` > `2. Mutation (c) test: plainErrorMessage never rewrites 模型不存在 > fails if plainErrorMessage rewrites ModelScope 500 模型不存在 to Chinese` |
| **Mutation (d)** | 将 `NodeErrorDisclosure` 的按钮条件放宽 (`isMissingKey = statusCode === 401 \|\| lower.includes('未配置') \|\| lower.includes('invalid_api_key')`) | **RED (Exit 1)** | `verbatimErrors.test.tsx` > `3. Mutation (d) test: 去配置密钥 button ONLY appears on statusCode === 401 > does NOT render 去配置密钥 when statusCode !== 401 even if body contains invalid_api_key or 未配置` |
| **Mutation (e)** | 把 Toast 里的上游响应体恢复成 `<details>展开全文</details>` 折叠 | **RED (Exit 1)** | `verbatimErrors.test.tsx` > `4. Real DOM mounting & Mutation (e) test: App Toast renders verbatim body without <details>`（真实 DOM 断言 `expect(toastPre.closest('details')).toBeNull()` 变红） |

---

## 六、既有测试对账清单（Reconciliation of Existing Tests）

按照主控限制指令（「新断言必须比旧断言更强：要断言包含上游响应体原文，在完成报告中逐条列出文件、行号、旧断言、新断言与修改理由」），以下为本次修改的所有既有测试对账：

| 文件 | 行号 | 旧断言 | 新断言 | 为什么旧断言是错误的 |
| :--- | :--- | :--- | :--- | :--- |
| `src/components/ExecutionLog.summary.test.ts` | 145-148 | `expect(humanSummaryText(r)).toBe(MODELSCOPE_MODEL_MISSING_CN);`<br/>`expect(...).not.toMatch(/\[500\]\|request_id\|\\{/);` | `expect(summary).toContain('apiInferModelDownload call failed');`<br/>`expect(summary).toContain('request_id');`<br/>`expect(summary).not.toContain('魔搭国内站找不到这个模型或 LoRA');` | 旧断言显式要求用自编中文覆盖上游错误并隐藏 JSON 和 `request_id`，严重违背「不要美化报错，原样放回」原则。新断言要求上游 JSON、报错原因与 `request_id` 必须原样完整出现。 |
| `src/components/ExecutionLog.summary.test.ts` | 276 | `expect(humanSummaryText(r)).not.toContain('{"message"');` | `expect(humanSummaryText(r)).toContain('{"message"');` | 旧断言要求剥离上游原始 JSON，只留剥离后的单一字符串。新断言要求保留完整上游 JSON 响应体。 |
| `src/components/ExecutionLog.summary.test.ts` | 335 | `expect(humanSummaryText(r)).toBe(upstreamMsg);` | `expect(humanSummaryText(r)).toContain(upstreamMsg);`<br/>`expect(humanSummaryText(r)).toContain('"title":"Forbidden"');`<br/>`expect(humanSummaryText(r)).toContain('403');` | 旧断言要求剥离外层 JSON 结构（如 `"title":"Forbidden"` 和状态码）。新断言要求保留完整上游原始响应体。 |
| `src/utils/apiFailure.test.ts` | 18-22 | 包含 `expect(plainFailureConclusion(jargon)).toBe(...)` 空壳断言 | 删除空壳函数断言，断言 `userFacingApiFailure` 产生 `没有发出去：` 原文 | 旧断言测试了应用自编改写。新断言保证本地错误原样透传。 |
| `src/utils/apiFailure.test.ts` | 37-47 | `expect(plainFailureConclusion(jargon)).toBe(MODELSCOPE_MODEL_MISSING_CN);`<br/>`expect(...).not.toMatch(/\[500\]\|request_id\|apiInferModelDownload\|\\{/);` | `expect(text).toContain('apiInferModelDownload call failed');`<br/>`expect(text).toContain('request_id');`<br/>`expect(text).not.toContain('魔搭国内站找不到这个模型或 LoRA');` | 旧断言要求抹除 JSON、500 状态码与 `request_id`。新断言要求完整透传上游 JSON 与跟踪 ID。 |
| `src/utils/apiFailure.test.ts` | 63 | `expect(userFacingApiFailure(...)).not.toContain('{"message"');` | `expect(userFacingApiFailure(...)).toContain('{"message"');` | 旧断言要求丢弃原始 JSON 结构。新断言要求保留完整 JSON。 |
| `src/utils/apiFailure.test.ts` | 71-74 | 包含 `expect(plainFailureConclusion(...)).toBe(EXEC_NODE_MISSING);` | `expect(plainErrorMessage(new Error('未找到指定的执行节点: node-1'))).toContain('未找到指定的执行节点: node-1');` | 旧断言要求把本地未找到节点错误替换为 `EXEC_NODE_MISSING`。新断言确保本地错误文本原样展示。 |
| `src/utils/apiFailure.test.ts` | 92, 98, 102 | `expect(...).not.toContain('"title":"Forbidden"');` | `expect(...).toContain('"title":"Forbidden"');` | 旧断言要求丢弃 AIMLAPI 原始 JSON 响应头结构。新断言要求必须完整透传原始 JSON。 |
| `src/utils/apiFailure.localNotOutbound.test.ts` | 38, 41 | `expect(line).not.toContain('"requestId"');` | `expect(line).toContain('"requestId"');` | 旧断言要求剥离并隐藏上游请求 ID。新断言要求完整保留。 |
| `src/utils/apiFailure.localNotOutbound.test.ts` | 49 | `expect(line).not.toContain('{"message"');` | `expect(line).toContain('{"message"');` | 旧断言要求剥离原始 JSON 结构。新断言要求保留完整响应体。 |
| `src/utils/fix4-2026-10-16.test.tsx` | 55-65 | `expect(s).not.toContain('"workflowId"');`<br/>`expect(errorBannerText(longJson)).not.toContain('workflowId');` | `expect(s).toContain('"workflowId"');`<br/>`expect(errorBannerText(longJson)).toContain('workflowId');` | 旧测试名即为「shortUpstreamSummary drops trailing JSON」，要求故意丢弃尾部 JSON。新断言要求保留完整的尾部 JSON 与业务 ID。 |
| `src/utils/fix5-2026-10-16.test.tsx` | 62-64 | `expect(s).not.toContain('topup_url');`<br/>`expect(errorBannerText(long)).not.toContain('topup_url');` | `expect(s).toContain('topup_url');`<br/>`expect(errorBannerText(long)).toContain('topup_url');` | 旧测试名即为「丢掉 MuAPI 402 JSON 尾」。新断言要求保留 MuAPI 响应体中的 `topup_url` 与 `detail` 原文。 |
| `src/utils/clean1029.test.tsx` | 18-25 | `expect(t.message).toContain('完整上游响应原文');`<br/>`expect(t.message.split('\n')[0]).not.toBe(body);` | `expect(t.message).toBe(body);`<br/>`expect(t.message).not.toContain('完整上游响应原文');` | 旧测试断言要求第一行不是响应体并强制出现自编标签。新测试断言正文就是上游响应体且不包含自编标签。 |
| `src/utils/clean1029.test.tsx` | 26-33 | `expect(t.message).toContain('完整上游响应原文');` | `expect(t.message).toBe(long);`<br/>`expect(t.message).not.toContain('完整上游响应原文');` | 同上，长响应体直接作为正文透传，无自编标签。 |
| `src/utils/clean1149.test.tsx` | 21-28 | `expect(t.message).toContain('完整上游响应原文');`<br/>`expect(t.message.split('\n')[0]).not.toBe(body);` | `expect(t.message).toBe(body);`<br/>`expect(t.message).not.toContain('完整上游响应原文');` | 同上，断言 toast.message 原样等于上游 body，绝无自编标签。 |
| `src/utils/clean1351.test.tsx` | 20-21 | `expect(first).not.toBe(upstream); // fix4 short first line` | `expect(first).toBe(upstream);` | 旧测试断言要求第一行是缩略摘要而不是完整上游响应体。新测试断言第一行就是完整的上游响应体原文。 |
| `src/utils/clean1351.test.tsx` | 24-25 | `expect(t.message.split('\n').slice(1).join('\n')).toContain('schemaProviders.ts:659');` | `expect(t.localWrapper).toContain('schemaProviders.ts:659');` | 本地包装文案与调用堆栈必须与上游 raw body 物理分离，独立存在于 `localWrapper` 字段中，不得污染 Toast 主消息。 |
| `src/components/venicePostfix.test.ts` | 36-41 | `expect(upstreamHttpFirstLine(data)).not.toContain('{"error"');` | `expect(upstreamHttpFirstLine(data)).toContain('{"error":"Insufficient USD"}');` | 旧断言在无 provider 时强制要求剥离上游原始 JSON，丢弃 body 尾部。新断言要求无 provider 时同样完整保留上游 JSON 响应体。 |

---

## 七、第 2 轮真实浏览器实机验收（Task 6 重做）

在修复全部 P1 问题后，我们在新无头 Chrome（调试端口 9419，数据目录 `/tmp/canvas-chrome-verbatim17b`）与开发服务器（端口 3119）中重新完整运行了全部用例。

### 1. 实机截图索引
- [`after-01-mage-402.png`](./verbatim-errors/after/after-01-mage-402.png)：Mage 402 原样透传
- [`after-02-civitai-400.png`](./verbatim-errors/after/after-02-civitai-400.png)：Civitai 400 原样透传
- [`after-03-fal-403-topup.png`](./verbatim-errors/after/after-03-fal-403-topup.png)：Fal 403 原样透传
- [`after-04-together-401.png`](./verbatim-errors/after/after-04-together-401.png)：Together 401 原样透传
- [`after-05-modelscope-400.png`](./verbatim-errors/after/after-05-modelscope-400.png)：ModelScope 400 原样透传

### 2. 通过 ReadMediaFile 逐图逐行视觉审查结果（第 2 轮验收）
1. **`after-01-mage-402.png`**：
   - 顶栏状态：`【mage】HTTP 402 Payment Required: {"error":{"code":"payment_required","message":"The Mage API and MCP server need a successful payment on this account first: buy any Gem pack or start a plan at https://www.mage.space/gems, then retry. Signup bonus Gems work in the Mage app only."}}` —— **包含服务商前缀 `【mage】`，HTTP 状态与描述完整，完整未截断的 JSON 响应体**！
   - 浮动 Toast：标题为 `【mage】HTTP 402 Payment Required`（带服务商）；正文直接就是纯粹的上游 JSON 原文，完全没有「完整上游响应原文：」等自编标签！
   - 节点红条（采样器）：标题展示 `【mage】HTTP 402 Payment Required: {"error":...}`；等宽代码块展示完整 JSON 原文，非 401 不展示密钥配置按钮。
2. **`after-02-civitai-400.png`**：
   - 顶栏状态：`【civitai】HTTP 400 Bad Request: {"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"Bad Request","status":400,"detail":"insufficientBuzz","traceId":"00-089db51091f4345a3219237a503afea7-a5602b6b0e42f089-02"}` —— 带服务商前缀 `【civitai】`，RFC9110 JSON 完整可见，`insufficientBuzz` 毫无遗漏！
   - 浮动 Toast：标题为 `【civitai】HTTP 400 Bad Request`（带服务商）；正文直接就是原始 JSON，无自编标签。
   - 节点红条（采样器）：标题与正文完全一致原样呈现。
3. **`after-03-fal-403-topup.png`**：
   - 顶栏状态：`【fal】HTTP 403 Forbidden: {"detail":"User is locked. Reason: TOP_UP."}` —— 带服务商前缀 `【fal】`，`User is locked. Reason: TOP_UP.` 一览无余！
   - 浮动 Toast：标题为 `【fal】HTTP 403 Forbidden`（带服务商）；正文直接为原始 JSON。
   - 节点红条（采样器）：完整原样呈现 Fal 响应。
4. **`after-04-together-401.png`**：
   - 顶栏状态：`【together】HTTP 401 Unauthorized: {"id":"f0872edf-aws_ue2","error":{"message":"Invalid API key provided. You can find your API key at https://api.together.ai/settings/api-keys.","type":"invalid_request_error","param":null,"code":"invalid_api_key"}}` —— 带服务商前缀 `【together】`，保留 `id`, `code`, `message`, `param` 全字段！
   - 浮动 Toast：标题为 `【together】HTTP 401 Unauthorized`；右上角提供便捷的 `去 API 设置` 按钮；正文直接就是原始 JSON。
   - 节点红条（采样器）：展示 `去配置密钥` 快捷入口（仅在 401 下展示）；下方完整呈现原始 JSON。
5. **`after-05-modelscope-400.png`**：
   - 顶栏状态：`【modelscope】HTTP 400 Bad Request: {"errors":{"message":"Invalid model id: nonexistent-model-xyz-12345"},"request_id":"167c3ea8-1280-4dd6-8f17-4d514d16b419"}` —— 带服务商前缀 `【modelscope】`，完整展示真实 HTTP 状态文本 `Bad Request`，以及包含 `errors.message` 与 `request_id` 的完整 JSON 响应体！
   - 浮动 Toast：标题为 `【modelscope】HTTP 400 Bad Request`（完整包含 `Bad Request` 状态描述）；正文直接就是纯粹的原始 JSON。
   - 节点红条（采样器）：完整呈现原始响应体与 `HTTP 400 Bad Request`，彻底根除自编中文改写与状态描述丢失。

### 3. 最终验收对比表（7 项标准标签分类）

| 失败用例 | 验收标签 | 上游返回响应体原文（jsonl 记录） | 改造后 UI 实际展示（节点 / 顶栏 / Toast） | 一致性与透明度核验 |
| :--- | :--- | :--- | :--- | :--- |
| **Mage 402** | `PASS_BILLING` | `{"error":{"code":"payment_required","message":"The Mage API and MCP server need a successful payment on this account first: buy any Gem pack or start a plan at https://www.mage.space/gems, then retry. Signup bonus Gems work in the Mage app only."}}` | 节点红条、顶栏、Toast 均显示带有 `【mage】` 的真实状态（`HTTP 402 Payment Required`）与包含 `code: payment_required` 的纯粹原始 JSON 响应体。 | 响应体与上游原文一致，保留完整 JSON，无自编标签，无提取句子，无省略号截断。 |
| **Civitai 400** | `PASS_BILLING` | `{"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"Bad Request","status":400,"detail":"insufficientBuzz","traceId":"00-089db51091f4345a3219237a503afea7-a5602b6b0e42f089-02"}` | 节点红条、顶栏、Toast 均显示带有 `【civitai】` 的真实状态（`HTTP 400 Bad Request`）与包含 `insufficientBuzz`、`traceId` 的纯粹原始 JSON 响应体。 | 响应体与上游原文一致，保留完整 RFC9110 结构与 traceId，无自编标签，核心原因完全透明。 |
| **Fal 403** | `PASS_BILLING` | `{"detail":"User is locked. Reason: TOP_UP."}` | 节点红条、顶栏、Toast 均显示带有 `【fal】` 的真实状态（`HTTP 403 Forbidden`）与包含 `User is locked. Reason: TOP_UP.` 的纯粹原始响应体。 | 响应体与上游原文一致，无自编标签，TOP_UP 原因彻底透明呈现。 |
| **Together 401** | `BLOCKED_AUTH` | `{"id":"f0872edf-aws_ue2","error":{"message":"Invalid API key provided. You can find your API key at https://api.together.ai/settings/api-keys.","type":"invalid_request_error","param":null,"code":"invalid_api_key"}}` | 节点红条、顶栏、Toast 均显示带有 `【together】` 的真实状态（`HTTP 401 Unauthorized`）与包含 `id`、`code`、`message` 的纯粹原始 JSON 原文，仅在 401 下提供配置快捷按钮。 | 响应体与上游原文一致，401 快捷配置按钮正常可用且不替代或掩盖错误文本。 |
| **ModelScope 400** | `CONTRACT_REJECT` | `{"errors":{"message":"Invalid model id: nonexistent-model-xyz-12345"},"request_id":"167c3ea8-1280-4dd6-8f17-4d514d16b419"}` | 节点红条、顶栏、Toast 均显示带有 `【modelscope】` 的真实状态与状态描述（`HTTP 400 Bad Request`）以及包含完整 `request_id` 的纯粹原始 JSON 响应体。 | 响应体与上游原文一致，真实状态描述 `Bad Request` 正常呈现，彻底清除了自编中文改写。 |

---

## 八、全量工程验证命令真实未接管退出码

所有命令均在 worktree 中未接管道执行，真实退出码如下：

1. **`npx tsc --noEmit`**
   - 实际运行结果：Command executed successfully.
   - **退出码：0**
2. **`npm run build`**
   - 实际运行结果：`✓ built in 4.61s`，`Canvas Sites Worker built: original provider routes + durable storage`。
   - **退出码：0**
3. **`npx vitest run --maxWorkers=2 --exclude '.tower/**' --exclude '**/node_modules/**' --exclude '**/dist/**'`**
   - 实际运行结果：
     - **Test Files: 256 passed (256)**
     - **Tests: 1990 passed (1990)**
   - **退出码：0**
