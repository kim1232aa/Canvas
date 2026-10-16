# 魔搭国际站 LoRA 历史卡修复 — 2026-10-16 — CODE_ONLY

Source E2E: /workspace/canvas-e2e-modelscope-ai-lora-1056/ (POST api-inference.modelscope.ai/v1/images/generations, upstream 401 BLOCKED_AUTH).
Restore tar: /workspace/canvas-restore/pre-modelscope-lora-20261016-110407.tgz

## Root cause
1. sentHistoryLoras() / countActualRequestLoras() only accepted LoRA fields that were arrays. ModelScope's Schema sends
   `loras` as an object map `{"suayptalha/Z-Image-Turbo-Realism-LoRA": 1}`, so it was read as "no LoRA" → no LoRA row on the card,
   and `实际发送 · LoRA×N` was missing too. The model line never had a source chip on any card.
2. The failed card's first line only rendered status code + status text; the upstream body was only inside the collapsed details.

## Fix (generic, no provider branch)
- historyParameters.ts: new lorasFromSentParameters(): first key matching /lora/ (or styles) holding an array OR a {name: strength} map.
  New historyModelSent(): 实际发送 chip when the sent body's `model` equals the shown model.
  New upstreamErrorMessage(): parses the JSON body and returns the first string under message/error/detail/msg/errors/… verbatim; non-JSON body returned as-is.
- actualRequestLoras.ts: counts object-map LoRA fields.
- HistoryModal.tsx: 「上游原文：<message>」 line right after the status row; full body still in 「上游原文（原样，点开查看）」. LoRA chips and the model now carry the 实际发送 badge.

## Tests
- New src/utils/modelscopeLoraHistoryFix.test.ts: 4/4 pass.
- Full vitest: 151/152 files, 1322/1324 tests pass; 2 failures are the pre-existing mediaHostedReview.test.ts (missing hosting/server.generated).

## Server
Restarted once: PID 2651251, started Fri Oct 16 11:05:22 2026 (Asia/Shanghai). Log /tmp/canvas-dev-modelscope-lora.log.
Status: CODE_ONLY — needs 画布 FE re-shoot of the history card.
