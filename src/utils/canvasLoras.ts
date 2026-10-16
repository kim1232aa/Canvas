/**
 * LoRA nodes on a Checkpoint's MODEL chain, in the SAME order the run extraction uses
 * (graphEngine traceModelAndLorasUpstream walks sampler → checkpoint, so the LoRA nearest the sampler is loras[0]).
 * Display-only helper for the Schema panel (e.g. lora_weights 「会发送 …（来自 LoRA 节点）」).
 */
type N = { id: string; type: string; bypassed?: boolean; values?: Record<string, any> };
type C = { fromNodeId: string; toNodeId: string; toSocketId: string };
const LORA_TYPES = new Set(['LoRALoader', 'CivitaiLoRABrowserNode']);
const nameOf = (n: N) => String((n.type === 'CivitaiLoRABrowserNode' ? n.values?.selected_model_name : n.values?.lora_name) ?? '').trim();

export function canvasLorasForCheckpoint(checkpointId: string, nodes: N[], connections: C[]): Array<{ name: string }> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const chain: Array<{ name: string }> = [];
  const seen = new Set<string>([checkpointId]);
  let curr = checkpointId;
  for (;;) {
    const next = connections
      .filter((c) => c.fromNodeId === curr && c.toSocketId === 'model')
      .map((c) => byId.get(c.toNodeId))
      .find((n): n is N => !!n && LORA_TYPES.has(n.type) && !n.bypassed && !seen.has(n.id));
    if (!next) break;
    seen.add(next.id);
    const name = nameOf(next);
    if (name) chain.push({ name });
    curr = next.id;
  }
  return chain.reverse();
}
