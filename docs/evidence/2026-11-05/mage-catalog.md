# M16: 供应商无目录 API (Lookup-Only) 模型选择指引与驱动建议泛化实现报告 (返工更新版)

- **日期**：2026-11-06
- **Mission**：M16 — MAGE16 providers without a catalog API model selection guidance
- **工作分支**：`feat/mage16-providers-without-a-catalog-api-m`
- **Worktree**：`<repo-root>/.tower/worktrees/wt-16`
- **对应 Finding**：`.tower/comms/findings/20261105-schema5b-improve-mage-lacks-catalog-endpoint-requiring-manual-custom-model-in.md` (schema5b 提交)
- **验收标签**：`PASS_BILLING` (上游返回 HTTP 402 payment_required 原样展示在节点中)

---

## 一、返工背景与问题根因分析

在初次提交中，`src/server/modelCatalogResponse.ts` 的 `isLookupOnlyCatalog` 使用 `notice.includes('lookup-only')` 进行子串匹配。主控审查发现该判定存在严重泛化漏洞：
在 `server.ts` 中，`lookup-only` 前缀具有多种截然不同的语义分支：
1. **官方确实没有目录 API**：
   - Mage (`server.ts:2958 'lookup-only (no public remote catalog; model_id enum on Mango docs)'`)
   - Agnes (`server.ts:2893 'lookup-only (specialized image/video service; no public remote catalog)'`)
   - TensorArt / TAMS (`server.ts:2453` 显式设置 `catalogAvailable: false`)
2. **目录存在，但当前不可查（缺 key、缺搜索词、自定义端点）**：
   - Runware 缺 API Key (`server.ts:2586 'lookup-only (no api key configured)'`)
   - Runware 缺搜索词 (`server.ts:2597 'lookup-only (search query required for live catalog)'`)
   - ModelsLab 缺 API Key (`server.ts:2688 'lookup-only (no api key configured)'`)
   - openai_compat / grok_compat 自定义端点 (`server.ts:2883`, `2888 'lookup-only (custom endpoint)'`)

原代码将上述第 2 类情形全部误判为「官方无公开目录 API」，导致用户未配置 Runware API Key 时，节点中也弹出了紫色的「该服务商官方无公开模型检索目录 API」卡片，对用户说了假话，严重违反项目最高准则「没证据不断言」与严格反黑盒透明规则。

---

## 二、中立显式布尔字段架构设计

由主控通过 `TowerSend` 审查批准将 `server.ts` 纳入当前任务范围，以极小变更（共 12 行修改）在各分页对象中注入中立布尔字段，彻底废除前端字符串子串匹配：

### 1. 服务端响应中立布尔字段定义 (`server.ts`)
- **真正无公开目录的供应商**：
  - Mage（`server.ts:2962`）：增加 `catalogAvailable: false, noPublicRemoteCatalog: true`
  - Agnes（`server.ts:2896`）：增加 `catalogAvailable: false, noPublicRemoteCatalog: true`
  - TensorArt（`server.ts:2453`）：保持原有的 `catalogAvailable: false`
- **目录存在但条件未满足的供应商**：
  - Runware 缺 key（`server.ts:2587`）：增加 `catalogAvailable: true, requiresApiKey: true`
  - Runware 缺搜索词（`server.ts:2599`）：增加 `catalogAvailable: true, requiresSearchQuery: true`
  - ModelsLab 缺 key（`server.ts:2693`）：增加 `catalogAvailable: true, requiresApiKey: true`
  - openai_compat / grok_compat（`server.ts:2889`, `2894`）：增加 `isCustomEndpoint: true`
- **特殊分类核实（未验证记录）**：
  - `server.ts:2533` 中的 Novita/DeepInfra 视频目录（`lookup-only (no public video directory)`）：经查阅官方文档，当前无法完全断言其官方绝对没有视频模型目录 API，属于「本应用未接入视频目录」还是「官方完全未公开」属于**未验证 (unverified)**。根据「没证据不断言」铁律，严禁为其打上 `noPublicRemoteCatalog: true`，宁可不弹卡片也不对用户说假话。

