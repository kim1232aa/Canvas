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

### 2. 通过 ReadMediaFile 逐图逐行视觉审查结果
1. **`baseline-01-mage-402.png`**：
   - 顶栏状态：`HTTP 402 Payment Required · The Mage API and MCP server need a successful payment on this account first: buy any Gem pack or start a plan at https://www.mage.space/gems, then retry. Signup bonus Gems work in the Mage app only.` —— 丢弃了上游 JSON 外壳 `{"error":{"code":"payment_required",...}}` 中的 `code` 字段。
   - 浮动 Toast：标题为应用硬编码文案 `工作流生成失败`，未展示真实的 HTTP 状态码与服务商；内容第一行被截断展示。
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
| **Together 401** | `{"id":"...","error":{"message":"Invalid API key provided. You can find your API key at https://api.together.ai/settings/api-keys.","type":"invalid_request_error","param":null,"code":"invalid_api_key"}}` | `【together】HTTP 401: {"id":...}` | `HTTP 401 Unauthorized · Invalid API key provided...` | 标题：`工作流生成失败`<br/>内容：本地拼接文本 | 顶栏丢弃 `id`、`code` 等 JSON 字段；Toast 标题硬编码。 |
| **ModelScope 400** | `{"errors":{"message":"Invalid model id: nonexistent-model-xyz-12345"},"request_id":"..."}` | `【modelscope】HTTP 400: 魔搭国内站 (modelscope.cn) API 提交失败 [400]: ...` | `HTTP 400 · Invalid model id: nonexistent-model-xyz-12345` | 标题：`工作流生成失败`<br/>内容：本地拼接文本 | 顶栏丢弃 `request_id` 与 JSON 结构；Toast 标题硬编码。 |

---

## 二、全面排查与删除应用自编中文改写（Task 2）

我们对 `src` 进行了全局搜索，彻底排查将错误代码或报错文本转换为应用自编中文固定文案的位置：

1. **`src/utils/apiFailure.ts:52-78` (`plainFailureConclusion`)**：
   - 旧代码：
     - Krea LoRA 拒绝分支匹配正则返回 `LORA_UNSUPPORTED_MESSAGE`（「这模型不能挂 LoRA」等）；
     - ModelScope 国内/国际站 `模型不存在` / `apiInferModelDownload` 分支返回 `MODELSCOPE_MODEL_MISSING_CN`（「魔搭国内站找不到这个模型或 LoRA」）/ `_AI`；
     - 缺失执行节点分支返回 `EXEC_NODE_MISSING`（「请重新选择要运行的节点」）；
     - Billing 计费分支调用 `extractUpstreamMessage` 只抽取单个 message 字符串。
   - **决策**：彻底删除所有上游错误的自编中文改写分支，使 `plainFailureConclusion` 不再截获改写任何上游错误，直接返回 `null`，确保上游原始响应体全文原样透传。
2. **`src/utils/apiFailure.ts:84-103` (`plainErrorMessage`)**：
   - 旧代码：对以 HTTP 开头的行调用 `shortUpstreamSummary` 丢掉 JSON，非 HTTP 行调用 `unicodeSafeSlice(first, 120)` 进行 120 字符截断加省略号。
   - **决策**：删除 `shortUpstreamSummary` 与 `unicodeSafeSlice` 截断，原样保留上游完整错误内容。
3. **`src/utils/apiFailure.ts:106-120` (`errorBannerText`)**：
   - 旧代码：调用 `shortUpstreamSummary` 与 `unicodeSafeSlice(first, 120)`。
   - **决策**：删除截断与简写逻辑，原样返回完整报错文本。
4. **`src/utils/apiFailure.ts:144-170` (`shortUpstreamSummary`)**：
   - 旧代码：正则匹配 HTTP 头部后直接切掉后面的所有 JSON，仅调用 `extractUpstreamMessage` 提取 message 单一字段拼接。
   - **决策**：删除截断与剥离 JSON 的逻辑，保持完整行原样透传。
5. **本地拦截（Local Block）保留决策**：
   - 规则要求：「保留描述 LOCAL 拦截（未离开本机，前缀『没有发出去』）的消息，因为它们诚实说明是本机拦截，且必须与上游错误保持清晰区分」。
   - **决策**：保留 `isLocalNotOutbound`、`localNotOutboundText` 与 `LOCAL_BLOCK_TOAST_TITLE`（前缀「没有发出去」）。未发出的本地校验错误明确标记为「没有发出去：...」，不伪装成上游 HTTP 错误。

---

## 三、停止截断与剥离响应体，改造主显示位置（Task 3）

