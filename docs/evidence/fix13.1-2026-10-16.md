# fix13.1 — UI polish (TAMS 说明 / URL / OpenWorks 空态 / Together / 标点)

- Date: 2026-10-16
- Status: **CODE_ONLY**（无出图；无 TAMS 令牌建任务仍 BLOCKED）
- Restore: `/workspace/canvas/pre-fix13.1-20261016-215547.tgz`
- Baseline PID (pre-restart): `3576628`

## Scope (画布锁定)

1. TAMS 设置说明分行/透气
2. 接口基址 URL 完整不截断（wrap，不 truncate）
3. OpenWorks 空态不叠两层同一 HTTP 500
4. Together LoRA 说明块压缩（仍声明公共不挂假 LoRA / 不发送 image_loras；链可 wrap）
5. inspector / 设置 / chips 统一「Tensor.Art OpenWorks」标点

## Files changed

| File | Change |
|------|--------|
| `src/components/BackendSettingsModal.tsx` | TAMS `description` 用 `\n` + `whitespace-pre-line`；`apiUrl` 去掉 truncate→`break-all`；完整 `https://ap-east-1.tensorart.cloud/v1` + 覆盖说明行 |
| `src/components/ModelHubModal.tsx` | 有 Transparency Alert 时，空态不再重复 `错误原因: ${error}`，改短提示 |
| `src/components/ApiParameterEditor.tsx` | Together 说明改为折叠 summary；默认一行「公共不挂假 LoRA」；链接 `break-all` |
| `src/components/ParameterInspector.tsx` | TAMS 紫框说明分行；引擎 chip 去掉 truncate→可 wrap，保证「Tensor.Art OpenWorks」标点可见 |

## Not changed

- TAMS 主机默认 / OpenWorks 真生图接线 / Together `officialUnavailableParams`：未动
- 无生成、无钥匙打印

## Acceptance focus

- 设置：说明多段、接口基址完整可见
- 模型中心 OpenWorks：上方红条有错时，空态不复读同一 HTTP 500 原文
- Together：参数区说明不压住复选框
- Inspector：OpenWorks 文案为 `Tensor.Art OpenWorks`（带点）

## Server

- PID: `3611920`
- `/proc` ticks (utime+stime): `375`
- lstart (box / Asia/Tokyo JST): `Fri Oct 16 21:56:40 2026`
- 北京 (JST−1): `2026-10-16 20:56:40`

## 前端重拍（2026-10-16 ~23:10 JST）

- 证据：`/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-fix13.1-accept-2257/`
- PID 3611920（starttime 15782305）
- 01 TAMS 分行 + URL 完整：**PASS**
- 02 OpenWorks 空态双层：**SKIP_NO_ERROR**（目录 15 项，无红条）
- 03 Together 折叠一行：**PASS**
- 04 inspector「Tensor.Art OpenWorks」：**PASS**
- 状态：待挑刺

## 正式收口（2026-10-16 ~23:11 JST）
- 挑刺：无严重；细节两项（副说明斜杠断行、OpenWorks/openworks 双徽章）并下一批
- 状态：**CLOSED**（UI 细节批；出图无关）
