# UI 完善 backlog — 2026-10-14

只读扫描产物：对照代码 + 本轮前端 E2E 截图，**未改产品 UI 代码**。  
铁律约束：无假目录；错误透明；LoRA 强度禁止静默默认。

## 证据来源

| 来源 | 路径 | 说明 |
|------|------|------|
| WaveSpeed PASS_GENERATION | `/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-wavespeed/` | `01-before-run.png` `02-after-run-canvas.png` `04-history-modal.png` `history-export.json` |
| Fal PASS_BILLING | `/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-fal/` | `01–04-*.png` `outcome.json`（403 TOP_UP） |
| 硬编码收口 | `docs/evidence/hardcode-miswire-scan-2026-10-14.md` | popularModels 已清空；LoRA 0.8 主路径已清 |
| 关键组件 | `src/components/{ModelHubModal,CivitaiModal,BackendSettingsModal,ParameterInspector,NodeItem,HistoryModal,ExecutionLog}.tsx` | 见下表行内路径 |

---

## P0 — 用户当场会误判或踩铁律

### P0-1 节点错误文案吞掉上游原因
- **现象（截图）**：Fal 失败后 KSampler 只显示「请求失败，查看执行记录」；`TOP_UP` / HTTP 403 仅在左下执行记录 JSON 里。见 `canvas-e2e-fal/02-execution-log.png`、`04-after-run-no-image.png`；`outcome.json` 确认上游 `User is locked. Reason: TOP_UP.`
- **代码**：`App.tsx` ~1018–1024 把 `errorMessage` 硬写成「请求失败，查看执行记录」，覆盖真实 `err.message`。
- **为何要改**：铁律要求错误透明；用户不点执行记录就以为「软件坏了」而不是「欠费」。
- **建议**：节点 banner / 顶栏状态直接展示首行上游错误（含状态码与 `detail`）；完整 JSON/堆栈仍放执行记录。欠费类可加「计费/额度」标签，但**禁止**自动换商。

### P0-2 执行记录面板：可发现性弱 + 可读性偏技术
- **现象**：左下角小按钮「执行记录 · N」；打开后是大块 JSON + 堆栈，挡住画布一半（Fal 截图）。成功时用户几乎不会点开。
- **代码**：`src/components/ExecutionLog.tsx`（整文件 ~21 行，无摘要行、无错误分类、无「复制错误」）。
- **建议**：
  1. 错误时按钮变色/脉冲，并显示一行摘要（如 `Fal 403 · TOP_UP`）。
  2. 每条记录顶部用人话摘要：`endpoint` + `status` + `errorSource` + 首句 `detail`；JSON 默认折叠。
  3. 一键复制「可粘贴的错误报告」（不含 Key）。

### P0-3 Schema 丢弃的画布参数在节点上仍像「有效」
- **现象（WaveSpeed）**：KSampler 显示 Steps=8、CFG=1、采样「未指定」；历史里步数/CFG/尺寸全是「未发送」。`history-export.json` mapping 写明：`steps`/`cfg` 因 `schemaFieldsOnly` 未提交，reason 为「没有对应的官方 Schema 字段」。
- **代码**：`NodeItem.tsx` 滑块仍可编辑；`ParameterInspector.tsx` 有 `FieldStatusBadge`，但节点路径对 WaveSpeed 这类「Schema 有别的字段、画布字段被丢弃」不够醒目；真实可配字段（如 `aspect_ratio`）埋在 Checkpoint 的 `ApiParameterEditor` JSON 里。
- **为何要改**：用户以为调了 steps，实际上游只用了 `prompt/seed/strength`——属于「界面撒谎」。
- **建议**：
  1. 对 `sent:false` / schema 未声明字段：节点控件灰显 + badge「不会发送」+ 悬停显示 mapping reason。
  2. 在 Checkpoint / 参数面板突出**官方 Schema 字段**（WaveSpeed：`aspect_ratio`、`enable_*` 等），不要只靠折叠 JSON。
  3. 历史卡片对「未发送」附短因（Schema 未声明 / 用户未填），避免满屏玫瑰红「未发送」却无解释。

