// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import express from 'express';
import catalog from '../server/__fixtures__wavespeed-live-2026-10-15.json';
import { registerSchemaProviderRoutes } from '../server/schemaProviders';
import { extractWorkflowParameters, clearNodeExecutionErrors } from './graphEngine';
import { widthHeightMismatch, sizeOrUndef, localBlockTitle, schemaReadLine, localBlockCauseNodeIds, revealNodeTransform, LOCAL_BLOCK_ZERO_TITLE, LOCAL_BLOCK_SCHEMA_TITLE } from './localBlock';
import { localNotOutboundText, localBlockToastReason } from './apiFailure';
import { requestLineParts, genRunHeader, groupAuxByOperation, auxOperationHeader } from '../components/ExecutionLog';
import { recordLocalEvent, getExecutions, isNonGenerationRecord } from '../services/executionTrace';
import { sharedGetJson, clearSharedGet, peekSharedGetMeta } from '../services/sharedGet';
import { noteUserModelSelection, schemaReuseFor, schemaRequestFor } from '../services/userModelSelection';

const read = (rel: string) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');

// ---------- server harness: same app for GET /api/model-schema and POST submit ----------
function serverApp() {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const app = express();
  registerSchemaProviderRoutes(app as any, {
    fetch: async (_m: any, url: string, init?: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify(init?.method === 'POST' ? { code: 200, data: { id: 't1' } } : catalog), { status: 200 }); },
    key: () => 'k', record: (i: any) => i, durable: async (u: string) => ({ ok: true, dataUrl: u }),
  } as any);
  const route = (path: string) => (app as any)._router.stack.find((l: any) => l.route?.path === path).route.stack[0].handle;
  const call = async (path: string, req: any) => {
    let status = 200; let payload: any;
    const res: any = { status(c: number) { status = c; return this; }, json(p: any) { payload = p; return this; } };
    await route(path)(req, res, () => {});
    return { status, payload };
  };
  return {
    calls,
    schema: (model: string) => call('/api/model-schema', { method: 'GET', path: '/api/model-schema', params: {}, query: { provider: 'wavespeed', model }, headers: {} }),
    submit: (body: any) => call('/api/schema-provider/:provider/submit', { method: 'POST', path: '/api/schema-provider/wavespeed/submit', params: { provider: 'wavespeed' }, query: {}, headers: {}, body }),
  };
}
const upstreamGets = (calls: Array<{ init?: RequestInit }>) => calls.filter((c) => (c.init?.method || 'GET') === 'GET').length;

// ---------- graph fixture ----------
const graph = (latent: Record<string, unknown>, ckpt: Record<string, unknown> = { width: 1024, height: 1024 }) => {
  const nodes: any[] = [
    { id: 'ck', type: 'CheckpointLoaderSimple', title: '', pos: { x: 0, y: 0 }, inputs: [], outputs: [], values: { ckpt_name: 'wavespeed-ai/z-image/turbo', targetProvider: 'wavespeed', ...ckpt } },
    { id: 'pos', type: 'CLIPTextEncode', title: '', pos: { x: 0, y: 0 }, inputs: [], outputs: [], values: { text: 'cat' } },
    { id: 'lat', type: 'EmptyLatentImage', title: '', pos: { x: 0, y: 0 }, inputs: [], outputs: [], values: { batch_size: 1, ...latent } },
    { id: 'ks', type: 'KSampler', title: '', pos: { x: 0, y: 0 }, inputs: [], outputs: [], values: { seed: 1, steps: 8, cfg: 1 } },
  ];
  const conns: any[] = [
    { id: 'c1', fromNodeId: 'ck', fromSocketId: 'model', toNodeId: 'ks', toSocketId: 'model' },
    { id: 'c2', fromNodeId: 'pos', fromSocketId: 'conditioning', toNodeId: 'ks', toSocketId: 'positive' },
    { id: 'c3', fromNodeId: 'lat', fromSocketId: 'latent', toNodeId: 'ks', toSocketId: 'latent_image' },
    { id: 'c4', fromNodeId: 'ck', fromSocketId: 'clip', toNodeId: 'pos', toSocketId: 'clip' },
  ];
  return { nodes, conns };
};

