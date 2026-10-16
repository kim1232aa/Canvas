/**
 * fix5 · 2026-10-16 — AIMLAPI 尺寸/响应体字节、MuAPI Schema strength 标注、其余家 aspect_ratio 进尺寸行
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HistoryModal, historyUnsupportedRows, upstreamBodyToggleText } from '../components/HistoryModal';
import {
  formatHistorySize,
  otherSentParameters,
  resolveHistoryParameters,
} from './historyParameters';
import { errorBannerText, shortUpstreamSummary } from './apiFailure';

const modal = (items: any[]) =>
  renderToStaticMarkup(
    <HistoryModal isOpen onClose={() => {}} history={items} onApplyPrompt={() => {}} onDeleteItem={() => {}} onClearAll={() => {}} />,
  );

describe('fix5 AIMLAPI size row never shows raw-response byte count', () => {
  const failed: any = {
    id: 'aiml-505',
    status: 'failed',
    url: '',
    provider: 'aimlapi',
    model: 'alibaba/z-image-turbo-lora',
    loras: [],
    upstreamStatus: 403,
    requestMetadata: {
      actualRequest: {
        endpoint: 'https://api.aimlapi.com/v1/images/generations',
        parameters: { image_size: 'square', seed: 42, num_inference_steps: 8, prompt: 'p' },
        schemaFields: ['prompt', 'image_size', 'num_inference_steps', 'seed', 'loras'],
      },
      executionTrace: [
        {
          method: 'POST',
          endpoint: 'https://api.aimlapi.com/v1/images/generations',
          status: 403,
          responseBody: { kind: 'raw-response', url: '/api/media/raw/abc', sha256: 'abc', size: 505 },
        },
      ],
    },
  };

  it('尺寸 = square · 实际发送；HTML 无「尺寸: 505」', () => {
    const size = formatHistorySize(resolveHistoryParameters(failed));
    expect(size).toMatchObject({ text: 'square', source: 'sent' });
    const html = modal([failed]);
    expect(html).toContain('history-size');
    expect(html).toContain('square');
    expect(html).not.toMatch(/尺寸:[^<]*505/);
    expect(html).toContain('history-unsupported');
  });

  it('上游响应折叠写「响应体 505 B」，不把裸「505 字节」当尺寸', () => {
    const ref = { kind: 'raw-response', url: '/x', size: 505 };
    expect(upstreamBodyToggleText(ref, false)).toBe('上游响应原文（响应体 505 B，点开读取）');
    expect(upstreamBodyToggleText(ref, false)).not.toMatch(/^\D*505 字节/);
    expect(modal([failed])).toContain('响应体 505 B');
  });
});

describe('fix5 aspect_ratio becomes the history size row (generic, not WaveSpeed-only)', () => {
  const muapiSent: any = {
    id: 'mu-ar',
    status: 'failed',
    url: '',
    provider: 'muapi',
    model: 'krea-v2-turbo-lora',
    loras: [],
    requestMetadata: {
      actualRequest: {
        endpoint: 'https://api.muapi.ai/api/v1/krea-v2-turbo-lora',
        parameters: { prompt: 'p', seed: 42, resolution: '1k', aspect_ratio: '16:9', loras: [{ path: 'a', scale: 0.75 }] },
        schemaFields: ['prompt', 'image_url', 'loras', 'aspect_ratio', 'resolution', 'strength', 'seed', 'webhook_url'],
      },
    },
  };

  it('sent aspect_ratio → 尺寸行 16:9 · 实际发送；不进「该端点不支持」折叠', () => {
    const resolved = resolveHistoryParameters(muapiSent);
    expect(formatHistorySize(resolved)).toMatchObject({ text: '16:9', source: 'sent' });
    expect(historyUnsupportedRows(resolved).map((r) => r.key)).not.toContain('size');
    expect(otherSentParameters(muapiSent).map((p) => p.key)).toContain('resolution');
    expect(otherSentParameters(muapiSent).map((p) => p.key)).not.toContain('aspect_ratio');
    const html = modal([muapiSent]);
    expect(html).toContain('history-size');
    expect(html).toMatch(/16:9/);
  });

  it('schema has aspect_ratio but not sent → 尺寸「未发送」, not 「该端点不支持」', () => {
    const noAr = {
      ...muapiSent,
      id: 'mu-no-ar',
      requestMetadata: {
        actualRequest: {
          ...muapiSent.requestMetadata.actualRequest,
          parameters: { prompt: 'p', seed: 42, resolution: '1k', loras: [{ path: 'a', scale: 0.75 }] },
        },
      },
    };
    const resolved = resolveHistoryParameters(noAr);
    expect(resolved.size.source).toBe('not-sent');
    expect(historyUnsupportedRows(resolved).map((r) => r.key)).not.toContain('size');
  });
});

describe('fix5 MuAPI LocalRecord strength annotation + short red-bar', () => {
  it('strength 标「Schema 声明，本次请求未含」, 不写「非本次实发」', () => {
    const item: any = {
      id: 'mu-schema',
      status: 'failed',
      url: '',
      provider: 'muapi',
      model: 'krea-v2-turbo-lora',
      loras: [],
      requestMetadata: {
        schemaFields: ['prompt', 'image_url', 'loras', 'aspect_ratio', 'resolution', 'strength', 'seed', 'webhook_url'],
        actualRequest: {
          endpoint: 'https://api.muapi.ai/api/v1/krea-v2-turbo-lora',
          parameters: { prompt: 'p', seed: 42, resolution: '1k', loras: [{ path: 'a', scale: 0.75 }] },
        },
      },
    };
    const html = modal([item]);
    expect(html).toContain('strength（Schema 声明，本次请求未含）');
    expect(html).not.toContain('非本次实发');
  });

  it('KSampler/红条 shortUpstreamSummary 丢掉 MuAPI 402 JSON 尾', () => {
    const long =
      'HTTP 402 Payment Required {"detail":{"error":{"code":"INSUFFICIENT_CREDITS","message":"Insufficient credit balance"}},"error":{"code":"INSUFFICIENT_CREDITS","message":"Insufficient credit balance","topup_url":"https://muapi.ai/topup"}}';
    const s = shortUpstreamSummary(long);
    expect(s).toContain('HTTP 402');
    expect(s).not.toContain('topup_url');
    expect(s).not.toContain('"detail"');
    expect(errorBannerText(long)).not.toContain('topup_url');
  });
});
