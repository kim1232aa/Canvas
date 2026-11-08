/**
 * OpenWorks builder regression tests for M114 review defects (P1-1, P1-2, P1-3, P2-2):
 * declared OBJECT/ARRAY/custom object/array/boolean/decimal,
 * type mismatch non-blocking (submitted upstream, diagnostic mapping),
 * positional slot matching before named extras,
 * full value preservation (seed:1.5, non-numeric, LoRA with extra fields).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { buildOpenWorksRequest, openWorksInputSchema, parseOpenWorksCatalog, registerOpenWorksRoutes } from './openWorksProvider';

const catalogRaw = readFileSync(path.resolve(__dirname, '../../docs/evidence/openworks-tool-list-2026-10-17.json'), 'utf8');
const tool = parseOpenWorksCatalog(200, catalogRaw).find((t: any) => t.name === 'photoreal_studio_z_image');

describe('P1-1: no local type gate — type mismatches submitted to upstream with diagnostic', () => {
  it('declared slot mismatch: catalog seed=INTEGER, sent 1.5 (non-integer), mapping expected INTEGER actual NUMBER', () => {
    const declaredSeed = { inputs: [{ type: 'STRING', description: 'prompt' }, { type: 'INTEGER', description: 'seed' }] };
    const schema = openWorksInputSchema(declaredSeed);
    const b = buildOpenWorksRequest('tool', schema, { prompt: 'test', seed: 1.5 });
    expect(b.ok).toBe(true); if (!b.ok) return;
    // Positional slot at index 1: sent as 1.5, not truncated
    expect(b.wire.inputs[1].type).toBe('INTEGER');
    expect(b.wire.inputs[1].value).toBe(1.5);
    const m = b.mapping.find((x) => x.from === 'seed' && x.sent);
    expect(m?.value).toBe(1.5);
    expect(m?.expected).toBe('INTEGER');
    expect(m?.actual).toBe('NUMBER');
    expect(m?.reason).toContain('类型不匹配');
  });

  it('declared slot mismatch: seed="abc" (string) sent as given, diagnostic in reason', () => {
    const declaredSeed = { inputs: [{ type: 'STRING', description: 'prompt' }, { type: 'INTEGER', description: 'seed' }] };
    const schema = openWorksInputSchema(declaredSeed);
    const b = buildOpenWorksRequest('tool', schema, { prompt: 'test', seed: 'abc' });
    expect(b.ok).toBe(true); if (!b.ok) return;
    expect(b.wire.inputs[1].type).toBe('INTEGER');
    expect(b.wire.inputs[1].value).toBe('abc');
    const m = b.mapping.find((x) => x.from === 'seed' && x.sent);
    expect(m?.value).toBe('abc');
    expect(m?.expected).toBe('INTEGER');
    expect(m?.actual).toBe('STRING');
    expect(m?.reason).toContain('类型不匹配');
  });

  it('undeclared seed:1.5 sent as NUMBER named extra, no mismatch diagnostic', () => {
    const schema = openWorksInputSchema(tool);
    const b = buildOpenWorksRequest('photoreal_studio_z_image', schema, { prompt: 'test', width: 768, height: 1024, seed: 1.5, custom_parameters: { 'result image count': 1 } });
    expect(b.ok).toBe(true); if (!b.ok) return;
    const named = (inputs: any[], n: string) => inputs.find((i) => i.name === n);
    const seedInput = named(b.wire.inputs, 'seed');
    expect(seedInput?.type).toBe('NUMBER');
    expect(seedInput?.value).toBe(1.5);
    const m = b.mapping.find((x) => x.from === 'seed' && x.sent);
    expect(m?.reason).toContain('catalog undeclared');
  });
});

describe('P1-2: seed/steps/cfg/clip_skip/checkpoint/loras match declared slot first, fallback to undeclared extras', () => {
  it('catalog declares seed INPUT → matched into positional slot, not named extra', () => {
    const declaredSeed = { inputs: [{ type: 'STRING', description: 'prompt' }, { type: 'INTEGER', description: 'seed' }] };
    const schema = openWorksInputSchema(declaredSeed);
    const b = buildOpenWorksRequest('tool', schema, { prompt: 'p', seed: 42 });
    expect(b.ok).toBe(true); if (!b.ok) return;
    // Positional inputs: [STRING prompt, INTEGER seed]; no named extras.
    expect(b.wire.inputs.length).toBe(2);
    expect(b.wire.inputs[0]).toEqual({ type: 'STRING', value: 'p' });
    expect(b.wire.inputs[1]).toEqual({ type: 'INTEGER', value: 42 });
    const namedSeed = b.wire.inputs.find((i: any) => i.name === 'seed');
    expect(namedSeed).toBeUndefined();
  });

  it('catalog declares no seed → goes out as named extra', () => {
    const undeclaredSeed = { inputs: [{ type: 'STRING', description: 'prompt' }] };
    const schema = openWorksInputSchema(undeclaredSeed);
    const b = buildOpenWorksRequest('tool', schema, { prompt: 'p', seed: 42 });
    expect(b.ok).toBe(true); if (!b.ok) return;
    expect(b.wire.inputs[0]).toEqual({ type: 'STRING', value: 'p' });
    const namedSeed = b.wire.inputs.find((i: any) => i.name === 'seed');
    expect(namedSeed?.type).toBe('INTEGER');
    expect(namedSeed?.value).toBe(42);
    const m = b.mapping.find((x) => x.from === 'seed' && x.sent);
    expect(m?.reason).toContain('catalog undeclared');
  });
});

describe('P1-3: full value preservation — seed:1.5 / non-numeric / LoRA extra fields', () => {
  it('seed:1.5 sent as 1.5, never Math.trunc', () => {
    const schema = openWorksInputSchema(tool);
    const b = buildOpenWorksRequest('photoreal_studio_z_image', schema, { prompt: 'test', seed: 1.5, custom_parameters: {} });
    expect(b.ok).toBe(true); if (!b.ok) return;
    const named = (inputs: any[], n: string) => inputs.find((i) => i.name === n)?.value;
    expect(named(b.wire.inputs, 'seed')).toBe(1.5);
  });

  it('LoRA {name, strength, trigger, clipStrength, custom: 123} fully preserved in lora_items JSON', () => {
    const schema = openWorksInputSchema({ inputs: [{ type: 'STRING', description: 'prompt' }] });
    const b = buildOpenWorksRequest('tool', schema, { prompt: 'p', loras: [{ name: 'lora-1', strength: 0.8, trigger: 'foo', clipStrength: 0.9, custom: 123 }] });
    expect(b.ok).toBe(true); if (!b.ok) return;
    const named = (inputs: any[], n: string) => inputs.find((i) => i.name === n)?.value;
    const items = JSON.parse(named(b.wire.inputs, 'diffusion.lora.items') as string);
    expect(items).toEqual([{ loraModel: 'lora-1', weight: 0.8, trigger: 'foo', clipStrength: 0.9, custom: 123 }]);
    const triggerMapping = b.mapping.find((x) => x.from === 'loras[0].trigger');
    expect(triggerMapping?.sent).toBe(true);
    expect(triggerMapping?.reason).toContain('LoRA 额外字段');
  });

  it('LoRA without strength (path-only) sent with id fields, no lora_weight', () => {
    const schema = openWorksInputSchema({ inputs: [{ type: 'STRING', description: 'prompt' }] });
    const b = buildOpenWorksRequest('tool', schema, { prompt: 'p', loras: [{ name: 'lora-path-only' }] });
    expect(b.ok).toBe(true); if (!b.ok) return;
    const named = (inputs: any[], n: string) => inputs.find((i) => i.name === n)?.value;
    expect(named(b.wire.inputs, 'lora_id')).toBe('lora-path-only');
    const wInput = b.wire.inputs.find((i: any) => i.name === 'lora_weight');
    expect(wInput).toBeUndefined();
  });
});

describe('P2-1: accurate diagnostic labels — undeclared/probe scope/missing/type mismatch', () => {
  it('custom_parameters.foo (not in catalog) marked "catalog undeclared / upstream adoption 未验证"', () => {
    const schema = openWorksInputSchema({ inputs: [{ type: 'STRING', description: 'prompt' }] });
    const b = buildOpenWorksRequest('tool', schema, { prompt: 'p', custom_parameters: { foo: 'bar' } });
    expect(b.ok).toBe(true); if (!b.ok) return;
    const m = b.mapping.find((x) => x.from === 'custom_parameters.foo');
    expect(m?.reason).toContain('catalog undeclared');
    expect(m?.reason).toContain('upstream adoption 未验证');
  });

  it('seed named extra reason mentions probe scope photoreal_studio_z_image + ignored_or_unproven', () => {
    const schema = openWorksInputSchema({ inputs: [{ type: 'STRING', description: 'prompt' }] });
    const b = buildOpenWorksRequest('tool', schema, { prompt: 'p', seed: 42 });
    expect(b.ok).toBe(true); if (!b.ok) return;
    const m = b.mapping.find((x) => x.from === 'seed' && x.sent);
    expect(m?.reason).toContain('photoreal_studio_z_image');
    expect(m?.reason).toContain('ignored_or_unproven');
  });

  it('unfilled official slot marked "未填写：官方 inputs[pos]…不补默认"', () => {
    const schema = openWorksInputSchema({ inputs: [{ type: 'STRING', description: 'prompt' }, { type: 'INTEGER', description: 'width' }] });
    const b = buildOpenWorksRequest('tool', schema, { prompt: 'p' });
    expect(b.ok).toBe(true); if (!b.ok) return;
    const m = b.mapping.find((x) => x.from === 'schema:width' && !x.sent);
    expect(m?.reason).toContain('未填写');
    expect(m?.reason).toContain('inputs[1]');
    expect(m?.reason).toContain('不补默认');
  });
});

describe('P2-2: catalog OBJECT/ARRAY types correctly mapped, fully roundtrip via route', () => {
  it('openWorksInputSchema OBJECT input → JSON Schema type:object with properties/required', () => {
    const objTool = { inputs: [{ type: 'OBJECT', description: 'config', schema: { properties: { foo: { type: 'string' } }, required: ['foo'] } }] };
    const schema = openWorksInputSchema(objTool);
    expect(schema.properties.config.type).toBe('object');
    expect(schema.properties.config.properties).toEqual({ foo: { type: 'string' } });
    expect(schema.properties.config.required).toEqual(['foo']);
  });

  it('custom_parameters object submitted as OBJECT wire type', () => {
    const schema = openWorksInputSchema({ inputs: [{ type: 'STRING', description: 'prompt' }] });
    const b = buildOpenWorksRequest('tool', schema, { prompt: 'p', custom_parameters: { nested: { a: 1, b: 'two' } } });
    expect(b.ok).toBe(true); if (!b.ok) return;
    const named = (inputs: any[], n: string) => inputs.find((i) => i.name === n);
    const obj = named(b.wire.inputs, 'nested');
    expect(obj?.type).toBe('OBJECT');
    expect(obj?.value).toEqual({ a: 1, b: 'two' });
  });

  it('custom_parameters array submitted as ARRAY wire type', () => {
    const schema = openWorksInputSchema({ inputs: [{ type: 'STRING', description: 'prompt' }] });
    const b = buildOpenWorksRequest('tool', schema, { prompt: 'p', custom_parameters: { items: [1, 2, 3] } });
    expect(b.ok).toBe(true); if (!b.ok) return;
    const named = (inputs: any[], n: string) => inputs.find((i) => i.name === n);
    const arr = named(b.wire.inputs, 'items');
    expect(arr?.type).toBe('ARRAY');
    expect(arr?.value).toEqual([1, 2, 3]);
  });

  it('custom_parameters boolean submitted as BOOLEAN wire type', () => {
    const schema = openWorksInputSchema({ inputs: [{ type: 'STRING', description: 'prompt' }] });
    const b = buildOpenWorksRequest('tool', schema, { prompt: 'p', custom_parameters: { enable: true } });
    expect(b.ok).toBe(true); if (!b.ok) return;
    const named = (inputs: any[], n: string) => inputs.find((i) => i.name === n);
    const bool = named(b.wire.inputs, 'enable');
    expect(bool?.type).toBe('BOOLEAN');
    expect(bool?.value).toBe(true);
  });

  it('registered route roundtrip: mismatch → upstream HTTP error preserved in 502/actualRequest', async () => {
    const app = express(); app.use(express.json({ limit: '5mb' }));
    const calls: Array<{ url: string; status: number; body: string }> = [];
    const fetch = async (_m: any, url: string, init?: any) => {
      calls.push({ url, status: 0, body: String(init?.body ?? '') });
      if (url.endsWith('/tool/list')) return new Response(catalogRaw, { status: 200 });
      // Upstream rejects type mismatch with 402
      if (url.endsWith('/task')) return new Response(JSON.stringify({ code: '999', message: 'type mismatch upstream error' }), { status: 402 });
      return new Response('{}', { status: 404 });
    };
    registerOpenWorksRoutes(app as any, { fetch: fetch as any, resolveKey: () => 'ak_tensor_testkey1234', durable: async () => ({ ok: true }), record: async (x: any) => x });
    const server = app.listen(0);
    try {
      const port = (server.address() as AddressInfo).port;
      const r = await globalThis.fetch(`http://127.0.0.1:${port}/api/schema-provider/openworks/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'photoreal_studio_z_image', prompt: 'test', seed: 'abc' }),
      });
      const j: any = await r.json();
      // Status reflects upstream error (402), not hidden 200
      expect(r.status).toBe(402);
      expect(j.errorSource).toBe('upstream');
      expect(j.rawResponse).toContain('type mismatch upstream error');
      expect(j.actualRequest).toBeDefined();
      expect(j.actualRequest.mapping).toBeDefined();
    } finally { server.close(); }
  });
});
