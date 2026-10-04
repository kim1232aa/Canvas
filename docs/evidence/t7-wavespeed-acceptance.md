# T7 WaveSpeed 验收报告 — PASS_GENERATION

日期:2026-10-05(UTC+8)。验收方式:真实前端(ComfyCanvas Studio @ 127.0.0.1:3000)+ 真实 WaveSpeed API,
由 browser-harness(CDP)自动化驱动完整 UI 流程,非直连 API 测试。

## 结论

**PASS_GENERATION** — 两次独立出图(05:13:40、05:33:39),第二次全流程由自动化脚本完整驱动。

## 验收链路(证据)

1. 底模中心 → WaveSpeed 服务商筛选 → 实时目录返回 **50 个模型**(`GET /api/v3/models`,与官方目录接口数量一致,无本地硬编码清单)。
2. 按 ID 选用 `wavespeed-ai/krea-v2/turbo-lora` → 弹窗关闭,节点变为「加载底模 (WaveSpeed)」,节点下拉可见 50 个模型。
3. 「读取所选模型的官方 Schema」→ 渲染官方 inputSchema(loras maxItems 3 {path,scale 0-4}、aspect_ratio 15 枚举、resolution 1k/2k、seed、strength 等),来源 https://api.wavespeed.ai/api/v3/models。
4. 「API 参数 · JSON」写入(符合官方 Schema 真实能力):
   ```json
   {"loras":[{"path":"https://huggingface.co/Comfy-Org/Krea-2/resolve/main/loras/krea2_darkbrush.safetensors","scale":0.9}],"aspect_ratio":"1:1","resolution":"1k","seed":7}
   ```
   LoRA 为 Comfy-Org/Krea-2 官方仓库公开权重(经 curl 验证 302 直连 CDN 无需鉴权)。
5. 点击「运行工作流」→ 服务端提交 `POST https://api.wavespeed.ai/api/v3/wavespeed-ai/krea-v2/turbo-lora`(密钥仅服务端持有,日志中 wsk_...awlI 掩码)。
6. 轮询 `GET /api/v3/predictions/{id}/result` → status completed,inference 33.3s,输出 CloudFront URL。
7. 「保存图像」节点展示生成图;历史记录写入 `data/history.json`,含 actualRequest(endpoint/parameters)、mapping(steps=8 未提交,原因透明记录)、loras、seed=7。
8. 两次生成同 seed 构图一致(黑伞女子+黑猫水墨风,符合 darkbrush LoRA 触发风格),证明 seed 与 LoRA 参数真实生效。

## 关键日志(logs/upstream.log,掩码)

```
21:13:03 submit  /api/schema-provider/wavespeed/submit → api.wavespeed.ai/api/v3/wavespeed-ai/krea-v2/turbo-lora 200
21:13:06~39 poll /api/schema-provider/wavespeed/tasks/5622053f… → /api/v3/predictions/5622053f…/result 200 completed
21:33:20~39 run2 任务 e80476ea4e374a91b39e57bb0a3e6eed 同样链路 200 completed
```

## 截图证据(docs/evidence/shots/)

- t7-ws-10-canvas.png 初始画布;t7-ws-11-hub-open.png 底模中心;t7-ws-12-hub-wavespeed.png WaveSpeed 目录
- t7-ws-13-model-applied.png 模型已应用;t7-ws-14-schema.png 官方 Schema;t7-ws-15-json.png LoRA JSON 已写入
- t7-ws-16-running.png 点击运行;t7-ws-21-result.png 保存图像节点出图;t7-ws-22-image-run2.jpg 第二次生成原图

## 备注

- 目录自动刷新曾出现 5s 超时(status 0):'all' 聚合模式等待全部供应商,Hugging Face 在沙箱网络下偶发 fetch failed 拖慢聚合;WaveSpeed 单供应商目录稳定 200(50 条)。
- 画布参数映射透明化:steps/cfg 未进入请求时在 mapping 中逐条记录原因,无静默丢弃。
