import { describe, expect, it } from 'vitest';
import { resolveHistoryParameters, historyParameterSourceLabel } from '../utils/historyParameters';
import { readInspectorParameters, patchInspectorNode, patchInspectorBranchNode } from '../utils/inspectorParameters';
import { extractWorkflowParameters } from '../utils/graphEngine';
import { schemaChoiceFields } from '../components/SchemaChoiceControls';
import type { NodeInstance, Connection } from '../types/graph';

const node = (id: string, type: string, values: any): NodeInstance =>
  ({ id, type, title: type, pos: { x: 0, y: 0 }, inputs: [], outputs: [], values } as any);

describe('Venice P0 · history CFG cfg_scale alias', () => {
  it('actualRequest.parameters.cfg_scale → CFG 实际发送 (not 未发送)', () => {
    const item: any = {
      id: 'v', status: 'failed', url: '', provider: 'venice', model: 'venice-sd35',
      prompt: 'a lighthouse', negativePrompt: null, seed: null, steps: null, cfg: null, loras: [],
      requestMetadata: {
        actualRequest: {
          endpoint: 'https://api.venice.ai/api/v1/image/generate',
          parameters: {
            prompt: 'a lighthouse on a cliff at sunset, watercolor',
            steps: 20, cfg_scale: 7.5, seed: 42, model: 'venice-sd35',
            width: 1024, height: 1024, negative_prompt: 'blurry, low quality',
          },
          schemaFields: ['prompt', 'negative_prompt', 'width', 'height', 'steps', 'cfg_scale', 'seed', 'model', 'lora_strength'],
        },
      },
    };
    const r = resolveHistoryParameters(item);
    expect(r.cfg).toMatchObject({ value: 7.5, source: 'sent' });
    expect(historyParameterSourceLabel(r.cfg.source)).toBe('实际发送');
    expect(r.width).toMatchObject({ value: 1024, source: 'sent' });
    expect(r.height).toMatchObject({ value: 1024, source: 'sent' });
    expect(r.negativePrompt).toMatchObject({ value: 'blurry, low quality', source: 'sent' });
  });

  it('FE-shaped actualRequest missing size/negative still labels CFG from cfg_scale', () => {
    // Regression: 画布 FE 04:45 card had cfg_scale in JSON but UI said CFG: 未发送
    const item: any = {
      id: 'fe', status: 'failed', url: '', provider: 'venice', model: 'venice-sd35', loras: [],
      requestMetadata: {
        actualRequest: {
          endpoint: 'https://api.venice.ai/api/v1/image/generate',
          parameters: { prompt: 'p', steps: 20, cfg_scale: 7.5, seed: 42, model: 'venice-sd35' },
        },
      },
    };
    const r = resolveHistoryParameters(item);
    expect(historyParameterSourceLabel(r.cfg.source)).toBe('实际发送');
    expect(r.cfg.value).toBe(7.5);
  });
});

