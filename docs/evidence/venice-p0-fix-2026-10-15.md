# Venice P0 修复 · 2026-10-15

结论：**CODE_ONLY**（无浏览器；不宣称 PASS_BILLING）。服务端 smoke 此前已能发送 width/height/negative_prompt/cfg_scale（`/workspace/canvas-e2e-venice/smoke-result.json`）；前端 E2E FAIL_PARAM_DROP（`/workspace/canvas-e2e-venice-fe/outcome.json`）根因已修，待画布前端复验。

## 官方依据（实时）
- Image Generate OpenAPI：https://docs.venice.ai/api-reference/endpoint/image/generate （stamp `20261012.214344`）
- 字段确认：`width`/`height`（像素模型，≤1280，默认 1024）、`negative_prompt`（≤7500）、`cfg_scale`（0&lt;x≤20）、`lora_strength`（integer 0–100，仅捆绑附加 LoRA 的模型）
- Schema 草案：`docs/provider-schema-drafts/venice.json`（已补 `image.parameters.lora_strength`，`x-liveConfirmed: false`）

## 根因
1. **历史 CFG「未发送」**：`historyParameters.FIELD_KEYS.cfg` 缺 `cfg_scale` 别名；FE 卡 JSON 已有 `cfg_scale:7.5` 却标未发送。
2. **FE 丢宽高/负向**：图里无 EmptyLatent / 负向 CLIP 时，参数面板写入无处落盘；执行 `extractWorkflowParameters` 读不到 → actualRequest 只有 prompt/steps/cfg_scale/seed/model（对照 hist_1792006657889）。
3. **面板关开清空宽高**：`activeParams` 用 `{...graphParams,...rawInspectorParams}` 时，未连接 EmptyLatent 的 `width:undefined` 覆盖已有值；CheckpointLoader 又禁止写 width/height。

## 改动
| 文件 | 内容 |
|---|---|
| `src/utils/historyParameters.ts` | cfg 别名加 `cfg_scale` |
| `src/utils/inspectorParameters.ts` | CheckpointLoader 可读/写 width/height；无 EmptyLatent 时回落 |
| `src/App.tsx` | mergeDefined 不让 undefined 覆盖；Checkpoint 持久化 size/negative |
| `src/utils/graphEngine.ts` | 执行时 EmptyLatent 优先，否则 Checkpoint width/height/negative_prompt |
| `src/components/SchemaChoiceControls.tsx` | 通用 integer/number Schema 字段；`lora_strength` 可见；空值→「未填写，不发送」（2026-10-16 撤回「待确认」） |
| `src/components/ApiParameterEditor.tsx` | 传入 `schemaUnprobed`；Venice 文案说明 lora_strength≠LoRA 节点 |
| `docs/provider-schema-drafts/venice.json` | `image.parameters.lora_strength` |
| `src/server/veniceP0Fix.test.ts` | 合同/单测 |

**未改**：自定义 LoRA 本地 400 拒绝；不把 LoRA 节点 0.85 换成 lora_strength 85。

## 测试
- `npx vitest run src/server/veniceP0Fix.test.ts` + history/inspector/aimlapiKreaReverify2：**通过**
- `npx tsc --noEmit`：见本轮报告

## 恢复包
- `/workspace/canvas/canvas-restore/pre-venice-p0-fix-20261015-044724.tar.gz`

## 画布 FE 验收清单（不宣称 PASS）
1. Venice `venice-sd35` 填 1024×1024 + 负向 + CFG → 历史 actualRequest 含 `width`/`height`/`negative_prompt`/`cfg_scale`
2. CFG 行显示「实际发送」而非「未发送」
3. 参数面板关开后宽高仍在
4. Schema 区可见 `lora_strength`：空着写「未填写，不发送」；填了值就照实发，发没发出去以历史 actualRequest 为准（2026-10-16 画布拍板：不加回「待确认」徽章）。挂自定义 LoRA 仍本地拒绝、不发 `loras[]`
