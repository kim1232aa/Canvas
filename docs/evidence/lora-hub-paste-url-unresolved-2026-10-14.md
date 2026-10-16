# LoRA Hub paste URL → unresolved (false positive) — 2026-10-14

## Bug
LoRA Hub pasting an HTTP(S) weight URL (e.g. HuggingFace resolve URL) marked the resource `unresolved` / `import_unresolved_resource` and blocked run via `generationReadiness`.
Manually creating a LoRALoader node and typing the **same** URL + explicit strength ran successfully (WaveSpeed+LoRA `PASS_GENERATION`, evidence `/workspace/canvas-e2e-wavespeed-lora/`).

## Root cause
1. `CivitaiModal.tsx` `handleCustomUniversalLoraSubmit` HTTP branch called `onSelectLoRA({ provider, name: rawVal, ... })` **without** `downloadUrl` or `resourceVerified`.
2. Graph attach path uses `replaceSelectedResource` (`App.tsx` → `handleAddLoRANodeToCanvas`). When `resourceVerified` is false/absent and the selection is not from catalog, it forced:
   - `import_unresolved_resource: true`
   - `unresolvedResource: true`
3. Manual LoRALoader typing writes `lora_name` directly and never goes through `replaceSelectedResource`, so no unresolved gate.

File:line (pre-fix):
- `src/components/CivitaiModal.tsx` ~384 (HTTP paste payload missing verified/downloadUrl)
- `src/utils/resourceSelection.ts` `replaceSelectedResource` ~119–122 (forced unresolved)

## Fix
- Added `isExplicitLoraWeightUrl` + `selectionFromExplicitLoraUrl(provider, url)` in `resourceSelection.ts`.
- Hub paste (CivitaiModal + ModelHubModal LoRA category) uses that helper: sets `name`/`downloadUrl` to the URL, `resourceVerified: true`, `resource_kind: 'lora'`. **Does not invent strength.**
- `replaceSelectedResource` treats explicit HTTP(S) weight URLs as executable path intent (defense for legacy Hub payloads that only set `name`).
- Placeholder / non-URL unverified names still get unresolved + transparent reason.
- Empty strength still refused by `assertExplicitLoraStrengths` / existing toast (no silent 0.8).

## Tests
```
npx vitest run src/utils/resourceSelection.test.ts src/components/CivitaiModal.test.tsx src/utils/loraStrength.test.ts src/utils/generationReadiness.test.ts
→ 4 files, 48 passed
```
`npx tsc --noEmit` — only known `hosting/*.generated` missing modules.

## Leftover for 画布
- Frontend E2E re-verify: WaveSpeed tab → LoRA Hub paste same HF URL → set strength 0.75 → run (browser owned by 画布).
- Do not claim Tensor TAMS gen (only OpenWorks `ak_tensor`).
