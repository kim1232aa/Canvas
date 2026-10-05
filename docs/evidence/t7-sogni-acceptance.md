# T7 Sogni 验收报告(重做)— PASS_BILLING

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