### 2. 泛化响应判定函数 (`src/server/modelCatalogResponse.ts`)
```ts
export function hasNoPublicRemoteCatalog(pagination?: GenericCatalogPagination | null): boolean {
  if (!pagination || typeof pagination !== 'object') return false;
  // 严格布尔排除：缺 key、缺搜索词或自定义端点，绝不可判为官方无目录
  if (pagination.requiresApiKey === true || pagination.requiresSearchQuery === true || pagination.isCustomEndpoint === true) {
    return false;
  }
  return pagination.noPublicRemoteCatalog === true || pagination.catalogAvailable === false;
}
```

*审查者残留风险确认*：目前 `catalogAvailable:false` 仅由 TAMS、Agnes、Mage 三处写入，且三者都是「官方没有列表接口」；请求失败或网络超时均通过 `results[provider].error` 抛出并展示为「查询失败」，不会误写入 `catalogAvailable:false` 或误冒充「官方无目录」。

### 3. 组件状态与原文透传 (`src/components/ProviderModelSelect.tsx`)
- 当 `hasNoPublicRemoteCatalog` 为 `false` 时，**坚决不渲染**紫色的 `[data-testid="no-catalog-guidance"]` 指引卡片。
- 在状态栏 `[data-testid="provider-model-catalog-status"]` 中，原汁原味透传展示服务端自身的 `catalogNotice` 原文（例如 Runware 的『Runware 实时模型搜索需要配置 API Key (RUNWARE_API_KEY)』，ModelsLab 的『ModelsLab 官方模型列表需要 API Key』），不自行篡改。
- 仅当 `hasNoPublicRemoteCatalog` 确为 `true` 时，才呈现平实指引面板、官方文档超链接与驱动建议候选芯片。

---

## 三、真实浏览器点击验收凭证 (端口 3118 / 9418)

启动端口 3118 开发服务与端口 9418 无头 Chrome（profile `/tmp/canvas-chrome-mage16b`）：

### 1. 缺 Key 供应商（Runware）验证：无紫色卡片，服务端原文完整展示
- **视觉凭证截图**：`docs/evidence/2026-11-05/mage-catalog/06-runware-missing-key-no-purple-card.png`
- **ReadMediaFile 逐行检查**：
  - 顶部状态栏：显示黄色警告 `请先选择模型`，Run 按钮禁用。
  - Loader 节点标题：`加载底模 (Runware)`。
  - 目标执行引擎：`⚡ Runware 极速云平台`。
  - 底模下拉菜单：显示 `请选择模型`。
  - **关键断言**：节点内**完全不存在**紫色的 `[data-testid="no-catalog-guidance"]` 卡片，**未出现**「官方无公开模型检索目录 API」误导文案！
  - 状态栏原文展示：清晰展示服务端 notice 原文 `Runware 实时模型搜索需要配置 API Key (RUNWARE_API_KEY)；支持直接在上方输入框中输入 AIR 标识符 (如 civitai:xxxx@yyyy 或 runware:xx@y) 按 ID 选用。`
  - 自定义模型框：展示占位符 `输入当前服务商的模型 ID / Repo ID`。

### 2. Mage 场景指引、建议与运行验收
- **图 3（呈现指引与候选建议，运行拦截）**：`docs/evidence/2026-11-05/mage-catalog/03-fixed-guidance-and-suggestions.png`
  - *ReadMediaFile 逐行检查*：Mage 节点底模控件下方渲染紫色指引卡片，标题清晰标明 `该服务商官方无公开模型检索目录 API`，附带官方文档链接 `https://docs.mage.space/api/models/mango` 与服务端 notice；底部展示 5 个建议芯片 `mango-v3(Mango 3)`、`mango-v3-turbo`、`mango-v3s`、`mango-v2`、`mango`。顶部运行被 `请先选择模型` 拦截。
- **图 4（点击建议项 mango-v3 回填并解除拦截）**：`docs/evidence/2026-11-05/mage-catalog/04-suggestion-clicked-mango-v3.png`
  - *ReadMediaFile 逐行检查*：`mango-v3(Mango 3)` 芯片呈现高亮青色激活边框与背景；下拉框变为 `Mango 3 (default) · mango-v3`，下方自定义模型框同步填充 `mango-v3`；顶部黄色阻止提示消失，Run 按钮点亮。
