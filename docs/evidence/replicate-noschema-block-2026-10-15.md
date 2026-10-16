# Replicate 无 Schema 本地拦截（铁律 4）— 2026-10-15

状态：**CODE_ONLY**（未经前端 E2E，不是 PASS）
备份：`/workspace/canvas-restore/pre-replicate-noschema-044011.tgz`

## 改动
- `src/server/replicateImageContract.ts`
  - 新增 `ReplicateSchemaMissingError`：没有 live OpenAPI Input schema、PROVIDER_SCHEMA 也没有这一行时直接抛错，不再用旧字段名盲发。
  - 报错文本：`拿不到该模型 Schema，未发送（model=<id>）`；如果拉 Schema 失败，后面追加 `；Schema 拉取失败 <url> HTTP <status>: <上游响应体原文>`。
  - 新增通用辅助函数 `parseReplicateModelRef`、`extractReplicateInputProperties`、`hasReplicateStaticSpec`，不按模型名分支。
- `src/server/routes/replicateRoutes.ts`
  - 如果请求体里没有 inputSchemaProperties、表里也没有这一行，就先 GET `/models/{owner}/{name}`（带版本时用 `/versions/{v}`）拉 live schema。这次 GET 会出现在 executionTrace 里。
  - 拉取失败（非 2xx、网络错误，或返回里没有 Input.properties）时返回 400，响应包括 `blocked:'schema_missing'`、`schemaFetch{url,status,body}`、`actualRequest:null` 和 `notSent:true`。不发 `/predictions`。
  - 裸 64 位 hex 版本号拿不到 owner/name，不发任何请求，直接拦下。
  - 拉到 Schema 时只发 Schema 里声明的字段；其余字段写进 parameterOmissions，标「该端点不支持」。
- 历史：server.ts 现有的中间件只有 GET trace、没有 POST 时，会生成 `local_blocked` 失败记录，`error` 为原文，`intendedRequest` 是本次想发的参数，不写 actualRequest。
- 前端：`ReplicateDriver` 原样抛出 `errJson.error`，前端代码不用改。
- 测试：新增 `src/server/replicateNoSchemaBlock.test.ts`，5 条用例。旧测试里用占位模型 `owner/name` 或 hex 的用例原本靠盲发通过，现在改为显式传 `inputSchemaProperties`。

## 测试
`npx vitest run`：1079/1081 通过。失败的 2 条都在 `mediaHostedReview.test.ts`，改动前就失败（缺仓库外文件），和这次改动无关。

## 画布前端 E2E 要验
1. 选一个表里没有、Replicate 上也不存在的模型，比如 `someone/does-not-exist`，填好参数后生成：
   - 前端显示「拿不到该模型 Schema，未发送（model=…）；Schema 拉取失败 … HTTP 404: <上游原文>」。
   - 执行日志里只有一次 GET，没有 POST /predictions。
   - 历史卡显示本地拦截/未出站，带同一段原文。
2. 选一个表里没有、但在 Replicate 上真实存在的模型：应该能拉到 live schema，只发 schema 里有的字段；其余字段在历史卡上显示「该端点不支持」。
3. 回归：flux-schnell、flux-dev-lora 走表里的行，行为不变。

## 追加：状态码透传（画布追问，05:43 JST）
备份：`/workspace/canvas-restore/pre-replicate-noschema-status-044348.tgz`

错误文本固定两行：第一行是上游信息（照原文，或明确写没有上游信息），第二行是 `本地拦截：拿不到该模型 Schema，未发送 /predictions（model=…）`。

| 情形 | 路由状态码 | 第一行 | errorSource |
|---|---|---|---|
| Schema GET 上游非 2xx（如 404） | 上游状态码（404） | `HTTP 404: <上游响应体原文> (<url>)` | upstream |
| Schema GET 返回 200，但没有 Input.properties | 422（本地）：上游是 200，但返回里没有可用的 Schema，所以本地拦截 | `HTTP 200: <上游响应体原文> (<url>)` | local |
| Schema GET 网络错误 | 502（本地） | `无上游响应：Schema 拉取网络错误 <url>: <错误信息>` | network |
| 裸 64 位 hex（不发请求） | 400（本地） | `无上游请求：该模型标识无法定位 Schema（无 owner/name），未向上游发出任何请求` | local |

所有情形都保留 `blocked:'schema_missing'`、`schemaFetch`、`actualRequest:null` 和 `notSent:true`，并新增 `upstreamStatus` 字段。

- 历史：中间件取 `res.statusCode` 作为 httpStatus（这里是 404），`error` 写原文。因为只有 GET trace，记录类型是 local_blocked，不写 actualRequest。已有单测覆盖。
- 前端：`ReplicateDriver` 原样抛出 `errJson.error`（两行都在）。已有单测覆盖。
- 测试：1082/1084 通过。失败的 2 条在 mediaHostedReview，改动前就失败（缺仓库外文件），和这次改动无关。

画布前端 E2E 加验：选一个不存在的模型，Network 里 /generate 的状态码应为 404；错误第一行是 `HTTP 404: <上游原文>`，第二行是本地拦截说明；历史卡显示 404 和同样的第一行。

## 追加：历史 errorSource 与路由响应一致（05:45 JST）
备份：`/workspace/canvas-restore/pre-history-errorsource-044528.tgz`
- server.ts 失败中间件在填默认值之前，先记下路由自己写在响应体里的 `errorSource` 和 `upstreamStatus`，再传给 `buildLocalRejectionHistoryItem` 的新可选参数 `routeProvenance`。
- 历史记录优先用路由给的值：upstream、network 或 local；有 `upstreamStatus` 时一并写入。路由没给时仍为 `'local'`，不写 upstreamStatus，其他本地拦截行为不变。
- 测试：新增用例覆盖 upstream+404、network、没传 provenance 时默认 local 三种情况。全量 1083/1085 通过，失败的 2 条是 mediaHostedReview，改动前就失败，和这次改动无关。
- 画布前端 E2E 加验：选不存在的模型，历史卡的来源显示 upstream，状态码显示 404。
