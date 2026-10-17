# extract-sensenova-routes — 2026-10-15

> Slice 1 per `docs/architecture/server-split-plan-2026-10-15.md` + 画布 approval.

## Restore tar

`/workspace/canvas/temp/backups/canvas-restore/pre-sensenova-extract-0157.tgz`  
(excludes node_modules / dist / .git)

## server.ts line counts

| | lines |
|--|------:|
| Before | **7424** |
| After | **7272** |
| Δ | **-152** |

## Files added

| Path | Role |
|------|------|
| `src/server/routes/sensenovaRoutes.ts` | `handleSenseNovaChat` / `handleSenseNovaGenerate` / `registerSenseNovaRoutes(app, deps)` |
| `src/server/routes/sensenovaRoutes.test.ts` | register smoke + chat/generate 400/success/upstream transparency; asserts `buildSenseNovaImageRequest` still used |

## Wiring

- `server.ts` import: `registerSenseNovaRoutes` (replaces direct `buildSenseNovaImageRequest` import).
- Call site mirrors Replicate: `registerSenseNovaRoutes(app, { resolveProviderAuth, upstreamFetch, keyPoolManager, respondWithGeneratedImages, sanitizeGenerationMetadata })`.
- Paths unchanged: `/api/engine/sensenova/chat|generate` + `/api/sensenova/chat|generate`.

## Behavior

Byte-level move of chat + generate handlers only. No API shape / status / error-string changes. Contract stays in `senseNovaImageContract.ts`.

## Vitest

```
npx vitest run src/server/routes/sensenovaRoutes.test.ts src/server/senseNovaImageContract.test.ts
→ Test Files  2 passed (2)
→ Tests      16 passed (16)
```

## Leftover SenseNova still inline in server.ts (intentional, out of slice)

- Settings defaults / key map / AuthProvider config
- `GET /api/models` catalog empty+notice
- Prompt refiner branch (`targetProvider === 'sensenova'`)
- `/api/test-provider` special-case
- `/api/cloud-keys/balances` SenseNova probe
- Settings whitelist `sensenovaKey` / `sensenovaBaseUrl`
- MEDIA_INPUT_ROUTES entries for generate paths

**No leftover** `app.post(...sensenova/chat|generate)` handlers.

## Not touched

`schemaProviders.ts`, AIMLAPI/Together/Krea/Novita WIP, App.tsx/presets, browser, commit/push, long server restart.
