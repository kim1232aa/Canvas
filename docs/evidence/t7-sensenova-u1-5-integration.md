# T7 SenseNova U1.5 Lite 接线审计（2026-10-08）

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