import { describe, expect, it } from 'vitest';
import {
  buildFalVideoRequest,
  falVideoImageField,
  isKlingV3,
  klingV3Duration,
  isNullableProp,
  FalVideoContractError,
} from './falVideoContract';
import { getFieldSpec, valueStatus } from '../schemas/providerSchema';
import { loadFalLiveProps } from './fixtures/liveSchemaFixtures';

const V3_I2V = 'fal-ai/kling-video/v3/standard/image-to-video';
const V3_T2V = 'fal-ai/kling-video/v3/standard/text-to-video';
const V1_I2V = 'fal-ai/kling-video/v1/standard/image-to-video';
const WAN27_I2V = 'fal-ai/wan/v2.7/image-to-video';

describe('Fal Kling V3 official contract', () => {
  it('only V3 endpoints are Kling V3', () => {
    expect(isKlingV3(V3_I2V)).toBe(true);
    expect(isKlingV3(V3_T2V)).toBe(true);
    expect(isKlingV3(V1_I2V)).toBe(false);
    expect(isKlingV3('fal-ai/wan-i2v')).toBe(false);
  });

  it('reference image field: V3 image-to-video uses start_image_url, V1 keeps image_url', () => {
    expect(falVideoImageField(V3_I2V)).toBe('start_image_url');
    expect(falVideoImageField(V1_I2V)).toBe('image_url');
    expect(falVideoImageField('fal-ai/wan-i2v')).toBe('image_url');
  });

  it('V3 duration stringifies values without local reject; non-integers passed to upstream', () => {
    expect(klingV3Duration(5)).toBe('5');
    expect(klingV3Duration('12')).toBe('12');
    expect(klingV3Duration(3)).toBe('3');
    expect(klingV3Duration(15)).toBe('15');
    expect(klingV3Duration(2)).toBe('2');
    expect(klingV3Duration(16)).toBe('16');
    expect(klingV3Duration(4.5)).toBe('4.5');
    expect(klingV3Duration('abc')).toBe('abc');
  });

  it('schema table has V3 entries: cfg_scale wire, negative_prompt supported, no local block', () => {
    for (const id of [V3_I2V, V3_T2V]) {
      expect(getFieldSpec('fal', id, 'cfg')?.status, id).toBe('supported');
      expect(getFieldSpec('fal', id, 'cfg')?.wire, id).toBe('cfg_scale');
      expect(getFieldSpec('fal', id, 'negative_prompt')?.status, id).toBe('supported');
    }
  });

  it('V3 text-to-video aspect_ratio is the official 16:9 / 9:16 / 1:1 enum', () => {
    expect(valueStatus('fal', V3_T2V, 'aspect_ratio', '16:9')).toBe('supported');
    expect(valueStatus('fal', V3_T2V, 'aspect_ratio', '1:1')).toBe('supported');
    expect(valueStatus('fal', V3_T2V, 'aspect_ratio', '4:3')).toBe('unsupported');
  });

  it('V3 image-to-video has no official aspect_ratio field', () => {
    expect(getFieldSpec('fal', V3_I2V, 'aspect_ratio')?.status).toBe('unsupported');
  });
});

