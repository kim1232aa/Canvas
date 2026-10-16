# Civitai API 审计

抓取日期：2026-10-15 Asia/Shanghai  
研究方法：官方 Developer Docs（`developer.civitai.com`）markdown / llms.txt / WebFetch；Grok CLI 本轮 **401**（auth recovery 后 inference 仍拒）。  
范围：Orchestration API（consumer workflows）+ Site API 模型目录；并核对 Krea recipe 的 **no-LoRA** 说明。

## 1) 官方 docs / OpenAPI URL

| 资源 | URL | 备注 |
|------|-----|------|
| Developer 总索引 | https://developer.civitai.com/llms.txt | 含 Orchestration / Site / Apps |
| Orchestration 介绍 | https://developer.civitai.com/orchestration.md | |
| Quick start | https://developer.civitai.com/orchestration/guide/getting-started.md | |
| Authentication | https://developer.civitai.com/orchestration/guide/authentication.md | |
| Submitting / Buzz | https://developer.civitai.com/orchestration/guide/submitting-work.md | |
| Recipes 总览 | https://developer.civitai.com/orchestration/recipes.md | |
| Flux 1（含 LoRA） | https://developer.civitai.com/orchestration/recipes/flux1.md | |
| Flux 2（含 LoRA / pro·max 无 LoRA） | https://developer.civitai.com/orchestration/recipes/flux2.md | |
| Krea v2（**无 LoRA**） | https://developer.civitai.com/orchestration/recipes/krea.md | |
| WAN 视频 | https://developer.civitai.com/orchestration/recipes/wan.md | |
| imageGen 操作 | https://developer.civitai.com/orchestration/reference/operations/InvokeImageGenStepTemplate.md | |
| SubmitWorkflow | https://developer.civitai.com/orchestration/reference/operations/SubmitWorkflow.md | `POST /v2/consumer/workflows` |
| GetWorkflow | https://developer.civitai.com/orchestration/reference/operations/GetWorkflow.md | 轮询 |
| 每 recipe OpenAPI | `https://orchestration.civitai.com/v2/consumer/recipes/<name>/openapi.yaml` | recipes 页声明 |
| Site 模型列表 | https://developer.civitai.com/site/reference/models.md | `GET /api/v1/models`（civitai.com Site API） |

基址（Orchestration）：`https://orchestration.civitai.com`

## 2) 鉴权方式

官方原文要点（authentication.md，2026-10-15 抓取）：

- 所有 consumer 端点需要：`Authorization: Bearer <token>`
- Token 在 civitai.com 账户生成/吊销
- 文档 Run 部件可用 `whatif=true` 预览费用，或 `wait=` 内联等待再轮询 GetWorkflow

## 3) 模型目录端点（list / 分页 / 搜索）

### A. Site API（市场目录：Checkpoint / LoRA 等）

- `GET https://civitai.com/api/v1/models`（文档：https://developer.civitai.com/site/reference/models.md）
- 分页：`limit`（1–100，默认 100）、`page` **或** `cursor`（`metadata.nextCursor`）
- 搜索：`query`（全文，需 cursor 分页）
- 过滤：`types`（含 LoRA 等 ModelType）、`baseModels`、`supportsGeneration`、`tag`、`username`、`nsfw` 等
- 用途：浏览/选 AIR 所需的 modelId@version；**不是** Orchestration 的「可运行服务目录」本身

### B. Orchestration 资源 / 服务

- `GET /v2/resources`（Queue / Loaded 视图）、`GET /v2/resources/{air}`
- `GET /v2/services`、`GET /v2/services/{serviceId}`（如 `image/flux2/klein/createImage/9b`）
- 生成时模型以 **AIR URN** 传入（如 `urn:air:flux1:diffuser:civitai:618692@691639`）

## 4) 生图 / 生视频端点与异步轮询

### 统一提交

```
POST https://orchestration.civitai.com/v2/consumer/workflows?whatif=false&wait=60
Authorization: Bearer <token>
Content-Type: application/json
Body: { "steps": [ { "$type": "imageGen"|"videoGen"|…, "input": { … } } ] }
```

