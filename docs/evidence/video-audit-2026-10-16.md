# 视频生成贯通审计 — CODE_ONLY 清单（2026-10-16）

> **状态口径**：本文件只写 `CODE_ONLY` / `BLOCKED` / 缺口描述。**禁止**宣称 `PASS` / `PASS_GENERATION` / 全量视频已通。  
> **范围**：代码与配置实测（`server.ts` `/api/video/generate`、`VideoDriver`、`schemaProviders`、`nodes.ts` AIVideoNode、HANDOFF/UNRESOLVED/CLAUDE、既有 `docs/evidence/t7-*`）。未改业务代码。  
> **明示未动**：Together / TAMS / `officialUnavailableParams`（任务禁改）。

## 1. 接线总览

两条执行路径（不要混写）：

| 路径 | 入口 | 谁走 |
| --- | --- | --- |
| A. 专用视频路由 | `POST /api/video/generate`（`VideoDriver` → 同路径） | `VIDEO_PROVIDERS`：`fal` / `nanogpt` / `agnes` / `grok_compat`；`civitai`/`tensor*`/`modelscope*` 在名单内但本路由**显式本地拒绝或改道** |
| B. 通用 Schema | `POST /api/schema-provider/:provider/submit` + poll | `openworks`、`aimlapi`、`together`、`venice`、`novita`、`muapi`、`wavespeed`、`krea`、`sogni`…（目录可标 Video，≠ 已前端 E2E） |

画布 UI：

- 模型中心「视频模型」分类：`ModelHubModal` `cat=video`
- 节点：`AIVideoNode`（静态选项主要为 Fal / Agnes / Grok 兼容）
- 空间帧：`mediaType==='video'` + 「图生视频」首帧；HANDOFF 记整链仍待验

## 2. 供应商表

