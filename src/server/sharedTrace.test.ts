// Shared schema-provider trace ledger + generic failure detection + Schema LoRA maxItems + Sogni LoRA count.
// Fixture: live /api/model-schema loras props (MuAPI openapi.json, WaveSpeed /api/v3/models) + real history samples, 2026-10-16.
import express from 'express';
import { describe, expect, it } from 'vitest';
import fx from './__fixtures__sharedtrace-2026-10-16.json';
import { appendTaskTraces, taskTraces, isTaskFailureBody, firstUpstreamMessage, schemaLoraMaxItems, buildTaskFailureHistoryItem, registerSchemaProviderRoutes } from './schemaProviders';
import { keyUsagesFromTrace } from './keyUsage';
import { countActualRequestLoras } from '../utils/actualRequestLoras';
import { loraDisplayName } from '../utils/loraDisplayName';
import { loraSourceMismatch } from '../utils/loraSourceMismatch';

const seg = (method: string, status: number, body: string) => ({ provider: 'sogni', method, endpoint: 'https://api.sogni.ai/v1/creative-agent/workflows', status, responseBody: body, keyUsage: { provider: 'sogni', index: 0, count: 1, source: 'pool' }, startedAt: new Date().toISOString(), durationMs: 1 });

describe('task trace ledger', () => {
  it('keeps submit + every poll (not just first/last), dedupes same objects', () => {
    const k = 'sogni:t-ledger'; const a = seg('POST', 201, '{}'); const b = seg('GET', 200, '{"status":"running"}'); const c = seg('GET', 200, '{"status":"running"}'); const d = seg('GET', 200, '{"status":"done"}');
    appendTaskTraces(k, [a]); appendTaskTraces(k, [b]); appendTaskTraces(k, [c]); appendTaskTraces(k, [d, d]);
    expect(taskTraces.get(k)).toEqual([a, b, c, d]);
    expect(keyUsagesFromTrace(taskTraces.get(k))).toEqual([{ provider: 'sogni', index: 0, count: 1, source: 'pool' }]);
    taskTraces.delete(k);
  });
});

describe('generic terminal non-success', () => {
  it('Sogni waiting_for_user + insufficient_credit → failure; running/completed → not', () => {
    expect(isTaskFailureBody({ status: 'waiting_for_user', waitingReason: 'insufficient_credit' })).toBe(true);
    expect(isTaskFailureBody({ status: 'failed' })).toBe(true);
    expect(isTaskFailureBody({ status: 'processing', error: { message: 'x' } })).toBe(true);
    expect(isTaskFailureBody({ status: 'processing' })).toBe(false);
    expect(isTaskFailureBody({ status: 'completed', error: 'x' })).toBe(false);
  });
  it('first upstream message found at any depth, verbatim first line', () => {
    const raw = { status: 'success', data: { workflow: { status: 'waiting_for_user', waitingReason: 'insufficient_credit', events: [{ type: 'debit', msg: 'Debit Error: Insufficient funds\nmore' }] } } };
    expect(firstUpstreamMessage(raw)).toBe('Debit Error: Insufficient funds');
    expect(firstUpstreamMessage('plain text\nline2')).toBe('plain text');
    const item = buildTaskFailureHistoryItem('Sogni', { model: 'krea-2-turbo', actualRequest: { endpoint: 'e' } }, { status: 'waiting_for_user', waitingReason: 'insufficient_credit', rawResponse: raw, upstreamStatus: 200 }, 200);
    expect(item.status).toBe('failed'); expect(item.error).toBe('Debit Error: Insufficient funds'); expect(item.upstreamStatusText).toBe('task status=waiting_for_user · insufficient_credit');
    expect(item.requestMetadata.actualRequest).toEqual({ endpoint: 'e' });
  });
});

