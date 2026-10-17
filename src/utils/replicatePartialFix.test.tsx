import { describe, expect, it } from 'vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { SchemaChoiceControls, schemaChoiceFields } from '../components/SchemaChoiceControls';
import { schemaSendStatus } from './schemaSendStatus';
import { resolveHistoryParameters, historySeedRowText, historySeedStatement } from './historyParameters';
import { canvasLorasForCheckpoint } from './canvasLoras';
import { resolveSchemaRefs } from '../server/schemaProviders';

// Live snapshot: GET https://api.replicate.com/v1/models/black-forest-labs/flux-dev-lora (2026-10-16)
const live = JSON.parse(readFileSync('docs/evidence/replicate-flux-dev-lora-openapi-2026-10-16.json', 'utf8'));
const openapi = live.latest_version.openapi_schema;
const rawInput = openapi.components.schemas.Input;
const declared = Object.keys(rawInput.properties);
const cp = JSON.stringify({ lora_scale: 0.85, _canvas: { scope: { provider: 'replicate', model: 'black-forest-labs/flux-dev-lora' }, schemaProperties: declared } });

describe('#1 Schema panel shows lora_weights and send badges (flux-dev-lora live Schema)', () => {
  it('lora_weights (plain string) is a panel field; secrets are not', () => {
    const keys = schemaChoiceFields(rawInput, openapi).map((f) => f.key);
    expect(keys).toContain('lora_weights');
    expect(keys).toContain('extra_lora');
    expect(keys).not.toContain('hf_api_token');
    expect(keys).not.toContain('civitai_api_token');
  });
  it('lora_weights badge = 会发送 <LoRA node name>（来自 LoRA 节点）, same value as actualRequest.input.lora_weights', () => {
    const html = renderToStaticMarkup(<SchemaChoiceControls inputSchema={rawInput} openapi={openapi} value={cp} onChange={() => {}} canvasLoras={[{ name: 'fofr/flux-pixar-cars' }]} />);
    expect(html).toMatch(/schema-badge-lora_weights[^>]*>会发送 fofr\/flux-pixar-cars（来自 LoRA 节点）/);
    expect(html).toMatch(/schema-badge-lora_scale[^>]*>会发送 0.85/);
    expect(html).toMatch(/schema-badge-extra_lora[^>]*>未填写，不发送/);
  });
  it('without a LoRA node lora_weights is 未填写，不发送; node surface without graph says 取自画布 LoRA 节点', () => {
    expect(renderToStaticMarkup(<SchemaChoiceControls inputSchema={rawInput} openapi={openapi} value={cp} onChange={() => {}} canvasLoras={[]} />)).toMatch(/schema-badge-lora_weights[^>]*>未填写，不发送/);
  });
  it('seed / steps / CFG(guidance) / LoRA get 会发送; sampler / negative / size get Schema 不支持', () => {
    expect(schemaSendStatus('replicate', 'seed', 7, cp)).toBe('will_send');
    expect(schemaSendStatus('replicate', 'steps', 28, cp)).toBe('will_send');
    expect(schemaSendStatus('replicate', 'cfg', 3, cp)).toBe('will_send');
    expect(schemaSendStatus('replicate', 'loras', [{ name: 'x' }], cp)).toBe('will_send');
    expect(schemaSendStatus('replicate', 'sampler', 'euler_ancestral', cp)).toBe('not_sent');
    expect(schemaSendStatus('replicate', 'negative_prompt', 'blurry', cp)).toBe('not_sent');
    expect(schemaSendStatus('replicate', 'width', 512, cp)).toBe('not_sent');
  });
  it('canvas LoRA order matches run extraction (nearest sampler first); bypassed skipped', () => {
    const nodes = [{ id: 'c', type: 'CheckpointLoaderSimple' }, { id: 'a', type: 'LoRALoader', values: { lora_name: 'A' } }, { id: 'b', type: 'LoRALoader', values: { lora_name: 'B' } }, { id: 'x', type: 'LoRALoader', bypassed: true, values: { lora_name: 'X' } }];
    const conns = [{ fromNodeId: 'c', toNodeId: 'a', toSocketId: 'model' }, { fromNodeId: 'a', toNodeId: 'b', toSocketId: 'model' }, { fromNodeId: 'c', toNodeId: 'x', toSocketId: 'model' }];
    expect(canvasLorasForCheckpoint('c', nodes, conns).map((l) => l.name)).toEqual(['B', 'A']);
  });
});

