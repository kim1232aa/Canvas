/**
 * 雁 2026-10-17 15:27（推翻同日下午「只发四字段」口径）：OpenWorks 发全参数——
 * checkpoint / seed / steps / cfg / negative / clip_skip / LoRA(id+weight) 作为 named inputs 追加在 Schema 四项之后（TAMS 字段名作参考）。
 * 历史只标「实际发送」，绝不写「已生效」。LoRA 节点不因 tool Schema 无 LoRA 字段而禁用。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { buildOpenWorksRequest, openWorksInputSchema, parseOpenWorksCatalog, registerOpenWorksRoutes } from './openWorksProvider';
import { resolveHistoryParameters, historyUpstreamTaskId, sentHistoryLoras, historySeedStatement, historyParameterSourceLabel } from '../utils/historyParameters';
import { historyUnsupportedRows } from '../components/HistoryModal';
import { schemaSendStatus } from '../utils/schemaSendStatus';
import { isSchemaOmitCandidate } from '../utils/schemaSendHint';
import { isLoraUnsupportedOnEndpoint } from '../utils/resolveCheckpoint';

const catalogRaw = readFileSync(path.resolve(__dirname, '../../docs/evidence/openworks-tool-list-2026-10-17.json'), 'utf8');
const tools = parseOpenWorksCatalog(200, catalogRaw);
const tool = tools.find((t: any) => t.name === 'photoreal_studio_z_image');
const schema = openWorksInputSchema(tool);
const PROMPT = readFileSync(path.resolve(__dirname, '../../docs/evidence/openworks-recipe-969797570538788432-2026-10-17/prompt.txt'), 'utf8').trim();
// Test fixture ids only (checkpoint/LoRA ids from the earlier openworks-lora-probe evidence); not a recipe claim.
const BOARD = { model: 'photoreal_studio_z_image', prompt: PROMPT, width: 768, height: 1344, seed: 42, steps: 20, cfg: 7, negative_prompt: 'blurry',
  checkpoint: '940566212906107758', clip_skip: 2, loras: [{ name: '969483275569466663', strength: 0.8 }],
  custom_parameters: { 'result image count': 1 } };
const named = (inputs: any[], n: string) => inputs.find((i) => i.name === n)?.value;

describe('OpenWorks full-params submit (雁 2026-10-17 15:27)', () => {
  it('wire = Schema 4 positional inputs, then named seed/steps/cfg/clip_skip/checkpoint/negative/LoRA', () => {
    const b = buildOpenWorksRequest('photoreal_studio_z_image', schema, BOARD);
    expect(b.ok).toBe(true); if (!b.ok) return;
    expect(b.wire.inputs.slice(0, 4)).toEqual([{ type: 'STRING', value: PROMPT }, { type: 'INTEGER', value: 768 }, { type: 'INTEGER', value: 1344 }, { type: 'INTEGER', value: 1 }]);
    const i = b.wire.inputs;
    expect(named(i, 'seed')).toBe(42); expect(named(i, 'steps')).toBe(20);
    expect(named(i, 'cfg')).toBe(7); expect(named(i, 'cfg_scale')).toBe(7);
    expect(named(i, 'clip_skip')).toBe(2);
    expect(named(i, 'checkpoint')).toBe('940566212906107758'); expect(named(i, 'sdModel')).toBe('940566212906107758');
    expect(named(i, 'negative_prompt')).toBe('blurry');
    expect(named(i, 'loras')).toBe('969483275569466663');
    expect(named(i, 'lora_id')).toBe('969483275569466663');
    expect(named(i, 'lora_weight')).toBe(0.8);
    expect(JSON.parse(named(i, 'diffusion.lora.items'))).toEqual([{ loraModel: '969483275569466663', weight: 0.8 }]);
    for (const f of ['seed', 'steps', 'cfg', 'negative_prompt', 'loras', 'checkpoint', 'clip_skip']) expect(b.mapping.find((m) => m.from === f && m.sent), f).toBeTruthy();
    expect(b.parameters).toMatchObject({ seed: 42, steps: 20, cfg: 7, negative_prompt: 'blurry', checkpoint: '940566212906107758', loras: [{ name: '969483275569466663', strength: 0.8 }] });
    expect(b.schemaFields).toEqual(expect.arrayContaining(['seed', 'steps', 'cfg', 'loras', 'checkpoint', 'negative_prompt']));
  });

  it('board badges: seed/steps/cfg/negative/LoRA 会发送; LoRA node not greyed out by Schema', () => {
    const props = Object.keys(schema.properties);
    for (const f of ['seed', 'steps', 'cfg', 'negative_prompt', 'loras']) {
      expect(isSchemaOmitCandidate('openworks', f, undefined, props), f).toBe(false);
      expect(schemaSendStatus('openworks', f, 1, undefined, props), f).toBe('will_send');
    }
    expect(isLoraUnsupportedOnEndpoint('openworks', 'photoreal_studio_z_image').unsupported).toBe(false);
  });

  it('route: upstream POST /task body carries the LoRA + params; failures not swallowed', async () => {
    const app = express(); app.use(express.json({ limit: '5mb' }));
    const calls: Array<{ url: string; body: string }> = [];
    const fetch = async (_m: any, url: string, init?: any) => {
      calls.push({ url, body: String(init?.body ?? '') });
      if (url.endsWith('/tool/list')) return new Response(catalogRaw, { status: 200 });
      if (url.endsWith('/task')) return new Response(JSON.stringify({ code: '0', data: { task: { id: '1056337678334704919' } } }), { status: 200 });
      return new Response('{}', { status: 404 });
    };
    registerOpenWorksRoutes(app as any, { fetch: fetch as any, resolveKey: () => 'ak_tensor_testkey1234', durable: async () => ({ ok: true }), record: async (x: any) => x });
    const server = app.listen(0);
    try {
      const port = (server.address() as AddressInfo).port;
      const r = await globalThis.fetch(`http://127.0.0.1:${port}/api/schema-provider/openworks/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(BOARD) });
      const j: any = await r.json();
      expect(r.status).toBe(200);
      const wire = JSON.parse(calls.find((c) => c.url.endsWith('/task'))!.body);
      expect(Object.keys(wire).sort()).toEqual(['inputs', 'toolName']);
      expect(named(wire.inputs, 'lora_id')).toBe('969483275569466663');
      expect(named(wire.inputs, 'lora_weight')).toBe(0.8);
      expect(named(wire.inputs, 'seed')).toBe(42);
      expect(j.actualRequest.upstreamTaskId).toBe('1056337678334704919');
      expect(j.actualRequest.parameters.loras).toEqual([{ name: '969483275569466663', strength: 0.8 }]);
    } finally { server.close(); }
  });
});

describe('OpenWorks history: filled params/LoRA are 实际发送 (never 已生效, never 这次没用上)', () => {
  const b = buildOpenWorksRequest('photoreal_studio_z_image', schema, BOARD);
  if (!b.ok) throw new Error('build failed');
  const actualRequest = { endpoint: 'https://openapi.tensor.art/openworks/v1/task', parameters: b.parameters, mapping: b.mapping, schemaFields: b.schemaFields, upstreamTaskId: '1056337678334704919' };
  const item: any = { id: 'hist_owfull', status: 'success', provider: 'Tensor.Art OpenWorks', model: 'photoreal_studio_z_image', timestamp: 0, url: 'https://x/a.png', prompt: PROMPT,
    seed: 42, steps: 20, cfg: 7, width: 768, height: 1344, loras: [{ name: '969483275569466663', strength: 0.8 }],
    requestMetadata: { actualRequest, submit: { taskId: '1056337678334704919', actualRequest } } };

  it('seed/steps/cfg/negative → source sent (实际发送)', () => {
    const r = resolveHistoryParameters(item);
    for (const k of ['seed', 'steps', 'cfg', 'negativePrompt'] as const) expect(r[k].source, k).toBe('sent');
    expect(historyParameterSourceLabel('sent')).toBe('实际发送');
    const unused = historyUnsupportedRows(r as any).map((x) => x.key);
    for (const k of ['seed', 'steps', 'cfg', 'negativePrompt']) expect(unused, k).not.toContain(k);
    expect(historySeedStatement(item)).toMatch(/42/);
  });

  it('LoRA chip shows name + strength; no label says 已生效', () => {
    expect(sentHistoryLoras(item)).toEqual([{ name: '969483275569466663', strength: 0.8 }]);
    const src = readFileSync(path.resolve(__dirname, '../components/HistoryModal.tsx'), 'utf8');
    expect(src).not.toMatch(/已生效/);
    expect(historyUpstreamTaskId(item)).toBe('1056337678334704919');
  });
});
