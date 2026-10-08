# T7 Agnes AI 验收报告 — BLOCKED_CONFIG

日期：2026-10-08。验收方式：本地真实前端 `http://127.0.0.1:3000/`，通过浏览器点击工作流运行；不是终端直调 API。

## 结论

**BLOCKED_CONFIG**。前端真实提交到了本地 `/api/engine/agnes/generate` 路由，但当前运行环境没有可用 Agnes API Key。最新一次本地返回：

`未配置 agnes API 密钥（AGNES_KEY / 设置面板 / x-agnes-key）。`

`executionTrace: []`，因此请求没有到达 Agnes 上游。这不是余额不足，也不是 Agnes 上游鉴权失败。

## 当前官方字段核对

2026-10-08 再次核对 AgnesAI-Labs 官方资料：

- 官方模型：`agnes-image-2.5-flash`
- Endpoint：`POST /v1/images/generations`
- 必填：`model`、`prompt`、`size`
- `size`：`1K / 2K / 3K / 4K`
- 可配 `ratio`：`1:1 / 3:4 / 4:3 / 16:9 / 9:16 / 2:3 / 3:2 / 21:9`
- 当前官方资料没有把 ComfyUI `width / height / seed / negative_prompt / steps / cfg / sampler / scheduler / denoise / loras` 列为该图像 endpoint 字段。

来源：
- https://github.com/AgnesAI-Labs/skills/blob/main/agnes-ai-models/references/model_catalog.md
- https://github.com/AgnesAI-Labs/skills/blob/main/agnes-ai-models/SKILL.md

因此本轮同步修正了旧测试中“Agnes width/height 可直接编辑并映射 size”的错误假设：Image 2.5 Flash 应使用 `size + ratio`；旧 `agnes-image-2.1-flash / 2.0-flash` 只保留 legacy compatibility，未核实字段保持 `unverified`。

## 本轮真实前端样本

- Provider：`agnes`
- Model：`agnes-image-2.1-flash`（旧兼容模型，仅用于暴露当前配置终态）
- Prompt：`A glass terrarium library suspended above a mossy canyon at dawn, tiny brass ladders, mist between miniature shelves, soft volumetric sunlight, intricate editorial illustration`
- Width / Height：画布旧值 `1024 × 1024`
- 旧画布残留 Negative Prompt、Seed `314159`、Steps `24`、CFG `3.2`、resolution `1k` 没有被静默当作 Agnes 2.5 官方字段；执行记录逐项写入 `parameterOmissions`。
- 本地配置阶段直接返回缺 Key，没有生成图片。

## 边界

配置有效 Agnes Key 后，应改用官方当前模型 `agnes-image-2.5-flash`，用新的独立样本和 `size + ratio` 从前端重新运行。只有真实图片返回才可进入 PASS_GENERATION；只有上游业务体明确余额/额度不足时才可记 PASS_BILLING。
