/**
 * Tensor.Art OpenWorks as an ordinary schema-driven provider (provider id `openworks`).
 *
 * Official source (2026-10-15 live): https://raw.githubusercontent.com/Tensor-Art/tensorart-skills/master/skills/tensorart-generate/SKILL.md
 * and scripts/_api.py, scripts/create_task.py. Upstream wire: catalog POST /tool/list, create POST /task {toolName, inputs},
 * poll POST /task/query {taskIds}. Auth header Echo-Access-Key (ak_tensor_… → openapi.tensor.art, ak_tusi… → openapi.tusiart.cn).
 *
 * Canvas side is generic: each catalog entry is a model (id = upstream name); its upstream `inputs[]` become a JSON-Schema
 * `inputSchema` (property name = upstream description verbatim, position kept in x-openworks-position). Submit maps canvas fields
 * onto that Schema with the same alias table the 会发送/不会发送 badges use, then serialises by position. No keyword guessing.
 */
import type express from 'express';
import { CANVAS_TO_SCHEMA_ALIASES } from '../utils/schemaSendHint.ts';
import { isOpenWorksAccessKey } from '../schemas/tensorArtCredentials.ts';

export const OPENWORKS_PROVIDER = 'openworks';
export const OPENWORKS_DOC_URL = 'https://raw.githubusercontent.com/Tensor-Art/tensorart-skills/master/skills/tensorart-generate/SKILL.md';
export const openWorksBaseUrl = (key: string) =>
  String(key || '').trim().startsWith('ak_tusi') ? 'https://openapi.tusiart.cn/openworks/v1' : 'https://openapi.tensor.art/openworks/v1';

/**
 * Live-tested extras (雁 2026-10-17): OpenWorks photoreal_studio_z_image accepts named
 * checkpoint/seed/steps/cfg/negative/LoRA (id+weight) appended after catalog inputs.
 * Evidence: docs/evidence/openworks-recipe-969797570538788432-2026-10-17 (case2),
 * openworks-recipe-1053306608244813366 / 985238099300763019, openworks-lora-probe,
 * openworks-lora-seed-compare. TAMS field shapes used as reference for names.
 * History records these as 实际发送 (mapping sent:true); do not claim upstream applied them beyond live image diffs.
 */
export const OPENWORKS_LIVE_EXTRAS = ['seed', 'steps', 'cfg', 'negative_prompt', 'loras', 'checkpoint', 'clip_skip'] as const;
/** @deprecated retained for tests that still import the symbol; no longer gates sends. */
export const OPENWORKS_PROBE_RESULTS: Record<string, Record<string, { verdict: string; evidence?: string; upstreamText?: string }>> = {};
export const PROBE_GATED_FIELDS = [] as const;

const isFilled = (v: unknown) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0) && !(typeof v === 'number' && Number.isNaN(v));

/** Parse POST /tool/list (the upstream catalog). Non-2xx / code≠0 → throw with upstream status + body verbatim. */
export function parseOpenWorksCatalog(status: number, raw: string): any[] {
  let json: any;
  try { json = JSON.parse(raw); } catch { /* keep raw */ }
  if (status < 200 || status >= 300 || !json || (json.code !== '0' && json.code !== 0)) {
    throw Object.assign(new Error(`Tensor.Art OpenWorks 目录 HTTP ${status}: ${raw}`), { status: status >= 200 && status < 300 ? 502 : status, upstreamStatus: status, rawResponse: raw, errorSource: 'upstream' });
  }
  return Array.isArray(json.data?.tools) ? json.data.tools : [];
}

/** Media kind straight from upstream outputs[].format; anything other than image/video is not a generation model. */
export function openWorksMediaKind(entry: any): 'image' | 'video' | null {
  const formats = (Array.isArray(entry?.outputs) ? entry.outputs : []).filter((o: any) => o?.type === 'FILE').map((o: any) => String(o?.format ?? ''));
  if (formats.includes('video')) return 'video';
  if (formats.includes('image')) return 'image';
  return null;
}