describe('Fal video contract schema-driven validation (no hardcoded endpoint blocking)', () => {
  it('Wan v2.7 without image_url does not get locally intercepted when schema has no required', () => {
    const liveProps = loadFalLiveProps(WAN27_I2V);
    const result = buildFalVideoRequest(WAN27_I2V, { prompt: 'swimming whale' }, liveProps);
    expect(result.payload).toMatchObject({ prompt: 'swimming whale' });
    expect(result.payload).not.toHaveProperty('image_url');
    expect(result.payload).not.toHaveProperty('video_url');
  });

  it('Kling V3 duration converts to string when schema duration type is string; non-integer is passed to upstream', () => {
    const liveProps = loadFalLiveProps(V3_I2V);

    const resInt = buildFalVideoRequest(V3_I2V, { image_url: 'https://example.com/start.png', duration: 5 }, liveProps);
    expect(resInt.payload.duration).toBe('5');

    const resStr = buildFalVideoRequest(V3_I2V, { image_url: 'https://example.com/start.png', duration: '5' }, liveProps);
    expect(resStr.payload.duration).toBe('5');

    const resFloat = buildFalVideoRequest(V3_I2V, { image_url: 'https://example.com/start.png', duration: 4.5 }, liveProps);
    expect(resFloat.payload.duration).toBe('4.5');

    const resNonNum = buildFalVideoRequest(V3_I2V, { image_url: 'https://example.com/start.png', duration: 'abc' }, liveProps);
    expect(resNonNum.payload.duration).toBe('abc');
  });

  it('enforces required fields when live schema explicitly specifies required', () => {
    const liveProps = loadFalLiveProps(V3_I2V);
    // Missing start_image_url when schema declares required: ['start_image_url']
    expect(() =>
      buildFalVideoRequest(
        V3_I2V,
        { prompt: 'a scene' },
        liveProps,
        undefined,
        ['start_image_url'],
      ),
    ).toThrowError(/start_image_url 为必填项/);

    // Providing image_url maps to start_image_url and satisfies required
    const passed = buildFalVideoRequest(
      V3_I2V,
      { prompt: 'a scene', image_url: 'https://example.com/img.png' },
      liveProps,
      undefined,
      ['start_image_url'],
    );
    expect(passed.payload.start_image_url).toBe('https://example.com/img.png');
  });

  it('enforces required fields from nested schema object', () => {
    const customSchema = {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        fps: { type: 'integer' },
      },
      required: ['prompt', 'fps'],
    };

    expect(() =>
      buildFalVideoRequest('test-endpoint', { prompt: 'hello' }, customSchema),
    ).toThrowError(/fps 为必填项/);

    const valid = buildFalVideoRequest('test-endpoint', { prompt: 'hello', fps: 30 }, customSchema);
    expect(valid.payload).toMatchObject({ prompt: 'hello', fps: 30 });
  });

  it('enforces anyOf requirement branches when present in live schema', () => {
    const schemaWithAnyOf = {
      type: 'object',
      properties: {
        image_url: { type: 'string' },
        video_url: { type: 'string' },
      },
      anyOf: [{ required: ['image_url'] }, { required: ['video_url'] }],
    };

    expect(() =>
      buildFalVideoRequest('test-endpoint', {}, schemaWithAnyOf),
    ).toThrowError(/未满足必填组合要求/);

    const withImg = buildFalVideoRequest('test-endpoint', { image_url: 'https://example.com/1.png' }, schemaWithAnyOf);
    expect(withImg.payload.image_url).toBe('https://example.com/1.png');

    const withVid = buildFalVideoRequest('test-endpoint', { video_url: 'https://example.com/1.mp4' }, schemaWithAnyOf);
    expect(withVid.payload.video_url).toBe('https://example.com/1.mp4');

    // anyOf with an optional (empty required) branch allows empty input
    const schemaWithOptionalBranch = {
      type: 'object',
      properties: {
        image_url: { type: 'string' },
      },
      anyOf: [{ required: ['image_url'] }, {}],
    };
    const emptyPassed = buildFalVideoRequest('test-endpoint', {}, schemaWithOptionalBranch);
    expect(emptyPassed.payload).toEqual({});
  });

  it('validates raw Kling V3 fixture schema with top-level required array', () => {
    // Kling V3 OpenAPI input schema has required: ['start_image_url']
    const klingRawSchema = {
      type: 'object',
      properties: loadFalLiveProps(V3_I2V),
      required: ['start_image_url'],
    };

    expect(() =>
      buildFalVideoRequest(V3_I2V, { prompt: 'a scene' }, klingRawSchema),
    ).toThrowError(/start_image_url 为必填项/);

    const valid = buildFalVideoRequest(
      V3_I2V,
      { prompt: 'a scene', image_url: 'https://example.com/start.png' },
      klingRawSchema,
    );
    expect(valid.payload.start_image_url).toBe('https://example.com/start.png');
  });
});

