# 任务 M15 交付与验收报告：视频节点卡片标题与顶栏运行按钮联动服务商

> **工程与合规准则遵循说明**：
> 1. **调查与断言原则**：无证据不断言。复现与验收证据全部来自真实浏览器 CDP 自动化操作与实机截图，并使用 `ReadMediaFile` 打开图像逐行核实；绝不以单元测试通过假装问题已解决。
> 2. **严禁静默容灾与虚假成功**：前端 UI 展示标题与真实路由端点完全对齐，严禁底层换路由而界面保留假名称。
> 3. **严禁硬编码集成**：复用项目已有统一提供商配置 `PROVIDER_TITLE_LABEL` 及 `friendlyProviderLabel` 辅助方法，绝不为特定服务商引入特化查找表或硬编码分支。
> 4. **保护用户自主命名自由度**：精确区分「预设模板生成标题」与「用户自定义命名标题」；用户显式自定义的标题在切换提供商时始终原样保留，绝不擅自覆盖。
> 5. **信息安全保护**：全部截图与文档不含任何真实 API Key、Token、钱包地址或签名 URL。

---

## 一、问题背景与根因定位

### 1. 问题背景
在审查 M12 产出截图（`docs/evidence/2026-11-05/video/sogni-i2v-sogni-provider-model-evidence.png` 及 `review-feat-resid12-video-schema-hasreference-and-ev-rev-m12-b-r1.md` 第 22 行）时发现：
- 载入标准图生视频预设 `std-fal-i2v`（或文生视频预设 `std-fal-t2v`）后，将节点中的「视频服务商 (Provider)」下拉选择框切换为 `Sogni`，模型设为 `ltx25`。
- 此时节点的实时 Schema 横幅已如实向 Sogni 发起请求并展示 Sogni `generate_video` / `animate_photo` 工具信息，底层执行路由也发往 Sogni。
- **但节点卡片顶部的标题依然死锁为「AI 视频 (Fal.ai)」，顶栏右上角的运行按钮也依然死锁为「运行：AI 视频 (Fal.ai)」**。
- 这违反了项目「真实提供者路由透明」与「严禁虚假显示」的核心准则，给用户造成了严重的困惑。

### 2. 代码根因深度分析
经源码实测调查（非猜测）：
1. **预设模板静态注入**：在 `src/constants/presets.ts` 第 704 行及第 845 行，`buildVideoT2v` 与 `buildVideoI2v` 初始化节点时写入静态标题 `title: \`AI 视频 (${friendly(provider)})\``。同理，`buildCheckpointLoader` 第 153 行写入 `title: \`加载底模 (${friendly(target)})\``。
2. **节点渲染未联动计算**：在 `src/components/NodeItem.tsx` 约 414 行，`displayTitle` 计算时，`KSampler`、`CheckpointLoaderSimple` 与 `LoRALoader` 均有专门的标题函数，而 `AIVideoNode` 却回退到 `formatNodeDisplayTitle(node.type, node.title)`；由于 `AIVideoNode` 不在 `NODE_TITLE_MAP` 中，函数直接返回原样的静态 `node.title`（即预设传入的 `Fal.ai`）。
3. **节点更新未同步标题**：在 `src/App.tsx` 的 `handleUpdateNodeValue` 中，当用户切换 `targetProvider` 下拉框时，虽然更新了 `node.values.targetProvider = value` 和 `node.values.provider = value`，但没有更新 `node.title`；因此 `node.title` 依然停留在 `Fal.ai`。
4. **顶栏运行按钮绑定静态标题**：在 `src/App.tsx` 约 385 行与 2463 行，`resolveRunTarget` 从 `nodes` 中读取 `node.title` 作为 `runTarget.title`，并作为 `runTargetLabel` 传给 `TopBar`，最终格式化为 `运行：${runTargetLabel}`。因为 `node.title` 未更新，顶栏按钮始终保持旧的 `Fal.ai`。

---

## 二、真实浏览器复现证据（Task 1）

