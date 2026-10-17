# server.ts / 大文件拆分方案（2026-10-15）

> **状态**：文档-only。本轮**未改任何生产代码**。  
> **约束**：图片供应商队列（Together 接线）并行进行中 —— **禁止**在 Together 落地前改 `server.ts`、`src/server/schemaProviders.ts`、以及 Together 可能碰的 settings/schema 文件。  
> **产品裁定（画布）**：先按路由/供应商拆 `server.ts`（每块带测试），再拆 `App.tsx`；**禁止一刀切大重构**。

测量基准：`wc -c` / `wc -l`，路径相对仓库根 `/workspace/canvas/Canvas-main`，日期 2026-10-15（Asia/Shanghai）。

---

## 1. 尺寸实测（核对画布口头数字）

画布口述：`server.ts` ~338KB、`presets.ts` ~176KB、`App.tsx` ~116KB。

| 实测 | bytes | KB | lines | 路径 |
|------|------:|---:|------:|------|
| ✅ 对齐 | 346342 | **338.2** | 7416 | `server.ts`（仓库根，非 `src/`） |
| ✅ 对齐 | 180110 | **175.9** | 4090 | `src/constants/presets.ts` |
| ✅ 对齐 | 118526 | **115.7** | 2686 | `src/App.tsx` |

### Top 5（按字节）

| # | KB | lines | 路径 |
|--:|---:|------:|------|
| 1 | 338.2 | 7416 | `server.ts` |
| 2 | 175.9 | 4090 | `src/constants/presets.ts` |
| 3 | 115.7 | 2686 | `src/App.tsx` |
| 4 | 81.7 | 1540 | `src/components/WorkflowPresetsModal.tsx` |
| 5 | 77.2 | 1438 | `src/components/ModelHubModal.tsx` |

### Hub / Node / Settings 等大组件（补充）

| KB | lines | 路径 |
|---:|------:|------|
| 75.9 | 1262 | `src/components/NodeItem.tsx` |
| 71.7 | 1489 | `src/components/BackendSettingsModal.tsx` |
| 62.6 | 1032 | `src/components/ParameterInspector.tsx` |
| 58.6 | 1258 | `src/components/AssetManagerModal.tsx` |
| 55.5 | 1283 | `src/utils/graphEngine.ts` |
| 52.6 | 902 | `src/schemas/providerSchema.ts` |
| 51.3 | 1065 | `src/components/CivitaiModal.tsx` |
| 34.8 | 476 | `src/server/schemaProviders.ts` |

说明：`schemaProviders.ts` 虽「不大」，但是 Schema 供应商（含 Krea，以及排队中的 Together 类）的热文件，**拆分窗口内视为冻结**。

---

## 2. 已有拆分先例（必须沿用）

`CLAUDE.md` 与代码已证明模式：

| 模块 | 路径 | 挂载方式 |
|------|------|----------|
| Civitai 目录/详情 | `src/server/routes/civitaiModelRoutes.ts` | `handleX(deps)` 工厂，在 `server.ts` ~1063–1067 一行挂载 |
| Civitai 工作流提取 | `src/server/routes/civitaiWorkflowRoute.ts` | 同上 ~1072 |
| Replicate 生成 | `src/server/routes/replicateRoutes.ts`（+ `replicateImageContract.ts`） | `registerReplicateRoutes(app, deps)` ~4588–4594 |

**标准模板（后续每片照抄）**：

1. 纯请求/响应映射 → `src/server/<provider>ImageContract.ts`（已有则不动）  
2. Express 路由 → `src/server/routes/<provider>Routes.ts`，导出 `registerXRoutes(app, deps)` 或 `handleX(deps)`  
3. `deps` 注入：`resolveProviderAuth` / `upstreamFetch` / `keyPoolManager` / `respondWithGeneratedImages` / `recordHistoryItem` 等，**不**在子模块里新建 KeyPool  
4. Vitest：契约单测 + 路由注册冒烟（见 `replicateRoutes.test.ts`）  
5. `server.ts` 只留 `import` + `register…(app, {…})` 几行  

