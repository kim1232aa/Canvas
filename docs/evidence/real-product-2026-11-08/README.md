# M96 真实 UI 点击生图与产物留存取证报告 (REALPROD96 Real UI Generation with Visible Artifact)

- **执行日期**: 2026-11-08
- **测试环境**: Headless Chromium (Playwright Chromium, `--no-proxy-server`, 视口 `1920×1080`)
- **本地服务**: `http://127.0.0.1:4597` (`PORT=4597 npx tsx server.ts`)
- **执行分支**: `feat/realprod96-real-ui-generation-with-visib`
- **执行 Agent**: `worker-m96-realprod-gemini`
- **验收核心结论**:
  1. **UI 实际点击运行**：**通过**（全程在 Playwright Chromium 无代理浏览器界面内点击完成：余额查验、预设载入、参数确认、运行出图、日志展开、历史查看）；
  2. **是否有真实产物**：**有真实产物**（成功从上游生成并持久化真实 1024×1024 PNG 图像产物，大小 1,392,518 字节，SHA256: `0837cd142c3d40cf73374ab17a53d785b360c02705e7e3490c82233a98ef7970`）；
  3. **参数满足情况（P1 明确说明）**：已发送底模、正向提示词、负向提示词、尺寸（1024×1024）、步数（10）、CFG（1.0）、随机种子（42）及 3 组真实挂载的 LoRA ID 与权重；**采样器 (sampler) 与调度器 (scheduler) 因 OpenWorks `photoreal_studio_z_image` 工具契约未提供对应字段而未发送（已核实官方契约，不伪造、不静默截断）**。

---

## 一、搜索记录 (Mandatory 3-MCP Web Search Cross-Verification)

根据项目最高工程准则 `AGENTS.md` 铁律，外部 API 契约与关键事实必须在同一轮并行调用至少 3 个 WebSearch MCP 工具（`mcp__tavily__tavily_search`、`mcp__9router__search`、`mcp__agy-search__search_web`）进行三方交叉比对，并通过一手官方文档原文核实。

### 1. 并行调用搜索工具与查询词
- **MCP 工具 1**: `mcp__tavily__tavily_search`
- **MCP 工具 2**: `mcp__9router__search` (brave)
- **MCP 工具 3**: `mcp__agy-search__search_web` (Google Grounding)

#### 查询主题 A：WaveSpeed API 契约与 LoRA 参数
- **查询词**: `WaveSpeed API turbo lora api/v3 loras path scale`
- **Tavily 搜索结果**:
  - 检索到 Medium 教程与官方模型页 `https://wavespeed.ai/models/wavespeed-ai/p-h3-image/text-to-image-lora`；
  - 确认 WaveSpeed API 使用统一结构：每个 LoRA 包含 `path`（权重 URL 或 HuggingFace 路径）和 `scale`（强度浮点数）；
  - 确认单次请求最多支持挂载 3 个 LoRA。
- **9Router 搜索结果 (Brave)**:
  - 检索到 `https://wavespeed.ai/docs/lora-training-usage` 与 `https://doc.wavespeed.ai/docs-api/sdxl-lora`；
  - 确认端点路径为 `POST https://api.wavespeed.ai/api/v3/{model_id}`；
  - 确认请求体结构包含 `prompt`, `loras: [{ path, scale }]`, `aspect_ratio`, `resolution`, `seed`；轮询端点为 `GET /api/v3/predictions/{id}/result`。
- **Agy-Search 搜索结果 (Google Grounding)**:
  - 交叉核实 `wavespeed-ai/krea-v2/turbo-lora` 接收 `prompt`, `resolution`, `loras: [{ path, scale }]`, `seed`；
  - 指明 scale 常用范围为 0.35–1.0，最大为 4.0。
- **一手官方文档抓取验证 (FetchURL)**:
  - 打开 URL: `https://wavespeed.ai/models/wavespeed-ai/p-h3-image/text-to-image-lora`；
  - 官方原文逐字证实：
    > *Parameters: prompt (Yes), aspect_ratio (No, Default: 1:1), resolution (No, Default: 1k), output_format (No, Default: jpeg), loras (No, Up to 3 LoRA weights. Each item uses {path, scale}), seed (No).*
    > *Pricing: Pricing is based on the selected resolution and includes a fixed $0.015 LoRA surcharge per generation. Resolution 1K: $0.035.*

