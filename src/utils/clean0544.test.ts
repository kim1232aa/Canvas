import { describe, it, expect } from 'vitest';
import { countActualRequestLoras, findActualRequest } from './actualRequestLoras';
import { applyCustomParameters, parseCustomObject } from '../server/customParameters';
import { rescopeCustomParameters } from './customParameterScope';
import { middleEllipsis } from './middleEllipsis';
import { requestLine, buttonSummary } from '../components/ExecutionLog';
import { buildPrefetchFailureHistoryItem } from '../server/failedAttemptHistory';
import { beginRun, getExecutions } from '../services/executionTrace';

describe('clean-0544', () => {
  it('1 toast LoRA count comes from actualRequest, any LoRA field', () => {
    const resp = { requestMetadata: { submit: { actualRequest: { parameters: { loras: [{ path: 'a.safetensors' }] } } } } };
    expect(countActualRequestLoras(findActualRequest(resp))).toBe(1);
    expect(countActualRequestLoras({ parameters: { image_loras: [{ path: 'x' }, { path: 'y' }] } })).toBe(2);
    expect(countActualRequestLoras({ parameters: { prompt: 'p' }, mapping: [{ loras: [1] }] })).toBe(0);
  });
  it('3 _canvas scope metadata passes the guard and is never sent', () => {
    const custom = { seed: 1, _canvas: { scope: { provider: 'together', model: 'm' }, schemaProperties: ['seed'] } };
    expect(() => parseCustomObject(custom)).not.toThrow();
    const r = applyCustomParameters({ model: 'm' }, custom);
    expect((r.payload as any)._canvas).toBeUndefined();
    expect(() => parseCustomObject({ provider: 'x' })).toThrow(/路由\/凭据/);
    expect(() => parseCustomObject({ a: { endpoint: 'x' } })).toThrow();
  });
  it('5 provider switch with unreadable Schema drops the previous scope properties', () => {
    const prev = JSON.stringify({ lora_strength: 50, _canvas: { scope: { provider: 'venice', model: 'v' }, schemaProperties: ['lora_strength'], endpoint: 'https://api.venice.ai' } });
    const out = JSON.parse(rescopeCustomParameters(prev, 'together', 't', null)!);
    expect(out.lora_strength).toBeUndefined();
    expect(out._canvas.schemaProperties).toBeUndefined();
    expect(out._canvas.endpoint).toBeUndefined();
    expect(out._canvas.scope).toEqual({ provider: 'together', model: 't' });
  });
  it('4 prefetch failure history card carries GET URL + verbatim body + POST 未发送', () => {
    const it = buildPrefetchFailureHistoryItem({ getUrl: '/api/model-schema?provider=together&model=m', status: 401, body: '{"error":"invalid_api_key"}', provider: 'together', model: 'm' });
    expect(it.status).toBe('failed');
    expect(it.upstreamResponseBody).toBe('{"error":"invalid_api_key"}');
    expect(it.error).toContain('GET /api/model-schema?provider=together&model=m → HTTP 401');
    expect(it.error).toContain('生成 POST 未发送');
  });
  it('6/7 log is append-only and every row has method + URL + status', () => {
    (getExecutions() as any).push({ id: 7, time: new Date().toISOString(), route: '/api/model-schema?provider=x', method: 'GET', request: null, status: 401, response: {}, state: 'error' });
    const before = getExecutions().length;
    beginRun();
    expect(getExecutions().length).toBe(before);
    const r = getExecutions().find((x) => x.id === 7)!;
    expect(requestLine(r)).toBe('GET /api/model-schema?provider=x · HTTP 401 · 失败');
    expect(buttonSummary(getExecutions())).not.toMatch(/401/);
  });
  it('10 LoRA path keeps the filename end', () => {
    const s = middleEllipsis('https://huggingface.co/Comfy-Org/Krea-2/resolve/main/loras/krea2_darkbrush.safetensors');
    expect(s.endsWith('krea2_darkbrush.safetensors')).toBe(true);
    expect(s).toContain('…');
  });
});
