# AIMLAPI / Krea reverify2 修复（2026-10-15 02:58 北京时间）— 状态：CODE_ONLY

来源：画布前端复验 `/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-aimlapi-krea-reverify2/`（run2/run3-history-modal.webp 已看）。
未做浏览器 E2E，未提交/推送。还原包：`/workspace/canvas/temp/backups/canvas-restore/pre-aimlapi-krea-fixes-0251.tgz`。

## 逐项
| # | 结论 | 根因 / 改动 |
|---|---|---|
| P0-1 计数 | CODE_ONLY | 标题用 `history.length`。改为 `hasOutputMedia()`（failed/local_blocked/空 url 不计）；另显示「N 条未出图记录」。`HistoryModal.tsx`、`historyParameters.ts` |
| P0-2 seed 行 | CODE_ONLY | actualRequest 里 seed=42 本来就有，`resolveHistoryParameters` 读得到；根因是卡片参数区根本没有 seed 行（只在出图卡的图片角标里渲染），失败/拦截卡看不到。参数区新增「种子」行，来源标签同其他字段。 |
| P0-3 image_size | CODE_ONLY + live curl | 画布的图里没有 EmptyLatentImage，所以没有 width/height，服务端无从打包 image_size。新增通用 `SchemaChoiceControls`：节点上 API 参数编辑器自动拉官方 Schema，凡是 enum 字符串或 `{width,height}` 对象、且不是画布已有控件的字段都渲染成下拉（+自定义宽高，min/max 取自 Schema），写入 custom_parameters 原样发送。不写死字段名/供应商。历史新增 `size` 键（image_size / size），显示 `square_hd` 或 `1024×768`。 |
| P0-4a Krea strength:1 | 不改发送（已声明且有控件） | 来自 KSampler「去噪强度」控件（值 1）→ 别名 denoise→strength。Krea 官方 `https://api.krea.ai/openapi.json` `/generate/image/bfl/flux-1-dev` 声明 `strength`（0–1，default 1，"Denoising strength when an input image is provided"）。节点上已有控件且徽章「会发送」，故按规则保留。注意：文生图无输入图时上游语义上不用它；若要不发，需画布另定规则（我没按描述文本做特判）。 |
| P0-4b LoRA 架构检查 | 判定不可靠 → 警告整体去掉 | `identifyArchitectureFamily` 是对名字做子串猜测（z-image 被归成 Krea 2；`xl`/`wan`/`google` 会误命中），没有用两侧真实 metadata（Krea 底模没有 baseModel 字段）。所以 `validateModelCompatibility` 不再返回 incompatible，统一「待验证」。没有拦截、也不再显示「底模架构不匹配」。z-image LoRA 发给 flux-1-dev 这件事本身：Krea 官方 styles 是 `{id,strength}`，上游如何处理以其响应为准。 |
| P1-5 遮挡 | CODE_ONLY | 执行记录容器 z-[80] → z-40，弹窗（z-50）在上。代价：历史弹窗打开时执行记录在遮罩下，需先关弹窗。 |
| P1-6 提示条截断 | CODE_ONLY | 去掉 28 字截断，按钮 `whitespace-normal break-all max-h-40 overflow-y-auto`，首行完整显示 HTTP 码+上游原文。 |
| P1-7 灰卡拦截值 | CODE_ONLY + live curl | 服务端约束拦截错误新增 `blockedField{from,field,value,minimum,maximum,enum,reason}`（通用，所有 schema 供应商）；`fail()` 透传；本地拦截历史写入 `requestMetadata.blockedField`；卡片显示「步数: 17 步（超出 1–8，未发送）」。 |
| P1-8 采样标签 | CODE_ONLY | 拆成「采样器: …」「调度器: …」。 |
| P2-9 时间 | CODE_ONLY | `formatRecordTime` → `2026-10-15 02:48:15（北京时间）`；按浏览器本地时区，中国大陆时区显示「北京时间」，其他用 zh-CN 时区长名。 |
| P2-10 顶部说明 | CODE_ONLY | 「这里能查到每次生成发了什么、在哪一步出错；密钥不会显示。是否出图，以画布上的结果为准。」 |
| P2-11 原始 JSON 折叠 | CODE_ONLY | 失败卡去掉 aspect-square，原文放进默认折叠的「上游原文（原样，点开查看）」，状态码与参数区上移。 |
| P2-12 灰按钮原因 | CODE_ONLY | 「应用到画布」禁用时 title + 卡片下方可见文字说明原因（本地拦截/上游失败/无输出/预览失败）。截图里的按钮叫「应用到画布」，不是「重新编辑」。 |

## 验证
- `npx vitest run src`：991 通过，2 失败（`mediaHostedReview.test.ts`，缺 `hosting/server.generated`，旧问题）。新增 `src/server/aimlapiKreaReverify2.test.tsx` 11 条；3 条旧的「底模架构不匹配」断言改为断言不再告警。
- `npx tsc --noEmit`：仅旧错误（hosting generated ×3、tensorArtCredentials.test ×2、billingKeyRotate.ts:163，非本次文件）。
- live :3000（02:55 北京时间）：
  - steps 8 + seed 42 + LoRA 0.85 + `image_size:"square_hd"` → 上游 HTTP 403 原文；actualRequest `{"num_inference_steps":8,"seed":42,"loras":[{"path":"ostris/z_image_turbo_childrens_drawings","scale":0.85}],"image_size":"square_hd",...}`。`aimlapi-krea-reverify2-live-403.json`
  - steps 17 → HTTP 400 本地拦截，`blockedField` 进入 historyItem.requestMetadata。`aimlapi-krea-reverify2-live-blocked.json`
  - 这两次 curl 各写了一条历史记录（prompt "a small red apple…"）。

## 改动文件
`src/server/schemaProviders.ts`（仅 2 行：fail() 透传 blockedField；约束拦截附 blockedField。未碰 Together/Venice/Novita 段）、`src/server/failedAttemptHistory.ts`、`src/utils/historyParameters.ts`、`src/components/HistoryModal.tsx`、`src/components/ExecutionLog.tsx`、`src/services/executionTrace.ts`、`src/components/ApiParameterEditor.tsx`、新 `src/components/SchemaChoiceControls.tsx`、`src/utils/baseModelMatcher.ts`、测试 3 个。
