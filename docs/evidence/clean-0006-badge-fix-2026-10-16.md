# clean-0006 badge fix — 2026-10-16（北京时间）

Status: **CODE_ONLY**. No commit or push. Browser not opened. Nothing posted to the group. `.env` not printed.

Restore tar: `/workspace/canvas/temp/backups/canvas-restore/pre-clean0006badge-20261016-002117.tgz`

## Scope

Only item **#3** (upstream failure badge wiped when clearing local 宽高拦截). Items **#1** (exec-log open = full left column) and **#2** (collapsed strip = own rect + truncate) were **not** modified — `ExecutionLog.tsx` / `fitView.ts` mtimes remain from clean-1651 (`00:04`).

## Root cause

1. **Local-block catch** (`App.tsx` run `catch`): when 宽高不齐 fired, downstream / branch nodes were assigned `errorMessage: undefined` / `errorAt: undefined`. A prior HTTP 401 on 保存图像 was destroyed the moment the size block applied.
2. **Fill-height clear** (`handleUpdateNodeValue`): clearing Empty Latent local chrome also forced `state: idle` and wiped `errorMessage`/`errorAt` when `state === 'error'`. It did **not** cascade-clear `upstreamLocalBlocked` on SaveImage, so after filling height the node still showed「这次没有出图」+「本地拦截」with no「上一次」badge.
3. **Banner gate**: `NodeItem` only rendered the badge when `state === 'error'`, so any idle transition hid a surviving `errorMessage`.

## Fix

| File | Change |
|------|--------|
| `src/utils/graphEngine.ts` | `keepUpstreamFailures`: after dropping local chrome, if `errorMessage` remains → restore `state: 'error'` and clear `upstreamFailed`; if only local-downstream chrome → clear `upstreamFailed`. |
| `src/App.tsx` | Size-mismatch resolve → `clearNodeExecutionErrors(mapped, { keepUpstreamFailures: true })` (graph-wide local chrome only). Local-block catch no longer assigns `errorMessage`/`errorAt` to undefined; keeps `state: 'error'` when a prior badge exists. |
| `src/components/NodeItem.tsx` | Banner when `errorMessage && state !== 'running'` (not only `state === 'error'`). |
| `src/utils/clean1651.test.tsx` | New cases: clear-local keeps「上一次」+北京时间; success clears upstream; App wiring `willClearSizeMismatch`. |

## Product rules (unchanged)

- Upstream failure kept until next **successful** run.
- Clearing local 宽高拦截 must leave「上一次 · … · 北京时间 HH:MM:SS」on the node.
- Run start still uses `keepUpstreamFailures: true`; success still full-clears.

## Tests

`npx vitest run src/utils/clean1651.test.tsx` → **12 passed**.  
Related: `clean1358` + `clean1333` + `clean1651` → **51 passed**.

## Restart

Single restart only.
- node PID **2064827**, started `Fri Oct 16 00:25:23 2026`（北京时间）
- `:3000` → **200**
- Log: `/tmp/canvas-dev-clean0006.log`
- Parent: npm `2064802` → tsx watch → server.ts `2064827`

## Not changed (items #1 / #2)

- `src/components/ExecutionLog.tsx` (collapsed `data-canvas-chrome="bottom"`, panel `left`, truncate `max-w-[min(240px,55vw)]`)
- `src/utils/fitView.ts`
