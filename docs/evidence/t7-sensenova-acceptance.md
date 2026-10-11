# T7 SenseNova 验收与接线记录 — 按时间与路由范围保留

本文并列保留冲突两侧记录，不新增或提高验收等级。2026-10-08 旧 `sensenova-6.8-flash-lite` 图像路由的 FAIL_INTEGRATION / HTTP 501 仅适用于当时旧路由；后文 2026-10-09、2026-10-10 的 U1.5 Lite 结果仅适用于各自明确样本。2026-10-12 官方契约续审及接线问题记录不新增生成验收，其中“需串行修复”是待修建议，不是已完成修复或上游生成成功的证明。

## 2026-10-08 旧图像路由验收报告 — 历史 FAIL_INTEGRATION

> **时序说明（2026-10-08）**：下文 HTTP 501 是旧 `sensenova-6.8-flash-lite` 图像路由尚未接入时的前端记录。后续同日已经新增独立的 `sensenova-u1.5-lite` 文生图/编辑路由，见 [SenseNova U1.5 Lite 接线审计](t7-sensenova-u1-5-integration.md)。因此旧 HTTP 501 **不能代表新 U1.5 Lite 当前实现状态**。新路由仍未拿到真实上游终态，不得将代码集成等同 PASS_GENERATION/PASS_BILLING。


日期：2026-10-08。验收方式：真实本地前端 + 官方文档复核。

## 结论

**FAIL_INTEGRATION（图像路由）**。当前 Canvas 的 SenseNova 驱动只声明 `reasoning`，从 KSampler 选择 SenseNova 后点击真实网页“运行工作流”，客户端直接返回：

`当前 Canvas 驱动 [SenseNova (商汤日日新)] 尚未接入 [text2img] 能力。当前驱动已接入: [reasoning]。`

没有生成请求到达 SenseNova 上游，因此不能记 PASS_BILLING / PASS_GENERATION / BLOCKED_AUTH。

## 为什么这是集成缺口，而不是“官方不支持生图”

2026-10-08 重新检索 SenseNova 官方站点后，旧代码里的“SenseNova 是文本推理平台 / 不提供生图”已经过时：

- 官方模型页：https://www.sensenova.cn/models
  - `SenseNova U1.5 Lite` 被官方描述为“生成与编辑一体模型”，支持图片创作与修改。
- 官方开放平台：https://platform.sensenova.cn/product
  - 当前产品能力明确列出“文生图模型 SenseNova V6.5 Miaohua”。
- 官方开放平台文档中心：https://platform.sensenova.cn/product/APIService/document
  - 文档中心导航明确包含“文生图模型 SenseNova V6.5 Miaohua”。

本轮没有找到足够完整、可直接编码的当前图像 OpenAPI 请求地址 + 请求字段 + 异步/同步返回 Schema，因此没有猜 endpoint，也没有拿 chat-completions 冒充生图接口。

## 本轮前端样本

- Provider：`sensenova`
- 自定义模型输入：`sensenova-6.8-flash-lite`
- Prompt：`A biomechanical koi pond inside a brutalist museum atrium, mirrored black water, copper fins, skylight reflections, architectural photography, restrained monochrome palette`
- 前端结果：在客户端能力检查阶段被明确阻止，执行记录没有新增 SenseNova 上游请求。
- 没有自动改用 Gemini / Agnes / Fal / ModelScope / 其他 provider。

## 已修正的错误表达

代码不再宣称“SenseNova 官方平台不支持生图”。当前语义改为：

- SenseNova 官方平台**存在图像生成/编辑模型**；
- 当前 Canvas **尚未核实并接入 SenseNova 图像 OpenAPI Schema**；
- 在官方图像 endpoint 与字段未核实前，SenseNova 生图路由明确返回“未接入”，禁止自动换供应商。

## 下一步验收条件

1. 从 SenseNova / SenseCore 官方文档取得当前文生图 endpoint、模型 ID、鉴权方式、请求字段与结果解析契约。
2. 用动态 Schema 接入，不把旧 chat API 字段硬套到图像 API。
3. 配置真实 SenseNova 图像服务凭据后，从前端换新的独立参考样本执行。
4. 只有真实图片返回并完成历史/参数/持久化闭环才可记 PASS_GENERATION；若上游明确欠费才可记 PASS_BILLING。


