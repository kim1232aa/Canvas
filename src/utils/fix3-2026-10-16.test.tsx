import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { upstreamFailureToast, toastFromRunError, taskStatusLine, upstreamHttpFirstLine } from './apiFailure';
import { notSentLoraLabel, loraNameInMappedParams, upstreamEchoContrast, valueAtPath } from './historyParameters';
import { mapSchemaLoraItems, proposedRequestOf, schemaProviders } from '../server/schemaProviders';
import { JsonNoMidBreak, UrlNoMidBreak } from '../components/TextEmphasis';
import { findNonOverlappingPos } from './nodeOverlap';
import { ApiTraceError } from '../services/executionTrace';

describe('fix3 A/B proposedRequest + D lora item mapping', () => {
  it('mapSchemaLoraItems uses Schema properties when present', () => {
    const items = mapSchemaLoraItems(
      [{ path: 'https://x/a.safetensors', strength: 0.85 }],
      { type: 'object', properties: { path: { type: 'string' }, scale: { type: 'number' } } },
      {},
      'm',
    );
    expect(items).toEqual([{ path: 'https://x/a.safetensors', scale: 0.85 }]);
  });

  it('mapSchemaLoraItems uses provider loraItemFields when items lack properties (MuAPI config)', () => {
    const items = mapSchemaLoraItems(
      [{ path: 'https://x/a.safetensors', strength: 0.75, modelStrength: 0.75 }],
      { type: 'object', additionalProperties: true },
      schemaProviders.muapi,
      'krea-v2-turbo-lora',
    );
    expect(items).toEqual([{ path: 'https://x/a.safetensors', scale: 0.75 }]);
    expect((schemaProviders.muapi as any).loraItemFields.sourceUrl).toBe('https://api.muapi.ai/openapi.json');
  });

  it('mapSchemaLoraItems throws when neither Schema nor config defines strength field', () => {
    expect(() => mapSchemaLoraItems([{ path: 'a' }], { type: 'object' }, {}, 'm')).toThrow(/Schema 未定义 LoRA 强度字段/);
  });

  it('proposedRequestOf keeps mapped parameters (not canvas internals)', () => {
    const p = proposedRequestOf(
      { endpoint: 'https://api.example/x', inputSchema: { properties: { prompt: {}, loras: {} } } },
      { prompt: 'p', loras: [{ path: 'a', scale: 0.8 }] },
      [{ from: 'loras', to: 'loras' }],
      [{ path: 'a', strength: 0.8 }],
    );
    expect(p.parameters.loras[0].scale).toBe(0.8);
    expect(p.requestedLoras[0].name).toBe('a');
  });
});

describe('fix3 C notSentLoraLabel without JSON.stringify substring', () => {
  it('marks 拟发送 when mapped params contain the LoRA path', () => {
    const item: any = {
      status: 'local_blocked',
      requestMetadata: {
        intendedRequest: { parameters: { loras: [{ path: 'https://x/darkbrush.safetensors', scale: 0.75 }] }, schemaFields: ['prompt', 'loras'] },
      },
    };
    expect(notSentLoraLabel(item, 'https://x/darkbrush.safetensors')).toBe('拟发送（未出站）');
    expect(loraNameInMappedParams({ loras: [{ path: 'https://x/darkbrush.safetensors', scale: 0.75 }] }, 'darkbrush')).toBe(true);
  });

  it('does not match by accidental JSON substring', () => {
    const item: any = {
      status: 'local_blocked',
      requestMetadata: {
        intendedRequest: { parameters: { prompt: 'no lora here' }, schemaFields: ['prompt', 'loras'] },
      },
    };
    // Previously JSON.stringify(parameters).includes(JSON.stringify(name)) could false-positive on short names
    expect(notSentLoraLabel(item, 'lora')).toBe('未发送');
  });
});