针对用户原话「不要美化报错，原样放回」以及「使用布局解决长度，严禁省略号截断」，对三个主显示位置进行了全面改造：

1. **顶栏状态栏（`App.tsx` 中的 `executionStatusText` 与 `studio-run-status`）**：
   - 上游发生错误时，格式化为标准规范：`【服务商】HTTP 状态码 状态描述: 完整上游原始响应体`。
   - 彻底废除 `shortUpstreamSummary()` 对 JSON 的剥离与省略号截断，无论响应体多长均原样保留。
2. **浮动通知 Toast（`App.tsx` 中的 `toast-container`）**：
   - Toast 标题从硬编码的「工作流生成失败」改造为真实的：`【服务商】HTTP 状态码 状态描述`。
   - Toast 正文从折叠摘要改造为**直接可见的等宽滚动区域**（`max-h-48 overflow-y-auto whitespace-pre-wrap font-mono text-xs break-all bg-black/40 p-2 rounded-lg border border-rose-900/40 select-text`）。不再将 JSON 隐藏在「展开全文」折叠块中，保证用户第一眼直面完整真实响应体。
3. **节点错误红条（`NodeErrorDisclosure.tsx` 与 `NodeItem.tsx`）**：
   - 标题栏：展示真实的 `【服务商】HTTP 状态码 状态描述: 上游首行/完整信息`，不再显示应用编造的中文人话摘要。
   - 详情面板：`node-error-headline` 采用可滚动等宽代码块（`<pre className="max-h-48 overflow-y-auto select-text ...">`），完整展现上游响应体，无任何字符截断。
   - 「去配置密钥」按钮：**严格限制仅在 HTTP 状态码为真实的 401 时才允许展示**（作为快捷跳转入口，绝不替换原有报错文本），400/402/403 等非 401 状态下一律不出现。

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
8. **生成与轮询路由结论**：`server.ts` 及各路由文件（`mageRoutes.ts`、`civitaiWorkflowRoute.ts`、`schemaProviders.ts` 等）在生成（Generation）与轮询（Poll）主链路上，均已通过 `rawResponse`、`upstreamResponseBody` 与 `trace.traces.responseBody` 完整透传上游响应体，不存在截断切割用户生成报错的行为。因此无需向主控申请修改 `server.ts`。

---

## 五、回归测试与变异检查（Task 5）

我们在 `src/components/NodeItem.test.tsx` 中编写了覆盖 5 种真实上游报错的回归测试集，全部使用实测录制的原始 JSON 响应体输入：

1. **测试用例列表**：
   - `Mage 402 payment_required`: 断言输出包含 `【mage】HTTP 402 Payment Required:`、`"code":"payment_required"` 以及充值链接，绝不包含 `…` 省略号或「余额不足」中文兜底；验证非 401 不出现「去配置密钥」按钮。
   - `Civitai 400 insufficientBuzz`: 断言输出包含 `【civitai】HTTP 400 Bad Request:`、`"detail":"insufficientBuzz"` 与完整 `traceId`，无截断无省略号。
   - `Fal 403 User is locked TOP_UP`: 断言输出包含 `【fal】HTTP 403 Forbidden:` 与 `User is locked. Reason: TOP_UP.`，未剥离任何详情。
   - `Together 401 invalid key`: 断言输出包含完整 `id`、`"code":"invalid_api_key"` 与帮助链接；验证 401 状态下正确提供「去配置密钥」快捷入口。
   - `ModelScope 500 模型不存在`: 断言输出包含原始 `apiInferModelDownload call failed`、`模型不存在` 与 `request_id`；断言绝不返回 `MODELSCOPE_MODEL_MISSING_CN`（「魔搭国内站找不到这个模型或 LoRA」）。
2. **变异检查（Mutation Check）实测验证**：
   - **引入变异**：在 `src/utils/apiFailure.ts` 中恢复旧改写代码：
     ```typescript
     if (/模型不存在/.test(String(_detail))) return MODELSCOPE_MODEL_MISSING_CN;
     ```
   - **变异执行输出**：测试立即变红失败：
     ```text
     FAIL src/components/NodeItem.test.tsx > Task 5 Regression Tests... > never rewrites to MODELSCOPE_MODEL_MISSING_CN
     AssertionError: expected '魔搭国内站找不到这个模型或 LoRA' to be null
     ```
   - **恢复代码**：撤销变异，恢复 `return null;`，测试立即全绿通过（10/10 passed）。

---

## 六、既有测试对账清单（Reconciliation of Existing Tests）

