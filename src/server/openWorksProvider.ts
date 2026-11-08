/**
 * Tensor.Art OpenWorks as an ordinary schema-driven provider (provider id `openworks`).
 *
 * Official source (SKILL.md v1.0.0 + scripts/_api.py + scripts/create_task.py, re-read 2026-11-08):
 * https://raw.githubusercontent.com/Tensor-Art/tensorart-skills/master/skills/tensorart-generate/SKILL.md
 * Upstream wire: catalog POST /tool/list, create POST /task {toolName, inputs} (posted unchanged), poll POST /task/query {taskIds}.
 * `inputs[]` elements correspond BY POSITION to the tool definition; `type` is one of STRING INTEGER NUMBER BOOLEAN ARRAY OBJECT FILE.
 * Auth header Echo-Access-Key (ak_tensor_… → openapi.tensor.art, ak_tusi… → openapi.tusiart.cn).
 *
 * Canvas side is generic: each catalog entry is a model (id = upstream name); its upstream `inputs[]` become a JSON-Schema
 * `inputSchema` (property name = upstream description verbatim, position kept in x-openworks-position). Submit maps canvas fields
 * onto that Schema with the same alias table the 会发送/不会发送 badges use, then serialises by position. No keyword guessing.
 * Values are never converted, truncated or blocked locally: type mismatches and empty slots are reported in `mapping`, upstream decides.
 */
import type express from 'express';
import { CANVAS_TO_SCHEMA_ALIASES } from '../utils/schemaSendHint.ts';
import { isOpenWorksAccessKey } from '../schemas/tensorArtCredentials.ts';

export const OPENWORKS_PROVIDER = 'openworks';
export const OPENWORKS_DOC_URL = 'https://raw.githubusercontent.com/Tensor-Art/tensorart-skills/master/skills/tensorart-generate/SKILL.md';
export const openWorksBaseUrl = (key: string) =>
  String(key || '').trim().startsWith('ak_tusi') ? 'https://openapi.tusiart.cn/openworks/v1' : 'https://openapi.tensor.art/openworks/v1';

/**
 * Fields the builder can append as NAMED extras (after the positional catalog inputs) when the catalog does not declare them.
 * These are NOT part of the official OpenWorks contract (SKILL/create_task define positional values only) and their adoption is 未验证:
 * the historical probes (docs/evidence/openworks-lora-probe / openworks-seed-matrix / openworks-recipe-*, 2026-10-17) only exercised
 * `photoreal_studio_z_image` and concluded ignored_or_unproven (HTTP 200 + FINISH ≠ applied). Alias names are TAMS-derived guesses.
 * History records them as 实际发送 (mapping sent:true) only — never as 已生效.
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

const JSON_TYPE: Record<string, string> = { STRING: 'string', INTEGER: 'integer', NUMBER: 'number', BOOLEAN: 'boolean', ARRAY: 'array', OBJECT: 'object', FILE: 'string' };

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
    if (t === 'OBJECT' && inp?.schema?.properties) {
      spec.properties = inp.schema.properties;
      if (inp?.schema?.required) spec.required = inp.schema.required;
    }
    properties[key] = spec;
  });
  return { type: 'object', properties, required: Object.keys(properties) };
}

const UNDECLARED = 'catalog undeclared / upstream adoption 未验证';
const PROBE_SCOPE = '历史 probe(2026-10-17) 仅测 photoreal_studio_z_image，结论 ignored_or_unproven（HTTP 200+FINISH≠已采用）';
const KNOWN_TYPES = new Set(Object.keys(JSON_TYPE));

const openWorksValueType = (v: unknown): string => {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'ARRAY';
  if (typeof v === 'number') return Number.isInteger(v) ? 'INTEGER' : 'NUMBER';
  if (typeof v === 'boolean') return 'BOOLEAN';
  if (typeof v === 'string') return 'STRING';
  return typeof v === 'object' ? 'OBJECT' : typeof v;
};
const preview = (v: unknown) => { const s = JSON.stringify(v) ?? String(v); return s.length > 80 ? `${s.slice(0, 80)}…` : s; };

/** Non-blocking diagnostic only: how a supplied value differs from the declared official type. The value is always sent as given. */
function slotMismatch(spec: any, v: unknown): { expected: string; actual: string; detail?: string } | null {
  const expected = String(spec['x-openworks-type']);
  if (!KNOWN_TYPES.has(expected)) return null;
  const actual = openWorksValueType(v);
  const ok = expected === 'NUMBER' ? actual === 'INTEGER' || actual === 'NUMBER'
    : expected === 'STRING' || expected === 'FILE' ? actual === 'STRING' : expected === actual;
  if (!ok) return { expected, actual };
  if (expected === 'ARRAY') {
    const req: string[] = Array.isArray(spec.items?.required) ? spec.items.required : [];
    for (const [n, item] of (v as unknown[]).entries()) {
      const miss = req.filter((k) => !isFilled((item as any)?.[k]));
      if (miss.length) return { expected, actual, detail: `第 ${n + 1} 项缺少 schema 必填项 ${miss.join(', ')}` };
    }
  }
  if (expected === 'OBJECT') {
    const miss = (Array.isArray(spec.required) ? spec.required : []).filter((k: string) => !isFilled((v as any)?.[k]));
    if (miss.length) return { expected, actual, detail: `缺少 schema 必填项 ${miss.join(', ')}` };
  }
  return null;
}