- **图 5（实际运行产生真实上游产物与节点报错展示）**：`docs/evidence/2026-11-05/mage-catalog/05-mage-run-result-node.png`
  - *ReadMediaFile 逐行检查*：采样器节点顶部与工作流浮动条原样渲染上游 HTTP 402 报错横幅：`【mage】Mage 图像接口上游 HTTP 402: {"error":{"code":"payment_required","message":"The Mage API and MCP server need a successful payment on this account first: buy any Gem pack or start a plan at https://www.mage.space/gems, then retry. Signup bonus Gems work in the Mage app only."}}`。符合验收标准：**PASS_BILLING**。

### 3. 上游调用 JSONL 日志截取 (脱敏)
工作区日志 `<repo-root>/.tower/worktrees/wt-16/logs/upstream.log`：
```json
{"timestamp":"2026-11-06T04:44:54.690Z","provider":"mage","route":"/api/engine/mage/generate","upstream":"api.mage.space/v1/mango/generate","model":"mango-v3","maskedKey":"mage...OhAw","keyUsage":{"provider":"mage","index":0,"count":1,"source":"pool"},"status":402,"durationMs":296,"error":"HTTP 402: {\"error\":{\"code\":\"payment_required\",\"message\":\"The Mage API and MCP server need a successful payment on this account first: buy any Gem pack or start a plan at https://www.mage.space/gems, then retry. Signup bonus Gems work in the Mage app only.\"}}"}
```

---

## 四、回归测试、变异检查与工程质量命令

### 1. 覆盖测试与反向测试
- `src/server/modelCatalogResponse.test.ts`：
  - 测试 1：严格布尔断言，验证 `hasNoPublicRemoteCatalog` 对 Mage/Agnes 返回 `true`，对 Runware 缺 key、Runware 缺 query、ModelsLab 缺 key、openai_compat/grok_compat 返回 `false`；特别增加锁定断言：`hasNoPublicRemoteCatalog({ isCustomEndpoint: true, catalogAvailable: false }) === false`，`hasNoPublicRemoteCatalog({ isCustomEndpoint: true, noPublicRemoteCatalog: true }) === false`，并配备 `{ catalogAvailable: false } === true` 正向对照。
  - 测试 2：直接解析 `server.ts` 源码，断言 `pagination.mage`、`pagination.agnes` 显式包含 `noPublicRemoteCatalog: true`，而 `runware`、`modelslab` 包含 `requiresApiKey: true` 且绝不包含 `noPublicRemoteCatalog: true`。
- `src/components/ProviderModelSelect.test.tsx`：
  - 增加 5 项负向断言：Runware 缺 key、Runware 缺 search、ModelsLab 缺 key、openai_compat 自定义端点，以及即使 mock 的 pagination 携带 `isCustomEndpoint: true` 与 `catalogAvailable: false` 时，均断言 `expect(host.querySelector('[data-testid="no-catalog-guidance"]')).toBeNull()`，并断言 statusText 包含服务端原始提示。

### 2. 突变检查 (Mutation Checks)
- **突变检查 1（判定退化为字符串前缀匹配）**：
  - 将 `hasNoPublicRemoteCatalog` 改回 `notice.includes('lookup-only')`。
  - 运行结果：5 项测试变红失败（RED），退出码为 `1`。4 项负向测试均捕获到不该出现的卡片。恢复后恢复全绿（GREEN）。
- **突变检查 2（服务端配置突变）**：
  - 在 `server.ts` 中将 Runware 缺 key 分页误设为 `noPublicRemoteCatalog: true`。
  - 运行结果：`server.ts declares neutral boolean fields for /api/models pagination objects` 测试变红失败（RED），报 `AssertionError: expected ... not to contain 'noPublicRemoteCatalog: true'`，退出码为 `1`。恢复后恢复全绿（GREEN）。