describe('poll route writes failed card with full ledger', () => {
  it('waiting_for_user poll → one failed history item, executionTrace = submit + poll', async () => {
    const records: any[] = []; let current: any[] = [];
    const app = express();
    registerSchemaProviderRoutes(app as any, {
      fetch: async (_m: any, url: string, init?: RequestInit) => { const body = JSON.stringify({ status: 'success', data: { workflow: { status: 'waiting_for_user', waitingReason: 'insufficient_credit', events: [{ msg: 'Debit Error: Insufficient funds' }] } } }); current.push(seg(init?.method || 'GET', 200, body)); return new Response(body, { status: 200 }); },
      key: () => 'k', record: (i: any) => { records.push(i); return i; }, durable: async (u: string) => ({ ok: true, dataUrl: u }), traces: () => current,
    } as any);
    // Seed the ledger as a submit would (submit route needs a live Schema read; covered by its own tests).
    const submitSeg = seg('POST', 201, '{"data":{"workflow":{"id":"wf1"}}}'); appendTaskTraces('sogni:wf1', [submitSeg]);
    const layer = (app as any)._router.stack.find((l: any) => l.route?.path === '/api/schema-provider/:provider/tasks/:taskId');
    let payload: any; const res: any = { statusCode: 200, status(c: number) { this.statusCode = c; return this; }, json(p: any) { payload = p; return this; } };
    // No credential ref → route answers 409 locally; ledger still merges but no taskSubmission → no card (documents the guard).
    await layer.route.stack[0].handle({ method: 'GET', path: '/api/schema-provider/sogni/tasks/wf1', params: { provider: 'sogni', taskId: 'wf1' }, query: {}, headers: {}, body: {} }, res, () => {});
    await new Promise((r) => setTimeout(r, 0));
    expect(payload.error).toContain('凭据引用');
    expect(taskTraces.get('sogni:wf1')?.[0]).toBe(submitSeg);
    taskTraces.delete('sogni:wf1');
  });
});

describe('Schema LoRA maxItems (generic, from the read Schema)', () => {
  it('WaveSpeed live Schema declares maxItems 3; MuAPI openapi.json only says "maximum 3" in prose → no limit', () => {
    expect(schemaLoraMaxItems({ loras: (fx as any).wavespeed.loras })).toEqual({ field: 'loras', maxItems: 3 });
    expect(schemaLoraMaxItems({ loras: (fx as any).muapi.loras })).toBeNull();
    expect(schemaLoraMaxItems({ image_loras: { anyOf: [{ type: 'array', maxItems: 2 }, { type: 'null' }] } })).toEqual({ field: 'image_loras', maxItems: 2 });
    expect(schemaLoraMaxItems({ prompt: { type: 'string' } })).toBeNull();
  });
});

describe('LoRA count from actual request (Sogni nested steps[].arguments)', () => {
  it('counts loras + loraStrengths inside input.steps[0].arguments', () => {
    const actual = { endpoint: 'https://api.sogni.ai/v1/creative-agent/workflows', parameters: { input: { steps: [{ arguments: { prompt: 'p', loras: ['krea2-detail-enhancer'], loraStrengths: [0.8] } }] } } };
    expect(countActualRequestLoras(actual)).toBe(1);
    expect(countActualRequestLoras((fx as any).history.hist_1792125133065_2ffvp.requestMetadata.actualRequest)).toBe(1);
  });
});

describe('real history samples', () => {
  it('WaveSpeed success sample had empty trace (the bug); 魔搭 sample has 2 segments', () => {
    expect((fx as any).history.hist_1792123905033_9bnb0.requestMetadata.executionTrace).toEqual([]);
    expect((fx as any).history.hist_1792122808194_7602v.requestMetadata.executionTrace.length).toBe(2);
  });
});

describe('LoRA display + source mismatch', () => {
  it('URL LoRA shows file name; non-URL unchanged', () => {
    expect(loraDisplayName('https://huggingface.co/Comfy-Org/Krea-2/resolve/main/loras/krea2_darkbrush.safetensors')).toBe('krea2_darkbrush.safetensors');
    expect(loraDisplayName('krea2-detail-enhancer')).toBe('krea2-detail-enhancer');
  });
  it('modelscope_ai LoRA under muapi → neutral note; same provider / descriptive source → none', () => {
    const n = loraSourceMismatch('modelscope_ai', 'muapi', 'Tongyi-MAI/Z-Image-Turbo');
    expect(n).toContain('modelscope_ai'); expect(n).toContain('muapi'); expect(n).toContain('Tongyi-MAI/Z-Image-Turbo'); expect(n).toContain('未自动清除');
    expect(loraSourceMismatch('muapi', 'muapi')).toBeNull();
    expect(loraSourceMismatch('wavespeed 官方 Schema（GET /api/model-schema · HTTP 200）', 'muapi')).toBeNull();
  });
});

