# Hugging Face 图片（std-huggingface-t2i）— 未通过；真实 HF 400，无产物

本次通过真实前端 UI 加载 `std-huggingface-t2i` 并点击顶栏 Run。没有使用 curl、脚本或直接 API 代替点击。结果真实到达 Hugging Face Router，但标准卡使用了 `hf-inference`，该模型不被该 provider 支持。

## 请求实参

### UI 填写与官方契约

- HF 仓库底模：`renderartist/Technically-Color-Z-Image-Turbo`
- 正向提示词：`t3chnic4lly A gritty documentary-style photograph capturing a tightly packed crowd of muscular old men in black suits, dancing energetically within a dark industrial warehouse. The old men's faces show exaggerated expressions of joy. Sweat glistens on their faces. The lighting is provided by harsh, direct on-camera flash, creating stark white highlights, deep shadows, and significant motion blur among the moving figures. Industrial commercial lasers cut through the dark, highlighting dust motes. Concrete pillars and exposed structural beams are visible in the crowded background. The film grain is heavy.`
- LoRA UI 节点：`renderartist/Technically-Color-Z-Image-Turbo`
- LoRA 强度：`modelStrength=0.9`、`clipStrength=0.9`
- width / height：`1216 / 832`
- steps：`12`
- CFG / guidance：`1`
- seed：`1840591390`
- sampler / scheduler：未发送；HF text-to-image 官方参数表列出 scheduler，但该标准卡按当前 HF 直连 Schema 未设置 sampler/scheduler，实际 body 未含这两个字段。
- negative prompt：该标准卡官方 recipe 标记 `hasNegative=false`，未填/未发送。
- HF 官方 text-to-image 文档明确的字段是 `inputs`、`parameters.guidance_scale`、`negative_prompt`、`num_inference_steps`、`width`、`height`、`scheduler`、`seed`。本次真实 body 中有 inputs、width、height、steps、guidance、seed。

### 应用自身请求日志中的真实出站请求体

来源：隔离服务器 `/tmp/acc-falhf/temp/logs/requests-2026-11-09.jsonl`。真实 endpoint：`POST https://router.huggingface.co/hf-inference/models/renderartist/Technically-Color-Z-Image-Turbo`。

```json
{
  "inputs": "t3chnic4lly A gritty documentary-style photograph capturing a tightly packed crowd of muscular old men in black suits, dancing energetically within a dark industrial warehouse. The old men's faces show exaggerated expressions of joy. Sweat glistens on their faces. The lighting is provided by harsh, direct on-camera flash, creating stark white highlights, deep shadows, and significant motion blur among the moving figures. Industrial commercial lasers cut through the dark, highlighting dust motes. Concrete pillars and exposed structural beams are visible in the crowded background. The film grain is heavy.",
  "parameters": {
    "width": 1216,
    "height": 832,
    "num_inference_steps": 12,
    "guidance_scale": 1,
    "seed": 1840591390,
    "loras": [
      {
        "name": "renderartist/Technically-Color-Z-Image-Turbo",
        "strength": 0.9,
        "modelStrength": 0.9,
        "clipStrength": 0.9,
        "civitaiId": "",
        "triggers": ""
      }
    ]
  }
}
```

重要路由事实：应用实际没有发送 `inference_provider= fal-ai`，也没有将 LoRA 转成官方 Fal provider 所需的 `{path,scale}`；LoRA 的实际 body 形态是 repo `name` + strength 字段。HF 官方模型元数据（在隔离 Chrome 中打开 `https://huggingface.co/api/models/renderartist/Technically-Color-Z-Image-Turbo?expand=inferenceProviderMapping`）返回：

```json
{
  "inferenceProviderMapping": {
    "fal-ai": {
      "status": "live",
      "providerId": "fal-ai/z-image/turbo/lora",
      "task": "text-to-image",
      "adapter": "lora",
      "adapterWeightsPath": "Technically_Color_Z_Image_Turbo_v1_renderartist_2000.safetensors"
    },
    "wavespeed": {
      "status": "live",
      "providerId": "wavespeed-ai/z-image/turbo-lora",
      "task": "text-to-image",
      "adapter": "lora",
      "adapterWeightsPath": "Technically_Color_Z_Image_Turbo_v1_renderartist_2000.safetensors"
    }
  }
}
```

因此不能把本次结果说成 Fal 或 WaveSpeed 的结果；本次真实请求只到 Hugging Face 的 `hf-inference` provider。

## 上游响应

- HTTP：`400 Bad Request`
- 原始响应：

```json
{"error":"Model not supported by provider hf-inference"}
```

