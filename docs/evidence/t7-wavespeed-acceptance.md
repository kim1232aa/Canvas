# T7 WaveSpeed 验收报告 — PASS_GENERATION

## 2026-10-12 官方契约复审（未调用生成/上传）

旧 agent-115 最后停在匿名目录 GET 的 HTTP401，不是成功目录；没有 Edit/Write/最终交付。旧成功官方正文可继承，当前历史 PASS_GENERATION 只限原 Krea 请求；本轮不证明当前代码重新出图。

- 继承成功正文 https://wavespeed.ai/docs/api-authentication ：“`Authorization: Bearer YOUR_API_KEY`”；https://wavespeed.ai/docs/submit-task ：`POST https://api.wavespeed.ai/api/v3/{model_id}`；https://wavespeed.ai/docs/get-result ：`GET .../api/v3/predictions/{task-id}/result`，completed 返回 outputs，failed/cancelled/timeout/deleted 终止。`schemaProviders.ts:9-10,235-238,325-345` 与 `SchemaProviderDriver.ts:108-158` 匹配主协议与终态。
- 新读 https://wavespeed.ai/models/wavespeed-ai/krea-v2/turbo-lora ：“`Up to 3 LoRA objects. Each object uses {path, scale}`”；resolution 为 1k/2k，image 为参考图 URL，strength 0–1；`schemaProviders.ts:289-317` 在 Schema 可取时的 image_url→image、denoise→strength、LoRA 映射匹配。新读 https://wavespeed.ai/docs/docs-api/wavespeed-ai/krea-v2-turbo-lora 示例使用 `TASK = body.data ?? body` 与 result 同样归一化。
- 旧匿名 https://api.wavespeed.ai/api/v3/models HTTP401 原文：“`Missing API key. Send it as: Authorization: Bearer <your API key>.`” 只证明匿名请求缺鉴权；不判定已配置账户目录失败。未使用真实 key 重新读取目录，当前 catalog model_run Schema 仍未完整网络重验。

串行待修：

- HIGH（MuAPI 共用）：`server.ts:2359` 注入 async recordHistoryItem，`schemaProviders.ts:357` 却 saved.push(dep.record(...)) 未 await，Promise 序列化成 `{}`。本轮无网络 fixture 实测 save-result 返回 `{"historyItems":[{}],"transientOutputs":[]}`。建议改 `saved.push(await dep.record(...))`，同时对 record 失败保持 transient URL / warning；`SchemaProviderDriver.ts:131-135` 因此不能取得持久化 URL。
- MEDIUM：官方模型页/参考示例同时容纳 wrapped/flat response，当前 `schemaProviders.ts:326,342` 只读取 data.data.id / data.data。无网络实际 route fixture 上游 `{id:'official-flat-task'}` 导致本站 HTTP200 + upstream-protocol error “上游提交响应没有任务 ID”。建议 WaveSpeed `task=data.data ?? data`，submit/poll 共用归一化；真实异常结构仍报告，不伪造 ID。
- MEDIUM：`SchemaProviderDriver.ts:51,136` 仅图像能力/固定 mediaType=image，但 `schemaProviders.ts:64` 可列视频；目录可选不等于视频链路已接通。建议串行确认视频分发与媒体类型，不把视频 URL 当图片。

历史第23条“同 seed 风格一致证明 LoRA 生效”证据不足：只能证明请求包含 LoRA、输出存在；缺无 LoRA 对照或上游应用证据，不能独立证明权重实际应用。原记录保留但以此收窄。

定向既有 5 files / 31 tests PASS，不覆盖上述 async record/flat 响应缺口；仍待当前版本前端重新出图、LoRA 对照、图生图、历史刷新/复用/云项目。

## 以下为保留的历史记录

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
