# T7 Sogni 验收报告(重做)— PASS_BILLING

## 2026-10-12 官方正文与当前代码复核（不升级出图验收）

已检查旧 agent-116 成功读取的官方结果正文；旧 agent 未写生产代码/测试/验收文档。历史 27 selector / 32 LoRA / HTTP 201 / insufficient_credit 保留为当时证据，不外推实时目录数量或图片成功。

- 官方工作流正文（旧日志成功）：https://docs.sogni.ai/sogni-intelligence/creative-agent-workflows/ 、https://docs.sogni.ai/api-reference/workflows/ 、https://docs.sogni.ai/api-reference/direct-generation/ 。原文 `POST /v1/creative-agent/workflows`、`Authorization: Bearer`、`input.steps`，示例 `toolName: generate_image` + arguments；`201 response as acceptance ... not as completion`。GET `/v1/creative-agent/workflows/:id` 观察任务。当前 `src/server/schemaProviders.ts:323–345` 匹配工作流主结构与受理/轮询边界。
- 官方终态正文有 completed / partial_failure / waiting_for_user / failed / cancelled；waiting_for_user 是可恢复暂停。`SchemaProviderDriver.ts:149–155` 展示暂停原因/完整 body，不当生成成功，匹配；只要不足余额就标 billing，不解释为 API 集成失败。
- 本次实际打开固定版本官方 Schema：https://raw.githubusercontent.com/Sogni-AI/sogni-protocol/v1.0.0-alpha.46/schemas/tools/generate_image.schema.json （schemaVersion 2026-07-18.1，与 package.json:18 一致）。原文 `negativePrompt`、`guidance`、`starting_image_strength`、`sourceImageIndex`，loras 为至多 8 个 string，loraStrengths 是同序 number 数组；`Do NOT clamp to 0-1`。当前 `schemaProviders.ts:289–308` 映射匹配。此工具 Schema 没有 steps/sampler/scheduler，不代表整个 Sogni 平台不支持；Schema 匹配开启时应记录省略，关闭或 JSON 显式提交由上游裁决。
- 本次实际打开官方目录正文：https://docs.sogni.ai/api-reference/model-discovery/ ，原文 `GET /v1/model-catalog`，支持 mediaType/network/include，返回 data.models，`Catalog presence does not reserve a worker or guarantee ... run immediately`。当前默认目录 `schemaProviders.ts:48–49` 来自固定版工具 selector enum，不是实时 worker 目录；另有 catalog=workers 路径，不应把默认 27 项称作全量实时模型目录。
- 本次实际打开：https://docs.sogni.ai/api-reference/personal-loras/ 。原文 `The public LoRA catalog remains GET /v1/loras/comfy?modelId=... and needs no authentication`；每行 modelIds / restrictedModelIds 区分可用性。ready 私人目录 GET `/v1/loras/personal/catalog` 需 Bearer 与 Unlimited 权限，不能拿普通下载 URL 冒充 personal ID。当前只接公共目录（schemaProviders.ts:37–42），私人导入/ready 目录未接；本轮没有导入调用。
- 参考图路径只接公网 URL→workflow media_references + sourceImageIndex=-1（schemaProviders.ts:292–295）；固定工具 Schema 说明一般保真编辑应用 edit_image，只有明确 Z-Image/Krea 2 等场景才走 generate_image 图生图。目前所有模型均固定 generate_image（323），不能声明通用编辑已接；不得暗换模型或 tool。
- 已本地实测发现持久化响应缺陷（不调用上游）：`server.ts:763` 的 recordHistoryItem 为 async，`src/server/schemaProviders.ts:357` 却 `saved.push(dep.record(...))` 未 await；真实 async 依赖下 save-result JSON 成为 `{"historyItems":[{}],"transientOutputs":[]}`，Driver 回退到远端 URL（SchemaProviderDriver.ts:135），不能声明成功历史已返回。建议串行 diff 为 `saved.push(await dep.record(...))`，并将 Dependencies.record 类型明确为同步/Promise，新增真实异步依赖回归测试，不修改现有测试以伪装通过。

验证：相关 4 文件 / 34 tests PASS；全量 npm test 74 files / 633 tests PASS，但只是本地回归。npm run lint 失败：ModelHubModal.tsx 的 9 个 implicit-any，以及旧 agent 留的 temp/tams-sdk/index.ts 官方下载副本被 tsc 纳入（缺模块/implicit-any）。本轮不删除/移动这些既有文件，不改测试或配置。没有新前端生成；真实图片、LoRA 效果、批量、编辑、历史刷新仍未完成，余额阻碍沿用历史证据。

日期:2026-10-05(UTC+8)。真实前端 + 真实 Sogni API,browser-harness(CDP)驱动完整 UI 流程。
本轮为重做:修复了前轮 LoRA 节点未连线导致请求 `loras: []` 的无效证据问题。

