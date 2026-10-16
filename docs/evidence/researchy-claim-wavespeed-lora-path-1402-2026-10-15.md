# Researchy 自领核对 · WaveSpeed LoRA path 写法 + 1402 · 2026-10-15 06:30 (Asia/Tokyo) / 北京 05:30

来源：群本地 transcript 空；docs 自 06:02 补查后无新改动。upstream.log 新增两次 WaveSpeed 真实提交（21:24Z krea-v2/turbo-lora、21:27Z z-image/turbo-lora）均 failed code 1402。

## 方法
1. agy-search `search_web`（线索）
2. curl 官方页 200：lora-training-usage、krea-v2-turbo-lora、z-image-turbo-lora、error-codes；HF API 实测
3. 原文落盘：`/workspace/audit-v2-raw/researchy-30m-0630/`

## 结论
1. 提交体尺寸字段符合官方（Krea=aspect_ratio+resolution；z-image=size "768*1344"），LoRA 原样透传。
2. 失败原因是测试 path `https://huggingface.co/krea/krea2-realism-lora`：HF API 401（不存在/不公开），krea 官方公开 LoRA 列表里没有 realism；而且它是 repo 页面 URL，不是 `.safetensors` 直链。官方 1402 = Media Access Failed（URL 需公开可访问）。
3. 写法按模型页不同：Krea V2 Turbo LoRA 页只写「direct .safetensors URL」；z-image-turbo-lora 页写 owner/name 或直链；通用指南写 HF owner/name 或直链。
4. 画布不需要改：不加专用改写，1402 原文照实显示为失败。验收 Krea LoRA 用公开直链，例如 `https://huggingface.co/Comfy-Org/Krea-2/resolve/main/loras/krea2_darkbrush.safetensors`（实测 200）。

已改：`docs/provider-api-audit-v2/wavespeed.md`（追加 06:30 补查）、`docs/provider-schema-drafts/wavespeed.json`（lora.path 按模型页）。钥匙未写入。
