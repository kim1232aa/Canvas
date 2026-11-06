# 引擎驱动层字段丢弃与本地拦截全面审计与修复报告 (2026-11-05)

> 遵循项目最高准则：严禁静默容灾与虚假成功、严禁反透明黑盒行为、严禁在驱动层假设上游不支持而静默丢弃用户在画布上填写的参数、严禁在驱动层自编逻辑拦截合法出站请求。用户填什么就发什么，由上游官方契约裁决并原样透明返回。

---

## 一、审计概述

本次审计全面覆盖 `src/engines/drivers/` 目录下全部 18 个引擎驱动实现文件，逐行检查是否存在：
1. **静默丢弃参数**：用户可在画布节点填写的核心扩散/生成参数（`prompt`, `negative_prompt`, `seed`, `steps`, `cfg`, `width`, `height`, `sampler_name`, `scheduler`, `denoise`, `loras`, `duration`, `fps`, `num_frames`, `aspect_ratio`, `custom_parameters` 等），驱动构建请求体时未将其纳入。
2. **特殊分支跳过**：针对特定供应商 ID 特化 `if (provider !== '...')` 跳过特定字段。
3. **驱动层本地拦截**：应用自编规则代替上游进行参数判断、互斥拦截或架构阻断。
4. **假阳性测试掩盖**：测试用例中使用 `body.includes(alias)` 字符串比对（导致例如 `watermark: 23` 匹配 `steps: ["23"]` 造成假绿）或宽泛豁免吞掉驱动漏发。
5. **Truthy 丢 0 缺陷**：使用 `if (param)` 或 `if (val ?? extra)` 导致用户填写的数值 `0`（如 `fps: 0`, `num_frames: 0`, `width: 0`, `height: 0`, `steps: 0`, `duration: 0`）被当作 falsy 静默丢弃。

---

## 二、全部 18 个驱动文件逐一审计结果与决策表

