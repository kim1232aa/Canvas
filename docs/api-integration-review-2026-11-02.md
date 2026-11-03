# API 集成核对记录 — 2026-11-02

本轮逐项检查仓库声明的供应商及通用视频执行路径。证据是当前代码、官方公开文档/OpenAPI/SDK，以及少量不带密钥的目录 GET；未使用真实密钥，也未提交生成任务。下表中的“核对”仅指列出的接口形状，不代表所有模型、参数、账户或网页端生成已通过。兼容中转的行为取决于用户实际配置的服务，官方 xAI/OpenAI 文档不能证明任意中转完全兼容。

## 2026-11-03 续查及固定表盘点

- SenseNova 官方站加载的文档正文列有需 Bearer 的 `GET https://token.sensenova.cn/v1/models`；应用已改为按配置凭据读取目录。`reasoning` 与 `reasoning_content` 原始字段分别保留。未用真实密钥验证账号权限。
- Sogni 的 hosted-tool selector 和 Schema 改为实时读取[官方仓库文件](https://github.com/Sogni-AI/sogni-protocol/blob/main/schemas/tools/generate_image.schema.json)。本次在线 Schema 的 enum 有 30 项，本地旧 alpha.46 包有 27 项；两者 `schemaVersion` 均为 `2026-07-18.1`，因此不能仅凭版本字符串断言内容相同。worker 目录的 ID 空间保持独立。获取失败会报告错误，不用旧包兜底。
- Civitai videoGen 根据[官方视频 OpenAPI](https://orchestration.civitai.com/v2/consumer/recipes/videoGen/openapi.json)解析用户指定的 engine/version/provider/operation 及字段形状，不再依赖固定 engine 列表。Wan 2.1 与 LTX2.3 的实际官方 Schema 做过离线映射测试；未提交真实生成。Schema 请求失败会报错并停止，不自动换用静态表或猜测字段。
- Krea 旧预设错误填入 Sogni selector，已改为要求用户在实时目录选择。Novita 目录不再对所有 checkpoint 虚构 `supportsLora: true`；未知能力保留未知。DeepInfra 图像 MIME 根据结果字节识别；WaveSpeed 在用户明确请求 base64 时按实际字节识别。
- 模型选择器不再在最新查询失败或返回空列表时把上次目录作为当前目录；用户当前选择仍可见。Mage 不再使用固定的比例和分辨率本地白名单，原值交上游判定。
- 仍有固定数据：`src/schemas/providerSchema.ts` 包含 Gemini、Fal、Civitai、Replicate 等本地模型字段/能力快照，部分会用于参数映射或本地判断；`src/constants/presets.ts` 含预填的工作流模型；部分 `src/engines/drivers/*` 的 `supportedModels` 为静态元数据。Novita 的 `src/config/providerDeclarations/novita.txt2img.json` 是静态通用端点声明，不是实时的逐模型 Schema。这些尚未全部替换为实时 API，不能称所有硬编码均已移除。
- ModelScope：2026-11-02 后补核——中英文 [API-Inference intro](https://www.modelscope.cn/docs/model-service/API-Inference/intro) 浏览器现页参数表有可选 `seed`（`[0, 2³¹-1]`）；curl SPA 仍可能空壳。API 400 旁证 `seed must be in [-1, 2147483647]`，与表下限冲突则提示不硬拦、失败原样。详见 `docs/evidence/modelscope-seed-official-2026-11-02.md`。其余模型/账户/视频路径仍未全核；本审计分支未用真密钥生成。

| 供应商/路由 | 本轮资料和核对范围 | 结果与边界 |
| --- | --- | --- |
| Fal | [目录及模型 OpenAPI](https://api.fal.ai/v1/models?endpoint_id=fal-ai/flux-lora&expand=openapi-3.0)、[队列文档](https://fal.ai/docs/documentation/model-apis/inference/queue)；鉴权、所选端点、视频错误处理 | 已去除视频按名称猜测类型与错误状态写错；未逐个模型验证。 |
| Hugging Face | [Hub API](https://huggingface.co/docs/hub/api)、[推理 SDK Fal adapter](https://github.com/huggingface/huggingface_hub/blob/main/src/huggingface_hub/inference/_providers/fal_ai.py)、[Z-Image Space Schema](https://tongyi-mai-z-image-turbo.hf.space/gradio_api/info) | 精确仓库补查错误与 Space 下载失败误报成功已修；其他 provider/model 组合未全部验证。 |
| Replicate | [OpenAPI](https://api.replicate.com/openapi.json)；带版本与不带版本的预测提交、schema 查询和轮询 | 版本预测端点已修；调用方 schema 未经版本验证会标记。没有可用 schema 的手写 JSON 专用路径仍受限。 |
| Civitai | [消费端 OpenAPI](https://orchestration.civitai.com/openapi/v2-consumers.json)、[videoGen OpenAPI](https://orchestration.civitai.com/v2/consumer/recipes/videoGen/openapi.json)、[Wan/LTX recipe](https://developer.civitai.com/orchestration/recipes/ltx2) | 图像/视频改跟实时 OpenAPI 解析 engine/version（含 ltx2.3）；勿再用静态引擎名单。本地字段快照仍会过期；未做真实生成。 |
| Google Gemini | [官方生成协议](https://github.com/googleapis/googleapis/blob/master/google/ai/generativelanguage/v1beta/generative_service.proto)、[JS SDK 类型](https://github.com/googleapis/js-genai/blob/main/src/types.ts)；图像配置和响应模态 | 图像输出模态已补；没有真实密钥测试或模型逐项能力验证。 |
| ModelScope CN | [API-Inference 文档](https://modelscope.cn/docs/model-service/API-Inference/intro)（浏览器现页）；[seed 核实记录](./evidence/modelscope-seed-official-2026-11-02.md)；站点与令牌隔离的本地代码 | `seed` 字段已核：可选 int，官方表现页 `[0, 2³¹-1]`；上游 400 旁证含 `-1`。curl SPA 仍可能空；完整 REST/全模型未核；视频路径明确未接入。 |
| ModelScope AI | [国际站 intro](https://www.modelscope.ai/docs/model-service/API-Inference/intro?lang=en)；与 CN 路由隔离 | 国际站 intro 现页同有 `seed`/`[0,2^31-1]`；托管推理全契约与逐模型能力仍未全核，不能断言全部正确。 |
| SenseNova | [项目官方入口](https://platform.sensenova.cn/)；本地 chat 和图像路由、错误处理 | 未取得足以验证各模型图像/推理参数的官方原始文档，能力未确认。 |
| Agnes | [图像 2.5 Flash](https://wiki.agnes-ai.com/en/docs/agnes-image-25-flash.md)、[视频 2.5](https://wiki.agnes-ai.com/en/docs/agnes-video-25.md)；图像提交、视频提交与轮询 | 所核对字段/路径形状一致；视频每 5 秒轮询，官方建议 1–2 秒。未验证真实模型生成。 |
| OpenAI 兼容中转 | [OpenAI OpenAPI](https://github.com/openai/openai-openapi)；图像生成和编辑请求形状 | 只核对标准请求示例；用户自设中转的端点和能力未确认。 |
| Grok/xAI 兼容中转 | [xAI Imagine 文档](https://docs.x.ai/developers/model-capabilities/imagine.md)；图像与视频核心字段 | 示例形状有对应关系；自设中转不等同官方 xAI，兼容性未实测。 |
| AIMLAPI | [官方 SDK](https://github.com/aimlapi/aimlapi-sdk-node)、[示例模型 Schema](https://api.aimlapi.com/docs-json?model=alibaba%2Fz-image-turbo-lora&endpoint=openai%2Fimage-generations) | 能力不再从名称猜测；官方 Schema 明示的自动回退会拦截。base64 输出 MIME 已修；其他模型未逐项核实。 |
| Venice | [图像 API](https://docs.venice.ai/api-reference/endpoint/image/generate.md)、[视频队列](https://docs.venice.ai/api-reference/endpoint/video/queue) | 二进制、JSON base64 格式处理已修；没有真实生成。 |
| Novita | [官方文档索引](https://docs.novita.ai/llms-full.txt)；V3 提交及 task-result 轮询 | 所查请求形状和路径有官方依据；默认 JPEG 注入及目录对 checkpoint 的 LoRA 能力声明仍需逐模型复核。 |
| DeepInfra | [OpenAPI](https://api.deepinfra.com/openapi.json)、[图像生成](https://docs.deepinfra.com/apis/image-generation) | 所查动态 Schema 与 OpenAI 兼容图像路径相符；输出真实图片格式不能从示例外推所有模型。 |
| Together | [官方 TypeScript SDK 图像接口](https://github.com/togethercomputer/together-typescript/blob/main/src/resources/images.ts)、[Python 图像接口](https://github.com/togethercomputer/together-python/blob/main/src/together/resources/images.py)、[视频接口](https://github.com/togethercomputer/together-python/blob/main/src/together/resources/videos.py) | base64 MIME 硬编码已修；其他模型与视频参数未全部核验。 |
| MuAPI | [OpenAPI](https://api.muapi.ai/openapi.json)、[模型目录](https://api.muapi.ai/api/v1/models) | 核对目录、认证、提交及任务查询形状；未做生成或逐模型核验。 |
| WaveSpeed | [REST 文档](https://wavespeed.ai/docs/rest-api)、[示例模型](https://wavespeed.ai/models/wavespeed-ai/krea-v2/turbo-lora/llms.txt) | 已避免把未知输出对象转成假 URL；轮询错误立即报告，不自动重试，上游任务可能仍运行。 |
| Krea | [OpenAPI](https://api.krea.ai/openapi.json) | 核对图像/视频操作、styles、jobs；未授权 styles 请求返回 401，未验证账户权限和生成。 |
| Sogni | [工作流 API](https://docs.sogni.ai/api-reference/workflows/)、[LoRA 目录](https://api.sogni.ai/v1/loras/comfy)、[协议 Schema](https://github.com/Sogni-AI/sogni-protocol/blob/main/schemas/tools/generate_image.schema.json) | 已校验目录能确认的 LoRA 强度并披露未知/查询失败；未知兼容性及真实生成仍需验证。 |
| Runware | [模型搜索](https://runware.ai/docs/models-api/model-search.md)、[任务轮询](https://runware.ai/docs/models-api/task-polling.md)、[认证](https://runware.ai/docs/models-api/authentication.md) | 目录异常响应与错误透传已修；未验证所有模型或运行时生成。 |
| ModelsLab | [官方文档索引](https://docs.modelslab.com/llms.txt)；认证、图像任务和 fetch | 批量数传递、目录和轮询异常透明处理已修；未做真实生成。 |
| Mage | [Mango API](https://docs.mage.space/api/models/mango)；鉴权、Mango 提交/状态 | 已要求显式模型并保留用户指定 ID，seed 不再静默取整；当前只接 Mango 路由，其他架构未接入。 |
| NanoGPT | [图像生成](https://docs.nano-gpt.com/api-reference/endpoint/image-api-generate.md)、[模型端点](https://docs.nano-gpt.com/api-reference/endpoint/image-api-model-endpoints.md)、[视频](https://docs.nano-gpt.com/api-reference/endpoint/video-generation.md) | 图像核心路径/鉴权已对照；视频终态与错误透传仍有待修正，需区分本站与上游 HTTP。 |
| Tensor.Art TAMS | [集成 FAQ](https://tams-docs.tensor.art/docs/api/guide/integration-faq/)、[模型详情](https://tams-docs.tensor.art/docs/api/apis/tams-api-v-1-service-get-model/) | 当前生成路由明确返回本地未接入；页面正文/权限不足以验证完整任务链。 |
| Tensor.Art OpenWorks | [官方工具技能](https://github.com/Tensor-Art/tensorart-skills/blob/master/skills/tensorart-generate/SKILL.md)；工具目录、任务创建/查询代码 | 与 TAMS 分开处理；官方 skill 不是完整 API Schema，未知状态/缺失任务 ID 的错误透明度仍需检查。 |

`video` 是画布执行驱动而不是独立供应商。MuAPI、Krea、AIMLAPI、Venice 的部分视频目录到画布视频执行路径仍未接通，不应把目录存在视为已支持。
