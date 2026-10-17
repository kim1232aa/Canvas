import type { GenerationHistoryItem } from '../types/providers';
import { formatKeyUsage, keyUsagesFromTrace } from '../server/keyUsage';

export type HistoryParameterKey =
  | 'negativePrompt'
  | 'seed'
  | 'steps'
  | 'cfg'
  | 'sampler'
  | 'scheduler'
  | 'width'
  | 'height'
  | 'size';

export type HistoryParameterSource =
  | 'upstream'
  | 'image-metadata'
  | 'sent'
  | 'requested'
  | 'legacy'
  | 'not-sent'
  | 'schema-unrecorded'
  | 'blocked'
  | 'intended'
  | 'unsupported'
  | 'unknown';

export interface ResolvedHistoryParameter {
  key: HistoryParameterKey;
  value: unknown;
  source: HistoryParameterSource;
  requested?: unknown;
  sent?: unknown;
  upstream?: unknown;
  /** source==='blocked': the declared-Schema constraint that refused this value locally. */
  blocked?: { minimum?: number; maximum?: number; enum?: unknown[]; reason?: string };
}

type AnyRecord = Record<string, any>;

const isRecord = (value: unknown): value is AnyRecord =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const parseJson = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text || (text[0] !== '{' && text[0] !== '[')) return value;
  try { return JSON.parse(text); } catch { return value; }
};

const flattenTamsStages = (body: AnyRecord): AnyRecord | null => {
  if (!Array.isArray(body.stages)) return null;
  const init = body.stages.find((s: any) => s?.type === 'INPUT_INITIALIZE')?.inputInitialize
    ?? body.stages[0]?.inputInitialize;
  const diff = body.stages.find((s: any) => s?.type === 'DIFFUSION')?.diffusion
    ?? body.stages[1]?.diffusion;
  if (!isRecord(init) && !isRecord(diff)) return null;
  const flat: AnyRecord = {};
  if (isRecord(init)) Object.assign(flat, init);
  if (isRecord(diff)) {
    Object.assign(flat, diff);
    if (Array.isArray(diff.negativePrompts) && diff.negativePrompts[0]?.text != null) {
      flat.negativePrompt = diff.negativePrompts[0].text;
      flat.negative_prompt = diff.negativePrompts[0].text;
    }
    if (diff.sampler != null) flat.sampler = diff.sampler;
    if (diff.scheduleName != null) flat.schedule = diff.scheduleName;
  }
  return flat;
};

/** Shared wire aliases — detect where generation fields live in nested envelopes (not provider-specific). */
const GENERATION_WIRE_ALIASES = [
  'negativePrompt', 'negative_prompt', 'seed', 'steps', 'num_inference_steps',
  'cfgScale', 'cfg_scale', 'guidance_scale', 'guidance', 'cfg',
  'sampleMethod', 'sampler', 'sampler_name', 'schedule', 'scheduler',
  'width', 'height', 'image_size', 'size', 'prompt',
  'loras', 'styles', 'lora_list',
] as const;

export const unwrapGenerationParameters = (value: unknown): AnyRecord => {
  const body = parseJson(value);
  if (!isRecord(body)) return {};

  // OpenWorks: prefer flat sentFields recorded alongside positional inputs
  if (isRecord(body.sentFields)) return { ...body.sentFields };
  // Or flat keys mixed into actualParameters next to toolName/inputs
  if (typeof body.toolName === 'string' && Array.isArray(body.inputs)) {
    const { toolName: _t, inputs: _i, ...rest } = body;
    if (Object.keys(rest).length) return rest as AnyRecord;
  }

  const tams = flattenTamsStages(body);
  if (tams) return tams;

  const directStep = Array.isArray(body.steps) ? body.steps[0] : undefined;
  // TAMS diffusion.steps is a number — only treat array workflow steps
  if (Array.isArray(body.steps) && isRecord(directStep?.input)) return directStep.input;
  if (Array.isArray(body.steps) && isRecord(directStep?.arguments)) return directStep.arguments;

  const workflow = isRecord(body.data) && isRecord(body.data.workflow) ? body.data.workflow : undefined;
  const workflowStep = Array.isArray(workflow?.steps) ? workflow.steps[0] : undefined;
  if (isRecord(workflowStep?.input)) return workflowStep.input;
  if (isRecord(workflowStep?.arguments)) return workflowStep.arguments;

  const inputStep = isRecord(body.input) && Array.isArray(body.input.steps) ? body.input.steps[0] : undefined;
  if (isRecord(inputStep?.arguments)) return inputStep.arguments;
  if (isRecord(inputStep?.input)) return inputStep.input;

  // Schema-provider actualRequest envelope
  if (isRecord(body.parameters) && (body.endpoint || body.mapping)) {
    return unwrapGenerationParameters(body.parameters);
  }

  // Nested wire envelopes (generic): generation fields may live under request / input / arguments
  // e.g. Novita parameters={extra, request:{steps,seed,...}}, Replicate flat input:{...}.
  // Descend only when the nest carries known generation aliases and the parent does not —
  // no provider-specific field hardcoding beyond the shared alias list.
  const hasGen = (o: AnyRecord) => GENERATION_WIRE_ALIASES.some((k) => Object.prototype.hasOwnProperty.call(o, k));
  if (!hasGen(body)) {
    for (const nestKey of ['request', 'input', 'arguments'] as const) {
      const nested = body[nestKey];
      if (isRecord(nested) && hasGen(nested)) return unwrapGenerationParameters(nested);
    }
  }

  return body;
};

const last = <T,>(items: T[] | undefined): T | undefined =>
  Array.isArray(items) && items.length ? items[items.length - 1] : undefined;

const readKeys = (obj: AnyRecord | undefined, keys: string[]): unknown => {
  if (!obj) return undefined;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
  }
  return undefined;
};

const FIELD_KEYS: Record<HistoryParameterKey, string[]> = {
  negativePrompt: ['negativePrompt', 'negative_prompt'],
  seed: ['seed'],
  steps: ['steps', 'num_inference_steps'],
  cfg: ['cfgScale', 'cfg_scale', 'guidance_scale', 'guidance', 'cfg'],
  sampler: ['sampleMethod', 'sampler', 'sampler_name'],
  scheduler: ['schedule', 'scheduler'],
  width: ['width'],
  height: ['height'],
  // Schema size fields (e.g. AIMLAPI image_size enum string or {width,height}; OpenAI-style size string;
  // aspect_ratio for MuAPI/WaveSpeed/Sogni/Venice ratio models — so history size row shows the sent ratio
  // instead of folding 「尺寸」 into 「该端点不支持」 when the endpoint only has aspect_ratio).
  size: ['image_size', 'size', 'aspect_ratio'],
};

