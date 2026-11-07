> ⚠️ **未验证历史文档（Unverified History）**：本文档由早期 Agent 编写，包含未经证实的推断或已过期状态，**不得作为当前事实依据**；当前经真实 UI 点击与代码实测核实的基线请以 [../evidence/2026-11-05/final.md](../evidence/2026-11-05/final.md) 与 [../../HANDOFF.md](../../HANDOFF.md) 为准。
>
> **画布验收状态：真出图 4 家（WaveSpeed、OpenWorks、魔搭国内站、魔搭国际站 AI）；Together=契约对齐未出图；Fal/Civitai/Replicate 等欠费接线。** OpenWorks/魔搭 LoRA 只写「已发送」不写「已生效」。

> **OpenWorks（2026-11-03 画布再认）：** 同次点跑真出图——配方原文+底模/种子/步数/CFG/负向+三枚真 LoRA，图落保存节点，历史 hist_1793693239642_fo6ux；只写「已发送」不写「已生效」。证据 <repo-root>/temp/e2e/openworks-fe-gen-2026-11-03/。此前 10-17 hist_1792223105137_bhlop 仍算已出图。

> **魔搭国内站（2026-11-03 画布认可）：** Tongyi-MAI/Z-Image-Turbo + Realism LoRA，图落保存节点，历史 hist_1793695144423_1ms48。证据 <repo-root>/temp/e2e/modelscope-cn-fe-gen-2026-11-03/。

> **WaveSpeed（2026-10-17 ~16:14 画布认可）：** 第二家在画布真出图——flux-dev-lora + Realism LoRA 1.1，同一会话出图落保存节点，历史成功卡 hist_1792224305224_meynb；尺寸改由空潜空间节点 832×1216 发出。证据 <repo-root>/temp/e2e/wavespeed/recipe-33530948/。

> **2026-10-15 03:26 起：** 旧 `docs/provider-api-audit/` 仅留作对比、以 `provider-api-audit-v2/` 为准，各草案中引用旧审计的结论一律视为未核实（见各文件 `_auditStatus`），Researchy 已于 2026-10-15 完成 16 家 v2 重查；更新草案以 v2 为准，字段「会发送」仍须前端实测。

# Provider Schema 声明草案

> **字段拦截通用规则（2026-10-16 画布定案）**：仅当官方文档明文写「不可用 / 会拒绝该参数」一类才可本地拦，须附原文、链接、抓取时间；措辞模糊或仅推断 → 仍按 10-15：OpenAPI 未 deprecated 保持待确认、不拦。Together `image_loras`：2026-10-16 晚画布拍板——**公共生图不挂假 LoRA**（跟参数页：已不可用 / FLUX.2 会拒）；Dedicated Endpoint 另开；误发错误原样显示；**不是**「拦截产品」。Researchy ~22:06 已核三处文档冲突。

- **用途**: 给 `canvas-dev` 接线用的通用供应商声明（非业务代码）。
- **真相源**: `../provider-api-audit-v2/*.md` + `DIFF.md`（Researchy 全量重查完成，2026-10-15）。旧 `provider-api-audit/` 仅对比用，勿引用。
- **原则**: 有证据才写；官方无能力则标 `unsupported`；禁止静默默认强度；禁止把兼容中当官方。
- **覆盖**: 16 家全部落盘（2026-10-15）。
- **2026-11-03 出站合同**：Fal/Civitai/Replicate 已按 Researchy+本机 OpenAPI/llms 写入 `researchyOutboundContract20261103`（按端点/recipe/模型分 schema；徽章不升）。

