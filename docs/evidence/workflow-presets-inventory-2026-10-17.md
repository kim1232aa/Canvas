# 工作流中心预设清单（清空旧表 → 每家一条标准）

日期：2026-10-17（北京）  
来源：`src/constants/presets.ts` HISTORICAL_WORKFLOW_PRESETS（实测 34 条）+ 画布产品口径 + `docs/provider-api-audit/*` / schema drafts（LoRA 是否挂节点）  
状态：**已改 WORKFLOW_PRESETS 为 21 条标准文生图 + 6 条标准图生视频**（2026-10-17；Researchy 字段核）

## A) 将整表删除的 34 条 id

1. `zimage-turbo-public` — Hugging Face (Public)
2. `fal-flux-schnell-native` — Fal.ai
3. `modelscope-ai-zimage-laonansheng` — 阿里魔搭 ModelScope.ai
4. `civitai-129705858-zimage-asianmix` — Z Image Turbo 原生工作流
5. `nanogpt-flux-schnell` — NanoGPT
6. `modelscope-wan-21-t2i` — 阿里魔搭 ModelScope
7. `fal-sdxl-high-fidelity` — Fal.ai
8. `hf-sdxl-base` — Hugging Face
9. `sensenova-deepseek-flux-thinking` — SenseNova+Agnes 串桶
10. `agnes-flash-25-t2i` — Agnes
11. `agnes-flash-img2img` — Agnes Img2Img
12. `wan21-img2video-cinematic` — Wan 2.1 图生视频
13. `civitai-hinablue-136947637` — Civitai/Krea 混标
14. `civitai-aiimagestudio-134923610` — Civitai
15. `civitai-arpalest-143279135` — Civitai 视频/混标
16. `fal-krea-2-turbo-native` — Fal/Krea 混标
17. `sensenova-deepseek-v4-flux` — SenseNova+FLUX 串桶
18. `agnes-image-flash-native` — Agnes
19. `civitai-hinablue-9527` — Civitai
20. `civitai-hinablue-armor` — Civitai
21. `civitai-hinablue-pony-realism` — Civitai
22. `civitai-hinablue-2758-street` — Civitai
23. `flux-civitai-lora` — Civitai/FLUX
24. `sdxl-anime-dual-lora` — Fal/Civitai/HF 串桶
25. `modelscope-wan-workflow` — ModelScope
26. `sdxl-photorealism-tweaker` — Fal/Civitai 串桶
27. `gemini-imagen-zero-config` — Gemini
28. `flux-analog-film` — Fal/HF 串桶
29. `sdxl-shinkai-skies` — Fal/Civitai/HF 串桶
30. `flux-retro-pixel` — Fal/Civitai 串桶
31. `sdxl-chibi-3d` — Fal/Civitai 串桶
32. `runware-flux-schnell` — Runware
33. `runware-sdxl-native` — Runware
34. `modelslab-flux-native` — ModelsLab

同时废弃 `correctPreset` 打补丁路径：新表直接写干净预设，不再 map(correctPreset)。

## B) 每家新标准预设一句话草案

统一：提示词空或「填入配方/用户指定」；拓扑按文生图标准链（云端大拓扑先不改）；`provider` / `targetProvider` = 单一服务商 id。