## 结论

**PASS_BILLING** — 模型目录与官方协议枚举一致(27 个)、LoRA 目录与官方实时数量一致(32 个)、
LoRA 参数按官方协议正确透传(`loras` 字符串 ID 数组 + `loraStrengths` 平行数组),
工作流提交返回 HTTP 201 created,任务因账户欠费停在 `waiting_for_user / insufficient_credit`,
前端原样透传上游暂停原因与完整响应体,无静默容灾、无虚假成功。

## 证据链

1. **底模中心 · Sogni 模型目录**:节点模型下拉 27 个 selector,与官方 `@sogni-ai/sogni-protocol`
   schema 枚举逐一对齐,无硬编码清单(截图 t7-sogni-r10)。
2. **LoRA Hub · Sogni 官方 LoRA 资源页签**:实时调用 `GET https://api.sogni.ai/v1/loras/comfy`
   (无参数)返回 **32 个 LoRA**,与官方目录数量一致(截图 t7-sogni-r11)。
3. **LoRA 接入工作流**:从 LoRA Hub 选用 `krea2-detail-enhancer`,采用「选用 LoRA · 保留当前底模」
   方式接入画布,LoRA 节点与底模节点正确连线(8 条连接),强度 0.8(截图 t7-sogni-r16)。
4. **真实提交**:点击「运行工作流」→ 前端提交 →
   `POST https://api.sogni.ai/v1/creative-agent/workflows` → **HTTP 201 created**
   (上游日志 2026-10-05T07:23:55,model=krea-2-turbo,密钥掩码 225e...fae1)。
5. **执行记录面板完整透明**(截图 t7-sogni-r14 / r15):
   - 客户端请求:model / prompt / steps=8 / seed=42 / workflowSnapshot 全量,
     `loras:[{name:"krea2-detail-enhancer", path, strength:0.8, ...}]`
   - actualRequest(按官方协议转换):`loras:["krea2-detail-enhancer"]` + `loraStrengths:[0.8]`
     + `model:"krea-2-turbo"` — 即 loras 为字符串 ID 数组,loraStrengths 为平行数值数组。
6. **任务轮询**:`wf_durable_workflow_551d3bcb-...` 轮询(07:23:58)返回任务状态
   `waiting_for_user`,暂停原因 `insufficient_credit`(账户欠费,非 HTTP 错误)。
7. **前端原样报错**(截图 t7-sogni-r17):toast「请求未完成 — Sogni task
   wf_durable_workflow_... is waiting_for_user; upstream pause reason: insufficient_credit;
   full response body: {...}」,完整响应体逐字展示。
8. 失败不产生历史记录,无 mock 数据、无降级到其他供应商;欠费按用户规则不作为失败。

## 截图证据(docs/evidence/shots/)

- t7-sogni-r10-model-selected.png 模型下拉 27 selector 与选中态
- t7-sogni-r11-lorahub-32.png LoRA Hub Sogni 页签 32 个 LoRA
- t7-sogni-r12-lora-added.png LoRA 节点已添加(前轮遗留,供参考)
- t7-sogni-r13-error-toast.png 前轮 loras:[] 错误(已修复,供对照)
- t7-sogni-r14-trace-submit.png 执行记录:提交详情
- t7-sogni-r15-trace-loras.png 执行记录:loras 客户端→actualRequest 转换明细
- t7-sogni-r16-canvas-wired.png LoRA 节点与底模连线后的画布(8 connections)
- t7-sogni-r17-toast-insufficient.png 欠费 toast 原样透传(第三轮 wf_durable_workflow_b3452c28)

## 备注

- Sogni 欠费表现不是 HTTP 错误码,而是任务进入 `waiting_for_user / insufficient_credit` 状态,
  前端对此做了显式识别并原样展示,符合「严禁静默容灾」铁律。
- 真实出图需账户充值后复测;当前全链路(目录/参数/协议转换/提交/轮询/报错)均已验证。

## 2026-10-10 前端全链路复测与证据存档

- 实测日期：2026-10-10 (UTC+8)
- 模型：`krea-2-turbo` + LoRA `krea2-detail-enhancer` (strength: 0.8)
- 提交端点：`POST https://api.sogni.ai/v1/creative-agent/workflows` 返回 HTTP 201 Created
- 异步任务轮询：`GET /api/schema-provider/sogni/tasks/wf_durable_workflow_e92d1aae-4bf0-4545-986e-761bfcae1ed7` 返回 HTTP 200，任务终态确认处于 `waiting_for_user`，waitingReason: `insufficient_credit`
- 结论确认：**`PASS_BILLING`**
- 产物目录：`temp/acceptance-20261010/sogni/`（包含 ready.png, billing.png, poll-expanded.png, compact.json, terminal.json）
