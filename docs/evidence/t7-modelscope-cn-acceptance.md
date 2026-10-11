# T7 ModelScope CN 验收报告 — PASS_BILLING（历史最小请求）

## 2026-10-06 验收结论（origin/main 保留）

日期：2026-10-06。验收方式：真实前端。

**PASS_BILLING**。前端请求真实到达 `https://api-inference.modelscope.cn/v1/images/generations`，上游返回 HTTP 429，响应体明确为 **insufficient balance**。因此可按用户规则判为接线通过、生成受余额限制。

只证明当前 CN 图像路由；不外推视频、LoRA 或其他模型。

## 2026-10-12 官方正文与当前代码复核（incoming 72f5372 保留，不升级生成验收）

已检查旧 agent-116 的工具结果正文，而非只检查调用记录。以下官方正文成功读取，可继承；旧 agent 没有完成生产代码或验收文档编辑，仅留有 `temp/` 官方资料副本。

- 官方正文：https://www.modelscope.cn/docs/model-service/API-Inference/intro 。AIGC 示例原文：`base_url = 'https://api-inference.modelscope.cn/'`、`"Authorization": f"Bearer {api_key}"`、`"X-ModelScope-Async-Mode": "true"`；提交 `v1/images/generations`，随后 GET `v1/tasks/{task_id}`，轮询头 `X-ModelScope-Task-Type: image_generation`，成功 `SUCCEED` / `output_images`，失败 `FAILED`。与 `server.ts:6372–6466` 的主契约匹配。
- 同页参数表原文：`size | Generated image resolution | No | string | 1024x1024`；`seed ... [0,2^31-1]`、`steps ... [1,100]`、`guidance ... [1.5,20]`，另有 `negative_prompt` 与 `image_url`。因此下文“未重新核实”仅描述 10-06 当次验收，不是当前官方资料缺失；`src/schemas/providerSchema.ts:638` 将这些字段全列 unverified 的说明已经过时。sampler/scheduler/denoise 仍未从该云 REST 正文核实，不据此断言不支持。
- 尺寸接线缺口：`ModelScopeDriver.ts:38–39` 和 `server.ts:6365` 直接发 width/height，没有把成对画布尺寸映射为官方 `size`。手写 JSON 可以传 `size`，但不能替代普通画布路径修复。需要串行修改 Driver/请求 builder/schema；保留原尺寸与显式 JSON 覆盖记录，不暗改尺寸。
- LoRA 原文：`Single LoRA: "<lora-repo-id>"` / `Multiple LoRAs: {"<lora-repo-id1>": 0.6, "<lora-repo-id2>": 0.4}`；`Total weight of multiple LoRAs must sum to 1.0, up to 6 LoRAs`。`src/schemas/modelScopeLoras.ts:2–19` 使用仓库 ID / 权重映射且不自动改权重，格式匹配；这不证明具体底模已接受或 GPU 已应用 LoRA。
- 官方同页存在输入类型分歧：参数表 `image_url` 类型 string，但 Base64 输入例子是 `"image_url": [image_to_data_url(...)]`。当前 Driver 发单字符串；具体编辑模型的单图/多图契约仍需模型级正文及真实前端验证，不自行统一。
- 官方目录资料：https://www.modelscope.cn/docs/openapi ，原文 `Server:https://modelscope.cn/openapi/v1`、`GET /models 获取模型列表`；https://www.modelscope.cn/docs/model-service/API-Inference/limits 明确须识别 `API Inference` 标识。当前 `server.ts:2441–2486` 查的是仓库目录，并从名称/tags 推导类别，不是全部在线可生成目录。page_size/page_number/sort 的完整响应与分页契约此次未核实。
- 额外串行问题：`server.ts:6366` 可让 custom JSON 覆盖 model，但 trace/history 仍使用原 model（6379、6494）；6368–6369 又会覆盖手写 JSON 的 loras。需禁止 custom 路由/model 替换并显式记录 LoRA 覆盖来源，不能静默删意图。失败轮询 `server.ts:6464` 仅返回 errors，未完整保留 pollData（虽然 upstream trace 有原文）；应返回完整任务体。成功路径仅取第一张图片（6419、6456），多图持久化未验。

