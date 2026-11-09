# UIACC-C Post-Fix 浏览器真实 UI 点击复验报告（M124 / M129 / M130）

- 验收日期：2026-11-09
- 验收环境：独立隔离解包目录 `/tmp/acc-postfix`（基于 `main` 提交 `632257a`），独立服务端口 `PORT=18935`，独立 headless Chrome 调试端口 `19435`（`--user-data-dir=/tmp/acc-postfix-chrome`）
- 验收标准：UI 真实点击操作 + 真实出站请求 + 真实上游响应 + 真实界面渲染截图；严禁脚本代打与伪造成功
- 定性结论：**PASS_BILLING**（真实发出上游请求并经上游鉴权/计费校验，Civitai 原生上游因测试账号 Buzz 余额不足返回 HTTP 400 `insufficientBuzz`，诚实记录上游错误，不伪造生成产物）

---

## 验收目标与闭环清单

1. **M129 闭环**：修复 `AIVideoNode` 漏发 `sampler` 与 `scheduler` 参数缺陷。在真实 UI 中载入 `Civitai · 电影镜头文生视频`（`std-civitai-t2v`），确认完整连线与参数，点击运行，在「请求与执行记录」面板展开 `实际上游请求 actualRequest · Civitai`，核验 `"sampler": "euler"` 与 `"scheduler": "simple"` 均真实出站。
2. **M130 一键载入并运行闭环**：修复在画布已有节点选中（`selectedNodeId` 非空）情况下，通过预设弹窗一键「载入并立即运行」时误报『未发送请求：节点已删除，请重新选择』缺陷。在画布选中现有节点后，点击 `Civitai · 花饰人像`（`std-civitai-t2i`）卡片上的「载入并立即运行」，核验无旧节点误报拦截，真实发出新工作流请求。
3. **M130 / M124 AI 润色行内提示与模型选择器闭环**：
   - (a) 画布 `CLIPTextEncode` 正向提示词节点内，未选择润色模型时点击「AI 润色优化」，验证节点内出现 `[data-testid="node-refine-error"]` 行内提示，且**未触发**阻塞式 `window.alert`；
   - (b) 打开「参数」抽屉，验证 `AI 润色服务商与模型` 选择器正常可见，点击「AI 润色」显示 `[data-testid="refine-error"]` 行内提示而非 alert；
   - (c) 切换至「画板」模式，验证取景框内润色选择器与 `[data-testid="spatial-refine-error"]` 行内提示正常工作。

---

## 一、请求实参

### 1. 复验 1（M129 Civitai 文生视频）
- **操作路径**：顶栏点击「工作流」→ 载入 `Civitai · 电影镜头文生视频`（`std-civitai-t2v`）→ 确认 `LoRALoader` 的 `MODEL` 输出正确连接至 `AIVideoNode` 的 `lora` 输入 → 在「参数」抽屉与节点中确认/填入完整实参 → 顶栏点击「运行：AI 视频 (Civitai)」。
- **实参详情**：
  - Checkpoint AIR：`urn:air:wanvideo-22-t2v-a14b:checkpoint:civitai:1817671@2114154`
  - Engine / Version / Provider：`engine=wan`, `version=v2.2`, `provider=comfy`
  - 正向提示词（Meaningful Prompt）：`(PBRSty1e, 3d animation), caucasian woman, shiny skin, realistic style. . bride, white wedding dres, hair: Black hair, joy with clear indications of ecstasy, long shot`
  - 负向提示词（Meaningful Negative Prompt）：`色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走，裸露，(child),(teen),(youth)`
  - 尺寸与位移：`width=832`, `height=480`, `shift=7`
  - 采样与步数：`sampler=euler`, `scheduler=simple`, `steps=20`, `cfg=3`
  - 序列与随机种子：`duration=5`, `fps=24`, `seed=271109913`
  - 安全与放开策略：`allowMatureContent=true`（位于根级 payload）
  - LoRA 挂载：`urn:air:wanvideo-22-t2v-a14b:lora:civitai:2247725@2530788`，强度 `1.0`
- **实际出站 Payload（`actualRequest`）**：
```json
{
  "allowMatureContent": true,
  "steps": [
    {
      "$type": "videoGen",
      "input": {
        "engine": "wan",
        "version": "v2.2",
        "provider": "comfy",
        "prompt": "(PBRSty1e, 3d animation), caucasian woman, shiny skin, realistic style. . bride, white wedding dres, hair: Black hair, joy with clear indications of ecstasy, long shot",
        "diffusionModel": "urn:air:wanvideo-22-t2v-a14b:checkpoint:civitai:1817671@2114154",
        "cfgScale": 3,
        "steps": 20,
        "seed": 271109913,
        "fps": 24,
        "duration": 5,
        "negativePrompt": "色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走，裸露，(child),(teen),(youth)",
        "sampler": "euler",
        "scheduler": "simple",
        "loras": [
          {
            "air": "urn:air:wanvideo-22-t2v-a14b:lora:civitai:2247725@2530788",
            "strength": 1
          }
        ],
        "width": 832,
        "height": 480,
        "shift": 7
      }
    }
  ]
}
```

### 2. 复验 2（M130 一键载入并运行）
- **操作路径**：点击画布节点 `std-civitai-t2v-vid`（制造非空 `selectedNodeId`）→ 点击顶栏「工作流」→ 找到 `Civitai · 花饰人像`（`std-civitai-t2i`）预设卡片 → 鼠标直接点击「载入并立即运行」按钮。
- **实参详情**：
  - Checkpoint AIR：`urn:air:krea2:diffusionmodel:civitai:2732656@3072332`
  - Engine / Ecosystem：`engine=comfy`, `ecosystem=krea2`
  - 正向提示词：`A photorealistic portrait of a woman with flowers in her hair, golden hour lighting`
  - 尺寸与采样：`width=832`, `height=1248`, `steps=8`, `cfgScale=1`, `sampler=euler`, `scheduler=simple`, `seed=689794262`
  - LoRA：`urn:air:krea2:lora:civitai:929497@1040316`，强度 `0.85`