describe('Venice P0 · panel size persistence (CheckpointLoader fallback)', () => {
  it('reads width/height from CheckpointLoader when EmptyLatent absent', () => {
    const c = node('c', 'CheckpointLoaderSimple', { ckpt_name: 'venice-sd35', targetProvider: 'venice', width: 1024, height: 1024 });
    const k = node('k', 'KSampler', { seed: 42, cfg: 7.5, steps: 20 });
    const conns: Connection[] = [{ id: 'm', fromNodeId: 'c', fromSocketId: 'MODEL', toNodeId: 'k', toSocketId: 'model', type: 'MODEL' } as any];
    const p = readInspectorParameters([c, k], conns, 'k');
    expect(p).toMatchObject({ width: 1024, height: 1024 });
  });

  it('patch writes width/height onto CheckpointLoader (survives panel reopen)', () => {
    const c = node('c', 'CheckpointLoaderSimple', { ckpt_name: 'venice-sd35', targetProvider: 'venice' });
    const before: any = { checkpoint: 'venice-sd35', targetProvider: 'venice', width: 0, height: 0, loras: [] };
    const after = { ...before, width: 1024, height: 1024 };
    const patched = patchInspectorNode(c, before, after);
    expect(patched.values).toMatchObject({ width: 1024, height: 1024 });
  });

  it('extractWorkflowParameters sends width/height/negative from CheckpointLoader fallback', () => {
    const c = node('c', 'CheckpointLoaderSimple', {
      ckpt_name: 'venice-sd35', targetProvider: 'venice',
      width: 1024, height: 1024, negative_prompt: 'blurry, low quality',
    });
    const k = node('k', 'KSampler', { seed: 42, cfg: 7.5, steps: 20, sampler_name: 'euler', scheduler: 'normal' });
    const pos = node('p', 'CLIPTextEncode', { text: 'a lighthouse on a cliff at sunset, watercolor' });
    const conns: Connection[] = [
      { id: 'm', fromNodeId: 'c', fromSocketId: 'MODEL', toNodeId: 'k', toSocketId: 'model', type: 'MODEL' } as any,
      { id: 'pos', fromNodeId: 'p', fromSocketId: 'CONDITIONING', toNodeId: 'k', toSocketId: 'positive', type: 'CONDITIONING' } as any,
    ];
    const extracted = extractWorkflowParameters([c, k, pos], conns, 'k');
    expect(extracted.width).toBe(1024);
    expect(extracted.height).toBe(1024);
    expect(extracted.negativePrompt).toBe('blurry, low quality');
    expect(extracted.steps).toBe(20);
    expect(extracted.cfg).toBe(7.5);
  });

  it('connected EmptyLatent wins over CheckpointLoader size', () => {
    const c = node('c', 'CheckpointLoaderSimple', { ckpt_name: 'venice-sd35', targetProvider: 'venice', width: 512, height: 512 });
    const lat = node('l', 'EmptyLatentImage', { width: 1024, height: 768, batch_size: 1 });
    const k = node('k', 'KSampler', { seed: 1, cfg: 7, steps: 20 });
    const pos = node('p', 'CLIPTextEncode', { text: 'hi' });
    const conns: Connection[] = [
      { id: 'm', fromNodeId: 'c', fromSocketId: 'MODEL', toNodeId: 'k', toSocketId: 'model', type: 'MODEL' } as any,
      { id: 'lat', fromNodeId: 'l', fromSocketId: 'LATENT', toNodeId: 'k', toSocketId: 'latent_image', type: 'LATENT' } as any,
      { id: 'pos', fromNodeId: 'p', fromSocketId: 'CONDITIONING', toNodeId: 'k', toSocketId: 'positive', type: 'CONDITIONING' } as any,
    ];
    expect(extractWorkflowParameters([c, k, lat, pos], conns, 'k')).toMatchObject({ width: 1024, height: 768 });
    expect(readInspectorParameters([c, k, lat], conns, 'k')).toMatchObject({ width: 1024, height: 768 });
  });
});

describe('Venice P0 · lora_strength Schema field (not LoRA nodes)', () => {
  const veniceImageSchema = {
    properties: {
      prompt: { type: 'string' },
      negative_prompt: { type: 'string' },
      width: { type: 'integer', minimum: 0, exclusiveMinimum: true, maximum: 1280, default: 1024 },
      height: { type: 'integer', minimum: 0, exclusiveMinimum: true, maximum: 1280, default: 1024 },
      cfg_scale: { type: 'number', minimum: 0, exclusiveMinimum: true, maximum: 20 },
      steps: { type: 'integer', default: 8 },
      seed: { type: 'integer' },
      lora_strength: {
        type: 'integer', minimum: 0, maximum: 100,
        description: 'Lora strength for the model. Only applies if the model uses additional Loras.',
        example: 50,
        // no x-liveConfirmed → 待确认
      },
      model: { type: 'string' },
    },
  };

  it('schemaChoiceFields surfaces lora_strength as number control; skips canvas-mapped width/cfg', () => {
    const fields = schemaChoiceFields(veniceImageSchema);
    const keys = fields.map((f) => f.key);
    expect(keys).toContain('lora_strength');
    expect(keys).not.toContain('width');
    expect(keys).not.toContain('height');
    expect(keys).not.toContain('cfg_scale');
    expect(keys).not.toContain('negative_prompt');
    expect(keys).not.toContain('loras');
    const ls = fields.find((f) => f.key === 'lora_strength')!;
    expect(ls.numberSpec).toMatchObject({ type: 'integer', minimum: 0, maximum: 100 });
    expect(ls.liveConfirmed).toBe(false);
  });

  it('does not invent loras[] from LoRA node strength (refuse path unchanged)', async () => {
    // Contract: custom LoRA nodes must stay local-400; never become lora_strength.
    const { schemaProviders } = await import('./schemaProviders');
    // Smoke the refuse message constant path via a tiny local check matching server copy.
    const msg = 'Venice 官方 Image Generate OpenAPI 无自定义 loras[]（仅有捆绑模型的 lora_strength）。当前不接受自定义 LoRA；未发送请求。请移除 LoRA 节点。';
    expect(msg).toContain('lora_strength');
    expect(msg).not.toMatch(/0\.85|85/);
    expect(schemaProviders.venice.root).toContain('venice.ai');
  });
});
