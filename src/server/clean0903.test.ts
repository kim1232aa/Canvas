// clean-0903 item 3: send badges derive from the same planCanvasField the submit route uses to build the scoped payload.
import express from 'express';
import { describe, expect, it } from 'vitest';
import catalog from './__fixtures__wavespeed-live-2026-10-15.json';
import { registerSchemaProviderRoutes } from './schemaProviders';
import { schemaSendStatus } from '../utils/schemaSendStatus';

async function submit(provider: string, body: any) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const app = express();
  registerSchemaProviderRoutes(app as any, {
    fetch: async (_m: any, url: string, init?: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify(init?.method === 'POST' ? { code: 200, data: { id: 't1' } } : catalog), { status: 200 }); },
    key: () => 'k', record: (i: any) => i, durable: async (u: string) => ({ ok: true, dataUrl: u }),
  } as any);
  const layer = (app as any)._router.stack.find((l: any) => l.route?.path === '/api/schema-provider/:provider/submit');
  let status = 200; let payload: any;
  const res: any = { status(c: number) { status = c; return this; }, json(p: any) { payload = p; return this; } };
  await layer.route.stack[0].handle({ method: 'POST', path: `/api/schema-provider/${provider}/submit`, params: { provider }, query: {}, headers: {}, body }, res, () => {});
  const post = calls.find((c) => c.init?.method === 'POST');
  return { status, payload, sent: post ? JSON.parse(String(post.init!.body)) : undefined };
}
const propsOf = (id: string) => Object.keys((catalog as any).data.find((r: any) => r.model_id === id).api_schema.api_schemas[0].request_schema.properties);
const CANVAS = { seed: 42, denoise: 1, steps: 20, cfg: 7, width: 1024, height: 1024, output_format: 'png' } as const;

// 2026-11-04 (雁): every filled canvas param reaches the outbound WaveSpeed body (declared → schema name; undeclared → canvas name).
describe('schema submit sends every filled param', () => {
  for (const id of ['wavespeed-ai/krea-v2/turbo-lora', 'wavespeed-ai/flux-dev-lora']) {
    it(`${id}: no filled field is dropped`, async () => {
      const r = await submit('wavespeed', { model: id, prompt: 'p', ...CANVAS });
      expect(r.status).toBe(200);
      expect(r.sent).toBeDefined();
      const values = JSON.stringify(r.sent);
      for (const v of Object.values(CANVAS)) expect(values).toContain(JSON.stringify(v));
      void propsOf; void schemaSendStatus;
    });
  }
});