| provider id | 新预设 id（拟） | 一句话（模型占位 / 是否含 LoRA 节点） |
|---|---|---|
| huggingface | `std-huggingface-t2i` | 文生图：Checkpoint=`Tongyi-MAI/Z-Image-Turbo`（可改）→CLIP→EmptyLatent→KSampler→VAE→Save；**无 LoRA**（router 标准 schema 无 loras） |
| modelscope | `std-modelscope-t2i` | 文生图：国内站底模占位 `Tongyi-MAI/Z-Image-Turbo`；**含 LoRA**（官方 loras） |
| modelscope_ai | `std-modelscope-ai-t2i` | 文生图：国际站 `.ai` 底模同族占位；**含 LoRA**（官方 loras） |
| nanogpt | `std-nanogpt-t2i` | 文生图：`flux-schnell` 类占位；**无 LoRA**（未声明模型不挂） |
| tensorart | `std-tensorart-t2i` | 文生图：OpenWorks-only，底模 `photoreal_studio_z_image`；**无 LoRA**（Researchy 核：tool inputs 仅提示词/宽高/张数；标准模板不挂空壳；雁「参数都发」指验收跑法非预设硬挂） |
| fal | `std-fal-t2i` | 文生图：`fal-ai/flux/schnell` 占位；**无 LoRA**（schnell 端点无 loras；勿挂假） |
| muapi | `std-muapi-t2i` | 文生图：目录默认文生图模型占位；**含 LoRA**（path+scale） |
| wavespeed | `std-wavespeed-t2i` | 文生图：`wavespeed-ai/krea-v2/turbo-lora`；**含 LoRA**（空槽） |
| krea | `std-krea-t2i` | 文生图：`krea-2-turbo` 占位；**含 style/LoRA 槽**（官方 styles[].id；无则空槽不填假 ID） |
| together | `std-together-t2i` | 文生图：`black-forest-labs/FLUX.2-dev` 占位；**无 LoRA**（serverless 不挂假 image_loras） |
| aimlapi | `std-aimlapi-t2i` | 文生图：目录默认文生图模型占位；**LoRA 仅 Schema 有 loras 时挂**（草案先不挂，改表时按模型 schema） |
| novita | `std-novita-t2i` | 文生图：V3 txt2img 默认 checkpoint 占位；**含 LoRA**（model_name+strength） |
| venice | `std-venice-t2i` | 文生图：目录默认模型占位；**无 LoRA**（style_references≠LoRA） |
| sogni | `std-sogni-t2i` | 文生图：协议默认生图模型占位；**含 LoRA 槽**（模型不支持则节点不出现/本地拒） |
| replicate | `std-replicate-t2i` | 文生图：`black-forest-labs/flux-schnell` 占位；**无 LoRA**（非 *-lora 模型不挂） |
| runware | `std-runware-t2i` | 文生图：FLUX.1 Schnell 占位；**含 LoRA 槽**（AIR；空提示词骨架） |
| modelslab | `std-modelslab-t2i` | 文生图：FLUX 官方生图占位；**含 LoRA 槽**（lora_model；空骨架） |
| gemini | `std-gemini-t2i` | 文生图：Gemini generateContent 节点，模型留空待选；**无 LoRA** |
| agnes | `std-agnes-t2i` | 文生图：Image Flash 类模型占位；**无 LoRA**（无审计证明前不挂） |
| sensenova | `std-sensenova-t2i` | 骨架：targetProvider=sensenova，模型留空；**禁止再绑 Agnes/FLUX 串桶**；无独立生图证明则仅空壳 |
| civitai | `std-civitai-t2i` | 文生图：Orchestration 引擎占位（如 flux2/turbo）；**含 LoRA**（引擎支持时；Krea/kontext 等不支持则不挂） |

### 图生视频（另加，仍算该家标准；仅视频能力家）

| provider id | 新预设 id（拟） | 一句话 |
|---|---|---|
| modelscope | `std-modelscope-i2v` | LoadImage → Wan/视频节点 → SaveVideo；提示词空 |
| modelscope_ai | `std-modelscope-ai-i2v` | 同上，国际站视频模型占位 |
| fal | `std-fal-i2v` | LoadImage → Fal 视频端点占位 → SaveVideo |
| wavespeed | `std-wavespeed-i2v` | LoadImage → WaveSpeed I2V 占位 → SaveVideo |
| civitai | `std-civitai-i2v` | LoadImage → Civitai 视频引擎占位 → SaveVideo |
| novita | `std-novita-i2v` | LoadImage → Novita txt2video/i2v 占位 → SaveVideo |
| aimlapi | `std-aimlapi-i2v` | LoadImage → 有视频 schema 的模型占位 → SaveVideo |
| muapi | `std-muapi-i2v` | LoadImage → MuAPI 视频占位 → SaveVideo |
| replicate | `std-replicate-i2v` | LoadImage → Replicate 视频模型占位 → SaveVideo |
| together | `std-together-i2v` | LoadImage → Together 视频占位 → SaveVideo（无视频 LoRA） |
| krea | `std-krea-i2v` | 仅官方有图生视频能力时加；否则不加 |

