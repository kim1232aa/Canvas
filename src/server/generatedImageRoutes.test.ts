import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { applyCustomParameters } from './customParameters';
import { buildNanoImagePayload } from '../schemas/nanoImageApi';
import { persistGeneratedImages, normalizeGeneratedImages } from './multiImageHistory';
import { extractCompatImageUrl, normalizeOpenAICompatBaseUrl, normalizeGrokCompatBaseUrl, resolveAgainstBaseOrigin } from '../engines/compatRelay';

const source = readFileSync(new URL('../../server.ts', import.meta.url), 'utf8');
const isProvided = (value: unknown) => value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && !value.length);

async function invoke(provider: string, body: Record<string, unknown>, failedUrl?: string) {
  const marker = provider === 'nanogpt' ? "app.post(['/api/nanogpt/generate'" : `app.post(['/api/engine/${provider}/generate'`;
  const start = source.indexOf(marker);
  const end = source.indexOf('\napp.post(', start + marker.length);
  const routes = new Map<string, Function>();
  const sent: any[] = [];
  const records: any[] = [];
  const scope: Record<string, unknown> = {
    app: { post: (paths: string[], callback: Function) => paths.forEach(path => routes.set(path, callback)) },
    resolveProviderAuth: () => ({ apiKey: 'fixture-key', baseUrl: 'https://example.test/v1' }),
    rejectUnsupported: () => false,
    rejectSchemaEnum: () => false,
    rejectSchemaModel: () => false,
    isProvided,
    applyCustomParameters,
    sanitizeGenerationMetadata: (value: unknown) => value,
    extractCompatImageUrl,
    normalizeOpenAICompatBaseUrl,
    normalizeGrokCompatBaseUrl,
    normalizeGeneratedImages,
    resolveAgainstBaseOrigin,
    buildNanoImagePayload,
    keyPoolManager: { recordResult: () => {}, getNextKey: () => 'fixture-key' },
    upstreamFetch: async (_meta: unknown, url: string, options: any) => {
      if (url.endsWith('/endpoints')) return { ok: true, json: async () => ({ id: body.model, endpoints: [{}] }) };
      sent.push({ url, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ data: [{ url: 'https://example.test/first' }, { url: 'https://example.test/second' }] }) };
    },
    respondWithGeneratedImages: async (res: any, images: unknown[], metadata: any, options: any) => {
      const result = await persistGeneratedImages(images, metadata, {
        persist: async (url: string) => url === failedUrl
          ? { ok: false as const, message: 'disk full', errorSource: 'local' as const }
          : { ok: true as const, dataUrl: '/api/media/' + url.split('/').pop() },
        record: (item: any) => { const record = { ...item, id: String(records.length) }; records.push(record); return record; },
      });
      return res.json({ ...options.response, historyItems: result.historyItems, transientOutputs: result.transientOutputs, historyWarning: result.historyWarning });
    },
  };
  const code = (await transform(source.slice(start, end), { loader: 'ts', format: 'cjs' })).code;
  new Function(...Object.keys(scope), code)(...Object.values(scope));
  let response: any;
  const res: any = { status: () => res, json: (value: unknown) => { response = value; return res; } };
  await routes.get(`/api/engine/${provider}/generate`)?.({ body, path: `/api/engine/${provider}/generate`, headers: {} }, res);
  if (!sent.length) throw new Error(JSON.stringify(response));
  return { response, records, sent };
}

describe('real compatible image route execution with fixture upstream', () => {
  for (const provider of ['agnes', 'openai_compat', 'grok_compat', 'nanogpt']) {
    it(`${provider} sends explicit JSON model and records every durable output`, async () => {
      const result = await invoke(provider, { model: 'canvas-model', prompt: 'original', size: '1024x1536', custom_parameters: { model: 'json-model', prompt: 'custom', n: 2 } });
      expect(result.sent[0].body).toMatchObject({ model: 'json-model', prompt: 'custom', n: 2 });
      expect(result.records).toHaveLength(2);
      expect(result.records.every(item => item.model === 'json-model')).toBe(true);
      expect(result.response.historyItems).toHaveLength(2);
    });
    it(`${provider} preserves second image if first storage attempt fails`, async () => {
      const result = await invoke(provider, { model: 'canvas-model', prompt: 'original', size: '1024x1536' }, 'https://example.test/first');
      expect(result.records).toHaveLength(1);
      expect(result.records[0].url).toBe('/api/media/second');
      expect(result.response.transientOutputs).toHaveLength(1);
      expect(result.response.historyWarning).toBeTruthy();
    });
  }
});
