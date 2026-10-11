# HANDOFF 收尾证据 — 2026-10-06

本文件记录 2026-10-06 对 `HANDOFF.md` A01–A12 的收尾核对。验收标准仍是：**真实前端行为优先，测试/构建只作为回归保护，不能替代前端与真实上游证据。**

## 1. 本地运行版本一致性修复

发现 `127.0.0.1:3000` 的 Node 进程于 02:33 启动，命令为：

```
tsx server.ts
```

它不是 watch 模式。因此 React/Vite 客户端修改可通过 HMR 生效，但后续 `server.ts` 修改没有加载到运行进程。此前用失效 `credentialRef` 验证 A05 时，旧 server 仍错误打到了 MuAPI 上游。

处理：

- 仅终止监听 3000 的旧进程（SIGTERM）。
- 用当前工作树重新执行 `npm run start`。
- 新服务日志确认：`[ComfyCanvas Studio] Server listening on 127.0.0.1:3000`。

这说明以后做服务端验收前必须确认运行进程加载的是当前 `server.ts`，不能只看前端 HMR。

## 2. A05：同任务凭据引用不静默换 Key

服务重启后，用伪造失效凭据引用请求 MuAPI submit，仅验证本站 guard，不做生成：

- website HTTP：409 Conflict
- `errorSource`: `local`
- 原文：`凭据引用已失效或不属于当前供应商；请重新读取模型 Schema 后重试，未自动切换 Key`
- `executionTrace: []`

结论：当前运行版本确实在上游调用之前截断；失效引用不会自动取下一把 Key 重提生成。

## 3. A02：all 模型聚合包含新三家

从当前 Canvas 页面请求：

`/api/models?provider=all&type=Checkpoint&category=checkpoint&page=1&limit=3`

website HTTP 200。响应中明确存在：

- `muapi`: 3
- `wavespeed`: 3
- `sogni`: 3

同时其他供应商可有各自成功数组或错误信息，一家失败不会抹掉新三家成功数组。

## 4. Generation History 参数来源修复

用户指出两张 Civitai 历史图显示 Seed / Steps / CFG / 负向词“未填写”，导致无法判断 LoRA A/B。

实际检查旧历史原始数据后发现：

- Civitai upstream response 已明确返回有效参数：
  - width = 512
  - height = 512
  - sampleMethod = euler
  - schedule = discrete
  - steps = 20
  - cfgScale = 7
- JPEG 嵌入生成元数据包含实际 Seed。

新增 `src/utils/historyParameters.ts`，参数解析优先级为：

**上游实际 > 图像嵌入元数据 > 实际发送 > 请求值 > 旧顶层字段**

并区分来源：

- `upstream`
- `image-metadata`
- `sent`
- `requested`
- `legacy`
- `not-sent`
- `unknown`

当前真实前端历史页已经恢复两张旧图：

### LoRA 图

- Seed: **1021568893** · 图像元数据
- Steps: **20** · 上游实际
- CFG: **7** · 上游实际
- Sampler: **euler** · 上游实际
- Scheduler: **discrete** · 上游实际
- Size: **512×512** · 上游实际
- Negative Prompt: **未发送**
- LoRA: `urn:air:sd1:lora:civitai:82098@87153 (0.7)`

### 基础图

- Seed: **951383495** · 图像元数据
- Steps / CFG / Sampler / Scheduler / Size 与上图相同
- Negative Prompt: **未发送**

因此这两张旧图 **不能作为 LoRA 前后效果 A/B 证据**：Seed 不同。Civitai 的 PASS_GENERATION 路由结论保留，但不把这组旧图冒充“LoRA 效果一致性复现”。

未来历史还会保存 `requestedParameters / actualParameters`，并记录 sampler / scheduler / width / height。History JSON 导出升级为 provenance version 2。

## 5. A08：工作流 provider 保真

- MuAPI / WaveSpeed / Sogni 已在工作流导入目标列表。
- ComfyCanvas 原生工程导入导出保留 nodes / connections / spatialFrames。
- 外部 ComfyUI JSON 若没有 provider 元数据，`workflowFrame()` 保持 provider 未指定，不根据模型名猜供应商。
- `explicitProvider()` 已覆盖 MuAPI / WaveSpeed / Sogni。
- `graphEditing.test.ts` 对新三家补回归并通过。

## 6. A09：存储与私有参考图边界

