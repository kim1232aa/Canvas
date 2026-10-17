# 工作流标准预设字段核对（收窄短表）

日期：2026-10-17（Asia/Tokyo）  
对照：`docs/evidence/workflow-presets-inventory-2026-10-17.md` B 表  
方法：三路并行（cursor WebSearch / grok_search / agy search_web）+ 本地 `openworks-tool-list-2026-10-17.json` + `docs/provider-api-audit/*` + WebFetch 官方页  
**Grok Build（user-grok-build-search）本轮多 query 返回空**：已逐条标明，未静默跳过。

置信度：**高**（OpenWorks / fal schnell / together / venice / wavespeed I2V / civitai WAN 有实测或官方页）；**中**（modelscope I2V 否定依赖 intro 定位+检索；modelscope_ai 国际站无对等 Inference）；novita/muapi/replicate I2V 有官方/SDK 证据但 Build 空。

---

## A) 短结论（画布三问）

### 1) tensorart OpenWorks（底模/工具 `photoreal_studio_z_image`）

- **`photoreal_studio_z_image` 只有四字段**：prompt、width、height、count。  
- **无** LoRA / seed / steps / cfg 类可发输入。  
- 全表 23 个工具扫一遍：**没有任何工具**的 inputs description 含 `lora`。  
- 产品若「挂空槽」：OpenWorks-only 标准文生图应标 **无 LoRA**；不要写假 ID。需要 LoRA 走 **TAMS**，禁止张冠李戴。  
- 依据：本地 `docs/evidence/openworks-tool-list-2026-10-17.json`；审计 `docs/provider-api-audit/tensorart-openworks.md`；技能页 https://github.com/Tensor-Art/tensorart-skills  
- 三路：WebSearch 未命中 OpenWorks schema（误命中 UI/TAMS/无关 Z-Image）；**Build=空**；agy 把 **TAMS** DIFFUSION/lora.items 当答案——**不可采信为 OpenWorks**。以 tool/list 实测为准。

### 2) I2V 本轮名单

| provider | 结论 |
|---|---|
| modelscope | **不要做预设**（API-Inference 公开范围是 LLM/多模态/文生图，无正式图生视频 Inference 契约） |
| modelscope_ai | **不要做预设**（国际站对等 `api-inference.modelscope.ai` 先前 curl 404；无公开 I2V API） |
| fal | **做**（多条官方 image-to-video endpoint） |
| wavespeed | **做**（官方 create-video-from-image + 多模型 `…/image-to-video`） |
| civitai | **做**（Orchestration `videoGen` + WAN `operation: image-to-video`） |
| novita | **做**（`/v3/async/img2video` 与 wan/vidu 等 I2V 路由；Task Result 轮询） |
| muapi | **做**（OpenAPI/目录含 Image to Video；如 wan2.7-image-to-video） |
| replicate | **做**（统一 predictions；如 `minimax/video-01` 的 `first_frame_image`） |
| together / krea / aimlapi | **本轮不做**（按产品收窄） |

### 3) fal schnell / together 公共 FLUX / venice：标准文生图不挂 LoRA？

| 家 | 结论 |
|---|---|
| fal `fal-ai/flux/schnell` | **是，不挂**。官方 Input 无 `loras`；要 LoRA 换 `fal-ai/flux-lora` |
| together serverless FLUX.2 | **是，不挂**。parameters 页原文：`image_loras` **No longer available**，当前 FLUX.2 **reject**；LoRA 用 dedicated endpoint |
| venice | **是，不挂自定义 LoRA 槽**。有 `lora_strength`（仅已捆绑 LoRA 的模型）与 `style_references`（≠ LoRA 文件）；OpenAPI **无** `loras[]` 任意挂载 |

---

## B) 短表（家 | LoRA | I2V | 依据 URL）

LoRA 列 = **标准文生图预设是否应挂 LoRA 节点**（按 B 表占位模型/端点）。

