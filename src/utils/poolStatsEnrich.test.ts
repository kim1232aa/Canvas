import { describe, expect, it } from 'vitest';
import {
  enrichPoolStatsWithServerBaseUrl,
  normalizePoolStatsBaseUrl,
} from './poolStatsEnrich';

describe('poolStatsEnrich serverBaseUrl', () => {
  it('normalizes openai/grok/agnes/sensenova base URLs without inventing hosts', () => {
    expect(normalizePoolStatsBaseUrl('openai_compat', 'https://relay.example/v1/')).toBe(
      'https://relay.example/v1',
    );
    expect(normalizePoolStatsBaseUrl('grok_compat', 'https://relay.example')).toBe(
      'https://relay.example/v1',
    );
    expect(normalizePoolStatsBaseUrl('agnes', 'https://agnes.example/')).toBe('https://agnes.example');
    expect(normalizePoolStatsBaseUrl('sensenova', '')).toBe('');
  });

  it('getStats-shaped enrich includes serverBaseUrl when env/raw is set, never secrets', () => {
    const stats = {
      openai_compat: {
        totalKeys: 1,
        activeKeys: 1,
        rateLimitedKeys: 0,
        invalidKeys: 0,
        strategy: 'round_robin',
        keys: [{ maskedKey: 'sk-a...zzzz', source: 'env', status: 'active' }],
      },
      fal: { totalKeys: 0, keys: [] },
    };
    const enriched = enrichPoolStatsWithServerBaseUrl(stats, (p) => {
      if (p === 'openai_compat') return 'https://env-relay.example/v1/';
      if (p === 'grok_compat') return 'https://grok-env.example';
      return '';
    });
    expect(enriched.openai_compat.serverBaseUrl).toBe('https://env-relay.example/v1');
    expect(enriched.openai_compat.keys[0].maskedKey).toBe('sk-a...zzzz');
    expect(JSON.stringify(enriched)).not.toMatch(/sk-[a-zA-Z0-9]{10,}/);
    expect(enriched.grok_compat.serverBaseUrl).toBe('https://grok-env.example/v1');
    expect(enriched.agnes.serverBaseUrl).toBe('');
    expect(enriched.sensenova.serverBaseUrl).toBe('');
    expect(enriched.fal.serverBaseUrl).toBeUndefined();
  });
});
