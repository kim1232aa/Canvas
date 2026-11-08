import { getFieldSpec, resolveSchemaModelId, type Provider } from '../schemas/providerSchema';
import { getModelSchemaEntry } from '../services/modelSchemaCache';

export type SeedRange = { min: number; max: number; source: string };
/** Legacy generator range used when the model Schema declares no seed bounds (unchanged behaviour). */
export const LEGACY_SEED_MAX = 1000000000;

/** Seed bounds from the model Schema: live /api/model-schema cache (minimum/maximum) first, then the static providerSchema. No guessing. */
export function seedRangeFor(provider?: string | null, model?: string | null): SeedRange | undefined {
  const p = String(provider || '').trim(); const m = String(model || '').trim();
  if (!p || !m) return undefined;
  const live = getModelSchemaEntry(p, m) as any;
  const prop = live?.status === 'ready' ? live?.propertiesObj?.seed : undefined;
  if (prop && Number.isFinite(prop.minimum) && Number.isFinite(prop.maximum)) return { min: prop.minimum, max: prop.maximum, source: 'model-schema' };
  const id = resolveSchemaModelId(p as Provider, m);
  const spec = id ? getFieldSpec(p as Provider, id, 'seed') : undefined;
  if (spec && spec.type === 'integer' && Number.isFinite(spec.min) && Number.isFinite(spec.max)) return { min: spec.min!, max: spec.max!, source: spec.source };
  return undefined;
}

/** Random seed generated INSIDE the Schema range (generation, not rewriting a stored value). */
export function randomSeedFor(provider?: string | null, model?: string | null, rand: () => number = Math.random): number {
  const r = seedRangeFor(provider, model);
  if (!r) return Math.floor(rand() * LEGACY_SEED_MAX);
  const lo = Math.max(r.min, 0); const hi = Math.min(r.max, LEGACY_SEED_MAX * 2);
  return lo + Math.floor(rand() * (hi - lo + 1));
}

/**
 * Non-blocking UI advisory hint when a seed is outside the declared Schema range.
 * Sentinel -1 (upstream random seed) is always accepted without warning.
 * Never blocks execution or rewrites the user's seed.
 */
export function seedRangeAdvisory(provider: string | undefined | null, model: string | undefined | null, seed: unknown, label?: string): string | null {
  if (seed === undefined || seed === null || seed === '') return null;
  const n = Number(seed);
  if (n === -1) return null;
  const r = seedRangeFor(provider, model);
  if (!r) return null;
  if (!Number.isInteger(n) || n < r.min || n > r.max) {
    return `${label ? label + '：' : ''}种子 ${String(seed)} 超出 ${model} 文档参考范围 ${r.min}–${r.max}（仅提示，将原样发送由上游裁决）`;
  }
  return null;
}

/**
 * Seed range is strictly advisory (UI hint / random generator bounds only).
 * Never hard-blocks pre-run for any provider or value (including -1); upstream decides verbatim.
 */
export function seedRangeIssue(_provider: string | undefined | null, _model: string | undefined | null, _seed: unknown, _label?: string): string | null {
  return null;
}

type NodeLike = { id?: string; type: string; title?: string; bypassed?: boolean; values?: Record<string, any> };
type ConnLike = { fromNodeId: string; toNodeId: string; toSocketId?: string };

/**
 * Pre-run seed range gate is disabled (advisory only): never blocks execution.
 * Values (including -1 or out-of-range integers) are sent verbatim for upstream to decide.
 */
export function seedSchemaIssues(
  _nodes: NodeLike[],
  _connections?: ConnLike[],
): string | null {
  return null;
}
