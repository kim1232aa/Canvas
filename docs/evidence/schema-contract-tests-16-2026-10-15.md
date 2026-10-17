# 16 家供应商契约测试 — 2026-10-15（CODE_ONLY）

- 测试：`src/server/schemaContract.test.ts`（7 → 21 条，全部通过）。`npx vitest run src/server/schemaContract.test.ts`
- 夹具：`docs/provider-schema-drafts/*.json`（tinkabot 草案）。没走网络，没用真 key，没读 .env。
- 状态：**CODE_ONLY**。只是单测，**没做前端 E2E**，也没真实出图。
- 修改前快照：`/workspace/canvas/temp/backups/canvas-restore/pre-contract16-*.tgz`。「修复前」一列是在这个快照上跑同一套新测试得到的。
- 测试方式：
  - MuAPI / WaveSpeed / Sogni：走真实的 `/api/schema-provider/:p/submit` 路由，上游用本地夹具。
  - Replicate：走真实的 `handleReplicateGenerate`，上游用夹具。
  - 其余几家的路由写在 `server.ts` 里，没法直接 import。所以测的是真实构建器（fal gate、modelScopeLoras、tensorModelApi、tensorOpenWorksInputs、nanoImageApi、civitaiImageContract、ModelScopeDriver），再加一条 `server.ts` 源码接线断言。**这几家没有做路由级测试。**

| 供应商 | 覆盖项 | 修复前 | 修复后 |
|---|---|---|---|
| Krea / Together / AIMLAPI×2 / Novita / Venice / Krea-ideogram | (a)(b)(c)(d)，原 7 条 | PASS | PASS |
| WaveSpeed krea-v2/turbo-lora | (a) seed、loras[{path,scale}] 都发送，上游请求体等于 actualRequest；(c) steps/cfg 记 sent:false，并标「不会发送」；(e) 1407 原文透传 | PASS | PASS |
| MuAPI | (d) loras、lora_list、lora_url+lora_weight 按端点选字段，2 个 LoRA 配 lora_url 时拒绝；鉴权头 x-api-key | PASS | PASS |
| MuAPI sandbox | (f) 返回 is_test 的 mock 结果不能算 completed | **FAIL**（status=completed，outputs 是 mock URL） | PASS（status=sandbox_mock，outputs 为空，rawResponse 原样保留） |
| Sogni krea-2-turbo | (a) loras 和 loraStrengths 等长，guidance、negativePrompt、seed 都发送；(c) steps 标「不会发送」；(d) 不兼容的模型本地拒绝，缺强度时拒绝 | **FAIL**（z-turbo 挂 LoRA 照发，上游会静默丢弃；缺强度时发 null） | PASS |
| Sogni 欠费 | (e) waiting_for_user + insufficient_credit 原样透传 | PASS | PASS |
| Replicate flux-dev-lora | (a) num_inference_steps、guidance、seed、lora_weights/lora_scale、extra_lora/extra_lora_scale；(c) width/height 不发送；(d) 第 3 个 LoRA 拒绝；路由 402 原文透传，上游请求体等于 actualRequest | **FAIL**（第 3 个 LoRA 被静默丢弃；width/height 照发） | PASS |
| fal | (a) flux-lora 的 steps/cfg/seed 都发送；(c) krea-2/turbo/lora 的 steps/cfg 不发送，并标 unsupported；(d) 第 4 个 LoRA 拒绝，schnell 挂 LoRA 拒绝；(f) 鉴权头是 `Authorization: Key` | **FAIL**（krea-2/turbo/lora 不在 Schema 表里，steps/cfg 照发；LoRA 数量没有上限） | PASS |
| ModelScope | (a) steps、guidance(cfg)、seed、size "WxH"；(d) 0.6/0.4 生成 map，0.6/0.6 拒绝且不归一化；(f) 视频请求本地拒绝 | PASS | PASS |
| HuggingFace | (b) seed/steps/cfg/宽高不标 unsupported；(d) 不走 fal-ai 路由时挂 LoRA 拒绝（源码断言） | PASS | PASS |
| Civitai | (d) flux1 用 map，flux2Dev 用 [{air,strength}]；krea v2 挂 LoRA 或填宽高时拒绝，并标 unsupported | PASS | PASS |
| TAMS | (a) seed 进 inputInitialize，steps/cfgScale/宽高进 diffusion；(d) lora.items[{loraModel,weight}]；宽高不是 64 的倍数时拒绝；(f) 视频本地拒绝 | **FAIL**（数字模型 ID 走视频路径时，会先带 key 请求 /tool/list，没有本地拒绝） | PASS |
| OpenWorks | (c)(d) 工具没声明的 seed/steps/cfg/loras 都不发送，本地拒绝并列出字段 | PASS | PASS |
| NanoGPT | (d) 没声明 loras 时挂 LoRA 拒绝；已声明的 seed 发送；(e) 上游错误原文透传（源码断言） | PASS | PASS |