- **突变检查 3（P1 专项目标突变：删除 isCustomEndpoint 排除分支）**：
  - 在 `src/server/modelCatalogResponse.ts:117` 中仅删除 `|| pagination.isCustomEndpoint === true` 排除条件。
  - 运行命令：`npx vitest run --maxWorkers=2 src/server/modelCatalogResponse.test.ts src/utils/modelCatalog.test.ts src/components/ProviderModelSelect.test.tsx`。
  - 运行结果：精确出现 2 项测试失败变红（RED，退出码 `1`）：
    - `src/components/ProviderModelSelect.test.tsx > ProviderModelSelect live catalog state > never displays no-catalog-guidance card for openai_compat custom endpoint even if catalogAvailable is false` (AssertionError: expected <div ...> to be null)
    - `src/server/modelCatalogResponse.test.ts > Runware and ModelsLab catalog response parsing > generically identifies no-public-catalog providers without being fooled by lookup-only prefix on missing-key/query states` (AssertionError: expected true to be false)
  - 恢复源码并通过 `git diff` 确认干净后重新运行，所有测试恢复全绿（GREEN，21 项测试全部通过）。证明 `isCustomEndpoint` 排除分支已被测试完全锁定。

### 3. 全局工程命令真实退出码 (Unpiped)
在 `<repo-root>/.tower/worktrees/wt-16` 严格无管道执行各命令：

| 命令 | 执行说明 | 真实退出码 |
| :--- | :--- | :--- |
| `npx tsc --noEmit` | 全局 TypeScript 严格类型检查 | **0** (0 错误) |
| `npm run build` | 客户端与 Worker 构建打包 | **0** (构建成功) |
| `npx vitest run --maxWorkers=2 --exclude '.tower/**' --exclude '**/node_modules/**' --exclude '**/dist/**'` | 全局完整单元测试与集成测试套件 | **0** (249 文件全部通过，1901 测试全部通过) |

---

## 五、修改文件清单

1. `server.ts`：在 Runware (~2586, ~2597)、ModelsLab (~2688)、openai_compat/grok_compat (~2883, ~2888)、Agnes (~2893)、Mage (~2958) 的 pagination 对象中注入显式布尔字段（已获 Tower 批准）。
2. `src/server/modelCatalogResponse.ts`：实现严格中立判定函数 `hasNoPublicRemoteCatalog`（排除缺 key/query/custom 端点），并导出接口。
3. `src/server/modelCatalogResponse.test.ts`：增加覆盖函数本身与覆盖 `server.ts` 分页对象的严格布尔断言测试。
4. `src/utils/modelCatalog.ts`：扩展 `readCheckpointCatalog` 结构并接入 `hasNoPublicRemoteCatalog`；实现 `getDriverModelSuggestions` 提取驱动模型。
5. `src/utils/modelCatalog.test.ts`：增加元数据提取与驱动建议提取测试。
6. `src/components/ProviderModelSelect.tsx`：实现无目录 API 场景下的指引面板与可点击驱动建议项；缺 key/query/custom 端点不显示卡片且透传服务端 notice 原文。
7. `src/components/ProviderModelSelect.test.tsx`：增加 Mage/Agnes 引导测试，以及 Runware/ModelsLab/openai_compat 的 4 项负向防误判测试。
8. `docs/evidence/2026-11-05/mage-catalog.md`：本交付报告。
9. `docs/evidence/2026-11-05/mage-catalog/01-reproduce-empty-catalog.png`：主干复现截图 1（空下拉框与拦截）。
10. `docs/evidence/2026-11-05/mage-catalog/02-custom-model-typed.png`：主干复现截图 2（手输模型后放行）。
11. `docs/evidence/2026-11-05/mage-catalog/03-fixed-guidance-and-suggestions.png`：修复截图 3（引导与候选建议呈现）。
12. `docs/evidence/2026-11-05/mage-catalog/04-suggestion-clicked-mango-v3.png`：修复截图 4（点击建议回填与放行）。
13. `docs/evidence/2026-11-05/mage-catalog/05-mage-run-result-node.png`：修复截图 5（实际运行产生 HTTP 402 原样报错产物，PASS_BILLING）。
14. `docs/evidence/2026-11-05/mage-catalog/06-runware-missing-key-no-purple-card.png`：缺 key 供应商截图 6（无紫色卡片，服务端原文完整呈现）。
