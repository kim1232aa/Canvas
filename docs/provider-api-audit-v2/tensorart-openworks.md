# Tensor.Art OpenWorks — API 审计
2026-10-15 重新调查，与旧版无关。调查时间 04:41–04:44 北京时间（box 时钟）。
**与 TAMS 是两套不同的 API**：不同 host、不同鉴权头、不同请求模型。不可张冠李戴。

| 项 | 结论 | 等级 | 证据 |
|---|---|---|---|
| ⚠ 搜索结果 | agy-search 与 WebSearch **两次都把 OpenWorks 答成 TAMS**（tensorart.cloud /v1/jobs/workflow/template）——这正是要避开的混淆 | 仅搜索（错误） | |
| 文档入口 | tensor.art 站点对 curl/headless 返回 Cloudflare 403/挑战页，网页文档**未能读取**。唯一可读官方来源：Tensor-Art 官方 GitHub 仓库 `tensor-art/tensorart-skills`（README 称 "TensorArt OpenAPI"） | 实测 | https://github.com/tensor-art/tensorart-skills |
| Host | `_api.py` 原文：`"ak_tusi": "https://openapi.tusiart.cn/openworks/v1"`, `"ak_tensor": "https://openapi.tensor.art/openworks/v1"`——**按 access key 前缀 `ak_tensor`/`ak_tusi` 选 host**（这是 OpenWorks，不是 TAMS） | 官方原文(仓库代码) | skills/tensorart-generate/scripts/_api.py |
| 鉴权 | 头 **`Echo-Access-Key: <key>`**（不是 Bearer）；所有调用为 POST JSON | 官方原文(代码) + 实测 401 `{"code":16,"message":"access key is not exist"}` | |
| 机器可读 Schema | **工具级**：`POST /openworks/v1/tool/list {}` **无 key 200**，返回 23 个 tool，每个含 name, description, taskType(TENSOR_ART_V1/TOOLS), **inputs[{type: STRING/INTEGER/NUMBER/BOOLEAN/ARRAY/OBJECT/FILE, description, format, schema}]**, outputs, estimatedCost。未找到 OpenAPI 文件 | 实测 | |
| 模型/LoRA 目录 | 未找到（OpenWorks 是「预制工具」模型，不暴露底模/LoRA 选择；已查 tool/list 全部 inputs 描述，lora/seed/step/cfg/guidance/sampler 出现次数均为 0） | 实测 / 未找到 | |
| 生成端点 | `POST /openworks/v1/task {"toolName", "inputs":[{type, value}, ...]}`——**inputs 是按位置对应 tool 定义的数组**，不是命名字段 | 官方原文(SKILL.md + create_task.py) | |
| 参数 | 只有工具自己声明的输入（如 prompt/width/height/count）；**无 steps/seed/CFG/sampler/LoRA 可设** | 实测(tool/list) | |
| 异步/轮询 | `POST /openworks/v1/task/query {"taskIds":[id]}`；status: WAITING/QUEUE_WAIT/PARSING/START/PROCESSING → FINISH / EXCEPTION / CANCELED；结果在 outputs | 官方原文(SKILL.md) | |
| 视频 | 部分 tool 有 duration 输入（7 处），属工具级，非通用视频端点 | 实测(tool/list) | |
| 上传 | upload_file.py：先取上传 URL 再 PUT（具体 path 未逐行核） | 官方原文（部分） | |
| 错误/欠费 | 体 `{"code":…, "message":…}`（实测 401/404）；欠费格式未找到（已查 SKILL.md、_api.py 关键词 credit/insufficient） | 实测 / 未找到 | |

结论：OpenWorks 不能承载「LoRA + seed + steps」类参数验收；若画布需要这些，只能走 TAMS（需另一套凭据）。
