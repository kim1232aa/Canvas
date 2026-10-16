# Venice AI — API 审计
2026-10-15 重新调查，与旧版无关。调查时间 03:31–03:33 北京时间。

| 项 | 结论 | 等级 | 证据 |
|---|---|---|---|
| 文档入口 | https://docs.venice.ai ；api-spec 页指向 OpenAPI YAML | 实测 | https://docs.venice.ai/api-reference/api-spec |
| 机器可读 Schema | **有**：https://api.venice.ai/doc/api/swagger.yaml → 302 到 `https://api.venice.ai/api/v1/swagger.yaml`（200，688 KB），与 GitHub veniceai/api-docs/swagger.yaml 同大小 | 实测 | |
| 模型目录 | `GET /api/v1/models?type=image` **无 key 200**（文档原文：GET /models、/models/traits、/models/compatibility_mapping、/image/styles 可无 key 读）。每条 `model_spec.constraints` 带模型级约束，如 venice-sd35 `steps:{default:25,max:30}`, `widthHeightDivisor:16` | 实测 | |
| LoRA 目录 | 未找到 LoRA 目录（已查 swagger.yaml、/models 返回，关键词 lora）。只有 `lora_strength`：「Only applies if the model uses」附带 LoRA 的模型；用户**不能挂自定义 LoRA**（未见对应字段） | 官方原文 / 未找到 | swagger.yaml L3377 |
| 图像端点 | `POST /api/v1/image/generate`，同步，字段**根层** | 官方原文(swagger) | |
| 字段 | model, prompt, negative_prompt, steps(def 8, 上限看 model constraints), cfg_scale(0–20), seed(-999999999–999999999, def 0), width/height(≤1280, def 1024), aspect_ratio, resolution, **lora_strength(int 0–100，非 0–1)**, style_preset(`GET /image/styles`), variants(1–4), format, safe_mode；无采样器 | 官方原文(swagger) | |
| 视频 | `POST /api/v1/video/queue`（duration 字符串枚举 "1s".."30s"、resolution 枚举、aspect_ratio、image_url…；**未见 seed 字段**）→ `POST /api/v1/video/retrieve {model, queue_id}` 轮询，status 含 PROCESSING/COMPLETED；另有 /video/quote 报价 | 官方原文(swagger) | |
| 鉴权 | Bearer API key；另支持 x402 钱包 | 官方原文 | |
| 错误/欠费 | **无 key 实测返回 HTTP 402**（x402 体：`x402Version, error:"Authentication required", accepts[...]`），**不是 401**。swagger 原文：API key 用户欠费也是 402，标准错误体 `{"error": string}` + `INSUFFICIENT_BALANCE` code | 实测 + 官方原文 | |

坑：① 未鉴权 402 极易被误判为「欠费」——必须看体里是 x402 发现响应还是 INSUFFICIENT_BALANCE；② lora_strength 0–100；③ PyYAML 1.1 会把 `16:9` 之类无引号值解析成六十进制整数（本次解析 video aspect_ratio 时出现 61/969 等），做动态 Schema 必须用 YAML 1.2 解析器或 JSON。
