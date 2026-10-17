# OpenWorks recipe 1053306608244813366 — 2-case (no LoRA vs 3 LoRAs)

- Time: 2026-10-17 13:14:15 JST
- Source: https://tensor.art/images/1053306608244813366
- Prompt file: `/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-tams-reopen-20261017/browser-recipe-prompt.txt` (flattened)
- Tool: `photoreal_studio_z_image` · `https://openapi.tensor.art/openworks/v1` · `ak_tensor_W6…1o64`
- Params: seed=1388322349 steps=10 cfg=1 size=768x1024 checkpoint=1001238167812080872
- LoRA ids (case2): 1015863436619315552, 1029661490430387503, 1015214543296590260 weight 1 each
- Product code: **not modified**

## Results

| case | HTTP | final | sha256 | bytes |
|---|---|---|---|---|
| 1-no-lora | 200 | FINISH | `c65b1312845551390b37d2f7f809449ee71470c84c794bb7b1d41e942a8ae6f4` | 1066421 |
| 2-with-3-loras | 200 | FINISH | `ca7e454033e60883edffd9bd5d620f64da86aa92870e4e918fb7672b5e0e89b7` | 1106022 |

- Hashes identical: **False**

## PNG paths (attach-ready)
- `/workspace/canvas/Canvas-main/docs/evidence/openworks-recipe-1053306608244813366-2026-10-17/1-no-lora.png`
- `/workspace/canvas/Canvas-main/docs/evidence/openworks-recipe-1053306608244813366-2026-10-17/2-with-3-loras.png`

## Note
OW schema has no seed/steps/cfg/negative/LoRA. 200+FINISH ≠ applied. Compare hashes/images.
