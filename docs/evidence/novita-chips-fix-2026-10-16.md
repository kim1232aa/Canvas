# Novita 历史芯片「未发送」+ LoRA「不匹配」· 2026-10-16 · CODE_ONLY

## 结论
- **根因（严重）**：`unwrapGenerationParameters` 对 Schema-provider 信封只拆到 `actualRequest.parameters`，Novita 真体是 `{ extra, request:{ steps, seed, guidance_scale, … } }`，芯片只扫顶层 keys → 已发字段标成「未发送」。
- **根因（细节）**：`ParameterInspector` 把 `verification !== 'verified'` 一律渲染「不匹配」；未核实（`unverified`）也被标红，与「会发送 / 已进 actualRequest.loras」矛盾。对齐 `NodeItem`：`unverified` 不挂标签。
- **修法**：通用嵌套解析（`request` / `input` / `arguments`），用共享 wire 别名检测，**不为 Novita 硬编码字段表**；`sentHistoryLoras` 同样走 unwrap。
- **未 commit / 未 push**；未开浏览器；不喊画布重拍。

## 证据来源
- 挑刺退回：`/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-novita-0958/` 01–04
- 真体形状：`docs/evidence/novita-polish-batch-2026-10-16/submit-redacted.json` → `parameters.request.*`

## 改动文件
| 文件 | 改动 |
|---|---|
| `src/utils/historyParameters.ts` | `GENERATION_WIRE_ALIASES`；unwrap 下钻 `request`/`input`/`arguments`；`sentHistoryLoras` 走 unwrap |
| `src/components/ParameterInspector.tsx` | LoRA chip：`verified`→兼容 / `incompatible`→不匹配 / `unverified`→无 |
| `src/utils/historyParameters.test.ts` | Novita 嵌套 request → 芯片实际发送；loras 从 request 读出；Replicate flat input |
| `src/components/nodeUI.test.tsx` | unverified 不得含「不匹配」 |

## Restore
`/workspace/canvas/temp/backups/canvas-restore/pre-novita-chips-20261016-101629.tgz`

## 单测
`vitest run`：historyParameters / veniceP0Fix / nodeUI / historyUiPolish / SpatialFrameItem.loraCopy / runDFollowups / clean0611 → **58 passed**。

## 后端重启（仅一次）
- 旧 PID：2429653
- 新 PID：**2462454**（node server.ts；npm wrapper 2462429）
- 启动（Asia/Tokyo）：**2026-10-16 10:19:54 JST**
- `cwd=/workspace/canvas/Canvas-main`；`npx tsx server.ts`；`curl 127.0.0.1:3000 → 200`

## 残留
- CODE_ONLY：前端干净会话重拍归画布（03 芯片 + 01 LoRA 旁）。
- Replicate 接线仍排队，本批只顺带覆盖 flat `input` 的 unwrap 单测。
- 真出图仍受上游余额限制（403 NOT_ENOUGH_BALANCE）。


## 收口
- 2026-10-16 挑刺过 → Novita **PASS_BILLING**。证据 `/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-novita-1019/`。下一步 Replicate FE E2E。
