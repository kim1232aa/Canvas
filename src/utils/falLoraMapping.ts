export interface FalServerLoraPayloadItem {
  path: string;
  scale?: number;
  [key: string]: unknown;
}

export interface FalServerLoraMappingResult {
  wireLoras: Array<Record<string, unknown> & { path: string; scale?: number }>;
  unmappedLoraFields: Array<{ lora: string; field: string; value: unknown; reason: string }>;
}

const FAL_LORA_INTERNAL_KEYS = new Set([
  'name', 'path', 'url', 'scale', 'strength', 'modelStrength', 'clipStrength',
  'civitaiId', 'civitai_id', 'downloadUrl', 'download_url', 'provider',
  'resource_source', 'resource_kind', 'resourceVerified', 'triggerWords', 'trigger_words',
  'baseModel', 'base_model', 'fromCatalog', 'isCatalog', 'catalog',
]);

function falSchemaDeclaresClip(loraItemProps?: Record<string, any> | null): boolean {
  return Boolean(loraItemProps && ('clip_scale' in loraItemProps || 'clipStrength' in loraItemProps));
}

/**
 * Server-side Fal LoRA mapping (shared between server.ts and tests):
 * Maps valid scale to wire, copies extra item properties declared by the live Schema
 * (or any extra non-internal key when loraItemProps is provided), marks clipStrength as
 * unmapped only when that schema does not declare a CLIP property, and NEVER fabricates
 * a fake scale or throws locally for clipStrength.
 */
export function mapFalServerLoras(loras: any[], loraItemProps?: Record<string, any> | null): FalServerLoraMappingResult {
  const badLora = loras.find((l: any) => !(l?.path || l?.url));
  if (badLora) {
    const err: any = new Error('LoRA 没有可直接访问的 path/url，无法发送');
    err.badLora = badLora;
    throw err;
  }
  const clipDeclared = falSchemaDeclaresClip(loraItemProps);
  const unmappedLoraFields: Array<{ lora: string; field: string; value: unknown; reason: string }> = [];
  const wireLoras = loras.map((l: any) => {
    const raw = l.scale ?? l.strength ?? l.modelStrength;
    const entry: Record<string, unknown> & { path: string; scale?: number } = { path: l.path || l.url };
    if (raw !== undefined && raw !== null && raw !== '') entry.scale = Number(raw);
    if (l.clipStrength !== undefined && l.clipStrength !== null && l.clipStrength !== '') {
      if (clipDeclared) {
        entry[loraItemProps && 'clip_scale' in loraItemProps ? 'clip_scale' : 'clipStrength'] = l.clipStrength;
      } else {
        unmappedLoraFields.push({
          lora: l.path || l.url || l.name,
          field: 'clipStrength',
          value: l.clipStrength,
          reason: 'Fal live OpenAPI does not declare CLIP scale/strength property for loras',
        });
      }
    }
    if (loraItemProps) {
      for (const [key, value] of Object.entries(l)) {
        if (value === undefined || value === null || value === '') continue;
        if (key in entry || FAL_LORA_INTERNAL_KEYS.has(key)) continue;
        if (key in loraItemProps) entry[key] = value;
      }
    }
    return entry;
  });
  return { wireLoras, unmappedLoraFields };
}