#### 查询主题 B：Tensor.Art OpenWorks 官方工具契约与规范
- **查询词**: `Tensor.Art OpenWorks API openapi.tensor.art/openworks/v1 task toolName inputs`
- **Tavily 搜索结果**:
  - 检索到 `https://tams.tensor.art` 与 `https://github.com/Tensor-Art`；
  - 确认 Tensor.Art 采用云端免配置 API 平台，支持基于工具/工作流的在线生图与轮询。
- **9Router 搜索结果 (Brave)**:
  - 检索到官方工具仓库 `Tensor-Art/tensorart-skills`。
- **Agy-Search 搜索结果 (Google Grounding)**:
  - 交叉核实 Tensor.Art OpenWorks 平台由 OpenAPI 驱动，任务提交接口为 `POST https://openapi.tensor.art/openworks/v1/task`，任务状态查询为 `POST https://openapi.tensor.art/openworks/v1/task/query`；
  - 参数通过 `toolName` 与 `inputs: [{ type, name, value }]` 提交。
- **一手官方文档抓取验证 (FetchURL)**:
  - 打开 URL: `https://raw.githubusercontent.com/Tensor-Art/tensorart-skills/master/skills/tensorart-generate/SKILL.md`；
  - 官方原文逐字证实：
    > *OpenWorks Tool Protocol: POST https://openapi.tensor.art/openworks/v1/task with header `Echo-Access-Key`. Body format: `{ toolName: string, inputs: Array<{ type: string, value: any, name?: string }> }`. Polling: POST https://openapi.tensor.art/openworks/v1/task/query with `{ taskIds: string[] }`. Status transitions: WAITING -> PROCESSING -> SUCCESS / FINISH.*
- **真实工具 Schema 核验 (Tool Schema Verification)**:
  - 查验 `photoreal_studio_z_image` 在官方工具目录（`POST /tool/list` / 本地官方目录归档 `docs/evidence/openworks-tool-list-2026-10-17.json`）的定义：
    ```json
    {
      "name": "photoreal_studio_z_image",
      "description": "text to image, photoreal image generation based on Z Image Ultra model",
      "inputs": [
        { "type": "STRING", "description": "prompt" },
        { "type": "INTEGER", "description": "image width" },
        { "type": "INTEGER", "description": "image height" },
        { "type": "INTEGER", "description": "result image count" }
      ]
    }
    ```
  - **契约核实结论**：`photoreal_studio_z_image` 工具定义中**未声明** `sampler` 与 `scheduler` 字段。我方按服务端驱动附加发送了 live-tested named 字段（`seed`, `steps`, `cfg`, `negative_prompt`, `loras`），但契约未提供 `sampler` / `scheduler`，故未向该工具发送采样器/调度器，不伪造参数。

---

## 二、多供应商真实余额与出站探测历程 (Multi-Provider Trial History)

为落实「选出一家真实有余额且有可用 Key 的供应商；若返回 402/403/余额不足，原样记录 HTTP 状态与响应体，换下一家」的要求，在 UI 设置与真实运行中完整走查各供应商。

下表严格区分「UI 界面内查验」与「脚本只读辅助走查」：

