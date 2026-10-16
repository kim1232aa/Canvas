# Researchy 自领核对 · Together image_loras 官方未变 + UI/接线分裂 · 2026-10-15 07:01 (Asia/Tokyo) / 北京 06:01

来源：群本地 transcript 空；扫 docs 自 06:30 后草案/证据改动（together.json 06:38、postfix-0615、venice live probe）。发现 v2 together.md 06:02「应本地拒」与现行草案/接线「待确认透传」及两处 UI 旧文案冲突。

## 方法
1. agy-search `search_web`（Together image_loras / serverless LoRA，domain docs.together.ai）
2. curl 官方页 200：parameters.md、openapi.yaml、dedicated-endpoints/overview.md
3. 原文落盘：`/workspace/audit-v2-raw/researchy-30m-0701/`
4. 对照代码：`schemaProviders.together` 无 loraLocalBlock；仅 venice 有；CivitaiModal/BackendSettingsModal 文案

## 结论
1. **官方未变**：参数页仍写 image_loras No longer available / FLUX.2 reject → dedicated；OpenAPI 仍列且未 deprecated。
2. **无新 HTTP 证据**：不得 invent 400；live 仅有 invalid_api_key 401。
3. **审计更正**：撤回「现行接线必须本地拒」表述；与草案房间规则对齐为待确认。
4. **@canvas-dev**：对齐 `BackendSettingsModal`（删「会 400 拒绝」或改为待确认）与 `CivitaiModal` together 粘贴硬拦（与 submit 透传冲突；属单家特化）。`ApiParameterEditor` 已正确。

已改：`docs/provider-api-audit-v2/together.md`（07:01 补段）、`DIFF.md`。钥匙未写入。草案 together.json 已是待确认，本轮未改。
