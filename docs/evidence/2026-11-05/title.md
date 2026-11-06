# 任务 M15 交付与验收报告：视频节点卡片标题与顶栏运行按钮联动服务商（含 Round 2 返工对账）

> **工程与合规准则遵循说明**：
> 1. **调查与断言原则**：无证据不断言。复现与验收证据全部来自真实浏览器 CDP 自动化操作与实机截图，并使用 `ReadMediaFile` 打开图像逐行核实；绝不以单元测试通过假装问题已解决。
> 2. **严禁静默容灾与虚假成功**：前端 UI 展示标题与真实路由端点完全对齐，严禁底层换路由而界面保留假名称。
> 3. **严禁硬编码集成**：复用项目已有统一提供商配置 `PROVIDER_TITLE_LABEL` 及 `friendlyProviderLabel` 辅助方法，绝不为特定服务商引入特化查找表或硬编码分支。
> 4. **保护用户自主命名自由度与反黑盒猜测**：彻底抛弃「文字启发式猜测」，改用显式来源标记 `titleSource: 'template' | 'user'`；未标明来源或旧工作流一律视为用户标题，宁可不联动也绝不覆盖。
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

在本地端口 3115 启动 Dev Server，通过无头 Chrome 执行 CDP 真实浏览器交互操作：
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

## 三、Round 2 返工方案设计：消除文字启发式，引入显式标记（方案 a）

### 1. 为什么选择方案 (a) 而非方案 (b)
- **方案 (b) 缺陷**：如果不在存储结构上做任何区分，仅在渲染期计算，那么遇到预设载入的 `AI 视频 (Fal.ai)` 与用户自命名的 `AI 视频 (Fal)` 时，渲染期依然不得不依赖字符串正则猜测，无法彻底解决『猜』的本质问题；
- **方案 (a) 优势**：
  1. 在 `NodeInstance` 结构中新增显式标记 `titleSource?: 'template' | 'user'`；
  2. 彻底抛弃任何文字正则猜测：**只要 `titleSource !== 'template'`（包括 `undefined`、`'user'` 或外部导入数据），100% 判定为用户拥有的标题，宁可不联动也绝不覆盖**；
  3. 彻底解决审查者实机探针指出的 P1-1（`加载底模 (v2)`、`my-model`、`foo.safetensors`、`Load Checkpoint (v2)` 等）与 P1-2（`AI 视频 (Fal)`、`AI 视频`、`AI 视频 (Sogni)` 等）在切换服务商时被误写的问题；
  4. 顺带彻底解决 P2-1：调色板添加的新节点与 Hub 新建节点显式标记为 `titleSource: 'template'`，自然支持根据所选服务商联动，逻辑完整自洽。

### 2. 来源标记的具体写入点
1. **预设模板（`src/constants/presets.ts`）**：
   - `buildCheckpointLoader`：所有预设节点 `titleSource: 'template'`；
   - `buildStandardT2v`：所有预设节点 `titleSource: 'template'`；
   - `buildStandardI2v`：所有预设节点 `titleSource: 'template'`；
   - `buildGeminiT2i`：所有预设节点 `titleSource: 'template'`。
2. **调色板新建（`src/App.tsx` `handleAddNode`，P2-1）**：
   - 调色板生成的新节点标注 `titleSource: 'template'`。
3. **Hub 新建（`src/App.tsx` `handleApplyModel`，P2-1）**：
   - Model Hub 为不存在的视频节点新建实例时标注 `titleSource: 'template'`。
4. **用户自定义重命名（`NodeInstance.titleSource = 'user'`）**：
   - 用户在工作流中自定义或外部导入的节点，其 `titleSource` 为 `undefined` 或 `'user'`，一律被当成用户标题保护；
   - 切换服务商时，`formatVideoNodeTitle` 与 `formatCheckpointNodeTitle` 发现 `titleSource !== 'template'`，立即原样返回，绝不修改 `node.title`。

