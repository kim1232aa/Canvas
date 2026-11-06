# M16: 供应商无目录 API (Lookup-Only) 模型选择指引与驱动建议泛化实现报告

- **日期**：2026-11-05
- **Mission**：M16 — MAGE16 providers without a catalog API model selection guidance
- **工作分支**：`feat/mage16-providers-without-a-catalog-api-m`
- **Worktree**：`/root/github/ComfyUI Web Studio/.tower/worktrees/wt-16`
- **对应 Finding**：`.tower/comms/findings/20261105-schema5b-improve-mage-lacks-catalog-endpoint-requiring-manual-custom-model-in.md` (schema5b 提交)
- **验收标签**：`PASS_BILLING` (上游返回 HTTP 402 payment_required 原样展示在节点中)

---

## 一、问题背景与复现 (Task 1)

### 1. 现象分析
在原始 `main` 分支代码中，Mage（Mango）供应商因官方未提供公开模型目录 API（GET /models），在 `/api/models` 路由中返回 `results.mage = []`，并在分页元数据中附带 `sourceNotice: 'lookup-only (no public remote catalog; model_id enum on Mango docs)'`。

在画布界面的 Loader 节点中：
1. 切换服务商为 `Mage (Mango)` 后，模型下拉框中显示 `请选择模型`，展开后列表为空，状态提示 `当前目录页暂无底模；可切换分类或输入 ID`，未向用户说明该平台没有公开目录 API 的真实原因。
2. 顶部状态栏被阻止运行门禁拦截，显示黄色警告：`请先选择模型`，`运行: 保存图像` 按钮置灰禁用。
3. 用户必须主动点击下方「自定义模型 (model)」输入框，手动输入 `mango-v3`，运行门禁才解除。

### 2. 实机复现截图
- **图 1（复现空目录与运行拦截）**：`docs/evidence/2026-11-05/mage-catalog/01-reproduce-empty-catalog.png`
  - *逐行视觉验证*：顶部运行状态显示黄色文案 `请先选择模型`，右上角运行按钮处于 `disabled` 状态；画布上 `加载底模 (Mage)` 节点内，模型下拉菜单显示 `请选择模型`，状态栏显示 `当前目录页暂无底模；可切换分类或输入 ID`，下方自定义模型为占位符 `输入当前服务商的模型 ID / Repo ID`。
- **图 2（手动输入自定义模型后解除拦截）**：`docs/evidence/2026-11-05/mage-catalog/02-custom-model-typed.png`
  - *逐行视觉验证*：在自定义模型框手动输入绿色文本 `mango-v3` 后，上方下拉框同步展示 `[当前] mango-v3`，状态显示 `已选底模`，顶部黄色警告消失，恢复为 `7 个节点 · 9 条连线 · 按所选服务商的接口运行`，运行按钮点亮可用。

---

## 二、泛化架构与最小修复方案 (Task 2 & Task 3)

### 1. 架构原则与反硬编码约束
根据项目最高工程准则：
- **严禁硬编码集成**：UI 与节点逻辑中不得出现 `if (provider === 'mage')` 特化分支，严禁为 Mage 维护专用查找表。
- **严禁静默容灾与兜底掩盖**：用户未选择模型时，严禁静默兜底回退为默认模型，运行门禁必须持续拦截并提示 `请先选择模型`。
- **泛化自适应**：逻辑对所有无公开远端目录 API 的供应商（如 Mage、Agnes、OpenAI Compat、Grok Compat 等）普适生效，完全由目录响应元数据与引擎驱动元数据自驱。

### 2. 核心改动模块

#### (1) 通用分页元数据识别 (`src/server/modelCatalogResponse.ts`)
新增中立判定函数 `isLookupOnlyCatalog`，根据分页对象中的 `sourceNotice`（包含 `lookup-only`、`no public remote catalog`、`no public lora directory`）或标志位 `lookupOnly` / `noRemoteCatalog` 判断该供应商是否为无公开远端目录：
```ts
export function isLookupOnlyCatalog(pagination?: GenericCatalogPagination | null): boolean {
  if (!pagination || typeof pagination !== 'object') return false;
  if (pagination.lookupOnly === true || pagination.noRemoteCatalog === true) return true;
  const notice = String(pagination.sourceNotice || '').toLowerCase();
  return (
    notice.includes('lookup-only') ||
    notice.includes('no public remote catalog') ||
    notice.includes('no public lora directory')
  );
}
```