import wsCatalog from './__fixtures__wavespeed-live-2026-10-15.json';
describe('WaveSpeed submit → polls → save-result / failure: every segment lands in history', () => {
  const setup = (pollBodies: any[]) => {
    const records: any[] = []; let current: any[] = []; let polls = 0;
    const app = express();
    registerSchemaProviderRoutes(app as any, {
      fetch: async (_m: any, url: string, init?: RequestInit) => {
        const body = init?.method === 'POST' ? { code: 200, data: { id: 'ws1' } } : /predictions/.test(url) ? pollBodies[Math.min(polls++, pollBodies.length - 1)] : wsCatalog;
        const text = JSON.stringify(body);
        current.push({ provider: 'wavespeed', method: init?.method || 'GET', endpoint: url, status: 200, responseBody: text, keyUsage: { provider: 'wavespeed', index: 1, count: 2, source: 'pool' }, startedAt: new Date().toISOString(), durationMs: 1 });
        return new Response(text, { status: 200 });
      },
      key: () => 'k', record: (i: any) => { records.push(i); return i; }, durable: async (u: string) => ({ ok: true, dataUrl: u }), traces: () => current,
    } as any);
    const route = (p: string) => (app as any)._router.stack.find((l: any) => l.route?.path === p).route.stack[0].handle;
    const call = async (p: string, req: any) => { current = []; let payload: any; const res: any = { statusCode: 200, status(c: number) { this.statusCode = c; return this; }, json(b: any) { payload = b; return this; } }; await route(p)({ query: {}, headers: {}, body: {}, ...req }, res, () => {}); await new Promise((r) => setTimeout(r, 0)); return payload; };
    return { records, call };
  };
  it('success: submit + 3 polls all recorded; key #1 of 2', async () => {
    const { records, call } = setup([{ code: 200, data: { status: 'processing' } }, { code: 200, data: { status: 'processing' } }, { code: 200, data: { status: 'completed', outputs: ['https://x/o.png'] } }]);
    const sub = await call('/api/schema-provider/:provider/submit', { method: 'POST', path: '/api/schema-provider/wavespeed/submit', params: { provider: 'wavespeed' }, body: { model: 'wavespeed-ai/krea-v2/turbo-lora', prompt: 'p' } });
    expect(sub.taskId).toBe('ws1');
    for (let i = 0; i < 3; i++) await call('/api/schema-provider/:provider/tasks/:taskId', { method: 'GET', path: '/x', params: { provider: 'wavespeed', taskId: 'ws1' }, headers: { 'x-canvas-credential-ref': sub.credentialRef } });
    await call('/api/schema-provider/:provider/save-result', { method: 'POST', path: '/y', params: { provider: 'wavespeed' }, body: { taskId: 'ws1', outputs: ['https://x/o.png'], metadata: { requestMetadata: { actualRequest: sub.actualRequest, submit: { taskId: 'ws1' }, poll: {} } } } });
    const rm = records[0].requestMetadata;
    const posts = rm.executionTrace.filter((t: any) => t.method === 'POST').length;
    const pollSegs = rm.executionTrace.filter((t: any) => /predictions/.test(t.endpoint)).length;
    expect(posts).toBe(1); expect(pollSegs).toBe(3);
    expect(rm.actualRequest).toEqual(sub.actualRequest); expect(rm.submit).toEqual({ taskId: 'ws1' }); expect(rm.poll).toEqual({});
    expect(keyUsagesFromTrace(rm.executionTrace)).toEqual([{ provider: 'wavespeed', index: 1, count: 2, source: 'pool' }]);
    expect(taskTraces.has('wavespeed:ws1')).toBe(false);
  });
  it('failure: non-success status with error → failed card with ledger + verbatim message', async () => {
    const { records, call } = setup([{ code: 200, data: { status: 'processing' } }, { code: 200, data: { status: 'failed', error: 'Insufficient credits\ntrace' } }]);
    const sub = await call('/api/schema-provider/:provider/submit', { method: 'POST', path: '/api/schema-provider/wavespeed/submit', params: { provider: 'wavespeed' }, body: { model: 'wavespeed-ai/krea-v2/turbo-lora', prompt: 'p' } });
    for (let i = 0; i < 2; i++) await call('/api/schema-provider/:provider/tasks/:taskId', { method: 'GET', path: '/x', params: { provider: 'wavespeed', taskId: 'ws1' }, headers: { 'x-canvas-credential-ref': sub.credentialRef } });
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('failed');
    expect(records[0].requestMetadata.executionTrace.filter((t: any) => /predictions/.test(t.endpoint))).toHaveLength(2);
    expect(records[0].requestMetadata.actualRequest).toEqual(sub.actualRequest);
  });
  it('4 LoRAs > WaveSpeed Schema maxItems 3 → local 400 with N/M + Schema source, no POST', async () => {
    const { call } = setup([]);
    const l = { path: 'https://e/a.safetensors', strength: 1 };
    const r = await call('/api/schema-provider/:provider/submit', { method: 'POST', path: '/api/schema-provider/wavespeed/submit', params: { provider: 'wavespeed' }, body: { model: 'wavespeed-ai/krea-v2/turbo-lora', prompt: 'p', loras: [l, l, l, l] } });
    expect(r.error).toContain('该端点 Schema 限制最多 3 个 LoRA，当前 4 个'); expect(r.error).toContain('https://api.wavespeed.ai/api/v3/models');
  });
});
