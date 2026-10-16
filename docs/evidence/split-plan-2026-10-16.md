# 大文件切分计划（只计划，不改代码）— 2026-10-16

> **原则**：小步、可逆、一批一主题；**禁止借切分改行为**；**禁止静默换 provider**。  
> 动手前须画布确认。验收：现有 vitest 仍绿 + 冒烟 `GET :3000` 200。  
> 未 commit / push；未改业务代码。

## 1. 体量快照（2026-10-16 实测）

| 文件 | 行数 | 体积（约） | 备注 |
| --- | --- | --- | --- |
| `server.ts` | **6916** | 324K | 路由巨型单体；已有部分抽出 `src/server/routes/*` |
| `src/constants/presets.ts` | **4090** | 176K | `HISTORICAL_WORKFLOW_PRESETS` → `correctPreset` 导出 |
| `src/App.tsx` | **3056** | 145K | 默认导出单组件，handlers 极多 |
| `src/components/BackendSettingsModal.tsx` | 1541 | — | 超大依赖，非本批必拆 |
| `src/components/WorkflowPresetsModal.tsx` | 1539 | — | 与 presets 耦合 |
| `src/utils/graphEngine.ts` | 1472 | — | 执行图核心 |
| `src/components/ModelHubModal.tsx` | 1461 | — | Hub UI |
| `src/server/schemaProviders.ts` | 1290 | — | Schema 家聚合 |
| `src/constants/nodes.ts` | 1117 | — | 含 AIVideoNode 定义 |

已有切分先例（可仿）：

- `src/server/routes/civitaiWorkflowRoute.ts`（~1011）
- `src/server/routes/civitaiModelRoutes.ts`
- `src/server/routes/replicateRoutes.ts`
- `src/server/routes/sensenovaRoutes.ts`
- 契约模块：`falVideoContract.ts`、`agnesVideoRequest.ts` 等已在 `src/server/`

## 2. `server.ts` 切分提案

### 2.1 推荐第一刀（待确认）

| 项 | 内容 |
| --- | --- |
| **拟路径** | `src/server/routes/videoGenerateRoute.ts`（+ 既有 `*.test.ts` 可迁/可留契约测） |
| **迁出符号概览** | `app.post(['/api/video/generate','/api/engine/video/generate'], …)` 整段（约 `server.ts:3106–3676`，~570 行）；依赖注入：`upstreamFetch`、`resolveProviderAuth`/`getProviderBaseUrl`、`buildFalVideoRequest`、`buildAgnesVideoRequest`、`requireDurableHistoryMediaUrl`、`rejectUnsupported`、`keyPoolManager`、`tamsVideoUnsupported`、`normalizeFalEndpoint` 等 **仅传参/import，不改逻辑** |
| **风险** | 中：闭包依赖多；漏传 helper 会编译失败（好事）。行为字节级应不变。 |
| **为何第一刀** | 边界清晰（视频专题）；与今日视频审计同主题；契约测已独立（`falVideoContract`/`agnesVideo*`）；不影响图像主路径；可逆（整段移回即可）。 |
| **验收** | `vitest` 定向：`falVideo*`、`agnesVideo*`、`VideoDriver*`、`videoProvider*`；手动：进程起、`curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/` → 200；可选对本地 400 分支（空 provider / modelscope）打一枪，对比切分前后 JSON。 |

### 2.2 后续刀（按优先级，每批一主题）

| 次序 | 拟路径 | 迁出概览 | 风险 |
| --- | --- | --- | --- |
| 2 | `src/server/routes/historyRoutes.ts` | `/api/history` CRUD + 与 `recordHistoryItem` 紧邻段 | 中（持久化副作用） |
| 3 | `src/server/routes/falGenerateRoute.ts` | `/api/fal/generate` 等图像 Fal 段 | 中高（调用面大） |
| 4 | `src/server/routes/mediaRoutes.ts` | `/api/media` GET/POST | 低 |
| 5 | `src/server/routes/modelsCatalogRoute.ts` | 巨型 `GET /api/models` 旧聚合 | **高**（与 schemaProviders `next()` 交接，易改行为）→ 须单独设计、禁止夹带 |
| 6 | Key 池 / `test-provider` / cloud-keys | admin 段 | 中（鉴权） |
| 7 | 各 engine generate（HF/Nano/Gemini/…） | 按 provider 一文件 | 中，可仿 sensenova/replicate |

