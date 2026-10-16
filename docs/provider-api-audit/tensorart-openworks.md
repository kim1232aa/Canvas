# Tensor.Art OpenWorks API 审计

抓取日期：2026-10-15 Asia/Shanghai  
研究方法：公开 Web 检索 + 官方站点路径探测 + Tensor-Art GitHub 技能页检索；交叉对照本地验收证据（**非**训练记忆编造端点）。Grok CLI **401**。  
**严禁与 TAMS 混淆**：OpenWorks ≠ TAMS Model API。TAMS 见 `tensorart-tams.md`。

## 1) 官方 docs / OpenAPI URL

### 结论（2026-10-15）

**官方无可用的、面向公众的 OpenWorks 完整 API 文档站 / OpenAPI 入口。**

公开探测证据：

| URL | HTTP | 说明 |
|-----|------|------|
| https://openapi.tensor.art/ | 404 | 无文档首页 |
| https://openapi.tensor.art/openworks | 404 | |
| https://openapi.tensor.art/openworks/docs | 404 | |
| https://docs.tensor.art/openworks | 404 | |
| https://tensor.art/openworks | 403 | |
| https://www.tensor.art/openworks | 403 | |
| Web 检索 “OpenWorks”+tensor.art+API | 主要命中 **无关** openworklabs / different-ai OpenWork，或 **TAMS** 文档 | 不能把 TAMS Spec 当作 OpenWorks |

相关但**不等于** OpenWorks 契约文档：

| 资源 | URL | 备注 |
|------|-----|------|
| Tensor-Art/tensorart-skills README（检索摘要） | https://github.com/Tensor-Art/tensorart-skills | 描述 Access Key、list tools / create task / poll；本轮 raw.githubusercontent 拉取 **404**（路径或默认分支变更） |
| 站内部分「API Doc」页 | `https://tensor.art/apis/aitool/<id>` | 展示的是 **`ap-east-1.tensorart.cloud/v1/jobs/workflow/template` + Bearer** ——属 **TAMS/云 jobs 族**，不是 OpenWorks `Echo-Access-Key` 工具 API |

### 运行中基址（有实测，但官方正文未公开）

验收/产品文档中反复出现（**代码与 evidence，非官方 HTML 手册**）：

- 国际：`https://openapi.tensor.art/openworks/v1`
- 国内镜像（画布代码可选）：`https://openapi.tusiart.cn/openworks/v1`

常见路径（evidence `docs/evidence/tensor-openworks-verify-2026-10-14.md` / `t7-tensorart-acceptance.md`）：

| 方法 | 路径 | 作用 |
|------|------|------|
| POST | `/tool/list` | 列工具 |
| POST | `/task` | 提交生成任务 |
| POST | `/task/query` | 轮询 |
| POST | `/file/upload` | 上传（字段官方未公开核实） |

画布 PROGRESS 亦记载：官方 openworks 文档路径 404，端点字段「未能核实」。

**集成纪律**：在官方文档补齐前，任何 Schema 只能标注 **PARTIAL / 实测证据**，禁止写成「官方 OpenAPI 已核」。

## 2) 鉴权方式

- Header：`Echo-Access-Key: ak_tensor_…`（Access Key 前缀 `ak_` / `ak_tensor_`）
- **不要**把该 key 放到 TAMS `Authorization: Bearer`
- Key 来源：Tensor.Art / 吐司个人资料 Access Key（skills 文案）；**勿把密钥写入本审计文件**

## 3) 模型目录端点

- OpenWorks 暴露的是 **工具（tools）列表**，不是 TAMS Checkpoint/LoRA 数字 ID 目录
- `POST …/tool/list`（body 常为 `{}`）→ 工具名 + 输入输出 schema（实测约数十个工具）
- **禁止**把工具名（如 `anime_lab_wai_illustrious`、`photoreal_studio_*`、`text2video_*`）标成画布 Checkpoint / 底模
- 无官方「分页/搜索模型市场」OpenWorks 文档；社区模型 ID 查询属 **TAMS** `GET /v1/models/{id}`

## 4) 生图 / 生视频端点与异步轮询

### 生图（工具任务）

模式（实测证据）：

1. `POST /tool/list` 选工具  
2. `POST /task` 提交 `{ toolName/name, inputs: […] }` 类载荷（精确 JSON 以工具 schema 为准）  
3. `POST /task/query` 轮询至 `FINISH` / `SUCCESS` / `FAILED` / `EXCEPTION`（状态字以实测为准）  
4. 取输出图片 URL 并持久化  

例（evidence）：`anime_lab_wai_illustrious` → PASS_GENERATION（**OpenWorks 工具**，不是 TAMS DIFFUSION）。

部分工具输入仅有 `prompt`/`width`/`height`/`count`，**无**独立 steps/cfg/seed/LoRA（PROGRESS 对 `photoreal_studio_z_image` 的核实记录）。

### 生视频

- OpenWorks 工具列表中可出现视频类工具名（画布历史：`text2video_*` / `image2video_*` / `live_wallpaper` 等）
- **官方无公开视频参数手册**（duration/fps/resolution/seed 的统一表未找到）
- 能力以 **各 tool 的 list 返回 schema** 为准；不支持的字段不得硬塞
- 画布已强调：OpenWorks 工具名 **不是**「视频模型 ID」，不可回退冒充其它供应商

