# Venice 复验 UI 四条 + Schema aspect/format · CODE_ONLY · 2026-10-15

结论：**CODE_ONLY**（无浏览器；不宣称 PASS_BILLING）。画布挑刺 / VERDICT_OVERRIDE 驳回后的四条 UI + WaveSpeed/Venice 通用 Schema 透传一并落地。

## 官方依据（live）
- Venice Image Generate：https://docs.venice.ai/api-reference/endpoint/image/generate  
  - `format` enum `jpeg|png|webp`，默认 `webp`  
  - **按模型 sizing**：像素模型用 `width`/`height`（如 venice-sd35）；比例模型用 `aspect_ratio`（如 qwen-image-2）；Qwen Image 族对 `width`/`height` 回 **HTTP 400**；分辨率阶梯模型用 `aspect_ratio`+`resolution`（1K/2K/4K）
- OpenAPI：https://api.venice.ai/doc/api/swagger.yaml → `GenerateImageRequest.format`
- 目录 constraints：`GET https://api.venice.ai/api/v1/models?type=image`（无 key 200）— `aspectRatios` / `resolutions` / `widthHeightDivisor` 区分三种 sizing
- WaveSpeed 证据：`/workspace/canvas-e2e-wavespeed/history-export.json` Schema 有 `aspect_ratio`，actualRequest 仅 prompt/seed/strength（CLAIM `/workspace/canvas-e2e-schema-aspect-p0/CLAIM.md`）
- 挑刺覆写：`/workspace/canvas-e2e-venice-p0-reverify/VERDICT_OVERRIDE.md`

## 四条 UI（挑刺驳回）
| # | 问题 | 修复 |
|---|---|---|
| 1 | `lora_strength` 空值旁写「不发/不发送」 | `SchemaChoiceControls`：`schemaUnprobed`/未 liveConfirmed 时 placeholder 与空 option 一律「待确认」，正文禁止「不发」 |
| 2 | Venice 已选模型，下拉变「未选择」 | `patchInspectorNode`：同 provider 时空 checkpoint 不覆盖已有 `ckpt_name`；`ProviderModelSelect` 在目录未命中时保留当前 value option |
| 3 | 节点 LoRA 区「来源: venice-edit」类残留 | 切换 provider 时清空 `resource_source`/`resource_kind`/`download_url`/`civitai_id`；`ApiParameterEditor`/`SchemaChoiceControls` 优先展示 `schemaSource`（OpenAPI），不把目录 URL 当 Schema 来源 |
| 4 | LoRA Hub Venice 主文案与黄字重复「无 LoRA 目录接口…」 | `CivitaiModal`：`noUpstreamCall` 且主文案已含 notice 时不再渲染黄字 `catalogNotice` |

另：CheckpointLoader 节点补上 Venice 的 `ApiParameterEditor`（原先列表漏了 venice）。

## Schema 通用（禁止暴力套一种尺寸/格式）
| 改动 | 说明 |
|---|---|
| `SchemaProviderDriver` | 提交体增加 `aspect_ratio` / `resolution` / `output_format`（仅转发；是否入上游由服务端 Schema 决定） |
| `schemaProviders` submit | 画布字段映射补 `aspect_ratio`/`resolution`/`output_format`→别名含 Venice `format` |
| `applyModelSpecConstraints` | 有 `aspectRatios` → 去掉 width/height（比例模型）；无 aspectRatios 且有 `widthHeightDivisor` → 去掉 aspect_ratio/resolution（像素模型）；`format` 始终保留 OpenAPI enum |
| `schemaSendHint` | 别名对齐 aspect_ratio / format；`format` 仍可由 SchemaChoiceControls 展示（不进 CANVAS_MAPPED） |

## 测试
- `npx vitest run src/components/veniceReverifyUi.test.tsx src/server/schemaAspectFormat.test.ts src/server/schemaContract.test.ts src/server/veniceP0Fix.test.ts src/server/batch0503.test.ts` → 通过
- 全量：1059 pass；`mediaHostedReview` 2 fail 为既有 hosting fixture，与本批无关

## 恢复包
- `/workspace/canvas/canvas-restore/pre-schema-aspect-format-20261015-042342.tar.gz`
- `/workspace/canvas/canvas-restore/pre-venice-reverify-ui-042648.tar.gz`

## 画布 FE 复验清单（不宣称 PASS）
1. 参数面板 `lora_strength` / `format` / `variants` / `quality`：未填时只见「待确认」，不见「不发」「不发送」
2. 选好 `venice-sd35` 后硬刷新或关开参数面板：下拉与「提交…模型：」仍是 venice-sd35，不是「未选择」
3. Checkpoint / LoRA 区无「来源: venice-edit」或过期 resource_source 黄签
4. LoRA Hub → Venice：主文案一句「无 LoRA 目录接口…」，黄字不重复
5. WaveSpeed：填 aspect_ratio 后 actualRequest 含该字段（schema-aspect P0）
6. Venice 比例模型（如 qwen-image-2）：Schema 无 width/height；填像素应 mapping sent:false 并写明 constraints；`format` 可选 jpeg/png/webp
