import os

# 1. UNRESOLVED_ISSUES.md
unresolved = """# 项目已知与已解决问题跟踪表 (UNRESOLVED_ISSUES.md)

## 最新修复与审计记录 (2026-09-26)

### 1. 彻底清除 Civitai 逆向工作流抽取中的静默兜底与虚假成功 (已修复)
- **现象描述**：当输入无效的 Civitai 图片链接或原站元数据不存在/已被删除时，`/api/civitai/extract-workflow` 此前会静默回退至硬编码的 `asian woman` 默认 Prompt 并生成虚假 Preset。
- **根因分析**：`fetchCivitaiRealImageMeta` 缺少对 `genData` 与 `imgGet` 为空的判断，导致流程静默回退。
- **修复方案**：
  1. `fetchCivitaiRealImageMeta` 在未获取到有效生成元数据时明确返回 `{ error: "Civitai 页面未找到该图片的生成元数据", status: 404 }`。
  2. `/api/civitai/extract-workflow` 拦截所有 `civData.error` 并以原始 HTTP 状态码直接返回透传上游错误，严禁任何兜底。
  3. 支持对 `civitai.red` / `civitai.com` 镜像链接的真实图像解析。

### 2. Civitai Krea 2 架构 Checkpoint URN 正确归一化 (已修复)
- **现象描述**：带有空格的 `Krea 2` 基础模型在 `normalizeCkpt` 过滤时因只匹配 `krea2` 与 `krea-2` 而漏掉，导致被归类为 `unknown_model`。
- **修复方案**：`normalizeCkpt` 的匹配条件调整为包含 `krea`，精准归一化至 `urn:air:krea2:checkpoint:civitai:2726029@3091481`。

### 3. 上游错误透明透传（严禁黑盒美化与虚假自愈）(已修复)
- **原则**：所有服务商（Civitai、Agnes AI、Fal.ai、Gemini、SenseNova）返回错误时，系统以原 HTTP 状态码及原始错误文本透传给前端，不做任何遮蔽或自愈掩盖。

---
*状态：所有已知问题已全面审计并修复完成，全栈透传无兜底。*
"""

with open('UNRESOLVED_ISSUES.md', 'w', encoding='utf-8') as f:
    f.write(unresolved)
print("Updated UNRESOLVED_ISSUES.md")

# 2. HANDOVER.md
handover = """# 模块交接与架构说明文档 (HANDOVER.md)

## 核心架构原则

1. **绝对禁止静默兜底与黑盒虚假成功**：
   - 当 API 请求、模型抽取或服务商接口执行失败时，系统**必须**立即透明透传上游返回的真实错误信息与 HTTP 状态码，禁止硬编码默认提示词、禁止隐蔽容灾降级。
2. ** Civitai 原生 URN 解析与逆向工作流**：
   - 支持从 Civitai 网页 `__NEXT_DATA__` 解析核心 `genData` 与 `imgGet`，提取底模、LoRA 列表、Sampler、Scheduler、CFG、Seed 及 Prompt。
   - 对 Krea 2、FLUX.1、Pony、SDXL 等全量架构进行精准 URN 归一化。
3. **前端点击导向与真实 UI 验证**：
   - 资产管理与历史记录删除操作均具有直接冒泡拦截 (`e.stopPropagation`) 与乐观 UI 状态更新。

---
*更新时间：2026-09-26*
"""

with open('HANDOVER.md', 'w', encoding='utf-8') as f:
    f.write(handover)
print("Updated HANDOVER.md")

# 3. PITFALLS.md
pitfalls = """# 防踩坑与排错指南 (PITFALLS.md)

## 避坑指南

1. **严禁静默容灾与假成功**：
   - 切勿在 Catch 块或条件为空时返回硬编码的 Prompt（如 `asian woman`）或默认 Preset，这属于严重违规行为。
2. **Civitai 镜像域名处理**：
   - 用户输入的 `civitai.red` 或 `civitai.work` 链接需统一代理至 `https://civitai.com/images/:id` 抓取 HTML 内的 `__NEXT_DATA__` JSON，因为镜像站常有 Cloudflare 人机验证阻拦。
3. **Krea 2 架构模型字符串匹配**：
   - Civitai 元数据中的 `baseModel` 可能为 `"Krea 2"`（带空格），匹配规则须覆盖 `krea` 关键词。

---
*更新时间：2026-09-26*
"""

with open('PITFALLS.md', 'w', encoding='utf-8') as f:
    f.write(pitfalls)
print("Updated PITFALLS.md")

# 4. ENGINE_LORA_SPECIFICATION.md
engine_spec = """# 引擎与 LoRA 规范说明 (ENGINE_LORA_SPECIFICATION.md)

## 支持引擎列表

1. **Civitai 官方原生引擎**：
   - 原生支持 Civitai 算力集群调度，模型表达形式为 `urn:air:<family>:<type>:civitai:<modelVersionId>@<versionId>`。
   - 包含 Krea 2 Turbo (`urn:air:krea2:checkpoint:civitai:2726029@3091481`)、FLUX.1 Dev (`urn:air:flux1:checkpoint:civitai:618692@691639`)、Pony V6 (`urn:air:sdxl:checkpoint:civitai:257749@290640`) 等。
2. **Agnes AI (ApiHub) 引擎**：
   - 支持 `agnes-image-2.5-flash` 闪电生图，及 `agnes-3.0-flash` 深度推理。
3. **Fal.ai 极速 Serverless 引擎**：
   - 支持 FLUX.1 [dev] / [schnell] 极速出片。

## 错误处理规范
- 上游引擎执行报错时，直接透传 HTTP 状态码与响应体，严禁伪造默认图像或提示词。

---
*更新时间：2026-09-26*
"""

with open('ENGINE_LORA_SPECIFICATION.md', 'w', encoding='utf-8') as f:
    f.write(engine_spec)
print("Updated ENGINE_LORA_SPECIFICATION.md")
