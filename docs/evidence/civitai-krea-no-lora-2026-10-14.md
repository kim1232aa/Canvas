# Civitai Krea v2：禁止 LoRA / 负面 / 宽高（2026-10-14）

## 官方依据（本轮 WebFetch）
- URL：https://developer.civitai.com/orchestration/recipes/krea
- 官方形状：`engine: "fal"`, `model: "krea2"`, `size: medium|large`；无 `loras`
- 原文：*Krea v2 does not accept LoRAs, negative prompts, or explicit width/height — use the Flux 2 or Qwen recipes if you need any of those.*
- 对照：`docs/evidence/api-official-reverify-2026-10-14.md`（本轮官方页为准）

## 原缺口
`src/server/civitaiImageContract.ts` 对**任意**生态（含 `krea2`）把 `body.loras` 编成 `input.loras` 的 AIR→strength 映射，静默假装支持 LoRA。  
本地路径常用 `engine=comfy` + `ecosystem=krea2` + `model=turbo`，与官方 fal+krea2 配方能力不一致。  
`providerSchema` 的 `comfy:krea2` 曾把 `loras` / `negative_prompt` / 宽高标成 supported。

## 修复（拒绝，不静默剥离）
1. **`civitaiImageContract.ts`**
   - `ecosystem === 'krea2'` 且带 LoRA 意图（非空 `loras` 数组）→ `fail()`，中文错误引用官方限制与 URL；**绝不**写 `input.loras`
   - `krea2` + `negative_prompt` / `width` / `height` → 同样 `fail()`（不剥掉后假装成功）
   - 无 LoRA 的 krea2 请求：载荷无 `loras` 键
   - `custom_parameters` 不再为 krea2 强行塞空 `loras: {}`
2. **`providerSchema.ts` `comfy:krea2`**
   - `loras` / `negative_prompt` / `width` / `height` → `unsupported`（source = 官方 krea recipe）
   - `resolveSchemaModelId`：含 `:krea2:` 的 AIR → `comfy:krea2`（供前端灰显）
3. **前端（最小）**
   - `ParameterInspector` / `SpatialFrameItem` / `App` 挂 LoRA：Civitai 有 `engine:ecosystem` 时用其做 schema 查询，使 `comfy:krea2` 的 LoRA 不可用横幅 / 挂载拦截生效

## 测试
```
npx vitest run src/server/civitaiImageContract.test.ts src/schemas/providerSchema.test.ts
→ Test Files 2 passed | Tests 39 passed
npx tsc --noEmit → exit 0
```
覆盖：
- krea2 + loras → reject（不再期望成功）
- krea2 无 loras → 无 `loras` 键
- krea2 + negative / width/height → reject
- Flux1 + loras → 仍构建 AIR→strength map

## 未做
- 未 commit/push
- 未静默剥离 LoRA 后出图
- NanoGPT 营销标签 → 本轮跳过（另开）
- 历史 Krea+LoRA 预设仍可能挂在画布上；运行时会被合同拒绝并展示原因（不假成功）

## 备份
`/workspace/canvas/temp/backups/canvas-restore/Canvas-main-post-krea-nolora-20261015-010959.tar.gz`（排除 node_modules、data/media、.env）