- schema provider `save-result` 逐输出保存。
- 保存失败通过 `historyWarning / transientOutputs` 单独暴露，不将上游生成成功改写成生成失败。
- WaveSpeed 已有真实生成 + 历史持久化证据。
- Sogni 对 data URL / localhost / 127.x / 私网 URL 明确拒绝，未核实上传流程时不会假称已上传。
- 仍需有额度后补真实多图与“生成成功、持久化失败”的前端场景，所以 HANDOFF A09 保持 PARTIAL。

## 7. A10：执行记录真实 UI

当前页面打开“执行记录”实测：

- 面板 clientWidth = 759 / scrollWidth = 759，无横向撑爆。
- 可显示完整 HF 长 endpoint。
- 网络错误显示 `status=null`，cause 为 `ECONNRESET`，不是欠费。
- 可展开完整 response 与 stack。
- 文案明确：website HTTP 200 只代表本站返回，是否出图以生成终态为准。

## 8. A11：矩阵、指南、资产库

供应商矩阵真实 UI 已确认包含 MuAPI / WaveSpeed / Sogni，并改为：

- provider 由用户选择，不按画风/语言/余额自动切换；
- capability 由具体模型/端点 Schema 或真实响应决定；
- unknown 不伪装 supported / unsupported；
- 删除 NanoGPT 极速/flux-dev、Tensor 未验证 LoRA、100% 复现等绝对宣传。

新手指南真实 UI 已确认：

- 不再声称触发词 100% 命中；
- 固定 Seed 只用于降低随机差异，不承诺跨后端像素级复现；
- Fal TOP_UP 不建议系统自动换其他 provider。

资产库 provider 筛选已从静态列表改为 **根据真实资产历史动态生成**。刷新后当前只有两张 Civitai 历史，因此真实下拉仅显示：

- 全服务商 (All)
- Civitai 官方原生生成引擎

不会再显示没有资产的 Fal / Agnes / ModelScope / HF 等静态占位项。

## 9. A12：文档与历史模板

- README 首屏继续指向 HANDOFF。
- README 已删除/收紧 Failover、自愈、全平台余额、固定历史模型等宣传。
- 当前 README 搜索无 `Failover / 自愈 / 全平台余额 / 自动平滑 / 100% / 旗舰 / 极速` 残留。
- Civitai/Fal 旧 preset 改称“历史参数模板”，不再声称 100% 原版复现、旗舰或极速能力。

## 10. 最终回归

最终命令：

- `npm run lint` — **PASS**
- `npm run build` — **PASS**（含 frontend + hosting worker 构建）
- `npm test` — **40 test files / 290 tests 全部 PASS**

第一次全量测试发现 11 个失败，其中 6 个来自 `schemaProviders.test.ts` 的临时 TCP fixture 在当前 Vitest worker 环境被拒绝连接，5 个来自 `persistMediaAsDataUrl.test.ts` 的本地 HTTP fixture 同类问题；业务断言本身不是这些失败的根因。测试夹具随后改为**进程内 Express 路由派发**与**mocked fetch Response**，不需要真实监听端口，也不访问付费/公网 API。修复后完整 `npm test` 为 40/40 files、290/290 tests。

Production frontend build：

- 1732 modules transformed
- build completed
- 仅存在现有 Vite `__dirname` native-loader warning、dynamic import/chunk size warning，不影响本轮构建成功。

## 11. 当前仍未关闭的 HANDOFF 工单

现在只剩 **A09** 明确保留为 PARTIAL：

- **A03 已关闭**：2026-10-06 用真实前端选择 MuAPI `flux-1-dev-style-lora-inference`，从 LoRA 中心挂载 `anime_lora.safetensors`，model strength `0.65`。执行记录中的 `actualRequest` 明确为 `lora_url + lora_weight=0.65`，目标是 `https://api.muapi.ai/api/v1/flux-1-dev-style-lora-inference`；上游返回 402 `INSUFFICIENT_CREDITS`。按用户规则，这已达到 LoRA 接线的 `PASS_BILLING`，不再要求充值后出图才能关闭 A03。充值后出图只用于判断视觉效果。
- **A09**：私有参考图 guard 已回归通过，`127.x` 明确归类本机地址；历史参数已经能显示 requested / sent / upstream/effective provenance。剩余只是在有额度后补新三家的真实多图，以及“上游生成成功但本地持久化失败”的真实前端场景。

本轮最终回归再次执行：`npm run lint` PASS；`npm test` PASS（40 files / 290 tests）；`npm run build` PASS。LoRA、graph、history、schema-provider 与持久化测试都包含在这次完整测试中。

A01–A08、A10–A12 已按当前范围在 HANDOFF 标为 DONE。DONE 不代表所有供应商所有模型/视频/图生图都通过。
