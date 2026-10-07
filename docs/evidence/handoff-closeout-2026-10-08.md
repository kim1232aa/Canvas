# HANDOFF closeout — 2026-10-08

本文件记录 2026-10-06～2026-10-08 的收尾结果。若与更早 HANDOFF / PROGRESS 段落冲突，以本文件和 HANDOFF 顶部“最新状态”区为准。

## 1. 当前验收结论

| Provider | 当前等级 | 证据边界 |
|---|---|---|
| Civitai | PASS_GENERATION | 当前网页基础图与带 LoRA 图真实生成；只证明已测 AIR/LoRA 组合，不外推全部模型 |
| WaveSpeed | PASS_GENERATION | krea-v2/turbo-lora 带 LoRA 真出图 |
| MuAPI | PASS_BILLING | 普通路由与 LoRA 专用路由均真实到上游 402 INSUFFICIENT_CREDITS；LoRA URL + 0.65 已进入 actualRequest |
| Sogni | PASS_BILLING | 真实 task created，LoRA ID/strengths 透传；insufficient_credit 原样展示 |
| Fal.ai | PASS_BILLING | fal-ai/flux-lora 到真实上游，403 TOP_UP 原样展示 |
| ModelScope CN | PASS_BILLING | CN 图像接口 429，响应体明确 insufficient balance |
| ModelScope AI | BLOCKED_AUTH | AI 国际站 401，原文要求绑定 Alibaba Cloud account |
| NanoGPT | BLOCKED_AUTH | qwen-image-2.1/text-to-image 真实上游 401 Invalid session / invalid_api_key |
| Tensor.Art / TAMS | BLOCKED_AUTH | 真实模型 ID 查询到 TAMS，业务体 unauthorized / app not found |
| Hugging Face | 待当前环境复验 | 旧 Z-Image Space 证据为网络 BLOCKED_ENV；不能外推当前所有 HF 路由 |

已取得明确终态的供应商不再为了“刷测试”重复消耗。

## 2. 用户新增的验收规则

后续每个尚未取得明确终态的供应商必须换一套参考作品和参数，不复用上一家的 Prompt。应记录来源可得的 Prompt、Negative Prompt、底模、LoRA、LoRA 权重、Steps、CFG、Sampler、Scheduler、Seed、尺寸；缺字段不能猜。真实出图后还要与参考原图比较主体、构图、服装/材质、色调、光影和 LoRA 特征。

公网作品/模型元数据优先走公开 API；本地浏览器自动化只用于 Canvas 前端真实工作流或必须依赖本地登录态的场景。

## 3. 2026-10-08 已落到 main 的收尾修复

### 3.1 失败重跑不再残留旧图

- 新运行开始时，生成/保存类节点会清掉上一轮 outputData。
- workflowSnapshot 发给服务端前会去除旧 outputData / errorMessage / executionProgress，并把节点状态归一为 idle。
- 目的：上游本轮 402/401/其他失败时，KSampler/SaveImage 不得继续显示上一张 Civitai 图，也不得把旧 base64 塞进本次请求证据。

### 3.2 History 参数 provenance

History 新增 requested / sent / upstream/effective 的参数来源语义。UI 不再把以下情况都写成“未填写”：

- 用户有请求但未发：请求值 · 未发送
- 实际发给 provider：实际发送
- 上游明确回传/确认：上游实际
- 旧记录没有 provenance：旧记录未保存
- 当前流程没有发送该字段：未发送

支持解析 seed / steps / cfg / sampler / scheduler / width / height / negative prompt。导出的 provenance JSON 升级为 version 2。

Civitai 直达成功与异步轮询成功都会保存 requestedParameters / actualParameters / effectiveParameters；history item 同时保存 sampler / scheduler / width / height。

### 3.3 A09 多图持久化边界

schema-provider save-result 的契约保持：上游生成成功后逐图持久化；某一附加图保存失败不会改写成“生成失败”，而是：

- 已成功持久化的图片正常进入 historyItems
- 失败图片进入 transientOutputs
- 返回 historyWarning，明确“部分图片保存失败”

已补对应回归测试。

### 3.4 A03 MuAPI LoRA

MuAPI LoRA 专用端点 `flux-1-dev-style-lora-inference` 已从真实前端验证：

- LoRA URL：`https://huggingface.co/XLabs-AI/flux-lora-collection/resolve/main/anime_lora.safetensors`
- strength：`0.65`
- actualRequest：`lora_url + lora_weight=0.65`
- endpoint：`https://api.muapi.ai/api/v1/flux-1-dev-style-lora-inference`
- 上游：HTTP 402 `INSUFFICIENT_CREDITS`

因此 A03 接线缺口关闭；充值后再出图只用于视觉效果确认。

## 4. 当前真正剩余

A01–A08、A10–A12 按当前交接范围关闭。A09 的代码契约与回归已补齐；仍缺的是“有额度情况下真实多图 + 某图持久化失败”的外部前端实景证据，不能靠故意制造生产故障来伪造。

Hugging Face / Gemini / Agnes / SenseNova / 兼容中转 / Video 等尚未取得当前明确终态的路由，继续按用户的新样本规则逐路由验收；不能从代码存在、目录存在或其他 provider 成功推断为通过。

## 5. 回归原则

测试、lint、build 只用于回归保护，永远不替代前端验收。任何最终“完成”结论必须同时满足：

1. 路由是用户显式选择的真实 provider/model；
2. endpoint 与 actualRequest 可见；
3. 不静默换 provider/model/key；
4. 有图则真实持久化并保留参数 provenance；
5. 无图则保留真实上游状态码、响应体、cause/stack；
6. PASS_BILLING 只在响应体明确余额/额度原因时成立。

## 6. 2026-10-08 本地回归

Aki 本地工作区在恢复后重新执行完整回归：

- `npm test` — **40/40 test files、293/293 tests PASS**
- `npm run lint` — **PASS**
- `npm run build` — **PASS**
- Vite 生产构建：1732 modules transformed；仅保留已有 `__dirname` native-loader 与 chunk-size warning，没有构建失败。

这组回归只证明当前代码没有破坏既有契约；不替代任何 provider 的真实前端/上游验收。

