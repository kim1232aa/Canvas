import { NODE_DEFINITIONS } from '../constants/nodes';

/**
 * F4: Resolve the schema-declared provider for an AIVideoNode model option.
 * Driven by NODE_DEFINITIONS['AIVideoNode'].widgets model options — no hard-coded Fal rules.
 */
export function resolveAIVideoModelProvider(modelId: string): string | undefined {
  const trimmed = (modelId || '').trim();
  if (!trimmed) return undefined;
  const def = NODE_DEFINITIONS['AIVideoNode'];
  const modelWidget = def?.widgets?.find((w) => w.name === 'model');
  const opt = modelWidget?.options?.find((o) => o.value === trimmed);
  const p = opt?.provider;
  return typeof p === 'string' && p.trim() ? p.trim() : undefined;
}

/**
 * F4: Atomically apply a model selection — when the option carries a provider,
 * also set targetProvider and mirrored provider on the same values object.
 */
export function applyAIVideoModelSelection(
  currentValues: Record<string, any>,
  modelId: string
): Record<string, any> {
  const next: Record<string, any> = { ...currentValues, model: modelId };
  const schemaProvider = resolveAIVideoModelProvider(modelId);
  if (schemaProvider) {
    next.targetProvider = schemaProvider;
    next.provider = schemaProvider;
  }
  return next;
}

/**
 * F4: Before execute — reject empty provider or schema mismatch.
 * Never fall back to Fal. Returns the trimmed provider on success.
 */
export function assertAIVideoProviderReady(modelId: string, rawProvider: unknown): string {
  const videoProvider = typeof rawProvider === 'string' ? rawProvider.trim() : '';
  if (!videoProvider) {
    throw new Error(
      '视频服务商 (Provider) 未设置：请从带服务商标注的模型列表中选择模型，或先选择视频服务商。不会回退到 Fal。'
    );
  }
  const schemaProvider = resolveAIVideoModelProvider(modelId);
  if (schemaProvider && schemaProvider !== videoProvider) {
    throw new Error(
      `视频模型与服务商不一致：模型「${modelId}」属于 ${schemaProvider}，当前 targetProvider 为 ${videoProvider}。请重新选择模型以同步服务商，或改选匹配的服务商。不会回退到 Fal。`
    );
  }
  return videoProvider;
}
