# fix9 重拍「执行记录 0→3」排查（只读） · 2026-10-16 · 时间均为 Asia/Shanghai

## 结论
3 条是**模型目录 GET /api/models**（打开模型/LoRA 检索弹窗自动拉取），不是生成请求：没有运行、没有生成调用、**不扣费**。底部按钮「执行记录 · N」里的 N 等于本会话全部记录数（含目录/Schema GET），所以没点运行也会从 0 变 3。属于计数口径问题，不是幻影运行。

## 1 记录存在哪
- 前端内存 `src/services/executionTrace.ts`（`tracedFetch` L113 写入 `records`）+ sessionStorage（L75-76，仅为刷新后保留）。不写 IndexedDB / localStorage。
- 服务端 `data/history.json` mtime 2026-10-16 16:46:00，**17:29 之后未写**（无新历史卡）。
- 按钮计数：`ExecutionLog.tsx` L387 `buttonSummary` 无错误/无 pending 时返回 `String(records.length)`，不排除 `isNonGenerationRecord`（executionTrace.ts L147：GET /api/models|model-schema|lora|catalog）。
- 服务端 `logs/upstream.log`，17:29:36 之后只有下面 3 条（maskedKey 均为 null）：

| 时间 | provider | upstream | status | 耗时 |
|---|---|---|---|---|
| 17:33:31.994 | civitai | civitai.com/api/v1/models?limit=40&sort=Most+Downloaded&nsfw=false&types=Checkpoint | 200 | 546ms |
| 17:33:46.935 | modelscope_ai | www.modelscope.ai/openapi/v1/models?page_size=40&page_number=1&sort=downloads&search=diffusion | 200 | 1913ms |
| 17:34:05.025 | modelscope_cn | modelscope.cn/openapi/v1/models?page_size=40&page_number=1&sort=downloads&search=diffusion | 200 | 1505ms |

对应缓存写入 data/media/raw-0c7b…（17:33:32）、raw-4616…（17:33:46）、raw-9be8…（17:34:05）。时间和截图 `04-modelscope-placeholder.png`（17:34）吻合：重拍打开了模型中心并切到 Civitai → 魔搭国际 → 魔搭 CN 页签核对占位提示。
注：前端执行记录里每条具体内容在浏览器 sessionStorage，box 侧读不到。上面是服务端对应日志，3 条数量与时间一致。

## 2 /tmp/canvas-dev-fix9.log
仅 5 行启动信息（dotenv 注入 18 个变量、vite 警告、listening 127.0.0.1:3000），无生成/上游请求日志（这些写在 logs/upstream.log，见上）。无 generate 路由调用。

## 3 不点运行也会写执行记录的路径
- 目录检索：`CivitaiModal.tsx` L458-462 `useEffect([isOpen, activeProvider])` 打开/切页签即 `fetchModels`；同文件 L734 / L789（Enter）/ L802 / L814 / L885；`ModelHubModal.tsx` L223 → `services/api.ts` L494 `tracedFetch('/api/models?…')`
- Schema GET：`services/userModelSelection.ts` L28 `noteUserModelSelection` → `sharedGet.ts` L30 tracedFetch（模型下拉 onChange，以及 fix8 自定义 textarea 的 Enter/blur，`NodeItem.tsx` 自定义框 onKeyDown/onBlur）。只读 Schema，**不触发运行**；Fal 无 Schema 徽标时直接 return（L30）。本次时段内 upstream.log 没有 model-schema 记录。
- 本地事件：`executionTrace.ts` L200 `recordLocalEvent`（本地拦截、视口平移等 LOCAL 行）
- 载入旧工作流/预设：本次没有证据显示触发了请求。
- fix8 textarea Enter：只调用 noteUserModelSelection 并 preventDefault，代码里没有运行入口。

## 4 是否真发请求 / 扣费
- 有 3 个真实对外 HTTP GET（Civitai、魔搭国际、魔搭 CN 公开模型目录），均为 200。
- 无生成请求、无 history 写入，不会扣费。
- 根因：按钮计数 L387 把非生成的目录 GET 也计进去，加上打开模型中心会自动拉目录。可选改进（未改）：按钮数字只计生成请求，或者把「请求 N · 目录 M」分开显示。
