/** Minimal fixtures for tests only; production always fetches the official live schema. */
export const sogniGenerateVideoSchemaFixture = {
  $id: 'https://schemas.sogni.ai/creative-agent/2026-07-18.1/tools/generate_video.schema.json',
  title: 'generate_video arguments',
  schemaVersion: '2026-07-18.1',
  type: 'object',
  additionalProperties: false,
  properties: {
    prompt: { type: 'string' },
    videoModel: { type: 'string', enum: ['ltx25', 'ltx23', 'wan22', 'minimax-h3-t2v'] },
    duration: { type: 'number', minimum: 2, maximum: 30 },
    loras: { type: 'array', items: { type: 'string' } },
    loraStrengths: { type: 'array', items: { type: 'number' } },
  },
  required: ['prompt'],
};

export const sogniAnimatePhotoSchemaFixture = {
  $id: 'https://schemas.sogni.ai/creative-agent/2026-07-18.1/tools/animate_photo.schema.json',
  title: 'animate_photo arguments',
  schemaVersion: '2026-07-18.1',
  type: 'object',
  additionalProperties: false,
  properties: {
    prompt: { type: 'string' },
    videoModel: { type: 'string', enum: ['ltx25', 'ltx23', 'wan22', 'minimax-h3-i2v'] },
    duration: { type: 'number' },
    sourceImageIndex: { type: 'number' },
  },
  required: ['prompt'],
};
