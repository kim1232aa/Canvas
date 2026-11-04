// 2026-10-15 画布 FE round clean-0611 (/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-clean-0611) → items 1, 2, 3, 5, 7 (+4, 6, 9, 10 helpers).
import express from 'express';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerSchemaProviderRoutes } from '../server/schemaProviders';
import { parseCustomObject } from '../server/customParameters';
import { splitActualRequest } from './actualRequestDisplay';
import { historySeedStatement, seedStatement, sentSeedFromActualRequest, requestedNotSentLoras, generationPostNotSent } from './historyParameters';
import { HistoryModal } from '../components/HistoryModal';
import { tracedFetch, getExecutions, loadStored } from '../services/executionTrace';
import { sharedGetJson, clearSharedGet } from '../services/sharedGet';
import { buttonSummary, errorScopeTag, isPollingRecord, noGenerationText, requestLineParts, rowSecondLine } from '../components/ExecutionLog';
import { LOCAL_BLOCK_TOAST_TITLE, localBlockToastReason } from './apiFailure';
import { resetRunState } from './workspaceCache';

// Subset of the live Venice swagger GenerateImageRequest (same shape as schemaAspectFormat.test.ts).
const VENICE_SPEC = { openapi: '3.0.0', paths: { '/image/generate': { post: { requestBody: { content: { 'application/json': { schema: { type: 'object', properties: {
  model: { type: 'string' }, prompt: { type: 'string' }, negative_prompt: { type: 'string' }, width: { type: 'integer', maximum: 1280 }, height: { type: 'integer', maximum: 1280 },
  steps: { type: 'integer' }, cfg_scale: { type: 'number' }, seed: { type: 'integer' }, aspect_ratio: { type: 'string' }, resolution: { type: 'string' },
  format: { type: 'string', enum: ['jpeg', 'png', 'webp'] }, lora_strength: { type: 'integer' },
} } } } } } } } };

async function veniceSubmit(body: any) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const app = express();
  registerSchemaProviderRoutes(app as any, {
    fetch: async (_m: any, url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes('/models')) return new Response(JSON.stringify({ data: [{ id: 'venice-sd35', type: 'image', model_spec: { name: 'SD35', constraints: { widthHeightDivisor: 16, steps: { default: 25, max: 30 } } } }] }), { status: 200 });
      if (url.includes('swagger')) return new Response(JSON.stringify(VENICE_SPEC), { status: 200 });
      return new Response('{"error":"Insufficient USD or Diem balance"}', { status: 402 });
    },
    key: () => 'k', record: (i: any) => i, durable: async (u: string) => ({ ok: true, dataUrl: u }),
  } as any);
  const layer = (app as any)._router.stack.find((l: any) => l.route?.path === '/api/schema-provider/:provider/submit');
  let status = 200; let payload: any;
  const res: any = { status(c: number) { status = c; return this; }, json(p: any) { payload = p; return this; } };
  await layer.route.stack[0].handle({ method: 'POST', path: '/api/schema-provider/venice/submit', params: { provider: 'venice' }, query: {}, headers: {}, body }, res, () => {});
  return { status, payload, posts: calls.filter((c) => c.init?.method === 'POST') };
}
// Exactly the canvas body of shot 29 (WaveSpeed leftovers + canvas-internal LoRA fields).
const SHOT29 = { model: 'venice-sd35', prompt: 'a red fox in snow', negative_prompt: 'blurry', width: 1024, height: 1024, steps: 20, cfg: 7.5, seed: 42, denoise: 1, sampler_name: 'euler_ancestral', resolution: '1k',
  loras: [{ name: 'https://huggingface.co/Comfy-Org/Krea-2/resolve/main/loras/krea2_darkbrush.safetensors', path: 'https://huggingface.co/Comfy-Org/Krea-2/resolve/main/loras/krea2_darkbrush.safetensors', strength: 0.75, modelStrength: 0.75, clipStrength: 0.75, civitaiId: '', triggers: '' }],
  custom_parameters: { format: 'png', _canvas: { scope: { provider: 'venice', model: 'venice-sd35' }, schemaProperties: ['prompt'] } } };

afterEach(() => { vi.unstubAllGlobals(); clearSharedGet(); });

describe('2 「实际发送」 shows only what went upstream', () => {
  it('schemaFields / mapping / flags move to a separate not-sent section, values untouched', () => {
    const actual = { endpoint: 'e', parameters: { seed: 42, format: 'png' }, mapping: [{ from: 'seed' }], parametersOnly: false, schemaFieldsOnly: true, schemaFields: ['seed', 'format'] };
    const { sent, meta } = splitActualRequest(actual);
    expect(sent).toEqual({ endpoint: 'e', parameters: { seed: 42, format: 'png' } });
    expect(meta).toEqual({ mapping: [{ from: 'seed' }], parametersOnly: false, schemaFieldsOnly: true, schemaFields: ['seed', 'format'] });
    expect(splitActualRequest({ foo: 1 })).toEqual({ sent: { foo: 1 }, meta: null });
  });
});

