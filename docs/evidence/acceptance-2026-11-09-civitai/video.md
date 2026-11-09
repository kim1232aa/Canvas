# UIACC-A：Civitai 原生视频（std-civitai-t2v）

结论：`PASS_BILLING`（真实 UI 点击、真实 WAN v2.2 Comfy 请求已出站；上游因 `insufficientBuzz` 返回 HTTP 400；没有视频产物，因此不等同于 UI 产物验收通过）。

## 请求实参

- 操作路径：浏览器打开 `http://127.0.0.1:18931/` → 鼠标点击「工作流」→「Civitai」筛选→「Civitai · 电影镜头文生视频」（当前 main 中等价的 `std-civitai-t2v`）→「仅载入」；画布确认 `3 个节点 · 2 条连线`，LoRALoader 的 MODEL 输出真实连接到 AI 视频节点的 `lora` 输入。
- 官方契约：WAN v2.2 Comfy 变体的 live `videoGen` Schema 声明 `engine=wan`、`version=v2.2`、`provider=comfy`，显式 `diffusionModel` AIR、`width/height`、`cfgScale`、`steps`、`fps`、`duration`、`negativePrompt`、`loras[{air,strength}]`、`sampler`、`scheduler`、`shift`。
- 界面填写并回读：
  - 底模 AIR：`urn:air:wanvideo-22-t2v-a14b:checkpoint:civitai:1817671@2114154`。
  - 正向提示词：`PBRSty1e, 3d animation, an adult woman with shoulder-length black hair in a flowing ivory wedding dress walks along a sunlit seaside village pier at golden hour, cinematic medium-wide tracking shot with the subject on the left third and the ocean horizon across the upper third, a light sea breeze moves her veil and dress, warm backlight, polished physically based rendering, realistic fabric and skin detail, smooth natural motion.`
  - 负向提示词：`child, teen, youth, nudity, low quality, blurry, oversaturated colors, blown highlights, flicker, frozen motion, unstable camera, distorted face, malformed hands, extra fingers, duplicate subject, cluttered background, text, subtitles, logo, watermark.`
  - 尺寸：`832 × 480`；`shift=7`；steps `20`；CFG `3`；采样器 `euler`；调度器 `simple`；seed `271109913`；duration `5` 秒；fps `24`。
  - LoRA：`urn:air:wanvideo-22-t2v-a14b:lora:civitai:2247725@2530788`，强度 `1`；Civitai LoRA 官方页面打开成功，触发词 `PBRSty1e` 也写入了正向提示词。
  - Civitai `allowMatureContent=true`：在「参数总控台」可见，实际作为 workflow 根级字段发送；这是用户要求的放开方向，未隐式改成 false。
- 真实出站请求来源：应用自己的 `/tmp/acc-civitai/temp/logs/requests-2026-11-09.jsonl`（运行完成后日志会随 `/tmp/acc-civitai` 清理；完整请求体抄录如下，未抄录任何密钥）：

```json
{
  "allowMatureContent": true,
  "steps": [
    {
      "$type": "videoGen",
      "input": {
        "engine": "wan",
        "version": "v2.2",
        "provider": "comfy",
        "prompt": "PBRSty1e, 3d animation, an adult woman with shoulder-length black hair in a flowing ivory wedding dress walks along a sunlit seaside village pier at golden hour, cinematic medium-wide tracking shot with the subject on the left third and the ocean horizon across the upper third, a light sea breeze moves her veil and dress, warm backlight, polished physically based rendering, realistic fabric and skin detail, smooth natural motion.",
        "diffusionModel": "urn:air:wanvideo-22-t2v-a14b:checkpoint:civitai:1817671@2114154",
        "cfgScale": 3,
        "steps": 20,
        "seed": 271109913,
        "fps": 24,
        "duration": 5,
        "negativePrompt": "child, teen, youth, nudity, low quality, blurry, oversaturated colors, blown highlights, flicker, frozen motion, unstable camera, distorted face, malformed hands, extra fingers, duplicate subject, cluttered background, text, subtitles, logo, watermark.",
        "loras": [
          {
            "air": "urn:air:wanvideo-22-t2v-a14b:lora:civitai:2247725@2530788",
            "strength": 1
          }
        ],
        "width": 832,
        "height": 480,
        "shift": 7
      }
    }
  ]
}
```

