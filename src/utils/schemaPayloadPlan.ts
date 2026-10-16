/**
 * Single source of truth for "does this canvas field land in the scoped Schema payload, and under which key".
 * Used by the server submit mapping (src/server/schemaProviders.ts) AND by the send badges (schemaSendStatus),
 * so a badge can never say 会发送 for a field the payload omits.
 */
export const GENERIC_PAYLOAD_ALIASES: Record<string, string[]> = {
  steps: ['num_inference_steps', 'steps'],
  cfg: ['guidance_scale', 'guidance', 'cfg', 'cfg_scale'],
  negative_prompt: ['negative_prompt'],
  image_url: ['image', 'image_url'],
  denoise: ['strength', 'denoise'],
  sampler_name: ['sampler_name', 'sampler'],
  scheduler: ['scheduler'],
  aspect_ratio: ['aspect_ratio', 'aspectRatio'],
  resolution: ['resolution'],
  output_format: ['output_format', 'outputFormat', 'format'],
  loras: ['styles', 'loras', 'image_loras', 'lora_list', 'lora_url'],
  styles: ['styles', 'loras', 'image_loras', 'lora_list'],
};
/** Canvas widget names that differ from the request-body name. */
const WIDGET_TO_BODY: Record<string, string> = { sampler: 'sampler_name' };

export type FieldPlan =
  | { send: true; target: string }
  | { send: false; reason: 'no-reference-image' | 'not-in-schema'; target?: string };

export function planCanvasField(
  field: string,
  ctx: {
    /** Declared Schema property names; null = Schema not loaded. */
    declared: Set<string> | null;
    hasReferenceImage: boolean;
    schemaFieldsOnly: boolean;
    aliases?: Record<string, string[]>;
    /** Fallback target when nothing is declared (e.g. a provider's own canonical alias). */
    fallbackTarget?: string;
  },
): FieldPlan {
  const name = WIDGET_TO_BODY[field] || field;
  if (name === 'denoise' && !ctx.hasReferenceImage) return { send: false, reason: 'no-reference-image' };
  const aliases = ctx.aliases || GENERIC_PAYLOAD_ALIASES;
  const has = (k: string) => !!ctx.declared && ctx.declared.has(k);
  const target = has(name) ? name : (aliases[name] || []).find(has) || ctx.fallbackTarget || name;
  if (ctx.schemaFieldsOnly && ctx.declared && !ctx.declared.has(target)) return { send: false, reason: 'not-in-schema', target };
  return { send: true, target };
}