const normalizeSize = (value: unknown): unknown =>
  isRecord(value) && value.width !== undefined && value.height !== undefined ? `${value.width}×${value.height}` : value;

/** Canvas request field (blockedField.from) → history key. Generic: same names graphEngine sends. */
const BLOCKED_FROM_KEY: Record<string, HistoryParameterKey> = {
  steps: 'steps', cfg: 'cfg', seed: 'seed', width: 'width', height: 'height', sampler_name: 'sampler', scheduler: 'scheduler',
  negative_prompt: 'negativePrompt', 'width+height': 'size',
};

const legacyValue = (item: GenerationHistoryItem, key: HistoryParameterKey): unknown => {
  if (key === 'negativePrompt') return item.negativePrompt;
  if (key === 'size') return undefined;
  return item[key];
};

const hasMeaningfulValue = (value: unknown): boolean =>
  value !== undefined && value !== null && value !== '' && !(typeof value === 'number' && Number.isNaN(value));

function dataUrlBytes(url: string): Uint8Array | null {
  const match = /^data:[^;,]+;base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(url || '');
  if (!match) return null;
  try {
    const binary = globalThis.atob(match[1].replace(/\s+/g, ''));
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function readEmbeddedLabel(bytes: Uint8Array, label: string): string | undefined {
  const ascii = Array.from(label, (c) => c.charCodeAt(0));
  const utf16 = ascii.flatMap((b) => [b, 0]);

  const find = (needle: number[]): number => {
    outer: for (let i = 0; i <= bytes.length - needle.length; i++) {
      for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
      return i + needle.length;
    }
    return -1;
  };

  let pos = find(utf16);
  if (pos >= 0) {
    let text = '';
    for (let i = pos; i + 1 < bytes.length && text.length < 160; i += 2) {
      if (bytes[i + 1] !== 0) break;
      const ch = String.fromCharCode(bytes[i]);
      if (ch === '\0' || ch === '\n' || ch === '\r' || ch === ',') break;
      text += ch;
    }
    return text.trim() || undefined;
  }

  pos = find(ascii);
  if (pos >= 0) {
    let text = '';
    for (let i = pos; i < bytes.length && text.length < 160; i++) {
      const ch = String.fromCharCode(bytes[i]);
      if (ch === '\0' || ch === '\n' || ch === '\r' || ch === ',') break;
      if (bytes[i] < 32 || bytes[i] > 126) break;
      text += ch;
    }
    return text.trim() || undefined;
  }
  return undefined;
}

export function extractEmbeddedGenerationParameters(url: string): Partial<Record<HistoryParameterKey, unknown>> {
  const bytes = dataUrlBytes(url);
  if (!bytes) return {};
  const result: Partial<Record<HistoryParameterKey, unknown>> = {};

  const seed = Number(readEmbeddedLabel(bytes, 'Seed: '));
  if (Number.isFinite(seed)) result.seed = seed;

  const steps = Number(readEmbeddedLabel(bytes, 'Steps: '));
  if (Number.isFinite(steps)) result.steps = steps;

  const cfg = Number(readEmbeddedLabel(bytes, 'CFG scale: '));
  if (Number.isFinite(cfg)) result.cfg = cfg;

  const sampler = readEmbeddedLabel(bytes, 'Sampler: ');
  if (sampler) result.sampler = sampler;

  const scheduler =
    readEmbeddedLabel(bytes, 'Schedule type: ') ||
    readEmbeddedLabel(bytes, 'Scheduler: ') ||
    readEmbeddedLabel(bytes, 'Schedule: ');
  if (scheduler) result.scheduler = scheduler;

  const size = readEmbeddedLabel(bytes, 'Size: ');
  const sizeMatch = size?.match(/^(\d+)\s*x\s*(\d+)$/i);
  if (sizeMatch) {
    result.width = Number(sizeMatch[1]);
    result.height = Number(sizeMatch[2]);
  }

  return result;
}

export function resolveHistoryParameters(item: GenerationHistoryItem): Record<HistoryParameterKey, ResolvedHistoryParameter> {
  const metadata = isRecord(item.requestMetadata) ? item.requestMetadata : {};
  const requested = isRecord(metadata.requestedParameters) ? metadata.requestedParameters : undefined;

  const submission = last(Array.isArray(metadata.submissions) ? metadata.submissions : undefined);
  const sent: AnyRecord = { ...(isRecord(metadata.actualParameters)
    ? unwrapGenerationParameters(metadata.actualParameters)
    : isRecord(metadata.actualRequest)
      ? unwrapGenerationParameters(metadata.actualRequest)
      : unwrapGenerationParameters(isRecord(submission) ? submission.parameters : undefined)) };

  // Schema size object (e.g. image_size {width,height}) carries canvas width/height — same alias as schemaSendHint.
  if (isRecord(sent.image_size)) {
    if (sent.width === undefined && sent.image_size.width !== undefined) sent.width = sent.image_size.width;
    if (sent.height === undefined && sent.image_size.height !== undefined) sent.height = sent.image_size.height;
  }
  const trace = last(Array.isArray(metadata.executionTrace) ? metadata.executionTrace : undefined);
  // Upstream-effective values only from a successful generation response. A failed / local_blocked entry has no
  // upstream parameters (its body is an error), and an externalized raw-response reference ({kind:'raw-response',size:<bytes>})
  // is storage metadata — reading it gave 「尺寸: 505 · 上游实际」 (byte count of the 403 body).
  const traceBody = isRecord(trace) ? parseJson(trace.responseBody) : undefined;
  const upstream = item.status === 'failed' || item.status === 'local_blocked'
    ? {}
    : isRecord(metadata.effectiveParameters)
      ? unwrapGenerationParameters(metadata.effectiveParameters)
      : isRecord(traceBody) && traceBody.kind === 'raw-response' ? {} : unwrapGenerationParameters(traceBody);
  // local_blocked: what would have been sent (canvas request body), labelled 拟发送（未出站）.
  const intendedRaw = item.status === 'local_blocked' && isRecord(metadata.intendedRequest) ? metadata.intendedRequest : undefined;
  // Route-built proposal is an envelope {endpoint, parameters, mapping, schemaFields}: read the would-be body only.
  const intendedBody: AnyRecord | undefined = intendedRaw ? (isRecord(intendedRaw.parameters) ? intendedRaw.parameters : intendedRaw) : undefined;
  // Envelope bodies ({input:{…}} / {request:{…}}) carry the wire fields one level down.
  const intended: AnyRecord = intendedBody ? { ...(isRecord(intendedBody.custom_parameters) ? intendedBody.custom_parameters : {}), ...(isRecord(intendedBody.request) ? intendedBody.request : {}), ...(isRecord(intendedBody.input) ? intendedBody.input : {}), ...intendedBody } : {};
  if (intendedBody && isRecord(intendedBody.custom_parameters) && intendedBody.custom_parameters.image_size !== undefined) intended.image_size = intendedBody.custom_parameters.image_size;

  const embedded = extractEmbeddedGenerationParameters(item.url || '');
  const hasSentEvidence = Object.keys(sent).length > 0 || !!submission || isRecord(metadata.actualRequest);
  const hasAnyMetadata = Object.keys(metadata).length > 0;

  const blockedField = item.status === 'local_blocked' && isRecord(metadata.blockedField) ? metadata.blockedField : undefined;
  const blockedKey = blockedField ? BLOCKED_FROM_KEY[String(blockedField.from)] : undefined;

  // Schema-driven: declared fields from actualRequest (sent) or intendedRequest/schemaFields (local_blocked).
  const schemaFieldsRaw =
    (isRecord(metadata.actualRequest) && Array.isArray(metadata.actualRequest.schemaFields) && metadata.actualRequest.schemaFields)
    || (isRecord(metadata.intendedRequest) && Array.isArray(metadata.intendedRequest.schemaFields) && metadata.intendedRequest.schemaFields)
    || (Array.isArray(metadata.schemaFields) && metadata.schemaFields)
    || undefined;
  // local_blocked intended body carries the node's declared Schema props (custom_parameters._canvas.schemaProperties):
  // a canvas value whose field (and aliases) the Schema lacks is 「该端点不支持 · 未发送」, never 拟发送.
  const intendedSchemaProps = intendedBody && isRecord(intendedBody.custom_parameters) && isRecord(intendedBody.custom_parameters._canvas)
    && Array.isArray(intendedBody.custom_parameters._canvas.schemaProperties) ? intendedBody.custom_parameters._canvas.schemaProperties : undefined;
  const schemaFields = schemaFieldsRaw ? schemaFieldsRaw.map(String) : undefined;
  // size row: aspect_ratio counts (fix5) so an unfilled ratio is 「未发送」, not 「该端点不支持」.
  // width/height keys: only discrete fields count — aspect_ratio-only Schema ⇒ user-set WxH is unsupported (task C).
  const sizeLacksAliases = (key: HistoryParameterKey): string[] =>
    key === 'size' ? [...FIELD_KEYS.size, 'width', 'height'] : FIELD_KEYS[key];
  const intendedLacks = (key: HistoryParameterKey) => !!intendedSchemaProps && !sizeLacksAliases(key).some((k) => intendedSchemaProps!.map(String).includes(k));
  const endpointLacks = (key: HistoryParameterKey) => !!schemaFields && !sizeLacksAliases(key).some((k) => schemaFields!.includes(k));
  // Same verdict for local-blocked and real outbound cards: Schema recorded → 该端点不支持 / 未发送; not recorded → say so, never guess.
  const schemaKnown = !!schemaFields || !!intendedSchemaProps;
  const absentSource = (key: HistoryParameterKey): HistoryParameterSource => endpointLacks(key) || intendedLacks(key) ? 'unsupported' : schemaKnown ? 'not-sent' : 'schema-unrecorded';
  // Schema-driven envelopes record each canvas value the Schema did not take as mapping {from, value, sent:false}.
  // Those board values are the 「这次没用上」 values when no requestedParameters were recorded (generic, by canvas name).
  const unsentMapping: AnyRecord = {};
  if (isRecord(metadata.actualRequest) && Array.isArray(metadata.actualRequest.mapping)) {
    for (const m of metadata.actualRequest.mapping) {
      if (!isRecord(m) || m.sent !== false || m.to != null || typeof m.from !== 'string') continue;
      const canvasKey = m.from === 'sampler_name' ? 'sampler' : m.from;
      if (!Object.prototype.hasOwnProperty.call(unsentMapping, canvasKey)) unsentMapping[canvasKey] = m.value;
    }
  }
  const result = {} as Record<HistoryParameterKey, ResolvedHistoryParameter>;
  (Object.keys(FIELD_KEYS) as HistoryParameterKey[]).forEach((key) => {
    const requestedValue = readKeys(requested, FIELD_KEYS[key]) ?? readKeys(unsentMapping, FIELD_KEYS[key]);
    const sentValue = key === 'size' ? normalizeSize(readKeys(sent, FIELD_KEYS[key])) : readKeys(sent, FIELD_KEYS[key]);
    const upstreamValue = key === 'size' ? normalizeSize(readKeys(upstream, FIELD_KEYS[key])) : readKeys(upstream, FIELD_KEYS[key]);

    if (blockedField && blockedKey === key && hasMeaningfulValue(blockedField.value)) {
      result[key] = {
        key, value: key === 'size' ? normalizeSize(blockedField.value) : blockedField.value, source: 'blocked',
        blocked: { minimum: blockedField.minimum, maximum: blockedField.maximum, enum: Array.isArray(blockedField.enum) ? blockedField.enum : undefined, reason: typeof blockedField.reason === 'string' ? blockedField.reason : undefined },
      };
      return;
    }
    const embeddedValue = embedded[key];
    const legacy = legacyValue(item, key);
    if (intendedRaw) {
      const v = key === 'size' ? normalizeSize(readKeys(intended, FIELD_KEYS[key])) : readKeys(intended, [...FIELD_KEYS[key], ...(key === 'sampler' ? ['sampler_name'] : [])]);
      result[key] = hasMeaningfulValue(v) && !intendedLacks(key)
        ? { key, value: v, source: 'intended' }
        : { key, value: undefined, source: absentSource(key) };
      return;
    }

    if (hasMeaningfulValue(upstreamValue)) {
      result[key] = { key, value: upstreamValue, source: 'upstream', requested: requestedValue, sent: sentValue, upstream: upstreamValue };
      return;
    }
    if (hasMeaningfulValue(embeddedValue)) {
      result[key] = { key, value: embeddedValue, source: 'image-metadata', requested: requestedValue, sent: sentValue, upstream: upstreamValue };
      return;
    }
    if (hasMeaningfulValue(sentValue)) {
      result[key] = { key, value: sentValue, source: 'sent', requested: requestedValue, sent: sentValue, upstream: upstreamValue };
      return;
    }
    if (hasSentEvidence) {
      result[key] = { key, value: undefined, source: absentSource(key), requested: requestedValue, sent: sentValue, upstream: upstreamValue };
      return;
    }
    if (hasMeaningfulValue(requestedValue)) {
      result[key] = { key, value: requestedValue, source: 'requested', requested: requestedValue };
      return;
    }
    if (hasMeaningfulValue(legacy)) {
      result[key] = { key, value: legacy, source: 'legacy' };
      return;
    }
    result[key] = { key, value: undefined, source: endpointLacks(key) ? 'unsupported' : hasAnyMetadata ? 'not-sent' : 'unknown' };
  });

  return result;
}

/** clean-1029: readable (no strike-through on the label) and explicit — the canvas value was NOT sent because the endpoint lacks the field. */
export const HISTORY_UNSUPPORTED_LABEL = '该端点不支持 · 未发送';
export const historyParameterSourceLabel = (source: HistoryParameterSource): string => {
  switch (source) {
    case 'upstream': return '上游实际';
    case 'image-metadata': return '图像元数据';
    case 'sent': return '实际发送';
    case 'requested': return '仅请求值';
    case 'legacy': return '旧记录';
    case 'not-sent': return '未发送';
    case 'schema-unrecorded': return '未发送（Schema 未记录）';
    case 'unsupported': return HISTORY_UNSUPPORTED_LABEL;
    case 'blocked': return '本地拦截';
    case 'intended': return '拟发送（未出站）';
    default: return '旧记录未保存';
  }
};

export function formatResolvedHistoryParameter(param: ResolvedHistoryParameter, suffix = ''): string {
  if (!hasMeaningfulValue(param.value)) return historyParameterSourceLabel(param.source);
  if (param.source === 'blocked') {
    const b = param.blocked || {};
    const why = typeof b.minimum === 'number' || typeof b.maximum === 'number'
      ? `超出 ${b.minimum ?? '-∞'}–${b.maximum ?? '∞'}`
      : Array.isArray(b.enum) ? `不在官方可选值 ${b.enum.join(' / ')} 内` : (b.reason || '不符合官方 Schema');
    return `${String(param.value)}${suffix}（${why}，未发送）`;
  }
  return `${String(param.value)}${suffix}`;
}

/** LoRAs actually sent (generic): history loras, else actualRequest (unwrap nested request/input) loras/styles/lora_list. */
export function sentHistoryLoras(item: GenerationHistoryItem): Array<{ name: string; strength: unknown }> {
  const fromItem = Array.isArray(item.loras) && item.loras.length
    ? item.loras.map((l) => ({ name: String(l.name ?? ''), strength: l.strength }))
    : [];
  // Prefer item.loras only when every entry has a name — OpenWorks save-result once dropped name via l.path||… overwrite.
  if (fromItem.length && fromItem.every((l) => l.name.trim())) return fromItem;
  const metadata = isRecord(item.requestMetadata) ? item.requestMetadata : {};
  const submission = last(Array.isArray(metadata.submissions) ? metadata.submissions : undefined);
  const raw = isRecord(metadata.actualRequest) ? metadata.actualRequest : isRecord(submission) ? submission
    : item.status === 'local_blocked' && isRecord(metadata.intendedRequest) ? metadata.intendedRequest : undefined;
  const params = unwrapGenerationParameters(raw);
  const fromParams = lorasFromSentParameters(params);
  if (fromParams.length) return fromParams;
  return fromItem.filter((l) => l.name.trim() || l.strength !== undefined);
}

/**
 * Generic LoRA reader for a sent body: the first field whose key names a LoRA (…lora…, styles) holding either
 * an array (strings / {path|name…, scale|strength…}) or an object map {name: strength} (e.g. OpenAI-compatible `loras`).
 */
export function lorasFromSentParameters(params: unknown): Array<{ name: string; strength: unknown }> {
  if (!isRecord(params)) return [];
  // A LoRA strength/weight/scale array is never the name list (trace-fix2 P2).
  // Strength array = LoRA-named key holding only numbers (e.g. loraStrengths); a name list such as lora_weights:['url'] is not one.
  const isStrengthArray = (k: string, v: unknown) => /lora/i.test(k) && /(strength|weight|scale)/i.test(k) && Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'number');
  const isStrengthKey = (k: string) => isStrengthArray(k, (params as AnyRecord)[k]);
  const entry = Object.entries(params).find(([k, v]) => (/lora/i.test(k) || k === 'styles') && !isStrengthKey(k) && v != null
    && (Array.isArray(v) ? v.length > 0 : isRecord(v) && Object.keys(v).length > 0));
  if (!entry) return [];
  const value = entry[1];
  if (isRecord(value)) return Object.entries(value).map(([name, strength]) => ({ name, strength }));
  // Names and strengths in two parallel arrays (e.g. loras + loraStrengths): same length, key names a LoRA strength.
  const parallel = Object.entries(params).find(([k, v]) => k !== entry[0] && isStrengthArray(k, v) && (v as unknown[]).length === (value as unknown[]).length)?.[1] as unknown[] | undefined;
  return (value as unknown[]).map((l: any, i: number) => typeof l === 'string'
    ? { name: l, strength: parallel ? parallel[i] : undefined }
    : { name: String(l?.path ?? l?.name ?? l?.model_name ?? l?.model ?? l?.id ?? ''), strength: l?.scale ?? l?.strength ?? l?.weight })
    .filter((l) => l.name);
}

/**
 * The recorded outbound generation request, verbatim, for any card status: the route's own actualRequest when present,
 * else the last recorded outbound submission as {endpoint, parameters} (what went upstream). Undefined when the
 * generation POST never left. Never synthesized from canvas values.
 */
export function historyActualRequest(item: GenerationHistoryItem): Record<string, unknown> | undefined {
  if (generationPostNotSent(item)) return undefined;
  const metadata = isRecord(item.requestMetadata) ? item.requestMetadata : {};
  if (isRecord(metadata.actualRequest)) return metadata.actualRequest;
  const submission = last(Array.isArray(metadata.submissions) ? metadata.submissions : undefined);
  if (isRecord(submission) && submission.parameters !== undefined) return { endpoint: submission.endpoint, parameters: submission.parameters };
  return undefined;
}

/** Upstream exchanges of a history entry (submit + poll …), verbatim from requestMetadata.executionTrace; Schema GETs are not exchanges of the generation. */
export type UpstreamExchangeRow = { method: string; endpoint: string; status: unknown; statusText?: string; requestBody?: unknown; responseBody: unknown; startedAt?: string };
export function historyUpstreamExchanges(item: GenerationHistoryItem): UpstreamExchangeRow[] {
  const metadata = isRecord(item.requestMetadata) ? item.requestMetadata : {};
  const traces = Array.isArray(metadata.executionTrace) ? metadata.executionTrace : [];
  return traces.filter((t: unknown) => isRecord(t) && typeof t.endpoint === 'string' && typeof t.method === 'string' && !t.stage)
    .map((t: any) => ({ method: String(t.method), endpoint: String(t.endpoint), status: t.status, statusText: typeof t.statusText === 'string' ? t.statusText : undefined, requestBody: t.requestBody, responseBody: t.responseBody, startedAt: typeof t.startedAt === 'string' ? t.startedAt : undefined }));
}

/** True when the shown model equals the `model` field of the sent body (generic; drives the 实际发送 chip). */
export function historyModelSent(item: GenerationHistoryItem): boolean {
  const actual = historyActualRequest(item);
  if (!actual) return false;
  const params = unwrapGenerationParameters(actual);
  const shown = item.actualModel || item.model;
  return isRecord(params) && typeof params.model === 'string' && !!shown && params.model === shown;
}

/**
 * Upstream's own message text, verbatim, from a JSON error body: first string under message / error / detail / msg
 * (searched generically through nested objects). Non-JSON bodies return the trimmed body itself. Never rewritten.
 */
export function upstreamErrorMessage(body: unknown): string | undefined {
  if (typeof body !== 'string' || !body.trim()) return undefined;
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return body.trim(); }
  const KEYS = ['message', 'error', 'detail', 'msg', 'errors', 'error_message', 'description'];
  const walk = (v: unknown, depth: number): string | undefined => {
    if (depth > 5 || v == null) return undefined;
    if (typeof v === 'string') return v.trim() || undefined;
    if (Array.isArray(v)) { for (const x of v) { const h = walk(x, depth + 1); if (h) return h; } return undefined; }
    if (isRecord(v)) { for (const k of KEYS) if (k in v) { const h = walk(v[k], depth + 1); if (h) return h; } }
    return undefined;
  };
  return isRecord(parsed) || Array.isArray(parsed) ? walk(parsed, 0) : undefined;
}

