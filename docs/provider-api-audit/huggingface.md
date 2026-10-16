# Hugging Face Inference Providers API 审计

抓取日期：2026-10-15 Asia/Shanghai  
研究方法：官方 Inference Providers docs WebFetch；Grok CLI 401。  
范围：**Inference Providers / router**（非自建 Inference Endpoints）。

## 1) 官方 docs / OpenAPI URL

| 资源 | URL |
|------|-----|
| Inference Providers 总览 | https://huggingface.co/docs/inference-providers/index |
| Text-to-Image task | https://huggingface.co/docs/inference-providers/main/tasks/text-to-image |
| Text-to-Video task | https://huggingface.co/docs/inference-providers/main/tasks/text-to-video |
| Hub API（模型/provider 映射） | https://huggingface.co/docs/inference-providers/main/en/hub-api |
| Pricing & Billing | https://huggingface.co/docs/inference-providers/pricing |
| Chat router（仅 chat） | `https://router.huggingface.co/v1/chat/completions` |
| Models list（chat 向） | `GET https://router.huggingface.co/v1/models` |

Task 页含 Request/Response 字段表（API specification）。无单一「全任务 OpenAPI.json」；以 task 页 + provider 路由为准。

## 2) 鉴权方式

- Header：`Authorization: Bearer $HF_TOKEN`（文档写作 `'Bearer: hf_****'` 形态；实际标准为 `Bearer <token>`）
- Token：fine-grained，权限含 **Make calls to Inference Providers**（Settings → Tokens）
- 组织账单可选头：`X-HF-Bill-To: <org-name>`（或 Resource Group id）
- 亦可在设置中配置 **Custom Provider Key**（则由该 provider 直接计费，HF monthly credits 不适用）

## 3) 模型目录端点

| 方式 | 说明 |
|------|------|
| CLI | `hf models ls --warm --pipeline-tag text-to-image` / `text-to-video` |
| Hub model info | `inferenceProviderMapping`（expand）看哪家 provider 提供该模型 |
| `GET https://router.huggingface.co/v1/models` | **OpenAI 兼容 chat 模型列表**（文档明确 chat 向）；**不是**文生图完整目录 |
| Provider 能力表 | 总览页表格：Fal/Replicate/Together/WaveSpeed/Novita 等支持 Text to Image / Text to video 不等 |

画布应：按 Hub `pipeline_tag` + `inferenceProviderMapping` 动态发现，禁止把 chat `/v1/models` 当图像目录。

## 4) 生图 / 生视频端点与异步轮询

### 生图（官方公开）

推荐客户端：

```python
from huggingface_hub import InferenceClient
client = InferenceClient(api_key=os.environ["HF_TOKEN"])  # 或 provider="fal-ai" / "hf-inference" / "auto"
image = client.text_to_image(prompt, model="black-forest-labs/FLUX.1-dev")
```

HTTP：走 Inference Providers 路由（客户端封装）；**OpenAI 兼容 `router.huggingface.co/v1` 明确不支持 image generation**（总览 WARNING）。

Text-to-Image **Request**（官方 specification）：

| 字段 | 说明 |
|------|------|
| `inputs`* | string（prompt） |
| `parameters.guidance_scale` | number |
| `parameters.negative_prompt` | string |
| `parameters.num_inference_steps` | integer |
| `parameters.width` / `height` | integer pixels |
| `parameters.scheduler` | string |
| `parameters.seed` | integer |

Response：`image` 原始 bytes。

**异步**：HF 统一 task 规范为 **同步返回图像字节**；队列语义由底层 provider 消化。画布若需长超时，在应用层异步包装，勿假设 HF 有与 fal `queue.fal.run` 同构的公开 poll URL（除非改打 provider 原生 API）。

### 生视频（官方有公开 task API）

文档：https://huggingface.co/docs/inference-providers/main/tasks/text-to-video

```python
client = InferenceClient(provider="fal-ai", api_key=os.environ["HF_TOKEN"])
video = client.text_to_video("A young man walking on the street", model="Wan-AI/Wan2.2-TI2V-5B")
```

