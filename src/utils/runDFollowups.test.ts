import { describe, it, expect } from 'vitest';
import { schemaSendStatus } from './schemaSendStatus';
import { resolveHistoryParameters, historyFieldOrigins, historyParameterSourceLabel } from './historyParameters';
import { beginRun, getExecutions } from '../services/executionTrace';
import { loadProviderDeclaration } from '../server/schemaProviders';

const cp = (c: any) => JSON.stringify({ _canvas: { schemaFieldsOnly: true, ...c } });
describe('runD follow-ups', () => {
  it('A: declared+filled → will_send even when unprobed (x-liveConfirmed is 对照表 only)', () => {
    const base = { schemaProperties: ['seed', 'steps'], schemaUnprobed: true };
    expect(schemaSendStatus('novita', 'seed', 1, cp(base))).toBe('will_send');
    expect(schemaSendStatus('novita', 'steps', 20, cp(base))).toBe('will_send');
    const d = loadProviderDeclaration('novita', '/v3/async/txt2img');
    expect(d.liveConfirmed).toBeUndefined();
    expect(Object.values(d.inputSchema.properties).every((f: any) => f['x-liveConfirmed'] === false)).toBe(true);
    expect(d.inputSchema.properties.model_name).toBeTruthy();
  });
  it('J: schema loading → neutral loading state, not 待确认', () => {
    expect(schemaSendStatus('novita', 'seed', 1, cp({ schemaLoading: true }))).toBe('loading');
  });
  it('I: field absent from endpoint schema → 该端点不支持; declared but unfilled → 未发送', () => {
    const item: any = { id: 'x', status: 'failed', requestMetadata: { actualRequest: { endpoint: 'e', parameters: { steps: 20 }, schemaFields: ['prompt', 'steps', 'width', 'height', 'strength'] } } };
    const r = resolveHistoryParameters(item);
    expect(r.sampler.source).toBe('unsupported');
    expect(r.negativePrompt.source).toBe('unsupported');
    expect(r.size.source).toBe('not-sent');
    expect(historyParameterSourceLabel('unsupported')).toBe('该端点不支持 · 未发送') // clean-1029 #5;
  });
  it('D: top-level strength labelled as KSampler denoise', () => {
    const item: any = { id: 'x', requestMetadata: { actualRequest: { mapping: [{ from: 'denoise', to: 'strength', value: 1 }] } } };
    expect(historyFieldOrigins(item)).toEqual([{ field: 'strength', origin: 'KSampler 去噪强度' }]);
  });
  it('C: beginRun drops previous error entries', () => {
    (getExecutions() as any).push({ id: 1, time: new Date().toISOString(), route: '/x', method: 'POST', request: null, status: 402, response: null, state: 'error' });
    beginRun();
    // append-only log: the row stays, it only stops driving the bottom-bar alert
    expect(getExecutions().some((r) => r.state === 'error')).toBe(true);
    expect(getExecutions().some((r) => r.state === 'error' && !r.acknowledged)).toBe(false);
  });
});
