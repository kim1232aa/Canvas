import { friendlyProviderLabel, checkpointNodeTitle } from './providerLabels';
import { NODE_TITLE_MAP } from './nodeUiLabels';

/**
 * Checks whether an AIVideoNode's title is marked as a template-generated title.
 *
 * Strict Rule (Zero Heuristic):
 * - ONLY nodes explicitly stamped with `titleSource: 'template'` (e.g. from preset templates,
 *   palette defaults, or hub new nodes) are considered template titles.
 * - Any title with titleSource !== 'template' (undefined, 'user', or absent from imported JSON)
 *   is treated as USER-OWNED.
 * - "宁可不联动也不覆盖": If source is unknown, it is strictly treated as a user title.
 */
export function isTemplateVideoNodeTitle(
  _title?: string | null,
  titleSource?: 'template' | 'user'
): boolean {
  return titleSource === 'template';
}

/**
 * Checks whether a CheckpointLoaderSimple's title is marked as a template-generated title.
 */
export function isTemplateCheckpointNodeTitle(
  _title?: string | null,
  titleSource?: 'template' | 'user'
): boolean {
  return titleSource === 'template';
}

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
