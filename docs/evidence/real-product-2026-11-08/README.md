# M96 / FIX100 真实 UI 点击生图与产物留存取证及证据纠正报告 (REALPROD96 / FIX100 Real UI Generation with Visible Artifact & Evidence Correction)

- **原始 UI 运行执行日期**: 2026-11-08
- **原始 UI 运行环境**: Headless Chromium (Playwright Chromium, `--no-proxy-server`, 视口 `1920×1080`)
- **原始 UI 运行服务**: `http://127.0.0.1:4597` (`PORT=4597 npx tsx server.ts`)
- **原始 UI 运行分支**: `feat/realprod96-real-ui-generation-with-visib`（合并 commit: `a9f3601`，原具体执行 commit hash 未获独立记录，标为未验证）
- **本轮证据修正分支**: `feat/fix100-correct-m96-claims-and-bind-evide` (执行 Agent: `worker-m100-evidence-fix`)
- **分支与运行明确声明**: M100 本轮任务为纯文档与证据链纠正，**未在修正分支上重新生图**；本轮仅只读检查本地历史与服务状态，未重新执行 UI 生图运行。所有 UI 截图与物理产物均继承自 M96 原始执行；严禁将原始执行与本轮文档修正分支混为一谈。
- **修正背景 (M100 Correction Notice)**:
  M96 审核员撤回早前 clean 判定，R2/R3 均判 `p1-1items / hold`。经 Tower 主控与 M99 独立核查，原 M96 报告存在多处不严谨、夸大与证据不一致：
  1. README 原文将已发送的 LoRA 描述为「3 组真实挂载」，但根据 OpenWorks 官方 OpenAPI 工具目录，`photoreal_studio_z_image` 仅声明 4 个位置输入（`prompt`, `image width`, `image height`, `result image count`），扩展字段与 LoRA 是否被上游真正采用无契约证据；
  2. 原报告中 06 / 07 截图耗时 55 秒，而 07b / 07c / 07d 截图耗时 74 秒（画布背景人物姿态不同），确属不同运行的截图混杂，原报告声称为「同一次干净运行」；
  3. 07d 截图仅展示了 `actualRequest` 尾部字段，完全没有上游 HTTP 状态与原始响应体，原报告以此冒充 `rawResponse`；
  4. 原 README 第 172 行的签名 URL 与同目录下 `upstream-query-response.json` 的终态签名不一致（`4bb64a…` vs `cea268…`）；且公开交付文件存在未脱敏的临时凭证与用户 ID；
  5. 原报告将综合归纳的端点协议表述为 SKILL.md「官方原文逐字证实」，状态列出非官方的 SUCCESS/FINISH。
  M100 遵照 `AGENTS.md` 铁律与 Tower 指令，**不改代码、不替换/重生成产物 PNG、不产生无契约的收费重跑、不擅自注入 localStorage 伪造历史**，实事求是全面更正报告与证据链。