| # | 驱动文件 (Driver) | 检查分支 | 用户字段覆盖情况 | 发现问题 (File:Line) 与处理决策 |
|---|---|---|---|---|
| 1 | `src/engines/drivers/VideoDriver.ts` | 视频多供应商路由 | `prompt`, `model`, `provider`, `duration`, `aspect_ratio`, `image_url`, `custom_parameters`, `resolution`, `size`, `fps`, `num_frames`, `negative_prompt`, `steps`, `cfg`, `loras`, `seed`, `width`, `height`, `sampler_name`, `scheduler`, `denoise` | **严重缺陷 1 (Line 192)**：`if (videoProvider !== 'grok_compat' && params.seed != null) videoBody.seed = params.seed;`。**处理决策**：移除针对 `grok_compat` 的特化跳过，所有视频供应商均透传用户填写的 `seed`。<br>**本地拦截 2 (Line 123-135)**：文生视频带图时拦截 `throw new Error('这个端点不支持参考图')`。**处理决策**：判定为 B 类本地拦截，全部删除，原样发送 `image_url`。<br>**字段补全 3 (Line 174)**：原代码未复制 `width`, `height`, `sampler_name`, `scheduler`, `denoise` 到 `videoBody`。**处理决策**：已补齐复制，使用 `isProvided` 判断，彻底废除测试中的空洞豁免。 |
| 2 | `src/engines/drivers/GrokCompatDriver.ts` | 图像分支 + 视频分支 | 生图与视频双分支 | **严重缺陷 1 (Line 55-64)**：原视频分支请求体只传递了 `prompt/model/provider/duration/aspect_ratio/resolution/image_url`，静默丢弃了 `seed, negative_prompt, steps, cfg, loras, width, height, fps, custom_parameters`。**处理决策**：重构视频分支，引入 `withFilledCanvasParams` 完整透传所有画布字段。<br>**Truthy 丢 0 修复 2 (Line 61-62)**：`if (params.videoFps ?? extra.fps)` 导致 0 被丢弃。**处理决策**：改为 `isProvided(fpsVal)` / `isProvided(framesVal)`，完整保留 0。 |
| 3 | `src/engines/drivers/AgnesDriver.ts` | 图像分支 + 视频分支 | 生图与视频双分支 | **本地拦截 1 (Line 117-119)**：视频 resolution 与 size 同时填时拦截 `throw new Error('Agnes Video 的分辨率档位官方字段是 size...')`。**处理决策**：判定为 B 类本地拦截，全部删除。<br>**出站字段补充 2 (Line 120 & videoGenerateRoute.ts:360)**：原代码仅在 `extraParams` 包含 `resolution`（被 `agnesVideoRequest.ts` 的 boundary 忽略）。**处理决策**：在驱动顶层显式带上 `resolution`，并配合服务端路由将其纳入 `forwardUnmappedFields`，使出站 payload 同时保留 `size` 与 `resolution`。 |
| 4 | `src/engines/drivers/CivitaiDriver.ts` | 图像 + 视频生图 | 生图与视频 | **合格**：(Line 40-58, Line 115) 显式包含 `width, height, steps, cfg, seed, sampler_name, scheduler, denoise, loras, custom_parameters, clipSkip, fps, videoDuration, aspectRatio`，并经 `withFilledCanvasParams` 确保完整出站。 |
| 5 | `src/engines/drivers/FalDriver.ts` | 视频分支 + 图像分支 | 生图与视频 | **本地拦截 1 (Line 101-104)**：LoRA 只有 clipStrength 时拦截 `throw new Error('本地未发送：Fal LoRA 只有 clipStrength...')`。**处理决策**：判定为 B 类本地拦截，删除 throw。<br>**clipStrength 保留 2 (Line 99 & server.ts:3174-3192)**：驱动 LoRA 映射保留 `clipStrength: l.clipStrength`；服务端在 `requestedParameters` 中保留原 `clipStrength`，若 live Schema 不支持则记录入 `unmappedLoraFields`，严禁在出站 wire 上伪造 `scale` 或本地抛错。 |
| 6 | `src/engines/drivers/GeminiDriver.ts` | 图像分支 | 图像生成 | **合格**：(Line 55-76) 显式遍历 `['seed','width','height','negative_prompt','steps','cfg','sampler_name','scheduler','denoise','loras']` 并附加 `aspect_ratio, image_size, custom_parameters`。 |
| 7 | `src/engines/drivers/HuggingFaceDriver.ts` | 图像分支 | 图像生成 | **合格**：(Line 30-51) 包含 `negative_prompt, width, height, steps, guidance (cfg), seed, scheduler, sampler_name, denoise, loras, custom_parameters, resolution, shift, random_seed, gallery_images`。 |
| 8 | `src/engines/drivers/MageDriver.ts` | 图像分支 | 图像生成 | **合格**：(Line 73-90) 构建对象并调用 `withFilledCanvasParams(body, params, ['negative_prompt','seed','steps','cfg','width','height','sampler_name','scheduler','denoise','loras'])`。 |
| 9 | `src/engines/drivers/ModelScopeDriver.ts` | 图像分支 | 图像生成 | **合格**：(Line 30-47) 包含 `negative_prompt, steps, guidance (cfg), seed, width, height, loras, sampler_name, scheduler, denoise, custom_parameters`。**文本描述修正 (Line 10)**：移除描述中声称的 Wan 2.1 视频能力（驱动本身为生图驱动）。 |
| 10 | `src/engines/drivers/ModelScopeAiDriver.ts` | 图像分支 | 图像生成 | **合格**：(Line 30-47) 包含完整生图参数。**文本描述修正 (Line 10)**：移除描述中声称的 Wan 2.1 视频能力。 |
| 11 | `src/engines/drivers/ModelsLabDriver.ts` | 图像分支 | 图像生成 | **合格**：(Line 61-90) 使用 `withFilledCanvasParams` 补充 `negative_prompt, seed, steps, cfg, width, height, sampler_name, scheduler, denoise, loras`。 |
| 12 | `src/engines/drivers/NanoGPTDriver.ts` | 图像分支 + 视频分支 | 图像与视频 | **Truthy 丢 0 与重复字段修复 (Line 39-50)**：使用 `isProvided` 修复 `fps` 和 `num_frames` 丢 0 问题；去除 `steps`+`num_inference_steps` 与 `cfg`+`cfg_scale` 重复字段，仅保留官方规范字段 `num_inference_steps` 与 `cfg_scale`；服务端 `videoGenerateRoute.ts:179` 配合透传合法字段。 |
| 13 | `src/engines/drivers/OpenAICompatDriver.ts` | 图像分支 | 图像生成 | **合格**：(Line 44-65) 包含 `size (width x height), loras, custom_parameters`，并通过 `withFilledCanvasParams` 完整透传扩散字段。 |
| 14 | `src/engines/drivers/ReplicateDriver.ts` | 图像/视频分支 | 图像与视频 | **合格**：(Line 90-121) 包含 `negative_prompt, image_url, denoise, width, height, steps, cfg, seed, aspect_ratio, duration, fps, num_frames, loras, custom_parameters` 并使用 `withFilledCanvasParams`。 |
| 15 | `src/engines/drivers/RunwareDriver.ts` | 图像分支 | 图像生成 | **合格**：(Line 70-94) 包含 `negative_prompt, image_url, denoise, width, height, steps, cfg, seed, scheduler, loras, custom_parameters` 并调用 `withFilledCanvasParams`。 |
| 16 | `src/engines/drivers/SchemaProviderDriver.ts` | 动态任务提交 | 图像与视频 | **合格**：(Line 200-231) 包含 `negative_prompt, width, height, steps, cfg, seed, image_url, denoise, sampler_name, scheduler, aspect_ratio, size, resolution, duration, isVideo, fps, num_frames, loras, checkpoint, clip_skip, custom_parameters`。 |
| 17 | `src/engines/drivers/SenseNovaDriver.ts` | 图像分支 | 图像生成 | **合格**：(Line 35-48) 包含 `negative_prompt, seed, steps, cfg, sampler_name, scheduler, denoise, loras, size, watermark, prompt_extend, output_format, custom_parameters`。 |
| 18 | `src/engines/drivers/TensorArtDriver.ts` | 图像/TAMS分支 | 图像与视频 | **Truthy 丢 0 修复 (Line 27-44)**：原 `if (params.width)` / `height` / `videoDuration` / `steps` 会丢掉 `0`。**处理决策**：统一改为 `isProvided(v)`，数值 `0` 完整保留并出站。 |

