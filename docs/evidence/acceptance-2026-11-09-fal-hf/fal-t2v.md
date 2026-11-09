# Fal 视频（std-fal-t2v）— PASS_BILLING；无产物

本次为 headless Chrome 真实前端点击验收。工作流卡为 `Fal.ai · 电影镜头文生视频`，实际点击了节点运行按钮，未绕过 UI。

## 请求实参

### UI 填写与官方契约

- 模型：`fal-ai/wan/v2.2-a14b/text-to-video/lora`
- 正向提示词：`Banostasis concept, a cinematic sequence of quick scene transitions of musical instruments dissolving into fragments of sound waves, which then condense into glowing orbs of light, the sequence of changes includes the transitions between a concert hall, a crowded subway tunnel, and an open desert plain, shot with rapid lens push-ins and kaleidoscopic lighting shifts, stylized in synesthetic neon abstract art.`
- 负向提示词：`blurry motion, flicker, distorted frames, text, watermark`
- LoRA path：`https://huggingface.co/Cseti/wan2.2-14B-Kinestasis_concept-lora-v1/resolve/main/246839-wan22_14B-high-banostasis_concept-e459.safetensors`
- LoRA scale：`1`
- seed：`24231881`
- resolution：`480p`
- aspect_ratio：`16:9`
- num_frames：`81`
- frames_per_second：`16`
- num_inference_steps：`27`
- guidance_scale / CFG：`3.5`
- guidance_scale_2：`4`
- shift：`5`
- acceleration：`regular`
- interpolator_model：`film`
- num_interpolated_frames：`1`
- adjust_fps_for_interpolation：`true`
- video_quality：`high`
- video_write_mode：`balanced`
- reverse_video：`false`
- enable_prompt_expansion：`false`
- enable_safety_checker：`false`（项目 NSFW 策略；UI 可见，放开方向）
- enable_output_safety_checker：`false`（项目 NSFW 策略；UI 可见，放开方向）
- 未发送 `width` / `height` / `sampler` / `scheduler` / `denoise`：Wan 2.2 T2V 官方 Schema 不声明这些字段；尺寸由 resolution/aspect_ratio 控制。
- 未进行播放、下载、历史详情、历史重提：上游在排队/生成前即返回余额锁定 403，未产生视频。

### 应用自身请求日志中的真实出站请求体

来源：隔离服务器 `/tmp/acc-falhf/temp/logs/requests-2026-11-09.jsonl`。真实 endpoint：`POST https://queue.fal.run/fal-ai/wan/v2.2-a14b/text-to-video/lora`。

```json
{
  "prompt": "Banostasis concept, a cinematic sequence of quick scene transitions of musical instruments dissolving into fragments of sound waves, which then condense into glowing orbs of light, the sequence of changes includes the transitions between a concert hall, a crowded subway tunnel, and an open desert plain, shot with rapid lens push-ins and kaleidoscopic lighting shifts, stylized in synesthetic neon abstract art.",
  "aspect_ratio": "16:9",
  "seed": 24231881,
  "frames_per_second": 16,
  "num_frames": 81,
  "resolution": "480p",
  "negative_prompt": "blurry motion, flicker, distorted frames, text, watermark",
  "guidance_scale": 3.5,
  "loras": [
    {
      "path": "https://huggingface.co/Cseti/wan2.2-14B-Kinestasis_concept-lora-v1/resolve/main/246839-wan22_14B-high-banostasis_concept-e459.safetensors",
      "scale": 1
    }
  ],
  "enable_safety_checker": false,
  "enable_output_safety_checker": false,
  "num_inference_steps": 27,
  "num_interpolated_frames": 1,
  "guidance_scale_2": 4,
  "shift": 5,
  "video_quality": "high",
  "reverse_video": false,
  "interpolator_model": "film",
  "acceleration": "regular",
  "enable_prompt_expansion": false,
  "video_write_mode": "balanced",
  "adjust_fps_for_interpolation": true
}
```

## 上游响应

- HTTP：`403 Forbidden`
- 原始响应：

```json
{"detail":"User is locked. Reason: Exhausted balance. Top up your balance at fal.ai/dashboard/billing."}
```

- 结论：`PASS_BILLING`（真实 UI 出站、指定 Fal endpoint、完整参数/LoRA、错误原样透传）；不等于视频生成通过。

## 产物

没有生成视频，不能播放、下载或从历史重提；没有历史条目。

- 载入后参数/LoRA/Schema 字段截图：`docs/evidence/acceptance-2026-11-09-fal-hf/fal-t2v-loaded.png`，120759 bytes，sha256 `c64e4f70bf531059ac0f80a503aa2e392532b2c5e478e908c61419cc8805d955`
- 所有已填写参数与连接的截图：`docs/evidence/acceptance-2026-11-09-fal-hf/fal-t2v-filled.png`，151840 bytes，sha256 `f2407d014dbcb8a7975f0dfbe6519736d41f19827adda95b40fc99d6433f7899`
- 运行后 UI 错误、执行记录与节点错误：`docs/evidence/acceptance-2026-11-09-fal-hf/fal-t2v-403.png`，165956 bytes，sha256 `452f9d1ab890ebec372bc2936874c9ad8f72351da84a5c59b5deb14ae8550f8f`

未生成文件：无。

## 搜索记录

- 点击前同一轮并行调用 `mcp__tavily__tavily_search`、`mcp__9router__search`、`mcp__agy-search__search_web`，查询 Fal Wan 2.2 A14B T2V/I2V LoRA 官方 Schema、negative prompt、帧数、FPS、resolution、CFG、safety、LoRA path/scale/transformer。Tavily 返回结果或计划额度错误；9Router 返回官方 Fal 文档 URL；Agy 返回端点字段摘要。
- 一手原文已打开：`https://fal.ai/models/fal-ai/wan/v2.2-a14b/text-to-video/lora/api`（`mcp__9router__fetch(model=firecrawl)`，官方全文）和同 URL 的 `FetchURL`（官方全文）。原文明确列出本报告中的输入字段与 `LoRAWeight {path,scale,transformer}`。
- 相关官方总览已打开：`https://fal.ai/docs/model-api-reference/video-generation-api/overview`（`FetchURL`），说明支持 text-to-video / image-to-video。
- 发现 403 后同轮并行 exact-error 搜索：Tavily 返回 432 计划额度；9Router 无 exact 命中；Agy 搜索余额锁定原因；已打开官方 `https://fal.ai/docs/model-apis/faq`，原文说明余额低于 lock threshold 时账号被锁定，充值后解锁；UI 原文也给出 `fal.ai/dashboard/billing`。
