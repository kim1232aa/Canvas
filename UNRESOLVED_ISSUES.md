# 项目已知与已解决问题跟踪表 (UNRESOLVED_ISSUES.md)

## 最新修复与审计记录 (2026-09-27)

### 11. 核心参数面板 (ParameterInspector) 双向同步与种子控制模式完善 (已修复)
- **现象描述**：在画布模式下挂载 `LoRALoader` 节点时，参数面板未能及时反映 LoRA 列表；修改 LoRA 权重时未能同步回画布节点；且随机种子控制模式无法在 UI 交互切换。
- **根因分析**：`activeParams` 在计算时遗漏了画布上的 `LoRALoader` 节点，且 `seedControl` 仅作为静态文本展示。
- **修复方案**：
  1. 在 `App.tsx` 中重构 `activeParams.loras` 计算逻辑，完整提取画布上的 `LoRALoader` 节点属性。
  2. 在 `ParameterInspector` 中新增交互式 `seedControl` 切换器（随机、固定、递增+1、递减-1），并在 `onChange` 中双向同步更新至 `KSampler` 与取景框。
  3. `onChange` 联动更新画布上同名 `LoRALoader` 的 `strength_model` 与 `strength_clip`。

### 12. 云端 API 接入管理升级：多 Key 轮询、负载策略与余额管理 (已完成)
- **需求与改造**：支持各服务商配置多个 API Key，提供顺序轮询 (Round-Robin)、故障转移 (Failover) 与最低延迟 (Best Latency) 三种负载策略；新增多 Key 负载监控面板 (Pool Monitor) 与服务商实时余额探测接口 (`/api/cloud-keys/balances`)。
- **落地验证**：
  1. `server.ts` 中的 `KeyPoolManager` 升级支持策略调度、限流 60 秒自动冷却解冻与单 Key 测速。
  2. 新增 `/api/cloud-keys/stats`、`/api/cloud-keys/strategy`、`/api/cloud-keys/test-single` 与 `/api/cloud-keys/balances` 接口。
  3. `BackendSettingsModal.tsx` 新增多 Key 可视化管理、单项测速与实时余额查询视图。

### 13. Google Gemini 官方内置引擎方法调用异常修复 (已修复)
- **现象描述**：在测试 Google Gemini 连通性时报 `TypeError: Cannot read properties of undefined (reading 'generateContent')`。
- **根因分析**：`server.ts` 中的 `createGoogleGenAI` 返回 `{ client: GoogleGenAI, apiKey: string }`，而在 `/api/test-provider` 中误写成了 `testGen.models.generateContent`。
- **修复方案**：修正为 `testGen.client.models.generateContent`；并在 `/api/gemini/generate` 中全量支持 `imagen-3.0-generate-002` 与 `gemini-3.1-flash-image` (Nano Banana 2) 等新一代多模态图像生成模型。

### 14. 彻底排查与消除硬编码密钥与默认兜底 (已修复)
- **审计与清除**：
  1. 清除了 `src/services/api.ts` 中 `DEFAULT_TEST_KEYS` 的硬编码 Key。
  2. 清除了 `server.ts` 中 `defaultKeys` 的硬编码 Key，全部改为严格从环境变量（`process.env.*`）与用户配置动态读取。
  3. 清除了 `src/utils/graphEngine.ts` 中写死的模型回退默认值，改为优先动态反向分析拓扑链上的活跃节点模型。

---

*状态：所有审计项均已完成全链路测试与验证，代码无任何硬编码密钥或静默兜底，编译与 Lint 100% 通过。*
