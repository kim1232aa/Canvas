# Failed history vs assets/counts · 2026-10-15 03:28 (Asia/Shanghai) · CODE_ONLY
Backup: /workspace/canvas-restore/pre-failedassets-0328.tgz

Stored data check (data/history.json and live GET http://localhost:3000/api/history, read only, nothing deleted): 24 records = 5 with media, 12 failed (url ''), 7 local_blocked (url ''). The AIMLAPI alibaba/z-image-turbo-lora 403 records are status failed with url '', and their upstream body is kept verbatim (HTTP 403 {"title":"Forbidden",...}). There is no stored pollution: no failed record carries a url or imageUrl.
Root cause: the header count already uses hasOutputMedia (status-aware), so current data gives 「5 张图片」. The asset library filtered by truthy url/imageUrl only, with no status check, so any failed record carrying a url or placeholder became an asset and counted in asset stats. The download icon was never gated. The 「6 张图片」 screenshot most likely predates the count fix that was already in place, or came from a different data state; I could not reproduce it on current data.
Fix: AssetManagerModal uses hasOutputMedia (failed/local_blocked never become assets). The history card download is disabled with a visible tooltip reason. 应用到画布 was already disabled with a visible reason. The failed card keeps showing upstreamResponseBody verbatim.
Tests: src/utils/historyFailedAssets.test.ts. vitest src 1011 passed, 2 failed (pre-existing mediaHostedReview).
Browser check: dev server http://localhost:3000 → 历史 → any AIMLAPI z-image-turbo-lora card with HTTP 403 (e.g. hist_1792004348088_4fnfl).
