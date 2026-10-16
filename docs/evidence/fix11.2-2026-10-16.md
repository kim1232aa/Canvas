# fix11.2 — 2026-10-16（CODE_ONLY，等画布前端验收）

- Restore: `/workspace/canvas-restore/pre-fix11.2-20261016-201736.tgz`
- 重启一次：旧 PID 3416167 → 新 PID **3447072**，ticks **14848805**
  - lstart 本机(Asia/Tokyo)：2026-10-16 **20:21:05** JST
  - lstart 北京(Asia/Shanghai)：2026-10-16 **19:21:05** CST
  - cmdline/cwd/environ 与旧进程逐项一致（environ 排序比对 identical）；`:3000` → 200
- 未改供应商调用逻辑 / 发送内容；未碰 Together、TAMS；**未改** 900 执行记录停靠（仍按 fix11.1）。
- E2E：`/workspace/canvas-e2e-fix11.2/`（e2e.mjs、transcript.txt、截图见下）

| # | 改动 | 实测 |
|---|---|---|
|1| `PreviewPlaceholder`：紧凑浮层（不再按预览全高）；可见条够高→钉在预览顶部；不够→停在预览**侧面**且底边 ≤ dock 顶；树内文案 float 时 `opacity:0` | 1600/1100/900：`floatReadable=true`，`floatAboveDock=true`，`phOpacity=0`，`zw=0`；截图 `*-a-preview-under-dock.png` |
|2| 浮层 `zIndex=42`（&lt; HistoryModal `z-50`）；历史打开时 `isCanvasModalOpen` → 不渲染浮层 | `history-vs-float`：`floatPresent=false`，`modalPresent=true`，`modalZ=50`；`1600-c-history-over-float.png` |
|3| 侧面放置避免压「画面比例」 | 三宽 `floatCoversAspect=false`（1600：float x=645 在 preview 右侧，aspect x=448–594） |
|辅| `measureChromeInsets`：只计落在底带的 bottom chrome（忽略顶栏附近的 exec 标签），避免 Fit 底 inset 虚高 | 单测：顶停 exec + 底 dock → `bottom&lt;200` |

零宽扫描：三种宽度 body+input/textarea = 0。

测试：1453 条，1443 过，10 败（与 fix11.1 基线同一批既有失败；新增 `src/utils/fix11.2-2026-10-16.test.tsx` 7 条全过）。

## 改动文件
- `src/components/PreviewPlaceholder.tsx`
- `src/utils/fitView.ts`
- `src/utils/fix11.2-2026-10-16.test.tsx`（新建）
- `docs/evidence/fix11.2-2026-10-16.md`

## 画板留置说明
- E2E 写入 `b-fix11.2`：`n-hf` = Hugging Face `Tongyi-MAI/Z-Image-Turbo`（分辨率/时间偏移可见）+ `n-vid` AI 视频；未点一键清空、未清历史。
