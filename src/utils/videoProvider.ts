import { NODE_DEFINITIONS } from '../constants/nodes';
import { friendlyProviderLabel } from './providerLabels';

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
 * F4 + soft-visual-4: Atomically apply a model selection.
 * When the option carries a provider, set targetProvider + mirrored provider.
 * When model is cleared/empty, CLEAR provider too — never leave Fal selected.
 */
export function applyAIVideoModelSelection(
  currentValues: Record<string, any>,
  modelId: string
): Record<string, any> {
  const trimmed = (modelId || '').trim();
  const next: Record<string, any> = { ...currentValues, model: modelId };
  if (!trimmed) {
    next.targetProvider = '';
    next.provider = '';
    return next;
  }
  const schemaProvider = resolveAIVideoModelProvider(modelId);
  if (schemaProvider) {
    next.targetProvider = schemaProvider;
    next.provider = schemaProvider;
  }
  return next;
}

/**
 * F4 / soft-visual-4: Before execute — reject empty provider or schema mismatch.
 * Never fall back to Fal. User-facing Chinese only (no targetProvider jargon).
 */
export function assertAIVideoProviderReady(modelId: string, rawProvider: unknown): string {
  if (/^(?:text2video_|image2video_|live_wallpaper$)/.test(modelId)) throw new Error('OpenWorks 工具不是视频模型；请重选真实模型，不会回退到 Fal。');
  const videoProvider = typeof rawProvider === 'string' ? rawProvider.trim() : '';
  if (!videoProvider) {
    throw new Error(
      '视频服务商 (Provider) 未设置：请从带服务商标注的模型列表中选择模型，或先选择视频服务商。不会回退到 Fal。'
    );
  }
  const schemaProvider = resolveAIVideoModelProvider(modelId);
  if (schemaProvider && schemaProvider !== videoProvider) {
    const modelHouse = friendlyProviderLabel(schemaProvider) || schemaProvider;
    const currentHouse = friendlyProviderLabel(videoProvider) || videoProvider;
    throw new Error(
      `视频模型与服务商不一致：模型属于 ${modelHouse}，当前选的是 ${currentHouse}。请重选模型以同步服务商，或改成匹配的服务商。不会回退到 Fal。`
    );
  }
  return videoProvider;
}
