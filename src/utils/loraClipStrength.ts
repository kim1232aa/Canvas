/**
 * clean-1029: providers whose submit route sends a LoRA CLIP strength separately from the model strength.
 * Audit (server.ts / src/server / src/engines): no route sends an independent CLIP strength — civitaiWorkflowRoute
 * writes strength_clip from the single LoRA strength. So the set is empty and the CLIP control is hidden for every
 * provider (no field, no note), never an empty input beside a 0 slider.
 */
export const PROVIDERS_SENDING_SEPARATE_CLIP_STRENGTH: ReadonlySet<string> = new Set<string>();
export function providerSendsSeparateClipStrength(provider: string | null | undefined): boolean {
  return PROVIDERS_SENDING_SEPARATE_CLIP_STRENGTH.has(String(provider || ''));
}
