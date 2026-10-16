# Novita HTML parameter declaration · 2026-10-15 03:25 (Asia/Shanghai) · CODE_ONLY
Backup: /workspace/canvas-restore/pre-novita-decl-0325.tgz. No live curl / 本机直调 smoke was run.

Source (Researchy / tinkabot docs/provider-schema-drafts/novita.json#runtimeSchema):
- https://docs.novita.ai/guides/model-apis-v2-to-v3-migration — POST /v3/async/txt2img, `request{model_name,prompt,negative_prompt,width,height,image_num,steps,seed,clip_skip,sampler_name,guidance_scale,loras[{model_name,strength∈[0,1]}]}`; result GET /v3/async/task-result?task_id=
- https://github.com/novitalabs/python-sdk/blob/main/examples/txt2img-with-lora.py

Changes:
1. Data file src/config/providerDeclarations/novita.txt2img.json. Each field carries x-source, x-fetchedAt=2026-10-15, and a description with source/date/待确认. The descriptions show as field tooltips, and the whole schema shows in ApiParameterEditor's schema JSON. Top-level liveConfirmed:false.
2. schemaProviders.ts: generic loadProviderDeclaration(provider, endpointPath) reads that directory at runtime. When a Novita catalog row has no parameters and a declaration exists, it returns schemaStatus 'official-html-declaration' with schemaUnprobed = !liveConfirmed. The existing generic schemaUnprobed→「待确认」 badge mechanism applies, and the request IS sent. With no declaration (e.g. txt2video) the local block stays, and its message names the missing declaration.
3. LoRA strength outside [0,1] → local block (novitaLoras, existing, no clamping). model_name = catalog id = sd_name_in_api (novitaLoraCatalogRows id; selectionFromMetadata uses id for non-Civitai).
4. Removed the local "max 5 LoRA" block: the limit is unverified (search snapshot, original page 404). It is noted on loras as 「搜索快照，原页 404」. Upstream errors pass through verbatim via the existing path.
5. Flipping to 「会发送」: set liveConfirmed:true (+ liveConfirmedBy/At) in the data file after 画布's live check. No code change is needed.

Tests: novitaDeclaration.test.ts (new). schemaContract and schemaNoFallback Novita cases were rewritten from "blocked, no POST" to "POST /v3/async/txt2img with request wrapper". The novitaProvider max-5 test now expects no throw. vitest src: 1010 passed, 2 failed (pre-existing mediaHostedReview). tsc: no new errors.
