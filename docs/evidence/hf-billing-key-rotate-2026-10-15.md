# Hugging Face 欠费自动换下一把 Key（2026-10-15）

## 结论
`POST /api/huggingface/generate` 与 `/api/engine/huggingface/generate`（`fal-ai` / `hf-inference` 分支）在 **额度/402/insufficient credits** 时，才按 KeyPool 顺序试下一把；鉴权/参数/5xx **不换**。每次尝试写入响应 `keyRotation` + 执行记录 `executionTrace`（`stage: key-attempt`），成功时保留前面失败记录。

## 产品约束对照

| # | 约束 | 落地 |
|---|------|------|
| 1 | 仅额度/402 类换下一把 | `isBillingCreditsError`：402 或正文匹配 credits/余额不足；401/403/5xx/429/普通 400 **不换** |
| 2 | 每次尝试可见 | `keyRotation.attempts[]`：`maskedKey`、人话 `result`、`status`、`responseBody`；exec log「Key 尝试」分条可展开 |
| 3 | 池耗尽原样失败 | `summarizeKeyRotation` →「几把都额度不够」；`details` 仍带最后一次原文 |
| 4 | 先落地 HF generate | `server.ts` HF 路由；可复用模块 `src/server/billingKeyRotate.ts` |
| 5 | 不抢浏览器；单测 | 见下方 vitest；无 computerUse |

## 行为矩阵

| 场景 | 行为 | 主视线人话 |
|------|------|------------|
| 单把 header `x-hf-token` | **pinned**，欠费也不换 | 「这把额度不够」 |
| 环境/设置多把（逗号分隔） | 欠费 → 下一把 | 「这把额度不够，已换下一把」/「前 N 把…」 |
| 多把全欠费 | 汇总失败，不装成功 | 「几把都额度不够」 |
| 401/403/参数/5xx | 立即停，不扫池 | 鉴权失败 / 参数… / 上游服务异常 |
| 欠费后下一把成功 | 返回图 + `keyRotation` | 「这把额度不够，已换下一把」 |

**不换的情况（钉死）：** 请求头只带 **一把** `x-hf-token` 时视为用户显式钉死；`.env` / 设置里的其它 Key 本请求不用。

## 执行记录呈现（挑刺）

- 首行：一句人话（`keyRotation.summary` / `error`），不堆 POST/路径/schema。
- 「Key 尝试」：每把一行 `掩码 · 人话结果`，展开见 HTTP status + 响应原文。
- 技术细节折叠仍保留完整 JSON；`maskedKey` 不被 redact 抹掉。

## 改动文件

- `src/server/billingKeyRotate.ts` — 判定 / 摘要 / `runWithBillingKeyRotate`
- `src/server/billingKeyRotate.test.ts`
- `server.ts` — `KeyPoolManager.getAttemptKeys`；HF fal-ai / hf-inference 接入
- `src/components/ExecutionLog.tsx` — 首行优先 summary；Key 尝试分条；masked* 可见
- `src/utils/apiFailure.ts` — 欠费换 Key 人话映射
- `src/utils/apiFailure.test.ts` / `ExecutionLog.summary.test.ts`
- `.env.example` — HF/Fal 多 Key 逗号分隔说明

## 测试

```bash
npx vitest run src/server/billingKeyRotate.test.ts src/utils/apiFailure.test.ts src/components/ExecutionLog.summary.test.ts
```

本轮结果：**25 passed**（2026-10-15）。

## 未做

- 其它供应商（Fal/魔搭等）尚未接同一钩子（模块已可复用）。
- Z-Image Space 分支仍用池中第一把，本轮未做欠费轮换。
- 未 commit / 未 push；未跑浏览器 E2E。
