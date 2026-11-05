/**
 * Single source of truth for "does this canvas field land in the scoped Schema payload, and under which key".
 * Used by the server submit mapping (src/server/schemaProviders.ts) AND by the send badges (schemaSendStatus),
 * so a badge can never say 会发送 for a field the payload omits.
 */
export const GENERIC_PAYLOAD_ALIASES: Record<string, string[]> = {
  steps: ['num_inference_steps', 'steps'],
  cfg: ['guidance_scale', 'guidance', 'cfg', 'cfg_scale'],
  negative_prompt: ['negative_prompt'],
  image_url: ['image', 'image_url', 'start_image', 'start_image_url', 'first_frame_image', 'image_file', 'sourceImage'],
  denoise: ['strength', 'denoise'],
  sampler_name: ['sampler_name', 'sampler'],
  scheduler: ['scheduler'],
  aspect_ratio: ['aspect_ratio', 'aspectRatio', 'ratio'],
  resolution: ['resolution'],
  num_frames: ['num_frames', 'frames'],
  fps: ['fps', 'frames_per_second'],
  duration: ['duration', 'seconds'],
  output_format: ['output_format', 'outputFormat', 'format'],
  loras: ['styles', 'loras', 'image_loras', 'lora_list', 'lora_url'],
  styles: ['styles', 'loras', 'image_loras', 'lora_list'],
};
/** Canvas widget names that differ from the request-body name. */
const WIDGET_TO_BODY: Record<string, string> = { sampler: 'sampler_name' };

export type FieldPlan =
  | { send: true; target: string }
  | { send: false; reason: never; target?: string };

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
  const aliases = ctx.aliases || GENERIC_PAYLOAD_ALIASES;
  const has = (k: string) => !!ctx.declared && ctx.declared.has(k);
  const target = has(name) ? name : (aliases[name] || []).find(has) || ctx.fallbackTarget || name;
  // 雁 2026-11-04: a filled field is always sent (undeclared → under its own/alias name); no send:false plans.
  return { send: true, target };
}