本轮无生成/上传调用。保留 10-06 的 429 欠费证据与等级；真实出图、尺寸/编辑输入、LoRA 应用、批量、历史刷新仍未验收。

## 2026-10-06 历史最小请求与修复记录（incoming 72f5372 保留）

日期:2026-10-06(UTC+8)。验收方式:真实前端 ComfyCanvas Studio @ 127.0.0.1:3000，通过 CDP 完整执行「选择供应商 → 选择模型 → 清理未核实参数 → 网页运行 → 查看执行记录」。

### 结论

**PASS_BILLING** — 页面显式选择 ModelScope CN 与 `Tongyi-MAI/Z-Image-Turbo` 后，真实请求到达 `https://api-inference.modelscope.cn/v1/images/generations`；上游返回 **HTTP 429 Too Many Requests**，业务原文明确为 `insufficient balance`。前端准确展示真实状态、响应体、端点与异常栈，没有根据 429 状态码猜欠费，没有切换到 ModelScope AI 或其他供应商，也没有生成假图片。

### 本轮请求为何只发 model + prompt

2026-10-06 当次验收未重新核实官方云端 REST 资料中 `seed/steps/cfg/sampler/scheduler/denoise` 的完整模型级支持范围。为避免把本地 Diffusers 参数当成云端契约，本轮先做最小接线/账户状态验收，只保留明确模型 ID 与 prompt；未核实字段全部从页面清空，不把 0 或旧供应商残留值冒充用户输入。2026-10-12 的官方正文复核范围见上节，不改变本次历史请求的验收等级。

本轮同时修复了两个影响验收真实性的问题:
- 可选数字字段清空时曾被 UI 写成 `0`；现在空值保存为 `undefined`，seed/steps/cfg/denoise 不再被伪造为 0。
- ModelScope 的 sampler/scheduler/denoise 之前因“未核实”被本地标成 unsupported；现改为 unverified，未知能力不再冒充“不支持”，用户可以明确保留或清空并交由实际上游验证。

### 前端证据链

1. Provider 显式切换为 `modelscope`（魔搭 CN）。
2. 模型中心按原始 ID 选用 `Tongyi-MAI/Z-Image-Turbo`；选用后 provider 仍为 `modelscope`，没有按模型名改路由。
3. Prompt:
   `A small ceramic robot tending a bonsai tree on a clean wooden desk, warm morning window light, product photography`
4. 页面将 seed、steps、cfg、sampler_name、scheduler、denoise 全部清空；本地画布状态确认没有 seed/steps/cfg/denoise，仅保留空 sampler/scheduler 字段与 control_after_generate UI 状态。
5. 点击网页「运行工作流」一次；没有失败后自动换 key/provider/model/endpoint 重试。
6. 实际上游:
   - method: `POST`
   - endpoint: `https://api-inference.modelscope.cn/v1/images/generations`
   - requestBody:
     `{"model":"Tongyi-MAI/Z-Image-Turbo","prompt":"A small ceramic robot tending a bonsai tree on a clean wooden desk, warm morning window light, product photography"}`
7. 上游真实响应:
   - status: **429**
   - statusText: `Too Many Requests`
   - responseBody: `{"errors":{"message":"insufficient balance"},"request_id":"c8fe85df-99be-4348-a34a-82a580fd12d2"}`
   - masked credential: `ms-b...266c`
   - duration: 318ms
8. 应用保留上游原文并分类为:
   `魔搭国内站 (modelscope.cn) 账户额度不足 [429]: ...insufficient balance...`
   `errorSource=upstream`，网站 HTTP 同为 429。
9. 没有图片、没有成功历史；运行按钮恢复可用。

### 判定边界

本次仅通过 **ModelScope CN 当前图像生成路由的前端接线与计费限制处理**，因此记 `PASS_BILLING`。没有真实图片，不能记 PASS_GENERATION；也不能把该结论外推到 ModelScope AI、其他模型、LoRA、图生图或视频。
