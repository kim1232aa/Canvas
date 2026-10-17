# Replicate 接线 · CODE_ONLY · 2026-10-16

状态：**CODE_ONLY**（服务端 live 证据到 HTTP 402 欠费；未经画布前端 E2E，不是 PASS）

备份：`/workspace/canvas/temp/backups/canvas-restore/pre-replicate-20261016-103237.tgz`

## 官网核对（改前）
- HTTP：https://replicate.com/docs/reference/http — `POST /v1/predictions`，参数在 **input**；亦可 `POST /v1/models/{owner}/{name}/predictions`
- live OpenAPI（`GET /v1/models/black-forest-labs/flux-dev-lora`，version `ae0d7d645446924cf1871e3ca8796e8318f72465d2b5af9323a835df93bf0917`）：
  - LoRA：`lora_weights` (string) + `lora_scale` (−1…3，默认 1)；`extra_lora` / `extra_lora_scale`
  - 其它：`prompt` 必填、`guidance`（**不是** guidance_scale）、`num_inference_steps`、`seed`、`aspect_ratio`、`image`、`prompt_strength`…
  - **没有**统一 `loras[]` / `guidance_scale`

## 本轮改动
1. `ReplicateDriver.supportedModels` 增加 `black-forest-labs/flux-dev-lora`（supportsLora=true）；`flux-dev` 改为 supportsLora=false（官方 Input 无 LoRA，勿张冠李戴）。
2. `replicateImageContract.ts`
   - LoRA：无 live props 时也看 PROVIDER_SCHEMA；不支持则抛错，**禁止**静默写成 `hf_lora`。
   - 直传 `lora_weights` / `hf_lora` 同样按 Schema/表声明决定是否发送。
   - img2img：`image` / `input_image` / `prompt_strength` 走 `place()`（只发声明字段）。
   - 去掉按模型名硬编码的 `isOfficialBflFluxLora` / `isOfficialBflFluxDev` 分支；`guidance` vs `guidance_scale` 只由 Schema/表决定。
3. `providerSchema.ts`：flux-dev / flux-dev-lora 补 `image` 字段（对齐 live Input）。

## 无 Schema 路径（仍拦，无 POST predictions）
- 单测：`replicateNoSchemaBlock.test.ts`（既有）
- live Schema GET：`someone/does-not-exist-zzz` → HTTP **404** `{"detail":"Model not found."}`（见 raw）
- 路由行为不变：`blocked:'schema_missing'`、`actualRequest:null`、`notSent:true`；executionTrace 仅 Schema GET

## 有 Schema 真发（flux-dev-lora）
构建出站（PROVIDER_SCHEMA / live 一致字段）：

```json
{
  "endpoint": "https://api.replicate.com/v1/models/black-forest-labs/flux-dev-lora/predictions",
  "input": {
    "prompt": "a red apple on a wooden table, studio light",
    "seed": 7,
    "num_inference_steps": 28,
    "guidance": 3,
    "lora_weights": "fofr/flux-pixar-cars",
    "lora_scale": 0.85
  }
}
```

- LoRA 字段名：**`lora_weights` + `lora_scale`**（不是 `loras[]`）
- CFG 字段名：**`guidance`**（不是 `guidance_scale`）
- live POST 上游：**HTTP 402** Insufficient credit（欠费原文，可作 PASS_BILLING 级服务端证据；非真出图）

证据文件：`docs/evidence/replicate-wiring-2026-10-16-raw/`

## 测试
相关 vitest 已绿（含新增：静态表 alone 拒 flux-schnell/flux-dev 挂 LoRA；Driver 含 flux-dev-lora）。

## 残留 / 未做
- 前端干净会话 E2E（历史芯片 vs actualRequest）→ 画布重拍
- 有额度真出图 → PASS_GENERATION
- 无 Schema 假模型的前端 Network 无 POST 截图 → 画布
- Cloudflare 对部分裸 urllib GET 会 1010；服务端 upstreamFetch / curl 正常

## 对照清单
`docs/evidence/novita-replicate-accept-checklist-2026-10-16.md` · `docs/evidence/replicate-noschema-block-2026-10-15.md`
