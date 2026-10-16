// 2026-10-15 画布 FE retest /workspace/canvas-e2e-aimlapi-krea-reverify2 → fixes P0 1–4, P1 5–8, P2 9–12 (code-level).
import express from 'express';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import docsJson from './__fixtures__/aimlapi-z-image-turbo-lora.docs-json.json';
import { openApiRequestSchema, registerSchemaProviderRoutes } from './schemaProviders';
import { buildLocalRejectionHistoryItem } from './failedAttemptHistory';
import { formatHistorySize, formatResolvedHistoryParameter, hasOutputMedia, resolveHistoryParameters } from '../utils/historyParameters';
import { HistoryModal, applyDisabledReason } from '../components/HistoryModal';
import { schemaChoiceFields } from '../components/SchemaChoiceControls';
import { formatRecordTime } from '../services/executionTrace';
import { validateLoraCompatibility } from '../utils/baseModelMatcher';

const MODEL = 'alibaba/z-image-turbo-lora';
const DOCS = 'https://api.aimlapi.com/docs-json?model=alibaba%2Fz-image-turbo-lora';
const RAW403 = '{"title":"Forbidden","status":403,"message":"You\'ve run out of funds."}';

async function submit(body: any) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const app = express();
  registerSchemaProviderRoutes(app as any, {
    fetch: async (_m: any, url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes('/models')) return new Response(JSON.stringify({ data: [{ id: MODEL, type: 'image', modalities: { output: ['image'] }, info: { name: 'Z', docsJson: DOCS } }] }), { status: 200 });
      if (url === DOCS) return new Response(JSON.stringify(docsJson), { status: 200 });
      if (url.endsWith('/images/generations')) return new Response(RAW403, { status: 403, statusText: 'Forbidden' });
      throw new Error('unexpected ' + url);
    },
    key: () => 'k', record: (i: any) => i, durable: async (u: string) => ({ ok: true, dataUrl: u }),
  } as any);
  const layer = (app as any)._router.stack.find((l: any) => l.route?.path === '/api/schema-provider/:provider/submit');
  let status = 200; let payload: any;
  const res: any = { status(c: number) { status = c; return this; }, json(p: any) { payload = p; return this; } };
  await layer.route.stack[0].handle({ method: 'POST', path: '/api/schema-provider/aimlapi/submit', params: { provider: 'aimlapi' }, query: {}, headers: {}, body }, res, () => {});
  const post = calls.find((c) => c.init?.method === 'POST');
  return { status, payload, upstreamBody: post ? JSON.parse(String(post.init!.body)) : undefined };
}

const failedItem = (actualRequest: any): any => ({
  id: 'f1', status: 'failed', url: '', prompt: 'a small red apple', provider: 'aimlapi', model: MODEL, loras: [],
  upstreamStatus: 403, upstreamStatusText: 'Forbidden', upstreamResponseBody: RAW403, requestMetadata: { route: '/api/schema-provider/aimlapi/submit', actualRequest },
});

describe('P0 3 image_size from the official Schema (generic choice controls)', () => {
  const schema = openApiRequestSchema(docsJson)!;
  it('schemaChoiceFields picks image_size (enum + {width,height}) and skips canvas-mapped / LoRA fields', () => {
    const fields = schemaChoiceFields(schema);
    const size = fields.find((f) => f.key === 'image_size')!;
    expect(size.enumValues).toContain('landscape_4_3');
    expect(size.sizeObject?.width.maximum).toBe(2048);
    expect(fields.map((f) => f.key)).not.toEqual(expect.arrayContaining(['seed', 'num_inference_steps', 'loras', 'prompt', 'model']));
  });
  it('enum image_size from custom_parameters is sent verbatim with steps 8 + LoRA 0.85 + seed', async () => {
    const r = await submit({ model: MODEL, prompt: 'p', steps: 8, seed: 42, custom_parameters: { image_size: 'square_hd' }, loras: [{ path: 'ostris/z_image_turbo_childrens_drawings', strength: 0.85 }] });
    expect(r.upstreamBody).toMatchObject({ image_size: 'square_hd', num_inference_steps: 8, seed: 42, loras: [{ path: 'ostris/z_image_turbo_childrens_drawings', scale: 0.85 }] });
    expect(r.status).toBe(403);
  });
  it('history shows the sent size (enum string or object), never 未发送', () => {
    expect(formatHistorySize(resolveHistoryParameters(failedItem({ endpoint: 'x', parameters: { image_size: 'square_hd', seed: 42 } }))).text).toBe('square_hd');
    expect(formatHistorySize(resolveHistoryParameters(failedItem({ endpoint: 'x', parameters: { image_size: { width: 1024, height: 768 } } }))).text).toBe('1024×768');
  });
});

