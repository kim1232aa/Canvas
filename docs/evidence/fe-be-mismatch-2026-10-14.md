# 前后端对不上 / 错误接线清单（2026-10-14）

范围：`/workspace/canvas/Canvas-main`。只做盘点，未改代码。
方法：`rg` + 读 `server.ts`、`src/server/schemaProviders.ts`、`src/services/api.ts`、drivers、`ModelHubModal`、`ExecutionLog`、`BackendSettingsModal`、`App.tsx`。
本机 `http://127.0.0.1:3000` 进程仍在（node pid 1206568，未杀）。首次 curl 在 tsx watch 重启窗口里得到空响应；随后重试成功。响应里不含密钥明文。

## 已对齐（本轮有证据，不是缺口）

- 生成路由：drivers 调用的 `/api/{provider}/generate` 与 `/api/engine/{provider}/generate`、`/api/schema-provider/{muapi|wavespeed|sogni}/{submit,tasks/:id,save-result}`、`/api/video/generate`、history / media / cloud / civitai model-info 在 `server.ts` 或 `schemaProviders.ts` / `replicateRoutes.ts` 有对应注册。未见「前端路径后端不存在」的 404。
- `GET /api/models?provider=all&limit=3` → HTTP 200。`results` 含 `openai_compat`、`grok_compat`、`agnes`（空数组）以及 `catalogNotices` / `*Notice`。先前「provider=all 缺这三家」已不成立。
- NanoGPT **服务端**目录与余额走 `getProviderBaseUrl('nanogpt')`（`server.ts` ~2025、6194、6655）。无 Key 时 `POST /api/nanogpt/generate` 仍打到配置的 Base URL：实测 HTTP 404，body `Image model not found: x`（上游原文），不是本地假成功。
- LoRA 强度：Fal 生成路径要求 `path|url` + `scale|strength|modelStrength`，缺则 400，不填 0.8（`server.ts` 2846–2858；`FalDriver.ts` 103–109）。
- Tensor 生成：`ak_tensor` 不能当 TAMS 模型 Key（`server.ts` ~962、4909、4921）。`extractModelMetadata` 非 LoRA Tensor 标 OpenWorks Tool（`server.ts` 1296–1339）。
- 设置页 `popularModels: []`，文案指向模型中心（`BackendSettingsModal.tsx` ~762）。
- 执行记录按钮摘要已按**当前**最新 error 计算（`ExecutionLog.tsx` 45–57），不是旧的 21 行空壳。`docs/evidence/ui-improve-backlog-2026-10-14.md` 里「ExecutionLog 无摘要」已过时。

## 仍对不上 / 错误（按严重度）

### HIGH

1. **视频驱动不送魔搭国际站 token / site**
   - FE：`VideoDriver.ts` 142 只设 `x-modelscope-token`（来自 `keys.modelscopeToken`），没有 `x-modelscope-ai-token`，也没有 `x-modelscope-site`。
   - BE：`server.ts` 5484–5495 用 `x-modelscope-site`（或 URL 含 `modelscope_ai`）决定 CN/AI；AI 优先 `x-modelscope-ai-token`，否则回落到 `x-modelscope-token`。
   - 结果：国际站视频会用国内 token，或站点判断错。图生路径 `ModelScopeAiDriver.ts` 26–27 是分开送的，视频路径没跟上。

2. **目录 `provider=all` 把字符串 notice 混进 `results`，前端当成模型列表失败**
   - BE：`server.ts` 2660–2672 等同时写 `results.openai_compat = []` 和 `results.openai_compatNotice = '…字符串'`。实测 `results_keys` 含 `agnesNotice`、`grok_compatNotice`、`openai_compatNotice`、`modelslabNotice`、`runwareNotice`、`sensenovaNotice`。
   - FE：`ModelHubModal.tsx` 282–289 把 `results` 展开进 `sourceMap`，只跳过 `_pagination|pagination|catalogNotices|errors|results`。字符串不是数组、也没有 `.error`，被静默丢掉；若某次 notice 被放成对象，会被当成 provider error。
   - 人话 notice 只在顶层 `catalogNotices` / `*Notice` 时才显示（296–304）。`results` 里的副本是多余且形状不稳。

