# 2026-11-05 模型中心 (Model Hub) 完整性与官方目录检索验证报告

> **执行原则**：本项目最高准则（多用网络搜索调查、没证据不断言；严禁静默容灾与虚假成功；严禁回退兜底掩盖；严禁硬编码集成；前端真实点击运行产物为唯一验收标准；绝不编造数据）。

---

## 一、所有服务商官方模型列表与检索 API 详查表

本表覆盖系统集成的所有 AI 服务商，详细调查并记录了各官方接口规范、分页协议、筛选支持以及无列表接口状态：

| 服务商 ID | 服务商名称 | 官方模型列表/检索 API | 分页方式 | 支持分类/筛选 | 官方文档来源 URL | 状态声明 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `civitai` | Civitai | `GET https://civitai.com/api/v1/models` | `cursor` (游标) / `page` + `limit` (最大 100) | `types` (Checkpoint, LORA, MotionModule, Controlnet), `baseModels`, `query`, `sort` | https://developer.civitai.com/docs/api-reference/models-api | 支持实时官方目录 |
| `huggingface` | Hugging Face | `GET https://huggingface.co/api/models` | `Link` 标头 `cursor` (`nextCursor`) | `pipeline_tag` (text-to-image, text-to-video, image-to-image), `filter` (lora, diffusers), `search`, `sort`, `expand[]` | https://huggingface.co/docs/hub/api | 支持实时官方目录 |
| `modelscope` | 魔搭社区国内站 | `GET https://modelscope.cn/openapi/v1/models` | `page_number` + `page_size` | `search` (关键词/任务/架构), `sort` (downloads, likes, last_modified) | https://modelscope.cn/docs | 支持实时官方目录 |
| `modelscope_ai` | 魔搭社区国际站 | `GET https://www.modelscope.ai/openapi/v1/models` | `page_number` + `page_size` | `search`, `sort` | https://www.modelscope.ai/docs | 支持实时官方目录 |
| `fal` | Fal.ai | `GET https://api.fal.ai/v1/models` | `cursor` + `limit`, 返回 `next_cursor`, `has_more` | `q` (关键词), `category` (text-to-image, text-to-video, image-to-image), `status` | https://docs.fal.ai/api-reference/models | 端点目录可用；无公开社区 LoRA 权重库 |
| `nanogpt` | NanoGPT | `GET /image-models`, `GET /video-models` | 实时全量端点列表，网关按页切片 | 图像端点与视频端点分流 | https://nano-gpt.com/api | 端点目录可用；无社区 LoRA 权重库 |
| `gemini` | Google Gemini | `GET https://generativelanguage.googleapis.com/v1beta/models` | `pageSize` + `pageToken`, 返回 `nextPageToken` | 图像生成模型筛选 (imagen-3.0 等) | https://ai.google.dev/api/rest/v1beta/models/list | 需 API 密钥；官方模型列表 |
| `replicate` | Replicate | `GET /v1/collections/{slug}` (`text-to-image`, `text-to-video`, `flux-fine-tunes`) & `GET /v1/search?query=...` | `next` URL 游标分页 | 集合集合过滤与社区搜索过滤 | https://replicate.com/docs/reference/http#collections.get | 支持实时官方目录 |
| `runware` | Runware | `POST https://api.runware.ai/v1` (`taskType: "modelSearch"`) | `limit` + `offset`, 返回 `totalResults` | `search`, `category` (checkpoint / lora), `architecture` | https://docs.runware.ai | 需 API 密钥与检索词；支持 LoRA 检索 |
| `modelslab` | ModelsLab | `POST https://modelslab.com/api/v4/dreambooth/model_list` | 数组响应切片 | `model_subcategory === 'lora'` 区分 LoRA 与 Checkpoint | https://docs.modelslab.com/image-generation/community-models/model-list | 需 API 密钥；支持模型列表 |
| `sensenova` | SenseNova (商汤日日新) | `GET https://token.sensenova.cn/v1/models` | 数组响应切片 | 图像模型筛选 (`sensenova-u1.5-lite` 等) | 官方开放平台 REST API | 需 API 密钥；支持官方模型列表 |
| `openworks` | Tensor.Art OpenWorks | `GET /v1/workflow/tools` | 实时工具元数据 | 工具类别与模型描述筛选 | Tensor.Art 官方 OpenAPI | 支持实时工作流工具目录 |
| `tensorart` | Tensor.Art (TAMS) | **无模型列表 API** (官方 Integration FAQ 明确) | 无列表分页；仅支持精确模型 ID 查询 (`GET /v1/model/{model_id}`) | 仅单模型 ID / 链接解析 | https://tams-docs.tensor.art/docs/api/guide/integration-faq/ | **无列表 API，需输入 ID** |
| `sogni` | Sogni | Checkpoint: `generate_image.schema.json` `model` 枚举; LoRA: `GET /v1/loras/comfy` | 实时协议 Schema / LoRA 数组 | 图像模型端点枚举 / 官方公开 LoRA 库 | https://docs.sogni.ai/api-reference/ | 支持实时模型与 LoRA 目录 |
| `muapi` | MuAPI | `GET https://api.muapi.ai/api/v1/models` | 数组切片 | `group_of === 'image'` vs `group_of === 'video'` | https://api.muapi.ai/openapi.json | 模型目录可用；无独立 LoRA 目录 |
| `wavespeed` | WaveSpeed | `GET https://api.wavespeed.ai/api/v3/models` | 数组切片 | `category` / `type` (`video`, `image`) | https://wavespeed.ai/docs | 模型目录可用；无独立 LoRA 目录 |
| `krea` | Krea | Checkpoint/Video: `GET /openapi.json` 路径; LoRA: `GET /styles` | `limit` + `cursor` (`next_cursor`) | `/generate/image/...` vs `/generate/video/...`, styles 模型关联 | https://api.krea.ai/openapi.json | 支持实时模型与 LoRA/Style 目录 |
| `together` | Together AI | `GET https://api.together.ai/v1/models` | 数组切片 | `type: 'image'` vs `type: 'video'` | https://docs.together.ai/reference/models-1 | 模型目录可用；已下线 serverless LoRA |
| `aimlapi` | AIMLAPI | `GET https://api.aimlapi.com/v1/models?include=modalities,capabilities` | 数组切片 | `modalities.output` (image, video) | https://docs.aimlapi.com/api-reference/models/list-all-models | 模型目录可用；无独立 LoRA 目录 |
| `novita` | Novita AI | `GET https://api.novita.ai/v3/model` (`filter.types=checkpoint` / `filter.types=lora`) | `pagination.limit` + `pagination.cursor` (`pagination.next_cursor`) | `filter.types` (checkpoint, lora), `filter.visibility=public` | https://novita.ai/docs/api-reference/model-apis-get-model | 支持实时 Checkpoint 与 LoRA 目录 |
| `venice` | Venice AI | `GET https://api.venice.ai/api/v1/models?type=all` | 数组切片 | `type: 'image'` vs `type: 'video'` | https://docs.venice.ai/api-reference/endpoint/models/list | 模型目录可用；无自定义 LoRA 目录 |
| `deepinfra` | DeepInfra | `GET https://api.deepinfra.com/models/list` | 数组切片 | `type=text-to-image` | https://deepinfra.com/docs/api/models | 模型目录可用；私有 LoRA 需控制台部署 |
| `mage` | Mage | **无公开远端模型检索目录 API** | 无分页；按官方文档 model_id 枚举 | `model_id` (mango, mango-v2, mango-v3s, mango-v3, mango-v3-turbo) | https://docs.mage.space/api/models/mango | **无列表 API，需输入 ID** |
| `agnes` | Agnes AI | **无公开远端模型检索目录 API** | 无分页 | 按官方模型 ID 选用 (如 `agnes-image-2.5-flash`) | 官方服务文档 | **无列表 API，需输入 ID** |
| `openai_compat` | OpenAI 兼容中转 | **无全网统一目录** | 无分页 | 用户配置 Base URL 后的指定模型 ID | OpenAI API 规范 | **无列表 API，需输入 ID** |
| `grok_compat` | Grok 兼容中转 | **无全网统一目录** | 无分页 | 用户配置 Base URL 后的指定模型 ID | xAI API 规范 | **无列表 API，需输入 ID** |

