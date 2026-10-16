import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { catalogEvidenceFrom, evidenceForTab } from './CivitaiModal';
import { buttonSummary } from './ExecutionLog';

describe('LoRA Hub empty state keyed by provider', () => {
  it('Replicate evidence never renders under the Venice tab', () => {
    const rep = { provider: 'replicate', endpoint: 'https://api.replicate.com/v1/collections/flux-fine-tunes', method: 'GET', status: 200 };
    expect(evidenceForTab(rep, 'venice')).toBeNull();
    expect(evidenceForTab(rep, 'replicate')).toBe(rep);
  });
  it('Venice noLoraCatalog pagination yields its own notice with no endpoint', () => {
    const ev = catalogEvidenceFrom({ executionTrace: [], _pagination: { venice: { noLoraCatalog: true, message: '无 LoRA 目录接口（仅 lora_strength）。' } } }, 'venice');
    expect(ev).toEqual({ noUpstreamCall: true, message: '无 LoRA 目录接口（仅 lora_strength）。' });
  });
  it('source contract: stale responses are dropped and evidence reset per new query', () => {
    const src = readFileSync(resolve(__dirname, 'CivitaiModal.tsx'), 'utf8');
    const afterFetch = src.slice(src.indexOf('const liveData = await catalogOncePerOpen('));
    const guard = afterFetch.indexOf('if (currentReqId !== activeReqIdRef.current) return;');
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(afterFetch.indexOf('setCatalogEvidence('));
    expect(src).toMatch(/setCatalogNotice\(null\);\s*setCatalogEvidence\(null\);/);
  });
  it('server pagination carries noLoraCatalog + message for schema providers', () => {
    const src = readFileSync(resolve(__dirname, '../../server.ts'), 'utf8');
    expect(src).toMatch(/noLoraCatalog \? \{ noLoraCatalog: true, message: notice \}/);
  });
});

describe('Exec log: one canonical error display', () => {
  const recs: any[] = [{ id: 1, state: 'error', status: 402, route: '/api/engine/venice/generate', response: { error: 'HTTP 402: {"error":"Insufficient USD"}' } }];
  it('closed bar carries the error; open bar does not repeat it', () => {
    expect(buttonSummary(recs, true)).toBe('错误详情见上方面板（点此收起）');
    expect(buttonSummary(recs, false)).not.toBe('错误详情见上方面板（点此收起）');
    expect(buttonSummary(recs, false).length).toBeGreaterThan(5);
  });
});
