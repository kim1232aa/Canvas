# Krea runD follow-ups · 2026-10-15 03:30 (Asia/Shanghai) · all CODE_ONLY
Backup: /workspace/canvas/temp/backups/canvas-restore/pre-runD-*.tgz. Evidence: /workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-krea-lora-runD/. Live Krea OpenAPI saved: docs/evidence/krea-openapi-live-0330.json (GET https://api.krea.ai/openapi.json, HTTP 200, no key).

A. Novita declaration: the file-level liveConfirmed is removed. Every field has x-liveConfirmed:false (+By/At). The server returns schemaConfirmedFields (fields with x-liveConfirmed true). schemaSendStatus is generic: when unprobed, only fields in schemaConfirmedFields → 会发送.
B. Hub card ID shows selection.name/resourceId (the sent raw /styles id, e.g. 79tzf61yz), not the internal `krea-<id>` key.
C. executionTrace.beginRun(): each run drops previous error entries and labels new entries 「第 N 次运行 · YYYY-MM-DD HH:mm:ss（北京时间）」 (runSeq/runLabel). The toast and log rows show the label. Node red frames were already cleared at run start (clearNodeExecutionErrors).
D. Live schema: POST /generate/image/bfl/flux-1-dev declares `strength` ("Denoising strength when an input image is provided", default 1, number). It is kept. actualRequest.mapping denoise→strength is shown in history (card 实际发送 + detail panel) as 「strength · 来源：KSampler 去噪强度」 via historyFieldOrigins.
E. The history title count already uses hasOutputMedia (failed/local_blocked/no-url excluded); merged with the failed-assets fix.
F. ExecutionLog: break-all → break-words + overflow-wrap:anywhere (English words not split; long tokens still wrap).
G. The tag is `k1`, not t1/ti. It is the raw value of GET /styles items[].models (official description "Compatible model names (e.g., flux_dev, wan)"). The card now shows 「兼容模型：k1」 with a tooltip naming that source field; no meaning invented. Tensor.Art: per docs/evidence/tensorart-tams-2026-10-15.md the status is BLOCKED_AUTH (only ak_tensor OpenWorks keys, no TAMS Bearer) and TAMS has no list API (FAQ). The tab is lookup-by-ID with TensorCatalogNotice. Recommendation: keep it (lookup works once a TAMS Bearer key exists); the subtitle should say a TAMS Bearer key is needed. Not removed.
H. Run toasts (success and failure) start with 「运行：<target> · 本次请求含 LoRA N 个 / 未含 LoRA / 未发出生成请求」, read from this run's traced request body.
I. Live flux-1-dev schema properties: prompt, seed, steps, width, height (512–2368), image_url, styles, strength, guidance_scale, style_images, image_style_references. No negative_prompt/sampler/scheduler. In runD, width/height were not sent because the graph had no latent/size node connected (KSampler latent_image empty in screenshot 02), so nothing was filled; not a mapping bug (the server maps width/height when present). History now records actualRequest.schemaFields; any parameter whose aliases are absent shows 「该端点不支持」 instead of 「未发送」 (generic).
J. modelSchemaCache marks _canvas.schemaLoading while fetching; schemaSendStatus returns 'loading' → neutral badge 「Schema 加载中…」 instead of 待确认.

Tests: src/utils/runDFollowups.test.ts (A, C, D, I, J); novitaDeclaration updated. vitest src: all pass except 2 pre-existing mediaHostedReview. tsc: no new errors.

## 03:32 K/L — Civitai (CODE_ONLY, no paid calls). Backup pre-KL-*.tgz
Mapping files: field specs (data) in src/schemas/providerSchema.ts (CIVITAI_MODELS); request builder in src/server/civitaiImageContract.ts.
K. comfy:krea2 steps/cfg → status 'unverified', source https://developer.civitai.com/orchestration/recipes/krea.md, note 「未核实：官方 Krea 配方参数表未列 steps/cfg」. They are still sent (no fal-recipe switch). The badge shows unverified, never 会发送. sampler/scheduler are also not in that recipe but are left supported (not asked); flagged.
L. The builder now takes the wire name from the field spec (getFieldSpec(...).wire), with the tuple name only as the default. flux2Dev spec: steps wire numInferenceSteps, cfg wire guidanceScale (https://developer.civitai.com/orchestration/recipes/flux2.md; steps/cfgScale → 400). Status stays unverified (engine sdcpp vs recipe flux2 not verified). Test: src/server/civitaiKL.test.ts.

## 03:34 G ruling — Tensor.Art tab (CODE_ONLY). Backup pre-G-*.tgz
- The tab is kept. src/config/loraHubProviders.json tensorart.requiresCredential = {kind:'tams-bearer', keyHeader, storedKey, notice:「需要 TAMS Bearer key；官方没有模型列表接口」, docUrl: https://tams-docs.tensor.art/docs/api/guide/integration-faq/#model-issues}.
- New GET /api/credential-presence?kind=<kind> (src/server/routes/civitaiModelRoutes.ts, resolver keyed by credential kind; returns only {present:boolean}, never the key). Registered in server.ts.
- CivitaiModal is generic: when the active provider declares requiresCredential and presence ≠ true, the hub shows only the notice + doc link. No cards and no import/add/apply controls (the custom import bar is hidden too).
- 「工具」 wording removed from NodeItem.tsx (旧 OpenWorks 接口项), tensorModelApi.ts (OpenWorks 接口名 / 接口), tensorArtCredentials.ts (仅用于 OpenWorks 接口); tests updated.

## 03:35 M — Civitai FLUX.2 Dev native path (CODE_ONLY, no paid calls). Backup pre-M-*.tgz
Source: https://developer.civitai.com/orchestration/recipes/flux2.md (raw /workspace/audit-v2-raw/flux2-0334.md L201–254, L379).
- Data: src/schemas/providerSchema.ts. ModelSpec.request = {engine, model, omitEcosystem, operations, loraShape, route}.
  - New spec `flux2:dev`: request {engine:'flux2', model:'dev', omitEcosystem, operations:[createImage, editImage], loraShape:'array'}; steps→numInferenceSteps 4–50 (default 28), cfg→guidanceScale 0–20 (default 2.5), loras supported [{air,strength}], negative_prompt unsupported, sampler/scheduler unverified.
  - `sdcpp:flux2Dev`: request {operations:[createVariant], route:{createImage→flux2:dev, editImage→flux2:dev}, loraShape:'array'}; steps/cfg wires marked 未核实.
- Builder src/server/civitaiImageContract.ts reads spec.request generically (route by operation → engine/model/ecosystem omission/allowed ops/LoRA shape). No flux2 engine/model/field names hardcoded in the builder.
- Expected actualRequest (createImage): {engine:"flux2", model:"dev", operation:"createImage", prompt, width, height, quantity?, seed?, numInferenceSteps, guidanceScale, loras?:[{air,strength}]} (no ecosystem/steps/cfgScale). img2img: {engine:"sdcpp", ecosystem:"flux2Dev", operation:"createVariant", model:<AIR>, image, strength, ...}.
- Tests: src/server/civitaiKL.test.ts (native shape, 4–50 range block, createVariant on sdcpp). vitest src 1022 passed, 2 pre-existing failures.

## 04:37 No-reroute ruling (CODE_ONLY). Backup pre-noroute-*.tgz
- The rerouting mechanism (ModelSpec.request.route) is deleted. The only user was sdcpp:flux2Dev; nothing else used it.
- sdcpp:flux2Dev request: {operations:['createVariant'], operationBlockedMessage:'该路径仅用于图生图，文生图请选 Flux2 Dev（原生）', loraShape:'array'}. The builder (civitaiImageContract.ts) blocks any undeclared operation locally with that exact text; nothing is sent and the endpoint is never switched.
- flux2:dev is chosen explicitly: engine 'flux2' + ecosystem 'dev'. request.airEcosystems:['flux2'] lets flux2 AIRs/LoRAs pass the ecosystem check (data-driven). The engine allowlist accepts comfy/sdcpp or an engine declared by the model config.
- Picker: ParameterInspector's Civitai engine select is built from civitaiEngines() (CIVITAI_MODELS) → sdcpp, comfy, flux2. The ecosystem input has a datalist from civitaiEcosystemsFor(engine) → 'dev' for flux2.
- Tests updated (civitaiKL, civitaiImageContract, schemaContract use engine flux2/ecosystem dev for createImage; exact block text asserted; picker test). vitest src 1024 passed, 2 pre-existing failures; tsc no new errors.
