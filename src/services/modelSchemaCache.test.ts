import { describe, expect, it, vi } from 'vitest';
vi.mock('./api', () => ({ getStoredApiKeys: () => ({}) }));
import { ensureModelSchema, getModelSchemaEntry, withCachedSchemaProperties } from './modelSchemaCache';
import { schemaSendStatus } from '../utils/schemaSendStatus';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('modelSchemaCache → badges (generic, Krea + AIMLAPI)', () => {
  it('loads the official Schema once and badges follow it', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ inputSchema: { properties: { prompt: {}, num_inference_steps: {}, seed: {}, image_size: {}, loras: {} } } }), { status: 200 }));
    ensureModelSchema('aimlapi', 'alibaba/z-image-turbo-lora', f as any);
    ensureModelSchema('aimlapi', 'alibaba/z-image-turbo-lora', f as any);
    await flush(); await flush();
    expect(f).toHaveBeenCalledTimes(1);
    expect(getModelSchemaEntry('aimlapi', 'alibaba/z-image-turbo-lora')?.status).toBe('ready');
    const cp = withCachedSchemaProperties('aimlapi', 'alibaba/z-image-turbo-lora', '{}');
    expect(schemaSendStatus('aimlapi', 'steps', 8, cp)).toBe('will_send');
    expect(schemaSendStatus('aimlapi', 'cfg', 3.5, cp)).toBe('not_sent');
    expect(schemaSendStatus('aimlapi', 'negative_prompt', 'x', cp)).toBe('not_sent');
    expect(schemaSendStatus('aimlapi', 'width', 1024, cp)).toBe('will_send');
    expect(schemaSendStatus('aimlapi', 'seed', 42, cp)).toBe('will_send');
  });
  it('Krea flux-1-dev: steps/guidance_scale/seed declared → 会发送', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ inputSchema: { properties: { prompt: {}, steps: {}, guidance_scale: {}, seed: {}, width: {}, height: {} } } }), { status: 200 }));
    ensureModelSchema('krea', 'bfl/flux-1-dev', f as any);
    await flush(); await flush();
    const cp = withCachedSchemaProperties('krea', 'bfl/flux-1-dev', undefined);
    for (const [k, v] of [['steps', 28], ['cfg', 3.5], ['seed', 1], ['width', 1024]] as const) expect(schemaSendStatus('krea', k, v, cp)).toBe('will_send');
  });
  it('schema fetch failure → → 「Schema 不可用，字段不会发送」 (clean-0903 6d), error kept, never 会发送', async () => {
    const f = vi.fn(async () => new Response('{"error":"nope"}', { status: 502 }));
    ensureModelSchema('krea', 'missing', f as any);
    await flush(); await flush();
    expect(getModelSchemaEntry('krea', 'missing')).toMatchObject({ status: 'error' });
    expect(schemaSendStatus('krea', 'steps', 28, withCachedSchemaProperties('krea', 'missing', '{}'))).toBe('schema_unavailable');
  });
});

  it('Krea: ready cache overrides stale incomplete schemaProperties → steps/cfg/seed/styles 会发送', async () => {
    const props = { prompt: {}, steps: {}, guidance_scale: {}, seed: {}, styles: {}, width: {}, height: {}, strength: {} };
    const f = vi.fn(async () => new Response(JSON.stringify({ inputSchema: { properties: props } }), { status: 200 }));
    ensureModelSchema('krea', 'image/bfl/flux-1-dev', f as any);
    await flush(); await flush();
    const stale = JSON.stringify({ _canvas: { scope: { provider: 'krea', model: 'image/bfl/flux-1-dev' }, schemaProperties: ['prompt'] } });
    const cp = withCachedSchemaProperties('krea', 'image/bfl/flux-1-dev', stale);
    expect(JSON.parse(cp!)._canvas.schemaProperties).toEqual(expect.arrayContaining(['steps', 'guidance_scale', 'seed', 'styles']));
    expect(schemaSendStatus('krea', 'steps', 25, cp)).toBe('will_send');
    expect(schemaSendStatus('krea', 'cfg', 3, cp)).toBe('will_send');
    expect(schemaSendStatus('krea', 'seed', 42, cp)).toBe('will_send');
    expect(schemaSendStatus('krea', 'loras', [{ id: 'x', strength: 0.8 }], cp)).toBe('will_send');
  });