/** Catalog rows for the model hub — ordinary models; no category beyond upstream outputs. */
export function openWorksCatalogItems(entries: any[], sourceUrl: string) {
  return entries.flatMap((e: any) => {
    const kind = openWorksMediaKind(e);
    if (!kind || !e?.name) return [];
    return [{
      id: String(e.name), name: String(e.name), description: e.description || '', provider: OPENWORKS_PROVIDER, source: 'Tensor.Art OpenWorks',
      category: kind === 'video' ? 'Video' : 'Checkpoint', type: kind === 'video' ? 'MotionModule' : 'Checkpoint', mediaKind: kind,
      baseModel: 'OpenWorks', badge: kind === 'video' ? 'OpenWorks 视频生成' : 'OpenWorks 图像生成', estimatedCost: e.estimatedCost, sourceUrl,
    }];
  });
}

const JSON_TYPE: Record<string, string> = { STRING: 'string', INTEGER: 'integer', NUMBER: 'number', BOOLEAN: 'boolean', ARRAY: 'array', FILE: 'string' };

/** Upstream inputs[] → JSON Schema. Property name = upstream description verbatim (dedupe with #position). All required (upstream has no optional flag; SKILL.md forbids placeholders). */
export function openWorksInputSchema(entry: any) {
  const properties: Record<string, any> = {};
  (Array.isArray(entry?.inputs) ? entry.inputs : []).forEach((inp: any, i: number) => {
    const t = String(inp?.type || '').toUpperCase();
    let key = String(inp?.description || '').trim() || `input_${i}`;
    if (Object.hasOwn(properties, key)) key = `${key}#${i}`;
    const spec: any = { type: JSON_TYPE[t] || 'string', description: inp?.description || '', 'x-openworks-position': i, 'x-openworks-type': t || 'STRING' };
    if (t === 'FILE') spec.format = 'url';
    if (t === 'ARRAY' && inp?.schema?.items) spec.items = inp.schema.items;
    properties[key] = spec;
  });
  return { type: 'object', properties, required: Object.keys(properties) };
}

function typeError(key: string, spec: any, v: unknown): string | null {
  const t = spec['x-openworks-type'];
  if (t === 'INTEGER' && !(typeof v === 'number' && Number.isInteger(v))) return `「${key}」须为整数（收到 ${JSON.stringify(v)}）`;
  if (t === 'NUMBER' && typeof v !== 'number') return `「${key}」须为数字（收到 ${JSON.stringify(v)}）`;
  if ((t === 'STRING' || t === 'FILE') && typeof v !== 'string') return `「${key}」须为字符串（收到 ${JSON.stringify(v)}）`;
  if (t === 'ARRAY') {
    if (!Array.isArray(v)) return `「${key}」须为数组（收到 ${JSON.stringify(v)}）`;
    const req: string[] = Array.isArray(spec.items?.required) ? spec.items.required : [];
    for (const [n, item] of v.entries()) {
      const miss = req.filter((k) => !isFilled((item as any)?.[k]));
      if (miss.length) return `「${key}」第 ${n + 1} 项缺少 schema 必填项 ${miss.join(', ')}`;
    }
  }
  return null;
}

export type OpenWorksMapping = { from: string; to: string | null; value: unknown; sent: boolean; reason?: string };

/**
 * Catalog Schema fields (positional) + live-tested named extras (雁 2026-10-17).
 * Wire body for POST /task is { toolName, inputs } where inputs = catalog order first, then named extras
 * matching probe case2 (seed/steps/cfg/cfg_scale/clip_skip/checkpoint/model/sdModel/loras…/negative_prompt).
 * custom JSON keys still must be Schema property names (else local 400).
 * History: mapping sent:true + flat fields on parameters (seed/steps/cfg/loras/…) for 实际发送 chips;
 * upstream fetch uses only { toolName, inputs } (see registerOpenWorksRoutes).
 */
