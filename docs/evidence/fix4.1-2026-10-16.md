# fix4.1 · 2026-10-16 · 状态：CODE_ONLY（未做前端 E2E，不是 PASS）

- 恢复包：`/workspace/canvas-restore/pre-fix4.1-20261016-155911.tgz`（不含 node_modules / dist）
- 未 commit / push。
- 全量 vitest：**1405 条，1403 过，2 条失败**（已知 `src/server/mediaHostedReview.test.ts`，缺 hosting/server.generated）。`vite build` 通过。
- 新增测试：`src/utils/fix4.1-2026-10-16.test.tsx`；同步更新 `clean1613` toast 位断言。
- **未改** Together / `officialUnavailableParams` / `loraItemFields` / actualRequest 历史数据。

## 改动

| # | 文件 | 内容 |
|---|------|------|
| 1 | `src/App.tsx` | toast 从 `bottom-6` 抬到 `bottom-24`，避开底栏 `ModernToolDock`（同为 `bottom-6`，含「LoRA 模型中心」与「100%」） |
| 2 | `src/components/HistoryModal.tsx` | 段头 `history-upstream-seg-status` 去掉 `whitespace-nowrap`，改为 `whitespace-normal break-words [overflow-wrap:anywhere]`，窄卡可扫全 `insufficient_credit`；失败卡头 HTTP 状态芯片同样允许换行（通用） |

## 重启（只一次）

- 旧 PID `3138956` → 新 PID **`3178108`**
- ticks（`/proc/<pid>/stat` 第22）：**`13660562`**
- lstart：`Fri Oct 16 16:01:14 2026`（Asia/Shanghai）
- cmdline / cwd / environ：沿用旧进程（tsx `server.ts`，cwd `/workspace/canvas/Canvas-main`）；未用 `start-canvas.sh`
- `:3000` → **200**
- 日志：`/tmp/canvas-dev-fix4.1.log`

## 验收对照（待画布重拍）

- 展开/收起 toast 均不压住底栏「LoRA 模型中心」与「100%」（参考原问题图 `/workspace/canvas-e2e-fix4-accept-1524/toast-bottom-toolbar.png`）
- 历史卡段头徽章窄卡可见完整 `insufficient_credit`（参考 `sg-03-segment-headers.png`）