/** Size line for history cards: width×height when both resolved, else the Schema size field (image_size / size), else the source label. */
/** clean-1149 #3: canvas value (if any) separate from the source chip — never put the chip label into text (avoids duplicate + struck label). */
export function formatHistorySize(resolved: Record<HistoryParameterKey, ResolvedHistoryParameter>): { text: string; source: HistoryParameterSource; canvasValue?: string } {
  const { width, height, size } = resolved;
  const src = (hasMeaningfulValue(width.value) || hasMeaningfulValue(height.value)) ? width.source : (size.source === 'unknown' ? width.source : size.source);
  if (hasMeaningfulValue(width.value) && hasMeaningfulValue(height.value)) {
    return { text: `${width.value}×${height.value}`, canvasValue: `${width.value}×${height.value}`, source: width.source };
  }
  if (hasMeaningfulValue(size.value)) {
    const t = formatResolvedHistoryParameter(size);
    return { text: t, canvasValue: String(size.value), source: size.source };
  }
  // No canvas value: text empty — UI shows only the source chip once.
  return { text: '', source: src };
}

/** History counts "图片" only for entries that really produced output media (failed / local_blocked / empty url never count). */
export function hasOutputMedia(item: GenerationHistoryItem): boolean {
  if (item.status === 'failed' || item.status === 'local_blocked') return false;
  return typeof item.url === 'string' && item.url.trim() !== '';
}