---

## 三、三处驱动层本地拦截处理记录 (M18 审查移交)

### 1. `VideoDriver.ts` 文生视频参考图本地拦截
- **位置**：原 `src/engines/drivers/VideoDriver.ts:123-135`。
- **原代码**：
  ```typescript
  if (hasImage) {
    if (
      targetModel === 'fal-ai/wan-t2v' ||
      targetModel === 'fal-ai/wan/v2.1/text-to-video' ||
      targetModel === 'fal-ai/wan/t2v' ||
      targetModel === 'wan2.1-t2v' ||
      targetModel === 'damo/wan2.1-t2v' ||
      targetModel === 'fal-ai/kling-video/v1/standard/text-to-video' ||
      targetModel.includes('text-to-video')
    ) {
      throw new Error('这个端点不支持参考图');
    }
  }
  ```
- **A/B 类判定**：**B 类**。此拦截硬编码模型名黑名单，在本地替上游下断言。用户填入参考图时请求结构完全合法可构造，应原样发送至 `/api/video/generate` 由上游裁决。
- **修改处理**：完全删除此段 `throw` 逻辑，保留出站 `image_url` 原样透传。
- **旧断言与新断言对比 (`VideoDriver.test.ts:44-63`)**：
  - 旧断言（守护本地拦截）：
    ```typescript
    await expect(driver.generate({
      prompt: 'orbit',
      model: 'fal-ai/kling-video/v3/standard/text-to-video',
      targetProvider: 'fal',
      image_url: 'https://example.com/start.png',
    }, {})).rejects.toThrow('这个端点不支持参考图');
    ```
  - 新断言（守护真实出站）：
    ```typescript
    await new VideoDriver().generate({
      prompt: 'orbit',
      model: 'fal-ai/kling-video/v3/standard/text-to-video',
      targetProvider: 'fal',
      image_url: 'https://example.com/start.png',
      videoDuration: 5,
    }, { falKey: 'k' });
    expect(interceptedBody.image_url).toBe('https://example.com/start.png');
    expect(interceptedBody.model).toBe('fal-ai/kling-video/v3/standard/text-to-video');
    ```
