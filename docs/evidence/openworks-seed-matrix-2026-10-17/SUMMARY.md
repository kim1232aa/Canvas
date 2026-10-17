# OpenWorks seed/steps/CFG hard-stuff matrix — 2026-10-17

- Time: 2026-10-17 12:21–12:24 JST (Asia/Tokyo); positional retries ~12:24+
- Tool: `photoreal_studio_z_image`
- Endpoint: `https://openapi.tensor.art/openworks/v1/task` + `/task/query` (**no endpoint swap, no TAMS**)
- Auth: Echo-Access-Key = first `ak_tensor_…1o64` from env `TENSORART_API_KEY` (masked)
- Prompt: `a red apple on a white table, studio photo` · 512×512 · count=1 · seed=424242 · steps=20 · cfg=7.5
- Official 4 inputs from live tool/list: **prompt**, **image width**, **image height**, **result image count** — schema declares **no** seed/steps/cfg
- Product code: **not modified**. Direct openapi. Server PID 106904 left running.

## Summary table

| case | status | seed in request? | image hash | conclusion |
|---|---|---|---|---|
| 01-official-4 | submit=200 / FINISH | no | `c0b6edb6e5ccde09c1bb5ae960dbb9944c81016239b2bd6dd94ba9c560078975` | 官方四字段基线出图 |
| 02a-extra-positional | submit=404 | yes (5th/6th/7th positional) | — | **404 原文** code=5 `tool not found: failed to fetch mapping.json … context deadline exceeded`（CDN 超时，不是参数拒收）。窄化重试见下 |
| 02b-named-extras | submit=200 / FINISH | yes (name=seed/steps/cfg/…) | `6abd9e3777d0092118e10d7c8629a17534dcd4d462a962f4d532fed5f557284d` | 上游 200 出图；**仅表示形状被吞，不证明生效** |
| 03a-same-seed-run1 | submit=200 / FINISH | yes (named seed=424242) | `9a3681852417bf7fe701ebfcd171781ccc856da0804794a89e48a733b6259a4b` | 同 seed 第 1 次 |
| 03b-same-seed-run2 | submit=200 / FINISH | yes (named seed=424242, identical body) | `c7268c98cc55b09def930ce802d25086410e828e2fa6acf24bd7baf9e259665e` | 同 seed 第 2 次 |

## ②A positional narrow retries (submit-only characterization)

| case | HTTP | response snippet |
|---|---|---|
| 02a1-positional-seed-only | 200 | `{"code":"0", "message":"", "data":{"task":{"id":"1056284777222547745", "userId":"1048723019146487792", "status":"WAITING` |
| 02a2-positional-seed-steps-int | 200 | `{"code":"0", "message":"", "data":{"task":{"id":"1056284785812482359", "userId":"1048723019146487792", "status":"WAITING` |
| 02a3-positional-seed-steps-cfg-float | 500 | `{"code":13,"message":"failed to handle task: works service error: code=1300013, message=WORKS_QUEUE_FULL"} ` |
| 02a4-positional-three-integers | 500 | `{"code":13,"message":"failed to handle task: works service error: code=1300013, message=WORKS_QUEUE_FULL"} ` |

## Same-seed hash compare (③) — named variant

- run1 sha256: `9a3681852417bf7fe701ebfcd171781ccc856da0804794a89e48a733b6259a4b`
- run2 sha256: `c7268c98cc55b09def930ce802d25086410e828e2fa6acf24bd7baf9e259665e`
- equal: **False**
- **conclusion: 同 seed=424242 两次 sha256 不同 → 上游忽略 seed（参数无效/未生效）。200 FINISH ≠ seed 生效。**

## Findings (verbatim, no beautify)

1. Official 4-field path still works (OpenWorks 未坏).
2. Extra **named** seed/steps/cfg/cfg_scale/guidance → HTTP 200 + FINISH + image, but task/query does not need to echo them; hash proof shows seed ignored.
3. Extra **positional** seed/steps/cfg → first attempt HTTP **404** with upstream mapping.json timeout (transient infra), not a clean reject. Seed-only / seed+steps positional later returned **200 WAITING**; further submits hit `WORKS_QUEUE_FULL` (500 code 13).
4. **Do not claim seed/steps/CFG work on OpenWorks** without same-seed hash equality. This matrix: hashes differ → **ignored**.

## Files

- Per-case: `01-*/01-submit.json`, polls, `result.img`, `summary.json`
- `03-seed-hash-compare.json`, `02a-positional-retries.json`, `all-summaries.json`
