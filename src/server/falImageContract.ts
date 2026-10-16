import { getModelSpec, type FieldKey } from '../schemas/providerSchema';

const provided = (v: unknown) => v !== undefined && v !== null && v !== '';
const DEFAULT_WIRE: Record<string, string> = { steps: 'num_inference_steps', cfg: 'guidance_scale', seed: 'seed', negative_prompt: 'negative_prompt' };

export type FalOmission = { from: string; to: null; value: unknown; sent: false; reason: string };

/**
 * Schema gate for fal image endpoints (PROVIDER_SCHEMA is the single declaration).
 * - Field declared `unsupported` → not sent, recorded as an omission (shown as「不会发送」).
 * - Endpoint not in the table → sent as before (upstream decides; no invented omission).
 * - loras on an endpoint whose schema says unsupported, or above the declared max → local 400, never stripped.
 */
export function falImageFieldGate(endpoint: string, values: Partial<Record<'steps' | 'cfg' | 'seed' | 'negative_prompt', unknown>>, loras: unknown[] = []) {
  const spec = getModelSpec('fal', endpoint);
  const send: Record<string, unknown> = {};
  const omitted: FalOmission[] = [];
  for (const field of ['steps', 'cfg', 'seed', 'negative_prompt'] as const) {
    const value = values[field];
    if (!provided(value)) continue;
    const fs = spec?.fields[field as FieldKey];
    if (fs?.status === 'unsupported') {
      omitted.push({ from: field, to: null, value, sent: false, reason: `fal ${endpoint} 官方 Schema 无 ${DEFAULT_WIRE[field]}；未发送（${fs.source}）` });
      continue;
    }
    send[fs?.wire || DEFAULT_WIRE[field]] = field === 'negative_prompt' ? value : Number(value);
  }
  if (Array.isArray(loras) && loras.length) {
    const ls = spec?.fields.loras;
    if (ls?.status === 'unsupported') throw Object.assign(new Error(`fal 端点 ${endpoint} 的官方 Schema 没有 loras 字段；未发送请求（不会静默剥离 LoRA）。`), { status: 400, errorSource: 'local' });
    if (ls?.max !== undefined && loras.length > ls.max) throw Object.assign(new Error(`fal 端点 ${endpoint} 最多 ${ls.max} 个 LoRA（官方 maxItems）；本次 ${loras.length} 个，未发送请求。`), { status: 400, errorSource: 'local' });
  }
  return { send, omitted };
}
