// clean-1005: (1) select-model + run → one Schema GET  (2) LoRA node shows same 底模连线断开  (3) wire delete is double-click only
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sharedGetJson, clearSharedGet, beginSharedGetAction, sharedGetEpoch } from '../services/sharedGet';
import { noteUserModelSelection } from '../services/userModelSelection';
import { SchemaProviderDriver } from '../engines/drivers/SchemaProviderDriver';
import { modelChainBreak, modelChainBreakDetail } from './graphEngine';
import { NodeItem } from '../components/NodeItem';
import { NODE_DEFINITIONS as D } from '../constants/nodes';

const MODEL = 'wavespeed-ai/krea-v2/turbo-lora';
const URL_ = `/api/model-schema?provider=wavespeed&model=${encodeURIComponent(MODEL)}`;

describe('1 select-model + run → exactly one Schema GET', () => {
  afterEach(() => { vi.unstubAllGlobals(); clearSharedGet(); });
  it('noteUserModelSelection then driver.generate does not fetch again (same action)', async () => {
    const f = vi.fn(async (url: any, init?: any) => {
      if (String(url) === URL_) return new Response('{"inputSchema":{"properties":{"prompt":{},"seed":{}}}}', { status: 200 });
      if (init?.method === 'POST') return new Response('{"error":"stop"}', { status: 400 });
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', f);
    // Simulate App run paths: they must NOT call beginSharedGetAction (clean-1005).
    const epochBefore = sharedGetEpoch();
    await noteUserModelSelection('wavespeed', MODEL);
    expect(sharedGetEpoch()).toBe(epochBefore + 1);
    expect(f.mock.calls.filter((c: any[]) => String(c[0]) === URL_)).toHaveLength(1);
    await new SchemaProviderDriver('wavespeed').generate({ model: MODEL, prompt: 'p' } as any, {}).catch(() => {});
    expect(f.mock.calls.filter((c: any[]) => String(c[0]) === URL_)).toHaveLength(1);
  });
  it('failure is shared: run gets the same failed Schema result without a second GET', async () => {
    const f = vi.fn(async (url: any, init?: any) => {
      if (String(url) === URL_) return new Response('{"error":"boom"}', { status: 401 });
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', f);
    noteUserModelSelection('wavespeed', MODEL); // kicks off the shared (rejecting) GET
    const first = await sharedGetJson(URL_, {}).catch((e) => e);
    expect(f.mock.calls.filter((c: any[]) => String(c[0]) === URL_)).toHaveLength(1);
    await new SchemaProviderDriver('wavespeed').generate({ model: MODEL, prompt: 'p' } as any, {}).catch(() => {});
    expect(f.mock.calls.filter((c: any[]) => String(c[0]) === URL_)).toHaveLength(1);
    const second = await sharedGetJson(URL_, {}).catch((e) => e);
    expect(second).toBe(first);
  });
  it('beginSharedGetAction alone (old run behaviour) WOULD fetch again — lock that we no longer do that at run', async () => {
    const f = vi.fn(async () => new Response('{"inputSchema":{"properties":{"prompt":{}}}}', { status: 200 }));
    vi.stubGlobal('fetch', f);
    await noteUserModelSelection('wavespeed', MODEL);
    expect(f).toHaveBeenCalledTimes(1);
    beginSharedGetAction(); // what App used to do at run start
    await sharedGetJson(URL_, {});
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe('2 LoRA node shows the same 底模连线断开 sentence', () => {
  const nodes = [
    { id: 'ck', type: 'CheckpointLoaderSimple', title: '加载底模 (WaveSpeed)', values: { ckpt_name: 'm', targetProvider: 'wavespeed' } },
    { id: 'lora', type: 'LoRALoader', title: 'Load LoRA (Civitai / Local)', values: { lora_name: 'https://example.com/a.safetensors' } },
    { id: 'ks', type: 'KSampler', title: 'KSampler', values: {} },
  ] as any[];
  const connections = [
    { id: 'e1', fromNodeId: 'lora', fromSocketId: 'MODEL', toNodeId: 'ks', toSocketId: 'model', type: 'MODEL' },
    // missing: ck MODEL → lora model
  ] as any[];
  it('modelChainBreakDetail.atNodeId is the LoRA; message is the shared sentence', () => {
    const d = modelChainBreakDetail(nodes, connections, 'ks')!;
    expect(d.atNodeId).toBe('lora');
    expect(d.message).toBe(modelChainBreak(nodes, connections, 'ks'));
    expect(d.message).toContain('底模连线断开');
    expect(d.message).toContain('Load LoRA');
    expect(d.message).toContain('KSampler');
  });
  it('NodeItem renders that exact message (data-testid=node-model-chain-break)', () => {
    const d = modelChainBreakDetail(nodes, connections, 'ks')!;
    const def = D.LoRALoader;
    const html = renderToStaticMarkup(
      <NodeItem
        node={{ id: 'lora', type: 'LoRALoader', title: 'Load LoRA (Civitai / Local)', pos: { x: 0, y: 0 }, width: 300, inputs: def.inputs, outputs: def.outputs, values: { lora_name: 'x' }, state: 'idle' } as any}
        isSelected={false}
        zoom={1}
        onSelect={() => {}}
        onStartDrag={() => {}}
        onUpdateValue={() => {}}
        onDeleteNode={() => {}}
        onToggleCollapse={() => {}}
        onToggleBypass={() => {}}
        onStartConnecting={() => {}}
        onEndConnecting={() => {}}
        modelChainBreakMessage={d.message}
      />,
    );
    expect(html).toContain('data-testid="node-model-chain-break"');
    expect(html).toContain('底模连线断开');
    expect(html).toContain('model 输入没有连接');
    expect(html).toContain('Load LoRA');
  });
});

describe('3 wire delete is double-click only (no single-click delete)', () => {
  it('Canvas source: onDoubleClick deletes; onClick does not call onDeleteConnection', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(__dirname, '../components/Canvas.tsx'), 'utf8');
    expect(src).toContain('onDoubleClick');
    expect(src).toContain('wirePressRef');
    expect(src.indexOf('onDoubleClick')).toBeLessThan(src.lastIndexOf('onDeleteConnection(conn.id)'));
    expect(src).toContain('双击删除连线');
    // The single-click path must not delete (comment + stopPropagation only).
    expect(src).toMatch(/onClick=\{\(e\) => \{ e\.stopPropagation\(\); \/\* single click no longer deletes \*\/ \}\}/);
  });
});
