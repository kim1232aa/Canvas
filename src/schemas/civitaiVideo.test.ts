import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import esbuild from 'esbuild';
import {
  buildCivitaiVideoInput,
  buildCivitaiVideoWorkflowSubmission,
} from './civitaiVideo';

// Representative structure copied from the live official OpenAPI's VideoGenInput,
// Wan21 and ComfyLtx2 schemas (allOf + successive discriminator mappings).
const officialVideoSchema = {
  components: {
    schemas: {
      VideoGenInput: {
        required: ['engine', 'prompt'],
        properties: { engine: { type: 'string' }, prompt: { type: 'string' } },
        discriminator: {
          propertyName: 'engine',
          mapping: {
            wan: '#/components/schemas/WanVideoGenInput',
            ltx2: '#/components/schemas/ComfyLtx2VideoGenInput',
            'ltx2.3': '#/components/schemas/ComfyLtx23VideoGenInput',
            flux: '#/components/schemas/Flux3VideoGenInput',
          },
        },
      },
      WanVideoGenInput: {
        allOf: [
          { $ref: '#/components/schemas/VideoGenInput' },
          {
            required: ['cfgScale', 'engine', 'version'],
            properties: {
              engine: { enum: ['wan'] }, version: { type: 'string' }, cfgScale: { type: 'number' },
              fps: { type: 'integer' }, duration: { type: 'integer' }, steps: { type: 'integer' },
              seed: { type: ['null', 'integer'] }, loras: { type: 'array', items: { $ref: '#/components/schemas/VideoGenInputLora' } },
            },
            discriminator: { propertyName: 'version', mapping: { 'v2.1': '#/components/schemas/Wan21VideoGenInput', 'v2.2': '#/components/schemas/Wan22VideoGenInput' } },
            additionalProperties: false,
          },
        ],
      },
      Wan21VideoGenInput: {
        allOf: [
          { $ref: '#/components/schemas/WanVideoGenInput' },
          {
            required: ['engine', 'provider', 'version'],
            properties: { engine: { enum: ['wan'] }, version: { enum: ['v2.1'] }, provider: { type: 'string' } },
            discriminator: { propertyName: 'provider', mapping: { civitai: '#/components/schemas/Wan21CivitaiVideoGenInput' } },
            additionalProperties: false,
          },
        ],
      },
      Wan21CivitaiVideoGenInput: {
        allOf: [
          { $ref: '#/components/schemas/Wan21VideoGenInput' },
          { required: ['engine', 'provider', 'version'], properties: { engine: { enum: ['wan'] }, provider: { enum: ['civitai'] }, version: { enum: ['v2.1'] }, diffusionModel: { type: 'string' }, sourceImage: { type: ['null', 'string'] }, images: { type: 'array', items: { type: 'string' } }, width: { type: 'integer' }, height: { type: 'integer' }, loras: { type: 'array', items: { $ref: '#/components/schemas/VideoGenInputLora' } } }, additionalProperties: false },
        ],
      },
      Wan22VideoGenInput: {
        allOf: [
          { $ref: '#/components/schemas/WanVideoGenInput' },
          {
            required: ['engine', 'provider', 'version'],
            properties: { engine: { enum: ['wan'] }, version: { enum: ['v2.2'] }, provider: { type: 'string' } },
            discriminator: { propertyName: 'provider', mapping: { comfy: '#/components/schemas/Wan22ComfyVideoGenInput' } },
            additionalProperties: false,
          },
        ],
      },
      Wan22ComfyVideoGenInput: {
        allOf: [
          { $ref: '#/components/schemas/Wan22VideoGenInput' },
          {
            required: ['engine', 'provider', 'version'],
            properties: {
              engine: { enum: ['wan'] },
              provider: { enum: ['comfy'] },
              version: { enum: ['v2.2'] },
              diffusionModel: { type: 'string' },
              sourceImage: { type: ['null', 'string'] },
              images: { type: 'array', items: { type: 'string' } },
              width: { type: 'integer' },
              height: { type: 'integer' },
              negativePrompt: { type: ['null', 'string'] },
              sampler: { type: 'string', enum: ['euler', 'dpmpp_2m_sde'] },
              scheduler: { type: 'string', enum: ['simple', 'karras'] },
              shift: { type: 'number' },
              loras: { type: 'array', items: { $ref: '#/components/schemas/VideoGenInputLora' } },
            },
            additionalProperties: false,
          },
        ],
      },
      VideoGenInputLora: { required: ['air', 'strength'], properties: { air: { type: 'string' }, strength: { type: 'number' } }, additionalProperties: false },
      ComfyLtx2VideoGenInput: {
        allOf: [
          { $ref: '#/components/schemas/VideoGenInput' },
          {
            required: ['engine', 'operation'],
            properties: { engine: { enum: ['ltx2'] }, operation: { type: 'string' }, model: { enum: ['19b-dev', '19b-distilled'] }, fps: { type: 'number' }, duration: { enum: [3, 5] }, steps: { type: 'integer', minimum: 8, maximum: 50 }, loras: { type: 'object', additionalProperties: { type: 'number' } } },
            discriminator: { propertyName: 'operation', mapping: { createVideo: '#/components/schemas/ComfyLtx2CreateVideoInput' } },
            additionalProperties: false,
          },
        ],
      },
      ComfyLtx2CreateVideoInput: {
        allOf: [
          { $ref: '#/components/schemas/ComfyLtx2VideoGenInput' },
          { required: ['engine', 'operation'], properties: { engine: { enum: ['ltx2'] }, operation: { enum: ['createVideo'] }, images: { type: 'array', items: { type: 'string' } } }, additionalProperties: false },
        ],
      },
      ComfyLtx23VideoGenInput: {
        allOf: [
          { $ref: '#/components/schemas/VideoGenInput' },
          { required: ['engine', 'operation'], properties: { engine: { enum: ['ltx2.3'] }, operation: { type: 'string' }, fps: { type: 'number' }, steps: { type: 'integer', minimum: 8, maximum: 50 } }, additionalProperties: false },
        ],
      },
      Flux3VideoGenInput: {
        allOf: [
          { $ref: '#/components/schemas/VideoGenInput' },
          { required: ['engine', 'version'], properties: { engine: { enum: ['flux'] }, version: { type: 'string' } }, additionalProperties: false },
        ],
      },
    },
  },
};