| 供应商 ID | 供应商全称 | 探测类型 | 探测方式与证据 | HTTP 状态码 | 上游原始响应体原文 / 状态 | 结论 |
| :--- | :--- | :---: | :--- | :---: | :--- | :--- |
| `deepinfra` | DeepInfra | **UI 验收** | 历史真实 UI 点击运行 (M46) | `402 Payment Required` | `{"detail":{"error":"You need positive balance to do inference. Please add balance manually or setup top-up"}}` | 余额不足 |
| `wavespeed` | WaveSpeed | **UI 验收** | UI 余额走查截图 `01b` & UI 运行截图 `02` | `400 Bad Request` | `{"code":400,"message":"Insufficient credits. Please top up your account to continue (https://wavespeed.ai/top-up)."}` | 账户仅剩 $0.008，低于单次生图费用 $0.035，上游拒答 |
| `sogni` | Sogni | **UI 验收** | UI 点击运行截图 `03` | `200 OK` (任务挂起) | `{"errorType":"COST_LIMIT_EXCEEDED","message":"Debit Error: Insufficient funds","waitingReason":"insufficient_credit"}` | 账户资金不足，任务挂起等待充值 |
| `modelscope` | ModelScope CN | **UI 验收** | UI 点击运行截图 `04` | `429 Too Many Requests` | `{"errors":{"message":"insufficient balance"},"request_id":"741b2798-12c8-4eb6-9c17-16372ecc73da"}` | 账户魔粒耗尽 (request_id 与 04 截图一致) |
| `nanogpt` | NanoGPT | **UI 验收** | UI 余额走查截图 `01b` | `401 Unauthorized` | `{"error":{"message":"Incorrect API key. Please check your API key and try again.","type":"invalid_request_error","code":"invalid_api_key"}}` | API Key 失效 |
| `replicate` | Replicate | 脚本辅助 | POST `/predictions` 探测 | `402 Payment Required` | `{"status":402,"detail":"Your account requires credit to run predictions.","title":"Insufficient credit"}` | 账户信用额度不足 |
| `modelslab` | ModelsLab | 脚本辅助 | POST `/images/text2img` 探测 | `200 OK` (业务报错) | `{"status":"error","message":"You need to be subscribed to a plan to continue, buy subscription from https://modelslab.com/pricing"}` | 未订阅付费计划 |
| `fal` | Fal.ai | 脚本辅助 | GET `/users/current` 探测 | `200 OK` (锁定) | `"is_locked":true,"lock_reason":"Exhausted balance. Top up your balance at fal.ai/dashboard/billing"` | 余额耗尽锁定 |
| `venice` | Venice | 脚本辅助 | GET `/api_keys/rate_limits` 探测 | `200 OK` (未授权) | `"accessPermitted":false,"balances":{"USD":0,"DIEM":0,"BUNDLED_CREDITS":0}` | 额度为 0 |
| `aimlapi` | AIMLAPI | 脚本辅助 | GET `/billing/detail` 探测 | `200 OK` | `{"current_balance":0}` | 余额为 0 |
| `novita` | Novita | 脚本辅助 | GET `/billing/balance/detail` 探测 | `200 OK` | `{"availableBalance":"0","cashBalance":"0"}` | 余额为 0 |
| **`openworks`** | **Tensor.Art OpenWorks** | **UI 验收** | **UI 余额截图 `01b` & UI 点击运行截图 `05`-`08`** | **`200 OK`** | **任务提交成功 (`1064569861478308016`)，轮询 23 次返回 `status: FINISH`，输出真实图像 URL** | **✅ 成功生成真实产物** |

---

## 三、真实 UI 点击运行实测 (Real UI Run Acceptance: Tensor.Art OpenWorks)

在真实浏览器（Playwright Chromium，`--no-proxy-server`）中载入 `OpenWorks · 溪边白裙人像` 预设，配置满参数与 3 组真实 LoRA 权重，点击「运行」按钮，全程无 mock、无兜底，真实抵达上游并返回真实产物。

