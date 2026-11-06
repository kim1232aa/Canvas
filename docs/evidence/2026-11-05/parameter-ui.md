# Parameter UI Audit & Fix Evidence (M26)

**Date**: 2026-11-06  
**Agent**: paramui26 (Tower Worker)  
**Branch**: `feat/paramui26-fix-hidden-schema-errors-and-i`  
**Base**: `main` (`c2b1a0f`)

---

## 1. Background & Core Requirements

User verbatim instructions:
- 「不要美化报错，原样放回」
- 「禁止多余的拦截」
- 「严禁硬编码集成，用户需要的是自由度和泛化」
- 「空壳审计需要来个」
- 「我的验收标准只有一个，UI实际点击通过并有产物」
- 「最后：单元测试通过绝不等于实际问题解决」

### Defects Identified in Baseline
1. **Hidden Schema Errors in `ApiParameterEditor`**:
   `sharedGetJson`/`peekSharedGet` returns `{ ok: false, status, raw, data }` or throws `ApiTraceError` on non-2xx upstream responses. The previous `ApiParameterEditor` set internal state on thrown errors, but its JSX never rendered any error alert. Furthermore, non-2xx responses from `sharedGetJson` do not throw, leaving `error` unset and the fields area completely blank. In addition, previous code wiped user-entered custom parameters by invoking `rescopeCustomParameters(..., null)` on failure.
2. **Incomplete Provider Selectors in `ParameterInspector`**:
   `ParameterInspector` hardcoded an image provider button grid with only 21 items, omitting 5 providers present in `NODE_DEFINITIONS.CheckpointLoaderSimple.widgets` (`runware`, `modelslab`, `video`, `replicate`, `mage`).
   `ParameterInspector` also hardcoded `实际视频服务商` (`videoProvider`) select options to only 3 items (`fal`, `agnes`, `grok_compat`), omitting 10 registered video providers in `NODE_DEFINITIONS.AIVideoNode.widgets` (`wavespeed`, `muapi`, `novita`, `replicate`, `civitai`, `together`, `aimlapi`, `venice`, `krea`, `sogni`). Consequently, selecting Civitai as the actual video provider was impossible through the UI, hiding Civitai-specific video fields.

---

## 2. Baseline Reproduction (Real Browser Clicks)

- **Environment**: Isolated port 3226 (dev server) and port 9426 (Chrome CDP instance).
- **Click Path for Defect 1 (Schema Error Blank)**:
  1. Open ComfyUI Web Studio at `http://127.0.0.1:3226/`.
  2. Click `参数` to open the Parameter Inspector drawer.
  3. Click `Fal.ai (GPU加速)` provider button.
  4. In `data-testid="inspector-custom-model-id"`, type `nonexistent-model` and commit with Enter.
  5. The upstream API responds with HTTP 400 Bad Request.
  6. **UI Result**: The schema parameter fields area below the model selector is completely blank; no alert is rendered.
  7. **Screenshots**:
     - `docs/evidence/2026-11-05/parameter-ui/baseline-schema-error-blank.png`
  8. **Masked Request Log**:
     ```json
     {"time":"2026-11-06T18:12:54+09:00","kind":"upstream","route":"/api/model-schema","provider":"fal","model":"nonexistent-model","method":"GET","endpoint":"https://api.fal.ai/v1/models?endpoint_id=nonexistent-model&expand=openapi-3.0","status":400,"responseBody":"{\"error\":{\"type\":\"validation_error\",\"message\":\"Bad request\"}}\n","durationMs":120,"lookup":true,"startedAt":"2026-11-06T09:12:54.247Z"}
     ```

- **Click Path for Defect 2 (Omitted Provider Options)**:
  1. In the Parameter Inspector drawer, inspect the `云端推理服务商 (Provider)` button grid: only 21 buttons are present. `Runware`, `ModelsLab`, `AI Video`, `Replicate`, and `Mage` are missing.
  2. In the canvas Checkpoint node, switch `目标执行引擎 (Provider)` to `🎬 AI Video 视频引擎`.
  3. Inspect `实际视频服务商` select in the Parameter Inspector drawer: only 3 choices (`fal`, `agnes`, `grok_compat`) are listed. `Civitai`, `Replicate`, `WaveSpeed`, etc. are missing.
  4. **Screenshots**:
     - `docs/evidence/2026-11-05/parameter-ui/baseline-image-provider-grid-omissions.png`
     - `docs/evidence/2026-11-05/parameter-ui/baseline-video-provider-dropdown-omissions.png`
     - `docs/evidence/2026-11-05/parameter-ui/baseline-video-provider-dropdown-scrolled.png`

---

## 3. Engineering Fixes

### 3.1 `src/components/ApiParameterEditor.tsx`
- **Transparent Schema Error Alert**:
  - Explicitly handles `{ ok: false, status, raw, data }` from `sharedGetJson`/`peekSharedGet` as well as thrown network errors (`ApiTraceError` or `TypeError`).
  - Displays original endpoint (`/api/model-schema?provider=...&model=...`), upstream endpoint (`data.endpoint` / `e.endpoint`), HTTP status code, and verbatim raw response body in an accessible `<div role="alert" aria-label="Schema 请求失败">`.
  - Uses an untruncated scrollable monospace `<pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-all text-[11px] bg-black/40 p-2 rounded border border-rose-950 select-text">`.
  - Zero diagnosis synthesis, zero silent fallbacks, zero auto-retry, zero fabricated schemas.
  - Mount / hydrate peek-only behavior and same-action deduplication are strictly preserved (0 extra GETs).
  - Stale error state is cleared immediately when switching provider/model scope.
  - User-entered custom parameters are retained (removed `rescopeCustomParameters(..., null)` on failure).

