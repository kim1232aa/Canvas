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
