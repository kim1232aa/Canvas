# TAMS 硬套核对 + 多案矩阵 — 2026-10-17 Asia/Tokyo

## 硬套结论（未改代码）

画布 → `TensorArtDriver` → `POST /api/tensorart/generate` → `buildTensorModelJob`（`src/schemas/tensorModelApi.ts`）已硬套：

| 画布字段 | TAMS stages | 代码 |
|---|---|---|
| `seed` | `stages[0].inputInitialize.seed`（string） | L28–30 |
| `count` / `batchSize`→`extraParams.count` | `inputInitialize.count` | L32–34；FE：`frontendParameters.ts` L58 / `graphEngine.ts` L1270 |
| `width`/`height` | `stages[1].diffusion.width/height` | L36（必填） |
| `steps` | `diffusion.steps` | L37–39 |
| `cfg` | `diffusion.cfgScale` | L41–43 |
| `loras[]` | `diffusion.lora.items[{loraModel,weight}]` | L51–62 |
| `prompt` / `negative_prompt` | `prompts` / `negativePrompts` | L36 |

本批**无新增硬套**（上述字段已齐）。OpenWorks 未动。

## 探针矩阵（经画布路由，Bearer=`TENSORART_TAMS_TOKEN`）

Host：`https://ap-east-1.tensorart.cloud` · 路径 `/v1/jobs`（鉴权探测走 `/v1/models/{id}`）

| # | 案 | HTTP | 上游原文要点 | actualRequest 要点 | 文件 |
|---|---|---|---|---|---|
| ① | prompt+W/H only | **400** | `credits not enough` | W/H+prompt+sdModel；无 seed/steps/cfg/lora | `01-prompt-wh-only.json` |
| ② | +seed+steps+CFG | **400** | `credits not enough` | seed=`42`, steps=20, cfgScale=7 | `02-seed-steps-cfg.json` |
| ③ | +LoRA 6616…@1.1 | **400** | `credits not enough` | `lora.items=[{loraModel,weight:1.1}]` | `03-lora.json` |
| ④ | wrong Bearer | **404** | `unauthorized` / `app not found` | 未用 env 真 Bearer 冒充成功 | `04-wrong-bearer.json` |
| ⑤ | OpenWorks 对照 | **200** | task WAITING（四字段） | `toolName`+inputs×4；**无 LoRA** | `05-openworks-control.json` |

①–③ = **PASS_BILLING**（密钥有效、欠费原文）。④ = 错钥对照。⑤ = OpenWorks 官方四字段（prompt / image width / image height / result image count）。

## FE E2E 脚本参数

无需改映射。拍前端时仍用：

- 服务商：`tensorart`（Tensor.Art 模型 API）
- Checkpoint `613045163490732233`；LoRA `661652545330040294` strength 1.1
- seed/steps/cfg/宽高按 UI 填写即可进 stages
- 期望 toast/历史：`credits not enough`；历史 `actualRequest` 含对应字段与 `lora.items`

OpenWorks 对照：服务商 `openworks` / `photoreal_studio_z_image`；只填 prompt+宽高+张数；勿挂 LoRA。

## 服务

PID 106904 · `127.0.0.1:3000`