### 1. 请求实参 (Actual Request Parameters from UI)
- **目标服务商 (Target Provider)**: `openworks` (Tensor.Art OpenWorks)
- **执行端点 (Route)**: `POST /api/schema-provider/openworks/submit` -> `https://openapi.tensor.art/openworks/v1/task`
- **底模 (Checkpoint / ToolName)**: `photoreal_studio_z_image`
- **正向提示词 (Positive Prompt)**:
  `Outfit: ((long flowing ivory-white dress:1.5)), lightweight semi-sheer fabric, soft translucent layers, off-shoulder neckline, long flowing sleeves, elegant draped silhouette, delicate gauzy texture, romantic ethereal design, fabric flowing naturally around the body Hair: ((long dark brown hair:1.45)), soft naturally wavy dark brown hair, long hair falling over the shoulders and down the back, loose face-framing strands, slightly tousled texture, natural movement, subtle warm highlights from the sunlight Face: ((soft ethereal feminine features:1.4)), delicate youthful face, large fuchsia red eyes, natural eyelashes, gentle rosy cheeks, small refined nose, glossy natural pink lips, peaceful dreamy expression, eyes softly closed or looking upward, serene romantic mood Accessories: ((small white flower hair accessory:1.4)), single delicate white flower tucked behind the ear, minimal jewelry, simple natural styling Pose: standing gracefully beside a shallow stream, body turned slightly sideways, head tilted upward toward the light, one hand raised near the face, the other arm relaxed naturally, flowing dress trailing around the body, peaceful elegant posture Props: ((small glowing water feature:1.35)), narrow stream of sparkling water flowing beside her, bright water droplets catching the sunlight, smooth pale stones surrounding the water Background: ((quiet natural rocky stream:1.45)), dark mossy rocks, shallow clear water, scattered pale stones, subtle greenery, secluded forest-like environment, peaceful hidden garden atmosphere Lighting: ((strong backlighting:1.55)), intense sunlight shining from behind the subject, dramatic glowing rim light around the hair and dress, dreamy overexposed highlights, sparkling reflections on the water, soft atmospheric haze, luminous white glow Photography: ((dreamy candid outdoor photograph:1.45)), strong natural lens flare, slightly overexposed exposure, soft focus, glowing highlights, subtle film grain, realistic digital camera texture, nostalgic Japanese photography aesthetic, ethereal summer atmosphere, natural imperfect composition`
- **负向提示词 (Negative Prompt)**:
  `(worst quality:2), (low quality:2), (normal quality:1.8), lowres, blurry, jpeg artifacts, pixelated, noisy, grainy, watermark, logo, text, signature, username, copyright, censored, cropped, out of frame, bad anatomy, bad proportions, malformed anatomy, deformed, disfigured, mutated, mutation, ugly, poorly drawn, poorly rendered, bad face, asymmetrical face, bad hands, bad fingers, malformed hands, fused fingers, missing fingers, extra fingers, six fingers, four fingers, extra arms, missing arms, extra legs, missing legs, twisted fingers, broken fingers, disconnected limbs, floating limbs, duplicated limbs, long fingers, short fingers, mutated hands, malformed nails, missing nails, cross-eyed, lazy eye, wonky eyes, mismatched eyes, asymmetrical eyes, extra eyes, missing eyes, bad pupils, blurry eyes, dead eyes, bad mouth, bad teeth, malformed lips, extra mouth, missing mouth, distorted nose, extra nose, duplicate, cloned face, twin, multiple people, multiple girls, extra person, oversaturated, overexposed, underexposed, harsh shadows, unnatural lighting, flat lighting, low contrast, bad perspective, distorted body, stretched body, compressed body, messy hair, floating hair, extra hair, hair covering eyes, tangled hair, bad clothes, fused clothes, clipping, floating accessories, broken accessories, extra accessories`
- **画幅尺寸 (Dimensions)**: `1024 × 1024` (Empty Latent 设定)
- **步数 (Steps)**: `10`
- **引导比例 (CFG)**: `1.0`
- **随机种子 (Seed)**: `42`
- **挂载真实 LoRA 与强度**:
  1. `1015863436619315552` (强度: `1.0`)
  2. `1029661490430387503` (强度: `1.0`)
  3. `1015214543296590260` (强度: `1.0`)
- **出站实际数据详情**: 见同目录下未截断的 `wire-request.json`（包含全部 17 项完整 inputs 数组）。

### 2. 本地适配摘要与上游原始响应明确区分 (Local Summary vs Upstream Raw)

为避免将本地适配结构与上游原文混淆，此处将二者严格分离陈述（并留存原始 JSON 文件）：

#### A. 本地适配层包装响应 (Local Summary - 非上游原文)
- **本地服务适配路由**: `/api/schema-provider/openworks/submit`
- **本地返回给前端的摘要对象**（见 `local-summary.json`）:
  ```json
  {
    "taskId": "1064569861478308016",
    "pollUrl": "/api/schema-provider/openworks/tasks/1064569861478308016"
  }
  ```

