# OpenWorks recipe 969797570538788432 — 2-case (ckpt+prompt vs full+page LoRA)

- Time: 2026-10-17 13:32:50 JST (Asia/Tokyo)
- Source: https://tensor.art/images/969797570538788432?post_id=969797555506437456
- Tool: `photoreal_studio_z_image` · `https://openapi.tensor.art/openworks/v1` · `ak_tensor_W6…1o64`
- Checkpoint (page href): `940566212906107758` — Z-Image-Turbo-FP32
- **LoRA id used (case2, from page href):** `969483275569466663` — [Z Image Turbo] Asian Mix Lokr - v5.2 - C · weight 1.0
- Params: seed=3260052276 steps=9 cfg=1 size=768x1344 clip_skip=1
- Negative: **none on page** (not invented)
- Id source: Context web-scrape of recipe page model links (not invented)
- Product code: **not modified**. Endpoint OpenWorks only (no TAMS swap).
- Prompt: recipe page low-camera knee-height; **not apple / not homemade short**

## Cases

1. `1-ckpt-prompt-only` — official 4 (prompt,w,h,count) + named checkpoint/model/sdModel. **No** seed/steps/cfg/neg/LoRA.
2. `2-full-with-page-lora` — official 4 + seed/steps/cfg/clip_skip/ckpt + hard-stuff **page** LoRA via prefer `loras`/`image_loras` (+ lora/lora_id/weight + diffusion.lora.items). LoRA id `969483275569466663`.

## Results

| case | HTTP | final | sha256 | bytes |
|---|---|---|---|---|
| 1-ckpt-prompt-only | 200 | FINISH | `79e708e236a95c1ceddd4e5984f3d0783cc76272c757d46f15698b50ea154f8c` | 1292715 |
| 2-full-with-page-lora | 200 | FINISH | `7c11b04a67a26ecca4ffc875e8f0e140dee5d10e7dc6fd168d21da769f126078` | 1253800 |

- Hashes identical: **False**

## PNG paths
- `/workspace/canvas/Canvas-main/docs/evidence/openworks-recipe-969797570538788432-2026-10-17/1-ckpt-prompt-only.png`
- `/workspace/canvas/Canvas-main/docs/evidence/openworks-recipe-969797570538788432-2026-10-17/2-full-with-page-lora.png`

## Note
OW `photoreal_studio_z_image` schema declares only prompt/width/height/count. Extra named fields (incl. LoRA) may 200+FINISH but ≠ applied. Compare hashes/images. Do not claim LoRA works on OpenWorks from HTTP200 alone.