describe('P0 2 seed row on failed cards', () => {
  it('seed resolves from actualRequest.parameters and is rendered on the 403 card', () => {
    const item = failedItem({ endpoint: 'https://api.aimlapi.com/v1/images/generations', parameters: { prompt: 'p', num_inference_steps: 8, seed: 42 } });
    expect(resolveHistoryParameters(item).seed).toMatchObject({ value: 42, source: 'sent' });
    const html = renderToStaticMarkup(<HistoryModal isOpen onClose={() => {}} history={[item]} onApplyPrompt={() => {}} onDeleteItem={() => {}} onClearAll={() => {}} />);
    expect(html).toMatch(/data-testid="history-seed">种子 42（上游未返回种子）/);
  });
});

describe('P0 1 / P1 8 / P2 11–12 history modal', () => {
  const ok: any = { id: 'ok', url: 'https://cdn/x.png', prompt: 'p', provider: 'krea', model: 'm', loras: [] };
  const blocked: any = { id: 'b', status: 'local_blocked', url: '', prompt: 'p', provider: 'aimlapi', model: MODEL, loras: [], error: 'x', requestMetadata: { route: '/r', intendedRequest: { steps: 17 } } };
  const html = renderToStaticMarkup(<HistoryModal isOpen onClose={() => {}} history={[failedItem({ endpoint: 'x', parameters: { seed: 42 } }), blocked, ok]} onApplyPrompt={() => {}} onDeleteItem={() => {}} onClearAll={() => {}} />);
  it('counts only entries with real output media', () => {
    expect([failedItem({}), blocked, ok].filter(hasOutputMedia)).toHaveLength(1);
    expect(html).toContain('data-testid="history-output-count">1 张出图');
    expect(html).toContain('未出图 2 条（上游失败 1 · 本地拦截 1）');
  });
  it('labels sampler and scheduler separately', () => {
    expect(html).toContain('采样器: 未发送');
    expect(html).toContain('调度器: 未发送');
  });
  it('raw upstream JSON is collapsed under a details after the status line', () => {
    expect(html).toMatch(/<details[^>]*data-testid="history-failed-raw"><summary[^>]*>上游原文/);
    expect(html.indexOf('HTTP 403 Forbidden')).toBeLessThan(html.indexOf('data-testid="history-failed-body"'));
  });
  it('disabled 应用到画布 says why', () => {
    expect(applyDisabledReason(blocked, false)).toMatch(/本地拦截/);
    expect(applyDisabledReason(failedItem({}), false)).toMatch(/上游请求失败/);
    expect(html).toContain('data-testid="history-apply-disabled-reason"');
  });
});

describe('P1 7 local-block card shows the blocked value', () => {
  it('server error carries blockedField → history item → 「17 步（超出 1–8，未发送）」', async () => {
    const r = await submit({ model: MODEL, prompt: 'p', steps: 17, seed: 42 });
    expect(r.status).toBe(400);
    expect(r.payload.blockedField).toMatchObject({ from: 'steps', field: 'num_inference_steps', value: 17, minimum: 1, maximum: 8 });
    const item: any = buildLocalRejectionHistoryItem('/api/schema-provider/aimlapi/submit', { model: MODEL, prompt: 'p', steps: 17 }, 400, r.payload);
    expect(item.requestMetadata.blockedField.value).toBe(17);
    expect(formatResolvedHistoryParameter(resolveHistoryParameters(item).steps, ' 步')).toBe('17 步（超出 1–8，未发送）');
  });
});

describe('P2 9 local-zone time format', () => {
  it('2026-10-15 02:48:15（北京时间）', () => {
    expect(formatRecordTime('2026-10-14T18:48:15.000Z', 'Asia/Shanghai')).toBe('2026-10-15 02:48:15（北京时间）');
    expect(formatRecordTime('2026-10-14T18:48:15.000Z', 'UTC')).toMatch(/^2026-10-14 18:48:15（.+）$/);
  });
});

describe('P0 4 LoRA/base family guess no longer warns', () => {
  it('z-image LoRA on flux-1-dev is unverified (no 底模架构不匹配)', () => {
    const c = validateLoraCompatibility('image/bfl/flux-1-dev', undefined, 'ostris/z_image_turbo_childrens_drawings', 'krea');
    expect(c.verification).toBe('unverified');
    expect(c.message).not.toMatch(/不匹配/);
  });
});