/** Upstream task id recorded at submit (actualRequest.upstreamTaskId, else the submit response taskId). Never guessed. */
export function historyUpstreamTaskId(item: GenerationHistoryItem): string | undefined {
  const meta: any = (item as any)?.requestMetadata || {};
  const id = meta?.actualRequest?.upstreamTaskId ?? meta?.submit?.taskId;
  return id !== undefined && id !== null && String(id).trim() !== '' ? String(id) : undefined;
}

/** Canvas source of each sent top-level field, from actualRequest.mapping (generic). */
const CANVAS_FIELD_ORIGIN: Record<string, string> = {
  denoise: 'KSampler 去噪强度', steps: 'KSampler 步数', cfg: 'KSampler CFG', seed: 'KSampler 种子',
  sampler_name: 'KSampler 采样器', scheduler: 'KSampler 调度器', width: '画布宽度', height: '画布高度',
  negative_prompt: '负向提示词', image_url: '参考图', loras: 'LoRA 节点',
};
export function historyFieldOrigins(item: GenerationHistoryItem): Array<{ field: string; origin: string }> {
  const meta: any = (item as any).requestMetadata || {};
  const mapping = Array.isArray(meta.actualRequest?.mapping) ? meta.actualRequest.mapping : [];
  return mapping.filter((m: any) => m && m.to && m.sent !== false && CANVAS_FIELD_ORIGIN[m.from])
    .map((m: any) => ({ field: String(m.to).split(' ')[0], origin: CANVAS_FIELD_ORIGIN[m.from] }));
}