#### (2) 目录解析与驱动声明建议提取 (`src/utils/modelCatalog.ts`)
- 扩展 `readCheckpointCatalog` 返回结构，保留 `sourceUrl`、`sourceNotice`、`catalogNotice` 及 `isLookupOnly`。
- 新增 `getDriverModelSuggestions(provider, driverRegistry)`：从该供应商已注册的驱动（`EngineRegistry.getDriver(provider).supportedModels`）中泛化读取官方支持模型，过滤视频类型后作为候选建议项，并打上 `declaredInDriver: true` 标记。

#### (3) 交互组件指引与建议卡片 (`src/components/ProviderModelSelect.tsx`)
当判定当前供应商为无目录 API（`isNoCatalogProvider = hasCurrentResult && catalogMeta.isLookupOnly && currentLive.length === 0`）时：
1. **平实自然语言指引 (`[data-testid="no-catalog-guidance"]`)**：
   - 明确告知供应商官方无公开远端检索目录 API；
   - 若响应携带 `sourceUrl`，提供官方文档超链接（如 `https://docs.mage.space/api/models/mango`）；
   - 若响应携带官方公告 `catalogNotice`，原样渲染提示；
   - 告知用户可在下方「自定义模型 (model)」中直接输入任意官方模型 ID。
2. **驱动声明建议项 (`[data-testid="provider-model-suggestions-list"]`)**：
   - 标注来源：`推荐候选（驱动按官方文档声明、非实时拉取）：`；
   - 渲染一组可点击建议按钮（如 `mango-v3`、`mango-v3-turbo`、`mango-v3s` 等）；
   - 点击建议按钮触发 `onChange(id)`，精准写入节点值，并将选中项高亮展示；
   - 下拉框中同步注入 optgroup `驱动建议模型（按官方文档声明，非实时拉取）` 供选择；
   - 用户手工输入的模型 ID 优先保留，绝不会被建议项强制篡改；
   - 未选择任何模型时保持为空，运行门禁继续拦截。

---

## 三、实机真实浏览器点击验收 (Task 4)

### 1. 验证流程
使用无头 Chrome 实例（端口 9416，独立临时 profile `/tmp/canvas-chrome-mage16`）访问本地服务（端口 3116）：
1. 切换至 Mage 服务商，模型选择未选。
2. 验证引导卡片、官方文档链接及 5 个驱动声明建议项完整呈现，运行门禁显示 `请先选择模型` 且 Run 按钮禁用。
3. 真实点击建议项 `[data-testid="provider-model-suggestion-mango-v3"]`，验证值写入并解除运行门禁。
4. 真实点击顶部 `运行: 保存图像` 按钮，发起上游生图请求。
5. 验证采样器节点与全局报错条原样展示上游 HTTP 402 响应，确认记为 `PASS_BILLING`。

### 2. 视觉截图凭证
- **图 3（修复后呈现引导与候选建议，运行拦截）**：`docs/evidence/2026-11-05/mage-catalog/03-fixed-guidance-and-suggestions.png`
  - *逐行视觉验证*：顶部运行状态显示黄色警告 `请先选择模型`；Mage 节点底模控件下方渲染紫色指引卡片，标题清晰标明 `该服务商官方无公开模型检索目录 API`，附带官方文档链接 `https://docs.mage.space/api/models/mango` 与服务端 notice；底部展示 5 个建议芯片 `mango-v3(Mango 3)`、`mango-v3-turbo`、`mango-v3s`、`mango-v2`、`mango`。
- **图 4（点击建议项 mango-v3 填入并解除拦截）**：`docs/evidence/2026-11-05/mage-catalog/04-suggestion-clicked-mango-v3.png`
  - *逐行视觉验证*：`mango-v3(Mango 3)` 芯片呈现高亮青色激活边框与背景；下拉框变为 `Mango 3 (default) · mango-v3`，下方自定义模型框同步填充 `mango-v3`；顶部黄色阻止提示消失，Run 按钮处于激活可用状态。
- **图 5（实际运行产生真实上游产物与节点报错展示）**：`docs/evidence/2026-11-05/mage-catalog/05-mage-run-result-node.png`
  - *逐行视觉验证*：采样器节点顶部与工作流浮动条中原样渲染上游 HTTP 402 报错横幅：`【mage】Mage 图像接口上游 HTTP 402: {"error":{"code":"payment_required","message":"The Mage API and MCP server need a successful payment on this account first: buy any Gem pack or start a plan at https://www.mage.space/gems, then retry. Signup bonus Gems work in the Mage app only."}}`。
  - 顶部状态栏同步更新为真实 402 账单提示。无任何静默容灾或假成功伪造。符合项目规则判定标准：**PASS_BILLING**。

