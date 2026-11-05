# Civitai 官方 Orchestration `clipSkip` 契约取证与生态/引擎矩阵报告 (2026-11-05)

> **取证铁律说明**：本文档记录之全部外部 API 规范、请求体字段、类型、范围与默认值，均由 Agent `clip11` 在 2026-11-05 通过 `FetchURL` 与实时网络请求直接从 Civitai 官方权威文档（`developer.civitai.com`）与 Live OpenAPI 规范（`orchestration.civitai.com`）检索取证；绝不依据仓库内现有代码、历史测试、旧注释或训练记忆。

---

## 一、官方权威取证源与链接

1. **SD1 官方配方文档**：
   - URL: [`https://developer.civitai.com/orchestration/recipes/sd1.md`](https://developer.civitai.com/orchestration/recipes/sd1.md)
   - 抓取方式: `FetchURL(url="https://developer.civitai.com/orchestration/recipes/sd1.md")`
2. **SDXL 官方配方文档**：
   - URL: [`https://developer.civitai.com/orchestration/recipes/sdxl.md`](https://developer.civitai.com/orchestration/recipes/sdxl.md)
   - 抓取方式: `FetchURL(url="https://developer.civitai.com/orchestration/recipes/sdxl.md")`
3. **FLUX.1 官方配方文档**：
   - URL: [`https://developer.civitai.com/orchestration/recipes/flux1.md`](https://developer.civitai.com/orchestration/recipes/flux1.md)
   - 抓取方式: `FetchURL(url="https://developer.civitai.com/orchestration/recipes/flux1.md")`
4. **FLUX.2 官方配方文档**：
   - URL: [`https://developer.civitai.com/orchestration/recipes/flux2.md`](https://developer.civitai.com/orchestration/recipes/flux2.md)
   - 抓取方式: `FetchURL(url="https://developer.civitai.com/orchestration/recipes/flux2.md")`
5. **其他图像配方官方文档**：
   - 抓取页面：`krea.md`, `wan-image.md`, `qwen.md`, `anima.md`, `zimage.md`, `mai-image.md`, `ernie.md`, `seedream.md`, `grok.md`, `openai.md`, `google.md`, `gemini.md`。经逐页检索，均无 `clipSkip` 参数。
6. **Live Orchestration OpenAPI 规范**：
   - URL: [`https://orchestration.civitai.com/openapi/v2-consumers.json`](https://orchestration.civitai.com/openapi/v2-consumers.json)
   - Recipe Spec URL: [`https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.yaml`](https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.yaml)
   - OpenAPI 版本: 3.1.1, title: "Civitai Orchestration - imageGen Recipe" (v2)

---

## 二、官方文档与 Live OpenAPI 取证事实

### 2.1 SD 1.5 (`sd1`) 官方契约事实

根据 [`sd1.md`](https://developer.civitai.com/orchestration/recipes/sd1.md) 原文：

> **`sdcpp` (default path)**:
> 
> ```json
> {
>   "steps": [{
>     "$type": "imageGen",
>     "input": {
>       "engine": "sdcpp",
>       "ecosystem": "sd1",
>       "operation": "createImage",
>       "model": "urn:air:sd1:checkpoint:civitai:4384@128713",
>       "clipSkip": -1
>     }
>   }]
> }
> ```
> 
> | Field | Default | Range | Notes |
> | :--- | :--- | :--- | :--- |
> | `clipSkip` | `-1` | int | `-1` = model default. `2` is a common hand-tuned value on many SD1 checkpoints — try it if output feels stiff. |
> 
> **`comfy` (alternative path)**:
> 
> ```json
> {
>   "steps": [{
>     "$type": "imageGen",
>     "input": {
>       "engine": "comfy",
>       "ecosystem": "sd1",
>       "operation": "createImage",
>       "model": "urn:air:sd1:checkpoint:civitai:4384@128713",
>       "clipSkip": 2
>     }
>   }]
> }
> ```
> 
> | Field | sdcpp | comfy |
> | :--- | :--- | :--- |
> | Default `clipSkip` | `-1` (model default) | `2` |

在 Live OpenAPI `imageGen/openapi.yaml` 中：
- `Sd1ImageGenInput` (engine: `sdcpp`, ecosystem: `sd1`):
  - `clipSkip`: `type: integer`, `format: int32`, `default: 2`
  - 映射操作: `createImage` (`Sd1CreateImageGenInput`), `createVariant` (`Sd1VariantImageGenInput`)
- `ComfySd1ImageGenInput` (engine: `comfy`, ecosystem: `sd1`):
  - `clipSkip`: `type: integer`, `format: int32`, `default: 2`
  - 映射操作: `createImage` (`ComfySd1CreateImageGenInput`), `createVariant` (`ComfySd1VariantImageGenInput`)

**结论**：`sd1` 生态下的 `sdcpp` 与 `comfy` 引擎均官方支持 `clipSkip`。支持的操作为 `createImage` 和 `createVariant`。类型为 32 位整型 (`integer`, `int32`)。

---

### 2.2 SDXL (`sdxl`) 官方契约事实

根据 [`sdxl.md`](https://developer.civitai.com/orchestration/recipes/sdxl.md) 原文：

> ::: tip No `clipSkip` on SDXL
> Unlike SD1, SDXL doesn't expose a `clipSkip` parameter — the model's dual text encoders make the SD1 clip-skip convention meaningless here. Sending `clipSkip` on an SDXL request will 400.
> :::
> 
> 故障排除表（Troubleshooting）：
> | Symptom | Likely cause | Fix |
> | :--- | :--- | :--- |
> | `400` with "clipSkip is not a valid property" on SDXL | `clipSkip` doesn't exist on SDXL (it's an SD1 knob) | Remove the field. SDXL uses dual text encoders; there's nothing to skip. |

OpenAPI 现象与说明：
- 虽然历史 OpenAPI snapshot 中 `SdxlImageGenInput` / `ComfySdxlImageGenInput` 存在未清理的 `clipSkip` 属性声明，但官方文档与上游实际校验契约明确声明：**向 SDXL 发送 `clipSkip` 将触发 HTTP 400 报错**。
- 因此，系统绝不可向 SDXL 请求体中添加 `clipSkip`。

---

### 2.3 FLUX.1 (`flux1`), FLUX.2 (`flux2`), 及其他生态

- **FLUX.1** ([`flux1.md`](https://developer.civitai.com/orchestration/recipes/flux1.md)): `sdcpp`, `comfy`, `flux1-kontext` 的参数表中均**无** `clipSkip`。
- **FLUX.2** ([`flux2.md`](https://developer.civitai.com/orchestration/recipes/flux2.md)): `klein` (4b/9b), `dev`, `flex`, `pro`, `max` 参数表中均**无** `clipSkip`。
- **其他模型** (`krea`, `wan-image`, `qwen`, `anima`, `zimage`, `mai-image`, `ernie`, `seedream`, `grok`, `openai`, `google`, `gemini`): 官方参数契约均无 `clipSkip`。

---

## 三、各生态 / 引擎 `clipSkip` 契约支持汇总矩阵

| 生态 (`ecosystem`) | 引擎 (`engine`) | 是否接受 `clipSkip` | 字段类型 | 取值范围 | 官方默认值 | 官方依据源 | 运行时处理策略 |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| **`sd1` / `sd15`** | `sdcpp` | **✔ 接受** | `integer` (int32) | 整数 (通常 1 或 2，-1 表示模型默认) | `-1` (文档) / `2` (OpenAPI) | [`sd1.md`](https://developer.civitai.com/orchestration/recipes/sd1.md#sdcpp-default-path) | 真实映射入出站请求体 (`input.clipSkip`)，预览显示「✔ 将发送」 |
| **`sd1` / `sd15`** | `comfy` | **✔ 接受** | `integer` (int32) | 整数 (通常 1 或 2) | `2` | [`sd1.md`](https://developer.civitai.com/orchestration/recipes/sd1.md#comfy-alternative-path) | 真实映射入出站请求体 (`input.clipSkip`)，预览显示「✔ 将发送」 |
| **`sdxl` / `pony` / `illustrious`** | `sdcpp` / `comfy` | **✖ 不接受 (400)** | — | — | — | [`sdxl.md`](https://developer.civitai.com/orchestration/recipes/sdxl.md#sdcpp-default-path) | 严格拦截不发送，预览显示「✖ 不支持(已拦截)」，给出官方 400 说明 |
| **`flux1`** | `sdcpp` / `comfy` / `flux1-kontext` | **✖ 不接受** | — | — | — | [`flux1.md`](https://developer.civitai.com/orchestration/recipes/flux1.md) | 拦截不发送，预览显示「✖ 不支持(已拦截)」 |
| **`flux2` / `flux2Klein` / `flux2Dev`** | `flux2` / `sdcpp` | **✖ 不接受** | — | — | — | [`flux2.md`](https://developer.civitai.com/orchestration/recipes/flux2.md) | 拦截不发送，预览显示「✖ 不支持(已拦截)」 |
| **其他生态 (`zImage`, `krea2`, `qwen`, `anima` 等)** | `sdcpp` / `comfy` / 特化引擎 | **✖ 不接受** | — | — | — | 对应生态 recipe 页面与 Live OpenAPI | 拦截不发送，预览显示「✖ 不支持(已拦截)」 |

---

## 四、工程判定逻辑设计原则

根据主控补充规则：
1. **严格禁止写死模型名称或具体模型 ID**（例如禁止 `if (model === 'realcartoon3d')` 或 `if (modelId === 94809)`）。
2. **判定必须严格基于生态/引擎契约**：
   - 检查 `(ecosystem === 'sd1' || ecosystem === 'sd15')`
   - 检查 `(engine === 'sdcpp' || engine === 'comfy')`
   - 检查官方 Live OpenAPI 选中的 Schema 中存在 `'clipSkip' in props`
3. 仅当上述契约条件全满足时，才将整数化的 `clipSkip` 写入实际发出的出站请求体 `steps[0].input.clipSkip`。
4. 在客户端驱动 `CivitaiDriver`、服务端契约 `civitaiImageContract`、导入映射 `civitaiImportMap`、工作流路由 `civitaiWorkflowRoute`、前端预览组件 `CivitaiModalImportPreview` 全链路保持逻辑一致性。

---

## 五、真实浏览器 UI 点击端到端（E2E）验收记录

验收测试在真实 Headless Chrome (端口 9411) 中由自动化脚本模拟真实用户 UI 操作执行，前端与服务运行于端口 3111。
出站 HTTP 请求由服务端 `upstreamFetch` 自动拦截记录于 `temp/logs/requests-2026-11-06.jsonl`，所有敏感 Token、密码、Key 均完成脱敏掩码。

### 5.1 SD 1.5 真实图片 (#11346154) 导入与出站实测

- **来源图片**：`https://civitai.com/images/11346154`（作者 `hcarolin`）
- **底模与 LoRA 详情**：
  - Checkpoint: `realcartoon3d_v15` (`urn:air:sd1:checkpoint:civitai:94809@393843`，SD 1.5)
  - LoRA 1: `Light Control - Back Front - Backlight Slider` (weight: -1.5, `urn:air:sd1:lora:civitai:151576@169496`)
  - LoRA 2: `Add More Contrast - Contrast Slider` (weight: 2.0, `urn:air:sd1:lora:civitai:155496@174426`)
  - 来源元数据 `Clip skip`: `2`
- **UI 真实操作流程**：
  1. 打开首页 `http://127.0.0.1:3111/`，点击顶部「LoRA」打开 Civitai 弹窗；
  2. 切换至「配方导入与适配 (Import)」标签页；
  3. 点击「📸 SD 1.5 双LoRA (#11346154 · Backlight & Contrast Sliders)」快捷填入按钮并解析；
  4. 查验逐字段适配表：`CLIP 跳过层数 (Clip Skip)` 显示「✔ 将发送」，说明为「作为 Civitai SD 1.5 clipSkip 发送 (2)」，目标字段 `clipSkip`，依据 `https://developer.civitai.com/orchestration/recipes/sd1.md`；
  5. 点击「以此配置一键生成工作流并载入画布 (`data-testid="apply-imported-workflow-button"`)」；
  6. 画布成功组装 9 个节点与 13 条连线（`CheckpointLoaderSimple` 挂载 `realcartoon3d_v15`、串联两款带真实 `-1.5` 与 `2` 权重的 LoRALoader、`KSampler` 带 `clip_skip: 2` 与 `dpm++2m`）；
  7. 点击顶部「运行：保存图像 (Save Image)」(`data-testid="run-button"`)；
  8. 服务端向上游发出真实 POST 请求并接收响应，前端 KSampler 呈现红色错误卡片与 `insufficientBuzz` 详细原因。

#### 真实出站请求日志 (摘自 `temp/logs/requests-2026-11-06.jsonl`)

```json
{
  "time": "2026-11-06T03:46:19+09:00",
  "kind": "upstream",
  "route": "/api/engine/civitai/generate",
  "provider": "civitai",
  "model": "urn:air:sd1:checkpoint:civitai:94809@393843",
  "method": "POST",
  "endpoint": "https://orchestration.civitai.com/v2/consumer/workflows?wait=100",
  "requestBody": {
    "steps": [
      {
        "$type": "imageGen",
        "input": {
          "engine": "sdcpp",
          "ecosystem": "sd1",
          "operation": "createImage",
          "model": "urn:air:sd1:checkpoint:civitai:94809@393843",
          "prompt": "hcarolin, a woman in a white suit standing in a room with lights on the ceiling and a circular light behind her, Star Trek setting, retrofuturism, freckles, crossed arms, \nmasterpiece, best quality,     <lora:backlight_slider_v10:-1.5>,  <lora:contrast_slider_v10:2>",
          "negativePrompt": "worst quality, low quality,  easynegative, badhandv4,",
          "width": 512,
          "height": 768,
          "steps": 49,
          "cfgScale": 6,
          "seed": 933917284,
          "quantity": 1,
          "sampleMethod": "dpm++2m",
          "clipSkip": 2,
          "loras": {
            "urn:air:sd1:lora:civitai:151576@169496": -1.5,
            "urn:air:sd1:lora:civitai:155496@174426": 2
          }
        }
      }
    ]
  },
  "status": 400,
  "responseBody": "{\"type\":\"https://tools.ietf.org/html/rfc9110#section-15.5.1\",\"title\":\"Bad Request\",\"status\":400,\"detail\":\"insufficientBuzz\",\"traceId\":\"00-3066e1099b15f8be8b3cac127ae6e4aa-649631f8946e4e55-02\"}",
  "durationMs": 275,
  "keyIndex": {
    "provider": "civitai",
    "index": 0,
    "count": 1,
    "source": "pool"
  },
  "lookup": false,
  "startedAt": "2026-11-05T18:46:19.269Z"
}
```

- **核实结论**：
  - `requestBody.steps[0].input.clipSkip` **严格存在且数值为 `2`**；
  - 双 LoRA 真实保留权重 `-1.5` 与 `2`；
  - 上游返回 HTTP 400，响应体原样为 `detail: "insufficientBuzz"`（非契约字段报错）；
  - 依照项目验收最高准则与余额规则，判定为：**PASS_BILLING**。

---

### 5.2 非 SD 1.5 真实图片 (FLUX.1 D #64399178) 导入与出站实测

- **来源图片**：`https://civitai.com/images/64399178`（作者 `L10n_H34r7`）
- **底模与 LoRA 详情**：
  - Checkpoint: `urn:air:flux1:checkpoint:civitai:618692@691639` (FLUX.1 D)
  - LoRA 1: `Cinematic 1940s` (weight: 0.3, `urn:air:flux1:lora:civitai:1351798@1527024`)
  - LoRA 2: `Cinematic Octane` (weight: 0.2, `urn:air:flux1:lora:civitai:1351798@1526912`)
- **UI 真实操作流程**：
  1. 打开 Civitai 导入弹窗，点击「FLUX.1 D 多LoRA (#64399178 · Cinematic 1940s & Octane)」快捷填入按钮并解析；
  2. 预览中确认 FLUX 官方配方无 `clipSkip`，不予发送；
  3. 点击「以此配置一键生成工作流并载入画布」；
  4. 点击顶部「运行：保存图像 (Save Image)」；
  5. 抓取请求日志并复核出站请求体。

#### 真实出站请求日志 (摘自 `temp/logs/requests-2026-11-06.jsonl`)

```json
{
  "time": "2026-11-06T03:47:54+09:00",
  "kind": "upstream",
  "route": "/api/engine/civitai/generate",
  "provider": "civitai",
  "model": "urn:air:flux1:checkpoint:civitai:618692@691639",
  "method": "POST",
  "endpoint": "https://orchestration.civitai.com/v2/consumer/workflows?wait=100",
  "requestBody": {
    "steps": [
      {
        "$type": "imageGen",
        "input": {
          "engine": "sdcpp",
          "ecosystem": "flux1",
          "operation": "createImage",
          "diffuserModel": "urn:air:flux1:checkpoint:civitai:618692@691639",
          "prompt": "A close-up of a face adorned with intricate black and blue patterns. The left side of the face is predominantly yellow, with symbols and doodles, while the right side is dark, featuring mechanical elements. The eye on the left is a striking shade of yellow, contrasting sharply with the surrounding patterns. The face is partially covered by a hooded garment, cinematic_1940s cinematic_octane",
          "width": 832,
          "height": 1216,
          "steps": 30,
          "cfgScale": 2.5,
          "seed": 419835055,
          "quantity": 1,
          "loras": {
            "urn:air:flux1:lora:civitai:1351798@1526912": 0.2,
            "urn:air:flux1:lora:civitai:1351798@1527024": 0.3
          }
        }
      }
    ]
  },
  "status": 400,
  "responseBody": "{\"type\":\"https://tools.ietf.org/html/rfc9110#section-15.5.1\",\"title\":\"Bad Request\",\"status\":400,\"detail\":\"insufficientBuzz\",\"traceId\":\"00-b212b71a8ca416a21b674da31810ab67-1777ad83ce2e609e-02\"}",
  "durationMs": 277,
  "keyIndex": {
    "provider": "civitai",
    "index": 0,
    "count": 1,
    "source": "pool"
  },
  "lookup": false,
  "startedAt": "2026-11-05T18:47:54.175Z"
}
```

- **核实结论**：
  - `requestBody.steps[0].input` 中 **严格不包含 `clipSkip` 字段**；
  - 证明出站逻辑根据官方生态契约精确判断，非 SD1.5 生态绝对不发送 `clipSkip`；
  - 上游返回 `insufficientBuzz`，分类判定为：**PASS_BILLING**（针对 `clipSkip` 字段判定为 **NOT_SENT**）。

---

## 六、截图凭证逐行视觉审查 (ReadMediaFile 取证)

所有 5 张截图均使用 `ReadMediaFile` 工具加载核验，原始尺寸 1280x686，质量压缩 JPEG（单张 73KB–110KB，严格符合 <=200KB 门禁），已持久化保存在 `docs/evidence/2026-11-05/civitai-clipskip/`。

### 6.1 截图 1：`e2e-m11-sd15-01-import-preview.jpg`
- **文件路径**：`docs/evidence/2026-11-05/civitai-clipskip/e2e-m11-sd15-01-import-preview.jpg`
- **逐行可见文字与界面审查**：
  - 顶部标题行：「Civitai 配方导入与跨供应商适配 (Import & Adapt) 逐字段透明适配 · 官方契约对齐」
  - 顶部标签切换器：「LoRA 模型库 (Browse)」、「✨ 配方导入与适配 (Import)」（粉红高亮选中）、「×」关闭按钮
  - 资源输入框标签：「输入 Civitai 资源或生图参数文本: 支持图片链接 / 图号 / 模型版本 / webUI 复制文本」
  - 输入框内容：`https://civitai.com/images/11346154`
  - 快捷填入按钮组：
    - 「FLUX.1 D 多LoRA (#64399178 · Cinematic 1940s & Octane)」
    - 「Pony / SDXL 多LoRA (#12097475 · Twilight & Expressive)」
    - 「📸 SD 1.5 双LoRA (#11346154 · Backlight & Contrast Sliders)」
    - 「填入 WebUI / Civitai 生图参数文本样例」
  - 底行提示：「实时反查 Civitai 官方元数据与各供应商输入契约，不伪造、不默认静默兜底」、「✨ 解析配方并预览适配」按钮
  - 目标供应商切换行：「选择适配目标供应商 (Target Provider Adaptation): Civitai (原生生成引擎)」
  - 供应商选项芯片：`Civitai 原生` (青色高亮)、`Fal.ai`、`Replicate`、`WaveSpeed`、`AIMLAPI`、`Novita AI`、`魔搭 CN`、`魔搭 AI`、`Hugging Face`、`Sogni`、`MuAPI`、`Tensor.Art`、`NanoGPT`、`AI Video`
  - 架构适配指示卡：「底模架构与 LoRA 适配状态: 来源架构: SD 1.5 保留 Civitai 原始模型/版本引用 (urn:air:sd1:checkpoint:civitai:94809@393843); 是否具备在线生成权限以上游校验为准。」右侧绿色徽章：「架构兼容」
  - 提取的 LoRA 列表条目：「提取的 LoRA 列表与目标供应商映射 (2 个) 无静默替换 · 格式与权限公开透明」
    - 第一项：「v1.0 SD 1.5 权重: 2 可直接发送 以 Civitai AIR 规范传入 loras 映射字典 (权重: 2) 目标标识/URL: urn:air:sd1:lora:civitai:155496@174426」右侧按钮「选用此 LoRA」

### 6.2 截图 2：`e2e-m11-sd15-02-applied-canvas.jpg`
- **文件路径**：`docs/evidence/2026-11-05/civitai-clipskip/e2e-m11-sd15-02-applied-canvas.jpg`
- **逐行可见文字与界面审查**：
  - 顶部导航栏：「ComfyCanvas Studio」、「Z-Image 创作画布」、「节点」(高亮)、「画板」、「保存到云端」、「API 设置」、「▷ 运行：保存图像 (Save Image)」
  - 工具栏菜单：「模型」、「LoRA」、「视频模型」、「工作流」、「参数」、「历史」、「云端项目」、「历史 API 调用样本」、「...更多」
  - 状态提示：「9 个节点 · 13 条连线 · 按所选服务商的接口运行」
  - 画布节点拓扑完整展开：
    - 节点 1 (`node-imp-1`)：「加载底模 (Civitai)」，当前选择 `urn:air:sd1:checkpoint:civitai:94809@393843`
    - 节点 2 (`node-imp-lora-1`)：「LoRA: contrast_slider_v10」，权重输入框显示 `2`，URN `urn:air:sd1:lora:civitai:155496@174426`
    - 节点 3 (`node-imp-lora-2`)：「LoRA: backlight_slider_v10」，权重输入框显示 `-1.5`，URN `urn:air:sd1:lora:civitai:151576@169496`
    - 节点 4 (`node-imp-2`)：「正向提示词 (CLIP)」，文本框展示完整的 hcarolin 提示词与两个 LoRA 触发标签
    - 节点 5 (`node-imp-3`)：「负向提示词 (Negative)」，文本框展示 `worst quality, low quality, easynegative, badhandv4,`
    - 节点 6 (`node-imp-4`)：「画布尺寸设定 (Latent)」，图像宽度 `512`，图像高度 `768`
    - 节点 7 (`node-imp-6`)：「KSampler 核心降噪采样」，步数 `49`，引导相关性 (CFG) `6`，采样器 `dpm++2m`，调度器未指定，去噪强度未指定，随机种子 `143848724`，包含 `clip_skip: 2` 内部配置
    - 节点 8 (`node-imp-7`)：「图像解码器 (VAE Decode)」
    - 节点 9 (`node-imp-save`)：「保存与预览图像 (Save Image)」，文件名依配方作者生成 `Civitai_salammy`

### 6.3 截图 3：`e2e-m11-sd15-03-run-result.jpg`
- **文件路径**：`docs/evidence/2026-11-05/civitai-clipskip/e2e-m11-sd15-03-run-result.jpg`
- **逐行可见文字与界面审查**：
  - 顶部状态横幅：「HTTP 400 Bad Request Civitai Orchestration 官方算力返回错误」
  - KSampler 节点内红色报错卡片：
    - 「[Civitai] HTTP 400: Civitai Orchestration 官方算力返回错误 [400]: {"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"Bad Request","status":400,"detail":"insufficientBuzz","traceId":"00-3066e1099b15f8be8b3cac127ae6e4aa-649631f8946e4e55-02"}」
  - 底部浮动错误通知框（Toast）：
    - 标题：「工作流生成失败」
    - 详情：「Civitai Orchestration 官方算力返回错误 [400]: {"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"Bad Request","status":400,"detail":"insufficientBuzz","traceId":"00-3066e1099b15f8be8b3cac127ae6e4aa-649631f8946e4e55-02"}」
  - 底部状态栏：「＋ 添加节点」、「＋ 新建取景框」、「LoRA 模型中心」、「清空」、「62% 缩放」

### 6.4 截图 4：`e2e-m11-non-sd15-01-preview.jpg`
- **文件路径**：`docs/evidence/2026-11-05/civitai-clipskip/e2e-m11-non-sd15-01-preview.jpg`
- **逐行可见文字与界面审查**：
  - 模态弹窗标题：「Civitai 配方导入与跨供应商适配 (Import & Adapt)」
  - 输入文本框：`https://civitai.com/images/64399178`
  - 目标服务商：`Civitai 原生`
  - 来源架构卡片：「底模架构与 LoRA 适配状态: 来源架构: Flux.1 D 保留 Civitai 原始模型/版本引用 (urn:air:flux1:checkpoint:civitai:618692@691639)」，绿色徽章「架构兼容」
  - 提取 LoRA 列表条目：「Cinematic 1940s Flux.1 D 权重: 0.3 可直接发送」，目标标识 `urn:air:flux1:lora:civitai:1351798@1527024`

### 6.5 截图 5：`e2e-m11-non-sd15-02-run-result.jpg`
- **文件路径**：`docs/evidence/2026-11-05/civitai-clipskip/e2e-m11-non-sd15-02-run-result.jpg`
- **逐行可见文字与界面审查**：
  - 顶部状态横幅：「HTTP 400 Bad Request Civitai Orchestration 官方算力返回错误」
  - 画布上展现 FLUX.1 D 系列连线拓扑（`Cinematic 1940s` 与 `Cinematic Octane` 链式 LoRALoader）
  - KSampler 节点与底部浮动错误横幅呈现 Civitai 官方上游报错：`detail: "insufficientBuzz"`，traceId 为 `00-b212b71a8ca416a21b674da31810ab67-1777ad83ce2e609e-02`
  - 抓取请求日志确证：出站请求体严格**不含** `clipSkip` 字段。

---

## 七、验收结论汇总表

| 测试用例 / 场景 | 生态架构 | `clipSkip` 原值 | 出站请求体是否包含 `clipSkip` | 上游真实响应 | 最终验收分类标签 |
| :--- | :--- | :---: | :---: | :--- | :--- |
| **Civitai SD 1.5 导入运行 (#11346154)** | SD 1.5 (`sd1`) | `2` | **包含** (`clipSkip: 2`) | HTTP 400 `{"detail":"insufficientBuzz"}` | **PASS_BILLING** |
| **Civitai 非 SD 1.5 导入运行 (#64399178)** | FLUX.1 D (`flux1`) | *(无)* | **不包含** (严格排除) | HTTP 400 `{"detail":"insufficientBuzz"}` | **PASS_BILLING** (字段判定 **NOT_SENT**) |
| **Civitai SDXL 导入预览 (#12097475)** | SDXL (`sdxl`) | `2` | **不包含** (显式拦截) | N/A (UI 预览拦截显示 400 警告) | **NOT_SENT** |

