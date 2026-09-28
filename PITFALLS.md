# 防踩坑与排错指南 (PITFALLS.md)

## 避坑指南

1. **严禁静默容灾与假成功**：
   - 切勿在 Catch 块或条件为空时返回硬编码的 Prompt（如 `asian woman`）或默认 Preset，这属于严重违规行为。
2. **Civitai 镜像域名处理**：
   - 用户输入的 `civitai.red` 或 `civitai.work` 链接需统一代理至 `https://civitai.com/images/:id` 抓取 HTML 内的 `__NEXT_DATA__` JSON，因为镜像站常有 Cloudflare 人机验证阻拦。
3. **Krea 2 架构模型字符串匹配**：
   - Civitai 元数据中的 `baseModel` 可能为 `"Krea 2"`（带空格），匹配规则须覆盖 `krea` 关键词。

---
*更新时间：2026-09-26*
