import { friendlyProviderLabel, checkpointNodeTitle } from './providerLabels';
import { NODE_TITLE_MAP } from './nodeUiLabels';

/**
 * Formats the display title for an AIVideoNode:
 * - If titleSource === 'template', updates dynamically to follow the current provider.
 * - If titleSource !== 'template' (user-typed or unknown), preserves currentTitle verbatim.
 */
export function formatVideoNodeTitle(
  currentTitle: string | undefined | null,
  provider: string | undefined | null,
  titleSource?: 'template' | 'user'
): string {
  const raw = String(currentTitle || '').trim();
  if (titleSource !== 'template') {
    return raw || 'AI 视频';
  }

  const prov = String(provider || '').trim();
  if (!prov) return 'AI 视频';
  const label = friendlyProviderLabel(prov);
  return `AI 视频 (${label})`;
}

/**
 * Formats the display title for a CheckpointLoaderSimple node:
 * - If titleSource === 'template', updates dynamically to follow current provider / checkpoint.
 * - If titleSource !== 'template' (user-typed or unknown), preserves currentTitle verbatim.
 */
export function formatCheckpointNodeTitle(
  currentTitle: string | undefined | null,
  provider: string | undefined | null,
  checkpoint?: string | undefined | null,
  titleSource?: 'template' | 'user'
): string {
  const raw = String(currentTitle || '').trim();
  if (titleSource !== 'template') {
    return raw || '加载底模';
  }
  return checkpointNodeTitle(provider, checkpoint);
}

/**
 * Resolves the title when applying a model from Model Hub to an existing CheckpointLoaderSimple.
 * - If titleSource === 'template', computes the new title from provider/modelId.
 * - If titleSource !== 'template' (user-customized or unknown), preserves currentTitle verbatim.
 */
export function applyHubCheckpointTitle(
  currentTitle: string | undefined | null,
  provider: string | undefined | null,
  modelId: string | undefined | null,
  modelName?: string | null,
  titleSource?: 'template' | 'user'
): string {
  if (titleSource !== 'template') {
    return String(currentTitle || '').trim() || '加载底模';
  }
  if (provider === 'replicate') {
    const short = (modelName || modelId || '').split('/').pop() || modelId || '';
    return short ? `Load Checkpoint (Replicate · ${short})` : 'Load Checkpoint (Replicate)';
  }
  return checkpointNodeTitle(provider, modelId);
}

/**
 * Enhanced formatNodeDisplayTitle:
 * - AIVideoNode: if titleSource === 'template', follows provider; otherwise returns currentTitle verbatim.
 * - CheckpointLoaderSimple: if titleSource === 'template', follows provider/checkpoint; otherwise returns currentTitle verbatim.
 * - Presets/nodes without provider suffix: returns standard title mapping or currentTitle.
 */
export function formatNodeDisplayTitle(
  type: string,
  currentTitle?: string,
  values?: any,
  titleSource?: 'template' | 'user'
): string {
  if (type === 'AIVideoNode') {
    const prov = values?.targetProvider || values?.provider;
    return formatVideoNodeTitle(currentTitle, prov, titleSource);
  }

  if (type === 'CheckpointLoaderSimple') {
    return formatCheckpointNodeTitle(currentTitle, values?.targetProvider, values?.ckpt_name, titleSource);
  }

  if (NODE_TITLE_MAP[type]) {
    return NODE_TITLE_MAP[type];
  }

  return currentTitle || type;
}
