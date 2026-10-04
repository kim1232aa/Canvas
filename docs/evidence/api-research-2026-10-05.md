# 供应商 API 官方文档取证（2026-10-05）

规则：本文件只记录本轮亲自检索到的官方文档/官方 OpenAPI 事实。找不到的标「未能核实」。
检索方式：web 搜索 + 官方文档站抓取；civitai/tensor/hf 域名在本环境经本地 mihomo 代理（127.0.0.1:7890，Clash 订阅，节点 JP住宅·SonyNURO·exit-01）访问。

## 网络环境事实（本轮实测）
- 沙箱直连与 6 个 socks5 出口均无法访问 civitai.com / huggingface.co / tams.tensor.art（000）。
- 本地 mihomo 代理后：civitai.com 200、orchestration.civitai.com 200、huggingface.co 200、router.huggingface.co 404（服务在线）、tams.tensor.art 200、tams-api.tensor.art 404（服务在线）、api.tensor.art 405（服务在线）。
- 直连即可达：fal.ai、modelscope.cn、api-inference.modelscope.cn、api-inference.modelscope.ai、nano-gpt.com、api.muapi.ai、api.wavespeed.ai、api.sogni.ai。
- 结论：本环境可对全部 10 家做真实前端验收，无 BLOCKED_ENV。

## MuAPI（https://muapi.ai/docs/quick-start 与 /docs/api-reference，本轮亲取）
- 认证：请求头 `x-api-key: KEY`。base `https://api.muapi.ai/api/v1`。
- 提交：`POST /api/v1/{endpoint}`（endpoint 为模型目录中的端点标识）；响应含 `request_id`、`status`、`cost` 对象。
- 轮询：`GET /api/v1/predictions/{request_id}/result`；状态 queued/pending/processing/completed/failed/cancelled；完成时 `outputs[]` 为 URL。
- 目录：live model catalog（文档建议以实时目录与各模型 Playground 为准）；`GET /api/v1/models`；机器可读 Schema：`GET https://api.muapi.ai/openapi.json`。
- 余额：`GET /api/v1/account/balance`；响应头 `X-Account-Balance`（USD）。
- 文件上传：`POST /api/v1/upload_file`（multipart，返回可传 image_url 的 URL）。
- 仓库代码对照：schemaProviders.ts 的 muapi 路径（catalog/models + openapi + submit/predictions/result）与官方一致。✅

## WaveSpeed（https://wavespeed.ai/docs/get-started-api、/api-authentication、/docs-api/wavespeed-ai/krea-v2-turbo-lora，本轮亲取）
- 认证：`Authorization: Bearer KEY`。提交 `POST https://api.wavespeed.ai/api/v3/{model_id}`；轮询 `GET /api/v3/predictions/{id}/result`；终态 completed / failed / cancelled / timeout / deleted；成功时 `data.outputs[]`。
- 目录：`GET /api/v3/models` 返回 `data[]`，含 `model_id`、`name`、`type`、`api_schema.api_schemas[]`（其中 type=model_run、method=POST 的项含 server/api_path/request_schema）。与仓库 wavespeed 解析一致。✅
- krea-v2/turbo-lora 官方能力：prompt、aspect_ratio、resolution（1k/2k）、strength（图生图）、seed、image；**LoRA：单请求最多 3 个，每个 `{path, scale}`**。
- Key 生成即激活；余额不足/需付费组织时请求会明确报错（文档明确区分权限 403 与计费）。
- 错误码文档存在「Error Codes」一节（页面动态渲染未抓到表），具体欠费原文以前端实测为准。

## Sogni（https://docs.sogni.ai 首页 + 搜索到的 API/SDK 参考，本轮取证）
- base `https://api.sogni.ai/v1`，认证 `Authorization: Bearer KEY`。
- 生成：`POST /v1/creative-agent/workflows`，body `{input:{title, steps:[{id, toolName:'generate_image', arguments:{...}}]}}`；轮询 `GET /v1/creative-agent/workflows/{workflowId}`；产物在 steps[].artifacts[].url。
- 模型 selector 是工作流选择器字符串（如 `krea-2-turbo`、`z-turbo` 等），**与 worker 的 modelId 是不同命名空间，不能互转**——仓库注释与此一致。✅
- LoRA：`arguments.loras`（ID/URL 数组）+ `arguments.loraStrengths`（位置对应强度数组）；仅部分 selector 支持（文档：generate_image 的 krea-2-turbo 等）；强度支持负值（bipolar）；上限 8 个。
- 目录：`GET /v1/model-catalog?mediaType=image&include=parameters`；LoRA 目录：`GET /v1/loras/comfy`（可带 modelId 过滤）。与仓库路径一致。✅

