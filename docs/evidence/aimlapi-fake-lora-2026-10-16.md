# AIMLAPI 假「出图完成」+ LoRA 可见 — 2026-10-16 — CODE_ONLY

对应失败：`/workspace/canvas-e2e-aimlapi-reverify/outcome.json` = `FAIL_LORA_NOT_IN_ACTUAL_REQUEST`。
还原包：`/workspace/canvas-restore/pre-aimlapi-fake-lora-20261016-003855.tgz`。
未 commit / push；未开浏览器；未发群。

## 根因（人话）

1. **执行记录看不到生成 POST / actualRequest.loras**  
   - 目录 GET 假「上游出图完成」此前已修（`plainSuccessConclusion` 无图不写出图；catalog/Schema 归「非生成」）。reverify 这点已 PASS。  
   - 仍缺：失败响应很大（stack + executionTrace + historyItem），写入 `sessionStorage` 时旧 `clip()` 整段切成 `{storedTruncated, head}`，**丢掉 `actualRequest`**。硬刷新后「刷新前的记录」里即使有 POST，也展不开 loras。  
   - 刷新前的生成失败默认折叠，容易只看见刷新后的 `GET /api/models`。

2. **历史失败卡「实际发送」没有 LoRA 行**  
   - `buildFailedAttemptHistoryItem` 把 `loras: []` 写死；`sentHistoryLoras` 虽能从 `actualRequest.parameters.loras` 回填，但「实际发送」折叠区只渲染 JSON，**没有显式 LoRA 芯片**。reverify 看到的参数区有模型/步数/CFG，却没有 LoRA 行。

## 修复

| 文件 | 改动 |
|---|---|
| `src/services/executionTrace.ts` | `clipForSessionStorage`：超长响应优先保留 `actualRequest` / `endpoint` / `error*` / `blockedField` 等；不再盲切 head。 |
| `src/server/failedAttemptHistory.ts` | 优先用路由 `fail()` 附带的 `actualRequest`；`lorasFromActualRequest` 填顶层 `loras`（path→name，scale→strength）。 |
| `src/components/HistoryModal.tsx` | 失败卡「实际发送」默认展开，标题带 `LoRA×N`，区内显式紫色 LoRA 芯片（`data-testid=history-failed-actual-loras`）。 |
| `src/components/ExecutionLog.tsx` | 「刷新前的记录」若含生成失败则默认展开，摘要写明条数。 |

未扩 Venice / 原生 Krea；未改 Schema 硬规本身。

## 本地 live（:3000，服务端 .env key，未打印）

重启后 POST `/api/schema-provider/aimlapi/submit`（AIMLAPI + `alibaba/z-image-turbo-lora` + LoRA `ostris/z_image_turbo_childrens_drawings` @0.85，steps 8）：

- HTTP **403** upstream，原文欠费（PASS_BILLING 级）
- `actualRequest.parameters.loras = [{path, scale:0.85}]`
- `historyItem.loras = [{name, strength:0.85}]`（顶层已填，不再是 `[]`）
- 响应中无「出图完成 / 上游出图完成」

证据：`docs/evidence/aimlapi-fake-lora-live-403.json`、`aimlapi-fake-lora-live-403-summary.json`。

## 测试

- `vitest run`：`executionTrace` / `failedAttemptHistory` / `historyParameters` / `ExecutionLog.summary` / `aimlapiLoraP0` / `aimlapiKreaReverify2` → 全部通过（含 clip 保 actualRequest、顶层 loras、路由 actualRequest 优先）。

## 服务

- 进程 **2084318**（`tsx` → `server.ts`）
- 启动（北京时间）：**2026-10-16 00:40:35**
- `http://127.0.0.1:3000/` → 200
- 日志：`/tmp/canvas-dev-aimlapi-fake-lora.log`

## 画布怎么验（硬刷新后跑一轮欠费 403 即可）

1. **假出图**：执行记录不得出现「出图完成 / 上游出图完成」；目录/Schema 只能在「非生成」组。  
2. **生成失败条目**：须有本次 `POST …/aimlapi/submit`（或失败行），展开「实际上游请求 actualRequest」可见 `loras[{path,scale:0.85}]`。若先刷新再看，打开「刷新前的记录」（有生成失败时会默认展开），loras 仍在。  
3. **历史失败卡**：打开「实际发送」，须有 **LoRA: ostris/… (0.85)** 芯片（不是空的 `item.loras`）。

## 产品待决

- 失败历史顶层 `loras` 与 `sentHistoryLoras` 双源并存；成功路径仍靠 save-result 的 metadata.loras。是否统一只信 actualRequest，可后议。  
- sessionStorage clip 对超大 `rawResponse` 仍可能截断正文；欠费原文以节点红框 / 历史「上游原文」为准。