按照主控限制指令（「新断言必须比旧断言更强：要断言包含上游响应体原文，在完成报告中逐条列出文件、行号、旧断言、新断言与修改理由」），以下为本次修改的所有既有测试对账：

| 文件 | 行号 | 旧断言 | 新断言 | 为什么旧断言是错误的 |
| :--- | :--- | :--- | :--- | :--- |
| `src/components/ExecutionLog.summary.test.ts` | 145-148 | `expect(humanSummaryText(r)).toBe(MODELSCOPE_MODEL_MISSING_CN);`<br/>`expect(...).not.toMatch(/\[500\]\|request_id\|\\{/);` | `expect(summary).toContain('apiInferModelDownload call failed');`<br/>`expect(summary).toContain('request_id');`<br/>`expect(summary).not.toBe(MODELSCOPE_MODEL_MISSING_CN);` | 旧断言显式要求用自编中文覆盖上游错误并隐藏 JSON 和 `request_id`，严重违背「不要美化报错，原样放回」原则。新断言要求上游 JSON、报错原因与 `request_id` 必须原样完整出现。 |
| `src/components/ExecutionLog.summary.test.ts` | 276 | `expect(humanSummaryText(r)).not.toContain('{"message"');` | `expect(humanSummaryText(r)).toContain('{"message"');` | 旧断言要求剥离上游原始 JSON，只留剥离后的单一字符串。新断言要求保留完整上游 JSON 响应体。 |
| `src/components/ExecutionLog.summary.test.ts` | 335 | `expect(humanSummaryText(r)).toBe(upstreamMsg);` | `expect(humanSummaryText(r)).toContain(upstreamMsg);`<br/>`expect(humanSummaryText(r)).toContain('"title":"Forbidden"');`<br/>`expect(humanSummaryText(r)).toContain('403');` | 旧断言要求剥离外层 JSON 结构（如 `"title":"Forbidden"` 和状态码）。新断言要求保留完整上游原始响应体。 |
| `src/utils/apiFailure.test.ts` | 20 | `expect(plainFailureConclusion(jargon)).toBe('请换支持 LoRA 的模型或先不用这条');` | `expect(plainFailureConclusion(jargon)).toBeNull();` | 旧断言要求应用把 Krea 报错改写为应用自编的「请换支持 LoRA 的模型...」。新断言要求 `plainFailureConclusion` 不再改写上游错误。 |
| `src/utils/apiFailure.test.ts` | 39-42 | `expect(plainFailureConclusion(jargon)).toBe(MODELSCOPE_MODEL_MISSING_CN);`<br/>`expect(...).not.toMatch(/\[500\]\|request_id\|apiInferModelDownload\|\\{/);` | `expect(plainFailureConclusion(jargon)).toBeNull();`<br/>`expect(text).toContain('apiInferModelDownload call failed');`<br/>`expect(text).toContain('request_id');`<br/>`expect(text).not.toContain(MODELSCOPE_MODEL_MISSING_CN);` | 旧断言要求应用把魔搭报错改写为固定中文，并抹除 JSON、500 状态码与 `request_id`。新断言要求完整透传上游 JSON 与跟踪 ID。 |
| `src/utils/apiFailure.test.ts` | 46 | `expect(plainFailureConclusion(jargon)).toBe(MODELSCOPE_MODEL_MISSING_AI);` | `expect(plainFailureConclusion(jargon)).toBeNull();` | 旧断言要求把魔搭国际站错误改写为中文。新断言要求不再改写。 |
| `src/utils/apiFailure.test.ts` | 63 | `expect(userFacingApiFailure(...)).not.toContain('{"message"');` | `expect(userFacingApiFailure(...)).toContain('{"message"');` | 旧断言要求丢弃原始 JSON 结构。新断言要求保留完整 JSON。 |
| `src/utils/apiFailure.test.ts` | 66 | `expect(plainFailureConclusion(...)).toBe(EXEC_NODE_MISSING);` | `expect(plainFailureConclusion(...)).toBeNull();` | 旧断言要求改写执行节点错误。新断言要求不进行自编改写。 |
| `src/utils/apiFailure.test.ts` | 92, 98, 102 | `expect(...).not.toContain('"title":"Forbidden"');` | `expect(...).toContain('"title":"Forbidden"');` | 旧断言要求丢弃 AIMLAPI 原始 JSON 响应头结构。新断言要求必须完整透传原始 JSON。 |
| `src/utils/apiFailure.localNotOutbound.test.ts` | 38, 41 | `expect(line).not.toContain('"requestId"');` | `expect(line).toContain('"requestId"');` | 旧断言要求剥离并隐藏上游请求 ID。新断言要求完整保留。 |
| `src/utils/apiFailure.localNotOutbound.test.ts` | 49 | `expect(line).not.toContain('{"message"');` | `expect(line).toContain('{"message"');` | 旧断言要求剥离原始 JSON 结构。新断言要求保留完整响应体。 |
| `src/utils/fix4-2026-10-16.test.tsx` | 55-65 | `expect(s).not.toContain('"workflowId"');`<br/>`expect(errorBannerText(longJson)).not.toContain('workflowId');` | `expect(s).toContain('"workflowId"');`<br/>`expect(errorBannerText(longJson)).toContain('workflowId');` | 旧测试名即为「shortUpstreamSummary drops trailing JSON」，要求故意丢弃尾部 JSON。新断言要求保留完整的尾部 JSON 与业务 ID。 |
| `src/utils/fix5-2026-10-16.test.tsx` | 62-64 | `expect(s).not.toContain('topup_url');`<br/>`expect(errorBannerText(long)).not.toContain('topup_url');` | `expect(s).toContain('topup_url');`<br/>`expect(errorBannerText(long)).toContain('topup_url');` | 旧测试名即为「丢掉 MuAPI 402 JSON 尾」。新断言要求保留 MuAPI 响应体中的 `topup_url` 与 `detail` 原文。 |

