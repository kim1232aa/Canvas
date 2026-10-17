# Provider wiring vs Researchy audit · 2026-10-15

- **Date**: 2026-10-15 (Asia/Shanghai)
- **Method**: Read all 16 files under `docs/provider-api-audit/`; secondary check against `docs/provider-schema-drafts/{together,aimlapi,novita,venice}.json` (tinkabot); compare to code in `src/server/schemaProviders.ts`, `server.ts`, `src/server/routes/*`, engines/drivers, contracts. Skimmed `docs/evidence/{together,krea,tensorart-tams}-api-2026-10-15.md` and related.
- **Truth source**: `docs/provider-api-audit/` (not training memory). Schema drafts are secondary only.
- **Secrets**: none in this file.
- **Parallelism**: AIMLAPI wiring may be in flight on `schemaProviders.ts` / `server.ts`. AIMLAPI-specific P0s deferred. Fixes in this pass avoided AIMLAPI WIP surface except the shared “invent LoRA when schema silent” refuse (affects muapi/wavespeed generic branch only).

## Summary counts

| Class | Count |
|-------|------:|
| Match (wired aligned with audit for checked axes) | 9 |
| P0 mismatch / gap | 4 |
| P1 gap / incomplete | 8 |
| P2 polish / note | 3 |
| Not in audit set / N/A this pass | — |

Axes checked per 画布: LoRA field shape, seed send, Together serverless no LoRA, TAMS≠OpenWorks, video official-vs-empty/catalog-only.

---

## P0 first (file:line)

### P0-1 · Schema-provider invents `loras[{path,scale}]` when OpenAPI has no LoRA field
- **Audit / draft**: muapi/wavespeed/fal-style — only send LoRA if schema declares `loras` / `lora_list` / `lora_url`; else refuse (never silent invent). Together/Krea already refuse.
- **Code**: `src/server/schemaProviders.ts` ~455–461 `else` branch: if no `loras`/`lora_list`/`model_id`/`lora_url` in props, still `payload.loras = loras.map({path,scale})`.
- **Severity**: P0 — invents private field shape; can fake “LoRA sent” on endpoints that reject or ignore.
- **Fix this pass**: refuse with local 400 when schema has no LoRA field (same iron rule as Krea/Together).

### P0-2 · NanoGPT: undeclared LoRA invents `{path,scale}` and passes through
- **Audit** (`nanogpt.md`): Image/Video docs have **no** generic LoRA; default treat as unsupported → refuse mount; only enable if live `supported_parameters.loras` appears.
- **Code**: `src/schemas/nanoImageApi.ts` ~55–59: undeclared → still maps to `{path,scale}` with `capability:'unknown'`.
- **Severity**: P0 vs audit/default rule (also invents AIML/Fal-shaped field on a provider that docs say has none).
- **Fix this pass**: undeclared LoRA → throw 400; declared → keep `{path,scale}` mapping.

### P0-3 · Civitai Flux2 Dev LoRA shape is map, audit says array
- **Audit** (`civitai.md`): Flux2 Klein = map `{AIR: strength}`; **Flux2 Dev** = `loras[]: { air, strength }` (different).
- **Code**: `src/server/civitaiImageContract.ts` ~131–146 always builds map `loras[resource]=strength` for non-krea2 (includes `flux2Dev`).
- **Severity**: P0 wrong wire shape for Dev.
- **Fix this pass**: when `ecosystem === 'flux2Dev'`, emit array `{ air, strength }`.

### P0-4 · AIMLAPI / Novita / Venice not in product drivers (AIMLAPI WIP)
- **Audit + drafts**: full image+video+LoRA contracts exist for AIMLAPI; Novita SD async + `model_name`+`strength`; Venice no custom LoRA / video no seed.
- **Code**: no `aimlapi`/`novita`/`venice` in `schemaProviders` / EngineRegistry / server routes (grep empty). AIMLAPI executor may be landing now.
- **Severity**: P0 product gap for queued providers (not wrong-field miswire). **Defer AIMLAPI code edits** until that WIP lands; Novita/Venice = document as not wired (P1 for “next integrate”, listed here because drafts arrived and audit is complete).

*Note:* Together serverless LoRA refuse + `supportsLora=false` + no `image_loras` in schema = **already MATCH** (not a P0). TAMS≠OpenWorks gate = **already MATCH**.

---

## Full per-provider table

