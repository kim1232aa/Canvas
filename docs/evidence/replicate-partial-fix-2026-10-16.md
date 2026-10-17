# Replicate PARTIAL 修复 · 2026-10-16（CODE_ONLY，待画布前端 E2E）

- 官方依据：live `GET https://api.replicate.com/v1/models/black-forest-labs/flux-dev-lora` → `latest_version.openapi_schema.components.schemas.Input`，快照 `docs/evidence/replicate-flux-dev-lora-openapi-2026-10-16.json`（HTTP 200，10:17 Asia/Shanghai）。lora_weights=`type:string`；aspect_ratio=`allOf:[{$ref:'#/components/schemas/aspect_ratio'}]` 默认 1:1；hf_api_token/civitai_api_token=`writeOnly + x-cog-secret`。
- Restore：`/workspace/canvas/temp/backups/canvas-restore/pre-replicate-fix-20261016-101643.tgz`
- Server：旧 2491484 @ 09:38:15 → 新 **2563005 @ 2026-10-16 10:22:43 Asia/Shanghai**，日志 `/tmp/canvas-server-replicate-fix-1023.log`；`GET /` 200；`/api/model-schema?provider=replicate&model=black-forest-labs/flux-dev-lora` 200，aspect_ratio 已内联 enum。
- 测试：`src/utils/replicatePartialFix.test.tsx` 10/10；`vitest run src/utils src/components src/server src/services src/integration` 1109 passed / 2 failed（`mediaHostedReview` 2 条，改前基线同样失败，缺 `hosting/server.generated`）。

## 1) Schema 面板缺 lora_weights 行 / 会发送芯片；种子/步数/CFG 无徽章 — FIXED（CODE_ONLY）
- 根因 a：`schemaChoiceFields` 只收 enum / {width,height} / number 字段，纯 `type:string` 的 lora_weights 被跳过。
- 根因 b：lora_weights 的值来自画布 LoRA 节点（replicateImageContract 映射），面板不知道 LoRA 节点。
- 根因 c：`replicate` 不在 Schema 徽章 provider 集合 → `schemaSendStatus` 直接 null，KSampler 无徽章。
- 改动：
  - `src/components/SchemaChoiceControls.tsx`：通用 string 字段文本输入（跳过 writeOnly/x-cog-secret/format password；跳过画布控件已占有的别名键）；LoRA 槽位（Schema 声明的 lora_weights|hf_lora|lora_url 主槽、extra_lora 次槽）显示「会发送 <名>（来自 LoRA 节点）」只读；无 LoRA 节点则「未填写，不发送」。
  - `src/utils/canvasLoras.ts`（新）：按运行抽取同序（离采样器最近者为 loras[0]）列出 Checkpoint MODEL 链上的 LoRA。
  - `src/components/Canvas.tsx` / `NodeItem.tsx` / `ApiParameterEditor.tsx` / `ParameterInspector.tsx`：透传 canvasLoras、openapi。
  - `src/utils/schemaSendHint.ts`：新增 `hasSchemaSendBadges`（SCHEMA_DRIVEN + replicate），用于徽章/omit/Schema 缓存；`isSchemaDrivenProvider` 不变（replicate 仍保留前端 LoRA 架构门）。`CANVAS_TO_SCHEMA_ALIASES.loras` 增 lora_weights/hf_lora（仅徽章/openWorks 未用 loras 键）。
  - `src/utils/schemaSendStatus.ts`、`src/services/modelSchemaCache.ts`、`src/services/userModelSelection.ts`：改用 `hasSchemaSendBadges`。
- 结果（纯函数实测）：seed/steps/cfg/loras → will_send；sampler/negative/width → not_sent（Schema 不支持）。
- 测试：`replicatePartialFix.test.tsx` #1 五条。

## 2) 历史本地拦截卡把 sampler/512×512/负向标「拟发送」 — FIXED
- 根因：`resolveHistoryParameters` 的 intended 分支只看值是否存在，不看 Schema；该卡 metadata 无 schemaFields，但 intendedRequest.custom_parameters._canvas.schemaProperties 有声明列表。
- 改动：`src/utils/historyParameters.ts` 读 intended body 的 `_canvas.schemaProperties`，字段（含别名）未声明 → `unsupported`（「该端点不支持 · 未发送」）；seed/steps/cfg 仍「拟发送」。
- 测试：#2。

## 3) 第 1 卡第 3 行截断 — FIXED（部分推断）
- 根因：负向行 `line-clamp-1`；03 截图本身高 520px，第 3 行也可能是视口裁切，请重拍时滚动确认。
- 改动：`src/components/HistoryModal.tsx` 负向行改为换行（`data-testid="history-negative"`）。测试：#3。

## 4) 种子行「实际发送」重复 — FIXED
- 改动：`historyParameters.ts` 新 `historySeedRowText`（行内带芯片时括号只写「上游未返回种子」）；`HistoryModal.tsx` 行内使用；toast/图片角标的 `seedStatement` 不变。
- 测试：#4；`aimlapiKreaReverify2.test.tsx` 期望同步更新。

## 5) aspect_ratio allOf/$ref 无控件 — FIXED
- 根因：服务端返回未解引用的 Input；前端 variants 不含 allOf。
- 改动：`server.ts` replicate model-schema 用通用 `resolveSchemaRefs(Input, openapi)`；`SchemaChoiceControls` 通用 `resolveRef` + allOf 展开，default 从 allOf 外层取。
- 测试：#5 两条；`serverCloseoutRoute.test.ts` 源码断言更新。

## 6) 导入工作流把 LoRA base_model 清成 SD 1.5 — NOT FIXED（未复现）
- 已查：`/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-replicate-0951/workflow-import.json` 中 LoRALoader `base_model:""`、`lora_name:fofr/flux-pixar-cars`；`checkLoraArchitectureCompatibility` 按名推断两者都为 flux → 兼容；history.json 无含「SD 1.5 / 架构」的条目；代码中写入 'SD 1.5' 的只有展示默认值。
- 需画布提供：被拦截时的原文报错 + 导入前后节点 JSON（或截图）。未加任何兜底。