- **验收核心结论 (Final Ground Truth Verdict)**:
  1. **UI 实际点击运行与产物状态**：**仅证实历史 UI 点击动作与真实产物存在，完整最终验收未通过**。原始执行虽在 Playwright Chromium 无代理浏览器界面内完成了余额走查、预设载入、出图与历史弹窗查看；但因缺少同一 taskId 的 UI actualRequest / rawResponse 展开截图，且满参数与 LoRA 采用情况未获契约证实，**不满足完整最终验收标准（未完全通过）**；
  2. **是否有真实产物**：**有真实产物**（成功从上游生成并持久化真实 1024×1024 PNG 图像产物，大小 1,392,518 字节，SHA256: `0837cd142c3d40cf73374ab17a53d785b360c02705e7e3490c82233a98ef7970`）；
  3. **参数满足情况（满参数验收）**：**未完全通过（P1 契约缺口已明确标出）**：
     - 已发送底模、正向提示词、负向提示词、尺寸（1024×1024）、步数（10）、CFG（1.0）、随机种子（42）及 3 组 LoRA ID/权重；
     - 采样器 (sampler) 与调度器 (scheduler) 因 OpenWorks `photoreal_studio_z_image` 工具契约未提供对应字段而未发送；
     - **关键结论**：工具目录仅声明 4 个位置输入，扩展字段与 LoRA 是否被上游底层服务真正采用未获官方契约证实（**按准则判定为未验证**），因此满参数验收项**未完全通过**；
  4. **证据留存缺口与截图归属核实**：
     - **跨运行截图混杂确认**：06 / 07 属于 55 秒运行（绑定 `taskId: 1064569861478308016` 与产物 `artifact-openworks-bdf77680.png`）；07b / 07c / 07d 属于 74 秒的另一次运行（显示了该次运行的 `actualRequest`，其 taskId 截图中未展示，故运行 B 的 taskId 属于未验证）；
     - **07d 截图与 rawResponse 缺口认定**：07d 截图实际仅展示了 74 秒运行的 `actualRequest` 尾部字段，原始取证截图中不存在上游 rawResponse 展开截图。查验 `src/components/ExecutionLog.tsx:666-670` 源码，UI 具备在「技术细节」折叠区渲染服务端响应体（含 `rawResponse`）的能力；当前现场本地无活跃 Chrome 实例，`data/history.json` 为 `[]`，当前现场未恢复原会话记录，恢复可能性未验证；本轮未补拍 rawResponse 截图，rawResponse 与同一 taskId 请求截图缺口不能通过补文档视同截图已完成，如实定性为**历史取证的证据留存缺口**，严禁伪造。真正的上游原始响应体见落盘文件 `upstream-submit-response.json` 与 `upstream-query-response.json`（已执行公开交付安全脱敏）。

---

## 一、搜索记录 (Mandatory 3-MCP Web Search Cross-Verification)

根据项目最高工程准则 `AGENTS.md` 铁律，外部 API 契约与关键事实必须在同一轮并行调用至少 3 个 WebSearch MCP 工具（`mcp__tavily__tavily_search`、`mcp__9router__search`、`mcp__agy-search__search_web`）进行三方交叉比对，并通过一手官方文档原文核实。

### 1. 并行调用搜索工具与查询词 (M100 重新并行核查)
- **MCP 工具 1**: `mcp__tavily__tavily_search`（查询 `Tensor.Art OpenWorks API photoreal_studio_z_image inputs tool schema`，返回 HTTP 429 频率限制拦截，过程如实留存）
- **MCP 工具 2**: `mcp__9router__search`（请求 brave-search 与 exa 引擎，成功检索到官方仓库与文档）
- **MCP 工具 3**: `mcp__agy-search__search_web`（Google Grounding 深度检索，返回 Z-Image 架构工具定义与输入字段特征）

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
- **查询词**: `Tensor.Art OpenWorks API openapi.tensor.art/openworks/v1 task toolName inputs` / `Tensor.Art OpenWorks photoreal_studio_z_image tool schema inputs`
- **Tavily 搜索结果**:
  - 检索到 `https://tams.tensor.art` 与 `https://github.com/Tensor-Art`；
  - 返回 HTTP 429 请求超限拦截，按规定降级至 9Router exa / brave 阶梯。
- **9Router 搜索结果 (Brave / Exa)**:
  - 检索到官方工具仓库 `Tensor-Art/tensorart-skills` (`https://github.com/tensor-art/tensorart-skills`)。
- **Agy-Search 搜索结果 (Google Grounding)**:
  - 交叉核实 Tensor.Art OpenWorks 平台由 OpenAPI 驱动，任务提交接口为 `POST https://openapi.tensor.art/openworks/v1/task`，任务状态查询为 `POST https://openapi.tensor.art/openworks/v1/task/query`；
  - 查明 Z-Image Turbo / photoreal studio 类工作流在底层仅提供固定接口封装。