const COVERED_SENT_KEYS = new Set<string>([
  ...Object.values(FIELD_KEYS).flat(),
  'prompt', 'model', 'model_name', 'negative_prompt', 'negativePrompt', 'loras', 'styles', 'lora_list', 'loraStrengths',
]);
/**
 * Every OTHER top-level parameter that was actually sent (from actualRequest, never a fixed list) — e.g. aspect_ratio,
 * resolution, strength, output_format, image — so a success card lists everything that went upstream.
 */
export function otherSentParameters(item: GenerationHistoryItem): Array<{ key: string; value: string }> {
  const metadata = isRecord(item.requestMetadata) ? item.requestMetadata : {};
  const submission = last(Array.isArray(metadata.submissions) ? metadata.submissions : undefined);
  const raw = isRecord(metadata.actualRequest) ? metadata.actualRequest : isRecord(submission) ? submission : undefined;
  if (!raw) return [];
  const sent = unwrapGenerationParameters(raw);
  if (!isRecord(sent)) return [];
  return Object.entries(sent)
    .filter(([k, v]) => !COVERED_SENT_KEYS.has(k) && v !== undefined && v !== null && v !== '')
    .map(([key, v]) => ({ key, value: typeof v === 'object' ? JSON.stringify(v) : String(v) }));
}

