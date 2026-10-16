> **2026-10-15 03:26 起：** 旧 `docs/provider-api-audit/` 仅留作对比、以 `provider-api-audit-v2/` 为准，各草案中引用旧审计的结论一律视为未核实（见各文件 `_auditStatus`），Researchy 已于 2026-10-15 完成 16 家 v2 重查；更新草案以 v2 为准，字段「会发送」仍须前端实测。

# Provider Schema 声明草案

> **字段拦截通用规则（2026-10-16 画布定案）**：仅当官方文档明文写「不可用 / 会拒绝该参数」一类才可本地拦，须附原文、链接、抓取时间；措辞模糊或仅推断 → 仍按 10-15：OpenAPI 未 deprecated 保持待确认、不拦。Together `image_loras` 属前者（参数指南明文 no longer available；OpenAPI 仍有 path/scale，故非 D 规则）。

- **用途**: 给 `canvas-dev` 接线用的通用供应商声明（非业务代码）。
- **真相源**: `../provider-api-audit-v2/*.md` + `DIFF.md`（Researchy 全量重查完成，2026-10-15）。旧 `provider-api-audit/` 仅对比用，勿引用。
- **原则**: 有证据才写；官方无能力则标 `unsupported`；禁止静默默认强度；禁止把兼容中当官方。
- **覆盖**: 16 家全部落盘（2026-10-15）。

| 文件 | 供应商 | 图生 | 视频 | LoRA（图） |
|------|--------|------|------|------------|
| together.json | Together AI | sync POST `/images/generations` | async POST+GET `/videos` | serverless `image_loras` OpenAPI 仍列未 deprecated → **待确认**（不以参数页 prose 本地拒；live probe 仅 401 invalid_api_key）；**15:09 画布定案：image_loras 官方明文不可用 → 挂 LoRA 本地拦，不配 path/scale**；fix4 CODE_ONLY：官方不可用拦截已接线，等前端验收；fix4 验收 PARTIAL：拦截未验到（/v1/models 401）；15:58 缓存重试 BLOCKED（Schema 未读取，需有效 Key）；维持 CODE_ONLY 勿升 |
| aimlapi.json | AIMLAPI | sync POST `/v1/images/generations` | async POST+GET `/v2/video/generations` | z-image-turbo-lora：`loras[{path,scale}]` **会发送**（aimlapi-0006 欠费 403，挑刺过）；image_size/steps/seed 同轮证实会发送；**fix5 UI 收口**（尺寸行≠响应体 505 B，勿升 PASS；证据 fix5-accept-1618） |
| novita.json | Novita | async txt2img + task-result | async txt2video/img2video + task-result | txt2img：`request.loras[{model_name,strength}]` **会发送**（novita-1019 PASS_BILLING 至 403）；seed/steps/guidance_scale 等同轮证实 |
| venice.json | Venice | 按 constraints 三类尺寸（像素 width/height 待确认（clean-0544 仅线索）；比例仅 aspect_ratio；档位 aspect_ratio+resolution）；seed/steps/cfg_scale 像素已证实会发送；negative_prompt 待确认；lora_strength 草案待确认（空值 UI「未填写，不发送」，2026-10-16 废「待确认」徽章；live 过校验至 402）；自定义 LoRA 本地拒（live 上游 400）；视频勿发 seed；历史勿误标已实发 cfg |
| krea.json | Krea | async per-path + `/jobs/{id}` | async per-path | flux-1-dev：`styles[{id,strength}]` **会发送**（krea-0936 至 402）；steps/seed/guidance_scale 同轮证实会发送 |
| replicate.json | Replicate | predictions async / `Prefer: wait` | 同 predictions | flux-dev-lora `lora_weights`+`extra_lora`，scale -1..3，最多 2；**PASS_BILLING**（1049，402）：seed/num_inference_steps/guidance/lora_weights/lora_scale 会发送，extra_lora 待确认 |
| wavespeed.json | WaveSpeed | 尺寸分两族：Krea=`aspect_ratio`+`resolution`(1k|2k)；z-image/flux-dev-lora=`size` `W*H`；POST `/{model_id}`+poll | 同机制 | `loras[{path,scale 0-4}]`≤3(Krea)；path 按模型页（Krea=.safetensors 直链；z-image=owner/name 或直链）；不可达→1402 原样失败；Wan 高/低噪分开；**fix3-1510 PASS_GENERATION**（aspect_ratio 1:1 + loras scale 0.85 + resolution 1k；挑刺已撤项；上游回显 strength 默认已分栏） |
| muapi.json | MuAPI | POST `/api/v1/{endpoint}` + poll | 同机制 | `loras` / `lora_list` / `lora_url+lora_weight` 按端点；rekey-1230 krea-v2-turbo-lora 字段与 openapi 一致、402 进历史，缺上游交互区与 LoRA 底模不匹配提示不收口；LoRA 上限：Schema 没写，只有 description 写了最多 3 个，画布不拦（Researchy 12:45 核）；fix2-1340 FAIL：resolution 本地拦合规；Krea loras items 无 properties，待供应商配置 path/scale（不准猜 strength）；**fix3-1530 PASS_BILLING**（loras[{path,scale:0.75}]+resolution 1k → 402；挑刺无严重）；**fix5 UI 收口**（strength「Schema 声明，本次请求未含」+ aspect_ratio 进尺寸行 jczni 16:9；勿升 PASS；证据 fix5-accept-1618） |
| sogni.json | Sogni | **PASS_BILLING（fix3-1440，卡 r4oww）**：loras+loraStrengths[0.8] → POST 201/GET waiting_for_user·insufficient_credit；Researchy 15:12 官方一致；挑刺无严重 |
| fal.json | fal.ai（`Key` 鉴权） | queue.fal.run；目录 `GET /v1/models` 无 key | queue，输出 `video`；**Kling V3 standard i2v PASS_BILLING**（bq6y0，403 TOP_UP，非出片；start_image_url+duration"5"；证据 fal-kling-i2v-1637） | `loras[{path,scale}]`；krea2 最多 3；flux-lora 无上限 |
| modelscope.json | ModelScope CN / 国际站 | async `/images/generations` + `/tasks`；国际站 + LoRA **PASS_GENERATION（附缺口）**：参数规则依据中国站官方文档（11:52 实时抓取）；国际站官方文档正文当前取不到，待补 | **unsupported** | `loras` map，权重和=1，最多 6 |
| huggingface.json | HF Inference Providers | task API sync bytes | task API `num_frames` | 标准 schema **unsupported** |
| civitai.json | Civitai | workflows + `textToImage`/`imageGen` recipes | workflows videoGen | textToImage=`additionalNetworks` map；engine recipe 另有 map/array；krea v2 等 **unsupported** |
| tensorart-tams.json | TAMS | `/v1/jobs` stages | **unsupported**（仅 AnimateDiff/workflow） | `lora.items[{loraModel,weight}]` |
| tensorart-openworks.json | OpenWorks | `/task` + `/task/query` | per-tool | **unsupported** |
| nanogpt.json | NanoGPT | sync `/v1/images` | async `generate-video` + status | 按模型声明（minimax-h3 `loras[{path,scale}]` ≤3） |