#### B. 上游任务提交接口原始响应 (Upstream Submit Raw Response)
- **上游真实端点**: `POST https://openapi.tensor.art/openworks/v1/task`
- **HTTP 状态码**: `200 OK`
- **上游原始响应体原文**（见 `upstream-submit-response.json`）:
  ```json
  {
    "code": "0",
    "message": "",
    "data": {
      "task": {
        "id": "1064569861478308016",
        "userId": "1048723019146487792",
        "status": "WAITING",
        "toolName": "photoreal_studio_z_image",
        "outputs": []
      }
    }
  }
  ```

#### C. 上游任务查询接口原始响应 (Upstream Query Raw Response)
- **上游真实端点**: `POST https://openapi.tensor.art/openworks/v1/task/query`
- **HTTP 状态码**: `200 OK`（第 23 次轮询，由 WAITING -> PROCESSING -> FINISH）
- **上游原始响应体原文**（见 `upstream-query-response.json`）:
  ```json
  {
    "code": "0",
    "message": "",
    "data": {
      "tasks": [
        {
          "id": "1064569861478308016",
          "userId": "1048723019146487792",
          "status": "FINISH",
          "toolName": "photoreal_studio_z_image",
          "outputs": [
            {
              "type": "STRING",
              "value": "https://tensor-sf-sig.7022ae40757f8d53295a57619de9b364.r2.cloudflarestorage.com/workspace/generation/1048723019146487792/2026-11-08/bdf77680-c981-4203-95e5-b54cfe767087.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=0bef8a003dc93fc4d7030c9da79271ff%2F20261108%2Fauto%2Fs3%2Faws4_request&X-Amz-Date=20261108T111540Z&X-Amz-Expires=3600&X-Amz-SignedHeaders=host&x-id=GetObject&X-Amz-Signature=4bb64aa7e584ec66f3922e3e57143491ba6368d374e2d3bbfe2c78652c7be0fe"
            }
          ]
        }
      ]
    }
  }
  ```

---

## 四、真实产物清单与文件校验 (Artifact & File Checksums)

本次单次干净运行（任务 `1064569861478308016`）生成的真实图像产物已完整持久化于 `docs/evidence/real-product-2026-11-08/` 目录下：

### 1. 真实生成图像产物 (Real Image Artifact)
- **文件物理路径**: `docs/evidence/real-product-2026-11-08/artifact-openworks-bdf77680.png`
- **图像格式与规格**: PNG 格式，`1024 × 1024` 像素，8-bit RGB
- **文件物理大小**: `1,392,518` 字节 (`1.33 MB`)
- **SHA256 哈希**:
  ```
  0837cd142c3d40cf73374ab17a53d785b360c02705e7e3490c82233a98ef7970
  ```
- **上游原始存储地址**: `https://tensor-sf-sig.7022ae40757f8d53295a57619de9b364.r2.cloudflarestorage.com/workspace/generation/1048723019146487792/2026-11-08/bdf77680-c981-4203-95e5-b54cfe767087.png`
- **本地服务存储记录**: `data/media/0837cd142c3d40cf73374ab17a53d785b360c02705e7e3490c82233a98ef7970`
- **历史记录持久化条目**: `data/history.json` 中 `id: hist_1794136541248_ixzdi`，时间戳 `1794136541248`

### 2. 未截断 JSON 数据文件清单 (Raw JSON Evidence Files)

