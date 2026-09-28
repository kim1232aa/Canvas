# 引擎与 LoRA 规范说明 (ENGINE_LORA_SPECIFICATION.md)

## 一、全量支持引擎驱动列表 (All 9 Engine Drivers)

| 驱动 ID | 驱动名称 | 核心能力 | 规范端点 / 协议 | LoRA 挂载规则 |
| :--- | :--- | :--- | :--- | :--- |
| `fal` | Fal.ai 极速云引擎 | `text2img`, `img2img`, `text2video`, `img2video` | `fal.run/*` (FLUX.1, SDXL, Wan 2.1, Kling 1.5, LTX) | FLUX: `fal-ai/flux-lora`; SDXL: `fal-ai/lora` + `model_name` |
| `gemini` | Google Imagen 3 / Gemini | `text2img`, `img2img`, `reasoning` | Google GenAI SDK (`imagen-3.0-generate-002`, `gemini-3.1-flash-image`, `gemini-3.8-flash`) | 触发词自动融入 Prompt，多模态图像 inlineData 注入 |
| `tensorart` | Tensor.Art (OpenWorks) | `text2img`, `img2img`, `text2video`, `img2video` | OpenWorks OpenAPI (`/task` + `Echo-Access-Key`) | 语义对齐通用生图算力，LoRA 触发词自适应拼装 |
| `nanogpt` | NanoGPT (按次即付) | `text2img`, `img2img`, `text2video` | `nano-gpt.com/api/generate-image`, `/api/generate-video` | 支持 `loras` 路径与权重透传，支持 `image_url` 与 `size` |
| `agnes` | Agnes AI (ApiHub) | `text2img`, `img2img`, `text2video`, `reasoning` | `apihub.agnes-ai.com/v1` (`/images/generations`, `/chat/completions`) | 极速秒级出片，Prompt 触发词自动前置融入 |
| `sensenova` | SenseNova (商汤日日新) | `reasoning`, `chat` | `token.sensenova.cn/v1/chat/completions` (DeepSeek V4, GLM) | 专长于思维链 (CoT) 构思、分镜推演与 Prompt 扩写 |
| `modelscope` | ModelScope 魔搭国内站 | `text2img`, `img2img`, `text2video`, `img2video` | `api-inference.modelscope.cn/v1/models/*` (Wan 2.1, Z-Image, SDXL) | 阿里官方 OpenAPI，支持模型 ID 与权重直连 |
| `modelscope_ai`| ModelScope 魔搭国际站 | `text2img`, `img2img`, `text2video` | `api-inference.modelscope.ai/v1/models/*` | 国际站 OpenAPI，支持多币种与免鉴权公开模型 |
| `huggingface` | Hugging Face Diffusers | `text2img`, `img2img` | `api-inference.huggingface.co/models/*` | 社区全量开源模型仓库与权重解析 |
| `civitai` | Civitai 官方原生引擎 | `text2img`, `img2img`, `lora_hub` | `civitai.com/api/v1/*`, Generator API | 原生 URN 表达：`urn:air:<family>:<type>:civitai:<id>@<ver>` |
| `video` | AI 视频官方聚合引擎 | `text2video`, `img2video` | Wan 2.1, LTX-Video, Kling 1.5, MiniMax H3, CogVideoX, Hunyuan | 检测 `image_url` 自动且透明分流至图生视频端点 |

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
2. **端点适配必须明示**：
   - 任何因规约要求进行的端点自动适配（如文生视频转图生视频、社区底模转通用算力），必须随返回结果携带 `wasAdapted: true` 与 `adaptationNotice`，并在 UI 显著提示用户。

---
*更新时间：2026-09-28*
