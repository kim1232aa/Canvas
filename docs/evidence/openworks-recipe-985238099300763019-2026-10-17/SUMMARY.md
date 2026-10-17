# OpenWorks recipe 985238099300763019 — 2-case (ckpt+prompt vs full params)

- Time: 2026-10-17 13:27:05 JST (Asia/Tokyo)
- Source: https://tensor.art/images/985238099300763019?post_id=985238067088523182
- Tool: `photoreal_studio_z_image` · `https://openapi.tensor.art/openworks/v1` · `ak_tensor_W6…1o64`
- Checkpoint (page): `984644890228968118` — 2127 - Z Image Asian Utopian - Turbo/Base - v3.6 - Turbo - FFV
- Size 768x1344 · seed=904953581 · steps=9 · cfg=1 · clip_skip=0
- LoRA on page: **none** (Models section only lists CHECKPOINT)
- Product code: **not modified**. Direct OpenWorks openapi. No endpoint swap.
- Prompt: recipe page (yoga/balance ball; **not apple / not homemade short**)

## Cases

1. `1-ckpt-prompt-only` — official 4 (prompt,w,h,count) + named checkpoint/model/sdModel. **No** seed/steps/cfg/negative/LoRA.
2. `2-full-params` — official 4 + seed/steps/cfg/cfg_scale/negative/checkpoint/clip_skip from page. No LoRA (none on page).

## Results

| case | HTTP | final | sha256 | bytes |
|---|---|---|---|---|
| 1-ckpt-prompt-only | 200 | FINISH | `a4e3512a42f05f6583dbad128c26b7255d39bf4eb03b4e3417e3a28248882461` | 1294824 |
| 2-full-params | 200 | FINISH | `d172692d293f7410d9feeaccf677d216bbcfe6da361e474521c806933a9a19ff` | 1309248 |

- Hashes identical: **False**

## PNG paths
- `/workspace/canvas/Canvas-main/docs/evidence/openworks-recipe-985238099300763019-2026-10-17/1-ckpt-prompt-only.png`
- `/workspace/canvas/Canvas-main/docs/evidence/openworks-recipe-985238099300763019-2026-10-17/2-full-params.png`

## Note
OW `photoreal_studio_z_image` schema declares only prompt/width/height/count. Extra named fields may 200+FINISH but ≠ applied. Compare hashes/images.