修复前 5 条 FAIL、16 条 PASS；修复后 21/21 PASS。

## 修复（只改供应商适配器，改动都很小）
1. `schemaProviders.ts`：Sogni LoRA 只允许 `SOGNI_LORA_IMAGE_MODELS`（krea-2-turbo、dark-beast-krea2），来源是协议 schema 里 loras 的描述；同时检查官方 maxItems，强度必须显式给出。MuAPI 的 is_test 结果标 `sandbox_mock`。
2. `SchemaProviderDriver.ts`：`sandbox_mock` 视为终态失败。只改了一个词。
3. `providerSchema.ts`：新增 `fal-ai/krea-2/turbo/lora`，steps/cfg/negative 标 unsupported，loras 上限 3。
4. 新文件 `falImageContract.ts`（`falImageFieldGate`），在 `server.ts` 的 fal 图像路由里使用：Schema 标 unsupported 的字段不发送，并写入 parameter-omissions trace；LoRA 不支持或超过上限时返回本地 400。
5. `replicateImageContract.ts`：两路 LoRA 超出上限时拒绝；官方 Input/Schema 没有 width/height 时不发送，记入 `omitted`。`replicateRoutes.ts` 返回 `parameterOmissions`。
6. `tensorModelApi.ts`：新增 `tamsVideoUnsupported`，`server.ts` 的 tensorart 视频分支在请求网络之前先本地拒绝。
7. 旧测试跟着新行为更新：`replicateImageContract.test.ts` 里 flux-schnell 不再发 width/height；`schemaProviders.test.ts` 里的 Sogni LoRA 用例改用 krea-2-turbo。

## 草案和代码对不上的地方（请 Researchy 核实，这几处没改）
- **NanoGPT**：草案要求 seed/steps/cfg「只在 supported_parameters 里有时才发送，否则标不会发送」。代码 `nanoImageApi.ts`（按 2026-10-05 的审计）是：没声明的字段算「能力未知」，照样发送，并附 capabilityNotes。两边是相反的规则。
- **Civitai flux2Dev**：草案写的字段名是 `numInferenceSteps`/`guidanceScale`，代码发的是 `steps`/`cfgScale`（providerSchema 标的是 unverified，备注写了 sdcpp 和 flux2 是不是同一个 schema 还没核实）。如果草案对，现在 steps/cfg 会被上游静默忽略。
- **Civitai krea v2**：草案说 steps/cfg 不支持。代码 `comfy:krea2` 把 steps/cfg 标成 supported，并且会发送。
- **Civitai flux2 pro/max、flux1-kontext**：构建器里没有这几个生态。kontext 底模会被映射成 `flux1`，挂 LoRA 时会生成 map 发出去，按草案上游会返回 400。本地没有拦截，需要先确认 kontext 的 AIR 生态怎么识别。
- **fal `fal-ai/krea-2/turbo/lora`**：端点 ID 和字段只取自草案，没有重新抓 fal OpenAPI。
- **Replicate flux-schnell**：静态 Schema 标了 negative_prompt 和 cfg 不支持，但构建器没传 schemaProps 时这两个仍会发送。这次只处理了 width/height。
- **ModelScope 路由**：`sampler_name`、`scheduler`、`denoise`、`cfg` 填了就原样发送，草案没有声明这些字段。