- **一手官方文档与源码抓取核验 (FetchURL)**:
  - 打开 URL 1: `https://raw.githubusercontent.com/Tensor-Art/tensorart-skills/master/skills/tensorart-generate/SKILL.md`；
  - 打开 URL 2: `https://raw.githubusercontent.com/Tensor-Art/tensorart-skills/master/skills/tensorart-generate/scripts/_api.py`；
  - 打开 URL 3: `https://raw.githubusercontent.com/Tensor-Art/tensorart-skills/master/skills/tensorart-generate/scripts/create_task.py`；
  - 打开 URL 4: `https://raw.githubusercontent.com/Tensor-Art/tensorart-skills/master/skills/tensorart-generate/scripts/query_task.py`；
  - **官方 SKILL.md 原文摘录与状态表 (FetchURL)**：
    > *## Step 4: Create a Generation Task*
    > *```bash*
    > *cd ~/.claude/skills/tensorart-generate && python3 scripts/create_task.py "toolName" '[{"type":"STRING","value":"your prompt"}, ...]'*
    > *```*
    > *The second argument is a JSON array string. Each element corresponds to the input at the same position in the tool definition:*
    > *- type: one of STRING, INTEGER, NUMBER, BOOLEAN, ARRAY, OBJECT, FILE*
    > *- value: the value matching the type*
    > *[...]*
    > *All inputs are required:*
    > *- Every input defined by the tool must have a meaningful value*
    > *[...]*
    > *## Step 5: Poll Task Status*
    > *Task status reference:*
    > *| Status | Meaning |*
    > *| `WAITING` / `QUEUE_WAIT` / `PARSING` / `START` / `PROCESSING` | In progress |*
    > *| `FINISH` | Completed |*
    > *| `EXCEPTION` | Failed — report the error reason to the user |*
    > *| `CANCELED` | Canceled |*
  - **伴随源码佐证 (代码实现佐证，非 SKILL.md 正文)**：
    - `scripts/_api.py` 佐证：基址定义为 `DEFAULT_BASE_URL = "https://openapi.tensor.art/openworks/v1"`，鉴权请求头为 `Echo-Access-Key`；
    - `scripts/create_task.py` 佐证：任务提交接口为 `POST task`，请求体为 `{"toolName": tool_name, "inputs": inputs}`；
    - `scripts/query_task.py` 佐证：轮询查询接口为 `POST task/query`，请求体为 `{"taskIds": [task_id]}`；
    - 引用说明：原报告将文档说明与伴随源码实现综合归纳，未准确区分文档正文与源码，且误写非官方的 SUCCESS 状态，现按原始文档与源码客观分立呈现。
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
  - **契约核实结论与严肃说明**：
    1. `photoreal_studio_z_image` 在 OpenWorks 官方目录中**仅声明了 4 个位置输入**；
    2. 工具定义中**未声明** `sampler` 与 `scheduler`，本工程未发送采样器与调度器，不伪造字段；
    3. 本工程在请求体 `inputs` 数组中追加发送了命名扩展字段（`seed`, `steps`, `cfg`, `negative_prompt`, `loras`, `diffusion.lora.items`），**但这些扩展字段与 LoRA 是否被上游底层服务真正采用，没有任何官方契约证据支持，故按准则如实判定为「未验证（未通过契约证实）」**。

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
| **`openworks`** | **Tensor.Art OpenWorks** | **部分取证（完整终验未通过）** | **UI 余额截图 `01b` & UI 点击运行截图 `05`-`08`** | **`200 OK`** | **任务提交成功 (`1064569861478308016`)，轮询 23 次返回 `status: FINISH`，输出真实图像 URL** | **仅证实历史 UI 点击动作与真实产物存在；缺同一 taskId 的 UI 请求/响应展开截图，且 LoRA 采用未验证，完整终验未通过** |

---

## 三、真实 UI 点击运行实测 (Real UI Run Acceptance: Tensor.Art OpenWorks)

在真实浏览器（Playwright Chromium，`--no-proxy-server`）中载入 `OpenWorks · 溪边白裙人像` 预设，配置并发送了相应参数与 3 组 LoRA 权重，点击「运行」按钮，全程无 mock、无兜底，真实抵达上游并返回真实产物。