查询参数要点（getting-started / submitting-work）：

| Param | 作用 |
|-------|------|
| `wait` | 内联阻塞秒数；`0` 立即返回 in-flight workflow |
| `whatif` | 只估价/校验不执行 |
| `tier` | `"paid"` \| `"free"`（免费档另有 `GET /v2/consumer/free-tier`） |

### 轮询

```
GET https://orchestration.civitai.com/v2/consumer/workflows/{workflowId}
```

状态经 `unassigned → preparing → scheduled → processing`，终态 `succeeded|failed|expired|canceled`。长任务（尤其视频）建议 `wait=0` + 轮询/webhook。

### 生图（imageGen）

- `$type`: `imageGen`
- 引擎/生态按 recipe：`flux2`、`sdcpp`+`flux1`、`fal`+`krea2`、`comfy` 等
- 也可走 recipe 捷径：`POST /v2/consumer/recipes/imageGen`（及历史 `textToImage`）

### 生视频（官方有公开 API）

- `$type`: `videoGen`
- 官方 recipe 覆盖 WAN / LTX2 / Kling / Vidu / Veo3 / Seedance / Hunyuan / FLUX-3 video 等（见 orchestration/recipes 视频分区）
- **WAN 示例**（wan.md）：

```json
{
  "steps": [{
    "$type": "videoGen",
    "input": {
      "engine": "wan",
      "version": "v2.6",
      "provider": "fal",
      "operation": "text-to-video",
      "prompt": "…",
      "resolution": "1080p",
      "aspectRatio": "16:9",
      "duration": 5,
      "enablePromptExpansion": true
    }
  }]
}
```

WAN 常用参数（文档表）：

| 字段 | 典型值 | 备注 |
|------|--------|------|
| `resolution` | `720p` / `1080p`（v3.0 另有 `480p`） | |
| `aspectRatio` | `16:9` / `9:16` / `1:1` 等 | |
| `duration` | `5` / `10`（秒） | 长片易超时 → webhook |
| `operation` | `text-to-video` / `image-to-video` / `reference-to-video` / `edit-video` | 随 version 变化 |
| LoRA（仅部分路径） | v2.2 `comfy`：`loras: [{ air, strength }]` | fal 路径无此能力 |

**fps**：WAN fal 路径文档表**未**把 `fps` 列为通用字段；Comfy/Turbo 路径另有插帧相关 knobs。以具体 schema 为准，禁止对 fal WAN 硬塞未文档字段。

另有大量其它 videoGen engines（Kling、Veo3、Seedance…）——集成时必须按对应 recipe 页，不跨引擎套参数。

## 5) LoRA

### Orchestration 生图：官方字段

| 路径 | 字段形状 | 强度 | 支持情况 |
|------|----------|------|----------|
| Flux1 `sdcpp` / `comfy` | `loras`: `{ "<AIR URN>": <strength> }` | 文档写典型 `0.0`–`2.0` | **支持** |
| Flux2 Klein | 同上 map | 同上 | **支持** |
| Flux2 Dev | `loras[]`: `{ air, strength }` | — | **支持**（形状与 Klein **不同**） |
| Flux2 `pro` / `max` | — | — | **No LoRAs**（官方表） |
| Flux1-kontext | — | — | **No LoRAs** |
| **Krea v2** | — | — | **不接受 LoRAs**（见下） |

官方 Krea 原文（krea.md）：

> Krea v2 does **not** accept LoRAs, negative prompts, or explicit width/height — use the Flux 2 or Qwen recipes if you need any of those.

未知属性（含对无 LoRA 引擎传 `loras`）→ `400`（Flux1 troubleshooting：`loras` on `flux1-kontext` 等）。

**画布规则建议**：引擎/模型不支持 LoRA → **拒绝挂载控件与请求字段**，禁止静默剥离；Krea 与 Flux2 pro/max/kontext 属此类。

### Civitai 作为 LoRA **市场** vs 生成挂载