| 文件 | 供应商 | 图生 | 视频 | LoRA（图） |
|------|--------|------|------|------------|
| mage.json | Mage | async POST `/v1/mango/generate` + poll `status_url`（Bearer `MAGE_API_KEY`；Gems） | 多架构有视频，本轮未展开 | **Mango API 无 LoRA 字段**（用 `@handle` Characters/References）；勿空挂；**2026-11-02 新建**；**未验证**；Key 不进草案 |；**2026-11-02 欠费已记**（未接通）
| deepinfra.json | DeepInfra | sync POST `/v1/openai/images/generations`（默认 FLUX Schnell；仅 b64_json） | 文档有 t2v，本轮未展开 | **私人部署**：Dashboard/API 挂公开 Civitai LoRA→`yourname/yourmodel`；直调 `lora_scale` 0–1；**2026-11-02 新建**；**未验证**不升徽章；Key 不进草案 |；画布：先公共出图，私有 LoRA 等 Running 部署；公共 FLUX 接线实测 402 原样显示（证据 deepinfra/02·03）；**未验证**等画布是否收余额不足；**画布收欠费验收过（未真出图）**
| modelslab.json | ModelsLab | POST `/api/v6/images/text2img`（success/processing） | 本轮未展开 | `lora_model`+`lora_strength`（多值逗号分隔）；**2026-11-02 补 LoRA 字段（本有，非新家）**；画布：flux 底勿挂 SD LoRA；**未验证**；Key 不进草案 |；**2026-11-02 canvas-dev**：tamarin-xl-v1+cake LoRA 0.45、目录~1791、真出图需订阅；**未验证**；**2026-11-02 欠费已记**（未接通；弹窗串桶已修过挑刺）；**2026-11-03** 主线 flux supportsLora:true（499d379）；官网有 lora_model；徽章不升
| together.json | Together AI | sync POST `/images/generations` | async POST+GET `/videos` | serverless：**公共路径不挂假 LoRA**（2026-10-16 晚画布；Researchy 参数页）；Dedicated 另开；误发原样显示；非拦截产品；CODE_ONLY 待 fix12 后改代码 |
| aimlapi.json | AIMLAPI | sync POST `/v1/images/generations` | async POST+GET `/v2/video/generations` | z-image-turbo-lora：`loras[{path,scale}]` **会发送**（aimlapi-0006 欠费 403，挑刺过）；image_size/steps/seed 同轮证实会发送；**fix5 UI 收口**（尺寸行≠响应体 505 B，勿升 PASS；证据 fix5-accept-1618）；~~2026-11-04 `provider=auto` 本地拦~~ 作废：照发，实际走哪家按上游响应透明显示（同 aimlapi.json ruling；2026-11-04 雁「一律照发」） |
| novita.json | Novita | async txt2img + task-result | async txt2video/img2video + task-result | txt2img：`request.loras[{model_name,strength}]` **会发送~~（novita-1019 PASS_BILLING 至 403）；seed/steps/guidance_scale 等同轮证实 |
| venice.json | Venice | 按 constraints 三类尺寸（像素 width/height 待确认（clean-0544 仅线索）；比例仅 aspect_ratio；档位 aspect_ratio+resolution）；seed/steps/cfg_scale 像素已证实会发送；negative_prompt 待确认；lora_strength 草案待确认（空值 UI「未填写，不发送」，2026-10-16 废「待确认」徽章；live 过校验至 402）；自定义 LoRA 照发（live 上游 400 原样显示）；视频官方无 seed（事实），用户填了照发；历史勿误标已实发 cfg |
| krea.json | Krea | async per-path + `/jobs/{id}` | async per-path | flux-1-dev：`styles[{id,strength}]` ~~（未验证）会发送**（krea-0936 至 402）；steps/seed/guidance_scale 同轮证实会发送 |
| replicate.json | Replicate | predictions async / `Prefer: wait`；**2026-11-03** schnell 无 LoRA/宽高；dev-lora 有 lora_weights+extra_*；schnell+LoRA 用 flux-schnell-lora；徽章不升（欠费已记） | 同 predictions | flux-dev-lora `lora_weights`+`extra_lora`，scale -1..3，最多 2；~~PASS_BILLING~~（未验证）（1049，402）：seed/num_inference_steps/guidance/lora_weights/lora_scale 会发送，extra_lora 待确认 |；**2026-11-02 画布**：挂 LoRA 用 flux-dev-lora 等，勿 schnell 空挂；换 Key 探测过，**未验证**；**2026-11-02 欠费已记**（未接通）
| wavespeed.json | WaveSpeed | 尺寸分两族：Krea=`aspect_ratio`+`resolution`(1k|2k)；z-image/flux-dev-lora=`size` `W*H`；POST `/{model_id}`+poll | 同机制 | `loras[{path,scale 0-4}]`≤3(Krea)；path 按模型页（Krea=.safetensors 直链；z-image=owner/name 或直链）；不可达→1402 原样失败；Wan 高/低噪分开；~~fix3-1510 PASS_GENERATION~~（未验证）（aspect_ratio 1:1 + loras scale 0.85 + resolution 1k；挑刺已撤项；上游回显 strength 默认已分栏） |
| muapi.json | MuAPI | POST `/api/v1/{endpoint}` + poll | 同机制 | **hub 预设 flux-1-dev-style-lora-inference**（2026-10-17）：官方仅 prompt + 必填 lora_url + lora_weight/aspect_ratio；官方 Schema 无步数/CFG/种子/负向（事实），用户填了照发、上游不认原样显示（2026-11-04 雁，种子同样照发）；卡「待配方」禁空跑；2026-10-17 挑刺认防呆两项已过（卡灰按钮+顶栏锁）；**未验证**不升徽章；`loras` / `lora_list` / `lora_url+lora_weight` 按端点；rekey-1230 krea-v2-turbo-lora 字段与 openapi 一致、402 进历史，缺上游交互区与 LoRA 底模不匹配提示不收口；LoRA 上限：Schema 没写，只有 description 写了最多 3 个，画布不拦（Researchy 12:45 核）；fix2-1340 FAIL：resolution 本地拦（已作废，照发）；Krea loras items 无 properties，待供应商配置 path/scale（不准猜 strength）；~~fix3-1530 PASS_BILLING~~（未验证）（loras[{path,scale:0.75}]+resolution 1k → 402；挑刺无严重）；**fix5 UI 收口**（strength「Schema 声明，本次请求未含」+ aspect_ratio 进尺寸行 jczni 16:9；勿升 PASS；证据 fix5-accept-1618）；**2026-10-17 ~22:18 画布收防呆终轮**（无字段整藏已作废——2026-11-04 20:55 画布定：官方参数表没有的字段不摆空框，但只要有值（用户填或导入带入）就显示框、可改、照发；**未验证**不升徽章） |
| sogni.json | Sogni | ~~PASS_BILLING（fix3-1440，卡 r4oww）~~（未验证）：loras+loraStrengths[0.8] → POST 201/GET waiting_for_user·insufficient_credit；Researchy 15:12 官方一致；挑刺无严重 |；**2026-11-02** 补 Personal LoRAs 官方字段（导入/catalog/强度(0,1]/限额）；**未验证**不升徽章；Key 不进草案；**2026-11-02**：空库+179 界面；`waiting_for_user` 按失败显示；额度跳过；**未验证**
| fal.json | fal.ai（`Key` 鉴权） | queue.fal.run；目录 `GET /v1/models` 无 key；**2026-11-03** 出站按端点：`image_size`+`loras[{path,scale}]`（flux-krea-lora 同；flux/krea 无 loras；勿裸 fal-ai/krea）；徽章不升 | queue，输出 `video`；~~Kling V3 standard i2v PASS_BILLING~~（未验证）（bq6y0，403 TOP_UP，非出片；start_image_url+duration"5"；证据 fal-kling-i2v-1637） | `loras[{path,scale}]`；krea2 最多 3；flux-lora 无上限 |
| modelscope.json | ModelScope CN / 国际站 | CN+LoRA 能出图；**国际站未收口**（loras 形状过；fix16 见 429 insufficient balance，~~待画布明示才可 PASS_BILLING~~（未验证）；不自升） | **unsupported** | `loras` map，权重和=1，最多 6 |；**2026-11-03** 401 绑定阿里云错误透传过（不算出图；先前已出图保留）
| huggingface.json | HF Inference Providers | task API sync bytes | task API `num_frames` | 标准 schema **unsupported** |
| civitai.json | Civitai | workflows + `textToImage`/`imageGen` recipes；**2026-11-03** 三形 LoRA：Comfy 数字 map / flux2·Wan 数组 / 仅 textToImage 用 additionalNetworks；engine=`krea`/`krea3`；徽章不升 | workflows videoGen | textToImage=`additionalNetworks` map；Comfy=`loras` 对象；flux2+dev/Wan=`[{air,strength}]`；krea steps/cfg 拒法仍待核 |
| tensorart-tams.json | TAMS | `POST https://ap-east-1.tensorart.cloud/v1/jobs` stages（Researchy 22:10；Bearer 或 TAMS-SHA256-RSA；**非** OpenWorks/`ak_tensor`） | **unsupported**（仅 AnimateDiff/workflow） | `lora.items[{loraModel,weight}]` |
| tensorart-openworks.json | OpenWorks | **非整包删**；真生图测通留；拆钥匙池混用/`ak`冒充/误导入口（2026-10-16 画布） | 工具勿接 | 发送（雁定，生效未证实） |
| nanogpt.json | NanoGPT | sync `/v1/images` | async `generate-video` + status | 按模型声明（minimax-h3 `loras[{path,scale}]` ≤3） |

