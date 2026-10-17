# Fal 目录：带「lora」的生图端点误标成 LoRA 权重（2026-10-15）

## 结论
`fal-ai/krea-2/turbo/lora`、`fal-ai/flux-lora` 等 **生图端点**（支持挂 LoRA）不再被当成 LoRA **权重资源**从 Checkpoint 目录丢掉；它们留在 Checkpoint，`resourceKind: model-endpoint`。

## 原缺口（画布反馈）
Fal 目录把 `endpoint_id` 含「lora」的一律标成 LoRA 资源，并从 Checkpoint 过滤掉。  
结果：模型中心搜不到 `fal-ai/krea-2/turbo/lora`，只能手填自定义 ID。  
Fal+LoRA 前端验收已用手工 ID 跑通（`PASS_BILLING`，证据 `/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-fal-lora/outcome.json`）。

## 官方区分
- Fal `https://api.fal.ai/v1/models` 列出的是 **推理/生图端点**，不是 LoRA 权重仓库。
- 名字里带 `lora`（如 `fal-ai/krea-2/turbo/lora`、`fal-ai/flux-lora`）= 可挂 LoRA 的 **模型端点** → Checkpoint。
- 真正的 LoRA 权重：type/category 为 LoRA/locon/lycoris/dora，或 `resourceKind: adapter`（如 Sogni LoRA 目录）。
- 本仓既有说明（`server.ts` Fal `cat==='lora'` 分支）：Fal 无公开 LoRA 权重目录；以 lora 搜到的是「可加载 LoRA 的生成端点」。

## 根因
1. `server.ts` `extractModelMetadata`：`idLower.includes('lora')` → 强制 `category=LoRA` / `type=LORA`。
2. `server.ts` `matchCategory`：Checkpoint 条件含 `!itemId.includes("lora")` → 直接丢掉上述端点。
3. `ModelHubModal.tsx` 卡片：`modelId.includes('lora')` → UI 当 LoRA 微调挂载。
4. `CivitaiModal.tsx`：同样用 id/name 含 lora 灌进 LoRA 列表。

`modelCatalog.ts` 只按 type/category 过滤（本就正确）；`normalizeSchemaProviderItems` 在 `wantsLora=false` 时本就把端点标成 Checkpoint + `model-endpoint`。

## 修复
1. **新纯函数** `src/utils/isLoraWeightResource.ts`
   - 优先 `resourceKind` / type / category；
   - Fal 等「端点目录」供应商：仅 id/name 含 lora **不算**权重；
   - 真实 LoRA type/category 或 `resourceKind: adapter` 才算权重。
2. **`server.ts`**：`extractModelMetadata` 与 `matchCategory` 改用该函数；Fal 行写入 `resourceKind: 'model-endpoint'`。
3. **`ModelHubModal.tsx` / `CivitaiModal.tsx`**：分类与卡片按钮改用该函数（不再用 id 子串）。
4. **未改** Civitai Krea 禁 LoRA 拒发逻辑。

## 测试
```
npx vitest run \
  src/utils/isLoraWeightResource.test.ts \
  src/utils/modelCatalog.test.ts \
  src/server/modelHubCatalog.test.ts \
  src/server/schemaProviders.test.ts
→ Test Files 4 passed | Tests 44 passed
```
覆盖：
- `fal-ai/krea-2/turbo/lora` / `fal-ai/flux-lora` → 非 LoRA 权重
- 真实 type LORA / HF·TensorArt LoRA → 是权重
- `readCheckpointCatalog` 保留 id 含 lora 的 Checkpoint 行
- `normalizeSchemaProviderItems(wantsLora=false)` 端点 id 含 lora 仍为 Checkpoint
- server/前端源码不再用 `itemId.includes("lora")` 踢 Checkpoint

## 未做
- 未 commit / push
- 未占用本机浏览器（画布占用）
- 未改 Civitai Krea 拒发

## 备份
`/workspace/canvas/temp/backups/canvas-restore/Canvas-main-fal-lora-endpoint-catalog-20261015.tar.gz`（排除 node_modules、data/media、.env）