需明确说明：上游官方工具目录仅声明 4 个位置输入，扩展字段及 LoRA 权重是否被上游底层服务真正采用未获官方契约证实（未验证），因此**第 3 项满参数验收未完全通过**。

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
- **已发送 LoRA ID 与权重 (采用情况未获契约证实 / 未验证)**:
  1. `1015863436619315552` (权重: `1.0`)
  2. `1029661490430387503` (权重: `1.0`)
  3. `1015214543296590260` (权重: `1.0`)
  *(契约说明：前端节点配置并组装发送了上述 3 组 LoRA ID 及权重；但 OpenWorks 工具目录仅声明 4 个位置输入，扩展参数与 LoRA 是否被上游服务采用无契约证据，按准则标记为未验证)*
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

#### B. 上游任务提交接口响应 (Upstream Submit Response - 公开脱敏版)
- **上游真实端点**: `POST https://openapi.tensor.art/openworks/v1/task`
- **HTTP 状态码**: `200 OK`
- **上游响应体脱敏呈现**（见同目录下 `upstream-submit-response.json`）:
  ```json
  {
    "code": "0",
    "message": "",
    "data": {
      "task": {
        "id": "1064569861478308016",
        "userId": "[REDACTED_USER_ID]",
        "status": "WAITING",
        "toolName": "photoreal_studio_z_image",
        "outputs": []
      }
    }
  }
  ```
  *(注：根据公开交付安全规则，对敏感 userId 进行了显式脱敏标记；任务 ID `1064569861478308016` 完整保留；M96 初始入库原文哈希保留在下文表格备查)*

#### C. 上游任务查询接口响应 (Upstream Query Response - 公开脱敏版)
- **上游真实端点**: `POST https://openapi.tensor.art/openworks/v1/task/query`
- **HTTP 状态码**: `200 OK`（第 23 次轮询，由 WAITING -> PROCESSING -> FINISH）
- **上游响应体脱敏呈现**（与同目录下 `upstream-query-response.json` 保持一致）:
  ```json
  {
    "code": "0",
    "message": "",
    "data": {
      "tasks": [
        {
          "id": "1064569861478308016",
          "userId": "[REDACTED_USER_ID]",
          "status": "FINISH",
          "toolName": "photoreal_studio_z_image",
          "outputs": [
            {
              "type": "STRING",
              "value": "https://tensor-sf-sig.7022ae40757f8d53295a57619de9b364.r2.cloudflarestorage.com/workspace/generation/[REDACTED_USER_ID]/2026-11-08/bdf77680-c981-4203-95e5-b54cfe767087.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=[REDACTED]&X-Amz-Date=20261108T111540Z&X-Amz-Expires=3600&X-Amz-SignedHeaders=host&x-id=GetObject&X-Amz-Signature=[REDACTED_SIGNATURE]"
            }
          ]
        }
      ]
    }
  }
  ```
  > **脱敏与签名 URL 说明 (Signature URL & Sanitization Note)**: 按照公开交付规则，对上方 outputs 中的签名参数及 userId 进行了显式脱敏，保留了对象物理路径与 UUID（`.../bdf77680-c981-4203-95e5-b54cfe767087.png`）。在未脱敏原始数据中，此签名结尾为 `cea268a03835b74972050113b09da60980763620decc22b6efa0fde344b7b3d6`。早期报告曾记录签名结尾为 `4bb64aa7e584ec66f3922e3e57143491ba6368d374e2d3bbfe2c78652c7be0fe` 的 URL，经核对二者物理对象路径完全一致；但 `4bb64a` 签名的产生时刻在原始日志中未见逐字时间戳记录，来源时刻未获证实。脱敏版文件不再与原始出站字节完全一致，M96 初始入库内容哈希在第四节表格中完整记录。

---

## 四、真实产物清单与文件校验 (Artifact & File Checksums)

本次真实生图运行（任务 `1064569861478308016`）生成的真实图像产物已完整持久化于 `docs/evidence/real-product-2026-11-08/` 目录下：

### 1. 真实生成图像产物 (Real Image Artifact)
- **文件物理路径**: `docs/evidence/real-product-2026-11-08/artifact-openworks-bdf77680.png`
- **图像格式与规格**: PNG 格式，`1024 × 1024` 像素，8-bit RGB
- **文件物理大小**: `1,392,518` 字节 (`1.33 MB`)
- **SHA256 哈希**:
  ```
  0837cd142c3d40cf73374ab17a53d785b360c02705e7e3490c82233a98ef7970
  ```
