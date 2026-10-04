# Tensor catalog / legacy tools repair

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