describe('JSON Schema required presence semantics (empty string, nullable null, empty array)', () => {
  it('isNullableProp identifies OpenAPI 3.0, 3.1, and JSON Schema nullability', () => {
    expect(isNullableProp({ anyOf: [{ type: 'string' }, { type: 'null' }] })).toBe(true);
    expect(isNullableProp({ oneOf: [{ type: 'string' }, { type: 'null' }] })).toBe(true);
    expect(isNullableProp({ type: ['string', 'null'] })).toBe(true);
    expect(isNullableProp({ type: 'null' })).toBe(true);
    expect(isNullableProp({ type: 'string', nullable: true })).toBe(true);
    expect(isNullableProp({ type: 'string' })).toBe(false);
    expect(isNullableProp(undefined)).toBe(false);
    expect(isNullableProp(null)).toBe(false);
  });

  it('required path: allows empty string, nullable null, and empty array when property is present', () => {
    const schema = {
      type: 'object',
      properties: {
        prompt: { anyOf: [{ type: 'string' }, { type: 'array' }, { type: 'null' }] },
      },
      required: ['prompt'],
    };

    // Empty string is a valid present value
    const resEmptyStr = buildFalVideoRequest('test-endpoint', { prompt: '' }, schema);
    expect(resEmptyStr.payload).toEqual({ prompt: '' });

    // Null is allowed because prompt schema accepts null
    const resNull = buildFalVideoRequest('test-endpoint', { prompt: null }, schema);
    expect(resNull.payload).toEqual({ prompt: null });

    // Empty array is a valid present value
    const resEmptyArr = buildFalVideoRequest('test-endpoint', { prompt: [] }, schema);
    expect(resEmptyArr.payload).toEqual({ prompt: [] });

    // Truly missing field throws error
    expect(() =>
      buildFalVideoRequest('test-endpoint', {}, schema),
    ).toThrowError(/prompt 为必填项/);

    // Explicit undefined is treated as missing
    expect(() =>
      buildFalVideoRequest('test-endpoint', { prompt: undefined }, schema),
    ).toThrowError(/prompt 为必填项/);
  });

  it('required path: rejects null when property schema does not accept null', () => {
    const nonNullableSchema = {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
      },
      required: ['prompt'],
    };

    // Non-nullable string with prompt: '' passes presence check
    const valid = buildFalVideoRequest('test-endpoint', { prompt: '' }, nonNullableSchema);
    expect(valid.payload).toEqual({ prompt: '' });

    // Non-nullable string with prompt: null fails required check
    expect(() =>
      buildFalVideoRequest('test-endpoint', { prompt: null }, nonNullableSchema),
    ).toThrowError(/prompt 为必填项/);
  });

  it('anyOf path: allows empty string, nullable null, and empty array', () => {
    const anyOfSchema = {
      type: 'object',
      properties: {
        prompt: { anyOf: [{ type: 'string' }, { type: 'array' }, { type: 'null' }] },
      },
      anyOf: [{ required: ['prompt'] }],
    };

    expect(buildFalVideoRequest('test-endpoint', { prompt: '' }, anyOfSchema).payload).toEqual({ prompt: '' });
    expect(buildFalVideoRequest('test-endpoint', { prompt: null }, anyOfSchema).payload).toEqual({ prompt: null });
    expect(buildFalVideoRequest('test-endpoint', { prompt: [] }, anyOfSchema).payload).toEqual({ prompt: [] });

    expect(() =>
      buildFalVideoRequest('test-endpoint', {}, anyOfSchema),
    ).toThrowError(/未满足必填组合要求/);
  });

  it('combines property-level required: true with top-level required and anyOf', () => {
    const combinedSchema = {
      type: 'object',
      properties: {
        prompt: { type: 'string', required: true },
        extra: { type: 'string' },
        fps: { type: 'integer' },
        duration: { type: 'integer' },
      },
      required: ['extra'],
      anyOf: [{ required: ['fps'] }, { required: ['duration'] }],
    };

    // Missing property-level required: true
    expect(() =>
      buildFalVideoRequest('test-endpoint', { extra: 'ok', fps: 24 }, combinedSchema),
    ).toThrowError(/prompt 为必填项/);

    // Missing top-level required: ['extra']
    expect(() =>
      buildFalVideoRequest('test-endpoint', { prompt: '', fps: 24 }, combinedSchema),
    ).toThrowError(/extra 为必填项/);

    // Missing anyOf branches
    expect(() =>
      buildFalVideoRequest('test-endpoint', { prompt: '', extra: '' }, combinedSchema),
    ).toThrowError(/未满足必填组合要求/);

    // Satisfying all three with empty strings and an anyOf branch
    const passed = buildFalVideoRequest(
      'test-endpoint',
      { prompt: '', extra: '', fps: 24 },
      combinedSchema,
    );
    expect(passed.payload).toMatchObject({ prompt: '', extra: '', fps: 24 });
  });
});
