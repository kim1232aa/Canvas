# fal.ai API 审计

抓取日期：2026-10-15 Asia/Shanghai  
研究方法：官方模型页 WebFetch + Queue docs；Grok CLI（grok-4.6）本轮 401，未用训练记忆填洞。

## 1) 官方 docs / OpenAPI URL

| 资源 | URL |
|------|-----|
| FLUX LoRA 文生图 | https://fal.ai/models/fal-ai/flux-lora/api |
| Krea 2 Turbo LoRA | https://fal.ai/models/fal-ai/krea-2/turbo/lora/api |
| Wan T2V LoRA（视频） | https://fal.ai/models/fal-ai/wan-t2v-lora/api |
| Queue / 异步推理 | https://fal.ai/docs/documentation/model-apis/inference/queue |
| Pricing | https://fal.ai/docs/documentation/model-apis/pricing |
| FAQ（余额锁定） | https://fal.ai/docs/documentation/model-apis/faq |
| Queue REST host | `https://queue.fal.run/{endpoint_id}` |

各模型页内嵌 Input/Output schema（等同 OpenAPI 字段表）。

## 2) 鉴权方式

- 环境变量：`FAL_KEY`
- HTTP：`Authorization: Key $FAL_KEY`（官方 Queue curl 示例原文）
- JS SDK：`fal.config({ credentials: "…" })`
- **禁止**浏览器端暴露 key；需服务端代理

## 3) 模型目录端点

- 产品侧靠 **Gallery / 模型页 endpoint id**（如 `fal-ai/flux-lora`），非单一「list all models」公开 JSON 目录页。
- Platform pricing API 例：`GET https://api.fal.ai/v1/models/pricing?endpoint_id=fal-ai/flux/dev`（需 Key）
- 无通用「搜索分页 catalog」作为画布唯一真相源时：应按官方 endpoint id + 该页 schema 动态配置，禁止硬编码私有字段。

## 4) 生图 / 生视频端点与异步轮询

### 队列协议（图/视频通用）

| 步骤 | REST |
|------|------|
| 提交 | `POST https://queue.fal.run/{model_id}` |
| 状态 | `GET https://queue.fal.run/{model_id}/requests/{request_id}/status?logs=1` |
| 结果 | `GET https://queue.fal.run/{model_id}/requests/{request_id}`（或 SDK `queue.result`） |
| 取消 | `PUT .../requests/{request_id}/cancel` |
| Webhook | submit 带 `fal_webhook=` 或 SDK `webhookUrl` |

状态机：`IN_QUEUE` → `IN_PROGRESS` → `COMPLETED`。  
SDK：`fal.subscribe`（阻塞式轮询）或 `fal.queue.submit` + status/result。

### 生图 endpoint 例

| endpoint id | 用途 |
|-------------|------|
| `fal-ai/flux-lora` | FLUX.1 [dev] + LoRA |
| `fal-ai/krea-2/turbo/lora` | Krea 2 Turbo + LoRA |

### 生视频（官方有公开 API）

- 例：`fal-ai/wan-t2v-lora`（Wan-2.1 + LoRAs T2V）
- 同一 Queue 协议；输出为 `video` 文件对象（`url` 等），非 `images[]`
- 文档说明：「Video generation models return a `video` object」

`fal-ai/wan-t2v-lora` Input（官方页）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `prompt` | string* | 必填 |
| `negative_prompt` | string | 有长默认 |
| `num_frames` | int | **81–100**，默认 81 |
| `frames_per_second` | int | **5–24**，默认 16 |
| `seed` | integer | 可复现；缺省随机 |
| `resolution` | enum | `480p` \| `580p` \| `720p`，默认 `480p` |
| `aspect_ratio` | enum | `16:9` \| `9:16`，默认 `16:9` |
| `num_inference_steps` | int | 默认 30 |
| `loras` | list | LoRA 权重 |
| `turbo_mode` | bool | 默认 true |
| `enable_safety_checker` / `enable_prompt_expansion` / `reverse_video` | bool | |

输出：`video` + `seed`。