| 文件名 | 物理路径 | 文件大小 | SHA256 哈希 | 属性与内容说明 |
| :--- | :--- | :---: | :---: | :--- |
| `wire-request.json` | `docs/evidence/real-product-2026-11-08/wire-request.json` | 5,623 B | `f551970af8ec3031c2b6f2e8f5729fd5bd87f7e9d8f86c8638809be07f4107b7` | 真实完整出站请求 JSON，包含 17 项 inputs（prompt、尺寸、seed 42、steps 10、cfg 1、negative_prompt、3 个 LoRA ID 与权重及 diffusion.lora.items） |
| `local-summary.json` | `docs/evidence/real-product-2026-11-08/local-summary.json` | 7,374 B | `c05c07696a9de91afd5bdd993c7b58bb9110f954c32b1c7aafaf35081f4236f8` | 本地服务摘要与历史条目包装对象，包含 taskId、pollUrl、字段 mapping 等 |
| `upstream-submit-response.json` | `docs/evidence/real-product-2026-11-08/upstream-submit-response.json` | 238 B | `b54c0824a0925c1be007e98fa9cce3295f809275d11e9d652aecab365dfc87e1` | 上游真实 `POST /task` 提交原始响应原文，`status: WAITING` |
| `upstream-query-response.json` | `docs/evidence/real-product-2026-11-08/upstream-query-response.json` | 812 B | `0d207cfa1907ae63b7a186ba298ac2c6a8adc816b37e7b5a7746cefa405b33a7` | 上游真实 `POST /task/query` 轮询终态原始响应原文，`status: FINISH`，输出 Cloudflare R2 图像 URL |

### 3. UI 运行与截图证据清单 (Screenshot Evidence)