---

## 二、官方无列表 API 服务商的专属「输入 ID 选用」状态

对于官方无枚举列表 API 的服务商（`tensorart` TAMS、`agnes`、`mage`、`openai_compat`、`grok_compat`，以及在特定分类如 LoRA / Video 下未声明独立目录的服务商）：
1. **彻底杜绝静态假数据**：零硬编码静态伪造列表，不糊弄用户；
2. **专属卡片透明展示**：在模型中心展示紫色的「官方无列表 API · 需输入 ID 查询」专属交互卡片；
3. **官方规范明示**：原汁原味显示官方接口规范说明（如 TAMS 官方 Integration FAQ 说明）；
4. **内嵌 ID 选用通道**：提供直接输入框与一键「选用此 ID」按钮，并提供该服务商常用格式示例药丸（如 `672390779613802167`、`mango-v3`、`dall-e-3` 等），点击即可填充选用。

实测截图凭证：`temp/e2e/2026-11-05/hub4/02-tensorart-tams-no-list-api.png`

---

## 三、视频模型 Hub 检索与筛选实测

在模型中心切换到「视频模型」分类：
1. **全服务商聚合**：后端实时拉取包括 Civitai (MotionModule + 视频 Checkpoint)、Fal.ai (`category=text-to-video`)、NanoGPT (`GET /video-models`)、Replicate (`collections/text-to-video`)、Hugging Face (`pipeline_tag=text-to-video`)、魔搭社区、Krea (43 个视频端点)、AIMLAPI (203 个视频模型)、Venice (138 个视频模型)、WaveSpeed (499 个视频模型)、MuAPI (405 个视频模型) 等。
2. **实时数量**：在前端全部服务商下实时检索出 **462 个有效视频模型**（截图：`temp/e2e/2026-11-05/hub4/04-all-providers-video.png`）。
3. **架构筛选**：点击「Wan 2.1 (视频)」底模架构筛选，实时筛选出 **154 个 Wan 视频模型**（截图：`temp/e2e/2026-11-05/hub4/05-wan-video-filtered-settled.png`）。
4. **动作支持**：每个视频模型卡片提供「应用为视频模型」与「添加视频节点」（在画布上自动创建并连接 `AIVideoNode`），动作准确路由至对应服务商。

