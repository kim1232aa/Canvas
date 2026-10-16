import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildFailedAttemptHistoryItem, buildLocalRejectionHistoryItem } from '../server/failedAttemptHistory';
import { splitActualRequest } from './actualRequestDisplay';
import { resolveHistoryParameters, historyParameterSourceLabel } from './historyParameters';
import { HistoryModal } from '../components/HistoryModal';

const body = { input: { prompt: 'p', seed: 7, num_inference_steps: 28, guidance: 3, lora_weights: 'fofr/flux-pixar-cars', lora_scale: 0.85 } };
const fields = ['prompt', 'seed', 'num_inference_steps', 'guidance', 'lora_weights', 'lora_scale', 'aspect_ratio'];
const ep = 'https://api.example.test/v1/predictions';
const failed = () => buildFailedAttemptHistoryItem({ route: '/api/engine/x/generate', submissions: [], traces: [{ provider: 'x', method: 'POST', endpoint: ep, status: 402, requestBody: body }] } as any,
  { prompt: 'p', sampler_name: 'euler', negative_prompt: 'n', width: 512, height: 512 }, 402, { error: 'HTTP 402', actualRequest: body, schemaFields: fields })!;

describe('1035 #1 actualRequest = outbound body only; schemaFields in 本地记录', () => {
  it('bare body is stored verbatim; schemaFields moves to requestMetadata.schemaFields', () => {
    const item: any = failed();
    expect(item.requestMetadata.actualRequest).toEqual(body);
    expect(item.requestMetadata.schemaFields).toEqual(fields);
  });
  it('chip verdicts still read schemaFields (sampler/negative unsupported; size not-sent when Schema has aspect_ratio)', () => {
    const r = resolveHistoryParameters(failed() as any);
    for (const k of ['sampler', 'scheduler', 'negativePrompt'] as const) expect(historyParameterSourceLabel(r[k].source)).toBe('该端点不支持 · 未发送');
    // fix5: aspect_ratio is a size alias — Schema lists it ⇒ size is 「未发送」, not 「该端点不支持」
    expect(historyParameterSourceLabel(r.size.source)).toBe('未发送');
    expect(r.seed.source).toBe('sent');
  });
  it('local block raw snapshot is not augmented with schemaFields either', () => {
    const item: any = buildLocalRejectionHistoryItem('/api/engine/x/generate', { model: 'm', prompt: 'p' }, 400, { error: 'x', schemaFields: fields });
    expect(item.requestMetadata.intendedRequest.schemaFields).toBeUndefined();
    expect(item.requestMetadata.schemaFields).toEqual(fields);
  });
  it('legacy record (schemaFields appended to bare body) displays body only, list in meta', () => {
    const { sent, meta } = splitActualRequest({ ...body, schemaFields: fields });
    expect(sent).toEqual(body);
    expect(meta).toEqual({ schemaFields: fields });
  });
  it('history card: 实际发送 JSON has no schemaFields; separate 本地记录 fold has it', () => {
    const html = renderToStaticMarkup(<HistoryModal isOpen onClose={() => {}} history={[{ id: 'h', ...failed() } as any]} onApplyPrompt={() => {}} onDeleteItem={() => {}} onClearAll={() => {}} />);
    const actual = html.match(/data-testid="history-failed-actual">([\s\S]*?)<\/pre>/)?.[1] ?? '';
    expect(actual).toContain('lora_weights');
    expect(actual).not.toContain('schemaFields');
    expect(html).toContain('data-testid="history-local-record"');
    expect(html).toContain('本地记录（未发给上游）');
  });
});

describe('1035 #2 尺寸 absent state renders like 采样器/调度器/负向 (no chip box)', () => {
  it('no ⊘ chip on 尺寸 when no value is shown', () => {
    const html = renderToStaticMarkup(<HistoryModal isOpen onClose={() => {}} history={[{ id: 'h', ...failed() } as any]} onApplyPrompt={() => {}} onDeleteItem={() => {}} onClearAll={() => {}} />);
    // fix5: Schema has aspect_ratio ⇒ size row shows 「未发送」 (not folded into 该端点不支持)
    expect(html).toContain('data-testid="history-size"');
    expect(html).toMatch(/data-testid="history-size">尺寸: 未发送/);
    expect(html).not.toMatch(/data-unsupported-key="size"/);
    expect(html).toMatch(/data-unsupported-key="sampler">采样器 · 该端点不支持 · 未发送<\/li>/);
  });
});
