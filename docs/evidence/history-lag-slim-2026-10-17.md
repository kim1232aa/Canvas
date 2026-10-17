# History list lag fix (2026-10-17)

## Cause
`GET /api/history` returned every record including `workflowSnapshot` + full `executionTrace` (~2.2MB JSON / 190 items). Opening History forced the browser to parse and React-render all of it.

## Changes
1. **Server** `server.ts`: `slimHistoryForList` — list omits `workflowSnapshot`, `executionTrace`, `submissions`, submit/poll blobs; keeps `actualRequest` for chips; sets `hasWorkflowSnapshot` / `hasExecutionTrace`.
2. **Pagination**: `GET /api/history?limit=&offset=&format=page` → `{ items, total, limit, offset, hasMore }`.
3. **Detail**: `GET /api/history/:id` returns the full record (incl. snapshot) for apply/provenance later.
4. **Client** `src/services/api.ts`: `fetchHistory` accepts slim array; adds `fetchHistoryPage`, `fetchHistoryItem`.
5. **UI** `HistoryModal`: render window 24 +「加载更多」; `PreviewMediaPanel`: `loading="lazy"` / `decoding="async"` / video `preload="none"`.

## Measured
| Payload | Bytes |
|---|---|
| Before (full dump, approx) | ~2.2MB |
| After slim all | ~690KB |
| Page limit=5 | ~70KB |

Server PID after restart: see live process on :3000. `ALLOWED_HOSTS=canvas.alibb123.ccwu.cc`.

## Paused
Apply-to-canvas + prompt URL strip stashed at `/workspace/canvas/temp/canvas-stash-apply-prompt-20261017/` — resume after lag accepted.

## Tests
`npx vitest run src/server/historyListSlim.test.ts src/components/HistoryModal.test.ts` — pass.


## Follow-up: real open-path pagination (2026-10-17 later)

### Gap
Slim list alone was not enough: `App.tsx` still called `fetchHistory()` → full slim array (~190 items / ~486–690KB). `HistoryModal` only client-sliced to 24 (`visibleLimit`); `fetchHistoryPage` unused on open.

### Fix
1. **App open** → `fetchHistoryPage({ limit: 24, offset: 0 })` (`format=page`).
2. **Load more** → `fetchHistoryPage({ limit: 24, offset: history.length })` appends; button wired via `onLoadMore` / `hasMore` / `historyTotal`.
3. Post-gen / error refresh → first page only (newest prepended). Delete/clear update local state (no full refetch).
4. Detail still `GET /api/history/:id` (full snapshot on demand). Apply-to-canvas remains stashed.

### Files
- `src/App.tsx`
- `src/components/HistoryModal.tsx`
- `src/services/api.ts` (default page limit 24)
- `src/components/HistoryModal.test.ts`

### Measured (after restore 190 records + restart)
| Payload | Bytes | Notes |
|---|---|---|
| `GET /api/history?format=page&limit=24&offset=0` | **108128** (~106KB) | 24 items, hasMore=true |
| `GET /api/history?format=page&limit=24&offset=24` | 54322 | next page |
| `GET /api/history` (slim all) | 485598 | still available, not used on open |
| Before this fix (open = slim all) | ~486–690KB | App fetched entire slim list |

Server PID: **115753** (`tsx server.ts` worker).  
`ALLOWED_HOSTS=canvas.alibb123.ccwu.cc` `ALLOWED_ORIGINS=https://canvas.alibb123.ccwu.cc`.

### Tests
`npx vitest run src/components/HistoryModal.test.ts src/server/historyListSlim.test.ts` — 11 passed.

### Still paused
Apply-to-canvas stash: `/workspace/canvas/temp/canvas-stash-apply-prompt-20261017/` — do not unstash until lag hand-feel OK.