describe('Civitai video request mapping from selected official schema', () => {
  it('preserves the explicit Wan 2.1 Civitai recipe, sourceImage and LoRA array', () => {
    const body = {
      engine: 'wan', version: 'v2.1', provider: 'civitai', model: 'urn:air:wan:checkpoint:civitai:1@2',
      prompt: 'river', cfg: 4, steps: 20, seed: 0, image_url: 'https://example.test/input.png',
      loras: [{ name: 'urn:air:wan:lora:civitai:3@4', strength: 0 }], fps: 24,
    };
    const result = buildCivitaiVideoInput(body, officialVideoSchema);
    expect(result.payload).toMatchObject({
      engine: 'wan', version: 'v2.1', provider: 'civitai', diffusionModel: body.model,
      sourceImage: body.image_url, seed: 0, steps: 20, cfgScale: 4, fps: 24,
      loras: [{ air: body.loras[0].name, strength: 0 }],
    });
    expect(result.schemaStatus).toBe('official-openapi');
    expect(result.schemaFields).toContain('diffusionModel');
    expect(result.unmappedFields).toEqual([]);
    const passthrough = buildCivitaiVideoInput({ ...body, negative_prompt: 'blur', sampler_name: 'euler' }, officialVideoSchema);
    expect(passthrough.payload).toMatchObject({
      engine: 'wan',
      version: 'v2.1',
      provider: 'civitai',
      negative_prompt: 'blur',
    });
    expect(passthrough.payload).not.toHaveProperty('sampler_name');
    expect(passthrough.payload).not.toHaveProperty('sampler');
    expect(passthrough.unmappedFields).toEqual([
      expect.objectContaining({
        field: 'negative_prompt',
        value: 'blur',
        passthroughAs: 'negative_prompt',
        reason: expect.stringContaining('未声明字段已原样透传'),
      }),
    ]);
    expect(passthrough.omitted).toEqual([
      expect.objectContaining({
        field: 'sampler_name',
        value: 'euler',
        reason: expect.stringContaining('未声明字段未发送'),
      }),
    ]);
    expect(passthrough.fieldStatus.sampler_name).toBe('omitted');
    expect(() => buildCivitaiVideoInput({ ...body, version: 'v2.7' }, officialVideoSchema)).toThrow(/未列出|不含/);
  });

  it('maps declared sampler and scheduler for Wan 2.2 Comfy schema, and omits them when unset', () => {
    const filledBody = {
      engine: 'wan',
      version: 'v2.2',
      provider: 'comfy',
      model: 'urn:air:wanvideo-22-t2v-a14b:checkpoint:civitai:1817671@2114154',
      prompt: 'a cinematic orbit around a lighthouse at sunset',
      sampler_name: 'euler',
      scheduler: 'simple',
      fps: 24,
      cfg: 3,
      steps: 20,
    };
    const mapped = buildCivitaiVideoInput(filledBody, officialVideoSchema);
    expect(mapped.payload).toMatchObject({
      engine: 'wan',
      version: 'v2.2',
      provider: 'comfy',
      diffusionModel: filledBody.model,
      prompt: filledBody.prompt,
      sampler: 'euler',
      scheduler: 'simple',
      cfgScale: 3,
      steps: 20,
      fps: 24,
    });
    expect(mapped.payload).not.toHaveProperty('sampler_name');
    expect(mapped.omitted).toEqual([]);
    expect(mapped.fieldStatus.sampler_name).toBe('supported');
    expect(mapped.fieldStatus.scheduler).toBe('supported');

    // Unset sampler_name / scheduler: not fabricated, not present in payload, not in omitted
    const { sampler_name: _s, scheduler: _sc, ...unfilledBody } = filledBody;
    const unsetMapped = buildCivitaiVideoInput(unfilledBody, officialVideoSchema);
    expect(unsetMapped.payload).not.toHaveProperty('sampler');
    expect(unsetMapped.payload).not.toHaveProperty('sampler_name');
    expect(unsetMapped.payload).not.toHaveProperty('scheduler');
    expect(unsetMapped.omitted).toEqual([]);
  });

  it('selects an official LTX2 operation schema and uses its fps, image array and LoRA object shape', () => {
    const result = buildCivitaiVideoInput({
      engine: 'ltx2', operation: 'createVideo', prompt: 'a river', model: '19b-dev',
      steps: 8, fps: 24, image_url: 'https://example.test/start.png',
      loras: [{ air: 'urn:air:ltx2:lora:civitai:2@3', strength: 0.6 }],
    }, officialVideoSchema);
    expect(result.payload).toMatchObject({
      engine: 'ltx2', operation: 'createVideo', prompt: 'a river', model: '19b-dev',
      steps: 8, fps: 24, images: ['https://example.test/start.png'],
      loras: { 'urn:air:ltx2:lora:civitai:2@3': 0.6 },
    });
    expect(result.payload).not.toHaveProperty('frameRate');
    expect(result.payload).not.toHaveProperty('sourceImage');
  });

  it('accepts engine branches added to the live discriminator without a code allowlist, and passes through undeclared model/image_url/loras/clipSkip without local throw', () => {
    const result = buildCivitaiVideoInput({
      engine: 'ltx2.3',
      operation: 'createVideo',
      prompt: 'new branch',
      steps: 9,
      fps: 30,
      model: 'custom-ltx23-model',
      image_url: 'https://example.test/frame.png',
      loras: [{ air: 'urn:air:ltx23:lora:civitai:1@2', strength: 0.8 }],
      clipSkip: 2,
    }, officialVideoSchema);
    expect(result.payload).toMatchObject({
      engine: 'ltx2.3',
      operation: 'createVideo',
      prompt: 'new branch',
      steps: 9,
      fps: 30,
      model: 'custom-ltx23-model',
      image_url: 'https://example.test/frame.png',
      loras: [{ air: 'urn:air:ltx23:lora:civitai:1@2', strength: 0.8 }],
      clipSkip: 2,
    });
    expect(result.unmappedFields.map((f) => f.field)).toEqual(['model', 'clipSkip', 'image_url', 'loras']);
    expect(result.customParametersUnvalidated).toBe(true);
  });

  it('rejects an engine absent from the supplied official schema and does not alias flux3', () => {
    expect(() => buildCivitaiVideoInput({ engine: 'flux3', version: 'v3.0', prompt: 'x' }, officialVideoSchema)).toThrow(/未列出/);
    expect(buildCivitaiVideoInput({ engine: 'flux', version: 'v3.0', prompt: 'x' }, officialVideoSchema).payload.engine).toBe('flux');
  });

  it('preserves caller custom overrides and unknown fields after schema mapping', () => {
    const result = buildCivitaiVideoInput({
      engine: 'wan', version: 'v2.1', provider: 'civitai', prompt: 'river', model: 'selected', cfg: 4,
      custom_parameters: { diffusionModel: 'custom-model', customWireField: { keep: true }, fps: 30 },
    }, officialVideoSchema);
    expect(result.payload).toMatchObject({ diffusionModel: 'custom-model', customWireField: { keep: true }, fps: 30 });
    expect(result.schemaStatus).toBe('official-openapi');
    expect(result.customParametersUnvalidated).toBe(true);
    expect(result.overrides).toContainEqual(expect.objectContaining({ field: 'diffusionModel', custom: 'custom-model', applied: true }));
  });

  it('does not build a request when the official OpenAPI document is unavailable', () => {
    expect(() => buildCivitaiVideoInput({ engine: 'future-engine', prompt: 'hello', custom_parameters: { duration: 10 } }, undefined)).toThrow(/OpenAPI/);
  });

  it('P1-2: strips allowMatureContent from video input payload so it never leaks into steps[0].input', () => {
    const result = buildCivitaiVideoInput({
      engine: 'wan',
      version: 'v2.1',
      provider: 'civitai',
      prompt: 'sunset',
      cfg: 4,
      custom_parameters: { allowMatureContent: false, customField: 'keep' },
    }, officialVideoSchema);

    expect(result.payload).not.toHaveProperty('allowMatureContent');
    expect(result.payload.customField).toBe('keep');
  });

  it('buildCivitaiVideoWorkflowSubmission helper constructs video workflow JSON root allowMatureContent and no query flag', () => {
    const videoInput = { engine: 'wan', version: 'v2.1', prompt: 'sunset river' };
    const subFalse = buildCivitaiVideoWorkflowSubmission(false, videoInput, 120);
    expect(subFalse.url).toBe('https://orchestration.civitai.com/v2/consumer/workflows?wait=120');
    expect(subFalse.url).not.toContain('allowMatureContent=');
    expect(subFalse.body).toHaveProperty('allowMatureContent', false);
    expect(subFalse.body.steps[0].input).not.toHaveProperty('allowMatureContent');
    expect(subFalse.body.steps[0].input).toBe(videoInput);

    const subTrue = buildCivitaiVideoWorkflowSubmission(true, videoInput, 120);
    expect(subTrue.url).not.toContain('allowMatureContent=');
    expect(subTrue.body).toHaveProperty('allowMatureContent', true);
    expect(subTrue.body.steps[0].input).not.toHaveProperty('allowMatureContent');
  });

  it('locks server.ts Civitai video workflow POST wire contract: root allowMatureContent, no query, clean steps[0].input', async () => {
    const serverSource = readFileSync(new URL('../../server.ts', import.meta.url), 'utf8');
    const startIdx = serverSource.indexOf('const videoAllowMature =');
    const endIdx = serverSource.indexOf('if (!orchResp.ok)', startIdx);
    expect(startIdx, 'Civitai video workflow dispatch block must exist in server.ts').toBeGreaterThanOrEqual(0);
    expect(endIdx, 'End boundary of Civitai video workflow dispatch must exist in server.ts').toBeGreaterThan(startIdx);
    const codeSlice = serverSource.slice(startIdx, endIdx);

    const wrapped = `async function __exec(req, videoInput, upstreamFetch, generationContext, sanitizeGenerationMetadata, CIVITAI_VIDEO_SUBMIT_WAIT_SECONDS, CIVITAI_VIDEO_OPENAPI_URL, videoSchemaStatus, videoSchemaCustomFieldsUnvalidated, videoSchemaFields, videoSchemaSelected, videoOverrides, videoSchemaFetch, model, apiKey, videoOmitted = [], videoFieldStatus = {}) {
      let capturedUrl = "";
      let capturedBody = null;
      const realFetch = upstreamFetch;
      upstreamFetch = async (m, u, i) => {
        capturedUrl = u;
        capturedBody = JSON.parse(i.body);
        return realFetch(m, u, i);
      };
      ${codeSlice}
      return { capturedUrl, capturedBody, orchResp };
    }`;
    const jsCode = esbuild.transformSync(wrapped, { loader: 'ts' }).code;
    const fn = new Function(jsCode + '; return __exec;')();

    const mockFetch = async () => new Response(JSON.stringify({ id: 'orch-mock-video-id' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const generationContext = { getStore: () => undefined };
    const sanitizeGenerationMetadata = (x: any) => x;
    const CIVITAI_VIDEO_SUBMIT_WAIT_SECONDS = 120;
    const CIVITAI_VIDEO_OPENAPI_URL = 'https://orchestration.civitai.com/v2/consumer/recipes/videoGen/openapi.json';
    const videoSchemaStatus = 'official-openapi';
    const videoSchemaCustomFieldsUnvalidated = false;
    const videoSchemaFields = undefined;
    const videoSchemaSelected = undefined;
    const videoOverrides: any[] = [];
    const videoSchemaFetch = undefined;
    const model = 'civitai-video-test-model';
    const apiKey = 'test-civitai-api-key';
    const videoInput = { engine: 'wan', version: 'v2.1', prompt: 'sunset river' };

    // Case 1: custom_parameters toggled off -> allowMatureContent: false
    const resToggledOff = await fn(
      { body: { custom_parameters: { allowMatureContent: false } }, path: '/api/civitai/generate' },
      videoInput,
      mockFetch,
      generationContext,
      sanitizeGenerationMetadata,
      CIVITAI_VIDEO_SUBMIT_WAIT_SECONDS,
      CIVITAI_VIDEO_OPENAPI_URL,
      videoSchemaStatus,
      videoSchemaCustomFieldsUnvalidated,
      videoSchemaFields,
      videoSchemaSelected,
      videoOverrides,
      videoSchemaFetch,
      model,
      apiKey
    );
    // (a) 请求体根上有 allowMatureContent，与 steps 同级
    expect(resToggledOff.capturedBody).toHaveProperty('allowMatureContent', false);
    expect(resToggledOff.capturedBody).toHaveProperty('steps');
    expect(Array.isArray(resToggledOff.capturedBody.steps)).toBe(true);
    // (b) URL 里没有 allowMatureContent=
    expect(resToggledOff.capturedUrl).not.toContain('allowMatureContent=');
    expect(resToggledOff.capturedUrl).toBe('https://orchestration.civitai.com/v2/consumer/workflows?wait=120');
    // (c) steps[0].input 里没有这个键
    expect(resToggledOff.capturedBody.steps[0].input).not.toHaveProperty('allowMatureContent');

    // Case 2: unset -> omitted. Official docs leave the field unset and let the orchestrator decide.
    const resUnset = await fn(
      { body: {}, path: '/api/civitai/generate' },
      videoInput,
      mockFetch,
      generationContext,
      sanitizeGenerationMetadata,
      CIVITAI_VIDEO_SUBMIT_WAIT_SECONDS,
      CIVITAI_VIDEO_OPENAPI_URL,
      videoSchemaStatus,
      videoSchemaCustomFieldsUnvalidated,
      videoSchemaFields,
      videoSchemaSelected,
      videoOverrides,
      videoSchemaFetch,
      model,
      apiKey
    );
    expect(resUnset.capturedBody).not.toHaveProperty('allowMatureContent');
    expect(resUnset.capturedUrl).not.toContain('allowMatureContent=');
    expect(resUnset.capturedBody.steps[0].input).not.toHaveProperty('allowMatureContent');
  });
});
