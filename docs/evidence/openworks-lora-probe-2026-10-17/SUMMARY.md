# OpenWorks LoRA hard-stuff probe — 2026-10-17

- Time: 2026-10-17 12:49:14 JST (Asia/Tokyo); earlier submits from ~12:44 JST
- Tool: `photoreal_studio_z_image`
- Endpoint: `https://openapi.tensor.art/openworks/v1/task` + `/task/query` (**no endpoint swap, no TAMS**)
- Auth: Echo-Access-Key = `ak_tensor_W6…1o64` (first ak_tensor_ from env TENSORART_API_KEY)
- LoRA id stuffed: `661652545330040294` · weight variants 0.8 / 1.0 / 1.1
- Prompt: recipe `canvas-e2e-krea2-recipes/recipes.json` recipes[0] imageId=141294062 (tiger/butterfly forest; **not apple / not homemade short**); len=1048; size 512x512
- Official inputs from live tool/list: **prompt**, **image width**, **image height**, **result image count** — schema declares **no** LoRA field
- Product code: **not modified**. Direct openapi.

## One-line conclusion

**ignored** — every LoRA name/positional variant returned HTTP 200 + FINISH + image; task/query never echoes LoRA id/fields; tool schema has no LoRA; 200≠applied (same pattern as seed matrix). **Do not claim OpenWorks LoRA works.**

## Summary table

| case | HTTP submit | final | image sha256 | LoRA in query echo? | conclusion |
|---|---|---|---|---|---|
| 01-official-4 | 200 | FINISH | `f227afb54ae728077a0d6e1f21e6e24d71b6439131af3ebdb35b9124485e7372` | no | baseline OK (official 4) |
| 02a-named-lora-string | 200 | FINISH | `9482f9808a2b821c772a63deaa257ac123c4c94c7c97c9a64e98b973b49912a9` | no | ignored_or_unproven (HTTP200 FINISH; schema has no LoRA; no proof applied) |
| 02b-named-loras | 200 | FINISH | `205d7301d4a1d5db1c2cbdcec224ab1f70070cb65ca653a4a5ee3b533ee62538` | no | ignored_or_unproven (HTTP200 FINISH; schema has no LoRA; no proof applied) |
| 02c-named-image_loras | 200 | FINISH | `2ab5cc399d54c4e7f1b827458a368515fbff2da44db4891e4825d515aa5e17c5` | no | ignored_or_unproven (HTTP200 FINISH; schema has no LoRA; no proof applied) |
| 02d-named-lora_id | 200 | FINISH | `c01e302e29cb9faa0bc3ea6dd305c32373c42d4d4d27711faa371ddb0e4d1139` | no | ignored_or_unproven (HTTP200 FINISH; schema has no LoRA; no proof applied) |
| 02e-named-loraModel | 200 | FINISH | `2f19ab18b2541c4d6d204ae496fe8e1724d5c3f4cf1019ddc7bf69196cef10e6` | no | ignored_or_unproven (HTTP200 FINISH; schema has no LoRA; no proof applied) |
| 02f-diffusion-lora-items-json | 200 | FINISH | `d2b257eaf1cf450a36b6c61a75592b26264601590f9029437bf112225e300299` | no | ignored_or_unproven (HTTP200 FINISH; schema has no LoRA; no proof applied) |
| 02g-positional-lora-string | 200 | FINISH | `f9143664a207bc586c8df3f676b0a3154e4175410ec6206da066747f6c30e93e` | no | ignored_or_unproven (HTTP200 FINISH; schema has no LoRA; no proof applied) |

## What was stuffed (extra inputs beyond official 4)

### 01-official-4
- title: Official 4 fields baseline (control)
- note: prompt + width + height + count only
- extras: `[]`
- taskId: `1056289942994471380`

### 02a-named-lora-string
- title: Official 4 + name=lora STRING id
- note: extra name=lora + lora_weight; LoRA 661652545330040294
- extras: `[{"type": "STRING", "name": "lora", "value": "661652545330040294"}, {"type": "NUMBER", "name": "lora_weight", "value": 1.0}]`
- taskId: `1056289973059242576`