describe('clean-1333 #1 empty Empty Latent height never becomes 1024', () => {
  it('graph: connected Empty Latent with empty height → undefined even when the checkpoint holds 1024', () => {
    const { nodes, conns } = graph({ width: 1024, height: undefined });
    const p = extractWorkflowParameters(nodes, conns, 'ks');
    expect(p.width).toBe(1024);
    expect(p.height).toBeUndefined();
  });
  it('inspector: clearing width/height writes undefined, never `|| 1024`', () => {
    const src = read('../components/ParameterInspector.tsx');
    expect(src).not.toMatch(/parseInt\(e\.target\.value\)\s*\|\|\s*1024/);
    expect(src).toContain("update({ height: e.target.value === '' ||");
  });
  it('App: the inspector mirror no longer falls back to the stale checkpoint size (which the write-back copied into the Empty Latent)', () => {
    const app = read('../App.tsx');
    expect(app).not.toContain('Number(latentNode?.values.height) || Number(checkpointLoaderNode?.values?.height) || 0');
    expect(app).toContain('latentNode ? sizeOrUndef(latentNode.values.height) : sizeOrUndef(checkpointLoaderNode?.values?.height)');
    expect(app).not.toMatch(/asset\.(width|height) \?\? 1024/);
  });
  it('sizeOrUndef never invents a value', () => {
    expect(sizeOrUndef('')).toBeUndefined();
    expect(sizeOrUndef(undefined)).toBeUndefined();
    expect(sizeOrUndef(0)).toBeUndefined();
    expect(sizeOrUndef('768')).toBe(768);
  });
});

describe('clean-1333 #2 width/height mismatch blocks before ANY request', () => {
  it('reason text', () => {
    expect(widthHeightMismatch(1024, undefined)).toMatch(/^宽高不齐，未发 size：.*只填了宽度（1024）/);
    expect(widthHeightMismatch(undefined, 768)).toMatch(/^宽高不齐，未发 size：.*只填了高度（768）/);
    expect(widthHeightMismatch(1024, 1024)).toBeNull();
    expect(widthHeightMismatch(undefined, '')).toBeNull();
  });
  it('App runs the check before executeWorkflow (so no Schema GET / submit) and records a 0-request LOCAL row', () => {
    const app = read('../App.tsx');
    const check = app.indexOf('const mismatch = ext ? widthHeightMismatch(ext.width, ext.height, pairing) : null;');
    const exec = app.indexOf('const result = await executeWorkflow(');
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(exec);
    expect(app).toContain("recordLocalEvent('画布尺寸检查（Empty Latent 宽高）', data)");
  });
  it('the LOCAL row says 未发请求 · 0 个请求; title is the zero-request one; cause node = Empty Latent', () => {
    const data = { ok: false, errorSource: 'local', error: widthHeightMismatch(1024, undefined), blockedField: { field: 'size' } };
    const r = recordLocalEvent('画布尺寸检查（Empty Latent 宽高）', data);
    expect(getExecutions()[0]).toBe(r);
    expect(r.method).toBe('LOCAL');
    expect(requestLineParts(r).status).toBe(`${LOCAL_BLOCK_ZERO_TITLE} · 0 个请求`);
    expect(localBlockTitle(r.response)).toBe(LOCAL_BLOCK_ZERO_TITLE);
    const { nodes } = graph({ width: 1024 });
    expect(localBlockCauseNodeIds(nodes, new Set(nodes.map((n) => n.id)), 'size')).toEqual(['lat']);
  });
});

describe('clean-1333 #3 wording follows the request log', () => {
  it('server-side block after a Schema read → 「已读 Schema、未发生成」, never 未发请求 / 没有请求离开本机', () => {
    const fetched = { errorSource: 'local', error: 'x', schemaRead: { fetched: true, readAt: '2026-10-15T05:40:17.324Z' } };
    expect(localBlockTitle(fetched)).toBe(LOCAL_BLOCK_SCHEMA_TITLE);
    expect(schemaReadLine(fetched)).toBe('Schema：本次 GET 1 次（13:40:17（北京时间））；生成请求 0 个'.replace('（13:40:17（北京时间））', '（13:40:17（北京时间））'));
    const reused = { errorSource: 'local', error: 'x', schemaRead: { reused: true, readAt: '2026-10-15T05:39:45.149Z' } };
    expect(schemaReadLine(reused)).toContain('复用 13:39:45');
    expect(schemaReadLine(reused)).toContain('未重新请求');
    expect(localNotOutboundText(fetched)).toBe('本地拦截 · 已读 Schema、未发生成：x');
    for (const t of [localBlockTitle(fetched), schemaReadLine(fetched), localNotOutboundText(fetched)]) expect(t).not.toMatch(/未发请求|没有请求离开本机/);
  });
  it('server LOCAL_BLOCK_PREFIX and throw texts say 未发生成 / 未发送生成请求', () => {
    const src = read('../server/schemaProviders.ts');
    expect(src).toContain("export const LOCAL_BLOCK_PREFIX='本地拦截 · 已读 Schema、未发生成'");
    expect(src).not.toContain('未发送请求');
  });
  it('a toast reason strips any of the three heads', () => {
    expect(localBlockToastReason(JSON.stringify({ error: '本地拦截 · 已读 Schema、未发生成\nVenice 官方原文：「x」' }))).toBe('Venice 官方原文：「x」');
  });
  it('z-image/turbo + LoRA: the block reuses the select-time Schema (0 upstream GETs at run) and says so', async () => {
    const s = serverApp();
    await s.schema('wavespeed-ai/z-image/turbo-lora');
    const before = upstreamGets(s.calls);
    const r = await s.submit({ model: 'wavespeed-ai/z-image/turbo-lora', prompt: 'p', width: 1024, height: 1024, loras: [{ path: 'https://x/a.safetensors', strength: 0.7 }, { path: 'https://x/b.safetensors', strength: 0.7 }, { path: 'https://x/c.safetensors', strength: 0.7 }, { path: 'https://x/d.safetensors', strength: 0.7 }] });
    expect(upstreamGets(s.calls)).toBe(before);
    expect(r.payload.schemaRead).toMatchObject({ fetched: false, reused: true, note: '复用，未重新请求' });
  });
});