---

## 3. `server.ts` 自然切割边界（约行号）

总行数 **7416**。下列区间来自文件内 `// =====` 区块标题 + `app.(get|post)` 锚点（`rg` 实测；Together 落地后行号可能漂移 ±几十行，以标题字符串为准）。

| 行约 | 行数 | 区块 | 拆出优先级 |
|------|-----:|------|------------|
| 1–68 | 68 | imports + dotenv/undici/bootstrap | 保留在入口 |
| 69–153 | 85 | upstream 日志 + `upstreamFetch` / `upstreamSdkCall` | Slice 0 候选（纯 helper） |
| 154–578 | 425 | 中间件、CSRF/Host、media store 路由 | 中后期 `middleware.ts` / `mediaRoutes.ts` |
| 579–819 | 241 | `KeyPoolManager` | 单独 `keyPool.ts`（高耦合，靠后） |
| 820–1056 | 237 | history 写入、`resolveProviderAuth`、metadata | 共享 deps，暂留入口或 `serverDeps.ts` |
| 1057–1402 | 346 | Civitai proxies（**已部分模块化**）+ ModelScope 封面 helper | 收尾：把剩余 inline 迁完 |
| 1403–2827 | **1425** | `registerSchemaProviderRoutes` + **`GET /api/models` 大聚合** + Fal 只读 helper | **最大块**；与 Together/Krea 目录冲突 → **冻结至供应商队列稳定** |
| 2828–3014 | 187 | Fal 图像生成 | 中优先级 `falRoutes.ts` |
| 3015–3746 | **732** | **`/api/video/generate`（视频）** | 见 §7；本计划不实施视频贯通 |
| 3747–4102 | 356 | Civitai 原生生成 + workflow GET | 可并入 `civitaiGenerateRoutes.ts` |
| 4103–4225 | 123 | Agnes generate/chat | 有 `agnesVideo*` 契约，可抽 |
| **4226–4326** | **101** | **SenseNova** | **✅ 推荐 Together 后第一刀** |
| **4327–4416** | **90** | **Runware** | ✅ 第二刀（已有 `runwareServerRoute.test.ts` 雏形） |
| 4417–4584 | 168 | ModelsLab | 第三刀（已有 contract） |
| 4585–4596 | 12 | Replicate `register…`（已完成） | 无需再动 |
| 4597–4685 | 89 | openai_compat | 可抽；测试用 `generatedImageRoutes.test.ts` 字符串切片，需同步改测 |
| 4686–4800 | ~115 | grok_compat generate/chat | 同上 |
| 4801–5250 | ~450 | Tensor.Art OpenWorks + TAMS 生成/上传 | 与密钥/凭证文件耦合；TAMS 未通前慎动 |
| 5251–5725 | 475 | HuggingFace | 中优先级；含 KeyPool billing 旋转 |
| 5726–5914 | 189 | ModelScope | 近改过 exec-copy；稳定后再抽 |
| 5915–5970 | 56 | NanoGPT | 小，好抽 |
| 5971–6345 | 375 | Gemini chat/generate/refine | 中后期 |
| 6346–6969 | 624 | `/api/test-provider`、cloud-keys stats/balances | 与 settings 热改冲突时延后 |
| 6970–7151 | 182 | History CRUD | `historyRoutes.ts` |
| 7152–7255 | 104 | Cloud projects | `projectRoutes.ts` |
| 7256–7374 | 119 | Cloud settings（密钥字段白名单） | 与新供应商 Key 项冲突 → 队列稳定后再动 |
| 7375–7416 | 42 | health + `startServer` | 保留入口 |

---

## 4. 分阶段切片（每片可独立验收 / 回滚）

原则：每片 **≤ ~200 行净迁出**（契约已外置的供应商可更小）；**一片一 PR/一提交意图**；迁出后 `server.ts` 只减不增业务；失败立即 restore tar。