- **上游原始存储地址**: `https://tensor-sf-sig.7022ae40757f8d53295a57619de9b364.r2.cloudflarestorage.com/workspace/generation/[REDACTED_USER_ID]/2026-11-08/bdf77680-c981-4203-95e5-b54cfe767087.png`
- **本地服务存储记录**: `data/media/0837cd142c3d40cf73374ab17a53d785b360c02705e7e3490c82233a98ef7970`
- **历史记录持久化条目**: `data/history.json` 中 `id: hist_1794136541248_ixzdi`，时间戳 `1794136541248`

### 2. JSON 数据文件清单 (JSON Evidence Files & Sanitization Record)

| 文件名 | 物理路径 | 当前入库大小 | 当前文件 SHA256 哈希 | M96 初始入库 SHA256 | 属性与内容说明 |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `wire-request.json` | `docs/evidence/real-product-2026-11-08/wire-request.json` | 5,623 B | `f551970af8ec3031c2b6f2e8f5729fd5bd87f7e9d8f86c8638809be07f4107b7` | `f551970af8ec3031c2b6f2e8f5729fd5bd87f7e9d8f86c8638809be07f4107b7` | M96 初始入库出站请求记录（包含 17 项 inputs；初始合入时请求头 Key 已呈脱敏状态，未脱敏出站原文未落盘 / 未验证） |
| `local-summary.json` | `docs/evidence/real-product-2026-11-08/local-summary.json` | 7,374 B | `c05c07696a9de91afd5bdd993c7b58bb9110f954c32b1c7aafaf35081f4236f8` | `c05c07696a9de91afd5bdd993c7b58bb9110f954c32b1c7aafaf35081f4236f8` | 本地服务摘要与历史条目包装对象，包含 taskId (`1064569861478308016`)、pollUrl、字段 mapping 等（入库时未脱敏 / 无敏感签名凭据） |
| `upstream-submit-response.json` | `docs/evidence/real-product-2026-11-08/upstream-submit-response.json` | 238 B | `ef0b08ef36c5e6e5edd8161ef5ee1f4a841e59ce08a20ff92f5a2afbd6a9af5b` | `b54c0824a0925c1be007e98fa9cce3295f809275d11e9d652aecab365dfc87e1` | 上游真实 `POST /task` 提交响应（M100 显式脱敏 userId），`status: WAITING`，保留任务 ID `1064569861478308016`；初始入库为未脱敏原文 |
| `upstream-query-response.json` | `docs/evidence/real-product-2026-11-08/upstream-query-response.json` | 707 B | `8f139599bf422947aee9747cf9dfa5caf8adf42bab017c73209b57ad2a914a97` | `0d207cfa1907ae63b7a186ba298ac2c6a8adc816b37e7b5a7746cefa405b33a7` | 上游真实 `POST /task/query` 轮询终态响应（M100 显式脱敏 userId 与签名凭据），`status: FINISH`，输出 Cloudflare R2 图像路径与 UUID；初始入库为未脱敏原文 |

### 3. UI 运行与截图证据清单及归属纠正 (Screenshot Evidence & Attribution Analysis)

> **跨运行混杂与归属说明 (Mixed-Run Analysis)**：
> 经 Tower 主控与 M99 独立核验：
> - **运行 A（耗时 55 秒，绑定 taskId: `1064569861478308016`）**：对应截图 `06`（出图完成，女人靠左长发向右）、`07`（展开执行记录，明文露出 `tasks/1064569861478308016` 轮询 23 次）、`08`（历史记录弹窗）；该次运行产物与 `artifact-openworks-bdf77680.png` 严格对应。
> - **运行 B（耗时 74 秒，另一次运行）**：对应截图 `07b`、`07c`、`07d`，画布背景中女人居中、双臂与裙摆姿态不同；原 M96 报告混淆了这两次运行的截图，声称为「同一次干净运行」，现明确纠正标明其实际归属。运行 B 的 taskId 在截图中未见展示，属于未验证。
> - **07d 证据缺口声明**：07d 截图实际展示的是运行 B 的 `actualRequest` 尾部扩展参数，并非上游 rawResponse；查验 `src/components/ExecutionLog.tsx:666-670`，UI 具备在「技术细节」折叠内渲染完整响应体的能力，当前现场本地无活跃 Chrome 实例，`data/history.json` 为 `[]`，当前现场未恢复原会话记录，恢复可能性未验证。未补拍 rawResponse 截图，如实定性为历史证据留存缺口。