describe('clean-1333 #4 Krea select + run = ONE Schema GET', () => {
  it('submit reuses the /api/model-schema read; schemaRead is echoed on success', async () => {
    const s = serverApp();
    await s.schema('wavespeed-ai/krea-v2/turbo-lora');
    expect(upstreamGets(s.calls)).toBe(1);
    const r = await s.submit({ model: 'wavespeed-ai/krea-v2/turbo-lora', prompt: 'p', aspect_ratio: '16:9', resolution: '2k', loras: [{ path: 'https://x/a.safetensors', strength: 0.75 }] });
    expect(r.status).toBe(200);
    expect(upstreamGets(s.calls)).toBe(1);
    expect(s.calls.filter((c) => c.init?.method === 'POST')).toHaveLength(1);
    expect(r.payload.schemaRead).toMatchObject({ reused: true, reusedFrom: '/api/model-schema' });
  });
  it('without a prior select the submit reads it once and says fetched', async () => {
    const s = serverApp();
    const r = await s.submit({ model: 'wavespeed-ai/krea-v2/turbo-lora', prompt: 'p' });
    expect(upstreamGets(s.calls)).toBe(1);
    expect(r.payload.schemaRead).toMatchObject({ fetched: true });
  });
  it('a refresh (new GET /api/model-schema) re-reads upstream', async () => {
    const s = serverApp();
    await s.schema('wavespeed-ai/krea-v2/turbo-lora');
    await s.schema('wavespeed-ai/krea-v2/turbo-lora');
    expect(upstreamGets(s.calls)).toBe(2);
  });
  it('client run reuse is logged as a LOCAL 「复用，未重新请求」 row (driver source)', () => {
    const d = read('../engines/drivers/SchemaProviderDriver.ts');
    expect(d).toContain("note: '复用，未重新请求'");
    expect(isNonGenerationRecord({ method: 'LOCAL', route: 'Schema 复用 · wavespeed · m' })).toBe(true);
  });
});