| Provider | Audit claim (LoRA / seed / video) | Code path | Result | Sev | Action |
|----------|-----------------------------------|-----------|--------|-----|--------|
| **together** | Serverless reject `image_loras`; seed image+video; video POST+GET `/videos` (v2) | `schemaProviders.ts` together*; refuse LoRA ~416–417,451–453; `supportsLora=false` ~170; seed in schemas ~43–55; videoRoot v2 ~17,361,500 | **Match** (auth 401 live; evidence `together-api-2026-10-15.md`) | — | Wait key; video smoke later |
| **krea** | LoRA=`styles[{id,strength}]` −2..2; seed per schema; video paths in OpenAPI | `kreaStyles` ~175–182; refuse no-styles ~446–449; catalog from openapi; seed forwarded if in props | **Match** (PASS_BILLING 402) | — | FE E2E / top-up |
| **muapi** | `loras`/`lora_list`/`lora_url`+weight; seed many schemas; rich video | Schema provider + OpenAPI resolve; **Invent LoRA if schema silent** (P0-1) | **Mismatch** invent | P0 | Fixed invent→refuse |
| **wavespeed** | `loras[{path,scale}]` 0–4; seed; video same poll | Schema provider; same invent else | **Mismatch** invent | P0 | Fixed invent→refuse |
| **sogni** | `loras`+`loraStrengths`; seed Uint32; video tools | Always maps loras ~445 (model gate is upstream/silent filter for public) | **Partial match** | P1 | Optional: refuse LoRA when tool/model not in LoRA-capable set |
| **fal** | `loras[{path,scale}]`; seed; video queue | `server.ts` fal generate ~2927–2939; `providerSchema` falLoras; video `falVideoRequest` | **Match** (non-LoRA endpoints 422 surfaced) | — | — |
| **replicate** | `lora_weights`+`lora_scale` (+extra_*); seed; video=predictions | `replicateImageContract.ts` ~159–240 | **Match** | — | — |
| **civitai** | Krea no LoRA; Flux1/Klein map; **Flux2 Dev array**; videoGen | Krea refuse ~121–128; map for others; Dev wrong shape | **Mismatch** Dev | P0 | Fixed Dev→array |
| **nanogpt** | No generic LoRA in docs; seed weak; video generate-video+status | Image: invent undeclared LoRA; video: `rejectUnsupported` loras | **Mismatch** image LoRA | P0 | Fixed undeclared→refuse |
| **huggingface** | Standard params **no** LoRA; seed in parameters; T2V task exists | Non-fal-ai: reject loras ~5306; catalog can list T2V but `/api/video/generate` has no `huggingface` | **Match** LoRA refuse; **video gen gap** | P1 | Video via HF task not on video route |
| **modelscope** | `loras` string or map weights sum=1; seed; **no public video API** | `modelScopeLoras.ts`; video branch explicit 400 ~3638–3642 | **Match** | — | — |
| **tensorart-tams** | `lora.items[{loraModel,weight}]`; seed in inputInitialize; no generic video API | `tensorModelApi` / credentials; `pickTamsBearerKey`; OpenWorks `ak_` gated | **Match** (BLOCKED_AUTH OpenWorks-only keys) | — | Need TAMS Bearer |
| **tensorart-openworks** | Tools not Checkpoint; Echo-Access-Key; video=tool schema only | Separate `/tool`/`/task`; catalog wall; video via OpenWorks tools on `/api/video/generate` | **Match** labeling | — | — |
| **aimlapi** | `loras[{path,scale}]` 0–4 max 3; seed min 1; video `/v2/video/generations` | **Not in code** (WIP elsewhere) | **Not wired** | P0/P1 | **Defer** until AIMLAPI lands |
| **novita** | `request.loras[{model_name,strength}]` 0–1; seed −1; async txt2img + txt2video | **Not in code** | **Not wired** | P1 | Integrate from audit+draft |
| **venice** | No custom LoRA (`lora_strength` only); image seed; **video no seed** | **Not in code** | **Not wired** | P1 | Integrate; never send video seed |

### Video gap rollup (official API vs product)

| Provider | Official video? | Product | Sev |
|----------|-----------------|---------|-----|
| together / krea / muapi / wavespeed / sogni | Yes | Catalog + schema-provider submit/poll (not empty-only) | P1 smoke/E2E |
| fal / nanogpt / civitai / agnes / grok_compat / openworks-tools | Yes | `/api/video/generate` (or civitai generate) | — / P1 polish |
| modelscope / tams generic | No | Correct local 400 / no fake | Match |
| huggingface T2V | Yes (task API) | Catalog filter only; no video route provider | P1 |
| aimlapi / novita / venice | Yes | Not wired | P1 |
| VideoDriver presets | — | Mostly Fal+Agnes+Grok; schema providers separate | P2 UX |

---

## Fixed in this pass

1. `schemaProviders.ts` — refuse LoRA when input schema has no LoRA field (P0-1); test in `schemaProviders.test.ts`.
2. `nanoImageApi.ts` + `modelApiWiring.test.ts` — undeclared LoRA throws (P0-2).
3. `civitaiImageContract.ts` + test — `flux2Dev` emits `[{air,strength}]`; AIR namespace `flux2` accepted with recipe ecosystems `flux2Dev`/`flux2Klein` (P0-3).

Vitest (2026-10-15): `modelApiWiring` / `civitaiImageContract` / `schemaProviders` / `togetherProvider` / `kreaProvider` / `tensorArtCredentials` → **6 files / 59 tests passed**.

## Still open

