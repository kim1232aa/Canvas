# Novita / Replicate 验收清单 · 2026-10-16（画布整理）

排在 **Krea 四个字段** 之后。改代码前必须再网络检索官网；下列出处来自 2026-10-15 审计，开改前 Researchy/画布需复核是否仍有效。

## Novita

### 官网出处（审计）
- 鉴权：https://docs.novita.ai/api-reference/basic-authentication
- 目录：GET `https://api.novita.ai/v3/model` — https://docs.novita.ai/api-reference/model-apis-get-model
- 生图：POST `https://api.novita.ai/v3/async/txt2img`（body 含 `request`：model_name / prompt / loras / seed 等）— 迁移指南 https://docs.novita.ai/guides/model-apis-v2-to-v3-migration
- 轮询：GET `https://api.novita.ai/v3/async/task-result?task_id=` — https://docs.novita.ai/api-reference/model-apis-task-result
- 自定义 LoRA：https://docs.novita.ai/guides/model-apis-custom-model
- 审计全文：`docs/provider-api-audit/novita.md`

### 当前前端缺口（证据）
- `/workspace/canvas-e2e-novita-fe/outcome.json` → **BLOCKED_SCHEMA_LOOKUP**
- 本地拦截原文大意：目录项没有 parameters → 未出站、不用内置 Schema 兜底
- 后续重跑被改代码打断：`canvas-e2e-novita-fe-r3` → BLOCKED_TAB_INTERFERENCE

### 改完必须过的前端验收
1. 选公开 checkpoint（目录真实 `sd_name_in_api`）+ 真 LoRA（目录或官方名）+ 强度，点生成。
2. 必须**真发出** POST `/v3/async/txt2img`（或官网当前等价端点）；禁止再因「目录无 parameters」整单死拦且不给可配置路径。
3. `actualRequest` 含官网字段：`model_name`、`prompt`、`loras`（真 ID + 强度）、`seed` 等用户已填且官网支持的项。
4. 欠费/上游错误原样展示 → 可 PASS_BILLING；有额度必须出图 → PASS_GENERATION。
5. 历史「实际发送」与请求一致；该发却灰字「未发送」= 失败。

## Replicate

### 官网出处（审计）
- HTTP：https://replicate.com/docs/reference/http
- 创建预测：https://replicate.com/docs/topics/predictions/create-a-prediction
- 例：`black-forest-labs/flux-dev-lora` API 页 https://replicate.com/black-forest-labs/flux-dev-lora/api
- 审计全文：`docs/provider-api-audit/replicate.md`
- 无 Schema 本地拦截（CODE_ONLY）：`docs/evidence/replicate-noschema-block-2026-10-15.md`

### 当前缺口
- 无 Schema 拦截已写代码，**尚未前端 E2E**
- 有 Schema 的真实模型（如 flux-schnell / flux-dev-lora）前端付费/欠费路径未在本轮验收表闭环

### 改完必须过的前端验收
1. 假模型 / 拉不到 Schema：只见本地拦截原文 + 执行记录里有 Schema GET、**无** POST `/predictions`。
2. 真实模型：按 live OpenAPI Input 只发声明字段；其余显示「该端点不支持」，禁止盲发旧字段名。
3. flux-dev-lora：LoRA 按该模型官方 Input 字段真发；欠费 PASS_BILLING / 有额度 PASS_GENERATION。
4. 历史与 `actualRequest` 一致。

## 铁律提醒
每次改 API：**先网络检索再改**；禁止训练记忆、禁止 mock/fallback 假成功。