| 家 | LoRA是/否 | I2V是/否 | 依据 URL |
|---|---|---|---|
| tensorart (OpenWorks-only) | **否** | （本轮 I2V 名单外；tool/list 确有 image2video_* 工具，但产品本轮不配 I2V 预设） | 本地 openworks-tool-list；https://github.com/Tensor-Art/tensorart-skills |
| fal | **否**（schnell 标准）；换 *-lora 端点才是 | **是** | https://fal.ai/docs/model-api-reference/image-generation-api/flux-schnell ；https://fal.ai/explore/image-to-video-apis |
| together | **否**（serverless FLUX.2） | **本轮不做** | https://docs.together.ai/docs/inference/images/parameters |
| venice | **否**（无自定义 loras[]） | **本轮不做** | https://docs.venice.ai/api-reference/endpoint/image/generate |
| modelscope | **是**（官方 loras / LoRA-as-model；按模型卡） | **不要做预设** | https://modelscope.cn/docs/model-service/API-Inference/intro ；审计 modelscope.md |
| modelscope_ai | **证据不足**（国际站 Inference 未核实） | **不要做预设** | 审计：api-inference.modelscope.ai 404 |
| wavespeed | **是**（如 krea-v2-turbo-lora 的 path+scale；非 LoRA 模型勿挂） | **是** | https://wavespeed.ai/docs/lora-training-usage ；https://wavespeed.ai/docs/create-video-from-image |
| civitai | **是**（引擎支持时；Krea recipe 等无 LoRA 则不挂） | **是** | https://developer.civitai.com/orchestration/recipes/wan.md ；flux/krea recipes |
| novita | **是**（V3 txt2img `loras[].model_name+strength`） | **是** | https://docs.novita.ai/guides/model-apis-v2-to-v3-migration ；https://novita.ai/docs/api-reference/model-apis-wan-i2v |
| muapi | **是**（含 loras/lora_list 的 endpoint；无字段则否） | **是** | https://muapi.ai/docs ；https://muapi.ai/image-to-video-api |
| replicate | **否**（flux-schnell 类非 *-lora）；LoRA 模型另选 | **是** | https://replicate.com/docs/reference/http ；https://replicate.com/minimax/video-01 |
| krea | （T2I LoRA/styles 另核） | **本轮不做** | — |
| aimlapi | （按模型 schema） | **本轮不做** | — |

---

## C) I2V 名单：做 / 不要做

**做预设：** fal、wavespeed、civitai、novita、muapi、replicate  

**不要做预设：** modelscope、modelscope_ai  

**本轮不做：** together、krea、aimlapi  

---

## D) 三路对照摘要

| 议题 | WebSearch | grok_search (Build) | agy search_web | 判定 |
|---|---|---|---|---|
| OpenWorks photoreal 字段 | 未命中 OpenWorks schema | **空** | 误给 **TAMS** | **单路+本地实测**：四字段、无 LoRA |
| fal schnell LoRA | 一致：schnell 无 loras，lora 另端点 | **空** | 一致 | **两路一致** |
| together image_loras | 一致：reject / no longer available | **空** | 一致（措辞杂） | **两路+官方页一致** |
| venice LoRA | 一致：lora_strength / style_references，无 loras[] | **空** | 一致 | **两路+OpenAPI 一致** |
| fal I2V | 一致：多 endpoint | **空** | 一致 | **两路一致** |
| wavespeed I2V | 一致 | **空** | 一致 | **两路+官方指南一致** |
| modelscope I2V | 多为 Hub/本地 pipeline，无 Inference 合同 | **空** | 推测 videos/generations（**无官方契约 URL**） | **否定靠审计+intro；agy 不可当 PASS** |
| civitai I2V | 一致 WAN image-to-video | （本轮未再打 Build） | 一致 | **两路+官方 md 一致** |
| novita I2V | 一致 wan/vidu i2v | **空** | 一致 | **两路一致** |
| muapi I2V | 一致 | （未再打 Build） | 一致 | **两路一致** |
| replicate I2V | 一致 minimax/video-01 | （未再打 Build） | 一致 | **两路一致** |

**Build 空结果覆盖本轮多数 query**（OpenWorks、fal schnell、fal I2V、wavespeed、modelscope、novita、together）。已原样标明。

---

## E) 关键来源 URL

1. https://github.com/Tensor-Art/tensorart-skills  
2. 本地：`docs/evidence/openworks-tool-list-2026-10-17.json`  
3. 本地：`docs/provider-api-audit/tensorart-openworks.md`  
4. https://fal.ai/docs/model-api-reference/image-generation-api/flux-schnell  
5. https://fal.ai/models/fal-ai/flux-lora/api  
6. https://fal.ai/explore/image-to-video-apis  
7. https://docs.fal.ai/guides/generating-videos-from-image/  
8. https://docs.together.ai/docs/inference/images/parameters  
9. https://docs.venice.ai/api-reference/endpoint/image/generate  
10. https://modelscope.cn/docs/model-service/API-Inference/intro  
11. https://wavespeed.ai/docs/create-video-from-image  
12. https://wavespeed.ai/docs/docs-api/wavespeed-ai/wan-2.2-image-to-video  
13. https://wavespeed.ai/docs/lora-training-usage  
14. https://developer.civitai.com/orchestration/recipes/wan.md  
15. https://docs.novita.ai/api-reference/model-apis-task-result  
16. https://novita.ai/docs/api-reference/model-apis-wan-i2v  
17. https://muapi.ai/image-to-video-api  
18. https://muapi.ai/docs  
19. https://replicate.com/docs/reference/http  
20. https://replicate.com/minimax/video-01  

---

## 对 B 表草案的硬改点

1. **`tensorart` 行「含 LoRA」→ 改为「无 LoRA」**（OpenWorks-only / photoreal 四字段）。  
2. **I2V：删掉 modelscope / modelscope_ai 两条**（不要做预设）。  
3. **fal / together / venice 标准 T2I：维持无 LoRA**（已正确）。  
4. together/krea/aimlapi I2V：**本轮不做**。