3. **Gemini 目录不读请求头里的 Key**
   - FE 目录请求 `fetchLiveModels`（`api.ts` 441–457）**不**附 `x-gemini-key`（同函数会附 fal/hf/muapi/…）。
   - BE 目录（`server.ts` 2212）只读 `process.env.GEMINI_API_KEY || cloudSettings.geminiKey || defaultKeys.geminiKey`，不读 `x-gemini-key`。
   - 实测本机 `results.gemini = {error: "Google Gemini 密钥未配置"}`，`errors.gemini` 同步。浏览器里填了 Key、但没进服务端 env/settings 时，生成（读 header）和目录（不读 header）会分裂。生成侧 `GeminiDriver.ts` 79 会送 `x-gemini-key`。

4. **魔搭 LoRA 契约比画布通用 LoRA 严，前端按通用形状发送**
   - FE：`graphEngine.ts` 1149–1156 送 `{name, path, downloadUrl, strength: modelStrength, …}`。`explicitLoraPath` 可以是 HTTPS 权重 URL。
   - BE：`src/schemas/modelScopeLoras.ts` 9–18 用 `path || name`，且必须是 `owner/model`，权重 0–1，**权重合计必须恰好 1.0**，否则抛错（「不会自动改变权重」）。
   - 用户在节点上设 0.75（WaveSpeed 已这样出图）再打到魔搭，会被拒；不是静默改权重，但是产品上「同一 LoRA 节点换供应商」对不上。

### MEDIUM

5. **双 LoRA 入口仍在，文案和实现不一致**
   - `App.tsx` 183–185 `handleOpenLoRAHub` → `setIsCivitaiOpen(true)`。
   - `ModernToolDock.tsx` 174–181 按钮文案「LoRA 模型中心 / 多供应商」，`onClick={onOpenCivitai}`；`App.tsx` 1949 接到 `setIsCivitaiOpen(true)` → `CivitaiModal`（`App.tsx` 2311）。
   - `ControlPanel.tsx` 88–95 明确是「Civitai LoRA 模型库」，同一回调。
   - 真正多供应商目录是 `ModelHubModal`（`isModelHubOpen`）。两套 modal 都挂载。

6. **模型中心打开时丢掉 openai_compat / grok_compat / agnes**
   - `ModelHubModal.tsx` 365：`initialProvider` 若是这三家，强制改成 `'civitai'`。
   - 标签页本身有这三家（554–557），但从图引擎当前供应商打开时会对不上。

7. **TAMS 目录说明前端不展示**
   - 实测 `pagination.tensorart.message = "TAMS 官方不提供模型列表 API…"`，`catalogAvailable: false`，`tensorart: []`。
   - 该字段不在 `catalogNotices`，也没有顶层 `tensorartNotice`。
   - `ModelHubModal` 只渲染 `catalogNotices[activeProvider]`（约 886）。空列表没有这句官方原因。`paging`/`message` 被忽略。

8. **NanoGPT Base URL：服务端已跟配置，前端设置页没有入口**
   - BE：`server.ts` 515、872 `nanogptBaseUrl` / `x-nanogpt-base-url`；缺省 `https://api.nano-gpt.com/api/v1`（872、5662）。目录实测 `sourceUrl: https://api.nano-gpt.com/api/v1`。
   - FE：`BackendSettingsModal.tsx` 292–301 NanoGPT 卡片没有 Base URL 输入；800–802 的 Base URL 表单不含 `nanogpt`。`LOCAL_SETTING_FIELDS`（40–65）也没有 `nanogptBaseUrl`。
   - `NanoGPTDriver.ts` 24–29 只送 `x-nanogpt-key`，不送 `x-nanogpt-base-url`。浏览器改不了 host；只有 env / 云端 settings.json 能改。和「自填 Base URL」的 openai/grok compat 不一致。
   - 设置卡片仍写死展示 `apiUrl: 'https://api.nano-gpt.com/api/v1/images'`（297），与真实路由（能力查询 + `/images`，且 host 可配置）不完全相同。

