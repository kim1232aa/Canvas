import { describe, expect, it } from 'vitest';
import { buildOpenWorksRequest, openWorksInputSchema } from './openWorksProvider';
import { deriveSchemaNotice } from './schemaProviders';

describe('Mission M4 regression tests', () => {
  it('OpenWorks maps batch_size to result image count via aliases and avoids hardcoded defaults', () => {
    const mockTool = {
      name: 'photoreal_studio_z_image',
      inputs: [
        { type: 'STRING', description: 'prompt' },
        { type: 'INTEGER', description: 'image width' },
        { type: 'INTEGER', description: 'image height' },
        { type: 'INTEGER', description: 'result image count' }
      ]
    };
    const schema = openWorksInputSchema(mockTool);

    // Prompt, width, height, batch_size supplied
    const res = buildOpenWorksRequest('photoreal_studio_z_image', schema, {
      prompt: 'snow mountain',
      width: 1024,
      height: 1024,
      batch_size: 1,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // Verify 4 positional inputs are all filled, including result image count = 1 from batch_size
    expect(res.wire.inputs[0]).toEqual({ type: 'STRING', value: 'snow mountain' });
    expect(res.wire.inputs[1]).toEqual({ type: 'INTEGER', value: 1024 });
    expect(res.wire.inputs[2]).toEqual({ type: 'INTEGER', value: 1024 });
    expect(res.wire.inputs[3]).toEqual({ type: 'INTEGER', value: 1 });

    const countMapping = res.mapping.find(m => m.to === 'result image count');
    expect(countMapping).toBeDefined();
    expect(countMapping?.from).toBe('batch_size');
    expect(countMapping?.value).toBe(1);
    expect(countMapping?.sent).toBe(true);

    // When omitted entirely, no fake default is injected
    const omittedRes = buildOpenWorksRequest('photoreal_studio_z_image', schema, {
      prompt: 'snow mountain',
      width: 1024,
      height: 1024,
    });
    expect(omittedRes.ok).toBe(true);
    if (!omittedRes.ok) return;
    expect(omittedRes.wire.inputs[3].value).toBeUndefined();
  });

  describe('deriveSchemaNotice (P2-1)', () => {
    const endpoint = 'https://api.venice.ai/api/v1/image/generate';

    it('sets notice and lists real style/lora keys when schema lacks loras field', () => {
      const propertiesWithoutLoras = {
        prompt: { type: 'string' },
        model: { type: 'string' },
        lora_strength: { type: 'number' },
        style_preset: { type: 'string' },
      };

      const notice = deriveSchemaNotice(endpoint, propertiesWithoutLoras, false);
      expect(notice).toBeDefined();
      expect(notice).toContain(endpoint);
      expect(notice).toContain('未声明 loras 字段');
      expect(notice).toContain('lora_strength、style_preset');

      // Case when no style or lora keys exist at all
      const propertiesPlain = {
        prompt: { type: 'string' },
        model: { type: 'string' },
      };
      const plainNotice = deriveSchemaNotice(endpoint, propertiesPlain, false);
      expect(plainNotice).toBeDefined();
      expect(plainNotice).toContain('官方声明的 LoRA/风格字段：无');
    });

    it('returns undefined when schema declares loras field or is video', () => {
      const propertiesWithLoras = {
        prompt: { type: 'string' },
        loras: { type: 'array' },
      };
      expect(deriveSchemaNotice(endpoint, propertiesWithLoras, false)).toBeUndefined();

      const propertiesWithStyles = {
        prompt: { type: 'string' },
        styles: { type: 'array' },
      };
      expect(deriveSchemaNotice(endpoint, propertiesWithStyles, false)).toBeUndefined();

      // When isVideo is true, notice is suppressed
      expect(deriveSchemaNotice(endpoint, {}, true)).toBeUndefined();
    });
  });
});
