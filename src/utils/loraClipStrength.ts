/**
 * clean-1029: providers whose submit route sends a LoRA CLIP strength separately from the model strength.
 * Audit (server.ts / src/server / src/engines): no route sends an independent CLIP strength — civitaiWorkflowRoute
 * writes strength_clip from the single LoRA strength. So the set is empty and the CLIP control is hidden for every
 * provider with the 「不独立发送」 note (the WaveSpeed behaviour), never an empty input beside a 0 slider.
 */
export const PROVIDERS_SENDING_SEPARATE_CLIP_STRENGTH: ReadonlySet<string> = new Set<string>();
export const CLIP_STRENGTH_NOT_SENT_NOTE = '此 API 只接受单一 LoRA 强度；CLIP 强度不独立发送。';
export function providerSendsSeparateClipStrength(provider: string | null | undefined): boolean {
  return PROVIDERS_SENDING_SEPARATE_CLIP_STRENGTH.has(String(provider || ''));
}