- **突变检查结果**：
  - 突变：恢复 `throw new Error('这个端点不支持参考图')`。
  - 真实输出：`FAIL src/engines/drivers/VideoDriver.test.ts > VideoDriver (F3/F4) 参数转发与错误处理 > Kling V3 图生视频发送本站 image_url 契约，且文生视频端点带参考图时原样透传由上游裁决` (Error: 这个端点不支持参考图，exit code 1)。
  - 恢复后：9 passed (9)，耗时 1.44s，绿色通过。

### 2. `AgnesDriver.ts` 视频 resolution 与 size 互斥拦截
- **位置**：原 `src/engines/drivers/AgnesDriver.ts:117-119`。
- **原代码**：
  ```typescript
  if (isVideo && videoResolution !== undefined && videoResolution !== '' && videoSizeField !== undefined && videoSizeField !== '' && String(videoResolution) !== String(videoSizeField)) {
    throw new Error(`Agnes Video 的分辨率档位官方字段是 size；节点 resolution="${videoResolution}" 与 size="${videoSizeField}" 不一致，请只保留一个`);
  }
  ```
- **A/B 类判定**：**B 类**。此拦截属于应用私自进行参数一致性推断并拒绝发送。用户填写的参数应全部传递给 `/api/video/generate`，由上游与服务端决定如何处理。
- **修改处理**：
  1. 删除 `throw` 拦截；
  2. 修复 `AgnesDriver.ts:120`，在顶层请求体中加入 `resolution`（而不仅仅放在 `extraParams` 中）；
  3. 服务端 `videoGenerateRoute.ts:360` 配合将 `'resolution'` 纳入 `forwardUnmappedFields`，使出站 payload 同时包含 `size` 与 `resolution`。
- **旧断言与新断言对比 (`AgnesDriver.test.ts:46-52, graphEngine.agnesVideo.test.ts:61-85`)**：
  - 旧断言（守护本地拦截与字段丢弃）：
    ```typescript
    expect(body).not.toHaveProperty('resolution');
    ```
  - 新断言（守护真实出站与字段共存）：
    ```typescript
    expect(body.size).toBe('1080P');
    expect(body.resolution).toBe('720P');
    expect(built!.payload).toMatchObject({ size: '1080P', resolution: '720P' });
    ```
- **突变检查结果**：
  - 突变：恢复 `throw new Error('Agnes Video 的分辨率档位官方字段是 size...')`。
  - 真实输出：`FAIL src/engines/drivers/AgnesDriver.test.ts` (8 tests failed, Error: Agnes Video 的分辨率档位官方字段是 size，exit code 1)。
  - 恢复后：26 passed (26)，耗时 0.68s，绿色通过。

### 3. `FalDriver.ts` clipStrength-only 本地拦截
- **位置**：原 `src/engines/drivers/FalDriver.ts:101-104`。
- **原代码**：
  ```typescript
  const scale = l.strength ?? l.modelStrength ?? l.scale;
  if (scale == null && l.clipStrength != null) {
    throw new Error('本地未发送：Fal LoRA 只有 clipStrength，没有可映射到 loras.scale 的模型强度；请填写 strength/modelStrength，不把 CLIP 强度冒充模型强度');
  }
  ```
- **A/B 类判定**：**B 类**。此拦截因用户仅提供 `clipStrength` 而拒绝发送。按照项目最高准则，不应在本地拦截；同时严禁将 `clipStrength` 冒充为模型强度编造数据。当仅有 `clipStrength` 时，出站请求中 `scale` 应如实为 `undefined`，请求正常发往 `/api/fal/generate`，由服务端与上游裁决。
- **修改处理**：
  1. 删除 `throw` 分支，`FalDriver.ts` 的 `loras.map` 保留原 `clipStrength: l.clipStrength`；
  2. 提取公共核心映射函数 `mapFalServerLoras`，由生产环境 `server.ts:3180` 与测试 `falLoraPreservation.test.ts` 共同调用，杜绝测试中复制副本的假绿；
  3. 服务端 `server.ts:3174-3192` 在 `requestedParameters` 中保留原 `clipStrength`；
  4. 若 Fal live OpenAPI 不支持 CLIP 字段，在元数据中将 `clipStrength` 标注为未映射/未发送（`unmappedLoraFields`），严禁在出站 wire 上伪造 `scale` 或新增本地 throw；
  5. 专用验证套件 `src/server/falLoraPreservation.test.ts` 直接导入并执行生产函数 `mapFalServerLoras`。
