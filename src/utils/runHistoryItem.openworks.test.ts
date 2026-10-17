import { describe, expect, it } from 'vitest';
import { findRunHistoryItem } from './runHistoryItem';
import { historySeedStatement } from './historyParameters';

const itemSent: any = { id: 'hist_x', status: 'success', provider: 'Tensor.Art OpenWorks', model: 'photoreal_studio_z_image', timestamp: 0, url: 'u', seed: null,
  requestMetadata: { actualRequest: { endpoint: 'https://openapi.tensor.art/openworks/v1/task', parameters: { toolName: 'photoreal_studio_z_image', inputs: [{ type: 'INTEGER', name: 'seed', value: 7 }], seed: 7 },
    mapping: [{ from: 'seed', to: 'seed', value: 7, sent: true, reason: 'live-tested named extra (雁 2026-10-17)' }] } } };

const itemUnsentLegacy: any = { id: 'hist_y', status: 'success', provider: 'Tensor.Art OpenWorks', model: 'photoreal_studio_z_image', timestamp: 0, url: 'u', seed: null,
  requestMetadata: { actualRequest: { endpoint: 'https://openapi.tensor.art/openworks/v1/task', parameters: { toolName: 'photoreal_studio_z_image', inputs: [] },
    mapping: [{ from: 'seed', to: null, value: 7, sent: false, reason: '该模型 Schema 未声明对应字段，不会发送；实测证据：x' }] } } };

describe('schema-provider save-result → toast finds history row', () => {
  it('matches historyItems[] (not only historyItem)', () => {
    expect(findRunHistoryItem([{ historyItems: [{ id: 'hist_x' }] }], [itemSent])?.id).toBe('hist_x');
    expect(findRunHistoryItem([{ historyItem: { id: 'hist_x' } }], [itemSent])?.id).toBe('hist_x');
    expect(findRunHistoryItem([{ historyItems: [{ id: 'nope' }] }], [itemSent])).toBeUndefined();
  });
  it('seed line reflects sent live extra', () => {
    expect(historySeedStatement(itemSent)).toMatch(/7/);
  });
  it('legacy unsent mapping still says Schema 未声明', () => {
    expect(historySeedStatement(itemUnsentLegacy)).toBe('种子：未发送（Schema 未声明）');
  });
});

describe('openworks LoRA mount: live extras allow mount', () => {
  it('openworks never refuses LoRA solely because catalog inputs omit a LoRA field', async () => {
    const { ensureModelSchema } = await import('../services/modelSchemaCache');
    const { isLoraUnsupportedOnEndpoint } = await import('./resolveCheckpoint');
    expect(isLoraUnsupportedOnEndpoint('openworks', 'photoreal_studio_z_image').unsupported).toBe(false);
    const schema = { inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, 'image width': { type: 'integer' }, 'image height': { type: 'integer' }, 'result image count': { type: 'integer' } }, required: [] } };
    const fake = (async () => new Response(JSON.stringify(schema), { status: 200, headers: { 'Content-Type': 'application/json' } })) as any;
    ensureModelSchema('openworks', 'photoreal_studio_z_image', fake);
    await new Promise((r) => setTimeout(r, 20));
    expect(isLoraUnsupportedOnEndpoint('openworks', 'photoreal_studio_z_image').unsupported).toBe(false);
  });
});