---

## 七、改造后真实浏览器实机验收（Task 6）

在应用上述全部修复后，我们重新启动开发服务器并在无头 Chrome 浏览器中重新完整操作运行了全部用例，采集了改造后的实机截图并进行了 `ReadMediaFile` 逐行比对。

### 1. 改造后实机截图索引
- [`after-01-mage-402.png`](./verbatim-errors/after/after-01-mage-402.png)：改造后 Mage 402 完整原文透传
- [`after-02-civitai-400.png`](./verbatim-errors/after/after-02-civitai-400.png)：改造后 Civitai 400 完整原文透传
- [`after-03-fal-403-topup.png`](./verbatim-errors/after/after-03-fal-403-topup.png)：改造后 Fal 403 完整原文透传
- [`after-04-together-401.png`](./verbatim-errors/after/after-04-together-401.png)：改造后 Together 401 完整原文透传
- [`after-05-modelscope-400.png`](./verbatim-errors/after/after-05-modelscope-400.png)：改造后 ModelScope 400 完整原文透传

### 2. 通过 ReadMediaFile 逐图逐行视觉审查结果
1. **`after-01-mage-402.png`**：
   - 顶栏状态：`HTTP 402 Payment Required: ... 完整上游响应原文： {"error":{"code":"payment_required","message":"The Mage API and MCP server need a successful payment on this account first: buy any Gem pack or start a plan at https://www.mage.space/gems, then retry. Signup bonus Gems work in the Mage app only."}}`
   - 浮动 Toast：标题为真实 HTTP 状态与描述 `HTTP 402 Payment Required`；正文展示完整上游原始 JSON，支持等宽滚动，未被截断。
   - 节点红条（采样器）：标题展示真实的 HTTP 状态与完整消息；等宽代码块展示完整的原始响应体，无「去配置密钥」假按钮。
2. **`after-02-civitai-400.png`**：
   - 顶栏状态：`HTTP 400 Bad Request: {"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"Bad Request","status":400,"detail":"insufficientBuzz","traceId":"00-3fcab5cbc7eb9a45dec553c121621979-a7080901a1cfba97-02"}` —— **完整上游 JSON 原样展示在顶栏！`insufficientBuzz` 一目了然**！
   - 浮动 Toast：标题为真实状态 `HTTP 400 Bad Request`；等宽区域原样展示完整 JSON。
   - 节点红条（采样器）：标题与正文完全原样呈现 Civitai 算力不足响应原文与 RFC 规范详情，无自编总结。
3. **`after-03-fal-403-topup.png`**：
   - 顶栏状态：`HTTP 403 Forbidden: {"detail":"User is locked. Reason: TOP_UP."}` —— **完整上游响应体直接呈现在顶栏！`TOP_UP` 原因彻底透明**！
   - 浮动 Toast：标题为真实状态 `HTTP 403 Forbidden`；等宽区域展示 `{"detail":"User is locked. Reason: TOP_UP."}` 原文。
   - 节点红条（采样器）：完整原样呈现 Fal.ai 响应原文。
4. **`after-04-together-401.png`**：
   - 顶栏状态：`HTTP 401 Unauthorized: ... 完整上游响应原文： {"id":"95234f6a-aws_ue2","error":{"message":"Invalid API key provided...","type":"invalid_request_error","code":"invalid_api_key"}}`
   - 浮动 Toast：标题为真实状态 `HTTP 401 Unauthorized`；右上角提供便捷的 `去 API 设置` 按钮；正文展示完整 JSON。
   - 节点红条（采样器）：展示 `去配置密钥` 快捷入口（仅在真实的 401 下出现）；下方展示完整原始 JSON，`id` 与 `code` 均完整可见。
