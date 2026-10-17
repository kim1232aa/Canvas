# fix16.1 — fix16 前端 PARTIAL 补修（2026-10-16）

## Status
**CODE_ONLY**（UI；冻等画布重拍）。429 徽标与上游原文 `insufficient balance` 原样未动。未改供应商接线。

## 根因（fix16 单测过、画面没变）
改动其实进了运行产物（fix16 的「上游未返回种子」span 在截图里可见），但改错了位置/层：
- ② 种子：note 与 chip 同一 inline-flex 行，视觉仍是一句。
- ③ prompt：截断不在卡头，而在请求体 JSON `JsonNoMidBreak` 的 `JsonLine`：每行包成 `whitespace-nowrap`，只在 `/ ? &` 后可断 → prompt 行溢出 (scrollWidth 403 > clientWidth 283)。
- ③ LoRA：截断在**画布 LoRA 节点**（标题 `truncate` + 单行 `<input>`），不在历史卡。
- ④ 「cFG」：标签就是通用 `UNRECORDED_ORDER`/卡片字面量 `CFG`，计算样式与「步数」同 11px、无 text-transform；3x 截图为大写 CFG。1x 下观感差来自无胶囊行高度不一致 → 统一 `min-h-5`（通用，非魔搭特例）。
- ⑤ Key 胶囊：失败卡在状态头已有一份，参数区又渲染一份，单独掉行。

## 五项
| # | 文件:行 | 改动 |
| --- | --- | --- |
| 1 | `src/components/HistoryModal.tsx:579` | 种子行 basis-full；「上游未返回种子」basis-full 独占下一行 |
| 2 | `src/components/TextEmphasis.tsx:41–42` | JsonLine 在空格后也可断（`<wbr>`，不插字符） |
| 3 | `src/components/NodeItem.tsx:46–50,333,1063` | LoRA 标题去 truncate，`BreakAfterSlashDash` 在 / - 后 `<wbr>`；lora_name 改 textarea 换行，值原样，Enter 不插换行 |
| 4 | `src/components/HistoryModal.tsx:580–586` | steps/cfg/sampler/scheduler/size 行统一 `min-h-5`（size/sampler 加 gap-x-1） |
| 5 | `src/components/HistoryModal.tsx:577–578` | 失败卡不在参数区重复 Key 胶囊；非失败卡 Key 独占 basis-full 行左对齐 |

## 测试
- 新增 `src/utils/fix16.1-2026-10-16.test.tsx`（6）；更新 fix5（去标签后比对）、replicate1035Fix（fix16 去后缀后的断言）
- 相关 15 文件 **100/100**；全量 1468/1478，10 败为既有基线（mediaHosted×2、replicate1024×2、schemaContract×4、serverCloseout×1、replicatePartialFix#2）

## Server（一次重启，未用 start-canvas.sh）
- 3695091 → **3714746**，lstart 北京 `Fri Oct 16 23:15:45 2026`，ticks 343（约20s）
- Log `/tmp/canvas-fix16.1-server.log`
- 重启后 vite dev 中间件改 size/sampler gap-x-1（同进程按需转译，未二次重启）

## 运行产物核验
- curl `/src/components/{HistoryModal,NodeItem,TextEmphasis}.tsx` 含新标记
- 无头 Chrome 真实 DOM（hist_..._eigrc）：JSON sw=cw=283（无溢出）；种子 note top 947.6 vs chip 929.1（两行）；Key 胶囊 1 个。截图 `/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-fix16.1-probe/zoom-after2.png`
- LoRA 节点未在无头新 profile 实测（画板存在用户浏览器 localStorage），待画布重拍

## Restore
`/workspace/canvas/temp/backups/canvas-restore-fix16.1-2312.tgz`

## 前端重拍（2026-10-16 23:26–23:37 北京）
- PID **3714746**（未重启）
- 证据 `/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-fix16.1-accept-2318/`
- 卡 `hist_1792164378635_ndobk`：HTTP 429 + 上游原文 `insufficient balance`（未改接线，不升徽标）
- loras 形状：`{"LcarsPicturesDatabase/ST-TNG-Rooms-Z-Image-Turbo-v1": 1}`

| # | 项 | 结果 |
| --- | --- | --- |
| 1 | 种子「上游未返回种子」独占下一行 | 过（03b/03c） |
| 2 | JSON prompt 空格后可断 | 过（interior, 后断行） |
| 3 | LoRA 节点标题/名称换行、无省略号、无 ZWSP | 过（01） |
| 4 | CFG 大写 + 行高一致 `CFG: 未发送` | 过（03c） |
| 5 | 失败卡 Key 胶囊仅头栏、参数区不重复 | 过（03/03c） |
| — | Fal 视频蓝「实际发送」段头仍在 | 过（04） |
| — | 浮动 toast | **未拍到**（历史打开>2s，toast 已消失；本批不重跑） |

**状态：PARTIAL → 待挑刺视觉收口**（五项均过画面；toast 非本批硬项）。

## 收口（23:38 北京）
挑刺像素核对五项无问题，但明确「不算验收」（失败卡非出图主链）。fix16.1 **CLOSED（仅 UI 细节）**，不升任何徽章。下一组主验收：WaveSpeed 真出图（工作流全景 + 结果落节点 + 历史成功缩略图），待 fix17 重启报 PID 后开拍。