export type OpenWorksMapping = { from: string; to: string | null; value: unknown; sent: boolean; reason?: string; expected?: string; actual?: string };

/**
 * Wire body for POST /task is { toolName, inputs }: catalog `inputs[]` by position first, then NAMED extras.
 * - Every canvas field (incl. seed/steps/cfg/clip_skip/checkpoint/negative_prompt/loras) is matched against the declared
 *   inputs first; only when the catalog declares no matching input does it go out as a named extra.
 * - Named extras are NOT in the official contract (SKILL/create_task are positional); they are sent so the upstream can decide,
 *   and every mapping entry says `catalog undeclared / upstream adoption 未验证`. custom_parameters keys that are not declared
 *   go out under their own name, unchanged.
 * - Values are never converted, truncated or blocked locally. Empty positional slots, type mismatches and skipped LoRA entries are
 *   reported in `mapping` (non-blocking); `sent` means "present in `wire`".
 * History: flat fields on `parameters` (seed/steps/cfg/loras/…) feed the 实际发送 chips; the upstream fetch uses only `wire`.
 */
export type OpenWorksBuildOk = {
  ok: true;
  parameters: {
    toolName: string;
    inputs: Array<{ type: string; name?: string; value: unknown }>;
    prompt?: string;
    width?: number;
    height?: number;
    seed?: unknown;
    steps?: unknown;
    cfg?: unknown;
    negative_prompt?: unknown;
    checkpoint?: unknown;
    clip_skip?: unknown;
    loras?: unknown;
  };
  wire: { toolName: string; inputs: Array<{ type: string; name?: string; value: unknown }> };
  mapping: OpenWorksMapping[];
  /** Tool Schema property names + canvas names actually sent (incl. named extras) — history uses this to tell 实际发送 from 该端点不支持. */
  schemaFields: string[];
};

/** Canvas field → body keys read (first filled wins). */
const BODY_KEYS: Record<string, string[]> = {
  cfg: ['cfg', 'cfg_scale'], clip_skip: ['clip_skip', 'clipSkip'], checkpoint: ['checkpoint', 'sdModel', 'sd_model'], negative_prompt: ['negative_prompt', 'negativePrompt'],
};
/** Declared-input names tried after CANVAS_TO_SCHEMA_ALIASES (the table the 会发送/不会发送 badges use). */
const OPENWORKS_ALIASES: Record<string, string[]> = {
  count: ['result image count', 'image count', 'image_count', 'count', 'n', 'num_images', 'image_num'],
  batch_size: ['result image count', 'image count', 'image_count', 'count', 'batch_size'],
  image_num: ['result image count', 'image count', 'image_count', 'count', 'image_num'],
  clip_skip: ['clipSkip'], checkpoint: ['sdModel', 'sd_model'],
};
const NAMED_FIELDS = new Set(['seed', 'steps', 'cfg', 'clip_skip', 'checkpoint', 'negative_prompt', 'loras']);
const CANVAS_FIELDS = ['prompt', 'negative_prompt', 'width', 'height', 'image_url', 'denoise', 'sampler_name', 'scheduler', 'duration', 'ratio', 'size', 'count', 'batch_size', 'image_num',
  'seed', 'steps', 'cfg', 'clip_skip', 'checkpoint', 'loras'];
