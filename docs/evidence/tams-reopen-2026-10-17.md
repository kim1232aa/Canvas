# TAMS 重新打开（与 OpenWorks 并存）— 2026-10-17 Asia/Tokyo

## 产品改口（雁 → 画布）

- **保留** OpenWorks（`ak_tensor_` → Echo-Access-Key → `/openworks/v1/task`）
- **重新打开** TAMS（Bearer → `POST /v1/jobs`，含 `diffusion.lora.items`）
- 密钥**不混用**：`ak_` 不当 Bearer；Bearer 不当 Echo-Access-Key
- 当前 Bearer 有效、余额不足 → 上游原文「credits not enough」= **PASS_BILLING**
- `actualRequest` 必须带 `diffusion.lora.items`（真 LoRA ID + weight）

## 官方字段（当日再抓）

| 项 | URL / 值 |
|---|---|
| Create job | https://tams-docs.tensor.art/docs/api/apis/tams-api-v-1-service-create-job/ → `POST /v1/jobs` |
| LoRA | https://tams-docs.tensor.art/docs/use-cases/basic/component/lora/ → `diffusion.lora.items[{loraModel,weight}]` |
| 默认 Host | `https://ap-east-1.tensorart.cloud`（`TENSOR_MODEL_API`；可用 `tensorartBaseUrl` 覆盖） |
| Auth | `Authorization: Bearer <TAMS token>` |
| OpenWorks（并存） | https://github.com/Tensor-Art/tensorart-skills → Echo-Access-Key |

官方 LoRA 示例片段：

```json
"lora": { "items": [{ "loraModel": "661652545330040294", "weight": 1.1 }] }
```

## 密钥分流

| 路径 | env / 槽 | 头 |
|---|---|---|
| TAMS | **优先** `TENSORART_TAMS_TOKEN`；否则 `tensorartKey` / `TENSORART_API_KEY` 池中**非 `ak_`** 项 | `Authorization: Bearer …` |
| OpenWorks | 池中 `ak_tensor_…` / `ak_tusi…` | `Echo-Access-Key` |

`resolveTamsBearerKey` / `pickTamsBearerKey` / OpenWorks `resolveKey` 各自过滤，禁止交叉。

## 代码改动摘要

- 恢复 `/api/tensorart/generate` → TAMS `/v1/jobs`（去掉 410）
- `EngineRegistry` 再注册 `TensorArtDriver`
- 前端：参数面板 / 设置 / 能力矩阵 / LoRA Hub 恢复 TAMS 入口文案
- 失败与成功响应均带 `actualRequest`（含 `stages[].diffusion.lora.items`）

## 还原包

`/workspace/canvas/temp/backups/canvas-restore-tams-reopen-1159.tgz`

## 前端 E2E 清单（本代理无浏览器 → CODE_ONLY，交 computerUse）

1. 设置页 Tensor.Art 槽：可见双轨说明；池内可有 Bearer + ak_
2. 底模服务商选 **「Tensor.Art 模型 API」**（id=`tensorart`），**不要**选 OpenWorks
3. 底模：官方示例 Checkpoint `613045163490732233`（或 tensor.art 数字 ID）；LoRA：`661652545330040294`（须与底模 baseModel 一致，否则上游/本地架构错）
4. seed / steps / cfg / 宽高按 Schema；点运行
5. **期望**：节点/历史显示上游欠费原文（含 `credits not enough`）；历史 `actualRequest` / `actualParameters` 含 `diffusion.lora.items`
6. OpenWorks 旧路径仍可选、仍用 ak_ 出图（勿删）

## 标签

`CODE_ONLY` 接线就绪；服务端欠费探针见同目录后续记录。有额度后再拍 PASS_GENERATION 三图。

## 服务端探针（2026-10-17 ~12:05 Asia/Tokyo）

| 探针 | 结果 |
|---|---|
| `POST /api/tensorart/generate` 数字底模 + LoRA | **HTTP 400** 上游原文含 `credits not enough`（`field":"base"`）→ **PASS_BILLING** |
| `actualRequest.stages[1].diffusion.lora.items` | `[{loraModel:"661652545330040294", weight:1.1}]` |
| Host | `https://ap-east-1.tensorart.cloud/v1/jobs` |
| 请求头 `x-tensorart-key: ak_…` | **本地 400**，不静默改用 env Bearer |
| 修丁 | `buildTensorModelJob` 去掉重复 `request_id`（上游 proto: duplicate field）；只保留官方 `requestId` |

服务 PID：**106904**（`npx tsx server.ts`，lstart 约 12:04–12:07 Asia/Tokyo）

标签：**CODE_ONLY 就绪**（欠费已服务端证实；前端三图交 computerUse）

