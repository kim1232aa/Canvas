# T7 SenseNova 旧图像路由验收报告 — 历史 FAIL_INTEGRATION
> **时序说明（2026-10-08）**：以上 HTTP 501 是旧 `sensenova-6.8-flash-lite` 图像路由尚未接入时的前端记录。后续同日已经新增独立的 `sensenova-u1.5-lite` 文生图/编辑路由，见 [SenseNova U1.5 Lite 接线审计](t7-sensenova-u1-5-integration.md)。因此旧 HTTP 501 **不能代表新 U1.5 Lite 当前实现状态**。新路由仍未拿到真实上游终态，不得将代码集成等同 PASS_GENERATION/PASS_BILLING。


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
