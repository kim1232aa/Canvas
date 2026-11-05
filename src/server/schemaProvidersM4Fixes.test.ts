import { describe, expect, it } from 'vitest';
import { buildOpenWorksRequest, openWorksInputSchema } from './openWorksProvider';

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
});