### P0-4 LoRA 强度 UI 与「禁止静默 0.8」仍有裂缝
- **已做好的**：引擎侧 `loraStrength.ts` / `graphEngine` / `App` 挂载会 toast「未设置强度」；ModelHub 挂载不 invent 0.8（见 hardcode 扫描）。
- **仍伤 UX**：
  1. `ParameterInspector.tsx` ~736–758：标签写「推荐权重」，`value={lora.modelStrength}` 在 `undefined` 时 HTML range 会显示中间档，**看起来像已设强度**；显示「—」与滑块视觉矛盾。
  2. Model Hub / LoRA Hub 挂载后不强制弹出强度输入；用户可能跑到生成才被拒绝。
  3. 空强度时缺少明确「生成前必填」阻断条（仅 toast）。
- **建议**：未设强度时禁用滑块默认值展示，改为数字输入 +「未设置」占位；挂载流程内强制填强度；运行前校验失败在节点/取景框内常驻红字（引用 `缺少显式 LoRA 强度…` 原文）。

### P0-5 设置页 popularModels 清空后的空洞空态
- **现象**：`BackendSettingsModal.tsx` ~756–759 所有商 `popularModels: []` 后，右侧「模型目录」只剩一段说明文字，半格空白，无跳转按钮。
- **为何要改**：硬编码清掉是对的（铁律），但空态应变成**可行动**引导，否则像功能缺失。
- **建议**：空态改为 CTA「打开模型中心 · {当前供应商}」+「按 ID 粘贴」；余额/Key 状态旁显示「目录请用模型中心，此处不维护假热门列表」。

---

## P1 — 明显影响日常操作与验收

### P1-1 双入口 LoRA 中心易混淆
- **代码**：顶栏「LoRA」→ `ModelHubModal` category=`lora`；底栏「LoRA 模型中心」→ `CivitaiModal`（Universal LoRA Hub）。`ParameterInspector`「添加 LoRA」优先 `onOpenCivitai`。
- **建议**：统一主入口命名与能力说明；Model Hub LoRA 页与专用 Hub 职责写清（目录检索 vs 跨商 URL/AIR 导入）；避免两个几乎同名的紫色按钮。

### P1-2 模型 ID / 名称截断严重
- **截图**：WaveSpeed loader 显示 `wavespeed-ai/krea-v2/turbo-wave-v...` 与底部 `Current: wavespeed-ai/krea-v2/tu`。
- **代码**：`NodeItem.tsx` 标题 `truncate`；ckpt 列表项无 title 全量展示策略不统一。
- **建议**：悬停 `title=完整 ID`；选中态单独一行等宽全量 ID；复制按钮。

### P1-3 Checkpoint「已加载 N / 加载更多」分页 UX 弱
- **截图**：Fal「Already loaded 46 models」；分页藏在节点内，无筛选/架构/能力标签（是否支持 LoRA）。
- **建议**：节点内保留快速搜索 +「在模型中心打开」；能力 chip（LoRA / 视频 / Schema-only）来自真实目录元数据，禁止写死营销列表。

### P1-4 历史模态布局与溯源展示
- **截图**：`04-history-modal.png` 单卡左侧，右侧大片空白；prompt `line-clamp-2`；参数区满「未发送」。
- **代码**：`HistoryModal.tsx`；导出 JSON 其实含完整 `mapping`/`actualRequest`，但 UI 未展示。
- **建议**：
  1. 选中项右侧详情栏：实际 endpoint、已发送参数、mapping 丢弃项、LoRA 列表。
  2. 「应用到画布」应可选恢复 checkpoint/seed/LoRA（现多半只套 prompt）。
  3. 空历史文案仍写「Queue Prompt」（~142 行）→ 改为「运行工作流」。

### P1-5 失败后预览残留 / 成功预览位置混乱
- **Fal `01-before-run.png` 描述**：切换到 Fal 红苹果 prompt 后，KSampler/SaveImage 仍可能残留上一轮 WaveSpeed 雨景（若未清干净）；`outcome.json` 称本次已清。`App.tsx` ~948 有注释要求失败/新跑清图。
- **建议**：跑前统一清目标分支预览；失败态 SaveImage 明确「本次未出图」而非沿用旧缩略图；KSampler 内嵌预览与 SaveImage 职责分开（避免双份缩略图抢视线）。