在本地端口 3115 启动 Dev Server，通过无头 Chrome（临时 User Profile `/tmp/canvas-chrome-title15`）执行 CDP 真实浏览器交互操作：
1. 点击顶栏「工作流」按钮，打开工作流预设弹窗；
2. 找到预设 `Fal.ai · 标准图生视频`（`std-fal-i2v`），点击「清空当前画布并载入此工作流」（仅载入）；
3. 画布载入后，将 AI 视频节点的「视频服务商 (Provider)」下拉框切换为 `Sogni`；
4. 自定义模型字段输入 `ltx25`；
5. 截取完整画布与顶栏视图，存盘为 `docs/evidence/2026-11-05/title/reproduce-fal-to-sogni-m15.png`。

### 截图文件与逐行审查记录（ReadMediaFile 验证）
- **文件路径**：`docs/evidence/2026-11-05/title/reproduce-fal-to-sogni-m15.png`
- **尺寸与格式**：1440×757 PNG
- **画面逐行内容审查**：
  1. **顶栏区域（TopBar）**：
     - 左侧显示应用名 `ComfyCanvas Studio`，当前画布名称 `Z-Image 创作画布`，视图切换按钮 `节点`（青色高亮激活）、`画板`；
     - 中部工具栏包含：`模型`、`LoRA`、`视频模型`、`工作流`、`参数`、`历史`、`云端项目`、`历史 API 调用样本`、`更多`；
     - 警告横条文字：`编辑输入需要明确参考图，请选择或上传参考图`；
     - 右侧按钮：`保存到云端`、`API 设置`；
     - **右上角运行按钮明确显示**：`▷ 运行：AI 视频 (Fal.ai)`（明显与当前 Sogni 路由冲突！）。
  2. **画布节点区域（Canvas）**：
     - 左侧节点：`参考底图加载 (Load Image)`，显示图片 URL 占位符「输入图像 URL 或从资产库选择...」，青色连线从其 `图像 (IMAGE)` 端口引出连入 AI 视频节点；
     - 左下节点：`LoRA: matrix_shot`，强度为 `1`；
     - 中间 AI 视频节点卡片：
       - **卡片头部标题明确显示**：`AI 视频 (Fal.ai)`（与右侧运行按钮一致，死锁为 Fal.ai）；
       - 端口列表：`提示词条件 (CONDITIONING)`、`负向条件`、`图像 (IMAGE)`、`模型 (MODEL)`、`动态视频 (VIDEO)`、`图像 (IMAGE)`；
       - 参数输入项：`视频分辨率 (resolution): 480p`、`cfg: 4`；
       - **黄绿色实时 Schema 横幅明确显示**：`schemaStatus hosted-tool:generate_video · toolName generate_video · videoModel · 有参考图时提交走 animate_photo（实时 Schema）；Seedance 参考图字段未接通`（确认为 Sogni 上游 Schema 驱动）；
       - 下方动态展开 Sogni 的 Schema 字段：`expandPrompt`、`skipPromptProcessing`、`ratio`、`watermark`、`referenceFileUrl`、`referenceLinkUrl` 等；
       - 下方「视频服务商 (Provider)」下拉框选中 `Sogni`；
     - 右侧节点：`保存与预览视频 (Save Video)`，文件名前缀 `std_fal_i2v`。
  3. **结论**：完全复现了「服务商与底层请求已切到 Sogni，但卡片标题与顶栏运行按钮仍写死 Fal.ai」的 Bug。

---

## 三、最小改动实现与方案设计（Tasks 2 & 3）

### 1. 核心设计原则
1. **单一事实来源**：节点的显示名称与顶栏运行按钮名称统一由当前有效供应商派生。
2. **复用统一标签映射**：复用 `src/utils/providerLabels.ts` 中现有的 `PROVIDER_TITLE_LABEL` 及 `friendlyProviderLabel(provider)`，严禁添加私有硬编码映射表。
3. **全生态覆盖**：不仅涵盖 `AIVideoNode`，同时覆盖 `CheckpointLoaderSimple` 等所有预设中带供应商后缀的节点标题。