其他视频模型（Hunyuan 等）各有独立 endpoint id 与 schema，须按页配置，勿共用 Wan 字段。

## 5) LoRA

### 生图 — `fal-ai/flux-lora`

- 字段：`loras` — `list` of `LoraWeight`
- 每项：
  - `path` (string*, required)：LoRA 权重 **URL 或 path**
  - `scale` (float，默认 **1**)：合并前缩放
- 文档：「You can use any number of LoRAs and they will be merged」
- 另有：`seed`, `num_inference_steps`（默认 28）, `guidance_scale`（默认 3.5）, `image_size`（enum 或 `{width,height}`）

### 生图 — `fal-ai/krea-2/turbo/lora`

- 字段：`loras` — **最多 3**
- `LoRAInput`：
  - `path`*：URL / HuggingFace `owner/repo` / local path
  - `scale`：float **0.0–4.0**，默认 1
- **无** `num_inference_steps` / `guidance_scale` 出现在该页 Input 表（与 flux-lora 不同）
- 有：`seed`, `image_size`, `num_images`, `acceleration`, `enable_prompt_expansion`, `output_format`

### 视频 — `fal-ai/wan-t2v-lora`

- `loras` list；`LoraWeight`：`path`*, 可选 `weight_name`（HF repo 多文件时）, `scale` 默认 1

### 不支持 LoRA 的 endpoint

- 必须换用带 `/lora` 的模型页或 schema 含 `loras` 的 endpoint
- 向无 `loras` 字段的模型塞 LoRA → 应按 schema **拒绝**（422/校验失败），禁止静默剥离当成功

## 6) seed 与 steps / cfg / size

| 模型 | seed | steps | cfg | size |
|------|------|-------|-----|------|
| flux-lora | `seed` integer；输出回显 seed | `num_inference_steps` int，默认 28 | `guidance_scale` float，默认 3.5 | `image_size` enum 或 `{width,height}` |
| krea-2/turbo/lora | `seed` integer；「Image i uses seed+i」 | **页上未列** | **页上未列** | `image_size`，默认 `square_hd` |
| wan-t2v-lora | `seed` integer | `num_inference_steps` 默认 30 | 无单独 cfg 字段名 | `resolution` + `aspect_ratio`；帧：`num_frames` + `frames_per_second` |

均进 **request JSON body**（queue submit 的 root / SDK `input`）。

## 7) 计费 / 余额线索

- 预付 **credits**；按成功产出计费；**排队等待不计费**；HTTP **500+ 不计费**
- 余额低于账户 **lock threshold** → 账户锁定，**API 请求被拒绝**（FAQ 原文）；加 credits 解锁
- Purchased credits：**365 天**过期
- Client 422 若已耗 GPU 时间 **可能仍计费**
- 定价查询：`/api.fal.ai/v1/models/pricing?endpoint_id=...`
- **未强调 HTTP 402**；表现为拒绝/锁定而非标准 402 文档句

## 验收对照要点

1. 鉴权必须是 `Authorization: Key …`（不是 Bearer）。  
2. LoRA 字段名是 `path` + `scale`（不是 strength 当 LoRA）。  
3. Krea2 turbo lora：**最多 3** LoRA；flux-lora 页写 any number。  
4. 视频用独立 endpoint + `video` 输出；seed/duration 用 `num_frames`/`frames_per_second`/`resolution`。

## OpenAPI 核对（2026-10-15 02:4x (Asia/Shanghai)）

来源：https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/krea-2/turbo/lora （schema `Krea2TurboLoraInput`）
- 字段全集：prompt(必填,≤5000)、image_size(默认 square_hd；枚举 square_hd/square/portrait_4_3/portrait_16_9/landscape_4_3/landscape_16_9 或 {width,height} ≤14142)、num_images 1–4、seed(int|null)、loras(array, maxItems 3, 默认 [])、acceleration(none|regular)、enable_prompt_expansion、enable_safety_checker、output_format(jpeg|png)、sync_mode。
- LoRAInput：{path(必填), scale 默认 1, 0–4}。
- **无 num_inference_steps / guidance_scale**（原"页上未列"确认为 schema 不存在）。