### 3. P2-2 与 P2-3 顺带清理
- **P2-2**：修改 `src/App.tsx:1793` 中 `handleApplyModel` 更新既有 checkpoint 节点的逻辑：仅在 `n.titleSource === 'template'` 时更新标题为 `checkpointNodeTitle(...)`，非模板节点保持原样标题，杜绝抹掉用户自定义底模标题。
- **P2-3**：使用 `git rm src/utils/formatNodeDisplayTitle.ts` 彻底删除该空壳再导出文件，代码库内不再保留死代码。

---

## 四、自动化测试与变异测试验证（Task 4）

### 1. 回归测试用例
- **`src/utils/nodeDisplayTitle.test.ts`**（9 个测试用例，全绿）：
  - 严格断言审查者给出的所有 lookalike 边界输入：
    * `AI 视频 (Fal)` 在无 `titleSource` 时切换到 Sogni 保持 `AI 视频 (Fal)`；
    * `AI 视频 (Sogni)` 在无 `titleSource` 时切换到 Krea 保持 `AI 视频 (Sogni)`；
    * `AI 视频` 在无 `titleSource` 时切换到 Sogni 保持 `AI 视频`；
    * `加载底模 (v2)` 在无 `titleSource` 时切换到 Sogni 保持 `加载底模 (v2)`；
    * `加载底模 (my-model)` 在无 `titleSource` 时切换到 Sogni 保持 `加载底模 (my-model)`；
    * `加载底模 (foo.safetensors)` 切换保持原样；
    * `Load Checkpoint (v2)` / `Load Checkpoint (anything-goes here)` 切换保持原样；
  - 严格断言带有 `titleSource: 'template'` 的预设节点能跟随所选服务商正常联动（Fal.ai → Sogni / WaveSpeed / Krea / Civitai 等）。
- **`src/components/NodeItem.test.tsx`**（11 个测试用例，全绿）：
  - 针对组件渲染层断言上述全部 P1-1、P1-2 输入，保证卡片 DOM 渲染同样不发生篡改。

### 2. 变异测试（Mutation Check）实测
- **变异操作**：将 `nodeDisplayTitle.ts` 中的来源判定恢复为文字启发式（正则匹配 `AI 视频 (...)` 与 `加载底模 (...)`）；
- **变异执行命令**：`npx vitest run src/utils/nodeDisplayTitle.test.ts src/components/NodeItem.test.tsx`；
- **变异测试结果**：
  - **11 个测试用例立即红屏报错**！
  - 明确报出：
    * `AssertionError: expected 'AI 视频 (Sogni)' to be 'AI 视频 (Fal)'`
    * `AssertionError: expected 'AI 视频 (Sogni)' to be 'AI 视频'`
    * `AssertionError: expected '加载底模 (Sogni)' to be '加载底模 (v2)'`
    * `AssertionError: expected '加载底模 (Sogni)' to be '加载底模 (my-model)'`
    * `AssertionError: expected '加载底模 (Sogni)' to be 'Load Checkpoint (v2)'`
- **复原验证**：恢复 `titleSource === 'template'` 明确标记检查后，20 个测试立即 100% 恢复全绿，证明测试用例高度敏锐且严格锁死 P1-1/P1-2 边界。

---

## 五、真实浏览器验收实测证据（Task 5）

使用端口 3122（Dev Server）与端口 9422（无头 Chrome，User Profile `/tmp/canvas-chrome-title15b`）重新执行全套端到端验收。

### 1. 验收实测一：预设模板 Fal.ai 切换至 Sogni（`acceptance-01-sogni.png`）
- **操作**：载入 `std-fal-i2v`（带有 `titleSource: 'template'`），将服务商切换为 Sogni，模型输入 `ltx25`。
- **文件**：`docs/evidence/2026-11-05/title/acceptance-01-sogni.png`
- **ReadMediaFile 逐行审查记录**：
  1. 顶栏运行按钮显示：`▷ 运行：AI 视频 (Sogni)`；
  2. 节点卡片头部显示：`AI 视频 (Sogni)`；
  3. Sogni 实时 Schema 黄绿色横幅显示：`schemaStatus hosted-tool:generate_video · toolName generate_video · videoModel · 有参考图时提交走 animate_photo（实时 Schema）；Seedance 参考图字段未接通`；
  4. 下拉框明确选中 `Sogni`。

