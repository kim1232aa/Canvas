# Tensor.Art = OpenWorks only（2026-10-17 Asia/Tokyo）

## 官方真出图接口（非 TAMS / 非 chat tools 冒充）

来源（当日抓取）：
- https://raw.githubusercontent.com/Tensor-Art/tensorart-skills/master/skills/tensorart-generate/SKILL.md
- https://raw.githubusercontent.com/Tensor-Art/tensorart-skills/master/skills/tensorart-generate/scripts/_api.py
- https://github.com/Tensor-Art/tensorart-skills

| 项 | 值 |
|---|---|
| Base（ak_tensor_） | `https://openapi.tensor.art/openworks/v1` |
| Base（ak_tusi） | `https://openapi.tusiart.cn/openworks/v1` |
| Auth | Header `Echo-Access-Key: <access key>` |
| 目录 | `POST /tool/list` body `{}` |
| 创建 | `POST /task` body `{ toolName, inputs: [{type,value}, ...] }` |
| 轮询 | `POST /task/query` body `{ taskIds: [...] }` |

画布路径：`provider=openworks` → `SchemaProviderDriver` → `/api/schema-provider/openworks/submit` → 上游 `/task`。

## 本地密钥

`.env`：`TENSORART_API_KEY` / `TENSORART_KEY` 均为 `ak_tensor_…`（全文不落盘）。密钥槽 `tensorartKey` 与 OpenWorks 共用。

## 本批清理（下线 TAMS 双轨入口）

- 底模下拉 / 参数面板 / 模型中心：去掉「Tensor.Art 模型 API（TAMS）」入口，只留 OpenWorks
- EngineRegistry：不再注册 `TensorArtDriver`
- `/api/tensorart/generate`：410，提示改走 OpenWorks submit（不再执行 TAMS `/v1/jobs`）
- 设置页：tensorart 槽改成 OpenWorks 文案与基址；连通性用 `/tool/list` 测 ak_
- 画布宽高/张数别名：`width`→`image width`，`height`→`image height`，`count`→`result image count`

还原包：`/workspace/canvas/temp/backups/canvas-restore-tensorart-ow-0527.tgz`

## 当日实测（本地）

| 调用 | 结果 |
|---|---|
| 直连 `POST …/openworks/v1/tool/list` + Echo-Access-Key | **HTTP 200**，`code:0`，目录可读 |
| 直连 / 经画布 `POST …/openworks/v1/task` 同 Key | **HTTP 401** 原文 `{"code":16,"message":"failed to get user by access key: access key not found"}` |
| `POST /api/tensorart/generate`（旧 TAMS） | **HTTP 410** 本地拦截，提示改走 OpenWorks |

结论：接线与请求体形状已对齐官方；当前 `.env` 的 `ak_tensor_…` 能列目录但不能建任务（上游 401）。前端点运行会原样看到该 401，不算 PASS_GENERATION。需换有效 OpenWorks Access Key 后再拍三张证据图。

## 浏览器验收清单（Key 恢复后）

1. 干净板：Checkpoint + KSampler + Save Image（拓扑不改）
2. 底模服务商选 **Tensor.Art OpenWorks**（不要再选 TAMS）
3. 模型：`photoreal_studio_z_image` 或 `anime_lab_wai_illustrious`（模型中心 openworks 目录）
4. 正向提示词；宽高 512；batch/张数 1；**清空** seed/steps/cfg/LoRA（探针拦截）
5. 点运行 → 图落保存节点 → 历史成功卡缩略图
6. 证据目录：`/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-tensorart-openworks-20261017/`（workflow / node / history）
