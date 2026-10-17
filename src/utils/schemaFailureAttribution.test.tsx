// @vitest-environment jsdom
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { executeWorkflow, clearNodeExecutionErrors } from './graphEngine';
import { schemaFailureHeadline, schemaFailureNodeMessage, schemaFailureTargetId, isSchemaPrefetchError, schemaFailureToast, schemaFailureToastBody } from './schemaFailure';
import { toastFromRunError } from './apiFailure';
import { schemaPrefetchFailureData } from '../engines/drivers/SchemaProviderDriver';
import { EngineRegistry } from '../engines/EngineRegistry';
import { NodeItem } from '../components/NodeItem';
import { NODE_DEFINITIONS } from '../constants/nodes';
import type { Connection, NodeInstance } from '../types/graph';

const node = (id: string, type: string, values: Record<string, any> = {}): NodeInstance =>
  ({ id, type, title: type, pos: { x: 0, y: 0 }, inputs: [], outputs: [], values, state: 'idle' } as unknown as NodeInstance);

const MODEL = 'org/some-model_v2.1-turbo-with-a-very-long-name';
const RAW = '{"error":"tool not found: org/some-model_v2.1-turbo-with-a-very-long-name"}';
const schemaErr = (status = 400) => {
  const url = `/api/model-schema?provider=openworks&model=${encodeURIComponent(MODEL)}`;
  return Object.assign(new Error(`GET ${url} → HTTP ${status} · 生成 POST 未发送\n${RAW}`), {
    name: 'SchemaPrefetchError',
    data: schemaPrefetchFailureData(status, RAW),
  });
};

const graph = () => {
  const nodes = [
    node('c', 'CheckpointLoaderSimple', { targetProvider: 'fal', ckpt_name: 'fal-ai/flux/dev' }),
    node('p', 'CLIPTextEncode', { text: 'a cat' }),
    node('k', 'KSampler', { steps: 20 }),
    node('d', 'VAEDecode', {}),
    node('s', 'SaveImage', {}),
  ];
  const connections: Connection[] = [
    { id: 'm', fromNodeId: 'c', fromSocketId: 'MODEL', toNodeId: 'k', toSocketId: 'model', type: 'MODEL' },
    { id: 'pk', fromNodeId: 'p', fromSocketId: 'CONDITIONING', toNodeId: 'k', toSocketId: 'positive', type: 'CONDITIONING' },
    { id: 'kd', fromNodeId: 'k', fromSocketId: 'LATENT', toNodeId: 'd', toSocketId: 'samples', type: 'LATENT' },
    { id: 'ds', fromNodeId: 'd', fromSocketId: 'IMAGE', toNodeId: 's', toSocketId: 'images', type: 'IMAGE' },
  ] as Connection[];
  return { nodes, connections };
};