- AIMLAPI integrate (defer race) — use audit + `docs/provider-schema-drafts/aimlapi.json`.
- Novita / Venice wire from audit + drafts (Novita ≠ path/scale; Venice no custom LoRA / no video seed).
- Together live key + video smoke; Krea FE E2E / top-up.
- HF text-to-video execution path.
- Optional: Sogni model-level LoRA capability gate before send.
- Optional: Civitai Flux2 pro/max/kontext explicit No-LoRA ecosystems if product exposes them.

## AIMLAPI conflict

- No AIMLAPI symbols in `schemaProviders.ts` / `server.ts` at audit time.
- Deferred any AIMLAPI-specific wiring; shared invent-LoRA refuse is intentional and provider-agnostic.

## 参数该发未发 · 2026-10-15

硬禁令（雁 / 画布）：官方端点或 Schema **支持**且画布已填的参数，必须进入真实上游 `actualRequest` / 历史「实际发送」。对可发项标「未发送 / 不会发送」= **FAIL**；不得记 PASS_BILLING / PASS_GENERATION。展示以实发为准，禁止改写/美化/兜底/伪造「未发送」。

### 根因（UI「不会发送」）

| 层 | 现象 | 根因 |
|----|------|------|
| UI badge | KSampler 对 steps/cfg/… 一律「不会发送」 | `schemaSendHint.isSchemaOmitCandidate` **静态**把 steps/cfg/sampler… 标成 omit，**不读**官方 Schema → Schema 有字段仍假标不发 |
| Builder | cfg 应发 `guidance_scale` | `schemaProviders` submit 已有别名 `cfg→guidance_scale`；缺测曾漏验 |
| 历史「未发送」 | TAMS / OpenWorks / schema-provider | `historyParameters` 未展开 TAMS `stages`、未读 `actualRequest.parameters`、OpenWorks 仅存 positional `inputs`（另跟） |

### P0 · Krea `image/bfl/flux-1-dev`（画布 FE：`PASS_BILLING_AND_FAIL_PARAMS`）

- **OpenAPI**（`/workspace/canvas/temp/krea-docs/openapi.json`）：`steps`, `seed`, `width`, `height`, `guidance_scale`, `strength`, `styles`, … — **无** `sampler` / `scheduler`
- **FE 截图**：`/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-krea-fe/05-error.png` — KSampler 对 steps/cfg/sampler/scheduler/denoise 标「不会发送」；402 欠费展示 OK；LoRA `styles[{id:79tzf61yz,strength:0.8}]` OK
- **FAIL**：steps / seed（及 cfg→guidance_scale、width/height、denoise→strength）官方支持却标不发
- **OK 不发**：sampler / scheduler（Schema 无字段）

#### 本轮修复

1. `src/utils/schemaSendHint.ts` — 无 Schema 属性证据时 **绝不**宣称 omit；有 `_canvas.schemaProperties`（或入参）时按别名判断：`cfg→guidance_scale`、`denoise→strength`、`steps`/`seed`/`width`/`height` 命中则 **不**标「不会发送」；仅 Schema 缺失的 sampler/scheduler 可标 omit
2. `ApiParameterEditor.tsx` — 「读取所选模型的官方 Schema」写入 `custom_parameters._canvas.schemaProperties`；AIMLAPI 文案已用散文（无 `loras[{path,scale}]` JSX 坑）
3. `App.tsx` — 模型中心选用带 `parameters.properties` 的目录项时同步写入 `schemaProperties`
4. Vitest：`schemaSendHint.test.ts`（Krea flux 别名）；`schemaProviders.test.ts`（Krea submit：steps/seed/cfg→guidance_scale 进 actualRequest，sampler sent:false）

#### 验收（请 画布 复测）

1. 选 Krea `image/bfl/flux-1-dev`（或点「读取官方 Schema」）
2. KSampler：steps / cfg / seed / 宽高 **不得**再显示「不会发送」；sampler / scheduler 可显示
3. 运行：`actualRequest.parameters` 含 `steps`、`seed`、`guidance_scale`（来自 cfg）、`width`/`height`；LoRA 仍为 `styles`
4. 402 原文透传不变

### 跟进（本轮后）

| Provider | 漏发/假未发送 | 状态 |
|----------|---------------|------|
| **Krea** flux-1-dev | UI 假「不会发送」；cfg→guidance_scale | **已修（待 FE 复测）** |
| WaveSpeed | `size` vs width/height；历史 unwrap | 待跟 |
| Tensor.Art TAMS | 历史未展开 `stages`（builder 已发） | 待跟（historyParameters 已部分修） |
| Tensor.Art OpenWorks | 缺 steps/cfg 关键词；历史 flat sentFields | 部分（`tensorOpenWorksInputs.ts`） |

### E2E 技能同步

`canvas-e2e-accept`：跑前填齐官方支持项；跑后历史不得对可发项标「未发送」。见 `/home/box/agent-data/workflows/canvas-e2e-accept/SKILL.md`。
