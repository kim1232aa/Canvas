# ModelScope（魔搭）API 审计

抓取日期：2026-10-15 Asia/Shanghai  
研究方法：官方模型页示例 / 阿里云开发者文章参数表 / `GET /v1/models` curl / docs intro meta；Grok CLI 401。  
区分：**CN API-Inference** vs **modelscope.ai 国际站**。

## 1) 官方 docs / OpenAPI URL

| 资源 | URL | 备注 |
|------|-----|------|
| API-Inference 介绍（CN） | https://modelscope.cn/docs/model-service/API-Inference/intro | 站内文档；curl 可见「LLM / 多模态 / 文生图」定位 |
| 使用限制 | https://modelscope.cn/docs/model-service/API-Inference/limits | |
| 模型列表 API | `GET https://api-inference.modelscope.cn/v1/models` | 2026-10-15 curl 返回 OpenAI-style `{"object":"list","data":[…]}` |
| 生图端点 | `POST https://api-inference.modelscope.cn/v1/images/generations` | |
| 任务轮询 | `GET https://api-inference.modelscope.cn/v1/tasks/{task_id}` | |
| Qwen-Image 模型卡示例 | https://modelscope.cn/models/Qwen/Qwen-Image-2512 | README 内嵌 async + `loras` 注释 |
| 参数表（阿里云转载/教程） | https://developer.aliyun.com/article/1689282 | Qwen-Image 系列 + LoRA 生态 API |
| 早期公告（含 LoRA 当 model） | https://modelscope.cn/headlines/article/960 | |
| 国际站 docs | https://www.modelscope.ai/docs | 有英文 Docs 壳；**`https://api-inference.modelscope.ai/` 2026-10-15 curl → 404** |

**结论（国际站）**：未检索到与 CN 对等的公开 `api-inference.modelscope.ai` 生图 OpenAPI；画布应以 **CN `api-inference.modelscope.cn`** 为准。若需 intl，须另证官方 base URL，禁止臆造。

## 2) 鉴权方式

- `Authorization: Bearer <ModelScope Access Token>`
- Token：https://modelscope.cn/my/myaccesstoken（文档/教程通行写法）
- `Content-Type: application/json`
- 异步头：`X-ModelScope-Async-Mode: true`（提交生图）
- 轮询头：`X-ModelScope-Task-Type: image_generation`

## 3) 模型目录端点

- `GET https://api-inference.modelscope.cn/v1/models` → `{ object: "list", data: [{ id, … }] }`
- 本轮样本含 LLM 与部分多模态/图像相关 id（如 `MusePublic/Qwen-Image-Edit`）；**列表是否含全部 AIGC/LoRA 仓需实测过滤**，不能假设「list = 全部可生图」
- Hub 模型页用 ModelScope Model-Id（`org/name`）作为 `model` 字段
- 分页/搜索：OpenAI 风格 list；Hub 另有站内搜索，非本 Inference list 的正式 query 文档未在本轮落到单一 OpenAPI

## 4) 生图 / 生视频端点与异步轮询

### 生图（官方公开）

```
POST https://api-inference.modelscope.cn/v1/images/generations
Headers: Authorization: Bearer …, Content-Type: application/json, X-ModelScope-Async-Mode: true
Body: { "model": "<id>", "prompt": "...", ... }
→ { "task_id": "..." }

GET https://api-inference.modelscope.cn/v1/tasks/{task_id}
Headers: Authorization: Bearer …, X-ModelScope-Task-Type: image_generation
→ task_status: SUCCEED | FAILED | …
SUCCEED 时：output_images[0] URL 可下载
```

同步调用（无 Async 头）在早期文章中返回 `images[0].url`；**现行推荐异步 + 轮询**（Qwen-Image-2512 / 阿里云文一致）。

### 生视频

**官方无公开、可用的生视频 API（API-Inference 文档范围）**。

证据：