## Civitai（官方开发者文档搜索取证；域名本环境需代理）
- Orchestration API：工作流式提交，recipe `textToImage`（`POST https://orchestration.civitai.com/v2/consumer/workflows` 系），认证 Bearer。
- 资源标识用 **AIR URN**（`urn:air:sd1:lora:civitai:{modelId}@{versionId}` 形式）；LoRA 以 `{airUrn: strength}` 映射提交。
- 公共目录 REST：`/api/v1/models`、`/api/v1/model-versions/{id}`。
- 仓库 CivitaiDriver 历史已有成功出图记录；本轮需复核实际提交字段与 AIR 构造。

## Fal.ai（https://fal.ai/models/fal-ai/flux-lora/api 搜索取证；域名直连可达）
- 队列式：`POST https://queue.fal.run/{model_id}`，轮询 status/result；认证 `Authorization: Key KEY`。
- flux-lora 参数：`loras: [{path, scale}]`（scale 0–4，最多 3 个）、prompt、image_size/宽高、num_inference_steps、guidance_scale、seed、num_images 等。
- 历史证据：403 原文 `User is locked. Reason: TOP_UP.` 属明确计费原文；本轮前端复核。

## Hugging Face（官方 docs 搜索取证；域名本环境需代理）
- Inference Providers 文本生图：经 provider 路由（fal/Replicate/WaveSpeed 等第三方或 HF 自家）；请求 `POST https://router.huggingface.co/{provider}` 或各 provider 路径，认证 `Authorization: Bearer hf_...`。
- 旧 `api-inference.huggingface.co` 已下线（DNS 不再解析）——仓库若仍有该路由须标注。
- 仓库有三条显式路由（HF Inference / Z-Image Space / HF→fal-ai），HF→fal-ai 必须用户显式选择。

## ModelScope（官方 API-Inference 文档搜索取证；直连可达）
- CN：`POST https://api-inference.modelscope.cn/v1/images/generations`，Bearer token；参数 model（必填）、prompt（必填）、negative_prompt、size、seed、steps、guidance。部分模型同步返回 `images[].url`，部分返回异步 task_id 需轮询。目录 `GET /v1/models`。
- AI 站（api-inference.modelscope.ai）独立账户体系，Key 不通用（交接已记历史 401）。

## NanoGPT（https://docs.nano-gpt.com/api-reference/image-generation 搜索取证）
- 归一化图像 API：`POST /api/v1/images`；模型发现 `GET /api/v1/images/models`，返回每模型 endpoint 元数据与 `supported_parameters`（含枚举/范围描述）。
- 认证 Bearer 或 x-api-key。
- 交接工单 A06：仓库 nanoImageApi.ts 把「未核实」当「不支持」拦截字段，应按 supported_parameters 实测整改。

## Tensor.Art TAMS（域名本环境需代理；官方文档站 tams-docs.tensor.art 搜索取证）
- 签名文档示例任务主机：`POST https://ap-east-1.tensorart.cloud/v1/jobs`（type DIFFUSION）；仓库常量 `TENSOR_MODEL_API = https://tams-api.tensor.art`（404=在线）。
- 官方 FAQ：暂无全量模型列表 API（交接已记）；按 ID 查 `GET /v1/models/{id}`。
- 历史：两把 key 对 TAMS 返回 404 `unauthorized / app not found` = 应用未授权，不是欠费。本轮前端复核原文。

## 未能核实项
- WaveSpeed 欠费具体原文（文档表未抓到）→ 前端实测为准。
- TAMS jobs 完整请求体字段（文档站可开后需再核对提交字段）。