- Site API 可 list/search `types=LORA` 等资源，得到 model/version → 构造 AIR
- 真正进生成请求的是 Orchestration 的 `loras` / AIR，不是「下载文件路径」
- LoRA 无效：文档称可能 **静默无效果**（URN 错/未发布）或 `400`「LoRA not found」（Flux2）

### 视频 LoRA

- WAN：**仅** `provider: comfy` + `version: v2.2` 文档写明 `loras` 数组；默认 fal 路径**无** LoRA

## 6) seed / steps / cfg / size

### 生图（按 recipe；以官方表为准）

| 来源 | seed | steps | cfg | 尺寸 |
|------|------|-------|-----|------|
| Flux1 sdcpp | `seed` int64，默认 random | `steps` 默认 28，范围 4–50 | `cfgScale` 默认 3.5，1–20 | `width`/`height` 默认 1024；**832–1216** 且可被 16 整除 |
| Flux1 comfy | 有 | 例 20 | `cfgScale` | 最大至 2048 |
| Flux2 Klein | `seed` int64 | `steps` 默认 20，4–50 | `cfgScale` 默认 5，1–20 | 512–2048；Klein 需可被 16 整除 |
| Flux2 Dev/Flex | `seed` | `numInferenceSteps` 默认 28 | `guidanceScale` | 同上宽高 |
| **Krea v2** | `seed` **uint32**，quantity 批内共用 | **无** steps/cfg | 无 | **无** w/h；用 `aspectRatio` + `size`=`medium`\|`large` |

### 生视频（WAN）

- 文档通用表强调 `resolution` / `aspectRatio` / `duration`；**未**将 `seed` 列为 WAN fal 通用字段（若某 schema 有 seed，以该 schema 为准，勿臆造）
- 费用与 `duration`、分辨率线性相关（见下）

## 7) 计费 / 402 / 余额线索

- 货币：**Buzz**（账户余额），API **不传美元金额**（submitting-work.md Payments (Buzz)）
- 预览：`whatif=true` 返回费用计划
- `tier: "free"` + `GET /v2/consumer/free-tier` 查免费模型与剩余配额
- 成熟内容：`allowMatureContent` 强制 **yellow** Buzz；蓝/绿 Buzz 遇成熟内容时 `upgradeMode` `manual`/`automatic`；黄 Buzz 不足时 update 可 `400`
- 各 recipe 给出 Buzz 公式（Flux1/2 按 steps/像素；Krea 固定 39/78 等；WAN 按秒×分辨率）
- 本轮官方页**未**突出 HTTP **402** 字样；余额不足表现为 workflow/`400` 或支付相关失败——集成应保留上游状态码与 body，禁止改写成功

## 核对接线时注意

1. **Krea ≠ 可挂 LoRA**（与 Flux 族不同）——UI 与 Schema 必须按 engine 切换。
2. Flux2 Dev 的 LoRA 是 **数组**，Klein 是 **map**——禁止张冠李戴。
3. 视频默认走 `videoGen`，不要用 imageGen 冒充。
4. Site API 目录 ID ≠ 可直接当 diffuser；需 AIR。

## 本轮失败记录

| 工具 | 结果 |
|------|------|
| `grok -m grok-4.6 …` | exit **1**，401 Auth recovery succeeded but inference rejected |
| WebFetch / curl 官方 `.md` | 成功（上表 URL） |

## 官方 recipe 复核（2026-10-15 02:4x (Asia/Shanghai)）

- Flux2 dev（https://developer.civitai.com/orchestration/recipes/flux2.md）："Klein uses `cfgScale`/`steps`/`sampleMethod`; dev/flex use `guidanceScale`/`numInferenceSteps`."；排错表："`400` with unexpected property … `cfgScale` on `dev`"。→ dev 发 steps/cfgScale 会 400（非静默忽略）。
- Krea v2（recipes/krea.md）：`engine: "fal"`, `model: "krea2"`；参数无 steps/cfg（见上表）。
- Kontext（recipes/flux1.md）：独立 `engine: "flux1-kontext"`，models dev/pro/max；"No checkpoint selection, no LoRAs, no sampler knobs."；排错："`400` with unknown property … `loras` on `flux1-kontext`"。