const LORA_ID_KEYS = ['name', 'id', 'loraModel', 'path', 'model'];
const LORA_WEIGHT_KEYS = ['strength', 'weight', 'scale'];

const extraType = (v: unknown): string => {
  const t = openWorksValueType(v);
  return t === 'null' ? 'STRING' : t;
};

export function buildOpenWorksRequest(model: string, inputSchema: ReturnType<typeof openWorksInputSchema>, body: any):
  OpenWorksBuildOk | { ok: false; error: string; mapping: OpenWorksMapping[] } {
  const props = inputSchema.properties;
  const mapping: OpenWorksMapping[] = [];
  const values: Record<string, unknown> = {};
  const custom = { ...(body?.custom_parameters && typeof body.custom_parameters === 'object' ? body.custom_parameters : {}) };
  delete custom._canvas;
  // Fields the catalog Schema does not list: sent as named extras under their own name (upstream decides).
  const extras: Array<{ from: string; name: string; value: unknown; origin: 'canvas' | 'custom' }> = [];

  for (const [k, v] of Object.entries(custom)) {
    if (Object.hasOwn(props, k)) { values[k] = v; mapping.push({ from: `custom_parameters.${k}`, to: k, value: v, sent: true }); continue; }
    if (isFilled(v)) extras.push({ from: `custom_parameters.${k}`, name: k, value: v, origin: 'custom' });
    else mapping.push({ from: `custom_parameters.${k}`, to: k, value: v, sent: false, reason: `${UNDECLARED} · 值为空（null/空串/空数组），未发送` });
  }

  const canvasValue: Record<string, unknown> = {};
  const declaredSlot: Record<string, string> = {};
  for (const field of CANVAS_FIELDS) {
    const key = (BODY_KEYS[field] || [field]).find((k) => isFilled(body?.[k]));
    if (key === undefined) continue;
    const v = body[key];
    canvasValue[field] = v;
    const target = [field, ...(CANVAS_TO_SCHEMA_ALIASES[field] || []), ...(OPENWORKS_ALIASES[field] || [])].find((n) => Object.hasOwn(props, n));
    if (!target) {
      if (!NAMED_FIELDS.has(field)) extras.push({ from: field, name: field, value: v, origin: 'canvas' });
      continue;
    }
    declaredSlot[field] = target;
    if (Object.hasOwn(values, target)) { mapping.push({ from: field, to: target, value: v, sent: false, reason: `位置输入「${target}」已由 custom_parameters 或前一个 canvas 字段填写，本值未发送` }); continue; }
    values[target] = v; mapping.push({ from: field, to: target, value: v, sent: true });
  }

  const ordered = Object.entries(props).sort((a: any, b: any) => a[1]['x-openworks-position'] - b[1]['x-openworks-position']);
  const inputs: Array<{ type: string; name?: string; value: unknown }> = ordered.map(([k, spec]: any) => ({ type: spec['x-openworks-type'], value: values[k] }));
  const flat: Record<string, unknown> = {};

  const pushNamed = (from: string, name: string, value: unknown, reason: string) => {
    inputs.push({ type: extraType(value), name, value });
    mapping.push({ from, to: name, value, sent: true, reason });
  };
  const note = (field: string, v: unknown, intOnly: boolean) => typeof v !== 'number' ? ' · 值非数字，原样发送未转换'
    : intOnly && !Number.isInteger(v) ? ' · 值为非整数，原样发送未截断' : '';
  const canvasReason = (field: string, extra = '') => `${UNDECLARED} · 来源 canvas.${field}；${PROBE_SCOPE}${extra}`;
  const aliasReason = (field: string, name: string, extra = '') => canvasReason(field, `；「${name}」为 TAMS 风格命名猜测，非 OpenWorks 官方契约${extra}`);

  for (const e of extras) pushNamed(e.from, e.name, e.value, `${UNDECLARED} · 来源 ${e.origin === 'custom' ? 'custom_parameters' : `canvas.${e.from}`}，按字段名原样发送`);

  const undeclared = (field: string) => field in canvasValue && !(field in declaredSlot);
  for (const [field, intOnly] of [['seed', true], ['steps', true], ['clip_skip', true]] as const) {
    if (!undeclared(field)) continue;
    const v = canvasValue[field];
    pushNamed(field, field, v, canvasReason(field, note(field, v, intOnly)));
  }
  if (undeclared('cfg')) {
    const v = canvasValue.cfg;
    pushNamed('cfg', 'cfg', v, canvasReason('cfg', note('cfg', v, false)));
    pushNamed('cfg', 'cfg_scale', v, aliasReason('cfg', 'cfg_scale', note('cfg', v, false)));
  }
  if (undeclared('checkpoint')) {
    // Checkpoint id is NOT body.model (that is the OpenWorks toolName).
    const v = canvasValue.checkpoint;
    pushNamed('checkpoint', 'checkpoint', v, canvasReason('checkpoint'));
    pushNamed('checkpoint', 'model', v, aliasReason('checkpoint', 'model'));
    pushNamed('checkpoint', 'sdModel', v, aliasReason('checkpoint', 'sdModel'));
  }
  if (undeclared('negative_prompt')) pushNamed('negative_prompt', 'negative_prompt', canvasValue.negative_prompt, canvasReason('negative_prompt'));

  if (undeclared('loras')) {
    const raw = canvasValue.loras;
    const list = Array.isArray(raw) ? raw : undefined;
    if (!list) {
      pushNamed('loras', 'loras', raw, canvasReason('loras', ' · 不是数组，原样发送'));
      flat.loras = raw;
    } else {
      const items: Array<{ id: string; strength: unknown; hasStrength: boolean; rest: Record<string, unknown>; item: Record<string, unknown> }> = [];
      list.forEach((l: any, i: number) => {
        const idKey = l && typeof l === 'object' && !Array.isArray(l) ? LORA_ID_KEYS.find((k) => String(l[k] ?? '').trim()) : undefined;
        if (!idKey) { mapping.push({ from: `loras[${i}]`, to: null, value: l, sent: false, reason: 'LoRA 条目不是含 name/id/loraModel/path/model 的对象，无法生成命名字段，未发送' }); return; }
        const wKey = LORA_WEIGHT_KEYS.find((k) => l[k] !== undefined && l[k] !== null && l[k] !== '');
        const id = String(l[idKey]);
        const rest = Object.fromEntries(Object.entries(l).filter(([k]) => k !== idKey && k !== wKey));
        items.push({ id, strength: wKey ? l[wKey] : undefined, hasStrength: !!wKey, rest, item: { ...l, name: id, ...(wKey && !('strength' in l) ? { strength: l[wKey] } : {}) } });
      });
      if (items.length) {
        const primary = items[0];
        const multi = items.length > 1 ? `（共 ${items.length} 个 LoRA，此别名仅取第一个）` : '';
        const ids = items.map((x) => x.id).join(',');
        pushNamed('loras', 'loras', ids, aliasReason('loras', 'loras', items.length > 1 ? ' · 多个 LoRA 以逗号拼接' : ''));
        pushNamed('loras', 'image_loras', ids, aliasReason('loras', 'image_loras', items.length > 1 ? ' · 多个 LoRA 以逗号拼接' : ''));
        pushNamed('loras', 'lora', primary.id, aliasReason('loras', 'lora', multi));
        pushNamed('loras', 'lora_id', primary.id, aliasReason('loras', 'lora_id', multi));
        if (primary.hasStrength) {
          pushNamed('loras', 'lora_weight', primary.strength, aliasReason('loras', 'lora_weight', multi));
          pushNamed('loras', 'weight', primary.strength, aliasReason('loras', 'weight', multi));
        }
        const itemsJson = JSON.stringify(items.map((x) => ({ loraModel: x.id, ...(x.hasStrength ? { weight: x.strength } : {}), ...x.rest })));
        pushNamed('loras', 'diffusion.lora.items', itemsJson, aliasReason('loras', 'diffusion.lora.items', ' · 完整 LoRA 对象（含额外字段）的 JSON 字符串'));
        pushNamed('loras', 'lora_items', itemsJson, aliasReason('loras', 'lora_items', ' · 完整 LoRA 对象（含额外字段）的 JSON 字符串'));
        items.forEach((x, i) => Object.entries(x.rest).forEach(([k, v]) => mapping.push({
          from: `loras[${i}].${k}`, to: 'lora_items / diffusion.lora.items（JSON 字符串内）', value: v, sent: true,
          reason: `${UNDECLARED} · LoRA 额外字段，仅随 JSON 字符串原样携带；无官方契约，上游是否采用 未验证`,
        })));
        flat.loras = items.map((x) => x.item);
      }
    }
  } else if ('loras' in declaredSlot) {
    flat.loras = canvasValue.loras;
  }
  for (const field of ['seed', 'steps', 'cfg', 'clip_skip', 'checkpoint', 'negative_prompt']) {
    const m = mapping.find((x) => x.from === field && x.sent);
    if (m) flat[field] = m.value;
  }

  // Flat prompt/size for history cards + apply-to-canvas (positional inputs alone leave item.prompt empty).
  const promptSent = mapping.find((m) => m.from === 'prompt' && m.sent && typeof m.value === 'string');
  if (promptSent) flat.prompt = promptSent.value;
  const wSent = mapping.find((m) => m.from === 'width' && m.sent);
  const hSent = mapping.find((m) => m.from === 'height' && m.sent);
  if (wSent && Number.isFinite(Number(wSent.value))) flat.width = Number(wSent.value);
  if (hSent && Number.isFinite(Number(hSent.value))) flat.height = Number(hSent.value);

  // Positional-slot diagnostics (non-blocking; upstream decides): empty slots and type mismatches.
  for (const [k, spec] of ordered) {
    const pos = spec['x-openworks-position'];
    if (!Object.hasOwn(values, k)) {
      mapping.push({ from: `schema:${k}`, to: k, value: undefined, sent: false, reason: `未填写：官方 inputs[${pos}]（${spec['x-openworks-type']}）无值，wire 只含 type，不补默认`, expected: spec['x-openworks-type'] });
      continue;
    }
    const v = values[k];
    const mm = slotMismatch(spec, v);
    const entry = mapping.find((m) => m.to === k && m.sent);
    if (!mm || !entry) continue;
    entry.expected = mm.expected; entry.actual = mm.actual;
    entry.reason = [entry.reason, mm.detail ? `schema 提示：${mm.detail}（值已原样提交）`
      : `类型不匹配（非阻断）：官方 inputs[${pos}] 声明 ${mm.expected}，收到 ${mm.actual} ${preview(v)}，已原样提交，上游裁决`].filter(Boolean).join(' · ');
  }

  const schemaFields = [...new Set([...Object.keys(props), ...mapping.filter((m) => m.sent && !m.from.startsWith('custom_parameters.') && !m.from.includes('[')).map((m) => m.from)])];
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
    if (/[\s,;]/.test(key)) throw Object.assign(new Error(`Tensor.Art OpenWorks Key 含多个值（逗号/分号/空白分隔，共 ${key.split(/[\s,;]+/).filter(Boolean).length} 个）；Echo-Access-Key 只能放一个，不会替你挑。请在设置页只填一个 ak_tensor_…。`), { status: 400, errorSource: 'local' });
    if (!isOpenWorksAccessKey(key) && !key.startsWith('ak_tusi')) throw Object.assign(new Error('当前 Tensor.Art Key 不是 OpenWorks Access Key（ak_tensor_… / ak_tusi…）；TAMS Bearer Key 不能用于 OpenWorks。'), { status: 400, errorSource: 'local' });
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
    // Not in catalog: still send the user's model name; upstream decides.
    void kind;
    const base = openWorksBaseUrl(key);
    return { provider: OPENWORKS_PROVIDER, model, sourceUrl: OPENWORKS_DOC_URL, catalogUrl: `${base}/tool/list`, endpoint: `${base}/task`, inputSchema: openWorksInputSchema(entry), schemaStatus: 'upstream-catalog-inputs', mediaKind: kind, modelMetadata: { description: entry?.description, estimatedCost: entry?.estimatedCost, outputs: entry?.outputs } };
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
