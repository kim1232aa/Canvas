# Tensor catalog / legacy tools repair

## 2026-10-12 current-worktree recheck

This document records the 10-04 repair, not a guarantee about today's code. The official FAQ body successfully read by agent-116 still says `Can you provide an interface for listing models? Currently not available.` (https://tams-docs.tensor.art/docs/api/guide/integration-faq/).

The current worktree has regressed: `server.ts:3193–3214` returns static featured items, including three OpenWorks tool names labeled CHECKPOINT and all items labeled metadata_verified; `src/engines/drivers/TensorArtDriver.ts:14–36` advertises the same tools as models. `server.ts:3189–3191` catches an explicit ID lookup failure and converts it into a notice rather than propagating the actual HTTP status/body. `server.ts:1099` selects other pool keys or a literal `test` token for model-info. These findings require serial code repair; no production code was changed in this review, and existing selections must not be silently replaced.

The official SDK body (https://raw.githubusercontent.com/Tensor-Art/tams-sdk.js/6fdf0d1f91b0ed7c1027f2e843ee317086c19e3f/src/index.ts) confirms Bearer token authentication and default host tams-api.tensor.art. Its RSA strategy separately embeds app_id; missing appId is not a proved explanation for every Bearer 404. TAMS upload requires create-resource-image followed by PUT to putUrl with returned headers. The current OpenWorks file/upload proxy is not that implementation.

No paid generation/upload calls, new images, configuration changes, service restart, or acceptance upgrade occurred. See t7-tensorart-acceptance.md for exact official evidence and unresolved OpenWorks documentation.

## Observed production failure

Sites Worker logs for project appgprj_6abf7823b9648191aed7e4c4f10bbea8:
- GET /api/models?provider=tensorart&query=&type=Checkpoint&category=checkpoint&sort=downloads&page=1&limit=50&catalogTag=all
- timestamp 1791085867056 (UTC epoch milliseconds).
- Upstream: https://tensor.art/models/?model_types=CHECKPOINT
- HTTP 403, HTML title `Just a moment...`, Cloudflare managed challenge requiring JavaScript/cookies.
- The app returned HTTP 200 with a nested error and the selector discarded every line after the first.
- This is a public-webpage access rejection, not a billing response. No generation was submitted by this request.
- No challenge solving, alternate proxy, cached list, or OpenWorks substitution was attempted.

## Official evidence read in this run

- https://tams-docs.tensor.art/docs/api/guide/integration-faq/ — Model Issues says a model-list interface is currently unavailable; model info is queried by ID. TAMS credits and Tensor credits are separate.
- https://tams-docs.tensor.art/docs/api/apis/tams-api-v-1-service-get-model/ — GET /v1/models/:modelId returns a single model; modelType includes CHECKPOINT and LORA.

## Changes

Removed the public HTML scraper and its misleading category control. The directory response explicitly identifies `lookup-only`, `catalogAvailable:false`, and the documentation source, with no upstream list call. ID lookup still calls the configured TAMS API and preserves the upstream status, raw details, endpoint, trace and stack. No alternative list is returned.

Removed two OpenWorks-as-checkpoint presets and OpenWorks entries in the model parameter schema. New-board templates now reference stable preset IDs rather than array offsets. Existing browser, cloud and imported workflows clear known retired tool selections, retain their exact original values in `retiredToolSelection`, and preserve prompts, connections and LoRAs. The UI shows the migration on an empty selector. The Tensor model driver no longer turns a text model name into `toolName`.

Tensor LoRA import now retains its actual model ID and provider; lookup errors stop selection rather than creating a display-name placeholder. Model response type is checked before LoRA selection. UI wording no longer promises automatic base-model switching.

## Verification limits

269 tests passed before removal of the obsolete OpenWorks schema tests; final totals are recorded in PROGRESS.md. TypeScript passed. Browser QA was attempted but automatic approval review failed due to account usage limits before the browser action executed. No new frontend generation or image is claimed. Existing credentials' model-generation authorization and account balances were not re-tested in this repair.
