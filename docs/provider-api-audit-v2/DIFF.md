# 旧版 (docs/provider-api-audit/) vs v2 对比
2026-10-15 重新调查，与旧版无关；本对比写于 04:45（北京时间），在 16 家 v2 全部写完之后才读旧版。分歧处已用 curl 独立复核，复核时间见“证据”。

## 最重要的分歧
1. **sogni —— v2 首版错误，旧版对**：v2 首版称“无 REST 图像端点”；实测 `POST /v1/creative-agent/workflows`（官方原文）、`/v1/model-catalog`(200, 426 条)、`/v1/loras/comfy`(200, 含 ui.min/max) 均存在。已重写 sogni.md。根因：只信了 agy-search 虚构的 /v1/images/generations。
2. **wavespeed 欠费码 —— 旧版对，v2 漏**：error-codes 页「1407 insufficient_credits」（04:44 200）。list-models 文档含 api_schema 对象（旧版对）。
3. **together 402 —— 旧版对，v2 漏**：error-codes 页 402=月度消费上限（04:44 200）。
4. **fal 模型目录 —— v2 对**：旧版称无公开 JSON 目录；v2 实测 `api.fal.ai/v1/models` 无 key 200。旧版“lock threshold”经 FAQ 复核属实（已补入 v2）。
5. **openworks 文档 —— v2 更全**：旧版称官方文档缺失、skills raw 404；v2 读到官方仓库 _api.py / SKILL.md(200)，确定 `Echo-Access-Key`、`tool/list` 无 key 可用。
6. **modelscope LoRA —— v2 不同**：旧版按“LoRA 即模型”处理；v2 官方原文 `loras` 为字符串或 `{repo:weight}` 映射，≤6，权重和=1。
7. **civitai —— 不同 recipe，不矛盾**：旧版 Flux1/comfy recipe 的 `loras:{AIR:strength}` / `[{air,strength}]`；v2 是 textToImage `additionalNetworks:{AIR:{strength}}`。画布需按 recipe 区分。

## 逐家
| 家 | 旧版 | v2 | 等级 / 证据 |
|---|---|---|---|
| together | 402=月度上限 | 首版未找到 → 补查确认 | 官方原文 docs.together.ai/docs/error-codes.md |
| krea | styles LoRA、402 | 一致；补充 401/404 实为 `{message}` | 实测 |
| replicate | input 嵌套、版本 schema | 一致 | 实测 |
| aimlapi | per-model docs | 一致；v2 新增欠费 403 | 实测 |
| novita | request 嵌套、0–1 | 一致；txt2img 页现 404 | 实测 / 仅快照 |
| venice | docs.venice.ai/swagger.yaml | 一致（两 URL 均 200） | 实测 |
| muapi | openapi.json | 一致；v2 指出 LoRA 字段各端点不同 | 实测 |
| wavespeed | api_schema、1407 | 首版未核实 → 补查确认（文档层） | 官方原文 wavespeed.ai/docs/error-codes |
| sogni | REST + LoRA 目录 | **v2 首版错，已修正** | 实测 |
| fal | 无公开目录 | **有**（v1/models 200） | 实测 |
| modelscope | LoRA 即模型 | loras 映射，和=1 | 官方原文(SPA 渲染) |
| huggingface | parameters 嵌套 | 一致 | 实测 |
| civitai | Flux1/comfy recipe | textToImage additionalNetworks | 官方原文 v2-consumers.json |
| tams | stages/lora.items | 一致；v2 指出签名示例 snake_case vs swagger camelCase | 官方原文 |
| openworks | 文档缺失 | 官方仓库代码可读 | 官方原文(200) |
| nanogpt | 402/x402 | 一致 | 实测 |

## 附录：04:31 已存在内容（他实例写入，原样保留）
# provider-api-audit-v2 · DIFF（相对旧审计 / 草案 / 代码）

## Researchy 03:31 · fal krea-2/turbo/lora + Civitai Krea/Flux2
- **fal `fal-ai/krea-2/turbo/lora`**：OpenAPI 实测无 steps/CFG；loras≤3。草案与代码已对齐 → 无强制改动。
- **Civitai Krea**：官方仅 `engine:fal`+`model:krea2`（无 steps/cfg）。代码 `comfy:krea2` 仍标 steps/cfg supported 并发送 → **代码与官方配方不一致**（且无 comfy 配方页佐证）。
- **Civitai Flux2 Dev**：官方 `numInferenceSteps`/`guidanceScale`；构建器通用映射仍可能发 `steps`/`cfgScale` → **错名 400**（官方排错表）。

## Researchy 04:58 · Flux2 Dev sdcpp 字段名 + flux1-kontext + NanoGPT
- **sdcpp+flux2Dev**：此前草案标「steps/cfg 官方未列 → 未核实」。OpenAPI `Flux2DevSdCpp*ImageGenInput` 已列 **`steps`/`cfgScale`**（及 map 形 `loras`）。与原生 Dev 的 `numInferenceSteps`/`guidanceScale`+array loras **不同路径**。
- **flux1-kontext**：官方无 LoRA；`loras` → 400。草案此前判断正确。
- **NanoGPT**：发现指引支持「按 supported_parameters」；代码「未知照发」与文档不一致（见 nanogpt.md 补查）。

## Researchy 05:29 · Replicate flux-schnell negative/cfg + ModelScope 采样器
- **Replicate `black-forest-labs/flux-schnell`**：官方 Input **无** `negative_prompt`、`guidance`/`guidance_scale`（有 `num_inference_steps` 1–4、`aspect_ratio`）。`schema-contract-tests-16` 指出：未传 schemaProps 时构建器仍发 negative/cfg → **代码与官方 Schema 不一致**（width/height 已 gate，这两项未 gate）。
- **ModelScope**：v2 参数表已写「无采样器」；渲染页 `ms_dom.html` 再数：sampler/scheduler/denoise/采样器 = 0。代码若原样透传 `sampler_name`/`scheduler`/`denoise` 则与官方不符；`cfg`→官方字段名是 `guidance`（有）。
- **AIMLAPI flux-2-lora `image_size`**：今日 curl 文档页 props 含 image_size；与既有 v2/草案一致，无需改结论。


## Researchy 06:02 · WaveSpeed 尺寸两族 + Together image_loras
- **WaveSpeed**：v2 首轮只写了 flux-dev-lora 的 `size:"W*H"` 族。今日官方页确认 **Krea V2 Turbo(±LoRA)** 用 `aspect_ratio`+`resolution`(1k|2k)、**无 size**；**z-image/turbo(±LoRA)** 与 flux-dev-lora 用 `size`、**无 aspect_ratio**。草案 krea 例已有 aspect_ratio/resolution，但「Submit 通用 size」易误导；contractTestHint 应要求 Krea 实发 aspect_ratio/resolution。
- **Together image_loras**：参数页仍写 No longer available / FLUX.2 reject；OpenAPI 仍列且未 deprecated。本地拒对齐参数页官方原文；无 key 未测 HTTP 码。

## Researchy 07:01 · Together image_loras 官方未变；审计「本地拒」过时
- 再 curl parameters.md + openapi.yaml：结论同 06:02（prose reject vs OpenAPI 仍列未 deprecated）。
- 草案/接线已按房间规则改为待确认透传；v2 06:02「画布应本地拒」过时 → 07:01 补段更正。
- 发现 UI 分裂：`BackendSettingsModal` 仍宣称会 400；`CivitaiModal` 粘贴仍拦 together；submit 不拦。交给 canvas-dev，非审计改接线。
