import { describe, it, expect } from 'vitest';
import { applyNsfwDefaultsToPayload } from './nsfw';

describe('Server-side NSFW payload is never rewritten', () => {
  it('does not add a declared safety field the payload omitted', () => {
    const payload: Record<string, any> = { prompt: 'a red fox sitting on a stone wall at dusk' };
    const schemaProps = {
      prompt: { type: 'string' },
      disable_safety_checker: { type: 'boolean', default: false },
    };

    const applied = applyNsfwDefaultsToPayload(payload, schemaProps);

    expect(payload).toEqual({ prompt: 'a red fox sitting on a stone wall at dusk' });
    expect(applied).toEqual([]);
  });

  it('does not change a value the caller already set', () => {
    const payload: Record<string, any> = {
      prompt: 'a red fox sitting on a stone wall at dusk',
      disable_safety_checker: false,
    };
    const schemaProps = {
      prompt: { type: 'string' },
      disable_safety_checker: { type: 'boolean', default: false },
    };

    const applied = applyNsfwDefaultsToPayload(payload, schemaProps);

    expect(payload.disable_safety_checker).toBe(false);
    expect(applied).toEqual([]);
  });

  it('does not fill Venice safe_mode or Fal enable_safety_checker', () => {
    const venice: Record<string, any> = { prompt: 'portrait of a red fox' };
    const fal: Record<string, any> = { prompt: 'portrait of a red fox' };

    expect(applyNsfwDefaultsToPayload(venice, { safe_mode: { type: 'boolean', default: true } })).toEqual([]);
    expect(applyNsfwDefaultsToPayload(fal, { enable_safety_checker: { type: 'boolean', default: true } })).toEqual([]);
    expect(venice).toEqual({ prompt: 'portrait of a red fox' });
    expect(fal).toEqual({ prompt: 'portrait of a red fox' });
  });

  it('returns nothing for a missing schema or payload', () => {
    expect(applyNsfwDefaultsToPayload({ prompt: 'x' }, undefined)).toEqual([]);
    expect(applyNsfwDefaultsToPayload(undefined as any, { safe_mode: {} })).toEqual([]);
  });
});