在官方文档缺失的前提下，本审计写明：

> **官方无公开生视频 API 文档**（无独立 OpenWorks video guide）。仅存在工具网关实测路径；视频参数必须从 `tool/list` 的 per-tool schema 读取，禁止用 TAMS DIFFUSION 或其它供应商字段顶替。

## 5) LoRA

- OpenWorks **不是** TAMS `lora.items` 协议
- 工具若自带 LoRA 类输入，只能出现在该工具 schema 中；多数生图工具实测**无**通用 LoRA 强度字段
- 画布铁律：OpenWorks 工具 **不能**挂 TAMS 模型 LoRA；需要 LoRA 时走 **TAMS** 数字模型 ID + Bearer

**不支持 → 应拒绝**（隐藏挂载控件，禁止静默剥离后假成功）。

## 6) seed / steps / cfg / size

- **无官方全局参数表**
- 以 `tool/list` 各工具 inputs 为准；常见可能含 width/height/count/prompt
- 对未声明的 `seed`/`steps`/`cfg`：**不要发送**；发送导致的上游错误原样暴露

## 7) 计费 / 402 / 余额线索

- 公开 OpenWorks 文档**未**提供 credits/402 专页
- 工具 list 可能含 estimated compute cost（skills 文案）
- 欠费/鉴权失败：保留上游 `code`/`message`（画布曾见业务 JSON）；**禁止** fallback 到 TAMS 或其它供应商

## 与 TAMS 对照（防张冠李戴）

| 项 | OpenWorks | TAMS |
|----|-----------|------|
| 产品 | 预设 **工具** API | **模型/Jobs/Workflow** API |
| 鉴权头 | `Echo-Access-Key` | `Authorization: Bearer` 或 RSA |
| Key 形态 | `ak_tensor_…` | 应用 Bearer Token |
| 目录 | `/tool/list` | 无全量 list；`/v1/models/{id}` |
| 生成 | `/task` + `/task/query` | `/v1/jobs` + stages DIFFUSION |
| LoRA | 工具可选字段 / 常无 | `lora.items[].weight` |
| 历史角标 | 可写「OpenWorks」 | 仅 TAMS 接通后写 TAMS/模型 |

## 本轮失败记录

| 工具 | 结果 |
|------|------|
| Grok CLI | **401** |
| 多条 openworks 文档 URL curl | **404/403** |
| GitHub skills raw | **404** |
| 公开检索 | **无**独立官方 OpenWorks OpenAPI 手册 |

## 2026-10-15 02:40 (UTC+8) 实测核对：tool/list 是否有官方「工具类型/输出媒体」字段

- 实测：`POST https://openapi.tensor.art/openworks/v1/tool/list`（Header `Echo-Access-Key`，body `{}`）。第一次 HTTP 500：`{"code":13,"message":"failed to list tools: failed to fetch mapping: Get \"https://config-cdn.qiandaoapp.com/tusi_tensor_tools/mapping.json\": context deadline exceeded (Client.Timeout exceeded while awaiting headers)"}`；重试 HTTP 200。GET 会回 500 `{"code":12,"message":"Method Not Allowed"}`。国内 `openapi.tusiart.cn` 同样 200，23 个工具，内容一致。
- 原始响应：`docs/evidence/openworks-tool-list-2026-10-15.json`、`docs/evidence/openworks-tool-list-cn-2026-10-15.json`（不含密钥）。
- 每个工具的顶层键（23/23 一致）：`name, description, taskType, inputs, outputs, estimatedCost, tags`。inputs 项键：`type, description, format, schema`。**inputs 没有参数名**，只靠 description 区分。
- 官方输出媒体字段：`outputs[].format`，取值只有 `"video"` / `"image"`。视频 8 个：text2video_wan22/wan27/ltx23、image2video_wan22/wan25/wan27/ltx23、live_wallpaper。示例：
  - `text2video_wan22`：`"outputs":[{"type":"FILE","description":"result video","format":"video"}]`，`"tags":["video","text2video"]`
  - `live_wallpaper`：`"outputs":[{"type":"FILE","description":"result video","format":"video"}]`，`"tags":["wallpaper"]`
  - `strong_text2image_wan27`：`"outputs":[{"type":"FILE","description":"image result","format":"image"}]`
- 不可靠的字段：`taskType` 只有 `TENSOR_ART_V1`/`TOOLS`，不区分媒体（live_wallpaper 是 TOOLS）；`tags` 是自由标签，live_wallpaper 不带 "video"。
- 官方文档：Tensor-Art/tensorart-skills（默认分支 master；之前 404 是因为路径用了 main）`skills/tensorart-generate/SKILL.md` 只写了字段列表 "each with `name`, `description`, `inputs`, `outputs`, `estimatedCost`, and `tags`"，没有定义 `outputs[].format` 的枚举。所以 `format` 的取值以实测为准。
- 结论：判断是否为视频工具用 `outputs.some(o => o.type==='FILE' && o.format==='video')`，不用关键词。参数仍按 inputs 的位置和 description 发送。
