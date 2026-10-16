# Replicate flux-schnell / ModelScope 声明字段门控 — 2026-10-15

状态：**CODE_ONLY**（未跑浏览器、未真实出图；前端 E2E 归画布）。备份：`/workspace/canvas-restore/pre-replicate-modelscope-0540.tgz`。

## 官方 live 核对（改代码前）
1. Replicate `black-forest-labs/flux-schnell` — `GET https://replicate.com/api/models/black-forest-labs/flux-schnell/versions`（最新版本 `c846a699…`，created 2025-06-25T20:02Z）Input properties：
   `seed, prompt, go_fast, megapixels(1|0.25), num_outputs(1–4), aspect_ratio(enum 11), output_format(webp|jpg|png), output_quality(0–100), num_inference_steps(1–4, 默认4), disable_safety_checker`。
   **无 negative_prompt，无 guidance / guidance_scale，无 width/height。** 与 Researchy 结论一致。API 页 https://replicate.com/black-forest-labs/flux-schnell/api （WebFetch 只返回目录，原文以 versions API 为准）。
2. ModelScope API-Inference — https://www.modelscope.cn/docs/model-service/API-Inference/intro （SPA，渲染后读取）参数表：
   `model, prompt, negative_prompt, size(如 1024x1024), seed[0,2^31-1], steps[1,100], guidance[1.5,20], image_url`；示例另有 `loras`（repo-id 或 {id:权重}，≤6，和为 1.0）。
   **无 sampler / scheduler / denoise。**

## 根因
- Replicate：`replicateImageContract` 只对 width/height 做了声明门控；negative_prompt 与 cfg 在未传 `schemaProps`（路由从不传）时直接写入 `negative_prompt` / `guidance_scale`；传了 schemaProps 时又是 throw 而不是 omit+标注。
- ModelScope：`server.ts` 路由把 `cfg, denoise, sampler_name, scheduler` 原样透传进上游 payload（官方表无这些字段），且 cfg 只靠前端 driver 改名为 guidance。

## 修复（通用，无按模型名分支）
- `src/server/replicateImageContract.ts`：统一 `declaredWire()`——live schemaProps 优先，否则用 PROVIDER_SCHEMA 行；未声明的已填字段不发送，进 `omitted`，reason 以「该端点不支持」开头；对 negative_prompt / width / height / aspect_ratio / seed / steps / cfg 生效。cfg 映射到 schema 声明的 `guidance` 或 `guidance_scale`。返回 `schemaFields`。
  - 局限：模型既无 schemaProps 又不在 PROVIDER_SCHEMA 时，沿用旧 wire（无法判定声明），`schemaFields` 为 undefined。
- `src/server/routes/replicateRoutes.ts`：`schemaFields` 写入 requestMetadata / 响应 / 错误体，历史可区分「该端点不支持」与「未发送」。
- 新增 `src/server/modelScopeImageContract.ts`：按官方参数表构建 payload；cfg→guidance（显式 guidance 优先，记录 parameterMappings）；sampler_name/sampler/scheduler/denoise 不发送，记入 omissions「该端点不支持」。
- `server.ts` ModelScope 路由改用该 builder，requestMetadata 增加 `parameterOmissions`、`schemaFields`。
- ModelScope drivers 仅加注释（字段仍传给本地路由以便记录，不出站）。

## 测试
- 新增 `src/server/replicateModelScopeGating.test.ts`（9 例）；更新 `replicateImageContract.test.ts`（旧断言把 bug 固化：schnell 期望发 negative_prompt/guidance_scale）、`schemaContract.test.ts`。
- 全量：126 文件 / 1076 例，1074 通过；2 失败均为既有 `mediaHostedReview.test.ts`（缺生成文件 `hosting/server.generated.ts`，与本改动无关）。
- 单测通过 ≠ 验收；需画布前端 E2E：Replicate schnell 填负向+CFG → 实发 JSON 无二者、历史卡标「该端点不支持」；ModelScope 填 sampler/scheduler → 同上，CFG 显示为 guidance 实发。