export type OpenWorksBuildOk = {
  ok: true;
  parameters: {
    toolName: string;
    inputs: Array<{ type: string; name?: string; value: unknown }>;
    prompt?: string;
    width?: number;
    height?: number;
    seed?: number;
    steps?: number;
    cfg?: number;
    negative_prompt?: string;
    checkpoint?: string;
    clip_skip?: number;
    loras?: Array<{ name: string; strength: number }>;
  };
  wire: { toolName: string; inputs: Array<{ type: string; name?: string; value: unknown }> };
  mapping: OpenWorksMapping[];
  /** Tool Schema property names + canvas names actually sent (incl. live extras) — history uses this to tell 实际发送 from 该端点不支持. */
  schemaFields: string[];
};
export function buildOpenWorksRequest(model: string, inputSchema: ReturnType<typeof openWorksInputSchema>, body: any):
  OpenWorksBuildOk | { ok: false; error: string; mapping: OpenWorksMapping[] } {
  const props = inputSchema.properties;
  const mapping: OpenWorksMapping[] = [];
  const values: Record<string, unknown> = {};
  const custom = { ...(body?.custom_parameters && typeof body.custom_parameters === 'object' ? body.custom_parameters : {}) };
  delete custom._canvas;
  const errors: string[] = [];

  for (const [k, v] of Object.entries(custom)) {
    if (!Object.hasOwn(props, k)) { errors.push(`JSON 字段「${k}」不在该模型 Schema 中`); continue; }
    values[k] = v; mapping.push({ from: `custom_parameters.${k}`, to: k, value: v, sent: true });
  }
  const canvasFields = ['prompt', 'negative_prompt', 'width', 'height', 'image_url', 'denoise', 'sampler_name', 'scheduler', 'duration', 'ratio', 'size', 'count'];
  for (const field of canvasFields) {
    const v = body?.[field];
    if (!isFilled(v)) continue;
    const target = [field, ...(CANVAS_TO_SCHEMA_ALIASES[field] || [])].find((n) => Object.hasOwn(props, n));
    if (!target) {
      // negative_prompt may still go as a named live extra below when Schema omits it
      if (field !== 'negative_prompt') mapping.push({ from: field, to: null, value: v, sent: false, reason: '该模型 Schema 未声明对应字段，不会发送' });
      continue;
    }
    if (Object.hasOwn(values, target)) { mapping.push({ from: field, to: target, value: v, sent: false, reason: 'JSON 已显式填写同名字段' }); continue; }
    values[target] = v; mapping.push({ from: field, to: target, value: v, sent: true });
  }
  if (errors.length) return { ok: false, error: `OpenWorks 模型 ${model}：${errors.join('；')}。未出站，本地拦截。`, mapping };

  const ordered = Object.entries(props).sort((a: any, b: any) => a[1]['x-openworks-position'] - b[1]['x-openworks-position']);
  const missing = ordered.filter(([k]) => !isFilled(values[k])).map(([k]) => k);
  if (missing.length) return { ok: false, error: `OpenWorks 模型 ${model} 的 Schema 必填项没有取值：${missing.map((k) => `「${k}」`).join('、')}（不会用空串/null 占位）。请在 API 参数 JSON 中按 Schema 字段名填写。未出站，本地拦截。`, mapping };
  for (const [k, spec] of ordered) { const e = typeError(k, spec, values[k]); if (e) errors.push(e); }
  if (errors.length) return { ok: false, error: `OpenWorks 模型 ${model}：${errors.join('；')}。未出站，本地拦截。`, mapping };

  const inputs: Array<{ type: string; name?: string; value: unknown }> = ordered.map(([k, spec]: any) => ({ type: spec['x-openworks-type'], value: values[k] }));
  const flat: Record<string, unknown> = {};

  const pushNamed = (from: string, name: string, type: string, value: unknown) => {
    if (!isFilled(value)) return;
    inputs.push({ type, name, value });
    mapping.push({ from, to: name, value, sent: true, reason: 'live-tested named extra (雁 2026-10-17)' });
  };

  const seed = body?.seed;
  if (isFilled(seed)) {
    const n = Number(seed);
    if (Number.isFinite(n)) { pushNamed('seed', 'seed', 'INTEGER', Math.trunc(n)); flat.seed = Math.trunc(n); }
  }
  const steps = body?.steps;
  if (isFilled(steps)) {
    const n = Number(steps);
    if (Number.isFinite(n)) { pushNamed('steps', 'steps', 'INTEGER', Math.trunc(n)); flat.steps = Math.trunc(n); }
  }
  const cfg = body?.cfg ?? body?.cfg_scale;
  if (isFilled(cfg)) {
    const n = Number(cfg);
    if (Number.isFinite(n)) {
      pushNamed('cfg', 'cfg', 'NUMBER', n);
      pushNamed('cfg', 'cfg_scale', 'NUMBER', n);
      flat.cfg = n;
    }
  }
  const clipSkip = body?.clip_skip ?? body?.clipSkip ?? custom.clip_skip;
  if (isFilled(clipSkip)) {
    const n = Number(clipSkip);
    if (Number.isFinite(n)) { pushNamed('clip_skip', 'clip_skip', 'INTEGER', Math.trunc(n)); flat.clip_skip = Math.trunc(n); }
  }
  // Checkpoint id is NOT body.model (that is the OpenWorks toolName). Accept TAMS-shaped aliases.
  const ckpt = body?.checkpoint ?? body?.sdModel ?? body?.sd_model ?? custom.checkpoint ?? custom.sdModel;
  if (isFilled(ckpt)) {
    const id = String(ckpt).trim();
    pushNamed('checkpoint', 'checkpoint', 'STRING', id);
    pushNamed('checkpoint', 'model', 'STRING', id);
    pushNamed('checkpoint', 'sdModel', 'STRING', id);
    flat.checkpoint = id;
  }
  const neg = body?.negative_prompt ?? body?.negativePrompt;
  const negDeclared = [...(CANVAS_TO_SCHEMA_ALIASES.negative_prompt || []), 'negative_prompt'].some((n) => Object.hasOwn(props, n));
  if (isFilled(neg) && !negDeclared) {
    pushNamed('negative_prompt', 'negative_prompt', 'STRING', String(neg));
    flat.negative_prompt = String(neg);
  }

  const rawLoras = Array.isArray(body?.loras) ? body.loras : [];
  const loraItems: Array<{ name: string; strength: number }> = [];
  for (const l of rawLoras) {
    if (!l || typeof l !== 'object') continue;
    const id = String((l as any).name || (l as any).id || (l as any).loraModel || (l as any).path || (l as any).model || '').trim();
    if (!id) continue;
    const wRaw = (l as any).strength ?? (l as any).weight ?? (l as any).scale ?? 1;
    const w = Number(wRaw);
    const weight = Number.isFinite(w) ? w : 1;
    loraItems.push({ name: id, strength: weight });
  }
  if (loraItems.length) {
    const primary = loraItems[0];
    const ids = loraItems.map((x) => x.name).join(',');
    pushNamed('loras', 'loras', 'STRING', ids);
    pushNamed('loras', 'image_loras', 'STRING', ids);
    pushNamed('loras', 'lora', 'STRING', primary.name);
    pushNamed('loras', 'lora_id', 'STRING', primary.name);
    pushNamed('loras', 'lora_weight', 'NUMBER', primary.strength);
    pushNamed('loras', 'weight', 'NUMBER', primary.strength);
    const itemsJson = JSON.stringify(loraItems.map((x) => ({ loraModel: x.name, weight: x.strength })));
    pushNamed('loras', 'diffusion.lora.items', 'STRING', itemsJson);
    pushNamed('loras', 'lora_items', 'STRING', itemsJson);
    flat.loras = loraItems;
  }

  // Flat prompt/size for history cards + apply-to-canvas (positional inputs alone leave item.prompt empty).
  const promptSent = mapping.find((m) => m.from === 'prompt' && m.sent && typeof m.value === 'string');
  if (promptSent) flat.prompt = promptSent.value;
  const wSent = mapping.find((m) => m.from === 'width' && m.sent);
  const hSent = mapping.find((m) => m.from === 'height' && m.sent);
  if (wSent && Number.isFinite(Number(wSent.value))) flat.width = Number(wSent.value);
  if (hSent && Number.isFinite(Number(hSent.value))) flat.height = Number(hSent.value);

  const schemaFields = [...new Set([...Object.keys(props), ...mapping.filter((m) => m.sent && !m.from.startsWith('custom_parameters.')).map((m) => m.from)])];
  const parameters = { toolName: model, inputs, ...flat } as OpenWorksBuildOk['parameters'];
  return { ok: true, parameters, wire: { toolName: model, inputs }, mapping, schemaFields };
}