## 2026-10-08 后续前端复验：本地 HTTP 501

修正原先“客户端未发送”的验收层级：后续实际从 Canvas 选中 KSampler 并点击运行，执行记录出现 **HTTP 501 · POST /api/engine/sensenova/generate**。请求包含不同于其他供应商的 Prompt：`A biomechanical koi pond inside a brutalist museum atrium, mirrored black water, copper fins, skylight reflections, architectural photography, restrained monochrome palette`，模型为 `sensenova-6.8-flash-lite`，尺寸为 `1024×1024`。Negative Prompt / Seed / Steps / CFG 被逐项记在 parameterOmissions 中，明确没有发送给该未实现的图像端点。

响应体明确：

`integrationStatus: "not_implemented"`、`errorSource: "local"`、`executionTrace: []`。

错误说明 SenseNova 官方有图像生成/编辑能力，但当前 Canvas 未核实和接入图像 OpenAPI Schema；**没有上游图像调用，也没有自动改用 FLUX/Agnes/Gemini**。因此图像路由继续是 **FAIL_INTEGRATION / NOT_IMPLEMENTED**，不是 PASS_BILLING，也不是 SenseNova 官方不支持生图。后续需要官方图像端点与鉴权/参数契约，再完成真正的前端上游验收。

## SenseNova U1.5 Lite 后续验收与 2026-10-12 接线续审

以下保留 U1.5 Lite 后续生成与编辑成功的精确样本、尺寸契约分歧，以及 2026-10-12 接线问题和待修记录；不将旧路由失败外推到新路由，也不将后续样本成功外推到尚未验收的能力。

## 2026-10-12 官方契约续审（不新增生成验收）

继承的是 agent-113 成功 FetchURL 的官方正文，不是本地验收文档的断言：已读取其落盘完整正文的571–775（图像）、399–530（chat）、2427–2508（目录）行，并核对 wire 中对应成功返回。agent-113 实际38次工具调用没有Edit/Write，仅下载临时官方资料；被取消前没有最终报告。本轮没有使用密钥、调用生成/上传API、重启或改生产代码。

### 官方 URL、原文与当前契约