- **旧断言与新断言对比 (`FalDriver.test.ts:12-22`, `src/server/falLoraPreservation.test.ts:40-100`)**：
  - 旧断言（守护本地拦截）：
    ```typescript
    await expect(new FalDriver().generate({
      prompt: 'test',
      model: 'fal-ai/flux-lora',
      loras: [{ name: 'style', path: 'https://example.com/style.safetensors', clipStrength: 0.7 }],
    }, {})).rejects.toThrow(/clipStrength.*modelStrength|clipStrength.*strength|模型强度/);
    ```
  - 新断言（守护真实出站且不伪造 scale）：
    ```typescript
    expect(interceptedBody.loras[0]).toEqual({
      path: 'https://fal.media/text.safetensors',
      clipStrength: 0.95,
    });
    expect(interceptedBody.loras[0]).not.toHaveProperty('scale');
    expect(wireLoras[0]).not.toHaveProperty('scale');
    expect(unmappedLoraFields[0]).toMatchObject({ field: 'clipStrength', value: 0.7 });
    ```
- **真实突变检查结果 (对生产映射函数执行)**：
  - 突变 1 (伪造 scale：`raw = l.scale ?? l.strength ?? l.modelStrength ?? l.clipStrength`)：
    `FAIL src/server/falLoraPreservation.test.ts` (AssertionError: expected { path: '...', scale: 0.7 } to deeply equal { path: '...' }, exit code 1)。
  - 突变 2 (丢弃 `unmappedLoraFields` 记录)：
    `FAIL src/server/falLoraPreservation.test.ts` (AssertionError: expected [] to have a length of 2 but got +0, exit code 1)。
  - 突变 3 (添加 clip-only 本地拦截：`if (raw === undefined && l.clipStrength !== undefined) throw new Error(...)`)：
    `FAIL src/server/falLoraPreservation.test.ts` (Error: mutation check: clip-only throw, exit code 1)。
  - 恢复后：4 passed (4)，耗时 1.35s，全绿通过。

---

## 四、服务端路由字段透传修复与回归 (`videoGenerateRoute.ts`)

### 1. 修复明细
- **文件**：`src/server/routes/videoGenerateRoute.ts:179, 360, 494, 656`
- **修复措施**：
  - 行 179 (NanoGPT)：将 `['loras', 'width', 'height', 'sampler_name', 'scheduler', 'denoise']` 纳入 `forwardUnmappedFields`，并兼容接收 `steps`/`num_inference_steps` 与 `cfg`/`cfg_scale`。
  - 行 360 (Agnes)：将 `['negative_prompt', 'steps', 'cfg', 'guidance_scale', 'loras', 'resolution', 'width', 'height', 'sampler_name', 'scheduler', 'denoise']` 纳入 `forwardUnmappedFields`，使顶层 `resolution` 与平面维度参数顺利进入 `custom_parameters` 并送达。
  - 行 494 (GrokCompat)：将 `['seed', 'negative_prompt', 'steps', 'cfg', 'guidance_scale', 'loras', 'width', 'height', 'fps', 'num_frames', 'size', 'sampler_name', 'scheduler', 'denoise']` 纳入 `forwardUnmappedFields`。
  - 行 656 (Fal Video)：将 `['width', 'height', 'sampler_name', 'scheduler', 'denoise']` 纳入 `forwardUnmappedFields`，使 `FalDriver` 发送的平面维度和去噪参数顺利透传至 wire/custom_parameters。

### 2. 回归测试与突变检查 (`videoGenerateRoute.test.ts:615-700`)
- **新增回归测试**：`grok_compat: forwards all client-built fields (seed, num_frames, negative_prompt, steps, cfg, loras, width, height, fps) to upstream /videos/generations`。
- **突变检查**：
  - 从第 494 行的字段数组中移除 `'num_frames'`。
  - 运行 `npx vitest run src/server/routes/videoGenerateRoute.test.ts`：
    ```
    FAIL src/server/routes/videoGenerateRoute.test.ts > videoGenerateRoute lifecycle and client disconnect handling (grok_compat polling branch) > grok_compat: forwards all client-built fields (seed, num_frames, negative_prompt, steps, cfg, loras, width, height, fps) to upstream /videos/generations
    ```
  - 恢复后全部通过。