type Deps = {
  fetch: (meta: any, url: string, init?: any) => Promise<Response>;
  resolveKey: (req: express.Request) => string;
  /** Where the key came from (e.g. 「env TENSORART_API_KEY」, 「请求头 x-tensorart-key（设置页 tensorartKey）」). Recorded, never the secret. */
  keySource?: (req: express.Request) => string;
  durable: (url: string) => Promise<any>;
  record: (item: any) => Promise<any>;
};

export function registerOpenWorksRoutes(app: express.Express, dep: Deps) {
  const cache = new Map<string, { data: any[]; expiry: number }>();
  const tasks = new Map<string, { key: string; model: string; mediaKind: 'image' | 'video' }>();
  const keyOf = (req: express.Request) => {
    const key = dep.resolveKey(req);
    if (!key) throw Object.assign(new Error('未配置 Tensor.Art OpenWorks Access Key（ak_tensor_… / ak_tusi…）'), { status: 400, errorSource: 'local' });
    if (/[\s,;]/.test(key)) throw Object.assign(new Error(`Tensor.Art OpenWorks Key 含多个值（逗号/分号/空白分隔，共 ${key.split(/[\s,;]+/).filter(Boolean).length} 个）；Echo-Access-Key 只能放一个，不会替你挑。请在设置页只填一个 ak_tensor_…。未出站，本地拦截。`), { status: 400, errorSource: 'local' });
    if (!isOpenWorksAccessKey(key) && !key.startsWith('ak_tusi')) throw Object.assign(new Error('当前 Tensor.Art Key 不是 OpenWorks Access Key（ak_tensor_… / ak_tusi…）；TAMS Bearer Key 不能用于 OpenWorks。未出站，本地拦截。'), { status: 400, errorSource: 'local' });
    return key;
  };
  const catalog = async (req: express.Request, key: string) => {
    const hit = cache.get(key);
    if (hit && hit.expiry > Date.now()) return hit.data;
    const r = await dep.fetch({ provider: OPENWORKS_PROVIDER, route: req.path, model: 'catalog', key, readOnly: true }, `${openWorksBaseUrl(key)}/tool/list`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Echo-Access-Key': key }, body: '{}', signal: AbortSignal.timeout(15000) });
    const data = parseOpenWorksCatalog(r.status, await r.text());
    cache.set(key, { data, expiry: Date.now() + 120000 });
    return data;
  };
  const definition = async (req: express.Request, key: string, model: string) => {
    if (!model) throw Object.assign(new Error('请选择模型'), { status: 400, errorSource: 'local' });
    const entry = (await catalog(req, key)).find((e: any) => e?.name === model);
    const kind = entry && openWorksMediaKind(entry);
    if (!entry || !kind) throw Object.assign(new Error(`OpenWorks 目录中没有图像/视频模型「${model}」；未出站，本地拦截。`), { status: 400, errorSource: 'local' });
    const base = openWorksBaseUrl(key);
    return { provider: OPENWORKS_PROVIDER, model, sourceUrl: OPENWORKS_DOC_URL, catalogUrl: `${base}/tool/list`, endpoint: `${base}/task`, inputSchema: openWorksInputSchema(entry), schemaStatus: 'upstream-catalog-inputs', mediaKind: kind, modelMetadata: { description: entry.description, estimatedCost: entry.estimatedCost, outputs: entry.outputs } };
  };
  const fail = (res: express.Response, e: any) => res.status(e?.status || 500).json({ error: e?.message || String(e), errorSource: e?.errorSource || 'local', rawResponse: e?.rawResponse, upstreamStatus: e?.upstreamStatus });

  app.get('/api/model-schema', async (req, res, next) => {
    if (String(req.query.provider || '') !== OPENWORKS_PROVIDER) return next();
    try { const key = keyOf(req); res.json(await definition(req, key, String(req.query.model || '').trim())); } catch (e) { fail(res, e); }
  });

  app.post('/api/schema-provider/openworks/submit', async (req, res) => {
    let actualRequest: any;
    try {
      const key = keyOf(req);
      const model = String(req.body?.model || '').trim();
      const def = await definition(req, key, model);
      const built = buildOpenWorksRequest(model, def.inputSchema, req.body || {});
      if (!built.ok) return res.status(400).json({ error: built.error, errorSource: 'local', mapping: built.mapping, inputSchema: def.inputSchema });
      const masked = `${key.slice(0, 10)}…${key.slice(-4)}`;
      actualRequest = { endpoint: def.endpoint, parameters: built.parameters, mapping: built.mapping, schemaFields: built.schemaFields, credential: `tensorartKey · ${dep.keySource ? dep.keySource(req) : '未知来源'} · ${masked}` };
      const r = await dep.fetch({ provider: OPENWORKS_PROVIDER, route: req.path, model, key }, def.endpoint,
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'Echo-Access-Key': key }, body: JSON.stringify(built.wire) });
      const raw = await r.text();
      let data: any; try { data = JSON.parse(raw); } catch { /* raw */ }
      if (!r.ok || !data || (data.code !== '0' && data.code !== 0)) return res.status(r.ok ? 502 : r.status).json({ error: `Tensor.Art OpenWorks /task HTTP ${r.status}: ${raw}`, errorSource: 'upstream', upstreamStatus: r.status, rawResponse: raw, actualRequest });
      const taskId = String(data.data?.task?.id || data.data?.taskId || '');
      if (!taskId) return res.status(502).json({ error: `Tensor.Art OpenWorks /task 未返回任务 ID: ${raw}`, errorSource: 'upstream', rawResponse: raw, actualRequest });
      tasks.set(taskId, { key, model, mediaKind: def.mediaKind as 'image' | 'video' });
      // Upstream task id (data.data.task.id verbatim) for the history card's 参数与排错 fold.
      actualRequest.upstreamTaskId = taskId;
      res.json({ taskId, pollUrl: `/api/schema-provider/openworks/tasks/${encodeURIComponent(taskId)}`, actualRequest, inputSchema: def.inputSchema, rawResponse: data });
    } catch (e: any) { if (actualRequest) e.actualRequest = actualRequest; fail(res, e); }
  });

  app.get('/api/schema-provider/openworks/tasks/:taskId', async (req, res) => {
    try {
      const taskId = req.params.taskId;
      const task = tasks.get(taskId);
      if (!task) return res.status(409).json({ error: '任务不属于本会话提交的 OpenWorks 请求；为避免切换账户，不会用其他 Key 轮询', errorSource: 'local' });
      const url = `${openWorksBaseUrl(task.key)}/task/query`;
      const r = await dep.fetch({ provider: OPENWORKS_PROVIDER, route: req.path, model: task.model, key: task.key }, url,
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'Echo-Access-Key': task.key }, body: JSON.stringify({ taskIds: [taskId] }) });
      const raw = await r.text();
      let data: any; try { data = JSON.parse(raw); } catch { /* raw */ }
      if (!r.ok || !data || (data.code !== '0' && data.code !== 0)) return res.status(r.ok ? 502 : r.status).json({ error: `Tensor.Art OpenWorks /task/query HTTP ${r.status}: ${raw}`, errorSource: 'upstream', upstreamStatus: r.status, rawResponse: raw });
      const t = data.data?.tasks?.[0] || data.data?.[0];
      const up = String(t?.status || '').toUpperCase();
      const outputs = (t?.outputs || []).map((o: any) => typeof o === 'string' ? o : o?.value || o?.url || '').filter(Boolean);
      const status = up === 'FINISH' || up === 'SUCCESS' ? 'completed' : ['FAILED', 'EXCEPTION', 'CANCELED'].includes(up) ? 'failed' : 'processing';
      res.json({ status, upstreamStatus: up, outputs, mediaType: task.mediaKind, rawResponse: data, endpoint: url });
    } catch (e) { fail(res, e); }
  });

  app.post('/api/schema-provider/openworks/save-result', async (req, res) => {
    try {
      const saved = []; const failures = [];
      for (const url of req.body?.outputs || []) {
        const d = await dep.durable(typeof url === 'string' ? url : url?.url);
        if (!d.ok) { failures.push({ url, error: d.message, details: d }); continue; }
        saved.push(await dep.record({ ...req.body.metadata, url: d.dataUrl, provider: 'Tensor.Art OpenWorks', actualProvider: 'Tensor.Art OpenWorks' }));
      }
      res.json({ historyItems: saved, historyWarning: failures.length ? '部分产物保存失败，生成结果仍可用' : undefined, transientOutputs: failures });
    } catch (e) { fail(res, e); }
  });

  /** Model hub rows; used by /api/models/live aggregation in server.ts. */
  return { catalogItems: async (req: express.Request) => { const key = keyOf(req); return { items: openWorksCatalogItems(await catalog(req, key), `${openWorksBaseUrl(key)}/tool/list`), sourceUrl: OPENWORKS_DOC_URL }; }, catalog: (req: express.Request, key: string) => catalog(req, key) };
}