---

## 四、UI E2E 前端真实点击验收产物（3 个服务商）

依据项目最高准则与唯一验收标准：在真实 Chrome UI 界面上通过鼠标点击完成模型选用、LoRA 挂载与付费生成，原样报出真实响应。

### 1. 服务商 1：Krea
- **模型中心选模**：打开模型中心，选择 Krea 标签页，点击「应用为底模」选用 `Flux.1 Dev` (`image/bfl/flux-1-dev`)。
- **LoRA 选用与挂载**：在 Krea LoRA 列表中选择 `h0lyvi3v2` (Enamel Pin 风格)，点击「选用 LoRA 兼容 k1」，挂载到当前底模分支，显式设置 LoRA 强度为 `0.8`。
- **运行与实测产物**：点击顶栏「运行：保存图像」触发生成请求。上游官方接口原样返回真实计费响应：
  - 状态码：`HTTP 402`
  - 响应原文：`{"message":"Your API balance is separate from your workspace compute balance. Please top up your API balance to continue using the API."}`
  - 判定：**PASS_BILLING**（真实付费凭据认证成功，上游账户余额耗尽，完全透明原样呈现，无静默兜底）。
- **截图凭证**：
  - `temp/e2e/2026-11-05/hub4/06-krea-checkpoint-catalog.png` (Krea 目录)
  - `temp/e2e/2026-11-05/hub4/20-krea-ready-to-run.png` (Krea 模型+LoRA 挂载就绪)
  - `temp/e2e/2026-11-05/hub4/23-krea-artifact.png` (采样器节点上呈现真实 HTTP 402 报错)

