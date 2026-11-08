import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./executionTrace', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./executionTrace')>();
  return { ...actual, tracedFetch: (input: any, init?: any) => globalThis.fetch(input, init) };
});

import {
  cloudProjectRequest,
  fetchCloudServerSettings,
  fetchHuggingFaceModelInfo,
  fetchLiveModels,
  fetchReplicateModelInfo,
  fetchTensorArtModelInfo,
  generateWithFal,
  generateWithGemini,
  generateWithHuggingFace,
  generateWithModelScope,
  generateWithNanoGPT,
  generateVideo,
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
  ['generateWithModelScope', () => generateWithModelScope({ prompt: 'a lighthouse at dusk, oil painting' })],
  ['generateWithNanoGPT', () => generateWithNanoGPT({ prompt: 'a lighthouse at dusk, oil painting' } as any)],
  ['generateVideo', () => generateVideo({ prompt: 'waves rolling on a beach' } as any)],
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
