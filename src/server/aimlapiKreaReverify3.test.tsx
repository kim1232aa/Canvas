// 2026-10-15 画布 round 3 (/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-aimlapi-krea-reverify3) fixes.
import express from 'express';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { registerSchemaProviderRoutes } from './schemaProviders';
import { formatHistorySize, resolveHistoryParameters, sentHistoryLoras } from '../utils/historyParameters';
import { HistoryModal } from '../components/HistoryModal';
import { catalogEvidenceFrom } from '../components/CivitaiModal';
import { liveRunTargetId } from '../utils/graphEngine';
import { withCanvasOrigin } from '../services/executionTrace';

const modal = (items: any[]) => renderToStaticMarkup(<HistoryModal isOpen onClose={() => {}} history={items} onApplyPrompt={() => {}} onDeleteItem={() => {}} onClearAll={() => {}} />);

describe('P0-1 size row reads the sent value, never the raw-response byte count', () => {
  const failed: any = { id: 'f', status: 'failed', url: '', provider: 'aimlapi', model: 'm', loras: [], upstreamStatus: 403,
    requestMetadata: { actualRequest: { endpoint: 'x', parameters: { image_size: 'square_hd', seed: 42 } },
      executionTrace: [{ endpoint: 'x', status: 403, responseBody: { kind: 'raw-response', url: '/api/media/raw/abc', sha256: 'abc', size: 505 } }] } };
  it('failed card → square_hd · 实际发送', () => {
    const size = formatHistorySize(resolveHistoryParameters(failed));
    expect(size).toMatchObject({ text: 'square_hd', source: 'sent' });
    expect(modal([failed])).not.toContain('505');
  });
  it('successful item with raw-response reference does not surface size as 上游实际', () => {
    const ok = { ...failed, status: undefined, url: 'https://cdn/x.png' };
    expect(resolveHistoryParameters(ok).size.source).toBe('sent');
  });
});

describe('P0-2 local_blocked card shows the full would-be-sent params incl. LoRA', () => {
  const blocked: any = { id: 'b', status: 'local_blocked', url: '', provider: 'aimlapi', model: 'm', loras: [], error: 'x',
    requestMetadata: { route: '/api/schema-provider/aimlapi/submit',
      intendedRequest: { model: 'm', prompt: 'p', steps: 17, seed: 42, custom_parameters: { image_size: 'square_hd' }, loras: [{ path: 'ostris/z', strength: 0.85 }] },
      blockedField: { from: 'steps', field: 'num_inference_steps', value: 17, minimum: 1, maximum: 8 },
      executionTrace: [{ endpoint: 'x', status: 200, responseBody: { kind: 'raw-response', size: 3675 } }] } };
  it('seed / size intended, steps blocked, LoRA row present, no 上游实际', () => {
    const r = resolveHistoryParameters(blocked);
    expect(r.seed).toMatchObject({ value: 42, source: 'intended' });
    expect(r.size).toMatchObject({ value: 'square_hd', source: 'intended' });
    expect(r.steps.source).toBe('blocked');
    expect(sentHistoryLoras(blocked)).toEqual([{ name: 'ostris/z', strength: 0.85 }]);
    const html = modal([blocked]);
    expect(html).not.toContain('上游实际');
    expect(html).toContain('LoRA · 拟发送（未出站）: ostris/z (0.85)'); expect(html).not.toContain('LoRA: ostris/z'); // fix3 C: mapped intended loras → 拟发送
    expect(html).toContain('拟发送（未出站）');
  });
});

describe('本机直调 label', () => {
  it('direct-origin entries are labelled; UI fetches tag x-canvas-origin', () => {
    const html = modal([{ id: 'd', status: 'failed', url: '', provider: 'aimlapi', model: 'm', loras: [], requestOrigin: 'direct', upstreamStatus: 403 }]);
    expect(html).toContain('本机直调');
    expect((withCanvasOrigin('/api/models', { headers: { a: '1' } }) as any).headers).toEqual({ a: '1', 'x-canvas-origin': 'browser-ui' });
    expect(withCanvasOrigin('https://api.krea.ai/styles', undefined)).toBeUndefined();
  });
});

describe('stale selection after deleting a node', () => {
  it('a deleted selected/run node is an error (节点已删除，请重新选择), never auto-picked', () => {
    expect(() => liveRunTargetId([{ id: 'ks' }], undefined, 'deleted-lora')).toThrow('节点已删除，请重新选择');
    expect(() => liveRunTargetId([{ id: 'ks' }], 'gone', undefined)).toThrow('节点已删除，请重新选择');
    expect(liveRunTargetId([{ id: 'ks' }], undefined, null)).toBeUndefined();
    expect(liveRunTargetId([{ id: 'ks' }], undefined, 'ks')).toBe('ks');
  });
});

describe('LoRA Hub empty state evidence', () => {
  it('upstream call → method endpoint status + body; no call → says so with source', () => {
    expect(catalogEvidenceFrom({ executionTrace: [{ method: 'GET', endpoint: 'https://u/x', status: 200, responseBody: '{"items":[]}' }] }, 'krea'))
      .toMatchObject({ endpoint: 'https://u/x', status: 200, body: '{"items":[]}' });
    expect(catalogEvidenceFrom({ executionTrace: [], _pagination: { tensorart: { sourceUrl: 'https://tams-docs', message: '无列表 API' } } }, 'tensorart'))
      .toMatchObject({ noUpstreamCall: true, endpoint: 'https://tams-docs', message: '无列表 API' });
  });
});

describe('P0-4 Krea GET /styles cursor paging (official {items,next_cursor})', () => {
  it('passes limit/cursor upstream and returns next_cursor verbatim', async () => {
    const urls: string[] = [];
    const app = express();
    registerSchemaProviderRoutes(app as any, {
      fetch: async (_m: any, url: string) => { urls.push(url); return new Response(JSON.stringify({ items: [{ id: 's1', title: 'S1', models: ['flux_dev'] }], next_cursor: 'c2' }), { status: 200 }); },
      key: () => 'k', record: (i: any) => i, durable: async (u: string) => ({ ok: true, dataUrl: u }),
    } as any);
    const layer = (app as any)._router.stack.find((l: any) => l.route?.path === '/api/models');
    let payload: any; let status = 200;
    const res: any = { status(c: number) { status = c; return this; }, json(p: any) { payload = p; return this; } };
    await layer.route.stack[0].handle({ method: 'GET', path: '/api/models', query: { provider: 'krea', type: 'LORA', category: 'lora', limit: '36', cursor: 'c1' }, headers: {} }, res, () => {});
    expect(status).toBe(200);
    expect(urls[0]).toBe('https://api.krea.ai/styles?limit=36&cursor=c1');
    expect(payload.krea[0]).toMatchObject({ id: 's1', baseModel: 'flux_dev', category: 'LoRA' });
    expect(payload._pagination.krea).toMatchObject({ nextCursor: 'c2', hasMore: true, paging: 'upstream-cursor' });
  });
});
