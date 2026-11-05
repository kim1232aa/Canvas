/** Minimal fixture for tests only; production always fetches the official live schema. */
export const sogniGenerateImageSchemaFixture = {
  $id: 'https://schemas.sogni.ai/creative-agent/2026-07-18.1/tools/generate_image.schema.json',
  title: 'generate_image arguments',
  schemaVersion: '2026-07-18.1',
  type: 'object',
  additionalProperties: false,
  properties: {
    prompt: { type: 'string' },
    model: { type: 'string', enum: ['krea-2-turbo', 'z-turbo', 'flux-3-klein'] },
    width: { type: 'number' },
    height: { type: 'number' },
    numberOfVariations: { type: 'integer' },
    negativePrompt: { type: 'string' },
    starting_image_strength: { type: 'number' },
    sourceImageIndex: { type: 'integer' },
    seed: { type: 'integer' },
    guidance: { type: 'number' },
    aspectRatio: { type: 'string' },
    loras: { type: 'array', items: { type: 'string' } },
    loraStrengths: { type: 'array', items: { type: 'number' } },
  },
};