### 2. 如何判定「预设模板标题」与「用户自定义标题」（Task 3 详述）
为了保证用户自定义重命名不会被切换服务商的操作意外覆盖，设计了专门的模板判定机制：
- **`isTemplateVideoNodeTitle(title)` 判定逻辑**：
  1. 空值、`null`、`undefined` 视为模板默认；
  2. 基础文本 `'AI 视频'` 或节点默认定义 `'AI 视频（显式 Provider/Model）'` 视为模板默认；
  3. 正则匹配 `/^AI 视频\s*[(（](.+)[)）]$/`：
     - 提取括号内文本 `inner`；
     - 仅当 `inner` 存在于 `PROVIDER_TITLE_LABEL` 的键（如 `fal`, `sogni`）或值（如 `Fal.ai`, `Sogni`, `WaveSpeed`）中时，判定为**预设模板生成标题**（可以被新的服务商动态更新）；
     - 若括号内为其他任意内容（例如「AI 视频 (我的测试)」、「AI 视频 (镜头A)」），或者不符合上述正则的任意标题（例如「我的专属视频生成器」、「Product Demo Video」），判定为**用户自定义标题**，`formatVideoNodeTitle` 立即原样返回该标题，绝不修改。
- **`isTemplateCheckpointNodeTitle(title)` 判定逻辑**：
  1. 空值、`'加载底模'`、`'加载 Checkpoint'`、`'加载底模 (Checkpoint)'` 视为模板默认；
  2. Replicate 模板 `/^Load Checkpoint(\s*[(（].*[)）])?$/i` 视为模板默认；
  3. `/^加载底模\s*[(（](.+)[)）]$/` 中括号内为已知服务商或标准模型路径文件名时视为模板生成；
  4. 其它任意名称（如「二次元大模型 SDXL」、「主模型 SD1.5」）判定为用户自定义标题，切换服务商或底模时始终保留。

### 3. 具体修改文件清单
1. **新建 `src/utils/nodeDisplayTitle.ts`**（受限范围内新建）：
   - 实现 `isTemplateVideoNodeTitle`、`formatVideoNodeTitle`；
   - 实现 `isTemplateCheckpointNodeTitle`、`formatCheckpointNodeTitle`；
   - 实现通用聚合函数 `formatNodeDisplayTitle(type, currentTitle, values)`。
2. **新建 `src/utils/formatNodeDisplayTitle.ts`**（受限范围内新建）：
   - 重导出 `nodeDisplayTitle.ts` 中的全部核心工具函数，保证模块导入灵活性。
3. **修改 `src/components/NodeItem.tsx`**：
   - 导入 `formatVideoNodeTitle`、`formatCheckpointNodeTitle`、`isTemplateVideoNodeTitle`、`isTemplateCheckpointNodeTitle`；
   - 在卡片标题计算处，针对 `AIVideoNode` 调用 `formatVideoNodeTitle(node.title, node.values?.targetProvider || currentProvider)`；针对 `CheckpointLoaderSimple` 调用 `formatCheckpointNodeTitle(node.title, node.values?.targetProvider, node.values?.ckpt_name)`；
   - 优化 `hoverTitle`，模板标题联动时不输出带有歧义的旧标题提示，只有用户真正自定义的标题才在 hover 时展示原标题。
4. **修改 `src/App.tsx`**：
   - 在 `handleUpdateNodeValue` 处理 `widgetName === 'targetProvider'` 及 `widgetName === 'model'` 时，同步调用 `formatVideoNodeTitle` / `formatCheckpointNodeTitle` 更新 `node.title`；
   - 在 `handleApplyModel` 更新既有视频节点时调用 `formatVideoNodeTitle`；
   - 在参数抽屉 Inspector 批量更新 `AIVideoNode` 时调用 `formatVideoNodeTitle`；
   - 在顶栏 `runTargetLabel` 渲染传参处，结合目标节点的运行时 `values` 调用 `formatNodeDisplayTitle`，确保顶栏运行按钮与卡片标题在任何状态下 100% 保持一致。

---

## 四、自动化回归测试与变异测试验证（Task 4）