- 实际 endpoint（来自同一应用日志）：`https://orchestration.civitai.com/v2/consumer/workflows?wait=60`。
- 未发送字段及原因：
  - `sampler=euler`、`scheduler=simple`：**界面已填写，但实际出站体没有这两个键**。官方 Schema 明确声明它们，故这不是“官方不支持”；已用 `TowerFinding` 提交产品缺陷。源码定位为 AIVideoNode 执行参数整理没有读取 `sampler_name/scheduler`。截图 `10-civitai-video-parameters.png` 证明 UI 值，截图 `13-civitai-video-execution-actual-request.png` 与应用日志证明实际缺失。
  - `num_frames`：未发送；WAN v2.2 Comfy 选定 Schema 未声明该字段，本次使用官方声明的 `duration=5` 与 `fps=24`。
  - `resolution/aspectRatio`：未发送；WAN v2.2 Comfy 选定变体使用显式 `width/height`，不是 FAL 变体的 resolution/aspectRatio。
  - `operation`：未发送；WAN v2.2 Comfy 选定 Schema 的 discriminator 只要求 engine/version/provider，T2V 操作由该变体确定。
  - `clipSkip`：未发送；官方 WAN 视频 Schema 未声明该字段，界面也没有可用的 clipSkip 控件。
  - `sourceImage/images`：T2V 不适用，未发送。

## 上游响应

- 浏览器真实点击：顶栏「运行：AI 视频 (Civitai)」；截图 `12-civitai-video-run-result.png` 显示执行记录已到上游 HTTP 400。
- 应用执行记录界面显示真实状态：`POST /api/engine/civitai/generate · HTTP 400 · 失败`；截图 `13-civitai-video-execution-actual-request.png` 展开了应用自己的 `实际上游请求 actualRequest · Civitai`，同时显示相同的 HTTP 400 原文。
- Civitai 原始响应（应用日志和界面均保留，未改写）：

```json
{"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"Bad Request","status":400,"detail":"insufficientBuzz","traceId":"00-742b3e3265c2efdf5ae333afc72bae8f-a25ca82625cb566c-02"}
```

- 这不是本地 precheck：应用日志记录了真实 POST endpoint 和上游 HTTP 400，界面 actualRequest 展示了完整 `videoGen` envelope。
- 因 400 在提交阶段返回，没有 workflow ID，也没有需要轮询的任务；按项目规则没有更换 provider/model、没有重试同一动作、没有用脚本直调替代 UI。

## 产物

- 视频产物：**无**。没有返回视频 blob、URL 或 workflow ID；因此没有播放、下载、历史详情确认或历史重提操作。上述后续动作仅在生成成功时适用，本次标为未验证。
- 截图（均真实存在于本目录，各截图拍摄时机与操作事件时序详见 [operation-events.md](./operation-events.md)）：
  - `docs/evidence/acceptance-2026-11-09-civitai/09-civitai-video-t2v-preset-loaded.png` — 161,804 bytes — SHA-256 `ca82fc029a99a0fa6eb293a8e21755b3d5e7549634948446c96580e8cbb0151a`
  - `docs/evidence/acceptance-2026-11-09-civitai/10-civitai-video-parameters.png` — 217,854 bytes — SHA-256 `1763951412849e969aafb665c82abb409885a3863b8a3a4635a3ac6b42087455`
  - `docs/evidence/acceptance-2026-11-09-civitai/11-civitai-video-canvas-filled.png` — 160,008 bytes — SHA-256 `c3811d67e1bdf7d43deac1139a36b36ca9fa5bae8eca5e040843e18985568d85`
  - `docs/evidence/acceptance-2026-11-09-civitai/12-civitai-video-run-result.png` — 188,987 bytes — SHA-256 `ca2547bc4be6079bff0270b3b67985f6c32afbc94927f6ccb9dcb389d6b8af8a`
  - `docs/evidence/acceptance-2026-11-09-civitai/13-civitai-video-execution-actual-request.png` — 228,499 bytes — SHA-256 `c1490d90ef4eb6481e3fe4dce279ec1891d31a6f164328a72ba033ecc44c6b69`

