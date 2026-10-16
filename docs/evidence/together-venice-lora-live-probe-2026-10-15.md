# Together / Venice LoRA live probes · 2026-10-15

Keys from `.env` (TOGETHER_API_KEY, VENICE_API_KEY), sent as `Authorization: Bearer [REDACTED]`. Bodies verbatim (no secrets inside).

## together_flux2_image_loras
- time (box, +0800): 2026-10-15 05:33:32 +0800
- request: `POST https://api.together.xyz/v1/images/generations`
```json
{"model":"black-forest-labs/FLUX.2-dev","prompt":"a red fox in snow","width":512,"height":512,"steps":4,"n":1,"image_loras":[{"path":"https://huggingface.co/XLabs-AI/flux-RealismLora","scale":0.8}]}
```
- HTTP 401
```
{
  "id": "p5F7BDS-2kFHot-a4a9b3f66c394e63-IAD",
  "error": {
    "message": "Invalid API key provided. You can find your API key at https://api.together.ai/settings/api-keys.",
    "type": "invalid_request_error",
    "param": null,
    "code": "invalid_api_key"
  }
}
```

## together_flux2_no_lora
- time (box, +0800): 2026-10-15 05:33:32 +0800
- request: `POST https://api.together.xyz/v1/images/generations`
```json
{"model":"black-forest-labs/FLUX.2-dev","prompt":"a red fox in snow","width":512,"height":512,"steps":4,"n":1}
```
- HTTP 401
```
{
  "id": "p5F7BFr-2kFHot-a4a9b3f76ba072e1-SEA",
  "error": {
    "message": "Invalid API key provided. You can find your API key at https://api.together.ai/settings/api-keys.",
    "type": "invalid_request_error",
    "param": null,
    "code": "invalid_api_key"
  }
}
```

## venice_custom_loras
- time (box, +0800): 2026-10-15 05:33:32 +0800
- request: `POST https://api.venice.ai/api/v1/image/generate`
```json
{"model":"venice-sd35","prompt":"a red fox in snow","width":512,"height":512,"loras":[{"path":"https://huggingface.co/XLabs-AI/flux-RealismLora","scale":0.8}]}
```
- HTTP 400
```
{"details":{"_errors":["Unrecognized key(s) in object: 'loras'"]},"error":"Invalid request parameters","issues":[{"code":"unrecognized_keys","keys":["loras"],"path":[],"message":"Unrecognized key(s) in object: 'loras'"}]}
```

## venice_lora_strength
- time (box, +0800): 2026-10-15 05:33:32 +0800
- request: `POST https://api.venice.ai/api/v1/image/generate`
```json
{"model":"venice-sd35","prompt":"a red fox in snow","width":512,"height":512,"lora_strength":50}
```
- HTTP 402
```
{"error":"Insufficient USD or Diem balance to complete request. Visit https://venice.ai/settings/api to add credits."}
```

## 结论
- Together：两次都是 HTTP 401 `invalid_api_key`（无 LoRA 的对照请求也是 401）→ .env 中的 key 无效，**上游对 image_loras 的实际行为未测，状态：待确认**。本地拦截继续以官方参数页原文为依据（https://docs.together.ai/docs/inference/images/parameters.md）。
- Venice：自定义 `loras[]` → HTTP 400 `Unrecognized key(s) in object: 'loras'`（上游校验层拒收，与官方 OpenAPI 一致）→ 保留本地拦截，依据改为供应商表数据（官方 OpenAPI + 本次 live 原文）。
- Venice：`lora_strength:50` → HTTP 402 余额不足（参数通过校验后才到计费层）→ lora_strength 字段被接受，继续按 Schema 发送。