# UIACC-A：Civitai 原生图像（std-civitai-t2i）

结论：`PASS_BILLING`（真实 UI 点击、真实请求已出站；上游因 `insufficientBuzz` 返回 HTTP 400；没有图像产物，因此不等同于 UI 产物验收通过）。

## 请求实参

- 操作路径：浏览器打开 `http://127.0.0.1:18931/` → 鼠标点击「工作流」→「Civitai」筛选→「Civitai · 花饰人像」（当前 main 中等价的 `std-civitai-t2i`）→「仅载入」；画布确认 `8 个节点 · 11 条连线`。
- LoRA 连接：截图 `05-civitai-image-all-params-filled.png` 中 `LoRALoader` 的 MODEL 输出真实连到采样器的 MODEL 输入；LoRA 名称为 `urn:air:krea2:lora:civitai:929497@3077110`，强度 `0.85`。
- 界面填写并回读：
  - 底模 AIR：`urn:air:krea2:diffusionmodel:civitai:2732656@3072332`；Civitai Comfy 路由：`engine=comfy`、`ecosystem=krea2`、`model=turbo`、`operation=createImage`。
  - 正向提示词：`A young woman in a white linen dress standing on a quiet seaside village pier at golden hour, cinematic photorealism, medium portrait composition, soft rim light, 35mm film grain, shallow depth of field, detailed skin texture.`
  - 负向提示词：`blurry, low quality, overexposed, underexposed, distorted anatomy, extra fingers, malformed hands, duplicate people, text, watermark, logo, noisy background.`
  - 尺寸：`832 × 1248`；步数 `8`；CFG `1`；采样器 `euler`；调度器 `simple`；seed `689794262`；quantity/batch `1`。
- 真实出站请求来源：应用自己的 `/tmp/acc-civitai/temp/logs/requests-2026-11-09.jsonl`（运行完成后日志会随 `/tmp/acc-civitai` 清理；完整请求体抄录如下，未抄录任何密钥）：

```json
{
  "steps": [
    {
      "$type": "imageGen",
      "input": {
        "engine": "comfy",
        "ecosystem": "krea2",
        "operation": "createImage",
        "model": "turbo",
        "diffusionModel": "urn:air:krea2:diffusionmodel:civitai:2732656@3072332",
        "prompt": "A young woman in a white linen dress standing on a quiet seaside village pier at golden hour, cinematic photorealism, medium portrait composition, soft rim light, 35mm film grain, shallow depth of field, detailed skin texture.",
        "negativePrompt": "blurry, low quality, overexposed, underexposed, distorted anatomy, extra fingers, malformed hands, duplicate people, text, watermark, logo, noisy background.",
        "width": 832,
        "height": 1248,
        "steps": 8,
        "cfgScale": 1,
        "seed": 689794262,
        "quantity": 1,
        "sampler": "euler",
        "scheduler": "simple",
        "loras": {
          "urn:air:krea2:lora:civitai:929497@3077110": 0.85
        }
      }
    }
  ]
}
```

- 实际 endpoint（来自同一应用日志）：`https://orchestration.civitai.com/v2/consumer/workflows?wait=100`。
- 未发送字段及原因：
  - `clipSkip`：未发送。官方 live `ComfyKrea2TurboImageGenInput` Schema 未声明该字段；Civitai 的 SDXL 官方页面也明确 SDXL 不支持 `clipSkip`，因此没有伪造该字段。
  - `denoise/strength`、`sourceImage/images`：本次是 `createImage` 文生图，不是 `createVariant`/I2V，未发送。
  - workflow 根级 `allowMatureContent`：本次图片实际请求体未包含该根字段。原因是本次图片运行前未在「参数总控台」显式打开 Civitai 根级开关；应用没有暗中补写。官方文档说明该字段是 workflow-level 可选字段，故这里标为“未发送/未验证”，不声称成人开关已经随本次图片请求发送。
  - LoRA trigger word：未发送独立 trigger 字段；本次官方 Schema 的 LoRA 形状是 AIR→strength 对象，实际请求已发送 AIR 和 `0.85`。

## 上游响应

- 浏览器真实点击：顶栏「运行：KSampler 采样器」；截图 `06-civitai-image-run-started.png` 显示“正在提交…”和执行记录请求中。
- 应用执行记录界面显示真实状态：`POST /api/engine/civitai/generate · HTTP 400 · 失败`；截图 `07-civitai-image-run-result.png`、`08-civitai-image-execution-log-error.png`。
- Civitai 原始响应（应用日志和界面均保留，未改写）：

```json
{"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"Bad Request","status":400,"detail":"insufficientBuzz","traceId":"00-ea8e2b52284cae7119288b6f0b1f0ac4-99b3ac90aeb0621e-02"}
```

- 这不是本地 precheck：执行记录显示上游 endpoint、HTTP 400 和原文，证明请求已经出站。

## 产物