describe('fix3 F upstream echo contrast', () => {
  it('lists echo-only strength and never invents from Schema default', () => {
    const rows = upstreamEchoContrast(
      { prompt: 'p', seed: 42, resolution: '1k', loras: [{ path: 'a', scale: 0.85 }] },
      { prompt: 'p', seed: 42, resolution: '1k', loras: [{ path: 'a', scale: 0.85 }], strength: 0.8, aspect_ratio: '1:1' },
      { strength: { description: 'Only used when image is set', default: 0.8 } },
    );
    const strength = rows.find((r) => r.key === 'strength');
    expect(strength?.kind).toBe('upstream-default');
    expect(strength?.value).toBe(0.8);
    expect(strength?.description).toMatch(/Only used when image is set/);
  });

  it('valueAtPath reads data.input', () => {
    expect(valueAtPath({ data: { input: { strength: 0.8 } } }, 'data.input')).toEqual({ strength: 0.8 });
  });
});

describe('fix3 G/H toast empty-body false positive', () => {
  it('HTTP 200 task failure with object rawResponse shows body and status in title', () => {
    const data = {
      status: 'waiting_for_user',
      waitingReason: 'insufficient_credit',
      ok: false,
      upstreamStatus: 200,
      rawResponse: { status: 'success', data: { workflow: { status: 'waiting_for_user', waitingReason: 'insufficient_credit' } } },
      historyItem: {
        error: 'Debit Error: Insufficient funds',
        upstreamStatus: 200,
        upstreamStatusText: 'task status=waiting_for_user · insufficient_credit',
        upstreamResponseBody: '{"status":"waiting_for_user","waitingReason":"insufficient_credit"}',
      },
    };
    const t = upstreamFailureToast(data, '运行：保存图像')!;
    expect(t.title).toMatch(/HTTP 200/);
    expect(t.title).toMatch(/waiting_for_user|insufficient_credit/);
    expect(t.message).not.toMatch(/^（上游响应体为空）/);
    expect(t.message.length).toBeGreaterThan(10);
    expect(taskStatusLine(data)).toMatch(/waiting_for_user|insufficient_credit/);
    expect(upstreamHttpFirstLine(data)).toMatch(/HTTP 200/);
  });

  it('toastFromRunError reads ApiTraceError.data with object rawResponse', () => {
    const body = {
      status: 'waiting_for_user',
      waitingReason: 'insufficient_credit',
      ok: false,
      upstreamStatus: 200,
      rawResponse: { hello: 'world', status: 'waiting_for_user' },
    };
    const err = new ApiTraceError(200, body, '/api/schema-provider/sogni/tasks/x', JSON.stringify(body));
    const t = toastFromRunError(err, '运行：KSampler')!;
    expect(t.title).toMatch(/HTTP 200/);
    expect(t.message).toMatch(/hello|waiting_for_user/);
  });
});

describe('fix3 O JsonNoMidBreak / UrlNoMidBreak', () => {
  it('does not insert a break opportunity inside wavespeed', () => {
    const html = renderToStaticMarkup(<UrlNoMidBreak text="https://api.wavespeed.ai/api/v3/wavespeed-ai/krea-v2/turbo-lora" />);
    expect(html).toContain('wavespeed-ai');
    expect(html).not.toMatch(/waves<\/span><wbr/);
  });

  it('JsonNoMidBreak keeps path segments intact', () => {
    const html = renderToStaticMarkup(<JsonNoMidBreak value={{ path: 'krea2_darkbrush.safetensors', endpoint: 'wavespeed-ai/krea' }} />);
    expect(html).toContain('krea2_darkbrush.safetensors');
    expect(html).toContain('wavespeed-ai');
  });
});

describe('fix3 J findNonOverlappingPos', () => {
  it('moves new LoRA below an overlapping node', () => {
    const pos = findNonOverlappingPos([{ id: 'a', pos: { x: 100, y: 100 }, width: 320 }], { x: 100, y: 100 }, { w: 320, h: 180 });
    expect(pos.y).toBeGreaterThan(100);
  });
});