describe('3 one Schema GET per (provider, model, key) while in flight', () => {
  it('badge/editor sharedGetJson + driver Schema GET (credential headers only) → one network call, one log row', async () => {
    let resolve!: (r: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((r) => { resolve = r; }));
    vi.stubGlobal('fetch', fetchMock);
    const url = '/api/model-schema?provider=together&model=black-forest-labs%2FFLUX.1-schnell';
    const before = getExecutions().filter((r) => r.route === url).length;
    const a = sharedGetJson(url, { 'x-together-key': 'k' });
    const b = tracedFetch(url, { method: 'GET', headers: { 'x-together-key': 'k' } });
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolve(new Response('{"error":{"message":"Unauthorized"}}', { status: 401 }));
    const settled = await Promise.allSettled([a, b]);
    expect(settled.every((s) => s.status === 'rejected')).toBe(true);
    expect(getExecutions().filter((r) => r.route === url).length - before).toBe(1);
  });
  it('the leading row tag is a label (最新失败 / 较早失败), never a retry marker', () => {
    const r: any = { id: 1, state: 'error', method: 'GET', route: '/api/models?x', status: 401, response: {} };
    expect(errorScopeTag(r, 1)).toBe('最新失败');
    expect(errorScopeTag(r, 2)).toBe('较早失败');
  });
});

describe('5 seed: toast and history card say the same thing from the same source', () => {
  const actualRequest = { endpoint: 'https://api.wavespeed.ai/api/v3/wavespeed-ai/krea-v2/turbo-lora', parameters: { prompt: 'p', seed: 42 } };
  it('sent 42, upstream returned none → identical sentence on both surfaces', () => {
    const toast = seedStatement(sentSeedFromActualRequest(actualRequest), null);
    const item: any = { id: 'h', url: '/media/x.png', requestMetadata: { actualRequest } };
    expect(toast).toBe('种子 42（实际发送）。上游未返回种子');
    expect(historySeedStatement(item)).toBe(toast);
  });
  it('returned value is labelled 上游返回 and never confused with the sent value', () => {
    expect(seedStatement(42, 42)).toBe('种子 42（上游返回，与实际发送一致）');
    expect(seedStatement(42, 7)).toBe('种子 7（上游返回；实际发送 42）');
    expect(seedStatement(undefined, undefined)).toBe('种子：未发送，上游也未返回');
  });
});

describe('7 _canvas metadata passes the guard and is stripped before sending', () => {
  it('guard accepts root _canvas.scope.provider; still refuses a real routing key', () => {
    expect(() => parseCustomObject({ format: 'png', _canvas: { scope: { provider: 'venice', model: 'm' } } })).not.toThrow();
    expect(() => parseCustomObject({ provider: 'x' })).toThrow(/路由\/凭据/);
  });
});

describe('4 / 6 / 9 / 10 helpers', () => {
  it('4 rows restored after reload are previousPage + acknowledged; node run state is reset', () => {
    const store: Record<string, string> = { 'canvas.executionRecords.v1': JSON.stringify([{ id: 1, state: 'error', method: 'GET', route: '/api/model-schema?provider=together', status: 401, response: {} }]) };
    vi.stubGlobal('sessionStorage', { getItem: (k: string) => store[k] ?? null, setItem: () => {} });
    const [r] = loadStored();
    expect(r).toMatchObject({ previousPage: true, acknowledged: true });
    expect(buttonSummary([r])).not.toMatch(/401/);
    const p: any = resetRunState({ id: 'p', name: 'n', connections: [], spatialFrames: [{ id: 'f', status: 'error', errorMessage: 'x' }], nodes: [{ id: 'n', state: 'error', errorMessage: 'HTTP 401', upstreamFailed: true, outputData: 'keep' }] } as any);
    expect(p.nodes[0]).toEqual({ id: 'n', state: 'idle', outputData: 'keep', restoredFromPreviousSession: { at: null } } /* clean-0935 item 4: kept + labelled */);
    expect(p.spatialFrames[0]).toEqual({ id: 'f', status: 'idle' });
    expect(noGenerationText(1)).toContain('目录 / Schema 请求有 1 条失败');
  });
  it('4 a fresh catalog GET failure in this session reads as non-generation on the bar', () => {
    const r: any = { id: 2, state: 'error', method: 'GET', route: '/api/model-schema?provider=together&model=m', status: 401, response: { error: 'Unauthorized' } };
    expect(buttonSummary([r]).startsWith('目录 / Schema 请求失败（非生成请求）')).toBe(true);
  });
  it('9 local-block toast first line + reason verbatim; bar starts with 没有发出去', () => {
    expect(LOCAL_BLOCK_TOAST_TITLE).toBe('没有发出去');
    const raw = JSON.stringify({ error: '没有发出去\nVenice 官方原文：「x」\n来源：https://docs.venice.ai', errorSource: 'local' });
    expect(localBlockToastReason(raw)).toBe('Venice 官方原文：「x」\n来源：https://docs.venice.ai');
    const rec: any = { id: 3, state: 'error', method: 'POST', route: '/api/schema-provider/venice/submit', status: 400, runLabel: '第 3 次运行', response: { error: '没有发出去\nVenice 官方原文：「x」', errorSource: 'local', executionTrace: [] } };
    expect(buttonSummary([rec]).startsWith('没有发出去 · 第 3 次运行')).toBe(true);
  });
  it('10 status words kept together; successful GET has no repeated second line; polls are light', () => {
    const r: any = { id: 4, state: 'error', method: 'GET', route: '/api/models?provider=together', status: 401, response: {} };
    expect(requestLineParts(r)).toEqual({ head: 'GET /api/models?provider=together', status: 'HTTP 401 · 失败' });
    expect(rowSecondLine({ id: 5, state: 'complete', method: 'GET', route: '/api/model-schema?provider=venice&model=v', status: 200, response: {} } as any)).toBeNull();
    expect(isPollingRecord({ method: 'GET', route: '/api/schema-provider/wavespeed/tasks/abc' })).toBe(true);
    expect(isPollingRecord({ method: 'POST', route: '/api/schema-provider/wavespeed/submit' })).toBe(false);
  });
});
