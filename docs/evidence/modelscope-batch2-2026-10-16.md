# ModelScope batch 2 — 2026-10-16 (Asia/Shanghai) — Status: CODE_ONLY

Restore tar: /workspace/canvas-restore/pre-modelscope-batch2-20261016-111707.tgz (node_modules excluded). No commit/push. No paid generation calls.

## 1. Key rotation visibility (generic)
- New src/server/keyUsage.ts: describeKeySelection / formatKeyUsage / keyUsagesFromTrace. Records {provider,index,count,source:pool|header} only — never key text.
- server.ts KeyPoolManager.describeKey(prov,key): position in the header rotation list (if canvas sent comma-separated keys) else in the server pool.
- upstreamFetch: every trace entry + logs/upstream.log line carries keyUsage (all providers going through upstreamFetch with meta.key).
- recordHistoryItem + buildFailedAttemptHistoryItem: requestMetadata.keyUsages.
- UI: history card (failed status row + success model row) and execution log row show 「Key #0（共 2 个）」; ExecutionLog redactSecrets no longer hides keyUsage(s).
- Limitation: calls not passing meta.key to upstreamFetch (SDK calls, some routes) show no chip (never guessed).

## 2. Sampler/scheduler label
- Root cause: modelscope route's failure JSON had no schemaFields → card fell to 「未发送（Schema 未记录）」.
- Generic fix: declareSchemaFields() stores the route's Schema in the request context; failed + success history use it when the body lacks it. New cards → 「该端点不支持 · 未发送」; legacy records without Schema keep 「未发送（Schema 未记录）」.
- Currently only the modelscope routes call declareSchemaFields; other routes already return schemaFields in body or will still show Schema 未记录 until they call it.

## 3. Model center LoRA list (modelscope.ai)
- Finding: old intl branch only queried https://www.modelscope.ai/openapi/v1/models (no .cn mixing). Free GET search for "Z-Image-Turbo-Realism" on intl returned 0 rows → the .cn-only suayptalha LoRA did not come from the intl model center (node had source_provider "novita", set earlier).
- Change: region config src/server/modelScopeLoraList.ts; when category=lora on modelscope_ai, list via PUT https://www.modelscope.ai/api/v1/dolphin/models (shape verified live 11:18:32, Code 200, TotalCount 203 for Name=Z-Image-Turbo + tags contains lora). Errors returned verbatim, no fallback to openapi or .cn.

## 4. LoRA pick (decided: LcarsPicturesDatabase/ST-TNG-Rooms-Z-Image-Turbo-v1, strength 1, repo ID only)
Raw responses: /workspace/canvas-e2e-modelscope-ai-lora-pick-1118/
- info-www.modelscope.ai.txt (11:18:30): Code 200, AigcType LoRA, BaseModel ["Tongyi-MAI/Z-Image-Turbo"], SubVisionFoundation Z_IMAGE_TURBO.
- info-www.modelscope.cn.txt (11:18:31): HTTP 404, 10010205001 record not found (intl-only).
- dolphin.txt (11:18:32): list incl. this LoRA. old-openapi-search.txt (11:18:51).

## 5. PID 2651251 start-time discrepancy
- ps lstart = btime(/proc/stat) + starttime ticks/CLK_TCK. Now: btime 1792000967 (Thu Oct 15 02:02:47), starttime 11906743 ticks/100 → Fri Oct 16 11:07:14; etimes 708 at 11:19:03 consistent.
- pid-before.txt (written 11:06:50) already showed this PID with 11:05:22 — a process cannot start at 11:07:14 and be seen at 11:06:50, so the process did not change; btime moved by +112 s.
- dmesg: "[119471.64] random: crng reseeded due to virtual machine fork" — the box VM was snapshotted/forked; on restore the wall clock jumps while boot-time clock does not, so btime (= realtime − boottime) shifts and every ps lstart shifts with it. ps lstart in this box is not a stable identity across VM pause/fork; PID + /proc/<pid>/stat starttime ticks is.

## Server
Restarted once: PID 2673365, ps lstart Fri Oct 16 11:19:38 2026 (Asia/Shanghai), /proc starttime ticks 11981104. Log /tmp/canvas-dev-modelscope-batch2.log.
Tests: new src/server/modelscopeBatch2.test.ts 5/5; full vitest 1327/1329 (2 pre-existing mediaHostedReview failures).
