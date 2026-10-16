> 当前状态（2026-10-03）：下文含历史实现与历史验收描述，不能作为本次能力保证。以 CLAUDE.md 固定规则、PROGRESS.md 最新验收、public/verification/results.json 真实响应为准；禁止未经核实的自动模型/端点替换。

# 引擎与 LoRA 规范说明 (ENGINE_LORA_SPECIFICATION.md)

## 一、全量支持引擎驱动列表 (All 9 Engine Drivers)

| 驱动 ID | 驱动名称 | 核心能力 | 规范端点 / 协议 | LoRA 挂载规则 |
| :--- | :--- | :--- | :--- | :--- |
| `fal` | Fal.ai 极速云引擎 | `text2img`, `img2img`, `text2video`, `img2video` | `fal.run/*` (FLUX.1, SDXL, Wan 2.1, Kling 1.5, LTX) | FLUX: `fal-ai/flux-lora`; SDXL: `fal-ai/lora` + `model_name` |
| `gemini` | Google Imagen 3 / Gemini | `text2img`, `img2img`, `reasoning` | Google GenAI SDK (`imagen-3.0-generate-002`, `gemini-3.1-flash-image`, `gemini-3.8-flash`) | 触发词自动融入 Prompt，多模态图像 inlineData 注入 |
| `tensorart` | Tensor.Art (TAMS 模型 API) | `text2img`, `img2img` | `https://tams-api.tensor.art/v1/jobs` (`Bearer` Token) | 原生 `diffusion.lora.items: [{ loraModel: id, weight }]`，严禁映射至 OpenWorks 工具 |
| `nanogpt` | NanoGPT (按次即付) | `text2img`, `img2img`, `text2video` | `nano-gpt.com/api/generate-image`, `/api/generate-video` | 支持 `loras` 路径与权重透传，支持 `image_url` 与 `size` |
| `agnes` | Agnes AI (ApiHub) | `text2img`, `img2img`, `text2video`, `reasoning` | `apihub.agnes-ai.com/v1` (`/images/generations`, `/chat/completions`) | 极速秒级出片，Prompt 触发词自动前置融入 |
| `sensenova` | SenseNova (商汤日日新) | `reasoning`, `chat` | `token.sensenova.cn/v1/chat/completions` (DeepSeek V4, GLM) | 专长于思维链 (CoT) 构思、分镜推演与 Prompt 扩写 |
| `modelscope` | ModelScope 魔搭国内站 | `text2img`, `img2img`, `text2video`, `img2video` | `api-inference.modelscope.cn/v1/models/*` (Wan 2.1, Z-Image, SDXL) | 阿里官方 OpenAPI，支持模型 ID 与权重直连 |
| `modelscope_ai`| ModelScope 魔搭国际站 | `text2img`, `img2img`, `text2video` | `api-inference.modelscope.ai/v1/models/*` | 国际站 OpenAPI，支持多币种与免鉴权公开模型 |
| `huggingface` | Hugging Face Diffusers | `text2img`, `img2img` | `api-inference.huggingface.co/models/*` | 社区全量开源模型仓库与权重解析 |
| `civitai` | Civitai 官方原生引擎 | `text2img`, `img2img`, `lora_hub` | `civitai.com/api/v1/*`, Generator API | 原生 URN 表达：`urn:air:<family>:<type>:civitai:<id>@<ver>` |
| `replicate` | Replicate 官方推理平台 | `text2img`, `img2img` | `api.replicate.com/v1/models/{owner}/{name}/predictions` | 动态按模型 OpenAPI `Input` Schema 驱动（如 `black-forest-labs/flux-dev-lora` 使用 `lora_weights` + `lora_scale`；社区模型按 Schema 使用 `hf_lora`），严禁从纯数字 Civitai ID 猜测拼接 URL，严禁缺失权重时静默兜底 `1.0` |
| `runware` | Runware 极速推理引擎 | `text2img`, `img2img` | `api.runware.ai/v1` (`taskType: imageInference`) | 原生 `lora: [{ model: "civitai:id@ver", weight }]`，严禁静默截断 `strength` 或兜底默认权重 |
| `modelslab` | ModelsLab 推理引擎 | `text2img`, `img2img` | `modelslab.com/api/v6/images/text2img` | 原生 `lora_model` + `lora_strength`（显式提供，严禁静默兜底 `0.8` 或 `512x512`） |
| `wavespeed` / `muapi` / `sogni` | 动态 Schema 驱动引擎 | `text2img`, `img2img`, `video` | `/api/schema-provider/:provider/submit` | 严格按模型实时 Schema 校验并提交 `loras`，零硬编码、零默认兜底 |
| `video` | AI 视频官方聚合引擎 | `text2video`, `img2video` | Wan 2.1, LTX-Video, Kling, MiniMax, CogVideoX, Hunyuan | 按用户显式选择的供应商与模型路由执行 |

---

## 二、参数归一化规范 (NormalizedGenerateParams)

所有引擎调用必须经过标准中间结构进行无损流转：
```typescript
interface NormalizedGenerateParams {
  prompt: string;
  negative_prompt?: string;
  model: string;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  seed?: number;
  denoise?: number;
  image_url?: string;
  isVideo?: boolean;
  videoDuration?: number;
  videoFps?: number;
  aspectRatio?: string;
  sampler_name?: string;
  scheduler?: string;
  loras?: Array<{
    name: string;
    path?: string;
    strength?: number;
    modelStrength?: number;
    clipStrength?: number;
    civitaiId?: string;
    triggers?: string;
  }>;
}
```

---

## 三、反黑盒与错误处理规范

1. **零兜底透明错误**：
   - 上游 API 执行报错时，直接原样透传真实 HTTP 状态码与响应体，严禁伪造默认图像、提示词或静默切换引擎。
2. **严禁端点/模型暗箱替换与默认兜底**：
   - 严禁将社区底模替换为通用工具算力，严禁在缺失宽高、LoRA 权重或遇到多版本模型时静默填充默认值（如 `512x512`、`1.0`、`0.8` 或 `versions[0]`）。

---
*更新时间：2026-09-28*
