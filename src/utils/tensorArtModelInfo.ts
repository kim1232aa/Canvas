/**
 * Tensor.Art TAMS model-info (`GET /v1/models/:id`) returns
 * `{ model: { id, name, baseModel, modelType, ... }, ... }`.
 * Some callers also see a flat shape. Normalize to a single FE shape
 * with top-level id/name/baseModel plus type/category derived from modelType.
 */
export function normalizeTensorArtModelInfo(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') {
    return { id: undefined, type: '', category: '', modelType: '', baseModel: undefined };
  }
  const root = payload as Record<string, unknown>;
  const nested =
    root.model && typeof root.model === 'object' && !Array.isArray(root.model)
      ? (root.model as Record<string, unknown>)
      : null;
  const raw = nested ? { ...root, ...nested } : { ...root };

  const modelType = String(raw.modelType ?? raw.type ?? raw.category ?? '').trim();
  const upper = modelType.toUpperCase();
  const isLora = ['LORA', 'LOCON', 'LYCORIS', 'DORA'].includes(upper);
  const isCheckpoint = upper === 'CHECKPOINT';
  const category = isLora
    ? 'LoRA'
    : isCheckpoint
      ? 'Checkpoint'
      : String(raw.category ?? modelType ?? '');

  const triggerSrc = raw.trainedWords ?? raw.triggerWords;
  const trainedWords = Array.isArray(triggerSrc)
    ? triggerSrc
    : triggerSrc
      ? [triggerSrc]
      : [];

  return {
    ...raw,
    id: raw.id ?? root.id,
    name: raw.name ?? root.name,
    baseModel: raw.baseModel ?? root.baseModel,
    modelType: modelType || String(raw.modelType ?? ''),
    type: modelType || String(raw.type ?? ''),
    category,
    trainedWords,
    triggerWords: trainedWords,
  };
}

/** Case-insensitive LoRA-family check over type / category / modelType. */
export function isTensorArtLoraType(info: { type?: unknown; category?: unknown; modelType?: unknown } | null | undefined): boolean {
  const hint = String(info?.type || info?.category || info?.modelType || '');
  return /lora|locon|lycoris|dora/i.test(hint);
}