/**
 * LoRAs that were on the canvas for a run whose generation request never left (local block or failed prefetch GET).
 * Same rule for every not-sent card: requestMetadata.requestedLoras (name + strength), else a legacy intendedRequest.loras.
 */
export function requestedNotSentLoras(item: GenerationHistoryItem): Array<{ name: string; strength: unknown }> {
  if (item.status !== 'local_blocked' && item.status !== 'failed') return [];
  const metadata: AnyRecord = isRecord(item.requestMetadata) ? item.requestMetadata : {};
  if (item.status === 'failed' && metadata.postSent !== false) return [];
  const list = Array.isArray(metadata.requestedLoras) ? metadata.requestedLoras
    : isRecord(metadata.intendedRequest) && Array.isArray(metadata.intendedRequest.loras) && !isRecord(metadata.intendedRequest.parameters) ? metadata.intendedRequest.loras : [];
  return list.map((l: any) => typeof l === 'string' ? { name: l, strength: undefined } : { name: String(l?.name ?? l?.path ?? ''), strength: l?.strength ?? l?.scale ?? l?.modelStrength })
    .filter((l: { name: string }) => l.name);
}

/**
 * fix3 C: One Schema-based status per not-sent LoRA.
 * Prefer mapped proposed/intended parameters (and schemaProperties on _canvas) over JSON.stringify substring matching.
 */
export function notSentLoraLabel(item: GenerationHistoryItem, name: string): string {
  const metadata: AnyRecord = isRecord(item.requestMetadata) ? item.requestMetadata : {};
  const intended = isRecord(metadata.intendedRequest) ? metadata.intendedRequest : undefined;
  const needle = String(name || '').trim();
  const params = intended && isRecord(intended.parameters) ? intended.parameters
    : intended && !isRecord(intended.parameters) && isRecord(intended) ? intended : undefined;
  if (item.status === 'local_blocked' && params && needle) {
    const hit = loraNameInMappedParams(params, needle);
    if (hit) return '拟发送（未出站）';
  }
  // schemaProperties from Checkpoint custom_parameters._canvas (when card carries them via intended/custom)
  const canvasProps = schemaPropertiesOf(item);
  const fields = (Array.isArray(metadata.schemaFields) && metadata.schemaFields)
    || (intended && Array.isArray(intended.schemaFields) && intended.schemaFields)
    || canvasProps
    || undefined;
  if (!fields) return '未发送（Schema 未记录）';
  return fields.some((f: unknown) => /lora/i.test(String(f))) ? '未发送' : HISTORY_UNSUPPORTED_LABEL;
}

function schemaPropertiesOf(item: GenerationHistoryItem): string[] | undefined {
  const metadata: AnyRecord = isRecord(item.requestMetadata) ? item.requestMetadata : {};
  const intended = isRecord(metadata.intendedRequest) ? metadata.intendedRequest : undefined;
  const custom = intended && isRecord((intended as any).custom_parameters) ? (intended as any).custom_parameters
    : isRecord((item as any).custom_parameters) ? (item as any).custom_parameters : undefined;
  const canvas = custom && isRecord(custom._canvas) ? custom._canvas : undefined;
  return canvas && Array.isArray(canvas.schemaProperties) ? canvas.schemaProperties.map(String) : undefined;
}

/** True when a LoRA name/path appears in Schema-mapped parameters (loras/styles/lora_list/…), without JSON.stringify substring matching. */
export function loraNameInMappedParams(params: AnyRecord, name: string): boolean {
  const needle = name.trim();
  if (!needle) return false;
  const lists = [params.loras, params.styles, params.lora_list, params.image_loras, params.model_id];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (typeof entry === 'string' && (entry === needle || entry.includes(needle) || needle.includes(entry))) return true;
      if (isRecord(entry)) {
        const id = String(entry.path ?? entry.url ?? entry.model ?? entry.model_name ?? entry.id ?? entry.name ?? '');
        if (id && (id === needle || id.includes(needle) || needle.includes(id))) return true;
      }
    }
  }
  if (typeof params.lora_url === 'string' && (params.lora_url === needle || params.lora_url.includes(needle))) return true;
  // Generic: any top-level string/array field whose key mentions lora (e.g. Replicate lora_weights)
  for (const [k, v] of Object.entries(params)) {
    if (!/lora/i.test(k)) continue;
    if (typeof v === 'string' && (v === needle || v.includes(needle) || needle.includes(v))) return true;
    if (Array.isArray(v) && v.some((x) => typeof x === 'string' && (x === needle || x.includes(needle)))) return true;
  }
  // Nested input envelopes (Replicate { input: { lora_weights } })
  if (isRecord(params.input) && loraNameInMappedParams(params.input, needle)) return true;
  return false;
}

/** Walk a dotted path like data.input on an object; return undefined if any segment missing. */
export function valueAtPath(root: unknown, path: string): unknown {
  if (!path || root == null) return undefined;
  let cur: any = root;
  for (const key of path.split('.')) {
    if (!isRecord(cur) || !(key in cur)) return undefined;
    cur = cur[key];
  }
  return cur;
}

/**
 * fix3 F: contrast upstream echo input (path from provider config) with the actual sent parameters.
 * Values come only from the echo — never from local Schema defaults.
 */