### 02b-named-loras
- title: Official 4 + name=loras
- note: name=loras STRING id + weight
- extras: `[{"type": "STRING", "name": "loras", "value": "661652545330040294"}, {"type": "NUMBER", "name": "weight", "value": 1.0}]`
- taskId: `1056290363901268256`

### 02c-named-image_loras
- title: Official 4 + name=image_loras
- note: name=image_loras STRING
- extras: `[{"type": "STRING", "name": "image_loras", "value": "661652545330040294"}]`
- taskId: `1056290546437376000`

### 02d-named-lora_id
- title: Official 4 + name=lora_id + weight
- note: name=lora_id + lora_weight 0.8
- extras: `[{"type": "STRING", "name": "lora_id", "value": "661652545330040294"}, {"type": "NUMBER", "name": "lora_weight", "value": 0.8}]`
- taskId: `1056290725752212316`

### 02e-named-loraModel
- title: Official 4 + name=loraModel
- note: name=loraModel + weight 1.1
- extras: `[{"type": "STRING", "name": "loraModel", "value": "661652545330040294"}, {"type": "NUMBER", "name": "weight", "value": 1.1}]`
- taskId: `1056290887887280609`

### 02f-diffusion-lora-items-json
- title: Official 4 + diffusion.lora.items style JSON strings
- note: named STRING JSON for diffusion.lora.items / lora_items / lora
- extras: `[{"type": "STRING", "name": "diffusion.lora.items", "value": "[{\"loraModel\": \"661652545330040294\", \"weight\": 1.0}]"}, {"type": "STRING", "name": "lora_items", "value": "[{\"loraModel\": \"661652545330040294\", \"weight\": 1.0}]"}, {"type": "STRING", "name": "lora", "value": "{\"items\": [{\"loraModel\": \"661652545330040294\", \"weight\": 1.0}]}"}]`
- taskId: `1056290978081594166`

### 02g-positional-lora-string
- title: Official 4 + 5th positional STRING = LoRA id
- note: positional extra STRING LoRA id + NUMBER weight
- extras: `[{"type": "STRING", "value": "661652545330040294"}, {"type": "NUMBER", "value": 1.0}]`
- taskId: `1056291067202153209`

## Findings (verbatim, no beautify)

1. Baseline official-4 still works (OpenWorks 未坏). Prompt from recipes.json, not apple.
2. Named extras `lora` / `loras` / `image_loras` / `lora_id` / `loraModel` / `diffusion.lora.items`+`lora_items` JSON / positional STRING LoRA id — all **submit 200** and **FINISH** with an image.
3. `/task/query` response task keys only: id, outputs, status, toolName, userId — **never** contains LoRA id `661652545330040294` or the word lora.
4. Image sha256 differs across runs (expected: OpenWorks ignores seed; random each time). Hash difference **does not** prove LoRA applied.
5. First-pass 02b–02g briefly hit WORKS_QUEUE_FULL (500 code 13); retried after drain → all 200. QUEUE_FULL is infra, not LoRA reject.
6. Early poll bug used `{id}` → 400 `task_ids is required`; corrected to `{taskIds:[…]}` (same as product openWorksProvider). Poll files poll-01 may show the bad shape; later polls are correct.

## Verdict mapping

| label | meaning here |
|---|---|
| accepted | would require evidence LoRA actually affected the image / was acknowledged — **not met** |
| rejected | upstream error clearly refusing LoRA field — **not met** (all LoRA cases 200 FINISH) |
| **ignored** | shape swallowed; schema has no LoRA; no echo; no proof of effect — **this probe** |

## Files

- Per-case: `NN-*/01-submit.json`, `poll-*.json`, `02-final-task.json`, `result.img`, `summary.json`
- `all-summaries.json`, this `SUMMARY.md`
