/** Tokens that mean a LoRA *weight* (adapter), not a generation endpoint. */
const LORA_TYPE_TOKENS = ['lora', 'locon', 'lycoris', 'dora'] as const;

/**
 * Providers whose live catalog lists generation / model *endpoints*,
 * not downloadable LoRA weight files. Id/name containing "lora" alone
 * (e.g. fal-ai/krea-2/turbo/lora, fal-ai/flux-lora) must stay Checkpoint.
 * Real adapters from these providers are marked resourceKind: 'adapter'.
 */
const MODEL_ENDPOINT_CATALOG_PROVIDERS = [
  'fal',
  'nanogpt',
  'muapi',
  'wavespeed',
  'sogni',
  'krea',
  'together',
  'aimlapi',
  'novita',
  'venice',
  'openworks',
  'modelslab',
  'runware',
  'openai_compat',
  'grok_compat',
  'agnes',
  'sensenova',
] as const;

export type LoraWeightResourceLike = {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  category?: unknown;
  resourceKind?: unknown;
  tags?: unknown;
  provider?: unknown;
};

function token(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

/** Normalize "Fal.ai" / "fal-ai" / "fal" into a comparable key. */
export function normalizeProviderKey(provider?: string): string {
  return token(provider)
    .replace(/\.ai$/i, '')
    .replace(/[\s._-]+/g, '');
}

export function isModelEndpointCatalogProvider(provider?: string): boolean {
  const key = normalizeProviderKey(provider);
  if (!key) return false;
  return MODEL_ENDPOINT_CATALOG_PROVIDERS.some((p) => key === p || key.startsWith(p));
}

function isExplicitLoraTypeOrCategory(type: string, category: string): boolean {
  return (
    (LORA_TYPE_TOKENS as readonly string[]).includes(type) ||
    category === 'lora' ||
    (LORA_TYPE_TOKENS as readonly string[]).includes(category)
  );
}

function isExplicitNonLoraTypeOrCategory(type: string, category: string): boolean {
  const nonLora = ['checkpoint', 'base', 'video', 'edit', 'tools', 'motionmodule', 'controlnet', 'reasoning'];
  if (type && nonLora.includes(type)) return true;
  if (category && nonLora.includes(category)) return true;
  return false;
}

/**
 * True only for LoRA *weight* resources (adapters).
 * Prefer type / category / resourceKind over id/name substring.
 * Fal (and other endpoint catalogs): id containing "lora" is NOT a weight.
 */
export function isLoraWeightResource(item: LoraWeightResourceLike, provider?: string): boolean {
  const kind = token(item.resourceKind);
  if (kind === 'model-endpoint') return false;
  if (kind === 'adapter') return true;

  const prov = provider ?? (typeof item.provider === 'string' ? item.provider : undefined);
  // Endpoint catalogs never list weight files unless marked adapter above.
  if (isModelEndpointCatalogProvider(prov)) return false;

  const type = token(item.type);
  const category = token(item.category);
  if (isExplicitLoraTypeOrCategory(type, category)) return true;
  if (isExplicitNonLoraTypeOrCategory(type, category)) return false;

  // Weight-repo catalogs (HF / Civitai / TensorArt / ModelScope / Replicate):
  // secondary signal when type/category are ambiguous.
  const tags = Array.isArray(item.tags) ? item.tags.map((t) => token(t)) : [];
  if (tags.some((t) => (LORA_TYPE_TOKENS as readonly string[]).includes(t) || t.includes('lora'))) {
    return true;
  }
  const id = token(item.id);
  const name = token(item.name);
  if (id.includes('lora') || name.includes('lora')) return true;
  return false;
}