| 序号 | 截图文件名 | 磁盘物理路径 | 文件大小 | SHA256 哈希 | 验收验证要点与真实归属说明 |
| :---: | :--- | :--- | :---: | :--- | :--- |
| **01** | `01-ui-balances-check.png` | `docs/evidence/real-product-2026-11-08/01-ui-balances-check.png` | 297,264 B | `8c8d2faf42ea6d047c629c3ba270027a127744a39c9f93ebf4f5ed7dac0161d9` | **供应商账户与余额走查（首屏）**：在 UI「API 设置」->「余额与额度总览」点击「查询最新余额」，展示 Fal.ai 403 需 admin key、HuggingFace 就绪及多项未查询状态。 |
| **01b** | `01b-ui-balances-check-scrolled.png` | `docs/evidence/real-product-2026-11-08/01b-ui-balances-check-scrolled.png` | 289,243 B | `b3c053d64125b317949aaf6ca821d586540dde3b77bab5e87a596d0e51036693` | **供应商账户与余额走查（滚动下半部）**：滚动后清晰呈现 **NanoGPT 401 报错**、**Tensor.Art OpenWorks Access Key 已配置**、**WaveSpeed 余额 $0.008 正常**，与表内核查完全对齐。 |
| **02** | `02-wavespeed-insufficient-credits.png` | `docs/evidence/real-product-2026-11-08/02-wavespeed-insufficient-credits.png` | 330,058 B | `16f9bf7971b4a11df450ad30c65d2bf62b5416ab1c2476754f942b6b47bc0bf1` | **供应商实测失败透传 (WaveSpeed)**：载入 `WaveSpeed · 复古动漫对打`，UI 点击运行，上游返回真实 HTTP 400 `Insufficient credits. Please top up your account to continue`，原样呈现于状态栏，无任何静默 fallback。 |
| **03** | `03-sogni-insufficient-funds.png` | `docs/evidence/real-product-2026-11-08/03-sogni-insufficient-funds.png` | 472,810 B | `df807d680bfee18fef7e43058627dad71763b6876e7b6829e76ec93266937718` | **供应商实测失败透传 (Sogni)**：载入 `Sogni · 鱼眼赛博漫画`，UI 点击运行，上游返回任务挂起 `waiting_for_user`，事件原文为 `Debit Error: Insufficient funds`（资金不足），原样透传。 |
| **04** | `04-modelscope-insufficient-balance.png` | `docs/evidence/real-product-2026-11-08/04-modelscope-insufficient-balance.png` | 365,404 B | `3de5a50e49753ea14ed2e94d538478839b4e70dede2f8a5370ce2ec78036098d` | **供应商实测失败透传 (ModelScope)**：载入 `魔搭 CN · 闪光纪实人群`，UI 点击运行，上游返回 HTTP 429 `insufficient balance`（`request_id: 741b2798-12c8-4eb6-9c17-16372ecc73da`），截图原文与表内完全一致。 |
| **05** | `05-openworks-canvas-loaded-full-params.png` | `docs/evidence/real-product-2026-11-08/05-openworks-canvas-loaded-full-params.png` | 349,608 B | `e582fc5c4ea06bd31052cc0e48a608f78835b0fec363bfcdfa0bb50bc4fb1e77` | **参数与 LoRA 输入配置**：画布载入 `OpenWorks · 溪边白裙人像`，配置底模 `photoreal_studio_z_image`、3 个级联 LoRALoader（权重 1.0）、正向提示词、负向提示词、1024×1024 尺寸、步数 10、CFG 1、种子 42（采样器/调度器如实显示未指定）。需注意：官方工具目录仅声明 4 个位置参数，扩展字段与 LoRA 是否被采用未获契约证实（未验证）。 |
| **06** | `06-openworks-run-success-visible-artifact.png` | `docs/evidence/real-product-2026-11-08/06-openworks-run-success-visible-artifact.png` | 421,021 B | `fa72ae63f8e9c47c03253de145061bb568686923f259abdad364366676696246` | **UI 实际点击生成成功 + 可见产物 (运行 A，耗时 55 秒)**：顶部呈现 `生成完成 (Tensor.Art OpenWorks) · 耗时 55秒`，底部呈现 `工作流运行成功！` Toast，KSampler 与 SaveImage 节点内部渲染出女人靠左长发向右的真实高清白裙人像图，底部状态条显示 `第 1 次运行 · 2026-11-08 19:14:45（北京时间）`，与物理产物 `artifact-openworks-bdf77680.png` 严格绑定。 |
| **07** | `07-openworks-executionlog-trace.png` | `docs/evidence/real-product-2026-11-08/07-openworks-executionlog-trace.png` | 434,143 B | `a5c530385ea2db2baea1db32fa61747df6b676e7d1d3c7df3989008430d8eb4d` | **ExecutionLog 展开追溯 (运行 A，耗时 55 秒)**：底部展开执行日志抽屉，对应 `第 1 次运行 · 2026-11-08 19:14:45`，**界面明文露出轮询行**：`GET /api/schema-provider/openworks/tasks/1064569861478308016 · 轮询 23 次 · HTTP 200`，明确证实与 06 共享同一个 `taskId: 1064569861478308016`。 |
| **07b** | `07b-openworks-actualrequest-expanded.png` | `docs/evidence/real-product-2026-11-08/07b-openworks-actualrequest-expanded.png` | 405,042 B | `fdb324426cac46b36344a5120717287b33ad70b79fa5305969040c2550d00bc1` | **actualRequest 头部展开 (运行 B，耗时 74 秒)**：展开 `实际上游请求 actualRequest · loras×3`，滚动展示 `toolName: photoreal_studio_z_image`、正向提示词、1024×1024 尺寸、`seed: 42`、`steps: 10`、`cfg: 1`。顶部显示耗时 74 秒，背景人像居中，确属另一运行（混杂记录）。运行 B 的 taskId 在截图中未见展示（未验证）。 |
| **07c** | `07c-openworks-actualrequest-loras.png` | `docs/evidence/real-product-2026-11-08/07c-openworks-actualrequest-loras.png` | 370,402 B | `e766257c7663710ba61e3bf35f2d6a75d733fd0629cf8ad957deacb487897c44` | **actualRequest LoRA 列表展开 (运行 B，耗时 74 秒)**：滚动展示 `negative_prompt`、3 组 LoRA ID 字符串（`1015863436619315552, 1029661490430387503, 1015214543296590260`）、`lora_weight: 1` 以及 `diffusion.lora.items` 结构。 |
| **07d** | `07d-openworks-upstream-rawresponse.png` | `docs/evidence/real-product-2026-11-08/07d-openworks-upstream-rawresponse.png` | 364,612 B | `a3ab0c2f22ca1fe0234db376eeda9f5f87f9fa05cc096b9cebc8634ab27d00f4` | **actualRequest 尾部展开与历史证据缺口认定 (运行 B，耗时 74 秒)**：展示 `diffusion.lora.items`、`seed: 42`、`steps: 10`、`cfg: 1`、`negative_prompt`。<br>**【历史证据缺口说明】**：原 M96 报告将此截图描述为「上游原始返回」，经核实其内完全无 HTTP 状态与上游原始返回；查验 `ExecutionLog.tsx:666-670`，UI 本身具备在「技术细节」折叠内展示响应体（含 rawResponse）的能力。当前现场本地无活跃 Chrome 实例，`data/history.json` 为 `[]`，当前现场未恢复原会话记录，恢复可能性未验证。rawResponse 与同一 taskId 请求截图缺口不能通过补文档视同截图已完成，如实定性为历史取证的证据缺口，严禁伪造。真正的上游原始响应参见同目录下物理文件 `upstream-submit-response.json` 与 `upstream-query-response.json`（公开脱敏版）。 |
| **08** | `08-history-modal-visible-artifact.png` | `docs/evidence/real-product-2026-11-08/08-history-modal-visible-artifact.png` | 374,797 B | `ae25a572c2e31ce4351291fde6980bb4f46f341e82a47c22978194455fe1ee67` | **历史记录 (HistoryModal) 产物可见性 (运行 A，耗时 55 秒)**：点击「历史」打开弹窗，完整呈现当前运行生成的 1 张出图卡片（`hist_1794136541248_ixzdi`，对应 19:14:45），展示模型名称、3 个 LoRA 标签与强度、种子 42、尺寸 1024×1024，缩略图与 06 及物理产物严格一致。 |

