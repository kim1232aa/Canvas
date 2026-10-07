import type { GenerationHistoryItem } from '../types/providers';

export type HistoryParameterKey =
  | 'negativePrompt'
  | 'seed'
  | 'steps'
  | 'cfg'
  | 'sampler'
  | 'scheduler'
  | 'width'
  | 'height';

export type HistoryParameterSource =
  | 'upstream'
  | 'image-metadata'
  | 'sent'
  | 'requested'
  | 'legacy'
  | 'not-sent'
  | 'unknown';

export interface ResolvedHistoryParameter {
  key: HistoryParameterKey;
  value: unknown;
  source: HistoryParameterSource;
  requested?: unknown;
  sent?: unknown;
  upstream?: unknown;
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

const unwrapGenerationParameters = (value: unknown): AnyRecord => {
  const body = parseJson(value);
  if (!isRecord(body)) return {};

  const directStep = Array.isArray(body.steps) ? body.steps[0] : undefined;
  if (isRecord(directStep?.input)) return directStep.input;
  if (isRecord(directStep?.arguments)) return directStep.arguments;

  const workflow = isRecord(body.data) && isRecord(body.data.workflow) ? body.data.workflow : undefined;
  const workflowStep = Array.isArray(workflow?.steps) ? workflow.steps[0] : undefined;
  if (isRecord(workflowStep?.input)) return workflowStep.input;
  if (isRecord(workflowStep?.arguments)) return workflowStep.arguments;

  const inputStep = isRecord(body.input) && Array.isArray(body.input.steps) ? body.input.steps[0] : undefined;
  if (isRecord(inputStep?.arguments)) return inputStep.arguments;
  if (isRecord(inputStep?.input)) return inputStep.input;

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
  cfg: ['cfgScale', 'guidance_scale', 'guidance', 'cfg'],
  sampler: ['sampleMethod', 'sampler', 'sampler_name'],
  scheduler: ['schedule', 'scheduler'],
  width: ['width'],
  height: ['height'],
};

const legacyValue = (item: GenerationHistoryItem, key: HistoryParameterKey): unknown => {
  if (key === 'negativePrompt') return item.negativePrompt;
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
  const sent = isRecord(metadata.actualParameters)
    ? unwrapGenerationParameters(metadata.actualParameters)
    : unwrapGenerationParameters(isRecord(submission) ? submission.parameters : undefined);

  const trace = last(Array.isArray(metadata.executionTrace) ? metadata.executionTrace : undefined);
  const upstream = isRecord(metadata.effectiveParameters)
    ? unwrapGenerationParameters(metadata.effectiveParameters)
    : unwrapGenerationParameters(isRecord(trace) ? trace.responseBody : undefined);

  const embedded = extractEmbeddedGenerationParameters(item.url || '');
  const hasSentEvidence = Object.keys(sent).length > 0 || !!submission;
  const hasAnyMetadata = Object.keys(metadata).length > 0;

  const result = {} as Record<HistoryParameterKey, ResolvedHistoryParameter>;
  (Object.keys(FIELD_KEYS) as HistoryParameterKey[]).forEach((key) => {
    const requestedValue = readKeys(requested, FIELD_KEYS[key]);
    const sentValue = readKeys(sent, FIELD_KEYS[key]);
    const upstreamValue = readKeys(upstream, FIELD_KEYS[key]);
    const embeddedValue = embedded[key];
    const legacy = legacyValue(item, key);

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
      result[key] = { key, value: undefined, source: 'not-sent', requested: requestedValue, sent: sentValue, upstream: upstreamValue };
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
    result[key] = { key, value: undefined, source: hasAnyMetadata ? 'not-sent' : 'unknown' };
  });

  return result;
}

export const historyParameterSourceLabel = (source: HistoryParameterSource): string => {
  switch (source) {
    case 'upstream': return '上游实际';
    case 'image-metadata': return '图像元数据';
    case 'sent': return '实际发送';
    case 'requested': return '仅请求值';
    case 'legacy': return '旧记录';
    case 'not-sent': return '未发送';
    default: return '旧记录未保存';
  }
};

export function formatResolvedHistoryParameter(param: ResolvedHistoryParameter, suffix = ''): string {
  if (!hasMeaningfulValue(param.value)) return historyParameterSourceLabel(param.source);
  return `${String(param.value)}${suffix}`;
}