| provider | 模型/端点（代码所见） | Schema | 画布接线 | 缺口 | 建议下一批 E2E 优先级 | 阻塞（Key/额度等） |
| --- | --- | --- | --- | --- | --- | --- |
| **fal** | `fal.run/{endpoint}`；预置含 Wan 2.1/2.7 t2v·i2v、Kling V3 t2v·i2v、MiniMax Video-01、LTX；`providerSchema` 另有 Hunyuan/CogVideoX（未全进 VideoDriver `supportedModels`） | `falVideoContract.ts` + `providerSchema` fal video | **已接线**：VideoDriver + AIVideoNode + Hub video | 充值后轮询/播放/历史大视频未验；Schema 有而节点列表无的端点易漏选；音频/多镜头未验 | **P0** | 历史 Kling i2v **403 TOP_UP** → 记过 `PASS_BILLING`（非本文件升 PASS）；证据 `docs/evidence/t7-fal-acceptance.md` |
| **agnes** | `POST {base}/videos` → poll `GET /agnesapi?video_id=&model_name=`；`agnes-video-2.5` / `2.5-flash` | `agnesVideoRequest.ts` / `agnesVideoContract.ts` | **已接线**：VideoDriver + AIVideoNode | 队列满后续无 video_id；参考/keyframe/历史闭环未验 | **P0** | 历史 **503 `video_queue_full`** → `BLOCKED_UPSTREAM_QUEUE`；证据 `t7-agnes-acceptance.md` |
| **nanogpt** | `POST …/api/generate-video` → `GET …/api/video/status?requestId=`；目录 `GET …/video-models` | 草案 `docs/provider-schema-drafts/nanogpt.json`；路由内硬映射 | **半接线**：路由+目录有；AIVideoNode 无 Nano 静态项（靠 Hub/自定义） | acceptance 记 resolution 可能未映射；官方 status 双 shape；无前端视频终态 | **P1**（Key 恢复后） | 图像历史 **BLOCKED_AUTH**；视频未独立 E2E；证据 `t7-nanogpt-acceptance.md` |
| **grok_compat** | `POST {base}/videos/generations` → `GET {base}/videos/{request_id}`；`grok-imagine-video`(+1.5) | `providerSchema` grokVideo | **已接线**：VideoDriver + AIVideoNode | 视频未前端 E2E；aspect enum 与官方 REST 有已知分歧（acceptance 记）；兼容≠官方 xAI | **P1** | 需用户配置 Base URL+Key；图像有历史 PASS_GENERATION **不可外推视频**；`t7-grok-compat-acceptance.md` |
| **civitai** | **不走** `/api/video/generate`（本地 400 指引）；`POST /api/civitai/generate` + `isVideo` + `buildCivitaiVideoInput`（engine wan/ltx2/kling…） | `src/schemas/civitaiVideo.ts` | **半接线**：EngineRegistry 可分派；Hub MotionModule；非 AIVideoNode 主列表 | 视频 recipe 前端整链未升验收；AIR/LoRA 规则严 | **P1** | 图像 SD1 历史 PASS_GENERATION **不外推视频**；`t7-civitai-acceptance.md` |
| **modelscope / modelscope_ai** | `/api/video/generate` **本地 400**：「API-Inference 当前没有已接入的视频生成接口」；不回落 Fal | 无视频 job Schema | **UI 半现 / 执行未接**：`nodes.ts` 仍列 `damo/wan2.1-i2v-*`、`THUDM/CogVideoX-5b` category=video | **死选项风险**：目录/快捷像可视频，提交必本地拒 | **P3**（先清 UI 死选项，再谈接入） | 无官方接入端点（代码断言）；Key 无关 |
| **tensorart / tensor（TAMS）** | `tamsVideoUnsupported` → 本地 400；**不**改走 OpenWorks | 无通用视频 job | **拒绝接线**（有意） | 勿把社区 VIDEO 架构目录当成 TAMS 可生成 | **—（禁动）** | 官方无通用视频 API；任务禁改 TAMS |
| **openworks** | `POST /api/schema-provider/openworks/submit`；视频看 `outputs[].format==='video'`（text2video_* / image2video_* / live_wallpaper） | per-tool `inputSchema`（`openWorksProvider.ts`） | **Schema 半接线**：Hub 可列 Video；`/api/video/generate` 显式不代理 | 视频工具前端 E2E/轮询/历史未验；AIVideoNode 遇 text2video_* 抛错引导去 OpenWorks | **P1** | 与 TAMS Key 体系分离；需有效 OpenWorks 凭据 |
| **aimlapi** | Schema：`videoRoot` `POST /v2/video/generations`；poll `GET …?generation_id=` | `aimlapiVideoInputSchema` + 目录 modalities | **Schema 半接线**：目录可 Video；走 submit 非 VideoDriver | 视频前端 E2E 未做；图像有欠费接线证据不可外推 | **P0** | 图像历史欠费；视频 Key/额度未知 |
| **venice** | Schema：`POST /video/queue` → `POST /video/retrieve`（可二进制 mp4） | OpenAPI runtime + draft | **Schema 半接线** | 视频 E2E/quote/complete 未验；seed 官方 Queue 未列 | **P0** | Key/额度；图像路径另册 |
| **together** | Schema：`videoRoot` `/v2/videos` + poll `/videos/{id}` | draft + schemaProviders | **Schema 代码有** | **本任务禁动**；image_loras 等 Key 问题另册 | **—（禁动）** | **BLOCKED** 有效 Key |
| **novita** | Schema：`/v3/async/txt2video`（及 img2video 草案）；poll `task-result` | draft + declaration | **Schema 半接线** | 视频 E2E 未验；submit 体与图像 async 分叉需核对 | **P2** | Key |
| **muapi** | 目录含 Text/Image to Video 等；**同一** schema submit + poll；sandbox `is_test` **拒绝记成功** | per-endpoint OpenAPI | **Schema 半接线**（图像已多轮 UI）；**不在** VIDEO_PROVIDERS | 选视频 endpoint 的前端 E2E/历史 mp4 未验；勿用图像 PASS_BILLING 外推 | **P1** | Production Key（禁 sandbox mock） |
| **wavespeed** | 模型 `type` text/image-to-video；同一 submit+poll | per `api_schema` | **Schema 半接线**；**不在** VIDEO_PROVIDERS | 视频模型前端 E2E 未验；图像 krea-v2 有 PASS_GENERATION **不外推视频** | **P1** | Key/额度 |
| **krea** | draft：`/generate/video/{vendor}/…`；catalog 从 OpenAPI path 拆 image\|video | OpenAPI | **Schema 半接线** | 视频路径 E2E 未验；submit 以 image 路径为主验证史 | **P2** | Key |
| **sogni** | draft `video.supported=true`；**submit 现构造 `toolName:'generate_image'`** | 固定协议 Schema | **缺口大**：图像 Creative Agent 已验；视频工具名/参数未接通 | 若点视频模型可能仍走图像工具 → 需审计后改（本任务不动手） | **P2**（先修接线再 E2E） | Key/credit；历史图像 PASS_BILLING 不外推 |
| **replicate** | Hub `collections/text-to-video`；预测 API 通用 | draft video.supported | **目录半接线**；执行是否按 video 输出解析待核 | 无专用视频验收 | **P3** | Key |
| **huggingface** | Hub `pipeline_tag=text-to-video` | 无本站视频 job 专用链 | **目录展示为主** | 无 `/api/video` 分支 | **P3** | Token |
| **runware / modelslab / gemini / sensenova / sogni 外其余** | 非 VIDEO_PROVIDERS；无本审计确认的视频终态 | — | **未接线或仅图像** | — | **—** | — |