### P1-6 参数总控台 vs 节点内控件双源
- **代码**：`ParameterInspector.tsx`（「ComfyUI 核心参数总控台」）与 `NodeItem` widgets 两套 UI；Schema enum 选择器仅部分商完整。
- **建议**：以 Schema 为唯一真相：总控台显示「将发送 / 不会发送」对照表；节点只编辑会发送的字段 + 高级 JSON。标题可改为中性「生成参数」，减少 Comfy 本地语义误导。

### P1-7 Prompt 节点「润色服务」占位偏重
- **截图**：正向提示词下方大块「未选择（禁用润色）」+ 模型 placeholder，即使未用。
- **建议**：默认折叠「AI 润色」；未配置 Key 时显示「去 API 设置配置 Gemini/SenseNova」空态，而不是空白下拉。

### P1-8 Fal / 需充值商的设置页引导
- **证据**：Fal 403 TOP_UP；设置里有余额总览但与画布错误未联动。
- **建议**：执行记录/节点错误若识别计费类（TOP_UP、insufficient、quota），提供「打开 API 设置 · 该商余额」深链；仍禁止自动换商。

---

## P2 — 体验打磨与一致性

### P2-1 中英混排与术语
- 顶栏/节点中文，引脚 `MODEL/CLIP/VAE`、部分按钮英文残留（历史空态 Queue Prompt）。统一产品术语表（供应商名、LoRA、取景框、执行记录）。

### P2-2 Radar Minimap / 底栏密度
- 底栏同时有添加节点、取景框、LoRA 中心、清空、缩放；与顶栏模型/LoRA 重复。可考虑把 LoRA 中心收进「资源」菜单，底栏只留画布工具。

### P2-3 Model Hub 空目录 / Tensor ID-only
- `ModelHubModal.tsx` ~890–924 空态尚可；Tensor 已说明 TAMS 无列表。可对 `openai_compat`/`grok_compat`/`agnes`（provider=all 空列表）做专用空态：「中转无统一目录，请按 Base URL 文档填模型 ID」。

### P2-4 CivitaiModal 跨商说明长度
- Fal/Sogni 说明段落较长（~727–739）。可改为可折叠「目录能力说明」，默认一行摘要。

### P2-5 ProviderMatrix 与前端实况
- `ProviderMatrixModal.tsx` 已更新 SenseNova 等；应用矩阵状态与本轮 E2E 对齐（WaveSpeed PASS_GENERATION、Fal PASS_BILLING），避免文档墙与画布体验脱节。

### P2-6 取景框 / 空间模式 LoRA 条
- `SpatialFrameItem.tsx` 展示 `({l.modelStrength})`；强度 undefined 时避免显示 `undefined` 或假 0.8。与参数面板同一套「— / 未设置」语义。

### P2-7 「一键切换兼容底模」跨商风险提示
- `ParameterInspector` / `NodeItem` / `App.handleAutoFixCheckpoint`：推荐 checkpoint 可能来自架构启发式。需标明推荐来源与目标供应商，避免张冠李戴换成另一商的 ID。

### P2-8 无障碍与键盘
- 执行记录、历史、模型中心大模态：Esc 关闭、焦点陷阱、错误 `role="alert"` 已有零星使用（`ApiParameterEditor`），节点错误 banner 应对齐。

---

## 建议落地顺序（给实现侧）

1. **P0-1 + P0-2**（错误可见）→ 立刻提升 Fal 类欠费验收体验，且不碰生成逻辑。  
2. **P0-3**（Schema 发送透明度）→ 消解 WaveSpeed「调了 steps 却未发送」的信任问题。  
3. **P0-4 + P0-5**（LoRA 强度 UI + 设置空态 CTA）。  
4. **P1** 历史详情栏、入口合并、截断与润色折叠。  
5. **P2** 文案/矩阵/无障碍。

## 明确不在本 backlog 伪装成已完成的事项

- 不把 popularModels 重新填回假热门列表。  
- 不把 Fal TOP_UP 做成自动换商或假成功。  
- 不把历史「未发送」改成显示画布未提交值假装已发送。  
- 本文件仅为 UI 需求证据；**未修改** `src/components/*` 产品代码。

---

*生成时间：2026-10-14（Asia/Tokyo）。执行方：Grok Bot executor（只读 UI 扫描 + 本证据文件）。*
