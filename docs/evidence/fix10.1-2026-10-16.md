# fix10.1 · 2026-10-16 · 时间 Asia/Shanghai
结论：代码 + 无头 Chrome 对运行中 :3000 的端到端自测全部通过；Fal 真跑一次，403 TOP_UP 原样，model 码点扫描无零宽字符。最终验收仍以画布为准。

## 根因（fix10）
fix10 的 softBreaks 把 U+200B 直接写进了 textarea 的 `value`（`withSoftBreaks(value)`），所以 DOM value 一定带零宽字符，未碰过的节点也一样。单测只校验了 strip 之后的结果和样式类名，没有检查 DOM value，所以没抓到。

## 改动
| 文件 | 内容 |
|---|---|
| src/utils/softBreaks.ts | **删除** |
| src/components/CustomModelIdField.tsx（新） | 非编辑态：只读 div（role=textbox, aria-readonly, tabIndex=0），文本按 `/` `-` 拆分并插入 `<wbr/>` 元素（不产生字符）；点击 / Enter / Space 进入编辑态：textarea 的 value = 原值，onChange 原样写 store；Enter/blur 提交 noteUserModelSelection；Esc/blur 回到显示态。字号和内边距与 index.css 的 textarea 规则一致 |
| src/components/NodeItem.tsx | 视频自定义框改用 CustomModelIdField |
| src/utils/zeroWidth.ts（新） | 扫描 / 清洗 U+200B/200C/200D/FEFF/2060；`preRunZeroWidthBlock` 生成本地拦截 payload |
| src/App.tsx | ① `useEffect([nodes])`：发现零宽字符就清洗 store，弹 toast「已清除 N 个零宽字符」，正文写明节点和字段，并写执行记录本地事件「零宽字符清洗（节点数据）」。覆盖所有载入路径（缓存、切换画板、预设、导入），粘贴时同样会触发并提示。用 WeakSet 防止 StrictMode 重复记录。② 运行前 `preRunZeroWidthBlock`：如有零宽字符就本地拦截（ApiTraceError 400，requestCount 0，记「零宽字符检查（运行前）」），**不 strip**。历史快照不改 |
| src/components/ExecutionLog.tsx、ModernToolDock.tsx | 收起态按钮按工具栏 `[data-testid=modern-tool-dock]` 的实测矩形定位：放在工具栏左侧 12px 处，左侧空间不足 160px 时放到工具栏上方；按钮宽度不超过可用空间。纯计算函数 `dockAvoidingStyle` 有单测 |
本地事件归类：零宽清洗和运行前拦截都是 category 'local'（不计生成，也不计目录/Schema；按钮显示「本地 K」）。

## 单测（测行为）
`src/integration/fix10_1ZeroWidth.test.tsx`（jsdom）：
- 显示态 textContent === ID，无零宽字符，wbr 数量 = `/`、`-` 个数
- 点击进入编辑态：textarea.value === ID，长度 45，码点全部 < U+2000；输入后 onUpdateValue 收到的值与输入完全一致
- scrub 报告节点、字段、个数，不修改入参；pre-run 拦截不 strip
- 真实 App 载入含零宽的画板：显示 toast，有本地事件，display 干净，localStorage 无零宽
- dock 布局不重叠
fix7/8/9/10 中依赖 textarea 的断言改为读 display。
`src/{utils,components,services,integration,constants}`：91 files / 843 tests，842 passed，1 failed = 既有的 replicatePartialFix #2（fix10 已证明改前就失败）。

## 端到端（google-chrome 154 headless + CDP，脚本 /workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-fix10.1/e2e.mjs，截图同目录）
A 载入：在 localStorage 写入 model 含 4 个 U+200B 的画板后刷新 → toast「已清除 4 个零宽字符「AI 视频（显式 Provider/Model）」字段 model：4 个」；执行记录按钮「生成 0 · 目录/Schema 0 · 本地 1」，本地行 1 条；localStorage 中 model 长度 45，零宽 0，全部 localStorage 零宽 0。
B 显示态：textContent 长度 45，wbr 8，零宽 0；整段选中复制，剪贴板 = ID，长度 45，非 ASCII 码点 []。
C 编辑态：textarea 获得焦点，value 长度 45，非 ASCII []；复制剪贴板长度 45，[]；Input.insertText 真输入 + Enter 后 value 长度 45；blur 后 localStorage model 长度 45，零宽 0。
D 底栏：1600 宽 exec [235–475] / dock [487–1113] 不重叠；1100 宽不重叠；900 宽（工具栏换成两行）exec [12–198] / dock [210–690] 不重叠。
E 运行一次（Fal，自定义框长 ID，参考图 Load Image + custom_parameters image_url，与 1637 做法一致）：
- 历史卡 **hist_1792144907831_q1cbe**，status failed，httpStatus 403，upstreamStatus 403
- upstreamEndpoint https://fal.run/fal-ai/kling-video/v3/standard/image-to-video
- upstreamResponseBody `{"detail":"User is locked. Reason: TOP_UP."}`
- actualRequest：endpoint 同上，parameters {prompt, duration:"5", start_image_url}
- 码点扫描：card.model / executionTrace[0].model / workflowSnapshot model 均长度 45，零宽 {}；整张卡零宽 {}
- logs/upstream.log 新增 1 行：2026-10-16 18:01:47.818，fal /api/video/generate → fal.run/…/image-to-video，status 403，error 为上游原文；零宽 {}；key 已脱敏（不打印）
- 原文：/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-fix10.1/history-card.json、upstream-new.log、transcript.txt
- 不扣费：账户已锁（TOP_UP），上游拒绝

## 进程
复用 PID 3299769 的 cmdline/cwd/environ 重启一次（未用 start-canvas.sh）→ PID 3340604，ticks 14366341，lstart 2026-10-16 17:58:52，:3000=200，log /tmp/canvas-dev-fix10.1.log。之后只改了前端文件（CustomModelIdField 字号、App WeakSet、ExecutionLog maxWidth），由 Vite 热更新生效，没有再次重启；E2E 每轮都是新开的 Chrome profile 整页载入。
restore：/workspace/canvas/temp/backups/canvas-restore/pre-fix10.1-20261016-175641.tgz
