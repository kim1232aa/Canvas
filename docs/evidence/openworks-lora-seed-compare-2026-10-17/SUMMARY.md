# OpenWorks LoRA+seed image compare — 2026-10-17

- Time end: 2026-10-17 13:01:45 JST (Asia/Tokyo)
- Tool: `photoreal_studio_z_image`
- Endpoint: `https://openapi.tensor.art/openworks/v1/task` + `/task/query` (**no endpoint swap**)
- Auth: Echo-Access-Key = `ak_tensor_W6…1o64`
- Seed (named extra, same every case): `424242`
- LoRA stuffed (B/C): id `661652545330040294` weight 1.0 via names `loras` + `image_loras`
- Prompt: recipe imageId=`141319690` (Moebius ink pilot; **not tiger / not apple**); newlines flattened; len=426; size 512×512
- Product code: **not modified**. Direct openapi.
- Query body: `{"taskIds":[id]}` (fixed after first bad poll used `id`).

## Hashes

| case | submit | final | sha256 |
|---|---|---|---|
| A-official4-seed | 200 | FINISH | `137877fe02768bae342dee9e94c222cc1bab8b772f0a60c7dc268b1f150aebe0` |
| B-official4-seed-lora | 200 | FINISH | `ca9b24ea893b4f3565f29d543c40cd17527128e4f8fdf6f9ba9d8ceec5b7bc85` |
| C-repeat-B | 200 | FINISH | `ef09c92a4763953fddb022f485bc358de76d1a5d16d4753a8f20021171d9fc5a` |

## Equality

- A == B? **False**
- B == C? **False** (noise / determinism check under same LoRA body)
- A == C? **False**

## One-line conclusion

A≠B and B≠C — cannot attribute difference to LoRA alone (seed likely ignored; nondeterministic).