未列入上表的家（无视频审计）**不加** I2V 条。

## C) 下一步

1. ~~改 WORKFLOW_PRESETS~~ 已完成（见 D）。  
2. 交挑刺两张图：工作流中心列表（21 家）+ 点开一套画板全貌。  
3. 卡顿分页并行；apply 仍等。

## 核对（2026-10-17 15:21 JST / Asia/Tokyo）

对照 `src/constants/presets.ts` 中 `HISTORICAL_WORKFLOW_PRESETS` 顶层 `id`：

- 源码条数：**34**
- 本文 A) 名单条数：**34**
- 缺漏：**无**
- 多余：**无**
- 顺序：与源码声明顺序一致
- 重复：源码与名单均无重复 id

结论：A) 名单与源码恰好一一对应，可作整表清空依据。本轮未改 `presets.ts`。


## D) 2026-10-17 产品更正 + 已改写

Researchy + 画布：tensorart/OpenWorks 标准预设 **无 LoRA / 不挂空壳**（tool inputs 仅提示词/宽高/张数）。依据 `docs/evidence/openworks-tool-list-2026-10-17.json`。

**已落地**（`src/constants/presets.ts`）：
- 删除全部 34 条 HISTORICAL；`WORKFLOW_PRESETS` 直接导出 21 条 `std-*-t2i`（无 I2V）。
- 提示词仅 `填入配方/用户指定` 或空；不自创配方。
- tensorart：`provider=tensorart`，Checkpoint `targetProvider=openworks` + `photoreal_studio_z_image`，**无 LoRALoader**。
- wavespeed：`wavespeed-ai/krea-v2/turbo-lora` + 空 LoRA 槽。
- gemini：CLIP → GoogleImagenNode → SaveImage；agnes：紧凑链；sensenova：空壳无 agnes/flux。
- `presetResources.ts`：`correctPreset` 仅 layout identity；`PRESET_RESOURCES` 已清空。
- 恢复包：`/workspace/canvas/temp/backups/canvas-restore-presets-std-20261017-1522.tgz`

**21 条 id**：
`std-huggingface-t2i`, `std-aimlapi-t2i`, `std-agnes-t2i`, `std-civitai-t2i`, `std-fal-t2i`, `std-gemini-t2i`, `std-krea-t2i`, `std-modelslab-t2i`, `std-modelscope-ai-t2i`, `std-modelscope-t2i`, `std-muapi-t2i`, `std-nanogpt-t2i`, `std-novita-t2i`, `std-replicate-t2i`, `std-runware-t2i`, `std-sensenova-t2i`, `std-sogni-t2i`, `std-tensorart-t2i`, `std-together-t2i`, `std-venice-t2i`, `std-wavespeed-t2i`
（数组 index 0 = `std-huggingface-t2i`）

vitest：`src/constants/presets.test.ts` + `legacyTensorWorkflow` + `fix9` + `civitaiImageContract` → 44 passed。截图由父代理补。


## E) 2026-10-17 OpenWorks 四字段 + I2V 六家（Researchy 锁定）

依据：`docs/evidence/workflow-presets-field-check-2026-10-17.md` + 画布产品口径。

### OpenWorks T2I（`std-tensorart-t2i`）

- 拓扑：**CheckpointLoaderSimple → CLIPTextEncode → SaveImage**（无 LoRALoader / KSampler / EmptyLatent）。
- Checkpoint：`targetProvider=openworks`，`ckpt_name=photoreal_studio_z_image`，`width=1024`，`height=1024`，`batch_size=1`，`custom_parameters={"result image count":1}`。
- 官方四字段：prompt（CLIP 占位 `填入配方/用户指定`）/ width / height / count；**不**在预设里挂 seed/steps/cfg/LoRA。
- spatialFrame：仅 checkpoint/targetProvider/width/height/batchSize/loras=[]/customParameters；无 seed/steps/cfg。

