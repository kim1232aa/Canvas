# fix15.1 — 历史卡「实际发送」字段不再落进「未发送」区（2026-10-16）

## 根因
数据分类本身正确（UnrecordedFold 只列 steps/cfg/sampler/scheduler/size/negativePrompt 中 source=schema-unrecorded 的项）。
但 `otherSentParameters`（duration / start_image_url 等蓝标「实际发送」）块渲染在 `<UnrecordedFold>` / `<UnsupportedFold>` **之后**、无标题，
视觉上紧贴「未发送 (Schema 未记录) 共 N 项」下方，读作该桶成员 → 该发已发却像未发送。

## 修改（最小 diff）
- `src/components/HistoryModal.tsx:589`：history-other-sent 块移到两个未发送折叠之前（仅移位 + 一行注释）。
- 新增 `src/utils/fix15.1-2026-10-16.test.tsx`：断言 other-sent 先于两个未发送折叠。
- 回归：fix15.1 / fix12 / fix11.1 / traceFix2 / fix5 共 31/31 通过。

## Restore
`/workspace/canvas/temp/backups/canvas-restore-fix15.1-2253.tgz`（改前 HistoryModal.tsx；`tar xzf` 于仓库根）

## Server（一次重启；未用 start-canvas.sh；沿用旧进程 env，未换 provider）
- 旧 PID 3656255 → 新 PID **3681517**（127.0.0.1:3000 HTTP 200）
- ticks（约 20s 采样）**340**，starttime 16124208
- lstart（北京）`Fri Oct 16 22:53:39 2026`
- Log: `/tmp/canvas-fix15.1-server.log`

## 验收焦点
中/右卡（fal kling video）：duration / start_image_url 蓝标「实际发送」行出现在「未发送 (Schema 未记录)」折叠**上方**，折叠内只剩真正未发送项；左卡 hist_1792161944810_gfkr9 loras/401 不变。

## Status
**CODE_ONLY**（UI 位置修正；不升出图）。不做：prompt/LoRA 名截断、toast 重复 401。

## 收口（画布 2026-10-16 22:59 北京）
- 前端重拍：/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-fix15.1-accept-2254/（PID 3681517，未出图点击）
- 挑刺：严重无。蓝标实际发送已在未发送折叠上方；折叠 6 项均不在请求体。
- fix15 主项：modelscope_ai loras={"LcarsPicturesDatabase/ST-TNG-Rooms-Z-Image-Turbo-v1":1} 无 path/scale；上游 401「bind Alibaba Cloud account」原样（hist_1792161944810_gfkr9）。
- 状态：CLOSED（接线形状过；非 PASS_GENERATION，非 PASS_BILLING——401 是账号未绑定，不是欠费）。
- 细节并下批：蓝标组无标题且贴折叠；种子行「实际发送」+「上游未返回种子」读起来矛盾；prompt/LoRA 名截断；未发送行重复后缀；历史开着 toast 重复。