## 已有的无关失败
`src/server/mediaHostedReview.test.ts` 有 2 条失败，原因是缺少 `hosting/server.generated` 模块。修改前的快照里同样失败，和这次改动无关。

## 补充：OpenWorks 视频按官方 `outputs[].format` 判定（2026-10-15，替代此前的关键词判定和一刀切拒绝）
- 依据：Researchy 抓取的 `/tool/list` 原始响应 `docs/evidence/openworks-tool-list-2026-10-15.json`（23 个工具），审计记录在 `docs/provider-api-audit/tensorart-openworks.md` 末尾。
- 判定规则（`tensorOpenWorksInputs.ts`）：
  - `isOpenWorksVideoTool(tool)` 为真，当且仅当 `outputs.some(o => o.type==='FILE' && o.format==='video')`。关键词判定（`VIDEO_SLOT`）已删除。
  - 实测命中 8 个视频工具，包括 tags 里没有 "video" 的 live_wallpaper。
- `planOpenWorksVideoTask` 本地拦截的三种情况，拒绝理由都写明工具名和 format，并带「未出站，本地拦截」：
  - 工具不在 `/tool/list` 中；
  - `format=image`，不是视频工具；
  - format 既不是 image 也不是 video（例如 audio 或空值）。
- 参数发送：inputs 没有参数名，`buildTensorArtInputs` 按槽位顺序、根据每个槽的 description 匹配画布字段。Schema 里没有对应槽的字段不发送，标「不会发送」。
  - 用实测数据核对时发现一个 bug：text2video_wan22 的 ratio 槽描述是 "ratio with total pixel number"，因为关键词 `'number'` 被误映射成 count。已把 count 的关键词收窄为 `['count']`。
- `/tool/list` 失败时原样透传：新增 `parseOpenWorksToolList(status, raw)`。非 2xx 或 code≠0 时抛错，错误里带上游 status、upstreamStatus 和 rawResponse（原文），不会返回空列表。`server.ts` 的 `fetchTensorArtToolsList` 改用这个函数；视频分支的 catch 按上游状态码返回，并附 rawResponse 和 errorSource=upstream。用 Researchy 实测到的 HTTP 500 code 13 原文验证过。
- 测试 `OpenWorks video: outputs[].format gate on real /tool/list evidence …`（夹具直接用上面的实测 json）：
  - 筛出的视频工具正好是那 8 个；
  - text2video_wan22 的 inputs 为 [prompt, "5", "16:9-921600"]，seed/steps/cfg/loras 不发送；
  - image2video_wan22 的 inputs 为 [prompt, FILE, "3"]；
  - 未列出的工具、image 工具、audio 工具都被本地拦截；
  - HTTP 500 的上游原文原样保留；
  - 路由接线和关键词代码已删除，用源码断言验证。
- 结果：修复前 **FAIL**（关键词判定把 13 个工具算成视频工具；500 错误没有 status 和 rawResponse），修复后 PASS。CODE_ONLY。
- 已知未处理：image2video_wan27 的 ARRAY 槽 "source image's url and mimeType" 目前只会发 `[url]` 字符串数组，没有按 `{url, mimeType}` 结构组装。属于既有行为，还要另外核实 schema 的形状。
- 无关的新失败：在 02:31 之后，`docs/provider-schema-drafts/aimlapi.json` 被另一个任务给 z-image-turbo-lora 加了 `negative_prompt`，导致 AIMLAPI 契约用例失败（代码的 inputSchema 里还没有这个字段）。AIMLAPI 相关文件归另一个任务，这里没有改动。