9. **OpenAI / Grok compat 的 Key 与 Base URL 不进目录请求头**
   - `fetchLiveModels`（`api.ts` 441–457）不附 `x-openai-compat-*` / `x-grok-compat-*`。
   - 目录对这两家本来就是空列表 + lookup-only（实测 sourceNotice `lookup-only (custom endpoint)`），所以不是「目录打错上游」，而是：用户只在浏览器填了 Base URL 时，目录无法展示「当前 host」，生成请求才带 header（`OpenAICompatDriver.ts` 40–41）。

10. **`/api/models` 与 `/api/model-schema` 双注册**
    - `schemaProviders.ts` 259、263 先注册，未知 provider `next()`。
    - `server.ts` 1350、1406 再注册全量目录。muapi/wavespeed/sogni 被前者截走（实测 `provider=wavespeed` 的 pagination.sourceNotice 是 `local-slice-of-live-upstream-catalog`，来自 schemaProviders 274–280，不是 server.ts 大目录）。
    - 行为目前靠顺序，不是单一契约。schema 路由对 fal 会 fall through 到 `server.ts` 1352（读 Fal OpenAPI），对 muapi 停在 schemaProviders。前端 `ApiParameterEditor.tsx` 与 `SchemaProviderDriver.ts` 都打同一个 URL，靠这个顺序才工作。

11. **执行记录按钮在「还有 pending」时仍优先显示旧错误**
    - `ExecutionLog.tsx` 45–47：`records.find(state==='error')` 在 pending 之前。记录是新的插前面（`executionTrace.ts` 40），所以最新失败会冒泡；但一次失败后，后续成功或进行中的请求不会把按钮从红/旧 HTTP 文案清掉，直到那条 error 被挤出 50 条窗口。
    - 这就是「badge stale」的残留，不是「完全没摘要」。

12. **Schema 未发送字段：检查器有标记，执行记录不一定展示 omissions**
    - `NodeItem.tsx` 900：`omitHint` → aria「不会发送※」。`ApiParameterEditor.tsx` 14：muapi/wavespeed/sogni 勾选「只提交 Schema 字段」。
    - `graphEngine.ts` 1145 把 omissions 放进 `extraParams` / progress，不是每个 driver 都放进 `ExecutionLog` 可见的 response。SenseNova/Agnes/HF driver 会带 `parameterOmissions`；Fal/NanoGPT/ModelScope 主要靠上游 4xx。`fieldStatus` 只在服务端视频契约（`agnesVideoRequest.ts`、`falVideoContract.ts`）里构造，前端组件没有渲染 `fieldStatus`。

13. **历史 LoRA 类型比真实载荷窄**
    - `server.ts` 457：`loras?: Array<{ name: string; strength: number; civitaiId?: string }>`。
    - 生成回写常常是 `{name: path, strength: scale}`（Fal 2915）或魔搭 `{name, strength}`（5640）。`path` / `scale` / `downloadUrl` 不在历史类型里。`HistoryModal` 能导出 `requestMetadata`（77），但列表类型本身丢了 URL。

14. **`src/services/api.ts` 遗留生成函数与现行 driver 并行**
    - `generateWithFal` 131、`generateWithModelScope` 187、`generateWithNanoGPT` 216、`generateVideo` 240、`generateWithTensorArt` 266 仍导出。
    - 仓库内除定义处外无其它引用（本轮 `rg`）。画布走 drivers。两套 body 形状（例如 api.ts 131 的 Fal `loras: {path, scale}` vs driver 的 strength→scale）容易以后接错。不是当前运行时 bug。

### LOW