---

## 五、历史证据缺口与事实认定声明 (Evidence Gaps & Factual Assertions)

经本次 M100 详细核实源码、截图与原始文件，对 M96 历史交付中的缺陷作出如下严肃的事实认定与定性：

1. **撤销对 UI 渲染能力的无根据归咎**：
   - 源码查验确认：`src/components/ExecutionLog.tsx:666-670` 已实现「技术细节（HTTP / 路径 / 官方原文）」折叠区，通过 `JSON.stringify(redactSecrets(r.response), ...)` 渲染服务端的完整响应对象（其中包含上游 `rawResponse`）。
   - 07d 截图实际仅展示了 `actualRequest` 尾部字段，完全没有上游 HTTP 状态或原始响应体。原报告以此描述为上游原始返回，系历史截图未展开技术细节所致，不能归咎于 UI 无法展示或产品缺口。
2. **历史执行记录会话状态与证据缺口**：
   - 本轮实地排查：本地服务 `/api/history` 与 `data/history.json` 均返回空数组 `[]`，系统进程中无活跃运行的 Chromium / Chrome 实例，`browser-harness` 检查确认 Chrome 未运行；
   - 当前现场本地无活跃 Chrome 实例，`data/history.json` 为 `[]`，当前现场未恢复原会话记录，恢复可能性未验证；本轮未补拍 rawResponse 截图；
   - 按照 Tower 最高指示，**严禁注入 localStorage 伪造历史，严禁为了掩盖证据缺口而进行无契约的收费重跑**。因此，本报告如实认定「UI 界面内未拍到上游 rawResponse 展开截图」为历史取证的证据留存缺口，留待后续最终 main 验收补齐。真正的上游原始响应体以同目录下直接落盘的 `upstream-submit-response.json`（WAITING）与 `upstream-query-response.json`（FINISH）物理文件为准。
