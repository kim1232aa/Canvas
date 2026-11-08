import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./executionTrace', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./executionTrace')>();
  return { ...actual, tracedFetch: (input: any, init?: any) => globalThis.fetch(input, init) };
});

import {
  EMPTY_KEYS,
  fetchCloudServerHealth,
  testSingleKey,
  updateKeyPoolStrategy,
  updateKeyPoolStrategyDetailed,
  cloudProjectRequest,
  fetchCloudServerSettings,
  fetchHuggingFaceModelInfo,
  fetchLiveModels,
  fetchReplicateModelInfo,
  fetchTensorArtModelInfo,
  generateWithFal,
  generateWithGemini,
  generateWithHuggingFace,
  generateWithNanoGPT,
  refinePromptWithGemini,
  saveCloudServerSettings,
  searchCivitaiModels,
} from './api';
import { AgnesDriver } from '../engines/drivers/AgnesDriver';
import { SenseNovaDriver } from '../engines/drivers/SenseNovaDriver';
import { CivitaiDriver } from '../engines/drivers/CivitaiDriver';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, String(v)),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
});

const original = globalThis.fetch;
const HTML_502 = '<html><head><title>502 Bad Gateway</title></head><body><center>nginx/1.25.3 upstream timed out</center></body></html>';
const respond = (status: number, body: string, contentType = 'text/html') =>
  vi.fn(async () => new Response(body, { status, statusText: status === 502 ? 'Bad Gateway' : '', headers: { 'content-type': contentType } }));

beforeEach(() => {
  store.clear();
  store.set('comfycanvas_api_keys', JSON.stringify({ geminiKey: 'g' }));
});
afterEach(() => {
  globalThis.fetch = original;
});

const callSites: Array<[string, () => Promise<unknown>]> = [
  ['searchCivitaiModels', () => searchCivitaiModels('x')],
  ['generateWithFal', () => generateWithFal({ prompt: 'a lighthouse at dusk, oil painting' })],
  ['generateWithHuggingFace', () => generateWithHuggingFace({ prompt: 'a lighthouse at dusk, oil painting' } as any)],
  ['generateWithNanoGPT', () => generateWithNanoGPT({ prompt: 'a lighthouse at dusk, oil painting' } as any)],
  ['generateWithGemini', () => generateWithGemini({ prompt: 'a lighthouse at dusk, oil painting' })],
  ['refinePromptWithGemini', () => refinePromptWithGemini('a lighthouse', { provider: 'gemini', model: 'gemini-2.5-flash' })],
  ['fetchLiveModels', () => fetchLiveModels('civitai')],
  ['fetchHuggingFaceModelInfo', () => fetchHuggingFaceModelInfo('org/model')],
  ['fetchTensorArtModelInfo', () => fetchTensorArtModelInfo('123')],
  ['fetchReplicateModelInfo', () => fetchReplicateModelInfo('owner/name')],
  ['cloudProjectRequest', () => cloudProjectRequest('/api/cloud/projects')],
];

describe('services/api error paths keep real HTTP status and verbatim upstream body', () => {
  it.each(callSites)('%s: non-JSON 502 HTML body → message has 502 and the HTML text', async (_name, call) => {
    globalThis.fetch = respond(502, HTML_502) as any;
    const err: Error = await call().then(() => { throw new Error('expected rejection'); }, (e) => e);
    expect(err.message).toContain('502');
    expect(err.message).toContain(HTML_502);
  });

  it.each(callSites)('%s: JSON error body still surfaces upstream details/error', async (_name, call) => {
    globalThis.fetch = respond(429, JSON.stringify({ error: 'rate limited', details: 'quota exceeded for key ending 1234' }), 'application/json') as any;
    const err: Error = await call().then(() => { throw new Error('expected rejection'); }, (e) => e);
    expect(err.message).toContain('429');
    expect(err.message).toMatch(/quota exceeded for key ending 1234|rate limited/);
  });

  it('empty error body is reported as empty, with the status', async () => {
    globalThis.fetch = respond(504, '') as any;
    const err: Error = await generateWithFal({ prompt: 'a lighthouse at dusk' }).then(() => { throw new Error('x'); }, (e) => e);
    expect(err.message).toContain('504');
  });

  it('fetchCloudServerSettings / saveCloudServerSettings return the real status and raw body in error', async () => {
    globalThis.fetch = respond(502, HTML_502) as any;
    for (const r of [await fetchCloudServerSettings('t'), await saveCloudServerSettings({ a: 1 }, 't')]) {
      expect(r.ok).toBe(false);
      expect(r.status).toBe(502);
      expect(r.error).toContain('502');
      expect(r.error).toContain(HTML_502);
    }
  });
});