1. CN docs intro meta/定位：API-Inference 覆盖「大语言模型、多模态、文生图」——**未列视频**（https://modelscope.cn/docs/model-service/API-Inference/intro）。
2. 第三方探针（lilting.ch，2026 语境）：路径 `POST /v1/videos/generations` 存在但返回应用层错误（`Invalid model provider` / DataInspection 等），**未产出视频**；视频能力指向 Civision 等产品侧，非 API-Inference 公开契约。

画布集成：**不要**把 `/v1/videos/generations` 当 PASS 端点；标注「官方无公开生视频 API」直至 ModelScope 发布正式视频 Inference 文档。

## 5) LoRA

官方存在 **两套用法**（均有公开示例，须按模型卡核对）：

### A. LoRA 作为 `model`（平台自动挂底模）

- 将 `model` 设为 **LoRA 的 ModelScope Model-Id**
- 平台「自动加载 LoRA 所需基础模型」（阿里云文 / headlines 文生图 LoRA 例）
- 适合：单 LoRA、平台已登记衍生生态

### B. 底模 + `loras` 字段（Qwen-Image-2512 模型卡注释）

```json
{
  "model": "Qwen/Qwen-Image-2512",
  "prompt": "...",
  "loras": "<lora-repo-id>"
}
```

或多 LoRA：

```json
"loras": { "<lora-repo-id1>": 0.6, "<lora-repo-id2>": 0.4 }
```

规则（模型卡注释原文要点）：

- 最多 **6** 个 LoRA
- **权重系数总和必须为 1.0**
- id 为 ModelScope repository id

### 强度字段名

- 多 LoRA 用 **map 的 value 当权重**，**不是** 通用 `strength` / `scale` 数组
- 单 LoRA 字符串形式时，文档未给单独 strength——勿静默塞 `0.8`

### 不支持时

- 非 AIGC/未接入 Inference 的仓：应 **原样失败**（状态码/响应体），禁止换 model/mock
- 不支持 LoRA 的底模：**UI 不露挂载**；不要用「model=LoRA id」张冠李戴到不支持的路由

## 6) seed 与 steps / cfg / size

阿里云开发者文《码上生花…》参数表（针对 Qwen-Image 系列 API）：

| 参数 | 必须 | 类型 | 示例 | 取值范围 |
|------|------|------|------|----------|
| `model` | 是 | string | `Qwen/Qwen-Image` | 系列 Model-Id |
| `prompt` | 是 | string | … | &lt; 2000 字符 |
| `negative_prompt` | 否 | string | … | &lt; 2000 |
| `size` | 否 | string | `1024x1024` | 多种宽高比（文内表） |
| `seed` | 否 | int | `42` | **[0, 2³¹−1]** |
| `steps` | 否 | int | `50` | **[1, 100]** |
| `guidance` | 否 | float | `4.0` | **[1.5, 20]** |

字段名注意：是 **`guidance`** / **`steps`** / **`size`**（`1024x1024` 字符串），不是 OpenAI 的 `guidance_scale` / `num_inference_steps` / `width`+`height`（除非某模型卡另有说明）。

编辑类可有 `image_url` 数组（模型页示例）。

## 7) 计费 / 余额线索

- docs「使用限制」页标题存在（https://modelscope.cn/docs/model-service/API-Inference/limits）；站内有「魔粒」计费叙述（外部索引 2026-10-13 指向 limits 文档）
- 社区/索引常见说法：免费额度、按次扣魔粒；**本轮未在 HTML 中稳定抽到 402 原文**
- 欠费/额度用尽：应按真实 HTTP 状态与 JSON **原样展示**（铁律）；前端准确展示可 PASS_BILLING
- Token 常需绑定阿里云实名账号后才可调（第三方核验文，非替代官方）

## 验收对照要点

1. CN base：`https://api-inference.modelscope.cn`；async 头 + tasks 轮询。  
2. LoRA：优先核对当前模型卡——`loras` map（权重和=1）或 `model`=LoRA id；禁止 invent `scale` 数组。  
3. seed/steps/guidance/size 进 JSON body，范围按上表。  
4. **视频：官方无公开 API-Inference 契约** → 不接线装成功。
