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

/** Precheck message when a seed is outside the Schema range; null when fine / no range declared. The value is never changed. */
export function seedRangeIssue(provider: string | undefined | null, model: string | undefined | null, seed: unknown, label?: string): string | null {
  if (seed === undefined || seed === null || seed === '') return null;
  const r = seedRangeFor(provider, model); if (!r) return null;
  const n = Number(seed);
  if (!Number.isInteger(n) || n < r.min || n > r.max)
    return `${label ? label + '：' : ''}种子 ${String(seed)} 超出 ${model} 官方范围 ${r.min}–${r.max}（整数）；请改种子后再运行，未发送请求`;
  return null;
}

const MODEL_KEYS = ['model_endpoint', 'model', 'ckpt_name'] as const;

type NodeLike = { id?: string; type: string; title?: string; bypassed?: boolean; values?: Record<string, any> };
type ConnLike = { fromNodeId: string; toNodeId: string; toSocketId?: string };

/** Provider + model for a seed-bearing node: same-node fields first, else MODEL-chain CheckpointLoaderSimple (real Comfy graph). */
function providerModelForSeedNode(n: NodeLike, nodes: NodeLike[], connections?: ConnLike[]): { provider: string; model: string | undefined } {
  const localProvider =
    n.type === 'ModelScopeNode' ? 'modelscope'
    : n.type === 'ModelScopeAiNode' ? 'modelscope_ai'
    : String(n.values?.targetProvider || n.values?.provider || '');
  const localModel = MODEL_KEYS.map((k) => n.values?.[k]).find((v) => typeof v === 'string' && String(v).trim()) as string | undefined;
  if (localProvider && localModel) return { provider: localProvider, model: localModel };

  if (n.type === 'KSampler' && n.id && connections?.length) {
    const byId = new Map(nodes.filter((x) => x.id).map((x) => [x.id!, x]));
    let currId: string | undefined = connections.find((c) => c.toNodeId === n.id && c.toSocketId === 'model')?.fromNodeId;
    const visited = new Set<string>();
    while (currId && !visited.has(currId)) {
      visited.add(currId);
      const cur = byId.get(currId);
      if (!cur || cur.bypassed) break;
      if (cur.type === 'CheckpointLoaderSimple') {
        const p = String(cur.values?.targetProvider || cur.values?.provider || '');
        const m = MODEL_KEYS.map((k) => cur.values?.[k]).find((v) => typeof v === 'string' && String(v).trim()) as string | undefined;
        return { provider: p, model: m };
      }
      if (cur.type === 'LoRALoader' || cur.type === 'CivitaiLoRABrowserNode') {
        currId = connections.find((c) => c.toNodeId === cur.id && c.toSocketId === 'model')?.fromNodeId;
        continue;
      }
      break;
    }
  }
  return { provider: localProvider, model: localModel };
}

/**
 * Scan executable nodes for out-of-range seeds.
 * Real boards keep seed on KSampler and provider/model on CheckpointLoaderSimple — pass `connections`
 * so the precheck joins them the same way extractWorkflowParameters does. Value is never clamped.
 */
export function seedSchemaIssues(
  nodes: NodeLike[],
  connections?: ConnLike[],
): string | null {
  for (const n of nodes) {
    if (n.bypassed || !n.values || n.values.seed === undefined) continue;
    if (n.values.control_after_generate === 'randomize') continue; // generated in range at run time
    const { provider, model } = providerModelForSeedNode(n, nodes, connections);
    const issue = seedRangeIssue(provider, model, n.values.seed, n.title);
    if (issue) return issue;
  }
  return null;
}