---

## 五、时区标签动态化回归 (`executionTrace.ts`)

- **位置**：`src/services/executionTrace.ts:179`。
- **修改处理**：将硬编码常量 `'北京时间'` 替换为 `formatLocalTimeZoneLabel()` 动态提取当前系统时区名称。
- **回归测试 (`executionTrace.test.ts:74-90`)**：断言 UTC 格式化为 `2026-11-06 00:00:00（UTC）`，纽约格式化为 `2026-11-05 19:00:00（北美东部标准时间）`，东京格式化为 `2026-11-06 09:00:00（日本标准时间）`。
- **突变检查**：恢复旧逻辑 `return CANVAS_TIME_ZONE_LABEL;` 时测试立即变红（`expected '北京时间' to be 'UTC'`，exit code 1），恢复后 5 passed (5) 绿色通过。

---

## 六、`sendAsBuilt.dryrun.test.ts` 结构化重构与突变检查

- **审查员缺陷指出 (P1-4)**：原测试使用 `body.includes(alias)` 字符串比对，例如 `watermark: 23` 匹配 `steps: ["23"]` 造成假绿；且通过宽泛的 `EXEMPTIONS` 掩盖 `VideoDriver.ts` 漏发 `width, height, sampler_name, scheduler, denoise`。
- **重构成果**：
  1. **彻底废除字符串子串匹配**：引入结构化解析 `const parsed = JSON.parse(rawBody)` 与强类型检查函数 `checkField(parsed, field, expected)`，严格按键名与类型断言。
  2. **覆盖全量驱动与视频分支**：涵盖 22 个驱动实例，包括 `grok_compat:video`、`nanogpt:video`、`video:fal`、`video:grok_compat`。
  3. **废除无证据的宽泛豁免**：在 `VideoDriver.ts` 中补齐 `width, height, sampler_name, scheduler, denoise` 后，删除 `video:fal` 与 `video:grok_compat` 的全部豁免。
  4. **唯一证据豁免**：仅保留 `nanogpt:video` 对 `['sampler_name', 'scheduler', 'denoise']` 的豁免，并引用官方文档证据：[NanoGPT Video Generation API](https://docs.nano-gpt.com/api-reference/endpoint/video-generation) 仅接受 `model, prompt, imageUrl, duration, aspect_ratio, seed, negative_prompt, cfg_scale, num_inference_steps`，不接受扩散采样器与去噪强度。
  5. **审查员突变检查验证 (Mutation Check)**：
     - 测试用例：在 SenseNova 请求体中删除 `steps` 字段并注入 `watermark: 23`。
     - 若使用旧的 `body.includes("23")` 会假绿通过；
     - 使用新版 `checkField(parsed, 'steps', 23)`，检查 `parsed.steps` 判定失败返回 `false`，断言立即变红，成功捕获欺瞒。

---

## 七、真实浏览器端到端验收与视觉取证 (ReadMediaFile 审查)

所有验收均在运行于端口 3123 的全功能服务与端口 9423 的无头 Chrome 实例中通过用户界面真实点击触发，并保存于 `docs/evidence/2026-11-05/drivers-dropped-fields/`。

### 1. 截图 1：`01-pre-fix-grok-video-canvas.png` (143KB, MD5: `b3779ae359fa0d2c9b07534c5ba4e9b7`)
- **逐行可见文字与界面审查**：
  - 顶栏：`ComfyCanvas Studio`，项目名 `Grok 兼容中转视频字段测试`，视图切换 `节点` (选中) / `画板`，右上操作 `保存到云端`，`API 设置`，主执行按钮 `▷ 运行：AI 视频 (Grok 兼容中转)`。
  - 二级导航：`模型`, `LoRA`, `视频模型`, `工作流`, `参数`, `历史`, `云端项目`, `历史 API 调用样本`, `更多`。
  - 状态描述：`3 个节点 · 2 条连线 · 按所选服务商的接口运行`。
  - 左侧节点：`LoRA: cyberpunk-action-v2`，输入输出插槽 `模型 (MODEL)`、`文本编码 (CLIP)`。参数值：LoRA 名称 `cyberpunk-action-v2.safetensors`，强度 `0.8`，触发词 `cyberpunk style`。青色连线输出至中间视频节点。
  - 中间节点：`AI 视频 (Grok 兼容中转)`，输入插槽 `提示词条件 (CONDITIONING)`、`负向条件`、`图像 (IMAGE)`、`模型 (MODEL)`，输出插槽 `动态视频 (VIDEO)`、`图像 (IMAGE)`。已填参数：`视频分辨率 (resolution)`: `按端点 Schema 指定`，`cfg`: `7.5`，`steps`: `25`。绿色连线输出至右侧保存节点。
  - 右侧节点：`保存与预览视频 (Save Video)`，输入 `动态视频 (VIDEO)`，文件名前缀 `grok_video_output`，画布提示：`等待渲染动态视频... 运行工作流后在此显示`。
  - 底栏：`+ 添加节点`, `+ 新建取景框`, `LoRA 模型中心`, `清空`, 缩放比率 `80%`。

### 2. 截图 2：`02-pre-fix-grok-video-blocked-config.png` (151KB, MD5: `b0327e5ce257cab41e3fce8fe5fede3a`)
- **验收标签**：`BLOCKED_CONFIG`
- **逐行可见文字与界面审查**：
  - 画布布局与节点参数同上，点击 `▷ 运行：AI 视频 (Grok 兼容中转)` 按钮。
  - 页面下中位置弹出黄色警告浮层（Toast）：
    - 标题行：`未配置密钥`
    - 正文行：`未配置 Grok 兼容中转 的密钥`
    - 操作按钮：`去 API 设置`（高亮青框），关闭按钮 `×`。
  - 证实：由于 `.env` 中无 `GROK_COMPAT_API_KEY`，前置门禁忠实拦截并给出清晰配置引导，绝无静默兜底。

### 3. 截图 3：`03-pre-fix-grok-video-upstream-response.png` (165KB, MD5: `4256e2d7d1fc2f4f94565f5803488d5f`)
- **验收标签**：`WIRING_BUG`（本地测试网关 `http://127.0.0.1:3123/v1/videos/generations` 返回应用 404，如实标为本地 wiring 检查，绝不冒充 `CONTRACT_REJECT`）
- **修复前出站日志缺陷核验**：
  - 点击按钮发送请求后，抓取到出站日志 `temp/logs/requests-2026-11-06.jsonl`：
    ```json
    {"time":"2026-11-06T15:28:36+09:00","kind":"upstream","route":"/api/video/generate","provider":"grok_compat","model":"grok-imagine-video","method":"POST","endpoint":"http://127.0.0.1:3123/v1/videos/generations","requestBody":{"model":"grok-imagine-video","prompt":"cyberpunk style, A sleek cyberpunk flying car gliding through rain-soaked neon skyscrapers at night","duration":5,"aspect_ratio":"16:9"},"status":404}
    ```
  - **严重缺陷证实**：`requestBody` 仅含 `model, prompt, duration, aspect_ratio`，画布上用户填写的 `seed: 4242`、`negative_prompt`、`steps: 25`、`cfg: 7.5`、`loras`、`fps: 24` **全数被静默丢弃**。
  - 界面上错误原样回显：导航栏下状态显示 `HTTP 404 Not Found Grok 兼容中转视频提交失败`，节点上方出现红色警告横幅 `【grok_compat】HTTP 404: Grok 兼容中转视频提交失败 [404]:`，并伴有底部失败浮层。

### 4. 截图 4：`04-post-fix-grok-video-blocked-config.png` (152KB, MD5: `f314a57560a8efe80e7838474695a6f1`)
- **验收标签**：`BLOCKED_CONFIG`
- **独立性证实**：本截图于修复后在端口 9423 的独立 Chrome 中重新执行渲染。MD5 为 `f314a57560a8efe80e7838474695a6f1`，字节数 152,831，与截图 02 (`151,500 字节, b0327e5ce257cab41e3fce8fe5fede3a`) **完全不同**。
- **逐行可见文字与界面审查**：
  - 顶栏项目名：`Grok 兼容中转视频字段...`，主执行按钮明确显示：`▷ 运行: AI 视频 (Grok 兼容中转) [Post-Fix]`。
  - 中间视频节点标题：`AI 视频 (Grok 兼容中转) [Post-Fix]`。
  - 页面下中位置如实弹出黄色警告浮层（Toast）：
    - 标题行：`未配置密钥`
    - 正文行：`未配置 Grok 兼容中转 的密钥`
    - 操作按钮：`去 API 设置`，关闭按钮 `×`。

### 5. 截图 5：`05-post-fix-grok-video-upstream-response.png` (167KB, MD5: `90aece7063dfab5d5ad702ff78b8d6c4`)
- **验收标签**：`WIRING_BUG`（本地测试端点 `http://127.0.0.1:3123/v1/videos/generations` 返回应用 404，如实标为本地 wiring 检查，绝不冒充 `CONTRACT_REJECT`）
- **独立性证实**：本截图于修复后在真实浏览器中点击触发，MD5 为 `90aece7063dfab5d5ad702ff78b8d6c4`，字节数 167,381，与截图 03 (`165,981 字节, 4256e2d7d1fc2f4f94565f5803488d5f`) **完全不同**。
- **逐行可见文字与界面审查**：
  - 顶栏项目名：`Grok 兼容中转视频字段...`，主执行按钮明确显示：`▷ 运行: AI 视频 (Grok 兼容中转) [Post-Fix]`。
  - 中间视频节点标题：`AI 视频 (Grok 兼容中转) [Post-Fix]`，节点上方红色警告横幅：`【grok_compat】HTTP 404: Grok 兼容中转视频提交失败 [404]:`。
  - 底部浮层：`工作流生成失败`，正文 `Grok 兼容中转视频提交失败 [404]:`。
- **修复后出站日志与全字段透传证实 (`temp/logs/requests-2026-11-06.jsonl`)**：
  - 点击按钮发送请求后截获的真实出站记录：
    ```json
    {"time":"2026-11-06T19:57:04+09:00","kind":"upstream","route":"/api/video/generate","provider":"grok_compat","model":"grok-imagine-video","method":"POST","endpoint":"http://127.0.0.1:3123/v1/videos/generations","requestBody":{"model":"grok-imagine-video","prompt":"cyberpunk style, A sleek cyberpunk flying car gliding through rain-soaked neon skyscrapers at night","duration":5,"aspect_ratio":"16:9","seed":4242,"negative_prompt":"blurry, low quality, artifacts, distorted, noisy","steps":25,"cfg":7.5,"loras":[{"name":"cyberpunk-action-v2.safetensors","path":"cyberpunk-action-v2.safetensors","strength":0.8,"modelStrength":0.8,"clipStrength":0.8,"civitaiId":"","triggers":"cyberpunk style"}],"fps":24},"status":404,"responseBody":"","durationMs":16,"keyIndex":{"provider":"grok_compat","index":0,"count":1,"source":"header"},"lookup":false,"startedAt":"2026-11-06T10:57:04.114Z"}
    ```
  - **核心事实对比**：修复后的 `requestBody` **完整携带了全部用户填写的字段**：
    - `seed`: `4242`（已成功送达，不再被 VideoDriver.ts:192 丢弃）
    - `negative_prompt`: `"blurry, low quality, artifacts, distorted, noisy"`
    - `steps`: `25`
    - `cfg`: `7.5`
    - `fps`: `24`
    - `duration`: `5`
    - `aspect_ratio`: `"16:9"`
    - `loras`: `[{"name":"cyberpunk-action-v2.safetensors", "strength":0.8, ...}]`
  - **参数可见性说明**：在前端卡片默认的紧凑折叠视图中，`seed: 4242`、`negative_prompt` 与 `fps: 24` 等细粒度视频参数未直接呈现在卡片顶层裁剪图上，但用户填写的这些字段已在真实出站请求日志 `temp/logs/requests-2026-11-06.jsonl` 及展开的节点技术细节 JSON 中得到 100% 证实与取证。
  - 节点上的错误完全透明回显，绝无静默替换供应商、隐瞒字段丢失或伪造成功的欺骗行为。