## 搜索记录

- `Civitai Developer video generation recipes official text to video workflow LoRA`：同一轮并行使用 `mcp__tavily__tavily_search`（HTTP 429/432，额度/频率限制，未返回结果）、`mcp__9router__search`（Brave，返回官方 WAN/LTX2/Hunyuan recipe 页面）、`mcp__agy-search__search_web`（返回 Orchestration videoGen/AIR 摘要）。打开的一手页面：
  - `https://developer.civitai.com/orchestration/recipes/wan`（`FetchURL` 成功；原文读取 WAN v2.2 Comfy 的 provider/version、width/height、LoRA AIR+strength、成本和 wait=0 说明）。
  - `https://developer.civitai.com/orchestration/recipes/hunyuan`、`https://developer.civitai.com/orchestration/recipes/ltx2`（`FetchURL` 成功，用于交叉核对 videoGen 输出形状和 video blob 规则；未切换供应商）。
  - `https://developer.civitai.com/orchestration/recipes/`（`FetchURL` 成功；官方列出 WAN、LTX2 等 videoGen recipes）。
- `Civitai official videoGen OpenAPI Wan22ComfyVideoGenInput sampler scheduler loras AIR`：使用 9Router/Agy 搜索并读取官方 live Schema；应用运行时实际 GET `https://orchestration.civitai.com/v2/consumer/recipes/videoGen/openapi.json`，返回 HTTP 200。另行用命令下载的 `https://orchestration.civitai.com/v2/consumer/recipes/videoGen/openapi.yaml` 已解析出 Wan22Comfy 分支字段；`FetchURL` 对该 YAML 报网络提取错误（页面无法抽取 YAML），未把失败当成功。
- `Civitai 2247725 model version 2530788 Wan 2.2 T2V LoRA`：9Router/Agy 搜索；打开：
  - `https://civitai.com/models/2247725/stylized-pbr-animation-wan-22-t2v`（`FetchURL` 成功；原文读取 LoRA 描述与触发词 `PBRSty1e`）。
  - `https://civitai.com/api/v1/model-versions/2530788`（`FetchURL` 报 network/extraction error，未以其为证据；AIR 与强度由 UI 预设、应用 actualRequest 和运行 Schema 共同证明）。
- `Civitai insufficientBuzz videoGen WAN 2.2 Buzz`：同一轮并行三路搜索；Tavily HTTP 432，9Router 返回官方 WAN recipe/MCP/Buzz 页面，Agy 返回错误原因摘要。打开的一手页面：
  - `https://developer.civitai.com/orchestration/guide/submitting-work`（`FetchURL` 成功；原文说明 `allowMatureContent=true` 强制 Yellow Buzz，`whatif=true` 可预估成本，余额不足会拒绝）。
  - `https://developer.civitai.com/orchestration/guide/errors-and-retries`（`FetchURL` 成功；原文说明 400 是不可按原请求重试的错误，且 Buzz 用尽可能在工作排队前取消）。
- 9Router `jina-reader` 对部分 Civitai recipe 的抽取曾返回 HTTP 402 `InsufficientBalanceError`；已如实保留该失败，未用 provider fallback 或二手摘要替代官方 `FetchURL` 原文。
