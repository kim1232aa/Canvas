import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  shortUpstreamSummary,
  plainErrorMessage,
  errorBannerText,
  upstreamHttpFirstLine,
  upstreamFailureToast,
} from './apiFailure';
import {
  upstreamSegmentStatusLabel,
  extractBusinessOutcome,
  unwrapGenerationParameters,
} from './historyParameters';
import { matchOfficialUnavailable, officialUnavailableMessage, schemaProviders } from '../server/schemaProviders';
import { LOCAL_RECORD_LABEL } from '../components/HistoryModal';

describe('fix4 Together officialUnavailableParams (not rule D)', () => {
  it('blocks when Schema still has image_loras items.properties path+scale', () => {
    const props = {
      prompt: { type: 'string' },
      image_loras: {
        type: 'array',
        items: { type: 'object', properties: { path: { type: 'string' }, scale: { type: 'number' } }, required: ['path', 'scale'] },
      },
    };
    const hit = matchOfficialUnavailable(schemaProviders.together, props, true);
    expect(hit?.field).toBe('image_loras');
    expect(hit?.blockText).toBe('官方参数指南：image_loras no longer available');
    expect(hit?.docUrl).toContain('docs.together.ai/docs/inference/images/parameters');
    expect(hit?.fetchedAt).toContain('2026-10-16');
    const msg = officialUnavailableMessage(hit!);
    expect(msg).toContain('官方参数指南：image_loras no longer available');
    expect(msg).toContain('No longer available');
    expect(msg).toContain(hit!.docUrl);
  });

  it('does not fire without canvas LoRAs', () => {
    const props = { image_loras: { type: 'array' } };
    expect(matchOfficialUnavailable(schemaProviders.together, props, false)).toBeUndefined();
  });

  it('Together has no loraItemFields (rule D not used for this block)', () => {
    expect((schemaProviders.together as any).loraItemFields).toBeUndefined();
    expect((schemaProviders.together as any).loraLocalBlock).toBeUndefined();
    expect((schemaProviders.together as any).officialUnavailableParams).toHaveLength(1);
  });
});

describe('fix4 short upstream banner (no JSON in KSampler strip)', () => {
  const longJson =
    'HTTP 200 · task status=waiting_for_user · insufficient_credit {"status":"success","data":{"workflow":{"status":"waiting_for_user","waitingReason":"insufficient_credit","workflowId":"wf_long"}}}';

  it('shortUpstreamSummary drops trailing JSON', () => {
    const s = shortUpstreamSummary(longJson);
    expect(s).toContain('HTTP 200');
    expect(s).toContain('waiting_for_user');
    expect(s).not.toContain('"workflowId"');
    expect(s).not.toMatch(/\{"status"/);
  });

  it('errorBannerText / plainErrorMessage stay short', () => {
    expect(errorBannerText(longJson)).not.toContain('workflowId');
    expect(plainErrorMessage(new Error(longJson))).not.toContain('workflowId');
  });

  it('upstreamHttpFirstLine + toast title keep task status, body JSON only in expand', () => {
    const data = {
      upstreamStatus: 200,
      upstreamStatusText: 'task status=waiting_for_user · insufficient_credit',
      upstreamResponseBody: '{"status":"success","data":{"workflow":{"status":"waiting_for_user","waitingReason":"insufficient_credit"}}}',
    };
    const line = upstreamHttpFirstLine(data)!;
    expect(line).toContain('HTTP 200');
    expect(line).toContain('waiting_for_user');
    expect(line).not.toContain('workflowId');
    const toast = upstreamFailureToast(data, '运行：KSampler')!;
    expect(toast.title).toContain('HTTP 200');
    expect(toast.title).toContain('waiting_for_user');
    expect(toast.message.split('\n')[0]).not.toContain('"status":"success"');
    expect(toast.message).toContain('完整上游响应原文');
  });
});

describe('fix4 HTTP success vs business failure segment label', () => {
  it('extractBusinessOutcome prefers nested waiting_for_user over envelope success', () => {
    const body = {
      status: 'success',
      data: { workflow: { status: 'waiting_for_user', waitingReason: 'insufficient_credit' } },
    };
    const biz = extractBusinessOutcome(body);
    expect(biz.status).toBe('waiting_for_user');
    expect(biz.waitingReason).toBe('insufficient_credit');
  });

  it('upstreamSegmentStatusLabel shows HTTP 成功 · 业务 …', () => {
    const text = JSON.stringify({
      status: 'success',
      data: { workflow: { status: 'waiting_for_user', waitingReason: 'insufficient_credit' } },
    });
    const label = upstreamSegmentStatusLabel(text, 200);
    expect(label).toBe('HTTP 成功 · 业务 waiting_for_user · insufficient_credit');
  });
});

describe('fix4 LocalRecord label constant', () => {
  it('keeps LOCAL_RECORD_LABEL', () => {
    expect(LOCAL_RECORD_LABEL).toContain('本地记录');
  });
});