export function upstreamEchoContrast(
  sentParams: AnyRecord | null | undefined,
  echo: AnyRecord | null | undefined,
  schemaProps?: AnyRecord | null,
): Array<{ key: string; kind: 'upstream-default' | 'sent-missing-in-echo'; value: unknown; description?: string }> {
  if (!isRecord(sentParams) || !isRecord(echo)) return [];
  const out: Array<{ key: string; kind: 'upstream-default' | 'sent-missing-in-echo'; value: unknown; description?: string }> = [];
  for (const [k, v] of Object.entries(echo)) {
    if (!(k in sentParams)) {
      const desc = schemaProps && isRecord(schemaProps[k]) && typeof (schemaProps[k] as any).description === 'string'
        ? String((schemaProps[k] as any).description) : undefined;
      out.push({ key: k, kind: 'upstream-default', value: v, description: desc });
    }
  }
  for (const [k, v] of Object.entries(sentParams)) {
    if (v === undefined || v === null || v === '') continue;
    if (!(k in echo)) out.push({ key: k, kind: 'sent-missing-in-echo', value: v });
  }
  return out;
}

/** Find the first upstream echo object from executionTrace bodies (string or already-parsed), using a configured dotted path. */
export function extractUpstreamEcho(item: GenerationHistoryItem, echoPath: string): AnyRecord | null {
  if (!echoPath) return null;
  const rows = historyUpstreamExchanges(item);
  for (const r of rows) {
    let parsed: unknown = r.responseBody;
    if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch { continue; } }
    if (isRecord(parsed) && (parsed as any).kind === 'raw-response') continue; // need preloaded text; caller may pass via poll/submit
    const v = valueAtPath(parsed, echoPath);
    if (isRecord(v)) return v;
  }
  // Fall back to requestMetadata.submit / poll / rawResponse when traces are externalized
  const md: AnyRecord = isRecord(item.requestMetadata) ? item.requestMetadata : {};
  for (const key of ['submit', 'poll', 'rawResponse']) {
    const v = valueAtPath(md[key], echoPath);
    if (isRecord(v)) return v;
    // submit may be the full {code,data:{input}} envelope
    if (isRecord(md[key])) {
      const inner = valueAtPath(md[key], echoPath);
      if (isRecord(inner)) return inner;
    }
  }
  return null;
}

/**
 * hist-count-2026-10-17: a history record written for a failed model parameter-table / catalog GET
 * (/api/history/prefetch-failure → errorSource 'prefetch' + requestMetadata.prefetch). It is NOT a generation request:
 * history keeps the card visible, but never counts it as 出图失败 / 未出图. Structural fields only, no URL matching.
 */
export function isSchemaFetchFailure(item: GenerationHistoryItem): boolean {
  if (item.status !== 'failed') return false;
  const md = item.requestMetadata;
  return item.errorSource === 'prefetch' || (isRecord(md) && isRecord((md as any).prefetch));
}

/** True when the generation POST never left (local block, or a Schema/catalog GET failed first). */
export function generationPostNotSent(item: GenerationHistoryItem): boolean {
  if (item.status === 'local_blocked') return true;
  return item.status === 'failed' && isRecord(item.requestMetadata) && item.requestMetadata.postSent === false;
}

/**
 * One seed sentence for every surface (success toast and history card): the value the canvas SENT and whether the
 * upstream RETURNED one. Never presents a sent value as returned, or vice versa.
 */
export function seedStatement(sent: unknown, returned: unknown): string {
  const has = (v: unknown) => v !== undefined && v !== null && v !== '';
  if (has(returned) && has(sent) && String(returned) !== String(sent)) return `种子 ${String(returned)}（上游返回；实际发送 ${String(sent)}）`;
  if (has(returned)) return `种子 ${String(returned)}（上游返回${has(sent) ? '，与实际发送一致' : ''}）`;
  // fix16: say 「实际发送」 and 「上游未返回种子」 in two sentences — never one vague paren.
  if (has(sent)) return `种子 ${String(sent)}（实际发送）。上游未返回种子`;
  return '种子：未发送，上游也未返回';
}

/**
 * Seed text for the history parameter row, which renders its own source chip (实际发送 / 上游实际 …):
 * the parenthesis carries only what the chip does not say, so 「实际发送」 is never written twice.
 */
export function historySeedRowText(item: GenerationHistoryItem): string {
  const r = resolveHistoryParameters(item).seed;
  // fix16: value only; chip carries 「实际发送」, separate note carries 「上游未返回种子」.
  if (r.source === 'sent') return `种子 ${String(r.sent)}`;
  if (r.source === 'intended') return `种子 ${String(r.value)}`;
  return historySeedStatement(item);
}

/** True when the seed row should show a separate 「上游未返回种子」 note (chip already says 实际发送). */
export function historySeedUpstreamMissingNote(item: GenerationHistoryItem): boolean {
  return resolveHistoryParameters(item).seed.source === 'sent';
}

/** Seed sentence for a history card, from the same resolver the card's parameter rows use. */
export function historySeedStatement(item: GenerationHistoryItem): string {
  const r = resolveHistoryParameters(item).seed;
  if (r.source === 'upstream') return seedStatement(r.sent, r.upstream);
  if (r.source === 'sent') return seedStatement(r.sent, undefined);
  if (r.source === 'intended') return `种子 ${String(r.value)}（拟发送，未出站）`;
  // Schema-driven providers record per-field mapping; a seed the Schema did not declare is 「未发送」 with that reason (not a vague fallback).
  const mapping = (item as any)?.requestMetadata?.actualRequest?.mapping;
  const m = Array.isArray(mapping) ? mapping.find((x: any) => x?.from === 'seed' && x?.sent === false) : undefined;
  if (m) return `种子：未发送（${/Schema 未声明/.test(String(m.reason || '')) ? 'Schema 未声明' : String(m.reason || '未记录原因')}）`;
  return seedStatement(undefined, undefined);
}

/** Seed sent in an actualRequest envelope ({parameters:{seed}} or nested request/input arguments), read generically. */
export function sentSeedFromActualRequest(actual: unknown): unknown {
  if (!isRecord(actual)) return undefined;
  const params = unwrapGenerationParameters(actual);
  return isRecord(params) ? params.seed : undefined;
}