| 序号 | 截图文件名 | 磁盘物理路径 | 文件大小 | SHA256 哈希 | 验收验证要点说明 |
| :---: | :--- | :--- | :---: | :--- | :--- |
| **01** | `01-ui-balances-check.png` | `docs/evidence/real-product-2026-11-08/01-ui-balances-check.png` | 297,264 B | `8c8d2faf42ea6d047c629c3ba270027a127744a39c9f93ebf4f5ed7dac0161d9` | **供应商账户与余额走查（首屏）**：在 UI「API 设置」->「余额与额度总览」点击「查询最新余额」，展示 Fal.ai 403 需 admin key、HuggingFace 就绪及多项未查询状态。 |
| **01b** | `01b-ui-balances-check-scrolled.png` | `docs/evidence/real-product-2026-11-08/01b-ui-balances-check-scrolled.png` | 289,243 B | `b3c053d64125b317949aaf6ca821d586540dde3b77bab5e87a596d0e51036693` | **供应商账户与余额走查（滚动下半部）**：滚动后清晰呈现 **NanoGPT 401 报错**、**Tensor.Art OpenWorks Access Key 已配置**、**WaveSpeed 余额 $0.008 正常**，与表内核查完全对齐。 |
| **02** | `02-wavespeed-insufficient-credits.png` | `docs/evidence/real-product-2026-11-08/02-wavespeed-insufficient-credits.png` | 330,058 B | `16f9bf7971b4a11df450ad30c65d2bf62b5416ab1c2476754f942b6b47bc0bf1` | **供应商实测失败透传 (WaveSpeed)**：载入 `WaveSpeed · 复古动漫对打`，UI 点击运行，上游返回真实 HTTP 400 `Insufficient credits. Please top up your account to continue`，原样呈现于状态栏，无任何静默 fallback。 |
| **03** | `03-sogni-insufficient-funds.png` | `docs/evidence/real-product-2026-11-08/03-sogni-insufficient-funds.png` | 472,810 B | `df807d680bfee18fef7e43058627dad71763b6876e7b6829e76ec93266937718` | **供应商实测失败透传 (Sogni)**：载入 `Sogni · 鱼眼赛博漫画`，UI 点击运行，上游返回任务挂起 `waiting_for_user`，事件原文为 `Debit Error: Insufficient funds`（资金不足），原样透传。 |
| **04** | `04-modelscope-insufficient-balance.png` | `docs/evidence/real-product-2026-11-08/04-modelscope-insufficient-balance.png` | 365,404 B | `3de5a50e49753ea14ed2e94d538478839b4e70dede2f8a5370ce2ec78036098d` | **供应商实测失败透传 (ModelScope)**：载入 `魔搭 CN · 闪光纪实人群`，UI 点击运行，上游返回 HTTP 429 `insufficient balance`（`request_id: 741b2798-12c8-4eb6-9c17-16372ecc73da`），截图原文与表内完全一致。 |
| **05** | `05-openworks-canvas-loaded-full-params.png` | `docs/evidence/real-product-2026-11-08/05-openworks-canvas-loaded-full-params.png` | 349,608 B | `e582fc5c4ea06bd31052cc0e48a608f78835b0fec363bfcdfa0bb50bc4fb1e77` | **满参数 + LoRA 配置**：画布载入 `OpenWorks · 溪边白裙人像`，完整呈现底模 `photoreal_studio_z_image`、3 个级联 LoRALoader（权重均为 1.0）、有意义正向提示词、负向提示词、1024×1024 尺寸、KSampler 步数 10、CFG 1、种子 42（采样器/调度器如实显示未指定）。 |
| **06** | `06-openworks-run-success-visible-artifact.png` | `docs/evidence/real-product-2026-11-08/06-openworks-run-success-visible-artifact.png` | 421,021 B | `fa72ae63f8e9c47c03253de145061bb568686923f259abdad364366676696246` | **UI 实际点击生成成功 + 可见产物**：顶部呈现 `生成完成 (Tensor.Art OpenWorks) · 耗时 55秒`，底部呈现 `工作流运行成功！` Toast，KSampler 与 SaveImage 节点内部均渲染出真实可见的高清白裙人像图。与产物及历史记录完全处于同一次干净运行。 |
| **07** | `07-openworks-executionlog-trace.png` | `docs/evidence/real-product-2026-11-08/07-openworks-executionlog-trace.png` | 434,143 B | `a5c530385ea2db2baea1db32fa61747df6b676e7d1d3c7df3989008430d8eb4d` | **ExecutionLog 展开追溯**：底部展开执行日志抽屉，完整展示 `POST /api/schema-provider/openworks/submit · HTTP 200`、轮询 23 次 (`1064569861478308016`)、`save-result · HTTP 200`，清晰包含 `actualRequest` 与端点信息。 |
| **07b** | `07b-openworks-actualrequest-expanded.png` | `docs/evidence/real-product-2026-11-08/07b-openworks-actualrequest-expanded.png` | 405,042 B | `fdb324426cac46b36344a5120717287b33ad70b79fa5305969040c2550d00bc1` | **actualRequest 展开（上部与核心数值）**：展开 `实际上游请求 actualRequest · loras×3`，滚动展示 `toolName: photoreal_studio_z_image`、正向提示词、1024×1024 尺寸、`name: seed, value: 42`、`name: steps, value: 10`、`name: cfg, value: 1`。 |
| **07c** | `07c-openworks-actualrequest-loras.png` | `docs/evidence/real-product-2026-11-08/07c-openworks-actualrequest-loras.png` | 370,402 B | `e766257c7663710ba61e3bf35f2d6a75d733fd0629cf8ad957deacb487897c44` | **actualRequest 展开（LoRA 列表与权重）**：滚动展示 `negative_prompt`、3 组 LoRA ID 字符串（`1015863436619315552, 1029661490430387503, 1015214543296590260`）、`lora_weight: 1` 以及 `diffusion.lora.items` 结构。 |
| **07d** | `07d-openworks-upstream-rawresponse.png` | `docs/evidence/real-product-2026-11-08/07d-openworks-upstream-rawresponse.png` | 364,612 B | `a3ab0c2f22ca1fe0234db376eeda9f5f87f9fa05cc096b9cebc8634ab27d00f4` | **技术细节与上游原文展开**：展开 `技术细节（HTTP / 路径 / 官方原文）`，展示出站实际参数对象与上游原始返回。 |
| **08** | `08-history-modal-visible-artifact.png` | `docs/evidence/real-product-2026-11-08/08-history-modal-visible-artifact.png` | 374,797 B | `ae25a572c2e31ce4351291fde6980bb4f46f341e82a47c22978194455fe1ee67` | **历史记录 (HistoryModal) 产物可见性**：点击「历史」打开弹窗，完整呈现当前干净运行生成的 1 张出图卡片（`hist_1794136541248_ixzdi`），展示模型名称、3 个 LoRA 标签与强度、种子 42、尺寸 1024×1024，以及清晰可见的高保真生成产物缩略图。 |
