import { describe, expect, it } from 'vitest';
import { applyCustomParameters } from './customParameters';

describe('applyCustomParameters', () => {
  it('keeps explicit model overrides and records the actual model', () => {
    const built = applyCustomParameters({ model: 'canvas-model', prompt: 'a' }, { model: 'json-model', steps: 0 });
    expect(built.payload).toEqual({ model: 'json-model', prompt: 'a', steps: 0 });
    expect(built.actualModel).toBe('json-model');
    expect(built.overrides).toEqual([{ field: 'model', requested: 'canvas-model', custom: 'json-model', applied: true }]);
  });

  it('deep merges nested objects so unrelated nested fields survive', () => {
    const base = { config: { imageConfig: { aspectRatio: '1:1', imageSize: '2K' }, temperature: 1 } };
    const built = applyCustomParameters(base, { config: { imageConfig: { aspectRatio: '16:9' } } });
    expect(built.payload).toEqual({ config: { imageConfig: { aspectRatio: '16:9', imageSize: '2K' }, temperature: 1 } });
    expect(built.overrides).toEqual([{ field: 'config.imageConfig.aspectRatio', requested: '1:1', custom: '16:9', applied: true }]);
    expect(base.config.imageConfig.aspectRatio).toBe('1:1');
  });

  it('replaces arrays and keeps non-empty LoRA intent as written', () => {
    const built = applyCustomParameters({ loras: [{ name: 'a', strength: 1 }] }, { loras: [{ name: 'b', strength: 0 }] });
    expect(built.payload.loras).toEqual([{ name: 'b', strength: 0 }]);
  });

  it('rejects routing and credential keys at any depth instead of changing network auth', () => {
    for (const custom of [{ endpoint: 'x' }, { provider: 'x' }, { base_url: 'https://evil.test' }, { apiKey: 'x' }, { headers: { Authorization: 'x' } }, { extra: { token: 'x' } }]) {
      expect(() => applyCustomParameters({}, JSON.parse(JSON.stringify(custom)))).toThrow(/路由|凭据/);
    }
    expect(() => applyCustomParameters({}, JSON.parse('{"__proto__":{"polluted":true}}'))).toThrow();
    expect(({} as any).polluted).toBeUndefined();
  });

  it('allows generation token limits while rejecting credentials nested inside arrays', () => {
    expect(applyCustomParameters({}, { max_tokens: 1024, token_count: 2 }).payload).toEqual({ max_tokens: 1024, token_count: 2 });
    expect(() => applyCustomParameters({}, { items: [{ authorization: 'secret' }] })).toThrow(/凭据/);
  });

  it('rejects non-object JSON', () => {
    expect(() => applyCustomParameters({}, [] as any)).toThrow(/JSON 对象/);
    expect(applyCustomParameters({ a: 1 }, undefined).payload).toEqual({ a: 1 });
  });
});