## 补充：OpenWorks 输入按 SKILL.md Step 4 组装（2026-10-15 02:40 UTC+8）
- 依据：Researchy 提供的 tensorart-generate SKILL.md Step 4，以及 `openworks-tool-list-2026-10-15.json` 中 image2video_wan27 的第 4 个输入（ARRAY，format json，items 为 `{url, mimeType}`，两项都必填）。
- 修复内容，全部在 `tensorOpenWorksInputs.ts`，通用实现，没有按工具名写死：
  - 按位置输出 `{type, value}`，沿用原有做法。
  - 带 `schema` 的 ARRAY 输入按 `schema.items` 组装：
    - format 为 url 的属性填图片 URL；
    - mimeType 优先取显式的 `image_mime_type`，没有时按 URL 扩展名推断（png、jpg、jpeg、webp、gif）；
    - 其余必填属性必须由调用方在对象里给出，否则本地拦截并列出缺少的属性。例如 oc_garment_template 的 assetId、type、assetUri。
  - `type: FILE` 的输入只填单个 URL 字符串。
  - 必填输入不会用 `""` 或 null 占位：拿不到真实值时本地拦截，理由里带「未出站，本地拦截」。
  - 新增 `openWorksMediaUrlIssue`：带签名或时效参数的 URL（例如 OSSAccessKeyId、Expires、Signature、X-Amz-*、x-oss-*）和 data: URL，都需要先重新上传拿到 displayUrl。现有的 `/api/tensorart/upload` 只是把请求体原样转发，没有已核实的「上传 → displayUrl」流程，所以本地拦截，不做猜测。
- 测试 `OpenWorks inputs per SKILL.md Step 4 …`（用实测 json 当夹具）：
  - image2video_wan27 的第 4 个输入生成 `{"type":"ARRAY","value":[{"url":…,"mimeType":"image/png"}]}`；
  - image2video_wan22 的 FILE 输入是单个 URL 字符串；
  - 推断不出 mimeType、缺少 assetId 等必填项、duration 为空串、签名 URL、data: URL，都被本地拦截。
  - 结果：修复前 **FAIL**（ARRAY 输入发的是 `[url]` 字符串数组，签名 URL 直接发出），修复后 PASS。
- AIMLAPI 用例：tinkabot 修好 aimlapi.json 后，草案里新增了注释键 `_notDeclared`，被测试当成了 Schema 字段。我只改了测试读取草案的方式，忽略以 `_` 开头的键，没有改 AIMLAPI 代码。改完后通过。
- 结果：契约测试 23/23。全量测试 958/960，失败的 2 条是 mediaHostedReview，修改前就存在。CODE_ONLY。
- 需要核实的点：
  - mimeType 按扩展名推断是不是可以接受；
  - 签名参数名单是启发式的。代码目前无法确认一个 URL 是不是来自上一个任务的输出，只能按 URL 里的签名参数判断。

## 更正：删除两条供应商特化规则（2026-10-15 02:36 UTC+8）
- 起因：Researchy 确认这两条规则都没有官方依据；雁要求画布不带供应商特化规则。
- 删除了 `tensorOpenWorksInputs.ts` 里的：
  1. 按 URL 扩展名推断 mimeType（`MIME_BY_EXT`、`image_mime_type`）。
  2. 签名 URL 检测和 data: URL 拦截（`openWorksMediaUrlIssue`、`SIGNED_QUERY`）。
- 保留的通用规则：
  - 按位置输出 `{type, value}`；
  - 按 `schema.items` 组装输入，url 属性取给定的 URL，原样传递；
  - 其余必填属性（包括 mimeType）必须由调用方显式给出，例如 `image_url: [{url, mimeType}]`。缺少时本地拦截，理由带「未出站，本地拦截」，不会用空串或 null 占位。
- 测试：
  - image2video_wan27 显式提供 mimeType 时，按 items 生成输入；只给 URL 字符串时本地拦截。
  - 签名 URL 和 data: URL 原样传递。
  - 用源码断言确认两条规则已删除。
- 结果：
  - 修改前：契约测试 23/23（旧行为）。新期望放在旧代码上必然失败，因为旧代码会推断 mimeType，并拦截签名 URL。
  - 修改后：契约测试 23/23。
  - 全量测试 958/963。新增的 3 条失败在 `apiFailure.test.ts` 和 `ExecutionLog.summary.test.ts`，这两个文件 02:36 正被另一个任务编辑，与本改动无关；另外 2 条是 mediaHostedReview，修改前就存在。
- 状态：CODE_ONLY。