3. **截图混杂与归属真相**：
   - 截图 `06`、`07`、`08` 对应耗时 55 秒的运行 A，在 `07` 中明文露出了 `GET /api/schema-provider/openworks/tasks/1064569861478308016 · 轮询 23 次 · HTTP 200`，证实与 `taskId: 1064569861478308016` 及产物图片对应；
   - 截图 `07b`、`07c`、`07d` 对应耗时 74 秒的运行 B（画布背景女人姿态与 06 明显不同），系另一运行的请求参数截图；运行 B 的 taskId 在截图中未见展示，属于未验证；原报告声称「同一次干净运行」属于不实陈述，现予纠正。
4. **最终交付定性**：
   - **UI 点击真实发生**（有余额探测与界面出图过程截图，证实历史 UI 点击动作与真实产物存在）；
   - **真实产物真实存在**（`artifact-openworks-bdf77680.png` 1.33MB，SHA256: `0837cd14...`）；
   - **满参数与 LoRA 采用未证实**（官方工具目录仅有 4 个位置参数，扩展参数无契约证据，判定为未验证，第 3 项满参数验收未完全通过）；
   - **证据留存缺口已如实披露，完整最终验收未通过**（缺同一 taskId 的 UI actualRequest / rawResponse 展开截图，文档纠正不能替代缺失的截图证据，后续留待最终 main 验收）。