## 3. 铁律对照（本审计所见）

| 检查 | 结论 |
| --- | --- |
| mock / 假成功 | MuAPI `is_test` → `sandbox_mock` 明确不当成功。未见视频路由用静态假 mp4 冒充成功。 |
| 静默换 provider | VideoDriver 空 provider **拒绝**回退 Fal；未识别 provider **拒绝**落入 Fal；ModelScope/TAMS/OpenWorks/Civitai 均本地说明，不换商。 |
| fallback 掩盖错误 | 视频分支未见失败改商。`readJsonFile` 的 fallback 是读文件默认值，非供应商兜底。 |
| 硬编码私有字段 | Fal/Agnes/Civitai/Nano 有专用 builder（可接受的契约层）；Schema 家应继续走动态 Schema，勿把图像字段套视频。 |
| 目录≠执行 | HANDOFF 板块 6 仍成立：视频入口有，新图像家 ≠ 视频已通。 |

## 4. 已知失败 / 证据路径（视频相关）

| 证据 | 状态摘要（原文件口径） |
| --- | --- |
| `docs/evidence/t7-fal-acceptance.md` | Kling V3 i2v 真实上游 403 TOP_UP → 历史 **PASS_BILLING**（非生成成功） |
| `docs/evidence/t7-agnes-acceptance.md` | Flash 视频 wire 正确后 503 `video_queue_full` → **BLOCKED_UPSTREAM_QUEUE** |
| `docs/evidence/t7-nanogpt-acceptance.md` | 图像 **BLOCKED_AUTH**；视频契约批注，无视频终态 |
| `docs/evidence/t7-grok-compat-acceptance.md` | 图像 PASS_GENERATION；**明确写视频未验** |
| `docs/evidence/t7-civitai-acceptance.md` | 图像 SD1 PASS；视频仅 CODE_ONLY/契约 |
| `HANDOFF.md` §板块6 / Video 行 | 产品缺口：目录出现视频 ≠ 执行/参数/轮询正确 |
| `UNRESOLVED_ISSUES.md` | Tensor 社区 VIDEO 分类、Nano video-models 分流等历史修复说明 |

## 5. 死代码 / 易误导项（只记清单，本任务不修）

1. `src/constants/nodes.ts`：ModelScope `damo/wan2.1-i2v-*`、`THUDM/CogVideoX-5b` 标 `category:'video'`，但 `server.ts` ModelScope 视频分支恒本地 400。  
2. `providerSchema` 含 `fal-ai/hunyuan-video`、`fal-ai/cogvideox-5b`，`VideoDriver.supportedModels` / AIVideoNode 选项未对齐全覆盖。  
3. `VIDEO_PROVIDERS` 含 `civitai`/`tensor*`/`modelscope*` 但执行即拒或改道 —— 名单语义易误解。  
4. Sogni schema submit 硬编码 `generate_image`，与 draft「video.supported」不一致。  
5. 预设 `presetResources.correctVideoPreset` 多处 historical / execution_blocked —— 属历史意图保留，非现网可跑视频证明。

## 6. 建议下一批前端 E2E（前 5，仅建议）

1. **Fal · Kling V3 image-to-video**（或 Wan 2.7 t2v）— 专用路由最成熟；历史已到计费原文；充值后冲生成/轮询/播放/历史。  
2. **Agnes Video 2.5 / Flash** — wire 已复审；等队列或换时段；验 size/seconds/mode 与历史持久化。  
3. **AIMLAPI 视频模型**（Schema ` /v2/video/generations` + `generation_id` poll）— 代码路径完整；与已验图像路径对照，**单独**记视频终态。  
4. **Venice `/video/queue`→`retrieve`** — OpenAPI 已挂；验二进制/URL 两种完成态与历史。  
5. **WaveSpeed 或 MuAPI 的官方 video 类 endpoint** — 与已通图像 Schema 同构；选目录里明确 text-to-video / image-to-video 各一枪；Production Key。

并列观察（不进前 5）：OpenWorks `text2video_*`；NanoGPT（等有效 Key）；Civitai wan recipe。

## 7. 本任务未动项

- 未改 `server.ts` / Driver / UI / Schema 业务行为  
- 未碰 Together / TAMS / `officialUnavailableParams`  
- 未 commit / push  
- 未宣称任何视频 PASS_GENERATION  