- 图像产物：**无**。上游在生成前因 `insufficientBuzz` 拒绝，未返回 workflow ID、图片 URL 或 blob；没有可合法保存、播放、下载或从历史重提的图像。
- 截图（均真实存在于本目录，各截图拍摄时机与操作事件时序详见 [operation-events.md](./operation-events.md)）：
  - `docs/evidence/acceptance-2026-11-09-civitai/01-preset-picker.png` — 253,813 bytes — SHA-256 `ec6feb7add578bdb574704a69112c90a3cbfe50697b9add1b5f3f16dcf68781e`
  - `docs/evidence/acceptance-2026-11-09-civitai/02-civitai-preset-cards.png` — 218,474 bytes — SHA-256 `b810fd585f9802c981b12130ba9128514e667a2ac47c243edadeec1e8d3ee106`
  - `docs/evidence/acceptance-2026-11-09-civitai/04-civitai-image-preset-canvas.png` — 224,469 bytes — SHA-256 `50e137c9179d5585e80b0688a4c4e9e5a3659c598eb04ac3d4f4327c2406a562`
  - `docs/evidence/acceptance-2026-11-09-civitai/05-civitai-image-all-params-filled.png` — 236,048 bytes — SHA-256 `b4b41ef8d17f4a25c532e78bde77d2e2c2be64117c69d5ff4c0d272708735540`
  - `docs/evidence/acceptance-2026-11-09-civitai/06-civitai-image-run-started.png` — 281,776 bytes — SHA-256 `b0ff3a0c6e6782a412741b7a77b6c4f862f0b97b785c3ddffacfd208891d4835`
  - `docs/evidence/acceptance-2026-11-09-civitai/07-civitai-image-run-result.png` — 283,662 bytes — SHA-256 `440752ee210f1309b570e47dd24db7350e2d9a0344518350488489530673d049`
  - `docs/evidence/acceptance-2026-11-09-civitai/08-civitai-image-execution-log-error.png` — 274,226 bytes — SHA-256 `a93de479ac2165639260cb9f6df3084ed13b12a6a5073820c31f0aec7af03b01`

## 搜索记录

- `site:developer.civitai.com Civitai image generation API LoRA AIR prompt steps cfg sampler scheduler`：同一轮并行使用 `mcp__tavily__tavily_search`（HTTP 429/432，计划额度/频率限制，未返回结果）、`mcp__9router__search`（Brave，返回 Civitai 官方 SDXL/recipe 页面）、`mcp__agy-search__search_web`（返回官方 Orchestration/AIR 摘要）。打开的一手页面：
  - `https://developer.civitai.com/orchestration/recipes/sdxl`（`FetchURL` 成功；读取到 Comfy `sampler/scheduler/loras`、尺寸/步数/CFG、无 `clipSkip` 的原文）。
  - `https://developer.civitai.com/orchestration/recipes/`（`FetchURL` 成功；读取 workflow 输出和 cost/whatif 原文）。
- `Civitai Krea 2 Turbo Comfy imageGen loras diffusionModel AIR supported parameters`：同一轮并行三路搜索；Tavily HTTP 432，9Router 返回官方 Krea 页面，Agy 返回搜索结果。打开：
  - `https://developer.civitai.com/orchestration/recipes/krea`（`FetchURL` 成功；官方 Krea FAL 分支原文明确不接受 LoRA/negative/width-height；因此本次不把 FAL Krea 误当作 Comfy LoRA 路径，实际以应用运行时取得的 Comfy Schema 为准）。
  - `https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.yaml`（`FetchURL` 报网络提取错误，页面无法抽取 YAML）；应用运行时实际 GET `https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.json` 返回 HTTP 200，并据此构造上面的 `ComfyKrea2TurboImageGenInput` 请求。
- `Civitai insufficientBuzz Buzz payments workflows 400`：同一轮并行三路搜索；Tavily HTTP 432，9Router 返回官方 `Submitting Work`/`Errors & Retries`，Agy 返回 Buzz/`whatif` 摘要。打开的一手页面：
  - `https://developer.civitai.com/orchestration/guide/submitting-work`（`FetchURL` 成功；原文说明 workflow 使用 Blue/Green/Yellow Buzz、`allowMatureContent`、`whatif=true`）。
  - `https://developer.civitai.com/orchestration/guide/errors-and-retries`（`FetchURL` 成功；原文说明 HTTP 400 为不可重试的请求/验证或支付错误，HTTP 200/202 才代表 workflow 接受）。
- `Civitai Krea 2 / model 2732656@3072332 / LoRA 929497@3077110`：9Router/Agy 搜索与应用 preset 源码交叉核对；应用请求日志证明实际发送 AIR。未把搜索摘要当作请求证据。
- 9Router `jina-reader` 对 `https://developer.civitai.com/orchestration/recipes/wan`、`.../ernie` 抽取曾返回 HTTP 402 `InsufficientBalanceError`；该失败已保留记录，未用其替代官方 `FetchURL` 原文。
