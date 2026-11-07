import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import esbuild from 'esbuild';
import { applyCustomParameters } from './customParameters';

/**
 * Executes the real server.ts dispatch slices (the same technique the Civitai wire
 * tests use) and checks the body that would be posted upstream.
 */
function sliceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end <= start) throw new Error(`slice not found: ${startMarker}`);
  return source.slice(start, end);
}

function compile(wrapped: string): (...args: any[]) => Promise<any> {
  const js = esbuild.transformSync(wrapped, { loader: 'ts' }).code;
  return new Function(js + '; return __exec;')();
}

const serverSource = readFileSync(new URL('../../server.ts', import.meta.url), 'utf8');

describe('/api/fal/generate safety fields', () => {
  const fn = compile(`async function __exec(payload, req, upstreamFetch, applyCustomParameters) {
    let captured = null;
    upstreamFetch = async (_meta, _url, init) => {
      captured = JSON.parse(init.body);
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    };
    ${sliceBetween(serverSource, 'const custom = applyCustomParameters(payload, req.body.custom_parameters);', 'const response = await upstreamFetch(')}
    const response = await upstreamFetch({ provider: 'fal' }, 'https://fal.run/fal-ai/flux-2-flex', { method: 'POST', body: JSON.stringify(sentPayload) });
    return { captured, response };
  }`);

  const liveProps = { enable_safety_checker: { type: 'boolean', default: true }, safety_tolerance: { type: 'string', default: '2' } };

  it('omits both fields when custom_parameters does not set them', async () => {
    const { captured } = await fn(
      { prompt: 'a red fox on a stone wall at dusk' },
      { body: {} },
      async () => new Response('{}'),
      applyCustomParameters,
    );
    expect(captured).not.toHaveProperty('enable_safety_checker');
    expect(captured).not.toHaveProperty('safety_tolerance');
  });

  it('sends the values the user set, including the open ones', async () => {
    const { captured } = await fn(
      { prompt: 'a red fox on a stone wall at dusk' },
      { body: { custom_parameters: { enable_safety_checker: false, safety_tolerance: '5' } } },
      async () => new Response('{}'),
      applyCustomParameters,
    );
    expect(captured.enable_safety_checker).toBe(false);
    expect(captured.safety_tolerance).toBe('5');
  });

  it('keeps a restrictive choice exactly as given', async () => {
    const { captured } = await fn(
      { prompt: 'a red fox on a stone wall at dusk' },
      { body: { custom_parameters: { enable_safety_checker: true, safety_tolerance: '2' } } },
      async () => new Response('{}'),
      applyCustomParameters,
    );
    expect(captured.enable_safety_checker).toBe(true);
    expect(captured.safety_tolerance).toBe('2');
  });

  it('still omits them when the live schema declares them and the user did not', async () => {
    const { captured } = await fn(
      { prompt: 'a red fox on a stone wall at dusk' },
      { body: { custom_parameters: { steps: 28 } } },
      async () => new Response('{}'),
      applyCustomParameters,
    );
    void liveProps;
    expect(captured).not.toHaveProperty('enable_safety_checker');
    expect(captured).not.toHaveProperty('safety_tolerance');
    expect(captured.steps).toBe(28);
  });
});

describe('Civitai image workflow body', () => {
  const fn = compile(`async function __exec(builtImage, req, genInput, upstreamFetch, generationContext, sanitizeGenerationMetadata, model, apiKey) {
    let capturedBody = null;
    upstreamFetch = async (_m, _u, init) => {
      capturedBody = JSON.parse(init.body);
      return new Response(JSON.stringify({ id: 'x' }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    ${sliceBetween(serverSource, 'const imageAllowMature =', 'const orchResp = await upstreamFetch(')}
    await upstreamFetch({}, civitaiWorkflowUrl, { method: 'POST', body: JSON.stringify(actualWorkflowBody) });
    return { capturedBody };
  }`);

  const run = (builtImage: any, body: any) => fn(
    builtImage,
    { body, path: '/api/civitai/generate' },
    { prompt: 'a red fox' },
    async () => new Response('{}'),
    { getStore: () => undefined },
    (x: any) => x,
    'model',
    'key',
  );

  it('omits allowMatureContent when neither custom_parameters nor the body sets it', async () => {
    const { capturedBody } = await run({ customParameters: {} }, {});
    expect(capturedBody).not.toHaveProperty('allowMatureContent');
    expect(capturedBody.steps[0].input).not.toHaveProperty('allowMatureContent');
  });

  it('preserves explicit true and explicit false', async () => {
    expect((await run({ customParameters: { allowMatureContent: true } }, {})).capturedBody.allowMatureContent).toBe(true);
    expect((await run({ customParameters: { allowMatureContent: false } }, {})).capturedBody.allowMatureContent).toBe(false);
    expect((await run({ customParameters: {} }, { allowMatureContent: false })).capturedBody.allowMatureContent).toBe(false);
  });
});

describe('Civitai video workflow body', () => {
  const fn = compile(`async function __exec(req, videoInput, upstreamFetch, generationContext, sanitizeGenerationMetadata, CIVITAI_VIDEO_SUBMIT_WAIT_SECONDS, CIVITAI_VIDEO_OPENAPI_URL, videoSchemaStatus, videoSchemaCustomFieldsUnvalidated, videoSchemaFields, videoSchemaSelected, videoOverrides, videoSchemaFetch, model, apiKey) {
    let capturedBody = null;
    upstreamFetch = async (_m, _u, init) => {
      capturedBody = JSON.parse(init.body);
      return new Response(JSON.stringify({ id: 'x' }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    ${sliceBetween(serverSource, 'const videoAllowMature =', 'let orchResp: Response;')}
    return { capturedBody: videoRequestMetadata.actualRequest };
  }`);

  const run = (body: any) => fn(
    { body, path: '/api/civitai/generate' },
    { prompt: 'a red fox' },
    async () => new Response('{}'),
    { getStore: () => ({ traces: [] }) },
    (x: any) => x,
    120,
    'https://orchestration.civitai.com/openapi.json',
    'official-openapi',
    false,
    undefined,
    undefined,
    [],
    undefined,
    'model',
    'key',
  );

  it('omits allowMatureContent when neither source sets it', async () => {
    const { capturedBody } = await run({});
    expect(capturedBody).not.toHaveProperty('allowMatureContent');
    expect(capturedBody.steps[0].input).not.toHaveProperty('allowMatureContent');
  });

  it('preserves explicit true and explicit false from custom_parameters and from the body', async () => {
    expect((await run({ custom_parameters: { allowMatureContent: true } })).capturedBody.allowMatureContent).toBe(true);
    expect((await run({ custom_parameters: { allowMatureContent: false } })).capturedBody.allowMatureContent).toBe(false);
    expect((await run({ allowMatureContent: false })).capturedBody.allowMatureContent).toBe(false);
    expect((await run({ allowMatureContent: true })).capturedBody.allowMatureContent).toBe(true);
  });
});