- [SenseNova API docs](https://platform.sensenova.cn/docs) 原文 `POST https://token.sensenova.cn/v1/images/generations`、`POST https://token.sensenova.cn/v1/images/edits`；编辑 `images` 为图片对象数组、`至多支持5张参考图`；示例 `images:[{image_url:"data:image/png;base64,..."}]`。`senseNovaImageContract.ts:75–77` 单image_url映射与 `server.ts:5045–5061` Bearer、b64_json/url解析匹配；没有异步轮询。官方返回临时URL24小时，当前服务端持久化路径符合避免临时URL历史失效的方向。
- 同页默认 `prompt_extend=true`、`watermark=true`，n仅1；输出生成png/jpeg/webp，编辑额外列jpg。当前 builder 默认省略两个boolean，没有再次强制false；显式值透传。官方2K/4K表述与下方旧上游400的分歧保持，不做隐式尺寸转换。本轮未重发请求，旧上游结果不是本轮fresh验证。
- 同页 chat 原文 `thinking: enabled/disabled`、`reasoning_effort: low/medium/high/max/none`，返回 `message.reasoning`；`server.ts:5004–5024` 端点、Bearer和reasoning字段匹配。工具调用、top_p、stream等官方字段本地未完整接入；chat没有真实调用验收。
- 同页模型目录原文 `GET https://token.sensenova.cn/v1/models`、`Authorization: Bearer ...`、返回含 `data`，模型字段包括 `input_modalities/output_modalities` 与 `supported_features`。因此“官方仅有生成/对话、无只读探针”的代码结论错误；本轮没有拿真实key调用目录，不声明账户模型可用。
- 旧agent成功读取 [商汤U1.5发布页](https://www.sensetime.com/cn/news/sensenova-u1-5-lite-token-plan-20260911-1741) 的结果正文说明模型ID、base URL、Bearer、生成/编辑一体；不能以宣传4K代替对2K/4K字面API值的实测接受性。

### 需串行修复（当前工作树为基准）

1. **HIGH，非空LoRA被静默降成底模请求**：`SenseNovaDriver.ts:33–50` 只把loras记omissions，未发送也未阻止；服务端虽有 `senseNovaImageContract.ts:31–36` 非空字段检查，却收不到。进程内明确假fetch诊断证实请求只含parameterOmissions。建议保留非空意图，不允许图像成功伪称LoRA执行；未核实字段不能被描述为官方明确不支持，选择匹配关闭后送上游取得事实或公开说明本地未接入并阻止静默降级。
2. **HIGH，多图/手写JSON路由错误**：Driver `extra.custom_parameters` 未携带；builder `:38–40,75–77` 仅取image_url，忽略官方images。本地实测传 `images:[a,b]` 返回 `/images/generations` 且两图丢失。建议规范化单图与images最多5输入、逐项保留，依据明确参考图选edits，记录冲突与覆盖；未知字段不能静默滤掉。`server.ts:2365` 的“自定义JSON原样提交”及ModelScope来源同时需纠正。
3. **MEDIUM，chat maxTokens漏接**：`BaseEngineDriver.ts:102` 与Driver发送 `maxTokens`，`server.ts:4999,5008` 仅读max_tokens并默认2048，用户设置如123丢失。建议在Driver显式映射maxTokens→max_tokens并让服务端兼容旧键/拒绝冲突；thinking/reasoning_effort等建立公开字段透传，别暗改模型。官方范围max_tokens为1–65536。
4. **MEDIUM，目录/只读鉴权漏接**：`server.ts:3519–3529` 只返回静态U1.5单项，`server.ts:7126–7128` 宣称无只读端点，与官方GET /models冲突。建议按显式base URL/Bearer读取官方目录、保留HTTP原文并映射模态；不失败填静态项冒充远端。静态参考若保留必须标明不是全量实时目录。
5. **MEDIUM，编辑jpg被错误gate**：`senseNovaImageContract.ts:58–59` png/jpeg/webp统一白名单阻断官方编辑jpg（本地实测已复现）。建议按所选endpoint验证jpg并在 `server.ts:5060` 正确用JPEG MIME；官方生成页只列jpeg，不能外推生成也允许jpg。
6. **MEDIUM，图像Base URL与错误分类**：`SenseNovaDriver.ts:31` 不像chat分支读取 keys.sensenovaBaseUrl；浏览器显式保存的地址可能不随请求生效。建议对齐其chat的有效URL/头逻辑，不换目标。`server.ts:5091` 全部catch都叫network，已有HTTP后JSON协议失败应保留真实status、raw body并标upstream-protocol，不能当无HTTP网络错。

当前 `NodeItem.tsx:392–395` 和 `ParameterInspector.tsx:449–451` 已有size、watermark、prompt_extend控件及2K/4K告警，旧“缺入口/正在修复”仅是历史状态。源码与现有SenseNovaUI测试证明本地控件接线，不等于网页fresh上游复验；空间复用/云恢复仍待验。

本轮验证：定向现有6 files /57 tests PASS，Vite `__dirname`警告保留；node --import tsx 本地builder诊断复现images丢失与编辑jpg拒绝；进程内假fetch复现LoRA只记omissions、custom JSON丢失、chat发送maxTokens。无真实HTTP生成；不重记PASS_GENERATION/PASS_BILLING。未运行完整build/lint，不把定向测试代替用户前端验收。

## 2026-10-10 当前前端复验（优先于后文历史结论）

本地 `127.0.0.1:3000`、独立无头 Chrome 151（CDP 9411），经网页运行按钮提交。

- **S1 大图编辑：`PASS_GENERATION`（精确样本）**。参考 PNG 1500×1500、1,553,629 bytes，先经本站媒体接口保存为 `/api/media/040bf04d2bacedcda93f5013f3cfcee4fa60f7ad98b46f3040cb5492e4521dd9`；网页提交 `image_url`，服务端解析为 Data URL 后调用 `https://token.sensenova.cn/v1/images/edits`。`model=sensenova-u1.5-lite`、prompt=`把图中人物的夹克改成红色，其它保持不变`、`size=auto`、`n=1`、PNG/b64_json、`watermark=true`；没有显式发送 prompt_extend，也没有 Seed/Steps/CFG。上游 HTTP 200，约 23.3s，输出 PNG 2048×2048，历史 ID `hist_1791561635419_hcrr1`，媒体 hash `a94c6d8df261c022360b5d5e8e3c77b68082e00425ecaab3c24f1ca57d11c4f1`。对比图 `temp/sensenova/compare-edit.jpg` 显示夹克变红，人物、围巾、背景与构图基本保持。输入在本站为短 URL，实际上游包含 >1MB 参考图，没有 413。
- **文生图：`PASS_GENERATION`（精确样本）**。网页改成无参考图分支，prompt=`一只橘猫趴在窗台上晒太阳，写实摄影风格，柔和的自然光`，`size=auto`，调用 `/v1/images/generations` HTTP 200，PNG 2048×1536；媒体 hash `8343a2dfbf96fffa25fe6ed0fc860feef72daf684331ab43f72da3f58373affe`，实际图片 `temp/sensenova/cat-t2i.jpg` 与描述相符。
- **尺寸分歧，不能声称“2K 已修好”**：[官方 API 文档](https://platform.sensenova.cn/docs) 的生成/编辑参数表（本轮 FetchURL 原文）及[商汤官方发布页](https://www.sensetime.com/cn/news/sensenova-u1-5-lite-token-plan-20260911-1741)写 `2K / 4K` 常量，但网页编辑 `size="2K"` 实际 HTTP 400，原文 `invalid size, should be auto or WIDTHxHEIGHT`，并明确 512–4096、32 倍数、比例≤3:1。用户授权后进行本站端口诊断：编辑 `2K`、生成 `2K` 和生成 `4K` 均上游 400；生成 `2048x2048` HTTP 200。端口诊断不替代前端验收，不把 4K 真实出图记为通过，也不把显式 2K 静默改成方图。
- **纠正“SenseNova 预设”的归因**：仓库没有 U1.5 图像预设写死 `size=2K`；本次先载入 Agnes 图生图模板再从 UI 切换 provider，旧 `size=2K` 被保留且没有可见的 SenseNova size 控件，造成跨供应商残留。不能为此擅改 Agnes 本来合法的 2K 预设。该参数可见性/编辑缺口待修。
- `prompt_extend=false` 不是用户要求；本次未发送该字段，遵循官方默认，显式值仍须原样保存。历史强制 false 请求事实不改写。
- 尚未逐项验证：刷新后历史详情/复用、云项目恢复、空间编辑、多参考图（官方至多 5 张，本站当前以单图入口为主）、显式 watermark/prompt_extend UI、其余尺寸。前端生成成功不等于历史 Civitai LoRA 作品复现成功。

## 以下为历史记录（原层级保留）

日期：2026-10-09。验收方式：配置有效 SenseNova Key 后，走已重启的 Canvas 本地路由 `POST /api/engine/sensenova/generate`，由服务端打到商汤官方图像接口。不是浏览器点击工作流。

## 结论

**生图链路 PASS_GENERATION。与 Civitai 参考原图的复现对照不通过，记 FAIL_REFERENCE_MATCH。**

`sensenova-u1.5-lite` 已真实调用 `https://token.sensenova.cn/v1/images/generations`，HTTP 200，返回并持久化为 PNG。关于 `prompt_extend`：此前记录曾误将未配置的 `prompt_extend` 硬编码为 `false`，经查阅 SenseNova 官方文档与开源规范，该参数为指示大模型自动扩写/优化提示词的可选字段，官方默认推荐为 `true`，用户亦未要求强制关闭；现已修正代码与文档，未配置时不硬编码发送 false（遵循官方默认行为），显式传入 boolean 时如实透传。官方未声明的 Seed、Steps、CFG、Sampler、Scheduler、LoRA 没有发送。

不能把“出了图”写成参考复现通过。参考原图是带两枚 LoRA 的 stickman 角色；SenseNova 官方图像接口不接收这些 LoRA 和 Seed。去掉 LoRA token 后，只保留公开 prompt 的可发送部分，生成结果是另一个卡通人物。

## 参考样本

来源：https://civitai.com/images/145082165 （作者 Sarvanar，公开 generation data）

参考图：`https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/da7b154c-16c1-45e0-bc2d-900d3d10ff42/width=450/da7b154c-16c1-45e0-bc2d-900d3d10ff42.jpeg`（450×800 JPEG）

公开参数：

- prompt：`<lora:ChamIllustriousBackgroundEnhancer:1> <lora:YBFPeter:1> (YBFPeter, 1boy, solo, stickman, hood, hoodie, shirt, bald, vest, smile, teeth, blue eyes, black pants, colored skin), looking at viewer, crossed arms, BREAK night, alleyway`
- negativePrompt：`bad quality, worst quality, signature, watermark, artifacts, english text, text, multiple limbs, bad anatomy, 2boys, picture frame, twins, twitter username`
- steps：80
- cfgScale：8
- sampler：`Euler a`
- seed：1105064803
- 尺寸：720×1280

未发送、也不能编造的字段：LoRA 权重、negativePrompt、steps、cfg、sampler、seed。SenseNova U1.5 Lite 官方只声明 prompt、n、size、output_format、watermark、prompt_extend、response_format，以及编辑接口的 images。

## 实际请求

本地路由：`POST http://127.0.0.1:3000/api/engine/sensenova/generate`

上游：`https://token.sensenova.cn/v1/images/generations`，HTTP 200。

实际 payload：

```json
{
  "model": "sensenova-u1.5-lite",
  "prompt": "(1boy, solo, stickman, hood, hoodie, shirt, bald, vest, smile, teeth, blue eyes, black pants, colored skin), looking at viewer, crossed arms, night alleyway",
  "size": "768x1280",
  "n": 1,
  "output_format": "png",
  "response_format": "b64_json",
  "watermark": true,
  "prompt_extend": false
}
```

结果：768×1280 PNG，1,254,609 字节，已写入 Canvas history，url 为 `data:image/png;base64,...`。PNG 头 `\x89PNG` 校验通过。

同轮还确认：带 `steps=20` 的请求在本地返回 HTTP 400，`errorSource=local`，`executionTrace=[]`，没有打上游。

## 视觉对照

参考原图：灰色圆头 stickman，光头，蓝眼睛，青绿色 T 恤加白色心形，黑背心，黑裤，抱臂，夜巷，平涂卡通。

SenseNova 结果：抱臂、微笑、蓝眼睛、夜巷、黑背心、黑裤这些大构图在。但头不是圆头 stickman，是粉色写实卡通人脸，戴帽子，黄绿衣服，没有白心。右下角有商汤水印（`watermark=true` 的默认值，本次未改）。

主体身份、服装和 LoRA 角色特征不一致。缺 Seed 与 LoRA 时，这是预期偏差，不是“HTTP 200 即复现通过”。

## 边界

- 本次证明图像路由、官方 endpoint、prompt_extend=false、b64 持久化和不支持字段拦截。
- 不证明前端工作流点击、参考图编辑 `/images/edits`、或与 Civitai 原图一致。
- 参考图编辑本轮用 1024 PNG data URL 打本地路由时被 Express 1mb JSON 限制返回 413；`/api/engine/sensenova/generate` 不在 50mb 大包路由名单里。这是接线缺口，本轮没有把它修掉后冒充编辑验收。


## 2026-10-09 接线修复后前端复验

记录时间：2026-10-09 13:25 北京时间（CST）。仓库 HEAD `d75d1d4`，工作区有未提交改动。环境：本地 127.0.0.1:3000，画布「验收-接线-2」。

### S1 SenseNova 大图编辑 — BLOCKED_UI

- 结论：BLOCKED_UI。未执行，未生成 >1MB 参考图，未打上游。
- 原因：S1 需要经 LoadImage 上传大于 1MB 的参考图，与 F1 同一卡点：页面 Load Image 节点只有 URL 文本框，没有本地文件上传控件。
- 未发送任何 SenseNova 请求。
- 2026-10-08T22:08:38Z 曾有一次本地拦截探针（假 key、返回 599），仅用于核对请求体，不计入上游结果；对应的 5 条假记录已于 2026-10-09 从 logs/upstream.log 删除。
- 后续需做：用 Python 生成 /tmp/canvas-acceptance-2026-10-09/big.png（>1,048,576 字节）经 LoadImage 上传，模型 `sensenova-u1.5-lite` 真实提交 1 次，核对是否仍被 Express 413 拦截，以及上游 `https://token.sensenova.cn/v1/images/edits` 的原文。

### 未验证阶段

本轮 SenseNova 所有阶段（编辑路由、大图、历史、刷新）均未验证。此处“本轮”仅指 2026-10-09 13:25 前端复验，不覆盖前文 2026-10-10 精确样本的生成与编辑结果，也不改变 2026-10-12 续审未新增生成验收的边界。
