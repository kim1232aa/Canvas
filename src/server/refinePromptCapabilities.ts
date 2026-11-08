export type RefinePromptCapability = {
  provider: string;
  label: string;
  catalog: 'live' | 'manual';
  keyHeader: string;
};

/** Single server-owned declaration consumed by the refine route and the read-only UI capability endpoint. */
export const REFINE_PROMPT_CAPABILITIES: readonly RefinePromptCapability[] = [
  { provider: 'gemini', label: 'Google Gemini', catalog: 'live', keyHeader: 'x-gemini-key' },
  { provider: 'sensenova', label: 'SenseNova', catalog: 'live', keyHeader: 'x-sensenova-key' },
  { provider: 'agnes', label: 'Agnes AI', catalog: 'manual', keyHeader: 'x-agnes-key' },
] as const;

export function getRefinePromptCapability(provider: unknown): RefinePromptCapability | undefined {
  const normalized = typeof provider === 'string' ? provider.trim().toLowerCase() : '';
  return REFINE_PROMPT_CAPABILITIES.find((capability) => capability.provider === normalized);
}

export function publicRefinePromptCapabilities(
  configured: (capability: RefinePromptCapability) => boolean = () => true,
) {
  return REFINE_PROMPT_CAPABILITIES
    .filter(configured)
    .map(({ provider, label, catalog }) => ({ provider, label, catalog }));
}
