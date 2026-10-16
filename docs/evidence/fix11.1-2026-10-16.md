# fix11.1 — 2026-10-16（CODE_ONLY，等画布前端验收）

- Restore: `/workspace/canvas-restore/pre-fix11.1-20261016-194556.tgz`
- 重启一次：旧 PID 3382634 → 新 PID **3416167**，ticks **14666194**
  - lstart 本机(Asia/Tokyo)：2026-10-16 **19:50:38** JST
  - lstart 北京(Asia/Shanghai)：2026-10-16 **18:50:38** CST
  - cmdline/cwd/environ 与旧进程逐项一致（environ 排序比对 identical）；`:3000` → 200
- 未改供应商调用逻辑 / 发送内容；未碰 Together、TAMS。
- E2E：`/workspace/canvas-e2e-fix11.1/`（e2e.mjs、transcript.txt、截图见下）

| # | 改动 | 实测 |
|---|---|---|
|1| `PreviewPlaceholder`：底栏 chrome 真正挡住预览占位文案时，portal 浮层 `node-preview-placeholder-float`（z-50）抬到 dock 上方，文案可读 | 1600/1100/900 把预览拖到 dock 正下方：`floatReadable=true`，文案含「等待渲染动态视频…」；截图 `*-a-preview-under-dock.png` |
|2| `dockAvoidingStyle`：左侧不够宽时改停在顶栏下方左侧（不再贴在 dock 上方盖节点标签） | 900 宽：`execStyleTop≈175.5px`，`execCoversAspect=false`；Fit 后 `900-c-exec-vs-aspect.png` |
|3| 历史未发送折叠组：尺寸无值时写 `未发送（Schema 未记录）`，禁止「尺寸: 」空白 | 展开组 size 行全文「尺寸: 未发送（Schema 未记录）」；`1600-d-history-size.png`；q1cbe/403 仍在 |
|4| 验收辅助：现场 Chrome（:9232）画板把既有 CheckpointLoader 改成 HF `Tongyi-MAI/Z-Image-Turbo`（未点一键清空）；分辨率/时间偏移可见 | `hasResolution/hasShift=true`；`1600-c-hf-node.png`。自定义长 ID 仍换行不省略号 |

零宽扫描：三种宽度 body+input/textarea = 0。

测试：1446 条，1436 过，10 败（与 fix11 基线同一批既有失败；新增 `src/utils/fix11.1-2026-10-16.test.tsx` 3 条全过；更新 fix11 / fix10.1 dockAvoiding 断言）。

## 改动文件
- `src/components/PreviewPlaceholder.tsx`（新建）
- `src/components/NodeItem.tsx`
- `src/components/ExecutionLog.tsx`
- `src/components/HistoryModal.tsx`
- `src/utils/fix11.1-2026-10-16.test.tsx`（新建）
- `src/utils/fix11-2026-10-16.test.tsx`
- `src/integration/fix10_1ZeroWidth.test.tsx`

## 画板留置说明
- 现场 `http://127.0.0.1:3000/`：原 10 节点画板保留；底模节点 `node-public-zimg-1` → provider=huggingface、model=Tongyi-MAI/Z-Image-Turbo、hf_provider=z-image-space，可见「分辨率 (resolution)」「时间偏移 (shift)」。
- `http://localhost:3000/` 同源也已改。历史未清。