### 1. 回归测试用例
- **`src/utils/nodeDisplayTitle.test.ts`**（共 13 个独立测试断言）：
  - 覆盖模板标题识别（Fal.ai / Sogni / Civitai / WaveSpeed / MuAPI / Novita / Replicate / Krea / Together / AIMLAPI / Venice / 中英文括号 / 默认空标题）；
  - 覆盖用户自定义标题保护（「我的专属视频生成器」、「Product Demo Video」、「AI 视频 (我的测试)」均被正确识别并保留）；
  - 覆盖服务商切换时的联动输出；
  - 覆盖无服务商后缀预设节点（SaveImage / SaveVideo / KSampler / EmptyLatentImage / VAEDecode）的原样保留；
  - 覆盖向后兼容性（不传 `values` 时回退原有行为）。
- **`src/components/NodeItem.test.tsx`**（共 7 个组件渲染测试断言）：
  - 测试 `AIVideoNode` 切换至 Sogni，卡片渲染 `AI 视频 (Sogni)`；
  - 测试 `AIVideoNode` 切换至 WaveSpeed，卡片渲染 `AI 视频 (WaveSpeed)`；
  - 测试 `AIVideoNode` 用户自定义标题，切换至 Sogni 依然保持自定义标题；
  - 测试 `CheckpointLoaderSimple` 切换至 Sogni，卡片渲染 `加载底模 (Sogni)`；
  - 测试 `CheckpointLoaderSimple` 用户自定义标题被正确保留；
  - 测试无服务商后缀节点保持标准原样。

### 2. 变异测试（Mutation Check）实测
- **变异操作**：将 `NodeItem.tsx` 中的 `formatVideoNodeTitle(node.title, ...)` 恢复为旧版代码 `formatNodeDisplayTitle(node.type, node.title)`；
- **变异测试执行命令**：`npx vitest run src/components/NodeItem.test.tsx`；
- **变异测试输出**：
  ```text
  FAIL src/components/NodeItem.test.tsx > NodeItem dynamic title & custom title preservation > AIVideoNode header displays Sogni when targetProvider is sogni (from Fal.ai preset title)
  AssertionError: expected ... to contain 'AI 视频 (Sogni)'
  Received: ... title="AI 视频 (Fal.ai)">AI 视频 (Fal.ai)</span> ...
  Tests: 2 failed | 5 passed (7)
  ```
- **复原验证**：恢复 `formatVideoNodeTitle` 修复逻辑后，重新执行测试，7 个测试全部转绿（PASS）。证实测试用例具有强烈的拦截敏感性与防御有效性。

---

## 五、真实浏览器验收实测证据（Task 5）

在修复代码后，重新在端口 3115 启动 Dev Server，通过无头 Chrome 执行完整端到端用户操作流，并拍摄两组验收特写截图。

### 1. 验收实测一：Fal.ai 预设载入后切换至 Sogni（验收 Task 1 对照）
- **操作**：载入 `std-fal-i2v`（`Fal.ai · 标准图生视频`），将视频服务商切换为 `Sogni`，模型填入 `ltx25`。
- **截图存盘**：`docs/evidence/2026-11-05/title/acceptance-01-sogni.png`
- **ReadMediaFile 逐行审查记录**：
  1. **顶栏区域（TopBar）**：
     - 右上角运行按钮文本明确显示：**`▷ 运行：AI 视频 (Sogni)`**！
  2. **画布节点区域（Canvas）**：
     - AI 视频节点卡片顶部标题明确显示：**`AI 视频 (Sogni)`**！
     - 端口与参数完整呈现；
     - 实时 Schema 绿色横幅明确展示：`schemaStatus hosted-tool:generate_video · toolName generate_video · videoModel · 有参考图时提交走 animate_photo（实时 Schema）；Seedance 参考图字段未接通`；
     - 下方「视频服务商 (Provider)」下拉框明确选中 `Sogni`。
  3. **核查结论**：卡片标题与顶栏运行按钮均已实时同步为 `Sogni`，与请求路由端点完全一致。