/** Key rotation visibility: 「Key #0（共 2 个）」 per distinct key used (index + count only; never key text). */
export function historyKeyUsageLabels(item: GenerationHistoryItem): string[] {
  const md: any = (item as any)?.requestMetadata;
  const recorded = md && Array.isArray(md.keyUsages) ? md.keyUsages : keyUsagesFromTrace(md?.executionTrace);
  return recorded.map((u: any) => formatKeyUsage(u)).filter((s: string | null): s is string => !!s);
}

/** Call time of a trace row in Asia/Shanghai, from the trace's own startedAt; never guessed. */
export function upstreamCallTime(startedAt: unknown): string {
  if (typeof startedAt !== 'string') return '未记录时间';
  const d = new Date(startedAt);
  if (Number.isNaN(d.getTime())) return '未记录时间';
  const f = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d);
  return `${f}.${String(d.getMilliseconds()).padStart(3, '0')}（北京时间）`;
}

/** Identity of a response body: sha256 of an externalized raw response, else the verbatim inline text. */
export function upstreamBodyKey(body: unknown): string {
  if (isRecord(body) && body.kind === 'raw-response') return `sha256:${String(body.sha256 ?? body.url ?? '')}`;
  return typeof body === 'string' ? `text:${body}` : `json:${JSON.stringify(body ?? null)}`;
}

/**
 * Status read generically from a verbatim response text: first top-level string field whose name is `status`/`state`
 * or ends with `_status`/`_state` (e.g. status, state, task_status). No provider string is matched. Undefined if none / not JSON.
 */
export function upstreamBodyStatus(text: unknown): string | undefined {
  if (typeof text !== 'string') return undefined;
  let v: unknown; try { v = JSON.parse(text); } catch { return undefined; }
  if (!isRecord(v)) return undefined;
  for (const [k, x] of Object.entries(v)) if (/^(.*_)?(status|state)$/i.test(k) && typeof x === 'string' && x.trim()) return x;
  return undefined;
}

const ENVELOPE_OK = /^(success|ok|completed|succeeded|created)$/i;
const BIZ_FAIL = /waiting_for_user|insufficient_credit|failed|error|cancelled|canceled|rejected|debit/i;

/** Walk nested JSON for business status / waitingReason (generic keys only). Prefers non-envelope statuses. */
export function extractBusinessOutcome(value: unknown, depth = 0): { status?: string; waitingReason?: string } {
  if (!value || typeof value !== 'object' || depth > 5) return {};
  let status: string | undefined;
  let waitingReason: string | undefined;
  const visit = (o: any, d: number) => {
    if (!o || typeof o !== 'object' || d > 5) return;
    if (typeof o.waitingReason === 'string' && o.waitingReason.trim()) waitingReason = waitingReason || o.waitingReason.trim();
    if (typeof o.pauseReason === 'string' && o.pauseReason.trim() && !waitingReason) waitingReason = o.pauseReason.trim();
    for (const [k, x] of Object.entries(o)) {
      if (/^(.*_)?(status|state)$/i.test(k) && typeof x === 'string' && x.trim()) {
        const s = x.trim();
        // Prefer non-envelope business statuses; envelope success/ok is only a fallback.
        if (!ENVELOPE_OK.test(s)) {
          if (!status || ENVELOPE_OK.test(status)) status = s;
        } else if (!status) {
          status = s;
        }
      }
    }
    for (const x of Object.values(o)) if (x && typeof x === 'object') visit(x, d + 1);
  };
  visit(value, 0);
  return { status, waitingReason };
}

/**
 * fix4: segment-head label that separates HTTP 2xx from business failure.
 * When top-level status is envelope "success" but nested waiting_for_user / insufficient_credit exists,
 * return a scannable 「HTTP 成功 · 业务 …」 label instead of bare "success".
 */
export function upstreamSegmentStatusLabel(bodyText: unknown, httpStatus: number | null | undefined): string | undefined {
  const top = typeof bodyText === 'string' ? upstreamBodyStatus(bodyText) : undefined;
  let parsed: unknown;
  if (typeof bodyText === 'string') { try { parsed = JSON.parse(bodyText); } catch { parsed = undefined; } }
  const biz = extractBusinessOutcome(parsed);
  const bizParts = [biz.status, biz.waitingReason].filter(Boolean) as string[];
  const bizFail = bizParts.some((p) => BIZ_FAIL.test(p));
  const httpOk = typeof httpStatus === 'number' && httpStatus >= 200 && httpStatus < 300;
  if (httpOk && bizFail) {
    return `HTTP 成功 · 业务 ${bizParts.join(' · ')}`;
  }
  if (top && ENVELOPE_OK.test(top) && bizFail) {
    return `HTTP 成功 · 业务 ${bizParts.join(' · ')}`;
  }
  if (bizFail && bizParts.length) return bizParts.join(' · ');
  return top;
}

export type UpstreamExchangeGroup = { start: number; end: number; rows: UpstreamExchangeRow[] };
/** Consecutive calls with identical method + endpoint + HTTP status + response body identity collapse into one group (indices 0-based). */
export function groupUpstreamExchanges(rows: UpstreamExchangeRow[]): UpstreamExchangeGroup[] {
  const key = (r: UpstreamExchangeRow) => JSON.stringify([r.method, r.endpoint, r.status ?? null, upstreamBodyKey(r.responseBody)]);
  const out: UpstreamExchangeGroup[] = [];
  rows.forEach((r, i) => {
    const g = out[out.length - 1];
    if (g && key(g.rows[0]) === key(r)) { g.rows.push(r); g.end = i; } else out.push({ start: i, end: i, rows: [r] });
  });
  return out;
}

/**
 * Index of the exchange to highlight as terminal success: the LAST recorded exchange, only when the card has output media
 * and that exchange is HTTP 2xx. Generic (no provider status strings). -1 otherwise.
 */
export function terminalSuccessIndex(item: GenerationHistoryItem, rows: UpstreamExchangeRow[]): number {
  if (!rows.length || !hasOutputMedia(item)) return -1;
  const s = Number(rows[rows.length - 1].status);
  return s >= 200 && s < 300 ? rows.length - 1 : -1;
}

/** Segment label 「第 n / N 段」 or 「第 a–b 段」 (1-based). */
export const upstreamSegmentLabel = (start: number, end: number, total: number) => start === end ? `第 ${start + 1} / ${total} 段` : `第 ${start + 1}–${end + 1} / ${total} 段`;
