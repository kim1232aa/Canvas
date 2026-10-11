# T7 SenseNova U1.5 Lite 接线审计（2026-10-08）

后续记录按日期并列：2026-10-10 的生成与媒体证据限于本地精确链路；2026-10-12 的代码复核不新增生成验收，也不证明历史资产全量迁移。下方 2026-10-08 的实现与未获终态结论仅代表当时范围。

## 2026-10-12 当前代码复核（无生产代码修改）

- 完整官方契约与优先修复列表见 [验收报告续审](t7-sensenova-acceptance.md)。继承并实际阅读agent-113成功FetchURL的 [官方docs](https://platform.sensenova.cn/docs) 正文：图像生成/编辑、5参考图、chat思考控制与message.reasoning、GET /v1/models均有明确契约；旧“只有文本/无只读目录”不得再使用。
- 当前代码确认已有SenseNova size、watermark、prompt_extend控件（NodeItem.tsx:392–395；ParameterInspector.tsx:449–451），不是仍缺入口。定向现有测试6 files/57 tests通过，但没有fresh网页上游生成，控制项真实生效未验。
- 当前缺口未修：Driver非空LoRA仅放omissions导致底模请求继续；图像手写custom_parameters丢失；官方images数组被忽略并误走generations；编辑jpg被白名单拒绝；chat maxTokens→max_tokens未接，思考控制未透传；/api/models只给单项参考且只读鉴权代码错误宣称无GET/models；图像Driver未读取keys.sensenovaBaseUrl。不得称全量契约接通。
- 旧媒体证据只证明精确新请求，不证明工作区旧base64/资产记录全量迁移完成。保留旧请求响应、参数与媒体档案，不删除或迁移本组范围外数据。
- 本次只改三份供应商独占证据文档，未生成/上传、未改配置/服务/生产代码，历史生成等级不升级。

## 2026-10-10 当前修正

- 真实前端已用 U1.5 Lite 完成文生图和大于1MB参考图编辑；精确输入/请求/产物见 [验收记录](t7-sensenova-acceptance.md) 顶部。旧“未获得终态”只代表10-08当时状态，不再是当前结论。
- [官方 API 参数表](https://platform.sensenova.cn/docs)写2K/4K常量，但本次真实上游的生成/编辑2K与生成4K均400 `invalid size, should be auto or WIDTHxHEIGHT`；auto前端200，2048x2048诊断200。保留分歧，不将显式2K自动换2048x2048，也不让未核实阻止取得上游原文。
- 未配置 prompt_extend 时当前代码省略，按官方默认 true；用户没有要求默认 false。下方旧“默认关闭”是当时实现记录，不得据此重新硬编码 false。
- 没有U1.5图像预设写2K。Agnes模板切供应商后旧size残留、SenseNova缺可见size编辑入口是UI缺口，正在修复；不是修改Agnes合法预设的理由。
- 新媒体存储使用 `/api/media/<sha256>`，历史/输出不再以base64内联；输入调用前恢复。云部署未发布，本次只证明本地精确链路。

## 以下为2026-10-08历史审计

## 发现

2026-10-08 通过商汤官方发布资料确认：当前商汤日日新并非“只有文本推理”，`sensenova-u1.5-lite` 已开放文生图和参考图编辑功能。

官方来源： https://www.sensetime.com/cn/news/sensenova-u1-5-lite-token-plan-20260911-1741

官方接口与能力：
- Base URL：`https://token.sensenova.cn/v1`
- 文生图：`POST /images/generations`
- 图像编辑：`POST /images/edits`，JSON `images:[{image_url}]`
- `model=sensenova-u1.5-lite`
- `prompt`、`n=1`、`size=auto/2K/4K/512–4096 宽x高`、`output_format=png/jpeg/webp`、`watermark`、`prompt_extend`、`response_format=url/b64_json`
- 官方支持 32 倍数、最大长宽比 3:1；image URLs 为临时链接，所以服务端优先请求 b64_json 并对 URL 回应持久化。
- 没有官方文档支持 U1.5 Lite 的负面词、LoRA、Seed、Steps、CFG、Sampler、Scheduler，不能自行编造。

## 当前实现（代码侧）

- 模型中心新增官方已公开的单项图像模型，不冒充实时全量目录。
- `SenseNovaDriver` 新增 text2img/img2img 路由，保留原有 6.8 chat/reasoning。
- 服务端 `/api/engine/sensenova/generate` 根据文生图/编辑分开打向真实原生上游，不借用或回退到其他供应商。
- 拒绝未声明的扩散字段；Driver 对画布保留但没有发送的字段逐项写 `parameterOmissions`。
- 报错区分本地校验、上游 HTTP、生成成功但图片持久化失败等来源；只有真正拿到并持久化图片才写入历史。
- Prompt 自动扩写默认关闭（`prompt_extend=false`），不擅自改用户 Prompt。
- `src/server/senseNovaImageContract.test.ts` 覆盖生成、编辑、URL、不支持字段、图片尺寸、批量数、回环参考图。

## 当前实测及边界

- `http://127.0.0.1:3100/api/models?provider=sensenova&category=checkpoint` 已显示 `sensenova-u1.5-lite`。
- 本地服务器对含 `steps=20` 的直接请求返回 HTTP 400，原文说明 SenseNova 未声明该字段，并且 `executionTrace:[]`，没有转发上游。
- 全量本地回归：41 个测试文件、300 个测试全部通过；`npm run lint` 和 `npm run build` 已通过。
- **本轮尚未从新图像路由拿到真实上游终态，不能标记 PASS_GENERATION / PASS_BILLING。** 尚未完成图像成品与 hinablue 参考原图的视觉对照。不可将代码接入、静态目录或本地 400 当作供应商前端验收通过。

## 下一步验收

在配置有效的 SenseNova API Key 后，使用一套与其他 provider 不同的公开参考作品参数，选择 `sensenova-u1.5-lite`，通过 Canvas 前端提交；检查真实上游 endpoint、实际 payload、真实生成图片及持久化、prompt_extend 实际值、与参考原图视觉对比。明确上游欠费可记 PASS_BILLING，鉴权失败记 BLOCKED_AUTH，缺本地 Key 只记 BLOCKED_CONFIG。

上述欠费结论仅表示到达计费边界，不代表生成成功；只有取得并持久化真实图片，才可作为生成成功证据。
