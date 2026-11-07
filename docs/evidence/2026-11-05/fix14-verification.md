# Mission M14: FIX14 NanoGPT closeout test stub vs strict driver response - Verification Evidence

Date: 2026-11-05
Worktree: `.tower/worktrees/wt-14`
Branch: `feat/fix14-nanogpt-closeout-test-stub-vs-stri`

## 1. Reproduction of Single Failure on Main
Command:
```bash
npx vitest run src/utils/frontendCloseout.test.ts --exclude '.tower/**' --maxWorkers=1
```
Result: 1 failed | 8 passed (9 tests total). Exit code: 1.
Failing line:
```
 FAIL  src/utils/frontendCloseout.test.ts > round-trips NanoGPTNode JSON through inspector, extraction and actual driver body
Error: NanoGPT 图像路由返回缺少 model: {"imageUrl":"https://example.test/result.png"}
 ❯ NanoGPTDriver.executeGenerate src/engines/drivers/NanoGPTDriver.ts:124:13
    122|     }
    123|     if (!data.model) {
    124|       throw new Error(`NanoGPT 图像路由返回缺少 model: ${JSON.stringify(data)}…
       |             ^
    125|     }
    126|     if (!data.provider) {
 ❯ executeWorkflow src/utils/graphEngine.ts:1396:24
 ❯ src/utils/frontendCloseout.test.ts:26:7
```

## 2. Investigation of Real Route and Driver Field Names
- Read `src/engines/drivers/NanoGPTDriver.ts:119-129`:
  - Requires `imageUrl`, `model`, and `provider`. Throws if any is missing.
- Read `server.ts` route `['/api/nanogpt/generate', '/api/engine/nanogpt/generate']` (lines 5349-5354) and `respondWithGeneratedImages` (lines 984-993):
  - Returns `imageUrl` (`result.first.url`), `model` (`actualModel`, string), `provider` (`'NanoGPT'`).
- Neither `server.ts` nor `NanoGPTDriver.ts` was modified (preserving strict no-fallback behavior).

## 3. Test Fix in `src/utils/frontendCloseout.test.ts`
- Updated the stub for `NanoGPTNode` in `it.each` to return `{ imageUrl: 'https://example.test/result.png', model: 'custom-image', provider: 'NanoGPT' }` while the other four node types keep passing with their own stubs `{ imageUrl: 'https://example.test/result.png' }`.
- Added a dedicated negative test `surfaces missing model error when NanoGPT route response lacks model` verifying that a stub returning only `{ imageUrl }` causes `executeWorkflow` to reject with `'NanoGPT 图像路由返回缺少 model'`.

## 4. Full Suite Verification Results
- `npx vitest run src/utils/frontendCloseout.test.ts --exclude '.tower/**' --maxWorkers=1`
  - Exit code: 0
  - Test files: 1 passed (1)
  - Tests: 10 passed (10)
- `npx tsc --noEmit`
  - Exit code: 0
- `npm run build`
  - Exit code: 0
- `npx vitest run --maxWorkers=2 --exclude '.tower/**' --exclude '**/node_modules/**' --exclude '**/dist/**'`
  - Exit code: 0
  - Test files: 240 passed (240)
  - Tests: 1828 passed (1828)
  - Duration: 91.40s

## 5. Scope & Disclaimer
- This is a unit-level fix only. Real NanoGPT behavior in the UI is covered by the M13 browser regression, not by this test.