describe('clean-1333 #5/#6 only the cause node shows the reason (same text as the toast)', () => {
  it('Venice LoRA block → LoRA node only', () => {
    const nodes: any[] = [{ id: 'ck', type: 'CheckpointLoaderSimple' }, { id: 'l1', type: 'LoRALoader' }, { id: 'ks', type: 'KSampler' }, { id: 'lat', type: 'EmptyLatentImage' }];
    expect(localBlockCauseNodeIds(nodes, new Set(['ck', 'l1', 'ks', 'lat']), 'loras')).toEqual(['l1']);
    expect(localBlockCauseNodeIds(nodes, new Set(['ck', 'l1', 'ks', 'lat']), 'steps')).toEqual([]);
  });
  it('App: red box text = localBlockToastReason (toast body); other branch nodes get no generic box', () => {
    const app = read('../App.tsx');
    expect(app).toContain('const blockReason = localBlockedRun ? localBlockToastReason(err.rawBody) : undefined;');
    expect(app).toContain('localBlockReason:cause?blockReason:undefined');
    expect(app).toContain('title: blockTitle!, message: `${blockReason}');
    const node = read('../components/NodeItem.tsx');
    expect(node).toContain('node.localBlockReason && node.state !== \'running\'');
    expect(node).not.toContain('{node.upstreamLocalBlocked && node.state !== \'running\' && <p');
  });
  it('server marks LoRA-section refusals with blockedField.field = loras', () => {
    expect(read('../server/schemaProviders.ts')).toContain("e.blockedField={field:blockStage,reason:e.message}");
  });
  it('reveal: viewport-only pan below the toast, zoom unchanged', () => {
    const t = revealNodeTransform({ x: 100, y: 0, w: 300, h: 200 }, { x: 0, y: 20, scale: 1 }, { width: 1600, height: 900 }, { top: 200, bottom: 80 });
    expect(t).toEqual({ x: 0, y: 200, scale: 1 });
    expect(revealNodeTransform({ x: 100, y: 300, w: 300, h: 200 }, { x: 0, y: 0, scale: 1 }, { width: 1600, height: 900 }, { top: 200, bottom: 80 })).toBeNull();
  });
  it('clearNodeExecutionErrors clears the block fields on the next run', () => {
    const [n] = clearNodeExecutionErrors([{ id: 'l1', type: 'LoRALoader', state: 'idle', localBlockReason: 'r', localBlockTitle: 't' } as any]);
    expect(n.localBlockReason).toBeUndefined();
  });
  it('LOCAL rows are not counted as requests in group headers', () => {
    const rows: any[] = [{ method: 'POST', route: '/api/schema-provider/x/submit' }, { method: 'LOCAL', route: 'Schema 复用 · x' }];
    expect(genRunHeader({ key: 'k', label: '第 1 次运行', records: rows })).toBe('第 1 次运行 · 1 条请求 · 本地记录 1 条（未发请求）');
    const aux = groupAuxByOperation([{ method: 'LOCAL', route: 'Schema 复用 · x', opSeq: 1, opLabel: '选用模型' } as any, { method: 'LOCAL', route: 'Schema 复用 · x', opSeq: 1, opLabel: '选用模型' } as any]);
    expect(auxOperationHeader(aux[0])).not.toContain('异常');
  });
});

describe('clean-1333 #6 details', () => {
  it('KSampler slider label (去噪强度) never wraps; badge wraps instead', () => {
    const node = read('../components/NodeItem.tsx');
    expect(node).toContain('<span className="whitespace-nowrap shrink-0" data-testid={`widget-label-${widget.name}`}>{widget.label}</span>');
  });
  it('Fit View tooltip is closed on click (no :hover residue)', () => {
    const dock = read('../components/ModernToolDock.tsx');
    expect(dock).toContain('onClick={() => { setFitTip(false); onFitView(); }}');
    expect(dock).toContain('{fitTip && <span role="tooltip" data-testid="fit-view-tooltip"');
    expect(dock).not.toContain('group-hover:opacity-100">自适应缩放');
  });
});

describe('clean-1333 #7 reuse of a failed Schema GET is labelled and logged', () => {
  beforeEach(() => { clearSharedGet(); });
  it('re-selecting the same model after a failure: no new GET, label 「复用上次失败（北京时间 HH:MM:SS）」, LOCAL row 复用，未重新请求', async () => {
    let n = 0;
    const fetchImpl: any = async () => { n++; return new Response('{"error":{"message":"Unauthorized"}}', { status: 401 }); };
    const { url, headers } = schemaRequestFor('together', 'm-1333');
    // first selection (simulated through sharedGet with the same URL/headers)
    noteUserModelSelection('together', 'm-1333');
    await sharedGetJson(url, headers, { fetchImpl, force: true }).catch(() => {});
    await new Promise((r) => setTimeout(r, 0));
    expect(peekSharedGetMeta(url, headers)?.settledAt).toBeTruthy();
    const before = getExecutions().length;
    await noteUserModelSelection('together', 'm-1333')?.catch(() => {});
    expect(n).toBe(1);
    const row = getExecutions()[0];
    expect(getExecutions().length).toBe(before + 1);
    expect(row.method).toBe('LOCAL');
    expect((row.response as any).note).toBe('复用，未重新请求');
    expect(schemaReuseFor('together', 'm-1333')?.label).toMatch(/^复用上次失败（北京时间 \d{2}:\d{2}:\d{2}）$/);
  });
  it('the label is rendered under the model select with the retry hint', () => {
    const src = read('../components/ProviderModelSelect.tsx');
    expect(src).toContain('<SchemaReuseNote provider={provider} model={value} />');
    expect(src).toContain('复用，未重新请求。要重试：点刷新，或换一个模型。');
  });
});
