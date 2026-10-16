import { describe, expect, it } from 'vitest';
import { buildFailedAttemptHistoryItem } from './failedAttemptHistory';
import { resolveHistoryParameters } from '../utils/historyParameters';

const raw403 = '{"statusCode":403,"message":"You have run out of funds. Please top up your balance."}';
const params = { model: 'alibaba/z-image-turbo-lora', prompt: 'cat', seed: 7, num_inference_steps: 8, loras: [{ path: 'ostris/z_image_turbo_childrens_drawings', scale: 0.85 }] };

describe('buildFailedAttemptHistoryItem', () => {
  it('records actualRequest (incl. loras), upstream status and verbatim body', () => {
    const item = buildFailedAttemptHistoryItem({
      route: '/api/aimlapi/generate',
      submissions: [{ endpoint: 'https://api.aimlapi.com/v1/images/generations', parameters: params, status: 403 }],
      traces: [{ provider: 'aimlapi', model: 'alibaba/z-image-turbo-lora', method: 'POST', endpoint: 'https://api.aimlapi.com/v1/images/generations', status: 403, statusText: 'Forbidden', responseBody: raw403 }],
    }, { prompt: 'cat', provider: 'aimlapi' }, 403, { error: 'x', errorSource: 'upstream' })!;
    expect(item.status).toBe('failed');
    expect(item.upstreamStatus).toBe(403);
    expect(item.upstreamResponseBody).toBe(raw403);
    expect(item.requestMetadata.actualRequest.parameters.loras).toEqual(params.loras);
    expect(item.loras).toEqual([{ name: 'ostris/z_image_turbo_childrens_drawings', strength: 0.85 }]);
    expect(item.url).toBe('');
    const resolved = resolveHistoryParameters({ ...item, id: 'h', timestamp: 1, seed: null, steps: null, cfg: null } as any);
    expect(resolved.seed).toMatchObject({ value: 7, source: 'sent' });
    expect(resolved.steps).toMatchObject({ value: 8, source: 'sent' });
  });

  it('402 billing from any provider is recorded the same way', () => {
    const body = '{"error":"Insufficient balance"}';
    const item = buildFailedAttemptHistoryItem({ route: '/api/venice/generate', submissions: [{ endpoint: 'e', parameters: { prompt: 'p' }, status: 402 }], traces: [{ provider: 'venice', method: 'POST', endpoint: 'e', status: 402, responseBody: body }] }, {}, 402, {})!;
    expect(item.upstreamStatus).toBe(402);
    expect(item.upstreamResponseBody).toBe(body);
  });

  it('network failure without status keeps the error, null status', () => {
    const item = buildFailedAttemptHistoryItem({ route: '/r', submissions: [], traces: [{ provider: 'krea', method: 'POST', endpoint: 'e', status: null, error: 'fetch failed', requestBody: { a: 1 } }] }, {}, 502, {})!;
    expect(item.upstreamStatus).toBeNull();
    expect(item.networkError.message).toBe('fetch failed');
    expect(item.requestMetadata.actualRequest.parameters).toEqual({ a: 1 });
  });

  it('local validation errors (nothing sent) are not history', () => {
    expect(buildFailedAttemptHistoryItem({ route: '/r', submissions: [], traces: [{ method: 'GET', endpoint: 'models', status: 200 }] }, {}, 400, {})).toBeNull();
  });
});

import { buildLocalRejectionHistoryItem, isGenerationRoute, LOCAL_BLOCKED_LABEL } from './failedAttemptHistory';

describe('buildLocalRejectionHistoryItem', () => {
  it('status 未出站，本地拦截, verbatim reason, intended snapshot, no upstream fields', () => {
    const reason = 'Civitai Krea v2 官方不接受 LoRA、负面提示词或宽高像素（见 https://developer.civitai.com/orchestration/recipes/krea）。';
    const item = buildLocalRejectionHistoryItem('/api/engine/civitai/generate', { prompt: 'p', model: 'krea2', loras: [{ name: 'x', strength: 1 }], workflowSnapshot: { big: 1 } }, 400, { error: reason });
    expect(item.status).toBe('local_blocked');
    expect(item.statusLabel).toBe(LOCAL_BLOCKED_LABEL);
    expect(item.error).toBe(reason);
    expect(item.requestMetadata.intendedRequest).toEqual({ prompt: 'p', model: 'krea2', loras: [{ name: 'x', strength: 1 }] });
    expect(item).not.toHaveProperty('upstreamStatus');
    expect(item).not.toHaveProperty('upstreamResponseBody');
    expect(item.requestMetadata).not.toHaveProperty('actualRequest');
    expect(item.provider).toBe('civitai');
  });
  it('generation routes only', () => {
    expect(isGenerationRoute('/api/fal/generate')).toBe(true);
    expect(isGenerationRoute('/api/schema-provider/krea/submit')).toBe(true);
    expect(isGenerationRoute('/api/cloud/settings')).toBe(false);
    expect(isGenerationRoute('/api/media')).toBe(false);
  });
});

it('prefers fail() actualRequest and fills top-level loras (AIMLAPI 403 path)', () => {
  const routeActual = {
    endpoint: 'https://api.aimlapi.com/v1/images/generations',
    parameters: { prompt: 'p', loras: [{ path: 'ostris/z_image_turbo_childrens_drawings', scale: 0.85 }], model: 'alibaba/z-image-turbo-lora' },
    schemaFields: ['prompt', 'loras', 'model'],
  };
  const item = buildFailedAttemptHistoryItem({
    route: '/api/schema-provider/aimlapi/submit',
    submissions: [{ endpoint: routeActual.endpoint, parameters: { prompt: 'p' }, status: 403 }],
    traces: [{ provider: 'aimlapi', method: 'POST', endpoint: routeActual.endpoint, status: 403, responseBody: raw403 }],
  }, { prompt: 'p', model: 'alibaba/z-image-turbo-lora' }, 403, { error: 'HTTP 403', errorSource: 'upstream', actualRequest: routeActual })!;
  expect(item.requestMetadata.actualRequest.parameters.loras).toEqual(routeActual.parameters.loras);
  expect(item.loras).toEqual([{ name: 'ostris/z_image_turbo_childrens_drawings', strength: 0.85 }]);
  expect(item.requestMetadata.actualRequest.schemaFields).toEqual(routeActual.schemaFields);
});