### 2. 验收实测二：继续切换至 WaveSpeed（`acceptance-02-wavespeed.png`）
- **操作**：在上述画布中继续将服务商切换为 WaveSpeed。
- **文件**：`docs/evidence/2026-11-05/title/acceptance-02-wavespeed.png`
- **ReadMediaFile 逐行审查记录**：
  1. 顶栏运行按钮跟随显示：`▷ 运行：AI 视频 (WaveSpeed)`；
  2. 节点卡片头部跟随显示：`AI 视频 (WaveSpeed)`；
  3. 下拉框显示为 `WaveSpeed`。

### 3. 验收实测三：P1-2 审查者用例「AI 视频 (Fal)」（`acceptance-03-lookalike-preserved.png`）
- **操作**：注入无 `titleSource` 的节点标题 `AI 视频 (Fal)`（模拟外部导入或用户自定义），随后将服务商切换为 `Sogni`。
- **文件**：`docs/evidence/2026-11-05/title/acceptance-03-lookalike-preserved.png`
- **ReadMediaFile 逐行审查记录**：
  1. 顶栏运行按钮保持为：`▷ 运行：AI 视频 (Fal)`；
  2. 节点卡片头部保持为：`AI 视频 (Fal)`；
  3. 下方服务商下拉框已切为 `Sogni`。
  4. **结论**：虽然文字极其形似模板，但由于无 template 标记，系统严格保护用户输入，绝不覆盖为 Sogni。

### 4. 验收实测四：P1-1 审查者用例「加载底模 (v2)」（`acceptance-04-ckpt-lookalike-preserved.png`）
- **操作**：载入文生图预设，将 Checkpoint 节点的标题置为 `加载底模 (v2)`（模拟无 `titleSource` 的用户自定义底模），随后将底模服务商切换为 `Sogni`。
- **文件**：`docs/evidence/2026-11-05/title/acceptance-04-ckpt-lookalike-preserved.png`
- **ReadMediaFile 逐行审查记录**：
  1. 节点卡片头部保持为：`加载底模 (v2)`；
  2. 目标执行引擎下拉框已切为 `Sogni`。
  3. **结论**：底模节点的 lookalike 用户标题在切换服务商时同样 100% 保持原样，绝不覆盖。

### 5. 验收实测五：P2-1 Hub/调色板新建底模节点跟随服务商（`acceptance-05-hub-new-ckpt-follow.png`）
- **操作**：新建/添加一个 CheckpointLoaderSimple 节点（通过系统/Hub 创建，带有 `titleSource: 'template'`，初始标题为 `加载底模 (Fal.ai)`），随后在节点下拉框中将目标执行引擎切换为 `Sogni`。
- **文件**：`docs/evidence/2026-11-05/title/acceptance-05-hub-new-ckpt-follow.png`
- **ReadMediaFile 逐行审查记录**：
  1. 画布中央新增的 Checkpoint 节点卡片头部动态更新为：**`加载底模 (Sogni)`**；
  2. 节点内的 `目标执行引擎 (Provider)` 下拉框明确显示为 `Sogni`；
  3. 左侧原有的 Hugging Face 底模节点保持 `加载底模 (Hugging Face)` 不受干扰。
  4. **结论**：Hub 与调色板新建的底模节点由于带有 `titleSource: 'template'`，切换服务商时能够稳定、正确地跟随目标服务商。

---

## 六、Round 2 突变测试（Mutation Check）实测记录

在 `/tmp/m15-mut-test` 临时独立 worktree 中对 rev-m15-b 指出的两处进行严格突变验证：

