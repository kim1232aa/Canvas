import { describe, expect, it } from 'vitest';
import { FIELD_STATUSES, PROVIDER_SCHEMA, fieldOptions, getFieldSpec, modelStatus, resolveSchemaModelId, valueStatus, type FieldSpec } from './providerSchema';

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

  it('gemini 生图模型：seed 该服务商不支持（ImageConfig 无 seed），宽高/负向/steps/CFG/denoise/LoRA 同灰', () => {
    for (const id of [
      'gemini-3.1-flash-image',
      'gemini-3.1-flash-lite-image',
      'gemini-3-pro-image',
      'gemini-2.5-flash-image',
    ]) {
      const grey = ['seed', 'width', 'height', 'negative_prompt', 'steps', 'cfg', 'denoise', 'loras'] as const;
      for (const f of grey) {
        expect(getFieldSpec('gemini', id, f)?.status, `${id}.${f}`).toBe('unsupported');
      }
      const seed = getFieldSpec('gemini', id, 'seed');
      expect(seed?.note, id).toMatch(/ImageConfig|image-generation|aspectRatio/i);
      expect(seed?.source, id).toMatch(/image-generation/);
      expect(getFieldSpec('gemini', id, 'aspect_ratio')?.status, id).not.toBe('unsupported');
      expect(getFieldSpec('gemini', id, 'image_size')?.status, id).not.toBe('unsupported');
    }
  });

  it('openai_compat gpt-image-2：不支持 seed/negative/steps/cfg/sampler/LoRA，支持 size/quality/output_format/background/moderation/n', () => {
    const grey = ['seed', 'negative_prompt', 'steps', 'cfg', 'sampler', 'scheduler', 'denoise', 'loras', 'width', 'height'] as const;
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
      const grey = ['seed', 'negative_prompt', 'steps', 'cfg', 'denoise', 'loras', 'width', 'height'] as const;
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


describe('resolveSchemaModelId', () => {
  it('keeps known grok model id', () => {
    expect(resolveSchemaModelId('grok_compat', 'grok-imagine-image-2.0')).toBe('grok-imagine-image-2.0');
    expect(resolveSchemaModelId('grok_compat', 'grok-imagine-video')).toBe('grok-imagine-video');
  });

  it('falls back to first grok model when checkpoint empty or foreign', () => {
    const fallback = resolveSchemaModelId('grok_compat', '');
    expect(fallback).toBe('grok-imagine-image');
    expect(getFieldSpec('grok_compat', fallback, 'aspect_ratio')?.status).toBe('supported');
    expect(getFieldSpec('grok_compat', fallback, 'resolution')?.enum?.map((v) => v.value)).toEqual(['1k', '1.5k', '2k']);

    const foreign = resolveSchemaModelId('grok_compat', 'Tongyi-MAI/Z-Image-Turbo');
    expect(foreign).toBe('grok-imagine-image');
    expect(fieldOptions('grok_compat', foreign, 'aspect_ratio').length).toBeGreaterThan(0);
  });

  it('falls back for openai_compat so size/quality enums stay available', () => {
    expect(resolveSchemaModelId('openai_compat', '')).toBe('gpt-image-2');
    expect(resolveSchemaModelId('openai_compat', 'fal-ai/flux/dev')).toBe('gpt-image-2');
  });
});


describe('agnes / huggingface / nanogpt schema unsupported fields', () => {
  it('agnes image: greys seed/negative/steps/cfg/sampler/scheduler/denoise/loras; width/height stay', () => {
    for (const id of ['agnes-image-2.5-flash', 'agnes-image-2.1-flash', 'agnes-image-2.0-flash']) {
      for (const f of ['seed', 'negative_prompt', 'steps', 'cfg', 'sampler', 'scheduler', 'denoise', 'loras'] as const) {
        expect(getFieldSpec('agnes', id, f)?.status, `${id}.${f}`).toBe('unsupported');
      }
      expect(getFieldSpec('agnes', id, 'width')?.status).toBe('supported');
      expect(getFieldSpec('agnes', id, 'height')?.status).toBe('supported');
      expect(resolveSchemaModelId('agnes', '')).toBe('agnes-image-2.5-flash');
    }
  });

  it('huggingface text-to-image: greys loras/denoise/sampler; keeps negative/seed/steps/cfg/WH', () => {
    const id = 'huggingface-text-to-image';
    expect(getFieldSpec('huggingface', id, 'loras')?.status).toBe('unsupported');
    expect(getFieldSpec('huggingface', id, 'denoise')?.status).toBe('unsupported');
    expect(getFieldSpec('huggingface', id, 'sampler')?.status).toBe('unsupported');
    expect(getFieldSpec('huggingface', id, 'negative_prompt')?.status).toBe('supported');
    expect(getFieldSpec('huggingface', id, 'seed')?.status).toBe('supported');
    expect(getFieldSpec('huggingface', id, 'steps')?.status).toBe('supported');
    expect(resolveSchemaModelId('huggingface', 'foreign-civitai.safetensors')).toBe('huggingface-text-to-image');
  });

  it('nanogpt flux-schnell: greys negative/loras/steps/cfg/WH; keeps seed', () => {
    expect(getFieldSpec('nanogpt', 'flux-schnell', 'loras')?.status).toBe('unsupported');
    expect(getFieldSpec('nanogpt', 'flux-schnell', 'negative_prompt')?.status).toBe('unsupported');
    expect(getFieldSpec('nanogpt', 'flux-schnell', 'steps')?.status).toBe('unsupported');
    expect(getFieldSpec('nanogpt', 'flux-schnell', 'width')?.status).toBe('unsupported');
    expect(getFieldSpec('nanogpt', 'flux-schnell', 'seed')?.status).toBe('supported');
    expect(resolveSchemaModelId('nanogpt', '')).toBe('flux-schnell');
  });
});


describe('tensorart OpenWorks schema unsupported fields', () => {
  it('strong_text2image_nano_banana2: greys width/height/seed/steps/cfg/loras; keeps size/aspect_ratio', () => {
    const id = 'strong_text2image_nano_banana2';
    for (const f of ['width', 'height', 'seed', 'negative_prompt', 'steps', 'cfg', 'sampler', 'scheduler', 'denoise', 'loras'] as const) {
      expect(getFieldSpec('tensorart', id, f)?.status, f).toBe('unsupported');
    }
    expect(getFieldSpec('tensorart', id, 'size')?.status).toBe('supported');
    expect(getFieldSpec('tensorart', id, 'aspect_ratio')?.status).toBe('supported');
    expect(resolveSchemaModelId('tensorart', '')).toBe('strong_text2image_nano_banana2');
    expect(resolveSchemaModelId('tensorart', 'foreign-civitai.safetensors')).toBe('strong_text2image_nano_banana2');
  });

  it('oc_character_illustration: width/height supported; loras/seed/steps still unsupported', () => {
    const id = 'oc_character_illustration';
    expect(getFieldSpec('tensorart', id, 'width')?.status).toBe('supported');
    expect(getFieldSpec('tensorart', id, 'height')?.status).toBe('supported');
    expect(getFieldSpec('tensorart', id, 'loras')?.status).toBe('unsupported');
    expect(getFieldSpec('tensorart', id, 'seed')?.status).toBe('unsupported');
    expect(getFieldSpec('tensorart', id, 'steps')?.status).toBe('unsupported');
  });
});