支持 Text-to-video 的 partner（总览表）：**Fal AI、Novita、Replicate、Together、WaveSpeedAI** 等（HF Inference 列未勾选 T2V）。

**Request parameters**：

| 字段 | 说明 |
|------|------|
| `inputs`* | prompt |
| `parameters.num_frames` | number — 生成帧数 |
| `parameters.guidance_scale` | number |
| `parameters.negative_prompt` | string[] |
| `parameters.num_inference_steps` | integer |
| `parameters.seed` | integer |

Response：`video` raw bytes。

**未在 HF 统一 schema 中列出**：`duration`（秒）、`resolution`、`fps` 独立字段——若某 provider 需要，须经 **provider 原生参数 / `extra_body`**，并查该模型在 provider 侧文档；**不要**伪造进 HF 标准表。

**异步**：同生图，客户端同步取回；长任务在应用层处理。

## 5) LoRA

### HF 统一 Text-to-Image / Text-to-Video specification

- 官方 task 参数表 **没有** `loras` / `lora_id` / `adapters` 字段
- 总览营销文案写「including support for LoRAs and style customization」——指 **生态/部分 provider 能力**，**不等于** router 统一 schema 已标准化 LoRA

### 实际接法（验收用）

1. **选本身支持 LoRA 的 provider 原生 endpoint**（例如经 Fal 的 `fal-ai/flux-lora`、`fal-ai/wan-t2v-lora`），用 HF 路由或 Custom Provider Key；LoRA 形状跟 **该 provider**（`path`+`scale` 等）
2. 或 `InferenceClient` 的 provider 特定扩展 / `extra_body`（hub 文档：`extra_body` 传 provider-specific 参数）——**必须**有该 provider 文档证据
3. 若仅 HF 标准 `parameters`：**不得**声称已接 LoRA；UI 应隐藏挂载

**不支持时**：拒绝发送假 LoRA；禁止静默剥离后报 PASS_GENERATION。

## 6) seed 与 steps / cfg / size

### 图像（进 `parameters`）

| 字段 | 类型 | 备注 |
|------|------|------|
| `seed` | integer | RNG seed |
| `num_inference_steps` | integer | denoising steps |
| `guidance_scale` | number | CFG |
| `width` / `height` | integer | 输出像素 |
| `negative_prompt` | string | |
| `scheduler` | string | 可选覆盖 |

### 视频（进 `parameters`）

| 字段 | 类型 | 备注 |
|------|------|------|
| `seed` | integer | |
| `num_inference_steps` | integer | |
| `guidance_scale` | number | |
| `num_frames` | number | 帧数（非秒） |
| `negative_prompt` | string[] | |

Provider 可能忽略部分参数；以映射后的 provider 行为为准，失败原样上报。

## 7) 计费 / 余额线索

来源：https://huggingface.co/docs/inference-providers/pricing

- **Pay-as-you-go**；HF **不加价**，透传 provider 费率
- PRO / Team / Enterprise：**每月 $2**（Team/Enterprise 按 seat）通用 compute credits，自动先扣
- Free：无 included credits，需购买 credits 或升级
- Routed by HF → 账单在 HF；Custom Provider Key → provider 直账单，**credits 不适用**
- hf-inference：按底层硬件 **时间 × 单价**（例文：FLUX 10s × $0.00012/s）
- 组织：`X-HF-Bill-To`；可设 spending limit、禁用部分 provider
- Usage API（Enterprise）：`/api/organizations/{name}/billing/usage/inference?...`
- **文档未强调 HTTP 402**；额度/支付问题以 HF 账单与错误响应为准，前端原样展示

## 验收对照要点

1. 图像/视频用 `InferenceClient` task API，**不要**用 OpenAI chat router 出图。  
2. 标准 schema **无 LoRA** → 接 LoRA 必须走 provider 原生字段并有文档。  
3. seed / steps / guidance / size(frames) 在 `parameters`；视频用 `num_frames` 而非瞎编 duration。  
4. 计费走 HF credits 或 BYO key，二选一要在配置里写清。
