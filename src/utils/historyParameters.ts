import type { GenerationHistoryItem } from '../types/providers';

export type HistoryParameterSource =
  | 'upstream'
  | 'sent'
  | 'requested-not-sent'
  | 'legacy'
  | 'missing';

export interface ResolvedHistoryParameter<T = unknown> {
  value: T | null | undefined;
  source: HistoryParameterSource;
  emptyLabel: '未发送' | '上游未返回' | '旧记录未保存';
}

export interface ResolvedHistoryParameters {
  seed: ResolvedHistoryParameter<number>;
  steps: ResolvedHistoryParameter<number>;
  cfg: ResolvedHistoryParameter<number>;
  sampler: ResolvedHistoryParameter<string>;
  scheduler: ResolvedHistoryParameter<string>;
  width: ResolvedHistoryParameter<number>;
  height: ResolvedHistoryParameter<number>;
  negativePrompt: ResolvedHistoryParameter<string>;
}

const isPresent = (value: unknown) =>
  value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === '');

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function unwrapProviderParameters(value: unknown): Record<string, any> {
  const record = asRecord(value);
  const civitai = asRecord(record.steps?.[0]?.input);
  if (Object.keys(civitai).length) return civitai;
  const sogni = asRecord(record.input?.steps?.[0]?.arguments);
  if (Object.keys(sogni).length) return sogni;
  return record;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return undefined; }
}

function effectiveFromTrace(metadata: Record<string, any>): Record<string, any> {
  const traces = Array.isArray(metadata.executionTrace) ? metadata.executionTrace : [];
  for (let i = traces.length - 1; i >= 0; i--) {
    const parsed = parseJson(traces[i]?.responseBody);
    const direct = unwrapProviderParameters(parsed);
    if (Object.keys(direct).length && ('steps' in direct || 'cfgScale' in direct || 'sampleMethod' in direct || 'width' in direct || 'seed' in direct)) return direct;
    const raw = unwrapProviderParameters(asRecord(parsed).raw);
    if (Object.keys(raw).length) return raw;
  }
  return {};
}

function first(record: Record<string, any>, keys: string[]) {
  for (const key of keys) if (isPresent(record[key])) return record[key];
  return undefined;
}

function resolveOne<T>(
  metadataExists: boolean,
  effective: Record<string, any>,
  actual: Record<string, any>,
  requested: Record<string, any>,
  keys: string[],
  legacy: T | null | undefined,
): ResolvedHistoryParameter<T> {
  const upstream = first(effective, keys);
  if (isPresent(upstream)) return { value: upstream as T, source: 'upstream', emptyLabel: '上游未返回' };

  const sent = first(actual, keys);
  if (isPresent(sent)) return { value: sent as T, source: 'sent', emptyLabel: '上游未返回' };

  const requestedValue = first(requested, keys);
  if (isPresent(requestedValue)) return { value: requestedValue as T, source: 'requested-not-sent', emptyLabel: '未发送' };

  if (isPresent(legacy)) return { value: legacy as T, source: 'legacy', emptyLabel: metadataExists ? '上游未返回' : '旧记录未保存' };

  return { value: undefined, source: 'missing', emptyLabel: metadataExists ? '未发送' : '旧记录未保存' };
}

export function resolveHistoryParameters(item: GenerationHistoryItem): ResolvedHistoryParameters {
  const metadata = asRecord(item.requestMetadata);
  const metadataExists = Object.keys(metadata).length > 0;

  const submissions = Array.isArray(metadata.submissions) ? metadata.submissions : [];
  const lastSubmission = submissions.length ? asRecord(submissions[submissions.length - 1]) : {};
  const requested = unwrapProviderParameters(metadata.requestedParameters);
  const actual = unwrapProviderParameters(metadata.actualParameters ?? lastSubmission.parameters);
  const effective = unwrapProviderParameters(metadata.effectiveParameters);
  const tracedEffective = Object.keys(effective).length ? effective : effectiveFromTrace(metadata);

  return {
    seed: resolveOne(metadataExists, tracedEffective, actual, requested, ['seed', 'random_seed'], item.seed),
    steps: resolveOne(metadataExists, tracedEffective, actual, requested, ['steps', 'num_inference_steps'], item.steps),
    cfg: resolveOne(metadataExists, tracedEffective, actual, requested, ['cfgScale', 'cfg', 'guidance_scale', 'guidance'], item.cfg),
    sampler: resolveOne(metadataExists, tracedEffective, actual, requested, ['sampleMethod', 'sampler', 'sampler_name'], item.sampler),
    scheduler: resolveOne(metadataExists, tracedEffective, actual, requested, ['schedule', 'scheduler'], item.scheduler),
    width: resolveOne(metadataExists, tracedEffective, actual, requested, ['width'], item.width),
    height: resolveOne(metadataExists, tracedEffective, actual, requested, ['height'], item.height),
    negativePrompt: resolveOne(metadataExists, tracedEffective, actual, requested, ['negativePrompt', 'negative_prompt'], item.negativePrompt),
  };
}

export function historySourceLabel(source: HistoryParameterSource): string {
  if (source === 'upstream') return '上游实际';
  if (source === 'sent') return '实际发送';
  if (source === 'requested-not-sent') return '请求值 · 未发送';
  if (source === 'legacy') return '旧记录';
  return '';
}

export function displayResolvedParameter(param: ResolvedHistoryParameter, suffix = ''): string {
  if (!isPresent(param.value)) return param.emptyLabel;
  return `${String(param.value)}${suffix}`;
}
