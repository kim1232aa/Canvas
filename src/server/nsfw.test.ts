import { describe, it, expect } from 'vitest';
import { applyNsfwDefaultsToPayload } from './nsfw';

describe('Server-side NSFW Defaults & Audit Logging', () => {
  it('applies permissive default to payload when declared in schema and missing in payload', () => {
    const payload: Record<string, any> = { prompt: 'a beautiful landscape' };
    const schemaProps = {
      prompt: { type: 'string' },
      disable_safety_checker: { type: 'boolean', default: false },
    };

    const applied = applyNsfwDefaultsToPayload(payload, schemaProps);

    expect(payload.disable_safety_checker).toBe(true);
    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({
      field: 'disable_safety_checker',
      value: true,
      docUrl: 'https://docs.together.ai/openapi.yaml',
    });
  });

  it('does NOT overwrite explicit user setting in payload (toggle-back preserved)', () => {
    const payload: Record<string, any> = {
      prompt: 'a beautiful landscape',
      disable_safety_checker: false, // user explicitly toggled back
    };
    const schemaProps = {
      prompt: { type: 'string' },
      disable_safety_checker: { type: 'boolean', default: false },
    };

    const applied = applyNsfwDefaultsToPayload(payload, schemaProps);

    // Stays false
    expect(payload.disable_safety_checker).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('applies permissive default for safe_mode (Venice)', () => {
    const payload: Record<string, any> = { prompt: 'portrait' };
    const schemaProps = {
      safe_mode: { type: 'boolean', default: true },
    };

    const applied = applyNsfwDefaultsToPayload(payload, schemaProps);

    expect(payload.safe_mode).toBe(false);
    expect(applied[0].docUrl).toBe('https://api.venice.ai/api/v1/swagger.yaml');
  });

  it('applies permissive default for enable_safety_checker (Fal / AIMLAPI)', () => {
    const payload: Record<string, any> = { prompt: 'art' };
    const schemaProps = {
      enable_safety_checker: { type: 'boolean', default: true },
    };

    const applied = applyNsfwDefaultsToPayload(payload, schemaProps);

    expect(payload.enable_safety_checker).toBe(false);
    expect(applied[0].docUrl).toBe('https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/flux-lora');
  });
});