describe('#5 aspect_ratio allOf/$ref → enum dropdown', () => {
  it('client resolves allOf:[{$ref}] against the document', () => {
    const f = schemaChoiceFields(rawInput, openapi).find((x) => x.key === 'aspect_ratio')!;
    expect(f.enumValues).toEqual(openapi.components.schemas.aspect_ratio.enum);
    expect(f.defaultValue).toBe('1:1');
  });
  it('server-resolved inputSchema (resolveSchemaRefs) also yields the enum without the document', () => {
    const f = schemaChoiceFields(resolveSchemaRefs(rawInput, openapi)).find((x) => x.key === 'aspect_ratio')!;
    expect(f.enumValues).toContain('16:9');
    const html = renderToStaticMarkup(<SchemaChoiceControls inputSchema={rawInput} openapi={openapi} value={cp} onChange={() => {}} />);
    expect(html).toMatch(/aria-label="aspect_ratio"/);
    expect(html).toMatch(/schema-badge-aspect_ratio[^>]*>未填写，不发送（Schema 默认：1:1）/);
  });
});

const blocked: any = {
  id: 'h2', status: 'local_blocked', provider: 'replicate', model: 'black-forest-labs/flux-dev-lora', timestamp: 0, url: '',
  requestMetadata: { intendedRequest: { model: 'black-forest-labs/flux-dev-lora', negative_prompt: 'blurry, low quality', width: 512, height: 512, steps: 28, cfg: 3, seed: 7, sampler_name: 'euler_ancestral', custom_parameters: { lora_scale: 0.85, _canvas: { schemaProperties: declared } } } },
};
const failed: any = {
  id: 'h1', status: 'failed', provider: 'replicate', model: 'black-forest-labs/flux-dev-lora', timestamp: 0, url: '',
  requestMetadata: { actualRequest: { input: { prompt: 'p', seed: 7, num_inference_steps: 28, guidance: 3, lora_weights: 'fofr/flux-pixar-cars', lora_scale: 0.85 } } },
};

describe('#2 local_blocked 拟发送 chips follow Schema capability', () => {
  it('sampler / negative / width / height → unsupported; size 未发送 via aspect_ratio; seed/steps/cfg stay 拟发送', () => {
    const r = resolveHistoryParameters(blocked);
    expect(r.sampler.source).toBe('unsupported');
    expect(r.negativePrompt.source).toBe('unsupported');
    expect(r.width.source).toBe('unsupported');
    expect(r.height.source).toBe('unsupported');
    // Schema lists aspect_ratio ⇒ size row is plain 未发送 (fix5), not 「该端点不支持」
    expect(r.size.source).toBe('not-sent');
    expect(r.seed.source).toBe('intended');
    expect(r.steps.source).toBe('intended');
    expect(r.cfg.source).toBe('intended');
  });
});

describe('#4 seed row does not repeat 实际发送 next to the chip', () => {
  it('row text omits 实际发送; standalone statement unchanged', () => {
    expect(historySeedRowText(failed)).toBe('种子 7');
    expect(historySeedStatement(failed)).toBe('种子 7（实际发送）。上游未返回种子');
  });
});

describe('#3 negative row no longer clipped', () => {
  it('HistoryModal negative row has no line-clamp', () => {
    const src = readFileSync('src/components/HistoryModal.tsx', 'utf8');
    expect(src).toMatch(/data-testid="history-negative"/);
    expect(src).not.toMatch(/line-clamp-1">\s*负向/);
  });
});
