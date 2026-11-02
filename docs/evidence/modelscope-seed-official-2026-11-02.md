# ModelScope seed 字段核实（2026-11-02）

## 主张
魔搭 API-Inference 文生图请求体有可选字段 `seed`。

## 官方来源（本轮新找到）
- URL: https://modelscope.csdn.net/691c36ee82fbe0098caca391.html
- 作者账号: **魔搭ModelScope社区**（官方社区号，非个人博客）
- 标题: 码上生花：用API链接Qwen-Image系列及衍生LoRA生态模型
- 发布: 2025-11-18
- 章节: 「API 参数说明」→ Qwen-Image 文生图（包括衍生LoRA）API 参数

| 参数名 | 说明 | 必须 | 类型 | 示例 | 取值范围 |
| seed | 随机种子 | 否 | int | 42 | [0, 2³¹-1] |

同文亦列 negative_prompt / size / steps / guidance。

## 对照
- docs intro SPA（https://www.modelscope.cn/docs/model-service/API-Inference/intro）：curl 仍为空壳；OpenAPI 404。
- 模型卡 README：只有本地 Diffusers `manual_seed`，不是 REST 字段表。
- 国际站超大种子 400 原文旁证：`seed must be in [-1, 2147483647]`（含 -1；与上表下限 0 不完全一致）。
- 个人 CSDN 文（raoxiaoya）有同类表，此前已排除；**本条以官方社区号文为准**。

## 产品结论
1. **字段存在**：可标「官方社区号已核有 seed」；提交时该发则发。
2. **范围**：官方社区号写 `[0, 2³¹-1]`；国际站错误体写 `[-1, 2147483647]`。前端可按官方表做提示，**不把冲突升成死拦**；超范围失败原样显示。
3. 此前只盯 intro 空壳/个人社区文 = 检索面不够（用户纠正成立）。

## 下一动作
动态 Schema：魔搭 seed 可选 int；范围提示用官方社区号表；不硬拦 -1/边界歧义。

## Researchy 三路再核（2026-11-02 ~19:00 JST）
- **结论：同意画布。** 该页作者为 `coc_modelscope` / 魔搭ModelScope社区（官方社区号）。现页表格原文：`seed | 随机种子 | 否 | int | 42 | [0, 2³¹-1]`。
- 另：官网 intro 浏览器渲染参数表同范围 `[0,2^31-1]`（中英文均已拍到）。
- 三路搜索：WebSearch/Brave 更易命中个人文 raoxiaoya（同表）；agy 归纳范围一致；**定稿以官方社区号文 + intro 现页为准**，不以个人文升格。
- API400 旁证 `[-1,2147483647]` 与表下限冲突 → **不硬拦**，失败原样显示。
- VERIFY 状态：已核一致。

## 主证升级（2026-11-02 ~19:00 JST）
Researchy 浏览器渲染确认：中英文官网 API-Inference intro 参数表现页均有 seed（Random seed，可选 int，示例 12345，`[0,2^31-1]`）。
- https://www.modelscope.cn/docs/model-service/API-Inference/intro
- https://www.modelscope.ai/docs/model-service/API-Inference/intro?lang=en
截图：`temp/e2e/video-schema/modelscope-seed-2026-11-02i/`
官方社区号《码上生花》改为辅证。产品结论不变。