1. **突变 C 验证（P1-1: presets.ts 去掉 titleSource 标记）**：
   - **操作**：删除 `src/constants/presets.ts` 中的 `nodes.forEach(n => { n.titleSource = 'template'; })` 与 `preset.nodes.forEach(n => { n.titleSource = 'template'; })`；
   - **运行命令**：`npx vitest run src/constants/presets.test.ts`；
   - **结果**：**2 例红屏报错，exit 1**！
     * `FAIL: P1-1: every node in all 34 WORKFLOW_PRESETS has titleSource === "template"`
     * `FAIL: P1-1: original scenario std-fal-i2v AIVideoNode with titleSource template follows Sogni`
   - **恢复**：`git checkout -- src/constants/presets.ts`，重新执行测试恢复 41/41 全绿（exit 0）。

2. **突变 B 验证（P1-2: 移除 applyHubCheckpointTitle 守卫）**：
   - **操作**：删除 `src/utils/nodeDisplayTitle.ts` 中 `applyHubCheckpointTitle` 的 `if (titleSource !== 'template') return currentTitle;` 守卫；
   - **运行命令**：`npx vitest run src/utils/nodeDisplayTitle.test.ts`；
   - **结果**：**红屏报错，exit 1**！
     * `FAIL: P1-2: applyHubCheckpointTitle guard for existing CheckpointLoaderSimple > preserves user lookalike titles and custom titles when titleSource is not template`
     * `AssertionError: expected '加载底模 (Sogni)' to be '加载底模 (v2)'`
   - **恢复**：恢复守卫代码，重新执行测试恢复 9/9 全绿（exit 0）。

---

## 七、工程质量与完整校验退出码

所有命令均在 `/root/github/ComfyUI Web Studio/.tower/worktrees/wt-15` 下直接执行（不接管道，如实记录）：

1. **TypeScript 静态检查**：
   - 命令：`npx tsc --noEmit`
   - 真实退出码：**`0`**
   - 输出：无错误输出，干净通过。
2. **生产构建检查**：
   - 命令：`npm run build`
   - 真实退出码：**`0`**
   - 输出：前端 Vite Client 与 Cloudflare Worker 均顺利构建输出。
3. **Vitest 完整测试套件**：
   - 命令：`npx vitest run --maxWorkers=2 --exclude '.tower/**' --exclude '**/node_modules/**' --exclude '**/dist/**'`
   - 真实退出码：**`0`**
   - 结果统计：251 个测试文件全部通过，1910 个测试用例全部通过（0 失败）。

---

## 八、评审意见逐条对账表

| 评审项 | 审查者发现与要求 | 处理方案与交付事实 | 状态 |
| :--- | :--- | :--- | :---: |
| **P1-1 (Round 2)** | 预设模板打 `titleSource = 'template'` 的标记未被测试锁住（突变 C 不报红） | `src/constants/presets.test.ts` 补充全量预设 34 个节点的 `titleSource === 'template'` 及原场景联动断言；突变 C 验证 2 例红屏报错，exit 1 | **已修复并锁死** |
| **P1-2 (Round 2)** | `handleApplyModel` 对既有 checkpoint 的标题守卫未被测试锁住（突变 B 不报红） | 抽取 `applyHubCheckpointTitle` 纯函数并由 `App.tsx:1793` 唯一调用，补充 lookalike 保护断言；突变 B 验证红屏报错，exit 1 | **已修复并锁死** |
| **P2-1 (Round 2)** | Hub 新建的 CheckpointLoaderSimple 未设 `titleSource: 'template'`，导致后续切换不联动 | 在 `App.tsx:1831` 与 `:2922` 补充 `titleSource: 'template'`；浏览器实机截图 `acceptance-05-hub-new-ckpt-follow.png` 验证切换 Sogni 成功跟随 | **已处理** |
| **P2-2 (Round 2)** | `NodeItem.tsx:60` 导入了未使用的函数 | 已从 `NodeItem.tsx` 及 `nodeDisplayTitle.ts` 彻底删除未引用的空壳函数，全库无残留 | **已处理** |
| **P2-3 (Round 2)** | `formatNodeDisplayTitle.ts` 空壳再导出文件 | 已通过 `git rm` 彻底删除，全库无引用 | **已处理** |
