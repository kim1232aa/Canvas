# AIMLAPI / Krea reverify3 修复（2026-10-15 03:20 北京时间）— CODE_ONLY

来源：`/workspace/canvas-e2e-aimlapi-krea-reverify3/`（runB-history、runC-node-first-attempt-reselect、runD-lorahub-wavespeed-empty 已看）。还原包 `/workspace/canvas-restore/pre-reverify3-0307.tgz`。未提交。

| # | 状态 | 根因 / 改动 |
|---|---|---|
| P0-1 尺寸 505/137/3675 · 上游实际 | CODE_ONLY | 读的是 `executionTrace[-1].responseBody`：响应体被外置成 `{kind:'raw-response',sha256,size}`，`size` 是 **原始响应体字节数**（403 原文 505 B、402 原文 137 B…）。修：failed / local_blocked 不再读任何「上游实际」；raw-response 引用不当参数。现显示 `square_hd · 实际发送`。`historyParameters.ts` |
| P0-2 灰卡完整拟发送参数 | CODE_ONLY | local_blocked 从 `requestMetadata.intendedRequest`（含 custom_parameters）解析种子/步数/CFG/采样/尺寸，标「拟发送（未出站）」；被拦字段仍是「17 步（超出 1–8，未发送）」；LoRA 行读 intendedRequest.loras。 |
| P0-3 推测性文案 | CODE_ONLY | NodeItem 删除「还不确定这个 LoRA 和底模能不能配合…」，unverified 不渲染任何东西。 |
| P0-4 Krea LoRA Hub | CODE_ONLY + live | Krea 标签**本来就有**，被标签栏横向溢出挡在 Sogni 后面（P1-6）。目录：官方 `GET https://api.krea.ai/styles`（openapi.json：cursor、limit 1–1000、ids、liked、user、model、filter[all/user/community/krea/shared/…]，返回 `{items,next_cursor}`）。改：limit 透传上游、cursor 翻页、`next_cursor` 原样回传（`paging:'upstream-cursor'`），前端按它翻页。不按底模自动传 `model`：Krea style 的 models 是 `flux_dev`/`k1` 这类名，和端点 id `image/bfl/flux-1-dev` 没有官方对照，不做映射；卡片显示 style 自带的 models。挂载链路验证：Krea style → `selectionFromMetadata` provider=`krea`，`isLoraUnsupportedOnEndpoint('krea','image/bfl/flux-1-dev')`=false，所以挂到 Krea 底模不会再报「请先选择同平台底模」（runD 报错是因为选的是 MuAPI LoRA，属正确拒绝）。发送：`styles[{id,strength}]`（Schema 无 styles 时本地拒绝，已有）；strength 必填、[-2,2]，不代填。失败：fetchLiveModels 错误现为 `HTTP <码> <error>\n<上游原文>`。 |
| 删 LoRA 后首跑「请重新选择要运行的节点」 | CODE_ONLY | 根因：删除后 `selectedNodeId` 仍指向已删节点（点垃圾桶的点击冒泡会重新选中该节点），executeWorkflow 用这个 id 找不到节点。修：App 里 effect 清掉不存在的选中 id；运行前 `liveRunTargetId()` 校验：选中/指定的运行节点不存在 → 提示「节点已删除，请重新选择」，不发请求（03:13 按画布裁定移除了「自动找目标」，那属于黑盒自愈）。没有选中节点时仍按原有规则定位目标。 |
| P1-5 溢出 | CODE_ONLY | 节点红框 `min-w-0 break-all max-h-24 overflow-y-auto`；执行记录提示条 `max-w 420px/60vw、max-h-16` 可滚动（全文仍在面板里）。 |
| P1-6 标签栏 | CODE_ONLY | LoRA Hub 标签改 `flex-wrap` 换行，不再横向裁切。 |
| P1-7 空态 | CODE_ONLY + live | 空态结论改为「GET <端点> → HTTP <码>，返回 0 个 LoRA」+ 折叠的上游原文（取自响应里的 executionTrace）；没有发上游请求时明确写「未请求上游目录」+ 原因 + 来源。Tensor.Art 标签实测（:3000，03:15）：`/api/models?provider=tensorart&type=LORA` HTTP 200，**未发起任何上游请求**，sourceUrl `https://tams-docs.tensor.art/docs/api/guide/integration-faq/`，message「TAMS 官方不提供模型列表 API；请在官方模型库选择底模或 LoRA，复制 ID 查询。未发起网页抓取。」→ 空态会如实显示这句。（截图里标签名是「Tensor.Art (吐司)」。） |
| P2-8 悬停全名 | CODE_ONLY | 底模下拉及选项 title=名称·ID；LoRA 卡创作者、触发词加 title（名称/ID 原本已有）。 |
| P2-9 空态层级 | CODE_ONLY | 结论行加粗白色 text-sm，说明降为 11px 灰。 |
| 本机直调 | CODE_ONLY + live | 前端所有到 `/api/` 的 fetch（main.tsx 全局包装 + tracedFetch）带 `x-canvas-origin: browser-ui`；服务端把无此头的生成请求历史标 `requestOrigin:'direct'`，卡片显示「本机直调」。live：curl 无头 → `direct`，带头 → `browser`。 |

## 验证
- vitest src：998 通过 / 2 失败（mediaHostedReview，缺 hosting/server.generated，旧）。新增 `src/server/aimlapiKreaReverify3.test.tsx`（7 条）；ModelsLabDriver 头断言、nodeUI 文案断言随改。
- tsc：只剩旧错误。
- live Krea（:3000，03:14）：`limit=5` → 5 条（Enamel Pin/k1、atlas silk style/flux_dev…），`nextCursor 2025-06-06T09:11:38.066Z`；带 cursor 第二页 5 条不同 id，上游 URL `https://api.krea.ai/styles?limit=5&cursor=…`。`krea-styles-live-page{1,2}.json`
- live 直调标记：2 条 steps 17 本地拦截记录（prompt "origin check" / "origin check ui"）已写入历史。

## 03:15 画布裁定：未选中节点时按输出节点运行，但必须可见（CODE_ONLY）
- `resolveRunTarget()`（graphEngine）是唯一来源：有选中/指定 → 必须存在，否则「节点已删除，请重新选择」；未选中 → `resolveTargetNode` 的输出节点（SaveImage/SaveVideo/PreviewImage、KSampler 或云引擎节点）。若只能落到加载器/任意节点或画布为空 → 「没有可运行的输出节点…；未发送请求」。
- 运行按钮实时显示「运行：<节点标题>」（随选中与图变化，useMemo 依赖 nodes/connections/selectedNodeId）；无法解析时按钮禁用并显示原因（runDisabledReason）。
- 同一个 id 传给 executeWorkflow；本次运行的非 GET 请求带 `runTarget`，执行记录首行显示「运行：<标题>（未选中节点，按输出节点）」。
- 测试 `src/utils/runTarget.test.tsx`（5 条）；vitest src 1003 通过 / 2 旧失败（mediaHostedReview）。tsc 无新增错误。还原包 `pre-runlabel-0315.tgz`。