**禁止**：切分时「顺手」改 VIDEO_PROVIDERS、换端点、加 fallback、动 Together/TAMS。

## 3. `App.tsx` 切分提案

| 块 | 拟路径 | 迁出符号概览 | 风险 | 验收 |
| --- | --- | --- | --- | --- |
| A. 空间帧执行 | `src/app/spatialFrameActions.ts` 或 `hooks/useSpatialFrames.ts` | `handleAddSpatialFrame` / `handleUpdateFrame*` / `handleQueueFrame` / branch variation（约 413–670） | 中（闭包 state） | 现有 `SpatialFrameItem*` 测 + 冒烟 |
| B. 工作流执行 | `src/app/queuePrompt.ts` | `handleQueuePrompt`（约 1052–1310） | **高**（核心执行） | `graphEngine*` 测全绿；勿改 dispatch |
| C. Hub/LoRA 选择 | `src/app/modelHubActions.ts` | `handleSelectModelFromHub`、LoRA 系列 handlers | 中 | ModelHub/Civitai 相关测 |
| D. 画布工程 CRUD | `src/app/canvasProjectActions.ts` | save/clone/delete/rename/preset load | 中 | 手动冒烟 |
| E. 历史删除批处理 | `src/app/historyActions.ts` | `handleDeleteHistory*` / clear | 低 | HistoryModal 测 |

**推荐 App 第一刀**：先 **A 空间帧** 或 **E 历史**（较小、可测），**不要**第一刀拆 `handleQueuePrompt`。

原则：优先「纯函数 + 显式依赖注入」（传入 setState/refs），避免新 Context 大爆炸；禁止切分时改 provider 解析。

## 4. `presets.ts` 切分提案

| 块 | 拟路径 | 内容 | 风险 |
| --- | --- | --- | --- |
| 1 | `src/constants/presets/historical/*.ts`（按主题分文件） | 将 `HISTORICAL_WORKFLOW_PRESETS` 数组拆成多模块再 `export const HISTORICAL_WORKFLOW_PRESETS = […]` 聚合 | 低（数据搬迁） |
| 2 | 保持 `presetResources.ts` | `correctPreset` / `correctVideoPreset` 已分离 —— **不要**合并回去 | — |
| 3 | `src/constants/presets/index.ts` | `export { WORKFLOW_PRESETS } from …` 兼容旧 import | 低 |

**推荐 presets 第一刀**：按「图像模板 / 视频历史意图 / 供应商演示」拆 2–3 个数据文件 + 单 index 聚合；**零逻辑改动**；跑 `presets.test.ts`、`WorkflowPresetsModal.test.ts`。

注意：多项 video 预设已被 `correctVideoPreset` 置 `execution_blocked_reason` —— 切分不得「修复」为可执行（那是行为变更）。

## 5. 批次节奏建议

| 批次 | 主题 | 产出 |
| --- | --- | --- |
| Batch-S1 | server 视频路由抽出 | 仅移动 + import 接线；证据：测绿 + :3000 |
| Batch-S2 | presets 数据文件拆分 | 仅搬迁数组 |
| Batch-S3 | App 历史或空间帧 hooks | 行为对比清单 |
| … | 再碰 Fal 图像 / models 聚合 | 单独 RFC |

每批：改前 `tar`/`git stash` 级可逆备份（本地）；画布确认后再重启一次报 PID。

## 6. 非目标（本计划明确不做）

- 不借切分改 API 字段、错误文案业务语义、provider 列表  
- 不合并/删除 historical 预设意图  
- 不动 Together / TAMS / `officialUnavailableParams`  
- 不远程发布、不 commit/push（除非用户另令）

## 7. 推荐第一刀（结论）

**文件**：`server.ts`  
**模块**：`POST /api/video/generate` → `src/server/routes/videoGenerateRoute.ts`  
**为何**：边界最干净、与视频审计同主题、已有契约单测可护航、不触及图像主链与禁改供应商。