## 契约测试用例清单（contractTestHint）

由各草案 `contractTestHint` 汇总；canvas-dev 契约用例应对齐本表。有证据才改草案，改完同步本表。


| 文件 | 供应商 | contractTestHint |
|------|--------|-----------------|
| aimlapi.json | AIMLAPI | z-image-turbo-lora: width+height→image_size, steps 1-8 (20 照发（已撤本地拒绝，上游返回原样显示）), seed≥1, loras[{path,scale:0.85}] 必发（aimlapi-0006 已证实会发送，至 403）；cfg/negative 官方 schema 无，用户填了就照发；上游不认则原样显示报错；fix5 UI：尺寸行≠响应体 505 B（勿升 PASS） |
| civitai.json | Civitai Orchestration | textToImage → additionalNetworks（勿写入 imageGen）；imageGen Comfy* → loras 对象 AIR→number；flux2+dev/wan → loras[{air,strength}]；engine 字面值 krea/krea3；krea steps/cfg 拒法仍待核；Buzz 用尽 → step canceled |
| fal.json | fal.ai | flux-lora: steps/cfg/seed/宽高→image_size/loras 必发；krea-2 turbo lora: steps/cfg 官方无，用户填了就照发；上游不认则原样显示报错、第 4 个 LoRA 照发（已撤本地拒绝，上游返回原样显示）；Authorization 头必须以 'Key ' 开头；~~视频 Kling V3 standard i2v PASS_BILLING~~（未验证）（bq6y0，403 TOP_UP，非出片；start_image_url+duration"5"） |
| huggingface.json | Hugging Face Inference Providers | text-to-image: seed/steps/cfg/宽高 进 parameters.*；挂 LoRA 且 provider 非原生 LoRA 端点 → 照发（已撤本地拒绝，上游返回原样显示） |
| krea.json | Krea | async per-path + `/jobs/{id}` | async per-path | flux-1-dev：`styles[{id,strength}]` **会发送**（krea-0936 至 402）；steps/seed/guidance_scale 同轮证实会发送 |
| modelscope.json | ModelScope（魔搭 CN） | Qwen-Image: 画布 steps→steps, cfg→guidance, seed→seed, 宽高→size 'WxH'；2 LoRA 0.6/0.4 → loras map；0.6/0.6 照发（已撤本地拒绝，上游返回原样显示）；填 sampler_name/scheduler/denoise → 用户填了就照发；上游不认则原样显示报错 |
| muapi.json | MuAPI | krea-v2-turbo-lora → loras[]；flux-2-klein → lora_list[]；flux1 style → lora_url+lora_weight；同一画布 LoRA 节点按端点换字段名；~~fix3-1530 PASS_BILLING~~（未验证）（loras[{path,scale:0.75}]+resolution 1k → 402；挑刺无严重）；**fix5 UI 收口**（strength「Schema 声明，本次请求未含」+ aspect_ratio 进尺寸行 jczni 16:9；勿升 PASS；证据 fix5-accept-1618） |
| nanogpt.json | NanoGPT | minimax-h3/text-to-image 挂 ≤3 LoRA → loras[{path,scale}] 发出；其他模型挂 LoRA 照发（已撤本地拒绝，上游返回原样显示）；seed 仅 nano-banana-2.1 发送；steps/cfg 官方无模型声明，用户填了就照发；上游不认则原样显示报错 |
| novita.json | Novita | txt2img: request.loras[{model_name,strength 0-1}]、seed(含-1)、steps、guidance_scale 必发（novita-1019 已证实会发送，至 403）；Ming images 挂 LoRA/seed 照发（已撤本地拒绝，上游返回原样显示）；img2video 用 frames_per_second 非 fps；历史芯片须下钻 request |
| replicate.json | Replicate | flux-dev-lora: 画布 steps→num_inference_steps, cfg→guidance, seed→seed, LoRA[0]→lora_weights+lora_scale, LoRA[1]→extra_lora+extra_lora_scale；第 3 个 LoRA 应照发（已撤本地拒绝，上游返回原样显示）；flux-schnell: 官方 Input 无 negative_prompt/guidance/guidance_scale/width/height → （官方事实）；用户填了就照发，上游不认则原样显示报错；无 Schema（无 live Input.properties 且无表行）→ 照发 /predictions，上游不认则原样显示报错 |；**2026-11-02 欠费已记**（未接通）
| sogni.json | Sogni | ~~PASS_BILLING（fix3-1440，卡 r4oww）~~（未验证）：loras+loraStrengths[0.8] → POST 201/GET waiting_for_user·insufficient_credit；Researchy 15:12 官方一致；挑刺无严重 |；**2026-11-02** 补 Personal LoRAs 官方字段（导入/catalog/强度(0,1]/限额）；**未验证**不升徽章；Key 不进草案
| tensorart-openworks.json | Tensor.Art OpenWorks | 全参数+LoRA 发送（雁 10-17 定，不本地拦）；历史标已发送非已生效；视频按 outputs[].format==video；未声明工具照发（已撤本地拒绝，上游返回原样显示） |
| tensorart-tams.json | Tensor.Art TAMS | seed→inputInitialize.seed；steps/cfg/宽高→diffusion.*；LoRA→diffusion.lora.items[{loraModel,weight}]；宽高非 64 倍数照发（已撤本地拒绝，上游返回原样显示） |
| together.json | Together | 公共生图不得挂 serverless image_loras 假控件；payload 若仍含则上游拒绝原样展示。Dedicated LoRA 不在本路径。seed/steps/guidance_scale/宽高 升会发送仍待有效 Key 实测 |
| venice.json | Venice | 按 model_spec.constraints 分三类发尺寸，官方各类约束为事实：①像素（如 venice-sd35）actualRequest 须含 width/height（clean-0544 线索：会发、height>1280 旧版本地拦已撤销，改照发；该轮整套退回，待干净轮证实）；②比例（Qwen 族）官方只收 aspect_ratio（事实，发宽高会 400）；用户填了宽高也照发，不删，上游 400 原样显示；③档位（nano-banana/gpt-image-2）发 aspect_ratio+resolution。另：seed/steps/cfg_scale 像素模型会发送已证实；negative_prompt 待确认（clean-0544 仅线索）；lora_strength：空值 UI「未填写，不发送」（2026-10-16 废「待确认」徽章）；填了须发出；草案 sendStatus 仍待确认至被认 FE actualRequest（live 过校验至 402）；自定义 LoRA 照发（live 上游 400 Unrecognized key loras，原样显示）；视频官方无 seed（事实），用户填了照发；历史徽标不得把已实发 cfg_scale 标未发送。 |
| wavespeed.json | WaveSpeed | krea-v2/turbo-lora: actualRequest 须含 aspect_ratio+resolution(1k|2k)、seed、loras[{path,scale}]；path 须为 direct .safetensors URL（该模型页只写这一种）；官方该模型页无 size/steps/cfg（事实），用户填了就照发；上游不认则原样显示报错。z-image/turbo(-lora): 须含 size 'W*H'（及 schema 声明的 output_format）；path 可为 owner/name 或 .safetensors 直链；官方无 aspect_ratio/resolution（事实），用户填了就照发；上游不认则原样显示报错。不可达/非公开 path → 上游 status=failed code=1402 原样失败（画布不改写 path）。线索（clean-0544 整套退回，不算 PASS）：Krea hist_1792014675785_924um 出图成功；z-image hist_1792014824657_5o7wt。；~~fix3-1510 PASS_GENERATION~~（未验证）（aspect_ratio 1:1 + loras scale 0.85 + resolution 1k；挑刺已撤项） |

钥匙不写入本目录。
