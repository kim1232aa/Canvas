import { describe, expect, it } from 'vitest';
import { FIELD_STATUSES, PROVIDER_SCHEMA, fieldOptions, getFieldSpec, modelStatus, valueStatus, type FieldSpec } from './providerSchema';

const fields = PROVIDER_SCHEMA.flatMap((m) =>
  Object.entries(m.fields).map(([name, spec]) => [`${m.provider}/${m.id}.${name}`, spec as FieldSpec] as const),
);

describe('providerSchema 自检', () => {
  it('模型 id 不重复', () => {
    const ids = PROVIDER_SCHEMA.map((m) => `${m.provider}/${m.id}`);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it('每个模型、字段、取值级 source 都是 https:// URL', () => {
    for (const m of PROVIDER_SCHEMA) {
      expect(m.source, m.id).toMatch(/^https:\/\//);
      if (m.shutdownDate) expect(m.shutdownSource, m.id).toMatch(/^https:\/\//);
    }
    for (const [key, f] of fields) {
      expect(f.source, key).toMatch(/^https:\/\//);
      for (const v of f.enum ?? []) if (v.source) expect(v.source, `${key}=${v.value}`).toMatch(/^https:\/\//);
    }
  });

  it('status 只能是四个值之一', () => {
    for (const [key, f] of fields) expect(FIELD_STATUSES, key).toContain(f.status);
  });

  it('min <= max，enum 非空且无重复', () => {
    for (const [key, f] of fields) {
      if (f.min !== undefined && f.max !== undefined) expect(f.min, key).toBeLessThanOrEqual(f.max);
      if (f.enum) {
        const values = f.enum.map((v) => v.value);
        expect(values.length, key).toBeGreaterThan(0);
        expect(new Set(values).size, key).toBe(values.length);
      }
    }
  });

  it('每个 providerDefault 都在 enum 内且满足 min/max/multipleOf', () => {
    for (const [key, f] of fields) {
      const d = f.providerDefault;
      if (d === undefined) continue;
      if (f.enum) expect(f.enum.map((v) => v.value), key).toContain(String(d));
      if (typeof d === 'number') {
        if (f.min !== undefined) expect(d, key).toBeGreaterThanOrEqual(f.min);
        if (f.max !== undefined) expect(d, key).toBeLessThanOrEqual(f.max);
        if (f.exclusiveMin !== undefined) expect(d, key).toBeGreaterThan(f.exclusiveMin);
        if (f.multipleOf !== undefined) expect(d % f.multipleOf, key).toBe(0);
      }
    }
  });

  it('查询函数：沿用原 geminiValueStatus 语义', () => {
    expect(valueStatus('gemini', 'gemini-3.1-flash-image', 'aspect_ratio', '8:1')).toBe('supported');
    expect(valueStatus('gemini', 'gemini-3.1-flash-lite-image', 'aspect_ratio', '8:1')).toBe('unsupported');
    expect(valueStatus('gemini', 'gemini-3-pro-image', 'aspect_ratio', '16:9')).toBe('unverified');
    expect(valueStatus('gemini', 'gemini-3.1-flash-image', 'image_size', '512')).toBe('unverified');
    expect(valueStatus('gemini', 'no-such-model', 'aspect_ratio', '1:1')).toBe('unverified');
    expect(fieldOptions('gemini', 'no-such-model', 'aspect_ratio')).toEqual([]);
    expect(valueStatus('civitai', 'sdcpp:sdxl', 'width', 1000)).toBe('unsupported'); // 非 16 倍数
    expect(valueStatus('civitai', 'sdcpp:sdxl', 'width', 1024)).toBe('supported');
    expect(modelStatus('gemini', 'gemini-2.5-flash-image', '2026-10-01')).toBe('supported');
    expect(modelStatus('gemini', 'gemini-2.5-flash-image', '2026-10-02')).toBe('deprecated');
  });

  it('openai_compat gpt-image-2：不支持 seed/negative/steps/cfg/sampler/LoRA，支持 size/quality/output_format/background/moderation/n', () => {
    const grey = ['seed', 'negative_prompt', 'steps', 'cfg', 'sampler', 'scheduler', 'loras', 'width', 'height'] as const;
    for (const f of grey) {
      expect(getFieldSpec('openai_compat', 'gpt-image-2', f)?.status, f).toBe('unsupported');
    }
    expect(getFieldSpec('openai_compat', 'gpt-image-2', 'size')?.status).toBe('supported');
    expect(getFieldSpec('openai_compat', 'gpt-image-2', 'quality')?.status).toBe('supported');
    expect(getFieldSpec('openai_compat', 'gpt-image-2', 'output_format')?.status).toBe('supported');
    expect(getFieldSpec('openai_compat', 'gpt-image-2', 'background')?.status).toBe('supported');
    expect(getFieldSpec('openai_compat', 'gpt-image-2', 'moderation')?.status).toBe('supported');
    expect(getFieldSpec('openai_compat', 'gpt-image-2', 'num_images')?.status).toBe('supported');
    expect(valueStatus('openai_compat', 'gpt-image-2', 'quality', 'high')).toBe('supported');
    expect(valueStatus('openai_compat', 'gpt-image-2', 'quality', 'xhigh')).toBe('unsupported');
    expect(valueStatus('openai_compat', 'gpt-image-2', 'quality', 'max')).toBe('unsupported');
    expect(valueStatus('openai_compat', 'gpt-image-2', 'size', '1024x1024')).toBe('supported');
    expect(valueStatus('openai_compat', 'gpt-image-2', 'size', 'auto')).toBe('supported');
  });

  it('grok_compat imagine：不支持 seed/negative/steps/cfg/LoRA/像素宽高，支持 aspect_ratio 与 resolution', () => {
    for (const id of ['grok-imagine-image', 'grok-imagine-image-2.0', 'grok-imagine-image-quality']) {
      const grey = ['seed', 'negative_prompt', 'steps', 'cfg', 'loras', 'width', 'height'] as const;
      for (const f of grey) {
        expect(getFieldSpec('grok_compat', id, f)?.status, `${id}.${f}`).toBe('unsupported');
      }
      expect(getFieldSpec('grok_compat', id, 'aspect_ratio')?.status, id).toBe('supported');
      expect(getFieldSpec('grok_compat', id, 'resolution')?.status, id).toBe('supported');
      expect(valueStatus('grok_compat', id, 'resolution', '1k')).toBe('supported');
      expect(valueStatus('grok_compat', id, 'resolution', '1.5k')).toBe('supported');
      expect(valueStatus('grok_compat', id, 'resolution', '2k')).toBe('supported');
      expect(valueStatus('grok_compat', id, 'resolution', '4k')).toBe('unsupported');
    }
    for (const id of ['grok-imagine-video', 'grok-imagine-video-1.5']) {
      expect(getFieldSpec('grok_compat', id, 'width')?.status, id).toBe('unsupported');
      expect(getFieldSpec('grok_compat', id, 'seed')?.status, id).toBe('unsupported');
      expect(getFieldSpec('grok_compat', id, 'resolution')?.status, id).toBe('supported');
      expect(valueStatus('grok_compat', id, 'resolution', '720p')).toBe('supported');
      expect(valueStatus('grok_compat', id, 'resolution', '1k')).toBe('unsupported');
    }
  });

  it('C10: Civitai 各生态宽高约束与官方 recipe 一致', () => {
    const dim = (id: string) => {
      const s = getFieldSpec('civitai', id, 'width');
      return s && [s.min, s.max, s.multipleOf];
    };
    expect(dim('sdcpp:flux1')).toEqual([832, 1216, 16]);
    for (const e of ['sdxl', 'sd1', 'anima', 'zImage']) expect(dim(`sdcpp:${e}`), e).toEqual([64, 2048, 16]);
    expect(dim('sdcpp:qwen')).toEqual([64, 2048, 8]);
    expect(dim('sdcpp:flux2Dev')).toEqual([512, 2048, undefined]);
    expect(dim('sdcpp:flux2Klein')).toEqual([512, 2048, 16]);
    expect(dim('comfy:flux1')).toEqual([64, 2048, undefined]);
    expect(dim('comfy:krea2')).toEqual([undefined, undefined, undefined]);
    expect(dim('sdcpp:ponyV7')).toBeUndefined(); // 不在 schema → 原样发
  });
});