### 3. 上游调用 JSONL 日志截取 (脱敏)
来自工作区日志文件 `/root/github/ComfyUI Web Studio/.tower/worktrees/wt-16/logs/upstream.log`：
```json
{"timestamp":"2026-11-06T04:44:54.690Z","provider":"mage","route":"/api/engine/mage/generate","upstream":"api.mage.space/v1/mango/generate","model":"mango-v3","maskedKey":"mage...OhAw","keyUsage":{"provider":"mage","index":0,"count":1,"source":"pool"},"status":402,"durationMs":296,"error":"HTTP 402: {\"error\":{\"code\":\"payment_required\",\"message\":\"The Mage API and MCP server need a successful payment on this account first: buy any Gem pack or start a plan at https://www.mage.space/gems, then retry. Signup bonus Gems work in the Mage app only.\"}}"}
```

---

## 四、回归测试、变异检查与工程质量命令 (Task 5)

### 1. 泛化回归单元测试
在 `src/components/ProviderModelSelect.test.tsx`、`src/utils/modelCatalog.test.ts` 和 `src/server/modelCatalogResponse.test.ts` 中新增覆盖测试：
1. **Mage 场景测试**：验证 Mage 目录响应被正确解析为 `isLookupOnly: true`，组件渲染平实指引、官方链接及 `mango-v3` 建议，点击触发 `onChange('mango-v3')`。
2. **跨供应商泛化测试 (Agnes)**：模拟 Agnes 供应商返回 `lookup-only` 空目录，验证同样渲染通用指引与 `agnes-image-2.5-flash` 建议，点击正常回填，证明非硬编码 Mage 专用。
3. **元数据提取与解析测试**：验证各类分页 notice 正确归一化。

### 2. 变异检查 (Mutation Check)
- **变异操作**：在 `src/components/ProviderModelSelect.tsx` 中将 `const isNoCatalogProvider = Boolean(...)` 强制修改为 `const isNoCatalogProvider = false;`。
- **变异运行结果**：测试立即变红（RED），2 项新增测试失败，退出码为 `1`：
  ```text
  FAIL src/components/ProviderModelSelect.test.tsx > ProviderModelSelect live catalog state > renders generic guidance and clickable driver suggestions for Mage with an empty catalog
  AssertionError: expected null not to be null
  FAIL src/components/ProviderModelSelect.test.tsx > ProviderModelSelect live catalog state > renders generic guidance and clickable driver suggestions for another provider (Agnes) with lookup-only catalog
  AssertionError: expected null not to be null
  ```
- **复原后结果**：恢复源码后重新运行，所有测试恢复全绿（GREEN）。

### 3. 全局工程命令真实退出码 (Unpiped)
严格无管道执行各命令，退出码如下：

| 命令 | 执行说明 | 真实退出码 |
| :--- | :--- | :--- |
| `npx tsc --noEmit` | 全局 TypeScript 严格类型检查 | **0** (0 错误) |
| `npm run build` | 客户端与 Worker 构建打包 | **0** (构建成功) |
| `npx vitest run --maxWorkers=2 --exclude '.tower/**' --exclude '**/node_modules/**' --exclude '**/dist/**'` | 全局完整单元测试与集成测试套件 | **0** (249 文件全部通过，1895 测试全部通过) |

---

## 五、修改文件清单

1. `src/server/modelCatalogResponse.ts`：增加 `GenericCatalogPagination` 接口与通用 `isLookupOnlyCatalog` 识别函数。
2. `src/server/modelCatalogResponse.test.ts`：增加 `isLookupOnlyCatalog` 泛化单元测试。
3. `src/utils/modelCatalog.ts`：扩展 `readCheckpointCatalog` 返回元数据；实现 `getDriverModelSuggestions` 泛化提取驱动声明模型。
4. `src/utils/modelCatalog.test.ts`：增加无目录元数据提取与驱动建议提取测试。
5. `src/components/ProviderModelSelect.tsx`：实现无目录 API 时的平实语言指引面板与可点击驱动建议项。
6. `src/components/ProviderModelSelect.test.tsx`：增加 Mage 与 Agnes 泛化空目录交互及点击回填测试。
7. `docs/evidence/2026-11-05/mage-catalog.md`：本交付报告。
8. `docs/evidence/2026-11-05/mage-catalog/01-reproduce-empty-catalog.png`：复现截图 1。
9. `docs/evidence/2026-11-05/mage-catalog/02-custom-model-typed.png`：复现截图 2。
10. `docs/evidence/2026-11-05/mage-catalog/03-fixed-guidance-and-suggestions.png`：修复后指引截图 3。
11. `docs/evidence/2026-11-05/mage-catalog/04-suggestion-clicked-mango-v3.png`：点击建议项截图 4。
12. `docs/evidence/2026-11-05/mage-catalog/05-mage-run-result-node.png`：实际运行结果节点展示截图 5。
