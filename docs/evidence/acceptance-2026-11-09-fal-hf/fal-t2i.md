# Fal 图片（std-fal-t2i）— PASS_BILLING；无产物

本次是 headless Chrome 通过 CDP 的真实前端点击验收，不是 curl、脚本或直接 API 验收。工作流卡为 `Fal.ai · 复古动漫对打`，模型为 `fal-ai/krea-2/turbo/lora`。

## 请求实参

### UI 填写与官方契约

- 模型：`fal-ai/krea-2/turbo/lora`
- 正向提示词：`two samurais in flowing robes doing a muay thai fight, one throws a high kick while the other leans back. Purple retro anime style`
- LoRA：`https://huggingface.co/krea/Krea-2-LoRA-retroanime/resolve/main/retroanime.safetensors`
- LoRA scale：`1`
- seed：`64107730`
- image size：`square_hd`
- num_images：`1`
- 官方 Krea 2 LoRA Schema 还声明 `acceleration`、`enable_prompt_expansion`、`sync_mode`、`enable_safety_checker`、`output_format`；其中 UI 卡实际使用官方默认值：`acceleration=none`、`enable_prompt_expansion=false`、`sync_mode=false`、`enable_safety_checker=true`、`output_format=png`。这些默认值未作为显式字段出现在最终请求体；上游默认生效。安全方向保持放开（checker 默认开启，未暗中关闭）。
- 未发送 `negative_prompt`、`num_inference_steps`、`guidance_scale`、`sampler`、`scheduler`：Fal Krea 2 Turbo LoRA 官方 Schema 没有这些字段。
- 未发送独立 `width` / `height`：该端点把尺寸放在 `image_size`；官方支持 `image_size` 枚举，也支持自定义 `{width,height}` 对象，但本标准卡/UI 只暴露并填写了 `square_hd`，没有把自定义对象作为隐藏字段伪造发送。
- 未发送历史/视频字段：本次是 T2I，均不适用。

### 应用自身请求日志中的真实出站请求体

来源：隔离服务器 `/tmp/acc-falhf/temp/logs/requests-2026-11-09.jsonl`，不是浏览器 DevTools 猜测。应用实际发送：

```json
{
  "prompt": "two samurais in flowing robes doing a muay thai fight, one throws a high kick while the other leans back. Purple retro anime style",
  "num_images": 1,
  "seed": 64107730,
  "loras": [
    {
      "path": "https://huggingface.co/krea/Krea-2-LoRA-retroanime/resolve/main/retroanime.safetensors",
      "scale": 1
    }
  ],
  "image_size": "square_hd"
}
```

真实上游 endpoint：`POST https://fal.run/fal-ai/krea-2/turbo/lora`。

## 上游响应

前端真实点击：先在工作流中心点 `Fal.ai · 复古动漫对打` 卡的“载入并立即运行”，确认 LoRALoader 与 KSampler 已连接；随后执行记录显示原文。

- HTTP：`403 Forbidden`
- 原始响应：

```json
{"detail":"User is locked. Reason: TOP_UP."}
```

- 结论：`PASS_BILLING`（证明真实请求出站、真实端点、LoRA path/scale 和字段原样记录，并透传上游错误）；不等于生成通过。

## 产物

没有生成图片，也没有历史条目；不能标记图像生成通过。

真实 UI 截图（均位于本证据目录）：

- 运行前 Fal 卡与 LoRA 信息：`docs/evidence/acceptance-2026-11-09-fal-hf/fal-t2i-card.png`，213173 bytes，sha256 `0acea01b2712f0f547599b9a84d73f926fe45081635db3eed756e728755d60ce`
- 运行后 UI 画布、LoRALoader 连线、节点错误与执行记录：`docs/evidence/acceptance-2026-11-09-fal-hf/fal-t2i-403-attempt1.png`，230027 bytes，sha256 `584f5a33b634b4d51d29d8da85f8ba653da4ac8532148004162e1d3aeafc4bc6`

未生成文件：无；没有伪造或下载空产物。

## 搜索记录

- 并行 `mcp__tavily__tavily_search`、`mcp__9router__search`、`mcp__agy-search__search_web` 查询 Fal Krea LoRA 图像 API（`fal.ai/docs/model-api-reference/image-generation-api/flux-lora`、`fal-ai/krea-2/turbo/lora`、LoRA/negative prompt/尺寸/steps/CFG/seed/safety）。Tavily 多次返回计划额度 432；9Router/Brave 返回 Fal 官方候选页；Agy 返回 schema 摘要。
- 一手原文已打开：`https://fal.ai/models/fal-ai/krea-2/turbo/lora/api`（`FetchURL`，官方页面全文）。原文声明 prompt、seed、image_size、num_images、acceleration、enable_prompt_expansion、sync_mode、enable_safety_checker、output_format、loras `{path,scale}`，并说明 Krea 端点不声明 negative/steps/CFG。
- 另用 `mcp__9router__fetch(model=firecrawl)` 打开同一 Fal 官方页面，成功返回官方 Schema；`mcp__9router__fetch(model=jina-reader)` 曾返回 reader 网关 HTTP 402 `InsufficientBalanceError`，该 402 是文档网关余额错误，不是 Fal 生成响应。
- 发现 403 后同轮并行搜索 exact error：Tavily 返回 432 计划额度；9Router/Brave 无 exact 命中；Agy 解释 `User is locked` / `TOP_UP` 为余额锁定。已用 `FetchURL` 打开一手官方 `https://fal.ai/docs/model-apis/faq`，原文说明余额低于 lock threshold 会锁定账号、充值后解锁。
