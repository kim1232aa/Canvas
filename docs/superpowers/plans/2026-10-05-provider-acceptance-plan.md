# 计划：多供应商适配修复与前端真实验收（2026-10-05）

规格权威：HANDOFF.md（五条铁律 + 16 板块 + A01–A12 工单）+ 用户会话追加要求（出图/欠费才算验收；只限 commit/push 时汇报；文档随代码一起 push）。
执行方式：内联执行（executing-plans），账本 `.superpowers/sdd/2026-10-05-provider-acceptance-plan.md/progress.md`。
集成方式：用户明确指示直接 commit/push 到 main（覆盖 worktree+PR 默认流程）。

## 环境事实（已实测）
- 依赖 npm ci OK；vitest 267/267 通过；tsc 仅缺 hosting 生成文件（构建时生成）。
- 网络实测（curl 直连 + 6 个代理轮测）：fal.ai、modelscope.cn、api-inference.modelscope.ai、nano-gpt.com、api.muapi.ai、api.wavespeed.ai、api.sogni.ai 可达；civitai.com、huggingface.co、tams.tensor.art 全部 000（直连与所有代理均不通）→ 这三家在本环境只能是 BLOCKED_ENV，如实记录，不伪造。

## 任务序列

1. **官方文档取证**（调查先于断言）：MuAPI✓、WaveSpeed✓ 已取；待取 Sogni API 参考、Civitai orchestration、Fal flux-lora、HF inference-providers、ModelScope API-Inference、NanoGPT image、TAMS tensor.art。产出 `docs/evidence/api-research-2026-10-05.md`，逐项列出：认证头、目录端点、提交端点、轮询端点、LoRA 字段、参数 Schema、错误原文格式。取不到官方证据的标「未能核实」，不猜。
2. **A01 错误分类**（已修代码+3 个回归测试通过；待全套件复跑）。
3. **A02 模型中心 all 聚合**：server.ts 的 all 分支补 muapi/wavespeed/sogni，单家错误独立呈现不丢成功家。
4. **A03 LoRA 中心**：CivitaiModal 补新三家入口；Sogni 用真实 loraId；MuAPI/WaveSpeed 显示「无端点权重目录，手输 URL」说明；ModelHubModal 的 ID/displayName 白名单改为按供应商能力判断。
5. **A06 NanoGPT「未核实=不支持」整改**：按 nano-gpt 官方文档核实 supported_parameters 机制，unknown 不再拦截。
6. **Key 直调分类**（仅调查，不算验收）：用用户给的 key 调各家 balance/廉价端点，分类 valid/billing/auth，写进证据文档（key 脱敏）。
7. **前端验收**（browser 工具，真实点击）：起 dev 服务器 → API 设置配 key → 模型中心选模型 → 参数 + LoRA（端点支持时）→ 运行 → 记录执行记录/截图/历史恢复。可达 7 家逐家做；不可达 3 家如实 BLOCKED_ENV。判定等级严格按 HANDOFF §3.1。
8. **文档与交付**：更新 PROGRESS.md、验收报告（逐家表格+证据链接）、HANDOFF 状态修正；npx tsc、vitest、npm run build 全绿后 commit push main。

## 验收判定红线
- 前端点击是唯一验收路径；curl 直调只做调查。
- PASS_GENERATION 必须有：页面出图 + 实际提交参数/LoRA/工作流快照 + 历史刷新可恢复。
- PASS_BILLING 必须有：上游原文明确余额/额度不足 + 前端准确展示。
- 401/403/404/429 必须看原文分类，不按状态码猜。
- 任何环境阻塞如实记 BLOCKED_ENV，不循环换端口碰运气（沿用交接教训，本环境为沙箱合法出口，测不通即记录）。
