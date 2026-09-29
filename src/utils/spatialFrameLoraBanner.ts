import { validateModelCompatibility } from './baseModelMatcher';
import { isCanvasFieldUnsupported, isLoraUnsupportedOnEndpoint } from './resolveCheckpoint';

/** Visible LoRA status copy for the spatial frame (mirrors node/inspector banners). */
export function getSpatialFrameLoraBanner(
  provider: string | undefined,
  checkpoint: string | undefined,
  loras: Array<{ name: string; baseModel?: string; modelStrength?: number }>
): null | {
  kind: 'unsupported' | 'mismatch';
  title: string;
  message: string;
  recommendedCheckpoint?: string;
} {
  if (!loras?.length) return null;
  if (isCanvasFieldUnsupported(provider, checkpoint, 'loras')) {
    const endpoint = isLoraUnsupportedOnEndpoint(provider, checkpoint);
    return {
      kind: 'unsupported',
      title: '该服务商不支持',
      message: endpoint.message || '该服务商不支持',
    };
  }
  const incompatibleLora = loras.find((l) => {
    const compat = validateModelCompatibility(checkpoint || '', (l as any).baseModel, l.name, provider);
    return !compat.isCompatible;
  });
  if (!incompatibleLora) return null;
  const compat = validateModelCompatibility(
    checkpoint || '',
    (incompatibleLora as any).baseModel,
    incompatibleLora.name,
    provider
  );
  return {
    kind: 'mismatch',
    title: 'LoRA 架构与底模不匹配',
    message: compat.message,
    recommendedCheckpoint: compat.recommendedCheckpoint,
  };
}
