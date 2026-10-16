import { describe, it, expect } from 'vitest';
import { sentHistoryLoras, lorasFromSentParameters, historyModelSent, upstreamErrorMessage } from './historyParameters';
import { countActualRequestLoras } from './actualRequestLoras';

const body = '{"errors":{"message":"Please bind your Alibaba Cloud account before use. You can bind it at: https://modelscope.ai/my/settings/account"},"request_id":"298f9f58-5fba-45a3-a07b-d784da51d46c"}';
const actualRequest = {
  endpoint: 'https://api-inference.modelscope.ai/v1/images/generations',
  parameters: { model: 'Tongyi-MAI/Z-Image-Turbo', prompt: 'cat', size: '512x512', steps: 8, guidance: 3, seed: 42,
    loras: { 'suayptalha/Z-Image-Turbo-Realism-LoRA': 1 } },
};
const item: any = { id: 'h', status: 'failed', model: 'Tongyi-MAI/Z-Image-Turbo', upstreamStatus: 401, upstreamResponseBody: body,
  requestMetadata: { actualRequest } };

describe('object-map LoRA in actualRequest (1056)', () => {
  it('reads {name: strength} map', () => {
    expect(sentHistoryLoras(item)).toEqual([{ name: 'suayptalha/Z-Image-Turbo-Realism-LoRA', strength: 1 }]);
    expect(countActualRequestLoras(actualRequest)).toBe(1);
  });
  it('still reads array forms under any lora key', () => {
    expect(lorasFromSentParameters({ image_loras: [{ path: 'a', scale: 0.7 }] })).toEqual([{ name: 'a', strength: 0.7 }]);
    expect(lorasFromSentParameters({ lora_weights: ['u'] })).toEqual([{ name: 'u', strength: undefined }]);
    expect(lorasFromSentParameters({ loras: {} })).toEqual([]);
  });
  it('model chip only when sent model equals shown model', () => {
    expect(historyModelSent(item)).toBe(true);
    expect(historyModelSent({ ...item, model: 'other' })).toBe(false);
    expect(historyModelSent({ ...item, requestMetadata: { ...item.requestMetadata, postSent: false } })).toBe(false);
  });
});

describe('upstream message verbatim', () => {
  it('extracts nested message without rewriting', () => {
    expect(upstreamErrorMessage(body)).toBe('Please bind your Alibaba Cloud account before use. You can bind it at: https://modelscope.ai/my/settings/account');
    expect(upstreamErrorMessage('{"detail":"Insufficient credit"}')).toBe('Insufficient credit');
    expect(upstreamErrorMessage('{"error":{"code":1,"message":"x"}}')).toBe('x');
    expect(upstreamErrorMessage('plain text 401')).toBe('plain text 401');
    expect(upstreamErrorMessage('{"id":1}')).toBeUndefined();
    expect(upstreamErrorMessage(undefined)).toBeUndefined();
  });
});