### 2. 验收实测二：再次切换至另一服务商 WaveSpeed
- **操作**：在上述 Sogni 画布基础上，继续将视频服务商下拉框切换为 `WaveSpeed`。
- **截图存盘**：`docs/evidence/2026-11-05/title/acceptance-02-wavespeed.png`
- **ReadMediaFile 逐行审查记录**：
  1. **顶栏区域（TopBar）**：
     - 右上角运行按钮文本立即跟随变更为：**`▷ 运行：AI 视频 (WaveSpeed)`**！
  2. **画布节点区域（Canvas）**：
     - AI 视频节点卡片顶部标题立即跟随变更为：**`AI 视频 (WaveSpeed)`**！
     - 下方「视频服务商 (Provider)」下拉框明确显示为 `WaveSpeed`；
     - 下方自动适配 WaveSpeed 的模型输入与提示词选项。
  3. **核查结论**：证实连续多次切换提供商时，标题和按钮均能稳定联动跟随。

### 3. 验收实测三：用户自定义标题保护验证
- **操作**：将 AI 视频节点的标题重命名为用户专属标题 `我的专属短片生成器`，随后将提供商切换为 `Krea`。
- **截图存盘**：`docs/evidence/2026-11-05/title/acceptance-03-custom-title-preserved.png`
- **ReadMediaFile 逐行审查记录**：
  1. **顶栏区域（TopBar）**：
     - 右上角运行按钮文本保持：**`▷ 运行：我的专属短片生成器`**！
  2. **画布节点区域（Canvas）**：
     - AI 视频节点卡片顶部标题保持：**`我的专属短片生成器`**！
     - 下方「视频服务商 (Provider)」下拉框显示为 `Krea`。
  3. **核查结论**：证实用户自定义输入的标题在切换服务商时受到严格保护，绝不会被模板覆盖。

---

## 六、工程质量与完整校验退出码

所有命令均在 `/root/github/ComfyUI Web Studio/.tower/worktrees/wt-15` 下直接执行（不接管道，如实记录）：

1. **TypeScript 静态检查**：
   - 命令：`npx tsc --noEmit`
   - 真实退出码：`0`
   - 输出：无错误输出，干净通过。
2. **生产构建检查**：
   - 命令：`npm run build`
   - 真实退出码：`0`
   - 输出：前端 Vite Client 与 Cloudflare Worker 均顺利构建输出。
3. **Vitest 完整测试套件**：
   - 命令：`npx vitest run --maxWorkers=2 --exclude '.tower/**' --exclude '**/node_modules/**' --exclude '**/dist/**'`
   - 真实退出码：`0`
   - 结果统计：251 个测试文件全部通过，1917 个测试用例全部通过（0 失败）。

---

## 七、任务清单逐条对账表

| 任务项 | 要求内容 | 完成状态 | 证明材料与位置 |
| :--- | :--- | :---: | :--- |
| **Task 1** | 真实浏览器复现 Bug（std-fal-i2v 切换 Sogni/ltx25），截图并逐行审查 | **已完成** | `docs/evidence/2026-11-05/title/reproduce-fal-to-sogni-m15.png`，本文第二节详细逐行记录 |
| **Task 2** | 最小改动方案，标题联动当前供应商，复用已有 friendly 辅助函数，覆盖全部含提供商标题预设 | **已完成** | `src/utils/nodeDisplayTitle.ts`，复用 `PROVIDER_TITLE_LABEL`，涵盖 AIVideoNode 与 CheckpointLoaderSimple |
| **Task 3** | 用户自定义标题保护，切换提供商绝不覆盖，详述模板与用户标题区分规则 | **已完成** | `isTemplateVideoNodeTitle` 与 `isTemplateCheckpointNodeTitle` 精确识别白名单服务商，用户自定义命名一律保护 |
| **Task 4** | 编写回归测试与变异测试（提供商切换变更、自定义标题保留、无后缀预设不变、红绿反转） | **已完成** | `nodeDisplayTitle.test.ts` (13 例)、`NodeItem.test.tsx` (7 例)，变异测试 2 例红转绿 |
| **Task 5** | 修复后真实浏览器验收（Sogni 与 WaveSpeed 截图、自定义标题截图、遮盖敏感凭据、三项真实退出码） | **已完成** | `acceptance-01-sogni.png`, `acceptance-02-wavespeed.png`, `acceptance-03-custom-title-preserved.png`，tsc/build/vitest 退出码均为 0 |