### 3.2 `src/components/ParameterInspector.tsx`
- **Deriving Image Providers from Registry**:
  - Derived from `NODE_DEFINITIONS.CheckpointLoaderSimple.widgets` (`name: 'targetProvider'`).
  - Renders all 26 registered image providers with their declared labels.
  - Keeps unknown / imported provider values visible and highlighted if present in `params.targetProvider`.
- **Deriving Actual Video Providers from Registry**:
  - Derived from `NODE_DEFINITIONS.AIVideoNode.widgets` (`name: 'targetProvider'`).
  - Renders all 14 options (1 explicit empty option + 13 registered video providers).
  - Keeps unknown / imported video providers visible if present in `params.videoProvider`.
  - Selecting `'video'` switches to video mode; selecting `'civitai'` from the video provider dropdown displays Civitai engine, ecosystem, model, and `CivitaiAllowMatureControl` fields.

---

## 4. Regression Tests & Temporary Worktree Failure Verification

### 4.1 Test Suites Added / Updated
- `src/components/ApiParameterEditor.test.tsx` (6 tests):
  1. `renders non-2xx JSON response error verbatim with endpoint, status, and raw body in scrollable monospace alert`
  2. `renders non-2xx non-JSON response (e.g. 502 HTML) verbatim without truncation or fallback diagnosis`
  3. `renders rejected network errors (e.g. TypeError: Failed to fetch) verbatim`
  4. `preserves multiline bodies untruncated`
  5. `stale errors clear on scope change without issuing extra GETs`
  6. `does not erase user-entered custom parameters when Schema lookup fails`
- `src/components/ParameterInspector.test.tsx` (6 tests):
  1. `does not copy JSON when sampler or scheduler is unset and explains why`
  2. `uses the exact catalog range when present and leaves the numeric control unbounded when unknown`
  3. `derives image provider buttons from CheckpointLoaderSimple node registry, including formerly missing options`
  4. `keeps unknown / imported targetProvider visible and highlighted in mounted component`
  5. `derives actual video provider dropdown options from AIVideoNode registry and keeps empty / unknown visible`
  6. `makes Civitai-specific fields accessible when selecting Civitai as actual video provider`

### 4.2 Temporary Worktree Reinstatement of Old Defects
In temporary worktree `temp/wt-temp-m26-verify`:
1. **Reinstating Defect A (`ApiParameterEditor.tsx` from main)**:
   - Command: `npx vitest run src/components/ApiParameterEditor.test.tsx`
   - **Exit Code**: `1` (6 failed)
   - Failed assertions:
     - `AssertionError: expected null not to be null` (alert was missing)
     - `AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times` (custom parameters were erased by `rescopeCustomParameters(..., null)`)
2. **Reinstating Defect B (`ParameterInspector.tsx` from main)**:
   - Command: `npx vitest run src/components/ParameterInspector.test.tsx`
   - **Exit Code**: `1` (3 failed)
   - Failed assertions:
     - `Button for provider huggingface (🤗 Hugging Face Inference / Space): expected undefined to be defined`
     - `Option for video provider wavespeed: expected undefined to be defined`
3. Temporary worktree removed cleanly via `git worktree remove --force` and `git worktree prune`.

---

## 5. Post-Fix Real Browser Verification

- **Click Path & Results**:
  1. **Image Provider Grid**:
     - All 26 provider buttons rendered in the grid.
     - Screenshot: `docs/evidence/2026-11-05/parameter-ui/postfix-image-provider-grid.png`
  2. **Schema Failure Alert**:
     - Selected `Fal.ai`, entered `nonexistent-model`.
     - Alert rendered with `role="alert"` and `aria-label="Schema 请求失败"`:
       - Header: `Schema 获取失败`
       - Request Endpoint: `/api/model-schema?provider=fal&model=nonexistent-model`
       - Upstream Endpoint: `https://api.fal.ai/v1/models?endpoint_id=nonexistent-model&expand=openapi-3.0`
       - Status: `HTTP 状态码：400`
       - Raw Body: Verbatim untruncated JSON in scrollable monospace `<pre>`
     - Screenshot: `docs/evidence/2026-11-05/parameter-ui/postfix-schema-error-alert.png`
     - Upstream Request Log:
       ```json
       {"time":"2026-11-06T18:33:28+09:00","kind":"upstream","route":"/api/model-schema","provider":"fal","model":"nonexistent-model","method":"GET","endpoint":"https://api.fal.ai/v1/models?endpoint_id=nonexistent-model&expand=openapi-3.0","status":400,"responseBody":"{\"error\":{\"type\":\"validation_error\",\"message\":\"Bad request\"}}\n","durationMs":96,"lookup":true,"startedAt":"2026-11-06T09:33:28.755Z"}
       ```
  3. **Video Mode & Provider Dropdown**:
     - Clicked `🎬 AI Video 视频引擎` button.
     - `实际视频服务商` select displayed with all 14 options (1 empty + 13 registered providers).
     - Screenshot: `docs/evidence/2026-11-05/parameter-ui/postfix-video-provider-dropdown.png`
  4. **Civitai Video Fields**:
     - Selected `🌟 Civitai 官方原生引擎` from `实际视频服务商`.
     - Parameter Inspector revealed Civitai engine, Civitai ecosystem, Civitai model, and Civitai allowMatureContent controls.
     - Canvas node updated to `AI 视频 (Civitai)` with `allowMatureContent: true` (NSFW default on).
     - Top bar run button synced to `运行: AI 视频 (Civitai)`.
     - Screenshot: `docs/evidence/2026-11-05/parameter-ui/postfix-civitai-video-fields.png`