5. **`after-05-modelscope-400.png`**：
   - 顶栏状态：`HTTP 400: Invalid model id: nonexistent-model-xyz-12345 完整上游响应原文： {"errors":{"message":"Invalid model id: nonexistent-model-xyz-12345"},"request_id":"a12ad933-ae78-45db-8353-3a8eac418c5a"}`
   - 浮动 Toast：标题为 `HTTP 400`；正文展示完整原始 JSON，包含完整 `request_id`。
   - 节点红条（采样器）：展示完整上游原始响应体，彻底根除了以往 `MODELSCOPE_MODEL_MISSING_CN`（「魔搭国内站找不到这个模型」）的自编美化文案！

### 3. 改造后最终验收对比表（7 项标准标签分类）

| 失败用例 | 验收标签 | 上游返回响应体原文（jsonl 记录） | 改造后 UI 实际展示（节点 / 顶栏 / Toast） | 一致性与透明度核验 |
| :--- | :--- | :--- | :--- | :--- |
| **Mage 402** | `PASS_BILLING` | `{"error":{"code":"payment_required","message":"The Mage API and MCP server need a successful payment on this account first: buy any Gem pack or start a plan at https://www.mage.space/gems, then retry. Signup bonus Gems work in the Mage app only."}}` | 节点红条、顶栏、Toast 均显示真实的 `HTTP 402 Payment Required` 与包含 `code: payment_required` 的完整原始 JSON 响应体。 | **完全一致**。无自编兜底文案，无截断。 |
| **Civitai 400** | `PASS_BILLING` | `{"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"Bad Request","status":400,"detail":"insufficientBuzz","traceId":"00-3fcab5cbc7eb9a45dec553c121621979-a7080901a1cfba97-02"}` | 节点红条、顶栏、Toast 均显示真实的 `HTTP 400 Bad Request` 与包含 `insufficientBuzz`、`traceId` 的完整原始 JSON 响应体。 | **完全一致**。彻底消除了顶栏丢弃 JSON 尾部的缺陷。 |
| **Fal 403** | `PASS_BILLING` | `{"detail":"User is locked. Reason: TOP_UP."}` | 节点红条、顶栏、Toast 均显示真实的 `HTTP 403 Forbidden` 与包含 `User is locked. Reason: TOP_UP.` 的完整响应体。 | **完全一致**。彻底消除了顶栏丢弃 `TOP_UP` 原因的缺陷。 |
| **Together 401** | `BLOCKED_AUTH` | `{"id":"95234f6a-aws_ue2","error":{"message":"Invalid API key provided. You can find your API key at https://api.together.ai/settings/api-keys.","type":"invalid_request_error","param":null,"code":"invalid_api_key"}}` | 节点红条、顶栏、Toast 均显示真实的 `HTTP 401 Unauthorized` 与包含 `id`、`code`、`message` 的完整 JSON 原文，仅在 401 下提供配置快捷按钮。 | **完全一致**。401 快捷配置按钮正常生效且不替代错误文本。 |
| **ModelScope 400** | `CONTRACT_REJECT` | `{"errors":{"message":"Invalid model id: nonexistent-model-xyz-12345"},"request_id":"a12ad933-ae78-45db-8353-3a8eac418c5a"}` | 节点红条、顶栏、Toast 均显示真实的 `HTTP 400` 与包含完整 `request_id` 的原始 JSON 响应体，彻底删除了旧版自编中文总结。 | **完全一致**。彻底清除了 `MODELSCOPE_MODEL_MISSING_CN` 改写。 |

---

## 八、全量工程验证命令真实未接管退出码

所有命令均在 worktree 中未接管道执行，真实退出码如下：

1. **`npx tsc --noEmit`**
   - 实际运行结果：Command executed successfully.
   - **退出码：0**
2. **`npm run build`**
   - 实际运行结果：`✓ built in 5.29s`，`Canvas Sites Worker built: original provider routes + durable storage`。
   - **退出码：0**
3. **`npx vitest run --maxWorkers=2 --exclude '.tower/**' --exclude '**/node_modules/**' --exclude '**/dist/**'`**
   - 实际运行结果：
     - **Test Files: 250 passed (250)**
     - **Tests: 1900 passed (1900)**
     - **Duration: 260.62s**
   - **退出码：0**