### Slice 0 — 纯 helper（零业务路由）

| 项 | 内容 |
|----|------|
| **名称** | `extract-upstream-helpers` |
| **迁出** | `maskSecret`、`sanitizeUpstreamUrl`、`logUpstream`、`isProvided`、`rejectUnsupported`（及仅被它们使用的类型）→ 建议 `src/server/upstreamLog.ts` + `src/server/requestGuards.ts` |
| **入口改动** | `server.ts` 顶部改 import；**不**改任何 `app.post` |
| **风险** | 低。`hosting/build.mjs` 对 `logUpstream` 有字符串 `removeRange` —— **必须同步改 adapter 锚点或保持函数名/邻近注释不变** |
| **测试** | 新建小 vitest（纯函数）；跑既有 `src/server/*.test.ts` 全绿 |
| **冒烟** | `node`/`tsx` 起服 + `GET /api/cloud/health` |
| **回滚** | 恢复 tar：`/workspace/canvas/temp/backups/canvas-restore/Canvas-main-pre-<slice0>-*.tar.gz`（实施前现打） |
| **与 Together** | 若 Together 只动 schema/settings，本片仍可能碰 `server.ts` 顶部 → **建议等 Together merge 后再做**，或确认无并行写 `server.ts` |

### Slice 1 — 单供应商路由（推荐第一刀）

| 项 | 内容 |
|----|------|
| **名称** | `extract-sensenova-routes`（备选：`extract-runware-routes`） |
| **迁出** | SenseNova：`~4226–4326` → `src/server/routes/senseNovaRoutes.ts`；复用已有 `senseNovaImageContract.ts` |
| **入口** | `server.ts` 删除该段，改为 `registerSenseNovaRoutes(app, deps)`（镜像 Replicate） |
| **风险** | 低–中。deps 列全；勿静默改错误文案/状态码（铁律） |
| **测试** | 扩 `senseNovaImageContract.test.ts`；新增 `senseNovaRoutes.test.ts`（注册路径 + 400 无 key）；全量 vitest 相关 |
| **冒烟** | 设置页测连 / 或已有 SenseNova E2E 证据路径复跑（有额度才追 PASS_GENERATION） |
| **回滚** | 实施前 tar；git 未用则整目录还原该两文件 |
| **为何不是 Fal/HF/ModelScope** | 那些更大或刚改过；SenseNova/Runware 已有 contract、块小、且**不在** Together/Krea schema 热路径 |

**备选 Slice 1b**：`extract-runware-routes`（`~4327–4416`）—— 已有 `runwareServerRoute.test.ts`，同样安全。

### Slice 2–N — 按同样模板继续

建议顺序（图片队列稳定后）：

1. Runware（若 Slice 1 选了 SenseNova）  
2. ModelsLab  
3. NanoGPT（小）  
4. openai_compat / grok_compat（同步改 `generatedImageRoutes.test.ts`：停止从 `server.ts` 字符串切片，改为 import 新模块）  
5. Agnes  
6. Fal 图像  
7. Civitai generate 收尾  
8. History / Projects / Settings（settings 最后，避 Key 字段战）  
9. **`GET /api/models` 大聚合**（最后：与 `schemaProviders`、provider=`all` 强耦合）  
10. KeyPoolManager（需全路由回归）

每片验收：**单测绿 + 该供应商一次真实或 PASS_BILLING 前端路径不倒退**（铁律：单测 ≠ 验收）。

### 后期 — `App.tsx`（本计划只定方向，不排实施周）

| 项 | 内容 |
|----|------|
| **现状** | 单 `export default function App()`（~86 起），~2686 行；状态机 + 模态开关 + 执行编排堆在一处 |
| **建议切法** | 先抽 hooks：`useCanvasHistory`、`useModalStack`、`useExecutionSession`；再把 JSX 大面板（Settings/Hub/History）保持子组件、只减 App 内联 handler |
| **禁止** | 一次「App 重写成多文件框架」；禁止顺手改 graphEngine 行为 |
| **时机** | `server.ts` 降到 ~3–4k 行、供应商队列过完后再开 |