### I2V 六家（`category: 标准图生视频`）

| id | provider | AIVideoNode.model |
|---|---|---|
| `std-fal-i2v` | fal | `fal-ai/wan/v2.7/image-to-video`（nodes.ts 已有） |
| `std-wavespeed-i2v` | wavespeed | `""`（空占位，避免臆造） |
| `std-civitai-i2v` | civitai | `""` |
| `std-novita-i2v` | novita | `""` |
| `std-muapi-i2v` | muapi | `""` |
| `std-replicate-i2v` | replicate | `""` |

拓扑统一：LoadImage → CLIP（占位提示词）→ AIVideoNode → SaveVideo。  
**未做：** modelscope / modelscope_ai / together / krea / aimlapi I2V。

### 合计

- T2I 21 + I2V 6 = **27** 条 `WORKFLOW_PRESETS`。
- 恢复包：`/workspace/canvas/temp/backups/canvas-restore-presets-ow-i2v-20261017-1527.tgz`
- vitest：`presets.test.ts` + `legacyTensorWorkflow` + `fix9` + `civitaiImageContract` → 46 passed。

## F) 2026-10-17 画布驳回后修正（OpenWorks 全链 + I2V 模型填实）

依据：画布群聊驳回（OpenWorks 标准板须走采样器/VAE→保存图像；I2V 五家模型不得空）+ `workflow-presets-field-check-2026-10-17.md`。

### OpenWorks `std-tensorart-t2i`

- 删除 `buildOpenWorksT2i` 紧凑三节点；改回 `STD_SPECS` + `buildStandardT2i`（`hasLora:false`，`targetProvider:openworks`，`ckpt:photoreal_studio_z_image`）。
- 节点：`CheckpointLoaderSimple → CLIPTextEncode → CLIPTextEncodeNegative → EmptyLatentImage → KSampler → VAEDecode → SaveImage`
- 保存线：`std-tensorart-t2i-c-vae-save`，`IMAGE` → `images`（不再把 CONDITIONING 接到 images）。
- 无 LoRALoader。Checkpoint 仍带 width/height/batch_size + `custom_parameters={"result image count":1}`（OpenWorks 四字段）；EmptyLatent 同步 1024×1024×1。
- KSampler 保留 UI 默认（seed/steps/cfg）；**Schema 实际只发** prompt/width/height/count（不宣称会发采样参数）。

### I2V 模型表（审计/证据字符串，非臆造）

| id | model | 来源 |
|---|---|---|
| `std-fal-i2v` | `fal-ai/wan/v2.7/image-to-video` | nodes.ts / field-check |
| `std-wavespeed-i2v` | `wavespeed-ai/wan-2.2/image-to-video` | field-check docs URL `wan-2.2-image-to-video` → audit 的 `{model_id}` slash 形态（非 docs 里的 minimax-h3 示例） |
| `std-civitai-i2v` | `wan` | audit wan.md / `civitaiVideo.ts` OFFICIAL engine；Orchestration `videoGen` engine id（非 AIR） |
| `std-novita-i2v` | `SVD-XT` | novita.md / novita.json img2video exampleModel |
| `std-muapi-i2v` | `wan2.7-image-to-video` | field-check 明文；endpoint id 无 `/api/v1/` 前缀 |
| `std-replicate-i2v` | `minimax/video-01` | replicate.md 官方 HTTP 示例 |

### 测试 / 恢复包

- vitest：`presets.test.ts` 15 passed；连同 `legacyTensorWorkflow` + `fix9` + `civitaiImportMap` → **40 passed**。
- 恢复包：`/workspace/canvas/canvas-restore-presets-ow-chain-i2v-20261017-1431.tgz`