describe('engine drivers keep real HTTP status and verbatim upstream body', () => {
  const agnesImage = () => new AgnesDriver().generate({ model: 'agnes-image-2.1-flash', prompt: 'terrarium library, soft light' } as any, {});
  const agnesChat = () => new AgnesDriver().chat({ model: 'agnes-chat', messages: [{ role: 'user', content: 'hello there' }] } as any, {});
  const senseChat = () => new SenseNovaDriver().chat({ model: 'sensenova-chat', messages: [{ role: 'user', content: 'hello there' }] } as any, {});
  const civitai = () => new CivitaiDriver().generate({ prompt: 'a lighthouse at dusk, oil painting', model: 'urn:air:sdxl:checkpoint:civitai:123@456' } as any, {});
  const sites: Array<[string, () => Promise<unknown>]> = [
    ['Agnes generate', agnesImage],
    ['Agnes chat', agnesChat],
    ['SenseNova chat', senseChat],
    ['Civitai generate', civitai],
  ];

  it.each(sites)('%s: non-JSON 502 HTML body → message has 502 and the HTML text', async (_n, call) => {
    globalThis.fetch = respond(502, HTML_502) as any;
    const err: Error = await call().then(() => { throw new Error('expected rejection'); }, (e) => e);
    expect(err.message).toContain('502');
    expect(err.message).toContain(HTML_502);
  });

  it.each(sites)('%s: JSON error body surfaces upstream error', async (_n, call) => {
    globalThis.fetch = respond(401, JSON.stringify({ error: 'invalid api key sk-***9' }), 'application/json') as any;
    const err: Error = await call().then(() => { throw new Error('expected rejection'); }, (e) => e);
    expect(err.message).toContain('401');
    expect(err.message).toContain('invalid api key sk-***9');
  });

  it('Civitai: 200 with a non-JSON body keeps the full text (no 150 char slice)', async () => {
    const long = `<html>${'x'.repeat(600)}END-OF-BODY</html>`;
    globalThis.fetch = respond(200, long) as any;
    const err: Error = await civitai().then(() => { throw new Error('x'); }, (e) => e);
    expect(err.message).toContain('END-OF-BODY');
  });
});

describe('EMPTY_KEYS', () => {
  it('has an empty-string slot for every key and base-URL field the app reads from ApiKeysState', () => {
    for (const k of ['runwareKey', 'runwareBaseUrl', 'modelslabKey', 'modelslabBaseUrl', 'replicateKey', 'mageKey', 'sogniKey', 'deepinfraKey']) {
      expect(EMPTY_KEYS).toHaveProperty(k, '');
    }
  });
  it('getStoredApiKeys on empty storage returns the new slots as empty strings', async () => {
    const { getStoredApiKeys } = await import('./api');
    store.clear();
    const keys = getStoredApiKeys();
    expect(keys.runwareKey).toBe('');
    expect(keys.modelslabBaseUrl).toBe('');
  });
});

describe('api.ts keeps real HTTP status and body for cloud admin reads', () => {
  it('fetchCloudServerHealth reports the upstream status and body instead of posing as a healthy local server', async () => {
    globalThis.fetch = respond(503, '<html>cloud gateway down</html>') as any;
    const health = await fetchCloudServerHealth();
    expect(health.ok).toBe(false);
    expect(health.status).toBe('offline');
    expect(health.httpStatus).toBe(503);
    expect(health.error).toContain('503');
    expect(health.error).toContain('<html>cloud gateway down</html>');
    expect(health.serverType).not.toBe('Local Mode');
  });

  it('fetchCloudServerHealth passes a real payload through with ok/httpStatus', async () => {
    globalThis.fetch = respond(200, JSON.stringify({ status: 'online', serverType: 'Cloud', uptimeSeconds: 5, projectsCount: 2, historyCount: 9, hasGeminiKey: true }), 'application/json') as any;
    const health = await fetchCloudServerHealth();
    expect(health).toMatchObject({ ok: true, httpStatus: 200, status: 'online', serverType: 'Cloud', projectsCount: 2 });
  });

  it('updateKeyPoolStrategyDetailed keeps 401 status and body; the boolean wrapper reports the same failure', async () => {
    globalThis.fetch = respond(401, JSON.stringify({ error: 'admin token expired' }), 'application/json') as any;
    const detailed = await updateKeyPoolStrategyDetailed('fal', 'round_robin');
    expect(detailed.ok).toBe(false);
    expect(detailed.httpStatus).toBe(401);
    expect(detailed.error).toContain('401');
    expect(detailed.error).toContain('admin token expired');
    expect(await updateKeyPoolStrategy('fal', 'round_robin')).toBe(false);
  });

  it('testSingleKey keeps 403 status and body verbatim', async () => {
    globalThis.fetch = respond(403, 'forbidden: key pool locked', 'text/plain') as any;
    const res = await testSingleKey('fal', 'sk-test');
    expect(res.httpStatus).toBe(403);
    expect(res.status).toBe('invalid');
    expect(res.message).toContain('403');
    expect(res.message).toContain('forbidden: key pool locked');
  });
});