---

## 二、上游响应

### 1. 复验 1 实际上游响应
- **HTTP 状态码**：`400 Bad Request`
- **上游原始响应体**：
```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  "title": "Bad Request",
  "status": 400,
  "detail": "insufficientBuzz",
  "traceId": "00-ceed67f0c5c4aae13e8e29ab3b1dafc6-6db3b9ab3f7b4ebe-02"
}
```
- **分析**：出站数据包真实到达 Civitai Orchestration API 端点，因测试账号 Buzz 余额不足返回 `insufficientBuzz`，证实出站 JSON 格式、AIR 资源、`sampler` 与 `scheduler` 字段均被正常接收与校验。

### 2. 复验 2 实际上游响应
- **执行过程**：点击「载入并立即运行」后，界面立即进入 `生成中 0%`，随后在执行记录展示第 2 次运行记录。
- **HTTP 状态码**：`400 Bad Request`
- **上游原始响应体**：
```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  "title": "Bad Request",
  "status": 400,
  "detail": "insufficientBuzz",
  "traceId": "00-fac88d389634bd8edfab27c4e605e120-9414b087b2cd7b3f-02"
}
```
- **分析**：旧残留 `selectedNodeId` 误报已被彻底消除；请求未发生本地拦截，而是真实打到上游。

### 3. 复验 3 润色行内提示响应
- **(a) NodeItem**：点击节点内「AI 润色优化」，`[data-testid="node-refine-error"]` 出现：`请先在节点下拉或总控台中选择润色服务商与模型；不会自动切换服务商。`，未触发 `window.alert`。
- **(b) 参数抽屉**：点击「AI 润色」，`[data-testid="refine-error"]` 出现：`请先在下方选择润色服务商与模型；不会自动切换服务商。`，未触发 `window.alert`。
- **(c) 画板取景框**：点击「AI 优化」，`[data-testid="spatial-refine-error"]` 出现：`请先在下方选择润色服务商与模型；不会自动切换服务商。`，未触发 `window.alert`。

---

## 三、产物

由于 Civitai 账户余额不足返回 400 insufficientBuzz，未生成实际视频/图像媒体文件（定性为 `PASS_BILLING`，不伪造媒体产物）。
以下 5 张图片均为独立 Headless Chrome（CDP）在真实 UI 交互过程中截取的完整视口证据。

| 序号 | 截图文件名 | 验证项 | 文件大小 (Bytes) | SHA-256 校验和 |
| :--- | :--- | :--- | :--- | :--- |
| 1 | `01-m129-civitai-video-sampler-scheduler-sent.png` | M129：AIVideoNode 出站 JSON 包含 sampler 与 scheduler | 184,780 | `4a7ed4f7eee9f75ca9464e027c50d3d6940a2732bca01f01bdecb40db1f537d7` |
| 2 | `02-m130-preset-load-and-run-no-stale-node-error.png` | M130：预设一键「载入并立即运行」无旧 selectedNodeId 误报 | 206,659 | `9567967d32bc70c7a86fdfb4fe4edb92e08c94016b60b4921c72a04bd4ef53fa` |
| 3 | `03-m130-nodeitem-refine-inline-alert.png` | M130：CLIPTextEncode 节点内 AI 润色优化行内报错无 alert | 258,001 | `c5cee93ca1ce8e317759c068a0741ba6d61748e3b2a3888f63f81807b3f2c906` |
| 4 | `04-m124-inspector-refine-picker.png` | M124：参数抽屉内 AI 润色选择器可见且行内提示无 alert | 301,909 | `e6c16e984d5a89c797e09288631de3b570535168951fc26936cb25153d434d30` |
| 5 | `05-m124-spatial-frame-refine-picker.png` | M124：空间画板取景框内 AI 润色选择器可见且行内提示无 alert | 142,430 | `642c615f924af037ddee576b8145613ece0d94498ba4e4b1d300f6779a8f710c` |

---

## 四、搜索记录

按项目最高准则，必须通过网络搜索与一手官方文档交叉取证，严禁训练记忆断言。

1. **三方 WebSearch MCP 并行检索取证**：
   - 查询词：`Civitai text to video API params sampler scheduler steps duration fps`
   - **Tavily MCP** (`mcp__tavily__tavily_search`)：返回 HTTP 432 `exceeds your plan's set usage limit`，如实记录外部供应商额度超限，未静默掩盖。
   - **9Router Brave MCP** (`mcp__9router__search`)：检索成功，耗时 714ms，返回 Civitai Orchestration 官方视频生成 recipes 列表（FLUX-3、Grok、LTX2、Hunyuan、Seedance）。
   - **Google Grounding MCP** (`mcp__agy-search__search_web`)：检索成功，耗时 5.15s，返回 Civitai Orchestration API 视频参数规范与官方溯源链接。
2. **一手文档抓取取证**：
   - 目标 URL：`https://developer.civitai.com/orchestration/recipes/ltx2`
   - 工具：`FetchURL`
   - 抓取结果：成功读取 Civitai 开发者中心官方 LTX2 / Wan 视频生成契约原文，确认视频请求参数结构、`numInferenceSteps`、`duration`、`fps`、`loras` 字典格式与 Buzz 计费规则。
