# Novita polish + 两处文案 · 2026-10-16 · CODE_ONLY

## 结论
- **Novita**：目录无 `parameters` 时走 `src/config/providerDeclarations/novita.txt2img.json`（官方 V3 迁移指南转录），**真出站** `POST https://api.novita.ai/v3/async/txt2img`；`actualRequest.parameters = { extra, request }`，含 `model_name` / `prompt` / `loras[{model_name,strength}]` / `steps` / `seed` / `guidance_scale`。上游 **HTTP 403** `NOT_ENOUGH_BALANCE` 原文透传 → 服务端可证 **PASS_BILLING** 级（欠费/余额不足接线；非真出图）。
- **文案**：去掉 LoRA 旁「待验证」；`pending` 徽章改为「Schema 未读取」（废「发送情况未知」）；已声明且已填字段在 unprobed 官方 Schema 下也显示「会发送」（四档对齐：会发送 / 未填写，不发送 / Schema 不支持 / Schema 未读取|不可用）。
- **Replicate**：本批未做。
- **未 commit / 未 push**；未开浏览器拍图（按任务不喊画布重拍）。

## 官网核对（改前 WebFetch）
- https://docs.novita.ai/guides/model-apis-v2-to-v3-migration
- https://docs.novita.ai/guides/model-apis-v2-to-v3-migration.md
- 契约：`{ extra, request }`；LoRA = `request.loras[{ model_name, strength∈[0,1] }]`；`model_name` = 目录 `sd_name_in_api`。

## 根因
- 旧 E2E（`/workspace/canvas-e2e-novita-fe/outcome.json`，03:20）**早于** HTML 声明落地（03:25），当时 `loadProviderDeclaration` 为空 → `BLOCKED_SCHEMA_LOOKUP`。
- 声明已存在后仍缺：`model_name` 未进 declaration properties；字段描述残留「待确认」；UI unprobed →「发送情况未知」与挑刺四档不符。

## 改动文件
| 文件 | 改动 |
|---|---|
| `src/config/providerDeclarations/novita.txt2img.json` | 补 `model_name`；`x-fetchedAt=2026-10-16`；去掉描述里「待确认」；sources 加 .md |
| `src/server/schemaProviders.ts` | （既有）无 parameters → `loadProviderDeclaration` → `official-html-declaration` 出站；submit 包 `{extra,request}` + `novitaLoras` |
| `src/components/FieldStatusBadge.tsx` | `pending` →「Schema 未读取」 |
| `src/utils/schemaSendStatus.ts` | 已声明+已填 → `will_send`（不再被 schemaUnprobed 挡成 pending） |
| `src/components/ParameterInspector.tsx` | 去掉 LoRA「待验证」chip |
| `src/components/SpatialFrameItem.tsx` | 同上 |
| 相关 `*.test.ts(x)` | 对齐新文案/徽章/声明 |

## Restore
`/workspace/canvas-restore/pre-novita-polish-20261016-085318.tgz`（Asia/Tokyo 墙钟命名；打包时刻 box CST≈08:53）

## 后端重启（仅一次）
- 旧 PID：2396826
- 新 PID：**2429653**
- 启动（Asia/Tokyo）：**2026-10-16 09:58:15 JST**
- `cwd=/workspace/canvas/Canvas-main`；`npx tsx server.ts`；`curl 127.0.0.1:3000 → 200`

## Live 证据（本机 Key，密钥未写入本文件）
目录：`docs/evidence/novita-polish-batch-2026-10-16/`
1. `schema.json`（credentialRef 已打码）：`schemaStatus=official-html-declaration`，`endpoint=https://api.novita.ai/v3/async/txt2img`，properties 含 `model_name`+`loras`
2. `submit-redacted.json`：
   - `errorSource=upstream`
   - `error` 含 `HTTP 403` / `NOT_ENOUGH_BALANCE` / `insufficient balance`
   - `actualRequest.parameters.request`：
     - `model_name=dreamshaper_8_93211.safetensors`
     - `prompt=a lighthouse on a cliff at sunset, detailed`
     - `loras=[{model_name:more_details_59655, strength:0.75}]`
     - `steps=20`, `seed=42`, `guidance_scale=7`
   - 有 `extra` 包装

## 单测
`vitest`：novitaDeclaration / novitaProvider / schemaNoFallback / schemaContract / schemaSendStatus(+unprobed) / clean1029 / runDFollowups / SpatialFrameItem.loraCopy / nodeUI / veniceReverifyUi — 相关用例绿。

## 残留风险
- 前端干净会话实拍未做（CODE_ONLY）；挑刺认图归画布。
- 上游 403 余额不足，非 PASS_GENERATION。
- `x-liveConfirmed` 仍全 false（对照表升「会发送」归 tinkabot，等挑刺认过）。
- Venice/其他 unprobed 供应商徽章将直接显示「会发送」（与 clean-1029 四档一致）；若产品仍要对照表级「未确认」需另通道，勿再写「发送情况未知」。
- Novita 视频 `/v3/async/txt2video` 仍无声明 → 继续本地拦（符合铁律）。