describe('model-schema failure is attributed to the model (loader) node, not the sampler', () => {
  afterEach(() => vi.restoreAllMocks());

  it('executeWorkflow: loader ends error with the plain headline; KSampler never ends 异常 (error)', async () => {
    const { nodes, connections } = graph();
    vi.spyOn(EngineRegistry, 'generate').mockRejectedValue(schemaErr());
    const calls: Array<[string, string, string | undefined]> = [];
    await expect(executeWorkflow(nodes, connections, (id, state, _p, _o, msg) => { calls.push([id, state!, msg]); }, undefined, 's'))
      .rejects.toMatchObject({ name: 'SchemaPrefetchError' });
    const last = (id: string) => calls.filter((c) => c[0] === id).at(-1);
    expect(last('c')?.[1]).toBe('error');
    expect(last('c')?.[2]?.split('\n')[0]).toBe(`没出图：找不到模型 ${MODEL}，请检查模型名`);
    expect(last('c')?.[2]).toContain(RAW); // upstream body verbatim below the headline
    expect(last('k')?.[1]).toBe('idle'); // left running → reset (runningIds), never error
    expect(last('s')?.[1]).toBe('idle');
    expect(calls.some((c) => c[0] === 'k' && c[1] === 'error')).toBe(false);
  });

  it('non-schema failures keep the old behaviour (sampler/target is the error node)', async () => {
    const { nodes, connections } = graph();
    vi.spyOn(EngineRegistry, 'generate').mockRejectedValue(new Error('HTTP 500 boom'));
    const calls: Array<[string, string]> = [];
    await expect(executeWorkflow(nodes, connections, (id, state) => { calls.push([id, state!]); }, undefined, 'k')).rejects.toThrow(/500/);
    expect(calls.filter((c) => c[0] === 'k').at(-1)).toEqual(['k', 'error']);
  });

  it('copy: full model name (never truncated), headline + raw body; non-400/404 not claimed as 找不到', () => {
    expect(isSchemaPrefetchError(schemaErr())).toBe(true);
    const msg = schemaFailureNodeMessage(schemaErr());
    expect(msg.split('\n')[0]).toBe(`没出图：找不到模型 ${MODEL}，请检查模型名`);
    expect(msg.split('\n').slice(1).join('\n')).toBe(RAW);
    expect(msg).not.toContain('/api/model-schema');
    expect(msg).not.toContain('上一次');
    expect(schemaFailureHeadline(MODEL, 404)).toContain('找不到模型');
    expect(schemaFailureHeadline(MODEL, 401)).toBe(`没出图：读取模型 ${MODEL} 的参数失败（HTTP 401），请检查 API Key`);
    expect(schemaFailureHeadline(MODEL, 503)).toBe(`没出图：读取模型 ${MODEL} 的参数失败（HTTP 503）`);
  });

  it('target resolution walks SaveImage → VAE → KSampler → loader', () => {
    const { nodes, connections } = graph();
    expect(schemaFailureTargetId(nodes, connections, 's')).toBe('c');
    expect(schemaFailureTargetId(nodes, connections, 'k')).toBe('c');
  });

  it('re-run start (full clear) drops the prior schema banner + errorKind', () => {
    const nodes = [{ ...node('c', 'CheckpointLoaderSimple'), state: 'error', errorMessage: schemaFailureNodeMessage(schemaErr()), errorAt: '2026-10-17T07:35:20.000Z', errorKind: 'schema' }] as NodeInstance[];
    const [c] = clearNodeExecutionErrors(nodes);
    expect(c.state).toBe('idle');
    expect(c.errorMessage).toBeUndefined();
    expect(c.errorAt).toBeUndefined();
    expect(c.errorKind).toBeUndefined();
  });

  it('re-run start clears SaveImage upstreamFailed overlay (这次没有出图) even with no errorMessage', () => {
    const nodes = [
      { ...node('c', 'CheckpointLoaderSimple'), state: 'error', errorMessage: schemaFailureNodeMessage(schemaErr()), errorKind: 'schema', upstreamFailed: false },
      { ...node('s', 'SaveImage'), state: 'idle', upstreamFailed: true, upstreamLocalBlocked: false },
    ] as NodeInstance[];
    const cleared = clearNodeExecutionErrors(nodes);
    expect(cleared[0].errorMessage).toBeUndefined();
    expect(cleared[0].upstreamFailed).toBe(false);
    expect(cleared[1].upstreamFailed).toBe(false);
    expect(cleared[1].upstreamLocalBlocked).toBeUndefined();
  });

  it('toast title = headline (full model name), body = one status line, no duplicated HTTP', () => {
    const t = schemaFailureToast(schemaErr(400), '运行：保存图像');
    expect(t.title).toBe(`没出图：找不到模型 ${MODEL}，请检查模型名`);
    expect(t.title).toContain(MODEL); // full name, never ellipsized in the string
    expect(t.message.split('\n')[0]).toBe(schemaFailureToastBody(400));
    expect(t.message.split('\n')[0]).toBe('查模型参数时返回 HTTP 400，生成请求没有发出去');
    expect(t.title).not.toMatch(/^HTTP /);
    // no 「HTTP 400 · HTTP 400」
    expect(t.title).not.toContain('HTTP 400 · HTTP 400');
    expect(t.message).toContain(RAW); // raw stays under 展开全文
    expect(t.message).toContain('运行：保存图像');
    // toastFromRunError routes SchemaPrefetchError the same way
    const via = toastFromRunError(schemaErr(400), '运行：保存图像')!;
    expect(via.title).toBe(t.title);
    expect(via.message.split('\n')[0]).toBe(t.message.split('\n')[0]);
  });

  it('App: run start uses the full clear (not keepUpstreamFailures) and the catch targets the loader on schema failure', () => {
    const app = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');
    const start = app.indexOf('setIsExecuting(true);');
    const execCall = app.indexOf('await executeWorkflow(', start);
    const runStart = app.slice(start, execCall);
    expect(runStart).toContain('setNodes((prev) => clearNodeExecutionErrors(prev));');
    expect(runStart).not.toContain('keepUpstreamFailures: true');
    expect(app).toContain('schemaFailureTargetId(activeNodes, activeConns');
    expect(app).toContain("errorKind: 'schema' as const");
  });
});

describe('NodeItem shows one plain schema error (headline + collapsed 详情), no 上一次/URL headline, no duplicate', () => {
  const render = (zoom: number) => {
    const def = (NODE_DEFINITIONS as any).CheckpointLoaderSimple;
    return renderToStaticMarkup(
      <NodeItem
        node={{ id: 'c', type: 'CheckpointLoaderSimple', title: def.title, pos: { x: 0, y: 0 }, width: 320, inputs: def.inputs, outputs: def.outputs,
          values: { targetProvider: 'openworks', ckpt_name: MODEL }, state: 'error',
          errorMessage: schemaFailureNodeMessage(schemaErr()), errorAt: '2026-10-17T07:35:20.000Z', errorKind: 'schema' } as any}
        isSelected={false} zoom={zoom}
        onSelect={() => {}} onStartDrag={() => {}} onUpdateValue={() => {}} onDeleteNode={() => {}} onToggleCollapse={() => {}}
        onToggleBypass={() => {}} onStartConnecting={() => {}} onEndConnecting={() => {}}
      />,
    );
  };
  const count = (s: string, sub: string) => s.split(sub).length - 1;

  it('normal zoom: headline visible; raw only inside collapsed 详情; 异常 badge does not replace title', () => {
    const html = render(1);
    expect(html).toContain(`没出图：找不到模型 ${MODEL}，请检查模型名`);
    expect(html).toContain('data-testid="node-error-details"');
    expect(html).toContain('详情');
    expect(html).toContain('data-testid="node-error-raw"');
    expect(html).toContain('tool not found'); // RAW is HTML-escaped in markup; content still present inside <details>
    expect(html).toContain('data-testid="node-error-badge"');
    expect(html).toContain('shrink-0'); // badge must not cover the title
    expect(html).not.toContain('node-zoom-alerts');
    expect(html).not.toContain('上一次');
    expect(html).not.toContain('GET /api/model-schema');
    expect(count(html, `没出图：找不到模型 ${MODEL}`)).toBe(2); // visible text + 异常 chip tooltip only
  });

  it('zoomed out: strip only, inner banner hidden (never both)', () => {
    const html = render(0.5);
    expect(html).toContain('node-zoom-alerts');
    expect(html).not.toContain('data-testid="node-error-banner"');
  });
});
