import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  getRefinePromptCapability,
  publicRefinePromptCapabilities,
  REFINE_PROMPT_CAPABILITIES,
} from './refinePromptCapabilities';

describe('refine prompt capability declaration', () => {
  it('declares exactly the providers accepted by the refine route, with catalog mode', () => {
    expect(REFINE_PROMPT_CAPABILITIES.map(({ provider }) => provider)).toEqual(['gemini', 'sensenova', 'agnes']);
    expect(publicRefinePromptCapabilities()).toEqual([
      { provider: 'gemini', label: 'Google Gemini', catalog: 'live' },
      { provider: 'sensenova', label: 'SenseNova', catalog: 'live' },
      { provider: 'agnes', label: 'Agnes AI', catalog: 'manual' },
    ]);
    expect(getRefinePromptCapability(' unsupported ')).toBeUndefined();
  });

  it('filters only configured providers without exposing credentials', () => {
    expect(publicRefinePromptCapabilities((capability) => capability.provider !== 'sensenova')).toEqual([
      { provider: 'gemini', label: 'Google Gemini', catalog: 'live' },
      { provider: 'agnes', label: 'Agnes AI', catalog: 'manual' },
    ]);
  });

  it('is the provider gate used by the refine route instead of a separate UI-only allowlist', () => {
    const source = readFileSync(new URL('../../server.ts', import.meta.url), 'utf8');
    const routeStart = source.indexOf("app.post(['/api/gemini/refine-prompt', '/api/ai/refine-prompt']");
    const route = source.slice(routeStart, routeStart + 9000);
    expect(route).toContain('getRefinePromptCapability(targetProvider)');
    expect(route).toContain('REFINE_PROMPT_CAPABILITIES.map');
    expect(route).toContain('return res.status(400).json({');
    expect(route).toContain('supportedProviders: REFINE_PROMPT_CAPABILITIES.map');
    for (const capability of REFINE_PROMPT_CAPABILITIES) {
      expect(route).toContain(`targetProvider === '${capability.provider}'`);
    }
  });
});