## 契约测试用例清单（contractTestHint）

由各草案 `contractTestHint` 汇总；canvas-dev 契约用例应对齐本表。有证据才改草案，改完同步本表。


| 文件 | 供应商 | contractTestHint |
|------|--------|-----------------|
| aimlapi.json | AIMLAPI | z-image-turbo-lora: width+height→image_size, steps 1-8 (20 本地拒绝), seed≥1, loras[{path,scale:0.85}] 必发（aimlapi-0006 已证实会发送，至 403）；cfg/negative 标不会发送；fix5 UI：尺寸行≠响应体 505 B（勿升 PASS） |
| civitai.json | Civitai Orchestration | textToImage → additionalNetworks map（AIR→{strength}），非 [{air,strength}]；flux1 recipe → loras map；flux2 dev → numInferenceSteps/guidanceScale + loras array（发 steps/cfgScale → 上游 400）；krea v2 挂 LoRA/宽高/steps/cfg 本地拒绝或标不会发送；flux1-kontext 挂 LoRA → 上游 400；Buzz 用尽 → step canceled（非专用 HTTP 402）；sdcpp+flux2Dev → steps/cfgScale + loras map（勿发 numInferenceSteps/guidanceScale）；flux2 pro/max 无 LoRA/steps/cfg |
| fal.json | fal.ai | flux-lora: steps/cfg/seed/宽高→image_size/loras 必发；krea-2 turbo lora: steps/cfg 必标不会发送、第 4 个 LoRA 本地拒绝；Authorization 头必须以 'Key ' 开头；**视频 Kling V3 standard i2v PASS_BILLING**（bq6y0，403 TOP_UP，非出片；start_image_url+duration"5"） |
| huggingface.json | Hugging Face Inference Providers | text-to-image: seed/steps/cfg/宽高 进 parameters.*；挂 LoRA 且 provider 非原生 LoRA 端点 → 本地拒绝 |
| krea.json | Krea | async per-path + `/jobs/{id}` | async per-path | flux-1-dev：`styles[{id,strength}]` **会发送**（krea-0936 至 402）；steps/seed/guidance_scale 同轮证实会发送 |
| modelscope.json | ModelScope（魔搭 CN） | Qwen-Image: 画布 steps→steps, cfg→guidance, seed→seed, 宽高→size 'WxH'；2 LoRA 0.6/0.4 → loras map；0.6/0.6 本地拒绝；填 sampler_name/scheduler/denoise → 不得进入上游 payload（omit +「该端点不支持」） |
| muapi.json | MuAPI | krea-v2-turbo-lora → loras[]；flux-2-klein → lora_list[]；flux1 style → lora_url+lora_weight；同一画布 LoRA 节点按端点换字段名；**fix3-1530 PASS_BILLING**（loras[{path,scale:0.75}]+resolution 1k → 402；挑刺无严重）；**fix5 UI 收口**（strength「Schema 声明，本次请求未含」+ aspect_ratio 进尺寸行 jczni 16:9；勿升 PASS；证据 fix5-accept-1618） |
| nanogpt.json | NanoGPT | minimax-h3/text-to-image 挂 ≤3 LoRA → loras[{path,scale}] 发出；其他模型挂 LoRA 本地拒绝；seed 仅 nano-banana-2.1 发送；steps/cfg 一律标不会发送 |
| novita.json | Novita | txt2img: request.loras[{model_name,strength 0-1}]、seed(含-1)、steps、guidance_scale 必发（novita-1019 已证实会发送，至 403）；Ming images 挂 LoRA/seed 本地拒绝；img2video 用 frames_per_second 非 fps；历史芯片须下钻 request |
| replicate.json | Replicate | flux-dev-lora: 画布 steps→num_inference_steps, cfg→guidance, seed→seed, LoRA[0]→lora_weights+lora_scale, LoRA[1]→extra_lora+extra_lora_scale；第 3 个 LoRA 应本地拒绝；flux-schnell: 官方 Input 无 negative_prompt/guidance/guidance_scale/width/height → 未传 schemaProps 时也不得发送（须 omit 或本地拒），只发 prompt/seed/num_inference_steps/aspect_ratio/num_outputs/output_* 等声明字段；无 Schema（无 live Input.properties 且无表行）→ 本地拦截不发 /predictions（schema_missing） |
| sogni.json | Sogni | **PASS_BILLING（fix3-1440，卡 r4oww）**：loras+loraStrengths[0.8] → POST 201/GET waiting_for_user·insufficient_credit；Researchy 15:12 官方一致；挑刺无严重 |
| tensorart-openworks.json | Tensor.Art OpenWorks | 只发 Schema 声明输入；seed/steps/cfg/loras 本地拦截；视频按 outputs[].format==video；未声明工具本地拒绝 |
| tensorart-tams.json | Tensor.Art TAMS | seed→inputInitialize.seed；steps/cfg/宽高→diffusion.*；LoRA→diffusion.lora.items[{loraModel,weight}]；宽高非 64 倍数本地拒绝 |
| together.json | Together | image_loras：OpenAPI 仍列且未 deprecated → 待确认（不以参数页 reject 散文作本地拒/隐藏依据）；live probe 仅得 401 invalid_api_key，不得据此升会发送或本地拒。seed/steps/guidance_scale/宽高 徽章升会发送仍待前端实测；**15:09 画布定案：image_loras 官方明文不可用 → 挂 LoRA 本地拦，不配 path/scale**；fix4 CODE_ONLY：官方不可用拦截已接线，等前端验收；fix4 验收 PARTIAL：拦截未验到（/v1/models 401）；15:58 缓存重试 BLOCKED（Schema 未读取，需有效 Key）；维持 CODE_ONLY 勿升 |
| venice.json | Venice | 按 model_spec.constraints 分三类发尺寸，禁止一律宽高：①像素（如 venice-sd35）actualRequest 须含 width/height（clean-0544 线索：会发、height>1280 本地拦；该轮整套退回，待干净轮证实）；②比例（Qwen 族）只发 aspect_ratio，发宽高会 400；③档位（nano-banana/gpt-image-2）发 aspect_ratio+resolution。另：seed/steps/cfg_scale 像素模型会发送已证实；negative_prompt 待确认（clean-0544 仅线索）；lora_strength：空值 UI「未填写，不发送」（2026-10-16 废「待确认」徽章）；填了须发出；草案 sendStatus 仍待确认至被认 FE actualRequest（live 过校验至 402）；自定义 LoRA 本地拒（live 上游 400 Unrecognized key loras）；视频勿发 seed；历史徽标不得把已实发 cfg_scale 标未发送。 |
| wavespeed.json | WaveSpeed | krea-v2/turbo-lora: actualRequest 须含 aspect_ratio+resolution(1k|2k)、seed、loras[{path,scale}]；path 须为 direct .safetensors URL（该模型页只写这一种）；不得发 size/steps/cfg；steps/cfg 标不会发送。z-image/turbo(-lora): 须含 size 'W*H'（及 schema 声明的 output_format）；path 可为 owner/name 或 .safetensors 直链；不得发 aspect_ratio/resolution(1k|2k)。不可达/非公开 path → 上游 status=failed code=1402 原样失败（画布不改写 path）。线索（clean-0544 整套退回，不算 PASS）：Krea hist_1792014675785_924um 出图成功；z-image hist_1792014824657_5o7wt。；**fix3-1510 PASS_GENERATION**（aspect_ratio 1:1 + loras scale 0.85 + resolution 1k；挑刺已撤项） |

钥匙不写入本目录。