### `presets.ts`（176KB）

历史工作流数组 + `correctPreset`。与服务器路由无关。单独议题：按「已校验公开模板 / 历史声明」拆文件或懒加载；**不**插入 server 切片队列。

---

## 5. 与 Together / Krea 的合并风险

| 热文件（本机 mtime 2026-10-15 ~01:39–01:40） | 风险 | 本计划态度 |
|-----------------------------------------------|------|------------|
| `server.ts` | Together 可能加 Key 映射、`/api/models` 分支、test-provider URL | **冻结改路由**；仅文档 |
| `src/server/schemaProviders.ts` | Krea 已写入；Together 极可能同类 | **禁止本计划触碰** |
| `src/components/BackendSettingsModal.tsx` | 新 Key 表单项 | 不拆 |
| `src/schemas/providerSchema.ts` | 参数枚举 | 不拆 |
| `hosting/build.mjs` | 对 `server.ts` **全文字符串替换**；搬迁 `logUpstream`/中间件锚点会直接炸掉云适配构建 | 任一 Slice 0+ 必须跑一遍 build 或至少 `node hosting/build.mjs` 干跑 |
| `src/server/generatedImageRoutes.test.ts` | `readFileSync('../../server.ts')` + `indexOf("app.post([...")` 切片 | 抽 openai/grok/nanogpt 前必须改测，否则假绿/假红 |

**结论**：Together 服务端证据落地、画布前端 E2E 定案之前，**零生产代码改动**。第一刀代码名：见文末「推荐第一刀」。

---

## 6. 回滚惯例（每片通用）

实施任一 Slice 前：

```bash
tar czf /workspace/canvas/temp/backups/canvas-restore/Canvas-main-pre-<slice-name>-$(date +%Y%m%d-%H%M%S).tar.gz \
  -C /workspace/canvas Canvas-main \
  --exclude=Canvas-main/node_modules --exclude=Canvas-main/dist
```

回滚：解压覆盖对应文件（或整树）。参考已有包：`/workspace/canvas/temp/backups/canvas-restore/Canvas-main-pre-exec-success-plain-20261015-014200.tar.gz` 等。

**禁止** commit/push（用户铁律）。

---

## 7. 视频缺口（本计划范围外）

产品已确认：目前基本只通图片；`server.ts` ~3015–3746 的 `/api/video/generate` 是集中视频入口，另有 Agnes/Fal 视频契约散落。

- **目录挂了 ≠ 能出片**（铁律）。  
- 视频贯通依赖 Researchy 落盘的官方能力表：`docs/provider-api-audit/`（本测量时目录尚空/未就绪）。  
- tinkabot 视频 Schema 草案 → 再交给 canvas-dev 做真出片 E2E。  
- **本拆分方案不实施视频功能**；最多在后续把现有 video 路由整块迁到 `src/server/routes/videoRoutes.ts`（行为不变的搬迁），仍须等审计表到齐后再说「贯通」。

---

## 8. 成功标准（拆分本身）

- `server.ts` 行数台阶式下降（目标第一阶段 &lt; 5k，不设假 deadline）。  
- 每片：有 vitest；无静默换 provider/端点；`hosting/build.mjs` 不因锚点失效而红。  
- 不与 Together/Krea 并行写同一热文件。  
- 画布挑刺 / 前端 E2E 不因搬迁出现新的空白错误态（行为字节级保持）。

---

## 9. 本轮交付清单

| 项 | 结果 |
|----|------|
| 计划文档 | **本文件** |
| 生产代码 | **未修改** |
| 推荐 Together 落地后第一刀（仅名称） | **`extract-sensenova-routes`** |
| 备选 | `extract-runware-routes` |
