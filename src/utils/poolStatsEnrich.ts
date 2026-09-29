/** Pure helpers to attach non-secret serverBaseUrl onto /api/cloud-keys/stats. */
import { normalizeGrokCompatBaseUrl, normalizeOpenAICompatBaseUrl } from '../engines/compatRelay';

export const POOL_STATS_BASE_URL_PROVIDERS = ['openai_compat', 'grok_compat', 'agnes', 'sensenova'] as const;
export type PoolStatsBaseUrlProvider = (typeof POOL_STATS_BASE_URL_PROVIDERS)[number];

export function normalizePoolStatsBaseUrl(provider: PoolStatsBaseUrlProvider, raw: string): string {
  if (provider === 'openai_compat') return normalizeOpenAICompatBaseUrl(raw);
  if (provider === 'grok_compat') return normalizeGrokCompatBaseUrl(raw);
  return String(raw || '').trim().replace(/\/+$/, '');
}

/** Merge serverBaseUrl into pool stats for auth providers. Never includes API keys. */
export function enrichPoolStatsWithServerBaseUrl(
  stats: Record<string, any>,
  resolveRaw: (provider: PoolStatsBaseUrlProvider) => string,
): Record<string, any> {
  const out: Record<string, any> = { ...stats };
  for (const p of POOL_STATS_BASE_URL_PROVIDERS) {
    const serverBaseUrl = normalizePoolStatsBaseUrl(p, resolveRaw(p) || '');
    const prev = out[p] && typeof out[p] === 'object' ? out[p] : {
      totalKeys: 0,
      activeKeys: 0,
      rateLimitedKeys: 0,
      invalidKeys: 0,
      strategy: 'round_robin',
      keys: [],
    };
    out[p] = { ...prev, serverBaseUrl };
  }
  return out;
}
