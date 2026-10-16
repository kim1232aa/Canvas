# WaveSpeed Krea 尺寸族 + Together serverless LoRA 本地拦截 · 2026-10-15 · CODE_ONLY

状态：CODE_ONLY（单测 + tsc），未做前端 E2E，未出图。不得写 PASS。

## 先检索（live）
- WaveSpeed 目录 `GET https://api.wavespeed.ai/api/v3/models` HTTP 200（项目自有 key，未打印），1063 行；原文存档 `/workspace/audit-v2-raw/ws_models_live_*.json`。
  - `wavespeed-ai/krea-v2/turbo-lora`：aspect_ratio enum(15 项, 默认 1:1)、resolution enum [1k,2k]（默认 1k）、loras maxItems 3 items{path, scale 0~4 默认 1}、seed、strength 0~1、image；**无** size/steps/guidance_scale/output_format。`krea-v2/turbo` 同族无 loras。
  - `z-image/turbo-lora`、`z-image/turbo`、`flux-dev-lora`：size string 默认 "1024*1024"、min 256 max 1536；output_format enum [jpeg,png,webp]；**无** aspect_ratio/resolution。
  - 与 Researchy `docs/evidence/researchy-claim-wavespeed-size-together-lora-2026-10-15.md` 一致。
- Together `https://docs.together.ai/docs/inference/images/parameters.md` 第 430 行原文（live 复取）：「`image_loras`: No longer available. The FLUX models that accepted LoRA adapters have been deprecated, and the current FLUX.2 models reject this parameter. To serve a LoRA-adapted image model, use a dedicated endpoint.」

## 根因
1. Krea 的 aspect_ratio/resolution 在画布上**没有任何控件**：通用 Schema 面板 `SchemaChoiceControls` 把 CANVAS_TO_SCHEMA_ALIASES 里的字段一律当「已有画布控件」跳过，而 aspect_ratio/resolution 的画布控件只给 grok_compat/huggingface/nanogpt 渲染。值从未被填 → 之前 actualRequest 只有 prompt/seed/strength。服务端本来就按 Schema 透传，不是服务端丢字段。
2. size 族：服务端只认 width/height 或 image_size{width,height}；WaveSpeed 的 `size:"W*H"` 字符串无映射 → width/height 被标未发送，size 从未发送。驱动也不转发 extra.size。
3. Together：拦截写成 `provider==='together'` 分支 + 文案为意译，非官方原文、无 URL。

## 改动（通用、Schema 驱动，无模型名分支）
- `src/components/SchemaChoiceControls.tsx`（仅改 1 行 CANVAS_MAPPED 过滤）：aspect_ratio/aspectRatio/resolution 不再被视为画布已占用，Schema 声明 enum 时面板出下拉；值写 custom_parameters，服务端原样发送，徽章「会发送 X」与 actualRequest 同源。
- `src/server/schemaProviders.ts`：
  - `sizeStringSeparator(spec)`：Schema `size` 为非 enum string 且默认值形如 `W<sep>H` 时取分隔符（WaveSpeed 为 `*`）；Schema 无 width/height 时把画布 width+height 拼为 `size`，mapping 记 `width+height → size`。只填其一 → 本地 400 不补值。用户显式 size 优先。
  - submit 字段循环增加 `size`；未声明 → 原有 sent:false「该端点不支持」路径。
  - `schemaConstraintViolation`：`W<sep>H` 字符串按单边校验 minimum/maximum（256~1536），越界本地拒，不夹值。
  - 通用 LoRA 分支按 Schema `maxItems` 本地拒（Krea turbo-lora ≤3）。
  - Together：供应商表新增 `loraLocalBlock{docUrl, docQuote}` 数据；submit 入口按表数据拦截（在目录/OpenAPI 请求之前，零出站），错误文案引用官方原文 + URL，`blockedField{field:'loras',source}`；经 server.ts 现有中间件落 history `local_blocked`。删除旧 `provider==='together'` 两处分支。
- `src/engines/drivers/SchemaProviderDriver.ts`：转发 `size: extra.size`。
- `src/utils/schemaSendHint.ts`：width/height 别名加 `size`，新增 `size` 候选 → z-image/flux-dev-lora 上 width/height 不再误标「该端点不支持」；Krea 上 width/height/output_format 标「该端点不支持」。
- 新增测试 `src/server/wavespeedKreaTogetherLora.test.ts`（14 例）+ fixture `src/server/__fixtures__wavespeed-live-2026-10-15.json`（live 目录 3 行 request_schema 截取，无密钥）。

## 结果
- vitest：1111/1113（2 失败为已知 `mediaHostedReview` 缺 hosting 生成文件）；新增 14/14 通过。
- tsc：仅 3 个已知 hosting/*.generated 错误。
- 未改 server.ts / CivitaiModal / ExecutionLog / history 组件。

## 备份
`/workspace/canvas-restore/pre-wavespeed-together-20261015-050808.tgz`（不含 node_modules/.git/.env）

## 待画布前端 E2E（新会话，后端需重启）
1. WaveSpeed → `wavespeed-ai/krea-v2/turbo-lora`；参数面板「官方 Schema 字段」应出现 aspect_ratio、resolution 下拉；选 16:9 + 2k，徽章「会发送 16:9」「会发送 2k」。
2. 挂 1 个 LoRA，scale 例如 0.8；宽高/steps/cfg/output_format 应标「该端点不支持」。
3. 运行：actualRequest 应含 aspect_ratio、resolution:"2k"、loras:[{path,scale:0.8}]，不含 size/width/height/steps/guidance_scale/output_format；有额度须出图（PASS_GENERATION 标准），history「实际发送」一致。
4. 加挑：换 `z-image/turbo-lora` 宽高 768×1344 → actualRequest `size:"768*1344"`，aspect_ratio/resolution 为「该端点不支持」。
5. Together：任一图像模型挂 LoRA 运行 → 未出站本地拦截，文案含官方原文与 URL，执行记录无上游请求，history 为 local_blocked。