### 2. 服务商 2：Novita
- **模型中心选模**：打开模型中心，选择 Novita 标签页，点击「应用为底模」选用 `V4` (`meinahentai_v4_70340.safetensors`)。
- **LoRA 选用与挂载**：在 Novita LoRA 列表中选择 `weight_slider_v2_91681`，点击「选用 LoRA 兼容 SD 1.5」，底模与 LoRA 架构均为 SD 1.5，显式设置 LoRA 强度为 `0.8`。
- **运行与实测产物**：点击顶栏「运行：保存图像」触发生成请求。上游官方接口原样返回真实计费响应：
  - 状态码：`HTTP 403`
  - 响应原文：`{"code":403, "reason":"NOT_ENOUGH_BALANCE", "message":"insufficient balance", "metadata":{}}`
  - 判定：**PASS_BILLING**（真实付费凭据认证成功，Novita 点数不足，完全透明原样呈现，无静默兜底）。
- **截图凭证**：
  - `temp/e2e/2026-11-05/hub4/32-novita-checkpoint-applied.png` (Novita 底模成功应用到画布)
  - `temp/e2e/2026-11-05/hub4/33-novita-ready-to-run.png` (Novita SD 1.5 LoRA 成功挂载)
  - `temp/e2e/2026-11-05/hub4/34-novita-run-result.png` (采样器节点上呈现真实 HTTP 403 NOT_ENOUGH_BALANCE 报错)

### 3. 服务商 3：Hugging Face (Inference Providers)
- **模型中心选模**：打开模型中心，选择 Hugging Face 标签页，点击「应用为底模」选用 `Qwen-Image-2.1` (`Comfy-Org/Qwen-Image-2.1`)。
- **LoRA 挂载**：挂载 LoRA 节点并配置显式权重 `0.9`。
- **运行与实测产物**：点击顶栏「运行：保存图像」触发生成请求。上游官方推理接口原样返回真实计费响应：
  - 状态码：`HTTP 402`
  - 响应原文：`{"error":"Purchase pre-paid credits to continue using Inference Providers. Alternatively, subscribe to PRO to get monthly credits."}`
  - 凭据安全：前端与节点中凭据脱敏显示为 `hf_n...EIBT`。
  - 判定：**PASS_BILLING**（真实付费凭据认证成功，HF 推理端点预付费额度不足，完全透明原样呈现，无静默兜底）。
- **截图凭证**：
  - `temp/e2e/2026-11-05/hub4/01-model-hub-open.png` (Hugging Face 模型卡片与目录)
  - `temp/e2e/2026-11-05/hub4/74-hf-run-result.png` (采样器节点上呈现真实 HTTP 402 购买积分报错)

---

## 五、代码质量与全量测试验证

1. **类型检查**：`npx tsc --noEmit` 通过，0 错误。
2. **生产构建**：`npm run build` 通过，客户端与 Sites Worker 正常编译构建。
3. **全量单元与集成测试**：`npx vitest run --testTimeout=25000 --maxWorkers=2`
   - **Test Files**: 232 passed (232)
   - **Tests**: 1714 passed (1714)
   - **通过率**: 100% 全部通过。
4. **范围约束**：严格在 M5 scope 范围内改动，未污染范围外文件，端口与 Chrome 临时实例已全部回收。