- UI 原始错误：`[huggingface] HTTP 400 Bad Request: Model not supported by provider hf-inference`
- 结论：请求已真实出站，但没有产物；本样本不能标记 PASS_GENERATION，也不能将响应归因给 fal-ai。实际 route 是 HF Router → `hf-inference`，其明确拒绝该模型。

## 产物

没有生成图片、没有历史条目、没有可下载原图。

- 第一次点卡片“载入并立即运行”时，应用因 stale selected-node 状态显示本地 `未发送请求 / 节点已删除，请重新选择`；这张截图不是有效出站验收，仅作为产品缺陷证据：`docs/evidence/acceptance-2026-11-09-fal-hf/hf-t2i-result-or-error.png`，106501 bytes，sha256 `6bb2e945538461823076932f3b97e09bbe43cd0d561d0626a63178c777b9b034`。
- 使用普通顶栏 Run 后的真实 HF 400 UI 响应截图：`docs/evidence/acceptance-2026-11-09-fal-hf/hf-t2i-400.png`，113807 bytes，sha256 `fc4a425caf2c6db55344e43c7142977752c545b1a67f3cd79f1d0a45acb17387`。
- 失败后画布/LoRA 连线及各填写参数截图（未再次运行）：`docs/evidence/acceptance-2026-11-09-fal-hf/hf-t2i-400-graph.png`，217238 bytes，sha256 `5eef250baafb7eef37658c08c48fc3dd58b054dae1e65252c5b707e3af1e9cef`。

未生成文件：无。

## 搜索记录

- 点击前并行调用 `mcp__tavily__tavily_search`、`mcp__9router__search`、`mcp__agy-search__search_web`，查询 Hugging Face Inference Providers text-to-image、provider routing、LoRA 和 Technically Color model card。Tavily 多次返回 432/429 计划额度；9Router 返回官方 HF task/provider 文档；Agy 返回 provider routing 摘要。
- 一手原文已打开：`https://huggingface.co/docs/inference-providers/tasks/text-to-image`（`FetchURL` 与 `mcp__9router__fetch(model=firecrawl)`），官方字段表明确列出 width、height、guidance_scale、negative_prompt、num_inference_steps、scheduler、seed。
- 一手原文已打开：`https://huggingface.co/docs/inference-providers/en/providers/hf-inference`（`FetchURL`），原文说明截至 2025-07 hf-inference 主要聚焦 CPU inference；该页没有将本次 Z-Image LoRA 证明为 hf-inference 支持模型。
- 一手原文已打开：`https://huggingface.co/docs/inference-providers/en/providers/fal-ai`（`FetchURL` 与 `mcp__9router__fetch(model=firecrawl)`），原文示例使用 `InferenceClient(provider="fal-ai")` 做 text-to-image；这证明 Fal 是 HF 的独立 provider，不证明本次应用自动选择了它。
- 一手原文已打开：`https://huggingface.co/docs/inference-providers/hub-api`（`FetchURL` 与 `mcp__9router__fetch(model=firecrawl)`），说明 `inferenceProviderMapping` 返回 provider status/providerId/task/adapter/adapterWeightsPath。
- 模型卡已打开：`https://huggingface.co/renderartist/Technically-Color-Z-Image-Turbo`（`FetchURL`），原文给出 trigger word `t3chnic4lly` 和 Technically Color 说明。
- 直接 `FetchURL` / `mcp__9router__fetch` 打开模型 JSON API 曾失败（动态 JSON extraction/network error、Firecrawl HTTP 400）；随后在隔离 Chrome 中真实打开同一官方 API URL，页面原文返回上面列出的 `fal-ai` / `wavespeed` mapping。失败过程已保留，不用摘要冒充 JSON 证据。
- 第一次点击卡片“载入并立即运行”只触发本地 precheck，UI 原文为 `未发送请求 / 节点已删除，请重新选择`。同轮并行 exact-error 搜索查询 `"节点已删除，请重新选择" ComfyCanvas Studio`：Tavily 返回 432 额度限制、9Router 无结果、Agy 给出通用 ComfyUI 说明；随后通过本地源码核实 `App.tsx` 的 `runTargetState` 基于 `selectedNodeId`，以及 `handleRun` 的 `resolveRunTarget` 本地拦截。该点击没有上游请求，不作为生成验收。之后使用实际 Run 按钮。
- 发现 HTTP 400 后同轮并行 exact-error 搜索：Tavily 返回 429/计划限制；9Router 无 exact 命中；Agy 解释 hf-inference 不承载全部重型图像模型；并打开官方 `hf-inference` provider 文档原文。没有切换供应商、模型或 endpoint 重跑。