15. **Replicate 目录 401 被正确暴露，但依赖服务端 token，不依赖本次是否在 header 里**
    - 实测 `errors.replicate`：`Unauthenticated` / HTTP 401。`fetchLiveModels` 会送 `x-replicate-key`（457）。BE 集合请求在 2566 附近可读该 header。本机 401 说明当前进程没用上有效 Replicate token（env 空或 key 无效）。这是配置事实，不是路径错误。前端把 `results[provider].error` 收进 `providerErrors`（288–289），这条是对齐的。

16. **Tensor.Art tools 用当前 Key 打到了 OpenWorks**
    - `POST /api/tensorart/tools` `{}` → HTTP 200，`message: success`，body 含工具名（如 `oc_character_illustration`）。与「OpenWorks ≠ TAMS 出图」一致：工具接口通，不证明模型出图。

17. **`POST /api/engine/openai_compat/generate` 无 Base URL → 400 本地错误**
    - 实测：`未配置 openai_compat Base URL… errorSource: local`。没有偷偷换官方 OpenAI。对齐。

18. **Schema provider 未知 task → 409**
    - `GET /api/schema-provider/wavespeed/tasks/dummy` → 409。不是 200 假完成。前端 `SchemaProviderDriver` 会把非 2xx 抛出（113）。对齐。

## 前端假设 vs 后端实际（汇总）

| 前端假设 | 后端实际 | 结论 |
|---|---|---|
| 目录 Key 头集合覆盖所有已配置供应商 | Gemini / openai_compat / grok_compat 目录不看这些头 | 见 HIGH-3、MEDIUM-9 |
| `results[provider]` 只有数组或 `{error}` | `results.*Notice` 是字符串 | HIGH-2 |
| 视频与图像同一套魔搭 token | 视频 driver 缺 AI token 与 site | HIGH-1 |
| LoRA 节点的 URL + 任意强度可换供应商 | 魔搭要 repo id 且权重合计 = 1 | HIGH-4 |
| 模型中心能接着当前 compat/agnes 供应商打开 | 365 行改回 civitai | MEDIUM-6 |
| TAMS 空目录会解释原因 | message 在 pagination，UI 不读 | MEDIUM-7 |
| 设置里改 NanoGPT host | UI 无字段；driver 不送 base-url header；服务端才有默认官方域 | MEDIUM-8 |
| 执行记录徽章=最近一次请求 | 有 error 就一直显示该 error，即使后面有 pending/成功 | MEDIUM-11 |

## 本轮 curl（无密钥）

| 请求 | 结果 |
|---|---|
| `GET /api/models?provider=all&limit=3` | 200，约 199KB；含 openai_compat/grok_compat/agnes 空列表 + notices |
| `GET /api/models?provider=nanogpt&limit=5` | 200，`list[5]`，pagination.total 430，sourceUrl `https://api.nano-gpt.com/api/v1` |
| `GET /api/models?provider=wavespeed&limit=2` | 200，schemaProviders 分页形状，total 276 |
| `POST /api/nanogpt/generate` `{model:x,prompt:t}` | 404 上游 `image_model_not_found`（进程里已有 NanoGPT 配置，故不是 400 缺 Key） |
| `POST /api/engine/openai_compat/generate` | 400 local，缺 Base URL |
| `POST /api/tensorart/tools` `{}` | 200 OpenWorks 工具列表 |
| `POST /api/gemini/chat` `{}` | 400 local，缺 model |
| `GET /api/schema-provider/wavespeed/tasks/dummy` | 409 |
| `GET /api/civitai/model/1` | 200 |

## 未做

- 没有改代码。
- 没有逐家再打真实出图（与本次「对不上」无关；出图证据在 `e2e-frontend-2026-10-14.md`）。
- 没有对照各供应商官方文档重核魔搭「权重合计必须为 1」——该约束来自仓库内 `modelScopeLoras.ts` 注释「Verified against the ModelScope Z-Image-Turbo API-Inference example in this run」，不是本轮新检索。
